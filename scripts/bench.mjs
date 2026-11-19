import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
for (const q of ['film&dpr=2', 'film&dpr=2&noaa', 'film&dpr=2&noshadow', 'film&dpr=2&noaa&noshadow']) {
  const page = await browser.newPage({viewport: {width: 540, height: 960}, deviceScaleFactor: 2});
  await page.goto(pathToFileURL(path.join(HERE, '..', 'dist', process.argv[2] + '.html')).href + '?' + q);
  await page.waitForFunction(() => window.SIM && window.SIM.ready && window.SIM.gl);
  await page.evaluate(() => document.fonts.ready);
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) { await page.evaluate((t) => window.seek(t), 8 + i / 60); await page.screenshot({type: 'jpeg', quality: 95}); }
  console.log(q, ((Date.now() - t0) / 8).toFixed(0), 'ms/cuadro');
  await page.close();
}
await browser.close();
