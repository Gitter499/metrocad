import type { DesignParams } from './types.js';

export const DEFAULT_PARAMS: DesignParams = {
  widthMm: 900,
  heightMm: undefined,
  bed: { x: 250, y: 250 },
  bedMargin: 5,
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
    fisheye: 0.35,
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

export function withDefaults(p: PartialParams): DesignParams {
  return {
    ...DEFAULT_PARAMS,
    ...p,
    bed: { ...DEFAULT_PARAMS.bed, ...(p.bed ?? {}) },
    colors: { ...DEFAULT_PARAMS.colors, ...(p.colors ?? {}) },
    layout: { ...DEFAULT_PARAMS.layout, ...(p.layout ?? {}) },
  } as DesignParams;
}
