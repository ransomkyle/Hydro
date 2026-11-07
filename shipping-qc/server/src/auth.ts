import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { JWT_SECRET, TOKEN_TTL_HOURS } from './config.js';
import { db } from './db.js';
import { HttpError } from './util.js';

export type Role = 'operator' | 'inspector' | 'manager' | 'shipping' | 'admin' | 'auditor';
export interface User { id: number; username: string; name: string; role: Role; active: number; pin_salt: string | null; pin_key: string | null; email: string | null; token_version: number; must_change: number }

export const PBKDF2_ITER = 150_000;

export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compareSync(p, h);

export function derivePinKey(pin: string, saltHex: string): string {
  return crypto.pbkdf2Sync(pin, Buffer.from(saltHex, 'hex'), PBKDF2_ITER, 32, 'sha256').toString('hex');
}
/** What the browser receives so it can validate a PIN offline without ever learning the signing key. */
export const pinVerifier = (keyHex: string) => crypto.createHash('sha256').update(Buffer.from(keyHex, 'hex')).digest('hex');

export function setPin(userId: number, pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, 'PIN must be 4–8 digits');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET pin_salt=?, pin_key=? WHERE id=?').run(salt, derivePinKey(pin, salt), userId);
}

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// Brute-force protection for login and PIN checks. Stored in SQLite so a restart does not reset it.
const LOCK_AFTER = 5, LOCK_MS = 5 * 60_000;
export function throttle(key: string) {
  const f = db.prepare('SELECT locked_until FROM throttle WHERE key=?').get(key) as { locked_until: number } | undefined;
  if (f && f.locked_until > Date.now()) throw new HttpError(429, 'Too many failed attempts. Wait a few minutes and try again.');
}
export function recordFail(key: string) {
  const f = db.prepare('SELECT n FROM throttle WHERE key=?').get(key) as { n: number } | undefined;
  const n = (f?.n ?? 0) + 1;
  if (n >= LOCK_AFTER) db.prepare('INSERT INTO throttle(key,n,locked_until) VALUES (?,0,?) ON CONFLICT(key) DO UPDATE SET n=0, locked_until=excluded.locked_until').run(key, Date.now() + LOCK_MS);
  else db.prepare('INSERT INTO throttle(key,n,locked_until) VALUES (?,?,0) ON CONFLICT(key) DO UPDATE SET n=excluded.n').run(key, n);
}
export const clearFails = (key: string) => { db.prepare('DELETE FROM throttle WHERE key=?').run(key); };

const COMMON = new Set(['password', 'password1', 'password123', 'changeme123', 'admin1234', 'qwerty123', '1234567890', 'letmein123', 'welcome123']);
/** Minimum bar for passwords: length 10, not trivially common, not the username. */
export function assertStrongPassword(pw: string, username?: string) {
  if (pw.length < 10) throw new HttpError(400, 'Password must be at least 10 characters');
  if (COMMON.has(pw.toLowerCase()) || (username && pw.toLowerCase().includes(username.toLowerCase()))) throw new HttpError(400, 'Choose a less guessable password (not common, not containing the username)');
  if (/^(.)\1+$/.test(pw)) throw new HttpError(400, 'Choose a less guessable password');
}

export function verifyPinOnline(user: User, pin: unknown): void {
  const key = `pin:${user.id}`;
  throttle(key);
  if (typeof pin !== 'string' || !user.pin_salt || !user.pin_key) {
    throw new HttpError(403, user.pin_key ? 'PIN required to sign' : 'No PIN set for this account. Set a PIN first.');
  }
  if (!safeEq(derivePinKey(pin, user.pin_salt), user.pin_key)) { recordFail(key); throw new HttpError(403, 'Incorrect PIN'); }
  clearFails(key);
}

/**
 * Verifies an offline sign-off. The device computed HMAC-SHA256(PBKDF2(pin,salt), canonical payload);
 * only someone who knew the PIN at signing time can produce it, and the server never saw the PIN.
 */
export function verifyOfflineProof(user: User, canonical: string, proof: unknown): void {
  const key = `pin:${user.id}`;
  throttle(key);
  if (typeof proof !== 'string' || !user.pin_key) throw new HttpError(403, 'Offline signature missing or no PIN on file');
  const expect = crypto.createHmac('sha256', Buffer.from(user.pin_key, 'hex')).update(canonical).digest('hex');
  if (!safeEq(expect, proof)) { recordFail(key); throw new HttpError(403, 'Offline signature did not verify (wrong PIN?)'); }
  clearFails(key);
}

export function signToken(u: User): string {
  return jwt.sign({ sub: u.id, role: u.role, tv: u.token_version }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_HOURS}h` });
}

const userById = db.prepare('SELECT id,username,name,role,active,pin_salt,pin_key,email,token_version,must_change FROM users WHERE id=?');
export const getUser = (id: number) => userById.get(id) as User | undefined;

declare module 'express-serve-static-core' { interface Request { user?: User } }

/** Routes a user may call while they still must change their initial password. */
const ALLOWED_WHEN_MUST_CHANGE = new Set(['/auth/me', '/auth/password', '/auth/pin', '/health']);

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Not signed in'));
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET) as unknown as { sub: number; tv?: number };
    const u = getUser(p.sub);
    if (!u || !u.active) throw new Error('inactive');
    if ((p.tv ?? 0) !== u.token_version) throw new Error('revoked');   // password changed / account reset: old sessions die
    req.user = u;
  } catch { return next(new HttpError(401, 'Session expired — please sign in again')); }
  const path = (req.baseUrl + req.path).replace(/^\/api/, '');
  if (req.user!.must_change && !ALLOWED_WHEN_MUST_CHANGE.has(path)) return next(new HttpError(403, 'You must change your temporary password and set a PIN first'));
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Your role is not permitted to do this'));
  next();
};

/** Who may sign an item, by the item's signer_role. Auditors are read-only. */
export function canSignRole(role: Role, signerRole: string): boolean {
  if (role === 'auditor') return false;
  if (signerRole === 'manager') return role === 'manager';
  if (signerRole === 'inspector') return role === 'inspector' || role === 'manager';
  return true;
}
