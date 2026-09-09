// node scripts/dev-svgimport.mjs london official.svg out.svg [width]
import fs from 'node:fs';
import { layoutFromSvg, withDefaults, renderSvg, TextFont } from '@metrocad/core';
const [name, svgFile, out, widthArg] = process.argv.slice(2);
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${name}.json`, 'utf8'));
const fontBuf = fs.readFileSync('packages/core/fonts/Inter-Bold.ttf');
const font = TextFont.fromBuffer(fontBuf);
const params = withDefaults({ widthMm: Number(widthArg ?? 1000) });
const t0 = performance.now();
const { layout, report } = layoutFromSvg(fs.readFileSync(svgFile, 'utf8'), net, params, font, { log: console.error });
console.log(`import ${(performance.now() - t0).toFixed(0)}ms: ${layout.width}x${layout.height.toFixed(0)}mm, stations ${layout.stations.length}/${net.stations.length}, labels ${layout.labels.length}, chains ${layout.lines.reduce((s, l) => s + l.chains.length, 0)}`);
console.log('unmatched:', report.unmatchedStations.slice(0, 30).join(' | '), report.unmatchedStations.length > 30 ? `… (+${report.unmatchedStations.length - 30})` : '');
console.log(report.lineColours.map((l) => `${l.ref}=${l.svgColour ?? '—'}(${l.pieces})`).join('  '));
fs.writeFileSync(out, renderSvg(layout, params, { fontDataUrl: 'data:font/ttf;base64,' + fontBuf.toString('base64') }));
