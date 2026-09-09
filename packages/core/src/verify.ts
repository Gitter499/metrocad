/**
 * Verification against the web: compare a MetroNetwork with Wikidata's structured facts for the
 * same transport network (lines, station counts, termini, colours, official route diagrams).
 */
import type { MetroNetwork } from './types.js';
import { normalizeName } from './network.js';

export interface WikidataLine {
  qid: string;
  label: string;
  colour?: string;
  termini: string[];
  /** Stations connected to this line on Wikidata (excluding closed ones). */
  stationCount?: number;
  /** Commons file names of official route diagrams (P15). */
  diagrams: string[];
  lengthKm?: number;
  /** English Wikipedia article title. */
  article?: string;
  /** "stations = N" from the Wikipedia infobox (the operator-published figure). */
  wikipediaStations?: number;
}

export interface LineCheck {
  ref: string;
  name: string;
  osmStations: number;
  wikidata?: WikidataLine;
  stationDelta?: number;
  terminiOk?: boolean;
  colourOk?: boolean;
  status: 'pass' | 'warn' | 'fail' | 'unmatched';
  notes: string[];
}

export interface VerifyReport {
  network: string;
  wikidataNetwork?: { qid: string; label: string };
  checks: LineCheck[];
  passed: number;
  warned: number;
  failed: number;
  unmatched: number;
  generatedAt: string;
}

const UA = 'MetroCAD-verify/0.1 (https://github.com/gitter499/metrocad)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string, f: typeof fetch): Promise<any[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await f('https://query.wikidata.org/sparql', { method: 'POST', body: 'format=json&query=' + encodeURIComponent(query), headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA } });
    if (res.status === 429 || res.status === 503) { await sleep(3000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text).results.bindings; } catch { await sleep(2000); }
  }
  throw new Error('Wikidata SPARQL: rate limited');
}

