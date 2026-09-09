import type { Vec2 } from './types.js';

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};
/** Left-hand perpendicular. */
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const angleOf = (a: Vec2): number => Math.atan2(a[1], a[0]);
export const fromAngle = (t: number, r = 1): Vec2 => [Math.cos(t) * r, Math.sin(t) * r];
export const rotate = (a: Vec2, t: number): Vec2 => {
  const c = Math.cos(t), s = Math.sin(t);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};

/** Intersection of infinite lines p + t*d and q + u*e; undefined when (near) parallel. */
export function lineIntersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | undefined {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return undefined;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

/** Distance from point p to segment ab. */
export function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign(cross(sub(q, p), sub(r, p)));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

export interface Rect { x: number; y: number; w: number; h: number }

export const rectsOverlap = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export function rectSegDist(r: Rect, a: Vec2, b: Vec2): number {
  // distance from segment to axis-aligned rectangle (0 if intersecting)
  const corners: Vec2[] = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const inside = (p: Vec2) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
  if (inside(a) || inside(b)) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const c = corners[i], d = corners[(i + 1) % 4];
    if (segmentsIntersect(a, b, c, d)) return 0;
    best = Math.min(best, pointSegDist(c, a, b), pointSegDist(a, c, d), pointSegDist(b, c, d));
  }
  return best;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bboxOf(points: Vec2[]): Rect {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of points) {
    if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y;
  }
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
}
