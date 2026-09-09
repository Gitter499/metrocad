// node scripts/official-discover.mjs — list candidate Wikimedia Commons SVG diagrams for cities whose source has a
// `search` field (runs in CI, where the Commons API is not rate-limited). Prints title, size and dimensions.
import fs from 'node:fs';
const sources = JSON.parse(fs.readFileSync('packages/core/official-sources.json', 'utf8'));
const ua = 'MetroCAD/1.0 (https://github.com/gitter499/metrocad; metro map verification)';
for (const [city, src] of Object.entries(sources)) {
  const queries = src.search ? [].concat(src.search) : [];
  for (const q of queries) {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=25&gsrsearch=${encodeURIComponent(q + ' filemime:image/svg+xml')}&prop=imageinfo&iiprop=size|url|mime&format=json`;
    const res = await fetch(u, { headers: { 'User-Agent': ua } });
    if (!res.ok) { console.log(`== ${city} "${q}": HTTP ${res.status}`); continue; }
    const d = await res.json();
    const pages = Object.values(d.query?.pages ?? {}).filter((p) => p.imageinfo?.[0]?.mime === 'image/svg+xml');
    console.log(`== ${city} "${q}": ${pages.length} svg`);
    for (const p of pages.sort((a, b) => b.imageinfo[0].size - a.imageinfo[0].size)) console.log(`   ${p.title.replace('File:', '')} · ${(p.imageinfo[0].size / 1024).toFixed(0)} KB · ${p.imageinfo[0].width}×${p.imageinfo[0].height}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}
