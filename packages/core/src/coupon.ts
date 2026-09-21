/**
 * Test coupon: a small plate cut from the real geometry, so a 15-minute print verifies the printer,
 * the G-code path and every fit (groove, station hole, label pocket, snap lugs) before committing to
 * the full map. It takes the shortest line piece that carries a station, cuts the base tile(s) to a box
 * around it, and adds that piece, its dots and any label plate that sits fully inside the box.
 */
import type { ManifoldToplevel } from 'manifold-3d';
import type { FullBuildResult } from './pipeline.js';
import type { Part, Plate, PlateItem } from './types.js';
import { zLevels } from './geometry.js';

export interface TestCoupon {
  /** Parts on the coupon: cut tile piece(s) plus the original line piece, dots and labels. */
  parts: Part[];
  plate: Plate;
  /** Which real pieces the coupon exercises. */
  description: string;
}

export function buildTestCoupon(r: FullBuildResult, m: ManifoldToplevel): TestCoupon | undefined {
  const tiles = r.parts.filter((p) => p.kind === 'tile');
  if (!tiles.length) return undefined;
  const lines = r.parts.filter((p) => p.kind === 'line');
  if (!lines.length) return undefined;
  const size = (p: Part) => Math.max(p.bbox.max[0] - p.bbox.min[0], p.bbox.max[1] - p.bbox.min[1]);
  const dotsIn = (p: Part) => r.parts.filter((d) => d.kind === 'dot' && (d.bbox.min[0] + d.bbox.max[0]) / 2 > p.bbox.min[0] && (d.bbox.min[0] + d.bbox.max[0]) / 2 < p.bbox.max[0] && (d.bbox.min[1] + d.bbox.max[1]) / 2 > p.bbox.min[1] && (d.bbox.min[1] + d.bbox.max[1]) / 2 < p.bbox.max[1]);
  const margin = Math.max(8, r.params.baseMargin);
  // The coupon box around a piece: the piece plus margin, at most 90 mm a side, centred on the piece.
  const boxFor = (p: Part) => {
    const b = { min: [p.bbox.min[0] - margin, p.bbox.min[1] - margin] as [number, number], max: [p.bbox.max[0] + margin, p.bbox.max[1] + margin] as [number, number] };
    for (let a = 0; a < 2; a++) { const c = (b.min[a] + b.max[a]) / 2; b.min[a] = Math.max(b.min[a], c - 45); b.max[a] = Math.min(b.max[a], c + 45); }
    return b;
  };
  const labelPlates = r.parts.filter((p) => p.kind === 'labelPlate');
  const labelsIn = (b: { min: [number, number]; max: [number, number] }) => labelPlates.filter((l) => l.bbox.min[0] >= b.min[0] - 0.2 && l.bbox.min[1] >= b.min[1] - 0.2 && l.bbox.max[0] <= b.max[0] + 0.2 && l.bbox.max[1] <= b.max[1] + 0.2).length;
  // Prefer a piece with a station hole (dot fit) and a label pocket in reach, around 55 mm long.
  const ranked = lines
    .map((p) => ({ p, len: size(p), thru: dotsIn(p).length, labels: labelsIn(boxFor(p)) }))
    .filter((c) => c.len >= 20)
    .sort((a, b) => (b.thru > 0 ? 1 : 0) - (a.thru > 0 ? 1 : 0) || (b.labels > 0 ? 1 : 0) - (a.labels > 0 ? 1 : 0) || Math.abs(a.len - 55) - Math.abs(b.len - 55));
  const pick = ranked[0]?.p ?? lines[0];
  const box = boxFor(pick);

  const inside = (p: Part, slack = 0.5) => p.bbox.min[0] >= box.min[0] - slack && p.bbox.min[1] >= box.min[1] - slack && p.bbox.max[0] <= box.max[0] + slack && p.bbox.max[1] <= box.max[1] + slack;
  const overlaps = (p: Part) => p.bbox.min[0] < box.max[0] && p.bbox.max[0] > box.min[0] && p.bbox.min[1] < box.max[1] && p.bbox.max[1] > box.min[1];

  const parts: Part[] = [];
  const { Manifold, Mesh } = m;
  const cutter = Manifold.cube([box.max[0] - box.min[0], box.max[1] - box.min[1], 30], false).translate([box.min[0], box.min[1], -10]);
  for (const t of tiles) {
    if (!overlaps(t)) continue;
    const src = new Manifold(new Mesh({ numProp: 3, vertProperties: t.mesh.positions, triVerts: t.mesh.indices }));
    const piece = src.intersect(cutter); src.delete();
    if (piece.isEmpty() || piece.volume() < 50) { piece.delete(); continue; }
    const mesh = piece.getMesh();
    const bb = piece.boundingBox();
    parts.push({
      id: `coupon-${t.id}`, name: `Coupon: ${t.name} (cut)`, kind: 'tile', color: t.color, colorName: t.colorName, tag: `C-${t.tag ?? t.id}`,
      mesh: { positions: new Float32Array(mesh.vertProperties), indices: new Uint32Array(mesh.triVerts) },
      bbox: { min: [bb.min[0], bb.min[1], bb.min[2]], max: [bb.max[0], bb.max[1], bb.max[2]] },
      volumeMm3: piece.volume(), triangles: mesh.triVerts.length / 3, printZ: -bb.min[2],
    });
    piece.delete();
  }
  cutter.delete();
  if (!parts.length) return undefined;

  parts.push(pick);
  const labelGroups = new Set<string>();
  // Dots for the holes in this piece (they are all identical, so at most two).
  for (const d of dotsIn(pick).slice(0, 2)) parts.push(d);
  if (!parts.some((p) => p.kind === 'dot')) { const d = r.parts.find((p) => p.kind === 'dot'); if (d) parts.push(d); }
  for (const p of r.parts) {
    if (p.kind === 'tile' || p.kind === 'tape' || p.kind === 'tapeText' || p.kind === 'dot' || p.kind === 'line') continue;
    if ((p.kind === 'ring' || p.kind === 'plug') && inside(p, 0.2)) { parts.push(p); continue; }
    if ((p.kind === 'labelPlate' || p.kind === 'labelText') && p.group && inside(p, 0.2) && labelGroups.size < 2) labelGroups.add(p.group);
  }
  for (const g of labelGroups) for (const p of r.parts) if (p.group === g) parts.push(p);

  // Lay the parts out in a row with 4 mm gaps.
  const gap = 4, margin2 = r.params.bedMargin;
  const items: PlateItem[] = [];
  let cx = margin2, rowH = 0, cy = margin2;
  const placed = new Set<string>();
  const z = zLevels(r.params);
  let colorChange: Plate['colorChange'];
  for (const p of parts) {
    const key = p.group ?? p.id;
    if (placed.has(key)) continue;
    placed.add(key);
    const group = parts.filter((q) => (q.group ?? q.id) === key);
    const min = [Math.min(...group.map((q) => q.bbox.min[0])), Math.min(...group.map((q) => q.bbox.min[1])), Math.min(...group.map((q) => q.bbox.min[2]))];
    const max = [Math.max(...group.map((q) => q.bbox.max[0])), Math.max(...group.map((q) => q.bbox.max[1]))];
    const w = max[0] - min[0], h = max[1] - min[1];
    if (cx + w > r.params.bed.x - margin2 && cx > margin2) { cx = margin2; cy += rowH + gap; rowH = 0; }
    items.push({ partId: key, x: cx, y: cy, rotation: 0, dx: cx - min[0], dy: cy - min[1] });
    if (group.some((q) => q.kind === 'labelText')) colorChange = { color: group.find((q) => q.kind === 'labelText')!.color, colorName: 'Label text', atZ: z.baseTop - z.labelPocketFloor };
    cx += w + gap; rowH = Math.max(rowH, h);
  }
  const plate: Plate = { id: 'plate-coupon', name: 'Test coupon', color: parts[0].color, colorName: 'Base', bed: r.params.bed, items, fill: 0, volumeMm3: parts.reduce((s, p) => s + p.volumeMm3, 0), colorChange };
  const what = [`${parts.filter((p) => p.kind === 'tile').length} tile piece(s) cut around line piece ${pick.tag ?? pick.id}`, `${parts.filter((p) => p.kind === 'dot').length} dot(s)`];
  const rings = parts.filter((p) => p.kind === 'ring').length; if (rings) what.push(`${rings} interchange ring(s) + plug(s)`);
  if (labelGroups.size) what.push(`${labelGroups.size} label(s)`);
  return { parts, plate, description: what.join(', ') };
}
