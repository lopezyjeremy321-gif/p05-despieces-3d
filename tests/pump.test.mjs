import test from 'node:test';
import assert from 'node:assert/strict';
import {PUMP, G, state, headPump, headSystem, operatingPoint, u2Of, slip, hEuler, curves, kValve} from '../src/pump/physics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('velocidad periférica u2 = pi*D2*n/60 (cálculo a mano: 30,369 m/s a 2900 rpm)', () => {
  near(u2Of(2900), (Math.PI * 0.2 * 2900) / 60, 1e-9);
  near(u2Of(2900), 30.369, 1e-3);
});

test('deslizamiento de Wiesner entre 0,7 y 0,95 para 6 álabes a 25 grados', () => {
  const s = slip();
  assert.ok(s > 0.7 && s < 0.95, String(s));
});

test('altura de Euler a caudal cero = sigma*u2²/g', () => {
  near(hEuler(0, 2900), (slip() * u2Of(2900) ** 2) / G, 1e-9);
});

test('el punto de operación cae sobre ambas curvas (bomba y sistema) a 1e-6 m', () => {
  for (const [n, o] of [[2900, 1], [2900, 0.4], [3300, 0.7], [2400, 1]]) {
    const Q = operatingPoint(n, o);
    assert.ok(Q > 0);
    near(headPump(Q, n), headSystem(Q, o), 1e-6, `n=${n} o=${o}`);
  }
});

test('leyes de afinidad: puntos homólogos escalan Q~n, H~n², P~n³', () => {
  const k = 1.15;
  const a = headPump(PUMP.Q0, PUMP.n0);
  const b = headPump(PUMP.Q0 * k, PUMP.n0 * k);
  near(b / a, k * k, 1e-9, 'H');
  const Ppump = (Q, n) => {
    const p = PUMP;
    const w = (n * 2 * Math.PI) / 60;
    const He = hEuler(Q, n);
    return (p.rho * G * (Q / p.etaV) * He + p.cDF * p.rho * w ** 3 * (p.D2 / 2) ** 5) / p.etaM;
  };
  near(Ppump(PUMP.Q0 * k, PUMP.n0 * k) / Ppump(PUMP.Q0, PUMP.n0), k ** 3, 1e-9, 'P');
});

test('balance de energía: P_eje > P_hidráulica y 0 < rendimiento < 1', () => {
  for (const o of [1, 0.6, 0.3, 0.1]) {
    const s = state(2900, o);
    assert.ok(s.Pshaft > s.Phyd);
    assert.ok(s.eta > 0 && s.eta < 1);
    near(s.Phyd, PUMP.rho * G * s.Q * s.H, 1e-6);
  }
});

test('punto de diseño: ~50 m³/h, 53 m, 10 kW, rendimiento 70-75 %, Nq entre 10 y 30', () => {
  const s = state(2900, 1);
  near(s.Qh, 50, 2, 'Q');
  near(s.H, 53, 2, 'H');
  near(s.Pshaft / 1e3, 10.1, 0.8, 'P');
  assert.ok(s.eta > 0.7 && s.eta < 0.75, String(s.eta));
  assert.ok(s.nq > 10 && s.nq < 30, String(s.nq));
});

test('cerrar la válvula baja el caudal de forma monótona; cerrada = caudal 0', () => {
  let prev = Infinity;
  for (const o of [1, 0.7, 0.5, 0.3, 0.15, 0.05]) {
    const Q = operatingPoint(2900, o);
    assert.ok(Q < prev, `o=${o}`);
    prev = Q;
  }
  assert.equal(operatingPoint(2900, 0), 0);
});

test('por debajo de la altura estática la bomba no entrega caudal (a 1500 rpm)', () => {
  const s = state(1500, 1);
  assert.equal(s.Q, 0);
  assert.ok(s.H0 < PUMP.Hstat);
  assert.equal(s.flowing, false);
});

test('NPSHr crece con las rpm; a mucha altura de aspiración el margen se agota (cavitación)', () => {
  assert.ok(state(3300, 1).npshr > state(2400, 1).npshr);
  assert.equal(state(2900, 1, 1).cav, false);
  assert.equal(state(3400, 1, -7).cav, true);
});

test('la válvula: K crece al cerrar y es 0 abierta', () => {
  assert.equal(kValve(1), 0);
  assert.ok(kValve(0.3) > kValve(0.6));
});

test('curvas: 49 puntos, la del sistema parte de la altura estática', () => {
  const c = curves(2900, 1);
  assert.equal(c.pump.length, 49);
  near(c.sys[0][1], PUMP.Hstat, 1e-9);
});
