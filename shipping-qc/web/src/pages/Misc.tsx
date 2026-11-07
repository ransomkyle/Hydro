import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ErrorBox, PinField, useToast } from '../components/ui';
import { discardOp, listOps, onOutboxChange, type Op } from '../lib/outbox';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, fmtDT } from '../lib/format';

export function Notifications() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => get<any[]>('/notifications').then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  return (
    <div className="stack">
      <div className="row"><h1>Notifications</h1><button className="btn sm right" onClick={async () => { await post('/notifications/read', {}); load(); }}>Mark all read</button></div>
      <div className="card flush">{rows.map(n => (
        <div key={n.id} className="card-h" style={{ background: n.read_at ? undefined : '#f3f8fd', alignItems: 'flex-start' }}>
          <div className="grow"><b>{n.title}</b><div className="small">{n.body}</div><div className="muted tiny">{fmtDT(n.created_at)}</div></div>
          {n.shipment_id && <Link className="btn sm" to={`/shipments/${n.shipment_id}${n.kind === 'flag' ? '?tab=flags' : ''}`} onClick={() => post('/notifications/read', { ids: [n.id] })}>Open</Link>}
        </div>))}
        {rows.length === 0 && <div className="empty">Nothing yet.</div>}</div>
    </div>
  );
}

export function Account() {
  const { user, refreshMe, pending, online, syncNow, logout } = useAuth(); const toast = useToast();
  const [pw, setPw] = useState(''); const [pin, setPin] = useState(''); const [pin2, setPin2] = useState(''); const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [perr, setPerr] = useState<string | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  useEffect(() => { const l = () => listOps().then(setOps); l(); return onOutboxChange(l); }, []);
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>My account</h1>
      <div className="card"><b>{user!.name}</b> · {ROLE_LABEL[user!.role]} · <span className="mono">{user!.username}</span></div>
      <section className="card stack">
        <h2>Sign-off PIN {user!.hasPin ? <Badge kind="released">set</Badge> : <Badge kind="major">not set</Badge>}</h2>
        <div className="muted small">You’ll enter this PIN for every sign-off. It proves it was you at the tablet. Set it while online — it also lets you sign off while offline.</div>
        <div className="grid g3">
          <label className="f">Account password<input type="password" value={pw} onChange={e => setPw(e.target.value)} /></label>
          <PinField value={pin} onChange={setPin} label="New PIN (4–8 digits)" /><PinField value={pin2} onChange={setPin2} label="Repeat PIN" />
        </div>
        <ErrorBox error={err} />
        <div><button className="btn primary" disabled={!pw || pin.length < 4 || pin !== pin2} onClick={async () => { setErr(null); try { await post('/auth/pin', { password: pw, pin }); toast('PIN saved', 'ok'); setPw(''); setPin(''); setPin2(''); refreshMe(); } catch (e: any) { setErr(e.message); } }}>Save PIN</button></div>
      </section>
      <section className="card stack">
        <h2>Change password</h2>
        <div className="grid g2"><label className="f">Current<input type="password" value={cur} onChange={e => setCur(e.target.value)} /></label><label className="f">New (min 8)<input type="password" value={next} onChange={e => setNext(e.target.value)} /></label></div>
        <ErrorBox error={perr} />
        <div><button className="btn" disabled={!cur || next.length < 8} onClick={async () => { setPerr(null); try { await post('/auth/password', { current: cur, next }); toast('Password changed', 'ok'); setCur(''); setNext(''); } catch (e: any) { setPerr(e.message); } }}>Change password</button></div>
      </section>
      <section className="card stack">
        <div className="row"><h2 style={{ margin: 0 }}>Saved on this device (offline queue)</h2>{pending > 0 && online && <button className="btn sm" onClick={syncNow}>Sync now</button>}</div>
        {ops.length === 0 ? <div className="muted">Nothing waiting — everything is synced.</div> : ops.map(o => (
          <div key={o.id} className="sig"><div><b>{o.label}</b></div><div>{o.userName} · {fmtDT(o.clientAt)} {o.status === 'rejected' ? <Badge kind="rejected">rejected</Badge> : <Badge kind="offline">waiting</Badge>}</div>
            {o.error && <div style={{ color: 'var(--bad)' }}>Server said: {o.error}</div>}
            {o.status === 'rejected' && <div><button className="btn sm" onClick={() => discardOp(o.id)}>Discard</button></div>}</div>))}
      </section>
      <div><button className="btn" onClick={logout}>Sign out</button></div>
    </div>
  );
}
