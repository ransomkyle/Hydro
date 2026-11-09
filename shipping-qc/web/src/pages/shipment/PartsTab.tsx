import { useState } from 'react';
import { ErrorBox } from '../../components/ui';
import { del, post } from '../../lib/api';
import { type TabProps, isQC } from './types';

export default function PartsTab(p: TabProps) {
  const { d, locked } = p;
  const [f, setF] = useState<any>({ part_no: '', description: '', qty: '1', grade: '', heat_no: '', finish: '', drawing_rev: '' }); const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((x: any) => ({ ...x, [k]: v }));
  const can = !locked && (isQC(p.role) || p.role === 'shipping');
  return (
    <div className="stack">
      <div className="card flush scroll-x">
        <table className="tbl"><thead><tr><th>Part #</th><th>Description</th><th>Qty</th><th>Grade</th><th>Heat #</th><th>Finish</th><th>Rev</th><th /></tr></thead>
          <tbody>{d.parts.map(x => <tr key={x.id}><td>{x.part_no ?? '—'}</td><td>{x.description ?? '—'}</td><td>{x.qty}</td><td>{x.grade ?? '—'}</td><td className="mono">{x.heat_no ?? '—'}</td><td>{x.finish ?? '—'}</td><td>{x.drawing_rev ?? '—'}</td>
            <td>{can && <button className="btn sm ghost" onClick={async () => { try { p.setDetail(await del(`/shipments/${d.shipment.id}/parts/${x.id}`)); } catch (e: any) { p.toast(e.message, 'bad'); } }}>Remove</button>}</td></tr>)}
            {d.parts.length === 0 && <tr><td colSpan={8} className="empty">No parts listed.</td></tr>}</tbody></table>
      </div>
      {can && (
        <form className="card stack" onSubmit={async e => { e.preventDefault(); setErr(null); try { p.setDetail(await post(`/shipments/${d.shipment.id}/parts`, { ...f, qty: Number(f.qty) || 1, part_no: f.part_no || null, description: f.description || null, grade: f.grade || null, heat_no: f.heat_no || null, finish: f.finish || null, drawing_rev: f.drawing_rev || null })); setF({ ...f, part_no: '', description: '', heat_no: '' }); } catch (x: any) { setErr(x.message); } }}>
          <h2>Add part</h2>
          <div className="grid g4">
            {[['part_no', 'Part #'], ['description', 'Description'], ['qty', 'Qty'], ['grade', 'Grade'], ['heat_no', 'Heat #'], ['finish', 'Finish'], ['drawing_rev', 'Drawing rev']].map(([k, l]) =>
              <label key={k} className="f">{l}<input type="text" value={f[k]} onChange={e => set(k, e.target.value)} /></label>)}
          </div>
          <ErrorBox error={err} /><div><button className="btn primary">Add part</button></div>
        </form>)}
    </div>
  );
}
