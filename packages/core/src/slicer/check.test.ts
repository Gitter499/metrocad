import { describe, it, expect } from 'vitest';
import { checkGcode, dryRunGcode, getPrinterProfile, processFor, slicePlate } from './index.js';

const a1 = getPrinterProfile('bambu-a1-mini');

/** A 20 × 20 × 2 mm block as a triangle mesh. */
function block(w = 20, d = 20, h = 2) {
  const v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { positions: new Float32Array(v.flat()), indices: new Uint32Array(f.flat()) };
}

describe('G-code safety check', () => {
  const sliced = slicePlate({ objects: [{ mesh: block(), transform: { rotationDeg: 0, dx: 40, dy: 40, dz: 0 } }], printer: a1, process: processFor(a1), label: 'test' });

  it('passes the built-in slicer output and reads its envelope', () => {
    const r = checkGcode(sliced.gcode, a1, { expected: { min: [40, 40], max: [60, 60], height: 2 } });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.layers).toBe(10);
    expect(r.stats.maxNozzleC).toBe(215);
    expect(r.stats.maxBedC).toBeLessThanOrEqual(80);
    expect(r.stats.envelope!.min[0]).toBeGreaterThan(39);
    expect(r.stats.envelope!.max[0]).toBeLessThan(61);
  });

  it('rejects a toolpath that does not match the plate', () => {
    const r = checkGcode(sliced.gcode, a1, { expected: { min: [100, 100], max: [120, 120], height: 2 } });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/beyond the parts/);
  });

  it('flags moves outside the bed, over-temperature, cold extrusion, forbidden commands and heaters left on', () => {
    const bad = ['G28', 'G90', 'M82', 'M104 S320', 'M140 S110', 'G1 X190 Y10 Z0.2 F3000', 'G1 X10 Y10 E5', ';LAYER:0', 'M104 S0', 'G1 X20 Y20 Z0.2 E10', 'M502', 'M140 S60'].join('\n');
    const r = checkGcode(bad, a1);
    const text = r.errors.join('\n');
    expect(r.ok).toBe(false);
    expect(text).toMatch(/leaves the 180 × 180 mm bed/);
    expect(text).toMatch(/nozzle target 320/);
    expect(text).toMatch(/bed target 110/);
    expect(text).toMatch(/extruding with the nozzle target at 0/);
    expect(text).toMatch(/M502/);
    expect(text).toMatch(/bed target at 60/);
  });

  it('requires homing before the first move', () => {
    const r = checkGcode(['G90', 'M104 S215', 'G1 X10 Y10 Z5 F3000', 'M104 S0'].join('\n'), a1);
    expect(r.errors.join('\n')).toMatch(/before homing/);
  });

  it('understands Griffin headers for Ultimaker files', () => {
    const s3 = getPrinterProfile('ultimaker-s3');
    const g = slicePlate({ objects: [{ mesh: block(), transform: { rotationDeg: 0, dx: 40, dy: 40, dz: 0 } }], printer: s3, process: processFor(s3) });
    const r = checkGcode(g.gcode, s3, { expected: { min: [40, 40], max: [60, 60], height: 2 } });
    expect(r.errors).toEqual([]);
    expect(r.stats.maxNozzleC).toBeGreaterThan(150);
  });

  it('dry run has no extrusion, no heat, no waits, and is lifted', () => {
    const d = dryRunGcode(sliced.gcode, { lift: 20 });
    expect(d).not.toMatch(/^G[01] [^;\n]*E-?\d/m);
    expect(d).not.toMatch(/^M109/m);
    expect(d).not.toMatch(/^M190/m);
    expect(d).not.toMatch(/^M104 S[1-9]/m);
    expect(d).not.toMatch(/^M400 U1/m);
    // Every absolute-mode Z is lifted (the end G-code's relative "G1 Z10" lift is left alone).
    let abs = true; const zs: number[] = [];
    for (const line of d.split('\n')) { if (/^G90/.test(line)) abs = true; if (/^G91/.test(line)) abs = false; const m = /^G[01] [^;]*Z(-?\d+\.?\d*)/.exec(line); if (m && abs) zs.push(parseFloat(m[1])); }
    expect(zs.length).toBeGreaterThan(5);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(20);
    // Still a valid, safe file for the checker (apart from printing nothing).
    const r = checkGcode(d, a1);
    expect(r.errors.filter((e) => !/extrudes no filament/.test(e))).toEqual([]);
  });
});
