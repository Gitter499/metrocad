/**
 * Self-contained FDM slicer: meshes in, G-code + statistics out.
 *
 * Pipeline
 *   1. transform all triangles onto the plate and pick the layer planes;
 *   2. intersect every triangle with each plane and link the segments into closed loops;
 *   3. build the 2D regions per layer (manifold-3d CrossSection when available, a
 *      lighter pure-TS fallback otherwise): wall centrelines by inward offsets and the
 *      infill region inside the innermost wall;
 *   4. infill: parallel lines clipped against the region with an even-odd scanline
 *      clipper. Top/bottom (solid) detection is done in 1D along each infill line by
 *      intersecting the clipped spans with the spans of the neighbouring layers' regions:
 *      wherever a span is not covered by every neighbour within topLayers/bottomLayers it
 *      is printed solid, elsewhere sparse;
 *   5. moves are collected per layer, timed with a trapezoidal motion model (used for
 *      the minimum layer time and the M73 progress), then written out as G-code.
 */
import type { ManifoldToplevel, CrossSection } from 'manifold-3d';
import type { MeshData } from '../types.js';
import type { PrinterProfile, ProcessProfile } from './profiles.js';

/* ----------------------------- Public types ----------------------------- */

export interface SliceTransform {
  /** Rotation about the z axis (at the origin), degrees CCW. */
  rotationDeg: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface SliceObject {
  mesh: MeshData;
  /** Rotate about z at the origin, then translate. The object's bottom must end at z = 0. */
  transform?: SliceTransform;
  name?: string;
  /** Insert a filament change (M600) at the first layer whose z exceeds this height. */
  colorChangeAtZ?: number;
}

export interface SliceInput {
  objects: SliceObject[];
  printer: PrinterProfile;
  process: ProcessProfile;
  /** Free-form label written into the G-code header. */
  label?: string;
}

export interface SliceStats {
  layers: number;
  timeSec: number;
  filamentMm: number;
  filamentMm3: number;
  /** PLA at 1.24 g/cm3. */
  filamentGrams: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  travelMm: number;
  extrudeMm: number;
  /** Per-layer details (z of the layer top, raw contour loops found, printed islands, estimated seconds). */
  perLayer: { z: number; loops: number; islands: number; timeSec: number }[];
}

export interface SliceResult {
  gcode: string;
  stats: SliceStats;
}

/* ----------------------------- Internal types ----------------------------- */

type Pt = [number, number];
type Loop = Pt[];

const PLA_DENSITY = 1.24; // g/cm3
const START_OVERHEAD_SEC = 120;
const END_OVERHEAD_SEC = 30;
const RETRACT_PAIR_SEC = 0.5;
const MIN_TRAVEL_FOR_RETRACT = 1.5;
const MIN_LOOP_PERIMETER = 0.5;
const Z_FEED = 10; // mm/s for layer changes and z-hops
const KEY_Q = 1000; // endpoint quantisation: 0.001 mm

interface LayerGeometry {
  index: number;
  /** Top of the layer. */
  z: number;
  /** Layer height. */
  h: number;
  loops: Loop[];
  /** Wall centrelines: walls[k] is wall level k (0 = outermost). */
  walls: Loop[][];
  /** Region that receives infill (inside the innermost wall, with a slight overlap). */
  infill: Loop[];
  islands: Island[];
}

interface Island {
  walls: Loop[][];
  infill: Loop[];
  /** Anchor used for nearest-neighbour ordering. */
  ax: number;
  ay: number;
}

/* ----------------------------- Entry point ----------------------------- */

/**
 * Slice a plate of objects into G-code. Pass the initialised manifold-3d module for
 * robust polygon offsetting; without it a simpler pure-TS offsetter is used.
 */
export function slicePlate(input: SliceInput, m?: ManifoldToplevel): SliceResult {
  const { printer, process } = input;
  const w = process.lineWidth;
  const soup = buildSoup(input.objects);
  const bbox = soup.bbox;

  // ---- Layer planes ----
  const layers: LayerGeometry[] = [];
  const zMax = bbox.max[2];
  for (let i = 0; ; i++) {
    const z = process.firstLayerHeight + i * process.layerHeight;
    const h = i === 0 ? process.firstLayerHeight : process.layerHeight;
    if (i > 0 && z - h / 2 >= zMax - 1e-6) break;
    if (i === 0 && zMax <= 1e-6) break;
    layers.push({ index: i, z, h, loops: [], walls: [], infill: [], islands: [] });
    if (i > 100000) throw new Error('slicePlate: too many layers');
  }

  // ---- Contours per layer ----
  for (const L of layers) {
    const zSlice = Math.min(L.z - L.h / 2, zMax - 1e-4);
    L.loops = sliceAtZ(soup, nudgePlane(soup, zSlice));
  }

  // ---- 2D regions (walls + infill region) ----
  const infillInset = process.perimeters > 0 ? process.perimeters * w - 0.1 * w : 0;
  const skirt: Loop[][] = [];
  if (m) {
    const { CrossSection: CS } = m;
    for (const L of layers) {
      if (!L.loops.length) continue;
      const region = new CS(L.loops, 'EvenOdd');
      for (let k = 0; k < process.perimeters; k++) {
        L.walls.push(offsetCS(region, -(w / 2 + k * w)));
      }
      L.infill = infillInset > 0 ? offsetCS(region, -infillInset) : region.toPolygons();
      if (L.index === 0 && process.skirtLoops > 0) {
        for (let k = 0; k < process.skirtLoops; k++) skirt.push(offsetCS(region, process.skirtDistance + w / 2 + k * w, 'Round'));
      }
      region.delete();
    }
  } else {
    for (const L of layers) {
      if (!L.loops.length) continue;
      const oriented = orientLoops(L.loops);
      for (let k = 0; k < process.perimeters; k++) L.walls.push(offsetLoopsNaive(oriented, -(w / 2 + k * w)));
      L.infill = infillInset > 0 ? offsetLoopsNaive(oriented, -infillInset) : oriented;
      if (L.index === 0 && process.skirtLoops > 0) {
        const b = loopsBBox(oriented);
        for (let k = 0; k < process.skirtLoops; k++) {
          const d = process.skirtDistance + w / 2 + k * w;
          skirt.push([[[b.minX - d, b.minY - d], [b.maxX + d, b.minY - d], [b.maxX + d, b.maxY + d], [b.minX - d, b.maxY + d]]]);
        }
      }
    }
  }
  for (const L of layers) L.islands = groupIslands(L);

  // ---- Toolpaths + timing per layer ----
  const filamentArea = Math.PI * (printer.filamentDiameter / 2) ** 2;
  const speeds = {
    travel: Math.min(process.travelSpeed, printer.travelSpeed),
    perimeter: Math.min(process.perimeterSpeed, printer.maxSpeed),
    infill: Math.min(process.infillSpeed, printer.maxSpeed),
    solid: Math.min(process.topSolidSpeed, printer.maxSpeed),
    first: Math.min(process.firstLayerSpeed, printer.maxSpeed),
  };
  const coverage = new CoverageCache(layers, process, w);
  const head = { x: 0, y: 0 };
  const layerMoves: MoveBuf[] = [];
  const layerTimes: number[] = [];
  for (const L of layers) {
    const buf = buildLayerMoves(L, layers, skirt, head, process, speeds, filamentArea, coverage);
    coverage.release(L.index - process.bottomLayers - 1);
    // Minimum layer time: slow down the print moves proportionally (a few iterations, the
    // estimate is not linear in the feedrate because of acceleration).
    let t = estimateTime(buf, printer.accel);
    if (process.minLayerTime > 0) {
      for (let iter = 0; iter < 3 && t < process.minLayerTime - 0.05; iter++) {
        const factor = Math.max(0.05, t / process.minLayerTime);
        buf.scalePrintFeeds(factor, 5);
        const t2 = estimateTime(buf, printer.accel);
        if (t2 <= t + 1e-6) break;
        t = t2;
      }
    }
    layerMoves.push(buf);
    layerTimes.push(t);
  }

  // ---- G-code ----
  return writeGcode(input, layers, layerMoves, layerTimes, bbox, filamentArea);
}

/* ----------------------------- Triangle soup ----------------------------- */

interface Soup {
  /** xyz per vertex (transformed). */
  pos: Float64Array;
  idx: Uint32Array;
  triMin: Float64Array;
  triMax: Float64Array;
  /** Sorted unique vertex z values (for plane nudging). */
  zs: Float64Array;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

function buildSoup(objects: SliceObject[]): Soup {
  let nv = 0, ni = 0;
  for (const o of objects) { nv += o.mesh.positions.length / 3; ni += o.mesh.indices.length; }
  const pos = new Float64Array(nv * 3);
  const idx = new Uint32Array(ni);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let vo = 0, io = 0;
  for (const o of objects) {
    const t = o.transform ?? { rotationDeg: 0, dx: 0, dy: 0, dz: 0 };
    const a = (t.rotationDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const p = o.mesh.positions;
    const n = p.length / 3;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const X = c * x - s * y + t.dx, Y = s * x + c * y + t.dy, Z = z + t.dz;
      pos[(vo + i) * 3] = X; pos[(vo + i) * 3 + 1] = Y; pos[(vo + i) * 3 + 2] = Z;
      if (X < min[0]) min[0] = X; if (X > max[0]) max[0] = X;
      if (Y < min[1]) min[1] = Y; if (Y > max[1]) max[1] = Y;
      if (Z < min[2]) min[2] = Z; if (Z > max[2]) max[2] = Z;
    }
    const ix = o.mesh.indices;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += n; io += ix.length;
  }
  if (!isFinite(min[0])) { min[0] = min[1] = min[2] = 0; max[0] = max[1] = max[2] = 0; }
  const nt = idx.length / 3;
  const triMin = new Float64Array(nt), triMax = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const z0 = pos[idx[t * 3] * 3 + 2], z1 = pos[idx[t * 3 + 1] * 3 + 2], z2 = pos[idx[t * 3 + 2] * 3 + 2];
    triMin[t] = Math.min(z0, z1, z2); triMax[t] = Math.max(z0, z1, z2);
  }
  const zsAll = new Float64Array(nv);
  for (let i = 0; i < nv; i++) zsAll[i] = pos[i * 3 + 2];
  zsAll.sort();
  let u = 0;
  for (let i = 0; i < nv; i++) if (i === 0 || zsAll[i] !== zsAll[u - 1]) zsAll[u++] = zsAll[i];
  return { pos, idx, triMin, triMax, zs: zsAll.subarray(0, u), bbox: { min, max } };
}

/** Shift the plane by 1e-6 while any vertex lies (numerically) on it. */
function nudgePlane(soup: Soup, z: number): number {
  const zs = soup.zs;
  for (let tries = 0; tries < 16; tries++) {
    let lo = 0, hi = zs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (zs[mid] < z - 1e-9) lo = mid + 1; else hi = mid; }
    if (lo < zs.length && Math.abs(zs[lo] - z) <= 1e-9) z += 1e-6; else return z;
  }
  return z;
}

