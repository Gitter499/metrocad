/**
 * Octilinear force-directed layout of the reduced graph (major stations + corridors).
 * Units: 1 = desired minimum station spacing.
 */
import type { Vec2 } from '../types.js';
import type { StationGraph, GNode, Corridor } from './graph.js';
import { add, sub, mul, len, dist, norm, pointSegDist, rng, fromAngle, angleOf, dot } from '../vec.js';

export interface ForceOptions {
  strength: number;    // 0..1 schematic strength
  fisheye: number;     // 0..1
  iterations: number;
  seed: number;
  /** Corridor target length: hops^exponent (compresses long suburban chains). */
  lengthExponent: number;
  /** Constant pull towards the (fisheye) geographic position. */
  anchor: number;
  /** Corridor length may not shrink below fidelityMin × or grow beyond fidelityMax × its geographic length. */
  fidelityMin: number;
  fidelityMax: number;
}

const OCT = Math.PI / 4;
/**
 * Snap to the octilinear grid with a preference for horizontals/verticals: official diagrams use diagonals
 * only when a line really runs diagonally (within ~15° of 45°); everything else is drawn straight.
 */
export const snapAngle = (t: number) => {
  const q = Math.PI / 2;
  const base = Math.round(t / q) * q;            // nearest axis
  const off = t - base;                           // -45°..45°
  if (Math.abs(off) < Math.PI / 6) return base;   // within 30° of an axis → axis
  return base + Math.sign(off) * OCT;             // otherwise the diagonal on that side
};

/** Radial fisheye about the degree-weighted centroid: expands the dense core. */
export function applyFisheye(nodes: Iterable<GNode>, amount: number): void {
  const arr = [...nodes];
  if (!arr.length || amount <= 0) return;
  let cx = 0, cy = 0, w = 0;
  for (const n of arr) { const k = n.lines.length + n.neighbors.size; cx += n.pos[0] * k; cy += n.pos[1] * k; w += k; }
  cx /= w; cy /= w;
  let R = 0;
  for (const n of arr) R = Math.max(R, dist(n.pos, [cx, cy]));
  const g = 1 - 0.55 * amount;
  for (const n of arr) {
    const d = sub(n.pos, [cx, cy]);
    const r = len(d);
    if (r < 1e-9) continue;
    const r2 = R * Math.pow(r / R, g);
    n.pos = add([cx, cy], mul(d, r2 / r));
  }
}

/** Normalise positions so the median corridor length equals its target (units). */
function normalizeScale(majors: GNode[], corridors: Corridor[], target: (c: Corridor) => number, nodes: Map<string, GNode>) {
  const ratios: number[] = [];
  for (const c of corridors) {
    const d = dist(nodes.get(c.a)!.pos, nodes.get(c.b)!.pos);
    if (d > 1e-6) ratios.push(target(c) / d);
  }
  ratios.sort((a, b) => a - b);
  const k = ratios[Math.floor(ratios.length / 2)] ?? 1;
  let cx = 0, cy = 0;
  for (const n of majors) { cx += n.pos[0]; cy += n.pos[1]; }
  cx /= majors.length; cy /= majors.length;
  for (const n of nodes.values()) n.pos = [(n.pos[0] - cx) * k, (n.pos[1] - cy) * k];
}

