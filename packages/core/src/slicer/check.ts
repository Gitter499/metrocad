/**
 * G-code safety check and dry-run conversion.
 *
 * `checkGcode` replays a file the way the printer's motion planner would (absolute/relative modes,
 * G92 resets, homing) and verifies that nothing in it can hurt the machine: every move stays inside
 * the build volume, nothing moves before homing, heater targets stay within the printer's limits,
 * extrusion only happens with a hot nozzle above the bed, feedrates and volumetric flow stay sane,
 * heaters are off at the end, and only known, harmless commands are used. When the caller knows
 * what is on the plate, the extruded envelope is compared with it, which catches a slicer that
 * silently printed something other than the parts.
 *
 * `dryRunGcode` turns a file into an "air print": same motion, lifted 20 mm, no heat, no extrusion,
 * no pauses. Running it first proves that the printer accepts the file and follows the intended
 * toolpath, before any plastic or heat is involved.
 */
import type { PrinterProfile } from './profiles.js';

export interface GcodeCheckOptions {
  /** Expected XY envelope and height of the printed parts (mm), used to verify the toolpath matches the plate. */
  expected?: { min: [number, number]; max: [number, number]; height: number };
  /** Maximum volumetric flow (mm³/s) before a warning. Default 20 (a 0.4 mm hotend's comfortable ceiling). */
  maxFlow?: number;
}

export interface GcodeCheckStats {
  lines: number;
  moves: number;
  layers: number;
  extrudeMm: number;
  filamentMm: number;
  maxFeedMmS: number;
  maxFlowMm3S: number;
  maxNozzleC: number;
  maxBedC: number;
  /** Envelope of extrusion moves after the first layer marker. */
  envelope?: { min: [number, number]; max: [number, number] };
  maxZ: number;
  unknownCommands: string[];
}

export interface GcodeCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: GcodeCheckStats;
}

/** Commands the built-in slicer emits or that are harmless on every supported firmware. */
const KNOWN = new Set(['G0', 'G1', 'G4', 'G28', 'G29', 'G90', 'G91', 'G92', 'M17', 'M73', 'M82', 'M83', 'M84', 'M104', 'M105', 'M106', 'M107', 'M109', 'M117', 'M140', 'M190', 'M204', 'M205', 'M220', 'M221', 'M400', 'M600', 'M900', 'T0']);
/** Commands that change printer settings or state in ways a print file never should. */
const FORBIDDEN: Record<string, string> = {
  M112: 'emergency stop', M500: 'saves settings to EEPROM', M502: 'resets settings to factory', M303: 'PID autotune', M92: 'changes steps per mm',
  M301: 'changes PID', M304: 'changes bed PID', M851: 'changes the probe Z offset', M206: 'changes home offsets', M428: 'sets home offsets from the current position',
  M999: 'restarts after a stop', M997: 'firmware update', M1000: 'power loss recovery', M1002: 'Bambu internal macro', M1003: 'Bambu internal macro', M976: 'Bambu camera/timelapse control',
};

