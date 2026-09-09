// Aggregate docs/matrix/*.json into docs/matrix.md (+ csv)
import fs from 'node:fs';
const rows = fs.readdirSync('docs/matrix').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync('docs/matrix/' + f, 'utf8')));
rows.sort((a, b) => a.city.localeCompare(b.city) || a.width - b.width);
const farms = Object.keys(rows[0]?.farms ?? {});
const h = (x) => `${x} h`;
const lines = ['# Print matrix', '', 'Every bundled city at three wall widths. Print time = sum of sliced plate times (0.2 mm layers, 2 walls, 8 % infill, PLA). Farm columns = wall-clock with that many printers running in parallel, 8 min between plates. Cost = filament at $22/kg. Assembly = hands-on time model (2.5 min per tile, 1.5 min per line piece, ~0.3–0.8 min per station/label part, +15 %).', '', `| City | Width × height (mm) | Line / letter (mm) | Lines / stations | Parts | Plates | Tiles | Filament | Cost | Print time (1 printer) | ${farms.slice(1).join(' | ')} | Assembly |`, `|---|---|---|---|---|---|---|---|---|---|${farms.slice(1).map(() => '---').join('|')}|---|`];
for (const r of rows) lines.push(`| ${r.place} | ${r.width} × ${r.height} | ${r.lineWidth} / ${r.labelFontSize} | ${r.lines} / ${r.stations} | ${r.parts} | ${r.plates} | ${r.tiles} | ${r.grams} g | $${r.costUsd.toFixed(0)} | ${h(r.printHours)} | ${farms.slice(1).map((f) => h(r.farms[f])).join(' | ')} | ${h(r.assemblyHours)} |`);
fs.writeFileSync('docs/matrix.md', lines.join('\n') + '\n');
const csv = ['city,width_mm,height_mm,line_width_mm,letter_mm,lines,stations,parts,plates,tiles,grams,cost_usd,print_hours_1_printer,' + farms.slice(1).map((f) => 'hours_' + f.replace(/[^a-z0-9]+/gi, '_')).join(',') + ',assembly_hours'];
for (const r of rows) csv.push([r.place, r.width, r.height, r.lineWidth, r.labelFontSize, r.lines, r.stations, r.parts, r.plates, r.tiles, r.grams, r.costUsd, r.printHours, ...farms.slice(1).map((f) => r.farms[f]), r.assemblyHours].join(','));
fs.writeFileSync('docs/matrix.csv', csv.join('\n') + '\n');
console.log(lines.join('\n'));
