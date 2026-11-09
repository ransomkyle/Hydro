import { useEffect, useState } from 'react';
import { Badge, ErrorBox, Modal, useToast } from '../components/ui';
import { get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMeta } from '../lib/useMeta';

const blank = { gauge_no: '', description: '', plant: '', cal_date: '', cal_due: '', cal_cert: '', status: 'active' };

export default function Gauges() {
  const { can } = useAuth(); const toast = useToast(); const meta = useMeta();
  const [rows, setRows] = useState<any[]>([]); const [edit, setEdit] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const load = () => get<any[]>('/gauges').then(r => setRows(r.data)).catch(e => toast(e.message, 'bad'));
  useEffect(() => { load(); }, []);
  const mayEdit = can('inspector', 'manager', 'admin');
  const set = (k: string, v: string) => setEdit((x: any) => ({ ...x, [k]: v }));
  return (
    <div className="stack">
      <div className="row"><h1>Gauge calibration register</h1>{mayEdit && <button className="btn primary right" onClick={() => { setErr(null); setEdit({ ...blank, _new: true }); }}>+ Add gauge</button>}</div>
      <div className="note">Measurement items can record the gauge used. A sign-off using an <b>out-of-calibration</b>, out-of-service or unknown gauge is rejected (ISO 9001 §7.1.5). Update the due date here when a gauge is recalibrated.</div>
      <div className="card flush scroll-x"><table className="tbl"><thead><tr><th>Gauge</th><th>Description</th><th>Plant</th><th>Last cal</th><th>Due</th><th>Status</th>{mayEdit && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{rows.map(g => (
          <tr key={g.id}><td><b>{g.gauge_no}</b></td><td>{g.description}{g.cal_cert && <div className="muted tiny">Cert {g.cal_cert}</div>}</td><td>{g.plant ?? '—'}</td><td>{g.cal_date ?? '—'}</td>
            <td style={g.overdue ? { color: 'var(--bad)', fontWeight: 700 } : undefined}>{g.cal_due}</td>
            <td>{g.status !== 'active' ? <Badge kind="cancelled">{g.status.replace('_', ' ')}</Badge> : g.overdue ? <Badge kind="critical">OUT OF CAL</Badge> : g.due_soon ? <Badge kind="major">due soon</Badge> : <Badge kind="released">in cal</Badge>}</td>
            {mayEdit && <td><button className="btn sm" onClick={() => { setErr(null); setEdit({ ...blank, ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v ?? ''])) }); }}>Edit</button></td>}</tr>))}
          {rows.length === 0 && <tr><td colSpan={7} className="empty">No gauges registered yet.</td></tr>}</tbody></table></div>
      {edit && (
        <Modal title={edit._new ? 'Add gauge' : `Edit ${edit.gauge_no}`} onClose={() => setEdit(null)}>
          <div className="grid g2">
            <label className="f">Gauge # / ID *<input type="text" value={edit.gauge_no} onChange={e => set('gauge_no', e.target.value)} /></label>
            <label className="f">Plant<select value={edit.plant} onChange={e => set('plant', e.target.value)}><option value="">—</option>{meta.plants.map(p => <option key={p}>{p}</option>)}</select></label>
          </div>
          <label className="f">Description *<input type="text" value={edit.description} onChange={e => set('description', e.target.value)} placeholder="Surface profilometer, 0–50 µin" /></label>
          <div className="grid g2">
            <label className="f">Last calibrated<input type="date" value={edit.cal_date} onChange={e => set('cal_date', e.target.value)} /></label>
            <label className="f">Calibration due *<input type="date" value={edit.cal_due} onChange={e => set('cal_due', e.target.value)} /></label>
          </div>
          <label className="f">Calibration certificate #<input type="text" value={edit.cal_cert} onChange={e => set('cal_cert', e.target.value)} /></label>
          <label className="f">Status<select value={edit.status} onChange={e => set('status', e.target.value)}><option value="active">Active</option><option value="out_of_service">Out of service</option><option value="retired">Retired</option></select></label>
          <ErrorBox error={err} />
          <button className="btn primary" disabled={!edit.gauge_no || !edit.description || !edit.cal_due} onClick={async () => {
            setErr(null);
            const body = { gauge_no: edit.gauge_no, description: edit.description, plant: edit.plant || null, cal_date: edit.cal_date || null, cal_due: edit.cal_due, cal_cert: edit.cal_cert || null, status: edit.status };
            try { if (edit._new) await post('/gauges', body); else await put(`/gauges/${edit.id}`, body); toast('Saved', 'ok'); setEdit(null); load(); } catch (e: any) { setErr(e.message); }
          }}>Save</button>
        </Modal>)}
    </div>
  );
}
