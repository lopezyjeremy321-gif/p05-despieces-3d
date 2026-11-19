// Película cuadro a cuadro: window.seek(t) -> captura -> ffmpeg (60 fps). WebGL por software (la GPU de 4 GB no se toca).
//   node scripts/film.mjs <pieza> <salida.mp4> [--size 540x960] [--dpr 2] [--fps 60] [--from 0] [--to <dur>] [--crf 18]
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {chromium} = createRequire(path.join(HERE, '..', 'teardown-base', 'node_modules', 'x.js'))('playwright');
const a = process.argv.slice(2);
const opt = (k, d) => (a.includes('--' + k) ? a[a.indexOf('--' + k) + 1] : d);
const [piece, out] = a;
const [W, H] = opt('size', '540x960').split('x').map(Number);
const dpr = Number(opt('dpr', 2));
const fps = Number(opt('fps', 60));
const browser = await chromium.launch({executablePath: 'D:/ClaudeBrain/cache/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars']});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: dpr});
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(HERE, '..', 'dist', piece + '.html')).href + `?film&dpr=${dpr}&theme=light`);
await page.waitForFunction(() => window.SIM && window.SIM.ready && window.SIM.gl, null, {timeout: 120000});
await page.evaluate(() => document.fonts.ready);
const dur = await page.evaluate(() => window.DURATION);
const from = Number(opt('from', 0));
const to = Number(opt('to', dur));
const frames = Math.round((to - from) * fps);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', opt('crf', '18'), '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  let buf;
  for (let k = 0; k < 5 && !buf; k++) {
    try {
      await page.evaluate((t) => window.seek(t), from + i / fps);
      buf = await page.screenshot({type: 'jpeg', quality: 95});
    } catch (e) {
      console.error('reintento cuadro', i, String(e.message).slice(0, 80));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!buf) throw new Error('cuadro ' + i + ' falló 5 veces');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 30 === 0) process.stdout.write(`\r${piece} ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`\n${piece}: ${frames} cuadros en ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
