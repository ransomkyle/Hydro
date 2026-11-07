import { Router } from 'express';
import { z } from 'zod';
import { audit, verifyChain } from '../audit.js';
import { authenticate, requireRole } from '../auth.js';
import { db, nowIso } from '../db.js';
import { readiness } from '../readiness.js';
import { HttpError, toCsv, wrap } from '../util.js';
import { buildLabel, buildPackage } from '../pdf.js';

export const router = Router();
router.use(authenticate);

router.get('/dashboard', wrap((req, res) => {
  const counts = db.prepare(`SELECT status, COUNT(*) n FROM shipments GROUP BY status`).all() as any[];
  const active = db.prepare(`SELECT id,shipment_no,customer,job_no,status,pickup_appt FROM shipments WHERE status IN ('draft','in_progress')`).all() as any[];
  const readyForRelease = active.filter(s => s.status === 'in_progress' && readiness(s.id).ready).map(s => ({ ...s }));
  const openFlags = db.prepare(`SELECT f.id,f.shipment_id,f.severity,f.description,f.raised_at,s.shipment_no,s.customer FROM flags f JOIN shipments s ON s.id=f.shipment_id WHERE f.status='open' ORDER BY f.severity='critical' DESC, f.id DESC LIMIT 20`).all();
  const upcoming = db.prepare(`SELECT id,shipment_no,customer,status,pickup_appt FROM shipments WHERE pickup_appt IS NOT NULL AND pickup_appt!='' AND status IN ('draft','in_progress','released') ORDER BY pickup_appt LIMIT 15`).all();
  const recent = db.prepare(`SELECT a.id,a.at,a.user_name,a.action,a.shipment_id,s.shipment_no FROM audit_log a LEFT JOIN shipments s ON s.id=a.shipment_id WHERE a.action NOT LIKE 'auth.%' ORDER BY a.id DESC LIMIT 15`).all();
  const unread = (db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user!.id) as any).n;
  res.json({ counts, readyForRelease, openFlags, upcoming, recent, unread });
}));

// ---- notifications
router.get('/notifications', wrap((req, res) => {
  res.json(db.prepare(`SELECT n.*, s.shipment_no FROM notifications n LEFT JOIN shipments s ON s.id=n.shipment_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100`).all(req.user!.id));
}));
router.get('/notifications/unread-count', wrap((req, res) => {
  res.json({ n: (db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user!.id) as any).n });
}));
router.post('/notifications/read', wrap((req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()).optional() }).parse(req.body ?? {});
  if (ids?.length) db.prepare(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).run(nowIso(), req.user!.id, ...ids);
  else db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(nowIso(), req.user!.id);
  res.json({ ok: true });
}));

// ---- audit log (QC staff, admin, auditor)
const auditViewers = requireRole('manager', 'admin', 'auditor', 'inspector');
function auditQuery(q: any) {
  const where: string[] = []; const args: any[] = [];
  if (q.shipment) { where.push('a.shipment_id = ?'); args.push(Number(q.shipment)); }
  if (q.user) { where.push('a.user_name LIKE ?'); args.push(`%${q.user}%`); }
  if (q.action) { where.push('a.action LIKE ?'); args.push(`${q.action}%`); }
  if (q.from) { where.push('a.at >= ?'); args.push(String(q.from)); }
  if (q.to) { where.push('a.at <= ?'); args.push(String(q.to) + 'T23:59:59.999Z'); }
  if (q.offline === '1') where.push('a.offline = 1');
  const sql = `SELECT a.id,a.at,a.event_at,a.user_name,a.action,a.entity,a.entity_id,a.shipment_id,s.shipment_no,a.detail,a.offline,a.hash
    FROM audit_log a LEFT JOIN shipments s ON s.id=a.shipment_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC`;
  return { sql, args };
}
router.get('/audit', auditViewers, wrap((req, res) => {
  const { sql, args } = auditQuery(req.query);
  res.json(db.prepare(sql + ' LIMIT ? OFFSET ?').all(...args, Math.min(Number(req.query.limit ?? 200), 1000), Number(req.query.offset ?? 0)));
}));
router.get('/audit.csv', auditViewers, wrap((req, res) => {
  const { sql, args } = auditQuery(req.query);
  audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'export.audit', entity: 'audit_log', detail: req.query });
  sendCsv(res, 'audit-log', db.prepare(sql).all(...args) as any[]);
}));
router.get('/audit/verify', auditViewers, wrap((_req, res) => res.json(verifyChain())));

function sendCsv(res: any, name: string, rows: Record<string, unknown>[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + (rows.length ? toCsv(rows) : 'no rows'));
}

