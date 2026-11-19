// Bomba centrífuga de una etapa, aspiración axial, voluta, impulsor cerrado de 6 álabes curvados hacia atrás.
// Todo en SI. Sin three.js: el modelo 3D y el panel leen estas mismas funciones.
// Los coeficientes de pérdidas (HF, HS, CDF...) son de modelo, ajustados para dar una bomba plausible de ~11 kW;
// NO son datos de un fabricante. Las fórmulas (Euler, deslizamiento de Wiesner, leyes de afinidad, NPSH) son estándar.

export const G = 9.80665;

export const PUMP = {
  D2: 0.2, // diámetro exterior del impulsor [m]
  D1: 0.08, // diámetro del ojo de entrada [m]
  dh: 0.025, // diámetro del cubo/eje en el ojo [m]
  b2: 0.016, // ancho del álabe a la salida [m]
  Z: 6, // álabes
  beta2: 25, // ángulo de salida respecto a la tangente [°]
  eps: 0.93, // factor de bloqueo por espesor de álabes
  n0: 2900, // rpm de diseño (motor de 2 polos, 50 Hz con deslizamiento)
  rho: 998, // agua a 20 °C [kg/m³]
  etaV: 0.97, // rendimiento volumétrico (fuga por el anillo de desgaste)
  etaM: 0.98, // rendimiento mecánico (cojinetes y sello)
  cDF: 0.002, // coeficiente de fricción de disco: P_df = cDF·ρ·ω³·r2⁵
  HF: 67000, // pérdida por fricción en canales [m·s²/m⁶]·Q²
  HS: 60000, // pérdida por choque (fuera del caudal de diseño)
  Q0: 0.0139, // caudal de diseño a n0 [m³/s] (50 m³/h)
  // sistema: depósito a depósito
  Hstat: 30, // altura estática [m]
  Kpipe: 119000, // pérdidas de tubería [m·s²/m⁶]
  Kvalve: 20000, // coeficiente de válvula: Kv·((1-o)/o)²
  // aspiración
  hAtm: 10.1, // presión atmosférica a nivel del mar en altura de agua [m]
  hVap: 0.24, // presión de vapor a 20 °C [m]
  zS: 1.0, // nivel del depósito sobre el eje (aspiración inundada) [m]
  Ks: 2500, // pérdidas en la tubería de aspiración [m·s²/m⁶]
  lamC: 1.2,
  lamW: 0.3,
  Qmax: 0.045,
};

const RAD = Math.PI / 180;
export const rpm2w = (n) => (n * 2 * Math.PI) / 60;
export const u2Of = (n, p = PUMP) => rpm2w(n) * (p.D2 / 2);

/** Factor de deslizamiento de Wiesner. */
export const slip = (p = PUMP) => 1 - Math.sqrt(Math.sin(p.beta2 * RAD)) / Math.pow(p.Z, 0.7);

/** Triángulo de velocidades a la salida del impulsor (Q = caudal útil de la bomba). */
export function outlet(Q, n, p = PUMP) {
  const u2 = u2Of(n, p);
  const Qi = Q / p.etaV;
  const cm2 = Qi / (Math.PI * p.D2 * p.b2 * p.eps);
  const cu2 = slip(p) * u2 - cm2 / Math.tan(p.beta2 * RAD);
  const c2 = Math.hypot(cm2, cu2);
  return {u2, cm2, cu2, c2, Qi};
}

/** Altura de Euler (con deslizamiento) [m]. */
export const hEuler = (Q, n, p = PUMP) => {
  const o = outlet(Q, n, p);
  return (o.u2 * o.cu2) / G;
};

/** Altura manométrica de la bomba a n rpm y Q m³/s. */
export function headPump(Q, n, p = PUMP) {
  const qb = (p.Q0 * n) / p.n0;
  return hEuler(Q, n, p) - p.HF * Q * Q - p.HS * (Q - qb) * (Q - qb);
}

export const kValve = (open, p = PUMP) => {
  const o = Math.min(1, Math.max(0.02, open));
  return p.Kvalve * Math.pow((1 - o) / o, 2);
};
export const headSystem = (Q, open, p = PUMP) => p.Hstat + (p.Kpipe + kValve(open, p)) * Q * Q;

/** Punto de operación: cruce de la curva de la bomba con la del sistema (bisección). */
export function operatingPoint(n, open, p = PUMP) {
  if (open <= 0.005 || n < 1) return 0;
  const f = (Q) => headPump(Q, n, p) - headSystem(Q, open, p);
  if (f(0) <= 0) return 0;
  let lo = 0;
  let hi = p.Qmax * Math.max(1, n / p.n0);
  if (f(hi) > 0) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Todas las magnitudes del punto de operación, desde (n, apertura de válvula). */
export function state(n, open, zS = PUMP.zS, p = PUMP) {
  const Q = operatingPoint(n, open, p);
  const w = rpm2w(n);
  const H = Q > 0 ? headPump(Q, n, p) : headPump(0, n, p);
  const o = outlet(Q, n, p);
  const He = (o.u2 * o.cu2) / G;
  const Phyd = p.rho * G * Q * H;
  const Pfluid = (p.rho * G * o.Qi * He) / 1; // potencia cedida al fluido por los álabes
  const Pdf = p.cDF * p.rho * w ** 3 * (p.D2 / 2) ** 5;
  const Pshaft = (Pfluid + Pdf) / p.etaM;
  const eta = Pshaft > 1 && Phyd > 0 ? Phyd / Pshaft : 0;
  const torque = w > 0 ? Pshaft / w : 0;
  // aspiración
  const A1 = (Math.PI / 4) * (p.D1 ** 2 - p.dh ** 2);
  const c1 = o.Qi / A1;
  const u1 = w * (p.D1 / 2);
  const w1 = Math.hypot(c1, u1);
  const npshr = (p.lamC * c1 * c1 + p.lamW * w1 * w1) / (2 * G);
  const npsha = p.hAtm - p.hVap + zS - p.Ks * Q * Q;
  const qbep = (p.Q0 * n) / p.n0;
  const Hbep = headPump(qbep, n, p);
  const nq = n > 0 && Hbep > 0 ? (n * Math.sqrt(p.Q0)) / Math.pow(headPump(p.Q0, p.n0, p), 0.75) : 0;
  return {
    n, open, w, Q, Qh: Q * 3600, Ql: Q * 1000, H, dp: (p.rho * G * H) / 1e5, Phyd, Pshaft, Pdf, eta, torque,
    u2: o.u2, cu2: o.cu2, cm2: o.cm2, c1, npshr, npsha, margin: npsha - npshr, cav: npsha - npshr < 0.5,
    qbep, Hbep, nq, H0: headPump(0, n, p), flowing: Q > 1e-6, Hsys: headSystem(Q, open, p), Kv: kValve(open, p),
  };
}

/** Curvas para el gráfico H–Q. */
export function curves(n, open, p = PUMP, N = 48) {
  const qm = p.Qmax * 1.05;
  const pump = [];
  const sys = [];
  for (let i = 0; i <= N; i++) {
    const Q = (qm * i) / N;
    pump.push([Q, headPump(Q, n, p)]);
    sys.push([Q, headSystem(Q, open, p)]);
  }
  return {pump, sys, qm};
}
