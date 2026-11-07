import { useMemo, useRef, useState } from 'react';
import { Badge, ErrorBox, Modal, PinField, shrinkImage, AuthImage } from '../../components/ui';
import { ApiError, del, get, post, patch } from '../../lib/api';
import { fmtDT } from '../../lib/format';
import { sendOrQueue, signItem } from '../../lib/outbox';
import { type TabProps, isQC } from './types';

const ROLE_NOTE: Record<string, string> = { inspector: 'QC inspector+', manager: 'QC manager' };
const canSign = (role: string, need: string) => role !== 'auditor' && (need === 'manager' ? role === 'manager' : need === 'inspector' ? role === 'inspector' || role === 'manager' : true);

export default function ChecklistTab(p: TabProps) {
  const { d, locked, role } = p;
  const [signing, setSigning] = useState<any>(null);
  const [verifying, setVerifying] = useState<any>(null);
  const [revoking, setRevoking] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null); // item or {} for new
  const [adding, setAdding] = useState(false);
  const [tpls, setTpls] = useState<any[] | null>(null);
  const sections = useMemo(() => { const m = new Map<string, any[]>(); for (const i of d.items) { if (!m.has(i.section)) m.set(i.section, []); m.get(i.section)!.push(i); } return [...m]; }, [d.items]);
  const attFor = (id: number) => d.attachments.filter(a => a.item_id === id && !a.voided);

  return (
    <div>
      {isQC(role) && !locked && (
        <div className="row" style={{ marginBottom: '.5rem' }}>
          <button className="btn sm" onClick={() => setEditing({})}>+ Add item to this job</button>
          <button className="btn sm" onClick={async () => { setAdding(true); setTpls((await get<any[]>('/templates')).data); }}>+ Add a template module</button>
          <span className="muted small">Checklist is this job’s own copy — changes don’t affect other shipments.</span>
        </div>)}
      {sections.map(([name, items]) => (
        <div key={name}>
          <div className="sec-h">{name}<span className="right tiny" style={{ opacity: .8 }}>{items.filter(i => i.status !== 'pending').length}/{items.length}</span></div>
          {items.map(i => {
            const atts = attFor(i.id);
            const pendingAtt = p.pendingFiles.filter(f => Number(f.body.itemId) === i.id).length;
            return (
              <div key={i.id} className={`item s-${i.status} ${i.required ? 'req' : ''}`}>
                <div className="item-top">
                  <div className="item-text">{i.text}
                    <div className="chips">
                      {!i.required && <span className="chip">optional</span>}
                      {i.kind === 'value' && <span className="chip">record value{i.unit ? ` (${i.unit})` : ''}</span>}
                      {i.kind === 'photo' && <span className="chip">photo required</span>}
                      {i.kind === 'doc' && <span className="chip">document required</span>}
                      {i.signer_role !== 'any' && <span className="chip role">{ROLE_NOTE[i.signer_role]} signs</span>}
                      {!!i.needs_verification && <span className="chip hold">hold point — 2nd person verifies</span>}
                      {i.source === 'custom' && <span className="chip">custom</span>}
                    </div>
                    {(i.spec || i.reference) && <div className="muted small" style={{ fontWeight: 400, marginTop: 4 }}>{i.spec}{i.spec && i.reference ? ' · ' : ''}{i.reference && <i>{i.reference}</i>}</div>}
                  </div>
                  <Badge kind={i.status}>{i.status === 'na' ? 'N/A' : i.status === 'pending' ? 'OPEN' : i.status.toUpperCase()}</Badge>
                </div>
                {(atts.length > 0 || pendingAtt > 0) && (
                  <div className="thumbs">
                    {atts.map(a => a.mime === 'application/pdf'
                      ? <div key={a.id} className="thumb"><div>📄 {a.filename}</div></div>
                      : <div key={a.id} className="thumb"><AuthImage id={a.id} alt={a.filename} /><div>{fmtDT(a.uploaded_at)}</div></div>)}
                    {pendingAtt > 0 && <div className="thumb"><div>⏳ {pendingAtt} file(s) queued offline</div></div>}
                  </div>)}
                {i.status !== 'pending' && (
                  <div className="sig">
                    {i.value && <div><b>Recorded:</b> {i.value}{i.unit ? ' ' + i.unit : ''}</div>}
                    {i.note && <div><b>{i.status === 'fail' ? 'Failure:' : 'Note:'}</b> {i.note}</div>}
                    <div>✔ <b>{i.done_by_name}</b> — {fmtDT(i.done_at)} {i.done_offline ? <span className="off">· recorded offline{i._pending ? ' (waiting to sync)' : ''}</span> : null}</div>
                    {!!i.needs_verification && i.status === 'pass' && (i.verified_by_name
                      ? <div>✔ Verified by <b>{i.verified_by_name}</b> — {fmtDT(i.verified_at)}{i.verified_offline || i._pendingVerify ? <span className="off"> · offline</span> : null}{i.verify_note ? ` — ${i.verify_note}` : ''}</div>
                      : <div style={{ color: 'var(--warn)' }}>⚠ Awaiting verification by a different QC person</div>)}
                  </div>)}
                {!locked && (
                  <div className="actions">
                    {i.status === 'pending' && canSign(role, i.signer_role) && <button className="btn primary" onClick={() => setSigning(i)}>Sign off…</button>}
                    {i.status === 'pending' && !canSign(role, i.signer_role) && role !== 'auditor' && <span className="muted small">Needs {ROLE_NOTE[i.signer_role]}</span>}
                    {i.status === 'pass' && !!i.needs_verification && !i.verified_by && (role === 'inspector' || role === 'manager') && i.done_by_name !== p.ctx.userName && !i._pending &&
                      <button className="btn ok" onClick={() => setVerifying(i)}>Verify (2nd person)…</button>}
                    {i.status !== 'pending' && !i._pending && (role === 'inspector' || role === 'manager') && <button className="btn sm ghost" onClick={() => setRevoking(i)}>Revoke sign-off</button>}
                    {i.status === 'pending' && isQC(role) && <>
                      <button className="btn sm ghost" onClick={() => setEditing(i)}>Edit</button>
                      <button className="btn sm ghost" onClick={async () => { const reason = prompt('Reason for removing this item from this job?'); if (reason && reason.length >= 3) { try { p.setDetail(await post(`/shipments/items/${i.id}/remove`, { reason })); } catch (e: any) { p.toast(e.message, 'bad'); } } }}>Remove</button></>}
                  </div>)}
              </div>);
          })}
        </div>))}
      {d.items.length === 0 && <div className="card empty">No checklist items. {isQC(role) && !locked ? 'Add a template module or custom items above.' : ''}</div>}

      {signing && <SignDialog item={signing} atts={attFor(signing.id)} pendingAtt={p.pendingFiles.filter(f => Number(f.body.itemId) === signing.id).length} p={p} onClose={() => setSigning(null)} />}
      {verifying && <VerifyDialog item={verifying} p={p} onClose={() => setVerifying(null)} />}
      {revoking && <RevokeDialog item={revoking} p={p} onClose={() => setRevoking(null)} />}
      {editing && <ItemEditor item={editing} sections={sections.map(s => s[0])} shipmentId={d.shipment.id} p={p} onClose={() => setEditing(null)} />}
      {adding && tpls && (
        <Modal title="Add template module to this job" onClose={() => setAdding(false)}>
          <div className="stack">{tpls.map(t => <button key={t.id} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={async () => {
            try { p.setDetail(await post(`/shipments/${d.shipment.id}/apply-templates`, { templateIds: [t.id] })); p.toast(`Added ${t.item_count} items`, 'ok'); setAdding(false); } catch (e: any) { p.toast(e.message, 'bad'); }
          }}><span><b>{t.name}</b><br /><span className="muted small">{t.item_count} items</span></span></button>)}</div>
        </Modal>)}
    </div>
  );
}

