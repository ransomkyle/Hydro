import { useEffect, useState } from 'react';
import { get } from '../../lib/api';
import { fmtDT } from '../../lib/format';
import { Badge } from '../../components/ui';

export function summarize(detail: string): string {
  try {
    const o = JSON.parse(detail);
    return Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object').map(([k, v]) => `${k}: ${String(v).slice(0, 90)}`).join(' · ');
  } catch { return detail; }
}

export default function HistoryTab({ id }: { id: number }) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { get<any[]>(`/shipments/${id}/audit`).then(r => setRows(r.data)).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div className="err">{err}</div>;
  return (
    <div className="card flush scroll-x">
      <table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{rows?.map(r => <tr key={r.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.event_at ?? r.at)}{r.offline ? <> <Badge kind="offline">offline</Badge><div className="muted tiny">synced {fmtDT(r.at)}</div></> : null}</td>
          <td>{r.user_name}</td><td className="mono small">{r.action}</td><td className="small muted">{summarize(r.detail)}</td></tr>)}
          {rows?.length === 0 && <tr><td colSpan={4} className="empty">No history.</td></tr>}</tbody></table>
    </div>
  );
}