export function layoutReducedGraph(graph: StationGraph, opts: ForceOptions): void {
  const { nodes, corridors } = graph;
  const majors = [...nodes.values()].filter((n) => n.major);
  if (majors.length < 2) return;
  const targetLen = (c: Corridor) => {
    const hops = c.interior.length + 1;
    const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
    const hub = 0.5 + 0.22 * Math.max(0, a.lines.length - 1) + 0.5 + 0.22 * Math.max(0, b.lines.length - 1);
    return Math.max(hub, Math.pow(hops, opts.lengthExponent));
  };
  applyFisheye(nodes.values(), opts.fisheye);
  normalizeScale(majors, corridors, targetLen, nodes);
  const anchor = new Map<string, Vec2>();
  for (const n of majors) anchor.set(n.id, [...n.pos] as Vec2);
  // Official diagrams keep proportions roughly geographic: a corridor may shrink/stretch only so far
  // from its (fisheye) geographic length. This is what keeps line 1 in Paris straight west–east.
  const geoLen = new Map<string, number>();
  for (const c of corridors) geoLen.set(c.id, dist(nodes.get(c.a)!.pos, nodes.get(c.b)!.pos));
  const targetLenClamped = (c: Corridor) => {
    const g = geoLen.get(c.id) ?? 1;
    const t = targetLen(c);
    return Math.max(t, Math.min(Math.max(t, g * opts.fidelityMin), g * opts.fidelityMax));
  };

  const random = rng(opts.seed);
  for (const n of majors) n.pos = add(n.pos, [(random() - 0.5) * 0.01, (random() - 0.5) * 0.01]);

  const S = opts.strength;
  const iters = Math.max(1, opts.iterations);
  const idx = new Map(majors.map((n, i) => [n.id, i]));
  const disp: Vec2[] = majors.map(() => [0, 0]);
  const radius = majors.map((n) => 0.5 + 0.22 * Math.max(0, n.lines.length - 1));
  const edgeGap = 0.8;     // node-edge

  for (let it = 0; it < iters; it++) {
    const t = it / iters;
    const temp = 0.35 * (1 - t) + 0.03;                 // step size
    const wOct = S * (0.15 + 0.9 * t);                   // octilinear grows over time
    const wLen = 0.5;
    const wAnchor = (1 - S) * 0.15 + opts.anchor * (1 - 0.5 * t);   // geography keeps pulling
    for (const d of disp) { d[0] = 0; d[1] = 0; }

    // Corridor springs: length + octilinear direction
    for (const c of corridors) {
      const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
      if (a === b) continue;
      const d = sub(b.pos, a.pos);
      const L = len(d);
      if (L < 1e-9) continue;
      const T = targetLenClamped(c);
      const dir = norm(d);
      // length
      const f = (L - T) * wLen;
      const fv = mul(dir, f * 0.5);
      accumulate(disp, idx.get(a.id)!, fv);
      accumulate(disp, idx.get(b.id)!, mul(fv, -1));
      // octilinear: rotate towards nearest 45° multiple around the midpoint
      const ang = angleOf(d);
      const target = snapAngle(ang);
      const diff = target - ang;
      if (Math.abs(diff) > 1e-4) {
        const mid = mul(add(a.pos, b.pos), 0.5);
        const half = mul(fromAngle(target, L * 0.5), 1);
        const ta = sub(mid, half), tb = add(mid, half);
        accumulate(disp, idx.get(a.id)!, mul(sub(ta, a.pos), wOct));
        accumulate(disp, idx.get(b.id)!, mul(sub(tb, b.pos), wOct));
      }
    }
    // Node-node repulsion (hubs with many lines need more room for their marker)
    for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) {
      const a = majors[i], b = majors[j];
      const d = sub(b.pos, a.pos);
      const L = len(d);
      const minGap = radius[i] + radius[j];
      if (L < minGap) {
        const push = L < 1e-6 ? fromAngle(random() * Math.PI * 2, (minGap) * 0.5) : mul(d, ((minGap - L) / L) * 0.5);
        accumulate(disp, i, mul(push, -1));
        accumulate(disp, j, push);
      }
    }
    // Node-edge repulsion (keeps stations from sitting on foreign corridors, prevents new crossings)
    for (const c of corridors) {
      const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
      const ia = idx.get(a.id)!, ib = idx.get(b.id)!;
      for (let i = 0; i < majors.length; i++) {
        if (i === ia || i === ib) continue;
        const p = majors[i];
        const dd = pointSegDist(p.pos, a.pos, b.pos);
        if (dd < edgeGap) {
          // push p away from the segment, perpendicular
          const ab = sub(b.pos, a.pos);
          const l2 = dot(ab, ab) || 1;
          const tt = Math.max(0, Math.min(1, dot(sub(p.pos, a.pos), ab) / l2));
          const q = add(a.pos, mul(ab, tt));
          let n = sub(p.pos, q);
          if (len(n) < 1e-6) n = [-ab[1], ab[0]];
          n = norm(n);
          const push = mul(n, (edgeGap - dd) * 0.6);
          accumulate(disp, i, push);
          accumulate(disp, ia, mul(push, -0.25));
          accumulate(disp, ib, mul(push, -0.25));
        }
      }
    }
    // Anchor
    for (const n of majors) {
      const i = idx.get(n.id)!;
      accumulate(disp, i, mul(sub(anchor.get(n.id)!, n.pos), wAnchor));
    }
    // Apply with clamped step
    for (let i = 0; i < majors.length; i++) {
      const d = disp[i];
      const l = len(d);
      const step = l > temp ? mul(d, temp / l) : d;
      majors[i].pos = add(majors[i].pos, step);
    }
  }
}

