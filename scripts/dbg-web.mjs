import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve('apps/web/dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { let p = path.join(dist, decodeURIComponent(req.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html'); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': mime[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 300)));
await page.goto(`http://localhost:${port}/#nostart`, { waitUntil: 'load' });
await page.evaluate(() => document.querySelector('.chip[data-city="San Francisco"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
for (let i = 0; i < 12; i++) { await page.waitForTimeout(10000); console.log(i * 10 + 10, 's status:', (await page.textContent('#status'))?.slice(0, 200)); if (await page.evaluate(() => document.getElementById('results')?.style.display === '')) break; }
await browser.close(); server.close();
