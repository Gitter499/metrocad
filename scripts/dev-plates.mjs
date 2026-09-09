// Visualise packed plates from a manifest: node scripts/dev-plates.mjs out-dir plates.svg
import fs from 'node:fs';
import path from 'node:path';
import { parseStl } from '@metrocad/core';
const [dir, out] = process.argv.slice(2);
const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const cols = 6, cell = 200, pad = 10;
const plates = man.plates;
const rows = Math.ceil(plates.length / cols);
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${cols * (cell + pad)}" height="${rows * (cell + pad) + 20}" viewBox="0 0 ${cols * (cell + pad)} ${rows * (cell + pad) + 20}"><rect width="100%" height="100%" fill="#222"/>`];
plates.forEach((pl, i) => {
  const ox = (i % cols) * (cell + pad) + pad / 2, oy = Math.floor(i / cols) * (cell + pad) + pad / 2 + 14;
  const sx = cell / Math.max(man.params.bed.x, man.params.bed.y);
  svg.push(`<rect x="${ox}" y="${oy}" width="${man.params.bed.x * sx}" height="${man.params.bed.y * sx}" fill="#333" stroke="#777"/>`);
  svg.push(`<text x="${ox}" y="${oy - 3}" fill="#ccc" font-size="9" font-family="sans-serif">${i + 1}. ${pl.name} (${(pl.fill * 100).toFixed(0)}%)</text>`);
  const stl = parseStl(fs.readFileSync(path.join(dir, pl.files[1])));
  const P = stl.positions;
  const tris = [];
  for (let t = 0; t < stl.triangles; t++) {
    const pts = [];
    for (let k = 0; k < 3; k++) pts.push(`${(ox + P[t * 9 + k * 3] * sx).toFixed(1)},${(oy + (man.params.bed.y - P[t * 9 + k * 3 + 1]) * sx).toFixed(1)}`);
    tris.push(`<polygon points="${pts.join(' ')}"/>`);
  }
  svg.push(`<g fill="${pl.color}" stroke="${pl.color}" stroke-width="0.2">${tris.join('')}</g>`);
});
svg.push('</svg>');
fs.writeFileSync(out, svg.join('\n'));
console.log('plates', plates.length);
