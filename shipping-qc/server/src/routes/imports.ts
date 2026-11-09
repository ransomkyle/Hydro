import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth.js';
import { PLANTS, REQUIRE_APPROVED_TEMPLATES } from '../config.js';
import { parseCsv } from '../csv.js';
import { db } from '../db.js';
import { classifySize } from '../size.js';
import { HttpError, wrap } from '../util.js';
import { createShipment, loadDetail, type CreateInput } from './shipments.js';

export const router = Router();
router.use(authenticate);

/** Header aliases so an export from almost any ERP/spreadsheet maps without editing. Headers are matched case-insensitively with punctuation ignored. */
const ALIASES: Record<string, string[]> = {
  job_no: ['job', 'jobno', 'job_no', 'jobnumber', 'job_number', 'job#', 'workorder', 'work_order', 'wo', 'wo#'],
  customer: ['customer', 'customername', 'customer_name', 'cust', 'soldto', 'sold_to'],
  po_no: ['po', 'pono', 'po_no', 'ponumber', 'po_number', 'po#', 'customerpo', 'customer_po'],
  description: ['description', 'jobdescription', 'job_description', 'project'],
  special_requirements: ['special_requirements', 'specialrequirements', 'notes', 'special_instructions', 'requirements'],
  plant: ['plant', 'site', 'facility', 'location'],
  ship_to_name: ['ship_to', 'shipto', 'ship_to_name', 'shiptoname', 'consignee'],
  ship_to_address: ['ship_to_address', 'shiptoaddress', 'address', 'destination'],
  pickup_appt: ['pickup', 'pickup_appt', 'pickup_date', 'pickupdate', 'appointment', 'ship_date', 'shipdate', 'due_date', 'promise_date'],
  length_in: ['length', 'length_in', 'len', 'length_inches'], width_in: ['width', 'width_in'], height_in: ['height', 'height_in'],
  weight_lb: ['weight', 'weight_lb', 'weight_lbs', 'lbs', 'gross_weight'],
  part_no: ['part', 'partno', 'part_no', 'partnumber', 'part_number', 'part#', 'item', 'item_no', 'itemnumber'],
  part_description: ['part_description', 'partdescription', 'item_description', 'itemdescription'],
  qty: ['qty', 'quantity', 'qty_ordered', 'pieces'],
  grade: ['grade', 'material', 'alloy', 'material_grade'],
  heat_no: ['heat', 'heatno', 'heat_no', 'heatnumber', 'heat_number', 'heat_lot', 'lot'],
  drawing_rev: ['rev', 'revision', 'drawing_rev', 'dwg_rev'],
};
/** Compare headers ignoring case, spaces, underscores and punctuation ("Job #", "job_no" and "JobNo" all match). */
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9#]/g, '');
const aliasMap = new Map<string, string>();
for (const [canon, list] of Object.entries(ALIASES)) { aliasMap.set(norm(canon), canon); for (const a of list) aliasMap.set(norm(a), canon); }

export const CSV_TEMPLATE = 'job_no,customer,po_no,description,part_no,part_description,qty,grade,heat_no,length_in,width_in,height_in,weight_lb,plant,pickup_appt,ship_to_name,ship_to_address,special_requirements\r\n' +
  'J-4821,Midwest Dairy Co-op,PO-99173,"316L jacketed process tank",TNK-500,"500 gal tank shell",1,316L,H77412,240,84,96,6200,Hiawatha (HQ),2026-12-01 08:00,Midwest Dairy,"123 Farm Rd, Ames IA","Borescope report required"\r\n';

const num = (v: string | undefined) => { if (v === undefined || v.trim() === '') return null; const n = Number(v.replace(/[, ]/g, '')); return Number.isFinite(n) && n >= 0 ? n : NaN; };

/** Picks checklist templates from the size/keywords. When approval is required, unapproved templates are withheld (and reported) instead of failing the import. */
function suggestTemplates(f: { length_in?: number | null; width_in?: number | null; height_in?: number | null; weight_lb?: number | null; description?: string | null; special_requirements?: string | null }): { ids: number[]; withheld: string[] } {
  const size = classifySize(f);
  const text = `${f.description ?? ''} ${f.special_requirements ?? ''}`.toLowerCase();
  const rows = db.prepare('SELECT id,name,category,approved_at FROM templates WHERE active=1').all() as { id: number; name: string; category: string; approved_at: string | null }[];
  const wanted = rows.filter(t => t.category === 'base'
    || (/small parts/i.test(t.name) && size === 'small') || (/oversize/i.test(t.name) && size === 'oversize')
    || (/sanitary/i.test(t.name) && /sanitary|3-?a|bpe|dairy|brew|pharma|food/.test(text)) || (/pressure/i.test(t.name) && /pressure|asme|b31\.3|u-?stamp|ped\b|vessel/.test(text)));
  const usable = REQUIRE_APPROVED_TEMPLATES ? wanted.filter(t => t.approved_at) : wanted;
  return { ids: usable.map(t => t.id), withheld: wanted.filter(t => !usable.includes(t)).map(t => t.name) };
}