/* ----------------------------- Plane slicing ----------------------------- */

/** Intersect all triangles with the plane z and link the segments into closed loops. */
function sliceAtZ(soup: Soup, z: number): Loop[] {
  const { pos, idx, triMin, triMax } = soup;
  const nt = idx.length / 3;
  let segs = new Float64Array(1024); // x1 y1 x2 y2 per segment
  let ns = 0;
  for (let t = 0; t < nt; t++) {
    if (!(triMin[t] < z && triMax[t] > z)) continue;
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    // Two of the three edges cross the plane (no vertex lies on it after nudging).
    let px = 0, py = 0, qx = 0, qy = 0, found = 0;
    for (let e = 0; e < 3; e++) {
      let a = e === 0 ? i0 : e === 1 ? i1 : i2;
      let b = e === 0 ? i1 : e === 1 ? i2 : i0;
      const za = pos[a * 3 + 2], zb = pos[b * 3 + 2];
      if ((za < z) === (zb < z)) continue;
      // Canonical vertex order so both triangles sharing the edge compute the identical point.
      if (a > b) { const tmp = a; a = b; b = tmp; }
      const zA = pos[a * 3 + 2], zB = pos[b * 3 + 2];
      const tt = (z - zA) / (zB - zA);
      const x = pos[a * 3] + tt * (pos[b * 3] - pos[a * 3]);
      const y = pos[a * 3 + 1] + tt * (pos[b * 3 + 1] - pos[a * 3 + 1]);
      if (found === 0) { px = x; py = y; } else { qx = x; qy = y; }
      found++;
    }
    if (found !== 2) continue;
    // Orient the segment so that material lies to its left (CCW outer contours): d = z x n.
    const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
    const ux = pos[i1 * 3] - ax, uy = pos[i1 * 3 + 1] - ay, uz = pos[i1 * 3 + 2] - az;
    const vx = pos[i2 * 3] - ax, vy = pos[i2 * 3 + 1] - ay, vz = pos[i2 * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
    const dx = -ny, dy = nx;
    if ((qx - px) * dx + (qy - py) * dy < 0) { const tx = px, ty = py; px = qx; py = qy; qx = tx; qy = ty; }
    if (ns * 4 + 4 > segs.length) { const g = new Float64Array(segs.length * 2); g.set(segs); segs = g; }
    segs[ns * 4] = px; segs[ns * 4 + 1] = py; segs[ns * 4 + 2] = qx; segs[ns * 4 + 3] = qy;
    ns++;
  }
  return linkSegments(segs, ns);
}

function ptKey(x: number, y: number): number {
  return (Math.round(x * KEY_Q) + 0x100000) * 0x200000 + (Math.round(y * KEY_Q) + 0x100000);
}

/**
 * Link directed segments into closed loops. Endpoints are matched through a hash on
 * quantised coordinates (with a 3x3 neighbourhood search for endpoints straddling a
 * quantisation boundary). Segment starts are preferred, but a reversed segment is
 * accepted so inconsistently oriented input still closes.
 */
function linkSegments(segs: Float64Array, ns: number): Loop[] {
  // Node 2i = start of segment i, node 2i+1 = end. Chained per hash key.
  const head = new Map<number, number>();
  const next = new Int32Array(ns * 2).fill(-1);
  for (let i = 0; i < ns; i++) {
    for (let e = 0; e < 2; e++) {
      const k = ptKey(segs[i * 4 + e * 2], segs[i * 4 + e * 2 + 1]);
      const node = i * 2 + e;
      const h = head.get(k);
      next[node] = h === undefined ? -1 : h;
      head.set(k, node);
    }
  }
  const used = new Uint8Array(ns);
  const loops: Loop[] = [];
  const tol = 2.5 / KEY_Q;

  const findNext = (x: number, y: number): number => {
    // Returns node index of the best unused endpoint near (x, y), or -1.
    const qx = Math.round(x * KEY_Q), qy = Math.round(y * KEY_Q);
    let best = -1, bestD = Infinity, bestStart = false;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const k = (qx + ox + 0x100000) * 0x200000 + (qy + oy + 0x100000);
      let node = head.get(k);
      while (node !== undefined && node >= 0) {
        const s = node >> 1;
        if (!used[s]) {
          const ex = segs[node * 2] - x, ey = segs[node * 2 + 1] - y;
          const d = ex * ex + ey * ey;
          const isStart = (node & 1) === 0;
          if (d <= tol * tol && (isStart && !bestStart || (isStart === bestStart && d < bestD))) { best = node; bestD = d; bestStart = isStart; }
        }
        node = next[node];
      }
    }
    return best;
  };

  for (let s = 0; s < ns; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const loop: Loop = [[segs[s * 4], segs[s * 4 + 1]]];
    let cx = segs[s * 4 + 2], cy = segs[s * 4 + 3];
    const sx = segs[s * 4], sy = segs[s * 4 + 1];
    let closed = false;
    for (let guard = 0; guard <= ns; guard++) {
      if (Math.abs(cx - sx) <= tol && Math.abs(cy - sy) <= tol && loop.length > 1) { closed = true; break; }
      const node = findNext(cx, cy);
      if (node < 0) break;
      const seg = node >> 1;
      used[seg] = 1;
      loop.push([cx, cy]);
      if ((node & 1) === 0) { cx = segs[seg * 4 + 2]; cy = segs[seg * 4 + 3]; }
      else { cx = segs[seg * 4]; cy = segs[seg * 4 + 1]; }
    }
    if (!closed) {
      // Open chain: tolerate a small gap, otherwise drop it.
      if (Math.hypot(cx - sx, cy - sy) > 0.05) continue;
    }
    if (loopPerimeter(loop) >= MIN_LOOP_PERIMETER && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/* ----------------------------- 2D helpers ----------------------------- */

function loopPerimeter(loop: Loop): number {
  let p = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n];
    p += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return p;
}

function signedArea(loop: Loop): number {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInLoop(x: number, y: number, loop: Loop): boolean {
  let inside = false;
  for (let i = 0, n = loop.length, j = n - 1; i < n; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function pointInLoops(x: number, y: number, loops: Loop[]): boolean {
  let inside = false;
  for (const l of loops) if (pointInLoop(x, y, l)) inside = !inside;
  return inside;
}

function loopsBBox(loops: Loop[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of loops) for (const p of l) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

function offsetCS(region: CrossSection, delta: number, join: 'Miter' | 'Round' = 'Miter'): Loop[] {
  const off = region.offset(delta, join, 2, 16);
  const simp = off.simplify(0.005);
  const polys = simp.toPolygons() as Loop[];
  off.delete(); simp.delete();
  return polys.filter((l) => l.length >= 3 && loopPerimeter(l) >= MIN_LOOP_PERIMETER);
}

/** Fallback orientation: even-odd nesting; outer contours CCW, holes CW. */
function orientLoops(loops: Loop[]): Loop[] {
  return loops.map((l, i) => {
    let depth = 0;
    const p = l[0];
    for (let j = 0; j < loops.length; j++) if (j !== i && pointInLoop(p[0], p[1], loops[j])) depth++;
    const ccw = signedArea(l) > 0;
    const wantCcw = depth % 2 === 0;
    return ccw === wantCcw ? l : [...l].reverse();
  });
}

/**
 * Fallback vertex-normal (mitred) offset. Does not resolve self-intersections, so it is
 * only used when manifold-3d is not provided; loops that collapse are dropped.
 */
function offsetLoopsNaive(loops: Loop[], delta: number): Loop[] {
  const out: Loop[] = [];
  for (const raw of loops) {
    const l: Loop = [];
    for (const p of raw) { const q = l[l.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) l.push(p); }
    if (l.length > 1 && Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) <= 1e-6) l.pop();
    const n = l.length;
    if (n < 3) continue;
    const res: Loop = [];
    for (let i = 0; i < n; i++) {
      const p = l[(i + n - 1) % n], v = l[i], q = l[(i + 1) % n];
      let e1x = v[0] - p[0], e1y = v[1] - p[1], e2x = q[0] - v[0], e2y = q[1] - v[1];
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
      e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
      // Right-hand normals: outward for CCW outers, into the hole for CW holes.
      const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;
      let bx = n1x + n2x, by = n1y + n2y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-9) { bx = n1x; by = n1y; } else { bx /= bl; by /= bl; }
      const cosHalf = Math.max(0.5, bx * n1x + by * n1y); // miter limit 2
      res.push([v[0] + (bx * delta) / cosHalf, v[1] + (by * delta) / cosHalf]);
    }
    const a0 = signedArea(l), a1 = signedArea(res);
    if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < delta * delta || loopPerimeter(res) < MIN_LOOP_PERIMETER) continue;
    out.push(res);
  }
  return out;
}

/** Group the wall levels and infill contours of a layer into islands (one per outer contour of wall 0). */
function groupIslands(L: LayerGeometry): Island[] {
  const base = L.walls.length ? L.walls[0] : L.infill;
  const outers: { loop: Loop; area: number; island: Island }[] = [];
  for (const loop of base) {
    const a = signedArea(loop);
    if (a > 0) outers.push({ loop, area: a, island: { walls: L.walls.map(() => []), infill: [], ax: loop[0][0], ay: loop[0][1] } });
  }
  if (!outers.length) {
    // Degenerate (e.g. all contours collapsed): everything into one island.
    if (!base.length && !L.infill.length) return [];
    const any = base[0] ?? L.infill[0];
    return [{ walls: L.walls, infill: L.infill, ax: any[0][0], ay: any[0][1] }];
  }
  const assign = (loop: Loop, put: (isl: Island) => void) => {
    const p = loop[0];
    let best: typeof outers[number] | undefined;
    for (const o of outers) {
      if (o.loop === loop) { best = o; break; }
      if (pointInLoop(p[0], p[1], o.loop) && (!best || o.area < best.area)) best = o;
    }
    if (!best) {
      let bd = Infinity;
      for (const o of outers) { const d = Math.hypot(o.island.ax - p[0], o.island.ay - p[1]); if (d < bd) { bd = d; best = o; } }
    }
    put(best!.island);
  };
  L.walls.forEach((level, k) => { for (const loop of level) assign(loop, (isl) => isl.walls[k].push(loop)); });
  for (const loop of L.infill) assign(loop, (isl) => isl.infill.push(loop));
  return outers.map((o) => o.island);
}

/* ----------------------------- Line clipping ----------------------------- */

const SQ = Math.SQRT1_2;
/** Two line directions: 0 = +45 deg, 1 = -45 deg. u is across the lines, v along them. */
function toUV(x: number, y: number, dir: number): [number, number] {
  return dir === 0 ? [-SQ * x + SQ * y, SQ * x + SQ * y] : [SQ * x + SQ * y, SQ * x - SQ * y];
}
function fromUV(u: number, v: number, dir: number): [number, number] {
  return dir === 0 ? [SQ * (v - u), SQ * (u + v)] : [SQ * (u + v), SQ * (u - v)];
}

/** Bucketed edge index of a polygon set for clipping lines u = const (even-odd rule). */
class LineClipper {
  private ua: Float64Array; private va: Float64Array; private ub: Float64Array; private vb: Float64Array;
  private start: Int32Array; private items: Int32Array;
  readonly uMin: number; readonly uMax: number; readonly vMin: number; readonly vMax: number;
  private readonly bucket: number;
  private readonly nb: number;
  readonly empty: boolean;

  constructor(loops: Loop[], dir: number, bucket: number) {
    this.bucket = bucket;
    let ne = 0;
    for (const l of loops) ne += l.length;
    this.ua = new Float64Array(ne); this.va = new Float64Array(ne); this.ub = new Float64Array(ne); this.vb = new Float64Array(ne);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, e = 0;
    for (const l of loops) {
      for (let i = 0, n = l.length; i < n; i++) {
        const a = l[i], b = l[(i + 1) % n];
        const [ua, va] = toUV(a[0], a[1], dir), [ub, vb] = toUV(b[0], b[1], dir);
        this.ua[e] = ua; this.va[e] = va; this.ub[e] = ub; this.vb[e] = vb; e++;
        if (ua < uMin) uMin = ua; if (ua > uMax) uMax = ua; if (va < vMin) vMin = va; if (va > vMax) vMax = va;
      }
    }
    this.empty = ne === 0;
    this.uMin = uMin; this.uMax = uMax; this.vMin = vMin; this.vMax = vMax;
    this.nb = this.empty ? 0 : Math.floor((uMax - uMin) / bucket) + 1;
    const counts = new Int32Array(this.nb + 1);
    const lo = new Int32Array(ne), hi = new Int32Array(ne);
    for (let i = 0; i < ne; i++) {
      lo[i] = Math.floor((Math.min(this.ua[i], this.ub[i]) - uMin) / bucket);
      hi[i] = Math.min(this.nb - 1, Math.floor((Math.max(this.ua[i], this.ub[i]) - uMin) / bucket));
      for (let b = lo[i]; b <= hi[i]; b++) counts[b + 1]++;
    }
    for (let b = 0; b < this.nb; b++) counts[b + 1] += counts[b];
    this.start = counts;
    this.items = new Int32Array(counts[this.nb]);
    const fill = counts.slice(0, this.nb);
    for (let i = 0; i < ne; i++) for (let b = lo[i]; b <= hi[i]; b++) this.items[fill[b]++] = i;
  }

  /** Inside spans of the line u = u0 as a flat sorted list [v0, v1, v2, v3, ...]. */
  clip(u0: number): number[] {
    const out: number[] = [];
    if (this.empty || u0 < this.uMin || u0 > this.uMax) return out;
    const b = Math.min(this.nb - 1, Math.floor((u0 - this.uMin) / this.bucket));
    const vs: number[] = [];
    for (let k = this.start[b]; k < this.start[b + 1]; k++) {
      const i = this.items[k];
      const ua = this.ua[i], ub = this.ub[i];
      if ((ua <= u0) === (ub <= u0)) continue; // half-open rule handles vertices on the line
      vs.push(this.va[i] + ((u0 - ua) / (ub - ua)) * (this.vb[i] - this.va[i]));
    }
    if (vs.length < 2) return out;
    vs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < vs.length; i += 2) out.push(vs[i], vs[i + 1]);
    return out;
  }
}

/** Intersection of two sorted disjoint span lists. */
function spansIntersect(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i], b[j]), hi = Math.min(a[i + 1], b[j + 1]);
    if (hi > lo) out.push(lo, hi);
    if (a[i + 1] < b[j + 1]) i += 2; else j += 2;
  }
  return out;
}

