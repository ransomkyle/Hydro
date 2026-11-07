import { Router } from 'express';
import { z } from 'zod';
import { audit, type Actor } from '../audit.js';
import { authenticate, canSignRole, getUser, requireRole, verifyOfflineProof, verifyPinOnline, type User } from '../auth.js';
import { PLANTS, REQUIRE_APPROVED_TEMPLATES } from '../config.js';
import { db, nowIso } from '../db.js';
import { notifyRoles } from '../notify.js';
import { readiness } from '../readiness.js';
import { alreadyProcessed, effectiveTime, HttpError, wrap } from '../util.js';

export const router = Router();
router.use(authenticate);

const actorOf = (u: User): Actor => ({ id: u.id, name: u.name });
const LOCKED = ['released', 'shipped', 'delivered', 'cancelled'];
/** Editable even after release (needed at pickup), but never after delivery/cancel. */
const LOGISTICS_FIELDS = ['carrier', 'equipment_type', 'truck_no', 'trailer_no', 'driver_name', 'driver_id_no', 'bol_no', 'pro_no', 'seal_no',
  'permit_no', 'escort_required', 'rigging_notes', 'tiedown_notes', 'pickup_appt', 'ship_from_dock', 'ship_to_name', 'ship_to_address', 'weight_lb', 'length_in', 'width_in', 'height_in', 'pieces'];
const HEADER_FIELDS = ['plant', 'job_no', 'customer', 'po_no', 'description', 'special_requirements', 'size_class', 'is_sanitary', 'is_pressure', 'requested_ship_date'];

function getShipment(id: number): any {
  const s = db.prepare('SELECT * FROM shipments WHERE id=?').get(id);
  if (!s) throw new HttpError(404, 'Shipment not found');
  return s;
}
function getItem(id: number): any {
  const i = db.prepare('SELECT * FROM checklist_items WHERE id=?').get(id);
  if (!i) throw new HttpError(404, 'Checklist item not found');
  return i;
}
function assertEditable(s: any) {
  if (LOCKED.includes(s.status)) throw new HttpError(409, `Shipment is ${s.status} and locked. A QC manager must reopen it to change the checklist.`);
}
const noAuditors = requireRole('operator', 'inspector', 'manager', 'shipping', 'admin');
const qcStaff = requireRole('inspector', 'manager', 'admin');

