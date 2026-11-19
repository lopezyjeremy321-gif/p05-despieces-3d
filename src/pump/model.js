// Geometría de la bomba, hecha en código (sin .glb ni modelos de terceros). Unidades: 1 = 10 cm.
// Marco local: eje de la bomba = Z local; el grupo raíz gira para que Z local = X del mundo (aspiración hacia -X).
import {PUMP} from './physics.js';

const TAU = Math.PI * 2;
const R2 = (PUMP.D2 / 2) * 10; // 1.0
const R1 = (PUMP.D1 / 2) * 10; // 0.4
const RIN = 1.1; // radio interior de la voluta (garganta)
const RHO0 = 0.28;
const RHO1 = 0.62;
const rho = (phi) => RHO0 + (RHO1 - RHO0) * (phi / TAU);
const rc = (phi) => RIN + rho(phi);
const BETA = (PUMP.beta2 * Math.PI) / 180;
const Z = PUMP.Z;
// retraso angular de un álabe de espiral logarítmica con ángulo constante beta
const lag = (r) => Math.log(r / R1) / Math.tan(BETA);
export const EXPLODE = {impeller: 1.6, seal: 3.0, cover: 4.2, frame: 6.6, shaft: 7.4};
export const CUT_RANGE = [-2.6, -0.02];

