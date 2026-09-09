/** Layout orchestration: network -> MapLayout (mm). */
import type { Station, DesignParams, LayoutLabel, LayoutLine, LayoutStation, MapLayout, MetroNetwork, Vec2 } from '../types.js';
import { buildStationGraph, type StationGraph } from './graph.js';
import { layoutReducedGraph, snapToGrid, straighten, applyFisheye, relaxMajors } from './force.js';
import { buildCorridorGeometry, splitForBed, paramOf, pointAt, dedupe, pathLength, type CorridorGeometry } from './route.js';
import { placeLabels, type LabelCandidateInput, type Obstacles } from './labels.js';
import { thinTramStops, mergeNearbyInterchanges } from '../network.js';
import { bboxOf, dist, add, sub, mul, fromAngle } from '../vec.js';
import type { TextFont } from '../text.js';

export interface LayoutResult extends MapLayout {
  graph: StationGraph;
  corridors: CorridorGeometry[];
}

/** Convex hull (Andrew's monotone chain). */
export function convexHull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Outline of the hull of circles (radius r) centred at pts — a rounded polygon. */
export function roundedHull(pts: Vec2[], r: number, segs = 24): Vec2[] {
  const ring: Vec2[] = [];
  const uniq = dedupe(pts, 1e-6);
  for (const c of uniq) for (let i = 0; i < segs; i++) ring.push(add(c, fromAngle((i / segs) * Math.PI * 2, r)));
  return convexHull(ring);
}

export function markerRadiusMajor(p: DesignParams): number {
  return p.lineWidth * 0.5 + p.ringWidth + 0.4;
}
export function dotRadius(p: DesignParams): number {
  return (p.lineWidth * p.dotFactor) / 2;
}

