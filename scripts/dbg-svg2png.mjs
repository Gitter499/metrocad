// Render an SVG file to PNG with the bundled Chromium: node scripts/dbg-svg2png.mjs in.svg out.png [width]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [svg, out, w] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w) || 1000, height: 1400 } });
const data = 'data:image/svg+xml;base64,' + fs.readFileSync(svg).toString('base64');
await page.setContent(`<body style="margin:0"><img src="${data}" style="width:100%"></body>`);
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