/** a minus b for sorted disjoint span lists. */
function spansSubtract(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < a.length; i += 2) {
    let lo = a[i];
    const hi = a[i + 1];
    while (j < b.length && b[j + 1] <= lo) j += 2;
    let k = j;
    while (k < b.length && b[k] < hi) {
      if (b[k] > lo) out.push(lo, b[k]);
      lo = Math.max(lo, b[k + 1]);
      k += 2;
    }
    if (hi > lo) out.push(lo, hi);
  }
  return out;
}

/** Lazily built clippers of every layer's infill region, used for the top/bottom coverage test. */
class CoverageCache {
  private cache = new Map<number, LineClipper>();
  constructor(private layers: LayerGeometry[], private process: ProcessProfile, private bucket: number) {}

  private get(layer: number, dir: number): LineClipper | null {
    if (layer < 0 || layer >= this.layers.length) return null;
    const key = layer * 2 + dir;
    let c = this.cache.get(key);
    if (!c) { c = new LineClipper(this.layers[layer].infill, dir, this.bucket); this.cache.set(key, c); }
    return c;
  }

  /** Spans of the line covered by all neighbouring layers, or null when there are no neighbours to check. */
  covered(layer: number, dir: number, u0: number): number[] | null {
    let cov: number[] | null = null;
    const { topLayers, bottomLayers } = this.process;
    for (let d = -bottomLayers; d <= topLayers; d++) {
      if (d === 0) continue;
      const c = this.get(layer + d, dir);
      const spans = c ? c.clip(u0) : [];
      cov = cov === null ? spans : spansIntersect(cov, spans);
      if (!cov.length) break;
    }
    return cov;
  }

