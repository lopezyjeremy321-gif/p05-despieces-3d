import {start, fmt} from '../core/engine.js';
import theme from './theme.css';
import * as C from './physics.js';
import {buildClock} from './model.js';

const st = document.createElement('style');
st.textContent = theme;
document.head.appendChild(st);

const sstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const scaleOf = (p) => Math.pow(10, p.speed);
const cache = {k: '', v: null};
const derive = (S) => {
  const k = `${S.p.speed}|${S.p.wind}`;
  if (cache.k !== k) {
    cache.k = k;
    const scale = scaleOf(S.p);
    const wind = S.p.wind / 100;
    cache.v = {
      scale,
      wind,
      // a escala <= x2,5 se ve cada paso del escape; a partir de x10 se muestra un giro continuo y un volante a ritmo visual
      regime: sstep(Math.log10(2.5), Math.log10(10), scale),
      amp: C.amplitude(wind),
      Te: C.escapeTorque(wind),
      Tb: C.barrelTorque(wind),
      P: C.powerW(wind),
      hours: C.powerReserveHours() * wind,
    };
  }
  return cache.v;
};
const nf = (v, d) => fmt(v, d);
const fmtScale = (s) => (s < 10 ? nf(s, s < 1 ? 2 : 1) : nf(s));

const arb = C.arbors();
const R = C.ratioTotal();
const VIEWS = [
  {id: 'ext', label: 'Exterior', cam: {az: 10, el: 66, d: 80, tx: 0, ty: 3, tz: 0}},
  {id: 'escape', label: 'Escape', cam: {az: -6, el: 64, d: 31, tx: 5, ty: 5, tz: 9}},
  {id: 'tren', label: 'Tren', cam: {az: 0, el: 82, d: 55, tx: 0, ty: 3, tz: 0}},
  {id: 'lado', label: 'Corte lateral', cam: {az: -84, el: 20, d: 50, tx: 0, ty: 4, tz: 0}},
  {id: 'volante', label: 'Volante', cam: {az: 8, el: 58, d: 20, tx: 2.1, ty: 8, tz: 10}},
  {id: 'despiece', label: 'Despiece', cam: {az: 22, el: 24, d: 112, tx: 0, ty: 19, tz: 0}},
];
const A285 = C.amplitude(1);
const A250 = C.amplitude(0.45);
const TOUR = [
  {t: 0, view: 'ext', set: {speed: 0, wind: 100}, cut: 0, explode: 0, labels: false, part: null, ramp: 0.1,
    caption: 'Un reloj mecánico: un muelle da la fuerza, un tren de ruedas la reduce y un escape la reparte en pulsos de 3 Hz.',
    sub: 'Tiempo real: ×1. La subesfera avanza a saltos, 6 pasos por segundo.'},
  {t: 6.5, view: 'escape', set: {speed: -1.1}, cut: 0.5, ramp: 2.2,
    caption: 'A cámara lenta (×0,08) se ve el escape: con cada oscilación del volante, la áncora suelta un diente y la rueda avanza 12°.'},
  {t: 14, view: 'volante', part: 'balance', set: {wind: 45}, ramp: 3,
    caption: `El volante oscila a ${nf(C.BAL.f, 0)} Hz (${nf(C.vph())} alt/h). Con menos cuerda baja el par y la amplitud: de ${nf(A285)}° a ${nf(A250)}°.`},
  {t: 21, view: 'ext', part: null, cut: 0, set: {wind: 100, speed: 1.78}, ramp: 2.4,
    caption: `A ×60 el minutero da una vuelta por minuto real. El tren reduce el giro del escape ${nf(R)} veces.`},
  {t: 27, set: {speed: 3.1}, ramp: 2.2,
    caption: 'A ×1 260 se ve la relación 12:1: la horaria avanza un doceavo de lo que avanza el minutero.'},
  {t: 32.5, view: 'lado', set: {speed: 1.5}, cut: 1, ramp: 3,
    caption: 'Corte: sin puentes ni esfera se ve el tren, 80→10, 80→10, 75→10 y 72→6 dientes, cada piñón en su nivel.'},
  {t: 39, view: 'despiece', set: {speed: 0.3}, cut: 0, explode: 1, labels: true, ramp: 3,
    caption: 'Despiece: la esfera, los puentes, el volante, el escape, el tren y el barrilete se apilan sobre la platina.'},
  {t: 45.5, view: 'ext', labels: false, explode: 0, set: {speed: 0}, ramp: 2.6,
    caption: 'Un solo dato manda todo: el tiempo. De él salen la hora, el escape y los números del panel.'},
];

