/** Binary STL writer. */
import type { MeshData } from '../types.js';

export interface StlTransform { dx?: number; dy?: number; dz?: number; rotationDeg?: number }

export function meshToStl(mesh: MeshData, name = 'metrocad', t: StlTransform = {}): Uint8Array {
  const tri = mesh.indices.length / 3;
  const buf = new ArrayBuffer(84 + tri * 50);
  const dv = new DataView(buf);
  const header = new TextEncoder().encode(`MetroCAD ${name}`.slice(0, 80));
  new Uint8Array(buf, 0, 80).set(header);
  dv.setUint32(80, tri, true);
  const p = mesh.positions;
  const c = Math.cos(((t.rotationDeg ?? 0) * Math.PI) / 180), s = Math.sin(((t.rotationDeg ?? 0) * Math.PI) / 180);
  const dx = t.dx ?? 0, dy = t.dy ?? 0, dz = t.dz ?? 0;
  const v = (i: number): [number, number, number] => {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    return [x * c - y * s + dx, x * s + y * c + dy, z + dz];
  };
  let o = 84;
  for (let i = 0; i < tri; i++) {
    const a = v(mesh.indices[i * 3]), b = v(mesh.indices[i * 3 + 1]), cc = v(mesh.indices[i * 3 + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = cc[0] - a[0], wy = cc[1] - a[1], wz = cc[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (const q of [a, b, cc]) { o += 12; dv.setFloat32(o, q[0], true); dv.setFloat32(o + 4, q[1], true); dv.setFloat32(o + 8, q[2], true); }
    o += 12;
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

/** Parse a binary STL (for tests). */
export function parseStl(data: Uint8Array): { triangles: number; positions: Float32Array } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = dv.getUint32(80, true);
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return { triangles: n, positions: pos };
}
