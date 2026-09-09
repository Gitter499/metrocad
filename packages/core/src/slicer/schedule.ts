/** Print-farm scheduling: assign plate jobs to printers (LPT greedy) and report the wall-clock makespan. */

export interface Job { id: string; name: string; timeSec: number; printerType?: string }
export interface PrinterPool { type: string; name: string; count: number; /** Speed factor relative to the sliced time (1 = as sliced). */ speedFactor?: number }

export interface Schedule {
  makespanSec: number;
  totalPrintSec: number;
  assignments: { jobId: string; printer: string; startSec: number; endSec: number }[];
  perPrinter: { printer: string; type: string; busySec: number; jobs: string[] }[];
}

export function scheduleJobs(jobs: Job[], pools: PrinterPool[], opts: { changeoverSec?: number } = {}): Schedule {
  const changeover = opts.changeoverSec ?? 300;
  const printers = pools.flatMap((p) => Array.from({ length: Math.max(0, p.count) }, (_, i) => ({ name: p.count > 1 ? `${p.name} #${i + 1}` : p.name, type: p.type, factor: p.speedFactor ?? 1, free: 0, jobs: [] as string[] })));
  const assignments: Schedule['assignments'] = [];
  if (!printers.length) return { makespanSec: Infinity, totalPrintSec: jobs.reduce((s, j) => s + j.timeSec, 0), assignments, perPrinter: [] };
  const sorted = [...jobs].sort((a, b) => b.timeSec - a.timeSec);
  for (const j of sorted) {
    const eligible = printers.filter((p) => !j.printerType || p.type === j.printerType);
    if (!eligible.length) continue;
    let best = eligible[0];
    for (const p of eligible) if (p.free + j.timeSec * p.factor < best.free + j.timeSec * best.factor) best = p;
    const start = best.free;
    const end = start + j.timeSec * best.factor;
    assignments.push({ jobId: j.id, printer: best.name, startSec: start, endSec: end });
    best.free = end + changeover;
    best.jobs.push(j.id);
  }
  const makespan = Math.max(0, ...assignments.map((a) => a.endSec));
  return {
    makespanSec: makespan,
    totalPrintSec: assignments.reduce((s, a) => s + (a.endSec - a.startSec), 0),
    assignments,
    perPrinter: printers.map((p) => ({ printer: p.name, type: p.type, busySec: Math.max(0, p.free - changeover), jobs: p.jobs })),
  };
}

export function formatDuration(sec: number): string {
  if (!isFinite(sec)) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.round((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
