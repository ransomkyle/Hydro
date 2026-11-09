import { useEffect, useRef, useState } from 'react';
import { AuthImage, Badge, ErrorBox, Modal, shrinkImage } from '../../components/ui';
import { download, fetchBlobUrl, get, post } from '../../lib/api';
import { fmtDT } from '../../lib/format';
import { sendOrQueue } from '../../lib/outbox';
import { type TabProps, isQC } from './types';

const KINDS: [string, string][] = [['photo', 'Photo'], ['mtr', 'MTR / CMTR'], ['cert', 'Certificate of conformance'], ['inspection', 'Inspection / test report'], ['drawing', 'Drawing'], ['other', 'Other']];

export default function DocsTab(p: TabProps) {
  const { d, locked } = p;
  const closed = ['delivered', 'cancelled'].includes(d.shipment.status); // photos/docs stay open after release (e.g. securement photos at pickup)
  const [kind, setKind] = useState('photo'); const [caption, setCaption] = useState(''); const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null); const [dxf, setDxf] = useState<any>(null); const [voiding, setVoiding] = useState<any>(null); const [reason, setReason] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const atts = d.attachments.filter(a => !a.voided);
  const photos = atts.filter(a => a.mime.startsWith('image/')); const docs = atts.filter(a => !a.mime.startsWith('image/'));
  const shipFiles = p.pendingFiles.filter(f => !f.body.itemId);
  return (
    <div className="stack">
      {!closed && p.role !== 'auditor' && (
        <section className="card stack">
          <h2>Add photos & documents</h2>
          <div className="grid g3">
            <label className="f">Type<select value={kind} onChange={e => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="f">Caption<input type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Strap #3 over edge protector" /></label>
          </div>
          <input ref={ref} type="file" hidden multiple accept="image/*,application/pdf,.dxf" onChange={async e => {
            const files = [...(e.target.files ?? [])]; e.target.value = ''; setBusy(true);
            try {
              for (const f of files) {
                const blob = await shrinkImage(f);
                const r = await sendOrQueue(p.ctx, 'attachment', d.shipment.id, `/shipments/${d.shipment.id}/attachments`, { kind, caption: caption || undefined }, `File: ${f.name}`, { blob, name: f.name });
                if (r.queued) p.toast('Offline — saved on this device, uploads automatically', 'warn'); else p.setDetail(r.data);
              }
              setCaption('');
            } catch (x: any) { p.toast(x.message, 'bad'); } finally { setBusy(false); }
          }} />
          <div><button className="btn primary big" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : kind === 'photo' ? '📷 Take / choose photos' : '📎 Choose files'}</button></div>
          <div className="muted small">JPEG, PNG, WebP, HEIC photos, PDF documents and DXF drawings up to 25 MB. A DXF gets a preview and can generate inspection items. Phone photos are resized automatically. Each file is fingerprinted (SHA-256) and time-stamped.</div>
        </section>)}
      {shipFiles.length > 0 && <div className="note warn">⏳ {shipFiles.length} file(s) are queued on this device and will upload when you’re back online.</div>}
      <section className="card stack"><h2>Photos ({photos.length})</h2>
        <div className="thumbs">{photos.map(a => (
          <div className="thumb" key={a.id}><AuthImage id={a.id} alt={a.filename} onClick={setView} />
            <div><b>{a.caption ?? a.filename}</b><br />{fmtDT(a.uploaded_at)}<br />{a.uploaded_by_name} {a.offline ? <Badge kind="offline">offline</Badge> : null}
              {isQC(p.role) && !locked && <><br /><a href="#" onClick={e => { e.preventDefault(); setVoiding(a); }}>void</a></>}</div></div>))}
          {photos.length === 0 && <div className="muted">No photos yet.</div>}</div>
      </section>
      <section className="card flush"><div className="card-h"><h2>Documents ({docs.length})</h2></div>
        <table className="tbl"><tbody>{docs.map(a => (
          <tr key={a.id}><td>{a.mime === 'application/dxf'
            ? <a href="#" onClick={e => { e.preventDefault(); setDxf(a); }}>📐 {a.filename} — preview & features</a>
            : <a href="#" onClick={async e => { e.preventDefault(); const u = await fetchBlobUrl(`/attachments/${a.id}`); window.open(u, '_blank'); }}>📄 {a.filename}</a>}
            <div className="muted small">{KINDS.find(k => k[0] === a.kind)?.[1]}{a.item_id ? ' · linked to checklist item' : ''}{a.caption ? ` · ${a.caption}` : ''}</div></td>
            <td className="small">{a.uploaded_by_name}<br />{fmtDT(a.uploaded_at)}</td><td className="mono tiny hide-sm" title={a.sha256}>{a.sha256.slice(0, 12)}…</td>
            <td>{isQC(p.role) && !locked && <button className="btn sm ghost" onClick={() => setVoiding(a)}>Void</button>}</td></tr>))}
          {docs.length === 0 && <tr><td className="empty">No documents attached.</td></tr>}</tbody></table>
      </section>
      <button className="btn" onClick={() => download(`/shipments/${d.shipment.id}/package.pdf`, undefined, true).catch(e => p.toast(e.message, 'bad'))}>Open release package PDF</button>
      {dxf && <DxfDialog att={dxf} p={p} onClose={() => setDxf(null)} />}
      {view && <Modal title="Photo" wide onClose={() => setView(null)}><img src={view} alt="" style={{ width: '100%', borderRadius: 8 }} /></Modal>}
      {voiding && (
        <Modal title="Void file" onClose={() => setVoiding(null)}>
          <div>{voiding.filename}</div><div className="muted small">The file is kept in the record but excluded from the package. Reason is logged.</div>
          <label className="f">Reason *<input type="text" value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button className="btn bad" disabled={reason.trim().length < 3} onClick={async () => { try { p.setDetail(await post(`/attachments/${voiding.id}/void`, { reason })); setVoiding(null); setReason(''); } catch (e: any) { p.toast(e.message, 'bad'); } }}>Void</button>
        </Modal>)}
    </div>
  );
}

