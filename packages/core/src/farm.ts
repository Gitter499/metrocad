/** Slice every plate for the printer the farm scheduler assigns it to, and produce the schedule. */
import type { ManifoldToplevel } from 'manifold-3d';
import type { FullBuildResult } from './pipeline.js';
import { itemBBox, placementTransform } from './pack.js';
import { slicePlate, type SliceStats } from './slicer/slice.js';
import { checkGcode, dryRunGcode, type GcodeCheckResult } from './slicer/check.js';
import { buildTestCoupon, type TestCoupon } from './coupon.js';
import type { Part, Plate } from './types.js';
import { getPrinterProfile, processFor } from './slicer/profiles.js';
import { scheduleJobs, type Schedule } from './slicer/schedule.js';
import { KNOWN_PRINTERS } from './defaults.js';

export interface SlicedPlate {
  plateId: string;
  name: string;
  color: string;
  colorName: string;
  printerId: string;
  printerName: string;
  gcode: string;
  stats: SliceStats;
  /** Estimated time on the assigned printer (speed factor applied). */
  timeSec: number;
  /** Safety check of the G-code against the printer's limits and the plate contents. Never print a file with `check.ok === false`. */
  check: GcodeCheckResult;
}

export interface CouponGcode { printerId: string; printerName: string; gcode: string; stats: SliceStats; check: GcodeCheckResult }

export interface FarmResult {
  plates: SlicedPlate[];
  /** Air-print version of the first plate scheduled on each printer type (no heat, no extrusion). */
  dryRuns: { printerId: string; plateId: string; plateName: string; gcode: string }[];
  /** Small fit/printer test cut from the real geometry, sliced for every printer type in the farm. */
  coupon?: TestCoupon & { gcode: CouponGcode[] };
  /** Number of plates whose G-code failed the safety check. */
  rejected: number;
  schedule: Schedule;
  totalSec: number;
  totalGrams: number;
  changeoverSec: number;
}

export interface FarmOptions {
  onProgress?: (fraction: number, detail: string) => void;
  /** Minutes between plates on one printer (remove parts, clean bed, start next). Default 8. */
  changeoverMin?: number;
  /** Build and slice the test coupon (default true). */
  coupon?: boolean;
}

