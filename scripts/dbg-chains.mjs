import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont } from '@metrocad/core';
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const city = process.argv[2] ?? 'pittsburgh';
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const officialExtract = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.official.json`, 'utf8'));
const r = buildFromNetwork(net, { params: { widthMm: 900, base: 'none' }, font, manifold: wasm, officialExtract });
for (const ln of r.layout.lines) for (const ch of ln.chains) {
  const xs = ch.points.map((p) => p[0]), ys = ch.points.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (Math.max(w, h) > 172) console.log(ln.ref, ch.id, `${w.toFixed(0)}x${h.toFixed(0)}`, ch.points.length, 'pts', ch.startEnd, ch.endEnd, 'thru', ch.throughStations.length);
}
console.log('bed', r.params.bed, 'margin', r.params.bedMargin);
