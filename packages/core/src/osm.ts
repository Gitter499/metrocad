/**
 * OpenStreetMap data access: Nominatim geocoding + Overpass route relations.
 * Works in Node (>=18) and browsers (both endpoints send CORS headers).
 */
import type { Hex, Line, MetroNetwork, Station, TransitMode } from './types.js';
import { buildNetwork } from './network.js';

export const USER_AGENT = 'MetroCAD/0.1 (https://github.com/gitter499/metrocad)';

export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** Tried in order; the first that answers with JSON wins. */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  bbox: { south: number; west: number; north: number; east: number };
  osmType?: string;
  osmId?: number;
}

export interface FetchOptions {
  /** Custom fetch (e.g. for tests). */
  fetch?: typeof fetch;
  overpassEndpoints?: string[];
  /** Transit modes to include, in priority order. Falls back to the next when a mode has no routes. */
  modes?: TransitMode[];
  /** Include all listed modes rather than only the first with results. */
  combineModes?: boolean;
  /** Max half-size of the query box in degrees around the city centre. */
  maxHalfSpanDeg?: number;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

const DEFAULT_MODES: TransitMode[] = ['subway', 'light_rail', 'tram'];

/* ------------------------------ raw OSM types ------------------------------ */

export interface OsmNode { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
export interface OsmMember { type: 'node' | 'way' | 'relation'; ref: number; role: string }
export interface OsmRelation { type: 'relation'; id: number; members: OsmMember[]; tags?: Record<string, string> }
export interface OsmWay { type: 'way'; id: number; nodes?: number[]; tags?: Record<string, string> }
export type OsmElement = OsmNode | OsmRelation | OsmWay;
export interface OverpassResponse { elements: OsmElement[] }

/* ------------------------------ geocoding ------------------------------ */

export async function geocodeCity(query: string, opts: FetchOptions = {}): Promise<GeocodeResult> {
  const f = opts.fetch ?? fetch;
  const url = `${NOMINATIM_ENDPOINT}?q=${encodeURIComponent(query)}&format=jsonv2&limit=5&addressdetails=0`;
  const res = await f(url, { headers: { 'Accept': 'application/json', ...(isNode() ? { 'User-Agent': USER_AGENT } : {}) }, signal: opts.signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status}) for "${query}"`);
  const rows = (await res.json()) as any[];
  if (!rows.length) throw new Error(`No place found for "${query}"`);
  // Prefer administrative/city-like results over e.g. a metro station named after the city.
  const score = (r: any) => {
    let s = Number(r.importance ?? 0);
    if (r.category === 'boundary' || r.category === 'place') s += 1;
    if (['city', 'town', 'municipality', 'administrative', 'state', 'county'].includes(r.type ?? r.addresstype)) s += 0.5;
    return s;
  };
  rows.sort((a, b) => score(b) - score(a));
  const r = rows[0];
  const [s, n, w, e] = r.boundingbox.map(Number);
  return {
    displayName: r.display_name,
    lat: Number(r.lat), lon: Number(r.lon),
    bbox: { south: s, north: n, west: w, east: e },
    osmType: r.osm_type, osmId: r.osm_id,
  };
}

/* ------------------------------ overpass ------------------------------ */

export function buildOverpassQuery(bbox: { south: number; west: number; north: number; east: number }, modes: TransitMode[], timeout = 120): string {
  const b = `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`;
  const modeRe = `^(${modes.join('|')})$`;
  // Routes in the box, their member nodes (stops/platforms), and their route_master parents.
  return `[out:json][timeout:${timeout}];` +
    `rel["type"="route"]["route"~"${modeRe}"](${b})->.r;` +
    `.r out body;` +
    `node(r.r)->.n;.n out body;` +
    `rel(br.r)["type"="route_master"];out body;`;
}

export async function overpass(query: string, opts: FetchOptions = {}): Promise<{ data: OverpassResponse; endpoint: string }> {
  const f = opts.fetch ?? fetch;
  const endpoints = opts.overpassEndpoints ?? OVERPASS_ENDPOINTS;
  const errors: string[] = [];
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        opts.onStatus?.(`Querying ${new URL(endpoint).host}${attempt ? ' (retry)' : ''}…`);
        const res = await f(endpoint, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(isNode() ? { 'User-Agent': USER_AGENT } : {}) },
          signal: opts.signal,
        });
        const text = await res.text();
        if (!res.ok || !text.trim().startsWith('{')) {
          const m = /Error<\/strong>: ([^<]*)/.exec(text);
          throw new Error(`${res.status} ${m ? m[1].trim() : text.slice(0, 120)}`);
        }
        const data = JSON.parse(text) as OverpassResponse & { remark?: string };
        if (data.remark && /timed out|out of memory/i.test(data.remark) && !data.elements?.length) throw new Error(data.remark);
        return { data, endpoint };
      } catch (e: any) {
        if (opts.signal?.aborted) throw e;
        errors.push(`${endpoint}: ${e?.message ?? e}`);
        if (/busy|timeout|429|504|503/i.test(String(e?.message))) await sleep(1500 * (attempt + 1));
        else break;
      }
    }
  }
  throw new Error(`All Overpass endpoints failed:\n${errors.join('\n')}`);
}

/* ------------------------------ parsing ------------------------------ */

export interface RawRoute {
  id: number;
  tags: Record<string, string>;
  /** Ordered stop node ids. */
  stops: number[];
  masterId?: number;
}

const STOP_ROLE = /^(stop|stop_entry_only|stop_exit_only)$/;
const PLATFORM_ROLE = /^(platform|platform_entry_only|platform_exit_only)$/;

/** Parse a raw Overpass response into a MetroNetwork (stations merged, lines built). */
export function parseOverpass(data: OverpassResponse, geo: GeocodeResult, query: string, modes: TransitMode[], endpoint?: string): MetroNetwork {
  const nodes = new Map<number, OsmNode>();
  const routes: OsmRelation[] = [];
  const masters: OsmRelation[] = [];
  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'relation') {
      const t = el.tags?.type;
      if (t === 'route') routes.push(el);
      else if (t === 'route_master') masters.push(el);
    }
  }
  const masterOf = new Map<number, OsmRelation>();
  for (const m of masters) for (const mem of m.members) if (mem.type === 'relation') masterOf.set(mem.ref, m);

  const rawRoutes: RawRoute[] = [];
  for (const r of routes) {
    const tags = r.tags ?? {};
    if (!modes.includes(tags.route as TransitMode)) continue;
    // Ordered stops: prefer explicit stop roles; fall back to platforms that are nodes; then any node with a name.
    let stops = r.members.filter((m) => m.type === 'node' && STOP_ROLE.test(m.role) && nodes.has(m.ref)).map((m) => m.ref);
    if (stops.length < 2) stops = r.members.filter((m) => m.type === 'node' && PLATFORM_ROLE.test(m.role) && nodes.has(m.ref)).map((m) => m.ref);
    if (stops.length < 2) stops = r.members.filter((m) => m.type === 'node' && nodes.has(m.ref) && nodes.get(m.ref)!.tags?.name).map((m) => m.ref);
    if (stops.length < 2) continue;
    rawRoutes.push({ id: r.id, tags, stops, masterId: masterOf.get(r.id)?.id });
  }

  const network = buildNetwork({ routes: rawRoutes, masters, nodes });
  return {
    query,
    displayName: geo.displayName,
    center: { lat: geo.lat, lon: geo.lon },
    bbox: geo.bbox,
    lines: network.lines,
    stations: network.stations,
    modes,
    source: { provider: 'osm', overpassEndpoint: endpoint, fetchedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors (ODbL)' },
  };
}

/* ------------------------------ high level ------------------------------ */

export async function fetchCityNetwork(city: string, opts: FetchOptions = {}): Promise<MetroNetwork> {
  opts.onStatus?.(`Geocoding "${city}"…`);
  const geo = await geocodeCity(city, opts);
  const half = opts.maxHalfSpanDeg ?? 0.6;
  // Clamp the query box: some admin areas (Tokyo, NYC state results) are enormous.
  const bbox = {
    south: Math.max(geo.bbox.south, geo.lat - half), north: Math.min(geo.bbox.north, geo.lat + half),
    west: Math.max(geo.bbox.west, geo.lon - half), east: Math.min(geo.bbox.east, geo.lon + half),
  };
  // Never smaller than ~25 km across: small city polygons still have suburban lines.
  const minHalf = 0.12;
  if (bbox.north - bbox.south < 2 * minHalf) { bbox.south = geo.lat - minHalf; bbox.north = geo.lat + minHalf; }
  if (bbox.east - bbox.west < 2 * minHalf / Math.max(0.2, Math.cos(geo.lat * Math.PI / 180))) {
    const h = minHalf / Math.max(0.2, Math.cos(geo.lat * Math.PI / 180));
    bbox.west = geo.lon - h; bbox.east = geo.lon + h;
  }
  const wanted = opts.modes ?? DEFAULT_MODES;
  const { data, endpoint } = await overpass(buildOverpassQuery(bbox, wanted), opts);
  opts.onStatus?.('Building network…');
  let modes: TransitMode[];
  if (opts.combineModes) modes = wanted;
  else {
    const available = new Set<string>();
    for (const el of data.elements) if (el.type === 'relation' && el.tags?.type === 'route' && el.tags.route) available.add(el.tags.route);
    modes = [wanted.find((m) => available.has(m)) ?? wanted[0]];
  }
  const net = parseOverpass(data, { ...geo, bbox }, city, modes, endpoint);
  if (!net.lines.length) throw new Error(`No ${wanted.join('/')} routes found around "${geo.displayName}". Try a different city name or include more transit modes.`);
  return net;
}

export function isNode(): boolean {
  return typeof process !== 'undefined' && !!(process as any).versions?.node && typeof (globalThis as any).window === 'undefined';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type { Line, Station, Hex };
