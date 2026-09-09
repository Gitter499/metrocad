/**
 * 3D part generation with manifold-3d (guaranteed-manifold CSG).
 * All parts are produced in assembled map coordinates (mm): x right, y up, z out of the wall.
 */
import type { ManifoldToplevel, Manifold, CrossSection } from 'manifold-3d';
import type { DesignParams, Hex, LayoutChain, LayoutStation, MeshData, Part, ProgressFn, Vec2 } from './types.js';
import type { LayoutResult } from './layout/index.js';
import type { TextFont } from './text.js';
import { add, sub, norm, fromAngle, angleOf, bboxOf, rotate, dist } from './vec.js';

export interface ZLevels {
  baseTop: number;
  grooveFloor: number;
  lineTop: number;
  pocketFloor: number;
  markerTop: number;
  labelPocketFloor: number;
  labelTextTop: number;
  /** Half-lap split height for crossing lines. */
  lapMid: number;
}

export function zLevels(p: DesignParams): ZLevels {
  const baseTop = p.baseThickness;
  const grooveFloor = baseTop - p.grooveDepth;
  const lineTop = baseTop + p.lineHeight;
  return {
    baseTop,
    grooveFloor,
    lineTop,
    pocketFloor: grooveFloor - p.pocketExtraDepth,
    markerTop: lineTop + p.stationRelief,
    labelPocketFloor: baseTop - p.labelPlateThickness,
    labelTextTop: baseTop + p.labelTextHeight,
    lapMid: (grooveFloor + lineTop) / 2,
  };
}

export interface TileGrid { cols: number; rows: number; w: number; h: number; ox: number; oy: number }

export function tileGrid(layout: { width: number; height: number }, p: DesignParams): TileGrid {
  const usableX = p.bed.x - 2 * p.bedMargin, usableY = p.bed.y - 2 * p.bedMargin;
  // Try both bed orientations and pick the one with fewer tiles.
  const opt = (ux: number, uy: number) => {
    const cols = Math.max(1, Math.ceil(layout.width / ux)), rows = Math.max(1, Math.ceil(layout.height / uy));
    return { cols, rows, w: layout.width / cols, h: layout.height / rows, ox: 0, oy: 0 };
  };
  const a = opt(usableX, usableY), b = opt(usableY, usableX);
  return a.cols * a.rows <= b.cols * b.rows ? a : b;
}

export interface GeometryOptions {
  progress?: ProgressFn;
}

const BIG = 1e5;