export function checkGcode(gcode: string, printer: PrinterProfile, opts: GcodeCheckOptions = {}): GcodeCheckResult {
  const errors: string[] = [], warnings: string[] = [];
  const err = (s: string) => { if (errors.length < 40) errors.push(s); };
  const warn = (s: string) => { if (warnings.length < 40) warnings.push(s); };
  const bed = printer.bed;
  const maxNozzle = printer.maxNozzleTemp ?? 300, maxBed = printer.maxBedTemp ?? 110;
  const maxFeed = Math.max(printer.maxSpeed, printer.travelSpeed) * 1.05; // mm/s
  const maxFlow = opts.maxFlow ?? 20;
  const filamentArea = Math.PI * (printer.filamentDiameter / 2) ** 2;

  let absXYZ = true, absE = true, homed = false;
  let x = NaN, y = NaN, z = NaN, e = 0, f = 0;
  let nozzleTarget = 0, bedTarget = 0;
  const stats: GcodeCheckStats = { lines: 0, moves: 0, layers: 0, extrudeMm: 0, filamentMm: 0, maxFeedMmS: 0, maxFlowMm3S: 0, maxNozzleC: 0, maxBedC: 0, maxZ: 0, unknownCommands: [] };
  let inPrint = false; // after the first ;LAYER: marker (start G-code purge lines are excluded from the envelope)
  let inSkirt = false; // ;TYPE:SKIRT sections sit outside the parts by design
  // Griffin (Ultimaker) files carry temperatures in the header and the printer homes and heats itself.
  const griffin = printer.flavor === 'ultimaker' || /^;START_OF_HEADER/m.test(gcode);
  if (griffin) {
    const nz = /;EXTRUDER_TRAIN\.0\.INITIAL_TEMPERATURE:(\d+(?:\.\d+)?)/.exec(gcode), bd = /;BUILD_PLATE\.INITIAL_TEMPERATURE:(\d+(?:\.\d+)?)/.exec(gcode);
    if (!nz) err('Griffin header has no EXTRUDER_TRAIN.0.INITIAL_TEMPERATURE');
    if (nz) { nozzleTarget = parseFloat(nz[1]); stats.maxNozzleC = nozzleTarget; if (nozzleTarget > maxNozzle) err(`header nozzle temperature ${nozzleTarget} °C exceeds the ${printer.name} limit of ${maxNozzle} °C`); }
    if (bd) { bedTarget = parseFloat(bd[1]); stats.maxBedC = bedTarget; if (bedTarget > maxBed) err(`header bed temperature ${bedTarget} °C exceeds the ${printer.name} limit of ${maxBed} °C`); }
    homed = true; x = 0; y = 0; z = 0;
  }
  let envMin: [number, number] = [Infinity, Infinity], envMax: [number, number] = [-Infinity, -Infinity];
  const unknown = new Set<string>();
  let oob = 0, coldExtrusion = 0, flowHits = 0, feedHits = 0;

  const lines = gcode.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    stats.lines++;
    const semi = raw.indexOf(';');
    const text = (semi >= 0 ? raw.slice(0, semi) : raw).trim();
    if (semi >= 0) { const c = raw.trim(); if (c.startsWith(';LAYER:')) { inPrint = true; stats.layers++; } else if (c.startsWith(';TYPE:')) inSkirt = c === ';TYPE:SKIRT'; }
    if (!text) continue;
    const tokens = text.split(/\s+/);
    const cmd = tokens[0].toUpperCase();
    const p: Record<string, number> = {};
    for (const t of tokens.slice(1)) { const k = t[0].toUpperCase(); const v = parseFloat(t.slice(1)); if (!isNaN(v)) p[k] = v; }
    const at = `line ${ln + 1}`;

    if (FORBIDDEN[cmd]) { err(`${at}: ${cmd} (${FORBIDDEN[cmd]}) must never appear in a print file`); continue; }
    if (!KNOWN.has(cmd)) { unknown.add(cmd); continue; }

    switch (cmd) {
      case 'G90': absXYZ = true; break;
      case 'G91': absXYZ = false; break;
      case 'M82': absE = true; break;
      case 'M83': absE = false; break;
      case 'G28': homed = true; x = 0; y = 0; z = 0; break;
      case 'G92': if ('E' in p) e = p.E; if ('X' in p) x = p.X; if ('Y' in p) y = p.Y; if ('Z' in p) z = p.Z; break;
      case 'M104': case 'M109': {
        const s = p.S ?? 0;
        if (s > maxNozzle) err(`${at}: nozzle target ${s} °C exceeds the ${printer.name} limit of ${maxNozzle} °C`);
        nozzleTarget = s; stats.maxNozzleC = Math.max(stats.maxNozzleC, s); break;
      }
      case 'M140': case 'M190': {
        const s = p.S ?? 0;
        if (s > maxBed) err(`${at}: bed target ${s} °C exceeds the ${printer.name} limit of ${maxBed} °C`);
        bedTarget = s; stats.maxBedC = Math.max(stats.maxBedC, s); break;
      }
      case 'G0': case 'G1': {
        const hasMove = 'X' in p || 'Y' in p || 'Z' in p;
        if (hasMove && !homed) { if (!errors.some((s) => s.includes('before homing'))) err(`${at}: axis move before homing (G28)`); homed = true; x = x || 0; y = y || 0; z = z || 0; }
        if ('F' in p) { f = p.F / 60; stats.maxFeedMmS = Math.max(stats.maxFeedMmS, f); if (f > maxFeed && feedHits++ < 3) err(`${at}: feedrate ${f.toFixed(0)} mm/s exceeds the ${printer.name} limit of ${maxFeed.toFixed(0)} mm/s`); }
        const nx = 'X' in p ? (absXYZ ? p.X : x + p.X) : x;
        const ny = 'Y' in p ? (absXYZ ? p.Y : y + p.Y) : y;
        const nz = 'Z' in p ? (absXYZ ? p.Z : z + p.Z) : z;
        let de = 0;
        if ('E' in p) { de = absE ? p.E - e : p.E; e = absE ? p.E : e + p.E; }
        if (hasMove) {
          stats.moves++;
          const tol = 0.01;
          if (nx < -tol || nx > bed.x + tol || ny < -tol || ny > bed.y + tol) { if (oob++ < 5) err(`${at}: move to X${nx.toFixed(2)} Y${ny.toFixed(2)} leaves the ${bed.x} × ${bed.y} mm bed`); }
          if (nz < -tol) err(`${at}: Z${nz.toFixed(2)} is below the bed`);
          if (nz > bed.z + tol) err(`${at}: Z${nz.toFixed(2)} exceeds the ${bed.z} mm build height`);
          const d = Math.hypot(nx - x, ny - y);
          if (de > 0) {
            stats.filamentMm += de;
            if (d > 0) {
              stats.extrudeMm += d;
              if (f > 0) { const flow = (de * filamentArea * f) / d; stats.maxFlowMm3S = Math.max(stats.maxFlowMm3S, flow); if (flow > maxFlow && flowHits++ < 3) warn(`${at}: volumetric flow ${flow.toFixed(1)} mm³/s is above ${maxFlow} mm³/s`); }
              if (de / d > 0.6) err(`${at}: ${(de / d).toFixed(2)} mm of filament per mm of travel is not a plausible extrusion`);
            }
            if (nozzleTarget < 150 && coldExtrusion++ < 3) err(`${at}: extruding with the nozzle target at ${nozzleTarget} °C`);
            if (nz <= 0.05) err(`${at}: extruding at Z${nz.toFixed(2)}, on or below the bed`);
            if (inPrint && !inSkirt && d > 0) { envMin = [Math.min(envMin[0], x, nx), Math.min(envMin[1], y, ny)]; envMax = [Math.max(envMax[0], x, nx), Math.max(envMax[1], y, ny)]; stats.maxZ = Math.max(stats.maxZ, nz); }
          }
          x = nx; y = ny; z = nz;
        } else if (de > 0) stats.filamentMm += de;
        break;
      }
      case 'M600': case 'M400': case 'G4': case 'M84': case 'M17': case 'G29': case 'M106': case 'M107': case 'M73': case 'M105': case 'M117': case 'M204': case 'M205': case 'M220': case 'M221': case 'M900': case 'T0':
        break;
    }
  }

  stats.unknownCommands = [...unknown];
  if (unknown.size) warn(`unknown commands (ignored by most firmwares, check yours): ${[...unknown].join(', ')}`);
  if (oob > 5) err(`… ${oob - 5} more moves outside the bed`);
  if (!griffin) {
    if (nozzleTarget !== 0) err(`file ends with the nozzle target at ${nozzleTarget} °C (expected 0)`);
    if (bedTarget !== 0) err(`file ends with the bed target at ${bedTarget} °C (expected 0)`);
    if (!homed) err('the file never homes the printer (no G28)');
  }
  if (stats.layers === 0) err('no layers were found');
  if (stats.filamentMm <= 0) err('the file extrudes no filament');
  if (isFinite(envMin[0])) {
    stats.envelope = { min: envMin, max: envMax };
    if (opts.expected) {
      const ex = opts.expected, tol = 1.0;
      const off = Math.max(ex.min[0] - envMin[0], ex.min[1] - envMin[1], envMax[0] - ex.max[0], envMax[1] - ex.max[1]);
      if (off > tol) err(`toolpath extends ${off.toFixed(1)} mm beyond the parts on this plate (${fmtBox(envMin, envMax)} vs ${fmtBox(ex.min, ex.max)})`);
      const inside = Math.max(envMin[0] - ex.min[0], envMin[1] - ex.min[1], ex.max[0] - envMax[0], ex.max[1] - envMax[1]);
      if (inside > 3) warn(`toolpath is ${inside.toFixed(1)} mm smaller than the parts on this plate (${fmtBox(envMin, envMax)} vs ${fmtBox(ex.min, ex.max)})`);
      if (stats.maxZ > ex.height + 0.35) err(`toolpath reaches Z${stats.maxZ.toFixed(2)} but the tallest part is ${ex.height.toFixed(2)} mm`);
      if (stats.maxZ < ex.height - 0.35) warn(`toolpath stops at Z${stats.maxZ.toFixed(2)} but the tallest part is ${ex.height.toFixed(2)} mm`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}

const fmtBox = (a: [number, number], b: [number, number]) => `[${a[0].toFixed(1)},${a[1].toFixed(1)}]–[${b[0].toFixed(1)},${b[1].toFixed(1)}]`;

export interface DryRunOptions {
  /** How far above the real toolpath the air print runs (mm). Default 20. */
  lift?: number;
}

/**
 * Air-print version of a G-code file: the same motion lifted by `lift` mm, no extrusion, all heaters
 * commanded off and never waited for, pauses removed. Prints nothing, heats nothing, and lets you watch
 * the printer trace the toolpath.
 */
export function dryRunGcode(gcode: string, opts: DryRunOptions = {}): string {
  const lift = opts.lift ?? 20;
  const out: string[] = [
    `; MetroCAD DRY RUN — air print ${lift} mm above the bed: no heat, no extrusion, no pauses.`,
    '; Use it to confirm the printer accepts the file and follows the toolpath before printing for real.',
    'M104 S0 ; nozzle heater off',
    'M140 S0 ; bed heater off',
    'M107 ; fan off',
  ];
  let absXYZ = true;
  for (const raw of gcode.split(/\r?\n/)) {
    const semi = raw.indexOf(';');
    const text = (semi >= 0 ? raw.slice(0, semi) : raw).trim();
    if (!text) { out.push(raw); continue; }
    const cmd = text.split(/\s+/)[0].toUpperCase();
    if (cmd === 'G90') absXYZ = true;
    if (cmd === 'G91') absXYZ = false;
    if (cmd === 'M104' || cmd === 'M140') { out.push(`${cmd} S0 ; dry run: heater off (was: ${text})`); continue; }
    if (cmd === 'M109' || cmd === 'M190' || cmd === 'M600' || (cmd === 'M400' && /U1/i.test(text)) || cmd === 'M106') { out.push(`; dry run, skipped: ${text}`); continue; }
    if (cmd === 'G0' || cmd === 'G1') {
      let line = text.replace(/\s*E-?\d*\.?\d+/i, '');
      if (absXYZ) line = line.replace(/Z(-?\d*\.?\d+)/i, (_, v) => `Z${(parseFloat(v) + lift).toFixed(3)}`);
      if (/^G[01]$/i.test(line.trim())) { out.push(`; dry run, skipped: ${text}`); continue; } // an extrusion-only move
      out.push(line);
      continue;
    }
    if (cmd === 'G92' && /E/i.test(text)) { out.push(text); continue; }
    out.push(raw);
  }
  return out.join('\n') + '\n';
}

/** Markdown table of check results for a set of files. */
export function checkReportMarkdown(rows: { file: string; printer: string; result: GcodeCheckResult }[]): string {
  const lines: string[] = ['# G-code safety check', '', 'Every file was replayed against its printer\'s limits before it was written: moves inside the build volume, homing first, heater targets within limits, no cold extrusion, heaters off at the end, only known commands, and a toolpath envelope that matches the parts on the plate. Files that failed are in `gcode/rejected/` with the reason and must not be printed.', '', '| File | Printer | Result | Layers | Max Z | Envelope (mm) | Max nozzle / bed | Max feed | Max flow |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    const s = r.result.stats;
    const env = s.envelope ? `${(s.envelope.max[0] - s.envelope.min[0]).toFixed(0)} × ${(s.envelope.max[1] - s.envelope.min[1]).toFixed(0)}` : '–';
    lines.push(`| ${r.file} | ${r.printer} | ${r.result.ok ? '✅ pass' : '❌ **REJECTED**'}${r.result.warnings.length ? ` (${r.result.warnings.length} warning${r.result.warnings.length > 1 ? 's' : ''})` : ''} | ${s.layers} | ${s.maxZ.toFixed(2)} | ${env} | ${s.maxNozzleC} / ${s.maxBedC} °C | ${s.maxFeedMmS.toFixed(0)} mm/s | ${s.maxFlowMm3S.toFixed(1)} mm³/s |`);
  }
  const problems = rows.filter((r) => r.result.errors.length || r.result.warnings.length);
  if (problems.length) {
    lines.push('', '## Details', '');
    for (const r of problems) {
      lines.push(`### ${r.file}`, '');
      for (const e of r.result.errors) lines.push(`* ❌ ${e}`);
      for (const w of r.result.warnings) lines.push(`* ⚠️ ${w}`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
