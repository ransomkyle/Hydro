import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, ErrorBox, Modal, PinField, useToast } from '../components/ui';
import { get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';

export function TemplateList() {
  const { can } = useAuth(); const [rows, setRows] = useState<any[]>([]); const [all, setAll] = useState(false); const toast = useToast();
  const load = () => get<any[]>('/templates' + (all ? '?all=1' : '')).then(r => setRows(r.data));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [all]);
  const mayEdit = can('manager', 'admin'); const [appr, setAppr] = useState<any>(null); const [pin, setPin] = useState(''); const [aerr, setAerr] = useState<string | null>(null);
  return (
    <div className="stack">
      <div className="row"><h1>Checklist library</h1>{mayEdit && <Link to="/templates/new" className="btn primary right">+ New template</Link>}</div>
      <div className="note">Each shipment gets its <b>own copy</b> of the checklist, stacked from one or more of these (e.g. Base + Oversize + Sanitary) and editable per job. Edit templates here to change what future shipments start with. Create customer-specific templates, or save any job’s checklist as a template.</div>
      <label className="check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Show archived</label>
      <div className="grid g2">
        {rows.map(t => (
          <div key={t.id} className="card stack" style={{ opacity: t.active ? 1 : .6 }}>
            <div className="row"><b>{t.name}</b><Badge kind={t.category === 'base' ? 'released' : t.category === 'customer' ? 'shipped' : 'pending'}>{t.category}</Badge>{!t.active && <Badge kind="cancelled">archived</Badge>}</div>
            <div className="muted small">{t.description}</div>
            <div className="small">{t.item_count} items · v{t.version}{t.customer ? ` · ${t.customer}` : ''}</div>
            <div className="small">{t.approved_at ? <span style={{ color: 'var(--ok)' }}>✔ Approved by {t.approved_by_name} · {new Date(t.approved_at).toLocaleDateString()}</span> : <span style={{ color: 'var(--warn)' }}>⚠ Not approved by a QC manager yet</span>}</div>
            <div className="row"><Link className="btn sm" to={`/templates/${t.id}`}>{mayEdit ? 'View / edit' : 'View'}</Link>
              {can('manager') && !t.approved_at && <button className="btn sm ok" onClick={() => { setAppr(t); setPin(''); setAerr(null); }}>Approve…</button>}
              {mayEdit && <button className="btn sm ghost" onClick={async () => { await post(`/templates/${t.id}/archive`, { active: !t.active }); toast(t.active ? 'Archived' : 'Restored', 'ok'); load(); }}>{t.active ? 'Archive' : 'Restore'}</button>}</div>
          </div>))}
      </div>
      {appr && (
        <Modal title={`Approve “${appr.name}” (v${appr.version})`} onClose={() => setAppr(null)}>
          <div className="muted small">By approving you confirm you have reviewed every item against the quality manual and customer requirements. Any later edit clears approval.</div>
          <PinField value={pin} onChange={setPin} label="QC manager PIN" /><ErrorBox error={aerr} />
          <button className="btn ok big" disabled={pin.length < 4} onClick={async () => { try { await post(`/templates/${appr.id}/approve`, { pin }); toast('Template approved', 'ok'); setAppr(null); load(); } catch (e: any) { setAerr(e.message); } }}>Sign & approve</button>
        </Modal>)}
    </div>
  );
}

const blankItem = () => ({ section: 'General', text: '', kind: 'check', unit: '', spec: '', reference: '', required: true, signer_role: 'any', needs_verification: false });

