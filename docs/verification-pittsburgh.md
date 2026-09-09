# Pittsburgh: our layout vs the operator's map

Source drawing: `pittsburgh.svg` · 900 mm wide · 8/51 stations placed on the official geometry · 8 labels placed, 8 moved away from where the drawing has them · 18 geometry problems.

![side by side](screenshots/verify-pittsburgh.png)

| Line | Stations | On map | Off-line | Jumps | Our colour | Official colour | Missing from map |
|---|---|---|---|---|---|---|---|
| Blue PRT Blue Line | 24 | 8 | 8 | 2 | #77b6e4 | — | South Hills Village, Washington Junction, St. Anne's, Willow, Memorial Hall, Killarney, McNeilly, South Bank … (+8) |
| Red PRT Red Line | 31 | 8 | 0 | 2 | #ec1b24 | #ff0000 | Overbrook Junction, Castle Shannon, Arlington, Poplar, Mt. Lebanon, Dormont Junction, Potomac, Stevenson … (+15) |
| Silver PRT Silver Line | 31 | 4 | 4 | 2 | #bcbdc0 | — | Library, West Library, Sandy Creek, Beagle, King's School, Logan, Sarah, Munroe … (+19) |

## Problems

* Blue: "Dorchester" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Bethel Village" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Highland" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Casswell" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Smith Road" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "First Avenue" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Steel Plaza" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: "Wood Street" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Blue: Smith Road → First Avenue is 1123 mm apart (a station out of place, or a gap in the traced line)
* Blue: First Avenue → Smith Road is 1123 mm apart (a station out of place, or a gap in the traced line)
* Red: First Avenue → Smith Road is 1123 mm apart (a station out of place, or a gap in the traced line)
* Red: Smith Road → First Avenue is 1123 mm apart (a station out of place, or a gap in the traced line)
* Silver: "Smith Road" sits Infinity mm off the Silver line (snapped to the wrong stroke?)
* Silver: "First Avenue" sits Infinity mm off the Silver line (snapped to the wrong stroke?)
* Silver: "Steel Plaza" sits Infinity mm off the Silver line (snapped to the wrong stroke?)
* Silver: "Wood Street" sits Infinity mm off the Silver line (snapped to the wrong stroke?)
* Silver: Smith Road → First Avenue is 1123 mm apart (a station out of place, or a gap in the traced line)
* Silver: First Avenue → Smith Road is 1123 mm apart (a station out of place, or a gap in the traced line)

## Import log

* line Blue: #00ffff (2% of 24 stations)
* line Red: #ff0000 (9% of 31 stations)
* line Silver: #666666 (1% of 30 stations)
* SVG import: 8/51 stations matched, 1 line colours
