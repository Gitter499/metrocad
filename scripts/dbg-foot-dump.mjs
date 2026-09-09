// Dump the outline-base footprint (before island bridging) as polygons: node scripts/dbg-foot-dump.mjs city width out.json
import Module from 'manifold-3d';
import fs from 'node:fs';
import { buildFromNetwork, TextFont } from '@metrocad/core';
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
const city = process.argv[2], width = Number(process.argv[3]) || 900;
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const officialExtract = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.official.json`, 'utf8'));
process.env.TILE_DEBUG = '1';
try { buildFromNetwork(net, { params: { widthMm: width, base: 'outline' }, font, manifold: wasm, officialExtract, progress: () => { if (globalThis.__metrocadFoot) throw new Error('captured'); } }); } catch (e) { if (!/captured/.test(String(e))) throw e; }
fs.writeFileSync(process.argv[4], JSON.stringify(globalThis.__metrocadFoot));
console.log('rings', globalThis.__metrocadFoot.length, 'verts', globalThis.__metrocadFoot.reduce((s, r) => s + r.length, 0));
