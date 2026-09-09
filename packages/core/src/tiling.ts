/**
 * Outline-base tiling: cover the map's footprint with as few printer-bed-sized pieces as possible.
 *
 * A uniform grid over the footprint's bounding box wastes most of its cells on diagonal, sparse maps: a
 * 900 mm Pittsburgh on a 150 mm bed came out as 36 slivers that each filled ~14 % of a bed. Here the
 * footprint is covered greedily in bands (horizontal or vertical, both bed orientations, several band
 * phases), every piece is split into its connected components, and neighbouring pieces are merged as
 * long as the union still fits the bed. The configuration with the fewest pieces wins.
 *
 * Only filament that carries a line, a station or a label is printed; the tiling decides how that area
 * is split into printable, joinable pieces.
 */
import type { CrossSection as CrossSectionT, ManifoldToplevel } from 'manifold-3d';

type CS = CrossSectionT;

export interface TilePiece {
  cs: CS;
  /** Bounding box. */
  x: number; y: number; w: number; h: number;
  area: number;
  row: number; col: number;
  tag: string;
}

export interface TilingResult {
  pieces: TilePiece[];
  rows: number;
  cols: number;
  /** Band height used for row numbering. */
  bandH: number;
  ox: number; oy: number;
  /** Bed orientation the pieces were cut for (usable mm). */
  bedW: number; bedH: number;
}

export interface TilingOptions {
  /** Ignore fragments smaller than this (mm²). */
  minArea?: number;
}

interface Piece { cs: CS; x: number; y: number; w: number; h: number; area: number }

const EPS = 1e-3;
const DEBUG = !!(globalThis as any).process?.env?.TILE_DEBUG;

