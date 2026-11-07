import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { STATUS_LABEL } from '../lib/format';
import { useMeta } from '../lib/useMeta';

const RANGES: [string, string, number][] = [['30', 'Last 30 days', 30], ['90', 'Last 90 days', 90], ['365', 'Last 12 months', 365]];
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'warn' }) {
  return <div className="card kpi"><b style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--steel)' }}>{value}</b><span>{label}</span>{sub && <span className="tiny muted">{sub}</span>}</div>;
}
function Bars({ rows, color = 'var(--steel)' }: { rows: { label: string; n: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  if (!rows.length) return <div className="muted small">No data in this range.</div>;
  return <div className="stack" style={{ gap: '.4rem' }}>{rows.map(r => (
    <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,38%) 1fr 34px', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' }}>
      <span title={r.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
      <div style={{ background: '#e3e9ee', borderRadius: 4, height: 14 }}><div style={{ width: `${(100 * r.n) / max}%`, background: color, height: '100%', borderRadius: 4, minWidth: 3 }} /></div><b>{r.n}</b>
    </div>))}</div>;
}

export default function Reports() {
  const meta = useMeta();
  const [range, setRange] = useState('90'); const [plant, setPlant] = useState(''); const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => {
    const q = new URLSearchParams({ from: day(Number(range)) }); if (plant) q.set('plant', plant);
    get('/reports/summary?' + q).then(r => { setD(r.data); setErr(''); }).catch(e => setErr(e.message));
  }, [range, plant]);
  const pct = (v: number | null) => (v === null ? '—' : v + '%');
  return (
    <div className="stack">
      <div className="row"><h1>Quality reports</h1>
        <span className="right row">
          {meta.plants.length > 1 && <select aria-label="Plant" style={{ width: 'auto' }} value={plant} onChange={e => setPlant(e.target.value)}><option value="">All plants</option>{meta.plants.map(p => <option key={p}>{p}</option>)}</select>}
          <select aria-label="Date range" style={{ width: 'auto' }} value={range} onChange={e => setRange(e.target.value)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="btn sm" onClick={() => window.print()}>Print</button>
        </span></div>
      {err && <div className="err">{err}</div>}
      {!d ? <div className="muted">Loading…</div> : <>
        <div className="muted small">{d.range.from} to {d.range.to}{d.range.plant ? ` · ${d.range.plant}` : ''} — computed directly from the signed records.</div>
        <div className="grid g4">
          <Kpi label="Shipments created" value={String(d.totals.shipments)} sub={d.totals.byStatus.map((s: any) => `${s.n} ${STATUS_LABEL[s.status] ?? s.status}`).join(' · ')} />
          <Kpi label="First-pass release" value={pct(d.release.firstPassPct)} sub={`${d.release.count} released, no failed item or flag`} tone={d.release.firstPassPct !== null && d.release.firstPassPct < 80 ? 'warn' : 'ok'} />
          <Kpi label="On-time pickup" value={pct(d.pickups.onTimePct)} sub={`${d.pickups.onTime}/${d.pickups.measured} left within ${d.pickups.graceMin} min of appointment`} tone={d.pickups.onTimePct !== null && d.pickups.onTimePct < 90 ? 'warn' : 'ok'} />
          <Kpi label="Median time to release" value={d.release.medianHours === null ? '—' : d.release.medianHours + ' h'} sub="creation → QC release" />
          <Kpi label="Item failure rate" value={pct(d.items.failRatePer100)} sub={`${d.items.failed} failed of ${d.items.total} items`} tone={d.items.failed ? 'warn' : 'ok'} />
          <Kpi label="Released with override" value={String(d.release.withOverride)} tone={d.release.withOverride ? 'warn' : 'ok'} sub="manager released with open items" />
          <Kpi label="Left dock without release" value={String(d.departedUnreleased)} tone={d.departedUnreleased ? 'bad' : 'ok'} sub="critical escapes" />
          <Kpi label="Open flags" value={String(d.flags.open)} sub={`${d.flags.openOver7d} open over 7 days`} tone={d.flags.openOver7d ? 'bad' : undefined} />
          <Link to="/capa" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}><b style={{ color: d.capa.overdue ? 'var(--bad)' : 'var(--steel)' }}>{d.capa.open}</b><span>Open CAPAs</span><span className="tiny muted">{d.capa.overdue} overdue</span></Link>
          <Link to="/gauges" className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }}><b style={{ color: d.gauges.overdue ? 'var(--bad)' : 'var(--steel)' }}>{d.gauges.overdue}</b><span>Gauges out of calibration</span><span className="tiny muted">{d.gauges.dueSoon} due within 30 days</span></Link>
        </div>
        <div className="grid g2">
          <section className="card stack"><h2>Flags by checklist section</h2><Bars rows={d.flags.bySection.map((s: any) => ({ label: s.section, n: s.n }))} color="var(--brand-pink)" /></section>
          <section className="card stack"><h2>Released per month</h2><Bars rows={d.monthlyReleased.map((m: any) => ({ label: m.m, n: m.n }))} /></section>
          <section className="card stack"><h2>Flags by severity</h2><Bars rows={d.flags.bySeverity.map((s: any) => ({ label: s.severity, n: s.n }))} color="var(--warn)" /></section>
          <section className="card stack"><h2>Sign-offs by person</h2><Bars rows={d.topSigners.map((s: any) => ({ label: s.name, n: s.n }))} color="var(--brand-sky)" /></section>
        </div>
      </>}
    </div>
  );
}
