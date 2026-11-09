import type { Ctx } from '../../lib/outbox';
import type { Detail } from '../../lib/useShipment';

export interface TabProps {
  d: Detail; locked: boolean; ctx: Ctx; role: string; userId: number;
  reload: () => Promise<void>; setDetail: (d: any) => void;
  pendingFiles: import('../../lib/outbox').Op[]; ops: import('../../lib/outbox').Op[];
  toast: (t: string, k?: 'ok' | 'bad' | 'warn' | '') => void;
}
export const isQC = (role: string) => role === 'inspector' || role === 'manager' || role === 'admin';