export function tileFootprint(m: ManifoldToplevel, foot: CS, usable: [number, number], opts: TilingOptions = {}): TilingResult {
  const minArea = opts.minArea ?? 25;
  const { CrossSection } = m;
  const rect = (x: number, y: number, w: number, h: number): CS => { const s = CrossSection.square([w, h], false); const t = s.translate([x, y]); s.delete(); return t; };
  const info = (cs: CS): Piece => { const b = cs.bounds(); return { cs, x: b.min[0], y: b.min[1], w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], area: cs.area() }; };
  const fits = (w: number, h: number, ux: number, uy: number) => (w <= ux + EPS && h <= uy + EPS) || (w <= uy + EPS && h <= ux + EPS);
  const fb = foot.bounds();

  /** Greedy band cover. Bands run along x (rows stacked in y); the caller transposes for vertical bands. */
  function cover(src: CS, ux: number, uy: number, phase: number, frac: number | 'balanced' = 1): Piece[] {
    const balanced = frac === 'balanced';
    const out: Piece[] = [];
    let remaining = src.translate([0, 0]); // copy
    const b0 = remaining.bounds();
    // Balanced: bands of equal height that just fit the bed, cells of equal width per band (no remnant slivers).
    if (balanced) { const H = b0.max[1] - b0.min[1]; uy = H / Math.max(1, Math.ceil(H / uy)); }
    else { ux *= frac; uy *= frac; }
    let y = b0.min[1] - phase * uy;
    let guard = 0;
    while (remaining.area() > minArea && guard++ < 400) {
      const rb = remaining.bounds();
      if (y < rb.min[1] - EPS && y + uy <= rb.min[1] + EPS) y = rb.min[1]; // skip an empty gap between bands
      const bandRect = rect(rb.min[0] - 1, y, rb.max[0] - rb.min[0] + 2, uy);
      const band = remaining.intersect(bandRect);
      let rem = band;
      let g2 = 0;
      let cw = ux;
      if (balanced && rem.area() > minArea) { const bb = rem.bounds(); const E = bb.max[0] - bb.min[0]; cw = E / Math.max(1, Math.ceil(E / ux)) + EPS; }
      while (rem.area() > minArea && g2++ < 200) {
        const bb = rem.bounds();
        const cell = rect(bb.min[0], y, cw, uy);
        const piece = rem.intersect(cell);
        const next = rem.subtract(cell);
        rem.delete(); cell.delete(); rem = next;
        if (piece.area() > minArea) out.push(info(piece)); else piece.delete();
      }
      rem.delete();
      const nextRem = remaining.subtract(bandRect);
      remaining.delete(); bandRect.delete(); remaining = nextRem;
      y += uy;
    }
    remaining.delete();
    return out;
  }

  /** Split every piece into its connected components. */
  function split(ps: Piece[]): Piece[] {
    const out: Piece[] = [];
    for (const p of ps) {
      const parts = p.cs.decompose();
      if (parts.length <= 1) { for (const q of parts) q.delete(); out.push(p); continue; }
      p.cs.delete();
      for (const q of parts) { if (q.area() > minArea) out.push(info(q)); else q.delete(); }
    }
    return out;
  }

  /** Adjacent pieces share a real edge (not just a corner). */
  function touching(p: Piece, q: Piece): boolean {
    if (p.x > q.x + q.w + 1 || q.x > p.x + p.w + 1 || p.y > q.y + q.h + 1 || q.y > p.y + p.h + 1) return false;
    const grown = p.cs.offset(0.8, 'Square');
    const touch = grown.intersect(q.cs);
    const shared = touch.area();
    grown.delete(); touch.delete();
    return shared >= 3;
  }

  /**
   * Merge neighbouring pieces while their union still fits the bed. Always merges the pair with the smallest
   * union bounding box first, which keeps the most room for later merges; adjacency is tracked so each round
   * only looks at real neighbours.
   */
  function merge(ps: Piece[], ux: number, uy: number): Piece[] {
    const alive = new Set<Piece>(ps);
    const adj = new Map<Piece, Set<Piece>>();
    for (const p of ps) adj.set(p, new Set());
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (touching(ps[i], ps[j])) { adj.get(ps[i])!.add(ps[j]); adj.get(ps[j])!.add(ps[i]); }
    const unionBox = (p: Piece, q: Piece) => { const x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y); return { x0, y0, w: Math.max(p.x + p.w, q.x + q.w) - x0, h: Math.max(p.y + p.h, q.y + q.h) - y0 }; };
    let guard = 0;
    while (guard++ < 2000) {
      let best: { p: Piece; q: Piece; score: number } | undefined;
      for (const p of alive) for (const q of adj.get(p)!) {
        if (p.area > q.area || (p.area === q.area && p.x > q.x)) continue; // each pair once
        const b = unionBox(p, q);
        if (!fits(b.w, b.h, ux, uy)) continue;
        // Smallest union box first; among equals prefer joining the smaller piece.
        const score = b.w * b.h + Math.min(p.area, q.area) * 0.01;
        if (!best || score < best.score) best = { p, q, score };
      }
      if (!best) break;
      const { p, q } = best;
      const u = p.cs.add(q.cs);
      p.cs.delete(); q.cs.delete();
      const merged = info(u);
      alive.delete(p); alive.delete(q);
      const nb = new Set<Piece>();
      for (const r of adj.get(p)!) if (r !== q && alive.has(r)) nb.add(r);
      for (const r of adj.get(q)!) if (r !== p && alive.has(r)) nb.add(r);
      adj.delete(p); adj.delete(q);
      for (const r of nb) { const a = adj.get(r)!; a.delete(p); a.delete(q); a.add(merged); }
      adj.set(merged, nb);
      alive.add(merged);
    }
    return [...alive];
  }

  interface Candidate { pieces: Piece[]; ux: number; uy: number; vertical: boolean; phase: number; waste: number; smallest: number }
  const configs: { phase: number; frac: number | 'balanced' }[] = [{ phase: 0, frac: 'balanced' }, { phase: 0, frac: 1 }, { phase: 0.5, frac: 1 }, { phase: 0, frac: 0.5 }, { phase: 0.5, frac: 0.5 }, { phase: 0, frac: 1 / 3 }];
  let best: Candidate | undefined;
  const tStart = performance.now();
  const orientations: [number, number][] = usable[0] === usable[1] ? [[usable[0], usable[1]]] : [[usable[0], usable[1]], [usable[1], usable[0]]];
  const transposed = foot.rotate(90); // vertical bands: cover the rotated footprint with horizontal bands, rotate back
  for (const vertical of [false, true]) {
    const src = vertical ? transposed : foot;
    for (const [ux, uy] of orientations) {
      for (const { phase, frac } of configs) {
        let ps = cover(src, ux, uy, phase, frac);
        const nCover = ps.length;
        ps = split(ps);
        const nSplit = ps.length;
        ps = merge(ps, ux, uy);
        if (DEBUG) console.log(`tiling ${vertical ? 'V' : 'H'} ${ux}x${uy} phase ${phase} cell ${frac}: cover ${nCover} split ${nSplit} merged ${ps.length} (${(performance.now() - tStart).toFixed(0)} ms)`);
        if (vertical) ps = ps.map((p) => { const t = p.cs.rotate(-90); p.cs.delete(); return info(t); });
        const waste = ps.reduce((s, p) => s + p.w * p.h - p.area, 0);
        const smallest = ps.reduce((s, p) => Math.min(s, p.area), Infinity);
        // Fewest tiles; then no scraps (largest smallest piece); then least empty bed area.
        const better = !best || ps.length < best.pieces.length || (ps.length === best.pieces.length && (smallest > best.smallest + EPS || (Math.abs(smallest - best.smallest) <= EPS && waste < best.waste - EPS)));
        if (better) { if (best) for (const p of best.pieces) p.cs.delete(); best = { pieces: ps, ux, uy, vertical, phase, waste, smallest }; }
        else for (const p of ps) p.cs.delete();
      }
    }
  }
  transposed.delete();
  if (!best) return { pieces: [], rows: 0, cols: 0, bandH: usable[1], ox: fb.min[0], oy: fb.min[1], bedW: usable[0], bedH: usable[1] };

  // Row/column tags from the piece centroids: rows are bands from the bottom, columns rank left to right.
  const bandH = best.vertical ? best.ux : best.uy; // row numbering uses full bed bands
  const oy = fb.min[1] - (best.vertical ? 0 : best.phase * best.uy);
  const withRow = best.pieces.map((p) => ({ p, cy: p.y + p.h / 2, cx: p.x + p.w / 2, row: Math.max(0, Math.floor((p.y + p.h / 2 - oy) / bandH)) }));
  const rowIds = [...new Set(withRow.map((w) => w.row))].sort((a, b) => a - b);
  const rowIndex = new Map(rowIds.map((r, i) => [r, i]));
  const pieces: TilePiece[] = [];
  let cols = 0;
  for (const rid of rowIds) {
    const inRow = withRow.filter((w) => w.row === rid).sort((a, b) => a.cx - b.cx);
    cols = Math.max(cols, inRow.length);
    inRow.forEach((w, i) => pieces.push({ ...w.p, row: rowIndex.get(rid)!, col: i, tag: `R${rowIndex.get(rid)! + 1}C${i + 1}` }));
  }
  return { pieces, rows: rowIds.length, cols, bandH, ox: fb.min[0], oy, bedW: best.ux, bedH: best.uy };
}

