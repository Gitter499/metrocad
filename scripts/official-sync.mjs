// node scripts/official-sync.mjs city [--file local.svg|local.pdf] [--width 900]
// Fetches the city's official/reference map from packages/core/official-sources.json (or uses --file), converts PDF → SVG,
// extracts geometry into packages/core/fixtures/<city>.official.json, and runs the appearance verifier.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const city = args[0];
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : undefined;
const width = args.includes('--width') ? args[args.indexOf('--width') + 1] : '900';
const sources = JSON.parse(fs.readFileSync('packages/core/official-sources.json', 'utf8'));
const src = sources[city];
if (!src) { console.error(`no source registered for ${city}`); process.exit(2); }
if (!src.url && !fileArg) { console.error(`${city}: no map pinned yet (candidates come from scripts/official-discover.mjs)`); process.exit(0); }
fs.mkdirSync('tmp/official', { recursive: true });
let file = fileArg;
if (!file) {
  file = `tmp/official/${city}.${src.kind}`;
  const ua = 'MetroCAD/1.0 (https://github.com/gitter499/metrocad; metro map verification)';
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = execFileSync('curl', ['-sS', '-m', '240', '-L', '-A', ua, '-o', file, '-w', '%{http_code}', src.url]).toString().trim();
    if (code === '200') break;
    console.error(`download ${src.url}: HTTP ${code}${attempt < 3 ? ', retrying' : ''}`);
    if (attempt === 3) process.exit(3);
    execFileSync('sleep', [code === '429' ? '620' : '20']);
  }
}
let svg = file;
if (/\.pdf$/i.test(file)) { svg = file.replace(/\.pdf$/i, '.svg'); execFileSync('python3', ['scripts/pdf2svg.py', file, svg], { stdio: 'inherit' }); }
let raster = src.raster ? `tmp/official/${city}-official.png` : svg;
if (src.raster) { const code = execFileSync('curl', ['-sS', '-m', '240', '-L', '-A', 'MetroCAD/1.0', '-o', raster, '-w', '%{http_code}', src.raster]).toString().trim(); if (code !== '200') raster = svg; }
execFileSync('node', ['scripts/official-extract.mjs', city, svg, src.url, `${src.title} — ${src.publisher}. ${src.license}. Only route polylines and label anchor points are stored.`], { stdio: 'inherit' });
try { execFileSync('node', ['scripts/verify-official.mjs', city, svg, raster, width], { stdio: 'inherit' }); } catch { process.exitCode = 1; }
