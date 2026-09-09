// Parse a raw overpass JSON file into a network fixture (for sandbox use where Overpass is slow).
import { parseOverpass, geocodeCity } from '@metrocad/core';
import fs from 'node:fs';
const [raw, city, modesArg, out] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(raw, 'utf8'));
const geo = await geocodeCity(city);
const modes = (modesArg || 'subway').split(',');
const net = parseOverpass(data, geo, city, modes, 'https://overpass.private.coffee/api/interpreter');
fs.writeFileSync(out, JSON.stringify(net));
console.log(`${out}: ${net.lines.length} lines, ${net.stations.length} stations`);
for (const l of net.lines) console.log(' ', l.id, l.ref, l.color, 'variants', l.sequences.length, 'stations', new Set(l.sequences.flat()).size, '|', l.name);
const multi = net.stations.filter(s => s.lines.length > 1).length;
console.log('  interchanges', multi);
