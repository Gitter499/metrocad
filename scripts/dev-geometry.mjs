// node scripts/dev-geometry.mjs paris [width] — builds parts for a fixture and validates meshes.
import Module from 'manifold-3d';
import { computeLayout, withDefaults, TextFont, buildParts, isClosedManifold } from '@metrocad/core';
import fs from 'node:fs';
const [name, widthArg, quality] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${name}.json`, 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const params = withDefaults({ widthMm: Number(widthArg ?? 900), quality: quality ?? 'print' });
const wasm = await Module(); wasm.setup();
const t0 = performance.now();
const layout = computeLayout(net, params, font);
const t1 = performance.now();
const { parts, warnings, tiles } = buildParts(wasm, layout, params, font, { progress: (s, f, d) => process.stderr.write(`\r${s} ${(f * 100).toFixed(0)}% ${d ?? ''}      `) });
const t2 = performance.now();
console.log(`\nlayout ${(t1 - t0).toFixed(0)}ms, geometry ${(t2 - t1).toFixed(0)}ms, parts ${parts.length}, tiles ${tiles.cols}x${tiles.rows} (${tiles.w.toFixed(0)}x${tiles.h.toFixed(0)}mm)`);
const byKind = {};
for (const p of parts) { const k = byKind[p.kind] ??= { n: 0, tris: 0, vol: 0 }; k.n++; k.tris += p.triangles; k.vol += p.volumeMm3; }
console.table(byKind);
let bad = 0;
for (const p of parts) if (!isClosedManifold(p.mesh)) { bad++; if (bad < 5) console.log('NOT MANIFOLD:', p.id); }
console.log('non-manifold parts:', bad, 'warnings:', warnings.length, warnings.slice(0, 5));
const tot = parts.reduce((s, p) => s + p.volumeMm3, 0);
console.log('total volume cm3', (tot / 1000).toFixed(1), '≈ grams PLA', (tot / 1000 * 1.24).toFixed(0), 'triangles', parts.reduce((s, p) => s + p.triangles, 0));
