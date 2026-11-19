import {start, fmt} from '../core/engine.js';
import theme from './theme.css';
import {PUMP, state, curves, headSystem, u2Of, headPump} from './physics.js';
import {buildPump} from './model.js';

const st = document.createElement('style');
st.textContent = theme;
document.head.appendChild(st);

const VIS = 1 / 30; // el giro se anima a 1/30 de la velocidad real (a 2 900 rpm real el ojo no vería nada, solo estroboscopio)
const nominal = state(PUMP.n0, 1);
const U2 = u2Of(PUMP.n0);
const cache = {k: '', v: null};
const derive = (S) => {
  const k = `${S.p.rpm}|${S.p.valve}|${S.p.suction}`;
  if (cache.k !== k) {
    cache.k = k;
    cache.v = state(S.p.rpm, S.p.valve / 100, S.p.suction);
  }
  return cache.v;
};

const VIEWS = [
  {id: 'ext', label: 'Exterior', cam: {az: 28, el: 16, d: 14.5, tx: 2.0, ty: 0.4, tz: 0}},
  {id: 'corte', label: 'Corte frontal', cam: {az: -62, el: 14, d: 10.5, tx: 0, ty: 0.3, tz: 0}},
  {id: 'lado', label: 'Lateral', cam: {az: 0, el: 3, d: 16, tx: 2.2, ty: 0.3, tz: 0}},
  {id: 'despiece', label: 'Despiece', cam: {az: 20, el: 14, d: 20, tx: 4.2, ty: 0.3, tz: 0}},
  {id: 'rotor', label: 'Impulsor', cam: {az: -72, el: 10, d: 7.6, tx: 0, ty: 0, tz: 0}},
];

const TOUR = [
  {t: 0, view: 'ext', set: {rpm: 2900, valve: 100, suction: 1}, cut: 0, explode: 0, labels: false, part: null, ramp: 0.1,
    caption: `Una bomba centrífuga convierte giro en presión: el impulsor lanza el agua y la voluta la frena.`, sub: `Aquí a ${fmt(PUMP.n0)} rpm. El giro se anima 30 veces más lento que el real.`},
  {t: 5.2, view: 'corte', cut: 1, ramp: 2.4,
    caption: 'Corte frontal: el agua entra por el centro, sale por la periferia y la voluta la lleva a la descarga.'},
  {t: 11, view: 'rotor', part: 'impeller', ramp: 2.2,
    caption: `Impulsor: 6 álabes curvados hacia atrás, Ø${fmt(PUMP.D2 * 1000)} mm. A ${fmt(PUMP.n0)} rpm su borde va a ${fmt(U2, 1)} m/s.`},
  {t: 15.4, view: 'corte', part: null, set: {valve: 18}, ramp: 2.2,
    caption: 'Cierro la válvula: baja el caudal, sube la altura y el punto de operación se mueve por la curva.'},
  {t: 20, set: {valve: 100, rpm: 3400}, ramp: 2.2,
    caption: 'Más rpm: el caudal crece con n, la altura con n² y la potencia con n³ (leyes de afinidad).'},
  {t: 24.4, set: {suction: -7, rpm: 3400}, ramp: 1.8,
    caption: 'Aspiración demasiado baja: el margen NPSH se agota y el agua empieza a hervir en el ojo del impulsor (cavitación).'},
  {t: 28.6, view: 'despiece', set: {suction: 1, rpm: 2900, valve: 100}, cut: 0, explode: 1, labels: true, ramp: 2.6,
    caption: 'Despiece: el conjunto motriz sale por detrás sin tocar las tuberías de aspiración y descarga.'},
  {t: 34.2, labels: false, explode: 0, view: 'ext', ramp: 2.4,
    caption: 'Todo sale de una misma función: lo que ves moverse es lo que miden los números.'},
];

