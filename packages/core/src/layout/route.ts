/** Corridor geometry: octilinear paths, station placement along paths, parallel offsets, fillets, bed cuts. */
import type { Vec2 } from '../types.js';
import { add, sub, mul, len, dist, norm, perp, lineIntersect, angleOf, fromAngle, dot, bboxOf } from '../vec.js';
import type { Corridor, StationGraph } from './graph.js';

/**
 * Octilinear path from a to b with at most one bend.
 * `prefer` is the geographic departure direction at a (used to pick which leg comes first).
 */
export function octilinearPath(a: Vec2, b: Vec2, prefer?: Vec2, tol = 1e-6): Vec2[] {
  const d = sub(b, a);
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]);
  if (ax < tol || ay < tol || Math.abs(ax - ay) < tol) return [a, b];
  const sx = Math.sign(d[0]), sy = Math.sign(d[1]);
  const m = Math.min(ax, ay);
  // Option 1: diagonal first, then axis-aligned. Option 2: axis first, then diagonal.
  const diag: Vec2 = [sx * m, sy * m];
  const axis: Vec2 = ax > ay ? [sx * (ax - ay), 0] : [0, sy * (ay - ax)];
  const p1 = add(a, diag);   // bend for option 1
  const p2 = add(a, axis);   // bend for option 2
  if (!prefer) return [a, p1, b];
  const pd = norm(prefer);
  const s1 = dot(pd, norm(diag)), s2 = dot(pd, norm(axis));
  return s1 >= s2 ? [a, p1, b] : [a, p2, b];
}

export function pathLength(p: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]);
  return l;
}

/** Point at arc-length s along polyline. */
export function pointAt(p: Vec2[], s: number): { point: Vec2; seg: number; tangent: Vec2 } {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const L = dist(p[i - 1], p[i]);
    if (s <= acc + L || i === p.length - 1) {
      const t = L > 1e-12 ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      return { point: add(p[i - 1], mul(sub(p[i], p[i - 1]), t)), seg: i - 1, tangent: norm(sub(p[i], p[i - 1])) };
    }
    acc += L;
  }
  return { point: p[0], seg: 0, tangent: [1, 0] };
}

/** Offset a polyline by d (left of travel direction), mitering at bends. */
export function offsetPolyline(p: Vec2[], d: number): Vec2[] {
  if (Math.abs(d) < 1e-9 || p.length < 2) return p.map((q) => [...q] as Vec2);
  const out: Vec2[] = [];
  for (let i = 0; i < p.length; i++) {
    const prev = i > 0 ? norm(sub(p[i], p[i - 1])) : undefined;
    const next = i < p.length - 1 ? norm(sub(p[i + 1], p[i])) : undefined;
    if (!prev) out.push(add(p[i], mul(perp(next!), d)));
    else if (!next) out.push(add(p[i], mul(perp(prev), d)));
    else {
      const q1 = add(p[i], mul(perp(prev), d));
      const q2 = add(p[i], mul(perp(next), d));
      const x = lineIntersect(q1, prev, q2, next);
      // limit miter for sharp angles
      if (x && dist(x, p[i]) < Math.abs(d) * 3) out.push(x);
      else { out.push(q1, q2); }
    }
  }
  return out;
}

/** Replace corners with circular arcs of radius r (clamped to neighbouring segment lengths). */
export function filletPolyline(p: Vec2[], r: number, segsPer90 = 8): Vec2[] {
  if (p.length < 3 || r <= 0) return p.map((q) => [...q] as Vec2);
  const out: Vec2[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const u = norm(sub(a, b)), v = norm(sub(c, b));
    const cosT = Math.max(-1, Math.min(1, dot(u, v)));
    const theta = Math.acos(cosT); // interior angle
    if (theta > Math.PI - 0.02 || theta < 0.05) { out.push(b); continue; }
    const half = theta / 2;
    const maxR = Math.min(dist(a, b), dist(b, c)) * 0.5 * Math.tan(half);
    const rr = Math.min(r, maxR);
    const tlen = rr / Math.tan(half);           // tangent length from corner
    const t1 = add(b, mul(u, tlen)), t2 = add(b, mul(v, tlen));
    const bis = norm(add(u, v));
    const center = add(b, mul(bis, rr / Math.sin(half)));
    const a1 = angleOf(sub(t1, center)), a2 = angleOf(sub(t2, center));
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * segsPer90));
    for (let k = 0; k <= n; k++) out.push(add(center, fromAngle(a1 + (sweep * k) / n, rr)));
  }
  out.push(p[p.length - 1]);
  return out;
}

/** Remove near-duplicate consecutive points. */
export function dedupe(p: Vec2[], eps = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const q of p) if (!out.length || dist(out[out.length - 1], q) > eps) out.push(q);
  return out;
}

