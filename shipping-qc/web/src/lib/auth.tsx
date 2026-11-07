import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, NetworkError, get, post, setToken, setUnauthorizedHandler, getToken } from './api';
import { countPending, onOutboxChange, syncOutbox } from './outbox';

export interface Me { id: number; username: string; name: string; role: string; hasPin: boolean; email?: string | null; mustChange?: boolean; mfaEnabled?: boolean }
interface Session { user: Me; pinSalt?: string; pinVerifier?: string }
interface AuthCtx {
  user: Me | null; pinSalt?: string; pinVerifier?: string;
  online: boolean; pending: number; sessionExpired: boolean;
  login(u: string, p: string): Promise<{ mfaToken?: string }>; loginMfa(mfaToken: string, code: string): Promise<void>; logout(): void; adopt(r: { token?: string; user: Me; pinSalt?: string; pinVerifier?: string }): void; refreshMe(): Promise<void>; syncNow(): Promise<void>;
  can(...roles: string[]): boolean;
}
const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const KEY = 'qc.session';
const load = (): Session | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const save = (s: Session | null) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => (getToken() ? load() : null));
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [sessionExpired, setExpired] = useState(false);

  const logout = useCallback(() => { setToken(null); save(null); setSession(null); setExpired(false); }, []);

  useEffect(() => {
    // A 401 while we still have queued work keeps the user "in" (offline-capable) but flags that a fresh sign-in is needed to sync.
    setUnauthorizedHandler(() => setExpired(true));
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refreshPending = useCallback(() => countPending().then(setPending).catch(() => {}), []);
  useEffect(() => { refreshPending(); return onOutboxChange(refreshPending); }, [refreshPending]);

  const syncNow = useCallback(async () => { if (session) { await syncOutbox(session.user.id); refreshPending(); } }, [session, refreshPending]);
  useEffect(() => {
    if (!session) return;
    syncNow();
    const t = setInterval(syncNow, 20_000);
    window.addEventListener('online', syncNow);
    return () => { clearInterval(t); window.removeEventListener('online', syncNow); };
  }, [session, syncNow]);

  const refreshMe = useCallback(async () => {
    try {
      const r = await get<{ user: Me; pinSalt?: string; pinVerifier?: string }>('/auth/me');
      const s = { user: r.data.user, pinSalt: r.data.pinSalt, pinVerifier: r.data.pinVerifier };
      if (!r.stale) { save(s); setSession(s); setExpired(false); }
    } catch (e) { if (e instanceof ApiError && e.status === 401) setExpired(true); }
  }, []);
  useEffect(() => { if (session) refreshMe(); /* eslint-disable-next-line */ }, []);

  const login = useCallback(async (username: string, password: string): Promise<{ mfaToken?: string }> => {
    const r = await post<{ token?: string; mfaRequired?: boolean; mfaToken?: string } & Partial<Session>>('/auth/login', { username, password });
    if (r.mfaRequired) return { mfaToken: r.mfaToken };           // second step: authenticator code
    setToken(r.token!);
    const s = { user: r.user!, pinSalt: r.pinSalt, pinVerifier: r.pinVerifier };
    save(s); setSession(s); setExpired(false);
    return {};
  }, []);
  const loginMfa = useCallback(async (mfaToken: string, code: string) => {
    const r = await post<{ token: string } & Session>('/auth/login/mfa', { mfaToken, code });
    setToken(r.token);
    const s = { user: r.user, pinSalt: r.pinSalt, pinVerifier: r.pinVerifier };
    save(s); setSession(s); setExpired(false);
  }, []);

  /** Take over a fresh server response (e.g. after a password change, which revokes the old token). */
  const adopt = useCallback((r: { token?: string; user: Me; pinSalt?: string; pinVerifier?: string }) => {
    if (r.token) setToken(r.token);
    const s = { user: r.user, pinSalt: r.pinSalt, pinVerifier: r.pinVerifier };
    save(s); setSession(s); setExpired(false);
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user: session?.user ?? null, pinSalt: session?.pinSalt, pinVerifier: session?.pinVerifier, online, pending, sessionExpired,
    login, loginMfa, logout, adopt, refreshMe, syncNow, can: (...roles) => !!session && roles.includes(session.user.role),
  }), [session, online, pending, sessionExpired, login, loginMfa, logout, adopt, refreshMe, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export { NetworkError };
