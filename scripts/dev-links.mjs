import { chromium } from 'playwright';
const pages = {
  tokyometro: 'https://www.tokyometro.jp/en/subwaymap/index.html',
  ratp: 'https://www.ratp.fr/plans-lignes/metro',
  wienerlinien: 'https://www.wienerlinien.at/netzplaene',
  bart: 'https://www.bart.gov/schedules/system-map',
  prt: 'https://www.rideprt.org/system-map/',
  mosmetro: 'https://mosmetro.ru/metro-map/',
  commons_moscow: 'https://commons.wikimedia.org/w/index.php?search=Moscow+Metro+map+svg&title=Special:MediaSearch&type=image',
  commons_tokyo: 'https://commons.wikimedia.org/w/index.php?search=Tokyo+subway+map+svg&title=Special:MediaSearch&type=image',
  commons_vienna: 'https://commons.wikimedia.org/w/index.php?search=Wien+U-Bahn+Netzplan+svg&title=Special:MediaSearch&type=image',
  commons_pitt: 'https://commons.wikimedia.org/w/index.php?search=Pittsburgh+light+rail+map+svg&title=Special:MediaSearch&type=image',
  commons_bart: 'https://commons.wikimedia.org/w/index.php?search=BART+system+map+svg&title=Special:MediaSearch&type=image',
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });
for (const [name, url] of Object.entries(pages)) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href], img[src], source[srcset]')].map((e) => e.href || e.src || e.srcset).filter((h) => /\.(pdf|svg|png|jpg)(\?|$)/i.test(h) || /netzplan|plan|map|karte/i.test(h)));
    console.log(`== ${name} ${res?.status()} ${page.url()}`);
    for (const l of [...new Set(links)].filter((l) => !/icon|logo|favicon|sprite|badge|flag/i.test(l)).slice(0, 25)) console.log('  ' + l);
  } catch (e) { console.log(`== ${name} ERROR ${e.message.split('\n')[0]}`); }
  await page.close();
}
await browser.close();
