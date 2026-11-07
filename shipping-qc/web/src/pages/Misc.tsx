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
  const { user, refreshMe, pending, online, syncNow, logout, adopt } = useAuth(); const toast = useToast();
  const [email, setEmail] = useState(user!.email ?? ''); const [eerr, setEerr] = useState<string | null>(null);
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
      <MfaSection />
      <section className="card stack">
        <h2>Email for alerts</h2>
        <div className="muted small">Flags, failed items, overrides, and CAPAs assigned to you are emailed here (if the server has email set up).</div>
        <label className="f">Email address<input type="text" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <ErrorBox error={eerr} />
        <div><button className="btn" onClick={async () => { setEerr(null); try { await post('/auth/email', { email: email.trim() }); toast('Email saved', 'ok'); refreshMe(); } catch (e: any) { setEerr(e.message); } }}>Save email</button></div>
      </section>
      <section className="card stack">
        <h2>Change password</h2>
        <div className="muted small">At least 10 characters, not a common password, not containing your username. Changing it signs you out of other devices.</div>
        <div className="grid g2"><label className="f">Current<input type="password" value={cur} onChange={e => setCur(e.target.value)} /></label><label className="f">New (min 10)<input type="password" value={next} onChange={e => setNext(e.target.value)} /></label></div>
        <ErrorBox error={perr} />
        <div><button className="btn" disabled={!cur || next.length < 10} onClick={async () => { setPerr(null); try { const r = await post('/auth/password', { current: cur, next }); adopt({ token: r.token, user: r.user, pinSalt: r.pinSalt, pinVerifier: r.pinVerifier }); toast('Password changed', 'ok'); setCur(''); setNext(''); } catch (e: any) { setPerr(e.message); } }}>Change password</button></div>
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

function MfaSection() {
  const { user, refreshMe } = useAuth(); const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null); const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null);
  const on = !!user!.mfaEnabled;
  return (
    <section className="card stack">
      <h2>Two-factor sign-in {on ? <Badge kind="released">on</Badge> : <Badge kind="pending">off</Badge>}</h2>
      <div className="muted small">Adds a 6-digit code from an authenticator app (Microsoft/Google Authenticator, Authy, 1Password…) to your password at sign-in. Recommended for QC managers and administrators. If you lose your phone, an administrator can reset it.</div>
      {!on && !setup && <div><button className="btn" onClick={async () => { setErr(null); try { setSetup(await post('/auth/mfa/setup')); } catch (e: any) { setErr(e.message); } }}>Set up two-factor sign-in…</button></div>}
      {setup && (
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <img src={setup.qr} alt="QR code to scan with your authenticator app" width={200} height={200} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }} />
            <div className="stack grow"><div>1. Scan this code with your authenticator app.<div className="muted small">Can’t scan? Enter this key manually: <span className="mono" style={{ wordBreak: 'break-all' }}>{setup.secret}</span></div></div>
              <div>2. Type the 6-digit code it shows:</div>
              <input className="pinbox" style={{ maxWidth: 220 }} type="text" inputMode="numeric" maxLength={7} value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} /></div>
          </div>
          <ErrorBox error={err} />
          <div className="row"><button className="btn primary" disabled={code.replace(/\s/g, '').length < 6} onClick={async () => { setErr(null); try { await post('/auth/mfa/enable', { code }); toast('Two-factor sign-in is on', 'ok'); setSetup(null); setCode(''); refreshMe(); } catch (e: any) { setErr(e.message); } }}>Turn on</button>
            <button className="btn ghost" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button></div>
        </div>)}
      {on && (
        <div className="stack"><div className="grid g2"><label className="f">Password<input type="password" value={pw} onChange={e => setPw(e.target.value)} /></label>
          <label className="f">Current authenticator code<input type="text" inputMode="numeric" maxLength={7} value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} /></label></div>
          <ErrorBox error={err} />
          <div><button className="btn" disabled={!pw || code.replace(/\s/g, '').length < 6} onClick={async () => { setErr(null); try { await post('/auth/mfa/disable', { password: pw, code }); toast('Two-factor sign-in turned off', 'ok'); setPw(''); setCode(''); refreshMe(); } catch (e: any) { setErr(e.message); } }}>Turn off</button></div></div>)}
      {!on && !setup && <ErrorBox error={err} />}
    </section>
  );
}