  release(layer: number) {
    this.cache.delete(layer * 2); this.cache.delete(layer * 2 + 1);
  }
}

/* ----------------------------- Moves ----------------------------- */

const K_TRAVEL = 0, K_EXTRUDE = 1, K_RETRACT = 2, K_UNRETRACT = 3, K_Z = 4, K_TYPE = 5, K_CUSTOM = 6;
const TYPE_NAMES = ['SKIRT', 'WALL-OUTER', 'WALL-INNER', 'SKIN', 'FILL'];
const T_SKIRT = 0, T_WALL_OUTER = 1, T_WALL_INNER = 2, T_SKIN = 3, T_FILL = 4;

/** Struct-of-arrays list of the moves of one layer. */
class MoveBuf {
  kind = new Uint8Array(256);
  x = new Float64Array(256);
  y = new Float64Array(256);
  /** Extrusion (mm filament) for extrude moves, +-retract length for retract moves, target z for z moves. */
  e = new Float64Array(256);
  /** Feedrate mm/s. */
  f = new Float64Array(256);
  /** Feature type (K_TYPE) or custom string index (K_CUSTOM). */
  aux = new Uint16Array(256);
  n = 0;
  custom: string[] = [];

  push(kind: number, x: number, y: number, e: number, f: number, aux = 0) {
    if (this.n === this.kind.length) {
      const grow = <T extends Uint8Array | Uint16Array | Float64Array>(a: T): T => { const b = new (a.constructor as any)(a.length * 2) as T; b.set(a); return b; };
      this.kind = grow(this.kind); this.x = grow(this.x); this.y = grow(this.y); this.e = grow(this.e); this.f = grow(this.f); this.aux = grow(this.aux);
    }
    const i = this.n++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.e[i] = e; this.f[i] = f; this.aux[i] = aux;
  }