function FileAdder({ item, p, kind }: { item: any; p: TabProps; kind: 'photo' | 'doc' }) {
  const ref = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" hidden accept={kind === 'photo' ? 'image/*' : 'application/pdf,image/*'} multiple onChange={async e => {
        const files = [...(e.target.files ?? [])]; e.target.value = ''; setBusy(true);
        try {
          for (const f of files) {
            const blob = await shrinkImage(f);
            const r = await sendOrQueue(p.ctx, 'attachment', p.d.shipment.id, `/shipments/${p.d.shipment.id}/attachments`, { kind: kind === 'photo' ? 'photo' : 'inspection', itemId: item.id, caption: item.text.slice(0, 120) }, `File for: ${item.text}`, { blob, name: f.name });
            if (!r.queued) p.setDetail(r.data); else p.toast('Offline — file saved on this device and will upload automatically', 'warn');
          }
        } catch (x: any) { p.toast(x.message, 'bad'); } finally { setBusy(false); }
      }} />
      <button type="button" className="btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Adding…' : kind === 'photo' ? '📷 Add photo' : '📎 Attach document'}</button>
    </>
  );
}

function SignDialog({ item, atts, pendingAtt, p, onClose }: { item: any; atts: any[]; pendingAtt: number; p: TabProps; onClose: () => void }) {
  const [result, setResult] = useState<'pass' | 'fail' | 'na'>('pass');
  const [value, setValue] = useState(''); const [note, setNote] = useState(''); const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const needsFile = (item.kind === 'photo' || item.kind === 'doc') && result === 'pass';
  const haveFile = atts.length + pendingAtt > 0;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await signItem(p.ctx, { action: 'sign', shipmentId: p.d.shipment.id, itemId: item.id, itemText: item.text, result, value, note, pin });
      if (r.queued) p.toast('Offline — signed on this device with the current time. It will sync automatically.', 'warn'); else { p.setDetail(r.data); if (result === 'fail') p.toast('Failed item flagged — QC has been notified', 'warn'); else p.toast('Signed ✔', 'ok'); }
      onClose();
    } catch (e: any) { setErr(e instanceof ApiError ? e.message : e.message); setBusy(false); }
  };
  return (
    <Modal title="Sign off" onClose={onClose}>
      <div><b>{item.text}</b>{item.spec && <div className="muted small">{item.spec}</div>}</div>
      <div className="seg">{(['pass', 'fail', 'na'] as const).map(r => <button key={r} type="button" className={`${r} ${result === r ? 'on' : ''}`} onClick={() => setResult(r)}>{r === 'na' ? 'N/A' : r.toUpperCase()}</button>)}</div>
      {item.kind === 'value' && result === 'pass' && <label className="f">Recorded value{item.unit ? ` (${item.unit})` : ''} *<input type="text" value={value} onChange={e => setValue(e.target.value)} autoFocus /></label>}
      {needsFile && <div className="note">{haveFile ? `✔ ${atts.length + pendingAtt} file(s) attached` : `This item needs ${item.kind === 'photo' ? 'a photo' : 'a document'} before it can pass.`}<div style={{ marginTop: 8 }}><FileAdder item={item} p={p} kind={item.kind} /></div></div>}
      {(result !== 'pass' || item.kind !== 'check') && <label className="f">{result === 'fail' ? 'What failed? *' : result === 'na' ? 'Why is this N/A? *' : 'Note (optional)'}<textarea value={note} onChange={e => setNote(e.target.value)} /></label>}
      {result === 'fail' && <div className="note warn">A failure raises a flag and notifies the QC team. It does not block you from continuing.</div>}
      <PinField value={pin} onChange={setPin} />
      <ErrorBox error={err} />
      <button className={`btn big ${result === 'fail' ? 'bad' : 'ok'}`} disabled={busy || pin.length < 4 || (needsFile && !haveFile) || (item.kind === 'value' && result === 'pass' && !value.trim()) || (result !== 'pass' && !note.trim())} onClick={submit}>
        {busy ? 'Signing…' : `Sign as ${p.ctx.userName}`}</button>
      <div className="muted tiny">Your name and the exact time are recorded permanently. Works offline.</div>
    </Modal>
  );
}

