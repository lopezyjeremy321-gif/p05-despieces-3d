import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/clock/physics.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('tren: centro 1 rev/h (minutero), cuarta 60 rev/h (1 rpm), escape 720 rev/h (12 rpm)', () => {
  const a = C.arbors();
  near(a.center, 1, 1e-12);
  near(a.fourth, 60, 1e-9);
  near(a.escape, 720, 1e-9);
  near(a.third, 8, 1e-12);
});

test('relación total barrilete -> escape = 5760:1 = 8 x 8 x 7,5 x 12', () => {
  near(C.ratioTotal(), 8 * 8 * 7.5 * 12, 1e-9);
  near(C.ratioTotal(), 5760, 1e-9);
});

test('frecuencia: 3 Hz = 6 alternancias/s = 21 600 alt/h; escape 15 dientes, 30 pasos/vuelta', () => {
  assert.equal(C.beatsPerSecond(), 6);
  assert.equal(C.vph(), 21600);
  // consistencia cruzada: vueltas/h del escape x pasos por vuelta = alternancias/h
  near(C.arbors().escape * C.ESC.beatsPerRev, C.vph(), 1e-6);
  near(C.escapeRevPerSecond() * 60, 12, 1e-12);
});

test('espiral: f = (1/2π)·√(κ/I) devuelve 3 Hz', () => {
  const f = Math.sqrt(C.hairspringK() / C.BAL.I) / (2 * Math.PI);
  near(f, C.BAL.f, 1e-9);
});

test('cuerda: reserva = 7 vueltas x 8 h = 56 h; par y amplitud decrecen con la cuerda', () => {
  assert.equal(C.powerReserveHours(), 56);
  assert.ok(C.barrelTorque(1) > C.barrelTorque(0.1));
  assert.ok(C.amplitude(1) > C.amplitude(0.1));
  near(C.windLeft(28), 0.5, 1e-12);
});

test('conservación de potencia: P_barrilete = P_escape/rendimiento^4', () => {
  const w = 1;
  const wb = (2 * Math.PI * C.SPRING.barrelRevPerHour) / 3600;
  const we = (2 * Math.PI * C.arbors().escape) / 3600;
  const pIn = C.barrelTorque(w) * wb;
  const pOut = C.escapeTorque(w) * we;
  near(pOut, pIn * C.SPRING.eta ** 4, pIn * 1e-9);
  near(C.powerW(w), pIn, 1e-15);
  assert.ok(C.powerW(1) > 1e-6 && C.powerW(1) < 2e-5); // microvatios
});

test('agujas: tras 1 h el minutero da 360° y la horaria 30° (relación 12:1 del motion work)', () => {
  assert.equal((C.MOTION[0].zDriven / C.MOTION[0].zDrive) * (C.MOTION[1].zDriven / C.MOTION[1].zDrive), 12);
  const a = C.hands(0, 0);
  const b = C.hands(3600, 0);
  near(b.hour, (30 * Math.PI) / 180, 1e-9);
  near(C.hands(60, 0).minute, (6 * Math.PI) / 180, 1e-9);
  near(C.hands(15, 0).second, (90 * Math.PI) / 180, 1e-9);
});

test('hhmmss formatea', () => {
  assert.equal(C.hhmmss(10 * 3600 + 8 * 60 + 5), '10:08:05');
  assert.equal(C.hhmmss(86400 + 61), '00:01:01');
});

test('volante: amplitud ±A a 3 Hz; palanca entre topes y salta en cada cruce', () => {
  const A = (C.amplitude(1) * Math.PI) / 180;
  near(C.balanceAngle(1 / 12), A, 1e-9); // cuarto de periodo (T=1/3 s)
  for (let i = 0; i < 400; i++) {
    const l = C.leverAngle(i / 1000);
    assert.ok(Math.abs(l) <= (C.BAL.banking * Math.PI) / 180 + 1e-12);
  }
  const l1 = C.leverAngle(1 / 12); // tras un cruce hacia +
  const l2 = C.leverAngle(1 / 12 + 1 / 6); // medio periodo después
  assert.ok(l1 * l2 < 0, 'cambia de lado');
});

test('escape por pasos: sigue al giro continuo a ±medio paso y avanza 12° por alternancia', () => {
  for (let i = 0; i < 300; i++) {
    const tau = i * 0.0173;
    const stepErr = Math.abs(C.escapeStepAngle(tau) - C.escapeMeanAngle(tau));
    assert.ok(stepErr <= (12 * Math.PI) / 180 / 2 + 1e-9, `tau=${tau} err=${stepErr}`);
  }
  // pasos de 12° entre dos puntos fuera de la ventana de salto
  const a = C.escapeStepAngle(0.5 / 6 / 1.0 + 0.0);
  const b = C.escapeStepAngle(0.5 / 6 + 1 / 6);
  near(b - a, (12 * Math.PI) / 180, 1e-6);
});

test('disposición: los pares engranados están a módulo·(z1+z2)/2 y todo cabe en el plato', () => {
  const L = C.layout();
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const T = C.TREE;
  near(d(L.center, L.barrel), (T[0].m * (T[0].z + T[0].driven.z)) / 2, 1e-9);
  near(d(L.center, L.third), (T[1].m * (T[1].z + T[1].driven.z)) / 2, 1e-9);
  near(d(L.third, L.fourth), (T[2].m * (T[2].z + T[2].driven.z)) / 2, 1e-9);
  near(d(L.fourth, L.escape), (T[3].m * (T[3].z + T[3].driven.z)) / 2, 1e-9);
  for (const k of ['barrel', 'third', 'fourth', 'escape']) assert.ok(Math.hypot(L[k].x, L[k].y) < 19);
});
