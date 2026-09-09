/** Font handling: measure text and produce glyph outline polygons (mm, y-up) via opentype.js. */
import * as opentypeNs from 'opentype.js';
import type { Font, Glyph } from 'opentype.js';

// Works with both the CJS build (Node) and the ESM build (bundlers).
const parseFont: typeof opentypeNs.parse = (opentypeNs as any).parse ?? (opentypeNs as any).default?.parse;
import type { Vec2 } from './types.js';

export interface TextMetrics {
  /** Advance width in mm. */
  width: number;
  /** Outline bbox in mm relative to the baseline origin. */
  minX: number; minY: number; maxX: number; maxY: number;
}

export interface TextOptions {
  /** Extra tracking as a fraction of em (0.02 = 2%). */
  tracking?: number;
  /** Max segment length used to flatten curves (mm). */
  flatness?: number;
}

export class TextFont {
  readonly font: Font;
  readonly name: string;
  private glyphCache = new Map<string, Glyph>();

  constructor(font: Font, name = 'font') {
    this.font = font;
    this.name = name;
  }

  static fromBuffer(buf: ArrayBuffer | Uint8Array, name?: string): TextFont {
    const ab = buf instanceof Uint8Array ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
    const font = parseFont(ab);
    const fam = (font.names as any)?.fontFamily?.en ?? name ?? 'font';
    const sub = (font.names as any)?.fontSubfamily?.en ?? '';
    return new TextFont(font, name ?? `${fam} ${sub}`.trim());
  }

  private glyph(ch: string): Glyph {
    let g = this.glyphCache.get(ch);
    if (!g) { g = this.font.charToGlyph(ch); this.glyphCache.set(ch, g); }
    return g;
  }

  /** True when every non-space character has a real glyph. */
  canRender(text: string): boolean {
    for (const ch of text) {
      if (/\s/.test(ch)) continue;
      const g = this.glyph(ch);
      if (!g || g.index === 0) return false;
    }
    return true;
  }

  /** Characters lacking glyphs. */
  missingChars(text: string): string[] {
    const out: string[] = [];
    for (const ch of text) if (!/\s/.test(ch) && this.glyph(ch).index === 0 && !out.includes(ch)) out.push(ch);
    return out;
  }

  /** Lay out glyphs: returns per-glyph x positions and the total advance (mm). */
  private layout(text: string, size: number, tracking = 0): { glyphs: Glyph[]; xs: number[]; advance: number } {
    const scale = size / this.font.unitsPerEm;
    const glyphs: Glyph[] = [];
    const xs: number[] = [];
    let x = 0;
    let prev: Glyph | undefined;
    for (const ch of text) {
      const g = this.glyph(ch);
      if (prev) {
        try { x += this.font.getKerningValue(prev, g) * scale; } catch { /* ignore */ }
        x += tracking * size;
      }
      glyphs.push(g);
      xs.push(x);
      x += (g.advanceWidth ?? this.font.unitsPerEm * 0.5) * scale;
      prev = g;
    }
    return { glyphs, xs, advance: x };
  }

  measure(text: string, size: number, opts: TextOptions = {}): TextMetrics {
    const { glyphs, xs, advance } = this.layout(text, size, opts.tracking ?? 0);
    const scale = size / this.font.unitsPerEm;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    glyphs.forEach((g, i) => {
      const bb = g.getBoundingBox();
      if (bb.x1 === bb.x2 && bb.y1 === bb.y2) return; // space
      minX = Math.min(minX, xs[i] + bb.x1 * scale);
      maxX = Math.max(maxX, xs[i] + bb.x2 * scale);
      minY = Math.min(minY, bb.y1 * scale);
      maxY = Math.max(maxY, bb.y2 * scale);
    });
    if (!isFinite(minX)) { minX = 0; maxX = advance; minY = 0; maxY = size * 0.7; }
    return { width: advance, minX, minY, maxX, maxY };
  }

  /** Cap height in mm for a given em size. */
  capHeight(size: number): number {
    const os2 = (this.font.tables as any)?.os2;
    const cap = os2?.sCapHeight ?? this.font.unitsPerEm * 0.7;
    return (cap * size) / this.font.unitsPerEm;
  }

  /**
   * Glyph outlines as closed polygons in mm with y up, baseline at y=0, starting at x=0.
   * Uses the font's nonzero winding; consumers should build a NonZero cross-section.
   */
  outlines(text: string, size: number, opts: TextOptions = {}): Vec2[][] {
    const { glyphs, xs } = this.layout(text, size, opts.tracking ?? 0);
    const flat = opts.flatness ?? 0.15;
    const polys: Vec2[][] = [];
    glyphs.forEach((g, i) => {
      const path = g.getPath(xs[i], 0, size);
      let cur: Vec2[] | null = null;
      const last = (): Vec2 => cur![cur!.length - 1];
      for (const c of path.commands) {
        switch (c.type) {
          case 'M':
            cur = [[c.x, -c.y]]; polys.push(cur); break;
          case 'L':
            cur!.push([c.x, -c.y]); break;
          case 'Q': {
            const [x0, y0] = last();
            const x1 = c.x1, y1 = -c.y1, x2 = c.x, y2 = -c.y;
            const n = segs(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1), flat);
            for (let k = 1; k <= n; k++) {
              const t = k / n, mt = 1 - t;
              cur!.push([mt * mt * x0 + 2 * mt * t * x1 + t * t * x2, mt * mt * y0 + 2 * mt * t * y1 + t * t * y2]);
            }
            break;
          }
          case 'C': {
            const [x0, y0] = last();
            const x1 = c.x1, y1 = -c.y1, x2 = c.x2, y2 = -c.y2, x3 = c.x, y3 = -c.y;
            const n = segs(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2), flat);
            for (let k = 1; k <= n; k++) {
              const t = k / n, mt = 1 - t;
              cur!.push([
                mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
                mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
              ]);
            }
            break;
          }
          case 'Z':
            cur = null; break;
        }
      }
    });
    // Drop degenerate contours and duplicate closing points.
    return polys
      .map((p) => {
        if (p.length > 1) {
          const a = p[0], b = p[p.length - 1];
          if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) p.pop();
        }
        return p;
      })
      .filter((p) => p.length >= 3);
  }
}

function segs(approxLen: number, flat: number): number {
  return Math.max(2, Math.min(12, Math.ceil(approxLen / flat)));
}