const PARTS = [
  {id: 'casing', name: 'Carcasa', desc: 'Voluta en espiral que crece: frena el agua que sale a ~30 m/s y convierte su velocidad en presión.'},
  {id: 'impeller', name: 'Impulsor', desc: `6 álabes curvados hacia atrás (β₂ = ${PUMP.beta2}°). Cede energía al agua: H = u₂·c_u2 / g.`},
  {id: 'shaft', name: 'Eje', desc: 'Transmite el par del motor al impulsor y gira sobre dos rodamientos.'},
  {id: 'cover', name: 'Tapa trasera', desc: 'Cierra la voluta por detrás y aloja el sello. Se desmonta sin soltar las tuberías.'},
  {id: 'seal', name: 'Cierre mecánico', desc: 'Dos caras pulidas, una fija y otra rotativa, apretadas por un resorte: impiden que el agua salga por el eje.'},
  {id: 'frame', name: 'Soporte', desc: 'Carcasa de rodamientos: sostiene el eje y absorbe el empuje axial y radial.'},
];
const LABELS = [
  {anchor: 'descarga', text: 'Descarga', sub: 'a presión', part: 'casing'},
  {anchor: 'aspiracion', text: 'Aspiración', sub: 'entrada axial', part: 'casing'},
  {anchor: 'voluta', text: 'Voluta', part: 'casing'},
  {anchor: 'impulsor', text: 'Impulsor', part: 'impeller'},
  {anchor: 'eje', text: 'Eje', part: 'shaft'},
  {anchor: 'tapa', text: 'Tapa', part: 'cover'},
  {anchor: 'cierre', text: 'Sello', part: 'seal'},
  {anchor: 'soporte', text: 'Soporte', part: 'frame'},
];

const nf = (v, d) => fmt(v, d);
const readouts = (S, D) => [
  {id: 'Q', label: 'Caudal', value: nf(D.Qh, 1), unit: 'm³/h', hero: true},
  {id: 'H', label: 'Altura manométrica', value: nf(D.H, 1), unit: 'm'},
  {id: 'dp', label: 'Presión generada', value: nf(D.dp, 2), unit: 'bar'},
  {id: 'P', label: 'Potencia en el eje', value: nf(D.Pshaft / 1000, 2), unit: 'kW'},
  {id: 'eta', label: 'Rendimiento', value: nf(D.eta * 100, 1), unit: '%'},
  {id: 'n', label: 'Velocidad', value: nf(S.p.rpm), unit: 'rpm'},
  {id: 'T', label: 'Par', value: nf(D.torque, 1), unit: 'N·m'},
  {id: 'u2', label: 'Velocidad del borde', value: nf(D.u2, 1), unit: 'm/s'},
  {id: 'npsh', label: D.cav ? 'Margen NPSH: cavitación' : 'Margen NPSH', value: nf(D.margin, 1), unit: 'm', warn: D.cav},
  {id: 'ph', label: 'Potencia hidráulica', value: nf(D.Phyd / 1000, 2), unit: 'kW', xtra: true},
];

function chartExtra(host) {
  const W = 304;
  const H = 188;
  const m = {l: 34, r: 8, t: 10, b: 28};
  const QM = 110; // m³/h
  const HM = 100;
  const x = (q) => m.l + (q / QM) * (W - m.l - m.r);
  const y = (h) => H - m.b - (Math.max(0, Math.min(HM, h)) / HM) * (H - m.t - m.b);
  let grid = '';
  for (const q of [0, 25, 50, 75, 100]) grid += `<line class="gridl" x1="${x(q)}" y1="${m.t}" x2="${x(q)}" y2="${H - m.b}"/><text x="${x(q)}" y="${H - m.b + 13}" text-anchor="middle">${q}</text>`;
  for (const h of [0, 25, 50, 75, 100]) grid += `<line class="gridl" x1="${m.l}" y1="${y(h)}" x2="${W - m.r}" y2="${y(h)}"/><text x="${m.l - 5}" y="${y(h) + 3.5}" text-anchor="end">${h}</text>`;
  host.innerHTML = `<h2>Curva altura–caudal</h2>
<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curvas de la bomba y del sistema; su cruce es el punto de operación">${grid}
<path class="c2" id="c-sys"/><path class="c1" id="c-pump"/><circle class="op" id="c-op" r="6"/>
<text x="${W - m.r}" y="${H - 3}" text-anchor="end">Q (m³/h)</text><text x="${m.l + 2}" y="${m.t + 2}" text-anchor="start">H (m)</text></svg>
<p class="note"><b>Línea continua:</b> la bomba a la velocidad elegida. <b>Discontinua:</b> el sistema (tubería, válvula y ${PUMP.Hstat} m de desnivel). El punto naranja es donde se cruzan.</p>
<p class="note">Giro animado a 1/30 de la velocidad real. Modelo propio (Euler + pérdidas ajustadas), no datos de fabricante.</p>`;
  const pump = host.querySelector('#c-pump');
  const sys = host.querySelector('#c-sys');
  const op = host.querySelector('#c-op');
  const path = (pts) => pts.map(([q, h], i) => `${i ? 'L' : 'M'}${x(q * 3600).toFixed(1)},${y(h).toFixed(1)}`).join('');
  let lastKey = '';
  return {
    update(S, D) {
      const key = `${S.p.rpm}|${S.p.valve}`;
      if (key !== lastKey) {
        lastKey = key;
        const c = curves(S.p.rpm, S.p.valve / 100, PUMP, 60);
        const keep = (pts) => pts.filter(([q, h]) => q * 3600 <= QM && h >= 0);
        pump.setAttribute('d', path(keep(c.pump)));
        sys.setAttribute('d', path(keep(c.sys)));
      }
      op.setAttribute('cx', x(D.Qh).toFixed(1));
      op.setAttribute('cy', y(D.H).toFixed(1));
    },
  };
}

