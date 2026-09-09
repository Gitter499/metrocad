// node scripts/dbg-extract.mjs map.svg [needle] — what the importer sees in a drawing.
import fs from 'node:fs';
import { extractSvg } from '@metrocad/core';
const ex = extractSvg(fs.readFileSync(process.argv[2], 'utf8'));
const needle = (process.argv[3] ?? '').toLowerCase();
console.log('page', ex.width, ex.height, 'texts', ex.texts.length, 'markers', ex.markers.length, 'dots', ex.dots?.length);
const len = (p) => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
const rows = [...ex.strokes].map(([c, l]) => ({ c, n: l.length, len: Math.round(l.reduce((a, p) => a + len(p.pts), 0)), w: Math.max(...l.map((p) => p.width)).toFixed(1) })).sort((a, b) => b.len - a.len);
console.log('strokes by colour:', rows.slice(0, 14).map((r) => `${r.c} n=${r.n} len=${r.len} w=${r.w}`).join(' | '));
console.log('texts sample:', ex.texts.filter((t) => !t.partial).slice(0, 12).map((t) => `${t.name}@${t.x.toFixed(0)},${t.y.toFixed(0)}/${t.size.toFixed(0)}`).join(' | '));
if (needle) console.log('needle:', ex.texts.filter((t) => t.name.toLowerCase().includes(needle)).map((t) => `${t.name}@${t.x.toFixed(0)},${t.y.toFixed(0)}/${t.size.toFixed(0)}${t.partial ? '(p)' : ''}`).join(' | '), '| markers:', ex.markers.filter((m) => m.name.toLowerCase().includes(needle)).map((m) => `${m.name}@${m.x.toFixed(0)},${m.y.toFixed(0)}`).join(' | '));
for (const [c, l] of ex.strokes) { const xs = l.flatMap((p) => p.pts.map((q) => q[0])), ys = l.flatMap((p) => p.pts.map((q) => q[1])); if (l.length && Math.max(...xs) - Math.min(...xs) > ex.width * 0.1) console.log(`  ${c}: bbox ${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)} → ${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)} pieces ${l.map((p) => p.pts.length).join('/')}`); }
