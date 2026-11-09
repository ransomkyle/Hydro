import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ErrorBox, useToast } from '../components/ui';
import { download, post } from '../lib/api';

export default function Import() {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(''); const [name, setName] = useState(''); const [prev, setPrev] = useState<any>(null); const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const run = async (dryRun: boolean) => {
    setBusy(true); setErr(null);
    try { const r = await post('/import/shipments', { csv, dryRun }); if (dryRun) { setPrev(r); setRes(null); } else { setRes(r); setPrev(null); toast(`Imported ${r.created.length} shipment(s)`, 'ok'); } }
    catch (e: any) { setErr(e.message); if (e.detail?.errors) setPrev({ shipments: [], errors: e.detail.errors, unknownColumns: [] }); } finally { setBusy(false); }
  };
  const importable = prev?.shipments?.filter((s: any) => !s.duplicateOf).length ?? 0;
  return (
    <div className="stack">
      <div className="row"><h1>Import jobs from a spreadsheet / ERP export</h1><button className="btn sm right" onClick={() => download('/import/template.csv', 'shipment-import-template.csv').catch(e => toast(e.message, 'bad'))}>Download template</button></div>
      <div className="note">Export open jobs from your ERP or Excel as CSV and upload it. Columns are matched by name (“Job #”, “Customer Name”, “PO”, “Part Number”, “Qty”, “Heat”, “Weight”, “Plant”, “Ship Date”…). Rows with the same job + customer + PO become one shipment with several parts. Checklist modules are suggested from size and notes. You preview everything before anything is created.</div>
      <div className="card stack">
        <input ref={file} type="file" hidden accept=".csv,text/csv,text/plain" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setName(f.name); setCsv(await f.text()); setPrev(null); setRes(null); e.target.value = ''; }} />
        <div className="row"><button className="btn" onClick={() => file.current?.click()}>Choose CSV file…</button>{name && <span className="muted">{name} — {csv.split(/\r?\n/).filter(Boolean).length - 1} rows</span>}</div>
        <details><summary className="muted small" style={{ cursor: 'pointer' }}>…or paste CSV text</summary><textarea style={{ marginTop: 8, fontFamily: 'ui-monospace,monospace', fontSize: '.8rem', minHeight: 140 }} value={csv} onChange={e => { setCsv(e.target.value); setPrev(null); setRes(null); }} /></details>
        <ErrorBox error={err} />
        <div><button className="btn primary" disabled={!csv.trim() || busy} onClick={() => run(true)}>Preview import</button></div>
      </div>
      {prev && (<>
        {prev.unknownColumns?.length > 0 && <div className="note warn">Ignored columns (not recognised): {prev.unknownColumns.join(', ')}</div>}
        {prev.errors?.length > 0 && <div className="err"><b>{prev.errors.length} row(s) need fixing before you can import:</b><ul className="clean small">{prev.errors.slice(0, 30).map((e: any, i: number) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul></div>}
        {prev.shipments.length > 0 && <div className="card flush scroll-x"><table className="tbl"><thead><tr><th>Job</th><th>Customer / PO</th><th>Plant</th><th>Size</th><th>Parts</th><th>Checklist modules</th><th /></tr></thead>
          <tbody>{prev.shipments.map((s: any, i: number) => (
            <tr key={i} style={s.duplicateOf ? { opacity: .55 } : undefined}><td><b>{s.job_no}</b></td><td>{s.customer}<div className="muted small">{s.po_no ?? ''}</div></td><td>{s.plant ?? <span className="muted">default</span>}</td><td>{s.size}</td><td>{s.parts}</td>
              <td className="small">{s.templateIds.length} selected{s.withheldTemplates?.length ? <div className="muted tiny">withheld (not approved): {s.withheldTemplates.join('; ')}</div> : null}</td>
              <td>{s.duplicateOf ? <Badge kind="major">exists: {s.duplicateOf}</Badge> : <Badge kind="released">new</Badge>}</td></tr>))}</tbody></table></div>}
        {prev.errors?.length === 0 && importable > 0 && <div><button className="btn ok big" disabled={busy} onClick={() => run(false)}>Import {importable} shipment{importable === 1 ? '' : 's'}</button></div>}
      </>)}
      {res && <div className="card stack"><h2>Imported {res.created.length}</h2><ul className="clean">{res.created.map((c: any) => <li key={c.id}><Link to={`/shipments/${c.id}`}>{c.shipment_no}</Link> — job {c.job_no}</li>)}</ul>
        {res.skipped.length > 0 && <div className="muted small">Skipped: {res.skipped.map((s: any) => `${s.job_no} (${s.reason})`).join('; ')}</div>}</div>}
    </div>
  );
}
