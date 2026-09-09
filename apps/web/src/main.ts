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
<div class="pane" id="pane-assemble"><div class="assemble"><div class="steps glass" id="steps"></div><div class="main glass" id="asm"></div></div></div>
<div class="brand glass"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#1d1d1f"/><circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" stroke-width="3.5"/></svg><span class="t">MetroCAD</span></div>
<div class="segmented glass" id="tabs">
  <button data-tab="3d" class="active">Wall</button><button data-tab="map">Map</button><button data-tab="beds">Print beds</button><button data-tab="assemble">Assemble</button><button data-tab="ar">AR</button>
</div>
<div class="topright"><a class="pill" href="https://github.com/gitter499/metrocad" target="_blank" rel="noopener">GitHub</a></div>
<div class="panel glass">
  <input id="city" type="text" placeholder="City" value="Philadelphia" autocomplete="off" />
  <div class="chips" id="chips"></div>
  <label class="field"><span>Official map</span><select id="officialMap" style="width:150px"><option value="auto">Auto (Commons schematic)</option><option value="none">Generated layout</option><option value="custom">My SVG file…</option></select></label>
  <input id="mapFile" type="file" accept=".svg,image/svg+xml" style="display:none">
  <button class="go" id="go">Generate</button>
  <div class="progress"><div id="bar"></div></div>
  <div class="statusline" id="status"></div>
  <div class="group">
    <h4>Size &amp; printer</h4>
    <label class="field"><span>Width</span><span><input id="width" type="number" value="900" min="200" max="3000" step="10" style="width:80px"> mm</span></label>
    <label class="field"><span>Height</span><span><input id="height" type="number" placeholder="auto" min="150" max="3000" step="10" style="width:80px"> mm</span></label>
    <label class="field"><span>A1 mini</span><input id="nA1" type="number" value="3" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>P1S / X1</span><input id="nP1" type="number" value="1" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>Ultimaker S3</span><input id="nS3" type="number" value="1" min="0" max="20" style="width:64px"></label>
    <label class="field"><span>Plates sized for</span><select id="plateBed" style="width:150px"><option value="min">Smallest bed (any printer)</option><option value="bambu-a1-mini">A1 mini 180²</option><option value="bambu-p1s">P1S 256²</option><option value="ultimaker-s3">S3 230×190</option></select></label>
    <label class="field"><span>Base</span><select id="base" style="width:190px"><option value="tiles">Grooved snap-fit tiles</option><option value="outline">Outline tiles (least filament)</option><option value="none">No base, paper template</option></select></label>
  </div>
  <details>
    <summary>Style</summary>
    <div class="group" style="margin-top:8px">
      <label class="field"><span>Layout</span><select id="layoutMode"><option value="schematic">Schematic</option><option value="geographic">Geographic</option></select></label>
      <label class="field"><span>Line width</span><span><input id="lineWidth" type="number" value="6" min="3" max="14" step="0.5" style="width:70px"> mm</span></label>
      <label class="field"><span>Labels</span><select id="labels"><option value="all">All stations</option><option value="major">Interchanges</option><option value="none">None</option></select></label>
      <label class="field"><span>Label size</span><span><input id="labelSize" type="number" value="5.5" min="3.5" max="12" step="0.5" style="width:70px"> mm</span></label>
      <label class="field"><span>Names</span><select id="lang"><option value="local">Local</option><option value="en">English</option></select></label>
      <label class="field"><span>Label method</span><select id="labelMode"><option value="print">3D-printed letters</option><option value="tape">Label-maker tape</option><option value="auto">Auto (tape if tiny)</option></select></label>
      <label class="field"><span>Tape width</span><span><input id="tapeWidth" type="number" value="12" min="6" max="24" step="3" style="width:70px"> mm</span></label>
      <label class="field"><span>Snap-fit lugs</span><input id="snap" type="checkbox" checked></label>
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
    <label class="field"><span>Swap time per plate</span><span><input id="chg" type="number" value="8" min="0" max="60" style="width:64px"> min</span></label>
    <button class="btn full" id="slice">Slice every plate → G-code + schedule</button>
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

