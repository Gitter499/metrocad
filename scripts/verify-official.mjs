// node scripts/verify-official.mjs city official.svg official.png [width]
// Checks our imported layout against the operator's own drawing and writes docs/verification-<city>.md plus a
// side-by-side image docs/screenshots/verify-<city>.png (official raster left, our render right).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { layoutFromSvg, withDefaults, renderSvg, TextFont } from '@metrocad/core';
const [city, svgFile, pngArg, widthArg] = process.argv.slice(2);
// The "official" side of the comparison: a raster from the operator, or the drawing itself rendered.
let pngFile = pngArg;
if (!pngFile || /\.svg$/i.test(pngFile)) { pngFile = `docs/screenshots/verify-${city}-official.png`; execFileSync('node', ['scripts/svg2png.mjs', pngArg || svgFile, pngFile]); }
const W = Number(widthArg ?? 900);
const net0 = JSON.parse(fs.readFileSync(`packages/core/fixtures/${city}.json`, 'utf8'));
const fontBuf = fs.readFileSync('packages/core/fonts/Inter-Bold.ttf');
const font = TextFont.fromBuffer(fontBuf);
const params = withDefaults({ widthMm: W });
const logs = [];
const { layout, report, net } = layoutFromSvg(fs.readFileSync(svgFile, 'utf8'), net0, params, font, { log: (m) => logs.push(m) });
const stById = new Map(net.stations.map((s) => [s.id, s]));
const pos = new Map(layout.stations.map((s) => [s.id, s]));
const lines = [];
const problems = [];
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1]; const L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)); return d(p, [a[0] + t * vx, a[1] + t * vy]); };
// 1. Per line: stations on the map, off-line stations, jumps between consecutive stations, colour.
const rows = [];
for (const ln of net.lines) {
  const ids = [...new Set(ln.sequences.flat())];
  const onMap = ids.filter((id) => pos.has(id));
  // Same-coloured lines share one chain set (carried by the first of them): check against the whole colour.
  const colour = layout.lines.find((l) => l.id === ln.id)?.color;
  const segs = []; for (const lay of layout.lines.filter((l) => l.color === colour)) for (const ch of lay.chains) for (let i = 1; i < ch.points.length; i++) segs.push([ch.points[i - 1], ch.points[i]]);
  let offLine = 0;
  // An interchange drawn as several nodes (id, id~m2, …) is on the line if any of its nodes is.
  for (const id of onMap) { const nodes = layout.stations.filter((s) => s.id === id || s.id.startsWith(id + '~m')); const best = Math.min(...nodes.map((s) => segs.reduce((m, [a, b]) => Math.min(m, segDist([s.x, s.y], a, b)), Infinity))); if (best > params.lineWidth * 1.5) { offLine++; problems.push(`${ln.ref}: "${stById.get(id).name}" sits ${best.toFixed(0)} mm off the ${ln.ref} line (snapped to the wrong stroke?)`); } }
  let jumps = 0;
  for (const seq of ln.sequences) { const here = seq.filter((id) => pos.has(id)); for (let i = 1; i < here.length; i++) { const a = pos.get(here[i - 1]), b = pos.get(here[i]); const dd = d([a.x, a.y], [b.x, b.y]); if (dd > W * 0.3) { jumps++; problems.push(`${ln.ref}: ${stById.get(here[i - 1]).name} → ${stById.get(here[i]).name} is ${dd.toFixed(0)} mm apart (a station out of place, or a gap in the traced line)`); } } }
  const col = report.lineColours.find((c) => c.ref === ln.ref);
  rows.push({ ref: ln.ref, name: ln.name, stations: ids.length, onMap: onMap.length, missing: ids.filter((id) => !pos.has(id)).map((id) => stById.get(id).name), offLine, jumps, ours: ln.color, official: col?.svgColour ?? '—', pieces: col?.pieces ?? 0 });
}
// 1b. Placed stations that no line piece carries (no through-hole, not a piece end): they would print as a label with no dot.
const carried = new Set();
for (const l of layout.lines) for (const ch of l.chains) { for (const t of ch.throughStations) carried.add(t.id); if (ch.startStation) carried.add(ch.startStation); if (ch.endStation) carried.add(ch.endStation); }
for (const s of layout.stations) if (!carried.has(s.id)) problems.push(`${(stById.get(s.id)?.lines ?? []).map((id) => net.lines.find((l) => l.id === id)?.ref).join('/')}: "${s.name}" is placed but no line piece passes through it (floating dot)`);
// 2. Labels far from their marker (label placed elsewhere because the drawing's spot was taken)
let farLabels = 0;
for (const l of layout.labels) { const s = pos.get(l.stationId); if (!s) continue; const c = [l.x + l.width / 2, l.y + l.height / 2]; if (d(c, [s.x, s.y]) > 30) farLabels++; }
// 3. Side-by-side image
const tmp = `docs/screenshots/verify-${city}-ours.svg`;
fs.writeFileSync(tmp, renderSvg(layout, params, { fontDataUrl: 'data:font/ttf;base64,' + fontBuf.toString('base64') }));
execFileSync('node', ['scripts/svg2png.mjs', tmp, `docs/screenshots/verify-${city}-ours.png`]);
fs.unlinkSync(tmp);
execFileSync('python3', ['-c', `
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
a = Image.open(${JSON.stringify(pngFile)}).convert('RGB'); b = Image.open('docs/screenshots/verify-${city}-ours.png').convert('RGB')
h = 1400
a = a.resize((round(a.width * h / a.height), h)); b = b.resize((round(b.width * h / b.height), h))
out = Image.new('RGB', (a.width + b.width + 30, h), (255, 255, 255)); out.paste(a, (0, 0)); out.paste(b, (a.width + 30, 0))
out.save('docs/screenshots/verify-${city}.png')`]);
fs.unlinkSync(`docs/screenshots/verify-${city}-ours.png`);
if (pngFile.endsWith(`verify-${city}-official.png`)) fs.unlinkSync(pngFile);
// 4. Report
const total = net.stations.length, matched = layout.stations.length;
const md = [`# ${city[0].toUpperCase() + city.slice(1)}: our layout vs the operator's map`, '',
  `Source drawing: \`${svgFile.split('/').pop()}\` · ${W} mm wide · ${matched}/${total} stations placed on the official geometry · ${layout.labels.length} labels placed, ${farLabels} moved away from where the drawing has them · ${problems.length} geometry problems.`, '',
  `![side by side](screenshots/verify-${city}.png)`, '', '| Line | Stations | On map | Off-line | Jumps | Our colour | Official colour | Missing from map |', '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.ref} ${r.name} | ${r.stations} | ${r.onMap} | ${r.offLine} | ${r.jumps} | ${r.ours} | ${r.official} | ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? ` … (+${r.missing.length - 8})` : ''} |`),
  '', '## Problems', '', ...(problems.length ? problems.map((p) => `* ${p}`) : ['none']), '', '## Import log', '', ...logs.filter((l) => !/candidates/.test(l)).map((l) => `* ${l}`)];
fs.writeFileSync(`docs/verification-${city}.md`, md.join('\n') + '\n');
console.log(`${matched}/${total} stations on the official geometry, ${problems.length} problems, ${farLabels} labels moved · docs/verification-${city}.md`);
for (const p of problems) console.log('  ' + p);
process.exit(problems.length > 10 || matched / total < 0.5 ? 1 : 0);
