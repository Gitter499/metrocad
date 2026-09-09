// node scripts/fetch-fixture.mjs "City" slug [modes]  — via the mirror reachable from this sandbox, with retries.
import { fetchCityNetwork } from '@metrocad/core';
import fs from 'node:fs';
const [city, slug, modesArg] = process.argv.slice(2);
const modes = modesArg ? modesArg.split(',') : undefined;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const net = await fetchCityNetwork(city, { modes, overpassEndpoints: ['https://overpass.private.coffee/api/interpreter'], onStatus: (m) => console.error(`[${slug}] ${m}`) });
    fs.writeFileSync(`packages/core/fixtures/${slug}.json`, JSON.stringify(net));
    console.log(`${slug}: ${net.lines.length} lines, ${net.stations.length} stations (${net.displayName})`);
    process.exit(0);
  } catch (e) { console.error(`[${slug}] attempt ${attempt} failed: ${String(e.message).slice(0, 120)}`); await new Promise((r) => setTimeout(r, 20000 * attempt)); }
}
process.exit(1);
