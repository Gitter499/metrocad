/**
 * Import an official/community schematic map (SVG) and use its geometry as the layout:
 * line paths by stroke colour, station positions by name, label positions from the text elements.
 * Tested with Wikimedia Commons metro diagrams (e.g. "London Underground full map.svg").
 */
import type { DesignParams, Hex, LayoutLabel, LayoutLine, LayoutStation, MetroNetwork, Vec2 } from './types.js';
import type { LayoutResult } from './layout/index.js';
import { roundedHull, markerRadiusMajor, dotRadius, tapeFontSize } from './layout/index.js';
import { placeLabels, type LabelCandidateInput, type Obstacles } from './layout/labels.js';
import { normalizeName } from './network.js';
import { filletPolyline, dedupe, splitForBed, paramOf, pointAt, pathLength, simplifyCollinear } from './layout/route.js';
import type { TextFont } from './text.js';
import { bboxOf, dist, sub, add, mul, dot, norm } from './vec.js';

/* ------------------------------ tiny SVG parser ------------------------------ */

type Mat = [number, number, number, number, number, number]; // a b c d e f
const I: Mat = [1, 0, 0, 1, 0, 0];
const mm = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m: Mat, p: Vec2): Vec2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const mscale = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

function parseTransform(t: string | undefined): Mat {
  if (!t) return I;
  let m: Mat = I;
  for (const [, fn, argStr] of t.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = argStr.split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Mat = I;
    if (fn === 'matrix' && a.length === 6) n = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (fn === 'translate') n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') { const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); n = [c, s, -s, c, 0, 0]; if (a.length === 3) n = mm(mm([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]); }
    else if (fn === 'skewX') n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mm(m, n);
  }
  return m;
}

interface El { tag: string; attrs: Record<string, string>; children: El[]; text: string; parent?: El }

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Regex-based XML tokenizer good enough for SVG produced by Inkscape/Illustrator. */
function parseXml(src: string): El {
  const root: El = { tag: 'root', attrs: {}, children: [], text: '' };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) { if (cur.parent) cur = cur.parent; continue; }
    if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const [, k, v] of (m[3] ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[k] = decode(v ?? '');
      if (m[3]) for (const [, k, , v2] of (m[3] ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) if (v2 !== undefined) attrs[k] = decode(v2);
      const el: El = { tag: m[2], attrs, children: [], text: '', parent: cur };
      cur.children.push(el);
      if (!m[4]) cur = el;
      continue;
    }
    if (m[5] && m[5].trim()) cur.text += decode(m[5]);
  }
  return root;
}

function styleOf(el: El, css: Map<string, Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  const chain: El[] = [];
  for (let e: El | undefined = el; e; e = e.parent) chain.unshift(e);
  for (const e of chain) {
    for (const cls of (e.attrs.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(out, css.get('.' + cls) ?? {});
    if (e.attrs.id && css.has('#' + e.attrs.id)) Object.assign(out, css.get('#' + e.attrs.id));
    for (const k of ['stroke', 'stroke-width', 'fill', 'font-size', 'text-anchor', 'display', 'visibility']) if (e.attrs[k] !== undefined) out[k] = e.attrs[k];
    if (e.attrs.style) for (const decl of e.attrs.style.split(';')) { const [k, v] = decl.split(':'); if (k && v) out[k.trim()] = v.trim(); }
  }
  return out;
}

function parseCss(root: El): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const walk = (e: El) => { if (e.tag === 'style') { for (const [, sel, body] of e.text.matchAll(/([^{}]+)\{([^}]*)\}/g)) { const decls: Record<string, string> = {}; for (const d of body.split(';')) { const [k, v] = d.split(':'); if (k && v) decls[k.trim()] = v.trim(); } for (const s of sel.split(',')) map.set(s.trim(), { ...(map.get(s.trim()) ?? {}), ...decls }); } } e.children.forEach(walk); };
  walk(root);
  return map;
}

/* ------------------------------ path flattening ------------------------------ */

function flattenPath(d: string, m: Mat, tol = 1.5): Vec2[][] {
  const out: Vec2[][] = [];
  let cur: Vec2[] = [];
  let x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, prevCmd = '';
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  const num = () => Number(toks[i++]);
  const push = (X: number, Y: number) => { cur.push(ap(m, [X, Y])); };
  const bez = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const n = Math.max(2, Math.min(24, Math.ceil((Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)) * mscale(m) / tol)));
    for (let k = 1; k <= n; k++) { const t = k / n, mt = 1 - t; push(mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3, mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3); }
  };
  let cmd = '';
  while (i < toks.length) {
    const t = toks[i];
    if (/[a-zA-Z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { if (cur.length) { if (cur.length > 1) cur.push(cur[0]); out.push(cur); } cur = []; x = sx; y = sy; prevCmd = cmd; continue; } }
    else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; if (cur.length > 1) out.push(cur); cur = []; push(x, y); sx = x; sy = y; break; }
      case 'L': { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; push(x, y); break; }
      case 'H': { const nx = num(); x = rel ? x + nx : nx; push(x, y); break; }
      case 'V': { const ny = num(); y = rel ? y + ny : ny; push(x, y); break; }
      case 'C': { const a = [num(), num(), num(), num(), num(), num()]; const [x1, y1, x2, y2, x3, y3] = rel ? [x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]] : a; bez(x, y, x1, y1, x2, y2, x3, y3); px = x2; py = y2; x = x3; y = y3; break; }
      case 'S': { const a = [num(), num(), num(), num()]; const [x2, y2, x3, y3] = rel ? [x + a[0], y + a[1], x + a[2], y + a[3]] : a; const refl = /[CcSs]/.test(prevCmd); const x1 = refl ? 2 * x - px : x, y1 = refl ? 2 * y - py : y; bez(x, y, x1, y1, x2, y2, x3, y3); px = x2; py = y2; x = x3; y = y3; break; }
      case 'Q': { const a = [num(), num(), num(), num()]; const [x1, y1, x2, y2] = rel ? [x + a[0], y + a[1], x + a[2], y + a[3]] : a; bez(x, y, x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2), x2, y2); px = x1; py = y1; x = x2; y = y2; break; }
      case 'T': { const a = [num(), num()]; const [x2, y2] = rel ? [x + a[0], y + a[1]] : a; const refl = /[QqTt]/.test(prevCmd); const x1 = refl ? 2 * x - px : x, y1 = refl ? 2 * y - py : y; bez(x, y, x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2), x2, y2); px = x1; py = y1; x = x2; y = y2; break; }
      case 'A': { const rx = num(), ry = num(); num(); const large = num(), sweep = num(); const nx = num(), ny = num(); const x2 = rel ? x + nx : nx, y2 = rel ? y + ny : ny; arc(x, y, rx, ry, large, sweep, x2, y2, (X, Y) => push(X, Y), mscale(m) / tol); x = x2; y = y2; break; }
      default: i++;
    }
    prevCmd = cmd;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function arc(x1: number, y1: number, rx: number, ry: number, large: number, sweep: number, x2: number, y2: number, emit: (x: number, y: number) => void, density: number) {
  if (rx === 0 || ry === 0) { emit(x2, y2); return; }
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  let l = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
  const sign = large === sweep ? -1 : 1;
  const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx) / (rx * rx * dy * dy + ry * ry * dx * dx));
  const cxp = sign * Math.sqrt(sq) * ((rx * dy) / ry), cyp = sign * Math.sqrt(sq) * (-(ry * dx) / rx);
  const cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (dx - cxp) / rx, (dy - cyp) / ry);
  let dt = ang((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.min(48, Math.ceil(Math.abs(dt) * Math.max(rx, ry) * density)));
  for (let k = 1; k <= n; k++) { const t = t1 + (dt * k) / n; emit(cx + rx * Math.cos(t), cy + ry * Math.sin(t)); }
}

/* ------------------------------ extraction ------------------------------ */

