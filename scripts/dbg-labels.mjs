import fs from 'node:fs';
import { layoutFromSvg, withDefaults, TextFont } from '@metrocad/core';
const net = JSON.parse(fs.readFileSync('packages/core/fixtures/london.json', 'utf8'));
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const params = withDefaults({ widthMm: Number(process.argv[2] ?? 900) });
const { layout } = layoutFromSvg(fs.readFileSync(process.argv[3] ?? `${process.env.S}/london-official.svg`, 'utf8'), net, params, font, {});
const un = layout.unlabeled.map((id) => { const s = net.stations.find((x) => x.id === id); return `${s.name}(${s.lines.length})`; });
console.log('unlabeled', un.length, un.join(', '));
const sizes = {}; for (const l of layout.labels) sizes[l.fontSize.toFixed(1)] = (sizes[l.fontSize.toFixed(1)] ?? 0) + 1; console.log('sizes', sizes);
console.log('angles', layout.labels.reduce((a, l) => (a[l.angle] = (a[l.angle] ?? 0) + 1, a), {}));
const near = (x, y, r) => layout.stations.filter((s) => Math.hypot(s.x - x, s.y - y) < r).map((s) => `${s.id} major=${s.major} r=${s.markerRadius.toFixed(1)} pts=${s.markerPoints.length} @${s.x.toFixed(1)},${s.y.toFixed(1)}`);
if (process.env.NEAR) { const [x, y] = process.env.NEAR.split(',').map(Number); console.log(near(x, y, 15)); }
