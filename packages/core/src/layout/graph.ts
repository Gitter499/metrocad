/** Station graph + corridor extraction (reduced graph of major stations connected by chains of regular stations). */
import type { MetroNetwork, Vec2 } from '../types.js';

export interface GNode {
  id: string;
  name: string;
  nameEn?: string;
  /** Geographic position in metres (local tangent plane). */
  geo: Vec2;
  /** Layout position (units). */
  pos: Vec2;
  lines: string[];
  neighbors: Set<string>;
  major: boolean;
}

export interface Corridor {
  id: string;
  /** Major endpoints. */
  a: string;
  b: string;
  /** Regular stations strictly between a and b, in order from a to b. */
  interior: string[];
  /** Lines using this corridor (multi-line corridors have no interior). */
  lines: string[];
  /** Geographic polyline a -> interior -> b. */
  geoPath: Vec2[];
}

export interface StationGraph {
  nodes: Map<string, GNode>;
  corridors: Corridor[];
  /** Corridors touching each major node. */
  incident: Map<string, Corridor[]>;
}

export function projectNetwork(net: MetroNetwork): Map<string, Vec2> {
  const lat0 = net.stations.reduce((s, st) => s + st.lat, 0) / Math.max(1, net.stations.length);
  const lon0 = net.stations.reduce((s, st) => s + st.lon, 0) / Math.max(1, net.stations.length);
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const out = new Map<string, Vec2>();
  for (const st of net.stations) out.set(st.id, [(st.lon - lon0) * kx, (st.lat - lat0) * ky]);
  return out;
}

export function buildStationGraph(net: MetroNetwork): StationGraph {
  const geo = projectNetwork(net);
  const nodes = new Map<string, GNode>();
  for (const st of net.stations) {
    nodes.set(st.id, { id: st.id, name: st.name, nameEn: st.nameEn, geo: geo.get(st.id)!, pos: [...geo.get(st.id)!] as Vec2, lines: [...st.lines], neighbors: new Set(), major: false });
  }
  for (const ln of net.lines) for (const seq of ln.sequences) {
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = nodes.get(seq[i]), b = nodes.get(seq[i + 1]);
      if (!a || !b || a === b) continue;
      a.neighbors.add(b.id); b.neighbors.add(a.id);
    }
  }
  for (const n of nodes.values()) n.major = n.lines.length > 1 || n.neighbors.size !== 2;
  // A closed loop of regular stations (rare) has no major node: promote one so corridors terminate.
  for (const ln of net.lines) {
    const ids = new Set(ln.sequences.flat());
    if (![...ids].some((id) => nodes.get(id)?.major)) {
      const first = nodes.get(ln.sequences[0][0]);
      if (first) first.major = true;
    }
  }

  // Edge -> lines map from the sequences.
  const edgeLines = new Map<string, Set<string>>();
  const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const ln of net.lines) for (const seq of ln.sequences) for (let i = 0; i + 1 < seq.length; i++) {
    if (seq[i] === seq[i + 1] || !nodes.has(seq[i]) || !nodes.has(seq[i + 1])) continue;
    const k = ekey(seq[i], seq[i + 1]);
    const set = edgeLines.get(k) ?? new Set<string>();
    set.add(ln.id); edgeLines.set(k, set);
  }

  // Corridors: from every major node, walk each neighbour through regular nodes until the next major.
  // This is independent of where route variants start, so short-turn services never drop segments.
  const corridors: Corridor[] = [];
  const byKey = new Map<string, Corridor>();
  for (const start of nodes.values()) {
    if (!start.major) continue;
    for (const nb of start.neighbors) {
      const ids = [start.id];
      let prev = start.id, cur = nb;
      let guard = 0;
      while (guard++ < 10000) {
        ids.push(cur);
        const n = nodes.get(cur)!;
        if (n.major) break;
        const next = [...n.neighbors].find((x) => x !== prev);
        if (next === undefined) break; // dead end at a regular node (shouldn't happen: degree 2)
        prev = cur; cur = next;
      }
      if (ids.length < 2) continue;
      const rev = [...ids].reverse();
      const k1 = ids.join('>'), k2 = rev.join('>');
      if (byKey.has(k1) || byKey.has(k2)) continue;
      const lines = new Set<string>();
      for (let i = 0; i + 1 < ids.length; i++) for (const l of edgeLines.get(ekey(ids[i], ids[i + 1])) ?? []) lines.add(l);
      const c: Corridor = { id: `c${corridors.length}`, a: ids[0], b: ids[ids.length - 1], interior: ids.slice(1, -1), lines: [...lines], geoPath: ids.map((id) => nodes.get(id)!.geo) };
      corridors.push(c); byKey.set(k1, c);
    }
  }
  const incident = new Map<string, Corridor[]>();
  for (const c of corridors) {
    for (const end of [c.a, c.b]) {
      const l = incident.get(end) ?? [];
      l.push(c); incident.set(end, l);
    }
  }
  return { nodes, corridors, incident };
}
