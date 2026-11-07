import { db, nowIso } from './db.js';
import { hashPassword, setPin } from './auth.js';
import { TEMPLATES } from './templateData.js';

/** Idempotent: creates the starter library and demo accounts only when the tables are empty. */
export function seed(opts: { demoUsers?: boolean } = {}) {
  const now = nowIso();
  if (!(db.prepare('SELECT COUNT(*) n FROM templates').get() as any).n) {
    db.transaction(() => {
      for (const t of TEMPLATES) {
        const r = db.prepare('INSERT INTO templates(name,description,category,created_at,updated_at) VALUES (?,?,?,?,?)').run(t.name, t.description, t.category, now, now);
        const ins = db.prepare(`INSERT INTO template_items(template_id,seq,section,text,kind,unit,spec,reference,required,signer_role,needs_verification) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        t.items.forEach((i, n) => ins.run(r.lastInsertRowid, n + 1, i.section, i.text, i.kind ?? 'check', i.unit ?? null, i.spec ?? null, i.reference ?? null, i.required === false ? 0 : 1, i.signer_role ?? 'any', i.needs_verification ? 1 : 0));
      }
    })();
    console.log(`Seeded ${TEMPLATES.length} checklist templates`);
  }
  if (!(db.prepare('SELECT COUNT(*) n FROM users').get() as any).n) {
    const users: [string, string, string, string][] = opts.demoUsers
      ? [['admin', 'Alex Admin', 'admin', '1111'], ['manager', 'Morgan Manager', 'manager', '2222'], ['inspector', 'Ira Inspector', 'inspector', '3333'],
         ['inspector2', 'Jules Inspector', 'inspector', '3434'], ['operator', 'Olive Operator', 'operator', '4444'], ['shipping', 'Sam Shipping', 'shipping', '5555'], ['auditor', 'Avery Auditor', 'auditor', '6666']]
      : [['admin', 'Administrator', 'admin', '']];
    db.transaction(() => {
      for (const [username, name, role, pin] of users) {
        const r = db.prepare('INSERT INTO users(username,name,role,password_hash,created_at) VALUES (?,?,?,?,?)').run(username, name, role, hashPassword(opts.demoUsers ? 'changeme123' : 'admin1234'), now);
        if (pin) setPin(Number(r.lastInsertRowid), pin);
      }
    })();
    console.log(opts.demoUsers
      ? 'Created demo users (password: changeme123; PINs 1111/2222/3333/3434/4444/5555/6666) — CHANGE THESE.'
      : 'Created user "admin" / password "admin1234". Sign in, change the password, set a PIN, and add your team.');
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) seed({ demoUsers: process.argv.includes('--demo') });