export function buildPump({THREE, scene, accent, renderer}) {
  const T = THREE;
  const root = new T.Group();
  root.rotation.y = Math.PI / 2; // Z local -> X mundo
  scene.add(root);
  const clip = new T.Plane(new T.Vector3(1, 0, 0), 0); // en mundo; conserva x >= corte
  const parts = {};
  const PAL = {
    casing: {c: 0x2f6483, m: 0.35, r: 0.5},
    cover: {c: 0x3d7a9c, m: 0.35, r: 0.5},
    impeller: {c: 0xc08a3a, m: 0.9, r: 0.38},
    shaft: {c: 0xb4bcc4, m: 1, r: 0.3},
    frame: {c: 0x55616c, m: 0.4, r: 0.55},
    seal: {c: 0x232a30, m: 0.5, r: 0.4},
  };
  const sectionColor = new T.Color(0x1b3a52);
  const register = (id, group, clipped) => {
    const mats = [];
    group.traverse((o) => {
      if (o.material) mats.push(o.material);
    });
    parts[id] = {group, mats, clipped, dz: 0};
    for (const m of mats) {
      m.userData.base = {opacity: m.opacity ?? 1, emissive: m.emissive?.clone?.() ?? null};
      if (clipped) {
        m.clippingPlanes = [clip];
        m.clipShadows = true;
      }
    }
    root.add(group);
  };
  const std = (id, over = {}) => new T.MeshStandardMaterial({color: PAL[id].c, metalness: PAL[id].m, roughness: PAL[id].r, ...over});
  const sec = (id) => new T.MeshStandardMaterial({color: new T.Color(PAL[id].c).multiplyScalar(0.42).lerp(sectionColor, 0.25), metalness: 0.15, roughness: 0.75, side: T.BackSide});
  const mesh = (g, m, shadow = true) => {
    const o = new T.Mesh(g, m);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  };
  /** malla + su cara interior (la que se ve al cortar) */
  const dual = (g, id, over) => {
    const grp = new T.Group();
    grp.add(mesh(g, std(id, over)));
    grp.add(mesh(g, sec(id), false));
    return grp;
  };
  const lathe = (pts, seg = 64) => new T.LatheGeometry(pts.map(([r, z]) => new T.Vector2(r, z)), seg);
  // LatheGeometry gira alrededor de Y con perfil (r, y): lo giramos para que Y -> Z
  const alongZ = (g) => (g.rotateX(Math.PI / 2), g);

  // ------------------------------------------------------------------ carcasa: voluta + tapa de aspiración
  {
    const NP = 120;
    const NS = 28;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= NP; i++) {
      const phi = (TAU * i) / NP;
      const p = rho(phi);
      const psi0 = Math.PI - Math.asin(Math.min(0.99, 0.2 / p));
      for (let j = 0; j <= NS; j++) {
        const psi = -psi0 + (2 * psi0 * j) / NS;
        const r = rc(phi) + p * Math.cos(psi);
        pos.push(r * Math.cos(phi), r * Math.sin(phi), p * Math.sin(psi));
      }
    }
    for (let i = 0; i < NP; i++)
      for (let j = 0; j < NS; j++) {
        const a = i * (NS + 1) + j;
        idx.push(a, a + NS + 1, a + 1, a + 1, a + NS + 1, a + NS + 2);
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const grp = new T.Group();
    grp.add(dual(g, 'casing'));
    // tubo de descarga tangente: sale hacia +Y en la boca de la espiral
    const cx = rc(TAU);
    const pipe = lathe([[RHO1, 0], [RHO1, 0.15], [0.46, 1.05], [0.46, 2.3], [0.78, 2.3], [0.78, 2.46], [0.46, 2.46]], 48);
    pipe.rotateX(0); // eje Y: ya es el eje de la descarga
    const pm = dual(pipe, 'casing');
    pm.position.set(cx, 0, 0);
    grp.add(pm);
    // tapa de aspiración (dish) con la boca de aspiración
    const front = lathe([[0.62, -3.15], [0.62, -2.95], [0.46, -2.95], [0.46, -1.7], [0.52, -1.0], [1.05, -0.5], [1.5, -0.34], [1.52, -0.3], [1.1, -0.28]], 64);
    const fm = dual(alongZ(front), 'casing');
    grp.add(fm);
    // bridas de aspiración
    const fl = new T.CylinderGeometry(0.85, 0.85, 0.16, 48);
    fl.rotateX(Math.PI / 2);
    fl.translate(0, 0, -3.1);
    grp.add(dual(fl, 'casing'));
    register('casing', grp, true);
  }

  // ------------------------------------------------------------------ impulsor
  const bladeGroup = new T.Group();
  {
    const grp = new T.Group();
    // cubo + plato trasero + tapa delantera
    const hub = new T.CylinderGeometry(0.34, 0.34, 0.66, 40);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, 0, 0.12);
    grp.add(dual(hub, 'impeller'));
    const back = lathe([[0.32, 0.2], [0.8, 0.2], [R2, 0.16], [R2, 0.1], [0.8, 0.14], [0.32, 0.14]], 72);
    grp.add(dual(alongZ(back), 'impeller'));
    const frontS = lathe([[R2, -0.1], [R2, -0.15], [0.75, -0.17], [0.52, -0.3], [R1, -0.42], [R1 - 0.03, -0.42], [0.5, -0.27], [0.74, -0.13]], 72);
    grp.add(dual(alongZ(frontS), 'impeller'));
    // álabes curvados hacia atrás
    for (let b = 0; b < Z; b++) {
      const sh = new T.Shape();
      const pts = [];
      const N = 26;
      for (let i = 0; i <= N; i++) {
        const r = R1 + 0.02 + ((R2 - 0.02 - R1) * i) / N;
        pts.push([r, lag(r)]);
      }
      const th = 0.045;
      const left = pts.map(([r, a]) => [(r + th) * Math.cos(-a), (r + th) * Math.sin(-a)]);
      const right = pts.map(([r, a]) => [(r - th) * Math.cos(-a), (r - th) * Math.sin(-a)]).reverse();
      const poly = [...left, ...right];
      sh.moveTo(...poly[0]);
      for (const p of poly.slice(1)) sh.lineTo(...p);
      const g = new T.ExtrudeGeometry(sh, {depth: 0.3, bevelEnabled: false, steps: 1});
      g.translate(0, 0, -0.14);
      const m = mesh(g, std('impeller'));
      m.rotation.z = (TAU * b) / Z;
      bladeGroup.add(m);
      const s2 = mesh(g, sec('impeller'), false);
      s2.rotation.z = (TAU * b) / Z;
      bladeGroup.add(s2);
    }
    grp.add(bladeGroup);
    register('impeller', grp, true);
  }

  // ------------------------------------------------------------------ eje (con tuerca del impulsor y chaveta)
  {
    const grp = new T.Group();
    const sh = new T.CylinderGeometry(0.17, 0.17, 7.6, 32);
    sh.rotateX(Math.PI / 2);
    sh.translate(0, 0, 3.2);
    grp.add(mesh(sh, std('shaft')));
    const nut = new T.CylinderGeometry(0.22, 0.22, 0.18, 6);
    nut.rotateX(Math.PI / 2);
    nut.translate(0, 0, -0.5);
    grp.add(mesh(nut, std('shaft')));
    const key = new T.BoxGeometry(0.06, 0.05, 0.7);
    key.translate(0, 0.19, 6.6);
    grp.add(mesh(key, std('shaft')));
    const cpl = new T.CylinderGeometry(0.55, 0.55, 0.45, 40);
    cpl.rotateX(Math.PI / 2);
    cpl.translate(0, 0, 6.2);
    grp.add(mesh(cpl, std('frame', {color: 0x7a838c})));
    register('shaft', grp, false);
  }

  // ------------------------------------------------------------------ tapa trasera con caja del sello
  {
    const prof = lathe([[1.5, 0.3], [1.5, 0.42], [1.1, 0.46], [0.62, 0.7], [0.6, 1.5], [0.46, 1.5], [0.46, 0.7], [0.5, 0.52], [1.0, 0.36]], 64);
    register('cover', dual(alongZ(prof), 'cover'), true);
  }
  {
    // cierre mecánico: asiento fijo + cara rotativa + resorte
    const grp = new T.Group();
    const faces = [[0.3, 0.38, 0.62, 0.7], [0.3, 0.38, 0.72, 0.8]];
    for (const [ri, ro, z0, z1] of faces) {
      const g = lathe([[ri, z0], [ro, z0], [ro, z1], [ri, z1]], 36);
      grp.add(mesh(alongZ(g), std('seal', {color: z0 < 0.7 ? 0x232a30 : 0xd7dce1, metalness: z0 < 0.7 ? 0.3 : 1})));
    }
    const spring = new T.TubeGeometry(
      new T.CatmullRomCurve3(
        Array.from({length: 61}, (_, i) => {
          const a = (i / 60) * TAU * 6;
          return new T.Vector3(0.36 * Math.cos(a), 0.36 * Math.sin(a), 0.82 + (0.4 * i) / 60);
        }),
      ),
      180,
      0.03,
      6,
    );
    grp.add(mesh(spring, std('shaft')));
    register('seal', grp, true);
  }

  // ------------------------------------------------------------------ soporte de rodamientos + bancada
  {
    const grp = new T.Group();
    const body = lathe([[0.62, 1.5], [0.9, 1.6], [0.9, 3.4], [0.62, 3.5], [0.56, 3.5], [0.56, 1.5]], 48);
    grp.add(dual(alongZ(body), 'frame'));
    const foot = new T.BoxGeometry(1.5, 0.35, 2.2);
    foot.translate(0, -1.0, 2.5);
    grp.add(mesh(foot, std('frame')));
    const leg = new T.BoxGeometry(0.5, 0.9, 1.6);
    leg.translate(0, -0.65, 2.5);
    grp.add(mesh(leg, std('frame')));
    // anillos de rodamiento
    for (const z of [1.9, 3.05]) {
      const ring = new T.CylinderGeometry(0.93, 0.93, 0.12, 48);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, 0, z);
      grp.add(mesh(ring, std('frame', {color: 0x3a444d})));
    }
    register('frame', grp, true);
  }
  // bancada fija
  const base = mesh(new T.BoxGeometry(11.6, 0.26, 3.4), new T.MeshStandardMaterial({color: 0x8795a1, metalness: 0.2, roughness: 0.7}));
  base.position.set(2.6, -1.97, 0);
  root.add(base);

  // ------------------------------------------------------------------ partículas de flujo (ilustrativas)
  const NPART = 240;
  const pg = new T.IcosahedronGeometry(0.036, 1);
  const pmat = new T.MeshBasicMaterial({color: 0xffffff});
  pmat.clippingPlanes = [clip];
  const flow = new T.InstancedMesh(pg, pmat, NPART);
  flow.frustumCulled = false;
  const jit = Array.from({length: NPART}, (_, i) => {
    let s = (i * 2654435761) >>> 0;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return {a: r() * TAU, k: r(), q: r() * 2 - 1, w: r() * 2 - 1};
  });
  const cLow = new T.Color(0x6d8fa8);
  const cHigh = accent.clone();
  const m4 = new T.Matrix4();
  const col = new T.Color();
  root.add(flow);
  const flowRoot = flow;

  const setPose = (S, ph, D) => {
    const k = S.cut;
    const e = S.explode;
    const cutZ = CUT_RANGE[0] + (CUT_RANGE[1] - CUT_RANGE[0]) * k;
    clip.constant = k > 0.002 ? -cutZ : 50; // mundo: conserva x >= corte
    for (const id in EXPLODE) {
      parts[id].group.position.z = EXPLODE[id] * e;
      parts[id].dz = EXPLODE[id] * e;
    }
    // giro del impulsor y del eje
    parts.impeller.group.rotation.z = ph.imp;
    parts.shaft.group.rotation.z = ph.imp;
    // flujo
    const flowVisible = D.flowing || true;
    flow.visible = flowVisible && e < 0.2;
    const sp = ph.flow;
    for (let i = 0; i < NPART; i++) {
      const j = jit[i];
      const s = (((sp + i / NPART) % 1) + 1) % 1;
      let x;
      let y;
      let z;
      let hot;
      if (s < 0.24) {
        const u = s / 0.24;
        const rr = (0.15 + 0.22 * j.k) * (1 - 0.15 * u);
        const a = j.a + ph.imp * u * 0.6;
        x = rr * Math.cos(a);
        y = rr * Math.sin(a);
        z = -2.95 + (2.95 - 0.35) * u * u * 0.5 + (u * 2.7 - 2.7 * 0.5 * u * u) * 0.0;
        z = -2.95 + 2.55 * u;
        hot = 0;
      } else if (s < 0.46) {
        const u = (s - 0.24) / 0.22;
        const r = R1 + (R2 - R1) * Math.pow(u, 0.9);
        const a = j.a + ph.imp - lag(r) + (j.q * 0.3) * 0;
        // elegimos el canal del álabe más cercano
        const slot = Math.floor(((j.a / TAU) * Z) % Z);
        const ang = (TAU * slot) / Z + ph.imp - lag(r) + 0.18 + j.q * 0.1;
        x = r * Math.cos(ang);
        y = r * Math.sin(ang);
        z = -0.03 + j.w * 0.09 + (1 - u) * -0.18;
        void a;
        hot = u;
      } else if (s < 0.9) {
        const u = (s - 0.46) / 0.44;
        const slot = Math.floor(((j.a / TAU) * Z) % Z);
        const exit = (TAU * slot) / Z + ph.imp - lag(R2) + 0.18;
        const phi0 = ((exit % TAU) + TAU) % TAU;
        const phi = phi0 + (TAU - phi0) * u;
        const rr = rc(phi) * 0.96 + (j.q * rho(phi)) * 0.35 - (1 - Math.min(1, u * 5)) * (rc(phi) - R2) * 0.6;
        const r = R2 + (rr - R2) * Math.min(1, u * 4 + 0.15);
        x = r * Math.cos(phi);
        y = r * Math.sin(phi);
        z = j.w * rho(phi) * 0.45;
        hot = 1;
      } else {
        const u = (s - 0.9) / 0.1;
        x = rc(TAU) + j.q * 0.35 * (1 - 0.25 * u);
        y = u * 2.4;
        z = j.w * 0.35 * (1 - 0.25 * u);
        hot = 1;
      }
      const scale = D.flowing ? 1 : 0.6;
      m4.makeScale(scale, scale, scale);
      m4.setPosition(x, y, z);
      flow.setMatrixAt(i, m4);
      col.copy(cLow).lerp(cHigh, hot);
      if (D.cav && s > 0.15 && s < 0.5) col.set(0xffffff);
      flow.setColorAt(i, col);
    }
    flow.instanceMatrix.needsUpdate = true;
    if (flow.instanceColor) flow.instanceColor.needsUpdate = true;
    // resaltado de pieza
    const sel = S.part;
    for (const id in parts) {
      const p = parts[id];
      const isSel = sel === id;
      for (const m of p.mats) {
        if (sel) {
          m.transparent = !isSel;
          m.opacity = isSel ? 1 : 0.1;
          m.depthWrite = isSel;
          if (m.emissive && m.side !== T.BackSide) {
            m.emissive.copy(accent).multiplyScalar(isSel ? 0.22 : 0);
          }
        } else {
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
          if (m.emissive) m.emissive.setScalar(0);
        }
      }
    }
    flow.visible = flow.visible && (!sel || sel === 'impeller' || sel === 'casing');
  };

  const world = new T.Vector3();
  const A = {
    descarga: () => new T.Vector3(rc(TAU), 2.46, 0),
    aspiracion: () => new T.Vector3(0, 0, -3.1),
    impulsor: (S) => new T.Vector3(R2 * 0.7 * Math.cos(1.0), R2 * 0.7 * Math.sin(1.0), -0.1 + EXPLODE.impeller * S.explode),
    voluta: () => new T.Vector3(-rc(Math.PI) - 0.2, 0, 0).add(new T.Vector3(0, 0, 0)),
    eje: (S) => new T.Vector3(0, 0.17, 5.4 + EXPLODE.shaft * S.explode),
    cierre: (S) => new T.Vector3(0.38, 0, 0.9 + EXPLODE.seal * S.explode),
    tapa: (S) => new T.Vector3(0, 1.2, 0.44 + EXPLODE.cover * S.explode),
    soporte: (S) => new T.Vector3(0, 0.9, 2.5 + EXPLODE.frame * S.explode),
    lengueta: () => new T.Vector3(rc(0) - rho(0), 0, 0),
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
    setImpellerOnly() {},
  };
}
