// Geometría del movimiento, hecha en código (sin .glb). Unidades: 1 = 1 mm. Marco local: plano XY, Z hacia arriba;
// la raíz gira -90° en X para que Z local = Y del mundo. Local (x, y, z) -> mundo (x, z, -y).
import * as C from './physics.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const L = {l2: 1.4, l3: 2.8, l4: 4.2, l5: 5.6, l6: 7.0}; // alturas de los niveles de ruedas
export const EXPLODE = {barrel: 3.5, train: 7.5, escape: 12.5, balance: 17.5, bridges: 24, dial: 31};
export const CUT_X = [24, -0.3];
const POS = C.layout();
const ROW = Object.fromEntries(C.TREE.map((r) => [r.id, r]));
const rp = (z, m) => (z * m) / 2;
const dirTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

/** Perfil de una rueda dentada con z dientes (módulo m), diente trapezoidal centrado en el ángulo 0. */
function gearShape(T, z, m, o = {}) {
  const r = rp(z, m);
  const ra = r + m;
  const rf = Math.max(0.12, r - 1.2 * m);
  const p = TAU / z;
  const sh = new T.Shape();
  let first = true;
  const pt = (a, rr) => {
    const x = rr * Math.cos(a);
    const y = rr * Math.sin(a);
    if (first) (sh.moveTo(x, y), (first = false));
    else sh.lineTo(x, y);
  };
  for (let k = 0; k < z; k++) {
    const a = k * p;
    pt(a - 0.31 * p, rf);
    pt(a - 0.2 * p, rf);
    pt(a - 0.1 * p, ra);
    pt(a + 0.1 * p, ra);
    pt(a + 0.2 * p, rf);
    pt(a + 0.31 * p, rf);
  }
  sh.closePath();
  if (o.spokes) {
    const rim = rf - o.rim;
    const hub = o.hub;
    const n = o.spokes;
    const gap = Math.asin(Math.min(0.9, o.spokeW / 2 / ((rim + hub) / 2)));
    for (let i = 0; i < n; i++) {
      const a0 = (TAU * i) / n + gap;
      const a1 = (TAU * (i + 1)) / n - gap;
      const h = new T.Path();
      const N = 10;
      for (let j = 0; j <= N; j++) {
        const a = a0 + ((a1 - a0) * j) / N;
        j ? h.lineTo(rim * Math.cos(a), rim * Math.sin(a)) : h.moveTo(rim * Math.cos(a), rim * Math.sin(a));
      }
      for (let j = N; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / N;
        h.lineTo(hub * Math.cos(a), hub * Math.sin(a));
      }
      h.closePath();
      sh.holes.push(h);
    }
  }
  return sh;
}
/** Barra con extremos redondos entre dos puntos (para puentes). */
function stadium(T, a, b, w) {
  const d = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const sh = new T.Shape();
  const r = w / 2;
  const N = 14;
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push([len + r * Math.cos(-Math.PI / 2 + (Math.PI * i) / N), r * Math.sin(-Math.PI / 2 + (Math.PI * i) / N)]);
  for (let i = 0; i <= N; i++) pts.push([r * Math.cos(Math.PI / 2 + (Math.PI * i) / N), r * Math.sin(Math.PI / 2 + (Math.PI * i) / N)]);
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return {shape: sh, x: a.x, y: a.y, rot: d};
}