/** Douglas–Peucker style simplification for nearly collinear points. */
export function simplifyCollinear(p: Vec2[], eps = 1e-4): Vec2[] {
  if (p.length < 3) return p;
  const out: Vec2[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = out[out.length - 1], b = p[i], c = p[i + 1];
    const ab = sub(b, a), bc = sub(c, b);
    const cr = Math.abs(ab[0] * bc[1] - ab[1] * bc[0]);
    if (cr / (len(ab) * len(bc) + 1e-12) > eps || dot(ab, bc) < 0) out.push(b);
  }
  out.push(p[p.length - 1]);
  return out;
}

export interface CorridorGeometry {
  corridor: Corridor;
  /** Octilinear centre path in mm (a -> b). */
  center: Vec2[];
  /** Interior station positions along the centre path (mm), same order as corridor.interior. */
  interiorPoints: Vec2[];
  /** Per line: offset (mm) and its smoothed polyline. */
  lines: { lineId: string; offset: number; path: Vec2[] }[];
}

export interface RouteOptions {
  lineWidth: number;
  lineGap: number;
  cornerRadius: number;
  /** Global line ordering (index) used to order parallel lines consistently. */
  lineOrder: Map<string, number>;
  arcSegments: number;
  /** Detour distance (mm) for duplicate corridors between the same stations. */
  detour: number;
  /** 'octilinear': 1-bend 45° paths between majors · 'smooth': follow the geographic path, angles snapped to `angleStep`. */
  style?: 'octilinear' | 'smooth';
  /** Angle quantum (degrees) for smooth corridors, e.g. 30. */
  angleStep?: number;
  /** Simplification tolerance (mm) for smooth corridors. */
  simplifyTol?: number;
}

/** Douglas–Peucker simplification keeping the first and last points. */
export function simplifyDP(pts: Vec2[], tol: number): Vec2[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = pointSegDistLocal(pts[i], a, b); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > tol && idx > 0) {
    const left = simplifyDP(pts.slice(0, idx + 1), tol), right = simplifyDP(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}
function pointSegDistLocal(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a); const l2 = dot(ab, ab);
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

/**
 * Snap every segment direction to a multiple of `stepDeg`, rebuild the chain, then spread the
 * end-point error linearly over the vertices so both ends stay exactly where they were.
 */
export function snapAngles(pts: Vec2[], stepDeg: number): Vec2[] {
  if (pts.length < 3) return pts;
  const step = (stepDeg * Math.PI) / 180;
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = sub(pts[i], pts[i - 1]);
    const L = len(d);
    const ang = Math.round(angleOf(d) / step) * step;
    out.push(add(out[i - 1], fromAngle(ang, L)));
  }
  const err = sub(pts[pts.length - 1], out[out.length - 1]);
  const n = out.length - 1;
  return out.map((q, i) => add(q, mul(err, i / n)));
}

