// Movimiento mecánico de cuerda con escape de áncora suiza (lever) y volante de 3 Hz (21 600 alternancias/h).
// Todo el movimiento sale de UNA entrada: el tiempo simulado tau [s]. Sin three.js.
// Dientes y módulos son de diseño propio (no copian un calibre comercial).

/** Tren de ruedas: cada fila es una rueda que engrana con el piñón de la siguiente. */
export const TREE = [
  {id: 'barrel', name: 'Barrilete', z: 80, driven: {name: 'Piñón del centro', z: 10}, m: 0.2},
  {id: 'center', name: 'Rueda del centro', z: 80, driven: {name: 'Piñón de la tercera', z: 10}, m: 0.2},
  {id: 'third', name: 'Rueda tercera', z: 75, driven: {name: 'Piñón de la cuarta', z: 10}, m: 0.18},
  {id: 'fourth', name: 'Rueda cuarta (segundero)', z: 72, driven: {name: 'Piñón del escape', z: 6}, m: 0.14},
];
export const ESC = {teeth: 15, beatsPerRev: 30}; // la rueda de escape avanza medio diente por alternancia
export const BAL = {f: 3, I: 8e-10, A_full: 285, A_low: 220, lift: 52, banking: 5.5}; // Hz, kg·m², °, °, °, °
export const SPRING = {turns: 7, T0: 0.02, drop: 0.25, barrelRevPerHour: 1 / 8, eta: 0.9}; // N·m, caída de par, rendimiento por engrane
export const MOTION = [{name: 'Piñón de cañón → rueda de minutos', zDrive: 12, zDriven: 36}, {name: 'Piñón de minutos → rueda de horas', zDrive: 10, zDriven: 40}];

/** Revoluciones por hora de cada árbol (barrilete, centro, tercera, cuarta, escape). */
export function arbors() {
  const rph = [SPRING.barrelRevPerHour];
  for (const row of TREE) rph.push(rph[rph.length - 1] * (row.z / row.driven.z));
  // rph[0]=barrilete; rph[1]=árbol del centro (piñón del centro + rueda del centro); ...
  // El barrilete mueve el piñón del centro: el árbol del centro gira (z_barrilete/z_piñón) veces más rápido.
  return {barrel: rph[0], center: rph[1], third: rph[2], fourth: rph[3], escape: rph[4]};
}

export const ratioTotal = () => {
  const a = arbors();
  return a.escape / a.barrel;
};

/** Frecuencia de las alternancias del escape [1/s] y de la rueda de escape [rev/s]. */
export const beatsPerSecond = () => 2 * BAL.f;
export const escapeRevPerSecond = () => beatsPerSecond() / ESC.beatsPerRev;
export const vph = () => beatsPerSecond() * 3600;

/** Frecuencia natural del volante-espiral: f = 1/(2π)·√(κ/I)  =>  κ = I·(2πf)² [N·m/rad]. */
export const hairspringK = () => BAL.I * (2 * Math.PI * BAL.f) ** 2;

/** Cuánto de la cuerda queda (0..1) tras `hours` horas desde cuerda completa. */
export const windLeft = (hours) => Math.max(0, 1 - hours / (SPRING.turns / SPRING.barrelRevPerHour));
export const powerReserveHours = () => SPRING.turns / SPRING.barrelRevPerHour;

/** Par del barrilete [N·m] con `wind` 0..1 (cuerda restante). */
export const barrelTorque = (wind) => SPRING.T0 * (1 - SPRING.drop * (1 - wind));
/** Par que llega al escape [N·m]: reducido por la relación y los engranajes (4 pares, rendimiento SPRING.eta cada uno). */
export const escapeTorque = (wind) => (barrelTorque(wind) / ratioTotal()) * SPRING.eta ** 4;
/** Potencia consumida [W]: par del barrilete × su velocidad angular. */
export const powerW = (wind) => barrelTorque(wind) * 2 * Math.PI * SPRING.barrelRevPerHour / 3600;
/** Amplitud del volante [°] (más cuerda → más amplitud). */
export const amplitude = (wind) => BAL.A_low + (BAL.A_full - BAL.A_low) * wind;
/** Par máximo del espiral [N·m] a la amplitud A. */
export const hairspringTorque = (wind) => hairspringK() * (amplitude(wind) * Math.PI) / 180;

