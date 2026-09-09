/// <reference lib="webworker" />
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import fontUrl from '@metrocad/core/fonts/Inter-Bold.ttf?url';
import parisUrl from '@metrocad/core/fixtures/paris.json?url';
import londonUrl from '@metrocad/core/fixtures/london.json?url';
import philadelphiaUrl from '@metrocad/core/fixtures/philadelphia.json?url';
import pittsburghUrl from '@metrocad/core/fixtures/pittsburgh.json?url';
import tokyoUrl from '@metrocad/core/fixtures/tokyo.json?url';
import moscowUrl from '@metrocad/core/fixtures/moscow.json?url';
import viennaUrl from '@metrocad/core/fixtures/vienna.json?url';
import atlantaUrl from '@metrocad/core/fixtures/atlanta.json?url';
import sanFranciscoUrl from '@metrocad/core/fixtures/san-francisco.json?url';
import {
  fetchCityNetwork, buildFromNetwork, buildBundle, zipBundle, TextFont, renderSvg, partsToGlb, partsToUsdz,
  slugify, sliceAndSchedule, buildAssemblyPlan, renderAssemblyPlanSvg, knownMapFor, commonsFileUrl, type FullBuildResult, type MetroNetwork, type FarmResult, type Part,
} from '@metrocad/core';
import type { ToWorker, FromWorker, DisplayPart } from './protocol.js';

const FIXTURES: Record<string, string> = { paris: parisUrl, london: londonUrl, philadelphia: philadelphiaUrl, pittsburgh: pittsburghUrl, tokyo: tokyoUrl, moscow: moscowUrl, vienna: viennaUrl, atlanta: atlantaUrl, 'san-francisco': sanFranciscoUrl };

let manifold: ManifoldToplevel | undefined;
let font: TextFont | undefined;
let fontBytes: Uint8Array | undefined;
let current: FullBuildResult | undefined;
let currentCity = '';
let currentSliced: FarmResult | undefined;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as any).postMessage(m, transfer);

