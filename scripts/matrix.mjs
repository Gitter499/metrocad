// Build + slice + schedule every city at several sizes. Writes docs/matrix/<city>-<width>.json.
// usage: node scripts/matrix.mjs [city ...]   (env SIZES="600,900,1200", FARMS see below)
import Module from 'manifold-3d';
import fs from 'node:fs';
import path from 'node:path';
import { buildFromNetwork, TextFont, sliceAndSchedule, scheduleJobs, KNOWN_PRINTERS } from '@metrocad/core';
const sizes = (process.env.SIZES ?? '600,900,1200').split(',').map(Number);
const cities = process.argv.slice(2).length ? process.argv.slice(2) : ['philadelphia', 'pittsburgh', 'atlanta', 'vienna', 'moscow', 'tokyo', 'paris', 'san-francisco'];
const FARMS = {
  '1 × A1 mini': [{ type: 'bambu-a1-mini', name: 'A1 mini', count: 1, speedFactor: 1 }],
  '3 × A1 mini': [{ type: 'bambu-a1-mini', name: 'A1 mini', count: 3, speedFactor: 1 }],
  '3 × A1 mini + 1 × S3': [{ type: 'bambu-a1-mini', name: 'A1 mini', count: 3, speedFactor: 1 }, { type: 'ultimaker-s3', name: 'S3', count: 1, speedFactor: 1.3 }],
  '9 × A1 mini + 2 × S3': [{ type: 'bambu-a1-mini', name: 'A1 mini', count: 9, speedFactor: 1 }, { type: 'ultimaker-s3', name: 'S3', count: 2, speedFactor: 1.3 }],
};
const CITY_NAMES = { philadelphia: 'Philadelphia', pittsburgh: 'Pittsburgh', atlanta: 'Atlanta', vienna: 'Vienna', moscow: 'Moscow', tokyo: 'Tokyo', paris: 'Paris', 'san-francisco': 'San Francisco', london: 'London' };
const PLA_USD_PER_G = 0.022; // ≈ $22/kg
// Assembly time model (minutes per part): place + press + check.
const ASSEMBLY_MIN = { tile: 2.5, line: 1.5, dot: 0.25, ring: 0.5, plug: 0.35, labelPlate: 0.8, labelText: 0, tape: 0.5, tapeText: 0 };
const font = TextFont.fromBuffer(fs.readFileSync('packages/core/fonts/Inter-Bold.ttf'));
const wasm = await Module(); wasm.setup();
fs.mkdirSync('docs/matrix', { recursive: true });
for (const city of cities) {
  const file = `packages/core/fixtures/${city}.json`;
  if (!fs.existsSync(file)) { console.log(`skip ${city}: no fixture`); continue; }
  const net = JSON.parse(fs.readFileSync(file, 'utf8'));
  const officialFile = `packages/core/fixtures/${city}.official.json`;
  const officialExtract = fs.existsSync(officialFile) ? JSON.parse(fs.readFileSync(officialFile, 'utf8')) : undefined;
  for (const width of sizes) {
    const outFile = `docs/matrix/${city}-${width}.json`;
    if (fs.existsSync(outFile) && !process.env.FORCE) { console.log(`have ${outFile}`); continue; }
    const t0 = performance.now();
    // Feature scale: bigger walls get proportionally thicker lines and taller letters (anchored at 900 mm).
    const fs_ = Math.min(1.5, Math.max(0.8, width / 900));
    const params = { widthMm: width, lineWidth: Math.round(6 * fs_ * 10) / 10, labelFontSize: Math.max(4.5, Math.round(5.5 * fs_ * 10) / 10), farm: [{ printerId: 'bambu-a1-mini', count: 1, bed: { x: 180, y: 180 }, speedFactor: 1 }] };
    const r = buildFromNetwork(net, { params, font, manifold: wasm, officialExtract });
    const sliced = sliceAndSchedule(r, wasm, { changeoverMin: 8 });
    const jobs = sliced.plates.map((p) => ({ id: p.plateId, name: p.name, timeSec: p.stats.timeSec }));
    const farms = {};
    for (const [name, pools] of Object.entries(FARMS)) farms[name] = scheduleJobs(jobs, pools, { changeoverSec: 480 }).makespanSec;
    const parts = r.parts.filter((p) => p.kind !== 'tape' && p.kind !== 'tapeText');
    const byKind = {};
    for (const p of parts) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
    let assemblyMin = 0;
    for (const p of parts) assemblyMin += ASSEMBLY_MIN[p.kind] ?? 0.5;
    assemblyMin *= 1.15; // finding pieces, breaks
    const row = {
      city, place: CITY_NAMES[city] ?? net.displayName.split(',')[0], width, lineWidth: params.lineWidth, labelFontSize: params.labelFontSize, height: Math.round(r.layout.height), lines: r.stats.lines, stations: r.stats.stations, labels: r.stats.labels,
      parts: parts.length, byKind, plates: r.plates.length, tiles: `${r.tiles.cols}×${r.tiles.rows}`,
      grams: Math.round(sliced.totalGrams), costUsd: Math.round(sliced.totalGrams * PLA_USD_PER_G * 100) / 100,
      printHours: Math.round(sliced.totalSec / 360) / 10, farms: Object.fromEntries(Object.entries(farms).map(([k, v]) => [k, Math.round(v / 360) / 10])),
      assemblyHours: Math.round(assemblyMin / 6) / 10, buildSec: Math.round((performance.now() - t0) / 1000),
    };
    fs.writeFileSync(outFile, JSON.stringify(row, null, 2));
    console.log(`${city} ${width}mm: ${row.parts} parts, ${row.plates} plates, ${row.grams} g, ${row.printHours} h print, farms ${JSON.stringify(row.farms)}, assembly ${row.assemblyHours} h (${row.buildSec}s)`);
  }
}
