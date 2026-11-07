import { useEffect, useState } from 'react';
import { get } from './api';

export interface Meta { plants: string[]; requireApprovedTemplates: boolean; onTimeGraceMin: number }
/** Shop settings (plants etc.), cached for offline. */
export function useMeta(): Meta {
  const [m, setM] = useState<Meta>({ plants: [], requireApprovedTemplates: false, onTimeGraceMin: 60 });
  useEffect(() => { get<Meta>('/meta').then(r => setM(r.data)).catch(() => {}); }, []);
  return m;
}
