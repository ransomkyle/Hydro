import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { STATUS_LABEL, fmtShort } from '../lib/format';
import { useMeta } from '../lib/useMeta';
import { ScanButton } from '../components/Scanner';

export default function Shipments() {
  const [sp, setSp] = useSearchParams(); const nav = useNavigate(); const { can } = useAuth(); const meta = useMeta();
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [stale, setStale] = useState(false);
  const q = sp.get('q') ?? '', status = sp.get('status') ?? '', flags = sp.get('flags') ?? '', active = sp.get('active') ?? '', plant = sp.get('plant') ?? '';
  const [text, setText] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(); if (q) qs.set('q', q); if (status) qs.set('status', status); if (flags) qs.set('flags', flags); if (active) qs.set('active', active); if (plant) qs.set('plant', plant);
      get<any[]>('/shipments?' + qs).then(r => { setRows(r.data); setStale(r.stale); setErr(''); }).catch(e => setErr(e.message));
    }, 150);
    return () => clearTimeout(t);
  }, [q, status, flags, active, plant]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return (
    <div className="stack">
      <div className="row"><h1>Shipments</h1>{can('shipping', 'inspector', 'manager', 'admin') && <span className="right row"><Link className="btn" to="/import">Import CSV</Link><Link className="btn primary" to="/shipments/new">+ New shipment</Link></span>}</div>
      <div className="card row">
        <input type="search" className="grow" style={{ minWidth: 220 }} placeholder="Search shipment #, job, PO, customer, BOL, heat/lot #, part #…" value={text}
          onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && set('q', text)} onBlur={() => set('q', text)} />
        <ScanButton onScan={async v => { try { const r = await get<any[]>('/shipments?q=' + encodeURIComponent(v)); const hit = r.data.find(s => s.shipment_no === v) ?? (r.data.length === 1 ? r.data[0] : null); if (hit) nav(`/shipments/${hit.id}`); else { setText(v); set('q', v); } } catch { setText(v); set('q', v); } }} />
        {meta.plants.length > 1 && <select aria-label="Filter by plant" style={{ width: 'auto' }} value={plant} onChange={e => set('plant', e.target.value)}><option value="">All plants</option>{meta.plants.map(p => <option key={p}>{p}</option>)}</select>}
        <select aria-label="Filter by status" style={{ width: 'auto' }} value={status} onChange={e => set('status', e.target.value)}>
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={flags === '1'} onChange={e => set('flags', e.target.checked ? '1' : '')} />Open flags</label>
      </div>
      {stale && <div className="note warn">Showing the last list saved on this device (offline).</div>}
      {err && <div className="err">{err}</div>}
      <div className="card flush scroll-x">
        <table className="tbl">
          <thead><tr><th>Shipment</th><th>Customer / Job</th><th className="hide-sm">Pickup</th><th>Checklist</th><th>Status</th></tr></thead>
          <tbody>
            {rows?.map(s => (
              <tr key={s.id} className="click" onClick={() => nav(`/shipments/${s.id}`)}>
                <td><b>{s.shipment_no}</b><div className="muted tiny">{s.plant ? s.plant + ' · ' : ''}{s.size_class}{s.is_sanitary ? ' · sanitary' : ''}{s.is_pressure ? ' · pressure' : ''}</div></td>
                <td>{s.customer}<div className="muted small">Job {s.job_no}{s.po_no ? ` · PO ${s.po_no}` : ''}</div></td>
                <td className="hide-sm small">{s.pickup_appt ? fmtShort(s.pickup_appt) : '—'}</td>
                <td style={{ minWidth: 120 }}><div className="progress"><i style={{ width: `${s.items_total ? (100 * s.items_done) / s.items_total : 0}%` }} /></div><div className="tiny muted">{s.items_done}/{s.items_total}</div></td>
                <td><Badge kind={s.status} />{s.open_flags > 0 && <> <Badge kind="critical">⚑ {s.open_flags}</Badge></>}</td>
              </tr>))}
            {rows && rows.length === 0 && <tr><td colSpan={5} className="empty">No shipments match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
