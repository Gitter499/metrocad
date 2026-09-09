/** Minimal GLB (glTF 2.0 binary) writer: one node per part with flat-shaded geometry and a per-colour material. */
import type { Part } from '../types.js';

export interface GlbOptions {
  /** Scale factor from mm to output units (glTF is metres): default 0.001. */
  scale?: number;
  /** Rotate so the map hangs on a vertical wall facing +Z (map y -> world y, extrusion -> +z). Default true. */
  upright?: boolean;
  /** Center the model on the origin (x,y) and put its back face at z=0. Default true. */
  center?: boolean;
  /** Merge parts by colour into fewer meshes (smaller files, faster AR). Default true. */
  mergeByColor?: boolean;
  bounds?: { width: number; height: number };
  roughness?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  // glTF baseColorFactor is linear
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number];
}

export function partsToGlb(parts: Part[], opts: GlbOptions = {}): Uint8Array {
  const scale = opts.scale ?? 0.001;
  const upright = opts.upright ?? true;
  const center = opts.center ?? true;
  const merge = opts.mergeByColor ?? true;
  let cx = 0, cy = 0;
  if (center) {
    if (opts.bounds) { cx = opts.bounds.width / 2; cy = opts.bounds.height / 2; }
    else {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of parts) { minx = Math.min(minx, p.bbox.min[0]); miny = Math.min(miny, p.bbox.min[1]); maxx = Math.max(maxx, p.bbox.max[0]); maxy = Math.max(maxy, p.bbox.max[1]); }
      cx = (minx + maxx) / 2; cy = (miny + maxy) / 2;
    }
  }
  // Group
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    const k = merge ? p.color.toLowerCase() : p.id;
    const g = groups.get(k) ?? []; g.push(p); groups.set(k, g);
  }
  const materials: any[] = [];
  const matIndex = new Map<string, number>();
  const meshes: any[] = [];
  const nodes: any[] = [];
  const accessors: any[] = [];
  const bufferViews: any[] = [];
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const pushView = (data: Uint8Array, target: number) => {
    const pad = (4 - (data.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, target });
    chunks.push(data);
    if (pad) chunks.push(new Uint8Array(pad));
    byteOffset += data.byteLength + pad;
    return bufferViews.length - 1;
  };
  for (const [key, group] of groups) {
    const color = group[0].color.toLowerCase();
    let mat = matIndex.get(color);
    if (mat === undefined) {
      mat = materials.length; matIndex.set(color, mat);
      const [r, g, b] = hexToRgb(color);
      materials.push({ name: group[0].colorName, pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: opts.roughness ?? 0.55 }, doubleSided: false });
    }
    // Flat-shaded, unindexed positions + normals
    let triCount = 0;
    for (const p of group) triCount += p.mesh.indices.length / 3;
    const pos = new Float32Array(triCount * 9), nor = new Float32Array(triCount * 9);
    let o = 0;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of group) {
      const P = p.mesh.positions, I = p.mesh.indices;
      for (let t = 0; t < I.length; t += 3) {
        const v: number[][] = [];
        for (let k = 0; k < 3; k++) {
          const i = I[t + k];
          let x = (P[i * 3] - cx) * scale, y = (P[i * 3 + 1] - cy) * scale, z = P[i * 3 + 2] * scale;
          if (!upright) { /* keep */ } // upright: map plane = XY, extrusion +Z (already wall-facing when viewer looks down -Z)
          v.push([x, y, z]);
        }
        const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2];
        const wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 3; k++) {
          pos[o] = v[k][0]; pos[o + 1] = v[k][1]; pos[o + 2] = v[k][2];
          nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
          for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], v[k][a]); mx[a] = Math.max(mx[a], v[k][a]); }
          o += 3;
        }
      }
    }
    const pv = pushView(new Uint8Array(pos.buffer), 34962);
    const nv = pushView(new Uint8Array(nor.buffer), 34962);
    accessors.push({ bufferView: pv, componentType: 5126, count: triCount * 3, type: 'VEC3', min: mn, max: mx });
    accessors.push({ bufferView: nv, componentType: 5126, count: triCount * 3, type: 'VEC3' });
    meshes.push({ name: key, primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: mat, mode: 4 }] });
    nodes.push({ name: group.length === 1 ? group[0].name : `${group[0].colorName} (${group.length} parts)`, mesh: meshes.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: 'MetroCAD' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const bin = concat(chunks);
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;
  let off = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(off, bin.length, true); dv.setUint32(off + 4, 0x004e4942, true);
  out.set(bin, off + 8);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