  scalePrintFeeds(factor: number, minFeed: number) {
    for (let i = 0; i < this.n; i++) if (this.kind[i] === K_EXTRUDE) this.f[i] = Math.max(minFeed, this.f[i] * factor);
  }
}

interface Speeds { travel: number; perimeter: number; infill: number; solid: number; first: number }

/** Emits the moves of a layer while tracking head position, z and retraction state. */
class LayerBuilder {
  readonly buf = new MoveBuf();
  private retracted = false;
  private pendingZ = true;
  private curType = -1;
  private curZ: number;
  constructor(
    private head: { x: number; y: number },
    private layerZ: number,
    private layerH: number,
    private process: ProcessProfile,
    private travelSpeed: number,
    private filamentArea: number,
  ) { this.curZ = layerZ; }

  setType(t: number) {
    if (t !== this.curType) { this.curType = t; this.buf.push(K_TYPE, 0, 0, 0, 0, t); }
  }

  custom(line: string) {
    this.buf.custom.push(line);
    this.buf.push(K_CUSTOM, 0, 0, 0, 0, this.buf.custom.length - 1);
  }

  travelTo(x: number, y: number) {
    const d = Math.hypot(x - this.head.x, y - this.head.y);
    if (d < 1e-6 && !this.pendingZ) return;
    const p = this.process;
    const long = d > MIN_TRAVEL_FOR_RETRACT;
    if (long && p.retractLength > 0 && !this.retracted) {
      this.buf.push(K_RETRACT, 0, 0, -p.retractLength, p.retractSpeed);
      this.retracted = true;
    }
    let hopped = false;
    if (long && p.zHop > 0 && this.retracted) {
      this.buf.push(K_Z, 0, 0, this.layerZ + p.zHop, Z_FEED);
      hopped = true;
    } else if (this.pendingZ || this.curZ !== this.layerZ) {
      this.buf.push(K_Z, 0, 0, this.layerZ, Z_FEED);
    }
    this.pendingZ = false;
    this.buf.push(K_TRAVEL, x, y, 0, this.travelSpeed);
    if (hopped) this.buf.push(K_Z, 0, 0, this.layerZ, Z_FEED);
    this.curZ = this.layerZ;
    this.head.x = x; this.head.y = y;
  }

  extrudeTo(x: number, y: number, feed: number) {
    const d = Math.hypot(x - this.head.x, y - this.head.y);
    if (d < 1e-6) return;
    const p = this.process;
    if (this.retracted) {
      this.buf.push(K_UNRETRACT, 0, 0, p.retractLength, p.retractSpeed);
      this.retracted = false;
    }
    if (this.pendingZ) { this.buf.push(K_Z, 0, 0, this.layerZ, Z_FEED); this.pendingZ = false; }
    const e = (d * p.lineWidth * this.layerH * p.extrusionMultiplier) / this.filamentArea;
    this.buf.push(K_EXTRUDE, x, y, e, feed);
    this.head.x = x; this.head.y = y;
  }

