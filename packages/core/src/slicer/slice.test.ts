import { describe, it, expect, beforeAll } from 'vitest';
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import { slicePlate } from './slice.js';
import { getPrinterProfile, processFor } from './profiles.js';
import type { MeshData } from '../types.js';

let wasm: ManifoldToplevel;
beforeAll(async () => { wasm = await Module(); wasm.setup(); });

function meshOf(m: any): MeshData { const g = m.getMesh(); return { positions: new Float32Array(g.vertProperties), indices: new Uint32Array(g.triVerts) }; }

describe('slicePlate', () => {
  it('slices a box into layers of valid G-code within the bed', () => {
    const box = wasm.Manifold.cube([20, 20, 4], false);
    const printer = getPrinterProfile('bambu-a1-mini');
    const t0 = performance.now();
    const res = slicePlate({ objects: [{ mesh: meshOf(box), transform: { rotationDeg: 0, dx: 50, dy: 50, dz: 0 } }], printer, process: processFor(printer) }, wasm);
    const ms = performance.now() - t0;
    expect(res.stats.layers).toBe(20);
    expect(res.gcode).toContain(';LAYER:0');
    expect(res.gcode).toContain('M82');
    expect(res.stats.timeSec).toBeGreaterThan(60);
    expect(res.stats.filamentGrams).toBeGreaterThan(0.3);
    expect(res.stats.filamentGrams).toBeLessThan(3);
    for (const line of res.gcode.split('\n')) {
      const m = /^G[01] .*?X([\d.-]+).*?Y([\d.-]+)/.exec(line);
      if (!m) continue;
      expect(Number(m[1])).toBeGreaterThanOrEqual(0); expect(Number(m[1])).toBeLessThanOrEqual(180);
      expect(Number(m[2])).toBeGreaterThanOrEqual(0); expect(Number(m[2])).toBeLessThanOrEqual(180);
    }
    expect(ms).toBeLessThan(5000);
  });
  it('handles holes and colour changes', () => {
    const outer = wasm.CrossSection.square([30, 30], true);
    const hole = wasm.CrossSection.circle(5);
    const ring = outer.subtract(hole).extrude(3);
    const printer = getPrinterProfile('bambu-p1s');
    const res = slicePlate({ objects: [{ mesh: meshOf(ring), transform: { rotationDeg: 45, dx: 100, dy: 100, dz: 0 }, colorChangeAtZ: 1.0 }], printer, process: processFor(printer) }, wasm);
    expect(res.stats.layers).toBe(15);
    expect(res.gcode).toContain('M600');
    // inner + outer perimeters -> at least 4 wall loops per layer worth of WALL comments
    expect((res.gcode.match(/;TYPE:WALL-OUTER/g) ?? []).length).toBeGreaterThanOrEqual(15);
    expect(res.gcode).toContain(';TYPE:WALL-INNER');
  });
  it('emits the Griffin header for Ultimaker', () => {
    const box = wasm.Manifold.cube([10, 10, 2], false);
    const printer = getPrinterProfile('ultimaker-s3');
    const res = slicePlate({ objects: [{ mesh: meshOf(box), transform: { rotationDeg: 0, dx: 20, dy: 20, dz: 0 } }], printer, process: processFor(printer) }, wasm);
    expect(res.gcode.startsWith(';START_OF_HEADER')).toBe(true);
    expect(res.gcode).toContain('FLAVOR:Griffin');
    expect(res.gcode).toContain('PRINT.TIME');
  });
});
