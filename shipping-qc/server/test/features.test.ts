import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-feat-'));
process.env.QC_DATA_DIR = DATA;
process.env.QC_DEMO = '1';
process.env.SMTP_URL = 'json';
process.env.QC_REQUIRE_APPROVED_TEMPLATES = '1';

let base = ''; let server: any;
const tokens: Record<string, string> = {};
const pins: Record<string, string> = { admin: '1111', manager: '2222', inspector: '3333', inspector2: '3434', operator: '4444', shipping: '5555', auditor: '6666' };

async function api(method: string, url: string, user: string | null, body?: any, raw = false, token?: string) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(user || token ? { authorization: `Bearer ${token ?? tokens[user!]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return r;
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const asBody = (t: any) => ({ name: t.name, description: t.description, customer: t.customer, category: t.category, items: t.items.map((i: any) => ({ ...i, required: !!i.required, needs_verification: !!i.needs_verification })) });
const sign = (user: string, itemId: number, extra: any = {}) => api('POST', `/api/shipments/items/${itemId}/sign`, user, { result: 'pass', pin: pins[user], ...extra });

before(async () => {
  const { seed } = await import('../src/seed.js'); const { createApp } = await import('../src/app.js');
  seed({ demoUsers: true });
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
  for (const u of Object.keys(pins)) tokens[u] = (await api('POST', '/api/auth/login', null, { username: u, password: 'changeme123' })).body.token;
});
after(() => server?.close());

let baseTpl = 0;
describe('template approval (document control)', () => {
  it('starts unapproved and is blocked from new shipments when approval is required', async () => {
    const t = (await api('GET', '/api/templates', 'manager')).body;
    assert.ok(t.every((x: any) => !x.approved_at));
    baseTpl = t.find((x: any) => x.category === 'base').id;
    const r = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-1', customer: 'Acme', templateIds: [baseTpl] });
    assert.equal(r.status, 409); assert.match(r.body.error, /not been approved/);
  });
  it('only a manager can approve, with their PIN', async () => {
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'inspector', { pin: pins.inspector })).status, 403);
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'manager', { pin: '0000' })).status, 403);
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'manager', { pin: pins.manager })).status, 200);
    const r = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-1', customer: 'Acme', templateIds: [baseTpl] });
    assert.equal(r.status, 201);
  });
  it('editing clears approval; with 2+ managers a different manager must re-approve', async () => {
    const t = (await api('GET', `/api/templates/${baseTpl}`, 'manager')).body;
    const put = await api('PUT', `/api/templates/${baseTpl}`, 'manager', asBody(t));
    assert.equal(put.status, 200);
    assert.ok(!(await api('GET', '/api/templates', 'manager')).body.find((x: any) => x.id === baseTpl).approved_at);
    // sole manager may self-approve
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'manager', { pin: pins.manager })).status, 200);
    // add a second manager
    const mk = await api('POST', '/api/users', 'admin', { username: 'manager2', name: 'Maya Manager', role: 'manager', password: 'Sturdy-Pass-77', pin: '7777' });
    assert.equal(mk.status, 201);
    const l = await api('POST', '/api/auth/login', null, { username: 'manager2', password: 'Sturdy-Pass-77' });
    // new users must change their temporary password before anything else
    assert.equal(l.body.user.mustChange, true);
    assert.equal((await api('GET', '/api/templates', null, undefined, false, l.body.token)).status, 403);
    const ch = await api('POST', '/api/auth/password', null, { current: 'Sturdy-Pass-77', next: 'Another-Strong-88' }, false, l.body.token);
    assert.equal(ch.status, 200); tokens.manager2 = ch.body.token; pins.manager2 = '7777';
    await api('PUT', `/api/templates/${baseTpl}`, 'manager', asBody(t));
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'manager', { pin: pins.manager })).status, 403, 'editor cannot approve own change');
    assert.equal((await api('POST', `/api/templates/${baseTpl}/approve`, 'manager2', { pin: '7777' })).status, 200);
  });
});

let shipId = 0; let items: any[] = [];
const byText = (t: string) => items.find(i => i.text.includes(t));
const refresh = async () => { const r = await api('GET', `/api/shipments/${shipId}`, 'manager'); items = r.body.items; return r.body; };

describe('plants, gauges and signing', () => {
  it('assigns and filters by plant; rejects unknown plants', async () => {
    const tplIds = (await api('GET', '/api/templates', 'manager')).body.filter((t: any) => /Base|Sanitary/.test(t.name)).map((t: any) => t.id);
    for (const id of tplIds) await api('POST', `/api/templates/${id}/approve`, 'manager2', { pin: '7777' }); // approve for use
    const a = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-10', customer: 'Lisbon Co', plant: 'Lisbon', templateIds: tplIds });
    assert.equal(a.status, 201); assert.equal(a.body.shipment.plant, 'Lisbon'); shipId = a.body.shipment.id; items = a.body.items;
    const b = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-11', customer: 'HQ Co', templateIds: tplIds });
    assert.equal(b.body.shipment.plant, 'Hiawatha (HQ)', 'defaults to the first plant');
    assert.equal((await api('POST', '/api/shipments', 'shipping', { job_no: 'J-12', customer: 'X', plant: 'Mars' })).status, 400);
    assert.equal((await api('GET', '/api/shipments?plant=Lisbon', 'manager')).body.length, 1);
  });
  it('rejects out-of-calibration, unknown and inapplicable gauges; records a good one', async () => {
    assert.equal((await api('POST', '/api/gauges', 'operator', { gauge_no: 'X', description: 'x', cal_due: '2030-01-01' })).status, 403);
    assert.equal((await api('POST', '/api/gauges', 'inspector', { gauge_no: 'PRO-01', description: 'Profilometer', cal_due: '2020-01-01' })).status, 201);
    assert.equal((await api('POST', '/api/gauges', 'inspector', { gauge_no: 'PRO-02', description: 'Profilometer 2', cal_due: '2099-01-01', cal_date: '2026-01-01' })).status, 201);
    await refresh();
    const val = byText('Product-contact surface finish');
    const bad = await sign('inspector', val.id, { value: '18', gauge: 'PRO-01' });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /expired/);
    assert.equal((await sign('inspector', val.id, { value: '18', gauge: 'NOPE' })).status, 400);
    assert.equal((await sign('inspector', byText('Job / PO / packing list').id, { gauge: 'PRO-02' })).status, 400, 'gauge only on measurements');
    const ok = await sign('inspector', val.id, { value: '18', gauge: 'PRO-02' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.items.find((i: any) => i.id === val.id).gauge_no, 'PRO-02');
    const g = (await api('GET', '/api/gauges', 'operator')).body;
    assert.equal(g.find((x: any) => x.gauge_no === 'PRO-01').overdue, true);
  });
});

describe('CAPA', () => {
  let capaId = 0; let flagId = 0;
  it('opens from a flag, needs root cause + corrective action to close, and closes with PIN', async () => {
    await refresh();
    const f = await api('POST', `/api/shipments/items/${byText('No gouges').id}/sign`, 'operator', { result: 'fail', pin: pins.operator, note: 'Gouge on shell' });
    flagId = f.body.flags[0].id;
    assert.equal((await api('POST', '/api/capas', 'operator', { title: 'x y z', flag_id: flagId })).status, 403);
    const c = await api('POST', '/api/capas', 'inspector', { title: 'Shell gouge from forklift forks', flag_id: flagId, owner_id: (await api('GET', '/api/users', 'manager')).body.find((u: any) => u.username === 'operator').id, due_date: '2020-01-01' });
    assert.equal(c.status, 201); capaId = c.body.id;
    assert.equal((await api('POST', '/api/capas', 'inspector', { title: 'again', flag_id: flagId })).status, 409);
    const list = (await api('GET', '/api/capas?status=open', 'manager')).body;
    assert.equal(list[0].overdue, true); assert.match(list[0].capa_no, /^CAPA-\d\d-001$/); assert.equal(list[0].shipment_id, shipId);
    const early = await api('POST', `/api/capas/${capaId}/close`, 'manager', { pin: pins.manager, effectiveness_check: 'Checked 30 days later' });
    assert.equal(early.status, 409); assert.match(early.body.error, /root cause/);
    assert.equal((await api('PATCH', `/api/capas/${capaId}`, 'inspector', { root_cause: 'Bare steel forks used on stainless', corrective_action: 'Nylon-lined fork covers fitted', preventive_action: 'Training + fork inspection', status: 'in_progress' })).status, 200);
    assert.equal((await api('POST', `/api/capas/${capaId}/close`, 'inspector', { pin: pins.inspector, effectiveness_check: 'x'.repeat(10) })).status, 403, 'manager only');
    assert.equal((await api('POST', `/api/capas/${capaId}/close`, 'manager', { pin: pins.manager, effectiveness_check: 'No recurrence in 30 days' })).status, 200);
    assert.equal((await api('PATCH', `/api/capas/${capaId}`, 'inspector', { title: 'edited after close' })).status, 409);
  });
  it('notifies the owner (in-app)', async () => {
    const n = (await api('GET', '/api/notifications', 'operator')).body;
    assert.ok(n.some((x: any) => /You own CAPA/.test(x.title)));
  });
});

describe('email notifications', () => {
  it('emails QC managers who have an address when an item fails', async () => {
    const { sentEmails } = await import('../src/notify.js');
    assert.equal((await api('POST', '/api/auth/email', 'manager', { email: 'qc.manager@dadmfg.test' })).status, 200);
    await refresh();
    const it = byText('No iron / carbon-steel contamination');
    await api('POST', `/api/shipments/items/${it.id}/sign`, 'operator', { result: 'fail', pin: pins.operator, note: 'Rust bloom on weld' });
    await new Promise(r => setTimeout(r, 300));
    const mail = sentEmails.find(m => m.to === 'qc.manager@dadmfg.test');
    assert.ok(mail, 'manager was emailed'); assert.match(mail!.subject, /FAILED/);
  });
});

describe('reports & anchors', () => {
  it('summarises KPIs from the signed records', async () => {
    const r = (await api('GET', '/api/reports/summary', 'manager')).body;
    assert.ok(r.totals.shipments >= 2); assert.ok(r.items.failed >= 2); assert.ok(r.flags.bySection.length >= 1);
    assert.equal(r.capa.open, 0); assert.equal(r.gauges.overdue, 1);
    assert.equal((await api('GET', '/api/reports/summary', 'operator')).status, 403);
    assert.equal((await api('GET', '/api/reports/summary?plant=Lisbon', 'manager')).body.totals.shipments, 1);
  });
  it('exposes an audit anchor', async () => {
    const a = (await api('GET', '/api/audit/anchor', 'auditor')).body;
    assert.equal(a.chainIntact, true); assert.match(a.lastHash, /^[0-9a-f]{64}$/); assert.ok(a.entries > 20);
  });
});

describe('idempotency only counts applied operations', () => {
  it('a rejected attempt does not poison its op id', async () => {
    const d = (await api('GET', `/api/shipments/${shipId}`, 'manager')).body;
    const it = d.items.find((i: any) => i.signer_role === 'inspector' && i.status === 'pending' && i.kind === 'check');
    const opId = crypto.randomUUID();
    assert.equal((await api('POST', `/api/shipments/items/${it.id}/sign`, 'operator', { result: 'pass', pin: pins.operator, opId })).status, 403);
    const ok = await api('POST', `/api/shipments/items/${it.id}/sign`, 'inspector', { result: 'pass', pin: pins.inspector, opId });
    assert.equal(ok.status, 200); assert.notEqual(ok.body.duplicate, true, 'applied, not treated as a duplicate');
    assert.equal(ok.body.items.find((i: any) => i.id === it.id).status, 'pass');
    const again = await api('POST', `/api/shipments/items/${it.id}/sign`, 'inspector', { result: 'pass', pin: pins.inspector, opId });
    assert.equal(again.body.duplicate, true, 'a true replay is still deduplicated');
  });
  it('rejects offline timestamps older than the window', async () => {
    const d = (await api('GET', `/api/shipments/${shipId}`, 'manager')).body;
    const it = d.items.find((i: any) => i.signer_role === 'any' && i.status === 'pending' && i.kind === 'check');
    const u = (await api('POST', '/api/auth/login', null, { username: 'operator', password: 'changeme123' })).body;
    const key = crypto.pbkdf2Sync(pins.operator, Buffer.from(u.pinSalt, 'hex'), 150000, 32, 'sha256');
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString(); const opId = crypto.randomUUID();
    const proof = crypto.createHmac('sha256', key).update([opId, 'sign', it.id, 'pass', '', '', old, ''].join('|')).digest('hex');
    const r = await api('POST', `/api/shipments/items/${it.id}/sign`, 'operator', { result: 'pass', opId, clientAt: old, offline: true, userId: u.user.id, proof });
    assert.equal(r.status, 400); assert.match(r.body.error, /older than 3 days/);
  });
});

describe('admin resets alert the person affected', () => {
  it('notifies the user and managers', async () => {
    const uid = (await api('GET', '/api/users', 'admin')).body.find((x: any) => x.username === 'auditor').id;
    assert.equal((await api('PATCH', `/api/users/${uid}`, 'admin', { pin: '9999' })).status, 200);
    assert.ok((await api('GET', '/api/notifications', 'auditor')).body.some((n: any) => /PIN was reset by/.test(n.title)));
    assert.ok((await api('GET', '/api/notifications', 'manager')).body.some((n: any) => /reset the PIN for/.test(n.title)));
  });
});

describe('emailing the release package', () => {
  it('only after release, to valid addresses, audited with a hash of what was sent', async () => {
    const { sentEmails } = await import('../src/notify.js');
    const mk = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-MAIL', customer: 'Mailco', templateIds: [baseTpl] });
    const id = mk.body.shipment.id;
    assert.equal((await api('POST', `/api/shipments/${id}/email-package`, 'manager', { to: ['buyer@mailco.test'] })).status, 409, 'not released yet');
    await api('POST', `/api/shipments/${id}/release`, 'manager', { pin: pins.manager, overrideReason: 'test release for email' });
    assert.equal((await api('POST', `/api/shipments/${id}/email-package`, 'manager', { to: ['not-an-email'] })).status, 400);
    assert.equal((await api('POST', `/api/shipments/${id}/email-package`, 'operator', { to: ['buyer@mailco.test'] })).status, 403);
    const r = await api('POST', `/api/shipments/${id}/email-package`, 'manager', { to: ['buyer@mailco.test'], message: 'Thanks for your order.' });
    assert.equal(r.status, 200); assert.match(r.body.sha256, /^[0-9a-f]{64}$/);
    const sent = sentEmails.find(m => m.to === 'buyer@mailco.test');
    assert.ok(sent && sent.attachment?.endsWith('-quality-release.pdf') && (sent.size ?? 0) > 5000);
    const log = (await api('GET', `/api/shipments/${id}/audit`, 'manager')).body;
    assert.ok(log.some((a: any) => a.action === 'export.package_emailed' && a.detail.includes(r.body.sha256)));
  });
});

describe('two-factor sign-in (TOTP)', () => {
  it('matches the RFC 6238 test vector and base32 round-trips', async () => {
    const { hotp, b32decode, b32encode, verifyTotp } = await import('../src/totp.js');
    const key = Buffer.from('12345678901234567890');
    assert.equal(hotp(key, Math.floor(59 / 30)), '287082');            // RFC 6238 Appendix B, T=59s (SHA-1) -> 94287082, last 6 digits
    assert.equal(hotp(key, Math.floor(1111111109 / 30)), '081804');    // T=1111111109 -> 07081804
    assert.deepEqual(b32decode(b32encode(Buffer.from('hello world!'))), Buffer.from('hello world!'));
    const secret = b32encode(key);
    assert.equal(verifyTotp(secret, '287082', 0, 59_000), 1);
    assert.equal(verifyTotp(secret, '287082', 1, 59_000), null, 'a used step cannot be replayed');
    assert.equal(verifyTotp(secret, '287082', 0, 59_000 + 120_000), null, 'outside the drift window');
  });
  it('enrolls, requires the code at sign-in, rejects replays/wrong codes, and can be reset by an admin', async () => {
    const { hotp, b32decode, stepNow } = await import('../src/totp.js');
    const setup = await api('POST', '/api/auth/mfa/setup', 'auditor');
    assert.equal(setup.status, 200); assert.match(setup.body.qr, /^data:image\/png;base64,/); assert.match(setup.body.otpauth, /^otpauth:\/\/totp\//);
    const secret = b32decode(setup.body.secret);
    assert.equal((await api('POST', '/api/auth/mfa/enable', 'auditor', { code: '000000' })).status, 400);
    const step = stepNow();
    assert.equal((await api('POST', '/api/auth/mfa/enable', 'auditor', { code: hotp(secret, step) })).status, 200);
    // login now needs the second step; the password alone yields no session token
    const l1 = await api('POST', '/api/auth/login', null, { username: 'auditor', password: 'changeme123' });
    assert.equal(l1.body.mfaRequired, true); assert.ok(!l1.body.token);
    assert.equal((await api('GET', '/api/auth/me', null, undefined, false, l1.body.mfaToken)).status, 401, 'the mfa token is not a session token');
    assert.equal((await api('POST', '/api/auth/login/mfa', null, { mfaToken: l1.body.mfaToken, code: '123456' })).status, 401);
    // the code used to enroll is already burned; the next step's code works once
    assert.equal((await api('POST', '/api/auth/login/mfa', null, { mfaToken: l1.body.mfaToken, code: hotp(secret, step) })).status, 401, 'enrollment code cannot be reused');
    const next = hotp(secret, step + 1);
    const ok = await api('POST', '/api/auth/login/mfa', null, { mfaToken: l1.body.mfaToken, code: next });
    assert.equal(ok.status, 200); assert.equal(ok.body.user.mfaEnabled, true);
    assert.equal((await api('GET', '/api/auth/me', null, undefined, false, ok.body.token)).status, 200);
    const l2 = await api('POST', '/api/auth/login', null, { username: 'auditor', password: 'changeme123' });
    assert.equal((await api('POST', '/api/auth/login/mfa', null, { mfaToken: l2.body.mfaToken, code: next })).status, 401, 'same code twice is refused');
    // admin reset (lost phone) turns it off and alerts the user
    const uid = (await api('GET', '/api/users', 'admin')).body.find((x: any) => x.username === 'auditor').id;
    assert.equal((await api('PATCH', `/api/users/${uid}`, 'admin', { resetMfa: true })).status, 200);
    const l3 = await api('POST', '/api/auth/login', null, { username: 'auditor', password: 'changeme123' });
    assert.ok(l3.body.token, 'password alone works again after reset');
    assert.ok((await api('GET', '/api/notifications', null, undefined, false, l3.body.token)).body.some((n: any) => /two-factor sign-in was reset/.test(n.title)));
  });
});

describe('label', () => {
  it('prints a PDF label with a hold status until released', async () => {
    const r = await api('GET', `/api/shipments/${shipId}/label.pdf`, 'shipping', undefined, true) as Response;
    assert.equal(r.status, 200); const b = Buffer.from(await r.arrayBuffer());
    assert.equal(b.subarray(0, 4).toString(), '%PDF'); assert.ok(b.length > 3000);
  });
});

describe('CSV import', () => {
  const csv = [
    'Job #,Customer Name,PO,Part Number,Part Description,Qty,Material,Heat,Length,Weight,Plant,Ship Date,Notes',
    'J-500,Brewco,PO-1,FV-1,Fermenter shell,1,316L,H100,420,9000,Lisbon,2026-12-01 08:00,"Sanitary, BPE finish"',
    'J-500,Brewco,PO-1,FV-1L,Legs,4,304,H101,,,,,',
    'J-501,Tiny Parts Inc,PO-2,CL-9,Clamp,200,304,H102,3,2,,,',
    'J-502,,PO-3,X,Missing customer,1,304,,,,,,',
    'J-503,Bad Co,PO-4,X,Bad qty,abc,304,,,,,,',
  ].join('\n');
  it('previews groups, suggests modules, and reports row errors', async () => {
    const r = await api('POST', '/api/import/shipments', 'shipping', { csv, dryRun: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.shipments.length, 2, 'two valid jobs; J-500 rows grouped');
    const j500 = r.body.shipments.find((s: any) => s.job_no === 'J-500');
    assert.equal(j500.parts, 2); assert.equal(j500.size, 'oversize'); assert.equal(j500.plant, 'Lisbon');
    assert.equal(r.body.shipments.find((s: any) => s.job_no === 'J-501').size, 'small');
    assert.ok(j500.withheldTemplates.some((n: string) => /Oversize/.test(n)), 'unapproved modules are withheld, not fatal');
    assert.equal(r.body.errors.length, 2); assert.match(JSON.stringify(r.body.errors), /missing customer/); assert.match(JSON.stringify(r.body.errors), /qty/);
  });
  it('refuses to commit while errors remain, then imports clean rows once and skips duplicates', async () => {
    assert.equal((await api('POST', '/api/import/shipments', 'shipping', { csv, dryRun: false })).status, 400);
    const clean = csv.split('\n').slice(0, 4).join('\n');
    const r = await api('POST', '/api/import/shipments', 'shipping', { csv: clean, dryRun: false });
    assert.equal(r.status, 201); assert.equal(r.body.created.length, 2);
    const detail = (await api('GET', `/api/shipments/${r.body.created[0].id}`, 'manager')).body;
    assert.ok(detail.items.length > 20); assert.ok(detail.parts.length >= 1);
    const again = await api('POST', '/api/import/shipments', 'shipping', { csv: clean, dryRun: false });
    assert.equal(again.body.created.length, 0); assert.equal(again.body.skipped.length, 2);
  });
  it('rejects files without the required columns', async () => {
    assert.equal((await api('POST', '/api/import/shipments', 'shipping', { csv: 'a,b\n1,2\n', dryRun: true })).status, 400);
    assert.equal((await api('POST', '/api/import/shipments', 'operator', { csv, dryRun: true })).status, 403);
  });
});

describe('account security', () => {
  it('enforces the password policy and revokes old sessions on change', async () => {
    const l = await api('POST', '/api/auth/login', null, { username: 'inspector2', password: 'changeme123' });
    const t = l.body.token;
    assert.equal((await api('POST', '/api/auth/password', null, { current: 'changeme123', next: 'short' }, false, t)).status, 400);
    assert.equal((await api('POST', '/api/auth/password', null, { current: 'changeme123', next: 'password123' }, false, t)).status, 400);
    assert.equal((await api('POST', '/api/auth/password', null, { current: 'changeme123', next: 'inspector2-is-me' }, false, t)).status, 400, 'contains username');
    const ok = await api('POST', '/api/auth/password', null, { current: 'changeme123', next: 'Correct-Horse-42' }, false, t);
    assert.equal(ok.status, 200);
    assert.equal((await api('GET', '/api/auth/me', null, undefined, false, t)).status, 401, 'old token revoked');
    assert.equal((await api('GET', '/api/auth/me', null, undefined, false, ok.body.token)).status, 200, 'new token works');
  });
  it('locks out after repeated failures, persistently', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/auth/login', null, { username: 'shipping', password: 'wrong-' + i })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', null, { username: 'shipping', password: 'changeme123' })).status, 429);
    const { db } = await import('../src/db.js');
    assert.ok((db.prepare("SELECT locked_until FROM throttle WHERE key='login:shipping'").get() as any).locked_until > Date.now(), 'lockout is stored in the DB');
  });
  it('sends a Content-Security-Policy', async () => {
    const r = await fetch(base + '/api/health');
    assert.match(r.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  });
});

describe('backup, verify and restore', () => {
  it('writes a verifiable backup, detects tampering, and restores into a fresh data dir', async () => {
    const { runBackup, verifyBackup } = await import('../src/backup.js');
    const dir = await runBackup(path.join(DATA, 'bk'));
    const v = verifyBackup(dir);
    assert.equal(v.ok, true, v.problems.join(';')); assert.ok(v.manifest!.audit.entries > 20);
    // restore into a different data directory in a child process (the server DB here stays open)
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-restore-'));
    const tsx = path.resolve('node_modules/.bin/tsx'); const script = path.resolve('src/backup.ts');
    const out = execFileSync(fs.existsSync(tsx) ? tsx : path.resolve('../node_modules/.bin/tsx'), [script, 'restore', dir, '--yes'], { env: { ...process.env, QC_DATA_DIR: target }, encoding: 'utf8' });
    assert.match(out, /Restored and verified/);
    const Database = (await import('better-sqlite3')).default;
    const d = new Database(path.join(target, 'qc.db'), { readonly: true });
    assert.ok((d.prepare('SELECT COUNT(*) n FROM shipments').get() as any).n >= 4); d.close();
    // tamper -> verification fails
    fs.appendFileSync(path.join(dir, 'qc.db'), 'x');
    const bad = verifyBackup(dir);
    assert.equal(bad.ok, false); assert.match(bad.problems.join(';'), /hash mismatch/);
  });
});
