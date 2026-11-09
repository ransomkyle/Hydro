import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

process.env.QC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-perf-'));
process.env.QC_DEMO = '1';
let base = ''; let server: any; let tok = '';
const call = async (m: string, u: string, b?: any) => { const t0 = performance.now(); const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); return { s: r.status, j, ms: performance.now() - t0 }; };

before(async () => {
  const { seed } = await import('../src/seed.js'); const { createApp } = await import('../src/app.js'); seed({ demoUsers: true });
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
  tok = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'shipping', password: 'changeme123' }) })).json() as any).token;
});
after(() => server?.close());

describe('scale (a busy shop: 400 shipments, ~19k checklist items)', () => {
  it('keeps list, search, dashboard and reports fast', async () => {
    const tpl = (await call('GET', '/api/templates')).j.map((t: any) => t.id);
    for (let i = 0; i < 400; i++) { const r = await call('POST', '/api/shipments', { job_no: `J-${i}`, customer: `Customer ${i % 40}`, po_no: `PO-${i}`, templateIds: tpl.slice(0, 3), parts: [{ part_no: `P${i}`, qty: 1, heat_no: `H${i}` }] }); assert.equal(r.s, 201); }
    // worst case for the dashboard: every shipment in progress, so readiness is computed for each
    const { db } = await import('../src/db.js'); db.prepare("UPDATE shipments SET status='in_progress'").run();
    const list = await call('GET', '/api/shipments'); assert.equal(list.s, 200);
    const search = await call('GET', '/api/shipments?q=H399'); assert.equal(search.j.length, 1);
    const dash = await call('GET', '/api/dashboard');
    const rep = await call('GET', '/api/reports/summary');
    console.log(`  list ${list.ms.toFixed(0)}ms (${list.j.length} rows) · heat search ${search.ms.toFixed(0)}ms · dashboard ${dash.ms.toFixed(0)}ms · reports ${rep.ms.toFixed(0)}ms`);
    for (const [n, ms] of [['list', list.ms], ['search', search.ms], ['dashboard', dash.ms], ['reports', rep.ms]] as const) assert.ok(ms < 1500, `${n} took ${ms.toFixed(0)}ms`);
  });
});
