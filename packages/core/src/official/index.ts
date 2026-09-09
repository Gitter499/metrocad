/**
 * Official-source overlays: where OpenStreetMap's route relations are incomplete, the operator's own map is the source
 * of truth for which stations a line has and in what order. An overlay replaces the matching OSM lines wholesale;
 * OSM (or the overlay's own table) supplies coordinates.
 */
import type { Line, MetroNetwork, Station, TransitMode } from '../types.js';
import { normalizeName, slug, mergeNearbyInterchanges } from '../network.js';

export interface OfficialLine { ref: string; name: string; color: string; mode: TransitMode; stations: string[] }
export interface OfficialOverlay {
  /** Applies when any line of the network matches. */
  match: { network: RegExp };
  /** OSM lines of these modes (matching the network) are replaced by the overlay's lines. */
  replaceModes: TransitMode[];
  lines: OfficialLine[];
  /** Other spellings (OSM, older maps) → official name. */
  aliases?: Record<string, string>;
  /** Coordinates for stations OSM route relations don't carry. */
  coords?: Record<string, [number, number]>;
  /** Stations the official map draws as one interchange although OSM names them separately; "Name@REF" pins a name to a line. */
  interchanges?: string[][];
  /** Schematic geography: positions (lat, lon) that spread a dense downtown the way the official map does; applied last. */
  pins?: Record<string, [number, number]>;
}

export interface OverlayReport { overlay: string; replaced: string[]; added: string[]; createdStations: string[]; missing: string[] }

const registry: { name: string; overlay: OfficialOverlay }[] = [];
export function registerOverlay(name: string, overlay: OfficialOverlay): void { registry.push({ name, overlay }); }
export function overlaysFor(net: MetroNetwork): { name: string; overlay: OfficialOverlay }[] {
  return registry.filter(({ overlay }) => net.lines.some((l) => overlay.match.network.test(`${l.network ?? ''} ${l.operator ?? ''} ${l.name}`)));
}

/** Station names the overlay needs that the network doesn't have yet (to fetch coordinates for). */
export function overlayMissingNames(net: MetroNetwork, overlay: OfficialOverlay): string[] {
  const have = new Set(net.stations.map((s) => normalizeName(s.name)));
  const canon = (n: string) => normalizeName(overlay.aliases?.[n] ?? n);
  const out = new Set<string>();
  for (const l of overlay.lines) for (const n of l.stations) if (!have.has(canon(n)) && !overlay.coords?.[n] && ![...have].some((h) => h === normalizeName(n))) out.add(n);
  return [...out];
}

