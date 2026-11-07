export const fmtDT = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
};
export const fmtShort = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const ROLE_LABEL: Record<string, string> = { operator: 'Operator / Packer', inspector: 'QC Inspector', manager: 'QC Manager', shipping: 'Shipping / Logistics', admin: 'Administrator', auditor: 'Auditor (read-only)' };
export const STATUS_LABEL: Record<string, string> = { draft: 'Draft', in_progress: 'In progress', released: 'Released', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
export const EVENT_LABEL: Record<string, string> = { ready: 'Ready to ship', loaded: 'Loaded on truck', departed: 'Departed dock', picked_up: 'Picked up by carrier', delivered: 'Delivered', note: 'Note' };
export const CATEGORY_LABEL: Record<string, string> = { base_metal: 'Base metal', consumable: 'Consumable', packaging: 'Packaging / protection' };

/**
 * Shop thresholds for suggesting checklist modules. Tune these to your shop and trailers.
 * "Oversize" here means special handling (rigging, permits, escorts, long securement), not just legal-limit oversize.
 */
export const SIZE_RULES = { smallMaxDimIn: 24, smallMaxLb: 50, longIn: 240, wideIn: 96, tallIn: 96, heavyLb: 10_000,
  legalWidthIn: 102, legalHeightIn: 162, legalLengthIn: 636, legalWeightLb: 80_000 };

export function classify(d: { length_in?: number | null; width_in?: number | null; height_in?: number | null; weight_lb?: number | null }) {
  const L = d.length_in ?? 0, W = d.width_in ?? 0, H = d.height_in ?? 0, lb = d.weight_lb ?? 0;
  const max = Math.max(L, W, H);
  const none = !L && !W && !H && !lb;
  const r = SIZE_RULES;
  const size: 'small' | 'standard' | 'oversize' = none ? 'standard'
    : (L >= r.longIn || W > r.wideIn || H > r.tallIn || lb >= r.heavyLb) ? 'oversize'
    : (max <= r.smallMaxDimIn && lb <= r.smallMaxLb) ? 'small' : 'standard';
  const permit: string[] = [];
  if (W > r.legalWidthIn) permit.push(`width over ${r.legalWidthIn} in`);
  if (H > r.legalHeightIn) permit.push(`height over 13 ft 6 in`);
  if (L > r.legalLengthIn) permit.push('length over 53 ft');
  if (lb > r.legalWeightLb) permit.push('weight over 80,000 lb');
  return { size, permit };
}

/** Minimum tie-downs per 49 CFR 393.110 (guidance — carrier & state rules may be stricter). */
export function minTiedowns(lengthIn: number, weightLb: number): number {
  const ft = lengthIn / 12;
  if (!ft) return 0;
  if (ft <= 5) return weightLb <= 1100 ? 1 : 2;
  if (ft <= 10) return 2;
  return 2 + Math.ceil((ft - 10) / 10);
}
