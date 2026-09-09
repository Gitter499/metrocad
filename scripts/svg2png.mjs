// node scripts/svg2png.mjs in.svg out.png [widthPx]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [inp, out, wArg] = process.argv.slice(2);
const svg = fs.readFileSync(inp, 'utf8');
const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg) ?? (() => { const w = /width="([\d.]+)/.exec(svg), h = /height="([\d.]+)/.exec(svg); return [null, w[1], h[1]]; })();
const W = Number(wArg ?? 1800), H = Math.round((W * Number(m[2])) / Number(m[1]));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:#fff">${svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${W}" height="${H}"`)}</body></html>`);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out, W, H);
