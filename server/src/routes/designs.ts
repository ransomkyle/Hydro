import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const prisma = new PrismaClient();

// ---------- Part cost defaults ----------
const COSTS = {
  spray_head: 8.50,
  rotor_head: 18.00,
  drip_emitter: 2.50,
  pvc_pipe_ft: 0.75,
  poly_pipe_ft: 0.50,
  fitting: 3.00,
  valve: 45.00,
  wire_ft: 0.30,
  controller: 150.00,
  backflow: 85.00,
};

const LABOR_RATE = 75;
const LABOR_PER_ZONE = 0.5;
const LABOR_BASE = 2;
const MARKUP = 0.25;

// ---------- Types ----------
interface Zone {
  label: string;
  area_sqft: number;
  sprinklerType: 'spray' | 'rotor' | 'drip';
  headCount: number;
  pipeLength_ft: number;
}

interface BOMLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface BomResponse {
  heads: BOMLineItem[];
  pipe: BOMLineItem[];
  fittings: BOMLineItem[];
  valves: BOMLineItem[];
  electrical: BOMLineItem[];
  misc: BOMLineItem[];
  materialsSubtotal: number;
  laborHours: number;
  laborRate: number;
  laborCost: number;
  markupPercent: number;
  markupAmount: number;
  grandTotal: number;
}