// ---------------------------------------------------------------- list / create
router.get('/', wrap((req, res) => {
  const q = req.query;
  const where: string[] = []; const args: any[] = [];
  if (q.status) { where.push('s.status = ?'); args.push(String(q.status)); }
  else if (q.active === '1') where.push(`s.status IN ('draft','in_progress','released')`);
  if (q.customer) { where.push('s.customer LIKE ?'); args.push(`%${q.customer}%`); }
  if (q.plant) { where.push('s.plant = ?'); args.push(String(q.plant)); }
  if (q.from) { where.push('s.created_at >= ?'); args.push(String(q.from)); }
  if (q.to) { where.push('s.created_at <= ?'); args.push(String(q.to) + 'T23:59:59.999Z'); }
  if (q.flags === '1') where.push(`EXISTS (SELECT 1 FROM flags f WHERE f.shipment_id=s.id AND f.status='open')`);
  if (q.q) {
    const t = `%${String(q.q).trim()}%`;
    where.push(`(s.shipment_no LIKE ? OR s.job_no LIKE ? OR s.po_no LIKE ? OR s.customer LIKE ? OR s.bol_no LIKE ? OR s.description LIKE ?
      OR EXISTS (SELECT 1 FROM parts p WHERE p.shipment_id=s.id AND (p.heat_no LIKE ? OR p.part_no LIKE ?))
      OR EXISTS (SELECT 1 FROM materials m WHERE m.shipment_id=s.id AND m.voided=0 AND (m.heat_lot LIKE ? OR m.name LIKE ?)))`);
    args.push(t, t, t, t, t, t, t, t, t, t);
  }
  const limit = Math.min(Number(q.limit ?? 200), 500), offset = Number(q.offset ?? 0);
  const rows = db.prepare(`SELECT s.id,s.shipment_no,s.plant,s.job_no,s.customer,s.po_no,s.description,s.status,s.size_class,s.is_sanitary,s.is_pressure,
      s.pickup_appt,s.requested_ship_date,s.created_at,s.released_at,s.weight_lb,s.length_in,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.shipment_id=s.id) AS items_total,
      (SELECT COUNT(*) FROM checklist_items c WHERE c.shipment_id=s.id AND c.status!='pending') AS items_done,
      (SELECT COUNT(*) FROM flags f WHERE f.shipment_id=s.id AND f.status='open') AS open_flags
    FROM shipments s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  res.json(rows);
}));

const num = z.coerce.number().finite().nonnegative().optional().nullable();
const str = (n = 500) => z.string().max(n).optional().nullable();
const ShipmentBody = z.object({
  plant: str(60), job_no: z.string().min(1).max(60), customer: z.string().min(1).max(120), po_no: str(60), description: str(1000),
  special_requirements: str(2000), size_class: z.enum(['small', 'standard', 'oversize']).default('standard'),
  is_sanitary: z.boolean().default(false), is_pressure: z.boolean().default(false),
  length_in: num, width_in: num, height_in: num, weight_lb: num, pieces: z.coerce.number().int().nonnegative().optional().nullable(),
  ship_from_dock: str(60), ship_to_name: str(200), ship_to_address: str(500), requested_ship_date: str(30), pickup_appt: str(40),
  carrier: str(120), equipment_type: str(60), truck_no: str(40), trailer_no: str(40), driver_name: str(120), driver_id_no: str(60),
  bol_no: str(60), pro_no: str(60), seal_no: str(60), permit_no: str(200), escort_required: z.boolean().default(false),
  rigging_notes: str(2000), tiedown_notes: str(2000),
});
const PartBody = z.object({
  part_no: str(80), description: str(300), qty: z.coerce.number().positive().default(1), grade: str(40), heat_no: str(60),
  finish: str(60), drawing_rev: str(20), length_in: num, weight_lb: num,
});

function nextShipmentNo(): string {
  const d = new Date();
  const prefix = `SQ-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-`;
  const last = db.prepare(`SELECT shipment_no FROM shipments WHERE shipment_no LIKE ? ORDER BY shipment_no DESC LIMIT 1`).get(prefix + '%') as any;
  const n = last ? Number(last.shipment_no.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

function cloneTemplatesInto(shipmentId: number, templateIds: number[]): number {
  let seq = (db.prepare('SELECT COALESCE(MAX(seq),0) m FROM checklist_items WHERE shipment_id=?').get(shipmentId) as any).m;
  const ins = db.prepare(`INSERT INTO checklist_items(shipment_id,seq,section,text,kind,unit,spec,reference,required,signer_role,needs_verification,source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  let added = 0;
  for (const tid of templateIds) {
    const t = db.prepare('SELECT * FROM templates WHERE id=? AND active=1').get(tid) as any;
    if (!t) throw new HttpError(400, `Template ${tid} not found`);
    const items = db.prepare('SELECT * FROM template_items WHERE template_id=? ORDER BY seq').all(tid) as any[];
    for (const i of items) {
      ins.run(shipmentId, ++seq, i.section, i.text, i.kind, i.unit, i.spec, i.reference, i.required, i.signer_role, i.needs_verification, t.name);
      added++;
    }
  }
  return added;
}

const CreateBody = ShipmentBody.extend({
  templateIds: z.array(z.number().int()).default([]),
  parts: z.array(PartBody).default([]),
});
export type CreateInput = z.infer<typeof CreateBody>;

/** Creates a shipment with its checklist copy and parts, and audits it. Used by the form and by CSV import. */
export function createShipment(user: User, body: CreateInput): number {
  const plant = body.plant ?? PLANTS[0] ?? null;
  if (plant && PLANTS.length && !PLANTS.includes(plant)) throw new HttpError(400, `Unknown plant. Choose one of: ${PLANTS.join(', ')}`);
  const unapproved = body.templateIds.length ? (db.prepare(`SELECT id,name FROM templates WHERE approved_at IS NULL AND id IN (${body.templateIds.map(() => '?').join(',')})`).all(...body.templateIds) as any[]) : [];
  if (unapproved.length && REQUIRE_APPROVED_TEMPLATES) throw new HttpError(409, `These checklist templates have not been approved by a QC manager: ${unapproved.map(t => t.name).join('; ')}`);
  return db.transaction(() => {
    const now = nowIso();
    const { templateIds, parts, ...rest } = body;
    const f = { ...rest, plant };
    const cols = Object.keys(f) as (keyof typeof f)[];
    const vals = cols.map(c => typeof f[c] === 'boolean' ? (f[c] ? 1 : 0) : (f[c] ?? null));
    const no = nextShipmentNo();
    const r = db.prepare(`INSERT INTO shipments (shipment_no,${cols.join(',')},created_by,created_at,updated_at) VALUES (?,${cols.map(() => '?').join(',')},?,?,?)`)
      .run(no, ...vals, user.id, now, now);
    const id = Number(r.lastInsertRowid);
    const added = cloneTemplatesInto(id, templateIds);
    const insPart = db.prepare(`INSERT INTO parts(shipment_id,part_no,description,qty,grade,heat_no,finish,drawing_rev,length_in,weight_lb) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const p of parts) insPart.run(id, p.part_no ?? null, p.description ?? null, p.qty, p.grade ?? null, p.heat_no ?? null, p.finish ?? null, p.drawing_rev ?? null, p.length_in ?? null, p.weight_lb ?? null);
    audit({ actor: actorOf(user), action: 'shipment.create', entity: 'shipment', entityId: id, shipmentId: id, detail: { shipment_no: no, job_no: f.job_no, customer: f.customer, templateIds, checklistItems: added, parts: parts.length, plant, unapprovedTemplates: unapproved.map(t => t.name) } });
    return id;
  })();
}

router.post('/', requireRole('shipping', 'inspector', 'manager', 'admin'), wrap((req, res) => {
  const id = createShipment(req.user!, CreateBody.parse(req.body));
  res.status(201).json(loadDetail(id));
}));

// ---------------------------------------------------------------- detail
function loadDetail(id: number) {
  const s = getShipment(id);
  const items = db.prepare(`SELECT c.*, u.name AS done_by_name, v.name AS verified_by_name FROM checklist_items c
    LEFT JOIN users u ON u.id=c.done_by LEFT JOIN users v ON v.id=c.verified_by WHERE c.shipment_id=? ORDER BY c.seq`).all(id);
  const parts = db.prepare('SELECT * FROM parts WHERE shipment_id=? ORDER BY id').all(id);
  const materials = db.prepare(`SELECT m.*, u.name AS added_by_name FROM materials m JOIN users u ON u.id=m.added_by WHERE m.shipment_id=? ORDER BY m.added_at`).all(id);
  const events = db.prepare(`SELECT e.*, u.name AS recorded_by_name FROM events e JOIN users u ON u.id=e.recorded_by WHERE e.shipment_id=? ORDER BY e.at`).all(id);
  const attachments = db.prepare(`SELECT a.id,a.shipment_id,a.item_id,a.kind,a.filename,a.mime,a.size,a.sha256,a.caption,a.uploaded_at,a.received_at,a.offline,a.voided,a.void_reason,u.name AS uploaded_by_name
    FROM attachments a JOIN users u ON u.id=a.uploaded_by WHERE a.shipment_id=? ORDER BY a.uploaded_at`).all(id);
  const flags = db.prepare(`SELECT f.*, u.name AS raised_by_name, r.name AS resolved_by_name FROM flags f JOIN users u ON u.id=f.raised_by
    LEFT JOIN users r ON r.id=f.resolved_by WHERE f.shipment_id=? ORDER BY f.id`).all(id);
  const created = getUser((s as any).created_by);
  const released = (s as any).released_by ? getUser((s as any).released_by) : null;
  return { shipment: { ...s, created_by_name: created?.name, released_by_name: released?.name ?? null }, items, parts, materials, events, attachments, flags, readiness: readiness(id) };
}
export { loadDetail };

router.get('/:id', wrap((req, res) => res.json(loadDetail(Number(req.params.id)))));

router.get('/:id/readiness', wrap((req, res) => { getShipment(Number(req.params.id)); res.json(readiness(Number(req.params.id))); }));

router.get('/:id/audit', wrap((req, res) => {
  getShipment(Number(req.params.id));
  res.json(db.prepare('SELECT id,at,event_at,user_name,action,entity,entity_id,detail,offline FROM audit_log WHERE shipment_id=? ORDER BY id').all(Number(req.params.id)));
}));

// ---------------------------------------------------------------- update header / logistics
router.patch('/:id', requireRole('shipping', 'inspector', 'manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const s = getShipment(id);
  if (['delivered', 'cancelled'].includes(s.status)) throw new HttpError(409, `Shipment is ${s.status}`);
  // strict: an unknown field is a loud 400, never a silently dropped edit
  const body = ShipmentBody.partial().strict().parse(req.body) as Record<string, any>;
  const locked = LOCKED.includes(s.status);
  const allowed = locked ? LOGISTICS_FIELDS : [...HEADER_FIELDS, ...LOGISTICS_FIELDS];
  const changes: Record<string, { from: any; to: any }> = {};
  const sets: string[] = []; const args: any[] = [];
  for (const [k, raw] of Object.entries(body)) {
    if (!allowed.includes(k)) throw new HttpError(409, `"${k}" is locked after release`);
    const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : (raw ?? null);
    if (v !== s[k]) { changes[k] = { from: s[k], to: v }; sets.push(`${k}=?`); args.push(v); }
  }
  if (!sets.length) return res.json(loadDetail(id));
  db.transaction(() => {
    db.prepare(`UPDATE shipments SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...args, nowIso(), id);
    audit({ actor: actorOf(req.user!), action: 'shipment.update', entity: 'shipment', entityId: id, shipmentId: id, detail: changes });
  })();
  res.json(loadDetail(id));
}));

// ---------------------------------------------------------------- parts
router.post('/:id/parts', requireRole('shipping', 'inspector', 'manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id); assertEditable(getShipment(id));
  const p = PartBody.parse(req.body);
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO parts(shipment_id,part_no,description,qty,grade,heat_no,finish,drawing_rev,length_in,weight_lb) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, p.part_no ?? null, p.description ?? null, p.qty, p.grade ?? null, p.heat_no ?? null, p.finish ?? null, p.drawing_rev ?? null, p.length_in ?? null, p.weight_lb ?? null);
    audit({ actor: actorOf(req.user!), action: 'part.add', entity: 'part', entityId: Number(r.lastInsertRowid), shipmentId: id, detail: p });
  })();
  res.status(201).json(loadDetail(id));
}));
router.delete('/:id/parts/:partId', requireRole('shipping', 'inspector', 'manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id); assertEditable(getShipment(id));
  const part = db.prepare('SELECT * FROM parts WHERE id=? AND shipment_id=?').get(Number(req.params.partId), id);
  if (!part) throw new HttpError(404, 'Part not found');
  db.transaction(() => {
    db.prepare('DELETE FROM parts WHERE id=?').run(Number(req.params.partId));
    audit({ actor: actorOf(req.user!), action: 'part.remove', entity: 'part', entityId: Number(req.params.partId), shipmentId: id, detail: part });
  })();
  res.json(loadDetail(id));
}));

