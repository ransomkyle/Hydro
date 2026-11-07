import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui';
import { get } from '../lib/api';
import { STATUS_LABEL, fmtShort } from '../lib/format';

export default function Dashboard() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { get('/dashboard').then(r => setD(r.data)).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="muted">Loading…</div>;
  const n = (s: string) => d.counts.find((c: any) => c.status === s)?.n ?? 0;
  const al = d.alerts ?? {};
  return (
    <div className="stack">
      <h1>Dashboard</h1>
      {(al.capaOverdue > 0 || al.gaugesOverdue > 0 || al.gaugesDueSoon > 0 || al.templatesUnapproved > 0) && (
        <div className="card stack" style={{ borderLeft: '6px solid var(--warn)' }}>
          {al.gaugesOverdue > 0 && <div><b style={{ color: 'var(--bad)' }}>{al.gaugesOverdue} gauge(s) out of calibration</b> — sign-offs using them are blocked. <Link to="/gauges">Open register</Link></div>}
          {al.gaugesDueSoon > 0 && <div>{al.gaugesDueSoon} gauge(s) due for calibration within 30 days. <Link to="/gauges">Open register</Link></div>}
          {al.capaOverdue > 0 && <div><b style={{ color: 'var(--bad)' }}>{al.capaOverdue} CAPA(s) overdue.</b> <Link to="/capa">Review</Link></div>}
          {al.templatesUnapproved > 0 && <div>{al.templatesUnapproved} checklist template(s) are not approved yet. <Link to="/templates">Review & approve</Link></div>}
        </div>)}
      {d.verifyQueue?.length > 0 && (
        <section className="card flush">
          <div className="card-h"><h2>Waiting for your verification</h2><span className="muted small">Hold points signed by someone else</span></div>
          <table className="tbl"><tbody>{d.verifyQueue.map((v: any) => <tr key={v.item_id}><td><Link to={`/shipments/${v.shipment_id}`}><b>{v.shipment_no}</b></Link><div className="muted small">{v.customer}</div></td><td>{v.text}<div className="muted tiny">{v.section}</div></td><td className="small">{v.signed_by}<br />{fmtShort(v.done_at)}</td></tr>)}</tbody></table>
        </section>)}
      <div className="grid g4">
        {[['in_progress', 'In progress'], ['released', 'Released, awaiting pickup'], ['shipped', 'Shipped'], ['delivered', 'Delivered']].map(([s, l]) => (
          <Link key={s} to={`/shipments?status=${s}`} className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}><b>{n(s)}</b><span>{l}</span></Link>))}
        <Link to="/shipments?flags=1" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}><b style={{ color: d.openFlags.length ? 'var(--bad)' : undefined }}>{d.openFlags.length}</b><span>Open flags</span></Link>
        <Link to="/shipments?status=draft" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}><b>{n('draft')}</b><span>Draft</span></Link>
      </div>
      <div className="grid g2">
        <section className="card flush">
          <div className="card-h"><h2>Ready for QC manager release</h2></div>
          {d.readyForRelease.length === 0 ? <div className="empty">Nothing waiting.</div> :
            <table className="tbl"><tbody>{d.readyForRelease.map((s: any) => <tr key={s.id}><td><Link to={`/shipments/${s.id}`}><b>{s.shipment_no}</b></Link><div className="muted small">{s.customer}</div></td><td className="small">{s.pickup_appt ? 'Pickup ' + fmtShort(s.pickup_appt) : ''}</td></tr>)}</tbody></table>}
        </section>
        <section className="card flush">
          <div className="card-h"><h2>Upcoming pickups</h2></div>
          {d.upcoming.length === 0 ? <div className="empty">No pickups scheduled.</div> :
            <table className="tbl"><tbody>{d.upcoming.map((s: any) => <tr key={s.id}><td><Link to={`/shipments/${s.id}`}><b>{s.shipment_no}</b></Link><div className="muted small">{s.customer}</div></td><td className="small">{fmtShort(s.pickup_appt)}</td><td><Badge kind={s.status} /></td></tr>)}</tbody></table>}
        </section>
      </div>
      <section className="card flush">
        <div className="card-h"><h2>Open flags</h2><span className="muted small">Raised automatically on any failed item; resolve with a disposition.</span></div>
        {d.openFlags.length === 0 ? <div className="empty">No open flags.</div> :
          <table className="tbl"><tbody>{d.openFlags.map((f: any) => <tr key={f.id}><td><Badge kind={f.severity}>{f.severity}</Badge></td><td><Link to={`/shipments/${f.shipment_id}?tab=flags`}><b>{f.shipment_no}</b></Link> <span className="muted small">{f.customer}</span><div>{f.description}</div></td><td className="small muted">{fmtShort(f.raised_at)}</td></tr>)}</tbody></table>}
      </section>
      <section className="card flush">
        <div className="card-h"><h2>Recent activity</h2></div>
        <table className="tbl"><tbody>{d.recent.map((a: any) => <tr key={a.id}><td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtShort(a.at)}</td><td>{a.user_name}</td><td className="mono small">{a.action}</td><td>{a.shipment_id ? <Link to={`/shipments/${a.shipment_id}`}>{a.shipment_no}</Link> : ''}</td></tr>)}</tbody></table>
      </section>
      <div className="muted small">Statuses: {Object.values(STATUS_LABEL).join(' · ')}</div>
    </div>
  );
}