/** Replace/add lines from an overlay. `coords` supplies positions for stations OSM doesn't have (name → [lat, lon]). */
export function applyOverlay(net: MetroNetwork, name: string, overlay: OfficialOverlay, coords: Record<string, [number, number]> = {}, log?: (m: string) => void): OverlayReport {
  const report: OverlayReport = { overlay: name, replaced: [], added: [], createdStations: [], missing: [] };
  const matches = (l: Line) => overlay.match.network.test(`${l.network ?? ''} ${l.operator ?? ''} ${l.name}`);
  const network = net.lines.find((l) => matches(l))?.network;
  // 1. Drop the OSM lines the overlay replaces.
  const keep: Line[] = [];
  for (const l of net.lines) { if (overlay.replaceModes.includes(l.mode) && matches(l)) report.replaced.push(l.ref); else keep.push(l); }
  net.lines = keep;
  for (const s of net.stations) s.lines = s.lines.filter((id) => keep.some((l) => l.id === id));
  // 2. Resolve station names.
  const byKey = new Map<string, Station>();
  for (const s of net.stations) byKey.set(normalizeName(s.name), s);
  const aliasTo = new Map<string, string>();
  for (const [from, to] of Object.entries(overlay.aliases ?? {})) aliasTo.set(normalizeName(from), to);
  const findCoords = (official: string): [number, number] | undefined => {
    const c = overlay.coords?.[official] ?? coords[official]; if (c) return c;
    const k = normalizeName(official);
    for (const [n, v] of Object.entries({ ...(overlay.coords ?? {}), ...coords })) if (normalizeName(n) === k) return v;
    return undefined;
  };
  let created = 0;
  const resolve = (official: string): Station | undefined => {
    const k = normalizeName(official);
    let st = byKey.get(k);
    if (!st) for (const [from, to] of aliasTo) if (to === official && byKey.has(from)) { st = byKey.get(from)!; break; }
    if (!st) {
      const c = findCoords(official);
      if (!c) { report.missing.push(official); return undefined; }
      st = { id: `x-official-${slug(official)}-${++created}`, name: official, lat: c[0], lon: c[1], lines: [], osmIds: [] };
      net.stations.push(st); byKey.set(k, st); report.createdStations.push(official);
    } else if (st.name !== official && (aliasTo.get(normalizeName(st.name)) === official || normalizeName(st.name) === k)) st.name = official; // official spelling wins
    return st;
  };
  // 3. Add the official lines.
  for (const ol of overlay.lines) {
    const ids: string[] = [];
    for (const n of ol.stations) { const st = resolve(n); if (st) ids.push(st.id); }
    if (ids.length < 2) continue;
    const id = `line-${slug(ol.ref)}`;
    const line: Line = { id, ref: ol.ref, name: ol.name, color: ol.color as Line['color'], mode: ol.mode, network, operator: network, sequences: [ids] };
    net.lines.push(line); report.added.push(ol.ref);
    for (const sid of ids) { const st = net.stations.find((s) => s.id === sid)!; if (!st.lines.includes(id)) st.lines.push(id); }
  }
  net.stations = net.stations.filter((s) => s.lines.length > 0);
  // Interchanges the official map draws as one node (Suburban ↔ 15th Street/City Hall, Jefferson ↔ 11th Street).
  for (const group of overlay.interchanges ?? []) {
    const found: Station[] = [];
    for (const entry of group) {
      // "City Hall@B" = the station called City Hall on line B (not PATCO's City Hall in Camden).
      const [n, ref] = entry.split('@');
      const lineIds = ref ? net.lines.filter((l) => l.ref === ref || l.members?.includes(ref)).map((l) => l.id) : undefined;
      for (const s of net.stations) {
        if (lineIds && !s.lines.some((id) => lineIds.includes(id)) && !net.lines.some((l) => lineIds.includes(l.id) && l.sequences.some((q) => q.includes(s.id)))) continue;
        if ((normalizeName(s.name) === normalizeName(n) || s.name.split(' / ').some((part) => normalizeName(part) === normalizeName(n))) && !found.includes(s)) found.push(s);
      }
    }
    found.sort((x, y) => new Set(y.lines).size - new Set(x.lines).size); // the busiest node survives
    const [a, ...rest] = found;
    for (const b of rest) {
      if (!a || b === a) continue;
      a.lat = (a.lat + b.lat) / 2; a.lon = (a.lon + b.lon) / 2;
      if (!a.name.includes(b.name)) a.name = `${a.name} / ${b.name}`;
      a.osmIds.push(...b.osmIds);
      for (const l of net.lines) l.sequences = l.sequences.map((seq) => seq.map((id) => (id === b.id ? a.id : id)).filter((id, k, arr) => k === 0 || arr[k - 1] !== id));
      net.stations = net.stations.filter((s) => s !== b);
    }
  }
  // Then the generic walking-interchange pass for anything else, and rebuild station.lines.
  mergeNearbyInterchanges(net.stations, net.lines, 220);
  for (const s of net.stations) s.lines = [];
  for (const l of net.lines) for (const sid of new Set(l.sequences.flat())) { const st = net.stations.find((s) => s.id === sid); if (st && !st.lines.includes(l.id)) st.lines.push(l.id); }
  net.stations = net.stations.filter((s) => s.lines.length > 0);
  for (const [entry, [lat, lon]] of Object.entries(overlay.pins ?? {})) {
    const [n, ref] = entry.split('@');
    const lineIds = ref ? net.lines.filter((l) => l.ref === ref || l.members?.includes(ref)).map((l) => l.id) : undefined;
    const st = net.stations.find((s) => (!lineIds || s.lines.some((id) => lineIds.includes(id))) && (normalizeName(s.name) === normalizeName(n) || s.name.split(' / ').some((part) => normalizeName(part) === normalizeName(n))));
    if (st) { st.lat = lat; st.lon = lon; }
  }
  if (!net.modes.includes('train') && overlay.lines.some((l) => l.mode === 'train')) net.modes.push('train');
  log?.(`Official overlay ${name}: replaced ${report.replaced.length} OSM lines with ${report.added.length} official lines, ${report.createdStations.length} stations added from the official list${report.missing.length ? `, ${report.missing.length} without coordinates: ${report.missing.join(', ')}` : ''}`);
  return report;
}

/** Apply every registered overlay that matches. */
export function applyOfficialOverlays(net: MetroNetwork, coords: Record<string, [number, number]> = {}, log?: (m: string) => void): OverlayReport[] {
  return overlaysFor(net).map(({ name, overlay }) => applyOverlay(net, name, overlay, coords, log));
}

export { SEPTA_REGIONAL_RAIL } from './septa.js';
import { SEPTA_REGIONAL_RAIL } from './septa.js';
registerOverlay('SEPTA Regional Rail', SEPTA_REGIONAL_RAIL);
