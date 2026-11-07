import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { authenticate, requireRole } from '../auth.js';
import { db, nowIso } from '../db.js';
import { HttpError, wrap } from '../util.js';

export const router = Router();
router.use(authenticate);

const Item = z.object({
  section: z.string().min(1).max(80), text: z.string().min(1).max(500), kind: z.enum(['check', 'value', 'photo', 'doc']).default('check'),
  unit: z.string().max(30).optional().nullable(), spec: z.string().max(500).optional().nullable(), reference: z.string().max(200).optional().nullable(),
  required: z.boolean().default(true), signer_role: z.enum(['any', 'inspector', 'manager']).default('any'), needs_verification: z.boolean().default(false),
});
const Body = z.object({
  name: z.string().min(2).max(120), description: z.string().max(500).optional().nullable(), customer: z.string().max(120).optional().nullable(),
  category: z.enum(['base', 'module', 'customer']).default('module'), items: z.array(Item).min(1).max(400),
});

router.get('/', wrap((req, res) => {
  const all = req.query.all === '1';
  res.json(db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM template_items i WHERE i.template_id=t.id) AS item_count FROM templates t ${all ? '' : 'WHERE t.active=1'} ORDER BY t.category='base' DESC, t.category='customer', t.name`).all());
}));
router.get('/:id', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(Number(req.params.id));
  if (!t) throw new HttpError(404, 'Template not found');
  res.json({ ...t, items: db.prepare('SELECT * FROM template_items WHERE template_id=? ORDER BY seq').all(Number(req.params.id)) });
}));

function writeItems(tid: number, items: z.infer<typeof Item>[]) {
  db.prepare('DELETE FROM template_items WHERE template_id=?').run(tid);
  const ins = db.prepare(`INSERT INTO template_items(template_id,seq,section,text,kind,unit,spec,reference,required,signer_role,needs_verification) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  items.forEach((i, n) => ins.run(tid, n + 1, i.section, i.text, i.kind, i.unit ?? null, i.spec ?? null, i.reference ?? null, i.required ? 1 : 0, i.signer_role, i.needs_verification ? 1 : 0));
}

router.post('/', requireRole('manager', 'admin'), wrap((req, res) => {
  const b = Body.parse(req.body);
  const id = db.transaction(() => {
    const now = nowIso();
    const r = db.prepare(`INSERT INTO templates(name,description,customer,category,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run(b.name, b.description ?? null, b.customer ?? null, b.category, req.user!.id, now, now);
    const tid = Number(r.lastInsertRowid);
    writeItems(tid, b.items);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'template.create', entity: 'template', entityId: tid, detail: { name: b.name, items: b.items.length } });
    return tid;
  })();
  res.status(201).json({ id });
}));

router.put('/:id', requireRole('manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(id) as any;
  if (!t) throw new HttpError(404, 'Template not found');
  const b = Body.parse(req.body);
  db.transaction(() => {
    db.prepare(`UPDATE templates SET name=?,description=?,customer=?,category=?,version=version+1,updated_at=? WHERE id=?`).run(b.name, b.description ?? null, b.customer ?? null, b.category, nowIso(), id);
    writeItems(id, b.items);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'template.update', entity: 'template', entityId: id, detail: { name: b.name, version: t.version + 1, items: b.items.length, note: 'Shipments already created keep their own copy of the checklist' } });
  })();
  res.json({ id });
}));

router.post('/:id/archive', requireRole('manager', 'admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const active = z.object({ active: z.boolean() }).parse(req.body).active ? 1 : 0;
  db.transaction(() => {
    db.prepare('UPDATE templates SET active=?, updated_at=? WHERE id=?').run(active, nowIso(), id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: active ? 'template.restore' : 'template.archive', entity: 'template', entityId: id, detail: {} });
  })();
  res.json({ ok: true });
}));
