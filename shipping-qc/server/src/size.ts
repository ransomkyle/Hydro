/**
 * Shop thresholds used to suggest checklist modules on import. Mirrors web/src/lib/format.ts (SIZE_RULES / classify).
 * "oversize" = special handling (rigging, permits, escorts, long securement), not just legal-limit oversize.
 */
export const SIZE_RULES = { smallMaxDimIn: 24, smallMaxLb: 50, longIn: 240, wideIn: 96, tallIn: 96, heavyLb: 10_000 };

export function classifySize(d: { length_in?: number | null; width_in?: number | null; height_in?: number | null; weight_lb?: number | null }): 'small' | 'standard' | 'oversize' {
  const L = d.length_in ?? 0, W = d.width_in ?? 0, H = d.height_in ?? 0, lb = d.weight_lb ?? 0;
  if (!L && !W && !H && !lb) return 'standard';
  const r = SIZE_RULES;
  if (L >= r.longIn || W > r.wideIn || H > r.tallIn || lb >= r.heavyLb) return 'oversize';
  return Math.max(L, W, H) <= r.smallMaxDimIn && lb <= r.smallMaxLb ? 'small' : 'standard';
}
