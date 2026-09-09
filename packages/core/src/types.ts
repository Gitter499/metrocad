/** Shared domain types for MetroCAD. All physical sizes are millimetres unless noted. */

export type Vec2 = [number, number];
export type Hex = string; // "#rrggbb"

export type TransitMode = 'subway' | 'light_rail' | 'tram' | 'train' | 'monorail';

export interface Station {
  id: string;
  /** Display name (local language). */
  name: string;
  /** English name when OSM provides `name:en`. */
  nameEn?: string;
  lat: number;
  lon: number;
  /** Ids of the lines serving this station. */
  lines: string[];
  /** OSM node ids that were merged into this station. */
  osmIds: number[];
}

export interface Line {
  id: string;
  /** Short label, e.g. "1", "A", "Circle". */
  ref: string;
  name: string;
  color: Hex;
  mode: TransitMode;
  network?: string;
  operator?: string;
  /** Ordered station id sequences, one per route variant/direction. */
  sequences: string[][];
}

export interface MetroNetwork {
  /** What the user typed. */
  query: string;
  /** Resolved place name from the geocoder. */
  displayName: string;
  center: { lat: number; lon: number };
  bbox: { south: number; west: number; north: number; east: number };
  lines: Line[];
  stations: Station[];
  modes: TransitMode[];
  source: { provider: 'osm'; overpassEndpoint?: string; fetchedAt: string; attribution: string };
}

/* ----------------------------- Layout ----------------------------- */

export type LayoutMode = 'geographic' | 'schematic';

export interface LayoutOptions {
  mode: LayoutMode;
  /** 0..1 — how far toward octilinear/schematic the relaxation goes. */
  schematicStrength: number;
  /** 0..1 — radial expansion of the dense core (0 = pure geographic). */
  fisheye: number;
  /** Minimum station spacing in layout units (fraction of the map's longer side). */
  minSpacing: number;
  iterations: number;
  seed: number;
}

export interface LayoutStation {
  id: string;
  name: string;
  /** Position in map millimetres, origin bottom-left, +y up. */
  x: number;
  y: number;
  lines: string[];
  /** Big marker (interchange/junction) vs. small dot on a single line. */
  major: boolean;
  /** Points covered by the station marker (line end/through points at this station). Regular stations: one point. */
  markerPoints: Vec2[];
  /** Marker outline (mm) used for pockets, rings and collision tests. */
  markerRadius: number;
}

export interface LayoutLine {
  id: string;
  ref: string;
  name: string;
  color: Hex;
  /** Smoothed centreline polylines (mm), one per chain (see pieces). */
  chains: LayoutChain[];
}

export interface LayoutChain {
  id: string;
  /** Smoothed centreline polyline in mm. */
  points: Vec2[];
  /** How each end terminates: inside a station marker, or a straight cut (bed split). */
  startEnd: 'station' | 'cut';
  endEnd: 'station' | 'cut';
  startStation?: string;
  endStation?: string;
  /** Regular stations that lie along the chain (holes for their dots). */
  throughStations: { id: string; point: Vec2 }[];
  corridorId: string;
}

export interface LayoutLabel {
  stationId: string;
  text: string;
  /** Sequential label number (1-based) used for IDs. */
  n: number;
  /** true when this label is a tape pocket rather than printed letters. */
  tape?: boolean;
  /** Lower-left corner of the label box in mm (before rotation). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees (counter-clockwise) about (x, y). */
  angle: number;
  /** Font size (em) in mm. */
  fontSize: number;
  /** Baseline origin of the text inside the box (box-local, before rotation). */
  textOrigin: Vec2;
}

export interface MapLayout {
  width: number;
  height: number;
  stations: LayoutStation[];
  lines: LayoutLine[];
  labels: LayoutLabel[];
  /** Stations for which no collision-free label spot was found. */
  unlabeled: string[];
  /** mm per layout unit (metres) — informational. */
  scale: number;
}

/* ----------------------------- Design ----------------------------- */

export interface FarmPrinter {
  /** Slicer profile id, e.g. 'bambu-a1-mini', 'bambu-p1s', 'ultimaker-s3'. */
  printerId: string;
  count: number;
  /** Bed size of this printer (mm). */
  bed: { x: number; y: number };
  /** Relative print-time factor vs. the sliced estimate (1 = as sliced). */
  speedFactor?: number;
}

export type BaseStyle = 'tiles' | 'none';
export type LabelPolicy = 'all' | 'major' | 'none';
/** print: raised 3D-printed letters · tape: pockets sized for label-maker tape · auto: tape when the text is too small to print well. */
export type LabelMode = 'print' | 'tape' | 'auto';