export function computeLayout(net: MetroNetwork, params: DesignParams, font: TextFont, log?: (m: string) => void): LayoutResult {
  if ((params.tramStops ?? 'major') !== 'all' && net.lines.some((l) => l.mode === 'tram')) {
    // Surface tram stops every couple of blocks would swamp a generated map; keep termini, branches, interchanges.
    const copy: MetroNetwork = { ...net, lines: net.lines.map((l) => ({ ...l, sequences: l.sequences.map((q) => [...q]) })), stations: net.stations.map((s) => ({ ...s, lines: [...s.lines] })) };
    thinTramStops(copy.lines, copy.stations);
    for (const s of copy.stations) s.lines = copy.lines.filter((l) => l.sequences.some((q) => q.includes(s.id))).map((l) => l.id);
    copy.stations = copy.stations.filter((s) => s.lines.length);
    net = copy;
  }
  // Generated layouts draw walking interchanges (Bank/Monument, City Hall/15th Street/Suburban) as one node.
  {
    const copy: MetroNetwork = { ...net, lines: net.lines.map((l) => ({ ...l, sequences: l.sequences.map((q) => [...q]) })), stations: net.stations.map((s) => ({ ...s, lines: [...s.lines], osmIds: [...s.osmIds] })) };
    for (const group of net.interchanges ?? []) {
      const members = group.map((id) => copy.stations.find((s) => s.id === id)).filter((s): s is Station => !!s);
      const [a, ...rest] = members;
      for (const b of rest) {
        if (!a.name.includes(b.name)) a.name = `${a.name} / ${b.name}`;
        for (const l of copy.lines) l.sequences = l.sequences.map((q) => q.map((id) => (id === b.id ? a.id : id)).filter((id, k, arr) => k === 0 || arr[k - 1] !== id));
        copy.stations = copy.stations.filter((s) => s !== b);
      }
    }
    mergeNearbyInterchanges(copy.stations, copy.lines, 220);
    for (const s of copy.stations) s.lines = copy.lines.filter((l) => l.sequences.some((q) => q.includes(s.id))).map((l) => l.id);
    copy.stations = copy.stations.filter((s) => s.lines.length);
    net = copy;
  }
  const graph = buildStationGraph(net);
  const lo0 = params.layout;
  // Octilinear for networks with up to ~8 distinct colours (same-coloured services share ribbons); larger ones read better semi-geographic.
  const resolvedMode = lo0.mode === 'auto' ? (new Set(net.lines.map((l) => l.color)).size <= 8 ? 'schematic' : 'semi') : lo0.mode;
  const lo = { ...lo0, mode: resolvedMode };
  params = { ...params, layout: lo };
  const semi = lo.mode === 'semi';
  const strength = lo.mode === 'geographic' || semi ? 0 : lo.schematicStrength;
  if (semi) {
    // Keep the geographic shape: fisheye on every station, then only spread majors that sit too close.
    applyFisheye(graph.nodes.values(), lo.fisheye);
    relaxMajors(graph, lo.iterations);
  } else {
    layoutReducedGraph(graph, { strength, fisheye: lo.fisheye, iterations: lo.iterations, seed: lo.seed, lengthExponent: 0.8, anchor: 0.12, fidelityMin: 0.6, fidelityMax: 1.7 });
    if (strength > 0.5) { snapToGrid(graph, 1); straighten(graph, 1, 4); }
  }

  // Regular (interior) stations: positions come from corridor paths later.
  const majors = [...graph.nodes.values()].filter((n) => n.major);
  const unitBox = bboxOf(majors.map((n) => n.pos));
  const lineOrder = new Map(net.lines.map((l, i) => [l.id, i]));
  const lineById = new Map(net.lines.map((l) => [l.id, l]));

  const desiredUnitMm = Math.max(params.lineWidth * 2.2, params.labelFontSize * 2.4);
  // Margin for labels around the station extents.
  const maxLabelW = Math.max(...net.stations.map((s) => font.measure(labelText(s, params), params.labelFontSize).width), 10);
  const margin = maxLabelW * 0.5 + markerRadiusMajor(params) + 6;
  const W = params.widthMm;
  // Fill the requested width (and height when given); the wall size dictates the scale.
  let unitMm = (W - 2 * margin) / Math.max(unitBox.w, 1e-6);
  // Tall, narrow networks: cap the automatic height at 1.4 × width and never spread stations absurdly far.
  const maxAutoH = W * 1.4;
  if (!params.heightMm && unitBox.h * unitMm + 2 * margin > maxAutoH) unitMm = (maxAutoH - 2 * margin) / Math.max(unitBox.h, 1e-6);
  unitMm = Math.min(unitMm, desiredUnitMm * 3);
  let H = params.heightMm ?? (unitBox.h * unitMm + 2 * margin);
  if (params.heightMm) unitMm = Math.min(unitMm, (H - 2 * margin) / Math.max(unitBox.h, 1e-6));
  if (unitMm < desiredUnitMm) log?.(`Station spacing ${unitMm.toFixed(1)}mm is below the comfortable ${desiredUnitMm.toFixed(1)}mm for this label size; consider a wider map or smaller labels`);

  let result: LayoutResult | undefined;
  for (let pass = 0; pass < 3; pass++) {
    result = buildAtScale(net, graph, params, font, unitMm, W, H, unitBox, lineOrder, lineById, log);
    const content = contentBox(result);
    const overflow = Math.max(content.w / W, content.h / H);
    if (overflow <= 1.001) {
      // center content
      const dx = (W - content.w) / 2 - content.x, dy = (H - content.h) / 2 - content.y;
      translateLayout(result, dx, dy);
      break;
    }
    unitMm /= overflow * 1.02;
    if (!params.heightMm) H = unitBox.h * unitMm + 2 * margin;
    log?.(`Layout overflowed by ${(overflow * 100 - 100).toFixed(1)}%, shrinking (pass ${pass + 1})`);
  }
  return result!;
}

/** Tape labels are used when asked for, or in auto mode when printed letters would be too small for a 0.4 mm nozzle. */
export function useTape(params: DesignParams): boolean {
  if (params.labels === 'none') return false;
  if (params.labelMode === 'tape') return true;
  if (params.labelMode === 'print') return false;
  return params.labelFontSize < 3.6;
}

/** Text size (em, mm) a label maker prints on a given tape width (roughly 60 % of the tape). */
export function tapeFontSize(params: DesignParams): number {
  return Math.max(3, params.tapeWidth * 0.55);
}

function labelText(s: { name: string; nameEn?: string }, params: DesignParams): string {
  return params.labelLanguage === 'en' && s.nameEn ? s.nameEn : s.name;
}