function VerifyDialog({ item, p, onClose }: { item: any; p: TabProps; onClose: () => void }) {
  const [pin, setPin] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <Modal title="Independent verification" onClose={onClose}>
      <div><b>{item.text}</b><div className="muted small">Signed by {item.done_by_name} — {fmtDT(item.done_at)}{item.value ? ` · recorded: ${item.value}` : ''}</div></div>
      <div className="note">Confirm you checked this yourself. You must be a different person from the signer.</div>
      <label className="f">Verification note (optional)<textarea value={note} onChange={e => setNote(e.target.value)} /></label>
      <PinField value={pin} onChange={setPin} />
      <ErrorBox error={err} />
      <button className="btn ok big" disabled={busy || pin.length < 4} onClick={async () => {
        setBusy(true); setErr(null);
        try { const r = await signItem(p.ctx, { action: 'verify', shipmentId: p.d.shipment.id, itemId: item.id, itemText: item.text, note, pin }); if (r.queued) p.toast('Offline — verification saved and will sync', 'warn'); else { p.setDetail(r.data); p.toast('Verified ✔', 'ok'); } onClose(); }
        catch (e: any) { setErr(e.message); setBusy(false); }
      }}>Verify as {p.ctx.userName}</button>
    </Modal>
  );
}

function RevokeDialog({ item, p, onClose }: { item: any; p: TabProps; onClose: () => void }) {
  const [pin, setPin] = useState(''); const [reason, setReason] = useState(''); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Revoke sign-off" onClose={onClose}>
      <div><b>{item.text}</b><div className="muted small">Currently {item.status.toUpperCase()} by {item.done_by_name}. The old sign-off stays in the audit trail.</div></div>
      <label className="f">Reason (required) *<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <PinField value={pin} onChange={setPin} />
      <ErrorBox error={err} />
      <button className="btn bad big" disabled={pin.length < 4 || reason.trim().length < 3} onClick={async () => {
        try { p.setDetail(await post(`/shipments/items/${item.id}/revoke`, { pin, reason })); p.toast('Sign-off revoked', 'ok'); onClose(); } catch (e: any) { setErr(e.message); }
      }}>Revoke</button>
    </Modal>
  );
}