  /** Print a closed loop, starting at the vertex nearest to the head. */
  loop(loop: Loop, feed: number) {
    const n = loop.length;
    let s = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (loop[i][0] - this.head.x) ** 2 + (loop[i][1] - this.head.y) ** 2;
      if (d < bd) { bd = d; s = i; }
    }
    this.travelTo(loop[s][0], loop[s][1]);
    for (let i = 1; i <= n; i++) { const p = loop[(s + i) % n]; this.extrudeTo(p[0], p[1], feed); }
  }

  /** Print open polylines (flat [x0,y0,x1,y1,...] each) in nearest-neighbour order, either end first. */
  polylines(lines: number[][], feed: number) {
    const used = new Uint8Array(lines.length);
    for (let done = 0; done < lines.length; done++) {
      let best = -1, bestRev = false, bd = Infinity;
      for (let i = 0; i < lines.length; i++) {
        if (used[i]) continue;
        const l = lines[i];
        const d0 = (l[0] - this.head.x) ** 2 + (l[1] - this.head.y) ** 2;
        const d1 = (l[l.length - 2] - this.head.x) ** 2 + (l[l.length - 1] - this.head.y) ** 2;
        if (d0 < bd) { bd = d0; best = i; bestRev = false; }
        if (d1 < bd) { bd = d1; best = i; bestRev = true; }
      }
      used[best] = 1;
      const l = lines[best];
      const np = l.length / 2;
      if (!bestRev) {
        this.travelTo(l[0], l[1]);
        for (let k = 1; k < np; k++) this.extrudeTo(l[k * 2], l[k * 2 + 1], feed);
      } else {
        this.travelTo(l[(np - 1) * 2], l[(np - 1) * 2 + 1]);
        for (let k = np - 2; k >= 0; k--) this.extrudeTo(l[k * 2], l[k * 2 + 1], feed);
      }
    }
  }
}

function buildLayerMoves(
  L: LayerGeometry, layers: LayerGeometry[], skirt: Loop[][], head: { x: number; y: number },
  process: ProcessProfile, speeds: Speeds, filamentArea: number, coverage: CoverageCache,
): MoveBuf {
  const first = L.index === 0;
  const b = new LayerBuilder(head, L.z, L.h, process, speeds.travel, filamentArea);
  const wallFeed = first ? speeds.first : speeds.perimeter;
  const solidFeed = first ? speeds.first : speeds.solid;
  const sparseFeed = first ? speeds.first : speeds.infill;

  if (first && skirt.length) {
    b.setType(T_SKIRT);
    for (let k = skirt.length - 1; k >= 0; k--) for (const loop of skirt[k]) b.loop(loop, wallFeed);
  }

  // Islands in nearest-neighbour order.
  const remaining = new Set(L.islands);
  while (remaining.size) {
    let best: Island | undefined, bd = Infinity;
    for (const isl of remaining) { const d = (isl.ax - head.x) ** 2 + (isl.ay - head.y) ** 2; if (d < bd) { bd = d; best = isl; } }
    remaining.delete(best!);
    const isl = best!;
    // Walls: outer first on the first layer (adhesion), inner to outer otherwise (quality).
    const order = isl.walls.map((_, k) => k);
    if (!first) order.reverse();
    for (const k of order) {
      if (!isl.walls[k].length) continue;
      b.setType(k === 0 ? T_WALL_OUTER : T_WALL_INNER);
      const loops = new Set(isl.walls[k]);
      while (loops.size) {
        let bl: Loop | undefined, d2 = Infinity;
        for (const l of loops) { const d = (l[0][0] - head.x) ** 2 + (l[0][1] - head.y) ** 2; if (d < d2) { d2 = d; bl = l; } }
        loops.delete(bl!);
        b.loop(bl!, wallFeed);
      }
    }
    if (!isl.infill.length) continue;
    const { solid, sparse } = islandInfill(isl, L, process, coverage);
    if (solid.length) { b.setType(T_SKIN); b.polylines(solid, solidFeed); }
    if (sparse.length) { b.setType(T_FILL); b.polylines(sparse, sparseFeed); }
  }
  return b.buf;
}

/** Solid (top/bottom) and sparse infill polylines of one island. */
function islandInfill(isl: Island, L: LayerGeometry, process: ProcessProfile, coverage: CoverageCache): { solid: number[][]; sparse: number[][] } {
  const w = process.lineWidth;
  const solid: number[][] = [], sparse: number[][] = [];
  const allSolid = process.infillPercent >= 100;
  const solidDir = L.index % 2;
  const minSpan = 0.5 * w;

  const emit = (spans: number[], u: number, dir: number, out: number[][], wave: number) => {
    for (let i = 0; i < spans.length; i += 2) {
      if (spans[i + 1] - spans[i] < minSpan) continue;
      if (wave > 0) out.push(wavyLine(u, spans[i], spans[i + 1], dir, wave, L.index, isl.infill));
      else { const a = fromUV(u, spans[i], dir), c = fromUV(u, spans[i + 1], dir); out.push([a[0], a[1], c[0], c[1]]); }
    }
  };
  const scan = (dir: number, spacing: number, onLine: (u: number, region: number[], clipper: LineClipper) => void) => {
    const clipper = new LineClipper(isl.infill, dir, w);
    if (clipper.empty) return;
    const k0 = Math.ceil((clipper.uMin - spacing / 2) / spacing), k1 = Math.floor((clipper.uMax - spacing / 2) / spacing);
    for (let k = k0; k <= k1; k++) {
      const u = (k + 0.5) * spacing;
      const region = clipper.clip(u);
      if (region.length) onLine(u, region, clipper);
    }
  };

  // Solid infill: dense lines, one direction per layer.
  scan(solidDir, w, (u, region) => {
    if (allSolid) { emit(region, u, solidDir, solid, 0); return; }
    const cov = coverage.covered(L.index, solidDir, u);
    if (cov === null) return;
    emit(spansSubtract(region, cov), u, solidDir, solid, 0);
  });

  // Sparse infill.
  if (!allSolid && process.infillPercent > 0) {
    const spacing = (w * 100) / process.infillPercent;
    const dirs = process.infillPattern === 'grid' ? [0, 1] : [L.index % 2];
    const wave = process.infillPattern === 'gyroidish' ? spacing / 4 : 0;
    for (const dir of dirs) {
      scan(dir, spacing, (u, region) => {
        const cov = coverage.covered(L.index, dir, u);
        emit(cov === null ? region : spansIntersect(region, cov), u, dir, sparse, wave);
      });
    }
  }
  return { solid, sparse };
}

