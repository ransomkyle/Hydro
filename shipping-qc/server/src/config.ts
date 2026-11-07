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
export const MAX_OFFLINE_AGE_DAYS = Number(process.env.MAX_OFFLINE_AGE_DAYS ?? 3);

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

/** Plants/sites. Semicolon-separated; the first is the default for new shipments. */
export const PLANTS = (process.env.QC_PLANTS ?? 'Hiawatha (HQ);Lisbon').split(';').map(x => x.trim()).filter(Boolean);
/** Set to 1 to block new shipments from using checklist templates a QC manager has not approved. */
export const REQUIRE_APPROVED_TEMPLATES = process.env.QC_REQUIRE_APPROVED_TEMPLATES === '1';
/** A shipment left the dock "on time" if it departed within this many minutes after its pickup appointment. */
export const ON_TIME_GRACE_MIN = Number(process.env.ON_TIME_GRACE_MIN ?? 60);
export const SMTP_URL = process.env.SMTP_URL ?? '';        // e.g. smtps://user:pass@smtp.office365.com ; "json" = capture in memory (tests)
export const SMTP_FROM = process.env.SMTP_FROM ?? 'DAD Shipping QC <noreply@localhost>';
export const APP_URL = process.env.APP_URL ?? '';           // public https URL, used for links in emails
