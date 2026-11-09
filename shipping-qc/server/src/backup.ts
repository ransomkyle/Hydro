/**
 * Backup / verify / restore.
 *   npm run backup                         -> data/backups/qc-YYYYMMDD-HHMMSS/ (consistent DB copy + uploads + MANIFEST.json), prunes old ones
 *   npm run verify-backup -- <dir>         -> checks every file hash, opens the DB copy and re-verifies the audit hash chain
 *   npm run restore -- <dir> --yes         -> (server STOPPED) restores DB + uploads, keeping the current DB as qc.db.pre-restore
 * Copy the backup folder to another machine/drive: a backup that lives only on the server is not a backup.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH, UPLOAD_DIR } from './config.js';
import { db } from './db.js';

interface Manifest { created: string; files: { path: string; sha256: string; size: number }[]; audit: { entries: number; lastHash: string | null }; }
const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const GENESIS = '0'.repeat(64);

function chainOk(d: Database.Database): { ok: boolean; count: number; lastHash: string | null } {
  let prev = GENESIS, count = 0;
  for (const r of d.prepare('SELECT * FROM audit_log ORDER BY id').iterate() as Iterable<any>) {
    const payload = { at: r.at, event_at: r.event_at, user_id: r.user_id, user_name: r.user_name, action: r.action, entity: r.entity, entity_id: r.entity_id, shipment_id: r.shipment_id, detail: r.detail, offline: r.offline };
    if (r.prev_hash !== prev || crypto.createHash('sha256').update(prev + JSON.stringify(payload)).digest('hex') !== r.hash) return { ok: false, count, lastHash: prev };
    prev = r.hash; count++;
  }
  return { ok: true, count, lastHash: count ? prev : null };
}

export async function runBackup(root = path.join(DATA_DIR, 'backups'), keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30)): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.join(root, `qc-${stamp}`);
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  await db.backup(path.join(dir, 'qc.db'));                       // safe while the server is running
  const files: Manifest['files'] = [];
  const add = (rel: string) => { const f = path.join(dir, rel); files.push({ path: rel, sha256: sha(f), size: fs.statSync(f).size }); };
  add('qc.db');
  for (const u of fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []) { fs.copyFileSync(path.join(UPLOAD_DIR, u), path.join(dir, 'uploads', u)); add(path.join('uploads', u)); }
  const copy = new Database(path.join(dir, 'qc.db'), { readonly: true });
  const c = chainOk(copy); copy.close();
  if (!c.ok) console.warn('WARNING: the audit hash chain in this backup is NOT intact');
  const manifest: Manifest = { created: new Date().toISOString(), files, audit: { entries: c.count, lastHash: c.lastHash } };
  fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  if (fs.existsSync(root)) for (const d of fs.readdirSync(root)) {      // prune
    const full = path.join(root, d);
    if (/^qc-\d{8}-\d{6}$/.test(d) && full !== dir && Date.now() - fs.statSync(full).mtimeMs > keepDays * 86_400_000) fs.rmSync(full, { recursive: true, force: true });
  }
  return dir;
}

export function verifyBackup(dir: string): { ok: boolean; problems: string[]; manifest: Manifest | null } {
  const problems: string[] = [];
  const mf = path.join(dir, 'MANIFEST.json');
  if (!fs.existsSync(mf)) return { ok: false, problems: ['MANIFEST.json missing'], manifest: null };
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8')) as Manifest;
  for (const f of manifest.files) {
    const full = path.join(dir, f.path);
    if (!fs.existsSync(full)) problems.push(`missing file ${f.path}`); else if (sha(full) !== f.sha256) problems.push(`hash mismatch ${f.path}`);
  }
  if (!problems.length) {
    const d = new Database(path.join(dir, 'qc.db'), { readonly: true });
    const c = chainOk(d); d.close();
    if (!c.ok) problems.push(`audit chain broken in backup near entry ${c.count + 1}`);
    if (c.count !== manifest.audit.entries || c.lastHash !== manifest.audit.lastHash) problems.push('audit anchor does not match manifest');
  }
  return { ok: problems.length === 0, problems, manifest };
}

export function restoreBackup(dir: string) {
  const v = verifyBackup(dir);
  if (!v.ok) throw new Error('Backup failed verification: ' + v.problems.join('; '));
  const pidFile = path.join(DATA_DIR, 'server.pid');
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* stale pid file */ }
    if (alive && pid !== process.pid) throw new Error(`The QC server is running (pid ${pid}) — stop it before restoring`);
  }
  // Release this process's own handle on the live DB first: a still-open WAL connection would write its old state back over the restored file.
  try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch { /* already closed */ }
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, DB_PATH + '.pre-restore');
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
  fs.copyFileSync(path.join(dir, 'qc.db'), DB_PATH);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const u of fs.readdirSync(path.join(dir, 'uploads'))) fs.copyFileSync(path.join(dir, 'uploads', u), path.join(UPLOAD_DIR, u));
  // Prove the restore: reopen the restored DB, re-check the audit chain against the manifest, and confirm every upload is present.
  const d = new Database(DB_PATH, { readonly: true });
  const c = chainOk(d); d.close();
  const missing = v.manifest!.files.filter(f => f.path.startsWith('uploads')).filter(f => !fs.existsSync(path.join(DATA_DIR, f.path)));
  if (!c.ok || c.count !== v.manifest!.audit.entries || c.lastHash !== v.manifest!.audit.lastHash || missing.length) {
    throw new Error(`Restore did not verify (audit entries ${c.count}/${v.manifest!.audit.entries}, missing uploads ${missing.length}). Your previous database is saved as qc.db.pre-restore.`);
  }
  return { auditEntries: c.count, files: v.manifest!.files.length };
}

if (process.argv[1]?.match(/backup\.(ts|js)$/)) {
  const [cmd, arg] = [process.argv[2] ?? 'backup', process.argv[3]];
  (async () => {
    if (cmd === 'backup') { const d = await runBackup(arg); const v = verifyBackup(d); console.log(`Backup written to ${d}\n  files: ${v.manifest?.files.length}, audit entries: ${v.manifest?.audit.entries}, verified: ${v.ok ? 'YES' : 'NO — ' + v.problems.join('; ')}\n  audit anchor (record this somewhere independent): ${v.manifest?.audit.lastHash}`); process.exit(v.ok ? 0 : 1); }
    else if (cmd === 'verify') { const v = verifyBackup(arg); console.log(v.ok ? `OK — ${v.manifest!.files.length} files, ${v.manifest!.audit.entries} audit entries, chain intact` : 'FAILED: ' + v.problems.join('; ')); process.exit(v.ok ? 0 : 1); }
    else if (cmd === 'restore') { if (!process.argv.includes('--yes')) { console.error('Add --yes to confirm. The server must be stopped.'); process.exit(2); } const r = restoreBackup(arg); console.log(`Restored and verified (${r.auditEntries} audit entries, ${r.files} files). Previous DB kept as qc.db.pre-restore. Start the server.`); }
    else { console.error('usage: backup | verify <dir> | restore <dir> --yes'); process.exit(2); }
  })().catch(e => { console.error(e.message); process.exit(1); });
}
