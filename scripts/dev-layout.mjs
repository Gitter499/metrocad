// Render a fixture network to SVG for visual checks: node scripts/dev-layout.mjs paris out.svg [width]
import { computeLayout, withDefaults, renderSvg, TextFont } from '@metrocad/core';
import fs from 'node:fs';
const [name, out, widthArg, mode] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${name}.json`, 'utf8'));
const fontBuf = fs.readFileSync('packages/core/fonts/Inter-Bold.ttf');
const font = TextFont.fromBuffer(fontBuf);
const params = withDefaults({ widthMm: Number(widthArg ?? 900), layout: { mode: mode ?? 'schematic' } });
const t0 = performance.now();
const layout = computeLayout(net, params, font, (m) => console.error(m));
console.log(`layout ${(performance.now() - t0).toFixed(0)}ms: ${layout.width.toFixed(0)}x${layout.height.toFixed(0)}mm, stations ${layout.stations.length}, labels ${layout.labels.length}, unlabeled ${layout.unlabeled.length}, chains ${layout.lines.reduce((s, l) => s + l.chains.length, 0)}, unit ${layout.scale.toFixed(2)}mm`);
const svg = renderSvg(layout, params, { fontDataUrl: 'data:font/ttf;base64,' + fontBuf.toString('base64'), title: net.displayName });
fs.writeFileSync(out, svg);