function accumulate(disp: Vec2[], i: number, v: Vec2) { disp[i][0] += v[0]; disp[i][1] += v[1]; }

/** Snap major nodes to a grid (cell size in units); resolve collisions by spiralling to a free cell. */
export function snapToGrid(graph: StationGraph, cell: number): void {
  const majors = [...graph.nodes.values()].filter((n) => n.major);
  const taken = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  // Snap most-connected first so hubs keep their spots.
  majors.sort((a, b) => (b.neighbors.size + b.lines.length) - (a.neighbors.size + a.lines.length));
  for (const n of majors) {
    const gx = Math.round(n.pos[0] / cell), gy = Math.round(n.pos[1] / cell);
    let placed = false;
    for (let r = 0; r <= 6 && !placed; r++) {
      const cand: [number, number][] = [];
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cand.push([gx + dx, gy + dy]);
      cand.sort((p, q) => Math.hypot(p[0] * cell - n.pos[0], p[1] * cell - n.pos[1]) - Math.hypot(q[0] * cell - n.pos[0], q[1] * cell - n.pos[1]));
      for (const [x, y] of cand) {
        if (!taken.has(key(x, y))) { taken.add(key(x, y)); n.pos = [x * cell, y * cell]; placed = true; break; }
      }
    }
  }
}


/**
 * Local search on the grid: move each major node to a neighbouring cell when that reduces bends
 * (non-octilinear corridors), length error, and proximity penalties. Runs after snapToGrid.
 */
export function straighten(graph: StationGraph, cell: number, rounds = 4, lengthExponent = 0.75): void {
  const { nodes, corridors, incident } = graph;
  const majors = [...nodes.values()].filter((n) => n.major);
  const occupied = new Map<string, string>();
  const key = (p: Vec2) => `${Math.round(p[0] / cell)},${Math.round(p[1] / cell)}`;
  for (const n of majors) occupied.set(key(n.pos), n.id);
  const radiusOf = (n: GNode) => 0.5 + 0.22 * Math.max(0, n.lines.length - 1);
  const targetLen = (c: Corridor) => {
    const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
    return Math.max(radiusOf(a) + radiusOf(b), Math.pow(c.interior.length + 1, lengthExponent));
  };
  const isOct = (d: Vec2) => {
    const ax = Math.abs(d[0]), ay = Math.abs(d[1]);
    return ax < 1e-6 || ay < 1e-6 || Math.abs(ax - ay) < 1e-6;
  };
  const corridorCost = (c: Corridor): number => {
    const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
    if (a === b) return 0;
    const d = sub(b.pos, a.pos);
    const L = len(d);
    let cost = isOct(d) ? 0 : 1.0;
    const T = targetLen(c);
    cost += 0.15 * Math.abs(L - T) / T;
    if (L < radiusOf(a) + radiusOf(b)) cost += 3;
    return cost;
  };
  const nodeCost = (n: GNode): number => {
    let cost = 0;
    for (const c of incident.get(n.id) ?? []) cost += corridorCost(c);
    // proximity to other nodes and foreign corridors
    for (const m of majors) {
      if (m === n) continue;
      const d = dist(m.pos, n.pos);
      const need = radiusOf(m) + radiusOf(n);
      if (d < need) cost += 3 * (need - d + 0.1);
    }
    for (const c of corridors) {
      if (c.a === n.id || c.b === n.id) continue;
      const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
      const d = pointSegDist(n.pos, a.pos, b.pos);
      if (d < 0.8) cost += 3 * (0.8 - d + 0.1);
    }
    // a line passing through this node should continue straight (official diagrams rarely bend at interchanges)
    const inc = incident.get(n.id) ?? [];
    const byLine = new Map<string, Corridor[]>();
    for (const c of inc) for (const l of c.lines) (byLine.get(l) ?? byLine.set(l, []).get(l)!).push(c);
    for (const cs of byLine.values()) {
      if (cs.length !== 2) continue;
      const other = (c: Corridor) => nodes.get(c.a === n.id ? c.b : c.a)!.pos;
      const d1 = norm(sub(other(cs[0]), n.pos)), d2 = norm(sub(other(cs[1]), n.pos));
      const straightness = -(d1[0] * d2[0] + d1[1] * d2[1]); // 1 = straight through, -1 = doubles back
      cost += 0.6 * (1 - straightness) / 2;
    }
    // corridors incident to n must not pass over other nodes
    for (const c of incident.get(n.id) ?? []) {
      const a = nodes.get(c.a)!, b = nodes.get(c.b)!;
      for (const m of majors) {
        if (m === a || m === b) continue;
        const d = pointSegDist(m.pos, a.pos, b.pos);
        if (d < 0.8) cost += 3 * (0.8 - d + 0.1);
      }
    }
    return cost;
  };
  const moves: Vec2[] = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) moves.push([dx * cell, dy * cell]);
  for (let r = 0; r < rounds; r++) {
    let improved = 0;
    for (const n of majors) {
      const orig: Vec2 = [...n.pos] as Vec2;
      const base = nodeCost(n);
      if (base < 1e-9) continue;
      let best = base, bestPos = orig;
      for (const mv of moves) {
        const cand: Vec2 = [orig[0] + mv[0], orig[1] + mv[1]];
        if (occupied.has(key(cand))) continue;
        n.pos = cand;
        const c = nodeCost(n) + 0.02 * len(mv) / cell; // slight preference for staying put
        if (c < best - 1e-6) { best = c; bestPos = cand; }
      }
      n.pos = bestPos;
      if (bestPos !== orig) { occupied.delete(key(orig)); occupied.set(key(bestPos), n.id); improved++; }
    }
    if (!improved) break;
  }
}


