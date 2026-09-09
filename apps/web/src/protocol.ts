/** Messages between the UI and the build worker. */
import type { BuildStats, DesignParams, MapLayout, MeshData, Plate, PartKind, TransitMode } from '@metrocad/core';
import type { PartialParams } from '@metrocad/core';

export interface DisplayPart {
  id: string; name: string; kind: PartKind; color: string; colorName: string;
  mesh: MeshData; // preview mesh
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

export type ToWorker =
  | { type: 'build'; id: number; city?: string; fixture?: string; modes?: TransitMode[]; params: PartialParams }
  | { type: 'bundle'; id: number; individualStls: boolean }
  | { type: 'ar'; id: number }
  | { type: 'slice'; id: number; printerId: string }
  | { type: 'plateSvg'; id: number };

export type FromWorker =
  | { type: 'status'; id: number; stage: string; fraction: number; detail?: string }
  | { type: 'built'; id: number; parts: DisplayPart[]; layout: MapLayout; params: DesignParams; plates: Plate[]; stats: BuildStats; warnings: string[]; svg: string; place: string; tiles: { cols: number; rows: number; w: number; h: number } }
  | { type: 'bundle'; id: number; zip: Uint8Array; filename: string }
  | { type: 'ar'; id: number; glb: Uint8Array; usdz: Uint8Array }
  | { type: 'sliced'; id: number; printerId: string; plates: { id: string; name: string; color: string; colorName: string; timeSec: number; filamentGrams: number; layers: number; gcodeBytes: number }[]; totalSec: number; totalGrams: number; zip: Uint8Array }
  | { type: 'error'; id: number; message: string };

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
