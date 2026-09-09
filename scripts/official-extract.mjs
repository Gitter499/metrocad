// node scripts/official-extract.mjs city map.svg "source url" "attribution"
// Extracts the geometry we use from an official map drawing (line polylines by colour, label positions, named markers),
// pruned to the colours that carry this city's lines, and writes packages/core/fixtures/<city>.official.json.
import fs from 'node:fs';
import { extractSvg, extractToJson, layoutFromExtract, withDefaults, TextFont } from '@metrocad/core';
const dry = process.argv.includes('--dry');
const [city, svgFile, source, attribution] = process.argv.slice(2).filter((a) => a !== '--dry');
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const ex = extractSvg(fs.readFileSync(svgFile, 'utf8'));
const { report } = layoutFromExtract(ex, net, withDefaults({ widthMm: 900 }), font, {});
if (dry) { console.log(`matched ${report.matchedStations}/${net.stations.length}`); process.exit(0); }
const used = new Set(report.usedColours ?? []);
for (const c of [...ex.strokes.keys()]) if (!used.has(c)) ex.strokes.delete(c);
const round = (v) => Math.round(v * 100) / 100;
for (const list of ex.strokes.values()) for (const p of list) { p.pts = p.pts.map(([x, y]) => [round(x), round(y)]); p.width = round(p.width); }
for (const t of ex.texts) { t.x = round(t.x); t.y = round(t.y); t.size = round(t.size); }
const json = extractToJson(ex, { source, attribution });
const out = `packages/core/fixtures/${city}.official.json`;
fs.writeFileSync(out, JSON.stringify(json));
console.log(`${out}: ${[...ex.strokes.keys()].join(' ')} · ${ex.texts.length} texts · ${(fs.statSync(out).size / 1024).toFixed(0)} KB · matched ${report.matchedStations}/${net.stations.length}`);
