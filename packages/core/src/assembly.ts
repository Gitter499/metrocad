/** Assembly plan: which piece goes where (by ID), grouped into steps, as JSON + a printable SVG. */
import type { FullBuildResult } from './pipeline.js';
import type { Part } from './types.js';
import { roundedHull } from './layout/index.js';

export interface PlanPiece {
  partId: string;
  tag: string;
  name: string;
  kind: Part['kind'];
  color: string;
  /** Centre of the piece in map coordinates (mm). */
  x: number; y: number;
  /** Tile tags this piece touches (e.g. ["R1C2", "R1C3"]). */
  tiles: string[];
  /** Plate the piece is printed on. */
  plate?: string;
  stationName?: string;
  lineRef?: string;
}

export interface PlanStep {
  id: string;
  title: string;
  color?: string;
  pieces: PlanPiece[];
  hint: string;
}

export interface AssemblyPlan {
  place: string;
  sizeMm: { width: number; height: number };
  tiles: { cols: number; rows: number; w: number; h: number; tags: { tag: string; x: number; y: number; w: number; h: number }[] };
  steps: PlanStep[];
  /** Every piece by tag for the finder. */
  index: Record<string, PlanPiece>;
}

export function buildAssemblyPlan(r: FullBuildResult): AssemblyPlan {
  const t = r.tiles;
  const tileTags: { tag: string; x: number; y: number; w: number; h: number }[] = [];
  for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) tileTags.push({ tag: `R${row + 1}C${col + 1}`, x: t.ox + col * t.w, y: t.oy + row * t.h, w: t.w, h: t.h });
  const tilesTouched = (p: Part) => tileTags.filter((tt) => p.bbox.min[0] < tt.x + tt.w && p.bbox.max[0] > tt.x && p.bbox.min[1] < tt.y + tt.h && p.bbox.max[1] > tt.y).map((tt) => tt.tag);
  const plateOf = new Map<string, string>();
  for (const pl of r.plates) for (const it of pl.items) plateOf.set(it.partId, pl.name);
  const lineRefById = new Map(r.layout.lines.map((l) => [l.id, l.ref]));
  const stationName = new Map(r.layout.stations.map((s) => [s.id, s.name]));
  const piece = (p: Part): PlanPiece => ({
    partId: p.id, tag: p.tag ?? p.id, name: p.name, kind: p.kind, color: p.color,
    x: (p.bbox.min[0] + p.bbox.max[0]) / 2, y: (p.bbox.min[1] + p.bbox.max[1]) / 2,
    tiles: tilesTouched(p), plate: plateOf.get(p.id) ?? plateOf.get(p.group ?? ''), stationName: p.stationId ? stationName.get(p.stationId) : undefined,
    lineRef: p.lineId ? lineRefById.get(p.lineId) : undefined,
  });
  const steps: PlanStep[] = [];
  const tiles = r.parts.filter((p) => p.kind === 'tile');
  if (tiles.length) steps.push({ id: 'tiles', title: `Base tiles (${t.cols} × ${t.rows})`, pieces: tiles.map(piece), hint: 'Lay the tiles face-up in a grid. Each tile has its ID and a north arrow engraved on the back: R = row from the bottom, C = column from the left.' });
  for (const ln of r.layout.lines) {
    const ps = r.parts.filter((p) => p.kind === 'line' && p.lineId === ln.id);
    if (ps.length) steps.push({ id: `line-${ln.id}`, title: `Line ${ln.ref}`, color: ln.color, pieces: ps.map(piece), hint: `Press the ${ps.length} pieces of line ${ln.ref} into their grooves. Piece IDs are engraved underneath (${ln.ref}-01, ${ln.ref}-02 …) and run from one end of the line to the other.` });
  }
  const dots = r.parts.filter((p) => p.kind === 'dot');
  if (dots.length) steps.push({ id: 'dots', title: 'Station dots', pieces: dots.map(piece), hint: 'Drop a white dot through every hole in the line pieces. They are all identical.' });
  const rings = r.parts.filter((p) => p.kind === 'ring');
  if (rings.length) steps.push({ id: 'rings', title: 'Interchange rings & plugs', pieces: rings.map(piece), hint: 'Seat each black ring in its pocket, then the matching white plug inside it. Ring and plug share the S-number engraved on the plan; pills only fit their own pocket.' });
  const labels = r.parts.filter((p) => p.kind === 'labelPlate');
  if (labels.length) steps.push({ id: 'labels', title: 'Labels', pieces: labels.map(piece), hint: 'Each label plate has N-number engraved underneath; press it into the pocket with the matching outline next to its station.' });
  const tapes = r.layout.labels.filter((l) => l.tape);
  if (tapes.length) steps.push({ id: 'tape', title: 'Tape labels', pieces: tapes.map((l) => ({ partId: `tape-${l.n}`, tag: `T${String(l.n).padStart(3, '0')}`, name: l.text, kind: 'labelPlate' as const, color: '#ffffff', x: l.x + l.width / 2, y: l.y + l.height / 2, tiles: tileTags.filter((tt) => l.x < tt.x + tt.w && l.x + l.width > tt.x && l.y < tt.y + tt.h && l.y + l.height > tt.y).map((tt) => tt.tag), stationName: l.text })), hint: `Print the labels on ${r.params.tapeWidth} mm label-maker tape (list in labels-tape.csv) and stick each one into its pocket.` });
  const index: Record<string, PlanPiece> = {};
  for (const s of steps) for (const p of s.pieces) index[p.tag] = p;
  return { place: r.network.displayName, sizeMm: { width: r.layout.width, height: r.layout.height }, tiles: { cols: t.cols, rows: t.rows, w: t.w, h: t.h, tags: tileTags }, steps, index };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Printable plan: the map with every piece ID at its position and the tile grid. */
