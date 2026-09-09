/** Produce the downloadable file set (STL/3MF/SVG/GLB/USDZ + guide) from a build result. */
import { zipSync } from 'fflate';
import type { FullBuildResult } from './pipeline.js';
import { meshToStl } from './export/stl.js';
import { write3mf, type ThreeMfObject } from './export/threemf.js';
import { partsToGlb } from './export/glb.js';
import { partsToUsdz } from './export/usdz.js';
import { renderSvg } from './svg.js';
import { placementTransform, itemBBox } from './pack.js';
import { slugify, zLevels } from './geometry.js';
import type { Part } from './types.js';
import type { FarmResult } from './farm.js';
import { buildAssemblyPlan, renderAssemblyPlanSvg, tapeLabelsCsv } from './assembly.js';
import { formatDuration } from './slicer/schedule.js';
import { KNOWN_PRINTERS } from './defaults.js';

export interface BundleOptions {
  /** Include one STL per part (many files). Default true. */
  individualStls?: boolean;
  /** Include per-plate STL (all parts of a plate laid out, multi-body). Default true. */
  plateStls?: boolean;
  /** Include per-plate 3MF with colours + positions. Default true. */
  plate3mf?: boolean;
  /** Include assembled GLB/USDZ for AR. Default true. */
  ar?: boolean;
  /** Base64 font data for the SVG preview. */
  fontDataUrl?: string;
  /** Sliced G-code + farm schedule to include. */
  sliced?: FarmResult;
  onProgress?: (fraction: number, detail: string) => void;
}

export interface BundleFiles { [path: string]: Uint8Array }

