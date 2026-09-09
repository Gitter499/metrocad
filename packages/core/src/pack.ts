/**
 * Tight, shape-aware plate packing.
 * Each item is rasterised (top-down footprint) into a bitmask at `cell` mm resolution, dilated by the
 * part gap, and placed bottom-left-first on the first plate of its colour where it fits, trying
 * 0/45/90/135° rotations. Tiles get their own plate.
 */
import type { DesignParams, Part, Plate, PlateItem } from './types.js';
import { zLevels } from './geometry.js';

export interface PackOptions {
  /** Minimum gap between parts on a plate (mm). */
  partGap?: number;
  /** Raster resolution (mm). */
  cell?: number;
  rotations?: number[];
  /** Restrict to a bed size other than params.bed (e.g. the smallest printer in a farm). */
  bed?: { x: number; y: number };
  onProgress?: (fraction: number) => void;
}

interface Item { id: string; parts: Part[]; area: number; volume: number; footprintParts: Part[] }

interface Mask { rows: Uint32Array[]; w: number; h: number; rotation: number; minX: number; minY: number }

interface OpenPlate { plate: Plate; grid: Uint32Array; wCells: number; hCells: number; words: number }

export function packPlates(parts: Part[], params: DesignParams, opts: PackOptions = {}): Plate[] {
  const gap = opts.partGap ?? 2.5;
  const cell = opts.cell ?? 1.25;
  const rotations = opts.rotations ?? [0, 90, 45, 135];
  const bed = opts.bed ?? params.bed;
  const margin = params.bedMargin;
  const usable = { x: bed.x - 2 * margin, y: bed.y - 2 * margin };
  const wCells = Math.floor(usable.x / cell), hCells = Math.floor(usable.y / cell);
  const words = Math.ceil(wCells / 32);
  const dil = Math.max(1, Math.ceil(gap / cell / 2)); // dilate every item by half the gap on each side
  const z = zLevels(params);
  const plates: Plate[] = [];

  // Tiles: a full-bed tile gets its own plate; smaller (outline) tiles are packed together like any other part.
  const tileParts = parts.filter((p) => p.kind === 'tile');
  const smallTiles: Part[] = [];
  for (const t of tileParts) {
    const w = t.bbox.max[0] - t.bbox.min[0], h = t.bbox.max[1] - t.bbox.min[1];
    const packable = (w + gap <= usable.x && h + gap <= usable.y) || (w + gap <= usable.y && h + gap <= usable.x);
    if (packable && tileParts.length > 1) { smallTiles.push(t); continue; }
    const rot = w <= usable.x && h <= usable.y ? 0 : 90;
    const dx = rot ? margin + t.bbox.max[1] : margin - t.bbox.min[0];
    const dy = rot ? margin - t.bbox.min[0] : margin - t.bbox.min[1];
    plates.push({ id: `plate-${plates.length + 1}`, name: t.name, color: t.color, colorName: t.colorName, bed, items: [{ partId: t.id, x: margin, y: margin, rotation: rot, dx, dy }], fill: (w * h) / (bed.x * bed.y), volumeMm3: t.volumeMm3 });
  }

  // Colour groups
  const groups = new Map<string, { color: string; colorName: string; colorChange?: Plate['colorChange']; items: Item[] }>();
  const labelGroups = new Map<string, Part[]>();
  if (smallTiles.length) groups.set('base', { color: smallTiles[0].color, colorName: smallTiles[0].colorName, items: smallTiles.map((t) => itemOf(t.id, [t], [t])) });
  for (const p of parts) {
    if (p.kind === 'tile' || p.kind === 'tape' || p.kind === 'tapeText') continue;
    if (p.group) { const g = labelGroups.get(p.group) ?? []; g.push(p); labelGroups.set(p.group, g); continue; }
    const k = `${p.color}|${p.colorName}`;
    const g = groups.get(k) ?? { color: p.color, colorName: p.colorName, items: [] };
    g.items.push(itemOf(p.id, [p], [p]));
    groups.set(k, g);
  }
  if (labelGroups.size) {
    const first = [...labelGroups.values()][0];
    const plate = first.find((p) => p.kind === 'labelPlate') ?? first[0];
    const text = first.find((p) => p.kind === 'labelText') ?? first[0];
    const g = { color: plate.color, colorName: 'Labels', colorChange: { color: text.color, colorName: text.colorName, atZ: z.baseTop - z.labelPocketFloor }, items: [] as Item[] };
    for (const [id, ps] of labelGroups) g.items.push(itemOf(id, ps, ps.filter((p) => p.kind === 'labelPlate')));
    groups.set('labels', g);
  }

  const totalItems = [...groups.values()].reduce((s, g) => s + g.items.length, 0);
  let done = 0;
  for (const g of groups.values()) {
    const open: OpenPlate[] = [];
    currentOpen = open;
    const items = [...g.items].sort((a, b) => b.area - a.area);
    for (const it of items) {
      const rots = it.parts[0]?.kind === 'tile' ? rotations.filter((r) => r % 90 === 0) : rotations;
      const masks = rots.map((r) => rasterize(it.footprintParts, r, cell, dil)).filter((m) => m.w <= wCells && m.h <= hCells);
      if (!masks.length) {
        // Cannot fit on the bed at any rotation: put it alone on a plate flagged over-full.
        const m = rasterize(it.footprintParts, 0, cell, dil);
        const p = newPlate(g);
        p.plate.items.push(placement(it, m, 0, 0, margin, cell));
        p.plate.fill = 2; p.plate.volumeMm3 += it.volume;
        done++;
        continue;
      }
      let placed = false;
      for (const op of open) {
        const pos = findSpot(op, masks);
        if (pos) { commit(op, it, pos, margin, cell); placed = true; break; }
      }
      if (!placed) {
        const op = newPlate(g);
        const pos = findSpot(op, masks);
        if (pos) commit(op, it, pos, margin, cell);
        else { op.plate.items.push(placement(it, masks[0], 0, 0, margin, cell)); op.plate.fill = 2; }
      }
      done++;
      if (done % 20 === 0) opts.onProgress?.(done / totalItems);
    }
  }
  // Names
  const counts = new Map<string, number>();
  const partById = new Map(parts.map((q) => [q.id, q]));
  for (const p of plates) {
    const tilesOn = p.items.map((it) => partById.get(it.partId)).filter((q): q is Part => !!q && q.kind === 'tile');
    if (tilesOn.length === p.items.length && tilesOn.length) { p.name = tilesOn.length === 1 ? tilesOn[0].name : `Base tiles ${tilesOn.map((q) => q.tag ?? q.id).join(' ')}`; continue; }
    const n = (counts.get(p.colorName) ?? 0) + 1; counts.set(p.colorName, n);
    p.name = `${p.colorName} plate ${n}`;
  }
  for (const p of plates) { const total = counts.get(p.colorName) ?? 0; if (total > 1 && /plate \d+$/.test(p.name)) p.name = `${p.name} of ${total}`; }
  opts.onProgress?.(1);
  return plates;

  function newPlate(g: { color: string; colorName: string; colorChange?: Plate['colorChange'] }): OpenPlate {
    const plate: Plate = { id: `plate-${plates.length + 1}`, name: g.colorName, color: g.color, colorName: g.colorName, colorChange: g.colorChange, bed, items: [], fill: 0, volumeMm3: 0 };
    plates.push(plate);
    const op: OpenPlate = { plate, grid: new Uint32Array(hCells * words), wCells, hCells, words };
    // (open plates list lives in the caller's closure)
    openListPush(op);
    return op;
  }
  function openListPush(op: OpenPlate) { currentOpen.push(op); }
  function commit(op: OpenPlate, it: Item, pos: { mask: Mask; x: number; y: number }, margin: number, cell: number) {
    stamp(op, pos.mask, pos.x, pos.y);
    op.plate.items.push(placement(it, pos.mask, pos.x, pos.y, margin, cell));
    op.plate.fill += it.area / (bed.x * bed.y);
    op.plate.volumeMm3 += it.volume;
  }
  // `open` is per group; expose via a mutable reference the helpers can reach.
  var currentOpen: OpenPlate[] = [];
  function itemOf(id: string, ps: Part[], footprintParts: Part[]): Item {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, vol = 0;
    for (const p of ps) { minx = Math.min(minx, p.bbox.min[0]); miny = Math.min(miny, p.bbox.min[1]); maxx = Math.max(maxx, p.bbox.max[0]); maxy = Math.max(maxy, p.bbox.max[1]); vol += p.volumeMm3; }
    return { id, parts: ps, area: (maxx - minx) * (maxy - miny), volume: vol, footprintParts };
  }
}