/**
 * Join the islands of a footprint to its main body with short strips, so the outline base is one connected
 * piece: a label that floats away from its line would otherwise become a separate scrap to mount on the wall.
 * Islands farther than `maxSpan` mm from everything else are left alone (and reported).
 */
export function bridgeIslands(m: ManifoldToplevel, foot: CS, width: number, maxSpan = 160): { foot: CS; bridges: number; islands: number } {
  const { CrossSection } = m;
  let cur = foot;
  let bridges = 0, islands = 0;
  for (let round = 0; round < 6; round++) {
    const comps = cur.decompose();
    if (comps.length <= 1) { for (const c of comps) c.delete(); break; }
    comps.sort((a, b) => b.area() - a.area());
    const verts = comps.map((c) => c.toPolygons().flat());
    const strips: CS[] = [];
    islands = 0;
    // Each island bridges to the nearest point of any larger component (larger components first, so chains join).
    for (let i = 1; i < comps.length; i++) {
      let bd = Infinity, ba: [number, number] = [0, 0], bb: [number, number] = [0, 0];
      const vi = verts[i];
      for (let j = 0; j < i; j++) {
        const vj = verts[j];
        // Coarse: sample the larger list so the pair search stays cheap on dense outlines.
        const stepJ = Math.max(1, Math.floor(vj.length / 600)), stepI = Math.max(1, Math.floor(vi.length / 600));
        for (let a = 0; a < vi.length; a += stepI) for (let b = 0; b < vj.length; b += stepJ) {
          const dx = vi[a][0] - vj[b][0], dy = vi[a][1] - vj[b][1];
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; ba = [vi[a][0], vi[a][1]]; bb = [vj[b][0], vj[b][1]]; }
        }
      }
      const d = Math.sqrt(bd);
      if (d > maxSpan) { islands++; continue; }
      const ang = (Math.atan2(bb[1] - ba[1], bb[0] - ba[0]) * 180) / Math.PI;
      const len = d + width; // overlap into both bodies
      const sq = CrossSection.square([len, width], true);
      const rot = sq.rotate(ang); sq.delete();
      const strip = rot.translate([(ba[0] + bb[0]) / 2, (ba[1] + bb[1]) / 2]); rot.delete();
      strips.push(strip);
      bridges++;
    }
    for (const c of comps) c.delete();
    if (!strips.length) break;
    const u = CrossSection.union([cur, ...strips]);
    for (const s of strips) s.delete();
    if (cur !== foot) cur.delete();
    // Soften the strip's inside corners a touch so tiles print cleanly.
    const grown = u.offset(2, 'Round'); u.delete();
    cur = grown.offset(-2, 'Round'); grown.delete();
  }
  return { foot: cur, bridges, islands };
}
