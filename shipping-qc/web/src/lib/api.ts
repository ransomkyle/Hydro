import { idb } from './idb';

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: any) { super(message); }
}
/** Thrown when the server cannot be reached (offline, server down). */
export class NetworkError extends Error { constructor() { super('Cannot reach the server'); } }

const TOKEN_KEY = 'qc.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function raw(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    return await fetch('/api' + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch { throw new NetworkError(); }
}

async function parse<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) onUnauthorized();
  if (!r.ok) throw new ApiError(r.status, j.error ?? `Request failed (${r.status})`, j.detail);
  return j as T;
}

export const post = <T = any>(path: string, body?: unknown) => raw('POST', path, body ?? {}).then(r => parse<T>(r));
export const patch = <T = any>(path: string, body: unknown) => raw('PATCH', path, body).then(r => parse<T>(r));
export const put = <T = any>(path: string, body: unknown) => raw('PUT', path, body).then(r => parse<T>(r));
export const del = <T = any>(path: string) => raw('DELETE', path).then(r => parse<T>(r));
export const postForm = <T = any>(path: string, form: FormData) => raw('POST', path, undefined, form).then(r => parse<T>(r));

/** GET with an offline fallback: the last good response for this path is returned when the network is down. */
export async function get<T = any>(path: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await raw('GET', path).then(r => parse<T>(r));
    idb.put('cache', { data, at: Date.now(), user: getToken()?.slice(-12) }, path).catch(() => {});
    return { data, stale: false };
  } catch (e) {
    if (e instanceof NetworkError) {
      const hit = await idb.get<{ data: T }>('cache', path).catch(() => undefined);
      if (hit) return { data: hit.data, stale: true };
    }
    throw e;
  }
}

/** Authenticated file download (CSV / PDF) -> saved through a temporary link. */
export async function download(path: string, filename?: string, open = false) {
  const r = await raw('GET', path);
  if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error ?? 'Download failed');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, '_blank');
  else { const a = document.createElement('a'); a.href = url; a.download = filename ?? 'download'; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fetchBlobUrl(path: string): Promise<string> {
  const r = await raw('GET', path);
  if (!r.ok) throw new ApiError(r.status, 'Could not load file');
  return URL.createObjectURL(await r.blob());
}
