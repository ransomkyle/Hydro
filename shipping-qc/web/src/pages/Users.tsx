import { useEffect, useState } from 'react';
import { Badge, ErrorBox, Modal, useToast } from '../components/ui';
import { get, patch, post } from '../lib/api';
import { ROLE_LABEL } from '../lib/format';

const blank = { username: '', name: '', role: 'operator', password: '', pin: '', email: '' };

export default function Users() {
  const toast = useToast(); const [rows, setRows] = useState<any[]>([]); const [add, setAdd] = useState(false); const [f, setF] = useState(blank); const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null); const [pw, setPw] = useState(''); const [pin, setPin] = useState('');
  const load = () => get<any[]>('/users').then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  return (
    <div className="stack">
      <div className="row"><h1>Users</h1><button className="btn primary right" onClick={() => { setF(blank); setErr(null); setAdd(true); }}>+ Add user</button></div>
      <div className="note">Everyone signs off under their <b>own</b> account. Each person sets a 4–8 digit PIN that is re-entered for every sign-off. Don’t share accounts or PINs — the audit trail attributes every action to the account.</div>
      <div className="card flush scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Email</th><th>PIN</th><th>2FA</th><th /></tr></thead>
        <tbody>{rows.map(u => <tr key={u.id} style={{ opacity: u.active ? 1 : .5 }}><td><b>{u.name}</b></td><td className="mono small">{u.username}</td><td>{ROLE_LABEL[u.role]}</td><td className="small muted">{u.email ?? '—'}</td><td>{u.has_pin ? <Badge kind="released">set</Badge> : <Badge kind="major">not set</Badge>}</td><td>{u.totp_enabled ? <Badge kind="released">on</Badge> : <span className="muted small">off</span>}</td>
          <td><button className="btn sm" onClick={() => { setEdit(u); setPw(''); setPin(''); setErr(null); }}>Edit</button></td></tr>)}</tbody></table></div>
      {add && (
        <Modal title="Add user" onClose={() => setAdd(false)}>
          <label className="f">Full name<input type="text" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label className="f">Username<input type="text" autoCapitalize="none" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></label>
          <label className="f">Role<select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="f">Email (for alerts, optional)<input type="text" inputMode="email" autoCapitalize="none" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label className="f">Temporary password (min 10 — they must change it at first sign-in)<input type="text" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
          <label className="f">Starting PIN (4–8 digits, user can change it)<input type="text" inputMode="numeric" value={f.pin} onChange={e => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></label>
          <ErrorBox error={err} />
          <button className="btn primary" disabled={!f.name || !f.username || f.password.length < 10} onClick={async () => { try { await post('/users', { ...f, pin: f.pin || undefined, email: f.email || undefined }); toast('User created', 'ok'); setAdd(false); load(); } catch (e: any) { setErr(e.message); } }}>Create</button>
        </Modal>)}
      {edit && (
        <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <label className="f">Role<select value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={!!edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked ? 1 : 0 })} />Active (can sign in)</label>
          <label className="f">Email<input type="text" inputMode="email" autoCapitalize="none" value={edit.email ?? ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></label>
          <label className="f">Reset password (leave blank to keep; user must change it at next sign-in)<input type="text" value={pw} onChange={e => setPw(e.target.value)} /></label>
          <label className="f">Reset PIN (leave blank to keep)<input type="text" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label>
          {edit.totp_enabled ? <label className="check"><input type="checkbox" checked={!!edit.resetMfa} onChange={e => setEdit({ ...edit, resetMfa: e.target.checked })} />Reset two-factor sign-in (lost phone) — the user is alerted</label> : null}
          <ErrorBox error={err} />
          <button className="btn primary" onClick={async () => { try { await patch(`/users/${edit.id}`, { role: edit.role, active: !!edit.active, password: pw || undefined, pin: pin || undefined, email: edit.email ?? '', resetMfa: edit.resetMfa || undefined }); toast('Saved', 'ok'); setEdit(null); load(); } catch (e: any) { setErr(e.message); } }}>Save</button>
        </Modal>)}
    </div>
  );
}
