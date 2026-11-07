import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchBlobUrl } from '../lib/api';
import { STATUS_LABEL } from '../lib/format';

export function Badge({ kind, children }: { kind: string; children?: ReactNode }) {
  return <span className={`badge b-${kind}`}>{children ?? STATUS_LABEL[kind] ?? kind.replace('_', ' ')}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn ghost sm right" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const ErrorBox = ({ error }: { error?: string | null }) => (error ? <div className="err" role="alert">{error}</div> : null);

export function PinField({ value, onChange, label = 'Your PIN to sign', autoFocus }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  return (
    <label className="f">{label}
      <input className="pinbox" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
    </label>
  );
}

// ---- toasts
type Toast = { id: number; text: string; kind: 'ok' | 'bad' | 'warn' | '' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, kind: Toast['kind'] = '') => {
    const id = ++n.current; setList(l => [...l, { id, text, kind }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), kind === 'bad' ? 7000 : 3500);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" aria-live="polite">{list.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div></ToastCtx.Provider>;
}

/** <img> for files that need the auth header. */
export function AuthImage({ id, alt, onClick }: { id: number; alt: string; onClick?: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let dead = false; let u: string | null = null;
    fetchBlobUrl(`/attachments/${id}`).then(x => { u = x; if (!dead) setUrl(x); }).catch(() => {});
    return () => { dead = true; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img src={url} alt={alt} onClick={() => onClick?.(url)} /> : <img alt={alt} src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />;
}

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current!; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0b1f33';
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <div>
      <canvas ref={ref} className="pad" aria-label="Signature"
        onPointerDown={e => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={() => { drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL('image/png')); }} />
      <button type="button" className="btn ghost sm" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); }}>Clear signature</button>
    </div>
  );
}

export async function shrinkImage(file: File, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

export function getPosition(): Promise<{ lat: number; lng: number; accuracy_m: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not available on this device'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy_m: Math.round(p.coords.accuracy) }),
      e => reject(new Error(e.code === 1 ? 'Location permission denied' : 'Could not get location')), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  });
}