/**
 * Semi-geographic mode: majors keep their (fisheye) geographic positions, moving only as much as needed
 * so no two markers overlap and no major sits on a foreign corridor. Units: 1 = station spacing.
 */
export function relaxMajors(graph: StationGraph, iterations: number): void {
  const { nodes, corridors } = graph;
  const majors = [...nodes.values()].filter((n) => n.major);
  if (majors.length < 2) return;
  // normalise so the median corridor length is 1 unit
  const lens: number[] = [];
  for (const c of corridors) { const d = dist(nodes.get(c.a)!.pos, nodes.get(c.b)!.pos); if (d > 1e-6) lens.push(d / Math.max(1, Math.sqrt(c.interior.length + 1))); }
  lens.sort((a, b) => a - b);
  const k = 1 / (lens[Math.floor(lens.length / 2)] || 1);
  for (const n of nodes.values()) n.pos = [n.pos[0] * k, n.pos[1] * k];
  const anchor = new Map(majors.map((n) => [n.id, [...n.pos] as Vec2]));
  const radius = majors.map((n) => 0.45 + 0.2 * Math.max(0, n.lines.length - 1));
  const iters = Math.max(40, Math.min(iterations, 300));
  for (let it = 0; it < iters; it++) {
    const disp: Vec2[] = majors.map(() => [0, 0]);
    for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) {
      const d = sub(majors[j].pos, majors[i].pos);
      const L = len(d), need = radius[i] + radius[j];
      if (L < need) {
        const push = L < 1e-6 ? [(need) * 0.5, 0] as Vec2 : mul(d, ((need - L) / L) * 0.5);
        disp[i][0] -= push[0]; disp[i][1] -= push[1]; disp[j][0] += push[0]; disp[j][1] += push[1];
      }
    }
    for (let i = 0; i < majors.length; i++) {
      const a = sub(anchor.get(majors[i].id)!, majors[i].pos);
      disp[i][0] += a[0] * 0.05; disp[i][1] += a[1] * 0.05;
      const l = len(disp[i]); const step = l > 0.2 ? mul(disp[i], 0.2 / l) : disp[i];
      majors[i].pos = add(majors[i].pos, step);
    }
  }
  // Interior stations follow their neighbours' displacement so corridors keep their shape.
  for (const c of corridors) {
    const da = sub(nodes.get(c.a)!.pos, anchor.get(c.a)!), db = sub(nodes.get(c.b)!.pos, anchor.get(c.b)!);
    c.interior.forEach((id, i) => { const t = (i + 1) / (c.interior.length + 1); const n = nodes.get(id)!; n.pos = add(n.pos, add(mul(da, 1 - t), mul(db, t))); });
  }
}
