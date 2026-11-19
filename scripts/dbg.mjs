import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.on('console', (m) => console.log('[c]', m.text()));
await page.goto(pathToFileURL(path.join(HERE, '..', 'dist', process.argv[2] + '.html')).href + '?render');
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const o = {};
  for (const s of ['.app', '.top', '.stage', '.panel', '.ctrl', '#gl']) { const e = document.querySelector(s); if (!e) { o[s] = 'missing'; continue; } const r = e.getBoundingClientRect(); o[s] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), getComputedStyle(e).display].join(','); }
  o.html = document.documentElement.className; o.inner = innerWidth + 'x' + innerHeight;
  return JSON.stringify(o, null, 1);
}));
await browser.close();
