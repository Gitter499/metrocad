// node scripts/dev-base.mjs city width — filament with rectangular tiles vs. outline tiles.
import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont, sliceAndSchedule, partsToGlb } from '@metrocad/core';
const [city, widthArg] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
for (const base of ['tiles', 'outline']) {
  const t0 = performance.now();
  const r = buildFromNetwork(net, { params: { widthMm: Number(widthArg ?? 600), base }, font, manifold: wasm });
  const sliced = sliceAndSchedule(r, wasm, { changeoverMin: 8 });
  const tiles = r.parts.filter((p) => p.kind === 'tile');
  const tileG = sliced.plates.filter((p) => p.parts?.some?.((id) => String(id).startsWith('tile'))).reduce((a, p) => a + (p.stats.grams ?? 0), 0);
  console.log(`${city} ${base}: ${tiles.length} tiles (grid ${r.tiles.cols}×${r.tiles.rows}), ${Math.round(sliced.totalGrams)} g total, ${r.plates.length} plates, ${(sliced.totalSec / 3600).toFixed(1)} h, tile plates ${Math.round(tileG)} g (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  if (process.env.GLB) fs.writeFileSync(`${process.env.GLB}-${base}.glb`, Buffer.from(partsToGlb(r.parts)));
}
