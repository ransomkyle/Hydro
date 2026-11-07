import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, useToast } from '../components/ui';
import { download, get } from '../lib/api';
import { fmtDT } from '../lib/format';
import { summarize } from './shipment/HistoryTab';

export default function AuditReports() {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]); const [f, setF] = useState({ user: '', action: '', from: '', to: '', offline: '' });
  const [chain, setChain] = useState<any>(null); const [anchor, setAnchor] = useState<any>(null); const [heat, setHeat] = useState(''); const [cust, setCust] = useState('');
  const qs = () => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const load = () => get<any[]>('/audit?' + qs()).then(r => setRows(r.data)).catch(e => toast(e.message, 'bad'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const dl = (path: string, name: string) => download(path, name).catch(e => toast(e.message, 'bad'));
  return (
    <div className="stack">
      <h1>Audit & reports</h1>
      <section className="card stack">
        <h2>Exports (CSV — opens in Excel)</h2>
        <div className="grid g3">
          <label className="f">Customer filter<input type="text" value={cust} onChange={e => setCust(e.target.value)} /></label>
          <label className="f">Heat / lot # filter (materials)<input type="text" value={heat} onChange={e => setHeat(e.target.value)} /></label>
        </div>
        <div className="row">
          <button className="btn" onClick={() => dl('/export/shipments.csv' + (cust ? `?customer=${encodeURIComponent(cust)}` : ''), 'shipments.csv')}>Shipments & timestamps</button>
          <button className="btn" onClick={() => dl('/export/signoffs.csv', 'signoffs.csv')}>Every sign-off (who / when)</button>
          <button className="btn" onClick={() => dl('/export/materials.csv' + (heat ? `?heat=${encodeURIComponent(heat)}` : ''), 'materials.csv')}>Materials & heat traceability</button>
          <button className="btn" onClick={() => dl('/audit.csv?' + qs(), 'audit-log.csv')}>Audit log (filtered below)</button>
        </div>
        <div className="muted small">To trace a heat number to the shipments it went into, search it on the <Link to="/shipments">Shipments</Link> page.</div>
      </section>
      <section className="card stack">
        <div className="row"><h2 style={{ margin: 0 }}>Tamper check</h2>
          <button className="btn sm" onClick={() => get('/audit/verify').then(r => setChain(r.data))}>Verify audit chain</button>
          {chain && (chain.ok ? <Badge kind="released">✔ {chain.count} entries intact</Badge> : <Badge kind="critical">✖ chain broken at entry #{chain.brokenAt}</Badge>)}</div>
        <div className="row"><button className="btn sm" onClick={() => get('/audit/anchor').then(r => setAnchor(r.data))}>Show audit anchor</button>{anchor && <span className="mono small" style={{ wordBreak: 'break-all' }}>{anchor.entries} entries · {anchor.lastHash} · {new Date(anchor.generatedAt).toLocaleString()}</span>}</div>
        {anchor && <div className="muted small">Print or email this line weekly and keep it somewhere independent of the server. If someone ever rewrites history, the chain will no longer match the anchors you saved.</div>}
        <div className="muted small">Each audit entry includes a hash of the one before it, and the database refuses edits and deletes, so any alteration is detectable.</div>
      </section>
      <section className="card flush">
        <div className="card-h">
          <input type="text" aria-label="Filter by user" placeholder="User" style={{ width: 140 }} value={f.user} onChange={e => setF({ ...f, user: e.target.value })} />
          <input type="text" aria-label="Filter by action" placeholder="Action (e.g. item.pass)" style={{ width: 190 }} value={f.action} onChange={e => setF({ ...f, action: e.target.value })} />
          <input type="date" aria-label="From date" style={{ width: 160 }} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /><input type="date" aria-label="To date" style={{ width: 160 }} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} />
          <label className="check"><input type="checkbox" checked={f.offline === '1'} onChange={e => setF({ ...f, offline: e.target.checked ? '1' : '' })} />Offline only</label>
          <button className="btn sm primary" onClick={load}>Filter</button>
        </div>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Shipment</th><th>Detail</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.event_at ?? r.at)}{r.offline ? <> <Badge kind="offline">offline</Badge></> : null}</td><td>{r.user_name}</td><td className="mono small">{r.action}</td>
            <td>{r.shipment_id ? <Link to={`/shipments/${r.shipment_id}?tab=history`}>{r.shipment_no}</Link> : ''}</td><td className="small muted">{summarize(r.detail)}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">No entries.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
