import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator','inspector','manager','shipping','admin','auditor')),
  password_hash TEXT NOT NULL,
  pin_salt TEXT,          -- hex; PBKDF2 salt for the sign-off PIN
  pin_key TEXT,           -- hex; PBKDF2(pin, salt). Verifies PINs online and HMAC proofs of offline sign-offs
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  customer TEXT,                     -- NULL = general purpose
  category TEXT NOT NULL DEFAULT 'base',  -- base | module | customer
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_items (
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'check',        -- check | value | photo | doc
  unit TEXT,
  spec TEXT,                                 -- acceptance criteria shown to the signer
  reference TEXT,                            -- standard / clause citation
  required INTEGER NOT NULL DEFAULT 1,
  signer_role TEXT NOT NULL DEFAULT 'any',   -- any | inspector | manager
  needs_verification INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY,
  shipment_no TEXT NOT NULL UNIQUE,
  job_no TEXT NOT NULL,
  customer TEXT NOT NULL,
  po_no TEXT,
  description TEXT,
  special_requirements TEXT,
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | in_progress | released | shipped | delivered | cancelled
  size_class TEXT NOT NULL DEFAULT 'standard', -- small | standard | oversize
  is_sanitary INTEGER NOT NULL DEFAULT 0,
  is_pressure INTEGER NOT NULL DEFAULT 0,
  length_in REAL, width_in REAL, height_in REAL, weight_lb REAL, pieces INTEGER,
  ship_from_dock TEXT,
  ship_to_name TEXT, ship_to_address TEXT,
  requested_ship_date TEXT,
  pickup_appt TEXT,
  carrier TEXT, equipment_type TEXT, truck_no TEXT, trailer_no TEXT,
  driver_name TEXT, driver_id_no TEXT, bol_no TEXT, pro_no TEXT, seal_no TEXT,
  permit_no TEXT, escort_required INTEGER NOT NULL DEFAULT 0, rigging_notes TEXT, tiedown_notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  released_by INTEGER REFERENCES users(id),
  released_at TEXT,
  release_override_reason TEXT,
  release_snapshot TEXT                      -- JSON of readiness blockers at the moment of release
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipments(customer);
CREATE INDEX IF NOT EXISTS idx_shipments_job ON shipments(job_no);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  part_no TEXT, description TEXT, qty REAL NOT NULL DEFAULT 1,
  grade TEXT, heat_no TEXT, finish TEXT, drawing_rev TEXT,
  length_in REAL, weight_lb REAL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'check',
  unit TEXT, spec TEXT, reference TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  signer_role TEXT NOT NULL DEFAULT 'any',
  needs_verification INTEGER NOT NULL DEFAULT 0,
  source TEXT,                                -- template name it came from, or 'custom'
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | pass | fail | na
  value TEXT,
  note TEXT,
  done_by INTEGER REFERENCES users(id),
  done_at TEXT,                               -- effective time of the sign-off
  done_received_at TEXT,                      -- when the server received it
  done_offline INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  verified_offline INTEGER NOT NULL DEFAULT 0,
  verify_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_shipment ON checklist_items(shipment_id, seq);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                     -- base_metal | consumable | packaging
  name TEXT NOT NULL,
  grade TEXT, heat_lot TEXT, spec TEXT,
  qty REAL, unit TEXT,
  mtr_attachment_id INTEGER,
  note TEXT,
  added_by INTEGER NOT NULL REFERENCES users(id),
  added_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  offline INTEGER NOT NULL DEFAULT 0,
  voided INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT, voided_by INTEGER REFERENCES users(id), voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_materials_heat ON materials(heat_lot);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                         -- ready | loaded | departed | picked_up | delivered | note
  at TEXT NOT NULL,                           -- effective time
  received_at TEXT NOT NULL,
  location TEXT, lat REAL, lng REAL, accuracy_m REAL,
  person_name TEXT,                           -- driver / receiver name for pickup & delivery
  note TEXT,
  signature_png TEXT,                         -- data URL of drawn signature
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  offline INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES checklist_items(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                         -- photo | mtr | cert | inspection | drawing | other
  filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  sha256 TEXT NOT NULL, stored_as TEXT NOT NULL,
  caption TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  offline INTEGER NOT NULL DEFAULT 0,
  voided INTEGER NOT NULL DEFAULT 0, void_reason TEXT, voided_by INTEGER REFERENCES users(id), voided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_att_shipment ON attachments(shipment_id);

CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES checklist_items(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'major',     -- minor | major | critical
  description TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  raised_by INTEGER NOT NULL REFERENCES users(id),
  raised_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',        -- open | resolved
  disposition TEXT,                           -- rework | repair | use_as_is | scrap | no_action | other
  resolution TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_flags_status ON flags(status);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

-- Idempotency for offline replays: an op id is applied at most once.
CREATE TABLE IF NOT EXISTS processed_ops (
  op_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  received_at TEXT NOT NULL
);

-- Append-only, hash-chained audit trail.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,                 -- server time the record was written
  event_at TEXT,                    -- effective time of the action (differs for offline entries)
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  shipment_id INTEGER,
  detail TEXT NOT NULL,             -- JSON
  offline INTEGER NOT NULL DEFAULT 0,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_shipment ON audit_log(shipment_id);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`);

/** Lightweight forward-only migrations so an existing database picks up new columns/tables on upgrade. */
function addColumn(table: string, col: string, def: string) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('shipments', 'plant', 'TEXT');
addColumn('users', 'email', 'TEXT');
addColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'must_change', 'INTEGER NOT NULL DEFAULT 0');
addColumn('checklist_items', 'gauge_no', 'TEXT');
addColumn('templates', 'edited_by', 'INTEGER');
addColumn('templates', 'approved_by', 'INTEGER');
addColumn('templates', 'approved_at', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS gauges (
  id INTEGER PRIMARY KEY,
  gauge_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL,
  plant TEXT,
  cal_date TEXT,                       -- YYYY-MM-DD of last calibration
  cal_due TEXT NOT NULL,               -- YYYY-MM-DD; sign-offs using the gauge after this date are rejected
  cal_cert TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active | out_of_service | retired
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capas (
  id INTEGER PRIMARY KEY,
  capa_no TEXT NOT NULL UNIQUE,
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  flag_id INTEGER REFERENCES flags(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  containment TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  owner_id INTEGER REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',     -- open | in_progress | closed
  effectiveness_check TEXT,
  opened_by INTEGER NOT NULL REFERENCES users(id),
  opened_at TEXT NOT NULL,
  closed_by INTEGER REFERENCES users(id),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_capas_status ON capas(status);

-- Persistent brute-force counters (survive restarts).
CREATE TABLE IF NOT EXISTS throttle (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
`);

export const nowIso = () => new Date().toISOString();