const PARTS = [
  {id: 'dial', name: 'Esfera y agujas', desc: 'Esfera esqueleto, agujas y subesfera de segundos sobre la rueda cuarta. El motion work las reduce 12:1.'},
  {id: 'bridges', name: 'Puentes', desc: 'Puentes esqueletados que sujetan los pivotes superiores en rubíes; el movimiento se ve a través de ellos.'},
  {id: 'balance', name: 'Volante y espiral', desc: `Regulador: oscila a ${nf(C.BAL.f, 0)} Hz. La rigidez del espiral es κ = I·(2πf)² = ${nf(C.hairspringK() * 1e6, 3)} µN·m/rad.`},
  {id: 'escape', name: 'Escape y áncora', desc: 'Rueda de 15 dientes y áncora suiza con piedras de rubí: con cada oscilación pasa medio diente (12°).'},
  {id: 'train', name: 'Tren de ruedas', desc: `Centro, tercera y cuarta con sus piñones: ${nf(R)} : 1 desde el barrilete hasta el escape (8 × 8 × 7,5 × 12).`},
  {id: 'barrel', name: 'Barrilete', desc: `Tambor con el muelle en espiral: ${C.SPRING.turns} vueltas útiles a 1 vuelta cada 8 h dan ${nf(C.powerReserveHours())} h de reserva de marcha.`},
  {id: 'plate', name: 'Platina', desc: 'Base de latón con los rubíes de los pivotes inferiores. Todo el tren se apoya aquí.'},
];
const LABELS = [
  {anchor: 'esfera', text: 'Esfera', part: 'dial'},
  {anchor: 'agujas', text: 'Agujas', part: 'dial'},
  {anchor: 'puente', text: 'Puente', part: 'bridges'},
  {anchor: 'volante', text: 'Volante', part: 'balance'},
  {anchor: 'ancora', text: 'Áncora', part: 'escape'},
  {anchor: 'escape', text: 'Escape', part: 'escape'},
  {anchor: 'cuarta', text: 'Cuarta', part: 'train'},
  {anchor: 'centro', text: 'Centro', part: 'train'},
  {anchor: 'barril', text: 'Barrilete', part: 'barrel'},
  {anchor: 'platina', text: 'Platina', part: 'plate'},
];

const readouts = (S, D, P) => {
  const hms = C.hhmmss(C.hands(P.tau).clock);
  return [
    {id: 'time', label: 'Hora mostrada', value: hms, hero: true},
    {id: 'f', label: 'Frecuencia del volante', value: nf(C.BAL.f, 2), unit: 'Hz'},
    {id: 'vph', label: 'Alternancias', value: nf(C.vph()), unit: '/h'},
    {id: 'amp', label: 'Amplitud', value: nf(D.amp), unit: '°'},
    {id: 'bps', label: 'Pasos del escape', value: nf(C.beatsPerSecond()), unit: '/s'},
    {id: 'rpm', label: 'Rueda de escape', value: nf(arb.escape / 60, 1), unit: 'rpm'},
    {id: 'ratio', label: 'Barrilete → escape', value: `${nf(R)}:1`},
    {id: 'Te', label: 'Par en el escape', value: nf(D.Te * 1e6, 2), unit: 'µN·m'},
    {id: 'P', label: 'Potencia', value: nf(D.P * 1e6, 2), unit: 'µW'},
    {id: 'res', label: 'Reserva de marcha', value: nf(D.hours), unit: 'h'},
    {id: 'sc', label: 'Escala de tiempo', value: `×${fmtScale(D.scale)}`, xtra: true},
  ];
};