const num = (n: number) => String(Math.round(n * 10000) / 10000);

/** Preview of a DXF drawing, the features read from it, and one click to turn them into inspection items. */
function DxfDialog({ att, p, onClose }: { att: any; p: TabProps; onClose: () => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { get(`/attachments/${att.id}/dxf`).then(r => setD(r.data)).catch(e => setErr(e.message)); }, [att.id]);
  const s = d?.summary; const u = s?.units === 'mm' ? 'mm' : 'in';
  const already = p.d.items.some((i: any) => i.source === `dxf:${att.id}`);
  const canMake = (p.role === 'inspector' || p.role === 'manager' || p.role === 'admin') && !p.locked && !already;
  return (
    <Modal title={att.filename} wide onClose={onClose}>
      {err && <ErrorBox error={err} />}
      {!d && !err && <div className="muted">Reading drawing…</div>}
      {s && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card" style={{ padding: 8 }}><img alt="Drawing preview" style={{ width: '100%', display: 'block', borderRadius: 6 }} src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg)} /></div>
          <div className="stack">
            <table className="tbl"><tbody>
              <tr><td className="muted">Units</td><td>{s.units === 'unknown' ? 'not stated in file (assumed inches)' : s.units === 'mm' ? 'millimetres' : 'inches'}</td></tr>
              <tr><td className="muted">Overall size</td><td><b>{num(s.extents.width)} × {num(s.extents.height)} {u}</b></td></tr>
              {s.outer && <tr><td className="muted">Outside diameter</td><td><b>Ø{num(s.outer.dia)} {u}</b></td></tr>}
              {s.concentric.map((c: any, i: number) => <tr key={i}><td className="muted">Concentric diameter</td><td>Ø{num(c.dia)} {u}</td></tr>)}
              {s.holeGroups.map((g: any, i: number) => (
                <tr key={i}><td className="muted">Holes</td><td><b>{g.count} × Ø{num(g.dia)} {u}</b>
                  <div className="muted small">{g.pattern === 'bolt_circle' ? `on a ${num(g.pcd)} ${u} bolt circle${g.evenlySpaced ? ', evenly spaced' : ''}` : g.pattern === 'scattered' ? `pattern within ${num(g.radialMax ?? 0)} ${u} of centre` : 'single feature'}</div></td></tr>))}
              <tr><td className="muted">Geometry</td><td className="small">{s.counts.circles} circles · {s.counts.arcs} arcs · {s.counts.lines} lines · {s.counts.polylines} polylines{Object.keys(s.unsupported).length ? ` · ignored: ${Object.entries(s.unsupported).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}</td></tr>
            </tbody></table>
            <div className="note">Sizes are CAD nominals read from the file. Tolerances and the revision come from the released drawing, so verify against it.</div>
            {already && <div className="note">Inspection items from this drawing are already on the checklist.</div>}
          </div>
        </div>)}
      <div className="row">
        {canMake && s && <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { p.setDetail(await post(`/shipments/${p.d.shipment.id}/checklist-from-dxf`, { attachmentId: att.id })); p.toast('Inspection items added to the checklist', 'ok'); onClose(); } catch (e: any) { setErr(e.message); setBusy(false); }
        }}>Create inspection items from this drawing</button>}
        <button className="btn" onClick={() => download(`/attachments/${att.id}`, att.filename).catch(e => p.toast(e.message, 'bad'))}>Download DXF</button>
      </div>
    </Modal>
  );
}