function ItemEditor({ item, sections, shipmentId, p, onClose }: { item: any; sections: string[]; shipmentId: number; p: TabProps; onClose: () => void }) {
  const isNew = !item.id;
  const [f, setF] = useState({ section: item.section ?? sections[sections.length - 1] ?? 'Custom', text: item.text ?? '', kind: item.kind ?? 'check', unit: item.unit ?? '', spec: item.spec ?? '', reference: item.reference ?? '',
    required: item.required === undefined ? true : !!item.required, signer_role: item.signer_role ?? 'any', needs_verification: !!item.needs_verification });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title={isNew ? 'Add checklist item' : 'Edit checklist item'} onClose={onClose}>
      <label className="f">Section<input type="text" list="secs" value={f.section} onChange={e => set('section', e.target.value)} /></label>
      <datalist id="secs">{sections.map(s => <option key={s} value={s} />)}</datalist>
      <label className="f">What must be checked *<textarea value={f.text} onChange={e => set('text', e.target.value)} /></label>
      <div className="grid g2">
        <label className="f">Type<select value={f.kind} onChange={e => set('kind', e.target.value)}><option value="check">Pass / fail check</option><option value="value">Record a value</option><option value="photo">Photo required</option><option value="doc">Document required</option></select></label>
        <label className="f">Unit (for values)<input type="text" value={f.unit} onChange={e => set('unit', e.target.value)} /></label>
        <label className="f">Who may sign<select value={f.signer_role} onChange={e => set('signer_role', e.target.value)}><option value="any">Anyone</option><option value="inspector">QC inspector or manager</option><option value="manager">QC manager only</option></select></label>
        <label className="f">Standard / clause<input type="text" value={f.reference} onChange={e => set('reference', e.target.value)} /></label>
      </div>
      <label className="f">Acceptance criteria / instruction<input type="text" value={f.spec} onChange={e => set('spec', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={f.required} onChange={e => set('required', e.target.checked)} />Required for release</label>
      <label className="check"><input type="checkbox" checked={f.needs_verification} onChange={e => set('needs_verification', e.target.checked)} />Hold point — a second person must verify</label>
      <ErrorBox error={err} />
      <button className="btn primary big" disabled={!f.text.trim() || !f.section.trim()} onClick={async () => {
        try { const body = { ...f, unit: f.unit || null, spec: f.spec || null, reference: f.reference || null }; p.setDetail(isNew ? await post(`/shipments/${shipmentId}/checklist`, body) : await patch(`/shipments/items/${item.id}`, body)); onClose(); }
        catch (e: any) { setErr(e.message); }
      }}>{isNew ? 'Add to this job' : 'Save'}</button>
    </Modal>
  );
}
void del;