export function buildClock({THREE, scene, accent}) {
  const T = THREE;
  const root = new T.Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);
  const clip = new T.Plane(new T.Vector3(1, 0, 0), 60);
  const parts = {};
  const AC = accent.clone();
  const RUBY = new T.Color(0x9d1b2d);
  const PAL = {
    plate: {c: 0x8f877a, m: 0.8, r: 0.45},
    bridge: {c: 0x35322e, m: 0.85, r: 0.34},
    brass: {c: 0xc79a3e, m: 1, r: 0.3},
    steel: {c: 0x9aa3ab, m: 1, r: 0.28},
    dark: {c: 0x2c2823, m: 0.4, r: 0.5},
    dial: {c: 0xf3eee4, m: 0.1, r: 0.7},
  };
  const mat = (k, o = {}) => new T.MeshStandardMaterial({color: PAL[k].c, metalness: PAL[k].m, roughness: PAL[k].r, side: T.DoubleSide, ...o});
  const ruby = () => new T.MeshStandardMaterial({color: RUBY, metalness: 0.1, roughness: 0.15, emissive: RUBY.clone().multiplyScalar(0.25)});
  const reg = (id, group, o = {}) => {
    const mats = [];
    group.traverse((x) => x.material && mats.push(x.material));
    for (const mm of mats) {
      if (o.xray) mm.userData.xray = true;
      if (!o.noclip) {
        mm.clippingPlanes = [clip];
        mm.clipShadows = true;
      }
    }
    parts[id] = {group, mats};
    root.add(group);
  };
  const add = (g, grp, k, z) => {
    const mm = new T.Mesh(g, typeof k === 'string' ? mat(k) : k);
    mm.castShadow = true;
    mm.receiveShadow = true;
    mm.position.z = z;
    grp.add(mm);
    return mm;
  };
  const ext = (shape, depth) => new T.ExtrudeGeometry(shape, {depth, bevelEnabled: false, curveSegments: 40});
  const cyl = (r, h, seg = 20) => {
    const g = new T.CylinderGeometry(r, r, h, seg);
    g.rotateX(Math.PI / 2);
    return g;
  };

  // ---------------------------------------------------------------- platina
  {
    const g = new T.Group();
    add(cyl(19.2, 1.2, 96), g, 'plate', -0.6);
    const ring = new T.Shape();
    ring.absarc(0, 0, 20.4, 0, TAU, false);
    const hole = new T.Path();
    hole.absarc(0, 0, 19.2, 0, TAU, true);
    ring.holes.push(hole);
    add(ext(ring, 2.2), g, 'dark', -1.2);
    // rubíes de las pivotes en la platina
    for (const k of ['barrel', 'center', 'third', 'fourth', 'escape', 'lever', 'balance']) {
      const p = POS[k];
      const j = add(cyl(0.7, 0.35, 18), g, ruby(), 0.18);
      j.position.set(p.x, p.y, 0.18);
      j.castShadow = false;
    }
    reg('plate', g);
  }
  // ---------------------------------------------------------------- puentes (esqueletados): se aclaran con el corte
  {
    const g = new T.Group();
    const bars = [
      [POS.barrel, POS.center, 2.6],
      [POS.center, POS.third, 2.2],
      [POS.third, POS.fourth, 2.2],
      [POS.fourth, POS.escape, 2.2],
      [POS.balance, {x: POS.balance.x - 7.5, y: POS.balance.y - 2.6}, 2.4],
      [POS.balance, POS.lever, 2.0],
    ];
    for (const [a, b, w] of bars) {
      const s = stadium(T, a, b, w);
      const m = add(ext(s.shape, 0.9), g, 'bridge', 8.0);
      m.position.set(s.x, s.y, 8.0);
      m.rotation.z = s.rot;
    }
    for (const k of ['barrel', 'center', 'third', 'fourth', 'escape', 'lever', 'balance']) {
      const p = POS[k];
      const j = add(cyl(0.62, 0.4, 18), g, ruby(), 8.95);
      j.position.set(p.x, p.y, 8.95);
      // tornillo
      const sc = add(cyl(0.28, 0.25, 10), g, 'brass', 9.2);
      sc.position.set(p.x + 1.15, p.y + 0.6, 9.1);
    }
    reg('bridges', g, {xray: true});
  }

  const rot = {}; // grupos que giran en cada cuadro
  // ---------------------------------------------------------------- barrilete (con muelle real en espiral)
  {
    const g = new T.Group();
    const b = POS.barrel;
    const holder = new T.Group();
    holder.position.set(b.x, b.y, 0);
    const row = ROW.barrel;
    const teeth = add(ext(gearShape(T, row.z, row.m), 0.45), holder, 'brass', L.l2 - 0.2);
    void teeth;
    const drumR = rp(row.z, row.m) - 0.5;
    const wall = new T.Shape();
    wall.absarc(0, 0, drumR, 0, TAU, false);
    const inner = new T.Path();
    inner.absarc(0, 0, drumR - 0.35, 0, TAU, true);
    wall.holes.push(inner);
    add(ext(wall, 1.5), holder, 'brass', L.l2 - 0.1);
    // tapa del barrilete (transparente al cortar)
    const lid = add(cyl(drumR, 0.18, 64), holder, mat('brass', {transparent: false}), L.l2 + 1.4);
    lid.userData.lid = true;
    // muelle: espiral de arquímedes dentro del tambor
    const sp = [];
    const turns = 9;
    for (let i = 0; i <= 260; i++) {
      const a = (i / 260) * turns * TAU;
      const r = 1.6 + (i / 260) * (drumR - 0.7 - 1.6);
      sp.push(new T.Vector3(r * Math.cos(a), r * Math.sin(a), 0));
    }
    const spg = new T.TubeGeometry(new T.CatmullRomCurve3(sp), 520, 0.11, 4);
    add(spg, holder, 'steel', L.l2 + 0.7);
    const ax = add(cyl(0.75, 2.2, 20), holder, 'steel', L.l2 + 0.6);
    void ax;
    g.add(holder);
    rot.barrel = holder;
    reg('barrel', g);
  }

  // ---------------------------------------------------------------- tren: centro, tercera, cuarta
  const pinion = (z, m) => ext(gearShape(T, z, m), 0.5);
  const wheel = (z, m, spokes = 5) => ext(gearShape(T, z, m, {spokes, rim: 0.6, hub: 1.3, spokeW: 0.5}), 0.4);
  const arborShaft = (h) => cyl(0.3, h, 12);
  {
    const g = new T.Group();
    const mk = (id, lvlPinion, lvlWheel, wz, wm, pz, pm, shaftTop) => {
      const h = new T.Group();
      h.position.set(POS[id].x, POS[id].y, 0);
      add(pinion(pz, pm), h, 'steel', lvlPinion - 0.25);
      add(wheel(wz, wm), h, 'brass', lvlWheel - 0.2);
      const sh = add(arborShaft(shaftTop), h, 'steel', shaftTop / 2);
      void sh;
      g.add(h);
      rot[id] = h;
    };
    // centro: piñón (con barrilete) en l2, rueda en l3; tercera: piñón l3, rueda l2; cuarta: piñón l2, rueda l4
    mk('center', L.l2, L.l3, ROW.center.z, ROW.center.m, ROW.barrel.driven.z, ROW.barrel.m, 9.6);
    mk('third', L.l3, L.l2, ROW.third.z, ROW.third.m, ROW.center.driven.z, ROW.center.m, 7.6);
    mk('fourth', L.l2, L.l4, ROW.fourth.z, ROW.fourth.m, ROW.third.driven.z, ROW.third.m, 10.0);
    // cañón + ruedas de minutos y horas (motion work) bajo las agujas
    const hubm = new T.Group();
    hubm.position.set(0, 0, 0);
    add(cyl(0.9, 1.4, 24), hubm, 'steel', 9.3);
    g.add(hubm);
    reg('train', g);
  }

  // ---------------------------------------------------------------- escape: rueda de escape + palanca (áncora) con rubíes
  const lev = {pivot: POS.lever};
  {
    const g = new T.Group();
    const h = new T.Group();
    h.position.set(POS.escape.x, POS.escape.y, 0);
    add(pinion(C.TREE[3].driven.z, C.TREE[3].m), h, 'steel', L.l4 - 0.25);
    // rueda de escape: 15 dientes de trinquete
    const es = new T.Shape();
    const n = C.ESC.teeth;
    const rT = 3.4;
    const rR = 2.55;
    for (let k = 0; k < n; k++) {
      const a = (TAU * k) / n;
      const p = TAU / n;
      const pts = [[rR, a], [rT, a + 0.18 * p], [rT, a + 0.3 * p], [rR + 0.15, a + 0.95 * p]];
      pts.forEach(([r, aa], i) => (k === 0 && i === 0 ? es.moveTo(r * Math.cos(aa), r * Math.sin(aa)) : es.lineTo(r * Math.cos(aa), r * Math.sin(aa))));
    }
    es.closePath();
    for (let i = 0; i < 5; i++) {
      const a0 = (TAU * i) / 5 + 0.2;
      const a1 = (TAU * (i + 1)) / 5 - 0.2;
      const hp = new T.Path();
      for (let j = 0; j <= 8; j++) {
        const a = a0 + ((a1 - a0) * j) / 8;
        j ? hp.lineTo(2.1 * Math.cos(a), 2.1 * Math.sin(a)) : hp.moveTo(2.1 * Math.cos(a), 2.1 * Math.sin(a));
      }
      for (let j = 8; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / 8;
        hp.lineTo(0.85 * Math.cos(a), 0.85 * Math.sin(a));
      }
      hp.closePath();
      es.holes.push(hp);
    }
    add(ext(es, 0.35), h, 'brass', L.l5 - 0.17);
    add(arborShaft(6.4), h, 'steel', 3.2);
    g.add(h);
    rot.escape = h;
    // palanca
    const lv = new T.Group();
    lv.position.set(POS.lever.x, POS.lever.y, 0);
    const toE = dirTo(POS.lever, POS.escape);
    const toB = dirTo(POS.lever, POS.balance);
    const sh = new T.Shape();
    const armL = 2.4;
    const arm = (ang) => [armL * Math.cos(ang), armL * Math.sin(ang)];
    const [x1, y1] = arm(toE + 0.72);
    const [x2, y2] = arm(toE - 0.72);
    const tail = 4.4;
    const w = 0.42;
    const tx = tail * Math.cos(toB);
    const ty = tail * Math.sin(toB);
    const nx = -Math.sin(toB) * w;
    const ny = Math.cos(toB) * w;
    sh.moveTo(x1 + 0.3 * Math.cos(toE + 0.72 + Math.PI / 2), y1 + 0.3 * Math.sin(toE + 0.72 + Math.PI / 2));
    sh.lineTo(x1 - 0.3 * Math.cos(toE + 0.72 + Math.PI / 2), y1 - 0.3 * Math.sin(toE + 0.72 + Math.PI / 2));
    sh.lineTo(0.7 * Math.cos(toE + 0.3), 0.7 * Math.sin(toE + 0.3));
    sh.lineTo(0.7 * Math.cos(toE - 0.3), 0.7 * Math.sin(toE - 0.3));
    sh.lineTo(x2 - 0.3 * Math.cos(toE - 0.72 + Math.PI / 2), y2 - 0.3 * Math.sin(toE - 0.72 + Math.PI / 2));
    sh.lineTo(x2 + 0.3 * Math.cos(toE - 0.72 + Math.PI / 2), y2 + 0.3 * Math.sin(toE - 0.72 + Math.PI / 2));
    sh.lineTo(0.5 * Math.cos(toE - 0.3), 0.5 * Math.sin(toE - 0.3));
    sh.lineTo(0.5 * Math.cos(toB - 1.2), 0.5 * Math.sin(toB - 1.2));
    sh.lineTo(tx - nx - 0.9 * Math.cos(toB), ty - ny - 0.9 * Math.sin(toB));
    sh.lineTo(tx - nx * 0.35, ty - ny * 0.35); // cuerno
    sh.lineTo(tx - nx * 0.35 - 0.1 * Math.cos(toB), ty - ny * 0.35 - 0.1 * Math.sin(toB));
    sh.lineTo(tx - 1.0 * Math.cos(toB), ty - 1.0 * Math.sin(toB));
    sh.lineTo(tx + nx * 0.35 - 0.1 * Math.cos(toB), ty + ny * 0.35 - 0.1 * Math.sin(toB));
    sh.lineTo(tx + nx * 0.35, ty + ny * 0.35);
    sh.lineTo(tx + nx - 0.9 * Math.cos(toB), ty + ny - 0.9 * Math.sin(toB));
    sh.lineTo(0.5 * Math.cos(toB + 1.2), 0.5 * Math.sin(toB + 1.2));
    sh.closePath();
    add(ext(sh, 0.3), lv, 'steel', L.l5 - 0.15);
    // piedras de paleta (rubíes) donde la palanca toca los dientes
    for (const s of [1, -1]) {
      const a = toE + s * 0.72;
      const st = add(new T.BoxGeometry(0.9, 0.34, 0.5), lv, ruby(), L.l5);
      st.position.set(armL * Math.cos(a), armL * Math.sin(a), L.l5);
      st.rotation.z = a + Math.PI / 2 + s * 0.2;
    }
    add(cyl(0.45, 0.7, 14), lv, 'steel', L.l5);
    add(arborShaft(6.0), lv, 'steel', 3.0);
    g.add(lv);
    rot.lever = lv;
    reg('escape', g);
  }

  // ---------------------------------------------------------------- volante + espiral
  let spring;
  {
    const g = new T.Group();
    const h = new T.Group();
    h.position.set(POS.balance.x, POS.balance.y, 0);
    const ring = new T.Shape();
    ring.absarc(0, 0, 4.7, 0, TAU, false);
    const hole = new T.Path();
    hole.absarc(0, 0, 4.15, 0, TAU, true);
    ring.holes.push(hole);
    add(ext(ring, 0.55), h, 'brass', L.l6 - 0.2);
    for (let i = 0; i < 4; i++) {
      const sp = add(new T.BoxGeometry(4.5, 0.42, 0.36), h, 'brass', L.l6);
      sp.position.set(0, 0, L.l6);
      sp.rotation.z = (Math.PI * i) / 2 + Math.PI / 4;
      sp.geometry.translate(2.3, 0, 0);
      const sp2 = add(new T.BoxGeometry(4.5, 0.42, 0.36), h, 'brass', L.l6);
      sp2.position.set(0, 0, L.l6);
      sp2.rotation.z = (Math.PI * i) / 2 + Math.PI / 4 + Math.PI;
      sp2.geometry.translate(2.3, 0, 0);
    }
    // tornillos de inercia
    for (let i = 0; i < 8; i++) {
      const a = (TAU * i) / 8 + 0.2;
      const sc = add(cyl(0.3, 0.7, 10), h, 'steel', L.l6 + 0.05);
      sc.position.set(4.45 * Math.cos(a), 4.45 * Math.sin(a), L.l6 + 0.05);
    }
    // rodete con la piedra de impulso (rubí) y eje
    add(cyl(1.35, 0.35, 28), h, 'steel', L.l5 + 0.05);
    const ij = add(cyl(0.34, 0.45, 12), h, ruby(), L.l5 + 0.4);
    ij.position.set(1.0 * Math.cos(dirTo(POS.balance, POS.lever)), 1.0 * Math.sin(dirTo(POS.balance, POS.lever)), L.l5 + 0.4);
    add(arborShaft(7.6), h, 'steel', 3.8);
    g.add(h);
    rot.balance = h;
    // espiral: 9 vueltas; el extremo interior gira con el volante, el exterior está fijo en el virola
    const NS = 240;
    const geo = new T.BufferGeometry();
    const RAD = 5;
    const pos = new Float32Array((NS + 1) * RAD * 3);
    const nor = new Float32Array((NS + 1) * RAD * 3);
    const idx = [];
    for (let i = 0; i < NS; i++)
      for (let j = 0; j < RAD; j++) {
        const a = i * RAD + j;
        const b = i * RAD + ((j + 1) % RAD);
        idx.push(a, b, a + RAD, b, b + RAD, a + RAD);
      }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const sm = new T.MeshStandardMaterial({color: AC, metalness: 0.5, roughness: 0.35, emissive: AC.clone().multiplyScalar(0.12)});
    const mesh = new T.Mesh(geo, sm);
    mesh.frustumCulled = false;
    mesh.position.set(POS.balance.x, POS.balance.y, L.l6 + 0.5);
    g.add(mesh);
    spring = {geo, pos, nor, NS, RAD};
    reg('balance', g);
  }
  const springShape = (theta) => {
    const {pos, nor, NS, RAD} = spring;
    const turns = 9;
    const P = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const a = s * turns * TAU + theta * (1 - s) * 1.0;
      const r = 0.9 + s * 2.35;
      P.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    for (let i = 0; i <= NS; i++) {
      const p = P[i];
      const q = P[Math.min(NS, i + 1)];
      const o = P[Math.max(0, i - 1)];
      let tx = q[0] - o[0];
      let ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      for (let j = 0; j < RAD; j++) {
        const a = (TAU * j) / RAD;
        const ox = Math.cos(a) * nx * 0.075;
        const oy = Math.cos(a) * ny * 0.075;
        const oz = Math.sin(a) * 0.14;
        const k = (i * RAD + j) * 3;
        pos[k] = p[0] + ox;
        pos[k + 1] = p[1] + oy;
        pos[k + 2] = oz;
        nor[k] = Math.cos(a) * nx;
        nor[k + 1] = Math.cos(a) * ny;
        nor[k + 2] = Math.sin(a);
      }
    }
    spring.geo.attributes.position.needsUpdate = true;
    spring.geo.attributes.normal.needsUpdate = true;
  };

  // ---------------------------------------------------------------- esfera esqueleto + agujas
  const hands = {};
  {
    const g = new T.Group();
    const ring = new T.Shape();
    ring.absarc(0, 0, 18.6, 0, TAU, false);
    const hole = new T.Path();
    hole.absarc(0, 0, 14.4, 0, TAU, true);
    ring.holes.push(hole);
    add(ext(ring, 0.35), g, 'dial', 9.5);
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0;
      const t = add(new T.BoxGeometry(big ? 0.6 : 0.18, big ? 2.6 : 1.1, 0.18), g, big ? 'dark' : 'dark', 9.95);
      const a = (TAU * i) / 60;
      const rr = big ? 16.4 : 17.4;
      t.position.set(rr * Math.sin(a), rr * Math.cos(a), 9.95);
      t.rotation.z = -a;
    }
    // subesfera de segundos sobre la rueda cuarta
    const sub = new T.Shape();
    sub.absarc(0, 0, 4.6, 0, TAU, false);
    const subHole = new T.Path();
    subHole.absarc(0, 0, 4.15, 0, TAU, true);
    sub.holes.push(subHole);
    const subm = add(ext(sub, 0.3), g, 'dial', 9.5);
    subm.position.set(POS.fourth.x, POS.fourth.y, 9.5);
    for (let i = 0; i < 12; i++) {
      const a = (TAU * i) / 12;
      const t = add(new T.BoxGeometry(0.16, 0.5, 0.18), g, 'dark', 9.9);
      t.position.set(POS.fourth.x + 3.7 * Math.sin(a), POS.fourth.y + 3.7 * Math.cos(a), 9.9);
      t.rotation.z = -a;
    }
    reg('dial', g, {xray: true});
    // agujas: otro grupo (siempre visible) que comparte la pieza «esfera»
    const hg = new T.Group();
    const needle = (len, tail, wBase, z, k, color) => {
      const sh = new T.Shape();
      sh.moveTo(-wBase, -tail);
      sh.lineTo(wBase, -tail);
      sh.lineTo(wBase * 0.7, len * 0.3);
      sh.lineTo(0.12, len);
      sh.lineTo(-0.12, len);
      sh.lineTo(-wBase * 0.7, len * 0.3);
      sh.closePath();
      const m = new T.Mesh(ext(sh, 0.22), color ? color : mat(k));
      m.castShadow = true;
      m.position.z = z;
      return m;
    };
    const mkHand = (name, len, tail, wb, z, k, pivot, color) => {
      const grp = new T.Group();
      grp.position.set(pivot.x, pivot.y, 0);
      grp.add(needle(len, tail, wb, z, k, color));
      hg.add(grp);
      hands[name] = grp;
    };
    mkHand('hour', 8.4, 1.4, 0.75, 10.3, 'dark', POS.center);
    mkHand('minute', 13.2, 1.8, 0.5, 10.8, 'dark', POS.center);
    mkHand('second', 3.6, 0.9, 0.22, 10.3, 'dark', POS.fourth, new T.MeshStandardMaterial({color: AC, metalness: 0.3, roughness: 0.4, side: T.DoubleSide}));
    const cap = add(cyl(0.7, 0.4, 20), hg, 'steel', 11.1);
    cap.position.set(0, 0, 11.1);
    hands.group = hg;
    reg('dial_hands', hg, {noclip: false});
  }
  // las agujas pertenecen a la pieza «dial» para despiece y selección
  parts.dial.mats.push(...parts.dial_hands.mats);
  parts.dialHands = parts.dial_hands;
  delete parts.dial_hands;
  parts.dial.groups = [parts.dial.group, parts.dialHands.group];

  // ---------------------------------------------------------------- bancada y poses
  const sign = {barrel: 1, center: -1, third: 1, fourth: -1, escape: 1};
  const order = ['barrel', 'center', 'third', 'fourth', 'escape'];
  const phase = {}; // fase inicial para que los dientes engranen
  {
    // la rueda de un árbol apunta (diente 0) hacia el siguiente piñón; el piñón siguiente tiene un hueco hacia atrás
    const next = {barrel: 'center', center: 'third', third: 'fourth', fourth: 'escape'};
    const pz = {center: ROW.barrel.driven.z, third: ROW.center.driven.z, fourth: ROW.third.driven.z, escape: ROW.fourth.driven.z};
    phase.barrel = dirTo(POS.barrel, POS.center);
    for (const id of ['center', 'third', 'fourth']) {
      phase[id + '_p'] = 0;
    }
    for (const id of order.slice(0, 4)) {
      const nx = next[id];
      const phi = dirTo(POS[id], POS[nx]);
      phase[id + '_w'] = phi;
      phase[nx + '_p'] = phi + Math.PI + Math.PI / pz[nx];
    }
  }
  // en los grupos: cada árbol tiene piñón + rueda con fases distintas: los separamos en hijos
  for (const id of ['center', 'third', 'fourth']) {
    const h = rot[id];
    const [pin, whl] = [h.children[0], h.children[1]];
    pin.rotation.z = phase[id + '_p'];
    whl.rotation.z = phase[id + '_w'];
  }
  rot.escape.children[0].rotation.z = phase.escape_p;

  const arborAngle = (tau, regime, wind) => {
    const stepped = C.escapeStepAngle(tau, wind);
    const mean = C.escapeMeanAngle(tau);
    const esc = stepped + (mean - stepped) * regime;
    const f = {escape: esc};
    f.fourth = esc / (ROW.fourth.z / ROW.fourth.driven.z);
    f.third = f.fourth / (ROW.third.z / ROW.third.driven.z);
    f.center = f.third / (ROW.center.z / ROW.center.driven.z);
    f.barrel = f.center / (ROW.barrel.z / ROW.barrel.driven.z);
    return f;
  };

  const world = new T.Vector3();
  const setPose = (S, ph, D) => {
    const k = S.cut;
    const e = S.explode;
    const a = Math.min(1, k * 2);
    const b = Math.max(0, k * 2 - 1);
    clip.constant = b > 0.002 ? -(CUT_X[0] + (CUT_X[1] - CUT_X[0]) * (b * b * (3 - 2 * b))) : 60;
    // desplazamientos de despiece
    parts.barrel.group.position.z = EXPLODE.barrel * e;
    parts.train.group.position.z = EXPLODE.train * e;
    parts.escape.group.position.z = EXPLODE.escape * e;
    parts.balance.group.position.z = EXPLODE.balance * e;
    parts.bridges.group.position.z = EXPLODE.bridges * e;
    parts.dial.group.position.z = EXPLODE.dial * e;
    parts.dialHands.group.position.z = (EXPLODE.dial + 2) * e;
    // movimiento: el tiempo simulado y la mezcla de régimen
    const tau = ph.tau;
    const regime = D.regime;
    const wind = D.wind;
    const ang = arborAngle(tau, regime, wind);
    rot.barrel.rotation.z = phase.barrel + ang.barrel * sign.barrel;
    for (const id of ['center', 'third', 'fourth']) {
      rot[id].rotation.z = ang[id] * sign[id];
      rot[id].children[0].rotation.z = phase[id + '_p'];
      rot[id].children[1].rotation.z = phase[id + '_w'];
    }
    rot.escape.rotation.z = ang.escape * sign.escape;
    rot.escape.children[0].rotation.z = phase.escape_p;
    // volante: a ritmo real si el tiempo es lento; a ritmo visual de 3 Hz si el tiempo corre mucho
    const tb = regime > 0.5 ? ph.bal : tau;
    const th = C.balanceAngle(tb, wind);
    const psi = C.leverAngle(tb, wind);
    rot.balance.rotation.z = th;
    rot.lever.rotation.z = psi;
    springShape(th);
    // agujas
    const hd = C.hands(tau);
    hands.minute.rotation.z = -hd.minute;
    hands.hour.rotation.z = -hd.hour;
    hands.second.rotation.z = -(regime > 0.5 ? hd.second : hd.second);
    // rayos X: puentes y esfera se aclaran al cortar; la tapa del barrilete también
    const sel = S.part;
    for (const id in parts) {
      const p = parts[id];
      const isSel = sel && (sel === id || (sel === 'dial' && id === 'dialHands'));
      for (const m of p.mats) {
        const xr = m.userData.xray ? a : 0;
        const dim = sel && !isSel ? 0.1 : 1;
        const op = Math.min(1 - 0.9 * xr, dim);
        m.transparent = op < 0.999;
        m.opacity = op;
        m.depthWrite = op > 0.5;
        if (m.emissive && m.userData.keepEmissive === undefined) m.userData.keepEmissive = m.emissive.clone();
        if (m.emissive) {
          m.emissive.copy(m.userData.keepEmissive);
          if (isSel) m.emissive.add(AC.clone().multiplyScalar(0.16));
        }
      }
    }
    const lid = rot.barrel.children.find((c) => c.userData.lid);
    if (lid) {
      lid.material.transparent = true;
      lid.material.opacity = Math.min(1 - 0.85 * a, sel && sel !== 'barrel' ? 0.1 : 1);
      lid.material.depthWrite = lid.material.opacity > 0.5;
    }
  };

  const L3 = (x, y, z) => new T.Vector3(x, y, z);
  const A = {
    barril: (S) => L3(POS.barrel.x - 4, POS.barrel.y - 5.5, L.l2 + 1.6 + EXPLODE.barrel * S.explode),
    centro: (S) => L3(0, 5.2, L.l3 + 0.3 + EXPLODE.train * S.explode),
    tercera: (S) => L3(POS.third.x + 3.6, POS.third.y + 2.6, L.l2 + EXPLODE.train * S.explode),
    cuarta: (S) => L3(POS.fourth.x + 4.6, POS.fourth.y + 1.2, L.l4 + 0.4 + EXPLODE.train * S.explode),
    escape: (S) => L3(POS.escape.x + 2.4, POS.escape.y - 1.8, L.l5 + 0.3 + EXPLODE.escape * S.explode),
    ancora: (S) => L3(POS.lever.x + 0.6, POS.lever.y - 1.2, L.l5 + 0.3 + EXPLODE.escape * S.explode),
    volante: (S) => L3(POS.balance.x - 3.4, POS.balance.y - 3.4, L.l6 + 0.3 + EXPLODE.balance * S.explode),
    puente: (S) => L3(-4.4, -1.5, 9.2 + EXPLODE.bridges * S.explode),
    esfera: (S) => L3(-8, 15.5, 9.8 + EXPLODE.dial * S.explode),
    agujas: (S) => L3(-3.2, 7.6, 10.9 + (EXPLODE.dial + 2) * S.explode),
    platina: (S) => L3(-14.5, 8.0, 0 + 0 * S.explode),
  };
  return {
    root,
    parts,
    update: setPose,
    anchor(name, S) {
      const f = A[name];
      if (!f) return null;
      return root.localToWorld(world.copy(f(S)).clone());
    },
  };
}
