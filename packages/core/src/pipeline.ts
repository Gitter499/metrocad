/** End-to-end build: network -> layout -> parts -> plates -> stats. */
import type { ManifoldToplevel } from 'manifold-3d';
import type { BuildResult, BuildStats, DesignParams, MetroNetwork, ProgressFn } from './types.js';
import { withDefaults, type PartialParams } from './defaults.js';
import { computeLayout, type LayoutResult } from './layout/index.js';
import { layoutFromSvg, type SvgImportReport } from './svgimport.js';
import { buildParts, type TileGrid } from './geometry.js';
import { packPlates } from './pack.js';
import type { TextFont } from './text.js';

export interface BuildOptions {
  params?: PartialParams;
  font: TextFont;
  manifold: ManifoldToplevel;
  progress?: ProgressFn;
  /** Official/community schematic SVG: its geometry, station positions and label positions replace the algorithmic layout. */
  mapSvg?: string;
}

export interface FullBuildResult extends BuildResult {
  layout: LayoutResult;
  tiles: TileGrid;
  svgImport?: SvgImportReport;
}

/** Approximate printed mass: solid-ish parts at ~90 %, tiles at ~45 % (walls + 15 % infill). PLA 1.24 g/cm³. */
export function estimateGrams(parts: BuildResult['parts']): number {
  let g = 0;
  for (const p of parts) g += (p.volumeMm3 / 1000) * 1.24 * (p.kind === 'tile' ? 0.45 : 0.9);
  return g;
}

export function buildFromNetwork(net: MetroNetwork, opts: BuildOptions): FullBuildResult {
  const t0 = performance.now();
  const params = withDefaults(opts.params ?? {});
  const progress = opts.progress ?? (() => {});
  const warnings: string[] = [];
  let layout: LayoutResult;
  let svgImport: SvgImportReport | undefined;
  if (opts.mapSvg) {
    progress('layout', 0, 'Importing official map geometry');
    const r = layoutFromSvg(opts.mapSvg, net, params, opts.font, { log: (m) => progress('layout', 0.5, m) });
    warnings.push(`Layout imported from the official map drawing: ${r.report.matchedStations}/${net.stations.length} stations matched`);
    layout = r.layout; svgImport = r.report;
    if (r.report.unmatchedStations.length) warnings.push(`${r.report.unmatchedStations.length} stations not found in the SVG: ${r.report.unmatchedStations.slice(0, 8).join(', ')}${r.report.unmatchedStations.length > 8 ? '…' : ''}`);
  } else {
    progress('layout', 0, 'Computing schematic layout');
    layout = computeLayout(net, params, opts.font, (m) => warnings.push(m));
  }
  progress('layout', 1, `${layout.stations.length} stations, ${layout.labels.length} labels`);
  const geo = buildParts(opts.manifold, layout, params, opts.font, { progress });
  warnings.push(...geo.warnings);
  progress('pack', 0, 'Packing print plates');
  const plates = packPlates(geo.parts, params);
  progress('pack', 1, `${plates.length} plates`);
  const stats: BuildStats = {
    stations: layout.stations.length,
    majorStations: layout.stations.filter((s) => s.major).length,
    lines: layout.lines.length,
    labels: layout.labels.length,
    unlabeled: layout.unlabeled.length,
    parts: geo.parts.length,
    plates: plates.length,
    triangles: geo.parts.reduce((s, p) => s + p.triangles, 0),
    volumeMm3: geo.parts.reduce((s, p) => s + p.volumeMm3, 0),
    estimatedGrams: estimateGrams(geo.parts),
    buildMs: performance.now() - t0,
  };
  return { network: net, layout, params, parts: geo.parts, plates, stats, warnings, tiles: geo.tiles, svgImport };
}
