/// <reference lib="webworker" />
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import fontUrl from '@metrocad/core/fonts/Inter-Bold.ttf?url';
import parisUrl from '@metrocad/core/fixtures/paris.json?url';
import londonUrl from '@metrocad/core/fixtures/london.json?url';
import {
  fetchCityNetwork, buildFromNetwork, buildBundle, zipBundle, TextFont, renderSvg, partsToGlb, partsToUsdz,
  slugify, type FullBuildResult, type MetroNetwork,
} from '@metrocad/core';
import type { ToWorker, FromWorker, DisplayPart } from './protocol.js';

const FIXTURES: Record<string, string> = { paris: parisUrl, london: londonUrl };

let manifold: ManifoldToplevel | undefined;
let font: TextFont | undefined;
let fontBytes: Uint8Array | undefined;
let current: FullBuildResult | undefined;
let currentCity = '';

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
      current = buildFromNetwork(net, {
        params: msg.params, font: font!, manifold: manifold!,
        progress: (stage, fraction, detail) => post({ type: 'status', id, stage, fraction, detail }),
      });
      const parts: DisplayPart[] = current.parts.map((p) => ({ id: p.id, name: p.name, kind: p.kind, color: p.color, colorName: p.colorName, mesh: p.previewMesh ?? p.mesh, bbox: p.bbox }));
      const transfer: Transferable[] = [];
      // Copy buffers so the worker keeps its originals for export.
      const copies = parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() } }));
      for (const p of copies) transfer.push(p.mesh.positions.buffer, p.mesh.indices.buffer);
      const { graph, corridors, ...layout } = current.layout as any;
      const svg = renderSvg(current.layout, current.params, { fontDataUrl: undefined, fontFamily: 'Inter' });
      post({ type: 'built', id, parts: copies, layout, params: current.params, plates: current.plates, stats: current.stats, warnings: current.warnings, svg, place: net.displayName, tiles: current.tiles }, transfer);
    } else if (msg.type === 'bundle') {
      if (!current) throw new Error('Nothing built yet');
      const files = buildBundle(current, {
        individualStls: msg.individualStls, ar: true,
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
      const core: any = await import('@metrocad/core');
      if (!core.slicePlate) throw new Error('Slicer not available in this build');
      const printer = core.PRINTERS?.[msg.printerId] ?? core.getPrinter?.(msg.printerId);
      const process = core.processFor(printer);
      const files: Record<string, Uint8Array> = {};
      const out: any[] = [];
      let totalSec = 0, totalGrams = 0;
      current.plates.forEach((plate, i) => {
        post({ type: 'status', id, stage: 'slice', fraction: i / current!.plates.length, detail: `Slicing ${plate.name}` });
        const objects = plate.items.flatMap((item) => {
          const bb = core.itemBBox(current!.parts, item.partId);
          return bb.parts.map((p: any) => ({ mesh: p.mesh, transform: core.placementTransform(item, bb.min[2]), name: p.name, colorChangeAtZ: plate.colorChange && p.kind === 'labelText' ? plate.colorChange.atZ : undefined }));
        });
        const res = core.slicePlate({ objects, printer, process, label: plate.name }, manifold);
        const n = String(i + 1).padStart(2, '0');
        files[`${n}-${slugify(plate.name)}${printer.gcodeExtension}`] = new TextEncoder().encode(res.gcode);
        out.push({ id: plate.id, name: plate.name, color: plate.color, colorName: plate.colorName, timeSec: res.stats.timeSec, filamentGrams: res.stats.filamentGrams, layers: res.stats.layers, gcodeBytes: res.gcode.length });
        totalSec += res.stats.timeSec; totalGrams += res.stats.filamentGrams;
      });
      const zip = zipBundle(files);
      post({ type: 'sliced', id, printerId: msg.printerId, plates: out, totalSec, totalGrams, zip }, [zip.buffer]);
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
