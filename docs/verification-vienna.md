# Vienna: our layout vs the operator's map

Source drawing: `vienna.svg` · 900 mm wide · 75/99 stations placed on the official geometry · 74 labels placed, 15 moved away from where the drawing has them · 9 geometry problems.

![side by side](screenshots/verify-vienna.png)

| Line | Stations | On map | Off-line | Jumps | Our colour | Official colour | Missing from map |
|---|---|---|---|---|---|---|---|
| U1 U1 Oberlaa <=> Leopoldau | 24 | 18 | 1 | 0 | #e3000f | #e3001b | Oberlaa, Neulaa, Alaudagasse, Altes Landgut, Troststraße, Südtiroler Platz-Hauptbahnhof |
| U2 U2 Seestadt <=> Karlsplatz | 21 | 18 | 1 | 2 | #a862a4 | #a664a2 | Lina-Loos-Platz, Hausfeldstraße, Aspern Nord |
| U3 U3 Ottakring <=> Simmering | 21 | 18 | 2 | 0 | #ef7c00 | #f17e01 | Kendlerstraße, Hütteldorfer Straße, Westbahnhof |
| U4 U4 Hütteldorf <=> Heiligenstadt | 20 | 19 | 3 | 0 | #319f49 | #009134 | Heiligenstadt |
| U6 U6 Siebenhirten <=> Floridsdorf | 24 | 12 | 0 | 0 | #9d6830 | #9e6a30 | Siebenhirten, Perfektastraße, Erlaaer Straße, Am Schöpfwerk, Tscherttegasse, Bahnhof Meidling, Westbahnhof, Burggasse-Stadthalle … (+4) |

## Problems

* U1: "Praterstern" sits 16 mm off the U1 line (snapped to the wrong stroke?)
* U2: "Karlsplatz" sits 13 mm off the U2 line (snapped to the wrong stroke?)
* U2: Aspernstraße → Seestadt is 407 mm apart (a station out of place, or a gap in the traced line)
* U2: Seestadt → Aspernstraße is 407 mm apart (a station out of place, or a gap in the traced line)
* U3: "Volkstheater" sits 14 mm off the U3 line (snapped to the wrong stroke?)
* U3: "Stephansplatz" sits 16 mm off the U3 line (snapped to the wrong stroke?)
* U4: "Karlsplatz" sits 10 mm off the U4 line (snapped to the wrong stroke?)
* U4: "Schottenring" sits 52 mm off the U4 line (snapped to the wrong stroke?)
* U4: "Spittelau" sits 13 mm off the U4 line (snapped to the wrong stroke?)

## Import log

* line U1: #e3001b (87% of 18 stations)
* line U2: #a664a2 (65% of 18 stations)
* line U3: #f17e01 (74% of 20 stations)
* line U4: #009134 (46% of 20 stations)
* line U6: #9e6a30 (43% of 23 stations)
* SVG import: 75/99 stations matched, 5 line colours
