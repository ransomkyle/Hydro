import nodemailer from 'nodemailer';
import { APP_URL, NOTIFY_WEBHOOK_URL, SMTP_FROM, SMTP_URL } from './config.js';
import { db, nowIso } from './db.js';

/** Email is optional: set SMTP_URL (smtps://user:pass@host). SMTP_URL=json captures messages in `sentEmails` (used by tests). */
export const sentEmails: { to: string; subject: string; text: string; attachment?: string; size?: number }[] = [];
const transport = SMTP_URL ? (SMTP_URL === 'json' ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(SMTP_URL)) : null;
function email(to: string[], subject: string, text: string) {
  if (!transport || !to.length) return;
  for (const addr of to) {
    transport.sendMail({ from: SMTP_FROM, to: addr, subject: `[DAD Shipping QC] ${subject.replace(/[\r\n]+/g, ' ').slice(0, 200)}`, text }).then(() => { if (SMTP_URL === 'json') sentEmails.push({ to: addr, subject, text }); })
      .catch(e => console.warn('email failed:', e.message));
  }
}
export const emailConfigured = () => !!transport;
/** Send one email with a file attached (used to send the quality release package). Resolves when accepted by the SMTP server. */
export async function sendWithAttachment(to: string[], subject: string, text: string, attachment: { filename: string; content: Buffer; contentType: string }, cc?: string): Promise<void> {
  if (!transport) throw new Error('Email is not configured on this server (set SMTP_URL)');
  const info = await transport.sendMail({ from: SMTP_FROM, to, cc, subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200), text, attachments: [attachment] });
  if (SMTP_URL === 'json') sentEmails.push({ to: to.join(','), subject, text, attachment: attachment.filename, size: attachment.content.length } as any);
  void info;
}
const link = (shipmentId?: number | null) => (APP_URL && shipmentId ? `\n\n${APP_URL.replace(/\/$/, '')}/shipments/${shipmentId}` : '');

export interface NotifyInput { kind: string; title: string; body?: string; shipmentId?: number | null; roles: string[]; excludeUserId?: number }

/** In-app notification for everyone holding one of the roles; optionally POSTs JSON to a webhook (Teams/Slack/email gateway). */
export function notifyRoles(n: NotifyInput): void {
  const users = db.prepare(`SELECT id FROM users WHERE active=1 AND role IN (${n.roles.map(() => '?').join(',')})`).all(...n.roles) as { id: number }[];
  const ins = db.prepare('INSERT INTO notifications(user_id,shipment_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?)');
  for (const u of users) if (u.id !== n.excludeUserId) ins.run(u.id, n.shipmentId ?? null, n.kind, n.title, n.body ?? null, nowIso());
  const addrs = (db.prepare(`SELECT email FROM users WHERE active=1 AND email IS NOT NULL AND email!='' AND role IN (${n.roles.map(() => '?').join(',')}) AND id!=?`).all(...n.roles, n.excludeUserId ?? -1) as { email: string }[]).map(r => r.email);
  email(addrs, n.title, `${n.title}${n.body ? '\n' + n.body : ''}${link(n.shipmentId)}`);
  if (NOTIFY_WEBHOOK_URL) {
    fetch(NOTIFY_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `[DAD Shipping QC] ${n.title}${n.body ? ' — ' + n.body : ''}`, kind: n.kind, shipmentId: n.shipmentId ?? null }),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.warn('webhook failed:', e.message));
  }
}

/** Notify one specific person (in-app + email). */
export function notifyUser(userId: number, n: { kind: string; title: string; body?: string; shipmentId?: number | null }): void {
  db.prepare('INSERT INTO notifications(user_id,shipment_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?)').run(userId, n.shipmentId ?? null, n.kind, n.title, n.body ?? null, nowIso());
  const u = db.prepare("SELECT email FROM users WHERE id=? AND active=1 AND email IS NOT NULL AND email!=''").get(userId) as { email: string } | undefined;
  if (u) email([u.email], n.title, `${n.title}${n.body ? '\n' + n.body : ''}${link(n.shipmentId)}`);
}