function placement(it: Item, m: Mask, x: number, y: number, margin: number, cell: number): PlateItem {
  const px = margin + x * cell, py = margin + y * cell;
  return { partId: it.id, x: px, y: py, rotation: m.rotation, dx: px - m.minX, dy: py - m.minY };
}

/** Rasterise the XY footprint of parts rotated by `rot` degrees (about the origin) into a dilated bitmask. */
function rasterize(ps: Part[], rot: number, cell: number, dil: number): Mask {
  const t = (rot * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rotated: Float32Array[] = [];
  for (const p of ps) {
    const P = p.mesh.positions, n = P.length / 3;
    const R = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1];
      const rx = x * c - y * s, ry = x * s + y * c;
      R[i * 2] = rx; R[i * 2 + 1] = ry;
      if (rx < minX) minX = rx; if (ry < minY) minY = ry; if (rx > maxX) maxX = rx; if (ry > maxY) maxY = ry;
    }
    rotated.push(R);
  }
  // Grid covers [minX - dil*cell, maxX + dil*cell]
  const ox = minX - dil * cell, oy = minY - dil * cell;
  const w = Math.ceil((maxX - minX) / cell) + 2 * dil + 1, h = Math.ceil((maxY - minY) / cell) + 2 * dil + 1;
  const cov = new Uint8Array(w * h);
  ps.forEach((p, pi) => {
    const R = rotated[pi], I = p.mesh.indices;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], q = I[k + 2];
      fillTriangle(cov, w, h, (R[a * 2] - ox) / cell, (R[a * 2 + 1] - oy) / cell, (R[b * 2] - ox) / cell, (R[b * 2 + 1] - oy) / cell, (R[q * 2] - ox) / cell, (R[q * 2 + 1] - oy) / cell);
    }
  });
  // Dilate (square structuring element)
  const dl = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!cov[y * w + x]) continue;
    for (let yy = Math.max(0, y - dil); yy <= Math.min(h - 1, y + dil); yy++) for (let xx = Math.max(0, x - dil); xx <= Math.min(w - 1, x + dil); xx++) dl[yy * w + xx] = 1;
  }
  // Trim empty border rows/cols
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dl[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { x0 = 0; x1 = 0; y0 = 0; y1 = 0; }
  const mw = x1 - x0 + 1, mh = y1 - y0 + 1;
  const rows: Uint32Array[] = [];
  const words = Math.ceil(mw / 32);
  for (let y = 0; y < mh; y++) {
    const row = new Uint32Array(words);
    for (let x = 0; x < mw; x++) if (dl[(y + y0) * w + (x + x0)]) row[x >>> 5] |= 1 << (x & 31);
    rows.push(row);
  }
  // The mask's cell (0,0) corresponds to world (ox + x0*cell, oy + y0*cell); the item's bbox-min after rotation is
  // minX/minY, which sits dil cells inside the mask origin. Report the world position of mask cell (0,0).
  return { rows, w: mw, h: mh, rotation: rot, minX: ox + x0 * cell, minY: oy + y0 * cell };
}

