import { Router } from 'express';
import { authenticate, requireRole } from '../auth.js';
import { ON_TIME_GRACE_MIN } from '../config.js';
import { db } from '../db.js';
import { wrap } from '../util.js';

export const router = Router();
router.use(authenticate);

const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);

/** Management KPIs for the QC meeting. All figures are computed from the signed records — nothing is entered by hand. */
router.get('/reports/summary', requireRole('manager', 'admin', 'auditor', 'inspector'), wrap((req, res) => {
  const to = String(req.query.to ?? new Date().toISOString().slice(0, 10));
  const from = String(req.query.from ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const plant = req.query.plant ? String(req.query.plant) : null;
  const a: any[] = [from, to + 'T23:59:59.999Z']; let pw = '';
  if (plant) { pw = ' AND s.plant = ?'; a.push(plant); }
  const base = `FROM shipments s WHERE s.created_at >= ? AND s.created_at <= ?${pw}`;
  const one = (sql: string, ...extra: any[]) => db.prepare(sql).get(...a, ...extra) as any;
  const all = (sql: string, ...extra: any[]) => db.prepare(sql).all(...a, ...extra) as any[];

  const status = all(`SELECT s.status, COUNT(*) n ${base} GROUP BY s.status`);
  const total = status.reduce((t, r) => t + r.n, 0);

  // Pickup performance: first departed/picked_up event vs appointment (+grace)
  const pickups = all(`SELECT s.pickup_appt appt, (SELECT MIN(e.at) FROM events e WHERE e.shipment_id=s.id AND e.type IN ('departed','picked_up')) AS left_at ${base} AND s.pickup_appt IS NOT NULL AND s.pickup_appt != ''`)
    .filter(r => r.left_at);
  const onTime = pickups.filter(r => Date.parse(r.left_at) <= Date.parse(r.appt) + ON_TIME_GRACE_MIN * 60_000).length;

  // Release lead time & first-pass yield (released with no failed item and no flag of any kind)
  const released = all(`SELECT s.id, s.created_at, s.released_at, s.release_override_reason ${base} AND s.released_at IS NOT NULL`);
  const hours = released.map(r => (Date.parse(r.released_at) - Date.parse(r.created_at)) / 3_600_000).sort((x, y) => x - y);
  const clean = released.filter(r => !db.prepare("SELECT 1 FROM checklist_items WHERE shipment_id=? AND status='fail' UNION SELECT 1 FROM flags WHERE shipment_id=? AND auto=1 AND item_id IS NOT NULL").get(r.id, r.id)).length;

  const items = one(`SELECT COUNT(*) total, SUM(CASE WHEN c.status='fail' THEN 1 ELSE 0 END) failed, SUM(CASE WHEN c.status!='pending' THEN 1 ELSE 0 END) done
    FROM checklist_items c JOIN shipments s ON s.id=c.shipment_id WHERE s.created_at >= ? AND s.created_at <= ?${pw}`);
  const bySection = all(`SELECT c.section, COUNT(*) n FROM flags f JOIN checklist_items c ON c.id=f.item_id JOIN shipments s ON s.id=f.shipment_id WHERE f.raised_at >= ? AND f.raised_at <= ?${pw} GROUP BY c.section ORDER BY n DESC LIMIT 8`);
  const sev = all(`SELECT f.severity, COUNT(*) n FROM flags f JOIN shipments s ON s.id=f.shipment_id WHERE f.raised_at >= ? AND f.raised_at <= ?${pw} GROUP BY f.severity`);
  const openFlags = all(`SELECT f.severity, f.raised_at FROM flags f JOIN shipments s ON s.id=f.shipment_id WHERE f.status='open' AND f.raised_at >= ? AND f.raised_at <= ?${pw}`);
  const monthly = all(`SELECT substr(s.released_at,1,7) m, COUNT(*) n ${base} AND s.released_at IS NOT NULL GROUP BY m ORDER BY m`);
  const signers = all(`SELECT u.name, COUNT(*) n FROM checklist_items c JOIN users u ON u.id=c.done_by JOIN shipments s ON s.id=c.shipment_id WHERE c.done_at >= ? AND c.done_at <= ?${pw} GROUP BY u.name ORDER BY n DESC LIMIT 10`);
  const capa = db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN due_date < date('now') THEN 1 ELSE 0 END) overdue FROM capas WHERE status != 'closed'").get() as any;
  const gauges = db.prepare("SELECT SUM(CASE WHEN cal_due < date('now') THEN 1 ELSE 0 END) overdue, SUM(CASE WHEN cal_due >= date('now') AND cal_due <= date('now','+30 day') THEN 1 ELSE 0 END) due_soon FROM gauges WHERE status='active'").get() as any;

  res.json({
    range: { from, to, plant }, totals: { shipments: total, byStatus: status },
    pickups: { measured: pickups.length, onTime, onTimePct: pct(onTime, pickups.length), graceMin: ON_TIME_GRACE_MIN },
    release: { count: released.length, medianHours: hours.length ? Math.round(10 * hours[Math.floor(hours.length / 2)]) / 10 : null, withOverride: released.filter(r => r.release_override_reason).length,
      firstPassPct: pct(clean, released.length) },
    items: { total: items.total ?? 0, done: items.done ?? 0, failed: items.failed ?? 0, failRatePer100: pct(items.failed ?? 0, items.total ?? 0) },
    flags: { bySeverity: sev, bySection: bySection, open: openFlags.length, openOver7d: openFlags.filter(f => Date.now() - Date.parse(f.raised_at) > 7 * 86_400_000).length },
    departedUnreleased: (one(`SELECT COUNT(*) n FROM flags f JOIN shipments s ON s.id=f.shipment_id WHERE f.description LIKE 'Shipment left the dock WITHOUT%' AND f.raised_at >= ? AND f.raised_at <= ?${pw}`) as any).n,
    monthlyReleased: monthly, topSigners: signers,
    capa: { open: capa.n ?? 0, overdue: capa.overdue ?? 0 }, gauges: { overdue: gauges.overdue ?? 0, dueSoon: gauges.due_soon ?? 0 },
  });
}));