const featured: [string, string][] = [['Philadelphia', 'philadelphia'], ['Pittsburgh', 'pittsburgh'], ['London', 'london'], ['Paris', 'paris'], ['Tokyo', 'tokyo'], ['Moscow', 'moscow'], ['Vienna', 'vienna'], ['Atlanta', 'atlanta'], ['San Francisco', 'san-francisco'], ['New York', ''], ['Berlin', ''], ['Madrid', '']];
$('chips').innerHTML = featured.map(([n, f]) => `<span class="chip" data-city="${n}" data-fixture="${f}">${n}</span>`).join('');
$('chips').querySelectorAll<HTMLElement>('.chip').forEach((c) => c.addEventListener('click', () => { ($('city') as HTMLInputElement).value = c.dataset.city!; generate(c.dataset.fixture || undefined); }));
let customSvg: string | undefined;
$('officialMap').addEventListener('change', () => { $('mapFile').style.display = val('officialMap') === 'custom' ? '' : 'none'; });
$('mapFile').addEventListener('change', async () => { const f = ($('mapFile') as HTMLInputElement).files?.[0]; if (f) { customSvg = await f.text(); setStatus(`Loaded ${f.name}`); } });

const preview = new Preview($('gl') as HTMLCanvasElement);
const beds = new PlatesView($('glbeds') as HTMLCanvasElement);
let built: Extract<FromWorker, { type: 'built' }> | undefined;
let arBlobs: { glb: string; usdz: string } | undefined;

function farm() {
  const f = [
    { printerId: 'bambu-a1-mini', count: Number(val('nA1')), bed: PRINTERS['bambu-a1-mini'].bed, speedFactor: 1 },
    { printerId: 'bambu-p1s', count: Number(val('nP1')), bed: PRINTERS['bambu-p1s'].bed, speedFactor: 0.9 },
    { printerId: 'ultimaker-s3', count: Number(val('nS3')), bed: PRINTERS['ultimaker-s3'].bed, speedFactor: 1.3 },
  ].filter((p) => p.count > 0);
  return f.length ? f : [{ printerId: 'bambu-a1-mini', count: 1, bed: PRINTERS['bambu-a1-mini'].bed, speedFactor: 1 }];
}
function params(): PartialParams {
  const pb = val('plateBed');
  const bed = pb === 'min' ? undefined : PRINTERS[pb].bed;
  const h = Number(val('height'));
  const text = val('cText'), base = val('cBase');
  return {
    widthMm: Number(val('width')) || 900, heightMm: h > 0 ? h : undefined, bed, farm: farm(),
    labelMode: val('labelMode') as any, tapeWidth: Number(val('tapeWidth')) || 12, snapFit: ($('snap') as HTMLInputElement).checked,
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
    const officialMap = val('officialMap') as 'auto' | 'none' | 'custom';
    const m = (await call({ type: 'build', city, fixture: usedFixture, modes, params: params(), officialMap, mapSvg: officialMap === 'custom' ? customSvg : undefined })) as Extract<FromWorker, { type: 'built' }>;
    built = m; showResult(m, performance.now() - t0);
  } catch (e: any) { setStatus(`Error: ${e.message}`, 0); console.error(e); } finally { go.disabled = false; }
}
$('go').addEventListener('click', () => generate(undefined));
$('city').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(undefined); });

const fmtTime = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };

function showResult(m: Extract<FromWorker, { type: 'built' }>, ms: number) {
  const s = m.stats;
  setStatus(`${m.place.split(',')[0]} · ${(ms / 1000).toFixed(1)} s${m.mapSource ? ` · geometry from ${m.mapSource}` : ''}`, 1);
  preview.setParts(m.parts, m.layout.width, m.layout.height);
  const bedName = m.plates.length ? `${m.plates[0].bed.x} × ${m.plates[0].bed.y}` : '';
  beds.setPlates(m.plates, m.parts, bedName);
  assembly = undefined; $('steps').innerHTML = ''; $('asm').innerHTML = '';
  if (activeTab === 'assemble') loadAssembly();
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
  $('warnings').innerHTML = m.warnings.filter((w) => !/could not be labelled|^line /.test(w)).map((w) => `<div class="warn">${w}</div>`).join('');
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
  if (activeTab === 'assemble' && built) loadAssembly();
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
    const m = (await call({ type: 'slice', changeoverMin: Number(val('chg')) })) as Extract<FromWorker, { type: 'sliced' }>;
    renderSliceResult(m);
  } catch (e: any) { $('sliceout').innerHTML = `<div class="warn">${e.message}</div>`; } finally { b.disabled = false; }
});

