// Dibuja un estado libre y captura: node scripts/pose.mjs <pieza> <out.png> '<json patch>' '<json fases>' [--size WxH]
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const a = process.argv.slice(2);
const [piece, out, patchS = '{}', phS = 'null'] = a;
const [W, H] = (a.includes('--size') ? a[a.indexOf('--size') + 1] : '1100x700').split('x').map(Number);
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: W, height: H}});
const errs = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(m.text()));
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(pathToFileURL(path.join(HERE, '..', 'dist', piece + '.html')).href + '?render');
await page.waitForFunction(() => window.SIM && window.SIM.ready);
await page.evaluate(() => document.fonts.ready);
const sets = JSON.parse(patchS);
const phs = JSON.parse(phS);
const list = Array.isArray(sets) ? sets : [sets];
for (let i = 0; i < list.length; i++) {
  await page.evaluate(([p, f]) => window.SIM.poseFree(p, f || undefined), [list[i], Array.isArray(phs) ? phs[i] : phs]);
  const f = list.length > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
  await page.screenshot({path: f});
  console.log('->', f);
}
console.log(errs.length ? errs.join('\n') : '0 errores');
await browser.close();
