// Replay island bridging on a dumped footprint: TILE_DEBUG=1 node scripts/dbg-bridge.mjs foot.json
import Module from 'manifold-3d';
import fs from 'node:fs';
import { bridgeIslands } from '@metrocad/core';
const m = await Module(); m.setup();
const polys = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const foot = new m.CrossSection(polys, 'Positive');
const comps = foot.decompose();
console.log('components', comps.length, comps.map((c) => Math.round(c.area())).sort((a, b) => b - a).join(' '));
const t0 = performance.now();
const r = bridgeIslands(m, foot, 8);
console.log('bridged in', (performance.now() - t0).toFixed(0), 'ms', r);
const after = r.foot.decompose();
console.log('after', after.length, after.map((c) => Math.round(c.area())).sort((a, b) => b - a).join(' '));
