import { describe, it, expect } from 'vitest';
import { scheduleJobs, formatDuration } from './schedule.js';

describe('scheduleJobs', () => {
  const jobs = [1, 2, 3, 4, 5].map((n) => ({ id: `j${n}`, name: `job ${n}`, timeSec: n * 3600 }));
  it('spreads jobs over printers', () => {
    const s = scheduleJobs(jobs, [{ type: 'a1', name: 'A1 mini', count: 3 }], { changeoverSec: 0 });
    const total = jobs.reduce((a, j) => a + j.timeSec, 0);
    expect(s.makespanSec).toBeLessThanOrEqual(total);
    expect(s.makespanSec).toBeGreaterThanOrEqual(5 * 3600);
    expect(s.assignments.length).toBe(5);
    expect(s.makespanSec).toBe(5 * 3600); // LPT: 5 | 4+1 | 3+2
  });
  it('respects printer types and speed factors', () => {
    const s = scheduleJobs(jobs, [{ type: 'a1', name: 'A1', count: 1 }, { type: 's3', name: 'S3', count: 1, speedFactor: 2 }], { changeoverSec: 0 });
    expect(s.perPrinter.length).toBe(2);
    expect(s.totalPrintSec).toBeGreaterThan(15 * 3600);
  });
  it('formats durations', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(90000)).toBe('1d 1h 0m');
  });
});
