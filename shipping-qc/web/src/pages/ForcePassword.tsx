import { useState } from 'react';
import { ErrorBox, PinField } from '../components/ui';
import { post, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Shown to a new account (or after an admin reset) before anything else: replace the temporary password and set a sign-off PIN. */
export default function ForcePassword() {
  const { user, adopt, logout } = useAuth();
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [pin, setPin] = useState(''); const [pin2, setPin2] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const ok = cur && pw.length >= 10 && pw === pw2 && pin.length >= 4 && pin === pin2;
  return (
    <div className="login">
      <div className="card stack">
        <div className="login-brand"><img src="/dad-logo.png" alt="DAD Manufacturing" /><h1 style={{ marginTop: 6 }}>Welcome, {user!.name.split(' ')[0]}</h1>
          <div className="muted">Before you start, replace your temporary password and choose a sign-off PIN.</div></div>
        <label className="f">Temporary password<input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label className="f">New password (10+ characters)<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        <label className="f">Repeat new password<input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
        <PinField value={pin} onChange={setPin} label="Sign-off PIN (4–8 digits)" /><PinField value={pin2} onChange={setPin2} label="Repeat PIN" />
        <div className="muted small">You enter this PIN every time you sign off an item. Don’t share it.</div>
        <ErrorBox error={err} />
        <button className="btn primary big" disabled={!ok || busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await post('/auth/password', { current: cur, next: pw }); setToken(r.token);
            const p = await post('/auth/pin', { password: pw, pin });
            adopt({ token: r.token, user: p.user, pinSalt: p.pinSalt, pinVerifier: p.pinVerifier });
          } catch (e: any) { setErr(e.message); setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button className="btn ghost" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