export function renderAssemblyPlanSvg(r: FullBuildResult, plan: AssemblyPlan, opts: { fontDataUrl?: string; step?: string } = {}): string {
  const W = r.layout.width, H = r.layout.height, Y = (y: number) => H - y;
  const p = r.params;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">`);
  if (opts.fontDataUrl) out.push(`<defs><style>@font-face{font-family:'Inter';src:url(${opts.fontDataUrl}) format('truetype');font-weight:700;}</style></defs>`);
  out.push(`<rect width="${f(W)}" height="${f(H)}" fill="#ffffff"/>`);
  for (const tt of plan.tiles.tags) {
    out.push(`<rect x="${f(tt.x)}" y="${f(Y(tt.y + tt.h))}" width="${f(tt.w)}" height="${f(tt.h)}" fill="none" stroke="#bbb" stroke-width="0.4" stroke-dasharray="3 2"/>`);
    out.push(`<text x="${f(tt.x + 3)}" y="${f(Y(tt.y + tt.h) + 7)}" font-family="Inter, sans-serif" font-weight="700" font-size="6" fill="#999">${tt.tag}</text>`);
  }
  const dim = opts.step ? 0.18 : 0.55;
  for (const ln of r.layout.lines) {
    const active = !opts.step || opts.step === `line-${ln.id}`;
    for (const ch of ln.chains) {
      const d = ch.points.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(Y(q[1]))}`).join(' ');
      out.push(`<path d="${d}" fill="none" stroke="${ln.color}" stroke-width="${f(p.lineWidth)}" stroke-linecap="butt" stroke-linejoin="round" opacity="${active ? 0.85 : dim}"/>`);
    }
  }
  for (const st of r.layout.stations) {
    if (st.major) {
      const hull = roundedHull(st.markerPoints, st.markerRadius, 16);
      out.push(`<path d="${hull.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(Y(q[1]))}`).join(' ')}Z" fill="#fff" stroke="#222" stroke-width="${f(p.ringWidth)}" opacity="0.9"/>`);
    } else out.push(`<circle cx="${f(st.x)}" cy="${f(Y(st.y))}" r="${f(st.markerRadius)}" fill="#fff" stroke="#888" stroke-width="0.3"/>`);
  }
  // IDs
  const fontPx = Math.max(3.2, p.lineWidth * 0.6);
  for (const step of plan.steps) {
    if (opts.step && step.id !== opts.step) continue;
    if (step.id === 'dots') continue;
    for (const pc of step.pieces) {
      if (step.id === 'tiles') continue;
      const isLine = pc.kind === 'line';
      out.push(`<g><rect x="${f(pc.x - pc.tag.length * fontPx * 0.32 - 0.8)}" y="${f(Y(pc.y) - fontPx * 0.7)}" width="${f(pc.tag.length * fontPx * 0.64 + 1.6)}" height="${f(fontPx * 1.1)}" rx="0.8" fill="${isLine ? '#111' : '#fff'}" stroke="#111" stroke-width="0.25" opacity="0.92"/>` +
        `<text x="${f(pc.x)}" y="${f(Y(pc.y) + fontPx * 0.3)}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="${f(fontPx * 0.85)}" fill="${isLine ? '#fff' : '#111'}">${esc(pc.tag)}</text></g>`);
    }
  }
  for (const lb of r.layout.labels) {
    const t = lb.angle ? ` transform="rotate(${f(-lb.angle)} ${f(lb.x)} ${f(Y(lb.y))})"` : '';
    out.push(`<rect x="${f(lb.x)}" y="${f(Y(lb.y + lb.height))}" width="${f(lb.width)}" height="${f(lb.height)}" fill="none" stroke="#999" stroke-width="0.25"${t}/>`);
  }
  out.push(`<text x="4" y="${f(H - 3)}" font-family="Inter, sans-serif" font-size="4" fill="#888">MetroCAD assembly plan — ${esc(plan.place)} — ${f(W)} × ${f(H)} mm — IDs are engraved on the underside of each piece</text>`);
  out.push('</svg>');
  return out.join('\n');
}

/** Tape-label list for label makers (CSV: id, station, tape width, length mm). */
export function tapeLabelsCsv(r: FullBuildResult): string | undefined {
  const tapes = r.layout.labels.filter((l) => l.tape);
  if (!tapes.length) return undefined;
  const rows = ['id,text,tape_width_mm,length_mm,tile'];
  const plan = buildAssemblyPlan(r);
  for (const l of tapes) rows.push(`T${String(l.n).padStart(3, '0')},"${l.text.replace(/"/g, '""')}",${r.params.tapeWidth},${l.width.toFixed(1)},${plan.index[`T${String(l.n).padStart(3, '0')}`]?.tiles.join('+') ?? ''}`);
  return rows.join('\n');
}