export interface SvgExtract {
  /** Polylines grouped by stroke colour (lower-case hex), in SVG units. */
  strokes: Map<string, { pts: Vec2[]; width: number }[]>;
  /** Text labels: name, anchor point, anchor mode, rotation (deg, CCW), font size (SVG units). */
  texts: { name: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; angle: number; size: number; /** one word out of a longer run: only used when nothing else matches */ partial?: boolean }[];
  /** Named markers from <use id="Station name"> / <circle id=...>. */
  markers: { name: string; x: number; y: number }[];
  /** Unnamed station dots: small closed near-circular shapes (centre, radius, SVG units). */
  dots?: { x: number; y: number; r: number }[];
  width: number; height: number;
}

function hexColor(c?: string): string | undefined {
  if (!c) return undefined;
  c = c.trim().toLowerCase();
  if (c === 'none' || c === 'transparent') return undefined;
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  const named: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080' };
  return named[c];
}

export function extractSvg(src: string): SvgExtract {
  const root = parseXml(src);
  const css = parseCss(root);
  const svg = findFirst(root, 'svg');
  const vb = (svg?.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  const width = vb.length === 4 ? vb[2] : Number((svg?.attrs.width ?? '1000').replace(/[a-z%]+$/, ''));
  const height = vb.length === 4 ? vb[3] : Number((svg?.attrs.height ?? '1000').replace(/[a-z%]+$/, ''));
  const base: Mat = vb.length === 4 ? [1, 0, 0, 1, -vb[0], -vb[1]] : I;
  const strokes = new Map<string, { pts: Vec2[]; width: number }[]>();
  const texts: SvgExtract['texts'] = [];
  const markers: SvgExtract['markers'] = [];
  const dots: NonNullable<SvgExtract['dots']> = [];
  const defs = new Set<El>();
  const byId = new Map<string, El>();
  const index = (e: El) => { if (e.attrs.id) byId.set(e.attrs.id, e); e.children.forEach(index); };
  index(root);
  let useDepth = 0;
  const walk = (el: El, m: Mat, inDefs: boolean) => {
    if (el.tag === 'defs' || el.tag === 'symbol' || el.tag === 'clipPath' || el.tag === 'mask' || el.tag === 'marker' || el.tag === 'pattern') { inDefs = true; defs.add(el); }
    if (el.tag === 'metadata' || el.tag === 'title' || el.tag === 'desc' || el.tag === 'style' || el.tag.startsWith('sodipodi') || el.tag.startsWith('inkscape')) return;
    const st = styleOf(el, css);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    const local = mm(m, parseTransform(el.attrs.transform));
    if (!inDefs) {
      const stroke = hexColor(st.stroke);
      const sw = Number(String(st['stroke-width'] ?? '1').replace(/[a-z%]+$/, '')) * mscale(local);
      const addPolys = (polys: Vec2[][]) => {
        // A small closed near-circular shape is a station dot (white-with-outline or filled), whatever its colour.
        for (const p of polys) {
          if (p.length < 6 || dist(p[0], p[p.length - 1]) > 1e-3) continue;
          const bb = bboxOf(p);
          if (bb.w < 2 || bb.w > 60 || bb.h < 2 || bb.h > 60 || Math.abs(bb.w - bb.h) > 0.3 * Math.max(bb.w, bb.h)) continue;
          dots.push({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, r: (bb.w + bb.h) / 4 });
        }
        if (!stroke) return; const list = strokes.get(stroke) ?? []; for (const p of polys) if (p.length >= 2) list.push({ pts: p, width: sw }); strokes.set(stroke, list);
      };
      if (el.tag === 'path' && el.attrs.d) addPolys(flattenPath(el.attrs.d, local));
      else if (el.tag === 'line') addPolys([[ap(local, [Number(el.attrs.x1 ?? 0), Number(el.attrs.y1 ?? 0)]), ap(local, [Number(el.attrs.x2 ?? 0), Number(el.attrs.y2 ?? 0)])]]);
      else if (el.tag === 'polyline' || el.tag === 'polygon') { const nums = (el.attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number); const pts: Vec2[] = []; for (let k = 0; k + 1 < nums.length; k += 2) pts.push(ap(local, [nums[k], nums[k + 1]])); if (el.tag === 'polygon' && pts.length) pts.push(pts[0]); addPolys([pts]); }
      else if (el.tag === 'text') {
        const angle = -Math.atan2(local[1], local[0]) * 180 / Math.PI;
        const size = Number(String(st['font-size'] ?? '10').replace(/[a-z%]+$/, '')) * mscale(local);
        const anchor = (st['text-anchor'] as any) ?? 'start';
        const firstNum = (v?: string) => (v === undefined ? undefined : Number(String(v).trim().split(/[\s,]+/)[0]));
        // PDF-derived SVGs put several labels into one <text>, one positioned <tspan> each: treat those separately.
        const positioned = el.children.filter((c) => c.tag === 'tspan' && c.attrs.x !== undefined && c.attrs.y !== undefined);
        if (positioned.length >= 2) {
          const fs = Number(String(st['font-size'] ?? '10').replace(/[a-z%]+$/, ''));
          for (const c of positioned) {
            const raw = collectText(c);
            const xs = String(c.attrs.x).trim().split(/[\s,]+/).map(Number);
            const y = firstNum(c.attrs.y)!;
            // Per-glyph x positions: a gap wider than ~1.2 em separates two labels on the same baseline.
            const chars = [...raw];
            const runs: { text: string; x: number }[] = [];
            if (xs.length >= chars.length && chars.length > 1) {
              let start = 0;
              for (let k = 1; k <= chars.length; k++) {
                if (k === chars.length || xs[k] - xs[k - 1] > fs * 1.2) { runs.push({ text: chars.slice(start, k).join(''), x: xs[start] }); start = k; }
              }
            } else runs.push({ text: raw, x: xs[0] });
            for (const r of runs) {
              const name = r.text.replace(/\s+/g, ' ').trim();
              if (!name) continue;
              const p = ap(local, [r.x, y]);
              texts.push({ name, x: p[0], y: p[1], anchor, angle: Math.round(angle * 10) / 10, size });
            }
            // Several station names set as one run along a straight line ("63rd 60th 56th 52nd 46th"): also offer
            // each word on its own, at its glyph position, as a fallback when the whole run matches nothing.
            if (xs.length >= chars.length && /\s/.test(raw.trim())) {
              let wStart = -1;
              for (let k = 0; k <= chars.length; k++) {
                const blank = k === chars.length || /\s/.test(chars[k]);
                if (!blank && wStart < 0) wStart = k;
                if (blank && wStart >= 0) { const word = chars.slice(wStart, k).join(''); const p = ap(local, [xs[wStart], y]); texts.push({ name: word, x: p[0], y: p[1], anchor: 'start', angle: Math.round(angle * 10) / 10, size, partial: true }); wStart = -1; }
              }
            }
          }
        } else {
          const name = collectText(el).replace(/\s+/g, ' ').trim();
          if (name) {
            const tx = firstNum(el.attrs.x) ?? firstNum(findFirst(el, 'tspan')?.attrs.x) ?? 0, ty = firstNum(el.attrs.y) ?? firstNum(findFirst(el, 'tspan')?.attrs.y) ?? 0;
            const p = ap(local, [tx, ty]);
            texts.push({ name, x: p[0], y: p[1], anchor, angle: Math.round(angle * 10) / 10, size });
          }
        }
      }
      else if (el.tag === 'use' || el.tag === 'circle' || el.tag === 'ellipse') {
        const id = el.attrs.id ?? '';
        if (id && /[a-z]/i.test(id) && !/^(use|circle|path|g|rect|ellipse|text)\d/i.test(id) && !/^(boiler|wheel|rail|intersection)/i.test(id)) {
          const p = ap(local, [Number(el.attrs.x ?? el.attrs.cx ?? 0), Number(el.attrs.y ?? el.attrs.cy ?? 0)]);
          markers.push({ name: id.replace(/[_-]/g, ' ').trim(), x: p[0], y: p[1] });
        }
      }
      // Expand <use>: draw the referenced element with the use's transform and x/y offset.
      if (el.tag === 'use' && useDepth < 6) {
        const href = (el.attrs.href ?? el.attrs['xlink:href'] ?? '').replace(/^#/, '');
        const target = byId.get(href);
        if (target) {
          const off: Mat = [1, 0, 0, 1, Number(el.attrs.x ?? 0), Number(el.attrs.y ?? 0)];
          useDepth++;
          // The referenced element's own transform is applied inside walk(); we pass the composed parent matrix.
          const saved = target.parent; target.parent = el; // style inheritance from the use site
          walk(target, mm(local, off), false);
          target.parent = saved;
          useDepth--;
        }
      }
    }
    for (const c of el.children) walk(c, local, inDefs);
  };
  if (svg) walk(svg, base, false);
  return { strokes, texts, markers, dots, width, height };
}

function findFirst(el: El, tag: string): El | undefined {
  if (el.tag === tag) return el;
  for (const c of el.children) { const f = findFirst(c, tag); if (f) return f; }
  return undefined;
}
function collectText(el: El): string {
  let s = el.text;
  for (const c of el.children) { if (c.tag === 'tspan' || c.tag === 'textPath' || c.tag === 'a') { s += ' ' + collectText(c); } }
  return s;
}

/* ------------------------------ layout from SVG ------------------------------ */

/** Expand the abbreviations transit maps use so they normalise like OSM names. */
export function expandAbbrev(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim() // "Terminal A (East & West)", "Ferry Ave, Camden"
    .replace(/\bPhila\.?(?=\s|$)/gi, 'Philadelphia').replace(/\bN\.\s*(?=[A-Z])/g, 'North ').replace(/\bS\.\s*(?=[A-Z])/g, 'South ').replace(/\bE\.\s*(?=[A-Z])/g, 'East ').replace(/\bW\.\s*(?=[A-Z])/g, 'West ')
    .replace(/\bTrans\.?\s*Ctr\.?/gi, 'Transportation Center').replace(/\bT\.?\s?C\.?(?=\s|$)/g, 'Transportation Center')
    .replace(/\bSta\.?(?=\s|$)/gi, 'Station').replace(/\bSt\.(?=\s|$)/g, 'Street').replace(/\bAve\.?(?=\s|$)/gi, 'Avenue').replace(/\bRd\.?(?=\s|$)/gi, 'Road')
    .replace(/\bJct\.?(?=\s|$)/gi, 'Junction').replace(/\bCtr\.?(?=\s|$)/gi, 'Center').replace(/\bPkwy\.?(?=\s|$)/gi, 'Parkway').replace(/\bMt\.?(?=\s)/gi, 'Mount')
    .replace(/\bTerm\.?(?=\s|$)/gi, 'Terminal').replace(/\bTerms?\.?(?=\s|$)/gi, 'Terminals').replace(/\bIntl\.?(?=\s|$)/gi, 'International')
    .replace(/\bSq\.?(?=\s|$)/gi, 'Square').replace(/\bBlvd\.?(?=\s|$)/gi, 'Boulevard').replace(/\bLn\.?(?=\s|$)/gi, 'Lane').replace(/\bHwy\.?(?=\s|$)/gi, 'Highway').replace(/\bPl\.?(?=\s|$)/gi, 'Place').replace(/\bDr\.?(?=\s|$)/gi, 'Drive')
    .replace(/\s*\/\s*/g, '-');
}

function colorDist(a: string, b: string): number {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Join polylines whose ends touch (within eps) into longer chains. */
function joinPolylines(pieces: Vec2[][], eps: number): Vec2[][] {
  const chains = pieces.map((p) => dedupe(p, 1e-6)).filter((p) => p.length >= 2);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++) for (let j = i + 1; j < chains.length; j++) {
      const a = chains[i], b = chains[j];
      const ends: [Vec2, Vec2][] = [[a[a.length - 1], b[0]], [a[a.length - 1], b[b.length - 1]], [a[0], b[0]], [a[0], b[b.length - 1]]];
      for (let k = 0; k < 4; k++) {
        if (dist(ends[k][0], ends[k][1]) <= eps) {
          let A = a, B = b;
          if (k === 1) B = [...b].reverse(); if (k === 2) A = [...a].reverse(); if (k === 3) { A = [...a].reverse(); B = [...b].reverse(); }
          chains[i] = dedupe([...A, ...B], 1e-6); chains.splice(j, 1); merged = true; break outer;
        }
      }
    }
  }
  return chains;
}

export interface SvgImportOptions {
  /** Colour distance tolerance for matching SVG strokes to line colours (0–441). */
  colorTolerance?: number;
  /** Minimum stroke width (SVG units) for something to count as a line rather than a tick mark. */
  minStrokeWidth?: number;
  /** Experimental: move stations onto the path their sequence neighbours sit on. Off by default. */
  resnapToNeighbours?: boolean;
  /** Draw each line in the colour the official drawing uses for it (default true); false keeps the network's colours. */
  officialColours?: boolean;
  log?: (m: string) => void;
}

export interface SvgImportReport {
  /** Stroke colours that carry lines (for pruning a bundled extract). */
  usedColours?: string[];
  matchedStations: number;
  unmatchedStations: string[];
  lineColours: { ref: string; svgColour?: string; pieces: number }[];
}

/** Build a LayoutResult from an official-style SVG: geometry, station positions and label positions all come from the drawing. */
export function layoutFromSvg(svgSource: string, net: MetroNetwork, params: DesignParams, font: TextFont, opts: SvgImportOptions = {}): { layout: LayoutResult; report: SvgImportReport; net: MetroNetwork } {
  return layoutFromExtract(extractSvg(svgSource), net, params, font, opts);
}

/** JSON form of an extract (Map → object), for bundling an official map's geometry as a fixture. */
export interface SvgExtractJson { strokes: Record<string, { pts: Vec2[]; width: number }[]>; texts: SvgExtract['texts']; markers: SvgExtract['markers']; dots?: SvgExtract['dots']; width: number; height: number; source?: string; attribution?: string }
export function extractToJson(ex: SvgExtract, meta: { source?: string; attribution?: string } = {}): SvgExtractJson {
  return { strokes: Object.fromEntries(ex.strokes), texts: ex.texts, markers: ex.markers, dots: ex.dots, width: ex.width, height: ex.height, ...meta };
}
export function extractFromJson(j: SvgExtractJson): SvgExtract {
  return { strokes: new Map(Object.entries(j.strokes)), texts: j.texts, markers: j.markers, dots: j.dots, width: j.width, height: j.height };
}

/** Same as layoutFromSvg, from an already-extracted drawing (a bundled official-geometry fixture). */
export function layoutFromExtract(ex0: SvgExtract, net0: MetroNetwork, params: DesignParams, font: TextFont, opts: SvgImportOptions = {}): { layout: LayoutResult; report: SvgImportReport; net: MetroNetwork } {
  let net: MetroNetwork = net0;
  const log = opts.log ?? (() => {});
  const ex: SvgExtract = { ...ex0, strokes: new Map([...ex0.strokes].map(([c, l]) => [c, [...l]])) };
  // Hairlines (page borders, quadrant dividers, leader lines) are never route lines: drop strokes thinner than
  // 30 % of the median width of the long strokes on the page, unless the caller set an explicit minimum.
  {
    const longW: number[] = [];
    const pageL = Math.max(ex.width, ex.height) * 0.05;
    for (const list of ex.strokes.values()) for (const p of list) if (pathLength(p.pts) > pageL) longW.push(p.width);
    longW.sort((a, b) => a - b);
    const autoMin = longW.length ? longW[Math.floor(longW.length / 2)] * 0.3 : 0;
    const minW = opts.minStrokeWidth ?? autoMin;
    if (minW > 0) for (const [c, list] of ex.strokes) { const kept = list.filter((p) => p.width >= minW); if (kept.length) ex.strokes.set(c, kept); else ex.strokes.delete(c); }
  }
  // 1. Which SVG stroke colours are the lines? Prefer wide strokes with lots of length.
  const colourStats = new Map<string, { len: number; maxW: number; n: number }>();
  for (const [c, list] of ex.strokes) { let len = 0, maxW = 0; for (const p of list) { len += pathLength(p.pts); maxW = Math.max(maxW, p.width); } colourStats.set(c, { len, maxW, n: list.length }); }
  const candidates = [...colourStats.entries()].filter(([c, s]) => s.len > 50 && c !== '#ffffff');
  const tol = opts.colorTolerance ?? 230;
  // Station label positions in SVG units, per station name.
  const labelKey = (name: string) => normalizeName(expandAbbrev(name));
  // Every text under every key it can be known by. The same name often appears several times on one map (three
  // "Girard"s, two "Villanova"s, two "Allegheny"s on SEPTA's): candidates are resolved per station by which one lies
  // on the strokes of that station's own line colours.
  const assigned = new Map<string, string>();
  const chosenText = new Map<string, SvgExtract['texts'][number] | undefined>();
  const textAll = new Map<string, SvgExtract['texts'][number][]>();
  const addText = (k: string, t: SvgExtract['texts'][number]) => { if (!k) return; const l = textAll.get(k) ?? []; if (!l.includes(t)) l.push(t); textAll.set(k, l); };
  for (const t of ex.texts) { if (t.partial) continue; addText(labelKey(t.name), t); }
  // "Norristown (Elm St)": the bracketed part is a name of its own.
  for (const t of ex.texts) { if (t.partial) continue; const m = /\(([^)]+)\)/.exec(t.name); if (m) addText(labelKey(m[1]), t); }
  for (const t of ex.texts) { if (!t.partial) continue; addText(labelKey(t.name), t); }
  const keysOf = (st: { name: string; nameEn?: string }): string[] => {
    const parts = st.name.split(/ \/ /);
    const alts = parts.flatMap((n) => [n.replace(/^(Airport|Philadelphia)\s+/i, ''), n.replace(/^(\d+(?:st|nd|rd|th))\s+(Street|St)(\s*[&/].*)?$/i, '$1'), n.replace(/^(\d+(?:st|nd|rd|th))\s*[&/].*$/i, '$1')]);
    return [labelKey(st.name), labelKey(st.nameEn ?? ''), ...parts.map((n) => labelKey(n)), ...alts.map((n) => labelKey(n))].filter((k, i, a) => k && a.indexOf(k) === i);
  };
  // Multi-line labels ("Chestnut" / "Hill West", "Norristown" / "Trans. Ctr."): stacked runs of one size on consecutive
  // baselines are joined only when the joined words are a station's name — station lists along a straight line are
  // stacked the same way, and those must stay separate.
  {
    const stationKeys = new Set<string>();
    for (const st of net.stations) for (const k of keysOf(st)) stationKeys.add(k);
    const full = ex.texts.filter((t) => !t.partial).sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < full.length; i++) {
      const parts = [full[i]];
      let cur = full[i];
      for (let n = 0; n < 2; n++) {
        const nxt = full.find((t) => t !== cur && !parts.includes(t) && Math.abs(t.size - cur.size) < cur.size * 0.15 && t.angle === cur.angle && t.y - cur.y > cur.size * 0.8 && t.y - cur.y < cur.size * 1.6 && Math.abs(t.x - cur.x) < cur.size * 0.6);
        if (!nxt) break;
        parts.push(nxt); cur = nxt;
        const name = parts.map((p) => p.name).join(' ');
        const k = labelKey(name);
        if (stationKeys.has(k)) { const t = { ...parts[0], name }; const l = textAll.get(k) ?? []; l.unshift(t); textAll.set(k, l); }
      }
    }
  }
  const textPos = new Map<string, SvgExtract['texts'][number]>();
  for (const [k, l] of textAll) textPos.set(k, l[0]);
  const strokeDist = (p: Vec2, colours: string[]): number => {
    let best = Infinity;
    for (const c of colours) for (const pc of ex.strokes.get(c) ?? []) { const s = paramOf(pc.pts, p); if (s < 0) continue; best = Math.min(best, dist(pointAt(pc.pts, s).point, p)); }
    return best;
  };
  /** Among texts filed under `keys`, the one on this station's line colours (when known), else the first. */
  const pickText = (keys: string[], colours: string[]): SvgExtract['texts'][number] | undefined => {
    const cands: SvgExtract['texts'][number][] = [];
    for (const k of keys) for (const t of textAll.get(k) ?? []) if (!cands.includes(t)) cands.push(t);
    if (!cands.length) return undefined;
    if (!colours.length || cands.length === 1) {
      const t = cands.find((c) => !c.partial) ?? cands[0];
      if (!colours.length) return t;
      const sd = strokeDist([t.x, t.y], colours);
      if (t.partial && sd > nearTextR) return undefined;
      // a lone candidate nowhere near this station's lines may be another station of the same name (T's "City Hall"
      // downtown vs PATCO's "City Hall Camden"): flag it so the fuzzy pass can offer something nearer
      return sd > nearTextR * 2.5 ? { ...t, far: true } as typeof t : t;
    }
    let best: { t: SvgExtract['texts'][number]; d: number } | undefined;
    for (const t of cands) { const dd = strokeDist([t.x, t.y], colours) + (t.partial ? nearTextR * 0.5 : 0); if (!best || dd < best.d) best = { t, d: dd }; }
    return best && best.d < nearTextR * 2 ? best.t : cands.find((c) => !c.partial);
  };
  const nearTextR = Math.max(ex.width, ex.height) * 0.03;
  const markerPos = new Map<string, { x: number; y: number }>();
  for (const mk of ex.markers) { const k = labelKey(mk.name); if (k && !markerPos.has(k)) markerPos.set(k, mk); }
  const textKeys = [...textPos.keys()];
  /** Exact key, else the best fuzzy candidate (prefix/containment on normalised names, 4+ chars). */
  const candidatesOf = (st: { name: string; nameEn?: string }): SvgExtract['texts'][number][] => {
    const out: SvgExtract['texts'][number][] = [];
    for (const k of keysOf(st)) for (const t of textAll.get(k) ?? []) if (!out.includes(t)) out.push(t);
    return out;
  };
  const findText = (st: { name: string; nameEn?: string; lines?: string[] }): SvgExtract['texts'][number] | undefined => {
    const colours = (st.lines ?? []).map((id) => assigned.get(id)).filter((c): c is string => !!c);
    const parts = st.name.split(/ \/ /);
    // Alternative spellings: without a leading "Airport"/city prefix, and "46th Street" as the bare ordinal "46th".
    const alts = parts.flatMap((n) => [n.replace(/^(Airport|Philadelphia)\s+/i, ''), n.replace(/^(\d+(?:st|nd|rd|th))\s+(Street|St)(\s*[&/].*)?$/i, '$1'), n.replace(/^(\d+(?:st|nd|rd|th))\s*[&/].*$/i, '$1')]);
    const keys = [labelKey(st.name), labelKey(st.nameEn ?? ''), ...parts.map((n) => labelKey(n)), ...alts.map((n) => labelKey(n))].filter((k, i, a) => k && a.indexOf(k) === i);
    const exact = pickText(keys, colours) as (SvgExtract['texts'][number] & { far?: boolean }) | undefined;
    if (exact && !exact.far) return exact;
    let best: { t: SvgExtract['texts'][number]; score: number } | undefined;
    // "Baltimore Avenue & 42nd Street" (a tram stop named by its cross-streets) must not borrow the label of the
    // station called plain "Baltimore Ave" on another line: cross-street names only match nearly whole.
    const crossStreet = /&| and | at /i.test(st.name);
    for (const k of keys) for (const tk of textKeys) {
      if (tk.length < 4 && !/^\d+(st|nd|rd|th)$/.test(tk)) continue;
      let score = 0;
      const ratio = Math.min(k.length, tk.length) / Math.max(k.length, tk.length);
      if (crossStreet && ratio < 0.85) continue;
      if ((k.startsWith(tk) || tk.startsWith(k)) && ratio >= 0.45) score = ratio + 0.5;
      else if (k.includes(tk) || tk.includes(k)) score = Math.min(k.length, tk.length) / Math.max(k.length, tk.length);
      if (score > 0.55 && (!best || score > best.score)) best = { t: pickText([tk], colours) ?? textPos.get(tk)!, score };
    }
    if (exact && best && colours.length) return strokeDist([best.t.x, best.t.y], colours) < strokeDist([exact.x, exact.y], colours) ? best.t : exact;
    return best?.t ?? exact;
  };
  const posOf = (st: { name: string; nameEn?: string }): Vec2 | undefined => {
    const keys = [labelKey(st.name), labelKey(st.nameEn ?? ''), labelKey(st.name.split(/ \/ /)[0])];
    for (const k of keys) { const mk = markerPos.get(k); if (mk) return [mk.x, mk.y]; }
    const t = findText(st); if (t) return [t.x, t.y];
    return undefined;
  };
  // A line gets the candidate colour (within tolerance) whose strokes run past the most of its stations.
  const near = (c: string, p: Vec2, r: number) => (ex.strokes.get(c) ?? []).some((pc) => pathLength(pc.pts) > r && dist(pointAt(pc.pts, paramOf(pc.pts, p)).point, p) < r);
  const unitR = Math.max(ex.width, ex.height) * 0.025; // labels sit a little way off their line
  for (const ln of net.lines) {
    const pts = net.stations.filter((st) => st.lines.includes(ln.id)).map(posOf).filter(Boolean) as Vec2[];
    let best: { c: string; score: number; d: number; hits: number } | undefined;
    const tried: string[] = [];
    for (const [c] of candidates) {
      const d = colorDist(ln.color, c); if (d > tol) continue;
      let hits = 0; for (const p of pts) if (near(c, p, unitR)) hits++;
      // Hits weigh more the closer the colour is to the line's own: a parallel line of another colour running
      // past the same labels must not win just because its strokes are nearer.
      const score = (hits / Math.max(1, pts.length)) * Math.pow(Math.max(0, 1 - d / tol), 1.5);
      tried.push(`${c}:${hits}/${d.toFixed(0)}`);
      if (!best || score > best.score) best = { c, score, d, hits };
    }
    if (typeof process !== 'undefined' && process.env?.SVG_DEBUG === 'colours') log(`  ${ln.ref} candidates ${tried.join(' ')}`);
    // Enough of the line's stations sit on strokes of this colour: a share of them, or at least three (long lines
    // whose labels are mostly bare ordinals or logos still have a few clean hits).
    if (best && pts.length > 0 && (best.score > 0.15 || best.hits >= 3)) assigned.set(ln.id, best.c);
    log(`line ${ln.ref}: ${best ? `${best.c} (${(best.score * 100).toFixed(0)}% of ${pts.length} stations)` : 'no colour match'}`);
  }
  // 2b. Resolve which text is which station. A name that appears more than once ("Allegheny" on three lines) goes to
  //     the candidate nearest the station's neighbours along its own lines; a bare word out of a longer run counts
  //     only when it sits right on the station's line and next to its neighbours.
  {
    const coherenceR = Math.max(ex.width, ex.height) * 0.2;
    const nb = new Map<string, Set<string>>();
    for (const ln of net.lines) for (const seq of ln.sequences) for (let i = 0; i < seq.length; i++) { const set = nb.get(seq[i]) ?? nb.set(seq[i], new Set()).get(seq[i])!; if (i > 0) set.add(seq[i - 1]); if (i + 1 < seq.length) set.add(seq[i + 1]); }
    for (const st of net.stations) chosenText.set(st.id, findText(st));
    for (let iter = 0; iter < 3; iter++) {
      for (const st of net.stations) {
        const cands = candidatesOf(st);
        const colours = st.lines.map((id) => assigned.get(id)).filter((c): c is string => !!c);
        const current = chosenText.get(st.id);
        if (cands.length < 2 && !(current?.partial)) continue;
        const nbPos: Vec2[] = [];
        for (const n of nb.get(st.id) ?? []) { const t = chosenText.get(n); if (t) nbPos.push([t.x, t.y]); }
        let best: { t: SvgExtract['texts'][number]; cost: number } | undefined;
        for (const t of cands.length ? cands : current ? [current] : []) {
          const sd = colours.length ? strokeDist([t.x, t.y], colours) : 0;
          const nd = nbPos.length ? Math.min(...nbPos.map((p) => dist(p, [t.x, t.y]))) : 0;
          if (t.partial && (sd > nearTextR * 0.6 || (nbPos.length && nd > coherenceR))) continue;
          const cost = nd + 0.5 * sd + (t.partial ? nearTextR : 0);
          if (!best || cost < best.cost) best = { t, cost };
        }
        chosenText.set(st.id, best?.t);
      }
    }
  }

  // 2. Scale SVG → mm: fit the union of assigned strokes into the requested width (and height if given).
  const allPts: Vec2[] = [];
  for (const c of new Set(assigned.values())) for (const p of ex.strokes.get(c) ?? []) allPts.push(...p.pts);
  for (const t of ex.texts) allPts.push([t.x, t.y]);
  const bb = bboxOf(allPts.length ? allPts : [[0, 0], [ex.width, ex.height]]);
  const margin = Math.max(18, params.labelFontSize * 4);
  let scale = (params.widthMm - 2 * margin) / bb.w;
  if (params.heightMm) scale = Math.min(scale, (params.heightMm - 2 * margin) / bb.h);
  const W = params.widthMm, H = params.heightMm ?? bb.h * scale + 2 * margin;
  const ox = (W - bb.w * scale) / 2, oy = (H - bb.h * scale) / 2;
  const toMm = (p: Vec2): Vec2 => [(p[0] - bb.x) * scale + ox, H - ((p[1] - bb.y) * scale + oy)]; // y up

  // Name → drawing position (label text or explicit marker), in mm.
  const drawingPos = (st: { id?: string; name: string; nameEn?: string }): { x: number; y: number; source: 'marker' | 'text'; t?: SvgExtract['texts'][number] } | undefined => {
    const keys = [labelKey(st.name), labelKey(st.nameEn ?? ''), labelKey(st.name.split(/ \/ /)[0])];
    const t = st.id && chosenText.has(st.id) ? chosenText.get(st.id) : findText(st);
    for (const k of keys) { const mk = markerPos.get(k); if (mk) return { x: mk.x, y: mk.y, source: 'marker', t }; }
    if (t) return { x: t.x, y: t.y, source: 'text', t };
    return undefined;
  };

  // 3. Per line: joined polylines in mm. Short strokes are station tick marks; long strokes far from
  //    every station of the line are decoration (fare-zone rings, rivers) and are dropped.
  const minW = opts.minStrokeWidth ?? 0;
  const linePaths = new Map<string, Vec2[][]>();
  const ticks = new Map<string, Vec2[][]>(); // colour -> short segments (mm)
  const nearTol = params.lineWidth * 10;
  // One stroke set per colour: all lines drawn in that colour (SEPTA's thirteen Regional Rail lines) share it.
  const byColour = new Map<string, string[]>();
  for (const ln of net.lines) { const c = assigned.get(ln.id); if (c) (byColour.get(c) ?? byColour.set(c, []).get(c)!).push(ln.id); }
  for (const [c, lineIds] of byColour) {
    const all = (ex.strokes.get(c) ?? []).filter((p) => p.width >= minW);
    const short = all.filter((p) => pathLength(p.pts) * scale <= params.lineWidth * 2.2).map((p) => p.pts.map(toMm));
    ticks.set(c, short);
    const pieces = all.filter((p) => pathLength(p.pts) * scale > params.lineWidth * 2.2).map((p) => p.pts.map(toMm));
    const anchors = net.stations.filter((st) => st.lines.some((id) => lineIds.includes(id))).map((st) => drawingPos(st)).filter(Boolean).map((h) => toMm([h!.x, h!.y]));
    const keep = new Set<number>();
    pieces.forEach((pc, i) => { for (const a of anchors) { if (paramOf(pc, a) >= 0 && dist(pointAt(pc, paramOf(pc, a)).point, a) < nearTol) { keep.add(i); break; } } });
    // grow through touching pieces (junction pieces without their own stations)
    let grown = true;
    while (grown) { grown = false; pieces.forEach((pc, i) => { if (keep.has(i)) return; for (const j of keep) { const q = pieces[j]; if ([pc[0], pc[pc.length - 1]].some((e) => dist(e, q[0]) < params.lineWidth || dist(e, q[q.length - 1]) < params.lineWidth)) { keep.add(i); grown = true; break; } } }); }
    const joined = joinPolylines(pieces.filter((_, i) => keep.has(i)), params.lineWidth * 0.6).map((p) => simplifyCollinear(dedupe(p, 0.05), 0.01)).filter((p) => pathLength(p) > params.lineWidth * 2);
    for (const id of lineIds) linePaths.set(id, joined);
  }

  const snapTol = Math.max(30, params.lineWidth * 8);
  const nearestOnLines = (p: Vec2, lineIds: string[]): { pt: Vec2; lineId: string; pathIdx: number; s: number; d: number } | undefined => {
    let best: { pt: Vec2; lineId: string; pathIdx: number; s: number; d: number } | undefined;
    for (const lid of lineIds) (linePaths.get(lid) ?? []).forEach((path, pathIdx) => { const s = paramOf(path, p); const pt = pointAt(path, s).point; const d = dist(pt, p); if (!best || d < best.d) best = { pt, lineId: lid, pathIdx, s, d }; });
    return best;
  };
  // 3b. A station our data holds once but the drawing shows twice — "Radnor" on the Norristown line and "Radnor" on
  //     the Paoli line, half a kilometre apart with no connection — is split into one station per drawn colour when
  //     the colours' nearest strokes are far apart. (A true interchange has both colours at one spot.)
  {
    const splitStations: MetroNetwork['stations'] = [];
    const replace = new Map<string, Map<string, string>>(); // original id -> (colour -> new id)
    for (const st of net.stations) {
      const colours = [...new Set(st.lines.map((id) => assigned.get(id)).filter((c): c is string => !!c))];
      if (colours.length < 2) { splitStations.push(st); continue; }
      const per = colours.map((c) => {
        const linesC = st.lines.filter((id) => assigned.get(id) === c);
        const t = pickText(keysOf(st), [c]) ?? chosenText.get(st.id);
        const p = t ? toMm([t.x, t.y]) : undefined;
        const near = p ? nearestOnLines(p, linesC) : undefined;
        return { c, linesC, t, pt: near && near.d < snapTol ? near.pt : undefined };
      }).filter((x) => x.pt);
      let spread = 0;
      for (const a of per) for (const b of per) if (a.pt && b.pt) spread = Math.max(spread, dist(a.pt, b.pt));
      if (per.length < 2 || spread < params.lineWidth * 8) { splitStations.push(st); continue; }
      const map = new Map<string, string>();
      per.forEach((x, i) => {
        const id = i === 0 ? st.id : `${st.id}~${i + 1}`;
        map.set(x.c, id);
        splitStations.push({ ...st, id, lines: x.linesC });
        if (x.t) chosenText.set(id, x.t);
      });
      replace.set(st.id, map);
      log(`SVG import: "${st.name}" is drawn as ${per.length} separate stations (${spread.toFixed(0)} mm apart); split`);
    }
    if (replace.size) {
      net = { ...net, stations: splitStations, lines: net.lines.map((l) => ({ ...l, sequences: l.sequences.map((seq) => seq.map((id) => replace.get(id)?.get(assigned.get(l.id) ?? '') ?? id)) })) };
    }
  }

  // 4. Station positions. Interchanges usually have a named marker; regular stations a tick mark next to
  //    the label. Use the tick end that touches the line, else the label anchor snapped to the line.
  const unmatched: string[] = [];
  const stationAnchor = new Map<string, Vec2>();
  // Text-anchored stations claim tick marks: every tick belongs to at most one station, nearest pairs first, so a
  // two-line label (e.g. "Chalfont &\nLatimer") can't steal the neighbouring station's tick and land on top of it.
  const dotsMm: Vec2[] = (ex.dots ?? []).map((d) => toMm([d.x, d.y]));
  const dotTol = Math.max(48, W * 0.15);
  const textTarget = new Map<string, Vec2>();
  // A tick belongs next to its label: look only a few line-widths around the text anchor.
  const tickTol = Math.max(48, params.lineWidth * 8);
  const claims: { id: string; key: string; d: number; pt: Vec2 }[] = [];
  const hits = new Map<string, ReturnType<typeof drawingPos>>();
  for (const st of net.stations) {
    const hit = drawingPos(st);
    hits.set(st.id, hit);
    if (!hit) { unmatched.push(st.name); continue; }
    const p = toMm([hit.x, hit.y]);
    if (hit.source !== 'text') { textTarget.set(st.id, p); continue; }
    textTarget.set(st.id, p);
    for (const lid of st.lines) for (const tk of ticks.get(assigned.get(lid) ?? '') ?? []) {
      const mid: Vec2 = [(tk[0][0] + tk[tk.length - 1][0]) / 2, (tk[0][1] + tk[tk.length - 1][1]) / 2];
      const d = dist(mid, p);
      if (d >= tickTol) continue;
      const nl0 = nearestOnLines(tk[0], st.lines), nl1 = nearestOnLines(tk[tk.length - 1], st.lines);
      claims.push({ id: st.id, key: `${mid[0].toFixed(2)},${mid[1].toFixed(2)}`, d, pt: (nl0?.d ?? 1e9) < (nl1?.d ?? 1e9) ? tk[0] : tk[tk.length - 1] });
    }
    // Station dots drawn on one of this station's lines: the strongest signal an official map gives.
    for (const dot of dotsMm) {
      const d = dist(dot, p);
      if (d >= dotTol) continue;
      const nl = nearestOnLines(dot, st.lines);
      if (!nl || nl.d > params.lineWidth * 1.5) continue;
      claims.push({ id: st.id, key: `dot:${dot[0].toFixed(2)},${dot[1].toFixed(2)}`, d, pt: nl.pt });
    }
  }
  claims.sort((a, b) => a.d - b.d);
  const tickOwner = new Map<string, string>();
  const claimed = new Map<string, Vec2>();
  // Ticks sitting on a named marker belong to that marker's station.
  for (const st of net.stations) {
    const hit = hits.get(st.id); if (!hit || hit.source !== 'marker') continue;
    const mp = toMm([hit.x, hit.y]);
    for (const c of claims) if (!tickOwner.has(c.key) && dist(c.key.split(',').map(Number) as Vec2, mp) < params.lineWidth * 1.5) tickOwner.set(c.key, st.id);
  }
  for (const c of claims) { if (claimed.has(c.id) || tickOwner.has(c.key)) continue; tickOwner.set(c.key, c.id); claimed.set(c.id, c.pt); }
  const anchorPath = new Map<string, { lineId: string; pathIdx: number }>();
  for (const st of net.stations) {
    const p = textTarget.get(st.id); if (!p) continue;
    const target = claimed.get(st.id) ?? p;
    const near = nearestOnLines(target, st.lines);
    if (!near || near.d > snapTol) { unmatched.push(st.name); continue; }
    stationAnchor.set(st.id, near.pt);
    anchorPath.set(st.id, { lineId: near.lineId, pathIdx: near.pathIdx });
    const dbgId = typeof process !== 'undefined' ? process.env?.SVG_DEBUG : undefined;
    if (dbgId && st.id.includes(dbgId)) log(`[svg ${st.id}] source=${hits.get(st.id)?.source} text=${hits.get(st.id)?.t?.name ?? '—'} p=${p.map((v) => v.toFixed(1))} tick=${claimed.get(st.id)?.map((v) => v.toFixed(1)) ?? 'none'} claims=${claims.filter((c) => c.id === st.id).map((c) => `${c.key}:${c.d.toFixed(0)}${tickOwner.get(c.key) === st.id ? '*' : tickOwner.has(c.key) ? '(' + tickOwner.get(c.key) + ')' : ''}`).slice(0, 5).join(' ')} anchor=${near.pt.map((v) => v.toFixed(1))} d=${near.d.toFixed(1)}`);
  }
  // Second pass: a label far from its tick can land on the nearest stroke of *another* branch (Wilmington-line
  // labels next to the Media line's end). Where both neighbours in the sequence sit on one path and this station
  // could sit on that path too (within tolerance), move it there.
  {
    const nbOf = new Map<string, Set<string>>();
    for (const ln of net.lines) for (const seq of ln.sequences) for (let i = 0; i < seq.length; i++) { const set = nbOf.get(seq[i]) ?? nbOf.set(seq[i], new Set()).get(seq[i])!; if (i > 0) set.add(seq[i - 1]); if (i + 1 < seq.length) set.add(seq[i + 1]); }
    const pathKey = (a?: { lineId: string; pathIdx: number }) => (a ? `${a.lineId}#${a.pathIdx}` : '');
    for (let pass = 0; pass < (opts.resnapToNeighbours ? 2 : 0); pass++) for (const st of net.stations) {
      const mine = anchorPath.get(st.id); if (!mine || claimed.has(st.id)) continue;
      const votes = new Map<string, number>();
      for (const n of nbOf.get(st.id) ?? []) { const k = pathKey(anchorPath.get(n)); if (k) votes.set(k, (votes.get(k) ?? 0) + 1); }
      let bestKey = '', bestVotes = 0; for (const [k, v] of votes) if (v > bestVotes) { bestKey = k; bestVotes = v; }
      if (!bestKey || bestKey === pathKey(mine) || bestVotes < 1) continue;
      const [lineId, idx] = bestKey.split('#');
      const path = (linePaths.get(lineId) ?? [])[Number(idx)]; if (!path) continue;
      const p = textTarget.get(st.id)!;
      const sParam = paramOf(path, p); const pt = pointAt(path, sParam).point; const d = dist(pt, p);
      if (d <= snapTol * 1.5) { stationAnchor.set(st.id, pt); anchorPath.set(st.id, { lineId, pathIdx: Number(idx) }); }
    }
  }
  // Two stations on one spot means a mis-snap; say so (the verification report picks this up).
  {
    const list = [...stationAnchor.entries()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (dist(list[i][1], list[j][1]) < params.lineWidth * 0.5) log(`SVG import: "${list[i][0]}" and "${list[j][0]}" landed on the same point`);
  }
  log(`SVG import: ${stationAnchor.size}/${net.stations.length} stations matched, ${new Set(assigned.values()).size} line colours`);

  // 5. Chains: split each line path at the major stations on it, keep regular stations as through-holes.
  // Interchange = more than one drawn colour (thirteen same-coloured Regional Rail lines through Elkins Park are one
  // plain stop, as on the map), or a branch point / terminus.
  const major = new Map<string, boolean>();
  for (const st of net.stations) major.set(st.id, new Set(st.lines.map((id) => assigned.get(id) ?? id)).size > 1);
  const degree = new Map<string, Set<string>>();
  for (const ln of net.lines) for (const seq of ln.sequences) for (let i = 0; i + 1 < seq.length; i++) { (degree.get(seq[i]) ?? degree.set(seq[i], new Set()).get(seq[i])!).add(seq[i + 1]); (degree.get(seq[i + 1]) ?? degree.set(seq[i + 1], new Set()).get(seq[i + 1])!).add(seq[i]); }
  for (const st of net.stations) if ((degree.get(st.id)?.size ?? 2) !== 2) major.set(st.id, true);
  const stMap = new Map<string, LayoutStation>();
  for (const st of net.stations) {
    const p = stationAnchor.get(st.id); if (!p) continue;
    stMap.set(st.id, { id: st.id, name: st.name, x: p[0], y: p[1], lines: st.lines, major: !!major.get(st.id), markerPoints: [], markerRadius: major.get(st.id) ? markerRadiusMajor(params) : dotRadius(params) });
  }
  const bedW = params.bed.x - 2 * params.bedMargin, bedH = params.bed.y - 2 * params.bedMargin;
  const lines: LayoutLine[] = [];
  // Lines drawn in one colour share one set of strokes (SEPTA's Regional Rail): the first line of each colour carries
  // the chains for the whole colour, its sister lines get none, and every station of any of them is a through-hole.
  const carrierOf = new Map<string, string>();
  for (const ln of net.lines) { const c = assigned.get(ln.id); if (c && !carrierOf.has(c)) carrierOf.set(c, ln.id); }
  for (const ln of net.lines) {
    const chains: LayoutLine['chains'] = [];
    const colour = assigned.get(ln.id);
    const carrier = colour ? carrierOf.get(colour) === ln.id : true;
    const groupIds = new Set(net.lines.filter((l) => (colour ? assigned.get(l.id) === colour : l.id === ln.id)).map((l) => l.id));
    const paths = carrier ? linePaths.get(ln.id) ?? [] : [];
    const onLine = net.stations.filter((s) => s.lines.some((id) => groupIds.has(id)) && stMap.has(s.id));
    paths.forEach((path, pi) => {
      // stations on this path (nearest path of the line)
      const here = onLine.map((s) => { const st = stMap.get(s.id)!; const sParam = paramOf(path, [st.x, st.y]); const pt = pointAt(path, sParam).point; return { st, s: sParam, d: dist(pt, [st.x, st.y]) }; }).filter((h) => h.d < params.lineWidth * 1.2).sort((a, b) => a.s - b.s);
      const cuts = [0, ...here.filter((h) => h.st.major).map((h) => h.s), pathLength(path)].sort((a, b) => a - b);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const s0 = cuts[k], s1 = cuts[k + 1];
        if (s1 - s0 < params.lineWidth) continue;
        const sub = subPath(path, s0, s1);
        const smooth = dedupe(filletPolyline(sub, params.cornerRadiusFactor * params.lineWidth * 0.5, 6));
        const startSt = here.find((h) => h.st.major && Math.abs(h.s - s0) < 1e-6)?.st, endSt = here.find((h) => h.st.major && Math.abs(h.s - s1) < 1e-6)?.st;
        if (startSt) stMap.get(startSt.id)!.markerPoints.push(smooth[0]);
        if (endSt) stMap.get(endSt.id)!.markerPoints.push(smooth[smooth.length - 1]);
        const through = here.filter((h) => !h.st.major && h.s > s0 + 1e-6 && h.s < s1 - 1e-6).map((h) => ({ id: h.st.id, point: pointAt(path, h.s).point, s: h.s - s0 }));
        for (const t of through) { const st = stMap.get(t.id)!; st.x = t.point[0]; st.y = t.point[1]; st.markerPoints = [t.point]; }
        const pieces = splitForBed(smooth, params.lineWidth / 2 + 1, bedW, bedH, through.map((t) => t.s));
        let acc = 0;
        pieces.forEach((pts, qi) => {
          const L = pathLength(pts); const from = acc, to = acc + L; acc = to;
          chains.push({ id: `${ln.id}-svg${pi}-${k}-${qi}`, points: pts, startEnd: qi === 0 ? (startSt ? 'station' : 'cut') : 'cut', endEnd: qi === pieces.length - 1 ? (endSt ? 'station' : 'cut') : 'cut', startStation: qi === 0 ? startSt?.id : undefined, endStation: qi === pieces.length - 1 ? endSt?.id : undefined, throughStations: through.filter((t) => t.s >= from - 1e-6 && t.s <= to + 1e-6).map((t) => ({ id: t.id, point: t.point })), corridorId: `svg-${ln.id}-${pi}` });
        });
      }
    });
    lines.push({ id: ln.id, ref: ln.ref, name: ln.name, color: ((opts.officialColours ?? true) && assigned.get(ln.id)) ? (assigned.get(ln.id) as Hex) : ln.color, chains });
  }
  // An interchange whose line ends sit far apart on the drawing (SEPTA draws 30th Street's Regional Rail, L and
  // trolley platforms as separate nodes joined by a connector) gets one marker per cluster of ends, not one pill
  // spanning them all — a pill that long would swallow every ribbon under it.
  {
    const rMaj = markerRadiusMajor(params);
    const splitR = rMaj * 2 + params.lineWidth;
    const extra: LayoutStation[] = [];
    for (const st of [...stMap.values()]) {
      if (!st.major || st.markerPoints.length < 2) continue;
      const clusters: Vec2[][] = [];
      for (const p of st.markerPoints) { const c = clusters.find((cl) => cl.some((q) => dist(p, q) <= splitR)); if (c) c.push(p); else clusters.push([p]); }
      if (clusters.length < 2) continue;
      clusters.sort((a, b) => b.length - a.length);
      st.markerPoints = clusters[0];
      clusters.slice(1).forEach((cl, k) => {
        const id = `${st.id}~m${k + 2}`;
        const twin: LayoutStation = { ...st, id, markerPoints: cl, x: cl[0][0], y: cl[0][1] };
        extra.push(twin);
        // chain ends that produced these points now belong to the twin
        for (const ln of lines) for (const ch of ln.chains) {
          if (ch.startStation === st.id && cl.some((q) => dist(q, ch.points[0]) < 1e-6)) ch.startStation = id;
          if (ch.endStation === st.id && cl.some((q) => dist(q, ch.points[ch.points.length - 1]) < 1e-6)) ch.endStation = id;
        }
      });
      log(`SVG import: "${st.name}" is drawn as ${clusters.length} separate interchange nodes; split`);
    }
    for (const t of extra) stMap.set(t.id, t);
    if (extra.length) net = { ...net, stations: [...net.stations, ...extra.map((t) => ({ ...net.stations.find((s) => s.id === t.id.split('~m')[0])!, id: t.id }))] };
  }
  for (const st of stMap.values()) { if (!st.markerPoints.length) st.markerPoints = [[st.x, st.y]]; if (st.major) { st.x = st.markerPoints.reduce((a, p) => a + p[0], 0) / st.markerPoints.length; st.y = st.markerPoints.reduce((a, p) => a + p[1], 0) / st.markerPoints.length; } }

  // 6. Labels where the drawing puts them (scaled), sized with our font — but never overlapping lines, markers or
  //    each other: the drawing's pose is only the preferred candidate; collisions fall back to the usual placements
  //    around the marker, then to a smaller size (≥ 4 mm), and finally the label is dropped rather than overlapped.
  const obstacles: Obstacles = { segments: [], markers: [], bounds: { x: 0, y: 0, w: W, h: H } };
  for (const ln of lines) for (const ch of ln.chains) for (let i = 1; i < ch.points.length; i++) obstacles.segments.push({ a: ch.points[i - 1], b: ch.points[i], r: params.lineWidth / 2 });
  const markerPolys = new Map<string, Vec2[]>();
  for (const st of stMap.values()) { const poly = roundedHull(st.markerPoints, st.markerRadius, 16); markerPolys.set(st.id, poly); obstacles.markers.push(poly); }
  const inputs: LabelCandidateInput[] = [];
  if (params.labels !== 'none') for (const st of net.stations) {
    const ls = stMap.get(st.id); if (!ls) continue;
    if (params.labels === 'major' && !ls.major) continue;
    const hit = drawingPos(st);
    const t = hit?.t;
    let text = params.labelLanguage === 'en' && st.nameEn ? st.nameEn : st.name;
    if (!font.canRender(text) && st.nameEn && font.canRender(st.nameEn)) text = st.nameEn;
    // Follow the drawing's own text size (scaled to mm) but never above the requested size.
    // Printed letters need ~4 mm to come out clean with a 0.4 mm nozzle; the drawing's size only shrinks them down to that.
    const drawn = t ? t.size * scale * 0.9 : 0;
    const fontSize = Math.max(4.0, Math.min(params.labelFontSize, drawn > 0 ? drawn : params.labelFontSize));
    const tape = params.labelMode === 'tape' || (params.labelMode === 'auto' && fontSize < 3.6);
    const pad = 0.6;
    let box = font.measure(text, fontSize);
    if (tape) {
      const tm = font.measure(text, tapeFontSize(params));
      const wTape = tm.width + 4, hTape = params.tapeWidth;
      box = { width: wTape, minX: 0, maxX: wTape, minY: -(hTape - tm.maxY + tm.minY) / 2 + tm.minY, maxY: 0 } as typeof box;
      box.maxY = box.minY + hTape;
    }
    const w = box.maxX - box.minX + 2 * pad, h = box.maxY - box.minY + 2 * pad;
    let preferred: { x: number; y: number; angle: number } | undefined;
    if (t) {
      const anchorPt = toMm([t.x, t.y]);
      const ang = (t.angle * Math.PI) / 180;
      const dx = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0;
      const dy = tape ? -(h / 2) : -(pad - box.minY); // baseline at the text's y (tape: centred on it)
      const origin: Vec2 = add(anchorPt, [dx * Math.cos(ang) - dy * Math.sin(ang), dx * Math.sin(ang) + dy * Math.cos(ang)]);
      preferred = { x: origin[0], y: origin[1], angle: t.angle };
    }
    const mb = bboxOf(markerPolys.get(st.id)!);
    const minHalf = ls.major ? 0 : params.lineWidth / 2 + 0.3;
    const smaller = tape ? [] : [0.85, 0.72].map((f) => Math.max(4, fontSize * f)).filter((fs, i, a) => fs < fontSize - 0.05 && a.indexOf(fs) === i).map((fs) => ({ fontSize: fs, box: font.measure(text, fs) }));
    inputs.push({ stationId: st.id, text, center: [ls.x, ls.y], halfW: Math.max(mb.w / 2, minHalf), halfH: Math.max(mb.h / 2, minHalf), box, fontSize: tape ? tapeFontSize(params) : fontSize, priority: (t ? 4 : 0) + st.lines.length * 2 + (ls.major ? 1 : 0), preferred, smaller });
  }
  const useTapeAll = params.labelMode === 'tape';
  const { labels: placedRaw } = placeLabels(inputs, obstacles, { gap: 1.2, allowRotated: params.labelAllowRotated, force: false, debug: (id, why) => { if (process.env.LABEL_DEBUG && id.includes(process.env.LABEL_DEBUG)) log?.(`[label ${id}]\n  ` + why.join('\n  ')); } });
  const labels: LayoutLabel[] = placedRaw.map(({ box, ...l }, i) => {
    const tape = useTapeAll || (params.labelMode === 'auto' && l.fontSize < 3.6);
    if (!tape) return { ...l, n: i + 1 };
    const tm = font.measure(l.text, tapeFontSize(params));
    return { ...l, n: i + 1, tape: true, textOrigin: [2 - tm.minX, (params.tapeWidth - (tm.maxY - tm.minY)) / 2 - tm.minY] };
  });
  const layoutStations = [...stMap.values()];
  const report: SvgImportReport = { usedColours: [...new Set(assigned.values())], matchedStations: stMap.size, unmatchedStations: unmatched, lineColours: net.lines.map((l) => ({ ref: l.ref, svgColour: assigned.get(l.id), pieces: (linePaths.get(l.id) ?? []).length })) };
  const graph: any = { nodes: new Map(), corridors: [], incident: new Map() };
  void roundedHull; void sub; void mul; void dot; void norm;
  return { layout: { width: W, height: H, stations: layoutStations, lines, labels, unlabeled: net.stations.filter((s) => !labels.some((l) => l.stationId === s.id)).map((s) => s.id), scale, graph, corridors: [] }, report, net };
}