/** Sine-perturbed line for the "gyroidish" pattern; points that would leave the region snap back to the straight line. */
function wavyLine(u: number, v0: number, v1: number, dir: number, amp: number, layer: number, region: Loop[]): number[] {
  const period = amp * 4;
  const steps = Math.max(2, Math.ceil((v1 - v0) / (period / 6)));
  const phase = (layer % 4) * (Math.PI / 2);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = v0 + ((v1 - v0) * i) / steps;
    const taper = Math.min(1, (v - v0) / period, (v1 - v) / period);
    let du = amp * taper * Math.sin((2 * Math.PI * v) / period + phase);
    let p = fromUV(u + du, v, dir);
    if (du !== 0 && !pointInLoops(p[0], p[1], region)) { du = 0; p = fromUV(u, v, dir); }
    out.push(p[0], p[1]);
  }
  return out;
}

/* ----------------------------- Time estimate ----------------------------- */

/** Time for a move of length L: trapezoidal profile with entry/exit speeds and acceleration a. */
function moveTime(L: number, vt: number, vin: number, vout: number, a: number): number {
  if (L <= 0 || vt <= 0) return 0;
  vin = Math.min(vin, vt); vout = Math.min(vout, vt);
  const dAcc = (vt * vt - vin * vin) / (2 * a), dDec = (vt * vt - vout * vout) / (2 * a);
  if (dAcc + dDec <= L) return (vt - vin) / a + (vt - vout) / a + (L - dAcc - dDec) / vt;
  let vp = Math.sqrt((2 * a * L + vin * vin + vout * vout) / 2);
  vp = Math.max(vp, vin, vout);
  return Math.max((vp - vin) / a + (vp - vout) / a, L / vp);
}

/**
 * Estimated seconds for a layer's moves. Consecutive XY moves keep their speed when the
 * direction changes by less than 45 degrees, otherwise the head comes to rest between them.
 */
function estimateTime(buf: MoveBuf, accel: number): number {
  let t = 0;
  // Collect XY moves with their chaining flag.
  const idx: number[] = [], len: number[] = [], dx: number[] = [], dy: number[] = [], chained: boolean[] = [];
  let hx = 0, hy = 0, haveHead = false, broke = true, retracts = 0, curZ = NaN;
  for (let i = 0; i < buf.n; i++) {
    const k = buf.kind[i];
    if (k === K_TRAVEL || k === K_EXTRUDE) {
      const x = buf.x[i], y = buf.y[i];
      if (!haveHead) { hx = x; hy = y; haveHead = true; continue; }
      const L = Math.hypot(x - hx, y - hy);
      if (L < 1e-9) continue;
      const ux = (x - hx) / L, uy = (y - hy) / L;
      let ch = false;
      if (!broke && idx.length) { const j = idx.length - 1; ch = ux * dx[j] + uy * dy[j] > 0.7071; }
      idx.push(i); len.push(L); dx.push(ux); dy.push(uy); chained.push(ch);
      broke = false;
      hx = x; hy = y;
    } else if (k === K_RETRACT || k === K_UNRETRACT) { retracts++; broke = true; }
    else if (k === K_Z) {
      const z = buf.e[i];
      if (!isNaN(curZ)) t += moveTime(Math.abs(z - curZ), buf.f[i], 0, 0, accel);
      curZ = z; broke = true;
    }
  }
  for (let j = 0; j < idx.length; j++) {
    const v = buf.f[idx[j]];
    const vin = chained[j] ? Math.min(v, buf.f[idx[j - 1]]) : 0;
    const vout = j + 1 < idx.length && chained[j + 1] ? Math.min(v, buf.f[idx[j + 1]]) : 0;
    t += moveTime(len[j], v, vin, vout, accel);
  }
  return t + (retracts / 2) * RETRACT_PAIR_SEC;
}

/* ----------------------------- G-code writer ----------------------------- */

function fmt(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s === '-0.000' || s === '-0.00000' ? s.slice(1) : s;
}

