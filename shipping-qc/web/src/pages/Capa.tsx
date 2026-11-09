import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ErrorBox, Modal, PinField, useToast } from '../components/ui';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDT } from '../lib/format';

const blank = { title: '', description: '', containment: '', root_cause: '', corrective_action: '', preventive_action: '', owner_id: '' as any, due_date: '' };

export default function Capa() {
  const { can } = useAuth(); const toast = useToast();
  const [rows, setRows] = useState<any[]>([]); const [filter, setFilter] = useState('open'); const [users, setUsers] = useState<any[]>([]); const [sel, setSel] = useState<any>(null);
  const load = () => get<any[]>('/capas' + (filter === 'open' ? '?status=open' : '')).then(r => setRows(r.data)).catch(e => toast(e.message, 'bad'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => { get<any[]>('/users').then(r => setUsers(r.data)).catch(() => {}); }, []);
  const qc = can('inspector', 'manager');
  return (
    <div className="stack">
      <div className="row"><h1>Corrective & preventive actions</h1>{qc && <button className="btn primary right" onClick={() => setSel({ ...blank, _new: true })}>+ New CAPA</button>}</div>
      <div className="note">A flag records <i>what</i> went wrong. A CAPA records <i>why</i> it happened and what stops it recurring. Open one from any flag (Flags tab) or start one here. A QC manager closes it with PIN once the effectiveness check is done.</div>
      <div className="row"><select aria-label="Show CAPAs" style={{ width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Open</option><option value="all">All</option></select></div>
      <div className="card flush scroll-x"><table className="tbl"><thead><tr><th>CAPA</th><th>Title</th><th>Shipment</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>{rows.map(c => (
          <tr key={c.id} className="click" onClick={() => setSel(c)}><td><b>{c.capa_no}</b></td><td>{c.title}</td><td>{c.shipment_no ? <Link to={`/shipments/${c.shipment_id}`} onClick={e => e.stopPropagation()}>{c.shipment_no}</Link> : '—'}</td>
            <td>{c.owner_name ?? '—'}</td><td className={c.overdue ? '' : 'muted'} style={c.overdue ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{c.due_date ?? '—'}{c.overdue ? ' · overdue' : ''}</td><td><Badge kind={c.status === 'closed' ? 'released' : c.status === 'in_progress' ? 'in_progress' : 'open'}>{c.status.replace('_', ' ')}</Badge></td></tr>))}
          {rows.length === 0 && <tr><td colSpan={6} className="empty">No CAPAs.</td></tr>}</tbody></table></div>
      {sel && <CapaDialog capa={sel} users={users} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} />}
    </div>
  );
}

export function CapaDialog({ capa, users, onClose, onSaved, flagId }: { capa: any; users: any[]; onClose: () => void; onSaved: () => void; flagId?: number }) {
  const { can } = useAuth(); const toast = useToast();
  const isNew = !!capa._new; const closed = capa.status === 'closed';
  const [f, setF] = useState<any>({ ...blank, ...Object.fromEntries(Object.keys(blank).map(k => [k, capa[k] ?? (blank as any)[k]])) });
  const [err, setErr] = useState<string | null>(null); const [closing, setClosing] = useState(false); const [pin, setPin] = useState(''); const [eff, setEff] = useState('');
  const edit = can('inspector', 'manager') && !closed;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const body = () => ({ title: f.title, description: f.description || null, containment: f.containment || null, root_cause: f.root_cause || null, corrective_action: f.corrective_action || null,
    preventive_action: f.preventive_action || null, owner_id: f.owner_id ? Number(f.owner_id) : null, due_date: f.due_date || null });
  return (
    <Modal title={isNew ? 'New CAPA' : `${capa.capa_no}${closed ? ' (closed)' : ''}`} onClose={onClose} wide>
      {capa.flag_description && <div className="note">From flag: {capa.flag_description}</div>}
      <label className="f">Title *<input type="text" disabled={!edit} value={f.title} onChange={e => set('title', e.target.value)} /></label>
      <label className="f">What happened<textarea disabled={!edit} value={f.description} onChange={e => set('description', e.target.value)} /></label>
      <label className="f">Immediate containment (what was done to protect the customer)<textarea disabled={!edit} value={f.containment} onChange={e => set('containment', e.target.value)} /></label>
      <label className="f">Root cause <span className="muted">(required to close)</span><textarea disabled={!edit} value={f.root_cause} onChange={e => set('root_cause', e.target.value)} placeholder="Ask why until you reach something you can fix — not a person" /></label>
      <label className="f">Corrective action <span className="muted">(required to close)</span><textarea disabled={!edit} value={f.corrective_action} onChange={e => set('corrective_action', e.target.value)} /></label>
      <label className="f">Preventive action (so it can’t happen elsewhere)<textarea disabled={!edit} value={f.preventive_action} onChange={e => set('preventive_action', e.target.value)} /></label>
      <div className="grid g2">
        <label className="f">Owner<select disabled={!edit} value={f.owner_id ?? ''} onChange={e => set('owner_id', e.target.value)}><option value="">— unassigned —</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="f">Due date<input type="date" disabled={!edit} value={f.due_date ?? ''} onChange={e => set('due_date', e.target.value)} /></label>
      </div>
      {closed && <div className="sig"><div><b>Effectiveness check:</b> {capa.effectiveness_check}</div><div>✔ Closed by {capa.closed_by_name} — {fmtDT(capa.closed_at)}</div></div>}
      <ErrorBox error={err} />
      {edit && <button className="btn primary" disabled={f.title.trim().length < 3} onClick={async () => {
        setErr(null);
        try {
          if (isNew) await post('/capas', { ...body(), flag_id: flagId ?? undefined, shipment_id: capa.shipment_id ?? undefined }); else await patch(`/capas/${capa.id}`, body());
          toast(isNew ? 'CAPA opened' : 'Saved', 'ok'); onSaved();
        } catch (e: any) { setErr(e.message); }
      }}>{isNew ? 'Open CAPA' : 'Save changes'}</button>}
      {!isNew && !closed && can('manager') && (closing ? (
        <div className="stack card"><b>Close this CAPA</b>
          <label className="f">Effectiveness check — how do we know it worked? *<textarea value={eff} onChange={e => setEff(e.target.value)} /></label>
          <PinField value={pin} onChange={setPin} label="QC manager PIN" />
          <button className="btn ok" disabled={pin.length < 4 || eff.trim().length < 5} onClick={async () => {
            setErr(null);
            try { if (edit) await patch(`/capas/${capa.id}`, body()); await post(`/capas/${capa.id}/close`, { pin, effectiveness_check: eff }); toast('CAPA closed', 'ok'); onSaved(); } catch (e: any) { setErr(e.message); }
          }}>Sign & close CAPA</button></div>
      ) : <button className="btn" onClick={() => setClosing(true)}>Close CAPA…</button>)}
    </Modal>
  );
}
