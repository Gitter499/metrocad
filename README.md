# MetroCAD

**Type a city. Get a colour 3D-printed schematic metro map for your wall — STL, 3MF, G-code, a print-farm plan, and a 3D + AR preview. No app to install.**

<p align="center">
  <img src="docs/screenshots/app-3d-closeup.png" alt="Close-up of the 3D-printed Paris map preview" width="100%">
</p>

MetroCAD pulls the real network from OpenStreetMap, lays it out as an abstract octilinear diagram (the "tube map" look), turns every line, station, interchange and label into snap-fit 3D-printable parts with engraved IDs, nests them onto your printers' beds, slices them for each machine in your farm, schedules the jobs, and walks you through assembly with AR. Everything runs in the browser or from the command line.

Verified against the web: every bundled network is checked against Wikipedia/Wikidata line facts (station counts, termini, colours, links to the official route diagrams on Commons) by a GitHub Action — see [docs/verification.md](docs/verification.md). That check covers the *data*; for the *look*, use the official-map import below and compare side by side.

## Live app

**https://gitter499.github.io/metrocad/** — the Pages workflow builds the app and pushes it to the `gh-pages` branch on every push. One-time setup: in the repository *Settings → Pages* set **Source: Deploy from a branch → `gh-pages` / root**; after that every push redeploys.

Open it on a phone for AR: iPhone/iPad uses AR Quick Look (USDZ, anchored to a vertical wall at true size), Android uses Scene Viewer / WebXR. No developer account, TestFlight or app store needed.

<p align="center">
  <img src="docs/screenshots/app-3d-preview.png" alt="Wall preview" width="49%">
  <img src="docs/screenshots/app-print-beds.png" alt="Print beds" width="49%">
</p>

## Official-map geometry

Algorithms can only produce a map *in the style of* a transit diagram. To get the real thing, MetroCAD imports the official (or community-drawn official-style) diagram as SVG and uses its geometry directly: line paths are picked by colour, stations are placed at their tick marks / interchange markers by name, and labels sit exactly where the drawing puts them. The 3D parts, plates, slicing and assembly plan are then built from that geometry.