function renderSliceResult(m: Extract<FromWorker, { type: 'sliced' }>) {
  const rows = m.plates.map((p, i) => `<tr><td><span class="sw" style="background:${p.color}"></span>${i + 1}. ${p.name}</td><td>${p.printer}</td><td class="n">${fmtTime(p.timeSec)}</td><td class="n">${p.filamentGrams.toFixed(0)} g</td></tr>`).join('');
  const per = m.perPrinter.map((p) => `<div class="k">${p.printer}</div><div class="v">${p.jobs.length} plates · ${fmtTime(p.busySec)}</div>`).join('');
  $('sliceout').innerHTML = `
    <div class="big">${fmtTime(m.makespanSec)}</div>
    <div class="statusline">wall-clock for the whole map on your farm · ${fmtTime(m.totalSec)} of printing · ${m.totalGrams.toFixed(0)} g</div>
    <div class="stats">${per}</div>
    <button class="btn full" id="dlg">⬇ G-code for every plate (per printer)</button>
    <details><summary>Per plate</summary><table class="tbl"><tr><th>Plate</th><th>Printer</th><th>Time</th><th>Filament</th></tr>${rows}</table></details>`;
  $('dlg').addEventListener('click', () => saveBlob(m.zip, `metrocad-gcode.zip`, 'application/zip'));
}

/* ----------------------------- Assemble mode ----------------------------- */
let assembly: Extract<FromWorker, { type: 'assembly' }> | undefined;
let currentStep = '';
const stepAr = new Map<string, { glb: string; usdz: string }>();
const doneKey = () => `metrocad-done-${built?.place ?? ''}`;
let done = new Set<string>();
try { done = new Set(JSON.parse(localStorage.getItem(doneKey()) ?? '[]')); } catch { /* ignore */ }

async function loadAssembly() {
  if (!built) return;
  if (!assembly) {
    $('asm').innerHTML = '<div class="hint" style="padding:16px">Building the assembly plan…</div>';
    try { assembly = (await call({ type: 'assembly' })) as Extract<FromWorker, { type: 'assembly' }>; } catch (e: any) { $('asm').innerHTML = `<div class="hint">${e.message}</div>`; return; }
    try { done = new Set(JSON.parse(localStorage.getItem(doneKey()) ?? '[]')); } catch { done = new Set(); }
    stepAr.clear();
  }
  const plan = assembly.plan;
  $('steps').innerHTML = `<div style="padding:6px 10px 10px;font-weight:700">Steps</div>` + plan.steps.map((st, i) => {
    const n = st.pieces.length, d = st.pieces.filter((p) => done.has(p.tag)).length;
    return `<button data-step="${st.id}" class="${st.id === currentStep ? 'active' : ''}"><span>${st.color ? `<span class="sw" style="background:${st.color}"></span>` : ''}${i + 1}. ${st.title}</span><span class="n">${d}/${n}</span></button>`;
  }).join('');
  $('steps').querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => showStep(b.dataset.step!)));
  if (!currentStep || !plan.steps.some((st) => st.id === currentStep)) currentStep = plan.steps[0]?.id ?? '';
  showStep(currentStep);
}

