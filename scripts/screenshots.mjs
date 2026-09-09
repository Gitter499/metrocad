// Serve apps/web/dist and capture screenshots of the app into docs/screenshots.
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
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] ?? 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(4173, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const shot = async (name) => { try { await page.screenshot({ path: path.join(outDir, name), timeout: 180000, animations: 'disabled' }); console.log('shot', name); } catch (e) { console.log('shot failed', name, e.message.split('\n')[0]); } };
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const which = process.argv[2] ?? 'all';
const outDir = path.resolve('docs/screenshots');
fs.mkdirSync(outDir, { recursive: true });
await page.goto('http://localhost:4173/', { waitUntil: 'load' });
// wait for build
await page.waitForFunction(() => document.getElementById('results')?.style.display === '', null, { timeout: 180000 }).catch(() => console.log('timeout waiting for build'));
console.log('status:', await page.textContent('#status'));
await page.waitForTimeout(1500);
await shot('app-3d-preview.png');
if (which === 'all') {
  const tab = async (name) => { await page.click(`#tabs button[data-tab="${name}"]`); await page.waitForTimeout(900); };
  await page.click('#dock button[data-view="closeup"]'); await page.waitForTimeout(700);
  await shot('app-3d-closeup.png');
  await page.click('#dock button[data-view="front"]'); await page.waitForTimeout(700);
  await shot('app-3d-front.png');
  await page.click('#dock button[data-view="angle"]');
  await tab('beds'); await page.waitForTimeout(1500);
  await shot('app-print-beds.png');
  await page.evaluate(() => document.querySelectorAll('#bedlist button')[30]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(1200);
  await shot('app-print-bed-focus.png');
  await tab('map');
  await shot('app-map.png');
  await tab('assemble');
  await page.waitForFunction(() => !!document.querySelector('#planhost svg'), null, { timeout: 120000 }).catch(() => console.log('assembly timeout'));
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('#steps button')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(800);
  await shot('app-assemble.png');
  // slice + farm schedule
  await page.click('#slice');
  await page.waitForFunction(() => !!document.querySelector('#sliceout .big'), null, { timeout: 900000 }).catch(() => console.log('slice timeout'));
  await page.evaluate(() => document.querySelector('.panel').scrollTo(0, 99999));
  await page.waitForTimeout(500);
  await shot('app-farm-schedule.png');
  await tab('ar');
  await page.waitForFunction(() => !!document.querySelector('model-viewer'), null, { timeout: 180000 }).catch(() => console.log('AR timeout'));
  await page.waitForTimeout(5000);
  await shot('app-ar.png');
}
await browser.close();
server.close();
console.log('done');