// ---- exports
const exporters = requireRole('manager', 'admin', 'auditor', 'inspector');
router.get('/export/shipments.csv', exporters, wrap((req, res) => {
  const where: string[] = []; const args: any[] = [];
  if (req.query.customer) { where.push('s.customer LIKE ?'); args.push(`%${req.query.customer}%`); }
  if (req.query.status) { where.push('s.status=?'); args.push(String(req.query.status)); }
  if (req.query.from) { where.push('s.created_at>=?'); args.push(String(req.query.from)); }
  if (req.query.to) { where.push('s.created_at<=?'); args.push(String(req.query.to) + 'T23:59:59.999Z'); }
  const rows = db.prepare(`SELECT s.shipment_no,s.job_no,s.customer,s.po_no,s.status,s.size_class,s.length_in,s.width_in,s.height_in,s.weight_lb,s.pieces,
    s.ship_to_name,s.carrier,s.truck_no,s.trailer_no,s.driver_name,s.bol_no,s.pro_no,s.seal_no,s.permit_no,
    s.created_at,u.name AS released_by,s.released_at,s.release_override_reason,
    (SELECT MIN(at) FROM events e WHERE e.shipment_id=s.id AND e.type='ready') AS ready_at,
    (SELECT MIN(at) FROM events e WHERE e.shipment_id=s.id AND e.type='loaded') AS loaded_at,
    (SELECT MIN(at) FROM events e WHERE e.shipment_id=s.id AND e.type IN ('picked_up','departed')) AS left_dock_at,
    (SELECT MIN(at) FROM events e WHERE e.shipment_id=s.id AND e.type='delivered') AS delivered_at,
    (SELECT COUNT(*) FROM checklist_items c WHERE c.shipment_id=s.id) AS items_total,
    (SELECT COUNT(*) FROM checklist_items c WHERE c.shipment_id=s.id AND c.status='fail') AS items_failed,
    (SELECT COUNT(*) FROM flags f WHERE f.shipment_id=s.id) AS flags_total,
    (SELECT COUNT(*) FROM flags f WHERE f.shipment_id=s.id AND f.status='open') AS flags_open
    FROM shipments s LEFT JOIN users u ON u.id=s.released_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC`).all(...args) as any[];
  sendCsv(res, 'shipments', rows);
}));
router.get('/export/materials.csv', exporters, wrap((req, res) => {
  const where = [`m.voided=0`]; const args: any[] = [];
  if (req.query.heat) { where.push('m.heat_lot LIKE ?'); args.push(`%${req.query.heat}%`); }
  const rows = db.prepare(`SELECT s.shipment_no,s.job_no,s.customer,m.category,m.name,m.grade,m.heat_lot,m.spec,m.qty,m.unit,u.name AS added_by,m.added_at,m.offline AS entered_offline
    FROM materials m JOIN shipments s ON s.id=m.shipment_id JOIN users u ON u.id=m.added_by WHERE ${where.join(' AND ')} ORDER BY m.added_at DESC`).all(...args) as any[];
  sendCsv(res, 'materials', rows);
}));
router.get('/export/signoffs.csv', exporters, wrap((_req, res) => {
  const rows = db.prepare(`SELECT s.shipment_no,s.customer,c.section,c.text AS item,c.status,c.value,c.note,u.name AS signed_by,c.done_at,c.done_received_at,c.done_offline AS recorded_offline,v.name AS verified_by,c.verified_at
    FROM checklist_items c JOIN shipments s ON s.id=c.shipment_id LEFT JOIN users u ON u.id=c.done_by LEFT JOIN users v ON v.id=c.verified_by WHERE c.status!='pending' ORDER BY c.done_at DESC`).all() as any[];
  sendCsv(res, 'signoffs', rows);
}));

// ---- PDF release package
router.get('/shipments/:id/package.pdf', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM shipments WHERE id=?').get(id)) throw new HttpError(404, 'Shipment not found');
  audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'export.package', entity: 'shipment', entityId: id, shipmentId: id, detail: {} });
  const ship = (db.prepare('SELECT shipment_no FROM shipments WHERE id=?').get(id) as any).shipment_no;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${ship}-quality-release.pdf"`);
  await buildPackage(id, res);
}));

router.get('/shipments/:id/label.pdf', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT shipment_no FROM shipments WHERE id=?').get(id) as any;
  if (!row) throw new HttpError(404, 'Shipment not found');
  audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'export.label', entity: 'shipment', entityId: id, shipmentId: id, detail: {} });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${row.shipment_no}-label.pdf"`);
  await buildLabel(id, res);
}));

/** Latest audit hash + entry count. Record it somewhere independent (print it, email it, store it off-box) to prove later that history was not rewritten. */
router.get('/audit/anchor', auditViewers, wrap((_req, res) => {
  const last = db.prepare('SELECT id,hash,at FROM audit_log ORDER BY id DESC LIMIT 1').get() as any;
  const v = verifyChain();
  res.json({ entries: v.count, chainIntact: v.ok, lastId: last?.id ?? 0, lastHash: last?.hash ?? null, lastAt: last?.at ?? null, generatedAt: new Date().toISOString() });
}));
