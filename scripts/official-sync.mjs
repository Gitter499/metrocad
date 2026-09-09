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
const ua = 'MetroCAD/1.0 (https://github.com/gitter499/metrocad; metro map verification)';
const download = (url, file) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = execFileSync('curl', ['-sS', '-m', '240', '-L', '-A', ua, '-o', file, '-w', '%{http_code}', url]).toString().trim();
    if (code === '200') return true;
    console.error(`download ${url}: HTTP ${code}${attempt < 3 && code !== '404' ? ', retrying' : ''}`);
    if (code === '404' || attempt === 3) return false;
    execFileSync('sleep', [code === '429' ? '620' : '20']);
  }
  return false;
};
const toSvg = (file) => { if (!/\.pdf$/i.test(file)) return file; const svg = file.replace(/\.pdf$/i, '.svg'); execFileSync('python3', ['scripts/pdf2svg.py', file, svg], { stdio: 'inherit' }); return svg; };
let svg = fileArg ? toSvg(fileArg) : undefined;
let chosenUrl = src.url;
if (!svg) {
  // Several candidate drawings (the first is preferred): keep the one on which most of the city's stations land.
  const urls = src.urls ?? [src.url];
  let best;
  for (let i = 0; i < urls.length; i++) {
    const file = `tmp/official/${city}${urls.length > 1 ? '-' + i : ''}.${/\.pdf(\?|$)/i.test(urls[i]) ? 'pdf' : 'svg'}`;
    if (!download(urls[i], file)) continue;
    const cand = toSvg(file);
    let matched = 0, total = 1;
    try { const m = /matched (\d+)\/(\d+)/.exec(execFileSync('node', ['scripts/official-extract.mjs', city, cand, '--dry']).toString()); if (m) { matched = +m[1]; total = +m[2]; } } catch { /* unusable drawing */ }
    console.error(`${city}: ${urls[i].split('/').pop()} → ${matched}/${total} stations`);
    if (!best || matched > best.matched) best = { file: cand, url: urls[i], matched };
    if (matched / total > 0.9) break;
  }
  if (!best) process.exit(3);
  svg = best.file; chosenUrl = best.url;
}
const file = svg;
let raster = src.raster ? `tmp/official/${city}-official.png` : svg;
if (src.raster) { const code = execFileSync('curl', ['-sS', '-m', '240', '-L', '-A', 'MetroCAD/1.0', '-o', raster, '-w', '%{http_code}', src.raster]).toString().trim(); if (code !== '200') raster = svg; }
execFileSync('node', ['scripts/official-extract.mjs', city, svg, chosenUrl, `${src.title} — ${src.publisher}. ${src.license}. Only route polylines and label anchor points are stored.`], { stdio: 'inherit' });
try { execFileSync('node', ['scripts/verify-official.mjs', city, svg, raster, width], { stdio: 'inherit' }); } catch { process.exitCode = 1; }
