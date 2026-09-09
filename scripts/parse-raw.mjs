// node scripts/parse-raw.mjs raw.json slug [modes] — build a fixture from a saved raw Overpass response.
import { parseOverpass } from '@metrocad/core';
import fs from 'node:fs';
const [raw, slug, modesArg] = process.argv.slice(2);
const { geo, city, data } = JSON.parse(fs.readFileSync(raw, 'utf8'));
const modes = (modesArg ?? 'subway,light_rail,tram,train').split(',');
const net = parseOverpass(data, geo, city, modes, 'https://overpass.private.coffee/api/interpreter');
fs.writeFileSync(`packages/core/fixtures/${slug}.json`, JSON.stringify(net));
console.log(`${slug}: ${net.lines.length} lines, ${net.stations.length} stations`);
for (const l of net.lines) console.log(`  ${l.ref.padEnd(6)} ${l.mode.padEnd(10)} ${l.color} ${String(new Set(l.sequences.flat()).size).padStart(3)} st  ${l.name}`);
