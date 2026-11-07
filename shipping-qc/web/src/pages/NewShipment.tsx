import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBox } from '../components/ui';
import { get, post } from '../lib/api';
import { SIZE_RULES, classify, fromLocalInput } from '../lib/format';

const blankPart = () => ({ part_no: '', description: '', qty: '1', grade: '316L', heat_no: '' });
const n = (v: string) => (v.trim() === '' ? null : Number(v));

export default function NewShipment() {
  const nav = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [f, setF] = useState<Record<string, any>>({ job_no: '', customer: '', po_no: '', description: '', special_requirements: '', length_in: '', width_in: '', height_in: '', weight_lb: '', pieces: '',
    ship_from_dock: '', ship_to_name: '', ship_to_address: '', requested_ship_date: '', pickup_appt: '', carrier: '', is_sanitary: false, is_pressure: false, size_class: '' });
  const [parts, setParts] = useState([blankPart()]);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { get<any[]>('/templates').then(r => setTemplates(r.data)).catch(e => setErr(e.message)); }, []);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));

  const cls = useMemo(() => classify({ length_in: n(f.length_in), width_in: n(f.width_in), height_in: n(f.height_in), weight_lb: n(f.weight_lb) }), [f.length_in, f.width_in, f.height_in, f.weight_lb]);
  const sizeClass = f.size_class || cls.size;

  // Suggested modules follow what's being shipped, until the user touches the checkboxes.
  const suggested = useMemo(() => {
    const s = new Set<number>();
    for (const t of templates) {
      if (t.category === 'base') s.add(t.id);
      if (/Small parts/.test(t.name) && sizeClass === 'small') s.add(t.id);
      if (/Sanitary/.test(t.name) && f.is_sanitary) s.add(t.id);
      if (/Pressure/.test(t.name) && f.is_pressure) s.add(t.id);
      if (/Oversize/.test(t.name) && sizeClass === 'oversize') s.add(t.id);
    }
    return s;
  }, [templates, sizeClass, f.is_sanitary, f.is_pressure]);
  const chosen = picked ?? suggested;
  const toggle = (id: number) => { const s = new Set(chosen); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  const total = templates.filter(t => chosen.has(t.id)).reduce((a, t) => a + t.item_count, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body: any = { ...f, size_class: sizeClass, length_in: n(f.length_in), width_in: n(f.width_in), height_in: n(f.height_in), weight_lb: n(f.weight_lb), pieces: n(f.pieces),
        requested_ship_date: f.requested_ship_date || null, pickup_appt: fromLocalInput(f.pickup_appt), templateIds: [...chosen],
        parts: parts.filter(p => p.part_no || p.description).map(p => ({ ...p, qty: Number(p.qty) || 1 })) };
      for (const k of ['po_no', 'description', 'special_requirements', 'ship_from_dock', 'ship_to_name', 'ship_to_address', 'carrier']) if (body[k] === '') body[k] = null;
      const r = await post('/shipments', body);
      nav(`/shipments/${r.shipment.id}`);
    } catch (x: any) { setErr(x.message); setBusy(false); }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h1>New shipment</h1>
      <section className="card stack">
        <h2>What is shipping</h2>
        <div className="grid g3">
          <label className="f">Job # *<input type="text" required value={f.job_no} onChange={e => set('job_no', e.target.value)} /></label>
          <label className="f">Customer *<input type="text" required value={f.customer} onChange={e => set('customer', e.target.value)} /></label>
          <label className="f">Customer PO<input type="text" value={f.po_no} onChange={e => set('po_no', e.target.value)} /></label>
        </div>
        <label className="f">Description<input type="text" value={f.description} onChange={e => set('description', e.target.value)} placeholder="e.g. 316L jacketed process tank, 500 gal" /></label>
        <label className="f">Customer special requirements<textarea value={f.special_requirements} onChange={e => set('special_requirements', e.target.value)} placeholder="Anything in the PO / drawing notes that changes how this must be inspected, packed or documented" /></label>
        <div className="grid g4">
          <label className="f">Length (in)<input type="number" min="0" step="any" inputMode="decimal" value={f.length_in} onChange={e => set('length_in', e.target.value)} /></label>
          <label className="f">Width (in)<input type="number" min="0" step="any" inputMode="decimal" value={f.width_in} onChange={e => set('width_in', e.target.value)} /></label>
          <label className="f">Height (in)<input type="number" min="0" step="any" inputMode="decimal" value={f.height_in} onChange={e => set('height_in', e.target.value)} /></label>
          <label className="f">Weight (lb)<input type="number" min="0" step="any" inputMode="decimal" value={f.weight_lb} onChange={e => set('weight_lb', e.target.value)} /></label>
          <label className="f">Pieces<input type="number" min="0" inputMode="numeric" value={f.pieces} onChange={e => set('pieces', e.target.value)} /></label>
          <label className="f">Size class
            <select value={sizeClass} onChange={e => set('size_class', e.target.value)}>
              <option value="small">Small parts</option><option value="standard">Standard</option><option value="oversize">Oversize / heavy</option></select></label>
        </div>
        {cls.permit.length > 0 && <div className="note warn"><b>Likely needs oversize/overweight permits:</b> {cls.permit.join(', ')}. Check each state on the route.</div>}
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.is_sanitary} onChange={e => set('is_sanitary', e.target.checked)} />Sanitary / 3-A / BPE</label>
          <label className="check"><input type="checkbox" checked={f.is_pressure} onChange={e => set('is_pressure', e.target.checked)} />Pressure equipment (B31.3 / VIII / PED)</label>
        </div>
      </section>

      <section className="card stack">
        <div className="row"><h2 style={{ margin: 0 }}>Checklist for this job</h2><span className="muted small">{total} items selected — you can edit, add or remove items on the shipment afterwards.</span></div>
        <div className="grid g2">
          {templates.map(t => {
            const match = t.customer && f.customer && t.customer.toLowerCase().includes(f.customer.toLowerCase());
            return (
              <label key={t.id} className={`card check ${chosen.has(t.id) ? 'hl' : ''}`} style={{ alignItems: 'flex-start', cursor: 'pointer', borderColor: chosen.has(t.id) ? 'var(--accent)' : undefined }}>
                <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} style={{ marginTop: 3 }} />
                <span><b>{t.name}</b>{match && <span className="badge b-released" style={{ marginLeft: 6 }}>matches customer</span>}<br />
                  <span className="muted small">{t.item_count} items{t.customer ? ` · ${t.customer}` : ''}{t.description ? ' — ' + t.description : ''}</span></span>
              </label>);
          })}
        </div>
        <div className="muted tiny">Suggestions use these shop thresholds (edit in web/src/lib/format.ts): small ≤ {SIZE_RULES.smallMaxDimIn} in & {SIZE_RULES.smallMaxLb} lb; oversize if length ≥ {SIZE_RULES.longIn / 12} ft, width/height &gt; {SIZE_RULES.wideIn / 12} ft, or weight ≥ {SIZE_RULES.heavyLb.toLocaleString()} lb.</div>
      </section>

      <section className="card stack">
        <h2>Parts / line items</h2>
        {parts.map((p, i) => (
          <div className="grid g4" key={i} style={{ alignItems: 'end' }}>
            <label className="f">Part #<input type="text" value={p.part_no} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, part_no: e.target.value } : x))} /></label>
            <label className="f">Description<input type="text" value={p.description} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></label>
            <label className="f">Qty<input type="number" min="0" step="any" value={p.qty} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} /></label>
            <label className="f">Grade<input type="text" list="grades" value={p.grade} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))} /></label>
            <label className="f">Heat #<input type="text" value={p.heat_no} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, heat_no: e.target.value } : x))} /></label>
            {parts.length > 1 && <button type="button" className="btn sm" onClick={() => setParts(ps => ps.filter((_, j) => j !== i))}>Remove</button>}
          </div>))}
        <datalist id="grades">{['304', '304L', '316', '316L', '317L', '321', '347', '2205', '2507', '904L', '17-4PH', '410', '430'].map(g => <option key={g} value={g} />)}</datalist>
        <div><button type="button" className="btn sm" onClick={() => setParts(ps => [...ps, blankPart()])}>+ Add part</button></div>
      </section>

      <section className="card stack">
        <h2>Pickup & destination</h2>
        <div className="grid g3">
          <label className="f">Ship-from dock / bay<input type="text" value={f.ship_from_dock} onChange={e => set('ship_from_dock', e.target.value)} placeholder="Dock 3" /></label>
          <label className="f">Pickup appointment<input type="datetime-local" value={f.pickup_appt} onChange={e => set('pickup_appt', e.target.value)} /></label>
          <label className="f">Requested ship date<input type="date" value={f.requested_ship_date} onChange={e => set('requested_ship_date', e.target.value)} /></label>
          <label className="f">Carrier<input type="text" value={f.carrier} onChange={e => set('carrier', e.target.value)} /></label>
          <label className="f">Ship to (name)<input type="text" value={f.ship_to_name} onChange={e => set('ship_to_name', e.target.value)} /></label>
          <label className="f">Ship to (address)<input type="text" value={f.ship_to_address} onChange={e => set('ship_to_address', e.target.value)} /></label>
        </div>
      </section>
      <ErrorBox error={err} />
      <div className="row"><button className="btn primary big" disabled={busy}>{busy ? 'Creating…' : 'Create shipment & checklist'}</button><button type="button" className="btn" onClick={() => nav(-1)}>Cancel</button></div>
    </form>
  );
}
