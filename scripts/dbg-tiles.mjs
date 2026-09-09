import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont } from '@metrocad/core';
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const cities = process.argv.slice(2);
for (const city of cities) {
  const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
  const officialExtract = fs.existsSync(`packages/core/fixtures/${city}.official.json`) ? JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.official.json`, 'utf8')) : undefined;
  for (const base of (process.env.BASE ? [process.env.BASE] : ['tiles', 'outline'])) {
    const r = buildFromNetwork(net, { params: { widthMm: Number(process.env.WIDTH) || 900, base }, font, manifold: wasm, officialExtract, progress: (st, f, d) => { if (process.env.TILE_DEBUG) console.log(`  ${st} ${(f * 100).toFixed(0)}% ${d ?? ''} ${(performance.now() / 1000).toFixed(1)}s`); } });
    const tiles = r.parts.filter((p) => p.kind === 'tile');
    const vol = tiles.reduce((s, t) => s + t.volumeMm3, 0);
    const tilePlates = r.plates.filter((pl) => pl.items.every((it) => tiles.some((t) => t.id === it.partId))).length;
    console.log(`${city} ${base}: tiles=${tiles.length} tilePlates=${tilePlates} plates=${r.plates.length} baseVol=${(vol / 1000).toFixed(0)}cm3 baseArea=${Math.round((r.stats.baseAreaMm2 / r.stats.wallAreaMm2) * 100)}% grams=${Math.round(r.stats.estimatedGrams)} build=${(r.stats.buildMs / 1000).toFixed(1)}s warn=${r.warnings.filter((w) => /island/.test(w)).join('')}`);
  }
}
