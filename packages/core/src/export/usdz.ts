/**
 * USDZ writer for iOS AR Quick Look (no app needed). Produces an uncompressed, 64-byte-aligned zip
 * containing a USDA scene with Apple's preliminary anchoring set to a *vertical* plane (wall).
 */
import type { Part } from '../types.js';

export interface UsdzOptions {
  bounds?: { width: number; height: number };
  /** 'wall' anchors to vertical planes (Quick Look), 'floor' to horizontal, 'none' leaves the default. */
  anchoring?: 'wall' | 'floor' | 'none';
  roughness?: number;
}

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(5).replace(/\.?0+$/, ''));

function srgbToLinear(c: number) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexToLinear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(srgbToLinear) as [number, number, number];
}

export function partsToUsdz(parts: Part[], opts: UsdzOptions = {}): Uint8Array {
  const anchoring = opts.anchoring ?? 'wall';
  let cx = 0, cy = 0;
  if (opts.bounds) { cx = opts.bounds.width / 2; cy = opts.bounds.height / 2; }
  else {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of parts) { minx = Math.min(minx, p.bbox.min[0]); miny = Math.min(miny, p.bbox.min[1]); maxx = Math.max(maxx, p.bbox.max[0]); maxy = Math.max(maxy, p.bbox.max[1]); }
    cx = (minx + maxx) / 2; cy = (miny + maxy) / 2;
  }
  const groups = new Map<string, Part[]>();
  for (const p of parts) { const k = p.color.toLowerCase(); const g = groups.get(k) ?? []; g.push(p); groups.set(k, g); }

  const lines: string[] = [];
  lines.push('#usda 1.0');
  lines.push('(');
  lines.push('    customLayerData = { string creator = "MetroCAD" }');
  lines.push('    defaultPrim = "MetroMap"');
  lines.push('    metersPerUnit = 1');
  lines.push('    upAxis = "Y"');
  lines.push(')');
  lines.push('');
  const anchorApi = anchoring === 'none' ? '' : ' (\n    prepend apiSchemas = ["Preliminary_AnchoringAPI"]\n)';
  lines.push(`def Xform "MetroMap"${anchorApi}`);
  lines.push('{');
  if (anchoring !== 'none') {
    lines.push('    token preliminary:anchoring:type = "plane"');
    lines.push(`    token preliminary:planeAnchoring:alignment = "${anchoring === 'wall' ? 'vertical' : 'horizontal'}"`);
  }
  // Materials
  lines.push('    def Scope "Materials"');
  lines.push('    {');
  let mi = 0;
  const matName = new Map<string, string>();
  for (const [color] of groups) {
    const name = `Mat${mi++}`;
    matName.set(color, name);
    const [r, g, b] = hexToLinear(color);
    lines.push(`        def Material "${name}"`);
    lines.push('        {');
    lines.push(`            token outputs:surface.connect = </MetroMap/Materials/${name}/Shader.outputs:surface>`);
    lines.push('            def Shader "Shader"');
    lines.push('            {');
    lines.push('                uniform token info:id = "UsdPreviewSurface"');
    lines.push(`                color3f inputs:diffuseColor = (${f(r)}, ${f(g)}, ${f(b)})`);
    lines.push('                float inputs:metallic = 0');
    lines.push(`                float inputs:roughness = ${f(opts.roughness ?? 0.6)}`);
    lines.push('                token outputs:surface');
    lines.push('            }');
    lines.push('        }');
  }
  lines.push('    }');
  // Meshes (mm -> m; map plane XY, extrusion +Z; for a vertical anchor, +Z faces the viewer)
  let gi = 0;
  for (const [color, group] of groups) {
    // Indexed points (shared vertices) with one normal per face keeps the ASCII file small.
    const pts: string[] = [];
    const idxs: string[] = [];
    const nrm: string[] = [];
    let triCount = 0;
    let base = 0;
    for (const p of group) {
      const M = p.previewMesh ?? p.mesh;
      const P = M.positions, I = M.indices;
      const n = P.length / 3;
      for (let i = 0; i < n; i++) pts.push(`(${f((P[i * 3] - cx) / 1000)}, ${f((P[i * 3 + 1] - cy) / 1000)}, ${f(P[i * 3 + 2] / 1000)})`);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
        const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        idxs.push(String(base + a), String(base + b), String(base + c));
        nrm.push(`(${f(nx)}, ${f(ny)}, ${f(nz)})`);
        triCount++;
      }
      base += n;
    }
    const name = `Group${gi++}`;
    lines.push(`    def Mesh "${name}" (prepend apiSchemas = ["MaterialBindingAPI"])`);
    lines.push('    {');
    lines.push(`        uniform bool doubleSided = 0`);
    lines.push(`        int[] faceVertexCounts = [${new Array(triCount).fill('3').join(', ')}]`);
    lines.push(`        int[] faceVertexIndices = [${idxs.join(', ')}]`);
    lines.push(`        point3f[] points = [${pts.join(', ')}]`);
    lines.push(`        normal3f[] normals = [${nrm.join(', ')}] (interpolation = "uniform")`);
    lines.push(`        rel material:binding = </MetroMap/Materials/${matName.get(color)}>`);
    lines.push('        uniform token subdivisionScheme = "none"');
    lines.push('    }');
  }
  lines.push('}');
  const usda = new TextEncoder().encode(lines.join('\n'));
  return zipStoreAligned([{ name: 'metromap.usda', data: usda }]);
}

/** Uncompressed zip with each file's data 64-byte aligned (USDZ requirement). */
export function zipStoreAligned(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    // local header is 30 + name + extra; pad extra so data starts at a 64-byte boundary
    const headerLen = 30 + nameBytes.length;
    let extraLen = (64 - ((offset + headerLen) % 64)) % 64;
    if (extraLen > 0 && extraLen < 4) extraLen += 64;
    const extra = new Uint8Array(extraLen);
    if (extraLen >= 4) { const dv = new DataView(extra.buffer); dv.setUint16(0, 0x1986, true); dv.setUint16(2, extraLen - 4, true); }
    const local = new Uint8Array(headerLen + extraLen);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, file.data.length, true); dv.setUint32(22, file.data.length, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, extraLen, true);
    local.set(nameBytes, 30); local.set(extra, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, file.data.length, true); cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, file.data);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of [...locals, ...centrals, end]) { out.set(c, o); o += c.length; }
  return out;
}

let CRC_TABLE: Uint32Array | undefined;
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