export function buildBundle(r: FullBuildResult, opts: BundleOptions = {}): BundleFiles {
  const files: BundleFiles = {};
  const enc = (s: string) => new TextEncoder().encode(s);
  const city = slugify(r.network.query);
  const progress = opts.onProgress ?? (() => {});
  const partById = new Map(r.parts.map((p) => [p.id, p]));

  // Plates
  const plateFiles: { plate: typeof r.plates[number]; file: string }[] = [];
  r.plates.forEach((plate, i) => {
    const n = String(i + 1).padStart(2, '0');
    const base = `plates/${n}-${slugify(plate.name)}`;
    plateFiles.push({ plate, file: base });
    const objects: ThreeMfObject[] = [];
    const stlChunks: { mesh: Part['mesh']; t: ReturnType<typeof placementTransform>; name: string }[] = [];
    for (const item of plate.items) {
      const bb = itemBBox(r.parts, item.partId);
      for (const p of bb.parts) {
        const t = placementTransform(item, bb.min[2]);
        objects.push({ name: p.name, mesh: p.mesh, color: p.color, transform: t });
        stlChunks.push({ mesh: p.mesh, t, name: p.name });
      }
    }
    if (opts.plate3mf !== false) files[`${base}.3mf`] = write3mf(objects, `${r.network.displayName} — ${plate.name}`);
    if (opts.plateStls !== false) files[`${base}.stl`] = concatStl(stlChunks.map((c) => meshToStl(c.mesh, c.name, c.t)), plate.name);
    progress((i / r.plates.length) * 0.6, `Plate ${i + 1}/${r.plates.length}`);
  });

  // Individual STLs
  if (opts.individualStls !== false) {
    r.parts.filter((p) => p.kind !== 'tape' && p.kind !== 'tapeText').forEach((p, i) => {
      const dir = p.kind === 'tile' ? 'tiles' : p.kind === 'line' ? `lines/${slugify(p.colorName)}` : p.kind.startsWith('label') ? 'labels' : 'stations';
      files[`parts/${dir}/${p.id}.stl`] = meshToStl(p.mesh, p.name, { dx: -p.bbox.min[0], dy: -p.bbox.min[1], dz: -p.bbox.min[2] });
      if (i % 100 === 0) progress(0.6 + 0.2 * (i / r.parts.length), `Part STL ${i + 1}/${r.parts.length}`);
    });
  }

  // Assembled 3MF (all parts in place, coloured) — useful for multi-material printers and viewing.
  files['assembled.3mf'] = write3mf(r.parts.filter((p) => p.kind !== 'tape' && p.kind !== 'tapeText').map((p) => ({ name: p.name, mesh: p.mesh, color: p.color })), `${r.network.displayName} — assembled`);

  // Previews / AR
  const bounds = { width: r.layout.width, height: r.layout.height };
  if (opts.ar !== false) {
    progress(0.85, 'AR models');
    files['ar/metromap.glb'] = partsToGlb(r.parts, { bounds });
    files['ar/metromap.usdz'] = partsToUsdz(r.parts, { bounds, anchoring: 'wall' });
  }
  files['map.svg'] = enc(renderSvg(r.layout, r.params, { fontDataUrl: opts.fontDataUrl, title: r.network.displayName }));
  files['template.svg'] = enc(renderSvg(r.layout, r.params, { fontDataUrl: opts.fontDataUrl, template: true, tiles: r.tiles, title: `${r.network.displayName} template` }));
  // Assembly plan + IDs
  const plan = buildAssemblyPlan(r);
  files['assembly/plan.json'] = enc(JSON.stringify(plan));
  files['assembly/assembly-plan.svg'] = enc(renderAssemblyPlanSvg(r, plan, { fontDataUrl: opts.fontDataUrl }));
  for (const step of plan.steps) if (step.id.startsWith('line-')) files[`assembly/step-${slugify(step.title)}.svg`] = enc(renderAssemblyPlanSvg(r, plan, { fontDataUrl: opts.fontDataUrl, step: step.id }));
  const csv = tapeLabelsCsv(r);
  if (csv) files['labels-tape.csv'] = enc(csv);
  // G-code + schedule
  if (opts.sliced) {
    opts.sliced.plates.forEach((sp, i) => {
      const n = String(i + 1).padStart(2, '0');
      const ext = sp.printerId.startsWith('ultimaker') ? '.gcode' : '.gcode';
      files[`gcode/${slugify(sp.printerId)}/${n}-${slugify(sp.name)}${ext}`] = enc(sp.gcode);
    });
    files['gcode/schedule.json'] = enc(JSON.stringify({ makespanSec: opts.sliced.schedule.makespanSec, totalPrintSec: opts.sliced.totalSec, totalGrams: opts.sliced.totalGrams, changeoverSec: opts.sliced.changeoverSec, printers: opts.sliced.schedule.perPrinter, assignments: opts.sliced.schedule.assignments, plates: opts.sliced.plates.map((p) => ({ plate: p.plateId, name: p.name, printer: p.printerName, printerId: p.printerId, timeSec: p.timeSec, grams: p.stats.filamentGrams, layers: p.stats.layers })) }, null, 2));
  }
  files['manifest.json'] = enc(JSON.stringify(manifest(r, plateFiles), null, 2));
  files['README.md'] = enc(printGuide(r, plateFiles, opts.sliced));
  progress(1, 'Done');
  return files;
}

export function zipBundle(files: BundleFiles): Uint8Array {
  return zipSync(files, { level: 4 });
}

function concatStl(stls: Uint8Array[], name: string): Uint8Array {
  let tri = 0;
  for (const s of stls) tri += new DataView(s.buffer, s.byteOffset).getUint32(80, true);
  const out = new Uint8Array(84 + tri * 50);
  new Uint8Array(out.buffer, 0, 80).set(new TextEncoder().encode(`MetroCAD ${name}`.slice(0, 80)));
  new DataView(out.buffer).setUint32(80, tri, true);
  let o = 84;
  for (const s of stls) { const n = new DataView(s.buffer, s.byteOffset).getUint32(80, true); out.set(s.subarray(84, 84 + n * 50), o); o += n * 50; }
  return out;
}

