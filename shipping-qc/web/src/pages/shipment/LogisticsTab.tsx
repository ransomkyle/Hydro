import { useEffect, useState } from 'react';
import { Badge, ErrorBox, Modal, SignaturePad, getPosition } from '../../components/ui';
import { patch } from '../../lib/api';
import { EVENT_LABEL, fmtDT, fromLocalInput, minTiedowns, toLocalInput, classify } from '../../lib/format';
import { sendOrQueue } from '../../lib/outbox';
import { type TabProps, isQC } from './types';

const FIELDS: [string, string, 'text' | 'number' | 'datetime'][] = [
  ['ship_from_dock', 'Ship-from dock / bay', 'text'], ['pickup_appt', 'Pickup appointment', 'datetime'], ['carrier', 'Carrier', 'text'], ['equipment_type', 'Trailer / equipment type', 'text'],
  ['truck_no', 'Truck #', 'text'], ['trailer_no', 'Trailer #', 'text'], ['driver_name', 'Driver name', 'text'], ['driver_id_no', 'Driver ID / CDL #', 'text'],
  ['bol_no', 'BOL #', 'text'], ['pro_no', 'Pro / tracking #', 'text'], ['seal_no', 'Seal #', 'text'], ['permit_no', 'Permit #(s)', 'text'],
  ['length_in', 'Length (in)', 'number'], ['width_in', 'Width (in)', 'number'], ['height_in', 'Height (in)', 'number'], ['weight_lb', 'Weight (lb)', 'number'],
  ['ship_to_name', 'Ship to (name)', 'text'], ['ship_to_address', 'Ship to (address)', 'text'],
];