export function buildParts(m: ManifoldToplevel, layout: LayoutResult, params: DesignParams, font: TextFont, opts: GeometryOptions = {}): { parts: Part[]; warnings: string[]; tiles: TileGrid } {
  const { CrossSection, Manifold } = m;
  const progress = opts.progress ?? (() => {});
  const warnings: string[] = [];
  const z = zLevels(params);
  const clr = params.clearance;
  const preview = params.quality === 'preview';
  m.setMinCircularAngle(preview ? 20 : 10);
  m.setMinCircularEdgeLength(preview ? 1.0 : 0.4);

  const parts: Part[] = [];
  const lineById = new Map(layout.lines.map((l) => [l.id, l]));
  const engraveDepth = 0.45;
  /**
   * Engrave a short ID into the underside of a manifold (mirrored so it reads correctly when the
   * part is flipped over). `at` is the text centre in map coordinates, `angle` the reading direction.
   */
  const engrave = (man: Manifold, text: string, at: Vec2, angle: number, size: number, zBottom: number): Manifold => {
    if (!params.engraveIds) return man;
    const m = font.measure(text, size);
    const polys = font.outlines(text, size, { flatness: 0.2 }).map((poly) => poly.map((p): Vec2 => {
      // centre, mirror in x (viewed from below), rotate, translate
      const lx = -(p[0] - (m.minX + m.maxX) / 2), ly = p[1] - (m.minY + m.maxY) / 2;
      return add(at, rotate([lx, ly], angle));
    }));
    if (!polys.length) return man;
    const cs = new CrossSection(polys, 'NonZero');
    const cutter = cs.extrude(engraveDepth + 1).translate([0, 0, zBottom - 1]);
    const out = man.subtract(cutter);
    cs.delete(); cutter.delete(); man.delete();
    return out.status() === 'NoError' ? out : man;
  };
  const lineOrder = new Map(layout.lines.map((l, i) => [l.id, i]));
  const stationById = new Map(layout.stations.map((s) => [s.id, s]));
  const circle = (r: number, at: Vec2, segs?: number) => CrossSection.circle(r, segs).translate(at);
  const track: CrossSection[] = [];
  const keep = <T extends CrossSection>(cs: T): T => { track.push(cs); return cs; };

  /**
   * Snap-fit foot: widen the bottom `h` mm of a part by (clearance + interference) so it presses into
   * its groove/pocket. `keepCS` limits the lug to given strips (line pieces) — undefined means all around.
   */
  const lugOut = clr + params.snapInterference;
  const addFoot = (man: Manifold, cs: CrossSection, zBottom: number, h: number, strips?: CrossSection): Manifold => {
    if (!params.snapFit || lugOut <= 0) return man;
    let foot = cs.offset(lugOut, 'Round');
    if (strips) { const f2 = foot.intersect(strips); foot.delete(); foot = f2; }
    if (foot.area() < 0.01) { foot.delete(); return man; }
    const solid = foot.extrude(h).translate([0, 0, zBottom]);
    const out = man.add(solid);
    foot.delete(); solid.delete(); man.delete();
    return out;
  };

  /* ---------- station marker shapes ---------- */
  const rDot = (params.lineWidth * params.dotFactor) / 2;
  const rMajor = params.lineWidth * 0.5 + params.ringWidth + 0.4;
  const markerCS = new Map<string, CrossSection>();
  for (const st of layout.stations) {
    if (st.major) {
      const circles = st.markerPoints.map((p) => circle(rMajor, p));
      markerCS.set(st.id, keep(CrossSection.hull(circles)));
      circles.forEach((c) => c.delete());
    } else {
      markerCS.set(st.id, keep(circle(rDot, [st.x, st.y])));
    }
  }

  /* ---------- line ribbons (2D) ---------- */
  progress('geometry', 0.05, 'Line ribbons');
  interface ChainCS { chain: LayoutChain; lineId: string; cs: CrossSection; bbox: { x: number; y: number; w: number; h: number } }
  const chainCSs: ChainCS[] = [];
  const halfW = params.lineWidth / 2;
  const halfPlane = (at: Vec2, dir: Vec2): CrossSection => {
    // Half-plane containing points "behind" dir (i.e. dot(p - at, dir) <= 0): a big square whose +x edge passes through `at`.
    const sq = CrossSection.square([BIG, 2 * BIG], false).translate([-BIG, -BIG]);
    const r = sq.rotate((angleOf(dir) * 180) / Math.PI);
    sq.delete();
    const out = r.translate(at);
    r.delete();
    return out;
  };
  let ci = 0;
  for (const ln of layout.lines) for (const ch of ln.chains) {
    const pts = ch.points;
    const caps: CrossSection[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (dist(pts[i], pts[i + 1]) < 1e-6) continue;
      const a = circle(halfW, pts[i]), b = circle(halfW, pts[i + 1]);
      caps.push(CrossSection.hull([a, b]));
      a.delete(); b.delete();
    }
    if (!caps.length) continue;
    let cs = CrossSection.union(caps);
    caps.forEach((c) => c.delete());
    // straight cuts at bed splits (leave clearance/2 on each side so the two pieces do not touch)
    if (ch.startEnd === 'cut') {
      const dir = norm(sub(pts[1], pts[0]));
      const hp = halfPlane(add(pts[0], [dir[0] * clr * 0.5, dir[1] * clr * 0.5]), [-dir[0], -dir[1]]);
      const n = cs.subtract(hp); cs.delete(); hp.delete(); cs = n;
    }
    if (ch.endEnd === 'cut') {
      const dir = norm(sub(pts[pts.length - 1], pts[pts.length - 2]));
      const hp = halfPlane(sub(pts[pts.length - 1], [dir[0] * clr * 0.5, dir[1] * clr * 0.5]), dir);
      const n = cs.subtract(hp); cs.delete(); hp.delete(); cs = n;
    }
    // station ends: subtract the marker (with clearance)
    for (const sid of [ch.startStation, ch.endStation]) {
      if (!sid) continue;
      const mk = markerCS.get(sid);
      if (!mk) continue;
      const off = mk.offset(clr, 'Round');
      const n = cs.subtract(off); cs.delete(); off.delete(); cs = n;
    }
    // through stations: holes for dots
    for (const t of ch.throughStations) {
      const hole = circle(rDot + clr, t.point);
      const n = cs.subtract(hole); cs.delete(); hole.delete(); cs = n;
    }
    // any other major marker overlapping this ribbon (lines passing under an interchange they don't serve)
    const bb = bboxOf(pts);
    for (const st of layout.stations) {
      if (!st.major || st.id === ch.startStation || st.id === ch.endStation) continue;
      if (st.x < bb.x - 2 * rMajor - halfW || st.x > bb.x + bb.w + 2 * rMajor + halfW || st.y < bb.y - 2 * rMajor - halfW || st.y > bb.y + bb.h + 2 * rMajor + halfW) continue;
      const mk = markerCS.get(st.id)!;
      const off = mk.offset(clr, 'Round');
      const inter = cs.intersect(off);
      if (inter.area() > 0.01) { const n = cs.subtract(off); cs.delete(); cs = n; }
      inter.delete(); off.delete();
    }
    if (cs.area() < 0.5) { cs.delete(); continue; }
    chainCSs.push({ chain: ch, lineId: ln.id, cs: keep(cs), bbox: { x: bb.x - halfW, y: bb.y - halfW, w: bb.w + 2 * halfW, h: bb.h + 2 * halfW } });
    ci++;
  }

  /* ---------- extrude ribbons + half-lap crossings ---------- */
  progress('geometry', 0.25, 'Crossings');
  const ribbonH = z.lineTop - z.grooveFloor;
  const chainM = chainCSs.map((c) => c.cs.extrude(ribbonH).translate([0, 0, z.grooveFloor]));
  const overlaps = (a: ChainCS, b: ChainCS) => a.bbox.x < b.bbox.x + b.bbox.w && b.bbox.x < a.bbox.x + a.bbox.w && a.bbox.y < b.bbox.y + b.bbox.h && b.bbox.y < a.bbox.y + a.bbox.h;
  let laps = 0;
  for (let i = 0; i < chainCSs.length; i++) for (let j = i + 1; j < chainCSs.length; j++) {
    const A = chainCSs[i], B = chainCSs[j];
    if (A.lineId === B.lineId || !overlaps(A, B)) continue;
    const inter = A.cs.intersect(B.cs);
    if (inter.area() < 0.05) { inter.delete(); continue; }
    // Lower line index goes over.
    const [over, under] = (lineOrder.get(A.lineId)! <= lineOrder.get(B.lineId)!) ? [i, j] : [j, i];
    const region = inter.offset(clr, 'Round');
    inter.delete();
    const lowerCut = region.extrude(z.lapMid - z.grooveFloor + 1).translate([0, 0, z.grooveFloor - 1]);
    const upperCut = region.extrude(z.lineTop - z.lapMid + 1).translate([0, 0, z.lapMid]);
    const o2 = chainM[over].subtract(lowerCut); chainM[over].delete(); chainM[over] = o2;
    const u2 = chainM[under].subtract(upperCut); chainM[under].delete(); chainM[under] = u2;
    lowerCut.delete(); upperCut.delete(); region.delete();
    laps++;
  }
  chainCSs.forEach((c, i) => {
    const ln = lineById.get(c.lineId)!;
    const idx = ln.chains.indexOf(c.chain);
    const tag = `${ln.ref}-${String(idx + 1).padStart(2, '0')}`;
    // Engrave on the underside along the longest straight run (away from station holes).
    const pts = c.chain.points;
    let best = 0, bi = 0;
    for (let k = 0; k + 1 < pts.length; k++) { const d = dist(pts[k], pts[k + 1]); if (d > best) { best = d; bi = k; } }
    let man = chainM[i];
    // Snap lugs: three short strips along the piece (avoiding the ends), only in the groove zone.
    if (params.snapFit) {
      const L = pts.reduce((acc, q, k) => (k ? acc + dist(pts[k - 1], q) : 0), 0);
      const strips: CrossSection[] = [];
      const nLugs = L > 60 ? 3 : L > 25 ? 2 : 1;
      for (let k = 0; k < nLugs; k++) {
        const sAt = L * (nLugs === 1 ? 0.5 : 0.2 + (0.6 * k) / (nLugs - 1));
        let acc = 0;
        for (let q = 0; q + 1 < pts.length; q++) {
          const d = dist(pts[q], pts[q + 1]);
          if (acc + d >= sAt) {
            const tt = (sAt - acc) / Math.max(d, 1e-9);
            const centre: Vec2 = [pts[q][0] + (pts[q + 1][0] - pts[q][0]) * tt, pts[q][1] + (pts[q + 1][1] - pts[q][1]) * tt];
            const ang = (angleOf(sub(pts[q + 1], pts[q])) * 180) / Math.PI;
            const sq = CrossSection.square([5, params.lineWidth * 3], true);
            const rs = sq.rotate(ang); sq.delete();
            strips.push(rs.translate(centre)); rs.delete();
            break;
          }
          acc += d;
        }
      }
      if (strips.length) {
        const stripU = CrossSection.union(strips); strips.forEach((x) => x.delete());
        man = addFoot(man, c.cs, z.grooveFloor, params.grooveDepth - 0.3, stripU);
        stripU.delete();
      }
    }
    if (best > tag.length * params.lineWidth * 0.45 + 6) {
      const mid: Vec2 = [(pts[bi][0] + pts[bi + 1][0]) / 2, (pts[bi][1] + pts[bi + 1][1]) / 2];
      const ang = angleOf(sub(pts[bi + 1], pts[bi]));
      const size = Math.min(params.lineWidth * 0.62, 4.2);
      man = engrave(man, tag, mid, -ang, size, z.grooveFloor);
    }
    pushPart(man, {
      id: `line-${slugify(ln.ref)}-${idx + 1}`, name: `Line ${ln.ref} piece ${idx + 1}`, kind: 'line', color: ln.color, colorName: `Line ${ln.ref}`, lineId: ln.id, tag,
    });
  });

  /* ---------- station parts ---------- */
  progress('geometry', 0.45, 'Stations');
  const markerH = z.markerTop - z.pocketFloor;
  let si = -1;
  for (const st of layout.stations) {
    si++;
    const mk = markerCS.get(st.id)!;
    if (st.major) {
      const inner = mk.offset(-params.ringWidth, 'Round');
      const ring = mk.subtract(inner);
      const plugCS = inner.offset(-clr, 'Round');
      let ringM = ring.extrude(markerH).translate([0, 0, z.pocketFloor]);
      let plugM = plugCS.extrude(markerH).translate([0, 0, z.pocketFloor]);
      // Press-fit feet: the ring's outer wall against the pocket, the plug against the ring.
      { const outer = ring.offset(lugOut, 'Round'); const innerHole = inner.offset(0, 'Round'); const footCS = outer.subtract(innerHole); ringM = addFoot(ringM, footCS, z.pocketFloor, 1.0); outer.delete(); innerHole.delete(); footCS.delete(); }
      plugM = addFoot(plugM, plugCS, z.pocketFloor, 1.0);
      pushPart(ringM, { id: `ring-${st.id}`, name: `${st.name} ring`, kind: 'ring', color: params.colors.ring, colorName: 'Ring', stationId: st.id, tag: `S${String(si + 1).padStart(3, '0')}` });
      pushPart(plugM, { id: `plug-${st.id}`, name: `${st.name} plug`, kind: 'plug', color: params.colors.plug, colorName: 'Station', stationId: st.id, tag: `S${String(si + 1).padStart(3, '0')}` });
      inner.delete(); ring.delete(); plugCS.delete();
    } else {
      let dotM = mk.extrude(markerH).translate([0, 0, z.pocketFloor]);
      dotM = addFoot(dotM, mk, z.pocketFloor, 1.0);
      pushPart(dotM, { id: `dot-${st.id}`, name: `${st.name} dot`, kind: 'dot', color: params.colors.dot, colorName: 'Station', stationId: st.id, tag: `S${String(si + 1).padStart(3, '0')}` });
    }
  }

  /* ---------- labels ---------- */
  progress('geometry', 0.55, 'Labels');
  const labelPlateCS: CrossSection[] = [];
  const tapePocketCS: CrossSection[] = [];
  const plateH = z.baseTop - z.labelPocketFloor;
  const textH = z.labelTextTop - z.baseTop;
  let li = 0;
  for (const lb of layout.labels) {
    if (lb.tape) {
      // Label-maker tape: a shallow rectangular pocket in the tile, nothing to print.
      const t = (lb.angle * Math.PI) / 180;
      let rect = CrossSection.square([lb.width, lb.height], false);
      const r = rect.rotate(lb.angle); rect.delete();
      const pocket = r.translate([lb.x, lb.y]); r.delete();
      tapePocketCS.push(keep(pocket));
      void t;
      continue;
    }
    const t = (lb.angle * Math.PI) / 180;
    const place = (p: Vec2): Vec2 => add([lb.x, lb.y], rotate(p, t));
    // plate: rounded rectangle
    const rr = Math.min(1.2, lb.height * 0.3);
    let plate = CrossSection.square([lb.width, lb.height], false);
    if (rr > 0.2) { const a = plate.offset(-rr, 'Miter'); const b = a.offset(rr, 'Round'); plate.delete(); a.delete(); plate = b; }
    const plateR = plate.rotate(lb.angle); plate.delete();
    const plateP = plateR.translate([lb.x, lb.y]); plateR.delete();
    // text
    const polys = font.outlines(lb.text, lb.fontSize, { flatness: preview ? 0.3 : 0.12 }).map((poly) => poly.map((p) => place(add(lb.textOrigin, p))));
    let text = new CrossSection(polys, 'NonZero');
    const inset = plateP.offset(-0.25, 'Miter');
    const clipped = text.intersect(inset); text.delete(); inset.delete(); text = clipped;
    if (text.area() < 0.05) { text.delete(); plateP.delete(); warnings.push(`Label "${lb.text}" produced no glyph geometry`); continue; }
    let plateM = plateP.extrude(plateH).translate([0, 0, z.labelPocketFloor]);
    plateM = addFoot(plateM, plateP, z.labelPocketFloor, Math.min(0.6, plateH - 0.2));
    const tagText = `N${String(lb.n).padStart(3, '0')}`;
    const t2 = (lb.angle * Math.PI) / 180;
    const plateCentre = place([lb.width / 2, lb.height / 2]);
    if (lb.width > 14) plateM = engrave(plateM, tagText, plateCentre, -t2, Math.min(lb.height * 0.55, 3.5), z.labelPocketFloor);
    const textM = text.extrude(textH).translate([0, 0, z.baseTop]);
    // Coarse copy of the letters for on-screen/AR use.
    const coarseCS = text.simplify(0.1);
    const coarseM = coarseCS.extrude(textH).translate([0, 0, z.baseTop]);
    const previewText = meshOf(coarseM);
    coarseCS.delete(); coarseM.delete();
    const st = stationById.get(lb.stationId);
    const gid = `label-${lb.stationId}`;
    pushPart(plateM, { id: `${gid}-plate`, name: `${lb.text} label plate`, kind: 'labelPlate', color: params.colors.labelPlate, colorName: 'Label plate', group: gid, stationId: st?.id, tag: tagText });
    pushPart(textM, { id: `${gid}-text`, name: `${lb.text} label text`, kind: 'labelText', color: params.colors.labelText, colorName: 'Label text', group: gid, stationId: st?.id, tag: tagText }, previewText);
    labelPlateCS.push(keep(plateP));
    text.delete();
    li++;
    if (li % 25 === 0) progress('geometry', 0.55 + 0.2 * (li / layout.labels.length), `Labels ${li}/${layout.labels.length}`);
  }

  /* ---------- base tiles ---------- */
  const tiles = tileGrid(layout, params);
  if (params.base === 'tiles') {
    progress('geometry', 0.78, 'Base tiles');
    const grooveAll = CrossSection.union(chainCSs.map((c) => c.cs));
    const groove = grooveAll.offset(clr, 'Round'); grooveAll.delete();
    const pocketsAll = CrossSection.union([...markerCS.values()]);
    const pockets = pocketsAll.offset(clr, 'Round'); pocketsAll.delete();
    const labelPockets = labelPlateCS.length ? (() => { const u = CrossSection.union(labelPlateCS); const o = u.offset(clr, 'Round'); u.delete(); return o; })() : undefined;
    const tapePockets = tapePocketCS.length ? CrossSection.union(tapePocketCS) : undefined;
    const tapeDepth = 0.6;
    const H = z.baseTop + 5;
    let ti = 0;
    for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) {
      const x0 = tiles.ox + c * tiles.w, y0 = tiles.oy + r * tiles.h;
      const rect = CrossSection.square([tiles.w, tiles.h], false).translate([x0, y0]);
      let tile = rect.extrude(params.baseThickness);
      const cutWith = (cs: CrossSection, floor: number) => {
        const clip = cs.intersect(rect);
        if (clip.area() > 1e-6) {
          const cutter = clip.extrude(H - floor).translate([0, 0, floor]);
          const n = tile.subtract(cutter); tile.delete(); cutter.delete(); tile = n;
        }
        clip.delete();
      };
      cutWith(groove, z.grooveFloor);
      cutWith(pockets, z.pocketFloor);
      if (labelPockets) cutWith(labelPockets, z.labelPocketFloor);
      if (tapePockets) cutWith(tapePockets, z.baseTop - tapeDepth);
      if (params.keyholes) {
        // Two keyhole slots on the back: a 7 mm head + 4 mm slot, 1.8 mm deep, near the top edge.
        for (const kx of [x0 + tiles.w * 0.25, x0 + tiles.w * 0.75]) {
          const ky = y0 + tiles.h - 18;
          const head = CrossSection.circle(3.5).translate([kx, ky]);
          const slot = CrossSection.square([4, 12], false).translate([kx - 2, ky]);
          const kh = head.add(slot);
          const cutter = kh.extrude(1.8 + 1).translate([0, 0, -1]);
          const n = tile.subtract(cutter); tile.delete(); tile = n;
          head.delete(); slot.delete(); kh.delete(); cutter.delete();
        }
      }
      rect.delete();
      const tileTag = `R${r + 1}C${c + 1}`;
      // ID + north arrow on the underside, centred.
      tile = engrave(tile, `${tileTag} ^`, [x0 + tiles.w / 2, y0 + tiles.h / 2], 0, Math.min(14, tiles.w / 9), 0);
      pushPart(tile, { id: `tile-r${r + 1}c${c + 1}`, name: `Base tile row ${r + 1} col ${c + 1}`, kind: 'tile', color: params.colors.base, colorName: 'Base', tag: tileTag });
      ti++;
      progress('geometry', 0.78 + 0.2 * (ti / (tiles.rows * tiles.cols)), `Tile ${ti}/${tiles.rows * tiles.cols}`);
    }
    groove.delete(); pockets.delete(); labelPockets?.delete(); tapePockets?.delete();
  } else {
    // Floating mode: every part is glued straight to the wall, so all bottoms go to z=0.
    for (const p of parts) shiftZ(p, -p.bbox.min[2]);
  }

  for (const cs of track) cs.delete();
  progress('geometry', 1, `${parts.length} parts, ${laps} half-lap crossings`);
  return { parts, warnings, tiles };

  function meshOf(man: Manifold): MeshData {
    const mesh = man.getMesh();
    return { positions: mesh.numProp === 3 ? new Float32Array(mesh.vertProperties) : stripProps(mesh.vertProperties, mesh.numProp), indices: new Uint32Array(mesh.triVerts) };
  }
  function pushPart(man: Manifold, meta: Omit<Part, 'mesh' | 'bbox' | 'volumeMm3' | 'triangles' | 'printZ' | 'previewMesh'>, previewMesh?: MeshData) {
    const status = man.status();
    if (status !== 'NoError') { warnings.push(`${meta.name}: manifold error ${status}`); man.delete(); return; }
    if (man.isEmpty()) { man.delete(); return; }
    const mesh = man.getMesh();
    const bb = man.boundingBox();
    const part: Part = {
      ...meta,
      previewMesh,
      mesh: { positions: mesh.numProp === 3 ? new Float32Array(mesh.vertProperties) : stripProps(mesh.vertProperties, mesh.numProp), indices: new Uint32Array(mesh.triVerts) },
      bbox: { min: [bb.min[0], bb.min[1], bb.min[2]], max: [bb.max[0], bb.max[1], bb.max[2]] },
      volumeMm3: man.volume(),
      triangles: mesh.triVerts.length / 3,
      printZ: -bb.min[2],
    };
    man.delete();
    parts.push(part);
  }
}

function stripProps(v: Float32Array, numProp: number): Float32Array {
  const n = v.length / numProp;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { out[i * 3] = v[i * numProp]; out[i * 3 + 1] = v[i * numProp + 1]; out[i * 3 + 2] = v[i * numProp + 2]; }
  return out;
}

function shiftZ(p: Part, dz: number) {
  const pos = p.mesh.positions;
  for (let i = 2; i < pos.length; i += 3) pos[i] += dz;
  if (p.previewMesh) { const q = p.previewMesh.positions; for (let i = 2; i < q.length; i += 3) q[i] += dz; }
  p.bbox.min[2] += dz; p.bbox.max[2] += dz;
  p.printZ = -p.bbox.min[2];
}

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

/** Basic mesh sanity: every edge shared by exactly two triangles with opposite orientation. */
export function isClosedManifold(mesh: MeshData): boolean {
  const edges = new Map<string, number>();
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const t = [idx[i], idx[i + 1], idx[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      const key = `${a}>${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (count !== 1) return false;
    const [a, b] = key.split('>');
    if (edges.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

export type { Hex, LayoutStation, Vec2 as V2 };
void fromAngle;