function writeGcode(
  input: SliceInput, layers: LayerGeometry[], moves: MoveBuf[], layerTimes: number[],
  bbox: SliceStats['bbox'], filamentArea: number,
): SliceResult {
  const { printer, process } = input;
  const out: string[] = [];
  const totalTime = START_OVERHEAD_SEC + layerTimes.reduce((a, b) => a + b, 0) + END_OVERHEAD_SEC;
  const subst = (s: string) => s
    .replace(/\{bedTemp\}/g, String(process.bedTemp))
    .replace(/\{nozzleTemp\}/g, String(process.nozzleTemp))
    .replace(/\{firstLayerNozzleTemp\}/g, String(process.firstLayerNozzleTemp));

  let filamentMm = 0, travelMm = 0, extrudeMm = 0;
  let e = 0, lastF = -1, hx = NaN, hy = NaN;
  const colorChangeDone = new Set<number>();
  const fanS = Math.round((255 * Math.max(0, Math.min(100, process.fanPercent))) / 100);

  out.push(`;Generated by MetroCAD slicer${input.label ? ` - ${input.label}` : ''}`);
  out.push(`;FLAVOR:${printer.flavor === 'ultimaker' ? 'Griffin' : 'Marlin'}`);
  out.push(`;Printer: ${printer.name}`);
  out.push(`;Layer height: ${process.layerHeight} (first ${process.firstLayerHeight}), line width ${process.lineWidth}, ${process.perimeters} walls, ${process.infillPercent}% ${process.infillPattern} infill`);
  out.push(`;LAYER_COUNT:${layers.length}`);
  out.push(`;TIME:${Math.round(totalTime)}`);
  out.push(`;MINX:${fmt(bbox.min[0], 3)}`, `;MINY:${fmt(bbox.min[1], 3)}`, `;MINZ:${fmt(bbox.min[2], 3)}`);
  out.push(`;MAXX:${fmt(bbox.max[0], 3)}`, `;MAXY:${fmt(bbox.max[1], 3)}`, `;MAXZ:${fmt(bbox.max[2], 3)}`);
  const filamentLineIndex = out.length;
  out.push(''); // placeholder for ;Filament used
  out.push(subst(printer.startGcode));
  out.push('M82 ; absolute extrusion');
  out.push('G90 ; absolute coordinates');
  out.push('M107 ; fan off');
  out.push('M73 P0 R' + Math.ceil(totalTime / 60));
  out.push('G92 E0');

  let elapsed = START_OVERHEAD_SEC;
  for (const L of layers) {
    const buf = moves[L.index];
    out.push(`;LAYER:${L.index}`);
    out.push(`;Z:${fmt(L.z, 3)}`);
    const pct = Math.min(99, Math.floor((100 * elapsed) / totalTime));
    out.push(`M73 P${pct} R${Math.ceil((totalTime - elapsed) / 60)}`);
    if (printer.flavor === 'ultimaker') out.push(`;TIME_ELAPSED:${elapsed.toFixed(1)}`);
    if (printer.layerChangeGcode) out.push(subst(printer.layerChangeGcode));
    out.push('G92 E0'); e = 0;
    if (L.index === 1 && process.nozzleTemp !== process.firstLayerNozzleTemp) out.push(`M104 S${process.nozzleTemp} ; normal nozzle temperature`);
    if (L.index === 2 && fanS > 0) out.push(`M106 S${fanS} ; part cooling fan`);
    let colorChange = false;
    input.objects.forEach((o, i) => {
      if (o.colorChangeAtZ !== undefined && !colorChangeDone.has(i) && L.z > o.colorChangeAtZ) { colorChangeDone.add(i); colorChange = true; }
    });
    if (colorChange) {
      out.push(`M600 ; colour change at Z ${fmt(L.z, 3)}`);
      if (printer.flavor === 'bambu') out.push('M400 U1 ; pause for filament change');
    }

    for (let i = 0; i < buf.n; i++) {
      const k = buf.kind[i];
      const F = Math.round(buf.f[i] * 60);
      const fPart = F !== lastF ? ` F${F}` : '';
      switch (k) {
        case K_TYPE: out.push(`;TYPE:${TYPE_NAMES[buf.aux[i]]}`); break;
        case K_CUSTOM: out.push(buf.custom[buf.aux[i]]); break;
        case K_Z: out.push(`G1 Z${fmt(buf.e[i], 3)}${fPart}`); lastF = F; break;
        case K_RETRACT: case K_UNRETRACT:
          e += buf.e[i];
          out.push(`G1 E${fmt(e, 5)}${fPart}`); lastF = F; break;
        case K_TRAVEL: {
          const x = buf.x[i], y = buf.y[i];
          if (!isNaN(hx)) travelMm += Math.hypot(x - hx, y - hy);
          hx = x; hy = y;
          out.push(`G0 X${fmt(x, 3)} Y${fmt(y, 3)}${fPart}`); lastF = F; break;
        }
        case K_EXTRUDE: {
          const x = buf.x[i], y = buf.y[i];
          if (!isNaN(hx)) extrudeMm += Math.hypot(x - hx, y - hy);
          hx = x; hy = y;
          e += buf.e[i]; filamentMm += buf.e[i];
          out.push(`G1 X${fmt(x, 3)} Y${fmt(y, 3)} E${fmt(e, 5)}${fPart}`); lastF = F; break;
        }
      }
    }
    elapsed += layerTimes[L.index];
  }
  out.push('M107 ; fan off');
  out.push('M73 P100 R0');
  out.push(subst(printer.endGcode));
  out.push(';End of MetroCAD G-code');

  const filamentMm3 = filamentMm * filamentArea;
  const filamentGrams = (filamentMm3 / 1000) * PLA_DENSITY;
  out[filamentLineIndex] = `;Filament used: ${(filamentMm / 1000).toFixed(3)}m (${filamentMm3.toFixed(0)}mm3, ${filamentGrams.toFixed(1)}g)`;

  let gcode = out.join('\n') + '\n';
  if (printer.flavor === 'ultimaker') gcode = griffinHeader(input, totalTime, filamentMm3, bbox) + gcode;

  const stats: SliceStats = {
    layers: layers.length,
    timeSec: totalTime,
    filamentMm, filamentMm3, filamentGrams,
    bbox,
    travelMm, extrudeMm,
    perLayer: layers.map((L) => ({ z: L.z, loops: L.loops.length, islands: L.islands.length, timeSec: layerTimes[L.index] })),
  };
  return { gcode, stats };
}

/** Griffin header block required by Ultimaker S-line firmware; needs the finished print time and material volume. */
function griffinHeader(input: SliceInput, timeSec: number, volumeMm3: number, bbox: SliceStats['bbox']): string {
  const { printer, process } = input;
  const lines = [
    ';START_OF_HEADER',
    ';HEADER_VERSION:0.1',
    ';FLAVOR:Griffin',
    ';GENERATOR.NAME:MetroCAD',
    ';GENERATOR.VERSION:0.1.0',
    `;GENERATOR.BUILD_DATE:${new Date().toISOString().slice(0, 10)}`,
    `;TARGET_MACHINE.NAME:${printer.name}`,
    `;EXTRUDER_TRAIN.0.INITIAL_TEMPERATURE:${process.firstLayerNozzleTemp}`,
    `;EXTRUDER_TRAIN.0.MATERIAL.VOLUME_USED:${Math.ceil(volumeMm3)}`,
    ';EXTRUDER_TRAIN.0.MATERIAL.GUID:506c9f0d-e3aa-4bd4-b2d2-23e2425b1aa9',
    `;EXTRUDER_TRAIN.0.NOZZLE.DIAMETER:${printer.nozzle}`,
    `;EXTRUDER_TRAIN.0.NOZZLE.NAME:AA ${printer.nozzle}`,
    ';BUILD_PLATE.TYPE:glass',
    `;BUILD_PLATE.INITIAL_TEMPERATURE:${process.bedTemp}`,
    `;PRINT.TIME:${Math.ceil(timeSec)}`,
    ';PRINT.GROUPS:1',
    `;PRINT.SIZE.MIN.X:${fmt(bbox.min[0], 3)}`,
    `;PRINT.SIZE.MIN.Y:${fmt(bbox.min[1], 3)}`,
    `;PRINT.SIZE.MIN.Z:${fmt(Math.max(0, bbox.min[2]), 3)}`,
    `;PRINT.SIZE.MAX.X:${fmt(bbox.max[0], 3)}`,
    `;PRINT.SIZE.MAX.Y:${fmt(bbox.max[1], 3)}`,
    `;PRINT.SIZE.MAX.Z:${fmt(bbox.max[2], 3)}`,
    ';END_OF_HEADER',
  ];
  return lines.join('\n') + '\n';
}
