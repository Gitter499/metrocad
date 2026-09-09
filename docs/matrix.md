# Print matrix

Every bundled city at three wall widths. Print time = sum of sliced plate times (0.2 mm layers, 2 walls, 8 % infill, PLA). Farm columns = wall-clock with that many printers running in parallel, 8 min between plates. Cost = filament at $22/kg. Assembly = hands-on time model (2.5 min per tile, 1.5 min per line piece, ~0.3–0.8 min per station/label part, +15 %). Base = outline tiles (the default): base only under the map, cut into as few bed-sized pieces as possible; the Tiles column is that piece count and the base-area column its share of the wall rectangle. Against full rectangular tiles this cuts filament by 40–90 % (Pittsburgh 900 mm: 3372 g → 368 g, 78 → 24 plates).

| City | Width × height (mm) | Line / letter (mm) | Lines / stations | Parts | Plates | Tiles (base area) | Filament | Cost | Print time (1 printer) | 3 × A1 mini | 3 × A1 mini + 1 × S3 | 9 × A1 mini + 2 × S3 | Assembly |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Atlanta | 600 × 847 | 4.8 / 4.5 | 4 / 38 | 198 | 16 | 13 (15 %) | 217 g | $5 | 18.8 h | 7 h | 5.5 h | 2.1 h | 3.1 h |
| Atlanta | 900 × 1275 | 6 / 5.5 | 4 / 41 | 212 | 23 | 20 (11 %) | 346 g | $8 | 29.3 h | 10.8 h | 8.5 h | 3.2 h | 3.6 h |
| Atlanta | 1200 × 1701 | 8 / 7.3 | 4 / 41 | 225 | 31 | 31 (9 %) | 508 g | $11 | 42.3 h | 15.7 h | 12.3 h | 4.5 h | 4.2 h |
| London | 600 × 329 | 4.8 / 4.5 | 11 / 267 | 968 | 23 | 7 (55 %) | 345 g | $8 | 34 h | 12.4 h | 9.7 h | 4.3 h | 11.8 h |
| London | 900 × 488 | 6 / 5.5 | 11 / 267 | 1089 | 30 | 16 (44 %) | 592 g | $13 | 54.9 h | 19.6 h | 15.7 h | 5.8 h | 13.2 h |
| London | 1200 × 651 | 8 / 7.3 | 11 / 267 | 1109 | 39 | 25 (39 %) | 931 g | $20 | 81 h | 28.7 h | 22.8 h | 8.5 h | 13.8 h |
| Moscow | 600 × 855 | 4.8 / 4.5 | 15 / 215 | 766 | 36 | 16 (48 %) | 686 g | $15 | 59.7 h | 21.4 h | 17.1 h | 6.3 h | 7.9 h |
| Moscow | 900 × 1288 | 6 / 5.5 | 15 / 220 | 835 | 49 | 37 (37 %) | 1160 g | $26 | 96.1 h | 34.4 h | 27.1 h | 10 h | 9.6 h |
| Moscow | 1200 × 1717 | 8 / 7.3 | 15 / 220 | 885 | 79 | 71 (32 %) | 1784 g | $39 | 143.8 h | 51.5 h | 40.8 h | 14.7 h | 11.7 h |
| Paris | 600 × 445 | 4.8 / 4.5 | 16 / 308 | 911 | 28 | 9 (58 %) | 462 g | $10 | 43.2 h | 15.7 h | 12.4 h | 4.6 h | 9.3 h |
| Paris | 900 × 665 | 6 / 5.5 | 16 / 308 | 1078 | 38 | 19 (49 %) | 826 g | $18 | 72.5 h | 26 h | 20.4 h | 7.7 h | 11.2 h |
| Paris | 1200 × 886 | 8 / 7.3 | 16 / 308 | 1153 | 49 | 35 (43 %) | 1317 g | $29 | 109.9 h | 38.8 h | 30.9 h | 11.5 h | 12.6 h |
| Philadelphia | 600 × 610 | 4.8 / 4.5 | 20 / 281 | 899 | 24 | 12 (45 %) | 468 g | $10 | 43.1 h | 15.3 h | 12.4 h | 4.8 h | 7.8 h |
| Philadelphia | 900 × 915 | 6 / 5.5 | 20 / 281 | 955 | 34 | 25 (36 %) | 808 g | $18 | 69.7 h | 24.8 h | 19.6 h | 7.1 h | 9 h |
| Philadelphia | 1200 × 1219 | 8 / 7.3 | 20 / 281 | 983 | 52 | 46 (31 %) | 1258 g | $28 | 103.5 h | 36.9 h | 29.3 h | 10.4 h | 10.2 h |
| Pittsburgh | 600 × 1270 | 4.8 / 4.5 | 3 / 38 | 165 | 17 | 16 (11 %) | 235 g | $5 | 20.2 h | 7.6 h | 5.9 h | 2.4 h | 2.3 h |
| Pittsburgh | 900 × 1917 | 6 / 5.5 | 3 / 37 | 176 | 24 | 30 (8 %) | 368 g | $8 | 30.7 h | 11.3 h | 9 h | 3.4 h | 3 h |
| Pittsburgh | 1200 × 2556 | 8 / 7.3 | 3 / 37 | 188 | 33 | 41 (6 %) | 534 g | $12 | 43.6 h | 15.9 h | 12.7 h | 4.7 h | 3.6 h |
| San Francisco | 600 × 637 | 4.8 / 4.5 | 5 / 38 | 205 | 19 | 11 (20 %) | 216 g | $5 | 19 h | 7.3 h | 5.6 h | 2.1 h | 3.1 h |
| San Francisco | 900 × 957 | 6 / 5.5 | 5 / 38 | 206 | 24 | 18 (14 %) | 353 g | $8 | 29.9 h | 11 h | 8.9 h | 3.3 h | 3.3 h |
| San Francisco | 1200 × 1276 | 8 / 7.3 | 5 / 38 | 226 | 37 | 28 (12 %) | 524 g | $12 | 43.5 h | 16.1 h | 12.8 h | 4.7 h | 4 h |
| Tokyo | 600 × 536 | 4.8 / 4.5 | 13 / 212 | 676 | 26 | 12 (44 %) | 420 g | $9 | 38.7 h | 14.1 h | 11.2 h | 4.1 h | 7.7 h |
| Tokyo | 900 × 802 | 6 / 5.5 | 13 / 215 | 766 | 40 | 24 (36 %) | 753 g | $17 | 65.8 h | 23.7 h | 18.8 h | 7 h | 9.1 h |
| Tokyo | 1200 × 1070 | 8 / 7.3 | 13 / 215 | 807 | 53 | 41 (31 %) | 1177 g | $26 | 97.8 h | 35 h | 27.8 h | 10.2 h | 10.4 h |
| Vienna | 600 × 541 | 4.8 / 4.5 | 5 / 99 | 332 | 18 | 10 (27 %) | 240 g | $5 | 21.8 h | 8 h | 6.4 h | 2.9 h | 3.4 h |
| Vienna | 900 × 810 | 6 / 5.5 | 5 / 98 | 348 | 23 | 18 (20 %) | 379 g | $8 | 32.9 h | 12 h | 9.5 h | 3.5 h | 3.9 h |
| Vienna | 1200 × 1080 | 8 / 7.3 | 5 / 98 | 369 | 29 | 26 (17 %) | 509 g | $11 | 43.9 h | 16 h | 12.5 h | 5.1 h | 4.6 h |
