import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ErrorBox } from '../components/ui';
import { NetworkError } from '../lib/api';

export default function Login() {
  const { login, pending } = useAuth();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="card stack">
        <div className="login-brand"><img src="/dad-logo.png" alt="DAD Manufacturing" /><h1 style={{ marginTop: 6 }}>DAD Manufacturing</h1><div className="tag">Diversified · Accurate · Dependable</div><div className="muted" style={{ marginTop: 10 }}>Shipping QC — sign in to release shipments and sign off checks.</div></div>
        <form className="stack" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await login(u.trim(), p); } catch (x: any) { setErr(x instanceof NetworkError ? 'Cannot reach the server. You must sign in at least once while online.' : x.message); } finally { setBusy(false); }
        }}>
          <label className="f">Username<input type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={u} onChange={e => setU(e.target.value)} autoFocus /></label>
          <label className="f">Password<input type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></label>
          <ErrorBox error={err} />
          <button className="btn primary big" disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {pending > 0 && <div className="note warn">{pending} action(s) recorded offline are saved on this device and will sync after you sign in.</div>}
      </div>
    </div>
  );
}
