/**
 * Printer and process profiles for the built-in FDM slicer.
 *
 * Start/end G-code may contain the placeholders `{bedTemp}`, `{nozzleTemp}` and
 * `{firstLayerNozzleTemp}`; the G-code writer substitutes them from the process profile.
 */

export interface PrinterProfile {
  id: string;
  name: string;
  /** Build volume in mm. */
  bed: { x: number; y: number; z: number };
  /** Nozzle diameter in mm. */
  nozzle: number;
  /** Filament diameter in mm (1.75 or 2.85). */
  filamentDiameter: number;
  flavor: 'bambu' | 'ultimaker' | 'marlin';
  /** Maximum print speed in mm/s (feedrates are capped to this). */
  maxSpeed: number;
  /** Acceleration in mm/s^2, used for the time estimate. */
  accel: number;
  /** Maximum travel speed in mm/s. */
  travelSpeed: number;
  startGcode: string;
  endGcode: string;
  /** Optional G-code emitted at every layer change. */
  layerChangeGcode?: string;
  /** File extension including the dot. */
  gcodeExtension: string;
}

export interface ProcessProfile {
  layerHeight: number;
  firstLayerHeight: number;
  lineWidth: number;
  perimeters: number;
  topLayers: number;
  bottomLayers: number;
  /** 0..100. 0 disables sparse infill, >= 100 makes every layer solid. */
  infillPercent: number;
  infillPattern: 'grid' | 'lines' | 'gyroidish';
  /** Speeds in mm/s. */
  perimeterSpeed: number;
  infillSpeed: number;
  topSolidSpeed: number;
  firstLayerSpeed: number;
  travelSpeed: number;
  /** Retraction length in mm (0 disables retraction). */
  retractLength: number;
  /** Retraction speed in mm/s. */
  retractSpeed: number;
  /** Z-hop on retracted travels in mm (0 disables). */
  zHop: number;
  nozzleTemp: number;
  bedTemp: number;
  firstLayerNozzleTemp: number;
  /** Part cooling fan 0..100, switched on from the third layer. */
  fanPercent: number;
  skirtLoops: number;
  /** Distance from the skirt to the parts in mm. */
  skirtDistance: number;
  /** Layers faster than this (seconds) are slowed down. */
  minLayerTime: number;
  extrusionMultiplier: number;
}

/* ----------------------------- Printers ----------------------------- */

/**
 * Bambu Lab A1 mini. The start G-code is a deliberately short, safe sequence rather
 * than the official multi-hundred-line machine macro: home, heat, purge along the
 * front edge. The resulting file can be sent directly to the printer or imported into
 * Bambu Studio via "File > Import > Import G-code" and printed from there.
 */
const BAMBU_A1_MINI: PrinterProfile = {
  id: 'bambu-a1-mini',
  name: 'Bambu Lab A1 mini',
  bed: { x: 180, y: 180, z: 180 },
  nozzle: 0.4,
  filamentDiameter: 1.75,
  flavor: 'bambu',
  maxSpeed: 300,
  accel: 5000,
  travelSpeed: 300,
  gcodeExtension: '.gcode',
  startGcode: [
    '; MetroCAD start G-code (Bambu Lab A1 mini, simplified)',
    'M140 S{bedTemp} ; bed temperature',
    'M104 S{firstLayerNozzleTemp} ; nozzle temperature (no wait)',
    'G90 ; absolute XYZ',
    'M82 ; absolute extrusion',
    'G28 ; home all axes',
    'M190 S{bedTemp} ; wait for bed',
    'M109 S{firstLayerNozzleTemp} ; wait for nozzle',
    'G92 E0',
    'G1 Z5 F3000',
    'G1 X10 Y1 F6000 ; purge line along the front edge',
    'G1 Z0.3 F3000',
    'G1 X170 E14 F1200',
    'G1 Y1.6 F3000',
    'G1 X15 E28 F1200',
    'G92 E0',
    'G1 Z2 F3000 ; lift before travelling to the part',
  ].join('\n'),
  endGcode: [
    '; MetroCAD end G-code',
    'M400 ; wait for moves to finish',
    'M104 S0 ; nozzle off',
    'M140 S0 ; bed off',
    'M107 ; fan off',
    'G91',
    'G1 Z10 F600 ; lift',
    'G90',
    'G1 X0 Y170 F6000 ; present the print',
    'M84 ; motors off',
  ].join('\n'),
};

/**
 * Ultimaker S3 (Griffin flavour). Heating, priming and cooldown are handled by the
 * printer using the ;START_OF_HEADER block that the G-code writer prepends, so the
 * start/end sequences stay minimal.
 */
