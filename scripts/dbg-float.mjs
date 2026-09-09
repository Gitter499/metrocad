import fs from 'node:fs';
import { layoutFromSvg, withDefaults, TextFont } from '@metrocad/core';
const net = JSON.parse(fs.readFileSync('packages/core/fixtures/philadelphia.json', 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const { layout } = layoutFromSvg(fs.readFileSync(process.argv[2], 'utf8'), net, withDefaults({ widthMm: 900 }), font, {});
const segd = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1]; const L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
for (const id of process.argv.slice(3)) {
  const s = layout.stations.find((x) => x.id === id); if (!s) { console.log(id, 'not placed'); continue; }
  let best = { d: Infinity };
  for (const l of layout.lines) for (const ch of l.chains) for (let i = 1; i < ch.points.length; i++) { const d = segd([s.x, s.y], ch.points[i - 1], ch.points[i]); if (d < best.d) best = { d, line: l.ref, chain: ch.id, n: ch.points.length, through: ch.throughStations.map((t) => t.id).join(','), start: ch.startStation, end: ch.endStation }; }
  console.log(id, `@${s.x.toFixed(1)},${s.y.toFixed(1)} major=${s.major} pts=${s.markerPoints.length}`, JSON.stringify(best));
}
const wil = layout.lines.find((l) => l.ref === 'WIL');
console.log('WIL chains', wil.chains.map((c) => `${c.id} n=${c.points.length} ${c.startStation ?? '-'}→${c.endStation ?? '-'} thru=${c.throughStations.length} from ${c.points[0].map((v) => v.toFixed(0))} to ${c.points[c.points.length - 1].map((v) => v.toFixed(0))}`).join('\n  '));
