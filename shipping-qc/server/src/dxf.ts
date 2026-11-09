/**
 * Minimal ASCII-DXF reader for flat (2D) laser/waterjet/plasma parts. Understands CIRCLE, ARC, LINE, LWPOLYLINE and old-style POLYLINE.
 * Everything else is counted as "unsupported" and ignored. It extracts what an inspector needs (overall size, outer diameter, hole sizes,
 * counts and bolt-circle diameters) and draws an SVG preview. Values are CAD NOMINALS: tolerances always come from the released drawing.
 */
export type Entity =
  | { t: 'CIRCLE'; cx: number; cy: number; r: number }
  | { t: 'ARC'; cx: number; cy: number; r: number; a0: number; a1: number }
  | { t: 'LINE'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'POLY'; pts: { x: number; y: number }[]; closed: boolean };

export interface HoleGroup { dia: number; count: number; pattern: 'single' | 'bolt_circle' | 'scattered'; pcd?: number; evenlySpaced?: boolean; radialMin?: number; radialMax?: number }
export interface DxfSummary {
  units: 'in' | 'mm' | 'unknown'; extents: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  counts: { circles: number; arcs: number; lines: number; polylines: number }; unsupported: Record<string, number>;
  outer: { dia: number } | null; concentric: { dia: number }[]; holeGroups: HoleGroup[]; totalHoles: number;
}
export interface DxfResult { summary: DxfSummary; entities: Entity[] }

const MAX_BYTES = 8 * 1024 * 1024, MAX_ENTITIES = 150_000;
const SUPPORTED = new Set(['CIRCLE', 'ARC', 'LINE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND']);
const UNITS: Record<number, 'in' | 'mm'> = { 1: 'in', 4: 'mm' };

export function looksLikeDxf(buf: Buffer): boolean {
  const head = buf.subarray(0, 2048).toString('latin1');
  return /^\s*0\r?\n\s*SECTION\r?\n\s*2\r?\n\s*(HEADER|ENTITIES|CLASSES|TABLES|BLOCKS)/.test(head);
}