/** Find the Wikidata item of a transport network by name (e.g. "Métro de Paris", "London Underground", "SEPTA"). */
export async function findNetwork(name: string, f: typeof fetch = fetch): Promise<{ qid: string; label: string } | undefined> {
  for (const lang of ['en', 'fr', 'de', 'es', 'it', 'ja']) {
    const res = await f(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${lang}&format=json&limit=5`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) { if (res.status === 429) await sleep(3000); continue; }
    let j: any;
    try { j = JSON.parse(await res.text()); } catch { await sleep(3000); continue; }
    const hit = (j.search ?? []).find((s: any) => /(metro|subway|underground|rapid transit|transit|rail|tram|light rail|u-bahn|métro)/i.test(`${s.label} ${s.description ?? ''}`));
    if (hit) return { qid: hit.id, label: hit.label };
  }
  return undefined;
}

/** All lines of a network (P16 transport network, or P361 part of) with facts. */
export async function fetchLines(networkQid: string, f: typeof fetch = fetch): Promise<WikidataLine[]> {
  const q = `
SELECT ?line ?lineLabel ?colour ?article (GROUP_CONCAT(DISTINCT ?termLabel; separator="|") AS ?termini) (GROUP_CONCAT(DISTINCT ?diagram; separator="|") AS ?diagrams) ?len WHERE {
  { ?line wdt:P16 wd:${networkQid} } UNION { ?line wdt:P361 wd:${networkQid} }
  ?line wdt:P31 ?cls .
  ?line wdt:P559 ?anyTerminus .
  FILTER NOT EXISTS { ?line wdt:P576 ?dissolved }
  FILTER NOT EXISTS { ?line wdt:P31 wd:Q4167410 }
  OPTIONAL { ?line wdt:P465 ?colour }
  OPTIONAL { ?line wdt:P559 ?term . ?term rdfs:label ?termLabel FILTER(LANG(?termLabel) IN ("en","fr","de","es","it","pt","nl","ru","ja","zh","ko")) }
  OPTIONAL { ?line wdt:P15 ?diagram }
  OPTIONAL { ?line wdt:P2043 ?len }
  OPTIONAL { ?article schema:about ?line ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,pt,nl,ru,ja,zh,ko". }
} GROUP BY ?line ?lineLabel ?colour ?len ?article`;
  const rows = await sparql(q, f);
  const lines: WikidataLine[] = rows.map((r) => ({
    qid: r.line.value.split('/').pop(), label: r.lineLabel?.value ?? '', colour: r.colour?.value ? '#' + r.colour.value.toLowerCase() : undefined,
    termini: (r.termini?.value ?? '').split('|').filter(Boolean), diagrams: (r.diagrams?.value ?? '').split('|').filter(Boolean).map((d: string) => decodeURIComponent(d.split('/').pop() ?? '')),
    lengthKm: r.len ? Number(r.len.value) : undefined,
    article: r.article?.value ? decodeURIComponent(r.article.value.split('/wiki/').pop() ?? '') : undefined,
  }));
  // Station counts via "connecting line" (P81) on station items, excluding closed stations.
  if (lines.length) {
    const ids = lines.map((l) => `wd:${l.qid}`).join(' ');
    // Only stations that are open today: no closure date, not dissolved, state of use not "not in use"/"planned",
    // opening date not in the future, and not a planned/proposed station class.
    const q2 = `SELECT ?line (COUNT(DISTINCT ?st) AS ?n) WHERE {
  VALUES ?line { ${ids} }
  ?st wdt:P81 ?line .
  FILTER NOT EXISTS { ?st wdt:P3999 ?closed }
  FILTER NOT EXISTS { ?st wdt:P576 ?d }
  FILTER NOT EXISTS { ?st wdt:P31 wd:Q4167410 }
  FILTER NOT EXISTS { ?st wdt:P1619 ?open . FILTER(?open > NOW()) }
  FILTER NOT EXISTS { ?st p:P81 ?stmt . ?stmt ps:P81 ?line . ?stmt pq:P582 ?end }
} GROUP BY ?line`;
    const rows2 = await sparql(q2, f);
    for (const r of rows2) { const l = lines.find((x) => x.qid === r.line.value.split('/').pop()); if (l) l.stationCount = Number(r.n.value); }
  }
  // Wikipedia infobox "stations = N" (the figure operators publish), fetched per article.
  for (const l of lines) {
    if (!l.article) continue;
    try { await sleep(400); l.wikipediaStations = await wikipediaStationCount(l.article, f); } catch { /* ignore */ }
  }
  return lines;
}

/** "stations = N" from the first infobox of an English Wikipedia article (largest value wins: extension infoboxes list a few). */
export async function wikipediaStationCount(article: string, f: typeof fetch = fetch): Promise<number | undefined> {
  const res = await f(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(article)}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return undefined;
  const j = JSON.parse(await res.text());
  const text: string = j.parse?.wikitext ?? '';
  const head = text.slice(0, 20000);
  let best: number | undefined;
  for (const m of head.matchAll(/\|\s*stations\s*=\s*(\d+)/gi)) { const n = Number(m[1]); if (best === undefined || n > best) best = n; }
  return best;
}

/** Fallback when a network item lists no matching line: search the line by its own name. */
export async function findLineByName(name: string, f: typeof fetch = fetch): Promise<WikidataLine | undefined> {
  const res = await f(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return undefined;
  let j: any; try { j = JSON.parse(await res.text()); } catch { return undefined; }
  const hit = (j.search ?? []).find((x: any) => /(line|route|metro|subway|light rail|speedline|tram)/i.test(`${x.label} ${x.description ?? ''}`));
  if (!hit) return undefined;
  const q = `SELECT ?line ?lineLabel ?colour ?article (GROUP_CONCAT(DISTINCT ?termLabel; separator="|") AS ?termini) (GROUP_CONCAT(DISTINCT ?diagram; separator="|") AS ?diagrams) WHERE {
  VALUES ?line { wd:${hit.id} }
  OPTIONAL { ?line wdt:P465 ?colour }
  OPTIONAL { ?line wdt:P559 ?term . ?term rdfs:label ?termLabel FILTER(LANG(?termLabel) = "en") }
  OPTIONAL { ?line wdt:P15 ?diagram }
  OPTIONAL { ?article schema:about ?line ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?line ?lineLabel ?colour ?article`;
  const rows = await sparql(q, f);
  if (!rows.length) return undefined;
  const r = rows[0];
  const line: WikidataLine = { qid: hit.id, label: r.lineLabel?.value ?? hit.label, colour: r.colour?.value ? '#' + r.colour.value.toLowerCase() : undefined, termini: (r.termini?.value ?? '').split('|').filter(Boolean), diagrams: (r.diagrams?.value ?? '').split('|').filter(Boolean).map((d: string) => decodeURIComponent(d.split('/').pop() ?? '')), article: r.article?.value ? decodeURIComponent(r.article.value.split('/wiki/').pop() ?? '') : undefined };
  if (line.article) { try { line.wikipediaStations = await wikipediaStationCount(line.article, f); } catch { /* ignore */ } }
  return line;
}

function refKey(s: string): string { return normalizeName(s).replace(/^(line|ligne|linea|linha|linie)/, ''); }

function matchLine(ref: string, name: string, cands: WikidataLine[]): WikidataLine | undefined {
  const r = refKey(ref);
  // exact "line N" match on label
  const byRef = cands.filter((c) => { const m = /(?:line|ligne|linea|linha|linie)\s*([\w&' ]+?)(?:$|\s+\(|\s+line$)/i.exec(c.label); return m && refKey(m[1]) === r; });
  if (byRef.length === 1) return byRef[0];
  if (byRef.length > 1) {
    // e.g. the historical "Line 14 (1937–1976)" next to the current one: prefer no parenthesis, then more stations.
    const clean = byRef.filter((c) => !/\(/.test(c.label));
    const pool = clean.length ? clean : byRef;
    return pool.sort((a, b) => (b.stationCount ?? 0) - (a.stationCount ?? 0))[0];
  }
  const nn = normalizeName(name.split(':')[0]);
  const byName = cands.find((c) => { const cl = normalizeName(c.label); return cl === nn || (name.length > 4 && (cl.includes(nn) || (cl.length > 6 && nn.includes(cl)))); });
  if (byName) return byName;
  const loose = cands.filter((c) => normalizeName(c.label).endsWith(r) || normalizeName(c.label).includes(r + 'line') || normalizeName(c.label).includes('line' + r));
  return loose.length === 1 ? loose[0] : undefined;
}

function colourDistance(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export async function verifyNetwork(net: MetroNetwork, opts: { fetch?: typeof fetch; networkQid?: string; networkName?: string } = {}): Promise<VerifyReport> {
  const f = opts.fetch ?? fetch;
  const name = opts.networkName ?? net.lines[0]?.network ?? net.displayName.split(',')[0];
  let wd = opts.networkQid ? { qid: opts.networkQid, label: opts.networkQid } : await findNetwork(name, f);
  if (!wd && net.lines[0]?.operator) wd = await findNetwork(net.lines[0].operator, f);
  const cands = wd ? await fetchLines(wd.qid, f) : [];
  const checks: LineCheck[] = [];
  for (const ln of net.lines) {
    const osmStations = new Set(ln.sequences.flat()).size;
    const termini = [...new Set(ln.sequences.flatMap((s) => [s[0], s[s.length - 1]]))].map((id) => net.stations.find((s) => s.id === id)?.name ?? id);
    let w = matchLine(ln.ref, ln.name, cands);
    if (!w) { try { await sleep(500); w = await findLineByName(ln.name, f); } catch { /* ignore */ } }
    const c: LineCheck = { ref: ln.ref, name: ln.name, osmStations, wikidata: w, status: 'unmatched', notes: [] };
    if (w) {
      c.status = 'pass';
      const official = w.wikipediaStations ?? w.stationCount;
      const source = w.wikipediaStations !== undefined ? 'Wikipedia' : 'Wikidata';
      if (official !== undefined) {
        c.stationDelta = osmStations - official;
        // Wikidata's "connecting line" count includes planned/under-construction stations, so it can only warn.
        const hard = source === 'Wikipedia';
        if (Math.abs(c.stationDelta) > 2) { c.status = hard ? 'fail' : 'warn'; c.notes.push(`station count ${osmStations} vs ${source} ${official}${hard ? '' : ' (may include planned stations)'}`); }
        else if (c.stationDelta !== 0) { c.status = 'warn'; c.notes.push(`station count ${osmStations} vs ${source} ${official}`); }
      } else c.notes.push('no station count on Wikipedia/Wikidata');
      if (w.termini.length) {
        const ok = w.termini.filter((t) => termini.some((o) => normalizeName(o).includes(normalizeName(t)) || normalizeName(t).includes(normalizeName(o))));
        c.terminiOk = ok.length >= Math.min(2, w.termini.length);
        if (!c.terminiOk) { c.status = c.status === 'fail' ? 'fail' : 'warn'; c.notes.push(`termini: OSM [${termini.join(', ')}] vs Wikidata [${w.termini.join(', ')}]`); }
      }
      const cd = colourDistance(ln.color, w.colour);
      if (cd !== undefined) { c.colourOk = cd < 90; if (!c.colourOk) { if (c.status === 'pass') c.status = 'warn'; c.notes.push(`colour ${ln.color} vs ${w.colour}`); } }
    } else c.notes.push('no matching line item on Wikidata');
    checks.push(c);
  }
  return {
    network: name, wikidataNetwork: wd, checks,
    passed: checks.filter((c) => c.status === 'pass').length, warned: checks.filter((c) => c.status === 'warn').length,
    failed: checks.filter((c) => c.status === 'fail').length, unmatched: checks.filter((c) => c.status === 'unmatched').length,
    generatedAt: new Date().toISOString(),
  };
}

export function reportMarkdown(rep: VerifyReport): string {
  const out: string[] = [];
  out.push(`### ${rep.network}${rep.wikidataNetwork ? ` — Wikidata [${rep.wikidataNetwork.label}](https://www.wikidata.org/wiki/${rep.wikidataNetwork.qid})` : ' — no Wikidata network found'}`);
  out.push('');
  out.push(`${rep.passed} pass · ${rep.warned} warn · ${rep.failed} fail · ${rep.unmatched} unmatched — ${rep.generatedAt.slice(0, 10)}`);
  out.push('');
  out.push('| Line | Stations OSM | Wikipedia | Wikidata | Termini | Colour | Official diagram | Status |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const c of rep.checks) {
    const w = c.wikidata;
    const diag = w?.diagrams.length ? `[diagram](https://commons.wikimedia.org/wiki/File:${encodeURIComponent(w.diagrams[0].replace(/ /g, '_'))})` : '';
    const icon = { pass: '✅', warn: '⚠️', fail: '❌', unmatched: '➖' }[c.status];
    out.push(`| ${c.ref} | ${c.osmStations} | ${w?.wikipediaStations ?? ''} | ${w?.stationCount ?? ''} | ${c.terminiOk === undefined ? '' : c.terminiOk ? '✓' : '✗'} | ${c.colourOk === undefined ? '' : c.colourOk ? '✓' : '✗'} | ${diag} | ${icon} ${c.notes.join('; ')} |`);
  }
  return out.join('\n');
}
