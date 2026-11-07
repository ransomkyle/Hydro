import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.QC_DATA_DIR
  ? path.resolve(process.env.QC_DATA_DIR)
  : path.resolve(here, '../../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'qc.db');
export const WEB_DIST = path.resolve(here, process.env.QC_WEB_DIST ?? '../../web/dist');
export const PORT = Number(process.env.PORT ?? 4100);
/** IANA timezone used when rendering timestamps in the PDF package. */
export const SHOP_TZ = process.env.SHOP_TZ ?? 'America/Chicago';
export const COMPANY_NAME = process.env.COMPANY_NAME ?? 'DAD Manufacturing, Inc.';
export const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL ?? '';
export const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS ?? 12);
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 25);
/** Offline entries older than this are rejected (device clock sanity). */
export const MAX_OFFLINE_AGE_DAYS = 14;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** JWT secret: env var, else generated once and persisted next to the DB. */
function loadSecret(): string {
  if (process.env.QC_JWT_SECRET) return process.env.QC_JWT_SECRET;
  const f = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
export const JWT_SECRET = loadSecret();
