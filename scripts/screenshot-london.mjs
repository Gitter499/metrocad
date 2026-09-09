// 3D screenshots of London built from the official-map geometry.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('apps/web/dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(4174, r));
const proxy = undefined;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], proxy });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
page.setDefaultTimeout(240000);
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto('http://localhost:4174/#nostart', { waitUntil: 'load' });
await page.fill('#city', 'London');
// Use the upload path with the Commons SVG saved locally (the sandbox cannot reach upload.wikimedia.org from Chromium).
await page.selectOption('#officialMap', 'custom');
await page.setInputFiles('#mapFile', process.env.MAP_SVG ?? 'docs/official/london.svg');
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.chip[data-city="London"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('results')?.style.display === '', null, { timeout: 240000 });
console.log('status:', await page.textContent('#status'));
await page.waitForTimeout(1500);
const out = path.resolve('docs/screenshots');
await page.screenshot({ path: path.join(out, 'app-london-official-3d.png'), timeout: 120000 });
await page.click('#dock button[data-view="closeup"]'); await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, 'app-london-official-closeup.png'), timeout: 120000 });
await browser.close(); server.close(); console.log('done');
