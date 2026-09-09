/** Group parts by colour and pack them onto print plates (shelf packing with 90° rotation). */
import type { DesignParams, Part, Plate, PlateItem } from './types.js';
import { zLevels } from './geometry.js';

export interface PackOptions {
  /** Gap between parts on a plate (mm). */
  partGap?: number;
}

interface Item { id: string; parts: Part[]; w: number; h: number; volume: number }

export function packPlates(parts: Part[], params: DesignParams, opts: PackOptions = {}): Plate[] {
  const gap = opts.partGap ?? 4;
  const usable = { x: params.bed.x - 2 * params.bedMargin, y: params.bed.y - 2 * params.bedMargin };
  const z = zLevels(params);
  const plates: Plate[] = [];

  // 1. Tiles: one per plate.
  for (const t of parts.filter((p) => p.kind === 'tile')) {
    const w = t.bbox.max[0] - t.bbox.min[0], h = t.bbox.max[1] - t.bbox.min[1];
    const rot = w <= usable.x && h <= usable.y ? 0 : 90;
    plates.push({ id: `plate-${plates.length + 1}`, name: `${t.name}`, color: t.color, colorName: t.colorName, bed: params.bed, items: [{ partId: t.id, x: params.bedMargin, y: params.bedMargin, rotation: rot }], fill: (w * h) / (params.bed.x * params.bed.y), volumeMm3: t.volumeMm3 });
  }

  // 2. Everything else grouped by colour; label plate+text form one two-colour group.
  const groups = new Map<string, { color: string; colorName: string; colorChange?: Plate['colorChange']; items: Item[] }>();
  const labelGroups = new Map<string, Part[]>();
  for (const p of parts) {
    if (p.kind === 'tile') continue;
    if (p.group) { const g = labelGroups.get(p.group) ?? []; g.push(p); labelGroups.set(p.group, g); continue; }
    const k = `${p.color}|${p.colorName}`;
    const g = groups.get(k) ?? { color: p.color, colorName: p.colorName, items: [] };
    g.items.push(itemOf(p.id, [p]));
    groups.set(k, g);
  }
  if (labelGroups.size) {
    const first = [...labelGroups.values()][0];
    const plate = first.find((p) => p.kind === 'labelPlate') ?? first[0];
    const text = first.find((p) => p.kind === 'labelText') ?? first[0];
    const g = { color: plate.color, colorName: 'Labels', colorChange: { color: text.color, colorName: text.colorName, atZ: z.baseTop - z.labelPocketFloor }, items: [] as Item[] };
    for (const [id, ps] of labelGroups) g.items.push(itemOf(id, ps));
    groups.set('labels', g);
  }

  for (const g of groups.values()) {
    // sort by height desc (after orienting each item so its longer side is horizontal)
    const items = g.items.map((it) => ({ ...it, rot: it.w >= it.h ? 0 : 90 }));
    items.forEach((it) => { if (it.rot === 90) { const t = it.w; it.w = it.h; it.h = t; } });
    items.sort((a, b) => b.h - a.h || b.w - a.w);
    let current: { plate: Plate; x: number; y: number; rowH: number } | undefined;
    const newPlate = () => {
      const plate: Plate = { id: `plate-${plates.length + 1}`, name: `${g.colorName} ${g.items.length > 1 ? '' : ''}`.trim(), color: g.color, colorName: g.colorName, colorChange: g.colorChange, bed: params.bed, items: [], fill: 0, volumeMm3: 0 };
      plates.push(plate);
      current = { plate, x: params.bedMargin, y: params.bedMargin, rowH: 0 };
      return current;
    };
    for (const it of items) {
      if (it.w > usable.x || it.h > usable.y) {
        // Try the other orientation, else it simply doesn't fit (reported via fill>1 later).
        if (it.h <= usable.x && it.w <= usable.y) { const t = it.w; it.w = it.h; it.h = t; it.rot = it.rot === 0 ? 90 : 0; }
      }
      if (!current) newPlate();
      let c = current!;
      if (c.x + it.w > params.bedMargin + usable.x) { // next row
        c.x = params.bedMargin; c.y += c.rowH + gap; c.rowH = 0;
      }
      if (c.y + it.h > params.bedMargin + usable.y) { c = newPlate(); }
      const item: PlateItem = { partId: it.id, x: c.x, y: c.y, rotation: it.rot };
      c.plate.items.push(item);
      c.plate.fill += (it.w * it.h) / (params.bed.x * params.bed.y);
      c.plate.volumeMm3 += it.volume;
      c.x += it.w + gap;
      c.rowH = Math.max(c.rowH, it.h);
    }
    current = undefined;
  }
  // Number plate names
  const counts = new Map<string, number>();
  for (const p of plates) {
    if (p.items.length === 1 && parts.find((q) => q.id === p.items[0].partId)?.kind === 'tile') continue;
    const n = (counts.get(p.colorName) ?? 0) + 1; counts.set(p.colorName, n);
    p.name = `${p.colorName} plate ${n}`;
  }
  for (const p of plates) { const total = counts.get(p.colorName) ?? 0; if (total > 1) p.name = `${p.colorName} plate ${p.name.split(' ').pop()} of ${total}`; }
  return plates;

  function itemOf(id: string, ps: Part[]): Item {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, vol = 0;
    for (const p of ps) { minx = Math.min(minx, p.bbox.min[0]); miny = Math.min(miny, p.bbox.min[1]); maxx = Math.max(maxx, p.bbox.max[0]); maxy = Math.max(maxy, p.bbox.max[1]); vol += p.volumeMm3; }
    return { id, parts: ps, w: maxx - minx, h: maxy - miny, volume: vol };
  }
}

/** Rigid transform placing a part (or a label group member) on its plate: rotate about origin, then translate. */
export function placementTransform(groupBBox: { min: number[]; max: number[] }, item: PlateItem, partMinZ: number): { rotationDeg: number; dx: number; dy: number; dz: number } {
  if (item.rotation === 90) return { rotationDeg: 90, dx: item.x + groupBBox.max[1], dy: item.y - groupBBox.min[0], dz: -partMinZ };
  return { rotationDeg: 0, dx: item.x - groupBBox.min[0], dy: item.y - groupBBox.min[1], dz: -partMinZ };
}

/** Bounding box of all parts sharing an item id (a part id or a label group id). */
export function itemBBox(parts: Part[], itemId: string): { min: number[]; max: number[]; parts: Part[] } {
  const ps = parts.filter((p) => p.id === itemId || p.group === itemId);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of ps) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.bbox.min[a]); max[a] = Math.max(max[a], p.bbox.max[a]); }
  return { min, max, parts: ps };
}
