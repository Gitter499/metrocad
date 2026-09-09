# MetroCAD

**Type a city. Get a colour 3D-printed schematic metro map for your wall — STL, 3MF, G-code, a print-farm plan, and a 3D + AR preview. No app to install.**

<p align="center">
  <img src="docs/screenshots/app-3d-closeup.png" alt="Close-up of the 3D-printed Paris map preview" width="100%">
</p>

MetroCAD pulls the real network from OpenStreetMap, lays it out as an abstract octilinear diagram (the "tube map" look), turns every line, station, interchange and label into snap-fit 3D-printable parts, nests them onto your printer's bed, slices them, and tells you how long your printer farm needs. Everything runs in the browser or from the command line.

## Live app

**https://gitter499.github.io/metrocad/** — built and deployed by GitHub Actions from this repository (enable *Settings → Pages → Source: GitHub Actions* once if the first deploy doesn't enable it automatically).

Open it on a phone for AR: iPhone/iPad uses AR Quick Look (USDZ, anchored to a vertical wall at true size), Android uses Scene Viewer / WebXR. No developer account, TestFlight or app store needed.

<p align="center">
  <img src="docs/screenshots/app-3d-preview.png" alt="Wall preview" width="49%">
  <img src="docs/screenshots/app-print-beds.png" alt="Print beds" width="49%">
</p>

## What you get

| Output | Details |
|---|---|
| **Print plates** | One `.3mf` (with colours) and one `.stl` per plate, parts already nested as tightly as the shapes allow (bitmap nesting with 0/45/90/135° rotations, 2.5 mm gaps). One colour per plate; label plates are two colours with a single filament change. |
| **G-code** | Built-in slicer: 0.2 mm layers, 2 walls, 8 % grid infill (minimum material), skirt, retraction, z-hop, fan and temperature control. Flavours for **Bambu Lab A1 mini**, **Bambu Lab P1S/X1**, **Ultimaker S3** (Griffin header) and generic Marlin. |
| **Print-farm plan** | Per-plate print time from a motion simulation of the toolpaths, and a scheduler that spreads plates across N × A1 mini + M × P1S + K × S3 and reports wall-clock time. |
| **Parts** | Optionally every individual part as its own STL, sorted into `tiles/`, `lines/<line>/`, `stations/`, `labels/`. |
| **Previews** | Assembled `.glb` and `.usdz` (AR), a vector `map.svg`, and a 1:1 `template.svg` alignment template. |
| **Guide** | `README.md` in the bundle: plate list, filament per colour, colour-change heights, print settings, assembly steps. `manifest.json` has everything machine-readable. |

## How the physical design works

Every part is a 2.5D extrusion generated with [manifold-3d](https://github.com/elalish/manifold) (robust CSG, guaranteed watertight meshes). Defaults are for a 0.4 mm nozzle in matte PLA.

* **Base tiles** (4 mm) split to fit your bed. The top face carries **1.2 mm grooves** shaped exactly like the line ribbons, **pockets** for every station marker, and **pockets** for every label. Parts drop in and register themselves; nothing needs measuring.
* **Line ribbons** (6 mm wide, 2 mm above the tile) are cut at interchanges — the joint is hidden under the interchange marker — and, only when a run is longer than the bed, at a straight section between stations. Pieces that cross a tile seam lock the tiles together. Where two lines cross, the pieces are **half-lapped** so both stay in one plane.
* **Stations**: single-line stations are a white dot dropped through a hole in the ribbon into a pocket in the tile. Interchanges are a black ring plus a white plug (pill-shaped when several parallel lines meet).
* **Labels**: a plate in the base colour with raised letters (0.8 mm) in the accent colour — printed as one object with one filament change at 1.0 mm, so it disappears into the tile and only the letters show.
* Clearance between mating parts is 0.15 mm (adjustable).

Sizes scale with the wall-art width you ask for; text, line width and clearances stay in real millimetres so they always print.

## Web app

```
npm install
npm run build -w @metrocad/core
npm run dev            # http://localhost:5173
```

Pick a city (or type any city name — it geocodes with Nominatim and pulls routes from Overpass), choose size and printer, press **Generate**. Tabs: **Wall** (3D preview with Front / Angle / Close-up), **Map** (vector), **Print beds** (every plate on its bed in 3D, click to zoom), **AR**. Downloads: the full print bundle as a ZIP, and G-code for every plate after **Slice**.

## Command line

```
npm run cli -- "Berlin" --width 1000 --out out/berlin
npm run cli -- --fixture london --width 1200 --labels major
node packages/cli/bin/metrocad.js --help
```

Options: `--width/--height` (mm), `--bed 180x180`, `--modes subway,light_rail,tram`, `--labels all|major|none`, `--label-size 5.5`, `--lang local|en`, `--base tiles|none`, `--keyholes`, `--layout schematic|geographic`, `--line-width 6`, `--clearance 0.15`, `--font Noto-Sans-JP.ttf` (for CJK names), `--save-network`, `--zip`.

## Architecture

```
packages/core   TypeScript library (Node + browser)
  osm.ts          Nominatim + Overpass (endpoint fallback), raw relation parsing
  network.ts      station merging, one Line per route_master, colours
  layout/         station graph → corridors → octilinear force layout → grid snap →
                  straightening → parallel offsets → fillets → bed splits → labels
  geometry.ts     manifold-3d parts: tiles, ribbons, half-laps, rings, plugs, dots, labels
  pack.ts         shape-aware bitmap nesting onto plates
  slicer/         G-code slicer (profiles, slicing, motion-time estimate, farm scheduler)
  export/         STL, 3MF, GLB, USDZ writers · bundle.ts assembles the ZIP + guide
packages/cli    metrocad command
apps/web        Vite app: worker runs the pipeline, three.js previews, model-viewer AR
```

Tests: `npm test` (layout determinism, manifold validity of every part kind, packing inside the bed, file formats, slicer output, scheduler). CI runs them on every push; the Pages workflow deploys `apps/web/dist`.

## Notes and limits

* Map data © OpenStreetMap contributors (ODbL). Cities with well-tagged `route=subway` relations (most large metros) work best; use the transit-mode option for tram/light-rail cities.
* The bundled font is Inter Bold (Latin, Greek, Cyrillic). For Japanese/Chinese/Korean names pass a CJK font on the CLI or switch names to English.
* Labels that cannot be placed without colliding with lines or other labels are skipped and counted; make the map wider or the label size smaller to fit more.
* The Bambu start G-code is a short safe sequence (home, heat, purge line). If you prefer the official machine macros, import the per-plate `.3mf` into Bambu Studio instead — it opens with parts placed and coloured.

## Screenshots

| Paris layout | London layout |
|---|---|
| ![Paris](docs/screenshots/layout-paris.png) | ![London](docs/screenshots/layout-london.png) |

| Front view | Print bed close-up |
|---|---|
| ![Front](docs/screenshots/app-3d-front.png) | ![Bed](docs/screenshots/app-print-bed-focus.png) |

## License

MIT. Inter font © Rasmus Andersson, SIL Open Font License.
