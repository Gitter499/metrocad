/** Slice every plate for the printer the farm scheduler assigns it to, and produce the schedule. */
import type { ManifoldToplevel } from 'manifold-3d';
import type { FullBuildResult } from './pipeline.js';
import { itemBBox, placementTransform } from './pack.js';
import { slicePlate, type SliceStats } from './slicer/slice.js';
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
}

export interface FarmResult {
  plates: SlicedPlate[];
  schedule: Schedule;
  totalSec: number;
  totalGrams: number;
  changeoverSec: number;
}

export interface FarmOptions {
  onProgress?: (fraction: number, detail: string) => void;
  /** Minutes between plates on one printer (remove parts, clean bed, start next). Default 8. */
  changeoverMin?: number;
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
    plates.push({ plateId: plate.id, name: plate.name, color: plate.color, colorName: plate.colorName, printerId: type, printerName: a?.printer ?? KNOWN_PRINTERS[type]?.short ?? type, gcode: out.gcode, stats: out.stats, timeSec });
    totalSec += timeSec; totalGrams += out.stats.filamentGrams;
  });
  opts.onProgress?.(1, 'Done');
  return { plates, schedule, totalSec, totalGrams, changeoverSec };
}

function objectsOf(r: FullBuildResult, plate: FullBuildResult['plates'][number]) {
  return plate.items.flatMap((item) => {
    const bb = itemBBox(r.parts, item.partId);
    return bb.parts.map((p) => ({ mesh: p.mesh, transform: placementTransform(item, bb.min[2]), name: p.name, colorChangeAtZ: plate.colorChange && p.kind === 'labelText' ? plate.colorChange.atZ : undefined }));
  });
}
