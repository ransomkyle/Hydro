import { NOTIFY_WEBHOOK_URL } from './config.js';
import { db, nowIso } from './db.js';

export interface NotifyInput { kind: string; title: string; body?: string; shipmentId?: number | null; roles: string[]; excludeUserId?: number }

/** In-app notification for everyone holding one of the roles; optionally POSTs JSON to a webhook (Teams/Slack/email gateway). */
export function notifyRoles(n: NotifyInput): void {
  const users = db.prepare(`SELECT id FROM users WHERE active=1 AND role IN (${n.roles.map(() => '?').join(',')})`).all(...n.roles) as { id: number }[];
  const ins = db.prepare('INSERT INTO notifications(user_id,shipment_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?)');
  for (const u of users) if (u.id !== n.excludeUserId) ins.run(u.id, n.shipmentId ?? null, n.kind, n.title, n.body ?? null, nowIso());
  if (NOTIFY_WEBHOOK_URL) {
    fetch(NOTIFY_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `${n.title}${n.body ? ' — ' + n.body : ''}`, kind: n.kind, shipmentId: n.shipmentId ?? null }),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.warn('webhook failed:', e.message));
  }
}