// ---------- cinemática en función del tiempo simulado tau [s] ----------
const D2R = Math.PI / 180;
const sstep = (x) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** Ángulo del volante [rad]. */
export const balanceAngle = (tau, wind = 1) => amplitude(wind) * D2R * Math.sin(2 * Math.PI * BAL.f * tau);
/** Ángulo de la palanca [rad]: salta de tope a tope al cruzar el volante por su centro (rango ±lift/2). */
export const leverAngle = (tau, wind = 1) => {
  const th = balanceAngle(tau, wind);
  const w = (BAL.lift / 2) * D2R;
  return -BAL.banking * D2R * Math.min(1, Math.max(-1, th / w));
};
/** Fracción del paso: ventana (en semiperiodos) en la que la palanca está entre topes. */
export const flipWindow = (wind = 1) => Math.asin((BAL.lift / 2) / amplitude(wind)) / Math.PI;
/** Rueda de escape [rad]: avanza medio diente (12°) con cada cruce del volante. */
export const escapeStepAngle = (tau, wind = 1) => {
  const m = 2 * BAL.f * tau; // alternancias transcurridas
  const c = Math.round(m);
  const r = m - c;
  const d = flipWindow(wind);
  const F = c - 0.5 + sstep((r + d) / (2 * d)); // media = m: en el cruce (r=0) vale c
  return F * (360 / ESC.beatsPerRev) * D2R;
};
/** Ángulo medio (sin pasos) de la rueda de escape, el de un giro continuo equivalente. */
export const escapeMeanAngle = (tau) => 2 * Math.PI * escapeRevPerSecond() * tau;

/** Ángulo [rad] de cada árbol con giro continuo (para tiempos rápidos). */
export function trainAngles(tau) {
  const a = arbors();
  const f = (rph) => 2 * Math.PI * (rph / 3600) * tau;
  return {barrel: f(a.barrel), center: f(a.center), third: f(a.third), fourth: f(a.fourth), escape: f(a.escape)};
}

/** Agujas: ángulos [rad] respecto a las 12, en sentido horario. */
export function hands(tau, t0 = 10 * 3600 + 8 * 60) {
  const t = t0 + tau;
  const sec = (t % 60);
  return {
    hour: 2 * Math.PI * ((t / 3600) % 12) / 12,
    minute: 2 * Math.PI * ((t / 60) % 60) / 60,
    second: 2 * Math.PI * sec / 60,
    clock: t,
  };
}
export function hhmmss(t) {
  const s = Math.floor(((t % 86400) + 86400) % 86400);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Disposición plana: posición [mm] y radios de paso de cada árbol del tren, en un plato de 17 mm de radio. */
export function layout() {
  const rp = (z, m) => (z * m) / 2;
  const P = {};
  const ang = {barrel: 205, third: 38, fourth: 280, escape: 300}; // dirección (°) desde el árbol anterior hacia el siguiente
  P.center = {x: 0, y: 0};
  const place = (from, toId, d, deg) => ({x: from.x + d * Math.cos(deg * D2R), y: from.y + d * Math.sin(deg * D2R)});
  const [bar, cen, thi, fou] = TREE;
  P.barrel = place(P.center, 'barrel', rp(bar.z, bar.m) + rp(bar.driven.z, bar.m), ang.barrel);
  P.third = place(P.center, 'third', rp(cen.z, cen.m) + rp(cen.driven.z, cen.m), ang.third);
  P.fourth = place(P.third, 'fourth', rp(thi.z, thi.m) + rp(thi.driven.z, thi.m), ang.fourth);
  P.escape = place(P.fourth, 'escape', rp(fou.z, fou.m) + rp(fou.driven.z, fou.m), ang.escape);
  // áncora y volante: pivote de la palanca a 4,4 mm de la rueda de escape hacia el centro; el volante, alineado al otro lado
  P.lever = place(P.escape, 'lever', 4.4, 200);
  P.balance = place(P.lever, 'balance', 5.2, 200);
  return P;
}
