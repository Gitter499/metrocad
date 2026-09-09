/** Minimal 3MF writer (core spec + basematerials) with per-object colours and build transforms. */
import { zipSync, strToU8 } from 'fflate';
import type { MeshData } from '../types.js';

export interface ThreeMfObject {
  name: string;
  mesh: MeshData;
  color: string; // #rrggbb
  /** Transform applied at build: rotation (deg about z) then translation (mm). */
  transform?: { dx: number; dy: number; dz: number; rotationDeg: number };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');

export function write3mf(objects: ThreeMfObject[], title = 'MetroCAD'): Uint8Array {
  const colors: string[] = [];
  const colorIdx = (c: string) => { let i = colors.indexOf(c); if (i < 0) { i = colors.length; colors.push(c); } return i; };
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  parts.push(`<metadata name="Title">${esc(title)}</metadata><metadata name="Application">MetroCAD</metadata>`);
  const objXml: string[] = [];
  const items: string[] = [];
  objects.forEach((o, i) => {
    const id = i + 2; // 1 reserved for basematerials
    const pid = colorIdx(o.color.toUpperCase());
    const p = o.mesh.positions, idx = o.mesh.indices;
    const verts: string[] = [];
    for (let v = 0; v < p.length; v += 3) verts.push(`<vertex x="${f(p[v])}" y="${f(p[v + 1])}" z="${f(p[v + 2])}"/>`);
    const tris: string[] = [];
    for (let t = 0; t < idx.length; t += 3) tris.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"/>`);
    objXml.push(`<object id="${id}" name="${esc(o.name)}" type="model" pid="1" pindex="${pid}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`);
    const tr = o.transform ?? { dx: 0, dy: 0, dz: 0, rotationDeg: 0 };
    const c = Math.cos((tr.rotationDeg * Math.PI) / 180), s = Math.sin((tr.rotationDeg * Math.PI) / 180);
    // 3MF transform: 12 numbers, row-major 3x4 "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (rows are basis vectors)
    const m = [c, s, 0, -s, c, 0, 0, 0, 1, tr.dx, tr.dy, tr.dz].map(f).join(' ');
    items.push(`<item objectid="${id}" transform="${m}"/>`);
  });
  parts.push('<resources>');
  parts.push(`<basematerials id="1">${colors.map((c, i) => `<base name="${esc(colorNameOf(c, i))}" displaycolor="${c}FF"/>`).join('')}</basematerials>`);
  parts.push(objXml.join(''));
  parts.push('</resources>');
  parts.push(`<build>${items.join('')}</build>`);
  parts.push('</model>');
  const model = parts.join('\n');
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 });
}

function colorNameOf(hex: string, i: number): string { return `Color ${i + 1} ${hex}`; }