function subPath(path: Vec2[], s0: number, s1: number): Vec2[] {
  const out: Vec2[] = [pointAt(path, s0).point];
  let acc = 0;
  for (let i = 1; i < path.length; i++) { const d = dist(path[i - 1], path[i]); if (acc + d > s0 && acc + d < s1) out.push(path[i]); acc += d; }
  out.push(pointAt(path, s1).point);
  return dedupe(out, 1e-6);
}


/** Community-drawn official-style schematics on Wikimedia Commons (CC BY-SA), keyed by normalised city/network name. */
export const KNOWN_MAP_SVGS: Record<string, { file: string; title: string; license: string }> = {
  london: { file: 'London_Underground_Overground_DLR_Crossrail_map.svg', title: 'London Underground, Overground, DLR and Elizabeth line map', license: 'CC BY-SA 4.0, Wikimedia Commons' },
};

/** Direct download URL of a Commons file (upload.wikimedia.org serves CORS, so browsers can fetch it). */
export async function commonsFileUrl(file: string): Promise<string> {
  const name = file.replace(/ /g, '_');
  const data = new TextEncoder().encode(name);
  const digest = await crypto.subtle.digest('MD5' as any, data).catch(() => undefined);
  if (digest) { const h = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`; }
  // WebCrypto has no MD5: fall back to the redirecting Special:FilePath endpoint.
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`;
}

export function knownMapFor(city: string, network?: string): { file: string; title: string; license: string } | undefined {
  const k = normalizeName(city), n = normalizeName(network ?? '');
  for (const [key, v] of Object.entries(KNOWN_MAP_SVGS)) if (k.includes(key) || n.includes(key)) return v;
  return undefined;
}