/** Build corridor centre paths and per-line offset paths. Positions must already be in mm. */
export function buildCorridorGeometry(graph: StationGraph, opts: RouteOptions): CorridorGeometry[] {
  const out: CorridorGeometry[] = [];
  const spacing = opts.lineWidth + opts.lineGap;
  // Corridors sharing the same endpoints (loops, alternative branches) must not overlap: detour the extras.
  const pairCount = new Map<string, number>();
  const pairKey = (c: Corridor) => (c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`);
  for (const c of graph.corridors) {
    const A = graph.nodes.get(c.a)!, B = graph.nodes.get(c.b)!;
    let prefer: Vec2 | undefined;
    if (c.geoPath.length >= 2) prefer = sub(c.geoPath[1], c.geoPath[0]);
    let center: Vec2[];
    const dup = pairCount.get(pairKey(c)) ?? 0;
    pairCount.set(pairKey(c), dup + 1);
    if (opts.style === 'smooth' && dup === 0 && c.a !== c.b && c.interior.length === 0) {
      center = [A.pos, B.pos]; // adjacent majors: always a straight run
    } else if (opts.style === 'smooth' && dup === 0 && c.a !== c.b) {
      // Geographic path through the interior stations, simplified, angle-snapped, ends fixed.
      const raw: Vec2[] = [A.pos, ...c.interior.map((id) => graph.nodes.get(id)!.pos), B.pos];
      let simp = simplifyDP(dedupe(raw), opts.simplifyTol ?? 6);
      if (opts.angleStep) simp = snapAngles(simp, opts.angleStep);
      // Merge nearly-collinear vertices left over after snapping.
      center = simplifyCollinear(dedupe(simp), 0.02);
    } else if (dup === 0 || c.a === c.b) center = octilinearPath(A.pos, B.pos, prefer);
    else {
      // Bulge to the side of the geographic detour: A -> A+off -> B+off -> B, off snapped to 45°.
      const mid = mul(add(A.pos, B.pos), 0.5);
      const geoMid = c.geoPath[Math.floor(c.geoPath.length / 2)];
      const geoA = c.geoPath[0], geoB = c.geoPath[c.geoPath.length - 1];
      const gm = mul(add(geoA, geoB), 0.5);
      let side = sub(geoMid, gm);
      if (len(side) < 1e-6) side = perp(sub(B.pos, A.pos));
      const ang = Math.round(angleOf(side) / (Math.PI / 4)) * (Math.PI / 4);
      const mag = Math.max(opts.detour * (1 + 0.6 * (dup - 1)), opts.detour * Math.min(4, (c.interior.length + 1) * 0.35));
      const off = fromAngle(ang, mag);
      center = dedupe([A.pos, add(A.pos, off), add(B.pos, off), B.pos]);
      void mid;
    }
    center = dedupe(center);
    if (center.length < 2) center = [A.pos, add(A.pos, [1e-3, 0])];
    // Interior stations evenly along arc-length
    const L = pathLength(center);
    const n = c.interior.length;
    const interiorPoints: Vec2[] = [];
    for (let i = 1; i <= n; i++) {
      // Nudge stations off bends: if a station lands within 0.3*step of the bend, keep it (bends at stations are fine).
      interiorPoints.push(pointAt(center, (L * i) / (n + 1)).point);
    }
    // Offsets: order lines by global order; canonical direction is a->b, but offsets must be consistent
    // regardless of which end is "a": use the canonical orientation from the lexically smaller node id.
    const lines = [...c.lines].sort((x, y) => (opts.lineOrder.get(x) ?? 0) - (opts.lineOrder.get(y) ?? 0));
    const k = lines.length;
    const flip = c.a < c.b ? 1 : -1;
    const geoms = lines.map((lineId, i) => {
      const off = (i - (k - 1) / 2) * spacing * flip;
      const raw = offsetPolyline(center, off);
      const path = filletPolyline(dedupe(raw), opts.cornerRadius, opts.arcSegments);
      return { lineId, offset: off, path: dedupe(path) };
    });
    out.push({ corridor: c, center, interiorPoints, lines: geoms });
  }
  return out;
}

/** Split a polyline into pieces whose bounding boxes (padded by pad) fit within maxW x maxH (either orientation). */
export function splitForBed(path: Vec2[], pad: number, maxW: number, maxH: number, stationParams: number[]): Vec2[][] {
  const fits = (pts: Vec2[]) => {
    const bb = bboxOf(pts);
    const w = bb.w + 2 * pad, h = bb.h + 2 * pad;
    return (w <= maxW && h <= maxH) || (h <= maxW && w <= maxH);
  };
  if (fits(path)) return [path];
  // cumulative arc-length per point
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const pieces: Vec2[][] = [];
  let startIdx = 0;
  let startPt: Vec2 = path[0];
  let i = 1;
  while (i < path.length) {
    const cand = [startPt, ...path.slice(startIdx + 1, i + 1)];
    if (!fits(cand)) {
      // Cut somewhere between the last point that fit and this one: prefer midpoint between stations.
      const sBad = cum[i];
      const sGood = i - 1 > startIdx ? cum[i - 1] : cum[startIdx];
      let cutS = (sGood + sBad) / 2;
      // Prefer a span midpoint between consecutive stations if it lies in the fitting range
      const sp = [...stationParams].sort((a, b) => a - b);
      for (let j = 0; j + 1 < sp.length; j++) {
        const mid = (sp[j] + sp[j + 1]) / 2;
        if (mid > cum[startIdx] + 1e-6 && mid <= sGood) cutS = mid;
      }
      if (cutS <= cum[startIdx] + 1e-6) cutS = Math.min(sBad, cum[startIdx] + (sBad - cum[startIdx]) * 0.5);
      const cutPt = pointAt(path, cutS).point;
      const piece = [startPt, ...path.slice(startIdx + 1).filter((_, k) => cum[startIdx + 1 + k] < cutS), cutPt];
      pieces.push(dedupe(piece));
      // new start
      startPt = cutPt;
      startIdx = Math.max(startIdx, cum.findIndex((s) => s >= cutS) - 1);
      i = startIdx + 1;
      if (pieces.length > 200) break;
      continue;
    }
    i++;
  }
  const last = [startPt, ...path.slice(startIdx + 1)];
  if (pathLength(last) > 1e-6) pieces.push(dedupe(last));
  void total;
  return pieces.filter((p) => p.length >= 2);
}

/** Arc-length parameter of the point on path closest to q. */
export function paramOf(path: Vec2[], q: Vec2): number {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(q, a), ab) / l2)) : 0;
    const p = add(a, mul(ab, t));
    const d = dist(p, q);
    if (d < best) { best = d; bestS = acc + t * Math.sqrt(l2); }
    acc += Math.sqrt(l2);
  }
  return bestS;
}