/** Conservative triangle rasterisation: marks every cell the triangle touches (edges + interior). */
function fillTriangle(cov: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
  const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(w - 1, Math.floor(Math.max(x0, x1, x2)));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(h - 1, Math.floor(Math.max(y0, y1, y2)));
  if (maxx - minx <= 1 && maxy - miny <= 1) { for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) cov[y * w + x] = 1; return; }
  // Sample cell centres + a conservative border: a cell is covered if its centre is inside or an edge passes through it.
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    if (pointInTri(cx, cy, x0, y0, x1, y1, x2, y2) || edgeHitsCell(x, y, x0, y0, x1, y1) || edgeHitsCell(x, y, x1, y1, x2, y2) || edgeHitsCell(x, y, x2, y2, x0, y0)) cov[y * w + x] = 1;
  }
}
function pointInTri(px: number, py: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const d1 = (px - x1) * (y0 - y1) - (x0 - x1) * (py - y1);
  const d2 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d3 = (px - x0) * (y2 - y0) - (x2 - x0) * (py - y0);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function edgeHitsCell(cx: number, cy: number, x0: number, y0: number, x1: number, y1: number): boolean {
  // Liang–Barsky clip of the segment against the cell square
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy], q = [x0 - cx, cx + 1 - x0, y0 - cy, cy + 1 - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}

function findSpot(op: OpenPlate, masks: Mask[]): { mask: Mask; x: number; y: number } | undefined {
  let best: { mask: Mask; x: number; y: number; score: number } | undefined;
  for (const m of masks) {
    const shifted = shiftedMasks(m, op.words);
    outer: for (let y = 0; y + m.h <= op.hCells; y++) {
      for (let x = 0; x + m.w <= op.wCells; x++) {
        const score = y * op.wCells + x;
        if (best && score >= best.score) break outer;
        if (fits(op, shifted[x & 31], x >>> 5, y, m.h)) { best = { mask: m, x, y, score }; break outer; }
      }
    }
  }
  return best;
}

const shiftCache = new WeakMap<Mask, Uint32Array[][]>();
function shiftedMasks(m: Mask, plateWords: number): Uint32Array[][] {
  let all = shiftCache.get(m);
  if (all) return all;
  all = [];
  const words = Math.min(plateWords, Math.ceil((m.w + 31) / 32) + 1);
  for (let s = 0; s < 32; s++) {
    const rows: Uint32Array[] = [];
    for (const row of m.rows) {
      const out = new Uint32Array(words);
      for (let wi = 0; wi < row.length; wi++) {
        const v = row[wi];
        if (!v) continue;
        out[wi] |= (v << s) >>> 0;
        if (s && wi + 1 < words) out[wi + 1] |= v >>> (32 - s);
      }
      rows.push(out);
    }
    all.push(rows);
  }
  shiftCache.set(m, all);
  return all;
}

function fits(op: OpenPlate, rows: Uint32Array[], wordOff: number, y: number, h: number): boolean {
  const g = op.grid, W = op.words;
  for (let r = 0; r < h; r++) {
    const row = rows[r];
    const base = (y + r) * W + wordOff;
    for (let w = 0; w < row.length; w++) {
      if (wordOff + w >= W) { if (row[w]) return false; continue; }
      if (g[base + w] & row[w]) return false;
    }
  }
  return true;
}

function stamp(op: OpenPlate, m: Mask, x: number, y: number) {
  const rows = shiftedMasks(m, op.words)[x & 31];
  const wordOff = x >>> 5, W = op.words;
  for (let r = 0; r < m.h; r++) {
    const row = rows[r];
    const base = (y + r) * W + wordOff;
    for (let w = 0; w < row.length && wordOff + w < W; w++) op.grid[base + w] |= row[w];
  }
}

/** Rigid transform for a part on its plate: rotate about the origin, then translate (dx, dy), and drop to z=0. */
export function placementTransform(item: PlateItem, partMinZ: number): { rotationDeg: number; dx: number; dy: number; dz: number } {
  return { rotationDeg: item.rotation, dx: item.dx, dy: item.dy, dz: -partMinZ };
}

/** Parts that belong to an item id (a part id or a label group id), with their combined bbox. */
export function itemBBox(parts: Part[], itemId: string): { min: number[]; max: number[]; parts: Part[] } {
  const ps = parts.filter((p) => p.id === itemId || p.group === itemId);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of ps) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.bbox.min[a]); max[a] = Math.max(max[a], p.bbox.max[a]); }
  return { min, max, parts: ps };
}