export function parseDxf(buf: Buffer): DxfResult {
  if (buf.length > MAX_BYTES) throw new Error('DXF is larger than 8 MB');
  const lines = buf.toString('latin1').split(/\r?\n/);
  let units: DxfSummary['units'] = 'unknown';
  const ents: Entity[] = []; const unsupported: Record<string, number> = {};
  let section = ''; let cur: Record<number, any> | null = null; let curType = ''; let poly: { pts: { x: number; y: number }[]; closed: boolean } | null = null;
  let lw: { x: number; y: number }[] = []; let pendingX: number | null = null;
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  const flush = () => {
    if (!cur) return;
    const c = cur;
    if (curType === 'CIRCLE') ents.push({ t: 'CIRCLE', cx: c[10], cy: c[20], r: c[40] });
    else if (curType === 'ARC') ents.push({ t: 'ARC', cx: c[10], cy: c[20], r: c[40], a0: c[50], a1: c[51] });
    else if (curType === 'LINE') ents.push({ t: 'LINE', x1: c[10], y1: c[20], x2: c[11], y2: c[21] });
    else if (curType === 'LWPOLYLINE') { if (lw.length > 1) ents.push({ t: 'POLY', pts: lw, closed: ((c[70] ?? 0) & 1) === 1 }); }
    else if (curType === 'POLYLINE') poly = { pts: [], closed: ((c[70] ?? 0) & 1) === 1 };
    else if (curType === 'VERTEX' && poly) poly.pts.push({ x: c[10] ?? 0, y: c[20] ?? 0 });
    else if (curType === 'SEQEND' && poly) { if (poly.pts.length > 1) ents.push({ t: 'POLY', pts: poly.pts, closed: poly.closed }); poly = null; }
    cur = null; lw = []; pendingX = null;
  };

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10); const val = lines[i + 1].replace(/\r$/, '').trim();
    if (Number.isNaN(code)) continue;
    if (section === 'HEADER' && code === 9 && val === '$INSUNITS') {
      const nxt = lines.slice(i + 2, i + 6); const k = nxt.findIndex(l => l.trim() === '70'); if (k >= 0) units = UNITS[parseInt(nxt[k + 1], 10)] ?? 'unknown';
    }
    if (code === 0) {
      if (section === 'ENTITIES') flush();
      if (val === 'SECTION') { section = lines[i + 3]?.trim() ?? ''; i += 2; continue; }
      if (val === 'ENDSEC') { if (section === 'ENTITIES') flush(); section = ''; continue; }
      if (section === 'ENTITIES') {
        if (ents.length > MAX_ENTITIES) throw new Error('Too many entities in this DXF');
        curType = val; cur = {};
        if (!SUPPORTED.has(val)) { unsupported[val] = (unsupported[val] ?? 0) + 1; cur = null; }
      }
      continue;
    }
    if (section !== 'ENTITIES' || !cur) continue;
    if (curType === 'LWPOLYLINE') {            // vertices arrive as repeated 10/20 pairs
      if (code === 10) pendingX = num(val); else if (code === 20 && pendingX !== null) { lw.push({ x: pendingX, y: num(val) }); pendingX = null; } else cur[code] = num(val);
    } else cur[code] = num(val);
  }
  flush();

  // ---- extents
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  for (const e of ents) {
    if (e.t === 'CIRCLE') { ext(e.cx - e.r, e.cy - e.r); ext(e.cx + e.r, e.cy + e.r); }
    else if (e.t === 'LINE') { ext(e.x1, e.y1); ext(e.x2, e.y2); }
    else if (e.t === 'POLY') e.pts.forEach(p => ext(p.x, p.y));
    else { // arc: endpoints + any quadrant it sweeps through
      const rad = (d: number) => (d * Math.PI) / 180; const span = ((e.a1 - e.a0) % 360 + 360) % 360 || 360;
      const pt = (a: number) => ext(e.cx + e.r * Math.cos(rad(a)), e.cy + e.r * Math.sin(rad(a)));
      pt(e.a0); pt(e.a1); for (let q = 0; q < 4; q++) { const rel = (((q * 90 - e.a0) % 360) + 360) % 360; if (rel <= span) pt(q * 90); }
    }
  }
  if (!ents.length || !Number.isFinite(minX)) throw new Error('No drawable geometry (circles, arcs, lines, polylines) found in this DXF');
  const W = maxX - minX, H = maxY - minY, size = Math.max(W, H);

  // ---- features
  const circles = ents.filter((e): e is Extract<Entity, { t: 'CIRCLE' }> => e.t === 'CIRCLE');
  const tolC = size * 0.0015;
  let outer = circles.filter(c => Math.abs(2 * c.r - W) < size * 0.01 || Math.abs(2 * c.r - H) < size * 0.01).sort((a, b) => b.r - a.r)[0] ?? null;
  const rest = circles.filter(c => c !== outer);
  const concentric: { dia: number }[] = []; const holes: typeof circles = [];
  for (const c of rest) {
    const isConc = outer && Math.hypot(c.cx - outer.cx, c.cy - outer.cy) < tolC;
    if (isConc && c.r >= outer!.r * 0.25) concentric.push({ dia: 2 * c.r }); else holes.push(c);
  }
  const ref = outer ? { x: outer.cx, y: outer.cy } : { x: holes.reduce((s, h) => s + h.cx, 0) / (holes.length || 1), y: holes.reduce((s, h) => s + h.cy, 0) / (holes.length || 1) };
  const byDia = new Map<string, typeof circles>();
  for (const h of holes) { const k = (2 * h.r).toFixed(4); (byDia.get(k) ?? byDia.set(k, []).get(k)!).push(h); }
  const holeGroups: HoleGroup[] = [...byDia.entries()].map(([k, hs]) => {
    const dia = parseFloat(k); const rad = hs.map(h => Math.hypot(h.cx - ref.x, h.cy - ref.y)); const rMin = Math.min(...rad), rMax = Math.max(...rad);
    if (hs.length >= 3 && rMax - rMin <= tolC) {
      const ang = hs.map(h => Math.atan2(h.cy - ref.y, h.cx - ref.x)).sort((a, b) => a - b);
      const gaps = ang.map((a, i) => (i === ang.length - 1 ? ang[0] + 2 * Math.PI - a : ang[i + 1] - a));
      return { dia, count: hs.length, pattern: 'bolt_circle' as const, pcd: 2 * ((rMin + rMax) / 2), evenlySpaced: Math.max(...gaps) - Math.min(...gaps) < 0.02, radialMin: rMin, radialMax: rMax };
    }
    return hs.length === 1 ? { dia, count: 1, pattern: 'single' as const } : { dia, count: hs.length, pattern: 'scattered' as const, radialMin: rMin, radialMax: rMax };
  }).sort((a, b) => b.count - a.count);

  return {
    entities: ents,
    summary: {
      units, extents: { minX, minY, maxX, maxY, width: W, height: H },
      counts: { circles: circles.length, arcs: ents.filter(e => e.t === 'ARC').length, lines: ents.filter(e => e.t === 'LINE').length, polylines: ents.filter(e => e.t === 'POLY').length },
      unsupported, outer: outer ? { dia: 2 * outer.r } : null, concentric: concentric.sort((a, b) => b.dia - a.dia), holeGroups, totalHoles: holes.length,
    },
  };
}

