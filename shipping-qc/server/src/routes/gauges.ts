import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { authenticate, requireRole } from '../auth.js';
import { db, nowIso } from '../db.js';
import { HttpError, wrap } from '../util.js';

export const router = Router();
router.use(authenticate);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Body = z.object({
  gauge_no: z.string().min(1).max(40), description: z.string().min(2).max(200), plant: z.string().max(60).optional().nullable(),
  cal_date: date.optional().nullable(), cal_due: date, cal_cert: z.string().max(200).optional().nullable(),
  status: z.enum(['active', 'out_of_service', 'retired']).default('active'),
});

/** Everyone signed in can read the register (the sign-off dialog needs it, and it is cached for offline use). */
router.get('/', wrap((_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare("SELECT * FROM gauges ORDER BY status='active' DESC, cal_due").all() as any[];
  res.json(rows.map(g => ({ ...g, overdue: g.status === 'active' && g.cal_due < today, due_soon: g.status === 'active' && g.cal_due >= today && g.cal_due <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) })));
}));

router.post('/', requireRole('manager', 'admin', 'inspector'), wrap((req, res) => {
  const b = Body.parse(req.body);
  if (db.prepare('SELECT 1 FROM gauges WHERE gauge_no=?').get(b.gauge_no)) throw new HttpError(409, 'Gauge number already exists');
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO gauges(gauge_no,description,plant,cal_date,cal_due,cal_cert,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.gauge_no, b.description, b.plant ?? null, b.cal_date ?? null, b.cal_due, b.cal_cert ?? null, b.status, nowIso());
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'gauge.create', entity: 'gauge', entityId: Number(r.lastInsertRowid), detail: b });
    return Number(r.lastInsertRowid);
  })();
  res.status(201).json({ id });
}));

router.put('/:id', requireRole('manager', 'admin', 'inspector'), wrap((req, res) => {
  const id = Number(req.params.id);
  const before = db.prepare('SELECT * FROM gauges WHERE id=?').get(id) as any;
  if (!before) throw new HttpError(404, 'Gauge not found');
  const b = Body.parse(req.body);
  db.transaction(() => {
    db.prepare('UPDATE gauges SET gauge_no=?,description=?,plant=?,cal_date=?,cal_due=?,cal_cert=?,status=? WHERE id=?')
      .run(b.gauge_no, b.description, b.plant ?? null, b.cal_date ?? null, b.cal_due, b.cal_cert ?? null, b.status, id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'gauge.update', entity: 'gauge', entityId: id, detail: { before, after: b } });
  })();
  res.json({ ok: true });
}));
