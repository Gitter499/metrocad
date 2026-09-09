import { describe, it, expect, beforeAll } from 'vitest';
import Module from 'manifold-3d';
import type { ManifoldToplevel, CrossSection } from 'manifold-3d';
import { tileFootprint, bridgeIslands } from './tiling.js';

let m: ManifoldToplevel;
beforeAll(async () => { m = await Module(); m.setup(); });

const rect = (x: number, y: number, w: number, h: number): CrossSection => { const s = m.CrossSection.square([w, h], false); const t = s.translate([x, y]); s.delete(); return t; };

describe('outline tiling', () => {
  it('covers an L-shaped strip with few bed-sized, connected pieces', () => {
    // 30 mm wide strips: 700 mm along x, then 500 mm up — an outline base for one bent line.
    const foot = m.CrossSection.union([rect(0, 0, 700, 30), rect(670, 0, 30, 500)]);
    const t = tileFootprint(m, foot, [172, 172]);
    const area = t.pieces.reduce((s, p) => s + p.area, 0);
    expect(Math.abs(area - foot.area())).toBeLessThan(1);
    for (const p of t.pieces) {
      expect(Math.min(p.w, p.h)).toBeLessThanOrEqual(172.01);
      expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(172.01);
      const comps = p.cs.decompose();
      expect(comps.length).toBe(1);
      for (const c of comps) c.delete();
    }
    // 1170 mm of strip on 172 mm cells: 7 pieces if every cell covers a full run, 8 at the corner.
    expect(t.pieces.length).toBeLessThanOrEqual(8);
    expect(t.pieces.length).toBeGreaterThanOrEqual(7);
    expect(new Set(t.pieces.map((p) => p.tag)).size).toBe(t.pieces.length);
    for (const p of t.pieces) p.cs.delete();
    foot.delete();
  });

  it('merges slivers instead of leaving them as separate tiles', () => {
    // A 200 mm square just over one bed: a uniform grid would make 4 pieces (one full, two slivers, one crumb).
    const foot = rect(0, 0, 200, 200);
    const t = tileFootprint(m, foot, [172, 172]);
    expect(t.pieces.length).toBe(4);
    const areas = t.pieces.map((p) => p.area).sort((a, b) => a - b);
    // Balanced halves rather than one big tile and three scraps.
    expect(areas[0]).toBeGreaterThan(200 * 200 * 0.1);
    for (const p of t.pieces) p.cs.delete();
    foot.delete();
  });

  it('bridges islands back to the main body', () => {
    const foot = m.CrossSection.union([rect(0, 0, 300, 30), rect(100, 60, 40, 20)]);
    expect(foot.decompose().length).toBe(2);
    const r = bridgeIslands(m, foot, 8);
    const comps = r.foot.decompose();
    expect(comps.length).toBe(1);
    expect(r.bridges).toBe(1);
    expect(r.islands).toBe(0);
    for (const c of comps) c.delete();
    r.foot.delete(); foot.delete();
  });

  it('leaves far-away islands alone', () => {
    const foot = m.CrossSection.union([rect(0, 0, 300, 30), rect(100, 400, 40, 20)]);
    const r = bridgeIslands(m, foot, 8, 160);
    expect(r.bridges).toBe(0);
    expect(r.islands).toBe(1);
    expect(r.foot).toBe(foot);
    foot.delete();
  });
});
