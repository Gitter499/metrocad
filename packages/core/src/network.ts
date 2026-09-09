/** Builds a clean MetroNetwork (merged stations, one Line per route_master) from raw OSM route relations. */
import type { Hex, Line, Station, TransitMode } from './types.js';
import type { OsmNode, OsmRelation, RawRoute } from './osm.js';

export interface BuildNetworkInput {
  routes: RawRoute[];
  masters: OsmRelation[];
  nodes: Map<number, OsmNode>;
}

/** Fallback palette (Tokyo/London-ish hues) used when a route has no colour tag. */
export const FALLBACK_COLORS: Hex[] = [
  '#e4002b', '#0072bc', '#009b48', '#f7941d', '#8e258d', '#00a7e1', '#ffd400', '#a0522d',
  '#e6007e', '#6cc24a', '#003688', '#ff6f61', '#00b2a9', '#d4a017', '#5d3a9b', '#8c8c8c',
];

export function normalizeColor(c: string | undefined, fallback: Hex): Hex {
  if (!c) return fallback;
  let s = c.trim().toLowerCase();
  const named: Record<string, Hex> = {
    red: '#e4002b', blue: '#0072bc', green: '#009b48', yellow: '#ffd400', orange: '#f7941d', purple: '#8e258d',
    violet: '#8e258d', pink: '#e6007e', brown: '#a0522d', black: '#111111', grey: '#8c8c8c', gray: '#8c8c8c',
    silver: '#a8a9ad', gold: '#d4a017', lime: '#6cc24a', cyan: '#00b2a9', teal: '#00838f', navy: '#003688',
    magenta: '#e6007e', white: '#f2f2f2', turquoise: '#00b2a9', lightblue: '#00a7e1', darkgreen: '#006400',
  };
  if (named[s]) return named[s];
  if (/^#?[0-9a-f]{6}$/.test(s)) return s.startsWith('#') ? s : '#' + s;
  if (/^#?[0-9a-f]{3}$/.test(s)) { s = s.replace('#', ''); return '#' + s.split('').map((ch) => ch + ch).join(''); }
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(s);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  return fallback;
}

/** Aggressive name normalization used to merge the same station across lines. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(station|metro|métro|underground|subway|bahnhof|u-bahn|estación|estacion|stazione|gare)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function slug(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'x';
}

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110574);
}

const MERGE_RADIUS_M = 650;

interface Cluster { key: string; name: string; nameEn?: string; lat: number; lon: number; ids: number[]; n: number }

export function buildNetwork(input: BuildNetworkInput): { lines: Line[]; stations: Station[] } {
  const { routes, masters, nodes } = input;
  const masterById = new Map(masters.map((m) => [m.id, m] as const));

  // 1. Cluster stop nodes into stations by normalized name + proximity.
  const clustersByKey = new Map<string, Cluster[]>();
  const clusterOfNode = new Map<number, Cluster>();
  const usedNodeIds = new Set<number>();
  for (const r of routes) for (const id of r.stops) usedNodeIds.add(id);
  for (const id of usedNodeIds) {
    const n = nodes.get(id);
    if (!n) continue;
    const name = n.tags?.name ?? n.tags?.['name:en'] ?? `Stop ${id}`;
    const key = normalizeName(name) || `id${id}`;
    const list = clustersByKey.get(key) ?? [];
    let c = list.find((cl) => metersBetween(cl, n) < MERGE_RADIUS_M);
    if (!c) {
      c = { key, name, nameEn: n.tags?.['name:en'], lat: n.lat, lon: n.lon, ids: [], n: 0 };
      list.push(c);
      clustersByKey.set(key, list);
    }
    // running mean position
    c.lat = (c.lat * c.n + n.lat) / (c.n + 1);
    c.lon = (c.lon * c.n + n.lon) / (c.n + 1);
    c.n++;
    c.ids.push(id);
    if (!c.nameEn && n.tags?.['name:en']) c.nameEn = n.tags['name:en'];
    // prefer the most common spelling: keep the first, but if a later one lacks odd dashes, keep it.
    clusterOfNode.set(id, c);
  }

  // 2. Group routes into lines by route_master.
  interface LineAcc { key: string; tags: Record<string, string>; routes: RawRoute[]; mode: TransitMode }
  const lineAcc = new Map<string, LineAcc>();
  for (const r of routes) {
    const master = r.masterId !== undefined ? masterById.get(r.masterId) : undefined;
    const key = master ? `m${master.id}` : `r${r.id}`;
    let acc = lineAcc.get(key);
    if (!acc) {
      acc = { key, tags: { ...(r.tags), ...(master?.tags ?? {}) }, routes: [], mode: (r.tags.route as TransitMode) };
      lineAcc.set(key, acc);
    }
    acc.routes.push(r);
  }

  // 3. Build stations + sequences.
  const stationByCluster = new Map<Cluster, Station>();
  const stations: Station[] = [];
  const idCounts = new Map<string, number>();
  const stationFor = (c: Cluster): Station => {
    let s = stationByCluster.get(c);
    if (!s) {
      const base = slug(c.name);
      const count = (idCounts.get(base) ?? 0) + 1;
      idCounts.set(base, count);
      s = { id: count === 1 ? base : `${base}-${count}`, name: c.name, nameEn: c.nameEn && c.nameEn !== c.name ? c.nameEn : undefined, lat: c.lat, lon: c.lon, lines: [], osmIds: c.ids };
      stationByCluster.set(c, s);
      stations.push(s);
    }
    return s;
  };

  let lines: Line[] = [];
  let colorIdx = 0;
  for (const acc of lineAcc.values()) {
    const sequences: string[][] = [];
    for (const r of acc.routes) {
      const seq: string[] = [];
      for (const nid of r.stops) {
        const c = clusterOfNode.get(nid);
        if (!c) continue;
        const st = stationFor(c);
        if (seq[seq.length - 1] !== st.id) seq.push(st.id);
      }
      // A route that visits the same station twice (loops) is fine; but drop degenerate sequences.
      if (seq.length >= 2) sequences.push(seq);
    }
    if (!sequences.length) continue;
    const t = acc.tags;
    const ref = (t.ref ?? t.name ?? acc.key).trim();
    const fallback = FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length];
    lines.push({
      id: acc.key,
      ref,
      name: t.name ?? ref,
      color: normalizeColor(t.colour ?? t.color, fallback),
      mode: acc.mode,
      network: t.network,
      operator: t.operator,
      sequences,
    });
  }

  // 4. Merge lines that are really variants of one line: same colour + overlapping station sets.
  lines = mergeSimilarLines(lines);

  // 4a. Express/skip-stop services: replace pairs that skip over local stations with the local path,
  //     so the map draws one track, not a shortcut loop (SEPTA Broad Street express, NYC express).
  for (const ln of lines) expandExpressVariants(ln, stations);

  // 4b. Walking interchanges: stations of *different* lines within ~130 m under different names
  //     (SEPTA "City Hall" / "15th Street", PATCO "8th & Market" / "8th Street") become one station.
  mergeNearbyInterchanges(stations, lines, 220);

  // 5. Station.lines, dedupe, deterministic ordering.
  for (const st of stations) st.lines = [];
  for (const ln of lines) {
    const set = new Set(ln.sequences.flat());
    for (const id of set) stations.find((s) => s.id === id)!.lines.push(ln.id);
  }
  const used = stations.filter((s) => s.lines.length > 0);
  lines.sort((a, b) => refSortKey(a.ref) - refSortKey(b.ref) || a.ref.localeCompare(b.ref));
  // Rename ids to be stable & readable: line-<slug(ref)>.
  const idMap = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const ln of lines) {
    const base = 'line-' + slug(ln.ref);
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    idMap.set(ln.id, n === 1 ? base : `${base}-${n}`);
  }
  for (const ln of lines) ln.id = idMap.get(ln.id)!;
  for (const st of used) st.lines = st.lines.map((l) => idMap.get(l)!);
  return { lines, stations: used };
}

function refSortKey(ref: string): number {
  const m = /^(\d+)/.exec(ref);
  return m ? Number(m[1]) : 1e6;
}

function mergeSimilarLines(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const ln of lines) {
    const set = new Set(ln.sequences.flat());
    const target = out.find((o) => {
      if (o.color !== ln.color || o.mode !== ln.mode) return false;
      if ((o.network ?? '') !== (ln.network ?? '')) return false;
      const os = new Set(o.sequences.flat());
      let shared = 0;
      for (const id of set) if (os.has(id)) shared++;
      const smaller = Math.min(set.size, os.size);
      // Different numeric refs with the same colour (Paris 6 / 7bis) must stay apart: require heavy overlap.
      return shared >= Math.max(3, 0.35 * smaller);
    });
    if (target) {
      target.sequences.push(...ln.sequences);
      // Keep the shortest sensible ref.
      if (ln.ref.length < target.ref.length) { target.ref = ln.ref; }
      if (!/:/.test(target.name) && /:/.test(ln.name)) target.name = ln.name.split(':')[0];
      else if (/:/.test(target.name)) target.name = target.name.split(':')[0];
    } else out.push({ ...ln, sequences: [...ln.sequences] });
  }
  return out;
}


function mergeNearbyInterchanges(stations: Station[], lines: Line[], radiusM: number): void {
  const linesOf = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();
  for (const ln of lines) for (const seq of ln.sequences) for (let i = 0; i < seq.length; i++) {
    const id = seq[i];
    const set = linesOf.get(id) ?? new Set(); set.add(ln.id); linesOf.set(id, set);
    const nb = neighbors.get(id) ?? new Set(); neighbors.set(id, nb);
    if (i > 0) nb.add(seq[i - 1]);
    if (i + 1 < seq.length) nb.add(seq[i + 1]);
  }
  const alive = new Map(stations.map((s) => [s.id, s]));
  const redirect = new Map<string, string>();
  const resolve = (id: string) => { let cur = id; while (redirect.has(cur)) cur = redirect.get(cur)!; return cur; };
  // Candidate pairs, closest first (so Bank+Monument merges before Bank+Cannon Street).
  const pairs: { a: Station; b: Station; d: number }[] = [];
  for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
    const d = metersBetween(stations[i], stations[j]);
    if (d <= radiusM) pairs.push({ a: stations[i], b: stations[j], d });
  }
  pairs.sort((x, y) => x.d - y.d);
  for (const { a: a0, b: b0 } of pairs) {
    const a = alive.get(resolve(a0.id)), b = alive.get(resolve(b0.id));
    if (!a || !b || a === b) continue;
    const la = linesOf.get(a.id) ?? new Set(), lb = linesOf.get(b.id) ?? new Set();
    if (!la.size || !lb.size) continue;
    let shared = false; for (const l of la) if (lb.has(l)) shared = true;
    if (shared) continue;
    // Parallel lines: if a neighbour of a or b is already served by lines of both, these are two
    // distinct stations on parallel routes (Chemin Vert / Bréguet-Sabin), not an interchange.
    let parallel = false;
    for (const n of [...(neighbors.get(a.id) ?? []), ...(neighbors.get(b.id) ?? [])]) {
      const ln = linesOf.get(resolve(n)); if (!ln) continue;
      let hitA = false, hitB = false;
      for (const l of ln) { if (la.has(l)) hitA = true; if (lb.has(l)) hitB = true; }
      if (hitA && hitB) { parallel = true; break; }
    }
    if (parallel) continue;
    a.lat = (a.lat + b.lat) / 2; a.lon = (a.lon + b.lon) / 2;
    if (!a.name.includes(b.name) && !b.name.includes(a.name)) a.name = `${a.name} / ${b.name}`;
    a.osmIds.push(...b.osmIds);
    for (const l of lb) la.add(l);
    linesOf.set(a.id, la);
    const nb = neighbors.get(a.id) ?? new Set(); for (const n of neighbors.get(b.id) ?? []) nb.add(n); neighbors.set(a.id, nb);
    alive.delete(b.id); redirect.set(b.id, a.id);
  }
  if (!redirect.size) return;
  for (const ln of lines) ln.sequences = ln.sequences.map((seq) => seq.map(resolve).filter((id, k, arr) => k === 0 || arr[k - 1] !== id));
  for (let k = stations.length - 1; k >= 0; k--) if (!alive.has(stations[k].id)) stations.splice(k, 1);
}


function expandExpressVariants(line: Line, stations: Station[]): void {
  const pos = new Map(stations.map((s) => [s.id, s]));
  for (let pass = 0; pass < 4; pass++) {
    // adjacency from all current sequences
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a); };
    for (const seq of line.sequences) for (let i = 0; i + 1 < seq.length; i++) link(seq[i], seq[i + 1]);
    let changed = false;
    line.sequences = line.sequences.map((seq) => {
      const out: string[] = [seq[0]];
      for (let i = 0; i + 1 < seq.length; i++) {
        const a = seq[i], b = seq[i + 1];
        const path = localPath(a, b, adj, pos);
        if (path) { changed = true; out.push(...path.slice(1)); } else out.push(b);
      }
      return out;
    });
    if (!changed) break;
  }
}

/** Shortest path a->b (2..8 hops) avoiding the direct edge, with every intermediate close to the a-b segment. */
function localPath(a: string, b: string, adj: Map<string, Set<string>>, pos: Map<string, Station>): string[] | undefined {
  const A = pos.get(a), B = pos.get(b);
  if (!A || !B) return undefined;
  const L = metersBetween(A, B);
  if (L < 50) return undefined;
  const tol = Math.max(0.3 * L, 350);
  const near = (id: string) => {
    const P = pos.get(id); if (!P) return false;
    // distance from P to segment AB in metres
    const kx = 111320 * Math.cos((A.lat * Math.PI) / 180), ky = 110574;
    const ax = 0, ay = 0, bx = (B.lon - A.lon) * kx, by = (B.lat - A.lat) * ky, px = (P.lon - A.lon) * kx, py = (P.lat - A.lat) * ky;
    const l2 = bx * bx + by * by; const t = Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / l2));
    const d = Math.hypot(px - (ax + t * bx), py - (ay + t * by));
    return d < tol && t > 0.02 && t < 0.98;
  };
  const prev = new Map<string, string>(); prev.set(a, '');
  const queue = [a];
  const depth = new Map<string, number>([[a, 0]]);
  while (queue.length) {
    const cur = queue.shift()!;
    const d = depth.get(cur)!;
    if (d >= 8) continue;
    for (const nb of adj.get(cur) ?? []) {
      if (prev.has(nb)) continue;
      if (cur === a && nb === b) continue; // the direct (express) edge
      if (nb !== b && !near(nb)) continue;
      prev.set(nb, cur); depth.set(nb, d + 1);
      if (nb === b) {
        const path = [b]; let x = b; while (prev.get(x)) { x = prev.get(x)!; path.push(x); }
        return path.reverse().length >= 3 ? path.reverse().reverse() : undefined;
      }
      queue.push(nb);
    }
  }
  return undefined;
}