export interface DesignParams {
  /** Target wall-art width. */
  widthMm: number;
  /** Optional height; derived from the map aspect ratio when omitted. */
  heightMm?: number;
  /** Printer bed (usable) size used for plates and tiles (the smallest bed in the farm unless overridden). */
  bed: { x: number; y: number };
  /** Print farm: printers available in parallel. Plates are packed to fit every printer in the farm. */
  farm: FarmPrinter[];
  /** Empty margin kept around parts on a plate. */
  bedMargin: number;
  /** Radial clearance between mating parts. */
  clearance: number;

  base: BaseStyle;
  baseThickness: number;
  grooveDepth: number;
  /** Extra depth of station pockets below the groove floor. */
  pocketExtraDepth: number;
  keyholes: boolean;

  lineWidth: number;
  /** Height of the line ribbon above the base surface. */
  lineHeight: number;
  /** Gap between parallel lines. */
  lineGap: number;
  /** Corner fillet radius as a multiple of lineWidth. */
  cornerRadiusFactor: number;

  /** Regular (single-line) station dot diameter as fraction of lineWidth. */
  dotFactor: number;
  /** Major station ring width. */
  ringWidth: number;
  /** How far station markers stand above the line top. */
  stationRelief: number;

  labels: LabelPolicy;
  labelFontSize: number;
  labelPlateThickness: number;
  labelTextHeight: number;
  /** Prefer English names when available. */
  labelLanguage: 'local' | 'en';
  labelAllowRotated: boolean;
  labelMode: LabelMode;
  /** Label-maker tape width (mm) used in tape mode: 6, 9, 12, 18, 24. */
  tapeWidth: number;
  /** Engrave piece IDs on the underside of tiles, line pieces and label plates. */
  engraveIds: boolean;
  /** Friction lugs on part feet so pieces snap into grooves/pockets without glue. */
  snapFit: boolean;
  /** Interference per side (mm) of the lugs beyond the nominal clearance. */
  snapInterference: number;

  colors: {
    base: Hex;
    dot: Hex;
    plug: Hex;
    ring: Hex;
    labelText: Hex;
    labelPlate: Hex;
  };

  layout: LayoutOptions;

  /** Mesh quality: 'print' for output, 'preview' for lighter meshes. */
  quality: 'print' | 'preview';
}

/* ----------------------------- Geometry output ----------------------------- */

export interface MeshData {
  /** xyz triples. */
  positions: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
}

export type PartKind = 'tile' | 'line' | 'plug' | 'ring' | 'dot' | 'label' | 'labelText' | 'labelPlate';

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  color: Hex;
  colorName: string;
  /** Group key for multi-color sub-parts printed as one object (label plate + text). */
  group?: string;
  /** Mesh in assembled map coordinates (mm). */
  mesh: MeshData;
  /** Lighter mesh for on-screen / AR use (same shape, coarser curves). */
  previewMesh?: MeshData;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  volumeMm3: number;
  triangles: number;
  /** Which line this part belongs to, when applicable. */
  lineId?: string;
  stationId?: string;
  /** z offset to lay the part flat on the plate (part bottom -> 0). */
  printZ: number;
  /** Short human ID engraved on the part and used in the assembly plan (e.g. "1-03", "R2C1", "N017"). */
  tag?: string;
}

export interface PlateItem {
  partId: string;
  /** Plate position (mm) of the item's footprint bbox-min after rotation. */
  x: number;
  y: number;
  /** Rotation about z in degrees, applied about the origin before translating. */
  rotation: number;
  /** Translation applied after rotation. */
  dx: number;
  dy: number;
}

export interface Plate {
  id: string;
  name: string;
  color: Hex;
  colorName: string;
  /** For two-color label plates: second color that starts at this z (filament swap). */
  colorChange?: { color: Hex; colorName: string; atZ: number };
  bed: { x: number; y: number };
  items: PlateItem[];
  /** Fill ratio of the bed (bbox areas / bed area). */
  fill: number;
  volumeMm3: number;
}

export interface BuildStats {
  stations: number;
  majorStations: number;
  lines: number;
  labels: number;
  unlabeled: number;
  parts: number;
  plates: number;
  triangles: number;
  volumeMm3: number;
  estimatedGrams: number;
  buildMs: number;
}

export interface BuildResult {
  network: MetroNetwork;
  layout: MapLayout;
  params: DesignParams;
  parts: Part[];
  plates: Plate[];
  stats: BuildStats;
  warnings: string[];
}

export type ProgressFn = (stage: string, fraction: number, detail?: string) => void;
