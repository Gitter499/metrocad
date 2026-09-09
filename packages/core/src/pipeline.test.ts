import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import { computeLayout, withDefaults, TextFont, buildParts, isClosedManifold, packPlates, polysOverlap, labelPolygon, itemBBox, placementTransform, meshToStl, parseStl, write3mf, partsToGlb, partsToUsdz, buildBundle, buildFromNetwork } from './index.js';
import type { MetroNetwork } from './index.js';
import { unzipSync } from 'fflate';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const net: MetroNetwork = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/paris.json'), 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync(path.join(root, 'fonts/Inter-Bold.ttf')));
let wasm: ManifoldToplevel;
beforeAll(async () => { wasm = await Module(); wasm.setup(); });

describe('layout', () => {
  const params = withDefaults({ widthMm: 800 });
  const layout = computeLayout(net, params, font);
  it('places every station and fills the requested width', () => {
    expect(layout.stations.length).toBe(net.stations.length);
    expect(layout.width).toBe(800);
    for (const st of layout.stations) { expect(st.x).toBeGreaterThan(0); expect(st.x).toBeLessThan(800); expect(st.y).toBeGreaterThan(0); expect(st.y).toBeLessThan(layout.height); }
  });
  it('gives every line at least one chain and keeps chains inside the bed', () => {
    for (const l of layout.lines) {
      expect(l.chains.length).toBeGreaterThan(0);
      for (const c of l.chains) {
        expect(c.points.length).toBeGreaterThanOrEqual(2);
        const xs = c.points.map((p) => p[0]), ys = c.points.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs) + params.lineWidth, h = Math.max(...ys) - Math.min(...ys) + params.lineWidth;
        const bx = params.bed.x - 2 * params.bedMargin, by = params.bed.y - 2 * params.bedMargin;
        expect((w <= bx && h <= by) || (h <= bx && w <= by)).toBe(true);
      }
    }
  });
  it('labels do not overlap each other', () => {
    const polys = layout.labels.map((l) => labelPolygon(l));
    for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) expect(polysOverlap(polys[i], polys[j])).toBe(false);
    expect(layout.labels.length).toBeGreaterThan(net.stations.length * 0.4);
  });
  it('is deterministic', () => {
    const again = computeLayout(net, params, font);
    expect(again.stations.map((s) => [s.id, s.x, s.y])).toEqual(layout.stations.map((s) => [s.id, s.x, s.y]));
  });
});

describe('geometry + packing + export', () => {
  const params = withDefaults({ widthMm: 500, labels: 'major', quality: 'preview' });
  let result: ReturnType<typeof buildFromNetwork>;
  beforeAll(() => { result = buildFromNetwork(net, { params, font, manifold: wasm }); });

  it('produces closed manifold parts of every kind', () => {
    const kinds = new Set(result.parts.map((p) => p.kind));
    for (const k of ['tile', 'line', 'plug', 'ring', 'dot', 'labelPlate', 'labelText']) expect(kinds.has(k as any)).toBe(true);
    for (const p of result.parts) { expect(isClosedManifold(p.mesh)).toBe(true); expect(p.volumeMm3).toBeGreaterThan(0); }
    expect(result.warnings.filter((w) => /manifold error/.test(w))).toEqual([]);
  });
  it('keeps station plugs inside ring pockets with clearance', () => {
    const rings = result.parts.filter((p) => p.kind === 'ring');
    for (const r of rings) {
      const plug = result.parts.find((p) => p.kind === 'plug' && p.stationId === r.stationId)!;
      expect(plug.bbox.min[0]).toBeGreaterThan(r.bbox.min[0]);
      expect(plug.bbox.max[0]).toBeLessThan(r.bbox.max[0]);
    }
  });
  it('packs every part onto a plate within the bed', () => {
    const seen = new Set<string>();
    for (const plate of result.plates) {
      for (const item of plate.items) {
        const bb = itemBBox(result.parts, item.partId);
        expect(bb.parts.length).toBeGreaterThan(0);
        for (const p of bb.parts) seen.add(p.id);
        const t = placementTransform(item, bb.min[2]);
        const c = Math.cos((t.rotationDeg * Math.PI) / 180), s = Math.sin((t.rotationDeg * Math.PI) / 180);
        for (const p of bb.parts) {
          const P = p.mesh.positions;
          for (let i = 0; i < P.length; i += 3) {
            const x = P[i] * c - P[i + 1] * s + t.dx, y = P[i] * s + P[i + 1] * c + t.dy, z = P[i + 2] + t.dz;
            expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(plate.bed.x + 0.01);
            expect(y).toBeGreaterThanOrEqual(-0.01); expect(y).toBeLessThanOrEqual(plate.bed.y + 0.01);
            expect(z).toBeGreaterThanOrEqual(-0.01);
          }
        }
      }
      // single colour per plate (label plates carry a colour change)
      const colors = new Set(plate.items.flatMap((it) => itemBBox(result.parts, it.partId).parts.map((p) => p.color)));
      expect(colors.size).toBeLessThanOrEqual(plate.colorChange ? 2 : 1);
    }
    expect(seen.size).toBe(result.parts.filter((p) => p.kind !== 'tape' && p.kind !== 'tapeText').length);
  });
  it('writes valid STL / 3MF / GLB / USDZ', () => {
    const part = result.parts.find((p) => p.kind === 'line')!;
    const stl = meshToStl(part.mesh, part.name);
    const parsed = parseStl(stl);
    expect(parsed.triangles).toBe(part.mesh.indices.length / 3);
    const threemf = write3mf([{ name: 'x', mesh: part.mesh, color: '#ff0000' }]);
    const files = unzipSync(threemf);
    expect(Object.keys(files)).toContain('3D/3dmodel.model');
    expect(new TextDecoder().decode(files['3D/3dmodel.model'])).toContain('<triangle');
    const glb = partsToGlb(result.parts.slice(0, 5));
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF');
    const usdz = partsToUsdz(result.parts.slice(0, 5));
    const dv = new DataView(usdz.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const nameLen = dv.getUint16(26, true), extraLen = dv.getUint16(28, true);
    expect((30 + nameLen + extraLen) % 64).toBe(0);
    expect(new TextDecoder().decode(unzipSync(usdz)['metromap.usda'])).toContain('preliminary:planeAnchoring:alignment = "vertical"');
  });
  it('bundles a print guide and one 3MF per plate', () => {
    const files = buildBundle(result, { individualStls: false, ar: false });
    const names = Object.keys(files);
    expect(names).toContain('README.md');
    expect(names).toContain('manifest.json');
    expect(names.filter((n) => n.endsWith('.3mf')).length).toBe(result.plates.length + 1);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest.plates.length).toBe(result.plates.length);
  });
});
