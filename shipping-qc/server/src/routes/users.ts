import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { assertStrongPassword, authenticate, checkPassword, clearFails, hashPassword, pinVerifier, recordFail, requireRole, setPin, signToken, throttle, type User } from '../auth.js';
import { db, nowIso } from '../db.js';
import { HttpError, wrap } from '../util.js';

export const authRouter = Router();
export const usersRouter = Router();

const publicUser = (u: any) => ({ id: u.id, username: u.username, name: u.name, role: u.role, email: u.email ?? null, hasPin: !!u.pin_key, mustChange: !!u.must_change });
const offlineInfo = (u: any) => u.pin_key ? { pinSalt: u.pin_salt, pinVerifier: pinVerifier(u.pin_key) } : {};

authRouter.post('/login', wrap((req, res) => {
  const b = z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).parse(req.body);
  const key = `login:${b.username.toLowerCase()}`;
  throttle(key);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(b.username) as any;
  if (!u || !u.active || !checkPassword(b.password, u.password_hash)) {
    recordFail(key);
    audit({ actor: null, action: 'auth.login_failed', entity: 'user', detail: { username: b.username } });
    throw new HttpError(401, 'Incorrect username or password');
  }
  clearFails(key);
  audit({ actor: { id: u.id, name: u.name }, action: 'auth.login', entity: 'user', entityId: u.id, detail: {} });
  res.json({ token: signToken(u), user: publicUser(u), ...offlineInfo(u) });
}));

authRouter.get('/me', authenticate, wrap((req, res) => {
  const u = req.user as User;
  res.json({ user: publicUser(u), ...offlineInfo(u) });
}));

authRouter.post('/pin', authenticate, wrap((req, res) => {
  const b = z.object({ password: z.string().max(200), pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4–8 digits') }).parse(req.body);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as any;
  if (!checkPassword(b.password, u.password_hash)) throw new HttpError(403, 'Password incorrect');
  db.transaction(() => { setPin(u.id, b.pin); audit({ actor: { id: u.id, name: u.name }, action: 'auth.pin_set', entity: 'user', entityId: u.id, detail: {} }); })();
  const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(u.id) as any;
  res.json({ user: publicUser(fresh), ...offlineInfo(fresh) });
}));

authRouter.post('/password', authenticate, wrap((req, res) => {
  const b = z.object({ current: z.string().max(200), next: z.string().min(8).max(200) }).parse(req.body);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id) as any;
  if (!checkPassword(b.current, u.password_hash)) throw new HttpError(403, 'Current password incorrect');
  assertStrongPassword(b.next, u.username);
  if (checkPassword(b.next, u.password_hash)) throw new HttpError(400, 'New password must be different from the current one');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=?, must_change=0, token_version=token_version+1 WHERE id=?').run(hashPassword(b.next), u.id);
    audit({ actor: { id: u.id, name: u.name }, action: 'auth.password_change', entity: 'user', entityId: u.id, detail: {} });
  })();
  const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(u.id) as any;
  res.json({ ok: true, token: signToken(fresh), user: publicUser(fresh), ...offlineInfo(fresh) });   // other sessions are revoked; this one continues
}));

authRouter.post('/email', authenticate, wrap((req, res) => {
  const { email } = z.object({ email: z.string().email().max(200).or(z.literal('')) }).parse(req.body);
  db.transaction(() => {
    db.prepare('UPDATE users SET email=? WHERE id=?').run(email || null, req.user!.id);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'user.email_set', entity: 'user', entityId: req.user!.id, detail: { email: email || null } });
  })();
  res.json({ ok: true });
}));

// ---- admin: user management
usersRouter.use(authenticate);
usersRouter.get('/', requireRole('admin', 'manager', 'auditor', 'inspector', 'shipping', 'operator'), wrap((req, res) => {
  const full = ['admin', 'manager', 'auditor'].includes(req.user!.role);
  res.json(db.prepare(`SELECT id,username,name,role,active,created_at${full ? ',email,(pin_key IS NOT NULL) AS has_pin' : ''} FROM users WHERE active=1 OR ? ORDER BY name`).all(full ? 1 : 0));
}));
const Role = z.enum(['operator', 'inspector', 'manager', 'shipping', 'admin', 'auditor']);
usersRouter.post('/', requireRole('admin'), wrap((req, res) => {
  const b = z.object({ username: z.string().min(2).max(40).regex(/^[\w.\-]+$/), name: z.string().min(2).max(80), role: Role, password: z.string().min(8).max(200), pin: z.string().regex(/^\d{4,8}$/).optional(), email: z.string().email().max(200).optional() }).parse(req.body);
  assertStrongPassword(b.password, b.username);
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(b.username)) throw new HttpError(409, 'Username already exists');
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO users(username,name,role,password_hash,created_at,email,must_change) VALUES (?,?,?,?,?,?,1)').run(b.username, b.name, b.role, hashPassword(b.password), nowIso(), b.email ?? null);
    const id = Number(r.lastInsertRowid);
    if (b.pin) setPin(id, b.pin);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'user.create', entity: 'user', entityId: id, detail: { username: b.username, role: b.role } });
    return id;
  })();
  res.status(201).json({ id });
}));
usersRouter.patch('/:id', requireRole('admin'), wrap((req, res) => {
  const id = Number(req.params.id);
  const b = z.object({ name: z.string().min(2).max(80).optional(), role: Role.optional(), active: z.boolean().optional(), password: z.string().min(8).max(200).optional(), pin: z.string().regex(/^\d{4,8}$/).optional(), email: z.string().email().max(200).or(z.literal('')).optional() }).parse(req.body);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id) as any;
  if (!u) throw new HttpError(404, 'User not found');
  if (b.password) assertStrongPassword(b.password, u.username);
  if (id === req.user!.id && (b.active === false || (b.role && b.role !== 'admin'))) throw new HttpError(400, 'You cannot deactivate or demote yourself');
  db.transaction(() => {
    if (b.name) db.prepare('UPDATE users SET name=? WHERE id=?').run(b.name, id);
    if (b.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, id);
    if (b.active !== undefined) db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, id);
    if (b.password) db.prepare('UPDATE users SET password_hash=?, must_change=1, token_version=token_version+1 WHERE id=?').run(hashPassword(b.password), id);
    if (b.email !== undefined) db.prepare('UPDATE users SET email=? WHERE id=?').run(b.email || null, id);
    if (b.role || b.active === false) db.prepare('UPDATE users SET token_version=token_version+1 WHERE id=?').run(id);
    if (b.pin) setPin(id, b.pin);
    audit({ actor: { id: req.user!.id, name: req.user!.name }, action: 'user.update', entity: 'user', entityId: id, detail: { name: b.name, role: b.role, active: b.active, passwordReset: !!b.password, pinReset: !!b.pin } });
  })();
  res.json({ ok: true });
}));