export function sliceAndSchedule(r: FullBuildResult, manifold: ManifoldToplevel, opts: FarmOptions = {}): FarmResult {
  const farm = r.params.farm.length ? r.params.farm : [{ printerId: 'bambu-a1-mini', count: 1, bed: r.params.bed, speedFactor: 1 }];
  const changeoverSec = (opts.changeoverMin ?? 8) * 60;
  // 1. Reference slice on the first farm printer to get relative plate times.
  const refPrinter = getPrinterProfile(farm[0].printerId);
  const refProcess = processFor(refPrinter);
  const ref = r.plates.map((plate, i) => {
    opts.onProgress?.((i / r.plates.length) * 0.5, `Estimating ${plate.name}`);
    const res = slicePlate({ objects: objectsOf(r, plate), printer: refPrinter, process: refProcess, label: plate.name }, manifold);
    return { plate, res };
  });
  // 2. Schedule across the farm.
  const jobs = ref.map(({ plate, res }) => ({ id: plate.id, name: plate.name, timeSec: res.stats.timeSec / (farm[0].speedFactor ?? 1) }));
  const pools = farm.map((f) => ({ type: f.printerId, name: KNOWN_PRINTERS[f.printerId]?.short ?? f.printerId, count: f.count, speedFactor: f.speedFactor ?? KNOWN_PRINTERS[f.printerId]?.speedFactor ?? 1 }));
  const schedule = scheduleJobs(jobs, pools, { changeoverSec });
  // 3. Re-slice each plate for its assigned printer when it differs from the reference.
  const byPrinterType = new Map(schedule.perPrinter.map((p) => [p.printer, p.type]));
  const plates: SlicedPlate[] = [];
  let totalSec = 0, totalGrams = 0;
  ref.forEach(({ plate, res }, i) => {
    const a = schedule.assignments.find((x) => x.jobId === plate.id);
    const type = a ? byPrinterType.get(a.printer) ?? farm[0].printerId : farm[0].printerId;
    let out = res;
    if (type !== refPrinter.id) {
      opts.onProgress?.(0.5 + (i / r.plates.length) * 0.5, `Slicing ${plate.name} for ${KNOWN_PRINTERS[type]?.short ?? type}`);
      const printer = getPrinterProfile(type);
      out = slicePlate({ objects: objectsOf(r, plate), printer, process: processFor(printer), label: plate.name }, manifold);
    }
    const timeSec = a ? a.endSec - a.startSec : out.stats.timeSec;
    const printer = getPrinterProfile(type);
    const check = checkGcode(out.gcode, printer, { expected: expectedEnvelope(r.parts, plate) });
    plates.push({ plateId: plate.id, name: plate.name, color: plate.color, colorName: plate.colorName, printerId: type, printerName: a?.printer ?? KNOWN_PRINTERS[type]?.short ?? type, gcode: out.gcode, stats: out.stats, timeSec, check });
    totalSec += timeSec; totalGrams += out.stats.filamentGrams;
  });
  // Dry runs: the first passing plate per printer type.
  const dryRuns: FarmResult['dryRuns'] = [];
  for (const type of new Set(plates.map((p) => p.printerId))) {
    const first = plates.find((p) => p.printerId === type && p.check.ok);
    if (first) dryRuns.push({ printerId: type, plateId: first.plateId, plateName: first.name, gcode: dryRunGcode(first.gcode) });
  }
  // Test coupon for every printer type in the farm.
  let coupon: FarmResult['coupon'];
  if (opts.coupon !== false) {
    opts.onProgress?.(0.97, 'Test coupon');
    const c = buildTestCoupon(r, manifold);
    if (c) {
      const gcode: CouponGcode[] = [];
      for (const f of farm) {
        if (gcode.some((g) => g.printerId === f.printerId)) continue;
        const printer = getPrinterProfile(f.printerId);
        const out = slicePlate({ objects: objectsFor(c.parts, c.plate), printer, process: processFor(printer), label: 'Test coupon' }, manifold);
        gcode.push({ printerId: f.printerId, printerName: KNOWN_PRINTERS[f.printerId]?.short ?? f.printerId, gcode: out.gcode, stats: out.stats, check: checkGcode(out.gcode, printer, { expected: expectedEnvelope(c.parts, c.plate) }) });
      }
      coupon = { ...c, gcode };
    }
  }
  opts.onProgress?.(1, 'Done');
  return { plates, schedule, totalSec, totalGrams, changeoverSec, dryRuns, coupon, rejected: plates.filter((p) => !p.check.ok).length };
}

/** XY envelope and height of the parts as placed on a plate. */
function expectedEnvelope(parts: Part[], plate: Plate): { min: [number, number]; max: [number, number]; height: number } {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, height = 0;
  for (const item of plate.items) {
    const bb = itemBBox(parts, item.partId);
    for (const p of bb.parts) {
      const t = (item.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
      const P = p.mesh.positions;
      for (let i = 0; i < P.length; i += 3) { const x = P[i] * c - P[i + 1] * s + item.dx, y = P[i] * s + P[i + 1] * c + item.dy; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
      height = Math.max(height, p.bbox.max[2] - bb.min[2]);
    }
  }
  return { min: [minx, miny], max: [maxx, maxy], height };
}

function objectsOf(r: FullBuildResult, plate: FullBuildResult['plates'][number]) { return objectsFor(r.parts, plate); }
export function objectsFor(parts: Part[], plate: Plate) {
  return plate.items.flatMap((item) => {
    const bb = itemBBox(parts, item.partId);
    return bb.parts.map((p) => ({ mesh: p.mesh, transform: placementTransform(item, bb.min[2]), name: p.name, colorChangeAtZ: plate.colorChange && p.kind === 'labelText' ? plate.colorChange.atZ : undefined }));
  });
}