async function init() {
  if (!manifold) {
    manifold = await Module({ locateFile: () => wasmUrl });
    manifold.setup();
  }
  if (!font) {
    const buf = await (await fetch(fontUrl)).arrayBuffer();
    fontBytes = new Uint8Array(buf);
    font = TextFont.fromBuffer(buf, 'Inter Bold');
  }
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  const id = msg.id;
  try {
    if (msg.type === 'build') {
      post({ type: 'status', id, stage: 'init', fraction: 0, detail: 'Loading geometry engine' });
      await init();
      let net: MetroNetwork;
      if (msg.fixture && FIXTURES[msg.fixture]) {
        post({ type: 'status', id, stage: 'fetch', fraction: 0.5, detail: `Loading ${msg.fixture}` });
        net = await (await fetch(FIXTURES[msg.fixture])).json();
      } else {
        net = await fetchCityNetwork(msg.city!, { modes: msg.modes, onStatus: (d) => post({ type: 'status', id, stage: 'fetch', fraction: 0.3, detail: d }) });
      }
      currentCity = msg.city ?? msg.fixture ?? 'map';
      post({ type: 'status', id, stage: 'fetch', fraction: 1, detail: `${net.displayName}: ${net.lines.length} lines, ${net.stations.length} stations` });
      // Official map geometry: user-supplied SVG, or a known community schematic from Wikimedia Commons.
      let mapSvg = msg.officialMap === 'custom' ? msg.mapSvg : undefined;
      let mapSource: string | undefined = mapSvg ? 'your SVG' : undefined;
      if (msg.officialMap === 'auto') {
        const known = knownMapFor(currentCity, net.lines[0]?.network) ?? knownMapFor(net.displayName);
        if (known) {
          try {
            post({ type: 'status', id, stage: 'fetch', fraction: 0.9, detail: `Fetching official-style map: ${known.title}` });
            const url = await commonsFileUrl(known.file);
            const res = await fetch(url);
            if (res.ok) { mapSvg = await res.text(); mapSource = `${known.title} (${known.license})`; }
          } catch (e) { console.warn('official map fetch failed', e); }
        }
      }
      current = buildFromNetwork(net, {
        params: msg.params, font: font!, manifold: manifold!, mapSvg,
        progress: (stage, fraction, detail) => post({ type: 'status', id, stage, fraction, detail }),
      });
      currentSliced = undefined;
      const parts: DisplayPart[] = current.parts.map((p) => ({ id: p.id, name: p.name, kind: p.kind, color: p.color, colorName: p.colorName, mesh: p.previewMesh ?? p.mesh, bbox: p.bbox, tag: p.tag, group: p.group, lineId: p.lineId, stationId: p.stationId }));
      const transfer: Transferable[] = [];
      // Copy buffers so the worker keeps its originals for export.
      const copies = parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() } }));
      for (const p of copies) transfer.push(p.mesh.positions.buffer, p.mesh.indices.buffer);
      const { graph, corridors, ...layout } = current.layout as any;
      const svg = renderSvg(current.layout, current.params, { fontDataUrl: undefined, fontFamily: 'Inter' });
      post({ type: 'built', id, parts: copies, layout, params: current.params, plates: current.plates, stats: current.stats, warnings: current.warnings, svg, place: net.displayName, tiles: current.tiles, mapSource }, transfer);
    } else if (msg.type === 'bundle') {
      if (!current) throw new Error('Nothing built yet');
      const files = buildBundle(current, {
        individualStls: msg.individualStls, ar: true, sliced: currentSliced,
        fontDataUrl: fontBytes ? 'data:font/ttf;base64,' + b64(fontBytes) : undefined,
        onProgress: (f, d) => post({ type: 'status', id, stage: 'export', fraction: f, detail: d }),
      });
      post({ type: 'status', id, stage: 'export', fraction: 0.98, detail: 'Compressing' });
      const zip = zipBundle(files);
      post({ type: 'bundle', id, zip, filename: `metrocad-${slugify(currentCity)}.zip` }, [zip.buffer]);
    } else if (msg.type === 'ar') {
      if (!current) throw new Error('Nothing built yet');
      post({ type: 'status', id, stage: 'ar', fraction: 0.2, detail: 'Building AR models' });
      const bounds = { width: current.layout.width, height: current.layout.height };
      const glb = partsToGlb(current.parts, { bounds });
      post({ type: 'status', id, stage: 'ar', fraction: 0.6, detail: 'USDZ for iOS' });
      const usdz = partsToUsdz(current.parts, { bounds, anchoring: 'wall' });
      post({ type: 'ar', id, glb, usdz }, [glb.buffer, usdz.buffer]);
    } else if (msg.type === 'slice') {
      if (!current) throw new Error('Nothing built yet');
      const res = sliceAndSchedule(current, manifold!, { changeoverMin: msg.changeoverMin, onProgress: (f, d) => post({ type: 'status', id, stage: 'slice', fraction: f, detail: d }) });
      currentSliced = res;
      const files: Record<string, Uint8Array> = {};
      res.plates.forEach((sp, i) => { files[`${slugify(sp.printerId)}/${String(i + 1).padStart(2, '0')}-${slugify(sp.name)}.gcode`] = new TextEncoder().encode(sp.gcode); });
      const zip = zipBundle(files);
      post({ type: 'sliced', id, plates: res.plates.map((p) => ({ id: p.plateId, name: p.name, color: p.color, colorName: p.colorName, timeSec: p.timeSec, filamentGrams: p.stats.filamentGrams, layers: p.stats.layers, printer: p.printerName, printerId: p.printerId })), totalSec: res.totalSec, totalGrams: res.totalGrams, makespanSec: res.schedule.makespanSec, perPrinter: res.schedule.perPrinter.map((p) => ({ printer: p.printer, busySec: p.busySec, jobs: p.jobs })), zip }, [zip.buffer]);
    } else if (msg.type === 'assembly') {
      if (!current) throw new Error('Nothing built yet');
      const plan = buildAssemblyPlan(current);
      post({ type: 'assembly', id, plan, planSvg: renderAssemblyPlanSvg(current, plan, { fontDataUrl: fontBytes ? 'data:font/ttf;base64,' + b64(fontBytes) : undefined }) });
    } else if (msg.type === 'stepAr') {
      if (!current) throw new Error('Nothing built yet');
      // Ghosted tiles + the step's pieces in full colour, so the phone shows exactly where they go.
      const plan = buildAssemblyPlan(current);
      const step = plan.steps.find((st) => st.id === msg.stepId);
      const ids = new Set(step?.pieces.map((p) => p.partId) ?? []);
      const parts: Part[] = current.parts.filter((p) => p.kind === 'tile' || ids.has(p.id) || (p.group && ids.has(p.group))).map((p) => (p.kind === 'tile' && msg.stepId !== 'tiles') ? { ...p, color: '#6b6b70' } : p);
      const bounds = { width: current.layout.width, height: current.layout.height };
      const glb = partsToGlb(parts, { bounds });
      const usdz = partsToUsdz(parts, { bounds, anchoring: 'wall' });
      post({ type: 'stepAr', id, stepId: msg.stepId, glb, usdz }, [glb.buffer, usdz.buffer]);
    }
  } catch (e: any) {
    post({ type: 'error', id, message: e?.message ?? String(e) });
    console.error(e);
  }
};

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
