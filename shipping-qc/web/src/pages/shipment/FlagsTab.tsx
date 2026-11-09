import { useState } from 'react';
import { Badge, ErrorBox, Modal, PinField } from '../../components/ui';
import { get, post } from '../../lib/api';
import { CapaDialog } from '../Capa';
import { useEffect } from 'react';
import { fmtDT } from '../../lib/format';
import type { TabProps } from './types';

const DISP = [['rework', 'Rework'], ['repair', 'Repair'], ['use_as_is', 'Use as is (customer / engineering approved)'], ['scrap', 'Scrap / remake'], ['no_action', 'No action — false alarm'], ['other', 'Other']];

export default function FlagsTab(p: TabProps) {
  const { d } = p;
  const [text, setText] = useState(''); const [sev, setSev] = useState('major'); const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null); const [capaFor, setCapaFor] = useState<any>(null); const [users, setUsers] = useState<any[]>([]); const [capas, setCapas] = useState<any[]>([]);
  const loadCapas = () => get<any[]>(`/capas?shipment=${d.shipment.id}`).then(r => setCapas(r.data)).catch(() => {});
  useEffect(() => { loadCapas(); get<any[]>('/users').then(r => setUsers(r.data)).catch(() => {}); /* eslint-disable-next-line */ }, [d.flags.length]);
  return (
    <div className="stack">
      <div className="note">Failed checklist items raise a flag automatically and notify the QC team. Flags don’t stop work, but open flags are listed as blockers at release and printed on the release package.</div>
      {p.role !== 'auditor' && (
        <form className="card stack" onSubmit={async e => { e.preventDefault(); setErr(null); try { p.setDetail(await post(`/shipments/${d.shipment.id}/flags`, { description: text, severity: sev })); setText(''); p.toast('Flag raised — QC notified', 'warn'); } catch (x: any) { setErr(x.message); } }}>
          <h2>Raise a flag</h2>
          <div className="grid g2"><label className="f">What’s wrong? *<textarea value={text} onChange={e => setText(e.target.value)} /></label>
            <label className="f">Severity<select value={sev} onChange={e => setSev(e.target.value)}><option value="minor">Minor — cosmetic / documentation</option><option value="major">Major — affects fit, finish or spec</option><option value="critical">Critical — safety / code / customer-stop</option></select></label></div>
          <ErrorBox error={err} /><div><button className="btn bad" disabled={text.trim().length < 3}>Raise flag & notify QC</button></div>
        </form>)}
      {d.flags.map(f => (
        <div key={f.id} className="card stack" style={{ borderLeft: `6px solid ${f.status === 'open' ? 'var(--bad)' : 'var(--ok)'}` }}>
          <div className="row"><Badge kind={f.status} /><Badge kind={f.severity}>{f.severity}</Badge>{f.auto ? <span className="chip">auto-raised</span> : null}<span className="muted small right">{fmtDT(f.raised_at)} · {f.raised_by_name}</span></div>
          <div>{f.description}</div>
          {f.status === 'resolved' && <div className="sig"><div><b>{DISP.find(x => x[0] === f.disposition)?.[1]}</b> — {f.resolution}</div><div>✔ {f.resolved_by_name} — {fmtDT(f.resolved_at)}</div></div>}
          {f.status === 'open' && (p.role === 'manager' || (p.role === 'inspector' && f.severity !== 'critical')) && <div><button className="btn" onClick={() => setRes(f)}>Resolve with disposition…</button></div>}
          {(p.role === 'manager' || p.role === 'inspector') && !capas.some(c => c.flag_id === f.id) && <div><button className="btn sm ghost" onClick={() => setCapaFor(f)}>Open a CAPA for this flag…</button></div>}
          {capas.filter(c => c.flag_id === f.id).map(c => <div key={c.id} className="small">⚙ <a href="/capa">{c.capa_no}</a> — {c.status.replace('_', ' ')}</div>)}
          {f.status === 'open' && f.severity === 'critical' && p.role !== 'manager' && <div className="muted small">Critical flags are resolved by a QC manager.</div>}
        </div>))}
      {d.flags.length === 0 && <div className="card empty">No flags on this shipment.</div>}
      {capaFor && <CapaDialog capa={{ _new: true, title: capaFor.description.slice(0, 120), description: capaFor.description, shipment_id: d.shipment.id }} flagId={capaFor.id} users={users} onClose={() => setCapaFor(null)} onSaved={() => { setCapaFor(null); loadCapas(); p.toast('CAPA opened', 'ok'); }} />}
      {res && <ResolveDialog flag={res} p={p} onClose={() => setRes(null)} />}
    </div>
  );
}

function ResolveDialog({ flag, p, onClose }: { flag: any; p: TabProps; onClose: () => void }) {
  const [disposition, setD] = useState('rework'); const [resolution, setR] = useState(''); const [pin, setPin] = useState(''); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Resolve flag" onClose={onClose}>
      <div>{flag.description}</div>
      <label className="f">Disposition<select value={disposition} onChange={e => setD(e.target.value)}>{DISP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="f">What was done / decided? *<textarea value={resolution} onChange={e => setR(e.target.value)} /></label>
      <PinField value={pin} onChange={setPin} />
      <ErrorBox error={err} />
      <button className="btn ok big" disabled={pin.length < 4 || resolution.trim().length < 3} onClick={async () => {
        try { p.setDetail(await post(`/shipments/flags/${flag.id}/resolve`, { pin, disposition, resolution })); p.toast('Flag resolved', 'ok'); onClose(); } catch (e: any) { setErr(e.message); }
      }}>Sign & resolve</button>
    </Modal>
  );
}
