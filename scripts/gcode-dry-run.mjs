#!/usr/bin/env node
// Turn a G-code file into an air print (no heat, no extrusion, lifted 20 mm): node scripts/gcode-dry-run.mjs in.gcode out.gcode [lift]
import fs from 'node:fs';
import { dryRunGcode } from '@metrocad/core';
const [inp, out, lift] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: gcode-dry-run in.gcode out.gcode [lift_mm]'); process.exit(2); }
fs.writeFileSync(out, dryRunGcode(fs.readFileSync(inp, 'utf8'), { lift: lift ? Number(lift) : undefined }));
console.log(`wrote ${out}`);