function showStep(id: string) {
  if (!assembly) return;
  currentStep = id;
  const plan = assembly.plan;
  const st = plan.steps.find((x) => x.id === id)!;
  $('steps').querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.step === id));
  const isLine = id.startsWith('line-');
  const svg = assembly.planSvg;
  $('asm').innerHTML = `
    <div class="hdr"><h3>${st.color ? `<span class="sw" style="background:${st.color};width:14px;height:14px"></span>` : ''}${st.title} <span style="font-weight:500">· ${st.pieces.length} piece${st.pieces.length === 1 ? '' : 's'}</span></h3>
      <div class="finder"><input id="find" type="text" placeholder="Find ID, e.g. 4-07"><button class="btn" id="findbtn">Find</button></div>
      <button class="btn" id="stepar">View this step in AR</button></div>
    <div class="hint">${st.hint}</div>
    <div class="chk">${st.pieces.map((p) => `<label class="${done.has(p.tag) ? 'done' : ''}" title="${p.name} → tiles ${p.tiles.join(', ')}"><input type="checkbox" data-tag="${p.tag}" ${done.has(p.tag) ? 'checked' : ''}>${p.tag}${p.tiles.length && !isLine ? '' : ''}</label>`).join('')}</div>
    <div class="plan" id="planhost">${svg}</div>`;
  const host = $('planhost');
  const svgEl = host.querySelector('svg')!;
  svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
  // Highlight this step's IDs: dim other ID badges.
  svgEl.querySelectorAll('g > rect + text').forEach((t) => {
    const g = t.parentElement!;
    const tag = t.textContent ?? '';
    const mine = st.pieces.some((p) => p.tag === tag);
    (g as HTMLElement).style.opacity = mine ? '1' : '0.15';
  });
  $('asm').querySelectorAll<HTMLInputElement>('.chk input').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) done.add(cb.dataset.tag!); else done.delete(cb.dataset.tag!);
    cb.parentElement!.classList.toggle('done', cb.checked);
    try { localStorage.setItem(doneKey(), JSON.stringify([...done])); } catch { /* ignore */ }
    const b = $('steps').querySelector(`button[data-step="${id}"] .n`); if (b) b.textContent = `${st.pieces.filter((p) => done.has(p.tag)).length}/${st.pieces.length}`;
  }));
  const find = () => {
    const q = ($('find') as HTMLInputElement).value.trim().toUpperCase();
    if (!q) return;
    const piece = plan.index[q] ?? Object.values(plan.index).find((p) => p.tag.toUpperCase() === q || p.tag.toUpperCase() === q.replace(/^L/, ''));
    if (!piece) { setStatus(`No piece "${q}"`); return; }
    const owner = plan.steps.find((s2) => s2.pieces.includes(piece))!;
    if (owner.id !== id) { showStep(owner.id); ($('find') as HTMLInputElement).value = q; }
    svgEl.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
    svgEl.querySelectorAll('g > rect + text').forEach((t) => { if ((t.textContent ?? '') === piece.tag) { t.parentElement!.classList.add('hl'); (t.parentElement as any).scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' }); } });
    setStatus(`${piece.tag}: ${piece.name} → tile${piece.tiles.length > 1 ? 's' : ''} ${piece.tiles.join(', ')}${piece.plate ? ` · printed on ${piece.plate}` : ''}`);
  };
  $('findbtn').addEventListener('click', find);
  $('find').addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
  $('stepar').addEventListener('click', async () => {
    const b = $('stepar') as HTMLButtonElement; b.disabled = true;
    try {
      let ar = stepAr.get(id);
      if (!ar) {
        const m = (await call({ type: 'stepAr', stepId: id })) as Extract<FromWorker, { type: 'stepAr' }>;
        ar = { glb: URL.createObjectURL(new Blob([m.glb as BlobPart], { type: 'model/gltf-binary' })), usdz: URL.createObjectURL(new Blob([m.usdz as BlobPart], { type: 'model/vnd.usdz+zip' })) };
        stepAr.set(id, ar);
      }
      host.innerHTML = `<div style="position:relative;height:100%;min-height:420px"><model-viewer src="${ar.glb}" ios-src="${ar.usdz}" ar ar-modes="webxr scene-viewer quick-look" ar-placement="wall" ar-scale="fixed" camera-controls shadow-intensity="1" environment-image="neutral" style="width:100%;height:100%;border-radius:12px"><button slot="ar-button" class="arbtn">Show on the tiles (AR)</button></model-viewer>
        <div class="caption glass" style="bottom:10px">Grey tiles + this step's pieces in colour. Place it over the real tiles at true size. <a href="${ar.usdz}" download="step-${id}.usdz">USDZ</a> · <a href="${ar.glb}" download="step-${id}.glb">GLB</a> · <a href="#" id="backplan">back to plan</a></div></div>`;
      $('backplan').addEventListener('click', (e) => { e.preventDefault(); showStep(id); });
    } catch (e: any) { setStatus(`AR failed: ${e.message}`); } finally { b.disabled = false; }
  });
}

if (!location.hash.includes('nostart')) generate('paris');
