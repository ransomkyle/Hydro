import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

process.env.QC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-test-'));
process.env.QC_DEMO = '1';

let base = ''; let server: any;
const tokens: Record<string, string> = {};
const info: Record<string, any> = {};

async function api(method: string, url: string, user: string | null, body?: any, raw = false) {
  const r = await fetch(base + url, {
    method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${tokens[user]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return r;
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}
const pins: Record<string, string> = { admin: '1111', manager: '2222', inspector: '3333', inspector2: '3434', operator: '4444', shipping: '5555', auditor: '6666' };

before(async () => {
  const { seed } = await import('../src/seed.js');
  const { createApp } = await import('../src/app.js');
  seed({ demoUsers: true });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const u of Object.keys(pins)) {
    const r = await api('POST', '/api/auth/login', null, { username: u, password: 'changeme123' });
    assert.equal(r.status, 200);
    tokens[u] = r.body.token; info[u] = r.body;
  }
});
after(() => server?.close());

let shipId = 0; let items: any[] = [];
const byText = (t: string) => items.find(i => i.text.includes(t));
const sign = (user: string, itemId: number, extra: any = {}) =>
  api('POST', `/api/shipments/items/${itemId}/sign`, user, { result: 'pass', pin: pins[user], ...extra });
const refresh = async () => { const r = await api('GET', `/api/shipments/${shipId}`, 'manager'); items = r.body.items; return r.body; };

describe('shipping QC', () => {
  it('requires authentication and rejects wrong credentials', async () => {
    assert.equal((await api('GET', '/api/shipments', null)).status, 401);
    assert.equal((await api('POST', '/api/auth/login', null, { username: 'manager', password: 'nope' })).status, 401);
  });

  it('creates a shipment by merging templates into a per-job checklist', async () => {
    const t = await api('GET', '/api/templates', 'shipping');
    assert.ok(t.body.length >= 5);
    const ids = t.body.filter((x: any) => /Base|Oversize/.test(x.name)).map((x: any) => x.id);
    const r = await api('POST', '/api/shipments', 'shipping', {
      job_no: 'J-1001', customer: 'Acme Dairy', po_no: 'PO-77', size_class: 'oversize', is_sanitary: false, length_in: 600, weight_lb: 18000,
      templateIds: ids, parts: [{ part_no: 'TNK-1', description: '316L tank', qty: 1, grade: '316L', heat_no: 'H12345' }],
    });
    assert.equal(r.status, 201);
    shipId = r.body.shipment.id;
    assert.match(r.body.shipment.shipment_no, /^SQ-\d{4}-0001$/);
    assert.ok(r.body.items.length > 30);
    items = r.body.items;
    assert.equal((await api('POST', '/api/shipments', 'operator', { job_no: 'x', customer: 'y' })).status, 403);
  });

  it('requires the PIN and stamps who/when on every sign-off', async () => {
    const it0 = byText('Job / PO / packing list');
    assert.equal((await api('POST', `/api/shipments/items/${it0.id}/sign`, 'operator', { result: 'pass' })).status, 403);
    assert.equal((await api('POST', `/api/shipments/items/${it0.id}/sign`, 'operator', { result: 'pass', pin: '0000' })).status, 403);
    const ok = await sign('operator', it0.id);
    assert.equal(ok.status, 200);
    const row = ok.body.items.find((i: any) => i.id === it0.id);
    assert.equal(row.status, 'pass'); assert.equal(row.done_by_name, 'Olive Operator');
    assert.ok(Date.now() - Date.parse(row.done_at) < 5000);
    assert.equal(ok.body.shipment.status, 'in_progress');
    assert.equal((await sign('operator', it0.id)).status, 409, 'cannot re-sign without revoking');
  });

  it('enforces role limits, value/photo requirements and N/A reasons', async () => {
    await refresh();
    const insp = byText('Final inspection report is complete');
    assert.equal((await sign('operator', insp.id)).status, 403, 'operator cannot sign an inspector item');
    assert.equal((await sign('inspector', insp.id)).status, 400, 'needs a document attached first');
    const val = byText('Drawing revision');
    assert.equal((await sign('operator', val.id)).status, 400, 'value required');
    assert.equal((await sign('operator', val.id, { value: 'C' })).status, 200);
    const na = byText('Stainless kept off carbon steel');
    assert.equal((await sign('operator', na.id, { result: 'na' })).status, 400, 'N/A needs a reason');
    assert.equal((await sign('auditor', na.id)).status, 403);
  });

  it('accepts PDF uploads, rejects disguised files, then allows the document item to pass', async () => {
    const insp = byText('Final inspection report is complete');
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4\n%fake\n'], { type: 'application/pdf' }), 'final-inspection.pdf');
    form.append('kind', 'inspection'); form.append('itemId', String(insp.id));
    const up = await fetch(`${base}/api/shipments/${shipId}/attachments`, { method: 'POST', headers: { authorization: `Bearer ${tokens.inspector}` }, body: form });
    assert.equal(up.status, 201);
    const bad = new FormData();
    bad.append('file', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'evil.pdf');
    const r2 = await fetch(`${base}/api/shipments/${shipId}/attachments`, { method: 'POST', headers: { authorization: `Bearer ${tokens.inspector}` }, body: bad });
    assert.equal(r2.status, 415);
    assert.equal((await sign('inspector', insp.id)).status, 200);
  });

  it('requires a DIFFERENT person to verify hold-point items', async () => {
    await refresh();
    const hold = byText('Tie-down count meets FMCSA');
    assert.equal((await sign('inspector', hold.id, { value: '6' })).status, 200);
    const same = await api('POST', `/api/shipments/items/${hold.id}/verify`, 'inspector', { pin: pins.inspector });
    assert.equal(same.status, 403);
    assert.equal((await api('POST', `/api/shipments/items/${hold.id}/verify`, 'operator', { pin: pins.operator })).status, 403);
    const ok = await api('POST', `/api/shipments/items/${hold.id}/verify`, 'inspector2', { pin: pins.inspector2 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.items.find((i: any) => i.id === hold.id).verified_by_name, 'Jules Inspector');
  });

  it('is idempotent for replayed op ids', async () => {
    await refresh();
    const it1 = byText('Customer special requirements');
    const opId = crypto.randomUUID();
    assert.equal((await sign('operator', it1.id, { opId })).status, 200);
    const again = await sign('operator', it1.id, { opId });
    assert.equal(again.status, 200); assert.equal(again.body.duplicate, true);
  });

  it('accepts OFFLINE sign-offs only with a valid PIN-derived HMAC and keeps both timestamps', async () => {
    await refresh();
    const it2 = byText('No open nonconformance');
    const u = info.inspector;
    const key = crypto.pbkdf2Sync(pins.inspector, Buffer.from(u.pinSalt, 'hex'), 150000, 32, 'sha256');
    assert.equal(crypto.createHash('sha256').update(key).digest('hex'), u.pinVerifier, 'device-side PIN check value matches');
    const clientAt = new Date(Date.now() - 3600_000).toISOString();
    const opId = crypto.randomUUID();
    const canonical = [opId, 'sign', it2.id, 'pass', '', '', clientAt, ''].join('|');
    const proof = crypto.createHmac('sha256', key).update(canonical).digest('hex');
    const bad = await api('POST', `/api/shipments/items/${it2.id}/sign`, 'operator', { result: 'pass', opId, clientAt, offline: true, userId: u.user.id, proof: 'a'.repeat(64) });
    assert.equal(bad.status, 403);
    const r = await api('POST', `/api/shipments/items/${it2.id}/sign`, 'operator', { result: 'pass', opId, clientAt, offline: true, userId: u.user.id, proof });
    assert.equal(r.status, 200);
    const row = r.body.items.find((i: any) => i.id === it2.id);
    assert.equal(row.done_by_name, 'Ira Inspector', 'attributed to the PIN holder, not the token holder');
    assert.equal(row.done_at, clientAt); assert.equal(row.done_offline, 1);
    assert.ok(Date.parse(row.done_received_at) > Date.parse(clientAt));
    const future = new Date(Date.now() + 3600_000).toISOString();
    const c2 = [crypto.randomUUID(), 'sign', byText('Photo: packaged').id, 'pass', '', '', future, ''].join('|');
    const f = await api('POST', `/api/shipments/items/${byText('Photo: packaged').id}/sign`, 'operator', { result: 'pass', opId: c2.split('|')[0], clientAt: future, offline: true, userId: u.user.id, proof: crypto.createHmac('sha256', key).update(c2).digest('hex') });
    assert.equal(f.status, 400, 'future device clock rejected');
  });

  it('a FAIL auto-raises a flag and notifies QC, without blocking other work', async () => {
    await refresh();
    const it3 = byText('No gouges');
    const r = await api('POST', `/api/shipments/items/${it3.id}/sign`, 'operator', { result: 'fail', pin: pins.operator, note: 'Deep scratch on tank shell' });
    assert.equal(r.status, 200);
    assert.equal(r.body.flags.length, 1);
    assert.equal(r.body.flags[0].status, 'open');
    const n = await api('GET', '/api/notifications', 'manager');
    assert.ok(n.body.some((x: any) => x.kind === 'flag' && /Deep scratch/.test(x.body)));
  });

  it('resolving the flag on a failed item (with a disposition) closes that blocker but keeps the FAIL on record', async () => {
    const before = await api('GET', `/api/shipments/${shipId}/readiness`, 'manager');
    assert.ok(before.body.blockers.some((b: any) => b.type === 'failed'));
    const d = await refresh();
    const flag = d.flags.find((f: any) => f.item_id === byText('No gouges').id);
    assert.equal((await api('POST', `/api/shipments/flags/${flag.id}/resolve`, 'inspector', { pin: pins.inspector, disposition: 'rework', resolution: 'Polished out, re-inspected OK' })).status, 200);
    const after = await api('GET', `/api/shipments/${shipId}/readiness`, 'manager');
    assert.ok(!after.body.blockers.some((b: any) => b.type === 'failed' || b.type === 'flag'));
    assert.equal(byText('No gouges').status, 'fail', 'sign-off history is not rewritten');
    assert.equal((await api('POST', `/api/shipments/flags/${flag.id}/resolve`, 'inspector', { pin: pins.inspector, disposition: 'rework', resolution: 'again' })).status, 409);
  });

  it('records materials with heat numbers and lets you search by heat', async () => {
    const m = await api('POST', `/api/shipments/${shipId}/materials`, 'operator', { category: 'consumable', name: 'ER316L filler wire 0.035', heat_lot: 'LOT-ER-9981', qty: 2, unit: 'lb' });
    assert.equal(m.status, 201);
    const s = await api('GET', '/api/shipments?q=LOT-ER-9981', 'manager');
    assert.equal(s.body.length, 1);
    const s2 = await api('GET', '/api/shipments?q=H12345', 'manager');
    assert.equal(s2.body.length, 1, 'part heat number searchable');
  });

  it('saves every logistics field, rejects unknown fields, and locks header fields after release', async () => {
    const lg = { carrier: 'Heavy Haul Inc', equipment_type: 'Step-deck', truck_no: 'T-118', trailer_no: 'SD-2207', driver_name: 'Dan Driver', driver_id_no: 'CDL-5521', bol_no: 'BOL-1', pro_no: 'PRO-9', seal_no: 'S-77', permit_no: 'OH-1, PA-2', escort_required: true, rigging_notes: 'Spreader bar', tiedown_notes: '6 straps' };
    const r = await api('PATCH', `/api/shipments/${shipId}`, 'shipping', lg);
    assert.equal(r.status, 200);
    for (const [k, v] of Object.entries(lg)) assert.equal(r.body.shipment[k], typeof v === 'boolean' ? 1 : v, k);
    assert.equal((await api('PATCH', `/api/shipments/${shipId}`, 'shipping', { not_a_field: 1 })).status, 400);
  });

  it('records pickup with time, place and GPS; departing unreleased raises a critical flag', async () => {
    const e = await api('POST', `/api/shipments/${shipId}/events`, 'shipping', { type: 'loaded', location: 'Dock 3', lat: 41.88, lng: -87.63, accuracy_m: 8 });
    assert.equal(e.status, 201);
    const sig = 'data:image/png;base64,' + Buffer.from('x').toString('base64');
    const p = await api('POST', `/api/shipments/${shipId}/events`, 'shipping', { type: 'picked_up', location: 'Dock 3', person_name: 'Dan Driver', signature_png: sig });
    assert.equal(p.status, 201);
    assert.ok(p.body.flags.some((f: any) => /WITHOUT a QC release/.test(f.description) && f.severity === 'critical'));
    assert.equal(p.body.shipment.status, 'shipped');
  });

  it('release is manager-only, PIN-gated, and a soft gate that records overrides', async () => {
    const mk = await api('POST', '/api/shipments', 'shipping', { job_no: 'J-2', customer: 'Beta Brewing', templateIds: [1] });
    const id = mk.body.shipment.id;
    assert.equal((await api('POST', `/api/shipments/${id}/release`, 'inspector', { pin: pins.inspector })).status, 403);
    const blocked = await api('POST', `/api/shipments/${id}/release`, 'manager', { pin: pins.manager });
    assert.equal(blocked.status, 409); assert.ok(blocked.body.detail.blockers.length > 5);
    assert.equal((await api('POST', `/api/shipments/${id}/release`, 'manager', { pin: '9999', overrideReason: 'Customer expedite approved' })).status, 403);
    const ov = await api('POST', `/api/shipments/${id}/release`, 'manager', { pin: pins.manager, overrideReason: 'Customer expedite approved by J. Smith' });
    assert.equal(ov.status, 200);
    assert.equal(ov.body.shipment.status, 'released');
    assert.match(ov.body.shipment.release_override_reason, /expedite/);
    assert.equal((await sign('operator', ov.body.items[0].id)).status, 409, 'checklist locks after release');
    const log = await api('GET', `/api/shipments/${id}/audit`, 'manager');
    assert.ok(log.body.some((a: any) => a.action === 'shipment.release_override'));
    const re = await api('POST', `/api/shipments/${id}/reopen`, 'manager', { pin: pins.manager, reason: 'Found missed item' });
    assert.equal(re.body.shipment.status, 'in_progress');
  });

  it('produces a PDF release package', async () => {
    const r = await api('GET', `/api/shipments/${shipId}/package.pdf`, 'manager', undefined, true) as Response;
    assert.equal(r.status, 200);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    assert.ok(buf.length > 5000);
  });

  it('audit log is append-only and its hash chain verifies — and detects tampering', async () => {
    const v = await api('GET', '/api/audit/verify', 'auditor');
    assert.equal(v.body.ok, true); assert.ok(v.body.count > 15, `chain has ${v.body.count} entries`);
    const { db } = await import('../src/db.js');
    assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id=1').run(), /append-only/);
    assert.throws(() => db.prepare("UPDATE audit_log SET user_name='x' WHERE id=1").run(), /append-only/);
    db.exec('DROP TRIGGER audit_no_update');
    db.prepare("UPDATE audit_log SET user_name='Mallory' WHERE id=3").run();
    const v2 = await api('GET', '/api/audit/verify', 'auditor');
    assert.equal(v2.body.ok, false); assert.equal(v2.body.brokenAt, 3);
  });

  it('exports CSV and neutralises spreadsheet formulas', async () => {
    await api('POST', `/api/shipments/${shipId}/flags`, 'inspector', { description: '=HYPERLINK("http://evil")', severity: 'minor' });
    const r = await api('GET', '/api/export/shipments.csv', 'auditor', undefined, true) as Response;
    assert.equal(r.status, 200);
    assert.match(await r.text(), /shipment_no,job_no/);
    assert.equal((await api('GET', '/api/export/shipments.csv', 'operator', undefined, true) as Response).status, 403);
    const { toCsv } = await import('../src/util.js');
    assert.match(toCsv([{ a: '=1+1' }]), /'=1\+1/);
  });
});
