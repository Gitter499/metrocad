import './styles.css';
import '@google/model-viewer';
import { Preview } from './preview.js';
import { PlatesView } from './plates3d.js';
import type { FromWorker, ToWorker, DistributiveOmit } from './protocol.js';
import type { PartialParams } from '@metrocad/core';

const PRINTERS: Record<string, { name: string; short: string; bed: { x: number; y: number }; slicer: string }> = {
  'bambu-a1-mini': { name: 'Bambu Lab A1 mini · 180 × 180', short: 'A1 mini', bed: { x: 180, y: 180 }, slicer: 'bambu-a1-mini' },
  'bambu-p1s': { name: 'Bambu Lab P1S / X1 · 256 × 256', short: 'P1S', bed: { x: 256, y: 256 }, slicer: 'bambu-p1s' },
  'ultimaker-s3': { name: 'Ultimaker S3 · 230 × 190', short: 'S3', bed: { x: 230, y: 190 }, slicer: 'ultimaker-s3' },
  'prusa-mk4': { name: 'Prusa MK4 · 250 × 210', short: 'MK4', bed: { x: 250, y: 210 }, slicer: 'generic-marlin' },
  'custom': { name: 'Custom bed…', short: 'Custom', bed: { x: 200, y: 200 }, slicer: 'generic-marlin' },
};

