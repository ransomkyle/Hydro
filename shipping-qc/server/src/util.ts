import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { MAX_OFFLINE_AGE_DAYS } from './config.js';
import { db, nowIso } from './db.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: unknown) { super(message); }
}

export const wrap = (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) => { try { const r = fn(req, res); if (r instanceof Promise) r.catch(next); } catch (e) { next(e); } };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, ...(err.extra ? { detail: err.extra } : {}) });
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: 'Invalid input: ' + err.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ') });
  }
  if ((err as any)?.code === 'LIMIT_FILE_SIZE') return void res.status(413).json({ error: 'File too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Effective time for an action. Online actions use server time. Offline actions replay later with the
 * device's original time; we accept it only if plausible and always record both times.
 */
export function effectiveTime(offline: boolean | undefined, clientAt: string | undefined): string {
  const now = Date.now();
  if (!offline || !clientAt) return new Date(now).toISOString();
  const t = Date.parse(clientAt);
  if (Number.isNaN(t)) throw new HttpError(400, 'Invalid offline timestamp');
  if (t > now + 5 * 60_000) throw new HttpError(400, 'Device clock is ahead of the server — check the device time');
  if (t < now - MAX_OFFLINE_AGE_DAYS * 86_400_000) throw new HttpError(400, `Offline entry is older than ${MAX_OFFLINE_AGE_DAYS} days and was rejected`);
  return new Date(t).toISOString();
}

/** Returns true if this op id was already applied (and registers it otherwise). */
export function alreadyProcessed(opId: string | undefined, userId: number): boolean {
  if (!opId) return false;
  const r = db.prepare('INSERT OR IGNORE INTO processed_ops(op_id,user_id,received_at) VALUES (?,?,?)').run(opId, userId, nowIso());
  return r.changes === 0;
}

export const csvEscape = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))].join('\r\n');
};
