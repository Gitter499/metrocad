/** 2D SVG rendering of a MapLayout (preview, paper template, README images). */
import type { TileGrid } from './geometry.js';
import type { DesignParams, MapLayout } from './types.js';
import { roundedHull } from './layout/index.js';

export interface SvgOptions {
  /** Base64 TTF to embed as @font-face (keeps text identical to the printed glyphs). */
  fontDataUrl?: string;
  fontFamily?: string;
  /** Draw as a 1:1 alignment template (outlines only, crop marks, cut-lines for tiles). */
  template?: boolean;
  title?: string;
  /** Tile grid (mm) to draw seams in template mode. */
  tiles?: TileGrid;
  background?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number) => (Math.round(n * 100) / 100).toString();

export function renderSvg(layout: MapLayout, params: DesignParams, opts: SvgOptions = {}): string {
  const W = layout.width, H = layout.height;
  const fam = opts.fontFamily ?? 'Inter';
  const bg = opts.background ?? (opts.template ? '#ffffff' : params.colors.base);
  // y-up mm -> SVG y-down
  const Y = (y: number) => H - y;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">`);
  if (opts.fontDataUrl) parts.push(`<defs><style>@font-face{font-family:'${fam}';src:url(${opts.fontDataUrl}) format('truetype');font-weight:700;}</style></defs>`);
  if (opts.title) parts.push(`<title>${esc(opts.title)}</title>`);
  parts.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="${bg}"/>`);
  if (opts.template && opts.tiles?.cells && opts.tiles.outline) {
    for (const c of opts.tiles.cells) {
      const d = c.polygon.map((ring) => ring.map((q, i) => `${i ? 'L' : 'M'}${f(q[0])} ${f(Y(q[1]))}`).join(' ') + 'Z').join(' ');
      parts.push(`<path d="${d}" fill="none" stroke="#bbb" stroke-width="0.3" stroke-dasharray="4 3" fill-rule="evenodd"/>`);
      parts.push(`<text x="${f(c.x + c.w / 2)}" y="${f(Y(c.y + c.h / 2))}" text-anchor="middle" font-size="4" fill="#bbb" font-family="sans-serif">${c.tag}</text>`);
    }
  } else if (opts.template && opts.tiles) {
    const t = opts.tiles;
    for (let c = 0; c <= t.cols; c++) parts.push(`<line x1="${f(t.ox + c * t.w)}" y1="0" x2="${f(t.ox + c * t.w)}" y2="${f(H)}" stroke="#bbb" stroke-width="0.3" stroke-dasharray="4 3"/>`);
    for (let r = 0; r <= t.rows; r++) parts.push(`<line x1="0" y1="${f(Y(t.oy + r * t.h))}" x2="${f(W)}" y2="${f(Y(t.oy + r * t.h))}" stroke="#bbb" stroke-width="0.3" stroke-dasharray="4 3"/>`);
  }
  // Lines
  parts.push(`<g fill="none" stroke-linecap="${opts.template ? 'butt' : 'round'}" stroke-linejoin="round">`);
  for (const ln of layout.lines) {
    for (const ch of ln.chains) {
      const d = ch.points.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(Y(p[1]))}`).join(' ');
      if (opts.template) parts.push(`<path d="${d}" stroke="${ln.color}" stroke-width="${f(params.lineWidth)}" opacity="0.5"/>`);
      else parts.push(`<path d="${d}" stroke="${ln.color}" stroke-width="${f(params.lineWidth)}"/>`);
    }
  }
  parts.push('</g>');
  // Stations
  for (const st of layout.stations) {
    if (st.major) {
      const hull = roundedHull(st.markerPoints, st.markerRadius, 24);
      const d = hull.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(Y(p[1]))}`).join(' ') + 'Z';
      parts.push(`<path d="${d}" fill="${params.colors.plug}" stroke="${params.colors.ring}" stroke-width="${f(params.ringWidth)}"/>`);
    } else {
      parts.push(`<circle cx="${f(st.x)}" cy="${f(Y(st.y))}" r="${f(st.markerRadius)}" fill="${params.colors.dot}"/>`);
    }
  }
  // Labels
  parts.push(`<g font-family="'${fam}', Inter, 'Helvetica Neue', Arial, sans-serif" font-weight="700" fill="${opts.template ? '#333' : params.colors.labelText}">`);
  for (const lb of layout.labels) {
    const ox = lb.x + lb.textOrigin[0], oy = lb.y + lb.textOrigin[1];
    // rotate about the box origin (lb.x, lb.y); SVG rotation is clockwise-positive in y-down space.
    const tr = lb.angle ? ` transform="rotate(${f(-lb.angle)} ${f(lb.x)} ${f(Y(lb.y))})"` : '';
    parts.push(`<text x="${f(ox)}" y="${f(Y(oy))}" font-size="${f(lb.fontSize)}"${tr}>${esc(lb.text)}</text>`);
  }
  parts.push('</g>');
  if (opts.template) {
    parts.push(`<text x="4" y="${f(H - 3)}" font-size="4" fill="#999" font-family="sans-serif">MetroCAD 1:1 template — ${f(W)} × ${f(H)} mm — print at 100% scale, tape to wall, align tiles/parts</text>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}