export default function LogisticsTab(p: TabProps) {
  const { d } = p; const s = d.shipment;
  const frozen = ['delivered', 'cancelled'].includes(s.status) || !(isQC(p.role) || p.role === 'shipping');
  const init = () => Object.fromEntries(FIELDS.map(([k, , t]) => [k, t === 'datetime' ? toLocalInput(s[k]) : (s[k] ?? '')]));
  const [f, setF] = useState<Record<string, any>>(init); const [esc, setEsc] = useState(!!s.escort_required);
  const [rig, setRig] = useState(s.rigging_notes ?? ''); const [tie, setTie] = useState(s.tiedown_notes ?? '');
  const [err, setErr] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const [event, setEvent] = useState<string | null>(null);
  useEffect(() => { setF(init()); setEsc(!!s.escort_required); setRig(s.rigging_notes ?? ''); setTie(s.tiedown_notes ?? ''); /* eslint-disable-next-line */ }, [s.updated_at]);

  const L = Number(f.length_in) || 0, W = Number(f.weight_lb) || 0;
  const need = minTiedowns(L, W);
  const permit = classify({ length_in: L, width_in: Number(f.width_in) || 0, height_in: Number(f.height_in) || 0, weight_lb: W }).permit;

  const save = async () => {
    setErr(null); setSaved(false);
    try {
      const body: any = { escort_required: esc, rigging_notes: rig || null, tiedown_notes: tie || null };
      for (const [k, , t] of FIELDS) body[k] = t === 'number' ? (f[k] === '' ? null : Number(f[k])) : t === 'datetime' ? fromLocalInput(f[k]) : (f[k] || null);
      p.setDetail(await patch(`/shipments/${s.id}`, body)); setSaved(true);
    } catch (x: any) { setErr(x.message); }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Carrier, driver & load</h2>
        <div className="grid g3">
          {FIELDS.map(([k, label, t]) => (
            <label key={k} className="f">{label}
              <input type={t === 'number' ? 'number' : t === 'datetime' ? 'datetime-local' : 'text'} step="any" disabled={frozen} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
            </label>))}
        </div>
        <div className="grid g2">
          <label className="f">Rigging / lift plan notes<textarea disabled={frozen} value={rig} onChange={e => setRig(e.target.value)} /></label>
          <label className="f">Tie-down / securement notes<textarea disabled={frozen} value={tie} onChange={e => setTie(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" disabled={frozen} checked={esc} onChange={e => setEsc(e.target.checked)} />Escort / pilot car required</label>
        {L > 0 && (
          <div className="note"><b>Tie-down guide (49 CFR 393.110):</b> a {(L / 12).toFixed(1)} ft load needs at least <b>{need}</b> tie-down{need === 1 ? '' : 's'}, and the combined working load limit must be at least 50% of the cargo weight{W ? ` (≥ ${Math.ceil(W / 2).toLocaleString()} lb WLL)` : ''}. Carrier, state and customer rules may require more.</div>)}
        {permit.length > 0 && <div className="note warn"><b>Check permits:</b> {permit.join(', ')}.</div>}
        <ErrorBox error={err} />
        {!frozen && <div className="row"><button className="btn primary" onClick={save}>Save logistics details</button>{saved && <span style={{ color: 'var(--ok)' }}>✔ Saved</span>}<span className="muted small">Needs a connection. Time-stamped events below also work offline.</span></div>}
      </section>

      <section className="card stack">
        <div className="row"><h2 style={{ margin: 0 }}>Custody timeline</h2><span className="muted small">Time, place and person recorded for each step.</span></div>
        {!frozen && (
          <div className="row">{(['ready', 'loaded', 'departed', 'picked_up', 'delivered', 'note'] as const).map(t => <button key={t} className="btn" onClick={() => setEvent(t)}>{EVENT_LABEL[t]}</button>)}</div>)}
        <div className="timeline">
          {d.events.map(e => (
            <div className="tl" key={e.id}><i />
              <div><b>{EVENT_LABEL[e.type] ?? e.type}</b> <span className="muted small">— {fmtDT(e.at)}</span> {e._pending ? <Badge kind="offline">queued</Badge> : e.offline ? <Badge kind="offline">offline</Badge> : null}
                <div className="small">{[e.location && `📍 ${e.location}`, e.lat != null && `GPS ${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}${e.accuracy_m ? ` (±${e.accuracy_m} m)` : ''}`, e.person_name && `Person: ${e.person_name}`].filter(Boolean).join('   ·   ')}</div>
                {e.note && <div className="small">{e.note}</div>}
                {e.signature_png && <img src={e.signature_png} alt="signature" style={{ maxHeight: 54, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', marginTop: 4 }} />}
                <div className="muted tiny">recorded by {e.recorded_by_name}</div></div></div>))}
          {d.events.length === 0 && <div className="muted">No events yet.</div>}
        </div>
      </section>
      {event && <EventDialog type={event} p={p} onClose={() => setEvent(null)} />}
    </div>
  );
}

function EventDialog({ type, p, onClose }: { type: string; p: TabProps; onClose: () => void }) {
  const s = p.d.shipment;
  const [location, setLocation] = useState(type === 'delivered' ? (s.ship_to_address ?? '') : (s.ship_from_dock ?? ''));
  const [person, setPerson] = useState(type === 'picked_up' ? (s.driver_name ?? '') : ''); const [note, setNote] = useState('');
  const [sig, setSig] = useState<string | null>(null); const [gps, setGps] = useState<any>(null); const [gerr, setGerr] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const wantsSig = type === 'picked_up' || type === 'delivered';
  const unreleased = (type === 'picked_up' || type === 'departed') && !['released', 'shipped', 'delivered'].includes(s.status);
  return (
    <Modal title={EVENT_LABEL[type]} onClose={onClose}>
      <div className="muted small">Time is recorded automatically ({new Date().toLocaleString()}).</div>
      {unreleased && <div className="err"><b>This shipment has NOT been released by a QC manager.</b> Recording it leaving will raise a critical flag and alert QC.</div>}
      <label className="f">Place / dock<input type="text" value={location} onChange={e => setLocation(e.target.value)} /></label>
      <div className="row"><button type="button" className="btn sm" onClick={async () => { setGerr(''); try { setGps(await getPosition()); } catch (e: any) { setGerr(e.message); } }}>📍 Capture GPS location</button>
        {gps && <span className="small">✔ {gps.lat}, {gps.lng} (±{gps.accuracy_m} m)</span>}{gerr && <span className="small" style={{ color: 'var(--bad)' }}>{gerr}</span>}</div>
      {wantsSig && <label className="f">{type === 'picked_up' ? 'Driver name' : 'Received by'}<input type="text" value={person} onChange={e => setPerson(e.target.value)} /></label>}
      {wantsSig && <div><div className="muted small" style={{ marginBottom: 4 }}>{type === 'picked_up' ? 'Driver signature' : 'Receiver signature'}</div><SignaturePad onChange={setSig} /></div>}
      <label className="f">Note<input type="text" value={note} onChange={e => setNote(e.target.value)} /></label>
      <ErrorBox error={err} />
      <button className="btn primary big" disabled={busy || (wantsSig && !person.trim())} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const r = await sendOrQueue(p.ctx, 'event', s.id, `/shipments/${s.id}/events`, { type, location: location || null, person_name: person || null, note: note || null, signature_png: sig, ...(gps ?? {}) }, `Event: ${EVENT_LABEL[type]}`);
          if (r.queued) p.toast('Offline — event saved with its time and will sync', 'warn'); else { p.setDetail(r.data); p.toast('Recorded ✔', 'ok'); }
          onClose();
        } catch (e: any) { setErr(e.message); setBusy(false); }
      }}>Record {EVENT_LABEL[type].toLowerCase()}</button>
    </Modal>
  );
}
