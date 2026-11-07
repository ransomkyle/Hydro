import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { authenticate, requireRole, verifyPinOnline } from '../auth.js';
import { db, nowIso } from '../db.js';
import { notifyRoles, notifyUser } from '../notify.js';
import { HttpError, wrap } from '../util.js';

export const router = Router();
router.use(authenticate);

const qc = requireRole('inspector', 'manager');
const str = (n = 3000) => z.string().max(n).optional().nullable();
const Fields = z.object({
  title: z.string().min(3).max(200), description: str(), containment: str(), root_cause: str(), corrective_action: str(), preventive_action: str(),
  owner_id: z.number().int().optional().nullable(), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['open', 'in_progress']).optional(),
});

function nextNo(): string {
  const yy = String(new Date().getFullYear()).slice(2);
  const last = db.prepare('SELECT capa_no FROM capas WHERE capa_no LIKE ? ORDER BY capa_no DESC LIMIT 1').get(`CAPA-${yy}-%`) as any;
  return `CAPA-${yy}-${String(last ? Number(last.capa_no.split('-')[2]) + 1 : 1).padStart(3, '0')}`;
}

const SELECT = `SELECT c.*, s.shipment_no, s.customer, o.name AS owner_name, u.name AS opened_by_name, cl.name AS closed_by_name,
  f.description AS flag_description FROM capas c LEFT JOIN shipments s ON s.id=c.shipment_id LEFT JOIN users o ON o.id=c.owner_id
  JOIN users u ON u.id=c.opened_by LEFT JOIN users cl ON cl.id=c.closed_by LEFT JOIN flags f ON f.id=c.flag_id`;

router.get('/', wrap((req, res) => {
  const where: string[] = []; const args: any[] = [];
  if (req.query.status === 'open') where.push("c.status != 'closed'"); else if (req.query.status) { where.push('c.status=?'); args.push(String(req.query.status)); }
  if (req.query.shipment) { where.push('c.shipment_id=?'); args.push(Number(req.query.shipment)); }
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC`).all(...args) as any[];
  res.json(rows.map(c => ({ ...c, overdue: c.status !== 'closed' && !!c.due_date && c.due_date < today })));
}));
router.get('/:id', wrap((req, res) => {
  const c = db.prepare(`${SELECT} WHERE c.id=?`).get(Number(req.params.id));
  if (!c) throw new HttpError(404, 'CAPA not found');
  res.json(c);
}));

router.post('/', qc, wrap((req, res) => {
  const b = Fields.extend({ shipment_id: z.number().int().optional().nullable(), flag_id: z.number().int().optional().nullable() }).parse(req.body);
  let shipmentId = b.shipment_id ?? null;
  if (b.flag_id) {
    const f = db.prepare('SELECT shipment_id FROM flags WHERE id=?').get(b.flag_id) as any;
    if (!f) throw new HttpError(400, 'Flag not found');
    shipmentId = f.shipment_id;
    if (db.prepare('SELECT 1 FROM capas WHERE flag_id=?').get(b.flag_id)) throw new HttpError(409, 'A CAPA already exists for this flag');
  }
  const id = db.transaction(() => {
    const no = nextNo();
    const r = db.prepare(`INSERT INTO capas(capa_no,shipment_id,flag_id,title,description,containment,root_cause,corrective_action,preventive_action,owner_id,due_date,status,opened_by,opened_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(no, shipmentId, b.flag_id ?? null, b.title, b.description ?? null, b.containment ?? null, b.root_cause ?? null, b.corrective_action ?? null, b.preventive_action ?? null,
      b.owner_id ?? null, b.due_date ?? null, b.status ?? 'open', req.user!.id, nowIso());
    const id = Number(r.lastInsertRowid);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'capa.open', entity: 'capa', entityId: id, shipmentId, detail: { capa_no: no, title: b.title, flag_id: b.flag_id ?? null, owner_id: b.owner_id ?? null, due_date: b.due_date ?? null } });
    notifyRoles({ kind: 'capa', title: `${no} opened: ${b.title}`, body: `by ${req.user!.name}`, shipmentId, roles: ['manager'], excludeUserId: req.user!.id });
    if (b.owner_id && b.owner_id !== req.user!.id) notifyUser(b.owner_id, { kind: 'capa', title: `You own ${no}: ${b.title}`, body: b.due_date ? `Due ${b.due_date}` : undefined, shipmentId });
    return id;
  })();
  res.status(201).json({ id });
}));

router.patch('/:id', qc, wrap((req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM capas WHERE id=?').get(id) as any;
  if (!c) throw new HttpError(404, 'CAPA not found');
  if (c.status === 'closed') throw new HttpError(409, 'CAPA is closed');
  const b = Fields.partial().strict().parse(req.body) as Record<string, any>;
  const sets: string[] = [], args: any[] = [], changes: Record<string, any> = {};
  for (const [k, v] of Object.entries(b)) if ((v ?? null) !== c[k]) { sets.push(`${k}=?`); args.push(v ?? null); changes[k] = { from: c[k], to: v ?? null }; }
  if (sets.length) db.transaction(() => {
    db.prepare(`UPDATE capas SET ${sets.join(',')} WHERE id=?`).run(...args, id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'capa.update', entity: 'capa', entityId: id, shipmentId: c.shipment_id, detail: changes });
    if (changes.owner_id?.to && changes.owner_id.to !== req.user!.id) notifyUser(changes.owner_id.to, { kind: 'capa', title: `You now own ${c.capa_no}: ${c.title}`, shipmentId: c.shipment_id });
  })();
  res.json({ ok: true });
}));

/** Closing is a QC manager sign-off and requires the substance of a CAPA to actually be filled in. */
router.post('/:id/close', requireRole('manager'), wrap((req, res) => {
  const id = Number(req.params.id);
  const b = z.object({ pin: z.string().max(20), effectiveness_check: z.string().min(5).max(3000) }).parse(req.body);
  const c = db.prepare('SELECT * FROM capas WHERE id=?').get(id) as any;
  if (!c) throw new HttpError(404, 'CAPA not found');
  if (c.status === 'closed') throw new HttpError(409, 'Already closed');
  const missing = (['root_cause', 'corrective_action'] as const).filter(k => !String(c[k] ?? '').trim());
  if (missing.length) throw new HttpError(409, `Cannot close: fill in ${missing.map(m => m.replace('_', ' ')).join(' and ')} first`);
  verifyPinOnline(req.user!, b.pin);
  db.transaction(() => {
    db.prepare(`UPDATE capas SET status='closed', effectiveness_check=?, closed_by=?, closed_at=? WHERE id=?`).run(b.effectiveness_check, req.user!.id, nowIso(), id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'capa.close', entity: 'capa', entityId: id, shipmentId: c.shipment_id, detail: { capa_no: c.capa_no, effectiveness_check: b.effectiveness_check } });
  })();
  res.json({ ok: true });
}));