function buildAtScale(
  net: MetroNetwork, graph: StationGraph, params: DesignParams, font: TextFont, unitMm: number, W: number, H: number,
  unitBox: { x: number; y: number; w: number; h: number }, lineOrder: Map<string, number>, lineById: Map<string, any>, log?: (m: string) => void,
): LayoutResult {
  const ox = (W - unitBox.w * unitMm) / 2, oy = (H - unitBox.h * unitMm) / 2;
  // Copy graph positions into mm (only majors matter; interiors get placed along corridors).
  const g: StationGraph = { nodes: new Map(), corridors: graph.corridors, incident: graph.incident };
  for (const [id, n] of graph.nodes) g.nodes.set(id, { ...n, pos: [(n.pos[0] - unitBox.x) * unitMm + ox, (n.pos[1] - unitBox.y) * unitMm + oy] });

  const semi = params.layout.mode === 'semi';
  const corridors = buildCorridorGeometry(g, {
    lineWidth: params.lineWidth, lineGap: params.lineGap, cornerRadius: params.cornerRadiusFactor * params.lineWidth,
    lineOrder, lineColor: new Map(net.lines.map((l) => [l.id, l.color])), arcSegments: params.quality === 'print' ? 10 : 5, detour: unitMm * 1.5,
    style: semi ? 'smooth' : 'octilinear', angleStep: semi ? 30 : undefined, simplifyTol: semi ? Math.max(4, unitMm * 0.35) : undefined,
  });

  // Station records
  const stations = new Map<string, LayoutStation>();
  for (const n of g.nodes.values()) {
    stations.set(n.id, { id: n.id, name: n.name, x: n.pos[0], y: n.pos[1], lines: n.lines, major: n.major, markerPoints: [], markerRadius: n.major ? markerRadiusMajor(params) : dotRadius(params) });
  }
  // Interior station positions + marker points at majors
  const chainsByLine = new Map<string, LayoutLine['chains']>();
  const bedW = params.bed.x - 2 * params.bedMargin, bedH = params.bed.y - 2 * params.bedMargin;
  let chainCounter = 0;
  for (const cg of corridors) {
    const c = cg.corridor;
    c.interior.forEach((id, i) => {
      const st = stations.get(id)!;
      st.x = cg.interiorPoints[i][0]; st.y = cg.interiorPoints[i][1];
      st.markerPoints = [[st.x, st.y]];
    });
    for (const lg of cg.lines) {
      const path = lg.path;
      stations.get(c.a)!.markerPoints.push(path[0]);
      stations.get(c.b)!.markerPoints.push(path[path.length - 1]);
      // Through stations for single-line corridors: project interior points onto this (offset) path.
      const through = c.interior.map((id) => {
        const st = stations.get(id)!;
        const s = paramOf(path, [st.x, st.y]);
        const pt = pointAt(path, s).point;
        st.x = pt[0]; st.y = pt[1]; st.markerPoints = [pt];
        return { id, point: pt, s };
      });
      const pieces = splitForBed(path, params.lineWidth / 2 + 1, bedW, bedH, through.map((t) => t.s));
      const chains = chainsByLine.get(lg.lineId) ?? [];
      let acc = 0;
      pieces.forEach((pts, pi) => {
        const L = pathLength(pts);
        const from = acc, to = acc + L;
        acc = to;
        const inside = through.filter((t) => t.s >= from - 1e-6 && t.s <= to + 1e-6).map((t) => ({ id: t.id, point: t.point }));
        chains.push({
          id: `${lg.lineId}-${c.id}-${pi}`,
          points: pts,
          startEnd: pi === 0 ? 'station' : 'cut',
          endEnd: pi === pieces.length - 1 ? 'station' : 'cut',
          startStation: pi === 0 ? c.a : undefined,
          endStation: pi === pieces.length - 1 ? c.b : undefined,
          throughStations: inside,
          corridorId: c.id,
        });
      });
      chainsByLine.set(lg.lineId, chains);
    }
  }
  for (const st of stations.values()) {
    if (!st.markerPoints.length) st.markerPoints = [[st.x, st.y]];
    if (st.major) {
      // centre = centroid of marker points
      const cx = st.markerPoints.reduce((s, p) => s + p[0], 0) / st.markerPoints.length;
      const cy = st.markerPoints.reduce((s, p) => s + p[1], 0) / st.markerPoints.length;
      st.x = cx; st.y = cy;
    }
  }

  const lines: LayoutLine[] = net.lines.map((l) => ({ id: l.id, ref: l.ref, name: l.name, color: l.color, chains: chainsByLine.get(l.id) ?? [] }));

  // Labels
  const obstacles: Obstacles = { segments: [], markers: [], bounds: { x: 0, y: 0, w: W, h: H } };
  for (const ln of lines) for (const ch of ln.chains) for (let i = 1; i < ch.points.length; i++) obstacles.segments.push({ a: ch.points[i - 1], b: ch.points[i], r: params.lineWidth / 2 });
  const markerPolys = new Map<string, Vec2[]>();
  for (const st of stations.values()) {
    const poly = roundedHull(st.markerPoints, st.markerRadius, 16);
    markerPolys.set(st.id, poly);
    obstacles.markers.push(poly);
  }
  const inputs: LabelCandidateInput[] = [];
  const tape = useTape(params);
  const tapeFont = tapeFontSize(params);
  if (params.labels !== 'none') {
    for (const st of stations.values()) {
      if (params.labels === 'major' && !st.major) continue;
      const netSt = net.stations.find((s) => s.id === st.id)!;
      let text = labelText(netSt, params);
      if (!font.canRender(text) && netSt.nameEn && font.canRender(netSt.nameEn)) text = netSt.nameEn;
      let box = font.measure(text, params.labelFontSize);
      if (tape) {
        // Tape label: box = tape width high, text length + end margins wide (label makers add ~2 mm each side).
        const tm = font.measure(text, tapeFont);
        const wTape = tm.width + 4, hTape = params.tapeWidth;
        box = { width: wTape, minX: 0, maxX: wTape, minY: -(hTape - tm.maxY + tm.minY) / 2 + tm.minY, maxY: 0 };
        box.maxY = box.minY + hTape;
      }
      const mb = bboxOf(markerPolys.get(st.id)!);
      // Regular dots sit on a line wider than the dot: anchor off the line edge, not the dot edge.
      const minHalf = st.major ? 0 : params.lineWidth / 2 + 0.3;
      // Printed letters may shrink (never below 4 mm, the clean-print floor for a 0.4 mm nozzle) when the full size can't fit.
      const smaller = tape ? [] : [0.85, 0.72].map((f) => Math.max(4, params.labelFontSize * f)).filter((fs, i, a) => fs < params.labelFontSize - 0.05 && a.indexOf(fs) === i).map((fs) => ({ fontSize: fs, box: font.measure(text, fs) }));
      inputs.push({
        stationId: st.id, text, center: [st.x, st.y], halfW: Math.max(mb.w / 2, minHalf), halfH: Math.max(mb.h / 2, minHalf), box, fontSize: tape ? tapeFont : params.labelFontSize,
        priority: st.lines.length * 2 + (st.major ? 1 : 0), smaller,
      });
    }
  }
  const { labels: placedRaw, unlabeled } = placeLabels(inputs, obstacles, { gap: 1.2, allowRotated: params.labelAllowRotated, force: false });
  const labels: LayoutLabel[] = placedRaw.map(({ box: _box, ...l }, n) => {
    if (tape) {
      // centre the text vertically in the tape box
      const tm = font.measure(l.text, tapeFont);
      return { ...l, n: n + 1, tape: true, textOrigin: [2 - tm.minX, (params.tapeWidth - (tm.maxY - tm.minY)) / 2 - tm.minY] };
    }
    return { ...l, n: n + 1 };
  });
  if (unlabeled.length) log?.(`${unlabeled.length} stations could not be labelled without collisions`);

  return { width: W, height: H, stations: [...stations.values()], lines, labels, unlabeled, scale: unitMm, graph: g, corridors };
}