/** SVG preview built only from numbers, so it is safe to display as an image. */
export function dxfToSvg(r: DxfResult): string {
  const { extents: x } = r.summary; const size = Math.max(x.width, x.height) || 1; const pad = size * 0.04; const sw = size / 450;
  const f = (n: number) => (Math.round(n * 10000) / 10000).toString();
  const parts: string[] = []; let n = 0;
  for (const e of r.entities) {
    if (n++ > 20_000) break;
    if (e.t === 'CIRCLE') parts.push(`<circle cx="${f(e.cx)}" cy="${f(e.cy)}" r="${f(e.r)}"/>`);
    else if (e.t === 'LINE') parts.push(`<line x1="${f(e.x1)}" y1="${f(e.y1)}" x2="${f(e.x2)}" y2="${f(e.y2)}"/>`);
    else if (e.t === 'POLY') parts.push(`<path d="M${e.pts.map(p => `${f(p.x)} ${f(p.y)}`).join(' L')}${e.closed ? ' Z' : ''}"/>`);
    else {
      const rad = (d: number) => (d * Math.PI) / 180; const span = ((e.a1 - e.a0) % 360 + 360) % 360 || 360;
      const sx = e.cx + e.r * Math.cos(rad(e.a0)), sy = e.cy + e.r * Math.sin(rad(e.a0)), ex = e.cx + e.r * Math.cos(rad(e.a1)), ey = e.cy + e.r * Math.sin(rad(e.a1));
      parts.push(`<path d="M${f(sx)} ${f(sy)} A${f(e.r)} ${f(e.r)} 0 ${span > 180 ? 1 : 0} 1 ${f(ex)} ${f(ey)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x.minX - pad)} ${f(-(x.maxY + pad))} ${f(x.width + 2 * pad)} ${f(x.height + 2 * pad)}" width="640" height="${Math.round((640 * (x.height + 2 * pad)) / (x.width + 2 * pad))}">` +
    `<rect x="${f(x.minX - pad)}" y="${f(-(x.maxY + pad))}" width="${f(x.width + 2 * pad)}" height="${f(x.height + 2 * pad)}" fill="#ffffff"/>` +
    `<g transform="scale(1,-1)" fill="none" stroke="#0e4f63" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>`;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
export interface GeneratedItem { text: string; kind: 'check' | 'value'; unit?: string; spec: string }

/** First-article inspection items from CAD nominals. Tolerances are deliberately NOT invented: the spec text points to the released drawing. */
export function inspectionItems(s: DxfSummary): GeneratedItem[] {
  const u = s.units === 'unknown' ? 'in' : s.units; const out: GeneratedItem[] = [];
  const note = 'CAD nominal from the DXF; tolerance per the released drawing';
  if (s.outer) out.push({ text: 'Outside diameter', kind: 'value', unit: u, spec: `Nominal Ø${fmt(s.outer.dia)} ${u} — ${note}` });
  else out.push({ text: 'Overall width × height', kind: 'value', unit: u, spec: `Nominal ${fmt(s.extents.width)} × ${fmt(s.extents.height)} ${u} — ${note}` });
  for (const c of s.concentric.slice(0, 2)) out.push({ text: 'Inside / groove diameter', kind: 'value', unit: u, spec: `Nominal Ø${fmt(c.dia)} ${u} — ${note}` });
  for (const g of s.holeGroups.slice(0, 5)) {
    const label = `${g.count} × Ø${fmt(g.dia)} ${u}`;
    out.push({ text: `Hole count — ${label}`, kind: 'value', unit: 'count', spec: `Expect ${g.count} hole${g.count === 1 ? '' : 's'} of Ø${fmt(g.dia)} ${u}` });
    out.push({ text: `Hole diameter — Ø${fmt(g.dia)} ${u} (measure a sample)`, kind: 'value', unit: u, spec: `Nominal Ø${fmt(g.dia)} ${u} — ${note}` });
    if (g.pattern === 'bolt_circle') out.push({ text: `Bolt circle diameter — ${g.count} × Ø${fmt(g.dia)}`, kind: 'value', unit: u, spec: `Nominal ${fmt(g.pcd ?? 0)} ${u}${g.evenlySpaced ? `, ${g.count} holes evenly spaced` : ''} — ${note}` });
    else if (g.pattern === 'scattered' && g.count > 20) out.push({ text: `Hole pattern matches drawing (${g.count} × Ø${fmt(g.dia)})`, kind: 'check', spec: 'Verify with a template, go/no-go plate or optical comparator' });
  }
  return out.slice(0, 16);
}