function manifest(r: FullBuildResult, plateFiles: { plate: typeof r.plates[number]; file: string }[]) {
  const z = zLevels(r.params);
  return {
    generator: 'MetroCAD',
    city: r.network.query,
    place: r.network.displayName,
    attribution: r.network.source.attribution,
    generatedAt: new Date().toISOString(),
    sizeMm: { width: r.layout.width, height: r.layout.height },
    tiles: r.tiles,
    params: r.params,
    zLevels: z,
    stats: r.stats,
    lines: r.layout.lines.map((l) => ({ id: l.id, ref: l.ref, name: l.name, color: l.color, pieces: l.chains.length })),
    plates: plateFiles.map(({ plate, file }) => ({ id: plate.id, name: plate.name, color: plate.color, colorName: plate.colorName, colorChange: plate.colorChange, files: [`${file}.3mf`, `${file}.stl`], items: plate.items, fill: plate.fill, volumeMm3: plate.volumeMm3 })),
    parts: r.parts.map((p) => ({ id: p.id, name: p.name, kind: p.kind, color: p.color, colorName: p.colorName, group: p.group, volumeMm3: Math.round(p.volumeMm3), bbox: p.bbox })),
    warnings: r.warnings,
  };
}

function printGuide(r: FullBuildResult, plateFiles: { plate: typeof r.plates[number]; file: string }[], sliced?: FarmResult): string {
  const p = r.params;
  const z = zLevels(p);
  const byColor = new Map<string, { name: string; grams: number; plates: number; parts: number }>();
  for (const pl of r.plates) {
    const key = pl.color + pl.colorName;
    const e = byColor.get(key) ?? { name: `${pl.colorName} (${pl.color})`, grams: 0, plates: 0, parts: 0 };
    e.plates++;
    for (const it of pl.items) { const bb = itemBBox(r.parts, it.partId); e.parts += bb.parts.length; for (const part of bb.parts) e.grams += (part.volumeMm3 / 1000) * 1.24 * (part.kind === 'tile' ? 0.45 : 0.9); }
    byColor.set(key, e);
  }
  const lines: string[] = [];
  lines.push(`# ${r.network.displayName} — 3D-printed metro map`);
  lines.push('');
  lines.push(`Generated by MetroCAD. Map data ${r.network.source.attribution}.`);
  lines.push('');
  lines.push(`* Finished size: **${r.layout.width.toFixed(0)} × ${r.layout.height.toFixed(0)} mm**`);
  lines.push(`* ${r.stats.lines} lines, ${r.stats.stations} stations (${r.stats.majorStations} interchanges/termini), ${r.stats.labels} labels`);
  lines.push(`* ${r.stats.parts} parts on ${r.stats.plates} plates for a ${p.bed.x} × ${p.bed.y} mm bed`);
  lines.push(`* Estimated filament: **≈ ${Math.round(r.stats.estimatedGrams)} g** (tiles at ~15 % infill)`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('* `plates/NN-name.3mf` — one file per print job, parts already laid out, with colours. Open in PrusaSlicer / Bambu Studio / OrcaSlicer / Cura.');
  lines.push('* `plates/NN-name.stl` — the same plate as a plain multi-body STL.');
  lines.push('* `parts/**.stl` — every individual part, in case you want to re-arrange or reprint one.');
  lines.push('* `assembled.3mf` — everything in its final position, colour-coded (for multi-material printers or just to look at).');
  lines.push('* `ar/metromap.glb`, `ar/metromap.usdz` — AR/3D preview models (open the .usdz on an iPhone/iPad, the .glb on Android).');
  lines.push('* `map.svg` — the map as a vector image. `template.svg` — a 1:1 alignment template (print at 100 %, tape to the wall).');
  lines.push('');
  if (sliced) {
    lines.push('## Print schedule');
    lines.push('');
    const farm = r.params.farm.map((f) => `${f.count} × ${KNOWN_PRINTERS[f.printerId]?.name ?? f.printerId}`).join(', ');
    lines.push(`Farm: ${farm}. Total printing ${formatDuration(sliced.totalSec)} (${sliced.totalGrams.toFixed(0)} g sliced), **finishes in ${formatDuration(sliced.schedule.makespanSec)} wall-clock** with ${sliced.changeoverSec / 60} min between plates.`);
    lines.push('');
    lines.push('| Printer | Plates | Busy |');
    lines.push('|---|---|---|');
    for (const p of sliced.schedule.perPrinter) lines.push(`| ${p.printer} | ${p.jobs.map((j) => r.plates.findIndex((pl) => pl.id === j) + 1).join(', ')} | ${formatDuration(p.busySec)} |`);
    lines.push('');
    lines.push('G-code for each plate is in `gcode/<printer>/NN-name.gcode`, sliced for the printer it is scheduled on (0.2 mm layers, 2 walls, 8 % infill, PLA 215/60 °C).');
    lines.push('');
  }
  lines.push('## Print plates');
  lines.push('');
  lines.push('| # | Plate | Colour | Parts | Notes |');
  lines.push('|---|-------|--------|-------|-------|');
  plateFiles.forEach(({ plate, file }, i) => {
    const n = plate.items.reduce((s, it) => s + itemBBox(r.parts, it.partId).parts.length, 0);
    const note = plate.colorChange ? `Filament change to ${plate.colorChange.colorName} (${plate.colorChange.color}) at Z = ${plate.colorChange.atZ.toFixed(1)} mm` : '';
    lines.push(`| ${i + 1} | ${plate.name} (\`${file}.3mf\`) | ${plate.colorName} \`${plate.color}\` | ${n} | ${note} |`);
  });
  lines.push('');
  lines.push('## Filament per colour');
  lines.push('');
  for (const e of byColor.values()) lines.push(`* ${e.name}: ≈ ${Math.round(e.grams)} g, ${e.parts} parts on ${e.plates} plate(s)`);
  lines.push('');
  lines.push('## Print settings');
  lines.push('');
  lines.push('* 0.4 mm nozzle, 0.2 mm layers (0.12 mm for the label plates gives crisper letters).');
  lines.push('* Matte PLA looks best. Everything prints flat with no supports.');
  lines.push(`* Clearance between mating parts is ${p.clearance} mm. If parts are too tight, sand lightly or regenerate with a larger clearance; if too loose, use a dab of glue.`);
  lines.push(`* Label plates are two colours in one object: print the plate colour, then change filament at Z = ${(z.baseTop - z.labelPocketFloor).toFixed(1)} mm (the slicer's "colour change" / M600 at that height) for the letters.`);
  lines.push('');
  lines.push('## Assembly');
  lines.push('');
  if (p.base === 'tiles') {
    lines.push(`1. Print the ${r.tiles.cols} × ${r.tiles.rows} base tiles (${r.tiles.w.toFixed(0)} × ${r.tiles.h.toFixed(0)} mm each). Lay them out face-up in a grid; the line grooves show you the order.`);
    lines.push('2. Press the line pieces into their grooves. Pieces are cut so that joints fall under station markers or at straight runs; every piece that crosses a tile seam locks the two tiles together.');
    lines.push('3. Drop the station dots into their holes, then the interchange rings and their white plugs.');
    lines.push('4. Seat each label plate in its pocket (the pocket outline matches the label shape).');
    lines.push('');
    lines.push('Every tile, line piece and label plate has its ID engraved on the underside; `assembly/assembly-plan.svg` shows where each ID goes, `assembly/step-line-*.svg` one line at a time, and the web app\'s **Assemble** mode walks through the steps with AR.');
    if (r.layout.labels.some((l) => l.tape)) lines.push(`Labels are made with a ${r.params.tapeWidth} mm label maker: print the texts in \`labels-tape.csv\` and stick each into its pocket (IDs T001… on the plan).`);
    lines.push('5. Mount on the wall with double-sided foam tape or Command strips on the back of each tile' + (p.keyholes ? ', or use the keyhole slots on the back.' : '.'));
  } else {
    lines.push('1. Print `template.svg` at 100 % (poster print or tiled A4/Letter) and tape it to the wall.');
    lines.push('2. Stick each part onto the template with double-sided tape or removable putty, then carefully tear the paper away.');
  }
  lines.push('');
  if (r.warnings.length) { lines.push('## Notes'); lines.push(''); for (const w of r.warnings) lines.push(`* ${w}`); }
  return lines.join('\n');
}
