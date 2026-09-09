// node scripts/fetch-raw.mjs "City" out.json [modes] — raw Overpass JSON for a city (all modes), for offline parsing.
import { geocodeCity, buildOverpassQuery, overpass } from '@metrocad/core';
import fs from 'node:fs';
const [city, out, modesArg] = process.argv.slice(2);
const modes = (modesArg ?? 'subway,light_rail,tram,train').split(',');
const geo = await geocodeCity(city, { onStatus: console.error });
const half = Number(process.env.HALF ?? 0.6);
const bbox = process.env.WIDE ? { south: geo.lat - half, north: geo.lat + half, west: geo.lon - half * 1.1, east: geo.lon + half * 1.1 } : { south: Math.max(geo.bbox.south, geo.lat - half), north: Math.min(geo.bbox.north, geo.lat + half), west: Math.max(geo.bbox.west, geo.lon - half), east: Math.min(geo.bbox.east, geo.lon + half) };
console.error('bbox', bbox, geo.displayName);
for (let attempt = 1; attempt <= 8; attempt++) {
  try {
    const { data } = await overpass(buildOverpassQuery(bbox, modes, 300), { overpassEndpoints: ['https://overpass.private.coffee/api/interpreter'], onStatus: console.error });
    fs.writeFileSync(out, JSON.stringify({ geo: { ...geo, bbox }, city, modes, data }));
    console.log(`saved ${out}: ${data.elements.length} elements`);
    process.exit(0);
  } catch (e) { console.error(`attempt ${attempt}: ${String(e.message).slice(0, 100)}`); await new Promise((r) => setTimeout(r, 30000)); }
}
process.exit(1);
