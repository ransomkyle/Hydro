import { db } from './db.js';

export interface Blocker { type: string; message: string; itemId?: number; flagId?: number }

/** Everything that stands between this shipment and release. Soft gate: a manager may override with a recorded reason. */
export function readiness(shipmentId: number): { ready: boolean; blockers: Blocker[]; progress: { done: number; total: number } } {
  const items = db.prepare('SELECT * FROM checklist_items WHERE shipment_id=? ORDER BY seq').all(shipmentId) as any[];
  const blockers: Blocker[] = [];
  // A failed item stays FAIL in the record, but once QC has resolved its flag with a disposition (rework, use-as-is...) it no longer blocks release.
  const closed = new Set((db.prepare(`SELECT item_id FROM flags WHERE shipment_id=? AND status='resolved' AND item_id IS NOT NULL`).all(shipmentId) as any[]).map(r => r.item_id));
  let done = 0;
  for (const i of items) {
    const label = `${i.section}: ${i.text}`;
    const complete = i.status !== 'pending';
    if (complete) done++;
    if (i.status === 'pending' && i.required) blockers.push({ type: 'pending', message: `Not signed off — ${label}`, itemId: i.id });
    if (i.status === 'fail' && !closed.has(i.id)) blockers.push({ type: 'failed', message: `Failed — ${label}`, itemId: i.id });
    if (i.status === 'pass' && i.needs_verification && !i.verified_by) blockers.push({ type: 'unverified', message: `Needs second-person verification — ${label}`, itemId: i.id });
  }
  const flags = db.prepare(`SELECT id,description,severity FROM flags WHERE shipment_id=? AND status='open'`).all(shipmentId) as any[];
  for (const f of flags) blockers.push({ type: 'flag', message: `Open ${f.severity} flag — ${f.description}`, flagId: f.id });
  return { ready: blockers.length === 0, blockers, progress: { done, total: items.length } };
}