const ULTIMAKER_S3: PrinterProfile = {
  id: 'ultimaker-s3',
  name: 'Ultimaker S3',
  bed: { x: 230, y: 190, z: 200 },
  nozzle: 0.4,
  filamentDiameter: 2.85,
  flavor: 'ultimaker',
  maxSpeed: 150,
  accel: 3000,
  travelSpeed: 200,
  gcodeExtension: '.gcode',
  startGcode: [
    '; MetroCAD start G-code (Ultimaker S3 - heating and priming are done by the printer from the header)',
    'G90',
    'M82',
    'M107',
    'G92 E0',
    'G0 F6000 Z2',
  ].join('\n'),
  endGcode: [
    '; MetroCAD end G-code',
    'M107',
    'G91',
    'G0 F600 Z2',
    'G90',
    'M104 S0',
    ';End of Gcode',
  ].join('\n'),
};

const GENERIC_MARLIN: PrinterProfile = {
  id: 'generic-marlin',
  name: 'Generic Marlin printer',
  bed: { x: 220, y: 220, z: 250 },
  nozzle: 0.4,
  filamentDiameter: 1.75,
  flavor: 'marlin',
  maxSpeed: 150,
  accel: 1500,
  travelSpeed: 150,
  gcodeExtension: '.gcode',
  startGcode: [
    '; MetroCAD start G-code (generic Marlin)',
    'M140 S{bedTemp}',
    'M104 S{firstLayerNozzleTemp}',
    'G90',
    'M82',
    'G28',
    'M190 S{bedTemp}',
    'M109 S{firstLayerNozzleTemp}',
    'G92 E0',
    'G1 Z5 F3000',
    'G1 X5 Y10 F5000 ; purge line along the left edge',
    'G1 Z0.3 F3000',
    'G1 Y150 E12 F1200',
    'G1 X5.5 F3000',
    'G1 Y20 E24 F1200',
    'G92 E0',
    'G1 Z2 F3000',
  ].join('\n'),
  endGcode: [
    '; MetroCAD end G-code',
    'M104 S0',
    'M140 S0',
    'M107',
    'G91',
    'G1 Z10 F600',
    'G90',
    'G1 X0 Y200 F5000',
    'M84',
  ].join('\n'),
};

export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  [BAMBU_A1_MINI.id]: BAMBU_A1_MINI,
  [ULTIMAKER_S3.id]: ULTIMAKER_S3,
  [GENERIC_MARLIN.id]: GENERIC_MARLIN,
};

export function getPrinterProfile(id: string): PrinterProfile {
  const p = PRINTER_PROFILES[id];
  if (!p) throw new Error(`Unknown printer profile "${id}" (known: ${Object.keys(PRINTER_PROFILES).join(', ')})`);
  return p;
}

/* ----------------------------- Processes ----------------------------- */

/** PLA, 0.2 mm layers, light infill: as little material and time as a sturdy wall piece needs. */
export const MINIMAL_MATERIAL: ProcessProfile = {
  layerHeight: 0.2,
  firstLayerHeight: 0.2,
  lineWidth: 0.42,
  perimeters: 2,
  topLayers: 3,
  bottomLayers: 2,
  infillPercent: 8,
  infillPattern: 'grid',
  perimeterSpeed: 60,
  infillSpeed: 120,
  topSolidSpeed: 40,
  firstLayerSpeed: 30,
  travelSpeed: 200,
  retractLength: 0.8, // direct drive (Bambu)
  retractSpeed: 35,
  zHop: 0.2,
  nozzleTemp: 215,
  bedTemp: 60,
  firstLayerNozzleTemp: 215,
  fanPercent: 100, // enabled from the third layer
  skirtLoops: 1,
  skirtDistance: 3,
  minLayerTime: 8,
  extrusionMultiplier: 1,
};

/** Adapts a process profile to a printer: Bowden retraction and gentler speeds for the Ultimaker S3. */
export function processFor(printer: PrinterProfile, base: ProcessProfile = MINIMAL_MATERIAL): ProcessProfile {
  const p: ProcessProfile = { ...base };
  if (printer.flavor === 'ultimaker') {
    p.retractLength = 6.5; // long Bowden tube
    p.retractSpeed = 25;
    p.perimeterSpeed = Math.min(p.perimeterSpeed, 45);
    p.infillSpeed = Math.min(p.infillSpeed, 70);
    p.topSolidSpeed = Math.min(p.topSolidSpeed, 35);
    p.zHop = Math.min(p.zHop, 0.2);
  }
  p.perimeterSpeed = Math.min(p.perimeterSpeed, printer.maxSpeed);
  p.infillSpeed = Math.min(p.infillSpeed, printer.maxSpeed);
  p.topSolidSpeed = Math.min(p.topSolidSpeed, printer.maxSpeed);
  p.firstLayerSpeed = Math.min(p.firstLayerSpeed, printer.maxSpeed);
  p.travelSpeed = Math.min(p.travelSpeed, printer.travelSpeed);
  return p;
}
