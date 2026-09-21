// Top-down SVG of a plate from a bundle's manifest + part meshes is heavy; instead draw the test coupon straight from the pipeline.
import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont, buildTestCoupon, itemBBox, placementTransform } from '@metrocad/core';
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const city = process.argv[2] ?? 'pittsburgh';
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const officialExtract = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.official.json`, 'utf8'));
const r = buildFromNetwork(net, { params: { widthMm: 900 }, font, manifold: wasm, officialExtract });
const c = buildTestCoupon(r, wasm);
console.log(c.description, c.plate.items.length, 'items');
const W = r.params.bed.x, H = r.params.bed.y, sc = 6;
const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W * sc}" height="${H * sc}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ddd"/>`];
for (const it of c.plate.items) {
  const bb = itemBBox(c.parts, it.partId);
  for (const p of bb.parts) {
    const t = placementTransform(it, bb.min[2]); const a = (t.rotationDeg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    const P = p.mesh.positions, I = p.mesh.indices; const zmax = p.bbox.max[2];
    for (let k = 0; k < I.length; k += 3) {
      const pts = [I[k], I[k + 1], I[k + 2]].map((v) => [P[v * 3] * cs - P[v * 3 + 1] * sn + t.dx, H - (P[v * 3] * sn + P[v * 3 + 1] * cs + t.dy), P[v * 3 + 2]]);
      const z = (pts[0][2] + pts[1][2] + pts[2][2]) / 3; const shade = 0.55 + 0.45 * (z - p.bbox.min[2]) / Math.max(0.1, zmax - p.bbox.min[2]);
      out.push(`<polygon points="${pts.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(' ')}" fill="${p.color}" opacity="${shade.toFixed(2)}"/>`);
    }
  }
}
out.push('</svg>');
fs.writeFileSync(process.argv[3] ?? 'coupon.svg', out.join('\n'));
