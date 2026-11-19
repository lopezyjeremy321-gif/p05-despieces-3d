// Comprobaciones de UI con Playwright desde file:// (WebGL por software). Sale con código 1 si algo falla.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fails++; };
for (const piece of ['pump', 'clock']) {
  const file = path.join(HERE, '..', 'dist', piece + '.html');
  const url = pathToFileURL(file).href;
  const size = fs.statSync(file).size;
  ok(size < 1_000_000, `${piece}: peso ${size} B < 1 MB`);
  const html = fs.readFileSync(file, 'utf8');
  ok(!/(src|href)=["']https?:/.test(html), `${piece}: sin recursos remotos`);
  // 1) normal
  let ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
  let page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.SIM && window.SIM.gl, null, {timeout: 60000});
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelector('#b-tour').getAttribute('aria-pressed') === 'true'), `${piece}: el tour arranca solo`);
  ok(await page.evaluate(() => document.querySelectorAll('h1').length === 1), `${piece}: un solo h1`);
  ok(await page.evaluate(() => !!document.querySelector('#live[aria-live=polite]') && document.querySelector('#caption') !== null), `${piece}: región aria-live`);
  await page.keyboard.press('3'); // interrumpe el tour
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('#b-tour').getAttribute('aria-pressed') === 'false'), `${piece}: una tecla interrumpe el tour`);
  const v0 = await page.evaluate(() => window.SIM.state().view);
  await page.keyboard.press('2');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => window.SIM.state().view)) !== v0, `${piece}: teclas 1-n cambian de vista`);
  await page.keyboard.press('c');
  ok(await page.evaluate(() => window.SIM.state().cut === 1), `${piece}: tecla C activa el corte`);
  await page.keyboard.press('e');
  ok(await page.evaluate(() => window.SIM.state().explode === 1), `${piece}: tecla E activa el despiece`);
  await page.keyboard.press('p');
  ok(await page.evaluate(() => window.SIM.state().part !== null), `${piece}: tecla P selecciona pieza`);
  const key = piece === 'pump' ? '#p-valve' : '#p-wind';
  const hero0 = await page.evaluate(() => document.querySelector('#ro dd').textContent);
  await page.locator(key).fill(piece === 'pump' ? '30' : '40');
  await page.waitForTimeout(400);
  const txt = await page.evaluate(() => document.querySelector('#ro').textContent);
  ok(txt.length > 20, `${piece}: el panel muestra números con unidades (${hero0} → ${txt.slice(0, 40)}...)`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#ro dd')).fontVariantNumeric.includes('tabular')), `${piece}: números tabulares`);
  const small = await page.evaluate(() => [...document.querySelectorAll('.btn, input[type=range]')].filter((e) => e.offsetParent && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).length);
  ok(small === 0, `${piece}: objetivos táctiles >= 44 px (menores: ${small})`);
  ok(errs.length === 0, `${piece}: 0 errores/avisos de consola ${errs.join(' | ')}`);
  await ctx.close();
  // 2) prefers-reduced-motion
  ctx = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.SIM && window.SIM.ready);
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.querySelector('#b-tour').getAttribute('aria-pressed') === 'false' && document.querySelector('#b-play').getAttribute('aria-pressed') === 'true'), `${piece}: reduced-motion -> tour y animación detenidos`);
  await ctx.close();
  // 3) sin WebGL
  ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
  page = await ctx.newPage();
  await page.goto(url + '?nogl');
  await page.waitForFunction(() => window.SIM && window.SIM.ready);
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => !!document.querySelector('.banner') && !window.SIM.gl && !document.querySelector('.poster').classList.contains('gone') && document.querySelector('#ro dd').textContent.length > 0), `${piece}: sin WebGL -> póster + aviso + números`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FALLOS` : '\nTODO OK');
process.exit(fails ? 1 : 0);