export function TemplateEdit() {
  const { id } = useParams(); const isNew = id === 'new'; const nav = useNavigate(); const { can } = useAuth(); const toast = useToast();
  const mayEdit = can('manager', 'admin');
  const [t, setT] = useState<any>({ name: '', description: '', customer: '', category: 'customer', items: [blankItem()] }); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!isNew) get(`/templates/${id}`).then(r => setT(r.data)).catch(e => setErr(e.message)); }, [id, isNew]);
  const setItem = (i: number, k: string, v: any) => setT((x: any) => ({ ...x, items: x.items.map((it: any, j: number) => j === i ? { ...it, [k]: v } : it) }));
  const move = (i: number, d: number) => setT((x: any) => { const a = [...x.items]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, items: a }; });
  const save = async () => {
    setErr(null);
    try {
      const body = { name: t.name, description: t.description || null, customer: t.customer || null, category: t.category,
        items: t.items.map((i: any) => ({ section: i.section, text: i.text, kind: i.kind, unit: i.unit || null, spec: i.spec || null, reference: i.reference || null, required: !!i.required, signer_role: i.signer_role, needs_verification: !!i.needs_verification })) };
      if (isNew) await post('/templates', body); else await put(`/templates/${id}`, body);
      toast('Template saved', 'ok'); nav('/templates');
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="stack">
      <h1>{isNew ? 'New template' : mayEdit ? 'Edit template' : 'Template'}</h1>
      <div className="card stack">
        <div className="grid g3">
          <label className="f">Name *<input type="text" disabled={!mayEdit} value={t.name} onChange={e => setT({ ...t, name: e.target.value })} /></label>
          <label className="f">Customer (optional)<input type="text" disabled={!mayEdit} value={t.customer ?? ''} onChange={e => setT({ ...t, customer: e.target.value })} /></label>
          <label className="f">Kind<select disabled={!mayEdit} value={t.category} onChange={e => setT({ ...t, category: e.target.value })}><option value="base">Base (always included)</option><option value="module">Module (add-on)</option><option value="customer">Customer-specific</option></select></label>
        </div>
        <label className="f">Description<input type="text" disabled={!mayEdit} value={t.description ?? ''} onChange={e => setT({ ...t, description: e.target.value })} /></label>
        {!isNew && mayEdit && <div className="note warn">Saving changes applies to <b>new</b> shipments only. Shipments already created keep their own checklist copy.</div>}
      </div>
      {t.items.map((it: any, i: number) => (
        <div key={i} className="card stack">
          <div className="row"><b>#{i + 1}</b><span className="muted small">{it.section}</span>
            {mayEdit && <span className="right row"><button className="btn sm" onClick={() => move(i, -1)}>↑</button><button className="btn sm" onClick={() => move(i, 1)}>↓</button><button className="btn sm ghost" onClick={() => setT({ ...t, items: t.items.filter((_: any, j: number) => j !== i) })}>Delete</button></span>}</div>
          <div className="grid g3">
            <label className="f">Section<input type="text" disabled={!mayEdit} value={it.section} onChange={e => setItem(i, 'section', e.target.value)} /></label>
            <label className="f">Type<select disabled={!mayEdit} value={it.kind} onChange={e => setItem(i, 'kind', e.target.value)}><option value="check">Pass / fail</option><option value="value">Record value</option><option value="photo">Photo required</option><option value="doc">Document required</option></select></label>
            <label className="f">Who may sign<select disabled={!mayEdit} value={it.signer_role} onChange={e => setItem(i, 'signer_role', e.target.value)}><option value="any">Anyone</option><option value="inspector">QC inspector+</option><option value="manager">QC manager</option></select></label>
          </div>
          <label className="f">Check *<textarea disabled={!mayEdit} value={it.text} onChange={e => setItem(i, 'text', e.target.value)} /></label>
          <div className="grid g3">
            <label className="f">Acceptance / instruction<input type="text" disabled={!mayEdit} value={it.spec ?? ''} onChange={e => setItem(i, 'spec', e.target.value)} /></label>
            <label className="f">Standard / clause<input type="text" disabled={!mayEdit} value={it.reference ?? ''} onChange={e => setItem(i, 'reference', e.target.value)} /></label>
            <label className="f">Unit<input type="text" disabled={!mayEdit} value={it.unit ?? ''} onChange={e => setItem(i, 'unit', e.target.value)} /></label>
          </div>
          <div className="row"><label className="check"><input type="checkbox" disabled={!mayEdit} checked={!!it.required} onChange={e => setItem(i, 'required', e.target.checked)} />Required</label>
            <label className="check"><input type="checkbox" disabled={!mayEdit} checked={!!it.needs_verification} onChange={e => setItem(i, 'needs_verification', e.target.checked)} />Hold point (2nd person verifies)</label></div>
        </div>))}
      <ErrorBox error={err} />
      {mayEdit && <div className="row"><button className="btn" onClick={() => setT({ ...t, items: [...t.items, { ...blankItem(), section: t.items[t.items.length - 1]?.section ?? 'General' }] })}>+ Add item</button>
        <button className="btn primary" disabled={!t.name.trim() || t.items.some((i: any) => !i.text.trim())} onClick={save}>Save template</button><button className="btn" onClick={() => nav('/templates')}>Cancel</button></div>}
    </div>
  );
}
