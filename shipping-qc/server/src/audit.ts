import crypto from 'node:crypto';
import { db, nowIso } from './db.js';

export interface Actor { id: number; name: string }

const GENESIS = '0'.repeat(64);

function chainHash(prev: string, p: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(prev + JSON.stringify(p)).digest('hex');
}

const lastHash = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
const insert = db.prepare(`INSERT INTO audit_log
  (at,event_at,user_id,user_name,action,entity,entity_id,shipment_id,detail,offline,prev_hash,hash)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

export interface AuditInput {
  actor: Actor | null;
  action: string;
  entity: string;
  entityId?: number | null;
  shipmentId?: number | null;
  detail?: unknown;
  eventAt?: string | null;
  offline?: boolean;
}

/** Writes one tamper-evident audit record. Call inside the same transaction as the change it records. */
export function audit(a: AuditInput): void {
  const prev = (lastHash.get() as { hash: string } | undefined)?.hash ?? GENESIS;
  const at = nowIso();
  const detail = JSON.stringify(a.detail ?? {});
  const payload = {
    at, event_at: a.eventAt ?? at, user_id: a.actor?.id ?? null, user_name: a.actor?.name ?? 'system',
    action: a.action, entity: a.entity, entity_id: a.entityId ?? null,
    shipment_id: a.shipmentId ?? null, detail, offline: a.offline ? 1 : 0,
  };
  const hash = chainHash(prev, payload);
  insert.run(payload.at, payload.event_at, payload.user_id, payload.user_name, payload.action, payload.entity,
    payload.entity_id, payload.shipment_id, payload.detail, payload.offline, prev, hash);
}

/** Recomputes the whole chain. Returns the first broken record id, or null if intact. */
export function verifyChain(): { ok: boolean; count: number; brokenAt: number | null } {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id').all() as any[];
  let prev = GENESIS;
  for (const r of rows) {
    const payload = {
      at: r.at, event_at: r.event_at, user_id: r.user_id, user_name: r.user_name, action: r.action,
      entity: r.entity, entity_id: r.entity_id, shipment_id: r.shipment_id, detail: r.detail, offline: r.offline,
    };
    if (r.prev_hash !== prev || chainHash(prev, payload) !== r.hash) return { ok: false, count: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
