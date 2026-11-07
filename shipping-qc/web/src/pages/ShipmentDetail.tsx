import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge, ErrorBox, Modal, PinField, useToast } from '../components/ui';
import { ApiError, download, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDT, fmtShort } from '../lib/format';
import { useShipment } from '../lib/useShipment';
import ChecklistTab from './shipment/ChecklistTab';
import DocsTab from './shipment/DocsTab';
import FlagsTab from './shipment/FlagsTab';
import HistoryTab from './shipment/HistoryTab';
import LogisticsTab from './shipment/LogisticsTab';
import MaterialsTab from './shipment/MaterialsTab';
import PartsTab from './shipment/PartsTab';
import type { TabProps } from './shipment/types';

const LOCKED = ['released', 'shipped', 'delivered', 'cancelled'];

export default function ShipmentDetail() {
  const id = Number(useParams().id);
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? 'checklist';
  const { user, pinSalt, pinVerifier, online, can } = useAuth(); const toast = useToast();
  const { detail: d, reload, stale, error, setDetail, ops, pendingFiles } = useShipment(id);
  const [dlg, setDlg] = useState<'release' | 'reopen' | 'cancel' | 'template' | null>(null);
  if (error && !d) return <div className="err">{error}</div>;
  if (!d) return <div className="muted">Loading…</div>;
  const s = d.shipment; const locked = LOCKED.includes(s.status);
  const open = d.flags.filter(f => f.status === 'open').length;
  const pct = d.readiness.progress.total ? Math.round((100 * d.readiness.progress.done) / d.readiness.progress.total) : 0;
  const props: TabProps = { d, locked, ctx: { userId: user!.id, userName: user!.name, pinSalt, pinVerifier }, role: user!.role, userId: user!.id, reload, setDetail, pendingFiles, ops, toast };
  const tabs: [string, string, number?][] = [['checklist', 'Checklist', d.readiness.progress.total - d.readiness.progress.done], ['materials', 'Materials', d.materials.filter(m => !m.voided).length], ['parts', 'Parts', d.parts.length],
    ['logistics', 'Logistics & custody'], ['docs', 'Photos & docs', d.attachments.filter(a => !a.voided).length], ['flags', 'Flags', open], ['history', 'History']];
  return (
    <div className="stack">
      {stale && <div className="note warn">Offline — showing the last copy saved on this device. Your actions are still recorded and will sync.</div>}
      <section className="card stack">
        <div className="row">
          <div className="grow"><div className="row"><h1 style={{ margin: 0 }}>{s.shipment_no}</h1><Badge kind={s.status} />{s.release_override_reason && <Badge kind="major">released with override</Badge>}{open > 0 && <Badge kind="critical">⚑ {open} open flag{open > 1 ? 's' : ''}</Badge>}</div>
            <div><b>{s.customer}</b> · Job {s.job_no}{s.po_no ? ` · PO ${s.po_no}` : ''}</div>
            {s.description && <div className="muted">{s.description}</div>}</div>
          <div className="row">
            <button className="btn" disabled={!online} onClick={() => download(`/shipments/${id}/package.pdf`, undefined, true).catch(e => toast(e.message, 'bad'))}>📄 Release package (PDF)</button>
            {can('manager') && !locked && <button className="btn ok" onClick={() => setDlg('release')}>Release for shipment…</button>}
            {can('manager') && (s.status === 'released' || s.status === 'shipped') && <button className="btn" onClick={() => setDlg('reopen')}>Reopen…</button>}
            {can('manager') && !['shipped', 'delivered', 'cancelled'].includes(s.status) && <button className="btn ghost" onClick={() => setDlg('cancel')}>Cancel shipment</button>}
            {can('manager', 'admin') && <button className="btn ghost" onClick={() => setDlg('template')}>Save checklist as template</button>}
          </div>
        </div>
        <div className="progress" aria-label="checklist progress"><i style={{ width: pct + '%' }} /></div>
        <div className="row small muted"><span>{d.readiness.progress.done}/{d.readiness.progress.total} items signed ({pct}%)</span>
          {s.pickup_appt && <span>· Pickup {fmtShort(s.pickup_appt)}</span>}{s.weight_lb ? <span>· {Number(s.weight_lb).toLocaleString()} lb</span> : null}{s.length_in ? <span>· {(s.length_in / 12).toFixed(1)} ft long</span> : null}
          {s.released_at && <span>· Released {fmtDT(s.released_at)} by {s.released_by_name}</span>}</div>
        {s.special_requirements && <div className="note warn"><b>Customer special requirements:</b> {s.special_requirements}</div>}
        {s.release_override_reason && <div className="note warn"><b>Released with override:</b> {s.release_override_reason}</div>}
        {!locked && (
          <details className={`card ready-box ${d.readiness.ready ? 'ok' : ''}`} style={{ padding: '.6rem 1rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{d.readiness.ready ? '✔ Ready for QC manager release' : `${d.readiness.blockers.length} item(s) before release`}</summary>
            <ul className="clean small" style={{ marginTop: 8 }}>{d.readiness.blockers.slice(0, 40).map((b, i) => <li key={i}>{b.message}</li>)}</ul>
          </details>)}
        {locked && s.status !== 'cancelled' && <div className="note">Checklist is locked after release. Logistics details, events and photos can still be added until delivery. A QC manager can reopen it (recorded in the audit trail).</div>}
      </section>
      <div className="tabs" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" className={tab === k ? 'active' : ''} onClick={() => setSp({ tab: k }, { replace: true })}>{l}{n ? <span className={`badge ${k === 'flags' ? 'b-critical' : 'b-pending'}`}>{n}</span> : null}</button>)}</div>
      {tab === 'checklist' && <ChecklistTab {...props} />}
      {tab === 'materials' && <MaterialsTab {...props} />}
      {tab === 'parts' && <PartsTab {...props} />}
      {tab === 'logistics' && <LogisticsTab {...props} />}
      {tab === 'docs' && <DocsTab {...props} />}
      {tab === 'flags' && <FlagsTab {...props} />}
      {tab === 'history' && <HistoryTab id={id} />}
      {dlg === 'release' && <ReleaseDialog d={d} onClose={() => setDlg(null)} onDone={x => { setDetail(x); toast('Shipment released ✔', 'ok'); setDlg(null); }} />}
      {(dlg === 'reopen' || dlg === 'cancel') && <ReasonPinDialog kind={dlg} id={id} onClose={() => setDlg(null)} onDone={x => { setDetail(x); setDlg(null); }} />}
      {dlg === 'template' && <TemplateDialog id={id} onClose={() => setDlg(null)} toast={toast} defaultCustomer={s.customer} />}
    </div>
  );
}

function ReleaseDialog({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: (x: any) => void }) {
  const [pin, setPin] = useState(''); const [reason, setReason] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const blockers: any[] = d.readiness.blockers;
  return (
    <Modal title={`Release ${d.shipment.shipment_no} for shipment`} onClose={onClose} wide>
      {blockers.length === 0 ? <div className="note">✔ Every required item is signed, verified, and no flags are open.</div> : (
        <>
          <div className="err"><b>{blockers.length} unresolved item(s).</b> Releasing anyway is allowed but is recorded as an override, printed on the release package, and QC is notified.</div>
          <ul className="clean small" style={{ maxHeight: 200, overflow: 'auto' }}>{blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>
          <label className="f">Override reason (required) *<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Who approved this and why" /></label>
        </>)}
      <PinField value={pin} onChange={setPin} label="QC manager PIN" />
      <ErrorBox error={err} />
      <button className="btn ok big" disabled={busy || pin.length < 4 || (blockers.length > 0 && reason.trim().length < 5)} onClick={async () => {
        setBusy(true); setErr(null);
        try { onDone(await post(`/shipments/${d.shipment.id}/release`, { pin, overrideReason: blockers.length ? reason : undefined })); } catch (e: any) { setErr(e instanceof ApiError ? e.message : 'Cannot reach the server — release needs a connection'); setBusy(false); }
      }}>{blockers.length ? 'Release with override' : 'Release for shipment'}</button>
    </Modal>
  );
}

function ReasonPinDialog({ kind, id, onClose, onDone }: { kind: 'reopen' | 'cancel'; id: number; onClose: () => void; onDone: (x: any) => void }) {
  const [pin, setPin] = useState(''); const [reason, setReason] = useState(''); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={kind === 'reopen' ? 'Reopen shipment' : 'Cancel shipment'} onClose={onClose}>
      <div className="muted small">{kind === 'reopen' ? 'Removes the release and unlocks the checklist. The previous release stays in the audit trail.' : 'Cancels this shipment. This cannot be undone.'}</div>
      <label className="f">Reason *<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <PinField value={pin} onChange={setPin} label="QC manager PIN" /><ErrorBox error={err} />
      <button className="btn bad big" disabled={pin.length < 4 || reason.trim().length < 5} onClick={async () => { try { onDone(await post(`/shipments/${id}/${kind}`, { pin, reason })); } catch (e: any) { setErr(e.message); } }}>{kind === 'reopen' ? 'Reopen' : 'Cancel shipment'}</button>
    </Modal>
  );
}

function TemplateDialog({ id, onClose, toast, defaultCustomer }: { id: number; onClose: () => void; toast: any; defaultCustomer: string }) {
  const [name, setName] = useState(`${defaultCustomer} — standard`); const [customer, setCustomer] = useState(defaultCustomer); const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Save this job’s checklist as a template" onClose={onClose}>
      <div className="muted small">Copies the current items (including your custom edits) so future {customer || 'customer'} jobs start from it.</div>
      <label className="f">Template name<input type="text" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="f">Customer (leave blank for general use)<input type="text" value={customer} onChange={e => setCustomer(e.target.value)} /></label>
      <ErrorBox error={err} />
      <button className="btn primary" disabled={name.trim().length < 2} onClick={async () => { try { await post(`/shipments/${id}/save-as-template`, { name, customer: customer || null }); toast('Template saved', 'ok'); onClose(); } catch (e: any) { setErr(e.message); } }}>Save template</button>
    </Modal>
  );
}
