import { useCallback, useEffect, useMemo, useState } from 'react';
import { get } from './api';
import { listOps, onOutboxChange, type Op } from './outbox';

export interface Detail { shipment: any; items: any[]; parts: any[]; materials: any[]; events: any[]; attachments: any[]; flags: any[]; readiness: { ready: boolean; blockers: any[]; progress: { done: number; total: number } } }

/** Server state + any not-yet-synced local actions layered on top, so the screen always shows what the user just did. */
export function useShipment(id: number) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ops, setOps] = useState<Op[]>([]);

  const reload = useCallback(async () => {
    try { const r = await get<Detail>(`/shipments/${id}`); setDetail(r.data); setStale(r.stale); setError(null); }
    catch (e: any) { setError(e.message); }
  }, [id]);
  const loadOps = useCallback(() => listOps().then(all => setOps(all.filter(o => o.shipmentId === id))), [id]);

  useEffect(() => { reload(); loadOps(); }, [reload, loadOps]);
  useEffect(() => onOutboxChange(() => { loadOps(); reload(); }), [loadOps, reload]);

  const view = useMemo<Detail | null>(() => {
    if (!detail) return null;
    const d: Detail = { ...detail, items: detail.items.map(i => ({ ...i })), materials: [...detail.materials], events: [...detail.events] };
    for (const op of ops) {
      if (op.status !== 'pending') continue;
      if (op.kind === 'sign' || op.kind === 'verify') {
        const it = d.items.find(i => i.id === op.itemId);
        if (!it) continue;
        if (op.kind === 'sign' && it.status === 'pending') Object.assign(it, { status: op.body.result, value: op.body.value ?? null, note: op.body.note ?? null, done_by_name: op.userName, done_at: op.clientAt, done_offline: 1, _pending: true });
        if (op.kind === 'verify') Object.assign(it, { verified_by: -1, verified_by_name: op.userName, verified_at: op.clientAt, _pendingVerify: true });
      } else if (op.kind === 'material') d.materials.push({ id: -Math.abs(hash(op.id)), ...op.body, added_by_name: op.userName, added_at: op.clientAt, offline: 1, _pending: true });
      else if (op.kind === 'event') d.events.push({ id: -Math.abs(hash(op.id)), ...op.body, at: op.clientAt, recorded_by_name: op.userName, offline: 1, _pending: true });
    }
    return d;
  }, [detail, ops]);

  const pendingFiles = ops.filter(o => o.kind === 'attachment' && o.status === 'pending');
  return { detail: view, reload, stale, error, setDetail, ops, pendingFiles };
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) || 1;