// ---------- BOM Calculator ----------
function calculateBOM(zones: Zone[]): BomResponse {
  const heads: BOMLineItem[] = [];
  const pipe: BOMLineItem[] = [];
  const fittings: BOMLineItem[] = [];
  const valves: BOMLineItem[] = [];
  const electrical: BOMLineItem[] = [];
  const misc: BOMLineItem[] = [];

  for (const zone of zones) {
    const type = zone.sprinklerType;
    const headCount = zone.headCount;
    const area = zone.area_sqft;
    const pipeLength = zone.pipeLength_ft;

    if (type === 'spray') {
      const h = headCount || Math.ceil(area / 100);
      const fits = h * 2;
      const pvcFt = pipeLength || h * 50;
      heads.push({ description: `Spray Head — Zone "${zone.label}"`, quantity: h, unitPrice: COSTS.spray_head, total: h * COSTS.spray_head });
      pipe.push({ description: `PVC Pipe (ft) — Zone "${zone.label}"`, quantity: pvcFt, unitPrice: COSTS.pvc_pipe_ft, total: Math.round(pvcFt * COSTS.pvc_pipe_ft * 100) / 100 });
      fittings.push({ description: `Fittings — Zone "${zone.label}"`, quantity: fits, unitPrice: COSTS.fitting, total: fits * COSTS.fitting });
    } else if (type === 'rotor') {
      const h = headCount || Math.ceil(area / 400);
      const fits = h * 3;
      const pvcFt = pipeLength || h * 80;
      heads.push({ description: `Rotor Head — Zone "${zone.label}"`, quantity: h, unitPrice: COSTS.rotor_head, total: h * COSTS.rotor_head });
      pipe.push({ description: `PVC Pipe (ft) — Zone "${zone.label}"`, quantity: pvcFt, unitPrice: COSTS.pvc_pipe_ft, total: Math.round(pvcFt * COSTS.pvc_pipe_ft * 100) / 100 });
      fittings.push({ description: `Fittings — Zone "${zone.label}"`, quantity: fits, unitPrice: COSTS.fitting, total: fits * COSTS.fitting });
    } else if (type === 'drip') {
      const emitters = headCount || Math.ceil(area / 20);
      const fits = emitters;
      const polyFt = pipeLength || Math.ceil((area / 100) * 30);
      heads.push({ description: `Drip Emitter — Zone "${zone.label}"`, quantity: emitters, unitPrice: COSTS.drip_emitter, total: emitters * COSTS.drip_emitter });
      pipe.push({ description: `Poly Pipe (ft) — Zone "${zone.label}"`, quantity: polyFt, unitPrice: COSTS.poly_pipe_ft, total: Math.round(polyFt * COSTS.poly_pipe_ft * 100) / 100 });
      fittings.push({ description: `Fittings — Zone "${zone.label}"`, quantity: fits, unitPrice: COSTS.fitting, total: fits * COSTS.fitting });
    }

    valves.push({ description: `Inline Valve — Zone "${zone.label}"`, quantity: 1, unitPrice: COSTS.valve, total: COSTS.valve });
    electrical.push({ description: `Low-Voltage Wire (ft) — Zone "${zone.label}"`, quantity: 50, unitPrice: COSTS.wire_ft, total: 15 });
  }

  // Per-design fixed items
  misc.push({ description: 'Smart Controller (8-zone)', quantity: 1, unitPrice: COSTS.controller, total: COSTS.controller });
  misc.push({ description: 'Backflow Preventer', quantity: 1, unitPrice: COSTS.backflow, total: COSTS.backflow });

  const allItems = [...heads, ...pipe, ...fittings, ...valves, ...electrical, ...misc];
  const materialsSubtotal = Math.round(allItems.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const laborHours = LABOR_BASE + zones.length * LABOR_PER_ZONE;
  const laborCost = Math.round(laborHours * LABOR_RATE * 100) / 100;
  const markupAmount = Math.round(materialsSubtotal * MARKUP * 100) / 100;
  const grandTotal = Math.round((materialsSubtotal + laborCost + markupAmount) * 100) / 100;

  return { heads, pipe, fittings, valves, electrical, misc, materialsSubtotal, laborHours, laborRate: LABOR_RATE, laborCost, markupPercent: MARKUP, markupAmount, grandTotal };
}

// ---------- Tally (flat list for PDF) ----------
function flattenBOM(bom: BomResponse): { description: string; quantity: number; unitPrice: number; total: number }[] {
  return [...bom.heads, ...bom.pipe, ...bom.fittings, ...bom.valves, ...bom.electrical, ...bom.misc];
}

// ---------- Auth ----------
function auth(req: Request, res: Response, next: Function) {
  const orgId = req.headers['x-org-id'] as string;
  if (!orgId) return res.status(401).json({ error: 'Missing X-Org-Id header.' });
  (req as any).orgId = orgId;
  next();
}
router.use(auth);

// ================================================================
//  CRUD
// ================================================================

// POST /api/designs — Create (frontend sends {propertyId, customerId})
router.post('/', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  const { customerId, propertyId } = req.body;
  if (!customerId || !propertyId) return res.status(400).json({ error: 'customerId and propertyId required.' });

  try {
    const design = await prisma.design.create({
      data: {
        orgId, customerId, propertyId,
        name: 'New Design',
        zones: JSON.stringify([]),
        status: 'draft',
      },
    });
    return res.status(201).json({ ...design, zones: [] });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/designs
router.get('/', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  const { customerId, propertyId, status } = req.query;
  const where: any = { orgId };
  if (customerId) where.customerId = customerId;
  if (propertyId) where.propertyId = propertyId;
  if (status) where.status = status;

  try {
    const designs = await prisma.design.findMany({
      where,
      include: { customer: { select: { id: true, firstName: true, lastName: true } }, property: { select: { id: true, streetAddress: true, city: true, state: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(designs.map(d => ({ ...d, zones: JSON.parse(d.zones) })));
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/designs/:id
router.get('/:id', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  try {
    const design = await prisma.design.findFirst({
      where: { id: req.params.id, orgId },
      include: { customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }, property: true },
    });
    if (!design) return res.status(404).json({ error: 'Design not found.' });
    return res.json({ ...design, zones: JSON.parse(design.zones), bomData: design.bomData ? JSON.parse(design.bomData) : null });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// PUT /api/designs/:id
router.put('/:id', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  const { name, zones, notes, status } = req.body;
  try {
    const existing = await prisma.design.findFirst({ where: { id: req.params.id, orgId } });
    if (!existing) return res.status(404).json({ error: 'Design not found.' });
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (zones !== undefined) data.zones = JSON.stringify(zones);
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;
    const design = await prisma.design.update({ where: { id: req.params.id }, data });
    return res.json({ ...design, zones: JSON.parse(design.zones) });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/designs/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  try {
    const existing = await prisma.design.findFirst({ where: { id: req.params.id, orgId } });
    if (!existing) return res.status(404).json({ error: 'Design not found.' });
    if (existing.quotePdfPath) { try { fs.unlinkSync(existing.quotePdfPath); } catch { /* */ } }
    await prisma.design.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// ================================================================
//  BOM
// ================================================================

// POST /api/designs/:id/bom
router.post('/:id/bom', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  try {
    const design = await prisma.design.findFirst({ where: { id: req.params.id, orgId } });
    if (!design) return res.status(404).json({ error: 'Design not found.' });
    const zones: Zone[] = JSON.parse(design.zones);
    const bom = calculateBOM(zones);
    await prisma.design.update({ where: { id: design.id }, data: { bomData: JSON.stringify(bom) } });
    return res.json(bom);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// ================================================================
//  Quote PDF
// ================================================================

// POST /api/designs/:id/quote
router.post('/:id/quote', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  try {
    const design = await prisma.design.findFirst({
      where: { id: req.params.id, orgId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        property: true,
        organization: { select: { name: true } },
      },
    });
    if (!design) return res.status(404).json({ error: 'Design not found.' });

    let bom: BomResponse = design.bomData ? JSON.parse(design.bomData) : null;
    if (!bom) { bom = calculateBOM(JSON.parse(design.zones)); }

    const pdfsDir = path.join(__dirname, '../../pdfs');
    if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
    const pdfFilename = `quote-${design.id.slice(0, 8)}-${Date.now()}.pdf`;
    const pdfPath = path.join(pdfsDir, pdfFilename);

    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // — Header —
      doc.fontSize(22).font('Helvetica-Bold').text('SprinkSoft', { continued: true });
      doc.fontSize(10).font('Helvetica').fillColor('#666').text('  \u2014  Irrigation System Quote');
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(design.organization.name);
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#e0e0e0').stroke();
      doc.moveDown(0.5);

      // — Customer —
      doc.fontSize(11).font('Helvetica-Bold').text('Prepared For:');
      doc.fontSize(10).font('Helvetica')
        .text(`${design.customer.firstName} ${design.customer.lastName}`)
        .text(design.customer.email || '')
        .text(design.customer.phone || '')
        .text(design.property.streetAddress)
        .text(`${design.property.city}, ${design.property.state} ${design.property.zipCode}`);
      doc.moveDown(0.5);

      // — Design Summary —
      doc.fontSize(12).font('Helvetica-Bold').text('Design Summary');
      doc.fontSize(10).font('Helvetica')
        .text(`Design: ${design.name}`)
        .text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
      doc.moveDown(0.25);
      const zones: Zone[] = JSON.parse(design.zones);
      doc.fontSize(9).font('Helvetica');
      zones.forEach((z, i) => doc.text(`  Zone ${i + 1}: "${z.label}" \u2014 ${z.sprinklerType} (${z.area_sqft} sqft, ${z.headCount} heads)`));
      doc.moveDown(0.5);

      // — BOM Table —
      doc.fontSize(12).font('Helvetica-Bold').text('Bill of Materials');
      doc.moveDown(0.25);
      const tableTop = doc.y;
      const [c1, c2, c3, c4, c5] = [50, 290, 380, 440, 512];
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Item', c1, tableTop);
      doc.text('Qty', c3, tableTop, { width: 60, align: 'center' });
      doc.text('Unit $', c4, tableTop, { width: 70, align: 'right' });
      doc.text('Total', c5, tableTop, { width: 55, align: 'right' });
      doc.moveTo(c1, tableTop + 14).lineTo(562, tableTop + 14).strokeColor('#ccc').stroke();
      doc.moveDown(0.25);

      let y = tableTop + 20;
      doc.fontSize(8).font('Helvetica');
      const flat = flattenBOM(bom);
      for (const item of flat) {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.text(item.description, c1, y, { width: 235 });
        doc.text(item.quantity.toString(), c3, y, { width: 60, align: 'center' });
        doc.text(`$${item.unitPrice.toFixed(2)}`, c4, y, { width: 70, align: 'right' });
        doc.text(`$${item.total.toFixed(2)}`, c5, y, { width: 55, align: 'right' });
        y += 16;
      }

      y += 8;
      doc.moveTo(c1, y).lineTo(562, y).strokeColor('#999').stroke(); y += 12;
      doc.fontSize(10).font('Helvetica');
      const tx = 380;
      const label = (text: string, val: string) => {
        doc.text(text, tx, y, { width: 130, align: 'right' });
        doc.text(val, c5, y, { width: 55, align: 'right' });
        y += 18;
      };
      label('Materials Subtotal:', `$${bom.materialsSubtotal.toFixed(2)}`);
      label(`Labor (${bom.laborHours} hrs @ $${LABOR_RATE}/hr):`, `$${bom.laborCost.toFixed(2)}`);
      label(`Markup (${(bom.markupPercent * 100).toFixed(0)}%):`, `$${bom.markupAmount.toFixed(2)}`);
      y += -6;
      doc.moveTo(tx, y).lineTo(562, y).strokeColor('#000').stroke(); y += 14;
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('GRAND TOTAL:', tx, y, { width: 130, align: 'right' });
      doc.text(`$${bom.grandTotal.toFixed(2)}`, c5, y, { width: 55, align: 'right' });

      // — Footer —
      doc.moveDown(3);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#e0e0e0').stroke();
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica').fillColor('#999')
        .text('Generated by SprinkSoft \u2014 AI Irrigation System Designer', 50, doc.y, { align: 'center' })
        .text('This is an estimate. Final pricing may vary.', 50, doc.y + 12, { align: 'center' });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    await prisma.design.update({ where: { id: design.id }, data: { quotePdfPath: pdfPath, bomData: JSON.stringify(bom) } });

    return res.json({
      quoteId: design.id,
      pdfUrl: `/api/designs/${design.id}/quote/download`,
    });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/designs/:id/quote/download
router.get('/:id/quote/download', async (req: Request, res: Response) => {
  const orgId = (req as any).orgId;
  try {
    const design = await prisma.design.findFirst({ where: { id: req.params.id, orgId } });
    if (!design?.quotePdfPath || !fs.existsSync(design.quotePdfPath)) return res.status(404).json({ error: 'PDF not found.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sprinksoft-quote-${design.id.slice(0, 8)}.pdf"`);
    fs.createReadStream(design.quotePdfPath).pipe(res);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

export default router;