function trainExtra(host) {
  const rows = [
    ['Barrilete', '80', arb.barrel],
    ['Centro', '80 / 10', arb.center],
    ['Tercera', '75 / 10', arb.third],
    ['Cuarta', '72 / 6', arb.fourth],
    ['Escape', '15 / –', arb.escape],
  ];
  const body = rows.map(([n, z, rph]) => `<tr><td>${n}</td><td class="n">${z}</td><td class="n">${nf(rph, rph < 1 ? 3 : 0)}</td><td class="n">${nf(rph / 60, rph / 60 < 1 ? 3 : 1)}</td></tr>`).join('');
  host.innerHTML = `<h2>Tren de ruedas</h2>
<table class="tbl"><caption class="live-sr">Dientes y velocidad de cada árbol a tiempo real</caption><thead><tr><th scope="col">Árbol</th><th scope="col" class="n">Dientes rueda / piñón</th><th scope="col" class="n">vueltas/h</th><th scope="col" class="n">rpm</th></tr></thead><tbody>${body}</tbody></table>
<p class="note">Cada par engrana a módulo 0,14–0,20 mm. Relación del par = z<sub>rueda</sub> / z<sub>piñón</sub>; la total es el producto: 8 × 8 × 7,5 × 12 = ${nf(R)}.</p>
<p class="note">La rueda de escape tiene 15 dientes y avanza medio diente (12°) por alternancia: 30 pasos por vuelta. ${nf(C.beatsPerSecond())} pasos/s ÷ 30 = ${nf(arb.escape / 3600 * 60, 1)} rpm.</p>
<p class="note">Con tiempo acelerado el volante se anima a un ritmo visual y la rueda de escape gira continua. Valores de diseño propio, no de un calibre comercial.</p>`;
  return {update() {}};
}

start({
  id: 'clock',
  title: 'Reloj mecánico',
  subtitle: `Cuerda manual · escape de áncora suiza · volante de ${nf(C.BAL.f, 0)} Hz (${nf(C.vph())} alt/h) · reserva ${nf(C.powerReserveHours())} h`,
  panelTitle: 'Marcha',
  canvasLabel: 'Vista 3D de un movimiento de reloj mecánico. Arrastra para girar, rueda para acercar; las flechas del teclado también giran.',
  posterAlt: 'Movimiento de reloj mecánico visto desde arriba: ruedas doradas, volante con espiral rojo y esfera esqueleto',
  poster: window.__POSTER || '',
  accent: '#c1213a',
  fov: 30,
  fitAspect: 1.2,
  dMin: 10,
  dMax: 150,
  duration: 49,
  scene: {keyPos: [14, 38, 18], shadowR: 30, floorY: -1.3, light: {bg: '#ece4d6'}, dark: {bg: '#1b1611'}},
  params: [
    {key: 'speed', label: 'Escala de tiempo', min: -1.3, max: 3.5, step: 0.1, def: 0, fmt: (v) => `×${fmtScale(Math.pow(10, v))}`},
    {key: 'wind', label: 'Cuerda restante', min: 5, max: 100, step: 1, def: 100, fmt: (v) => `${nf(v)} %`},
  ],
  views: VIEWS,
  toggles: [
    {key: 'cut', label: 'Corte', keyChar: 'c', get: (S) => S.cut > 0.5, set: (S, on) => (S.cut = on ? 1 : 0)},
    {key: 'explode', label: 'Despiece', keyChar: 'e', get: (S) => S.explode > 0.5, set: (S, on) => (S.explode = on ? 1 : 0)},
    {key: 'labels', label: 'Etiquetas', keyChar: 'l', get: (S) => S.labels > 0.5, set: (S, on) => (S.labels = on ? 1 : 0)},
  ],
  parts: PARTS,
  labels: LABELS,
  labelGap: 34,
  tour: TOUR,
  keysHelp: '<kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> girar · <kbd>+</kbd> <kbd>−</kbd> acercar · <kbd>1</kbd>–<kbd>6</kbd> vistas · <kbd>C</kbd> corte · <kbd>E</kbd> despiece · <kbd>L</kbd> etiquetas · <kbd>P</kbd> pieza siguiente · <kbd>T</kbd> tour · <kbd>Espacio</kbd> pausa. Los deslizadores se mueven con las flechas.',
  derive,
  readouts,
  extra: trainExtra,
  phases0: () => ({tau: 0, bal: 0}),
  rates: (S, D) => ({tau: D.scale, bal: 1}),
  summary: (S, D, P) =>
    `Hora mostrada ${C.hhmmss(C.hands(P.tau).clock)}. Escala de tiempo por ${fmtScale(D.scale)}. Volante a ${nf(C.BAL.f, 0)} hercios, amplitud ${nf(D.amp)} grados, cuerda restante ${nf(S.p.wind)} por ciento, par en el escape ${nf(D.Te * 1e6, 1)} micronewton metro.`,
  build: (ctx) => buildClock(ctx),
});
