import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const D = path.join(HERE, '..', 'docs', 'capturas');
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const shots = [
  ['pump', 'escritorio-corte', 1440, 900, 'cut', {t: 9}], ['pump', 'escritorio-despiece', 1440, 900, '', {t: 31}], ['pump', 'movil-corte', 390, 844, '', {t: 9}],
  ['clock', 'escritorio-exterior', 1440, 900, '', {t: 2}], ['clock', 'escritorio-escape', 1440, 900, '', {t: 10}], ['clock', 'escritorio-despiece', 1440, 900, '', {t: 42}], ['clock', 'movil-exterior', 390, 844, '', {t: 2}],
];
for (const [p, name, w, h, , o] of shots) {
  const page = await browser.newPage({viewport: {width: w, height: h}});
  await page.goto(pathToFileURL(path.join(HERE, '..', 'dist', p + '.html')).href + '?render');
  await page.waitForFunction(() => window.SIM && window.SIM.gl);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((t) => window.seek(t), o.t);
  await page.screenshot({path: path.join(D, `${p}-${name}.png`)});
  await page.close();
}
for (const [w, h, name] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
  const page = await browser.newPage({viewport: {width: w, height: h}});
  await page.goto('http://127.0.0.1:3150/');
  await page.waitForTimeout(9000);
  await page.screenshot({path: path.join(D, `portafolio-${name}-1.png`)});
  await page.evaluate(() => document.getElementById('reloj').scrollIntoView());
  await page.waitForTimeout(9000);
  await page.screenshot({path: path.join(D, `portafolio-${name}-2.png`)});
  await page.evaluate(() => document.getElementById('v8').scrollIntoView());
  await page.waitForTimeout(14000);
  await page.screenshot({path: path.join(D, `portafolio-${name}-3.png`)});
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(name, 'scroll horizontal:', over);
  await page.close();
}
await browser.close();
