// Empaqueta cada pieza en UN html offline: three.js + motor + modelo + fuentes + póster, todo en línea.
//   node build.mjs pump|clock [...]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPS = path.join(HERE, 'teardown-base', 'node_modules');
const esbuild = createRequire(path.join(DEPS, 'x.js'))('esbuild');
const FONTDIR = 'D:/ClaudeBrain/recursos/tipografias/woff2/google';
const PIECES = {
  pump: {
    title: 'Bomba centrífuga · despiece 3D interactivo',
    desc: 'Simulador 3D de una bomba centrífuga con números reales: caudal, altura, potencia, rendimiento y NPSH. Corte, despiece y tour automático.',
    themeColor: '#dfe7ec',
    fonts: [['Chakra Petch', 400, 'ChakraPetch-400.woff2'], ['Chakra Petch', 700, 'ChakraPetch-700.woff2']],
  },
  clock: {
    title: 'Reloj mecánico · despiece 3D interactivo',
    desc: 'Simulador 3D de un movimiento de reloj de cuerda: tren de engranajes, escape de áncora y volante de 3 Hz con números reales. Corte, despiece y tour.',
    themeColor: '#ece4d6',
    fonts: [['Bodoni Moda', 700, 'BodoniModa-700.woff2'], ['Jost', 400, 'Jost-400.woff2'], ['Jost', 700, 'Jost-700.woff2']],
  },
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PIECES);
fs.mkdirSync(path.join(HERE, 'dist'), {recursive: true});
for (const name of names) {
  const P = PIECES[name];
  const t0 = Date.now();
  const res = await esbuild.build({
    entryPoints: [path.join(HERE, 'src', name, 'main.js')],
    bundle: true,
    nodePaths: [DEPS],
    format: 'esm',
    minify: true,
    write: false,
    target: 'es2022',
    legalComments: 'none',
    loader: {'.css': 'text'},
    logLevel: 'warning',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/g, '<\/script');
  const faces = P.fonts
    .map(([fam, w, f]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONTDIR, f)).toString('base64')}) format('woff2')}`)
    .join('');
  const posterFile = path.join(HERE, 'assets', `poster-${name}.jpg`);
  const poster = fs.existsSync(posterFile) ? `data:image/jpeg;base64,${fs.readFileSync(posterFile).toString('base64')}` : '';
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="description" content="${P.desc}">
<meta name="theme-color" content="${P.themeColor}">
<meta name="color-scheme" content="light dark">
<title>${P.title}</title>
<style>${faces}</style>
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:24px;font:16px system-ui">Este simulador 3D necesita JavaScript. Sin él no se puede mostrar la pieza.</p></noscript>
<script>window.__POSTER=${JSON.stringify(poster)}</script>
<script type="module">${js}</script>
</body>
</html>
`;
  const out = path.join(HERE, 'dist', `${name}.html`);
  fs.writeFileSync(out, html);
  console.log(`${name}: ${out}  ${html.length} bytes (${(html.length / 1024).toFixed(0)} KB)  poster=${poster ? (poster.length / 1024).toFixed(0) + ' KB' : 'no'}  ${Date.now() - t0} ms`);
}
