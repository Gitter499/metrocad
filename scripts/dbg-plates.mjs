// Check every plate item stays inside its bed after its placement transform: node scripts/dbg-plates.mjs city [width]
import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont } from '@metrocad/core';
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const city = process.argv[2] ?? 'pittsburgh', width = Number(process.argv[3]) || 900;
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const officialExtract = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.official.json`, 'utf8'));
const r = buildFromNetwork(net, { params: { widthMm: width }, font, manifold: wasm, officialExtract });
const byId = new Map(r.parts.map((p) => [p.id, p]));
let bad = 0;
for (const pl of r.plates) {
  for (const it of pl.items) {
    const parts = r.parts.filter((p) => p.id === it.partId || p.group === it.partId);
    for (const p of parts) {
      const t = (it.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      const P = p.mesh.positions;
      for (let i = 0; i < P.length; i += 3) { const x = P[i] * c - P[i + 1] * s + it.dx, y = P[i] * s + P[i + 1] * c + it.dy; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      const inside = minx >= -0.5 && miny >= -0.5 && maxx <= pl.bed.x + 0.5 && maxy <= pl.bed.y + 0.5;
      if (!inside) { bad++; console.log(`${pl.name} fill=${pl.fill.toFixed(2)} item ${it.partId} rot ${it.rotation} -> [${minx.toFixed(0)},${miny.toFixed(0)}]..[${maxx.toFixed(0)},${maxy.toFixed(0)}] bed ${pl.bed.x}x${pl.bed.y} raw bbox ${(p.bbox.max[0]-p.bbox.min[0]).toFixed(0)}x${(p.bbox.max[1]-p.bbox.min[1]).toFixed(0)}`); }
    }
  }
}
console.log(`${r.plates.length} plates, ${bad} parts outside their bed`);