router.get('/import/template.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="shipment-import-template.csv"');
  res.send('﻿' + CSV_TEMPLATE);
});

router.post('/import/shipments', requireRole('shipping', 'inspector', 'manager', 'admin'), wrap((req, res) => {
  const b = z.object({ csv: z.string().min(5).max(900_000), dryRun: z.boolean().default(true), allowDuplicates: z.boolean().default(false) }).parse(req.body);
  const table = parseCsv(b.csv);
  if (table.length < 2) throw new HttpError(400, 'The file needs a header row and at least one data row');
  const headers = table[0].map(h => aliasMap.get(norm(h)) ?? null);
  const unknown = table[0].filter((_, i) => !headers[i]);
  if (!headers.includes('job_no') || !headers.includes('customer')) throw new HttpError(400, `Could not find required columns "job_no" and "customer". Columns seen: ${table[0].join(', ')}. Download the template for the expected headers.`);

  const errors: { row: number; message: string }[] = [];
  const groups = new Map<string, { input: Record<string, any>; parts: any[]; rows: number[]; duplicate?: boolean }>();
  table.slice(1).forEach((cells, idx) => {
    const rowNo = idx + 2; const r: Record<string, string> = {};
    headers.forEach((h, i) => { if (h && cells[i] !== undefined) r[h] = cells[i].trim(); });
    const bad = (m: string) => errors.push({ row: rowNo, message: m });
    if (!r.job_no) return bad('missing job_no');
    if (!r.customer) return bad('missing customer');
    const nums: Record<string, number | null> = {};
    for (const k of ['length_in', 'width_in', 'height_in', 'weight_lb']) { const v = num(r[k]); if (Number.isNaN(v)) return bad(`${k} is not a number: "${r[k]}"`); nums[k] = v; }
    const qty = r.qty ? num(r.qty) : 1; if (qty === null || Number.isNaN(qty) || qty <= 0) return bad(`qty must be a positive number: "${r.qty}"`);
    let pickup: string | null = null;
    if (r.pickup_appt) { const t = Date.parse(r.pickup_appt); if (Number.isNaN(t)) return bad(`pickup_appt is not a date: "${r.pickup_appt}"`); pickup = new Date(t).toISOString(); }
    let plant: string | null = null;
    if (r.plant) { plant = PLANTS.find(p => p.toLowerCase() === r.plant.toLowerCase() || p.toLowerCase().startsWith(r.plant.toLowerCase())) ?? null; if (!plant) return bad(`unknown plant "${r.plant}" (use: ${PLANTS.join(', ')})`); }
    const key = [r.job_no, r.customer, r.po_no ?? ''].join('\u0001').toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { rows: [], parts: [], input: { job_no: r.job_no, customer: r.customer, po_no: r.po_no || null, description: r.description || null, special_requirements: r.special_requirements || null, plant,
        ship_to_name: r.ship_to_name || null, ship_to_address: r.ship_to_address || null, pickup_appt: pickup, ...nums } };
      groups.set(key, g);
    } else for (const [k, v] of Object.entries(nums)) if (g.input[k] == null && v != null) g.input[k] = v;
    g.rows.push(rowNo);
    if (r.part_no || r.part_description || r.heat_no) g.parts.push({ part_no: r.part_no || null, description: r.part_description || null, qty, grade: r.grade || null, heat_no: r.heat_no || null, drawing_rev: r.drawing_rev || null });
  });

  const dupe = db.prepare("SELECT shipment_no FROM shipments WHERE job_no=? AND COALESCE(po_no,'')=? AND status!='cancelled' LIMIT 1");
  const preview = [...groups.values()].map(g => {
    const d = dupe.get(g.input.job_no, g.input.po_no ?? '') as { shipment_no: string } | undefined;
    const t = suggestTemplates(g.input);
    return { ...g.input, parts: g.parts.length, rows: g.rows, duplicateOf: d?.shipment_no ?? null, templateIds: t.ids, withheldTemplates: t.withheld, size: classifySize(g.input) };
  });
  if (b.dryRun) return res.json({ dryRun: true, shipments: preview, errors, unknownColumns: unknown });

  const created: { shipment_no: string; id: number; job_no: string }[] = []; const skipped: { job_no: string; reason: string }[] = [];
  if (errors.length) throw new HttpError(400, `Fix ${errors.length} row error(s) first (run a preview to see them)`, { errors });
  [...groups.values()].forEach((g, i) => {
    const p = preview[i];
    if (p.duplicateOf && !b.allowDuplicates) return void skipped.push({ job_no: g.input.job_no, reason: `already exists as ${p.duplicateOf}` });
    const input: CreateInput = { ...(g.input as any), size_class: p.size, is_sanitary: false, is_pressure: false, escort_required: false, templateIds: p.templateIds, parts: g.parts };
    const id = createShipment(req.user!, input);
    created.push({ id, shipment_no: (loadDetail(id).shipment as any).shipment_no, job_no: g.input.job_no });
  });
  res.status(201).json({ dryRun: false, created, skipped, errors: [] });
}));
