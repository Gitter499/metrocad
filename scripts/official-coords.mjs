// node scripts/official-coords.mjs stations.json — coordinates for the SEPTA overlay's stations from an Overpass node dump.
import fs from 'node:fs';
import { SEPTA_REGIONAL_RAIL, normalizeName } from '@metrocad/core';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nodes = d.elements.filter((e) => e.type === 'node' && e.tags?.name);
const byKey = new Map();
for (const n of nodes) { const k = normalizeName(n.tags.name); (byKey.get(k) ?? byKey.set(k, []).get(k)).push(n); }
const alias = SEPTA_REGIONAL_RAIL.aliases ?? {};
const rev = new Map(); for (const [from, to] of Object.entries(alias)) (rev.get(to) ?? rev.set(to, []).get(to)).push(from);
const want = new Set(SEPTA_REGIONAL_RAIL.lines.flatMap((l) => l.stations));
const out = {}; const missing = [];
for (const name of want) {
  const keys = [name, ...(rev.get(name) ?? []), name + ' Station', name.replace(/ Transportation Center$/, ''), name.replace(/^Airport /, '')].map(normalizeName);
  let cands = keys.flatMap((k) => byKey.get(k) ?? []);
  if (!cands.length) { missing.push(name); continue; }
  const score = (n) => (/(septa)/i.test(`${n.tags.operator ?? ''} ${n.tags.network ?? ''}`) ? 4 : 0) + (n.tags.railway === 'station' ? 2 : n.tags.railway === 'halt' ? 1 : 0) + (/train|rail/.test(n.tags.train ?? n.tags.station ?? '') ? 1 : 0) - (n.tags.subway === 'yes' || n.tags.station === 'subway' || n.tags.light_rail === 'yes' || n.tags.tram === 'yes' ? 3 : 0);
  cands.sort((a, b) => score(b) - score(a));
  const n = cands[0];
  out[name] = [Number(n.lat.toFixed(5)), Number(n.lon.toFixed(5))];
}
console.error('missing:', missing.join(', ') || 'none');
fs.writeFileSync('packages/core/src/official/septa-coords.ts', `/** Station coordinates (lat, lon) for SEPTA Regional Rail from OpenStreetMap station nodes (© OpenStreetMap contributors, ODbL). */\nexport const SEPTA_COORDS: Record<string, [number, number]> = ${JSON.stringify(out, null, 0).replace(/\],"/g, '],\n  "').replace('{', '{\n  ').replace('}', ',\n}')};\n`);
console.log(Object.keys(out).length, 'coords written');
