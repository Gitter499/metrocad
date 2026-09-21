#!/usr/bin/env node
// Replay G-code files against a printer's limits: node scripts/gcode-check.mjs <file|dir> [--printer bambu-a1-mini]
// Exit code 1 if any file fails. Use it on files you edited by hand or produced elsewhere before sending them to a machine.
import fs from 'node:fs';
import path from 'node:path';
import { checkGcode, getPrinterProfile } from '@metrocad/core';
const args = process.argv.slice(2);
const pi = args.indexOf('--printer');
const printerId = pi >= 0 ? args[pi + 1] : 'bambu-a1-mini';
const targets = args.filter((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1));
if (!targets.length) { console.error('usage: gcode-check <file|dir> [--printer id]'); process.exit(2); }
const printer = getPrinterProfile(printerId);
const files = targets.flatMap((t) => fs.statSync(t).isDirectory() ? fs.readdirSync(t, { recursive: true }).map((f) => path.join(t, String(f))).filter((f) => f.endsWith('.gcode')) : [t]);
let failed = 0;
for (const f of files) {
  const r = checkGcode(fs.readFileSync(f, 'utf8'), printer);
  const s = r.stats;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${f}  layers ${s.layers}, maxZ ${s.maxZ.toFixed(2)}, nozzle ${s.maxNozzleC} °C, bed ${s.maxBedC} °C, feed ${s.maxFeedMmS.toFixed(0)} mm/s, flow ${s.maxFlowMm3S.toFixed(1)} mm³/s${s.envelope ? `, envelope ${(s.envelope.max[0] - s.envelope.min[0]).toFixed(0)}×${(s.envelope.max[1] - s.envelope.min[1]).toFixed(0)} mm` : ''}`);
  for (const e of r.errors) console.log(`      ERROR ${e}`);
  for (const w of r.warnings) console.log(`      warn  ${w}`);
  if (!r.ok) failed++;
}
console.log(`${files.length - failed}/${files.length} passed for ${printer.name}`);
process.exit(failed ? 1 : 0);
