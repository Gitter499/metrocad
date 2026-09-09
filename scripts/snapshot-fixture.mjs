// Usage: node scripts/snapshot-fixture.mjs "City" [modes]  — writes packages/core/fixtures/<slug>.json
import { fetchCityNetwork } from '@metrocad/core';
import fs from 'node:fs';
import path from 'node:path';
const [city, modesArg] = process.argv.slice(2);
if (!city) { console.error('usage: snapshot-fixture <city> [modes]'); process.exit(1); }
const modes = modesArg ? modesArg.split(',') : undefined;
const net = await fetchCityNetwork(city, { modes, onStatus: (m) => console.error(m) });
const file = path.resolve('packages/core/fixtures', city.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(net));
console.log(`${file}: ${net.lines.length} lines, ${net.stations.length} stations`);
