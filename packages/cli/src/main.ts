/** MetroCAD command line: city name in, print-ready files out. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'manifold-3d';
import { fetchCityNetwork, buildFromNetwork, buildBundle, TextFont, parseFarm, sliceAndSchedule, type MetroNetwork, type TransitMode, type PartialParams } from '@metrocad/core';

const require = createRequire(import.meta.url);

function usage(): never {
  console.log(`MetroCAD — 3D-printable metro map wall art from any city name

usage: metrocad <city> [options]

  --out <dir>          output directory (default: ./out/<city>)
  --width <mm>         finished width (default 900)
  --height <mm>        finished height (default: from map aspect)
  --farm <spec>        printers you have, e.g. bambu-a1-mini:3,bambu-p1s:1,ultimaker-s3:2
                       (plates fit the smallest bed; the guide schedules across all of them)
  --bed <x>x<y>        override the plate bed size in mm (default: smallest bed in the farm)
  --slice              also write G-code for every plate (per assigned printer) + print schedule
  --modes <list>       transit modes to try, in order (default subway,light_rail,tram)
  --all-modes          include every listed mode instead of the first with results
  --labels all|major|none
  --label-size <mm>    label font size (default 5.5)
  --lang local|en      station name language (default local)
  --base tiles|none    grooved base tiles (default) or floating parts + paper template
  --keyholes           add keyhole slots to the back of the tiles
  --layout schematic|geographic
  --line-width <mm>    (default 6)
  --clearance <mm>     fit clearance (default 0.15)
  --label-mode auto|print|tape   raised printed letters, or pockets for label-maker tape (auto: tape when < 4.5 mm)
  --tape-width <mm>    label-maker tape width for tape mode (default 12)
  --map-svg <file>     official/community schematic SVG: use its geometry instead of the algorithmic layout
  --font <file.ttf>    custom font (e.g. Noto Sans JP for CJK names)
  --fixture <name>     use a bundled network fixture instead of fetching (paris, london)
  --network <file>     use a saved network JSON
  --save-network <f>   save the fetched network JSON
  --no-parts           skip individual per-part STLs
  --no-ar              skip GLB/USDZ
  --zip                also write bundle.zip
`);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help') || argv.includes('-h')) usage();
const opts: Record<string, string | boolean> = {};
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; } else opts[key] = true;
  } else positional.push(a);
}
const city = positional.join(' ') || (opts.fixture as string) || '';
if (!city && !opts.network) usage();

const here = path.dirname(fileURLToPath(import.meta.url));
const corePkg = path.dirname(require.resolve('@metrocad/core/package.json'));
const fontPath = (opts.font as string) ?? path.join(corePkg, 'fonts', 'Inter-Bold.ttf');
const font = TextFont.fromBuffer(fs.readFileSync(fontPath), path.basename(fontPath));

let net: MetroNetwork;
if (opts.network) net = JSON.parse(fs.readFileSync(opts.network as string, 'utf8'));
else if (opts.fixture) net = JSON.parse(fs.readFileSync(path.join(corePkg, 'fixtures', `${opts.fixture}.json`), 'utf8'));
else {
  const modes = (opts.modes as string | undefined)?.split(',') as TransitMode[] | undefined;
  net = await fetchCityNetwork(city, { modes, combineModes: !!opts['all-modes'], onStatus: (m) => console.error(m) });
  if (opts['save-network']) fs.writeFileSync(opts['save-network'] as string, JSON.stringify(net));
}
console.error(`${net.displayName}: ${net.lines.length} lines, ${net.stations.length} stations`);

const farm = parseFarm((opts.farm as string) ?? 'bambu-a1-mini:3');
const bedArg = opts.bed ? (opts.bed as string).split('x').map(Number) : undefined;
const params: PartialParams = {
  widthMm: Number(opts.width ?? 900),
  heightMm: opts.height ? Number(opts.height) : undefined,
  farm,
  bed: bedArg ? { x: bedArg[0], y: bedArg[1] ?? bedArg[0] } : undefined,
  labelMode: (opts['label-mode'] as any) ?? 'auto',
  tapeWidth: Number(opts['tape-width'] ?? 12),
  labels: (opts.labels as any) ?? 'all',
  labelFontSize: Number(opts['label-size'] ?? 5.5),
  labelLanguage: (opts.lang as any) ?? 'local',
  base: (opts.base as any) ?? 'tiles',
  keyholes: !!opts.keyholes,
  lineWidth: Number(opts['line-width'] ?? 6),
  clearance: Number(opts.clearance ?? 0.15),
  layout: { mode: (opts.layout as any) ?? 'schematic' },
};

const wasm = await Module();
wasm.setup();
let lastStage = '';
const mapSvg = opts['map-svg'] ? fs.readFileSync(opts['map-svg'] as string, 'utf8') : undefined;
const result = buildFromNetwork(net, {
  params, font, manifold: wasm, mapSvg,
  progress: (stage, frac, detail) => {
    const line = `${stage.padEnd(9)} ${(frac * 100).toFixed(0).padStart(3)}%  ${detail ?? ''}`;
    if (stage !== lastStage) { process.stderr.write('\n'); lastStage = stage; }
    process.stderr.write(`\r${line.padEnd(70)}`);
  },
});
process.stderr.write('\n');
const out = (opts.out as string) ?? path.join('out', city.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
fs.mkdirSync(out, { recursive: true });
let sliced: ReturnType<typeof sliceAndSchedule> | undefined;
if (opts.slice) {
  sliced = sliceAndSchedule(result, wasm, { onProgress: (f, d) => process.stderr.write(`\rslice     ${(f * 100).toFixed(0).padStart(3)}%  ${d.padEnd(40)}`) });
  process.stderr.write('\n');
}
const files = buildBundle(result, {
  sliced,
  individualStls: !opts['no-parts'], ar: !opts['no-ar'],
  fontDataUrl: 'data:font/ttf;base64,' + fs.readFileSync(fontPath).toString('base64'),
  onProgress: (f, d) => process.stderr.write(`\rexport    ${(f * 100).toFixed(0).padStart(3)}%  ${d.padEnd(40)}`),
});
process.stderr.write('\n');
let bytes = 0;
for (const [rel, data] of Object.entries(files)) {
  const fp = path.join(out, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, data);
  bytes += data.length;
}
if (opts.zip) {
  const { zipBundle } = await import('@metrocad/core');
  fs.writeFileSync(path.join(out, 'bundle.zip'), zipBundle(files));
}
const s = result.stats;
console.log(`\n${net.displayName}`);
console.log(`  ${result.layout.width.toFixed(0)} × ${result.layout.height.toFixed(0)} mm, ${s.lines} lines, ${s.stations} stations, ${s.labels} labels (${s.unlabeled} skipped)`);
console.log(`  ${s.parts} parts on ${s.plates} plates, ≈ ${Math.round(s.estimatedGrams)} g filament, ${(s.buildMs / 1000).toFixed(1)} s`);
if (sliced) console.log(`  sliced: ${(sliced.totalSec / 3600).toFixed(1)} h of printing, ${sliced.totalGrams.toFixed(0)} g · farm of ${sliced.schedule.perPrinter.length} printers finishes in ${(sliced.schedule.makespanSec / 3600).toFixed(1)} h`);
console.log(`  ${Object.keys(files).length} files (${(bytes / 1e6).toFixed(1)} MB) written to ${out}`);
for (const w of result.warnings) console.log(`  ! ${w}`);
void here;