function contentBox(r: LayoutResult): { x: number; y: number; w: number; h: number } {
  const pts: Vec2[] = [];
  for (const st of r.stations) for (const p of st.markerPoints) { pts.push([p[0] - st.markerRadius, p[1] - st.markerRadius], [p[0] + st.markerRadius, p[1] + st.markerRadius]); }
  for (const l of r.lines) for (const c of l.chains) for (const p of c.points) pts.push(p);
  for (const lb of r.labels) {
    const t = (lb.angle * Math.PI) / 180;
    for (const [cx, cy] of [[0, 0], [lb.width, 0], [lb.width, lb.height], [0, lb.height]] as Vec2[]) {
      pts.push([lb.x + cx * Math.cos(t) - cy * Math.sin(t), lb.y + cx * Math.sin(t) + cy * Math.cos(t)]);
    }
  }
  return bboxOf(pts);
}

function translateLayout(r: LayoutResult, dx: number, dy: number): void {
  const mv = (p: Vec2): Vec2 => [p[0] + dx, p[1] + dy];
  for (const st of r.stations) { st.x += dx; st.y += dy; st.markerPoints = st.markerPoints.map(mv); }
  for (const l of r.lines) for (const c of l.chains) { c.points = c.points.map(mv); c.throughStations = c.throughStations.map((t) => ({ id: t.id, point: mv(t.point) })); }
  for (const lb of r.labels) { lb.x += dx; lb.y += dy; }
  for (const cg of r.corridors) { cg.center = cg.center.map(mv); cg.interiorPoints = cg.interiorPoints.map(mv); for (const l of cg.lines) l.path = l.path.map(mv); }
  for (const n of r.graph.nodes.values()) n.pos = mv(n.pos);
  void dist; void sub; void mul;
}
