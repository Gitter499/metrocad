// Slice one plate of the Paris fixture: node scripts/dev-slice.mjs [plateIndex] [printerId]
import Module from 'manifold-3d';
import fs from 'node:fs';
import { computeLayout, withDefaults, TextFont, buildParts, packPlates, itemBBox, placementTransform } from '@metrocad/core';
import { slicePlate } from '../packages/core/dist/slicer/slice.js';
import * as prof from '../packages/core/dist/slicer/profiles.js';
const [idxArg, printerId] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync('packages/core/fixtures/paris.json', 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const params = withDefaults({ widthMm: 900 });
const wasm = await Module(); wasm.setup();
const layout = computeLayout(net, params, font);
const { parts } = buildParts(wasm, layout, params, font);
const plates = packPlates(parts, params);
const printer = prof.getPrinterProfile(printerId ?? 'bambu-a1-mini');
const process_ = prof.processFor(printer);
const idx = Number(idxArg ?? 0);
for (const i of idxArg === 'all' ? plates.map((_, i) => i) : [idx]) {
  const plate = plates[i];
  const objects = plate.items.flatMap((item) => { const bb = itemBBox(parts, item.partId); return bb.parts.map((p) => ({ mesh: p.mesh, transform: placementTransform(item, bb.min[2]), name: p.name, colorChangeAtZ: plate.colorChange && p.kind === 'labelText' ? plate.colorChange.atZ : undefined })); });
  const t0 = performance.now();
  const res = slicePlate({ objects, printer, process: process_, label: plate.name }, wasm);
  console.log(`${i + 1}. ${plate.name}: ${objects.length} objs, ${res.stats.layers} layers, ${(res.stats.timeSec / 60).toFixed(0)} min, ${res.stats.filamentGrams.toFixed(1)} g, gcode ${(res.gcode.length / 1e6).toFixed(1)} MB, sliced in ${(performance.now() - t0).toFixed(0)} ms`);
  if (idxArg !== 'all') fs.writeFileSync(`/tmp/claude-0/-home-user-metrocad/ef0a8593-d067-5fa2-b58f-3770ad1f7693/scratchpad/plate${i + 1}.gcode`, res.gcode);
}
