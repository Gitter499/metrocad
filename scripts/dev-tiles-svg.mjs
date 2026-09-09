// node scripts/dev-tiles-svg.mjs city width base out.svg — top view: base tile footprints (z=0 faces) under the map.
import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont, renderSvg } from '@metrocad/core';
const [city, widthArg, base, out] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const r = buildFromNetwork(net, { params: { widthMm: Number(widthArg), base }, font, manifold: wasm });
const tiles = r.parts.filter((p) => p.kind === 'tile');
let polys = '';
for (const t of tiles) {
  const m = t.mesh; const v = m.positions ?? m.vertices ?? m.vertProperties; const idx = m.indices ?? m.triVerts;
  const stride = m.numProp ?? 3;
  for (let i = 0; i < idx.length; i += 3) {
    const pts = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [v[k * stride], v[k * stride + 1], v[k * stride + 2]]);
    if (pts.every((p) => Math.abs(p[2]) < 1e-3)) polys += `<polygon points="${pts.map((p) => `${p[0].toFixed(2)},${(r.layout.height - p[1]).toFixed(2)}`).join(' ')}" fill="#555" stroke="#555" stroke-width="0.05"/>`;
  }
}
const mapSvg = renderSvg(r.layout, r.params, {});
const inner = mapSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const W = r.layout.width, H = r.layout.height;
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-10} ${-10} ${W + 20} ${H + 20}" width="${(W + 20) * 2}" height="${(H + 20) * 2}"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="#fff"/><g>${polys}</g><g opacity="0.9">${inner}</g></svg>`);
console.log(`${tiles.length} tiles; grid ${r.tiles.cols}×${r.tiles.rows} (${r.tiles.w.toFixed(0)}×${r.tiles.h.toFixed(0)} mm), wrote ${out}`);