// ---------------------------------------------------------------- checklist structure (per-job customisation)
const ItemDef = z.object({
  section: z.string().min(1).max(80), text: z.string().min(1).max(500), kind: z.enum(['check', 'value', 'photo', 'doc']).default('check'),
  unit: str(30), spec: str(500), reference: str(200), required: z.boolean().default(true),
  signer_role: z.enum(['any', 'inspector', 'manager']).default('any'), needs_verification: z.boolean().default(false),
});

router.post('/:id/checklist', qcStaff, wrap((req, res) => {
  const id = Number(req.params.id); assertEditable(getShipment(id));
  const d = ItemDef.parse(req.body);
  db.transaction(() => {
    const seq = (db.prepare('SELECT COALESCE(MAX(seq),0)+1 n FROM checklist_items WHERE shipment_id=?').get(id) as any).n;
    const r = db.prepare(`INSERT INTO checklist_items(shipment_id,seq,section,text,kind,unit,spec,reference,required,signer_role,needs_verification,source) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'custom')`)
      .run(id, seq, d.section, d.text, d.kind, d.unit ?? null, d.spec ?? null, d.reference ?? null, d.required ? 1 : 0, d.signer_role, d.needs_verification ? 1 : 0);
    audit({ actor: actorOf(req.user!), action: 'checklist.add_item', entity: 'checklist_item', entityId: Number(r.lastInsertRowid), shipmentId: id, detail: d });
  })();
  res.status(201).json(loadDetail(id));
}));