const SCENE = {
  keyPos: [9, 14, 11],
  shadowR: 14,
  floorY: -2.1,
  light: {bg: '#dfe7ec'},
  dark: {bg: '#0e1a26'},
};

start({
  id: 'pump',
  title: 'Bomba centrífuga',
  subtitle: `Una etapa · impulsor de ${fmt(PUMP.D2 * 1000)} mm · ${PUMP.Z} álabes · diseño ${fmt(nominal.Qh)} m³/h a ${fmt(nominal.H)} m`,
  panelTitle: 'Punto de operación',
  canvasLabel: 'Vista 3D de una bomba centrífuga. Arrastra para girar, rueda para acercar; las flechas del teclado también giran.',
  posterAlt: 'Bomba centrífuga en vista exterior de tres cuartos, con la voluta azul y el impulsor de bronce',
  poster: window.__POSTER || '',
  accent: '#ff6b2c',
  fov: 30,
  fitAspect: 1.2,
  dMin: 4,
  dMax: 40,
  duration: 38,
  scene: SCENE,
  params: [
    {key: 'rpm', label: 'Velocidad', min: 600, max: 3500, step: 50, def: PUMP.n0, fmt: (v) => `${fmt(v)} rpm`},
    {key: 'valve', label: 'Válvula de descarga', min: 0, max: 100, step: 1, def: 100, fmt: (v) => `${fmt(v)} % abierta`},
    {key: 'suction', label: 'Nivel de aspiración', min: -7, max: 3, step: 0.5, def: PUMP.zS, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 1)} m`},
  ],
  views: VIEWS,
  toggles: [
    {key: 'cut', label: 'Corte', keyChar: 'c', get: (S) => S.cut > 0.5, set: (S, on) => (S.cut = on ? 1 : 0)},
    {key: 'explode', label: 'Despiece', keyChar: 'e', get: (S) => S.explode > 0.5, set: (S, on) => (S.explode = on ? 1 : 0)},
    {key: 'labels', label: 'Etiquetas', keyChar: 'l', get: (S) => S.labels > 0.5, set: (S, on) => (S.labels = on ? 1 : 0)},
  ],
  parts: PARTS,
  labels: LABELS,
  labelGap: 40,
  tour: TOUR,
  keysHelp: '<kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> girar · <kbd>+</kbd> <kbd>−</kbd> acercar · <kbd>1</kbd>–<kbd>5</kbd> vistas · <kbd>C</kbd> corte · <kbd>E</kbd> despiece · <kbd>L</kbd> etiquetas · <kbd>P</kbd> pieza siguiente · <kbd>T</kbd> tour · <kbd>Espacio</kbd> pausa. Los deslizadores se mueven con las flechas.',
  derive,
  readouts,
  extra: chartExtra,
  phases0: () => ({imp: 0, flow: 0}),
  rates: (S, D) => ({imp: ((S.p.rpm * 2 * Math.PI) / 60) * VIS, flow: D.Q * 29}),
  summary: (S, D) =>
    `Velocidad ${nf(S.p.rpm)} revoluciones por minuto, válvula abierta al ${nf(S.p.valve)} por ciento. ` +
    (D.flowing
      ? `Caudal ${nf(D.Qh, 1)} metros cúbicos por hora, altura ${nf(D.H, 1)} metros, potencia en el eje ${nf(D.Pshaft / 1000, 1)} kilovatios, rendimiento ${nf(D.eta * 100)} por ciento.`
      : 'La bomba no entrega caudal: no vence la altura estática.') +
    (D.cav ? ' Aviso: margen de NPSH insuficiente, hay cavitación.' : ''),
  build: (ctx) => buildPump(ctx),
});
void headSystem;
void headPump;
