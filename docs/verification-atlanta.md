# Atlanta: our layout vs the operator's map

Source drawing: `atlanta.svg` · 900 mm wide · 23/38 stations placed on the official geometry · 23 labels placed, 22 moved away from where the drawing has them · 16 geometry problems.

![side by side](screenshots/verify-atlanta.png)

| Line | Stations | On map | Off-line | Jumps | Our colour | Official colour | Missing from map |
|---|---|---|---|---|---|---|---|
| Blue MARTA Blue Line | 15 | 1 | 1 | 0 | #0274ba | — | Hamilton E. Holmes, West Lake, Ashby, Vine City, SEC District, Georgia State, King Memorial, Inman Park/Reynoldstown … (+6) |
| Gold MARTA Gold Line | 18 | 18 | 1 | 0 | #f67705 | #ffa500 |  |
| Green MARTA Green Line | 10 | 1 | 1 | 0 | #009544 | — | Bankhead, Ashby, Vine City, SEC District, Georgia State, King Memorial, Inman Park/Reynoldstown, Edgewood/Candler Park … (+1) |
| Red MARTA Red Line | 19 | 19 | 13 | 0 | #cc0000 | #ec2527 |  |

## Problems

* Blue: "Five Points" sits Infinity mm off the Blue line (snapped to the wrong stroke?)
* Gold: "Oakland City" sits 9 mm off the Gold line (snapped to the wrong stroke?)
* Green: "Five Points" sits Infinity mm off the Green line (snapped to the wrong stroke?)
* Red: "Lindbergh Center" sits 11 mm off the Red line (snapped to the wrong stroke?)
* Red: "Arts Center" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Midtown" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "North Avenue" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Civic Center" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Peachtree Center" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Five Points" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Garnett" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "West End" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Lakewood/Fort McPherson" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "East Point" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "College Park" sits 9 mm off the Red line (snapped to the wrong stroke?)
* Red: "Airport" sits 9 mm off the Red line (snapped to the wrong stroke?)

## Import log

* line Blue: #0093d0 (12% of 13 stations)
* line Gold: #ffa500 (63% of 18 stations)
* line Green: #69bd47 (8% of 9 stations)
* line Red: #ec2527 (39% of 19 stations)
* SVG import: 23/38 stations matched, 2 line colours
