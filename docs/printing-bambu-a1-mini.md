# Printing on a Bambu Lab A1 mini

Two ways to get a plate onto the printer. Use the first for real prints. Use the second only after the checks below pass.

## 1. Bambu Studio with the per-plate 3MF (recommended)

Every bundle has `plates/NN-<name>.3mf` with the parts already placed on a 180 × 180 mm bed and coloured.

1. Open Bambu Studio, drag the `.3mf` in (or File → Import). Keep the objects where they are.
2. Printer: **Bambu Lab A1 mini, 0.4 mm nozzle**. Filament: your PLA profile. Process: **0.20 mm Standard**, then set **walls 2, sparse infill 8–15 %, no supports, no brim** (a skirt is fine).
3. Label plates need one colour change: in the layer slider add a **Pause** (or a filament change if you have an AMS lite) at the height listed in the bundle `README.md` ("Label plates … change filament at Z = …"). The plate prints in the base colour, the raised letters in the text colour.
4. Slice, check the preview, print.

This route uses Bambu's own start sequence (bed levelling, flow calibration, nozzle wipe) and calibrated speeds, so nothing MetroCAD does can affect the machine.

## 2. MetroCAD's own G-code

`gcode/bambu-a1-mini/NN-<name>.gcode` is produced by the built-in slicer with a short generic start sequence (home, heat, purge line along the front edge). It is what the farm scheduler and the print-time matrix use. Before it touches a printer:

1. **Read `gcode/CHECK.md`.** Every file was replayed against the A1 mini's limits: all moves inside 180 × 180 × 180 mm, homing before any move, nozzle ≤ 300 °C and bed ≤ 80 °C, no extrusion with a cold nozzle or at Z ≤ 0, feedrates and volumetric flow within limits, heaters off at the end, only known G/M commands, and a toolpath envelope that matches the parts on the plate. Anything that failed is in `gcode/rejected/` and must not be printed. The same check is available for files you edited by hand: `node scripts/gcode-check.mjs file-or-folder --printer bambu-a1-mini`.
2. **Run the auto bed levelling** once from the printer's screen. The generic start sequence does not include it; the printer uses its stored mesh.
3. **Air print first.** Copy `gcode/bambu-a1-mini/00-dry-run-*.gcode` to the microSD card and print it: it is the first plate with heaters off, no extrusion, no pauses, and every move lifted 20 mm. Watch the head trace the plate. If the printer refuses the file or does something odd, stop here and use route 1. (`node scripts/gcode-dry-run.mjs in.gcode out.gcode` makes one from any file.)
4. **Print the test coupon.** `gcode/bambu-a1-mini/00-test-coupon.gcode` (or `plates/00-test-coupon.3mf` in Bambu Studio) is a piece of the real map, about 50 × 90 mm: a cut of a base tile with its groove and a station pocket, the matching line piece with its snap lugs and station hole, a dot, and a label when one sits close enough. It prints in 15 to 25 minutes. Press the pieces together: the line should click into its groove, the dot drop through the hole into the pocket, the label seat flush. If a fit is tight or loose, regenerate with a different `--clearance` before printing full plates.
5. **Print the plates.** From the microSD card (the printer lists `.gcode` files under Files; they show as not sliced by Bambu Studio, which is expected), or in Bambu Studio: File → Import → Import G-code, then send. Print one plate, check it, then let the farm schedule run.

Print settings baked into the files: 0.2 mm layers (first layer 0.2 mm), 0.42 mm lines, 2 walls, 8 % grid infill, 215 °C nozzle, 60 °C bed, part fan from layer 3, skirt. Label plates pause for the colour change with the printer's own pause command (`M400 U1`); resume from the screen after swapping filament.

## What can still go wrong

- **First-layer adhesion.** The generic start sequence skips Bambu's flow calibration. If the first layer looks under- or over-extruded on the coupon, print with route 1 or tweak `extrusionMultiplier` in the process profile.
- **Speed.** Files are capped at 200 mm/s print moves. The A1 mini can go faster with Bambu's profiles; the built-in G-code trades some time for margin.
- **Colour.** The 3MF keeps every part's colour; the G-code is single-colour per plate (plus the label pause). For multi-colour plates on an AMS lite, use route 1.
