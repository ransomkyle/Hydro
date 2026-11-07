import { useState } from 'react';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import { post } from '../../lib/api';
import { CATEGORY_LABEL, fmtDT } from '../../lib/format';
import { sendOrQueue } from '../../lib/outbox';
import { ScanButton } from '../../components/Scanner';
import { type TabProps, isQC } from './types';

const SUGGEST: Record<string, string[]> = {
  base_metal: ['304/304L plate', '316/316L plate', '316L sanitary tube', '316L pipe', '2205 duplex plate', 'Stainless sheet', 'Stainless bar', 'Flange / fitting'],
  consumable: ['ER316L filler wire', 'ER308L filler wire', 'ER309L filler wire', 'ER2209 filler wire', 'Argon shielding gas', 'Argon purge gas', 'Argon/Helium mix', 'Nitric acid passivation solution', 'Citric acid passivation solution', 'Pickling paste', 'Electropolish solution', 'Cleaning solvent'],
  packaging: ['VCI film', 'Stretch wrap', 'Protective PE film', 'Wood skid (heat-treated)', 'Crate', 'Foam sheet', 'Plastic end caps', 'Desiccant', 'Nonmetallic dunnage / blocking', 'Edge protectors', 'Nylon strap', 'Cardboard box'],
};
const blank = { category: 'base_metal', name: '', grade: '', heat_lot: '', spec: '', qty: '', unit: '', note: '' };

export default function MaterialsTab(p: TabProps) {
  const { d, locked } = p;
  const [f, setF] = useState(blank); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<any>(null); const [reason, setReason] = useState('');
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));
  const rows = d.materials.filter(m => !m.voided);
  const canAdd = !locked && p.role !== 'auditor';
  return (
    <div className="stack">
      {canAdd && (
        <form className="card stack" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setErr(null);
          try {
            const body: any = { category: f.category, name: f.name, grade: f.grade || null, heat_lot: f.heat_lot || null, spec: f.spec || null, qty: f.qty === '' ? null : Number(f.qty), unit: f.unit || null, note: f.note || null };
            const r = await sendOrQueue(p.ctx, 'material', d.shipment.id, `/shipments/${d.shipment.id}/materials`, body, `Material: ${f.name}`);
            if (r.queued) p.toast('Offline — saved on this device, will sync', 'warn'); else p.setDetail(r.data);
            setF({ ...blank, category: f.category });
          } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
        }}>
          <h2>Log material used</h2>
          <div className="grid g3">
            <label className="f">Type<select value={f.category} onChange={e => set('category', e.target.value)}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="f">Material *<input type="text" list="matnames" required value={f.name} onChange={e => set('name', e.target.value)} /></label>
            <datalist id="matnames">{SUGGEST[f.category].map(x => <option key={x} value={x} />)}</datalist>
            <label className="f">Grade / alloy<input type="text" value={f.grade} onChange={e => set('grade', e.target.value)} placeholder="316L" /></label>
            <label className="f">Heat / lot # {f.category === 'base_metal' ? '*' : ''}<span style={{ display: 'flex', gap: 6 }}><input type="text" required={f.category === 'base_metal'} value={f.heat_lot} onChange={e => set('heat_lot', e.target.value)} /><ScanButton label="📷" onScan={v => set('heat_lot', v)} /></span></label>
            <label className="f">Spec<input type="text" value={f.spec} onChange={e => set('spec', e.target.value)} placeholder="ASTM A240 / AWS A5.9" /></label>
            <div className="grid g2"><label className="f">Qty<input type="number" min="0" step="any" value={f.qty} onChange={e => set('qty', e.target.value)} /></label><label className="f">Unit<input type="text" value={f.unit} onChange={e => set('unit', e.target.value)} placeholder="lb, ft, ea" /></label></div>
          </div>
          <label className="f">Note<input type="text" value={f.note} onChange={e => set('note', e.target.value)} /></label>
          <ErrorBox error={err} />
          <div><button className="btn primary" disabled={busy}>Add material</button></div>
        </form>)}
      <div className="card flush scroll-x">
        <table className="tbl">
          <thead><tr><th>Type</th><th>Material</th><th>Grade</th><th>Heat / lot</th><th>Qty</th><th>Logged</th><th /></tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id}>
                <td><Badge kind="pending">{CATEGORY_LABEL[m.category]}</Badge></td>
                <td>{m.name}{m.spec && <div className="muted small">{m.spec}</div>}{m.note && <div className="muted small">{m.note}</div>}</td>
                <td>{m.grade ?? '—'}</td><td className="mono">{m.heat_lot ?? '—'}</td><td>{m.qty != null ? `${m.qty} ${m.unit ?? ''}` : '—'}</td>
                <td className="small">{m.added_by_name}<br />{fmtDT(m.added_at)} {m._pending ? <Badge kind="offline">queued</Badge> : m.offline ? <Badge kind="offline">offline</Badge> : null}</td>
                <td>{isQC(p.role) && !locked && !m._pending && <button className="btn sm ghost" onClick={() => setVoiding(m)}>Void</button>}</td>
              </tr>))}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">No materials logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {d.materials.some(m => m.voided) && <div className="muted small">{d.materials.filter(m => m.voided).length} voided entr{d.materials.filter(m => m.voided).length === 1 ? 'y is' : 'ies are'} kept in the audit trail.</div>}
      {voiding && (
        <Modal title="Void material entry" onClose={() => setVoiding(null)}>
          <div>{voiding.name} {voiding.heat_lot && <span className="mono">({voiding.heat_lot})</span>}</div>
          <label className="f">Reason *<input type="text" value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button className="btn bad" disabled={reason.trim().length < 3} onClick={async () => { try { p.setDetail(await post(`/shipments/materials/${voiding.id}/void`, { reason })); setVoiding(null); setReason(''); } catch (e: any) { p.toast(e.message, 'bad'); } }}>Void entry</button>
        </Modal>)}
    </div>
  );
}
