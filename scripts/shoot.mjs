// Capturas con Playwright desde file:// (WebGL por software: la GPU de 4 GB está ocupada por otros proyectos).
//   node scripts/shoot.mjs <pieza> <salida.png> [--t 12] [--size 1440x900] [--q "film&dpr=2"] [--dark] [--reduced] [--nogl]
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'D:/ClaudeBrain/cache/ms-playwright';
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const a = process.argv.slice(2);
const opt = (k, d) => (a.includes('--' + k) ? a[a.indexOf('--' + k) + 1] : d);
const [piece, out] = a;
const [W, H] = opt('size', '1440x900').split('x').map(Number);
const times = opt('t', '0').split(',').map(Number);
const query = opt('q', 'render');
const html = piece.endsWith('.html') ? path.resolve(piece) : path.join(HERE, '..', 'dist', piece + '.html');
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars']});
const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: Number(opt('dpr', 1)), colorScheme: a.includes('--dark') ? 'dark' : 'light', reducedMotion: a.includes('--reduced') ? 'reduce' : 'no-preference'});
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
await page.goto(pathToFileURL(html).href + '?' + query + (a.includes('--nogl') ? '&nogl' : ''));
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
await page.evaluate(() => document.fonts.ready);
for (const t of times) {
  if (query.includes('render') || query.includes('film')) await page.evaluate((x) => window.seek(x), t);
  else await page.waitForTimeout(t * 1000);
  const f = times.length > 1 ? out.replace(/\.png$/, `-${String(t).replace('.', '_')}.png`) : out;
  await page.screenshot({path: f});
  console.log('->', f);
}
const info = await page.evaluate(() => ({gl: !!window.SIM.gl, fb: window.SIM.fallback}));
console.log(JSON.stringify(info), errs.length ? '\nCONSOLE:\n' + errs.join('\n') : '\n0 errores de consola');
await browser.close();
