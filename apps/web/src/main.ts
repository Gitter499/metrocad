import './styles.css';
import '@google/model-viewer';
import { Preview } from './preview.js';
import type { FromWorker, ToWorker, DistributiveOmit } from './protocol.js';
import type { PartialParams, Plate, BuildStats } from '@metrocad/core';

const PRINTERS: Record<string, { name: string; bed: { x: number; y: number } }> = {
  'bambu-a1-mini': { name: 'Bambu Lab A1 mini (180 × 180)', bed: { x: 180, y: 180 } },
  'bambu-a1': { name: 'Bambu Lab A1 / P1 / X1 (256 × 256)', bed: { x: 256, y: 256 } },
  'ultimaker-s3': { name: 'Ultimaker S3 (230 × 190)', bed: { x: 230, y: 190 } },
  'prusa-mk4': { name: 'Prusa MK4 / MK3 (250 × 210)', bed: { x: 250, y: 210 } },
  'ender3': { name: 'Creality Ender 3 (220 × 220)', bed: { x: 220, y: 220 } },
  'custom': { name: 'Custom…', bed: { x: 200, y: 200 } },
};

const app = document.getElementById('app')!;
app.innerHTML = `
<header>
  <div class="logo"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#111"/><circle cx="16" cy="16" r="8" fill="none" stroke="#ffbe00" stroke-width="3"/></svg>MetroCAD</div>
  <div class="tag">any city → colour 3D-printed schematic metro map, with 3D + AR preview</div>
  <div class="spacer"></div>
  <a href="https://github.com/gitter499/metrocad" target="_blank" rel="noopener">GitHub</a>
</header>
<main>
  <aside>
    <section class="card">
      <h3>City</h3>
      <input id="city" type="text" placeholder="e.g. Paris, Tokyo, New York, Berlin" value="Paris" />
      <div class="chips" id="chips"></div>
      <label class="row"><span>Transit modes</span>
        <select id="modes"><option value="subway,light_rail,tram">Metro first (auto)</option><option value="subway">Metro only</option><option value="light_rail,subway,tram">Light rail first</option><option value="tram,light_rail,subway">Tram first</option></select></label>
      <button class="primary" id="go">Generate</button>
      <div class="progress"><div id="bar"></div></div>
      <div class="status" id="status">Data © OpenStreetMap contributors. Nothing leaves your browser.</div>
    </section>
    <section class="card">
      <h3>Size &amp; printer</h3>
      <label class="row"><span>Width (mm)</span><input id="width" type="number" value="900" min="200" max="3000" step="10"></label>
      <label class="row"><span>Height (mm)</span><input id="height" type="number" placeholder="auto" min="150" max="3000" step="10"></label>
      <label class="row"><span>Printer</span><select id="printer">${Object.entries(PRINTERS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>
      <label class="row" id="bedrow" style="display:none"><span>Bed (mm)</span><span><input id="bedx" type="number" value="200" style="width:60px"> × <input id="bedy" type="number" value="200" style="width:60px"></span></label>
      <label class="row"><span>Base</span><select id="base"><option value="tiles">Grooved tiles (snap-fit)</option><option value="none">No base (paper template)</option></select></label>
    </section>
    <section class="card">
      <h3>Style</h3>
      <label class="row"><span>Layout</span><select id="layoutMode"><option value="schematic">Schematic (octilinear)</option><option value="geographic">Geographic</option></select></label>
      <label class="row"><span>Line width (mm)</span><input id="lineWidth" type="number" value="6" min="3" max="14" step="0.5"></label>
      <label class="row"><span>Labels</span><select id="labels"><option value="all">All stations</option><option value="major">Interchanges only</option><option value="none">None</option></select></label>
      <label class="row"><span>Label size (mm)</span><input id="labelSize" type="number" value="5.5" min="3.5" max="12" step="0.5"></label>
      <label class="row"><span>Names</span><select id="lang"><option value="local">Local language</option><option value="en">English</option></select></label>
      <label class="row"><span>Base colour</span><input id="cBase" type="color" value="#1c1c1e"></label>
      <label class="row"><span>Station / text colour</span><input id="cText" type="color" value="#f5f5f0"></label>
      <label class="row"><span>Clearance (mm)</span><input id="clearance" type="number" value="0.15" min="0" max="0.5" step="0.05"><span class="hint">Fit between mating parts. 0.15 is snug for a well-tuned printer; use 0.25 if parts come out tight.</span></label>
    </section>
    <section class="card" id="results" style="display:none">
      <h3>Result</h3>
      <div class="stats" id="stats"></div>
      <div id="warnings"></div>
      <div class="btnrow">
        <button class="secondary" id="dl">⬇ Download print files (ZIP)</button>
        <button class="secondary" id="dlSvg">SVG</button>
      </div>
      <label class="row"><span>Include one STL per part</span><input id="individual" type="checkbox"></label>
    </section>
    <section class="card" id="slicecard" style="display:none">
      <h3>Slice &amp; print farm</h3>
      <label class="row"><span>Slice for</span><select id="slicePrinter"><option value="bambu-a1-mini">Bambu A1 mini</option><option value="ultimaker-s3">Ultimaker S3</option><option value="generic-marlin">Generic Marlin</option></select></label>
      <div class="btnrow"><button class="secondary" id="slice">Slice all plates → G-code</button></div>
      <div id="sliceout"></div>
    </section>
  </aside>
  <div class="view">
    <div class="tabs">
      <div class="tab active" data-tab="3d">3D wall preview</div>
      <div class="tab" data-tab="map">Map</div>
      <div class="tab" data-tab="plates">Print plates</div>
      <div class="tab" data-tab="ar">AR</div>
      <div class="spacer"></div>
      <div class="dim" id="dim"></div>
    </div>
    <div class="stage">
      <div class="pane active" id="pane-3d"><canvas id="gl"></canvas><div class="empty" id="empty3d">Pick a city and press Generate.</div></div>
      <div class="pane svgpane" id="pane-map"><div class="empty">Generate a map first.</div></div>
      <div class="pane" id="pane-plates"><div class="empty">Generate a map first.</div></div>
      <div class="pane" id="pane-ar"><div class="empty">Generate a map first, then open this tab. On iPhone/iPad this opens AR Quick Look; on Android, Scene Viewer / WebXR. No app needed.</div></div>
    </div>
  </div>
</main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>();
worker.onmessage = (ev: MessageEvent<FromWorker>) => {
  const m = ev.data;
  if (m.type === 'status') { setStatus(`${m.stage}: ${m.detail ?? ''}`, stageFraction(m.stage, m.fraction)); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
};
function call(msg: DistributiveOmit<ToWorker, 'id'>): Promise<FromWorker> {
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id } as ToWorker); });
}
const STAGES: Record<string, [number, number]> = { init: [0, 0.05], fetch: [0.05, 0.2], layout: [0.2, 0.3], geometry: [0.3, 0.85], pack: [0.85, 1], export: [0, 1], ar: [0, 1], slice: [0, 1] };
function stageFraction(stage: string, f: number) { const [a, b] = STAGES[stage] ?? [0, 1]; return a + (b - a) * f; }
function setStatus(text: string, fraction?: number) {
  $('status').textContent = text;
  if (fraction !== undefined) ($('bar') as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
}

// Featured chips
const featured = [['Paris', 'paris'], ['London', 'london'], ['New York', ''], ['Tokyo', ''], ['Berlin', ''], ['Madrid', ''], ['Seoul', ''], ['Mexico City', ''], ['Moscow', ''], ['Washington', '']];
$('chips').innerHTML = featured.map(([n, f]) => `<span class="chip" data-city="${n}" data-fixture="${f}">${n}${f ? ' ⚡' : ''}</span>`).join('');
$('chips').querySelectorAll<HTMLElement>('.chip').forEach((c) => c.addEventListener('click', () => { ($('city') as HTMLInputElement).value = c.dataset.city!; generate(c.dataset.fixture || undefined); }));
$('printer').addEventListener('change', () => { $('bedrow').style.display = ($('printer') as HTMLSelectElement).value === 'custom' ? '' : 'none'; });

const preview = new Preview($('gl') as HTMLCanvasElement);
let built: Extract<FromWorker, { type: 'built' }> | undefined;
let arBlobs: { glb: string; usdz: string } | undefined;

function params(): PartialParams {
  const printer = ($('printer') as HTMLSelectElement).value;
  const bed = printer === 'custom' ? { x: Number(($('bedx') as HTMLInputElement).value), y: Number(($('bedy') as HTMLInputElement).value) } : PRINTERS[printer].bed;
  const h = Number(($('height') as HTMLInputElement).value);
  const text = ($('cText') as HTMLInputElement).value, base = ($('cBase') as HTMLInputElement).value;
  return {
    widthMm: Number(($('width') as HTMLInputElement).value) || 900,
    heightMm: h > 0 ? h : undefined,
    bed,
    base: ($('base') as HTMLSelectElement).value as any,
    lineWidth: Number(($('lineWidth') as HTMLInputElement).value) || 6,
    labels: ($('labels') as HTMLSelectElement).value as any,
    labelFontSize: Number(($('labelSize') as HTMLInputElement).value) || 5.5,
    labelLanguage: ($('lang') as HTMLSelectElement).value as any,
    clearance: Number(($('clearance') as HTMLInputElement).value),
    colors: { base, labelPlate: base, dot: text, plug: text, labelText: text },
    layout: { mode: ($('layoutMode') as HTMLSelectElement).value as any },
  };
}

async function generate(fixture?: string) {
  const city = ($('city') as HTMLInputElement).value.trim();
  if (!city) return;
  const go = $('go') as HTMLButtonElement;
  go.disabled = true;
  arBlobs = undefined;
  $('results').style.display = 'none';
  $('slicecard').style.display = 'none';
  const modes = ($('modes') as HTMLSelectElement).value.split(',') as any;
  const t0 = performance.now();
  try {
    const usedFixture = fixture && city.toLowerCase() === fixture ? fixture : undefined;
    const m = (await call({ type: 'build', city, fixture: usedFixture, modes, params: params() })) as Extract<FromWorker, { type: 'built' }>;
    built = m;
    showResult(m, performance.now() - t0);
  } catch (e: any) {
    setStatus(`Error: ${e.message}`, 0);
    console.error(e);
  } finally { go.disabled = false; }
}
$('go').addEventListener('click', () => generate(undefined));
$('city').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(undefined); });

function fmtTime(sec: number) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }

function showResult(m: Extract<FromWorker, { type: 'built' }>, ms: number) {
  const s = m.stats;
  setStatus(`${m.place} — built in ${(ms / 1000).toFixed(1)} s`, 1);
  $('empty3d').style.display = 'none';
  preview.setParts(m.parts, m.layout.width, m.layout.height);
  $('dim').textContent = `${m.layout.width.toFixed(0)} × ${m.layout.height.toFixed(0)} mm`;
  $('results').style.display = '';
  $('slicecard').style.display = '';
  const rows: [string, string][] = [
    ['Size', `${m.layout.width.toFixed(0)} × ${m.layout.height.toFixed(0)} mm`],
    ['Lines / stations', `${s.lines} / ${s.stations}`],
    ['Labels', `${s.labels}${s.unlabeled ? ` (${s.unlabeled} skipped)` : ''}`],
    ['Parts', `${s.parts}`],
    ['Plates', `${s.plates} (${m.tiles.cols} × ${m.tiles.rows} tiles)`],
    ['Filament', `≈ ${Math.round(s.estimatedGrams)} g`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
  $('warnings').innerHTML = m.warnings.map((w) => `<div class="warn">⚠ ${w}</div>`).join('');
  // Map tab
  $('pane-map').innerHTML = m.svg;
  // Plates tab
  $('pane-plates').innerHTML = `<div class="plates">${m.plates.map((p, i) => plateCard(p, i, m)).join('')}</div>`;
  // AR tab reset
  $('pane-ar').innerHTML = `<div class="empty"><div><p>Preparing AR model…</p></div></div>`;
  if (document.querySelector('.tab.active')?.getAttribute('data-tab') === 'ar') prepareAr();
}

function plateCard(p: Plate, i: number, m: Extract<FromWorker, { type: 'built' }>): string {
  const bed = p.bed;
  const sx = 100 / Math.max(bed.x, bed.y);
  const shapes = p.items.map((it) => {
    const part = m.parts.find((q) => q.id === it.partId) ?? m.parts.find((q) => q.id.startsWith(it.partId));
    if (!part) return '';
    const parts = m.parts.filter((q) => q.id === it.partId || q.id.startsWith(it.partId + '-'));
    const c = Math.cos((it.rotation * Math.PI) / 180), s = Math.sin((it.rotation * Math.PI) / 180);
    return parts.map((q) => {
      const P = q.mesh.positions, I = q.mesh.indices;
      let d = '';
      // draw only triangles whose normal points up (top caps) to keep the SVG small
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, cc = I[t + 2] * 3;
        const nz = (P[b] - P[a]) * (P[cc + 1] - P[a + 1]) - (P[b + 1] - P[a + 1]) * (P[cc] - P[a]);
        if (nz <= 0) continue;
        const pt = (i0: number) => { const x = P[i0] * c - P[i0 + 1] * s + it.dx, y = P[i0] * s + P[i0 + 1] * c + it.dy; return `${(x * sx).toFixed(1)},${((bed.y - y) * sx).toFixed(1)}`; };
        d += `M${pt(a)}L${pt(b)}L${pt(cc)}Z`;
      }
      return `<path d="${d}" fill="${q.color}" stroke="${q.color}" stroke-width="0.3"/>`;
    }).join('');
  }).join('');
  const n = p.items.length;
  return `<div class="plate"><svg viewBox="0 0 ${bed.x * sx} ${bed.y * sx}"><rect width="${bed.x * sx}" height="${bed.y * sx}" fill="#22252d"/>${shapes}</svg><div class="t"><span><span class="sw" style="background:${p.color}"></span><b>${i + 1}. ${p.name}</b></span><span>${n} part${n === 1 ? '' : 's'}${p.colorChange ? ' · colour change' : ''}</span></div></div>`;
}

// Tabs
document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.pane').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  $(`pane-${t.dataset.tab}`).classList.add('active');
  if (t.dataset.tab === '3d') preview.resize();
  if (t.dataset.tab === 'ar' && built) prepareAr();
}));

async function prepareAr() {
  if (!built) return;
  if (!arBlobs) {
    try {
      const m = (await call({ type: 'ar' })) as Extract<FromWorker, { type: 'ar' }>;
      arBlobs = {
        glb: URL.createObjectURL(new Blob([m.glb as BlobPart], { type: 'model/gltf-binary' })),
        usdz: URL.createObjectURL(new Blob([m.usdz as BlobPart], { type: 'model/vnd.usdz+zip' })),
      };
      setStatus(`AR model ready (${(m.glb.length / 1e6).toFixed(1)} MB GLB, ${(m.usdz.length / 1e6).toFixed(1)} MB USDZ)`, 1);
    } catch (e: any) { $('pane-ar').innerHTML = `<div class="empty">AR export failed: ${e.message}</div>`; return; }
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('pane-ar').innerHTML = `
    <model-viewer src="${arBlobs.glb}" ios-src="${arBlobs.usdz}" ar ar-modes="webxr scene-viewer quick-look" ar-placement="wall" ar-scale="fixed"
      camera-controls touch-action="pan-y" shadow-intensity="1" exposure="1" environment-image="neutral" alt="${built.place} metro map">
      <button slot="ar-button" class="arbtn">👁 View on your wall (AR)</button>
    </model-viewer>
    <div style="position:absolute;top:10px;left:10px;right:10px;font-size:12px;color:#333;background:#fff9;padding:8px;border-radius:8px;pointer-events:none">
      ${isIOS ? 'Tap the AR button to open Quick Look; the model anchors to a vertical wall at true size.' : 'Open this page on a phone for AR. Android: Scene Viewer / WebXR. iPhone/iPad: AR Quick Look. No app install needed.'}
      &nbsp;Or download the files: <a style="pointer-events:auto" href="${arBlobs.usdz}" download="metromap.usdz">USDZ</a> · <a style="pointer-events:auto" href="${arBlobs.glb}" download="metromap.glb">GLB</a>
    </div>`;
}

// Downloads
function saveBlob(data: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([data as BlobPart], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
$('dl').addEventListener('click', async () => {
  if (!built) return;
  const b = $('dl') as HTMLButtonElement; b.disabled = true;
  try {
    const m = (await call({ type: 'bundle', individualStls: ($('individual') as HTMLInputElement).checked })) as Extract<FromWorker, { type: 'bundle' }>;
    saveBlob(m.zip, m.filename, 'application/zip');
    setStatus(`Bundle ready: ${(m.zip.length / 1e6).toFixed(1)} MB`, 1);
  } catch (e: any) { setStatus(`Export failed: ${e.message}`); } finally { b.disabled = false; }
});
$('dlSvg').addEventListener('click', () => { if (built) saveBlob(built.svg, 'metromap.svg', 'image/svg+xml'); });

// Slicing + farm
$('slice').addEventListener('click', async () => {
  if (!built) return;
  const b = $('slice') as HTMLButtonElement; b.disabled = true;
  const printerId = ($('slicePrinter') as HTMLSelectElement).value;
  try {
    const m = (await call({ type: 'slice', printerId })) as Extract<FromWorker, { type: 'sliced' }>;
    renderSliceResult(m);
  } catch (e: any) { $('sliceout').innerHTML = `<div class="warn">${e.message}</div>`; } finally { b.disabled = false; }
});

function renderSliceResult(m: Extract<FromWorker, { type: 'sliced' }>) {
  const rows = m.plates.map((p, i) => `<tr><td><span class="sw" style="background:${p.color}"></span>${i + 1}. ${p.name}</td><td class="n">${fmtTime(p.timeSec)}</td><td class="n">${p.filamentGrams.toFixed(0)} g</td></tr>`).join('');
  $('sliceout').innerHTML = `
    <div class="stats"><div class="k">Total print time (1 printer)</div><div class="v">${fmtTime(m.totalSec)}</div><div class="k">Filament (sliced)</div><div class="v">${m.totalGrams.toFixed(0)} g</div></div>
    <div class="btnrow"><button class="secondary" id="dlg">⬇ Download all G-code (ZIP)</button></div>
    <h3 style="margin-top:6px">Print farm</h3>
    <div class="farm">
      <span>Bambu A1 minis</span><input id="nA1" type="number" value="3" min="0" max="20" style="width:60px">
      <span>Ultimaker S3s</span><input id="nS3" type="number" value="1" min="0" max="20" style="width:60px">
      <span>Changeover per plate (min)</span><input id="chg" type="number" value="8" min="0" max="60" style="width:60px">
    </div>
    <div id="farmout"></div>
    <details><summary>Per plate</summary><table class="tbl"><tr><th>Plate</th><th>Time</th><th>Filament</th></tr>${rows}</table></details>`;
  $('dlg').addEventListener('click', () => saveBlob(m.zip, `metrocad-gcode-${m.printerId}.zip`, 'application/zip'));
  const update = () => {
    const nA1 = Number(($('nA1') as HTMLInputElement).value), nS3 = Number(($('nS3') as HTMLInputElement).value), chg = Number(($('chg') as HTMLInputElement).value) * 60;
    const n = nA1 + nS3;
    if (!n) { $('farmout').innerHTML = '<div class="warn">Add at least one printer.</div>'; return; }
    // LPT greedy schedule (S3 is ~25 % slower on the same G-code speeds).
    const jobs = [...m.plates].sort((a, b) => b.timeSec - a.timeSec);
    const printers = [...Array(nA1).fill(0).map((_, i) => ({ name: `A1 mini #${i + 1}`, f: 1, free: 0, jobs: 0 })), ...Array(nS3).fill(0).map((_, i) => ({ name: `S3 #${i + 1}`, f: 1.25, free: 0, jobs: 0 }))];
    for (const j of jobs) {
      let best = printers[0];
      for (const p of printers) if (p.free + j.timeSec * p.f < best.free + j.timeSec * best.f) best = p;
      best.free += j.timeSec * best.f + chg; best.jobs++;
    }
    const makespan = Math.max(...printers.map((p) => p.free));
    $('farmout').innerHTML = `<div class="big">${fmtTime(makespan)}</div><div class="status">wall-clock with ${n} printer${n > 1 ? 's' : ''} running in parallel · ${m.plates.length} plates · ${printers.map((p) => `${p.name}: ${p.jobs}`).join(', ')}</div>`;
  };
  ['nA1', 'nS3', 'chg'].forEach((id) => $(id).addEventListener('input', update));
  update();
}

// Kick off with Paris from the bundled fixture for an instant first impression.
if (!location.hash.includes('nostart')) generate('paris');