router.post('/:id/apply-templates', qcStaff, wrap((req, res) => {
  const id = Number(req.params.id); assertEditable(getShipment(id));
  const { templateIds } = z.object({ templateIds: z.array(z.number().int()).min(1) }).parse(req.body);
  db.transaction(() => {
    const added = cloneTemplatesInto(id, templateIds);
    audit({ actor: actorOf(req.user!), action: 'checklist.apply_templates', entity: 'shipment', entityId: id, shipmentId: id, detail: { templateIds, added } });
  })();
  res.json(loadDetail(id));
}));

router.post('/:id/save-as-template', requireRole('manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id); getShipment(id);
  const b = z.object({ name: z.string().min(2).max(120), customer: str(120), description: str(500) }).parse(req.body);
  const items = db.prepare('SELECT * FROM checklist_items WHERE shipment_id=? ORDER BY seq').all(id) as any[];
  const tid = db.transaction(() => {
    const now = nowIso();
    const r = db.prepare(`INSERT INTO templates(name,description,customer,category,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(b.name, b.description ?? null, b.customer ?? null, b.customer ? 'customer' : 'module', req.user!.id, now, now);
    const tid = Number(r.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO template_items(template_id,seq,section,text,kind,unit,spec,reference,required,signer_role,needs_verification) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    items.forEach((i, n) => ins.run(tid, n + 1, i.section, i.text, i.kind, i.unit, i.spec, i.reference, i.required, i.signer_role, i.needs_verification));
    audit({ actor: actorOf(req.user!), action: 'template.create_from_shipment', entity: 'template', entityId: tid, shipmentId: id, detail: { name: b.name, items: items.length } });
    return tid;
  })();
  res.status(201).json({ id: tid });
}));

// ---------------------------------------------------------------- sign-offs (items live under /api/shipments/items/:id/*)
const SignBase = z.object({
  pin: z.string().max(20).optional(), proof: z.string().max(200).optional(), userId: z.number().int().optional(),
  opId: z.string().max(80).optional(), offline: z.boolean().optional(), clientAt: z.string().max(40).optional(),
});
const SignBody = SignBase.extend({ result: z.enum(['pass', 'fail', 'na']), value: z.string().max(500).optional(), note: z.string().max(2000).optional(), gauge: z.string().max(40).optional() });
const VerifyBody = SignBase.extend({ note: z.string().max(2000).optional() });

/** Canonical string both device and server HMAC for offline sign-offs. Keep in sync with web/src/lib/crypto.ts */
export const canonicalSign = (action: string, itemId: number, b: { opId?: string; result?: string; value?: string; note?: string; clientAt?: string; gauge?: string }) =>
  [b.opId ?? '', action, itemId, b.result ?? '', b.value ?? '', b.note ?? '', b.clientAt ?? '', b.gauge ?? ''].join('|');

function resolveSigner(req: any, body: z.infer<typeof SignBase>, canonical: string): { user: User; offline: boolean } {
  if (body.proof && body.offline) {
    const u = getUser(Number(body.userId));
    if (!u || !u.active) throw new HttpError(403, 'Unknown signer');
    verifyOfflineProof(u, canonical, body.proof);
    return { user: u, offline: true };
  }
  verifyPinOnline(req.user, body.pin);
  return { user: req.user, offline: false };
}

router.post('/items/:itemId/sign', noAuditors, wrap((req, res) => {
  const itemId = Number(req.params.itemId);
  const body = SignBody.parse(req.body);
  const item = getItem(itemId);
  const { user, offline } = resolveSigner(req, body, canonicalSign('sign', itemId, body));
  if (alreadyProcessed(body.opId, user.id)) return res.json({ duplicate: true, ...loadDetail(item.shipment_id) });
  const ship = getShipment(item.shipment_id);
  assertEditable(ship);
  if (user.role === 'auditor') throw new HttpError(403, 'Auditors are read-only');
  if (!canSignRole(user.role, item.signer_role)) throw new HttpError(403, `This item must be signed by ${item.signer_role === 'manager' ? 'a QC manager' : 'a QC inspector or manager'}`);
  if (item.status !== 'pending') throw new HttpError(409, `Item already signed ${item.status.toUpperCase()} — revoke it first to change`);
  const note = body.note?.trim(), value = body.value?.trim(), gaugeNo = body.gauge?.trim() || null;
  if ((body.result === 'fail' || body.result === 'na') && !note) throw new HttpError(400, body.result === 'fail' ? 'Describe what failed' : 'Give a reason for N/A');
  if (body.result === 'pass') {
    if (item.kind === 'value' && !value) throw new HttpError(400, `Enter the measured/recorded value${item.unit ? ' (' + item.unit + ')' : ''}`);
    if (item.kind === 'photo' || item.kind === 'doc') {
      const n = (db.prepare('SELECT COUNT(*) n FROM attachments WHERE item_id=? AND voided=0').get(itemId) as any).n;
      if (!n) throw new HttpError(400, item.kind === 'photo' ? 'Attach at least one photo before passing' : 'Attach the required document before passing');
    }
  }
  const at = effectiveTime(offline || body.offline, body.clientAt);
  const now = nowIso();
  if (gaugeNo) {
    if (item.kind !== 'value') throw new HttpError(400, 'A gauge can only be recorded on a measurement item');
    const g = db.prepare('SELECT * FROM gauges WHERE gauge_no=?').get(gaugeNo) as any;
    if (!g) throw new HttpError(400, `Gauge "${gaugeNo}" is not in the calibration register`);
    if (g.status !== 'active') throw new HttpError(400, `Gauge ${g.gauge_no} is ${g.status.replace('_', ' ')} and cannot be used`);
    if (body.result === 'pass' && g.cal_due < at.slice(0, 10)) throw new HttpError(400, `Gauge ${g.gauge_no} calibration expired on ${g.cal_due} — use an in-calibration gauge`);
  }
  db.transaction(() => {
    db.prepare(`UPDATE checklist_items SET status=?,value=?,note=?,gauge_no=?,done_by=?,done_at=?,done_received_at=?,done_offline=?,verified_by=NULL,verified_at=NULL,verify_note=NULL WHERE id=?`)
      .run(body.result, value ?? null, note ?? null, gaugeNo, user.id, at, now, offline ? 1 : 0, itemId);
    if (ship.status === 'draft') db.prepare(`UPDATE shipments SET status='in_progress', updated_at=? WHERE id=?`).run(now, ship.id);
    audit({ actor: actorOf(user), action: `item.${body.result}`, entity: 'checklist_item', entityId: itemId, shipmentId: ship.id, eventAt: at, offline,
      detail: { section: item.section, text: item.text, result: body.result, value, note, gauge: gaugeNo, method: offline ? 'pin-offline-hmac' : 'pin', clientAt: body.clientAt, signedBy: user.name, tokenUser: req.user!.name } });
    if (body.result === 'fail') {
      const sev = item.signer_role !== 'any' || item.needs_verification ? 'critical' : 'major';
      const r = db.prepare(`INSERT INTO flags(shipment_id,item_id,severity,description,auto,raised_by,raised_at) VALUES (?,?,?,?,1,?,?)`)
        .run(ship.id, itemId, sev, `${item.text} — ${note}`, user.id, at);
      audit({ actor: actorOf(user), action: 'flag.auto_raise', entity: 'flag', entityId: Number(r.lastInsertRowid), shipmentId: ship.id, eventAt: at, offline, detail: { item: item.text, severity: sev, note } });
      notifyRoles({ kind: 'flag', title: `FAILED: ${ship.shipment_no} (${ship.customer})`, body: `${item.text} — ${note} (by ${user.name})`, shipmentId: ship.id, roles: ['manager', 'inspector'], excludeUserId: user.id });
    }
    const after = readiness(ship.id);
    if (after.ready && after.progress.total > 0) {
      const dupe = db.prepare(`SELECT 1 FROM notifications WHERE shipment_id=? AND kind='ready' LIMIT 1`).get(ship.id);
      if (!dupe) notifyRoles({ kind: 'ready', title: `Ready for release: ${ship.shipment_no} (${ship.customer})`, body: 'All checklist items complete', shipmentId: ship.id, roles: ['manager'] });
    }
  })();
  res.json(loadDetail(ship.id));
}));

router.post('/items/:itemId/verify', noAuditors, wrap((req, res) => {
  const itemId = Number(req.params.itemId);
  const body = VerifyBody.parse(req.body);
  const item = getItem(itemId);
  const { user, offline } = resolveSigner(req, body, canonicalSign('verify', itemId, body));
  if (alreadyProcessed(body.opId, user.id)) return res.json({ duplicate: true, ...loadDetail(item.shipment_id) });
  const ship = getShipment(item.shipment_id); assertEditable(ship);
  if (!['inspector', 'manager'].includes(user.role)) throw new HttpError(403, 'Only a QC inspector or manager can verify');
  if (item.status !== 'pass') throw new HttpError(409, 'Only items signed PASS can be verified');
  if (!item.needs_verification) throw new HttpError(400, 'This item does not require second-person verification');
  if (item.verified_by) throw new HttpError(409, 'Already verified');
  if (item.done_by === user.id) throw new HttpError(403, 'Verification must be by a different person than the one who signed');
  const at = effectiveTime(offline || body.offline, body.clientAt);
  db.transaction(() => {
    db.prepare(`UPDATE checklist_items SET verified_by=?, verified_at=?, verified_offline=?, verify_note=? WHERE id=?`).run(user.id, at, offline ? 1 : 0, body.note ?? null, itemId);
    audit({ actor: actorOf(user), action: 'item.verify', entity: 'checklist_item', entityId: itemId, shipmentId: ship.id, eventAt: at, offline,
      detail: { text: item.text, signedBy: item.done_by, note: body.note, method: offline ? 'pin-offline-hmac' : 'pin' } });
  })();
  res.json(loadDetail(ship.id));
}));

router.post('/items/:itemId/revoke', requireRole('inspector', 'manager'), wrap((req, res) => {
  const itemId = Number(req.params.itemId);
  const body = z.object({ pin: z.string().max(20), reason: z.string().min(3).max(1000) }).parse(req.body);
  const item = getItem(itemId);
  const ship = getShipment(item.shipment_id); assertEditable(ship);
  verifyPinOnline(req.user!, body.pin);
  if (item.status === 'pending') throw new HttpError(409, 'Item is not signed');
  if (item.verified_by && req.user!.role !== 'manager') throw new HttpError(403, 'Only a QC manager can revoke a verified item');
  db.transaction(() => {
    audit({ actor: actorOf(req.user!), action: 'item.revoke', entity: 'checklist_item', entityId: itemId, shipmentId: ship.id,
      detail: { reason: body.reason, previous: { status: item.status, value: item.value, note: item.note, done_by: item.done_by, done_at: item.done_at, verified_by: item.verified_by, verified_at: item.verified_at } } });
    db.prepare(`UPDATE checklist_items SET status='pending',value=NULL,note=NULL,gauge_no=NULL,done_by=NULL,done_at=NULL,done_received_at=NULL,done_offline=0,verified_by=NULL,verified_at=NULL,verified_offline=0,verify_note=NULL WHERE id=?`).run(itemId);
  })();
  res.json(loadDetail(ship.id));
}));

router.patch('/items/:itemId', qcStaff, wrap((req, res) => {
  const itemId = Number(req.params.itemId);
  const item = getItem(itemId); assertEditable(getShipment(item.shipment_id));
  if (item.status !== 'pending') throw new HttpError(409, 'Revoke the sign-off before editing this item');
  const d = ItemDef.partial().parse(req.body) as Record<string, any>;
  const sets: string[] = [], args: any[] = [], changes: Record<string, any> = {};
  for (const [k, raw] of Object.entries(d)) {
    const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : (raw ?? null);
    if (v !== item[k]) { sets.push(`${k}=?`); args.push(v); changes[k] = { from: item[k], to: v }; }
  }
  if (sets.length) db.transaction(() => {
    db.prepare(`UPDATE checklist_items SET ${sets.join(',')}, source='custom' WHERE id=?`).run(...args, itemId);
    audit({ actor: actorOf(req.user!), action: 'checklist.edit_item', entity: 'checklist_item', entityId: itemId, shipmentId: item.shipment_id, detail: changes });
  })();
  res.json(loadDetail(item.shipment_id));
}));

router.post('/items/:itemId/remove', qcStaff, wrap((req, res) => {
  const itemId = Number(req.params.itemId);
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
  const item = getItem(itemId); assertEditable(getShipment(item.shipment_id));
  if (item.status !== 'pending') throw new HttpError(409, 'Revoke the sign-off before removing this item');
  db.transaction(() => {
    audit({ actor: actorOf(req.user!), action: 'checklist.remove_item', entity: 'checklist_item', entityId: itemId, shipmentId: item.shipment_id, detail: { reason, item } });
    db.prepare('DELETE FROM checklist_items WHERE id=?').run(itemId);
  })();
  res.json(loadDetail(item.shipment_id));
}));

// ---------------------------------------------------------------- materials
const MaterialBody = z.object({
  category: z.enum(['base_metal', 'consumable', 'packaging']), name: z.string().min(1).max(200), grade: str(40), heat_lot: str(80), spec: str(120),
  qty: num, unit: str(20), note: str(500), mtr_attachment_id: z.number().int().optional().nullable(),
  opId: z.string().max(80).optional(), offline: z.boolean().optional(), clientAt: z.string().max(40).optional(),
});
router.post('/:id/materials', noAuditors, wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id); assertEditable(ship);
  const b = MaterialBody.parse(req.body);
  if (alreadyProcessed(b.opId, req.user!.id)) return res.json({ duplicate: true, ...loadDetail(id) });
  const at = effectiveTime(b.offline, b.clientAt);
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO materials(shipment_id,category,name,grade,heat_lot,spec,qty,unit,mtr_attachment_id,note,added_by,added_at,received_at,offline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.category, b.name, b.grade ?? null, b.heat_lot ?? null, b.spec ?? null, b.qty ?? null, b.unit ?? null, b.mtr_attachment_id ?? null, b.note ?? null, req.user!.id, at, nowIso(), b.offline ? 1 : 0);
    audit({ actor: actorOf(req.user!), action: 'material.add', entity: 'material', entityId: Number(r.lastInsertRowid), shipmentId: id, eventAt: at, offline: !!b.offline,
      detail: { category: b.category, name: b.name, grade: b.grade, heat_lot: b.heat_lot, qty: b.qty, unit: b.unit } });
    if (ship.status === 'draft') db.prepare(`UPDATE shipments SET status='in_progress', updated_at=? WHERE id=?`).run(nowIso(), id);
  })();
  res.status(201).json(loadDetail(id));
}));
router.post('/materials/:mid/void', qcStaff, wrap((req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(Number(req.params.mid)) as any;
  if (!m) throw new HttpError(404, 'Material entry not found');
  assertEditable(getShipment(m.shipment_id));
  db.transaction(() => {
    db.prepare(`UPDATE materials SET voided=1,void_reason=?,voided_by=?,voided_at=? WHERE id=?`).run(reason, req.user!.id, nowIso(), m.id);
    audit({ actor: actorOf(req.user!), action: 'material.void', entity: 'material', entityId: m.id, shipmentId: m.shipment_id, detail: { reason, material: m } });
  })();
  res.json(loadDetail(m.shipment_id));
}));

// ---------------------------------------------------------------- logistics events
const EventBody = z.object({
  type: z.enum(['ready', 'loaded', 'departed', 'picked_up', 'delivered', 'note']),
  location: str(300), lat: z.number().min(-90).max(90).optional().nullable(), lng: z.number().min(-180).max(180).optional().nullable(),
  accuracy_m: z.number().nonnegative().optional().nullable(), person_name: str(120), note: str(1000),
  signature_png: z.string().max(400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional().nullable(),
  opId: z.string().max(80).optional(), offline: z.boolean().optional(), clientAt: z.string().max(40).optional(),
});
router.post('/:id/events', requireRole('shipping', 'inspector', 'manager', 'admin', 'operator'), wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id);
  if (ship.status === 'cancelled') throw new HttpError(409, 'Shipment is cancelled');
  const b = EventBody.parse(req.body);
  if (alreadyProcessed(b.opId, req.user!.id)) return res.json({ duplicate: true, ...loadDetail(id) });
  const at = effectiveTime(b.offline, b.clientAt);
  const now = nowIso();
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO events(shipment_id,type,at,received_at,location,lat,lng,accuracy_m,person_name,note,signature_png,recorded_by,offline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.type, at, now, b.location ?? null, b.lat ?? null, b.lng ?? null, b.accuracy_m ?? null, b.person_name ?? null, b.note ?? null, b.signature_png ?? null, req.user!.id, b.offline ? 1 : 0);
    audit({ actor: actorOf(req.user!), action: `event.${b.type}`, entity: 'event', entityId: Number(r.lastInsertRowid), shipmentId: id, eventAt: at, offline: !!b.offline,
      detail: { location: b.location, lat: b.lat, lng: b.lng, person: b.person_name, note: b.note, signature: !!b.signature_png } });
    const leaving = b.type === 'departed' || b.type === 'picked_up';
    if (leaving && ship.status !== 'released' && ship.status !== 'shipped' && ship.status !== 'delivered') {
      const f = db.prepare(`INSERT INTO flags(shipment_id,severity,description,auto,raised_by,raised_at) VALUES (?, 'critical', ?, 1, ?, ?)`)
        .run(id, 'Shipment left the dock WITHOUT a QC release', req.user!.id, at);
      audit({ actor: actorOf(req.user!), action: 'flag.auto_raise', entity: 'flag', entityId: Number(f.lastInsertRowid), shipmentId: id, eventAt: at, detail: { reason: 'departed unreleased' } });
      notifyRoles({ kind: 'flag', title: `UNRELEASED SHIPMENT LEFT: ${ship.shipment_no} (${ship.customer})`, body: `${b.type} recorded by ${req.user!.name} before QC release`, shipmentId: id, roles: ['manager', 'inspector'] });
    }
    if (leaving && ['released', 'in_progress', 'draft'].includes(ship.status)) db.prepare(`UPDATE shipments SET status='shipped', updated_at=? WHERE id=?`).run(now, id);
    if (b.type === 'delivered') db.prepare(`UPDATE shipments SET status='delivered', updated_at=? WHERE id=?`).run(now, id);
  })();
  res.status(201).json(loadDetail(id));
}));

// ---------------------------------------------------------------- flags
router.post('/:id/flags', noAuditors, wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id);
  const b = z.object({ description: z.string().min(3).max(1500), severity: z.enum(['minor', 'major', 'critical']).default('major'), item_id: z.number().int().optional().nullable() }).parse(req.body);
  db.transaction(() => {
    const r = db.prepare(`INSERT INTO flags(shipment_id,item_id,severity,description,raised_by,raised_at) VALUES (?,?,?,?,?,?)`).run(id, b.item_id ?? null, b.severity, b.description, req.user!.id, nowIso());
    audit({ actor: actorOf(req.user!), action: 'flag.raise', entity: 'flag', entityId: Number(r.lastInsertRowid), shipmentId: id, detail: b });
    notifyRoles({ kind: 'flag', title: `Flag (${b.severity}): ${ship.shipment_no} (${ship.customer})`, body: `${b.description} (by ${req.user!.name})`, shipmentId: id, roles: ['manager', 'inspector'], excludeUserId: req.user!.id });
  })();
  res.status(201).json(loadDetail(id));
}));
router.post('/flags/:flagId/resolve', requireRole('inspector', 'manager'), wrap((req, res) => {
  const b = z.object({ pin: z.string().max(20), disposition: z.enum(['rework', 'repair', 'use_as_is', 'scrap', 'no_action', 'other']), resolution: z.string().min(3).max(1500) }).parse(req.body);
  const f = db.prepare('SELECT * FROM flags WHERE id=?').get(Number(req.params.flagId)) as any;
  if (!f) throw new HttpError(404, 'Flag not found');
  if (f.status !== 'open') throw new HttpError(409, 'Flag already resolved');
  if (f.severity === 'critical' && req.user!.role !== 'manager') throw new HttpError(403, 'Critical flags must be resolved by a QC manager');
  verifyPinOnline(req.user!, b.pin);
  db.transaction(() => {
    db.prepare(`UPDATE flags SET status='resolved',disposition=?,resolution=?,resolved_by=?,resolved_at=? WHERE id=?`).run(b.disposition, b.resolution, req.user!.id, nowIso(), f.id);
    audit({ actor: actorOf(req.user!), action: 'flag.resolve', entity: 'flag', entityId: f.id, shipmentId: f.shipment_id, detail: { disposition: b.disposition, resolution: b.resolution, flag: f.description } });
  })();
  res.json(loadDetail(f.shipment_id));
}));

// ---------------------------------------------------------------- release / reopen / cancel
router.post('/:id/release', requireRole('manager'), wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id);
  const b = z.object({ pin: z.string().max(20), overrideReason: z.string().min(5).max(1000).optional() }).parse(req.body);
  if (ship.status === 'released' || ship.status === 'shipped' || ship.status === 'delivered') throw new HttpError(409, `Shipment is already ${ship.status}`);
  if (ship.status === 'cancelled') throw new HttpError(409, 'Shipment is cancelled');
  verifyPinOnline(req.user!, b.pin);
  const r = readiness(id);
  if (!r.ready && !b.overrideReason) throw new HttpError(409, 'Shipment is not ready for release', { blockers: r.blockers });
  if (r.progress.total === 0) throw new HttpError(409, 'This shipment has no checklist items');
  const now = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE shipments SET status='released',released_by=?,released_at=?,release_override_reason=?,release_snapshot=?,updated_at=? WHERE id=?`)
      .run(req.user!.id, now, r.ready ? null : b.overrideReason!, r.ready ? null : JSON.stringify(r.blockers), now, id);
    audit({ actor: actorOf(req.user!), action: r.ready ? 'shipment.release' : 'shipment.release_override', entity: 'shipment', entityId: id, shipmentId: id,
      detail: { blockers: r.blockers, overrideReason: b.overrideReason ?? null } });
    if (!r.ready) notifyRoles({ kind: 'override', title: `Released WITH OVERRIDE: ${ship.shipment_no} (${ship.customer})`, body: `${b.overrideReason} (${r.blockers.length} open item(s)) — ${req.user!.name}`, shipmentId: id, roles: ['manager', 'inspector'], excludeUserId: req.user!.id });
  })();
  res.json(loadDetail(id));
}));
router.post('/:id/reopen', requireRole('manager'), wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id);
  const b = z.object({ pin: z.string().max(20), reason: z.string().min(5).max(1000) }).parse(req.body);
  if (!['released', 'shipped'].includes(ship.status)) throw new HttpError(409, 'Only released/shipped shipments can be reopened');
  verifyPinOnline(req.user!, b.pin);
  db.transaction(() => {
    db.prepare(`UPDATE shipments SET status='in_progress',released_by=NULL,released_at=NULL,release_override_reason=NULL,release_snapshot=NULL,updated_at=? WHERE id=?`).run(nowIso(), id);
    audit({ actor: actorOf(req.user!), action: 'shipment.reopen', entity: 'shipment', entityId: id, shipmentId: id, detail: { reason: b.reason, previousStatus: ship.status, releasedBy: ship.released_by, releasedAt: ship.released_at } });
  })();
  res.json(loadDetail(id));
}));
router.post('/:id/cancel', requireRole('manager'), wrap((req, res) => {
  const id = Number(req.params.id); const ship = getShipment(id);
  const b = z.object({ pin: z.string().max(20), reason: z.string().min(5).max(1000) }).parse(req.body);
  if (['shipped', 'delivered', 'cancelled'].includes(ship.status)) throw new HttpError(409, `Cannot cancel a ${ship.status} shipment`);
  verifyPinOnline(req.user!, b.pin);
  db.transaction(() => {
    db.prepare(`UPDATE shipments SET status='cancelled',updated_at=? WHERE id=?`).run(nowIso(), id);
    audit({ actor: actorOf(req.user!), action: 'shipment.cancel', entity: 'shipment', entityId: id, shipmentId: id, detail: { reason: b.reason } });
  })();
  res.json(loadDetail(id));
}));
