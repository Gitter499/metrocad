import type { DesignParams } from './types.js';

export const DEFAULT_PARAMS: DesignParams = {
  widthMm: 900,
  heightMm: undefined,
  bed: { x: 180, y: 180 },
  farm: [{ printerId: 'bambu-a1-mini', count: 3, bed: { x: 180, y: 180 }, speedFactor: 1 }],
  bedMargin: 4,
  clearance: 0.15,

  base: 'tiles',
  baseThickness: 4,
  grooveDepth: 1.2,
  pocketExtraDepth: 1.0,
  keyholes: false,

  lineWidth: 6,
  lineHeight: 2.0,
  lineGap: 1.4,
  cornerRadiusFactor: 2.2,

  dotFactor: 0.62,
  ringWidth: 1.2,
  stationRelief: 0.6,

  labels: 'all',
  labelFontSize: 5.5,
  labelPlateThickness: 1.0,
  labelTextHeight: 0.8,
  labelLanguage: 'local',
  labelAllowRotated: true,
  labelMode: 'auto',
  tapeWidth: 12,
  engraveIds: true,
  snapFit: true,
  snapInterference: 0.1,

  colors: {
    base: '#1c1c1e',
    dot: '#f5f5f0',
    plug: '#f5f5f0',
    ring: '#111111',
    labelText: '#f5f5f0',
    labelPlate: '#1c1c1e',
  },

  layout: {
    mode: 'schematic',
    schematicStrength: 1,
    fisheye: 0.55,
    minSpacing: 1,
    iterations: 500,
    seed: 7,
  },
  quality: 'print',
};

export type PartialParams = Omit<Partial<DesignParams>, 'layout' | 'colors' | 'bed'> & {
  layout?: Partial<DesignParams['layout']>;
  colors?: Partial<DesignParams['colors']>;
  bed?: Partial<DesignParams['bed']>;
};

/** Known printers for farm definitions. */
export const KNOWN_PRINTERS: Record<string, { name: string; short: string; bed: { x: number; y: number }; speedFactor: number }> = {
  'bambu-a1-mini': { name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: { x: 180, y: 180 }, speedFactor: 1 },
  'bambu-a1': { name: 'Bambu Lab A1', short: 'A1', bed: { x: 256, y: 256 }, speedFactor: 1 },
  'bambu-p1s': { name: 'Bambu Lab P1S', short: 'P1S', bed: { x: 256, y: 256 }, speedFactor: 0.9 },
  'bambu-x1c': { name: 'Bambu Lab X1 Carbon', short: 'X1C', bed: { x: 256, y: 256 }, speedFactor: 0.9 },
  'ultimaker-s3': { name: 'Ultimaker S3', short: 'S3', bed: { x: 230, y: 190 }, speedFactor: 1.3 },
  'ultimaker-s5': { name: 'Ultimaker S5', short: 'S5', bed: { x: 330, y: 240 }, speedFactor: 1.3 },
  'prusa-mk4': { name: 'Prusa MK4', short: 'MK4', bed: { x: 250, y: 210 }, speedFactor: 1.1 },
  'generic-marlin': { name: 'Generic Marlin printer', short: 'Marlin', bed: { x: 220, y: 220 }, speedFactor: 1.4 },
};

/** Parse "bambu-a1-mini:3,bambu-p1s:1" into a farm. */
export function parseFarm(spec: string): DesignParams['farm'] {
  return spec.split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const [id, n] = item.split(':');
    const k = KNOWN_PRINTERS[id];
    if (!k) throw new Error(`Unknown printer "${id}" (known: ${Object.keys(KNOWN_PRINTERS).join(', ')})`);
    return { printerId: id, count: Math.max(1, Number(n ?? 1)), bed: k.bed, speedFactor: k.speedFactor };
  });
}

/** The bed every plate must fit: the smallest bed across the farm. */
export function farmBed(farm: DesignParams['farm']): { x: number; y: number } {
  if (!farm.length) return DEFAULT_PARAMS.bed;
  let best = farm[0].bed;
  for (const f of farm) if (f.bed.x * f.bed.y < best.x * best.y) best = f.bed;
  return best;
}

export function withDefaults(p: PartialParams): DesignParams {
  const farm = p.farm ?? DEFAULT_PARAMS.farm;
  const bed = p.bed ? { ...DEFAULT_PARAMS.bed, ...p.bed } : farmBed(farm);
  return {
    ...DEFAULT_PARAMS,
    ...p,
    farm,
    bed,
    colors: { ...DEFAULT_PARAMS.colors, ...(p.colors ?? {}) },
    layout: { ...DEFAULT_PARAMS.layout, ...(p.layout ?? {}) },
  } as DesignParams;
}
