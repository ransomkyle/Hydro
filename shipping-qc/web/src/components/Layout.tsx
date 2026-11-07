import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/format';

export default function Layout() {
  const { user, logout, online, pending, syncNow, can, sessionExpired } = useAuth();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let live = true;
    const tick = () => get<{ n: number }>('/notifications/unread-count').then(r => live && setUnread(r.data.n)).catch(() => {});
    tick(); const t = setInterval(tick, 45_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const qc = can('inspector', 'manager', 'admin', 'auditor');
  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link to="/" className="brand">
            <img src="/dad-logo.png" alt="DAD Manufacturing" />
            <span><small>DAD Manufacturing</small><b>Shipping QC</b></span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/shipments">Shipments</NavLink>
            {can('shipping', 'inspector', 'manager', 'admin') && <NavLink to="/shipments/new">+ New</NavLink>}
            <NavLink to="/templates">Checklists</NavLink>
            {qc && <NavLink to="/reports">Reports</NavLink>}
            <NavLink to="/capa">CAPA</NavLink>
            <NavLink to="/gauges">Gauges</NavLink>
            {qc && <NavLink to="/audit">Audit</NavLink>}
            {can('admin') && <NavLink to="/users">Users</NavLink>}
          </nav>
          {!online ? <span className="pill offline" title="Actions are saved on this device and sync when the network returns">● Offline{pending ? ` · ${pending} queued` : ''}</span>
            : pending ? <button className="pill sync" onClick={syncNow} title="Tap to sync now">⟳ {pending} to sync</button>
            : <span className="pill online hide-sm">● Online</span>}
          <Link to="/notifications" className="bell" aria-label="Notifications">🔔{unread > 0 && <b>{unread}</b>}</Link>
          <Link to="/account" className="bell hide-md" title={ROLE_LABEL[user!.role]} style={{ fontSize: '.85rem' }}>{user!.name}</Link>
          <button className="bell" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => { logout(); nav('/'); }} aria-label="Sign out">⎋</button>
        </div>
      </header>
      {sessionExpired && <div className="banner warn">Your session expired{pending ? ` — ${pending} queued action(s) are waiting.` : '.'} <button className="btn ghost sm" style={{ minHeight: 28 }} onClick={logout}>Sign in again</button> to sync (queued items are kept).</div>}
      {!online && <div className="banner info">You are offline. You can keep signing off items, logging materials, events and photos — they are saved here with their original time and sync automatically.</div>}
      <main className="main"><Outlet /></main>
    </>
  );
}
