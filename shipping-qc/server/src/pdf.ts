import fs from 'node:fs';
import path from 'node:path';
import type { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { BRAND, FONT_FILES, hasBrandAssets } from './brand.js';
import { SHOP_TZ, UPLOAD_DIR } from './config.js';
import { verifyChain } from './audit.js';
import { db } from './db.js';
import { loadDetail } from './routes/shipments.js';

/** Font names; falls back to built-in Helvetica if the bundled brand fonts are missing. */
const F = { body: 'Helvetica', semi: 'Helvetica-Bold', bold: 'Helvetica-Bold', head: 'Helvetica-Bold', headBold: 'Helvetica-Bold' };
/** The bundled Latin font subset lacks a few symbols that appear in checklist text; map them to safe equivalents. */
const clean = (t: string) => t.replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/[✔✓]/g, '').replace(/⚠/g, '!').replace(/[\u2010-\u2011]/g, '-');

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { timeZone: SHOP_TZ, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' }).format(d);
};
const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const inches = (v?: number | null) => (v == null ? '—' : `${v} in (${(v / 12).toFixed(1)} ft)`);

/** Streams the shipment quality release package: the single document handed to a customer auditor. */
export function buildPackage(shipmentId: number, out: Writable): Promise<void> {
  const d = loadDetail(shipmentId);
  const s = d.shipment as any;
  const users = new Map((db.prepare('SELECT id,name FROM users').all() as any[]).map(u => [u.id, u.name]));
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: 42, left: 42, right: 42 }, bufferPages: true, info: { Title: `Quality Release ${s.shipment_no}`, Author: BRAND.name } });
  const branded = hasBrandAssets();
  if (branded) {
    doc.registerFont('Body', FONT_FILES.body); doc.registerFont('Semi', FONT_FILES.semi); doc.registerFont('Bold', FONT_FILES.bold);
    doc.registerFont('Head', FONT_FILES.head); doc.registerFont('HeadBold', FONT_FILES.headBold);
    Object.assign(F, { body: 'Body', semi: 'Semi', bold: 'Bold', head: 'Head', headBold: 'HeadBold' });
  } else Object.assign(F, { body: 'Helvetica', semi: 'Helvetica-Bold', bold: 'Helvetica-Bold', head: 'Helvetica-Bold', headBold: 'Helvetica-Bold' });
  const rawText = doc.text.bind(doc) as any;
  (doc as any).text = (t: any, ...a: any[]) => rawText(typeof t === 'string' ? clean(t) : t, ...a);
  doc.pipe(out);
  const W = doc.page.width - 84;
  const { ink, mute, line, navy, magenta } = BRAND;
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
  const h2 = (t: string) => {
    ensure(60); doc.x = 42; doc.moveDown(0.8).font(F.headBold).fontSize(11.5).fillColor(navy).text(t.toUpperCase(), { characterSpacing: 0.8 });
    const y = doc.y + 2;
    doc.moveTo(42, y).lineTo(42 + W, y).lineWidth(0.6).strokeColor(line).stroke();
    doc.moveTo(42, y).lineTo(42 + 34, y).lineWidth(2.2).strokeColor(magenta).stroke(); doc.lineWidth(1);
    doc.moveDown(0.5);
  };
  const kv = (pairs: [string, unknown][], cols = 2) => {
    const cw = W / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      ensure(30);
      const y = doc.y; let maxY = y;
      pairs.slice(i, i + cols).forEach(([k, v], c) => {
        doc.font(F.body).fontSize(7.5).fillColor(mute).text(k.toUpperCase(), 42 + c * cw, y, { width: cw - 8 });
        doc.font(F.bold).fontSize(9.5).fillColor(ink).text(dash(v), 42 + c * cw, doc.y, { width: cw - 8 });
        maxY = Math.max(maxY, doc.y); doc.y = y;
      });
      doc.y = maxY + 5; doc.x = 42;
    }
  };

  // Brand header band
  const PW = doc.page.width;
  doc.rect(0, 0, PW, 96).fill(navy); doc.rect(0, 96, PW, 3.5).fill(magenta);
  if (branded) { try { doc.image(BRAND.logo, 42, 16, { fit: [66, 66] }); } catch { /* logo unreadable: continue without it */ } }
  const tx = branded ? 122 : 42;
  doc.font(F.headBold).fontSize(18).fillColor('#ffffff').text(BRAND.name, tx, 20, { lineBreak: false });
  doc.font(F.semi).fontSize(9).fillColor(BRAND.sky).text(BRAND.tagline.toUpperCase(), tx, 44, { characterSpacing: 1.2, lineBreak: false });
  doc.font(F.body).fontSize(8).fillColor('#d6e4f3').text(`${BRAND.address}   ·   ${BRAND.phone}   ·   ${BRAND.web}`, tx, 62, { lineBreak: false });
  doc.font(F.body).fontSize(7.5).fillColor('#a9c4e0').text(BRAND.qms, tx, 76, { lineBreak: false });
  doc.x = 42; doc.y = 116;
  doc.font(F.headBold).fontSize(21).fillColor(navy).text('Shipment Quality Release Package');
  doc.font(F.bold).fontSize(12.5).fillColor(ink).text(`${s.shipment_no}   ·   ${s.customer}   ·   Job ${s.job_no}`);
  const state = s.status === 'released' || s.status === 'shipped' || s.status === 'delivered' ? (s.release_override_reason ? 'RELEASED WITH OVERRIDE' : 'RELEASED') : s.status.toUpperCase().replace('_', ' ');
  doc.moveDown(0.3).font(F.bold).fontSize(10).fillColor(s.release_override_reason ? '#b45309' : s.released_at ? '#15803d' : '#b45309').text(`STATUS: ${state}`);
  doc.font(F.body).fontSize(8).fillColor(mute).text(`Generated ${fmt(new Date().toISOString())} — all times ${SHOP_TZ}`);

  h2('Shipment');
  kv([['Plant', s.plant], ['Customer PO', s.po_no], ['Size class', s.size_class], ['Description', s.description], ['Special requirements', s.special_requirements],
    ['Pieces', s.pieces], ['Weight', s.weight_lb != null ? `${s.weight_lb} lb` : null], ['Length', inches(s.length_in)], ['Width × Height', `${dash(s.width_in)} × ${dash(s.height_in)} in`],
    ['Ship from', s.ship_from_dock], ['Ship to', [s.ship_to_name, s.ship_to_address].filter(Boolean).join(', ')], ['Pickup appointment', fmt(s.pickup_appt)], ['Created', `${fmt(s.created_at)} by ${dash(s.created_by_name)}`]]);

  h2('Release decision');
  kv([['Released by', s.released_by_name], ['Released at', fmt(s.released_at)]]);
  if (s.release_override_reason) {
    doc.font(F.bold).fontSize(9).fillColor('#b45309').text(`Released with documented override: ${s.release_override_reason}`);
    for (const b of JSON.parse(s.release_snapshot ?? '[]')) doc.font(F.body).fontSize(8.5).fillColor(ink).text(`• ${b.message}`, { indent: 8 });
  }

  h2('Parts / line items');
  if (!d.parts.length) doc.font(F.body).fontSize(9).fillColor(mute).text('None recorded.');
  table(doc, W, [['Part #', 90], ['Description', 150], ['Qty', 35], ['Grade', 45], ['Heat #', 80], ['Finish', 60], ['Rev', 40]],
    (d.parts as any[]).map(p => [dash(p.part_no), dash(p.description), dash(p.qty), dash(p.grade), dash(p.heat_no), dash(p.finish), dash(p.drawing_rev)]), ensure);

  h2('Checklist sign-offs');
  let section = '';
  for (const i of d.items as any[]) {
    if (i.section !== section) { section = i.section; ensure(34); doc.moveDown(0.3).font(F.bold).fontSize(9.5).fillColor(navy).text(section); }
    ensure(44);
    const y = doc.y;
    const mark = i.status === 'pass' ? 'PASS' : i.status === 'fail' ? 'FAIL' : i.status === 'na' ? 'N/A' : 'OPEN';
    const colr = i.status === 'pass' ? '#15803d' : i.status === 'fail' ? '#b91c1c' : i.status === 'na' ? '#475569' : '#b45309';
    doc.font(F.bold).fontSize(8.5).fillColor(colr).text(mark, 42, y, { width: 32 });
    doc.font(F.body).fontSize(8.5).fillColor(ink).text(i.text + (i.required ? '' : '  (optional)'), 78, y, { width: W - 36 });
    const meta: string[] = [];
    if (i.spec) meta.push(`Spec: ${i.spec}`);
    if (i.value) meta.push(`Value: ${i.value}${i.unit ? ' ' + i.unit : ''}`);
    if (i.gauge_no) meta.push(`Gauge: ${i.gauge_no}`);
    if (i.note) meta.push(`Note: ${i.note}`);
    if (i.done_by_name) meta.push(`Signed: ${i.done_by_name} — ${fmt(i.done_at)}${i.done_offline ? ' (recorded offline, synced ' + fmt(i.done_received_at) + ')' : ''}`);
    if (i.verified_by_name) meta.push(`Verified: ${i.verified_by_name} — ${fmt(i.verified_at)}${i.verified_offline ? ' (offline)' : ''}${i.verify_note ? ' — ' + i.verify_note : ''}`);
    else if (i.needs_verification && i.status === 'pass') meta.push('Verification: PENDING');
    if (meta.length) doc.font(F.body).fontSize(7.5).fillColor(mute).text(meta.join('   |   '), 78, doc.y, { width: W - 36 });
    doc.y += 3; doc.x = 42;
  }

  h2('Materials & traceability');
  const cat: Record<string, string> = { base_metal: 'Base metal', consumable: 'Consumable', packaging: 'Packaging' };
  const mats = (d.materials as any[]).filter(m => !m.voided);
  if (!mats.length) doc.font(F.body).fontSize(9).fillColor(mute).text('None recorded.');
  table(doc, W, [['Type', 55], ['Material', 125], ['Grade', 45], ['Heat / lot', 80], ['Qty', 50], ['Logged by', 75], ['When', 82]],
    mats.map(m => [cat[m.category] ?? m.category, dash(m.name), dash(m.grade), dash(m.heat_lot), m.qty != null ? `${m.qty} ${m.unit ?? ''}` : '—', dash(m.added_by_name), fmt(m.added_at)]), ensure);

  h2('Logistics & custody');
  kv([['Carrier', s.carrier], ['Equipment', s.equipment_type], ['Truck #', s.truck_no], ['Trailer #', s.trailer_no], ['Driver', s.driver_name], ['Driver ID / CDL', s.driver_id_no],
    ['BOL #', s.bol_no], ['Pro #', s.pro_no], ['Seal #', s.seal_no], ['Permit #', s.permit_no], ['Escort required', s.escort_required ? 'Yes' : 'No'], ['Rigging / tie-down', [s.rigging_notes, s.tiedown_notes].filter(Boolean).join(' / ')]], 3);
  const label: Record<string, string> = { ready: 'Ready to ship', loaded: 'Loaded', departed: 'Departed dock', picked_up: 'Picked up by carrier', delivered: 'Delivered', note: 'Note' };
  doc.moveDown(0.3);
  for (const e of d.events as any[]) {
    ensure(46);
    doc.font(F.bold).fontSize(9).fillColor(ink).text(`${label[e.type] ?? e.type} — ${fmt(e.at)}${e.offline ? '  (recorded offline)' : ''}`);
    const bits = [e.location && `Place: ${e.location}`, e.lat != null && `GPS ${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}${e.accuracy_m ? ' ±' + Math.round(e.accuracy_m) + 'm' : ''}`, e.person_name && `Person: ${e.person_name}`, `Recorded by ${e.recorded_by_name}`, e.note && `Note: ${e.note}`].filter(Boolean);
    doc.font(F.body).fontSize(8).fillColor(mute).text(bits.join('   |   '));
    if (e.signature_png) { try { ensure(50); doc.image(Buffer.from(e.signature_png.split(',')[1], 'base64'), 42, doc.y + 2, { fit: [160, 40] }); doc.y += 46; } catch { /* corrupt signature image */ } }
    doc.moveDown(0.3);
  }
  if (!d.events.length) doc.font(F.body).fontSize(9).fillColor(mute).text('No logistics events recorded.');

  h2('Flags & nonconformances');
  if (!d.flags.length) doc.font(F.body).fontSize(9).fillColor(mute).text('None raised.');
  for (const f of d.flags as any[]) {
    ensure(40);
    doc.font(F.bold).fontSize(9).fillColor(f.status === 'open' ? '#b91c1c' : '#15803d').text(`${f.status.toUpperCase()} · ${f.severity.toUpperCase()} · raised ${fmt(f.raised_at)} by ${f.raised_by_name}`);
    doc.font(F.body).fontSize(8.5).fillColor(ink).text(f.description);
    if (f.status === 'resolved') doc.font(F.body).fontSize(8).fillColor(mute).text(`Resolved ${fmt(f.resolved_at)} by ${f.resolved_by_name} — ${String(f.disposition).replace('_', ' ')}: ${f.resolution}`);
    doc.moveDown(0.3);
  }

  const atts = (d.attachments as any[]).filter(a => !a.voided);
  h2('Attached documents');
  const docs = atts.filter(a => !a.mime.startsWith('image/'));
  if (!docs.length) doc.font(F.body).fontSize(9).fillColor(mute).text('None.');
  for (const a of docs) doc.font(F.body).fontSize(8.5).fillColor(ink).text(`• [${a.kind}] ${a.filename} — ${fmt(a.uploaded_at)} by ${a.uploaded_by_name}   SHA-256 ${a.sha256.slice(0, 16)}…`);

  const photos = atts.filter(a => /^image\/(jpeg|png)$/.test(a.mime));
  if (photos.length) ensure(210);
  h2(`Photos (${photos.length})`);
  const row: any[] = [];
  const colW = (W - 12) / 2;
  const flush = () => {
    if (!row.length) return;
    ensure(190);
    const y = doc.y;
    row.forEach((a, c) => {
      const x = 42 + c * (colW + 12);
      try {
        const stored = (db.prepare('SELECT stored_as FROM attachments WHERE id=?').get(a.id) as any).stored_as;
        doc.image(path.join(UPLOAD_DIR, stored), x, y, { fit: [colW, 150], align: 'center' });
      } catch { doc.font(F.body).fontSize(8).fillColor(mute).text('[image unreadable]', x, y); }
      doc.font(F.body).fontSize(7.5).fillColor(mute).text(`${a.caption ? a.caption + ' — ' : ''}${fmt(a.uploaded_at)} · ${a.uploaded_by_name}`, x, y + 154, { width: colW });
    });
    doc.y = y + 178; doc.x = 42; row.length = 0;
  };
  for (const p of photos) { row.push(p); if (row.length === 2) flush(); }
  flush();

  const chain = verifyChain();
  h2('Record integrity');
  doc.font(F.body).fontSize(8.5).fillColor(ink).text(`Audit trail: ${chain.count} hash-chained entries system-wide — chain ${chain.ok ? 'VERIFIED INTACT' : 'BROKEN at entry #' + chain.brokenAt}. Each sign-off above is attributable to an individual login with PIN re-entry and server-time-stamped. Entries recorded offline show both the device time and the time received by the server.`);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; doc.page.margins.top = 0;
    if (i > range.start) { // running header on continuation pages
      if (branded) { try { doc.image(BRAND.logo, 42, 12, { fit: [24, 24] }); } catch { /* ignore */ } }
      doc.font(F.semi).fontSize(8).fillColor(navy).text(`${BRAND.name}  ·  Quality Release Package`, branded ? 72 : 42, 19, { lineBreak: false });
      doc.font(F.semi).fontSize(8).fillColor(mute).text(`${s.shipment_no}  ·  ${s.customer}`, 42, 19, { width: W, align: 'right', lineBreak: false });
      doc.moveTo(42, 40).lineTo(42 + W, 40).lineWidth(0.6).strokeColor(line).stroke();
      doc.moveTo(42, 40).lineTo(42 + 34, 40).lineWidth(2).strokeColor(magenta).stroke(); doc.lineWidth(1);
    }
    const fy = doc.page.height - 40;
    doc.moveTo(42, fy - 6).lineTo(42 + W, fy - 6).lineWidth(0.6).strokeColor(line).stroke();
    doc.font(F.body).fontSize(7).fillColor(mute).text(`${BRAND.name}  ·  ${BRAND.address}  ·  ${BRAND.phone}  ·  ${BRAND.web}`, 42, fy, { width: W, align: 'center', lineBreak: false });
    doc.font(F.semi).fontSize(7.5).fillColor(navy).text(`${s.shipment_no}  ·  ${s.customer}  ·  Page ${i + 1} of ${range.count}`, 42, fy + 11, { width: W, align: 'center', lineBreak: false });
  }
  const done = new Promise<void>((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
  doc.end();
  return done;
}

function table(doc: PDFKit.PDFDocument, W: number, cols: [string, number][], rows: string[][], ensure: (h: number) => void) {
  if (!rows.length) return;
  const total = cols.reduce((a, c) => a + c[1], 0);
  const widths = cols.map(c => (c[1] / total) * W);
  const draw = (cells: string[], bold: boolean) => {
    const y = doc.y;
    let h = 0;
    doc.font(bold ? F.bold : F.body).fontSize(8);
    cells.forEach((t, i) => { h = Math.max(h, doc.heightOfString(t, { width: widths[i] - 4 })); });
    ensure(h + 6);
    const yy = doc.y; let x = 42;
    cells.forEach((t, i) => { doc.fillColor(bold ? '#5b6b7a' : '#16202a').text(t, x, yy, { width: widths[i] - 4 }); x += widths[i]; });
    doc.y = yy + h + 3; doc.x = 42;
    if (!bold) doc.moveTo(42, doc.y - 1).lineTo(42 + W, doc.y - 1).strokeColor('#e3e9ee').stroke();
    void y;
  };
  draw(cols.map(c => c[0].toUpperCase()), true);
  rows.forEach(r => draw(r, false));
}

/** Whole package as a Buffer (for emailing / hashing). */
export async function buildPackageBuffer(shipmentId: number): Promise<Buffer> {
  const { PassThrough } = await import('node:stream');
  const sink = new PassThrough(); const chunks: Buffer[] = [];
  sink.on('data', c => chunks.push(c));
  await buildPackage(shipmentId, sink);
  return Buffer.concat(chunks);
}

/** 4x6 in shipping label: shipment number, QR (scannable in the app), destination, and an unmissable QC release status. */
export async function buildLabel(shipmentId: number, out: Writable): Promise<void> {
  const d = loadDetail(shipmentId); const s = d.shipment as any;
  const branded = hasBrandAssets();
  const doc = new PDFDocument({ size: [288, 432], margin: 14, info: { Title: `Label ${s.shipment_no}`, Author: BRAND.name } });
  if (branded) { doc.registerFont('Body', FONT_FILES.body); doc.registerFont('Bold', FONT_FILES.bold); doc.registerFont('HeadBold', FONT_FILES.headBold); }
  const body = branded ? 'Body' : 'Helvetica', bold = branded ? 'Bold' : 'Helvetica-Bold', head = branded ? 'HeadBold' : 'Helvetica-Bold';
  const rawText = doc.text.bind(doc) as any; (doc as any).text = (t: any, ...a: any[]) => rawText(typeof t === 'string' ? clean(t) : t, ...a);
  doc.pipe(out);
  doc.rect(0, 0, 288, 54).fill(BRAND.navy); doc.rect(0, 54, 288, 3).fill(BRAND.magenta);
  if (branded) { try { doc.image(BRAND.logo, 14, 7, { fit: [40, 40] }); } catch { /* ignore */ } }
  doc.font(head).fontSize(13).fillColor('#fff').text(BRAND.name, branded ? 62 : 14, 13, { lineBreak: false });
  doc.font(body).fontSize(7.5).fillColor(BRAND.sky).text(BRAND.tagline.toUpperCase(), branded ? 62 : 14, 31, { characterSpacing: 1, lineBreak: false });
  doc.font(head).fontSize(23).fillColor(BRAND.navy).text(s.shipment_no, 14, 68, { width: 260, align: 'center', lineBreak: false });
  const qr = await QRCode.toBuffer(s.shipment_no, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
  doc.image(qr, 74, 100, { fit: [140, 140] });
  doc.font(bold).fontSize(12).fillColor(BRAND.ink).text(s.customer, 14, 246, { width: 260, align: 'center' });
  doc.font(body).fontSize(9).fillColor(BRAND.mute).text(`Job ${s.job_no}${s.po_no ? '   ·   PO ' + s.po_no : ''}${s.plant ? '   ·   ' + s.plant : ''}`, 14, doc.y + 2, { width: 260, align: 'center' });
  if (s.ship_to_name || s.ship_to_address) doc.font(body).fontSize(9).fillColor(BRAND.ink).text('SHIP TO: ' + [s.ship_to_name, s.ship_to_address].filter(Boolean).join(', '), 20, doc.y + 8, { width: 248, align: 'center' });
  const facts = [s.pieces != null && `${s.pieces} pcs`, s.weight_lb != null && `${s.weight_lb} lb`, s.length_in != null && `${(s.length_in / 12).toFixed(1)} ft long`].filter(Boolean).join('   ·   ');
  if (facts) doc.font(bold).fontSize(10).fillColor(BRAND.ink).text(facts, 14, doc.y + 6, { width: 260, align: 'center' });
  const rel = !!s.released_at && s.status !== 'cancelled';
  const open = d.flags.filter((f: any) => f.status === 'open').length;
  const col = rel ? (s.release_override_reason ? '#b45309' : '#15803d') : '#b91c1c';
  doc.roundedRect(14, 356, 260, 62, 6).lineWidth(2.5).strokeColor(col).stroke();
  doc.font(head).fontSize(rel ? 17 : 15).fillColor(col).text(rel ? (s.release_override_reason ? 'QC RELEASED (OVERRIDE)' : 'QC RELEASED') : 'HOLD — NOT RELEASED', 14, 366, { width: 260, align: 'center', lineBreak: false });
  doc.font(body).fontSize(8).fillColor(BRAND.mute).text(rel ? `${fmt(s.released_at)} · ${s.released_by_name}${open ? ' · ' + open + ' open flag(s)' : ''}` : 'Do not load or ship until a QC manager releases this shipment', 20, 393, { width: 248, align: 'center' });
  doc.end();
  await new Promise<void>((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
}
