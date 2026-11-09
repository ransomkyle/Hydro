/**
 * npm run demo-data  — fills a DEMO database (started with QC_DEMO=1) with realistic shipments in every state so the app can be explored and
 * shown to the team immediately. It drives the real API, so everything has proper sign-offs, audit entries and photos.
 * Refuses to run on a database that already has shipments unless --force. Never run against production data.
 */
import zlib from 'node:zlib';
import { createApp } from './app.js';
import { db } from './db.js';
import { seed } from './seed.js';

const png = (w: number, h: number, a: [number, number, number], b: [number, number, number]) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.round(a[c] + ((b[c] - a[c]) * (x + y)) / (w + h)); }
  const crc = (buf: Buffer) => { let c, t = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (t ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return (t ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PINS: Record<string, string> = { admin: '1111', manager: '2222', inspector: '3333', inspector2: '3434', operator: '4444', shipping: '5555', auditor: '6666' };

async function main() {
  seed({ demoUsers: true });
  if (!db.prepare("SELECT 1 FROM users WHERE username='inspector2'").get()) throw new Error('This is not a demo database (start the server with QC_DEMO=1 on an empty data dir).');
  if ((db.prepare('SELECT COUNT(*) n FROM shipments').get() as any).n && !process.argv.includes('--force')) throw new Error('Database already has shipments. Use --force to add demo data anyway.');
  const server = createApp().listen(0); const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const tok: Record<string, string> = {};
  const api = async (m: string, u: string, who: string, body?: any) => {
    const r = await fetch(base + '/api' + u, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok[who] }, body: body ? JSON.stringify(body) : undefined });
    const j: any = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${u} -> ${r.status} ${j.error ?? ''}`); return j;
  };
  const upload = async (who: string, shipId: number, itemId: number | null, kind: string, caption: string, photo = true) => {
    const f = new FormData(); f.append('file', new Blob([photo ? png(640, 420, [40 + Math.random() * 60, 90, 140], [200, 190 + Math.random() * 40, 170]) : PDF], { type: photo ? 'image/png' : 'application/pdf' }), photo ? 'photo.png' : 'MTR-cert.pdf');
    f.append('kind', kind); f.append('caption', caption); if (itemId) f.append('itemId', String(itemId));
    const r = await fetch(`${base}/api/shipments/${shipId}/attachments`, { method: 'POST', headers: { authorization: 'Bearer ' + tok[who] }, body: f }); if (!r.ok) throw new Error('upload ' + await r.text());
  };
  for (const u of Object.keys(PINS)) { const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'changeme123' }) }); tok[u] = ((await r.json()) as any).token; }

  // approve templates, add gauges
  for (const t of await api('GET', '/templates', 'manager')) if (!t.approved_at) await api('POST', `/templates/${t.id}/approve`, 'manager', { pin: PINS.manager });
  const tpl = Object.fromEntries((await api('GET', '/templates', 'manager')).map((t: any) => [t.name.replace(/^(Base|Module) — /, '').split(' (')[0].split(' /')[0], t.id])) as Record<string, number>;
  const T = (...names: string[]) => names.map(n => Object.entries(tpl).find(([k]) => k.toLowerCase().startsWith(n.toLowerCase()))![1]);
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  for (const g of [{ gauge_no: 'PRO-17', description: 'Surface profilometer 0–50 µin', cal_date: day(-120), cal_due: day(245), plant: 'Hiawatha (HQ)' }, { gauge_no: 'TAPE-50', description: '50 ft steel tape', cal_date: day(-340), cal_due: day(25), plant: 'Hiawatha (HQ)' }, { gauge_no: 'MIC-02', description: '0–1 in micrometer', cal_date: day(-400), cal_due: day(-35), plant: 'Lisbon' }])
    await api('POST', '/gauges', 'inspector', g);

  type Opts = { stop?: (it: any) => boolean; fail?: RegExp; na?: RegExp };
  /** signs checklist items the way real people would; returns after `stop` says so */
  const work = async (id: number, o: Opts = {}) => {
    const d = await api('GET', `/shipments/${id}`, 'manager');
    for (const it of d.items) {
      if (o.stop?.(it)) break;
      const who = it.signer_role === 'manager' ? 'manager' : it.signer_role === 'inspector' ? 'inspector' : 'operator';
      const base: any = { result: 'pass', pin: PINS[who] };
      if (o.fail?.test(it.text)) { await api('POST', `/shipments/items/${it.id}/sign`, 'operator', { result: 'fail', pin: PINS.operator, note: 'Light scratch near manway, approx 3 in' }); continue; }
      if (o.na?.test(it.text)) { await api('POST', `/shipments/items/${it.id}/sign`, 'operator', { result: 'na', pin: PINS.operator, note: 'Customer supplied stainless cradle' }); continue; }
      if (it.kind === 'photo') await upload(who, id, it.id, 'photo', it.text.slice(0, 60));
      if (it.kind === 'doc') await upload(who, id, it.id, 'inspection', it.text.slice(0, 60), false);
      if (it.kind === 'value') { base.value = it.unit === 'µin Ra' ? '18' : it.unit === 'in' ? '600' : it.unit === 'lb' ? '9800' : it.unit === 'count' ? '6' : it.unit === 'ppm Cl' ? '12' : it.unit === 'pcs' ? '200' : 'OK'; if (it.unit === 'µin Ra') base.gauge = 'PRO-17'; if (it.unit === 'in' && /dimension/i.test(it.text)) base.gauge = 'TAPE-50'; }
      await api('POST', `/shipments/items/${it.id}/sign`, who, base);
    }
    const r = await api('GET', `/shipments/${id}`, 'manager');
    for (const it of r.items.filter((i: any) => i.needs_verification && i.status === 'pass' && !i.verified_by)) await api('POST', `/shipments/items/${it.id}/verify`, 'inspector2', { pin: PINS.inspector2 }).catch(() => {});
  };
  const mats = async (id: number, rows: any[]) => { for (const m of rows) await api('POST', `/shipments/${id}/materials`, 'operator', m); };
  const mk = (b: any) => api('POST', '/shipments', 'shipping', b);
  const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  // 1. Oversize sanitary tank — fully released and picked up
  const s1 = (await mk({ job_no: 'J-5120', customer: 'Great Lakes Brewing', po_no: 'PO-5530', plant: 'Hiawatha (HQ)', description: '316L glycol-jacketed fermenter, 30 bbl', special_requirements: 'Borescope report and Ra ≤ 25 µin on all product-contact surfaces.', size_class: 'oversize', is_sanitary: true, length_in: 600, width_in: 98, height_in: 150, weight_lb: 14500, pieces: 1, ship_from_dock: 'Dock 3', ship_to_name: 'Great Lakes Brewing', ship_to_address: '2516 Market Ave, Cleveland OH', pickup_appt: soon(6), templateIds: T('Every shipment', 'Oversize', 'Sanitary'), parts: [{ part_no: 'FV-30', description: 'Fermenter shell', qty: 1, grade: '316L', heat_no: 'H77412' }, { part_no: 'FV-30-L', description: 'Legs (4)', qty: 4, grade: '304', heat_no: 'H55120' }] })).shipment.id;
  await mats(s1, [{ category: 'base_metal', name: '316L plate 3/16"', grade: '316L', heat_lot: 'H77412', qty: 1200, unit: 'lb', spec: 'ASTM A240' }, { category: 'consumable', name: 'ER316L filler wire 0.035', heat_lot: 'LOT-ER-5521', qty: 14, unit: 'lb', spec: 'AWS A5.9' }, { category: 'consumable', name: 'Argon purge gas', heat_lot: 'AR-2210', qty: 6, unit: 'hr' }, { category: 'consumable', name: 'Citric acid passivation solution', heat_lot: 'CIT-0911', qty: 20, unit: 'gal' }, { category: 'packaging', name: 'Nonmetallic dunnage / blocking', qty: 8, unit: 'ea' }]);
  await work(s1, { fail: /No gouges/ });
  let d1 = await api('GET', `/shipments/${s1}`, 'manager');
  const f1 = d1.flags.find((f: any) => f.status === 'open');
  const capa = await api('POST', '/capas', 'inspector', { title: 'Shell scratches from forklift forks', flag_id: f1.id, owner_id: (await api('GET', '/users', 'manager')).find((u: any) => u.username === 'operator').id, due_date: day(14), root_cause: 'Bare steel forks used to move stainless shells', corrective_action: 'Nylon-lined fork covers fitted to trucks 2 and 4', preventive_action: 'Fork-cover check added to daily truck inspection', containment: 'Scratch polished out and re-inspected; surface finish re-measured' });
  await api('POST', `/shipments/flags/${f1.id}/resolve`, 'manager', { pin: PINS.manager, disposition: 'rework', resolution: 'Polished out, re-inspected OK by Ira Inspector' });
  await api('POST', `/capas/${capa.id}/close`, 'manager', { pin: PINS.manager, effectiveness_check: 'No scratch findings on the next 12 shells shipped' });
  await api('PATCH', `/shipments/${s1}`, 'shipping', { carrier: 'Heartland Heavy Haul', equipment_type: 'Step-deck', truck_no: 'T-118', trailer_no: 'SD-2207', driver_name: 'Dan Driver', driver_id_no: 'CDL OH-5521339', bol_no: 'BOL-88213', seal_no: 'SEAL-7731', permit_no: 'OH-PRM-4471, PA-PRM-99120', escort_required: true, tiedown_notes: '6 straps, edge protectors on every strap' });
  await api('POST', `/shipments/${s1}/events`, 'shipping', { type: 'ready', location: 'Dock 3', lat: 41.5, lng: -81.7, accuracy_m: 9 });
  await api('POST', `/shipments/${s1}/release`, 'manager', { pin: PINS.manager });
  await api('POST', `/shipments/${s1}/events`, 'shipping', { type: 'loaded', location: 'Dock 3' });
  await upload('shipping', s1, null, 'photo', 'Load secured — strap 3 at edge protector');
  await api('POST', `/shipments/${s1}/events`, 'shipping', { type: 'picked_up', location: 'Dock 3', person_name: 'Dan Driver', lat: 41.4993, lng: -81.6944, accuracy_m: 7, signature_png: 'data:image/png;base64,' + png(160, 48, [255, 255, 255], [20, 40, 90]).toString('base64') });

  // 2. Small-parts parcel — delivered
  const s2 = (await mk({ job_no: 'J-5188', customer: 'Prairie Dairy Equipment', po_no: 'PO-8821', plant: 'Lisbon', description: '3-A sanitary clamp ferrules, 200 pcs', size_class: 'small', is_sanitary: true, length_in: 12, width_in: 10, height_in: 8, weight_lb: 22, pieces: 200, templateIds: T('Every shipment', 'Small parts', 'Sanitary'), parts: [{ part_no: 'FER-2', description: '2 in tri-clamp ferrule', qty: 200, grade: '316L', heat_no: 'H90211' }] })).shipment.id;
  await mats(s2, [{ category: 'base_metal', name: '316L bar', grade: '316L', heat_lot: 'H90211', qty: 90, unit: 'lb' }]); await work(s2);
  await api('POST', `/shipments/${s2}/release`, 'manager', { pin: PINS.manager });
  await api('POST', `/shipments/${s2}/events`, 'shipping', { type: 'picked_up', location: 'Lisbon dock', person_name: 'UPS driver' });
  await api('POST', `/shipments/${s2}/events`, 'shipping', { type: 'delivered', location: 'Waterloo IA', person_name: 'R. Kline' });

  // 3. In progress with an open flag, a hold point awaiting a second person, and photos
  const s3 = (await mk({ job_no: 'J-5203', customer: 'Midwest Dairy Co-op', po_no: 'PO-99173', plant: 'Hiawatha (HQ)', description: '316L CIP supply tank, 500 gal', size_class: 'standard', is_sanitary: true, length_in: 120, width_in: 60, height_in: 84, weight_lb: 2100, pieces: 1, pickup_appt: soon(30), templateIds: T('Every shipment', 'Sanitary'), parts: [{ part_no: 'TNK-500', description: 'CIP supply tank', qty: 1, grade: '316L', heat_no: 'H88100' }] })).shipment.id;
  let n = 0; await work(s3, { stop: () => n++ > 22, fail: /No iron/ });
  const sub = (await api('GET', `/shipments/${s3}`, 'manager')).items.find((i: any) => i.needs_verification && i.status === 'pending' && i.kind === 'value');
  if (sub) await api('POST', `/shipments/items/${sub.id}/sign`, 'inspector', { result: 'pass', pin: PINS.inspector, value: '19', gauge: 'PRO-17' });

  // 4. Complete, waiting for the manager's release
  const s4 = (await mk({ job_no: 'J-5210', customer: 'Heartland Biofuels', po_no: 'PO-1204', plant: 'Hiawatha (HQ)', description: 'Stainless piping spools, B31.3', size_class: 'standard', is_pressure: true, length_in: 168, width_in: 24, height_in: 30, weight_lb: 1450, pieces: 6, pickup_appt: soon(52), templateIds: T('Every shipment', 'Pressure'), parts: [{ part_no: 'SP-101', description: '6 in sch 40 spool', qty: 6, grade: '304L', heat_no: 'H66001' }] })).shipment.id;
  await work(s4);

  // 5. Draft: nothing started
  await mk({ job_no: 'J-5231', customer: 'Cedar Valley Brewing', po_no: 'PO-3140', plant: 'Hiawatha (HQ)', description: '316L brite tank 20 bbl', size_class: 'standard', is_sanitary: true, length_in: 132, width_in: 66, height_in: 90, weight_lb: 2600, pieces: 1, pickup_appt: soon(80), templateIds: T('Every shipment', 'Sanitary') });

  // 6. Lisbon high-volume small parts, in progress
  const s6 = (await mk({ job_no: 'J-5244', customer: 'AgriFab Inc', po_no: 'PO-6612', plant: 'Lisbon', description: 'Stainless brackets, 1,200 pcs', size_class: 'small', length_in: 14, width_in: 12, height_in: 10, weight_lb: 40, pieces: 1200, pickup_appt: soon(20), templateIds: T('Every shipment', 'Small parts') })).shipment.id;
  n = 0; await work(s6, { stop: () => n++ > 12 });

  // 7. Released with an override (manager accepted open items, with a reason)
  const s7 = (await mk({ job_no: 'J-5250', customer: 'River City Foods', po_no: 'PO-7710', plant: 'Hiawatha (HQ)', description: 'Hopper, 304', size_class: 'standard', length_in: 84, width_in: 48, height_in: 60, weight_lb: 800, pieces: 1, templateIds: T('Every shipment') })).shipment.id;
  n = 0; await work(s7, { stop: () => n++ > 14 });
  await api('POST', `/shipments/${s7}/release`, 'manager', { pin: PINS.manager, overrideReason: 'Customer line-down; remaining docs to follow by email — approved by J. Smith (customer) and QC manager' });

  // an overdue CAPA
  await api('POST', '/capas', 'inspector', { title: 'Missing heat numbers on legs (two shipments)', description: 'Legs shipped without paint-pen heat marks on 2 of last 20 shipments', owner_id: (await api('GET', '/users', 'manager')).find((u: any) => u.username === 'inspector2').id, due_date: day(-6), status: 'in_progress', root_cause: 'Marking step not on the packing traveler' });
  console.log(`Demo data created. Sign in at the app as manager / changeme123 (PIN 2222) — try manager, inspector, inspector2, operator, shipping, auditor.`);
  server.close();
}
main().then(() => process.exit(0)).catch(e => { console.error('demo-data failed:', e.message); process.exit(1); });
