/** Greedy collision-aware label placement. Everything in mm. */
import type { LayoutLabel, Vec2 } from '../types.js';
import { add, sub, mul, dot, rotate, pointSegDist, bboxOf } from '../vec.js';

export interface LabelCandidateInput {
  stationId: string;
  text: string;
  /** Anchor centre. */
  center: Vec2;
  /** Half-extents of the marker (circle radius or pill half sizes). */
  halfW: number;
  halfH: number;
  /** Measured text box relative to the baseline origin. */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  fontSize: number;
  priority: number;
}

export interface Obstacles {
  /** Line centreline segments with their half-width. */
  segments: { a: Vec2; b: Vec2; r: number }[];
  /** Circular/pill station markers as polygons. */
  markers: Vec2[][];
  bounds: { x: number; y: number; w: number; h: number };
}

export interface PlaceOptions {
  gap: number;
  allowRotated: boolean;
  /** Force placement even with collisions (returns the least-bad candidate). */
  force: boolean;
}

interface Placed { poly: Vec2[]; bbox: { x: number; y: number; w: number; h: number } }

/** Convex polygon overlap test via separating axis theorem. */
export function polysOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const axis: Vec2 = [-(q[1] - p[1]), q[0] - p[0]];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = dot(v, axis); minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of b) { const d = dot(v, axis); minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

function polySegDist(poly: Vec2[], a: Vec2, b: Vec2): number {
  // 0 if intersecting/containing, else min distance
  if (pointInPoly(a, poly) || pointInPoly(b, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (segIntersect(a, b, p, q)) return 0;
    best = Math.min(best, pointSegDist(p, a, b), pointSegDist(a, p, q), pointSegDist(b, p, q));
  }
  return best;
}

function pointInPoly(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

export function labelPolygon(l: { x: number; y: number; width: number; height: number; angle: number }): Vec2[] {
  const t = (l.angle * Math.PI) / 180;
  const o: Vec2 = [l.x, l.y];
  const corners: Vec2[] = [[0, 0], [l.width, 0], [l.width, l.height], [0, l.height]];
  return corners.map((c) => add(o, rotate(c, t)));
}

export function placeLabels(inputs: LabelCandidateInput[], obstacles: Obstacles, opts: PlaceOptions): { labels: LayoutLabel[]; unlabeled: string[] } {
  const placed: Placed[] = [];
  const labels: LayoutLabel[] = [];
  const unlabeled: string[] = [];
  const sorted = [...inputs].sort((a, b) => b.priority - a.priority || b.center[1] - a.center[1]);
  // Spatial buckets for segments to keep this fast.
  const cell = 40;
  const grid = new Map<string, number[]>();
  const kOf = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  obstacles.segments.forEach((s, i) => {
    const bb = bboxOf([s.a, s.b]);
    for (let gx = Math.floor((bb.x - s.r) / cell); gx <= Math.floor((bb.x + bb.w + s.r) / cell); gx++)
      for (let gy = Math.floor((bb.y - s.r) / cell); gy <= Math.floor((bb.y + bb.h + s.r) / cell); gy++) {
        const k = `${gx},${gy}`;
        const l = grid.get(k) ?? []; l.push(i); grid.set(k, l);
      }
  });
  void kOf;
  const nearbySegments = (bb: { x: number; y: number; w: number; h: number }, pad: number): Set<number> => {
    const set = new Set<number>();
    for (let gx = Math.floor((bb.x - pad) / cell); gx <= Math.floor((bb.x + bb.w + pad) / cell); gx++)
      for (let gy = Math.floor((bb.y - pad) / cell); gy <= Math.floor((bb.y + bb.h + pad) / cell); gy++)
        for (const i of grid.get(`${gx},${gy}`) ?? []) set.add(i);
    return set;
  };

  for (const inp of sorted) {
    const w = inp.box.maxX - inp.box.minX, h = inp.box.maxY - inp.box.minY;
    const pad = 0.6;
    const W = w + 2 * pad, H = h + 2 * pad;
    const g = opts.gap;
    const c = inp.center;
    const hw = inp.halfW + g, hh = inp.halfH + g;
    // Candidate lower-left corners (unrotated) — ordered by preference.
    const cands: { x: number; y: number; angle: number; cost: number }[] = [
      { x: c[0] + hw, y: c[1] - H / 2, angle: 0, cost: 0 },            // right
      { x: c[0] - hw - W, y: c[1] - H / 2, angle: 0, cost: 0.1 },      // left
      { x: c[0] - W / 2, y: c[1] + hh, angle: 0, cost: 0.3 },          // above
      { x: c[0] - W / 2, y: c[1] - hh - H, angle: 0, cost: 0.3 },      // below
      { x: c[0] + hw * 0.8, y: c[1] + hh * 0.6, angle: 0, cost: 0.5 },          // NE
      { x: c[0] + hw * 0.8, y: c[1] - hh * 0.6 - H, angle: 0, cost: 0.5 },      // SE
      { x: c[0] - hw * 0.8 - W, y: c[1] + hh * 0.6, angle: 0, cost: 0.6 },      // NW
      { x: c[0] - hw * 0.8 - W, y: c[1] - hh * 0.6 - H, angle: 0, cost: 0.6 },  // SW
    ];
    if (opts.allowRotated) {
      const r2 = Math.SQRT1_2;
      // 45° up-right starting near the marker's NE, and 45° down-right? (keep readable: only +45 and -45 reading left->right)
      cands.push({ x: c[0] + hw * r2 + H * r2 * 0.5, y: c[1] + hh * r2 - H * r2 * 0.5, angle: 45, cost: 0.8 });
      cands.push({ x: c[0] - hw * r2 - W * r2, y: c[1] + hh * r2 + W * r2 - H * r2 * 0.5, angle: -45, cost: 0.9 });
      cands.push({ x: c[0] + hw * r2 - H * r2 * 0.5, y: c[1] - hh * r2 - H * r2 * 0.5, angle: -45, cost: 1.0 });
    }
    let best: { cand: typeof cands[number]; score: number; poly: Vec2[] } | undefined;
    for (const cand of cands) {
      const poly = labelPolygon({ x: cand.x, y: cand.y, width: W, height: H, angle: cand.angle });
      const bb = bboxOf(poly);
      let score = cand.cost;
      // bounds
      if (bb.x < obstacles.bounds.x || bb.y < obstacles.bounds.y || bb.x + bb.w > obstacles.bounds.x + obstacles.bounds.w || bb.y + bb.h > obstacles.bounds.y + obstacles.bounds.h) score += 50;
      // other labels
      for (const p of placed) {
        if (bb.x > p.bbox.x + p.bbox.w || p.bbox.x > bb.x + bb.w || bb.y > p.bbox.y + p.bbox.h || p.bbox.y > bb.y + bb.h) continue;
        if (polysOverlap(poly, p.poly)) { score += 100; break; }
      }
      if (score >= 100) continue;
      // markers
      for (const m of obstacles.markers) {
        const mb = bboxOf(m);
        if (bb.x > mb.x + mb.w + g || mb.x > bb.x + bb.w + g || bb.y > mb.y + mb.h + g || mb.y > bb.y + bb.h + g) continue;
        if (polysOverlap(poly, m)) { score += 100; break; }
      }
      if (score >= 100) continue;
      // lines
      for (const i of nearbySegments(bb, 10)) {
        const s = obstacles.segments[i];
        const d = polySegDist(poly, s.a, s.b);
        if (d < s.r + 0.4) { score += 100; break; }
        else if (d < s.r + 2) score += 0.2;
      }
      if (!best || score < best.score) best = { cand, score, poly };
      if (score < 0.05) break;
    }
    if (!best || (best.score >= 50 && !opts.force)) { unlabeled.push(inp.stationId); continue; }
    const { cand, poly } = best;
    placed.push({ poly, bbox: bboxOf(poly) });
    // The label origin for text rendering: shift so glyph bbox min sits at (pad, pad) inside the box.
    labels.push({
      stationId: inp.stationId, text: inp.text,
      x: cand.x, y: cand.y, width: W, height: H, angle: cand.angle, fontSize: inp.fontSize, textOrigin: [0, 0],
    });
  }
  return { labels, unlabeled };
}
