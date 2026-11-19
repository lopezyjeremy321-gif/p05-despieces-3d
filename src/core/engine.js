// Motor común de los despieces P05: una máquina = un `def` (parámetros, vistas, piezas, tour, física, modelo 3D).
// Una sola entrada manda todo: el estado S (parámetros + corte + despiece + cámara). El tour es una función pura del
// tiempo (S = tourState(t)), así que la página en vivo y la película cuadro a cuadro (window.seek) nunca se desfasan.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import css from './core.css';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => {
  const k = clamp(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
const CAM_KEYS = ['az', 'el', 'd', 'tx', 'ty', 'tz'];
const nf = new Intl.NumberFormat('es', {useGrouping: false});
export const fmt = (v, d = 0) => {
  if (!Number.isFinite(v)) return '—';
  const t = v.toLocaleString('es', {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false});
  const [i, f] = t.split(',');
  const neg = i.startsWith('-') ? '-' : '';
  const dig = i.replace('-', '');
  const g = dig.length >= 5 ? dig.replace(/B(?=(d{3})+(?!d))/g, ' ') : dig;
  return neg + g + (f ? ',' + f : '');
};
void nf;

const ICON = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
  tour: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 2v4.8l3 1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

export function start(def) {
  const q = new URLSearchParams(location.search);
  const FILM = q.has('film');
  const RENDER = FILM || q.has('render');
  const NOGL = q.has('nogl');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !RENDER;
  const root = document.documentElement;
  root.lang = 'es';
  if (FILM) root.classList.add('film');
  const forceTheme = q.get('theme');
  const dark = () => (forceTheme ? forceTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches && !FILM);
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  document.title = def.title;
  const setTheme = () => {
    root.dataset.theme = dark() ? 'dark' : 'light';
  };
  setTheme();

  // ---------------------------------------------------------------- DOM
  const app = document.getElementById('app');
  app.classList.add('app');
  const sliders = def.params
    .map(
      (p) => `<div class="sl"><label for="p-${p.key}">${p.label}<output id="o-${p.key}" for="p-${p.key}"></output></label>
<input id="p-${p.key}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.def}" aria-describedby="o-${p.key}"></div>`,
    )
    .join('');
  const views = def.views.map((v, i) => `<button class="btn" type="button" data-view="${v.id}" aria-pressed="false" title="Vista ${i + 1}">${v.label}</button>`).join('');
  const toggles = def.toggles.map((t) => `<button class="btn" type="button" data-tg="${t.key}" aria-pressed="false" title="Tecla ${t.keyChar.toUpperCase()}">${t.label}</button>`).join('');
  const parts = def.parts.map((p) => `<button class="btn" type="button" data-part="${p.id}" aria-pressed="false">${p.name}</button>`).join('');
  app.innerHTML = `
<a class="skip" href="#controls">Saltar a los controles</a>
<header class="top"><div class="title"><h1>${def.title}</h1><p>${def.subtitle}</p></div>
<div class="btns"><button class="btn primary" type="button" id="b-tour" aria-pressed="true">${ICON.tour}<span>Tour automático</span></button>
<button class="btn" type="button" id="b-play" aria-pressed="false" aria-label="Pausar">${ICON.pause}<span>Pausar</span></button></div></header>
<main class="stage" id="stage"><img class="poster" alt="${def.posterAlt}" src="${def.poster || ''}" width="1280" height="800">
<canvas id="gl" tabindex="0" role="img" aria-label="${def.canvasLabel}"></canvas><div class="labels" aria-hidden="true"><svg id="leaders"></svg></div>
<p class="caption" id="caption"></p></main>
<aside class="panel" aria-label="Panel de números"><h2>${def.panelTitle}</h2><dl class="ro" id="ro"></dl><div id="extra"></div></aside>
<section class="ctrl" id="controls" aria-label="Controles">${sliders}
<div class="grp" role="group" aria-label="Vistas"><span>Vista</span>${views}</div>
<div class="grp" role="group" aria-label="Modos de despiece">${toggles}</div>
<div class="grp" role="group" aria-label="Piezas"><span>Pieza</span>${parts}</div>
<details class="keys"><summary>Atajos de teclado</summary>${def.keysHelp}</details></section>
<p class="live-sr" id="live" role="status" aria-live="polite"></p>`;
  const $ = (s) => app.querySelector(s);
  const canvas = $('#gl');
  const embedded = window.top !== window;
  if (embedded) canvas.style.touchAction = 'pan-y';
  const stage = $('#stage');
  const poster = $('.poster');
  const caption = $('#caption');
  const live = $('#live');
  const bTour = $('#b-tour');
  const bPlay = $('#b-play');
  const ro = $('#ro');
  const extra = $('#extra');
  const leaders = $('#leaders');
  const extraApi = def.extra ? def.extra(extra) : null;

  // ---------------------------------------------------------------- estado y tour
  const PARAM = Object.fromEntries(def.params.map((p) => [p.key, p]));
  const initial = () => ({p: Object.fromEntries(def.params.map((p) => [p.key, p.def])), cut: 0, explode: 0, labels: 0, part: null, cam: {...def.views[0].cam}, view: def.views[0].id});
  const VIEW = Object.fromEntries(def.views.map((v) => [v.id, v.cam]));
  const steps = [...def.tour].sort((a, b) => a.t - b.t);
  const DUR = def.duration;
  const channels = ['cut', 'explode', 'labels', ...def.params.map((p) => 'p.' + p.key), ...CAM_KEYS.map((k) => 'cam.' + k)];
  const target = (step, ch) => {
    if (ch.startsWith('p.')) return step.set?.[ch.slice(2)];
    if (ch.startsWith('cam.')) return step.view ? VIEW[step.view][ch.slice(4)] : undefined;
    if (ch === 'labels') return step.labels === undefined ? undefined : step.labels ? 1 : 0;
    return step[ch];
  };
  const chan = (ch, t, v0) => {
    let prev = v0;
    for (const s of steps) {
      const g = target(s, ch);
      if (g === undefined) continue;
      const r = s.ramp ?? 1.6;
      if (t < s.t) return prev;
      if (t < s.t + r) return lerp(prev, g, ease((t - s.t) / r));
      prev = g;
    }
    return prev;
  };
  const I0 = initial();
  const get0 = (ch) => (ch.startsWith('p.') ? I0.p[ch.slice(2)] : ch.startsWith('cam.') ? I0.cam[ch.slice(4)] : I0[ch]);
  const tourState = (t) => {
    const S = initial();
    for (const ch of channels) {
      const v = chan(ch, t, get0(ch));
      if (ch.startsWith('p.')) S.p[ch.slice(2)] = v;
      else if (ch.startsWith('cam.')) S.cam[ch.slice(4)] = v;
      else S[ch] = v;
    }
    let cur = null;
    let capIx = -1;
    steps.forEach((s, i) => {
      if (s.t <= t) {
        if ('part' in s) cur = s.part;
        if (s.caption) capIx = i;
        if (s.view) S.view = s.view;
      }
    });
    S.part = cur;
    S.cap = capIx;
    S.cam.az += reduced ? 0 : 4 * Math.sin(t * 0.33);
    return S;
  };
  // fases integradas (ángulo del impulsor, tiempo simulado...) tabuladas a 120 Hz: el tour es determinista
  const NT = Math.ceil(DUR * 120);
  const table = [];
  {
    const ph = def.phases0();
    for (let i = 0; i <= NT; i++) {
      table.push({...ph});
      const S = tourState(i / 120);
      const r = def.rates(S, def.derive(S));
      for (const k in r) ph[k] += r[k] / 120;
    }
  }
  const phasesAt = (t) => {
    const u = clamp(t, 0, DUR) * 120;
    const i = Math.min(NT - 1, Math.floor(u));
    const a = table[i];
    const b = table[i + 1];
    const k = u - i;
    const o = {};
    for (const key in a) o[key] = lerp(a[key], b[key], k);
    return o;
  };
  const mix = (a, b, k) => {
    const o = {p: {}, cut: lerp(a.cut, b.cut, k), explode: lerp(a.explode, b.explode, k), labels: lerp(a.labels, b.labels, k), part: b.part, cap: b.cap, view: b.view, cam: {}};
    for (const key in a.p) o.p[key] = lerp(a.p[key], b.p[key], k);
    for (const key of CAM_KEYS) o.cam[key] = lerp(a.cam[key], b.cam[key], k);
    return o;
  };

  // ---------------------------------------------------------------- Three.js (con alternativa sin WebGL)
  let gl = null;
  let model = null;
  let fallback = '';
  const theme = () => def.scene[dark() ? 'dark' : 'light'];
  try {
    if (NOGL) throw new Error('nogl');
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('sin WebGL');
    const renderer = new THREE.WebGLRenderer({canvas, antialias: !q.has('noaa'), powerPreference: 'high-performance', preserveDrawingBuffer: RENDER});
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = !q.has('noshadow');
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    const camera = new THREE.PerspectiveCamera(def.fov ?? 32, 1, 0.05, 400);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(...def.scene.keyPos);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    Object.assign(sc, {left: -def.scene.shadowR, right: def.scene.shadowR, top: def.scene.shadowR, bottom: -def.scene.shadowR, near: 1, far: 200});
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    const fill = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.55);
    scene.add(key, fill, key.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({opacity: 0.2}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = def.scene.floorY;
    floor.receiveShadow = true;
    floor.material.polygonOffset = true;
    floor.material.polygonOffsetFactor = -2;
    scene.add(floor);
    const applyBg = () => {
      const c = new THREE.Color(theme().bg);
      scene.background = c;
    };
    applyBg();
    model = def.build({THREE, scene, accent: new THREE.Color(def.accent), renderer, key});
    gl = {renderer, scene, camera, key, applyBg};
  } catch (e) {
    fallback = String(e.message || e);
  }
  if (!gl) {
    canvas.style.display = 'none';
    const b = document.createElement('p');
    b.className = 'banner';
    b.setAttribute('role', 'status');
    b.textContent = 'Este navegador no pudo iniciar WebGL, así que se muestra la imagen fija. Los controles y los números siguen funcionando.';
    stage.appendChild(b);
    caption.style.display = 'none';
  }

  // ---------------------------------------------------------------- bucle
  let playing = !reduced;
  let touring = !reduced;
  let T = 0;
  let free = initial();
  let blend = 1;
  let ph = def.phases0();
  let goal = {...free.cam};
  let cam = {...free.cam};
  let shown = false;
  let lastCap = -2;
  let userNudged = 0;
  const reflect = () => {
    bTour.setAttribute('aria-pressed', String(touring));
    bTour.querySelector('span').textContent = touring ? 'Detener tour' : 'Tour automático';
    bPlay.querySelector('span').textContent = playing ? 'Pausar' : 'Reproducir';
    bPlay.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    bPlay.setAttribute('aria-pressed', String(!playing));
    bPlay.querySelector('svg').outerHTML = playing ? ICON.pause : ICON.play;
  };
  reflect();

  const setTouring = (on) => {
    if (on === touring) return;
    if (on) {
      free = initial();
      T = 0;
      blend = 0;
      touring = true;
      if (!playing) playing = true;
    } else {
      touring = false;
      blend = 1;
    }
    reflect();
  };
  const interrupt = (why) => {
    if (!touring) return;
    free = currentS;
    goal = {...currentS.cam};
    cam = {...currentS.cam};
    touring = false;
    reflect();
    caption.textContent = '';
    caption.innerHTML = `<b>Tú mandas.</b> ${why || 'Mueve los controles o arrastra el modelo.'} <small></small>`;
    lastCap = -2;
    say('Tour detenido. Ahora controlas la pieza.');
  };
  let sayTimer = 0;
  const say = (msg) => {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      live.textContent = msg;
    }, 450);
  };

  let currentS = initial();
  const rows = new Map();
  const buildRows = (list) => {
    ro.innerHTML = '';
    for (const r of list) {
      const d = document.createElement('div');
      if (r.hero) d.className = 'hero';
      if (r.xtra) d.classList.add('xtra');
      d.innerHTML = `<dt>${r.label}</dt><dd></dd>`;
      ro.appendChild(d);
      rows.set(r.id, {el: d, dd: d.querySelector('dd'), last: ''});
    }
  };
  let built = false;
  const paintReadouts = (S, D, P) => {
    const list = def.readouts(S, D, P);
    if (!built) {
      buildRows(list);
      built = true;
    }
    for (const r of list) {
      const row = rows.get(r.id);
      const html = r.unit ? `${r.value}<small>${r.unit}</small>` : r.value;
      if (row.last !== html) {
        row.dd.innerHTML = html;
        row.last = html;
      }
      row.el.classList.toggle('warn', !!r.warn);
    }
  };
  // etiquetas 3D en el DOM (dos columnas, apiladas para que no se toquen)
  const lblEls = new Map();
  const paintLabels = (S, W, H) => {
    if (!gl || !model) return;
    const k = S.part ? 1 : S.labels;
    const items = [];
    if (k > 0.03) {
      const list = S.part ? def.labels.filter((l) => l.part === S.part) : def.labels;
      for (const l of list) {
        const v = model.anchor(l.anchor, S);
        if (!v) continue;
        const p = v.clone().project(gl.camera);
        if (p.z > 1) continue;
        items.push({l, x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H});
      }
    }
    const left = items.filter((i) => i.x < W / 2).sort((a, b) => a.y - b.y);
    const right = items.filter((i) => i.x >= W / 2).sort((a, b) => a.y - b.y);
    const place = (col, x0, anchorRight) => {
      let y = 56;
      for (const it of col) {
        y = Math.max(y, it.y - 14);
        it.bx = x0;
        it.by = Math.min(y, H - 130);
        it.right = anchorRight;
        y = it.by + (def.labelGap ?? 46);
      }
    };
    place(left, 14, false);
    place(right, W - 14, true);
    let svg = '';
    const used = new Set();
    for (const it of items) {
      let el = lblEls.get(it.l.anchor + it.l.text);
      if (!el) {
        el = document.createElement('div');
        el.className = 'lbl';
        el.innerHTML = `<b>${it.l.text}</b>${it.l.sub ? `<span>${it.l.sub}</span>` : ''}`;
        stage.querySelector('.labels').appendChild(el);
        lblEls.set(it.l.anchor + it.l.text, el);
      }
      used.add(el);
      el.style.opacity = String(k);
      el.style.display = '';
      const w = el.offsetWidth || 120;
      const bx = it.right ? it.bx - w : it.bx;
      el.style.transform = `translate(${bx.toFixed(1)}px,${it.by.toFixed(1)}px)`;
      const ex = it.right ? bx : bx + w;
      svg += `<line x1="${ex.toFixed(1)}" y1="${(it.by + 14).toFixed(1)}" x2="${it.x.toFixed(1)}" y2="${it.y.toFixed(1)}" opacity="${k}"/><circle cx="${it.x.toFixed(1)}" cy="${it.y.toFixed(1)}" r="4.5" opacity="${k}"/>`;
    }
    for (const el of lblEls.values()) if (!used.has(el)) el.style.display = 'none';
    leaders.innerHTML = svg;
  };

  let W = 0;
  let H = 0;
  let pr = Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!gl) return;
    gl.renderer.setPixelRatio(q.get('dpr') ? Number(q.get('dpr')) : pr);
    gl.renderer.setSize(W, H, false);
    gl.camera.aspect = W / Math.max(1, H);
    gl.camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);

  const camPlace = (c) => {
    const az = (c.az * Math.PI) / 180;
    const el = (c.el * Math.PI) / 180;
    const asp = W / Math.max(1, H);
    const dd = c.d * Math.pow(Math.max(1, (def.fitAspect ?? 1.6) / asp), 0.9);
    gl.camera.position.set(c.tx + dd * Math.cos(el) * Math.sin(az), c.ty + dd * Math.sin(el), c.tz + dd * Math.cos(el) * Math.cos(az));
    gl.camera.lookAt(c.tx, c.ty, c.tz);
    gl.camera.updateMatrixWorld();
  };

  const draw = (S, phases) => {
    const D = def.derive(S);
    paintReadouts(S, D, phases);
    extraApi?.update(S, D, phases);
    for (const b of app.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
    for (const b of app.querySelectorAll('[data-part]')) b.setAttribute('aria-pressed', String(b.dataset.part === S.part));
    for (const t of def.toggles) app.querySelector(`[data-tg="${t.key}"]`).setAttribute('aria-pressed', String(t.get(S)));
    for (const p of def.params) {
      const inp = app.querySelector('#p-' + p.key);
      if (document.activeElement !== inp || touring) inp.value = S.p[p.key];
      app.querySelector('#o-' + p.key).textContent = p.fmt(S.p[p.key]);
    }
    if (gl) {
      model.update(S, phases, D);
      camPlace(S.cam);
      gl.renderer.render(gl.scene, gl.camera);
      paintLabels(S, W, H);
      if (!shown) {
        shown = true;
        poster.classList.add('gone');
        window.SIM_SHOWN = true;
        dispatchEvent(new Event('simframe'));
      }
    }
    return D;
  };
  const sayState = (S, D) => say(def.summary(S, D, ph));

  let last = performance.now();
  let acc = 0;
  let onScreen = true;
  let slow = 0;
  let nFrames = 0;
  let sumDt = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!onScreen || document.hidden) return;
    if (playing) T += dt;
    let S;
    if (touring) {
      const t = T % DUR;
      S = tourState(t);
      if (blend < 1) {
        blend = clamp(blend + dt / 1.2);
        S = mix(free, S, ease(blend));
      }
      ph = phasesAt(t);
      if (S.cap !== lastCap && S.cap >= 0) {
        lastCap = S.cap;
        const c = steps[S.cap];
        caption.innerHTML = `${c.caption}${c.sub ? `<small>${c.sub}</small>` : ''}`;
        say(c.caption.replace(/<[^>]+>/g, ''));
      }
    } else {
      cam.az = lerp(cam.az, goal.az, reduced ? 1 : 1 - Math.exp(-dt * 9));
      for (const k of CAM_KEYS) if (k !== 'az') cam[k] = lerp(cam[k], goal[k], reduced ? 1 : 1 - Math.exp(-dt * 9));
      free.cam = {...cam};
      const D0 = def.derive(free);
      if (playing) {
        const r = def.rates(free, D0);
        for (const k in r) ph[k] += r[k] * dt;
      }
      S = free;
      acc += dt;
    }
    currentS = S;
    const D = draw(S, ph);
    if (!touring && userNudged && now - userNudged > 900) {
      userNudged = 0;
      sayState(S, D);
    }
    // adaptación de calidad: si el cuadro tarda >22 ms medio segundo seguido, bajar resolución
    if (gl && !FILM) {
      sumDt += dt;
      nFrames++;
      if (sumDt > 1) {
        const avg = sumDt / nFrames;
        slow = avg > 0.024 ? slow + 1 : 0;
        if (slow >= 2 && pr > 1) {
          pr = Math.max(1, pr - 0.5);
          resize();
          slow = 0;
        }
        if (slow >= 2 && pr <= 1) gl.renderer.shadowMap.enabled = false;
        sumDt = 0;
        nFrames = 0;
      }
    }
  };

  // ---------------------------------------------------------------- entradas
  const touch = (why) => {
    if (touring) interrupt(why);
    userNudged = performance.now();
  };
  bTour.addEventListener('click', () => {
    if (touring) interrupt('Tour detenido.');
    else setTouring(true);
  });
  bPlay.addEventListener('click', () => {
    playing = !playing;
    reflect();
    say(playing ? 'Reproduciendo' : 'En pausa');
  });
  for (const p of def.params) {
    const inp = $('#p-' + p.key);
    inp.addEventListener('input', () => {
      touch();
      free.p[p.key] = Number(inp.value);
      userNudged = performance.now();
    });
  }
  const setView = (id) => {
    touch();
    free.view = id;
    goal = {...VIEW[id]};
  };
  app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  const flip = (key) => {
    touch();
    const t = def.toggles.find((x) => x.key === key);
    t.set(free, !t.get(free));
    userNudged = performance.now();
  };
  app.querySelectorAll('[data-tg]').forEach((b) => b.addEventListener('click', () => flip(b.dataset.tg)));
  const setPart = (id) => {
    touch();
    free.part = free.part === id ? null : id;
    if (free.part) {
      const p = def.parts.find((x) => x.id === free.part);
      caption.innerHTML = `<b>${p.name}.</b> ${p.desc}`;
      say(`${p.name}. ${p.desc}`);
    } else caption.innerHTML = '';
  };
  app.querySelectorAll('[data-part]').forEach((b) => b.addEventListener('click', () => setPart(b.dataset.part)));
  // cámara: arrastrar, rueda, teclado
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    touch('Arrastra para girar; rueda o +/− para acercar.');
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    goal.az -= (e.clientX - drag.x) * 0.4;
    goal.el = clamp(goal.el + (e.clientY - drag.y) * 0.3, -20, 88);
    drag = {x: e.clientX, y: e.clientY};
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('blur', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (embedded && document.activeElement !== canvas) return;
      e.preventDefault();
      touch();
      goal.d = clamp(goal.d * Math.exp(e.deltaY * 0.0011), def.dMin, def.dMax);
    },
    {passive: false},
  );
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target.tagName;
    const key = e.key;
    const onRange = tag === 'INPUT';
    const onBtn = tag === 'BUTTON' || tag === 'SUMMARY';
    const lk = key.toLowerCase();
    const vi = def.views.findIndex((_, i) => key === String(i + 1));
    let hit = true;
    if (vi >= 0) setView(def.views[vi].id);
    else if (!onRange && key === 'ArrowLeft') (touch(), (goal.az -= 8));
    else if (!onRange && key === 'ArrowRight') (touch(), (goal.az += 8));
    else if (!onRange && key === 'ArrowUp') (touch(), (goal.el = clamp(goal.el + 6, -20, 88)));
    else if (!onRange && key === 'ArrowDown') (touch(), (goal.el = clamp(goal.el - 6, -20, 88)));
    else if (key === '+' || key === '=') (touch(), (goal.d = clamp(goal.d / 1.12, def.dMin, def.dMax)));
    else if (key === '-' || key === '_') (touch(), (goal.d = clamp(goal.d * 1.12, def.dMin, def.dMax)));
    else if (def.toggles.some((t) => t.keyChar === lk)) flip(def.toggles.find((t) => t.keyChar === lk).key);
    else if (lk === 'p') {
      const ids = def.parts.map((x) => x.id);
      const cur = ids.indexOf(currentS.part);
      touch();
      free.part = cur + 1 < ids.length ? ids[cur + 1] : null;
      const p = def.parts.find((x) => x.id === free.part);
      caption.innerHTML = p ? `<b>${p.name}.</b> ${p.desc}` : '';
      if (p) say(`${p.name}. ${p.desc}`);
    } else if (lk === 't') bTour.click();
    else if (key === ' ' && !onBtn && !onRange) bPlay.click();
    else hit = false;
    if (hit) e.preventDefault();
    void def;
  });
  if (matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      setTheme();
      gl?.applyBg();
    });
  }
  // pausa fuera de pantalla y con la pestaña oculta
  new IntersectionObserver((es) => {
    onScreen = es[0].isIntersecting;
    last = performance.now();
  }).observe(stage);
  document.addEventListener('visibilitychange', () => (last = performance.now()));

  // ---------------------------------------------------------------- arranque
  const boot = () => {
    resize();
    if (!touring) {
      free = initial();
      goal = {...free.cam};
      cam = {...free.cam};
      caption.innerHTML = reduced
        ? 'Movimiento reducido: la animación y el tour están detenidos. Usa <b>Reproducir</b> o <b>Tour automático</b> cuando quieras.'
        : '';
    }
    requestAnimationFrame((n) => {
      last = n;
      frame(n);
    });
  };
  // API de película: cuadro exacto en función del tiempo (capture.mjs la llama con ?render)
  window.DURATION = DUR;
  window.FPS = 60;
  window.seek = (t) => {
    touring = true;
    const S = tourState(t % DUR);
    const c = S.cap >= 0 ? steps[S.cap] : null;
    caption.innerHTML = c ? `${c.caption}${c.sub ? `<small>${c.sub}</small>` : ''}` : '';
    currentS = S;
    draw(S, phasesAt(t % DUR));
    return true;
  };
  // depuración y pruebas: dibuja un estado libre (parámetros, vista, corte...) con fases dadas
  const poseFree = (patch = {}, phases = def.phases0()) => {
    const S = initial();
    Object.assign(S.p, patch.p || {});
    for (const k of ['cut', 'explode', 'labels', 'part']) if (k in patch) S[k] = patch[k];
    if (patch.view) (S.view = patch.view, (S.cam = {...VIEW[patch.view]}));
    touring = false;
    currentS = S;
    draw(S, phases);
    return true;
  };
  window.SIM = {poseFree, def, state: () => currentS, get gl() {return gl;}, get fallback() {return fallback;}, get model() {return model;}, tourState, steps, ready: true, duration: DUR, fps: 60, render: (t) => window.seek(t)};
  if (RENDER) {
    resize();
    document.fonts.ready.then(() => {
      resize();
      window.seek(0);
    });
  } else {
    document.fonts.ready.then(() => requestAnimationFrame(boot));
  }
}