* **Auto**: for known cities the app fetches the Commons schematic (currently London: *London Underground, Overground, DLR and Elizabeth line map*, CC BY-SA). Add more in `KNOWN_MAP_SVGS`.
* **My SVG**: upload any official SVG (or `--map-svg file.svg` on the CLI). Operators often publish their diagrams as SVG/PDF; a PDF can be converted with Inkscape.
* **Generated layout**: the algorithmic fallback for cities without a drawing. *Auto* picks strict octilinear for networks with up to 8 distinct line colours (the way SEPTA, PRT and most US operators draw theirs, horizontals/verticals preferred, diagonals only for genuinely diagonal runs) and semi-geographic for bigger ones (Paris-style). Services that share a colour (SEPTA's Regional Rail lines, B1/B2/B3, T1–T5) share one ribbon, count once at interchanges, and merge into one line (B, T, D) as on the operator's map.
* **Official station lists** (`packages/core/src/official/`): where OpenStreetMap's route relations are incomplete, the operator's own map is the source of truth. SEPTA Regional Rail's 13 lines are bundled with their official station order, OSM coordinates, the interchanges SEPTA draws as one node (Suburban / 15th Street / City Hall, Jefferson / 11th Street) and "schematic" positions that stretch Center City the way the printed map does. Overlays apply automatically whenever the fetched network matches (`applyOfficialOverlays`).

**Philadelphia** (the default city) is built on SEPTA's own *Regional Rail & Rail Transit* diagram (June 2026, vector PDF with real text on septa.org): its line polylines and label anchors are extracted once (`scripts/official-extract.mjs`) into `packages/core/fixtures/philadelphia.official.json` and bundled, so the app and CLI reproduce SEPTA's geometry and colours offline — L, B with the Broad-Ridge spur, M, the T tunnel, D 101/102 with every stop, G, all thirteen Regional Rail lines and PATCO. `--no-official` falls back to the generated layout. SEPTA's separate *Metro* poster and PRT's T map are raster/outlined-text PDFs and cannot be imported; Pittsburgh remains generated.

| Source drawing (Commons) | MetroCAD import (all 267 stations, 11 lines matched) |
|---|---|
| ![source](docs/screenshots/source-london-commons.png) | ![import](docs/screenshots/layout-london-official.png) |

The same geometry built as parts, in the app (`docs/screenshots/london/`): wall at an angle, front, close-up, map, print beds, assemble, AR, farm schedule.

| Wall | Close-up |
|---|---|
| ![wall](docs/screenshots/london/01-wall-angle.png) | ![close-up](docs/screenshots/london/03-wall-closeup.png) |
| ![beds](docs/screenshots/london/05-print-beds.png) | ![assemble](docs/screenshots/london/07-assemble.png) |

## Cities and their map sources

Every bundled city is built on a real diagram, not on a generated layout. Sources are listed in `packages/core/official-sources.json` (several candidates per city are allowed; the one on which most stations land wins) and refreshed by `node scripts/official-sync.mjs <city>` (download → convert → extract → verify), which the verify workflow runs for every city on GitHub's runners (Wikimedia rate-limits shared IPs).

| City | Geometry source | Stations placed |
|---|---|---|
| Philadelphia | SEPTA *Regional Rail & Rail Transit* map, June 2026 (official vector PDF) | 280 of 524 (the rest are trolley surface stops SEPTA's diagram omits) |
| Paris | *Plan schématique du réseau de Paris*, July 2024 (Commons, CC BY-SA) | 308 of 321 |
| London | Underground, Overground, DLR and Elizabeth line map (Commons, CC BY-SA) | 267 of 267 |
| Moscow | Moscow Metro schematic by sameboat (Commons, CC BY-SA) | 220 of 220 |
| Tokyo | *TokyoSubway Metro* (Commons, CC BY-SA) — Tokyo Metro and Toei | 215 of 221 |
| Vienna | *U-Map Vienna* (Commons, CC BY-SA) | 98 of 99 |
| Atlanta | MARTA rail map, simplified (Commons, CC BY-SA) | 41 of 43 |
| San Francisco | *Bart-map* (Commons, CC BY-SA) — an older diagram: Warm Springs, Milpitas, Berryessa, Antioch and the OAK connector are not on it | 38 of 49 |
| Pittsburgh | *Pittsburgh T* (Commons, CC BY-SA) — pre-Silver-line diagram; Silver runs on the Blue strokes | 37 of 51 |

Operators whose own files could not be used: Tokyo Metro, RATP, Wiener Linien, Mosmetro and PRT either block automated downloads or publish raster/outlined-text PDFs; BART's and MARTA's official files carry their labels as raster or outlined text.

## Verification against the operator's map

Facts alone (station counts, termini, colour codes) let a wrong-looking map pass, so there is a second check that compares *appearance*. `scripts/verify-official.mjs city official.svg official.png` places our stations on the operator's drawing and reports every station missing from the map, every station sitting off its line, every label moved away from where the drawing has it, every implausible jump between neighbours, and our colour next to the official one per line — plus a side-by-side image, official raster left and our render right:

![Philadelphia vs SEPTA](docs/screenshots/verify-philadelphia.png)

The GitHub Action (`verify.yml`) downloads SEPTA's current PDF, converts it, runs the comparison and commits `docs/verification-philadelphia.md`; it fails when more than ten stations are wrong or fewer than half are placed. The importer itself learned from this map: hairline page decorations are ignored, duplicate names (three "Allegheny"s) resolve by which one lies on the station's own line colour and next to its neighbours, station dots in the drawing anchor stations whose labels sit far from the line, stacked two-line labels are joined only when they spell a station's name, and a station our data holds once but the drawing shows twice (Radnor on the Paoli line and on the Norristown line) is split.

## Print matrix: what a map costs

`docs/matrix.md` (and `.csv`) runs eight cities at 600 / 900 / 1200 mm through the whole pipeline (layout → parts → nesting → slicing → farm schedule) and reports parts, plates, filament, cost, print hours for 1 / 3 / 4 / 11 printers, and hands-on assembly time. Regenerate with `node scripts/matrix.mjs && node scripts/matrix-report.mjs`; fixtures for offline runs come from `node scripts/fetch-fixture.mjs "City" slug`.

## What you get

| Output | Details |
|---|---|
| **Print plates** | One `.3mf` (with colours) and one `.stl` per plate, parts already nested as tightly as the shapes allow (bitmap nesting with 0/45/90/135° rotations, 2.5 mm gaps). One colour per plate; label plates are two colours with a single filament change. |
| **G-code** | Built-in slicer: 0.2 mm layers, 2 walls, 8 % grid infill (minimum material), skirt, retraction, z-hop, fan and temperature control. Flavours for **Bambu Lab A1 mini**, **Bambu Lab P1S/X1**, **Ultimaker S3** (Griffin header) and generic Marlin. |
| **Print-farm plan** | Tell it what you have (e.g. 3 × A1 mini, 1 × P1S, 1 × Ultimaker S3). Plates are packed to fit every bed, each plate is sliced for the printer it is scheduled on, and the schedule reports wall-clock time for the whole map. |
| **Assembly** | Every tile, line piece, ring/plug and label carries an engraved ID (R2C3, 4-07, S014, N017). `assembly/plan.json` + `assembly-plan.svg` show where each ID goes; the web app's **Assemble** mode has step-by-step checklists, an ID finder, and per-step AR overlays (grey tiles + this step's pieces in colour) that you place on the real tiles at true size. |
| **Parts** | Optionally every individual part as its own STL, sorted into `tiles/`, `lines/<line>/`, `stations/`, `labels/`. |
| **Previews** | Assembled `.glb` and `.usdz` (AR), a vector `map.svg`, and a 1:1 `template.svg` alignment template. |
| **Guide** | `README.md` in the bundle: plate list, filament per colour, colour-change heights, print settings, assembly steps. `manifest.json` has everything machine-readable. |

## How the physical design works

Every part is a 2.5D extrusion generated with [manifold-3d](https://github.com/elalish/manifold) (robust CSG, guaranteed watertight meshes). Defaults are for a 0.4 mm nozzle in matte PLA.

* **Base tiles** (4 mm). The default **outline** base prints filament only where the map is: the footprint of every groove, station pocket and label pocket grown by an 8 mm margin (`--base-margin`), with floating labels bridged back to their line by a short strip so the base stays one connected shape. That footprint is then cut into as few bed-sized pieces as possible (`packages/core/src/tiling.ts`: greedy band covers in both bed orientations and directions with full-, half- and third-bed cells, every piece split into its connected components, neighbours merged while the union still fits the bed; the configuration with the fewest tiles wins, in well under a second). Small tiles share print plates. Pittsburgh at 900 mm goes from 72 rectangular tiles to 29 outline pieces covering 14 % of the wall rectangle; Philadelphia at 600 mm drops from 647 g to 171 g of PLA. `--base tiles` gives full rectangular tiles covering the wall area instead. The top face carries **1.2 mm grooves** shaped exactly like the line ribbons, **pockets** for every station marker, and **pockets** for every label. Parts drop in and register themselves; nothing needs measuring.
* **Snap-fit**: every piece has small friction lugs on its foot (0.1 mm interference beyond the clearance), so line pieces, dots, rings, plugs and labels click into their grooves and pockets without glue. Only the tiles need to be fixed to the wall (a Command strip or two per tile).
* **Line ribbons** (6 mm wide, 2 mm above the tile) are cut at interchanges — the joint is hidden under the interchange marker — and, only when a run is longer than the bed, at a straight section between stations. Pieces that cross a tile seam lock the tiles together. Where two lines cross, the pieces are **half-lapped** so both stay in one plane.
* **Stations**: single-line stations are a white dot dropped through a hole in the ribbon into a pocket in the tile. Interchanges are a black ring plus a white plug (pill-shaped when several parallel lines meet).
* **Labels**: a plate in the base colour with raised letters (0.8 mm) in the accent colour — printed as one object with one filament change at 1.0 mm, so it disappears into the tile and only the letters show. Letters are never smaller than 4 mm (the clean-print floor for a 0.4 mm nozzle). Every label — generated or taken from an official drawing — goes through the same collision placement: the drawing's own pose first (nudged a little if our fatter ribbons get in the way), then the eight positions around the marker and two 45° poses, then a smaller size; a label that still cannot fit is dropped and counted rather than overlapped. On request (`--label-mode tape`) the tiles get shallow pockets sized for **label-maker tape** (6–24 mm) instead, and the bundle includes `labels-tape.csv` with every text to print.
* Clearance between mating parts is 0.15 mm (adjustable).

Sizes scale with the wall-art width you ask for; text, line width and clearances stay in real millimetres so they always print.

## Web app

```
npm install
npm run build -w @metrocad/core
npm run dev            # http://localhost:5173
```

Pick a city (or type any city name — it geocodes with Nominatim and pulls routes from Overpass), set the size and your printer farm, press **Generate**. Tabs: **Wall** (3D preview with Front / Angle / Close-up), **Map** (vector), **Print beds** (every plate on its bed in 3D, click to zoom), **Assemble** (steps, checklist, ID finder, per-step AR), **AR** (the finished map on your wall). Downloads: the full print bundle as a ZIP; after **Slice**, G-code for every plate per printer plus the schedule.

<p align="center">
  <img src="docs/screenshots/app-assemble.png" alt="Assemble mode" width="49%">
  <img src="docs/screenshots/app-print-bed-focus.png" alt="One print bed" width="49%">
</p>

## Command line

```
npm run cli -- "Berlin" --width 1000 --out out/berlin
npm run cli -- --fixture london --width 1200 --labels major
node packages/cli/bin/metrocad.js --help
```

Options: `--width/--height` (mm), `--farm bambu-a1-mini:3,bambu-p1s:1,ultimaker-s3:1`, `--slice` (G-code + schedule), `--bed 180x180`, `--modes subway,light_rail,tram`, `--labels all|major|none`, `--label-mode auto|print|tape`, `--tape-width 12`, `--label-size 5.5`, `--lang local|en`, `--base outline|tiles|none`, `--base-margin 8`, `--keyholes`, `--layout schematic|geographic`, `--line-width 6`, `--clearance 0.15`, `--font Noto-Sans-JP.ttf` (for CJK names), `--save-network`, `--zip`.

Verification: `node scripts/verify.mjs paris` (built-in facts) and `node scripts/verify-web.mjs` (live Wikipedia/Wikidata check, writes `docs/verification.md`).

## Architecture

```
packages/core   TypeScript library (Node + browser)
  osm.ts          Nominatim + Overpass (endpoint fallback), raw relation parsing
  network.ts      station merging, one Line per route_master, colours
  layout/         station graph → corridors → octilinear force layout → grid snap →
                  straightening → parallel offsets → fillets → bed splits → labels
  geometry.ts     manifold-3d parts: tiles, ribbons, half-laps, rings, plugs, dots, labels,
                  snap-fit feet, engraved IDs
  pack.ts         shape-aware bitmap nesting onto plates
  slicer/         G-code slicer (profiles, slicing, motion-time estimate, farm scheduler)
  farm.ts         slice each plate for the printer it is scheduled on
  assembly.ts     piece IDs → tiles/positions, step list, plan SVG, tape-label CSV
  verify.ts       Wikidata/Wikipedia cross-check of lines, stations, termini, colours
  export/         STL, 3MF, GLB, USDZ writers · bundle.ts assembles the ZIP + guide
packages/cli    metrocad command
apps/web        Vite app: worker runs the pipeline, three.js previews, model-viewer AR
```

Tests: `npm test` (layout determinism, manifold validity of every part kind, packing inside the bed, file formats, slicer output, scheduler). Workflows: **CI** runs the tests and a full CLI build on every push, **Pages** deploys `apps/web/dist`, **Verify** re-checks the bundled networks against Wikipedia/Wikidata weekly and on data changes and commits `docs/verification.md`.

## Notes and limits

* Map data © OpenStreetMap contributors (ODbL). Cities with well-tagged `route=subway` relations (most large metros) work best; use the transit-mode option for tram/light-rail cities.
* The bundled font is Inter Bold (Latin, Greek, Cyrillic). For Japanese/Chinese/Korean names pass a CJK font on the CLI or switch names to English.
* Labels that cannot be placed without colliding with lines or other labels are skipped and counted; make the map wider or the label size smaller to fit more.
* The Bambu start G-code is a short safe sequence (home, heat, purge line). If you prefer the official machine macros, import the per-plate `.3mf` into Bambu Studio instead — it opens with parts placed and coloured.

## Screenshots

| Paris layout | London layout |
|---|---|
| ![Paris](docs/screenshots/layout-paris.png) | ![London](docs/screenshots/layout-london.png) |

| Philadelphia (SEPTA Metro + Regional Rail + PATCO) | Pittsburgh (PRT light rail) |
|---|---|
| ![Philadelphia](docs/screenshots/layout-philadelphia.png) | ![Pittsburgh](docs/screenshots/layout-pittsburgh.png) |

| Front view | Print bed close-up |
|---|---|
| ![Front](docs/screenshots/app-3d-front.png) | ![Bed](docs/screenshots/app-print-bed-focus.png) |

| Outline base (Philadelphia, 600 mm) |
|---|
| ![Outline base](docs/screenshots/base-outline-philadelphia.png) |

Philadelphia in the app (`docs/screenshots/philadelphia/`, every tab): wall, close-up, print beds, assembly, AR, farm schedule.

| Wall | Close-up |
|---|---|
| ![wall](docs/screenshots/philadelphia/01-wall-angle.png) | ![close-up](docs/screenshots/philadelphia/03-wall-closeup.png) |
| ![beds](docs/screenshots/philadelphia/05-print-beds.png) | ![schedule](docs/screenshots/philadelphia/09-farm-schedule.png) |

## License

MIT. Inter font © Rasmus Andersson, SIL Open Font License.