const app = document.getElementById('app')!;
app.innerHTML = `
<canvas id="gl" class="scene"></canvas>
<div class="pane svgpane" id="pane-map"></div>
<div class="pane" id="pane-beds"><canvas id="glbeds" class="scene"></canvas><div class="bedlist glass" id="bedlist"></div><div class="caption glass" id="bedcap">Click a bed to zoom in</div></div>
<div class="pane" id="pane-ar"></div>
<div class="brand glass"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#1d1d1f"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" stroke-width="3.5"/></svg><span class="t">MetroCAD</span></div>
<div class="segmented glass" id="tabs">
  <button data-tab="3d" class="active">Wall</button><button data-tab="map">Map</button><button data-tab="beds">Print beds</button><button data-tab="ar">AR</button>
</div>
<div class="topright"><a class="pill" href="https://github.com/gitter499/metrocad" target="_blank" rel="noopener">GitHub</a></div>
<div class="panel glass">
  <input id="city" type="text" placeholder="City" value="Paris" autocomplete="off" />
  <div class="chips" id="chips"></div>
  <button class="go" id="go">Generate</button>
  <div class="progress"><div id="bar"></div></div>
  <div class="statusline" id="status"></div>
  <div class="group">
    <h4>Size &amp; printer</h4>
    <label class="field"><span>Width</span><span><input id="width" type="number" value="900" min="200" max="3000" step="10" style="width:80px"> mm</span></label>
    <label class="field"><span>Height</span><span><input id="height" type="number" placeholder="auto" min="150" max="3000" step="10" style="width:80px"> mm</span></label>
    <label class="field"><span>Printer</span><select id="printer" style="width:190px">${Object.entries(PRINTERS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></label>
    <label class="field" id="bedrow" style="display:none"><span>Bed</span><span><input id="bedx" type="number" value="200" style="width:64px"> × <input id="bedy" type="number" value="200" style="width:64px"></span></label>
    <label class="field"><span>Base</span><select id="base" style="width:190px"><option value="tiles">Grooved snap-fit tiles</option><option value="none">No base, paper template</option></select></label>
  </div>
  <details>
    <summary>Style</summary>
    <div class="group" style="margin-top:8px">
      <label class="field"><span>Layout</span><select id="layoutMode"><option value="schematic">Schematic</option><option value="geographic">Geographic</option></select></label>
      <label class="field"><span>Line width</span><span><input id="lineWidth" type="number" value="6" min="3" max="14" step="0.5" style="width:70px"> mm</span></label>
      <label class="field"><span>Labels</span><select id="labels"><option value="all">All stations</option><option value="major">Interchanges</option><option value="none">None</option></select></label>
      <label class="field"><span>Label size</span><span><input id="labelSize" type="number" value="5.5" min="3.5" max="12" step="0.5" style="width:70px"> mm</span></label>
      <label class="field"><span>Names</span><select id="lang"><option value="local">Local</option><option value="en">English</option></select></label>
      <label class="field"><span>Transit</span><select id="modes"><option value="subway,light_rail,tram">Metro</option><option value="subway,light_rail">Metro + light rail</option><option value="tram,light_rail,subway">Tram</option></select></label>
      <label class="field"><span>Base colour</span><input id="cBase" type="color" value="#1c1c1e"></label>
      <label class="field"><span>Accent colour</span><input id="cText" type="color" value="#f5f5f0"></label>
      <label class="field"><span>Clearance</span><span><input id="clearance" type="number" value="0.15" min="0" max="0.5" step="0.05" style="width:70px"> mm</span></label>
    </div>
  </details>
  <div class="group" id="results" style="display:none">
    <h4>Result</h4>
    <div class="stats" id="stats"></div>
    <div id="warnings"></div>
    <button class="btn full" id="dl">⬇ Print files (STL · 3MF · AR · guide)</button>
    <label class="field"><span>One STL per part</span><input id="individual" type="checkbox"></label>
  </div>
  <div class="group" id="slicecard" style="display:none">
    <h4>Slice &amp; print farm</h4>
    <label class="field"><span>Slice for</span><select id="slicePrinter" style="width:150px"><option value="bambu-a1-mini">Bambu A1 mini</option><option value="bambu-p1s">Bambu P1S</option><option value="ultimaker-s3">Ultimaker S3</option><option value="generic-marlin">Generic Marlin</option></select></label>
    <button class="btn full" id="slice">Slice every plate → G-code</button>
    <div id="sliceout"></div>
  </div>
</div>
<div class="dock glass" id="dock"><button data-view="front">Front</button><button data-view="angle">Angle</button><button data-view="closeup">Close-up</button></div>
<div class="empty" id="empty3d"></div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => ($(id) as HTMLInputElement).value;
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>();
worker.onmessage = (ev: MessageEvent<FromWorker>) => {
  const m = ev.data;
  if (m.type === 'status') { setStatus(m.detail ?? m.stage, stageFraction(m.stage, m.fraction)); return; }
  const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
  if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
};
function call(msg: DistributiveOmit<ToWorker, 'id'>): Promise<FromWorker> {
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id } as ToWorker); });
}
const STAGES: Record<string, [number, number]> = { init: [0, 0.05], fetch: [0.05, 0.2], layout: [0.2, 0.3], geometry: [0.3, 0.85], pack: [0.85, 1] };
const stageFraction = (stage: string, f: number) => { const [a, b] = STAGES[stage] ?? [0, 1]; return a + (b - a) * f; };
function setStatus(text: string, fraction?: number) { $('status').textContent = text; if (fraction !== undefined) $('bar').style.width = `${Math.round(fraction * 100)}%`; }

const featured: [string, string][] = [['Paris', 'paris'], ['London', 'london'], ['New York', ''], ['Tokyo', ''], ['Berlin', ''], ['Madrid', ''], ['Seoul', ''], ['Mexico City', ''], ['Moscow', ''], ['Washington', '']];
$('chips').innerHTML = featured.map(([n, f]) => `<span class="chip" data-city="${n}" data-fixture="${f}">${n}</span>`).join('');
$('chips').querySelectorAll<HTMLElement>('.chip').forEach((c) => c.addEventListener('click', () => { ($('city') as HTMLInputElement).value = c.dataset.city!; generate(c.dataset.fixture || undefined); }));
$('printer').addEventListener('change', () => { $('bedrow').style.display = val('printer') === 'custom' ? '' : 'none'; });

const preview = new Preview($('gl') as HTMLCanvasElement);
const beds = new PlatesView($('glbeds') as HTMLCanvasElement);
let built: Extract<FromWorker, { type: 'built' }> | undefined;
let arBlobs: { glb: string; usdz: string } | undefined;

function params(): PartialParams {
  const printer = val('printer');
  const bed = printer === 'custom' ? { x: Number(val('bedx')), y: Number(val('bedy')) } : PRINTERS[printer].bed;
  const h = Number(val('height'));
  const text = val('cText'), base = val('cBase');
  return {
    widthMm: Number(val('width')) || 900, heightMm: h > 0 ? h : undefined, bed,
    base: val('base') as any, lineWidth: Number(val('lineWidth')) || 6,
    labels: val('labels') as any, labelFontSize: Number(val('labelSize')) || 5.5, labelLanguage: val('lang') as any,
    clearance: Number(val('clearance')),
    colors: { base, labelPlate: base, dot: text, plug: text, labelText: text },
    layout: { mode: val('layoutMode') as any },
  };
}

async function generate(fixture?: string) {
  const city = val('city').trim(); if (!city) return;
  const go = $('go') as HTMLButtonElement; go.disabled = true;
  arBlobs = undefined; $('results').style.display = 'none'; $('slicecard').style.display = 'none';
  const modes = val('modes').split(',') as any;
  const t0 = performance.now();
  try {
    const usedFixture = fixture && city.toLowerCase() === fixture ? fixture : undefined;
    const m = (await call({ type: 'build', city, fixture: usedFixture, modes, params: params() })) as Extract<FromWorker, { type: 'built' }>;
    built = m; showResult(m, performance.now() - t0);
  } catch (e: any) { setStatus(`Error: ${e.message}`, 0); console.error(e); } finally { go.disabled = false; }
}
$('go').addEventListener('click', () => generate(undefined));
$('city').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(undefined); });

const fmtTime = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };

function showResult(m: Extract<FromWorker, { type: 'built' }>, ms: number) {
  const s = m.stats;
  setStatus(`${m.place.split(',')[0]} · ${(ms / 1000).toFixed(1)} s`, 1);
  preview.setParts(m.parts, m.layout.width, m.layout.height);
  const printerName = PRINTERS[val('printer')]?.short ?? 'bed';
  beds.setPlates(m.plates, m.parts, printerName);
  $('bedlist').innerHTML = m.plates.map((p, i) => `<button data-i="${i}"><span><span class="sw" style="background:${p.color}"></span>${i + 1}. ${p.name}</span><span>${p.items.length}</span></button>`).join('');
  $('bedlist').querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => { beds.focus(Number(b.dataset.i)); markBed(Number(b.dataset.i)); }));
  beds.onSelect = markBed;
  $('bedcap').textContent = `${m.plates.length} plates · ${m.plates[0].bed.x} × ${m.plates[0].bed.y} mm beds · click a bed to zoom, drag to orbit`;
  $('results').style.display = ''; $('slicecard').style.display = '';
  const rows: [string, string][] = [
    ['Size', `${m.layout.width.toFixed(0)} × ${m.layout.height.toFixed(0)} mm`],
    ['Lines · stations', `${s.lines} · ${s.stations}`],
    ['Labels', `${s.labels}${s.unlabeled ? ` (+${s.unlabeled} skipped)` : ''}`],
    ['Parts', `${s.parts}`],
    ['Plates', `${s.plates}`],
    ['Tiles', `${m.tiles.cols} × ${m.tiles.rows}`],
    ['Filament', `≈ ${Math.round(s.estimatedGrams)} g`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
  $('warnings').innerHTML = m.warnings.filter((w) => !/could not be labelled/.test(w)).map((w) => `<div class="warn">${w}</div>`).join('');
  $('pane-map').innerHTML = m.svg;
  $('pane-ar').innerHTML = '';
  if (activeTab === 'ar') prepareAr();
}
function markBed(i: number) { $('bedlist').querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', i === j)); }

let activeTab = '3d';
$('tabs').querySelectorAll<HTMLButtonElement>('button').forEach((t) => t.addEventListener('click', () => {
  $('tabs').querySelectorAll('button').forEach((x) => x.classList.remove('active'));
  t.classList.add('active'); activeTab = t.dataset.tab!;
  document.querySelectorAll('.pane').forEach((x) => x.classList.remove('active'));
  if (activeTab !== '3d') $(`pane-${activeTab}`).classList.add('active');
  $('dock').style.display = activeTab === '3d' ? '' : 'none';
  if (activeTab === '3d') preview.resize();
  if (activeTab === 'beds') { beds.resize(); beds.frameAll(); }
  if (activeTab === 'ar' && built) prepareAr();
}));
$('dock').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => preview.view(b.dataset.view as any)));

async function prepareAr() {
  if (!built) return;
  if (!arBlobs) {
    $('pane-ar').innerHTML = `<div class="empty">Preparing AR model…</div>`;
    try {
      const m = (await call({ type: 'ar' })) as Extract<FromWorker, { type: 'ar' }>;
      arBlobs = { glb: URL.createObjectURL(new Blob([m.glb as BlobPart], { type: 'model/gltf-binary' })), usdz: URL.createObjectURL(new Blob([m.usdz as BlobPart], { type: 'model/vnd.usdz+zip' })) };
    } catch (e: any) { $('pane-ar').innerHTML = `<div class="empty">AR export failed: ${e.message}</div>`; return; }
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('pane-ar').innerHTML = `
    <model-viewer src="${arBlobs.glb}" ios-src="${arBlobs.usdz}" ar ar-modes="webxr scene-viewer quick-look" ar-placement="wall" ar-scale="fixed"
      camera-controls touch-action="pan-y" shadow-intensity="1" exposure="1" environment-image="neutral" alt="${built.place} metro map">
      <button slot="ar-button" class="arbtn">View on your wall</button>
    </model-viewer>
    <div class="caption glass">${isIOS ? 'Opens AR Quick Look at true size on a vertical wall' : 'Open this page on your phone for AR (iPhone: Quick Look · Android: Scene Viewer)'} &nbsp;·&nbsp; <a href="${arBlobs.usdz}" download="metromap.usdz">USDZ</a> · <a href="${arBlobs.glb}" download="metromap.glb">GLB</a></div>`;
}

function saveBlob(data: Uint8Array | string, name: string, type: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data as BlobPart], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$('dl').addEventListener('click', async () => {
  if (!built) return;
  const b = $('dl') as HTMLButtonElement; b.disabled = true;
  try {
    const m = (await call({ type: 'bundle', individualStls: ($('individual') as HTMLInputElement).checked })) as Extract<FromWorker, { type: 'bundle' }>;
    saveBlob(m.zip, m.filename, 'application/zip'); setStatus(`Bundle ready · ${(m.zip.length / 1e6).toFixed(1)} MB`, 1);
  } catch (e: any) { setStatus(`Export failed: ${e.message}`); } finally { b.disabled = false; }
});

$('slice').addEventListener('click', async () => {
  if (!built) return;
  const b = $('slice') as HTMLButtonElement; b.disabled = true;
  try {
    const m = (await call({ type: 'slice', printerId: val('slicePrinter') })) as Extract<FromWorker, { type: 'sliced' }>;
    renderSliceResult(m);
  } catch (e: any) { $('sliceout').innerHTML = `<div class="warn">${e.message}</div>`; } finally { b.disabled = false; }
});

function renderSliceResult(m: Extract<FromWorker, { type: 'sliced' }>) {
  const rows = m.plates.map((p, i) => `<tr><td><span class="sw" style="background:${p.color}"></span>${i + 1}. ${p.name}</td><td class="n">${fmtTime(p.timeSec)}</td><td class="n">${p.filamentGrams.toFixed(0)} g</td></tr>`).join('');
  $('sliceout').innerHTML = `
    <div class="stats"><div class="k">Print time, one printer</div><div class="v">${fmtTime(m.totalSec)}</div><div class="k">Filament</div><div class="v">${m.totalGrams.toFixed(0)} g</div></div>
    <button class="btn full" id="dlg">⬇ G-code for every plate</button>
    <h4>Print farm</h4>
    <label class="field"><span>A1 minis</span><input id="nA1" type="number" value="3" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>P1S</span><input id="nP1" type="number" value="0" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>Ultimaker S3</span><input id="nS3" type="number" value="1" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>Swap time per plate</span><span><input id="chg" type="number" value="8" min="0" max="60" style="width:64px"> min</span></label>
    <div id="farmout"></div>
    <details><summary>Per plate</summary><table class="tbl"><tr><th>Plate</th><th>Time</th><th>Filament</th></tr>${rows}</table></details>`;
  $('dlg').addEventListener('click', () => saveBlob(m.zip, `metrocad-gcode-${m.printerId}.zip`, 'application/zip'));
  const update = () => {
    const pools = [{ name: 'A1 mini', n: Number(val('nA1')), f: 1 }, { name: 'P1S', n: Number(val('nP1')), f: 0.9 }, { name: 'S3', n: Number(val('nS3')), f: 1.3 }];
    const chg = Number(val('chg')) * 60;
    const printers = pools.flatMap((p) => Array.from({ length: p.n }, (_, i) => ({ name: `${p.name} #${i + 1}`, f: p.f, free: 0, jobs: 0 })));
    if (!printers.length) { $('farmout').innerHTML = '<div class="warn">Add at least one printer.</div>'; return; }
    const jobs = [...m.plates].sort((a, b) => b.timeSec - a.timeSec);
    for (const j of jobs) { let best = printers[0]; for (const p of printers) if (p.free + j.timeSec * p.f < best.free + j.timeSec * best.f) best = p; best.free += j.timeSec * best.f + chg; best.jobs++; }
    const makespan = Math.max(...printers.map((p) => p.free)) - chg;
    $('farmout').innerHTML = `<div class="big">${fmtTime(makespan)}</div><div class="statusline">${printers.length} printer${printers.length > 1 ? 's' : ''} in parallel · ${m.plates.length} plates · ${pools.filter((p) => p.n).map((p) => `${p.name} × ${p.n}`).join(', ')}</div>`;
  };
  ['nA1', 'nP1', 'nS3', 'chg'].forEach((id) => $(id).addEventListener('input', update));
  update();
}

if (!location.hash.includes('nostart')) generate('paris');
