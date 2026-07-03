// Scene 5: Solar System — the REAL, documented solar system you explore with a MOUSE.
//
// Hand tracking is great for expressive visuals, but exploring a precise 3D map
// wants a precise input — so this scene is mouse/trackpad driven:
//   drag            -> orbit the view
//   scroll          -> zoom in / out
//   right-drag (or shift-drag) -> pan / glide across the system
//   click a planet  -> select it, frame it, show its facts
//   double-click    -> "learn more" (a full write-up)
//   click empty space -> deselect (keep exploring from wherever you are)
//
// Nothing here is invented: real NASA-derived textures (CC-BY 4.0, Solar System
// Scope) at real relative sizes, real axial tilts + spin directions, and real
// positions for TODAY computed in-browser from JPL's "Approximate Positions of
// the Major Planets" (Standish) — accurate to arc-minutes, no network needed.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { disposeObject, disposeTarget } from './dispose.js';

const DEG = Math.PI / 180;
const TEX = 'assets/textures/';
const PARAMS = { dist: 12 };   // AU -> world units (real proportions)

// JPL Keplerian elements at J2000 + rates per Julian century (Standish, valid
// ~1800-2050). Order: a(AU) e I(deg) L(deg) longPeri(deg) longNode(deg).
const ELEMENTS = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  Earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  Mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  Uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

// real physical data + documented facts + a "learn more" write-up (NASA fact sheets)
const PLANETS = [
  { name: 'Mercury', km: 2440, tilt: 0.03, rot: 1407.6, tex: 'mercury',
    facts: ['0.39 AU · 58 million km from the Sun', '88-day year · 176-day solar day',
      'no moons · airless, cratered', 'day +430°C, night −180°C', 'gravity 3.7 m/s²'],
    blurb: 'The smallest planet and the closest to the Sun. With almost no atmosphere to hold heat, Mercury swings from scorching day to freezing night. A year there lasts just 88 Earth days, but its slow spin means a single day–night cycle takes 176.' },
  { name: 'Venus', km: 6052, tilt: 177.4, rot: -5832.5, tex: 'venus',
    facts: ['0.72 AU · 108 million km', '225-day year · spins backwards', 'no moons',
      '464°C — hottest planet, thick CO₂', 'gravity 8.9 m/s²'],
    blurb: 'Wrapped in thick clouds of sulfuric acid, Venus traps heat so efficiently that it is the hottest planet — hotter even than Mercury. It rotates backwards, and so slowly that a Venus day is longer than its year.' },
  { name: 'Earth', km: 6371, tilt: 23.44, rot: 23.93, tex: 'earth', moon: true,
    facts: ['1 AU · 150 million km — home', '365.25-day year · 24-hour day', '1 moon',
      'the only known life', 'gravity 9.8 m/s²'],
    blurb: 'The only world known to harbour life, with liquid-water oceans and a protective atmosphere. Its unusually large Moon steadies Earth\'s tilt, keeping the seasons mild and stable over long stretches of time.' },
  { name: 'Mars', km: 3390, tilt: 25.19, rot: 24.62, tex: 'mars',
    facts: ['1.52 AU · 228 million km', '687-day year · 24.6-hour day', '2 moons: Phobos, Deimos',
      '−65°C · rusted-iron deserts', 'gravity 3.7 m/s²'],
    blurb: 'The rusty-red desert world, coloured by iron oxide. Mars has the tallest volcano (Olympus Mons) and one of the deepest canyons in the solar system, and a fleet of robotic rovers is searching it for signs of ancient life.' },
  { name: 'Jupiter', km: 69911, tilt: 3.13, rot: 9.93, tex: 'jupiter',
    facts: ['5.2 AU · 778 million km', '11.9-year orbit · 10-hour day (fastest spin)',
      '95+ moons · the Great Red Spot', 'a gas giant 11× Earth wide', 'gravity 24.8 m/s²'],
    blurb: 'A colossal ball of gas more massive than all the other planets combined. Its Great Red Spot is a storm wider than Earth that has raged for centuries, and it commands a family of 95+ known moons, four of them larger than our own.' },
  { name: 'Saturn', km: 58232, tilt: 26.73, rot: 10.66, tex: 'saturn', ring: [1.2, 2.3],
    facts: ['9.5 AU · 1.4 billion km', '29-year orbit · 10.7-hour day', '140+ moons · Titan',
      'rings of ice, so light it would float', 'gravity 10.4 m/s²'],
    blurb: 'Famous for its dazzling rings of ice and rock, Saturn is so low in density that it would float in water. Its giant moon Titan has a thick atmosphere and rivers and lakes of liquid methane.' },
  { name: 'Uranus', km: 25362, tilt: 97.77, rot: -17.24, tex: 'uranus', ring: [1.5, 1.9],
    facts: ['19.2 AU · 2.9 billion km', '84-year orbit · tipped on its side',
      '28 moons · faint rings', '−195°C ice giant', 'gravity 8.7 m/s²'],
    blurb: 'An ice giant knocked completely onto its side, probably by an ancient collision. As it crawls around its 84-year orbit, each pole spends decades in continuous sunlight and then decades in darkness.' },
  { name: 'Neptune', km: 24622, tilt: 28.32, rot: 16.11, tex: 'neptune',
    facts: ['30 AU · 4.5 billion km — farthest planet', '165-year orbit · 16-hour day',
      '16 moons · Triton', 'fastest winds in the solar system', 'gravity 11.0 m/s²'],
    blurb: 'The farthest planet, a deep-blue ice giant whipped by the fastest winds in the solar system — over 2,000 km/h. Neptune was discovered by mathematics, predicted from Uranus\'s wobble before anyone saw it through a telescope.' },
];

function visRadius(km) { return 0.18 + Math.sqrt(km / 6371) * 0.34; }

// heliocentric ecliptic position (AU) from Keplerian elements at Julian date jd
function planetPos(name, jd, out) {
  const [e0, ed] = ELEMENTS[name];
  const T = (jd - 2451545.0) / 36525;
  const a = e0[0] + ed[0] * T;
  const e = e0[1] + ed[1] * T;
  const I = (e0[2] + ed[2] * T) * DEG;
  const L = e0[3] + ed[3] * T;
  const wbar = e0[4] + ed[4] * T;
  const Om = (e0[5] + ed[5] * T) * DEG;
  const w = (wbar - (e0[5] + ed[5] * T)) * DEG;
  let M = ((L - wbar) % 360 + 540) % 360 - 180;
  M *= DEG;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE; if (Math.abs(dE) < 1e-8) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  const xe = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const ye = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const ze = (sw * sI) * xp + (cw * sI) * yp;
  out.set(xe * PARAMS.dist, ze * PARAMS.dist, ye * PARAMS.dist);   // ecliptic -> world (plane = XZ)
}

const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const bgFrag = /* glsl */ `
  uniform sampler2D uMap; uniform vec2 uRepeat; uniform vec2 uOffset; uniform float uDim;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uMap, uOffset + vUv * uRepeat).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(l) * uDim, 1.0);
  }`;

export class SolarSystemScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 8000);

    this.low = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
    this.showCamera = false;         // mouse scene: default to the star sky, not your webcam
    this.showOrbits = true;
    this.timeRate = 2;               // simulated days per real second (alive at "today")
    this.jd = 2440587.5 + Date.now() / 86400000;
    this._tmp = new THREE.Vector3();
    this._wp = new THREE.Vector3();

    const loader = new THREE.TextureLoader();
    const tex = (n) => { const t = loader.load(TEX + n + '.jpg'); t.colorSpace = THREE.SRGBColorSpace; return t; };

    // optional dim webcam backdrop (same billboard as Cosmos), off by default
    if (video) {
      const bgTex = new THREE.VideoTexture(video);
      bgTex.colorSpace = THREE.SRGBColorSpace;
      this.bgMat = new THREE.ShaderMaterial({
        vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
        uniforms: { uMap: { value: bgTex }, uRepeat: { value: new THREE.Vector2(1, 1) },
          uOffset: { value: new THREE.Vector2(0, 0) }, uDim: { value: 0.22 } },
      });
      this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bgMat);
      this.backdrop.frustumCulled = false;
      this.backdrop.renderOrder = -10;
      this.scene.add(this.backdrop);
      this._fwd = new THREE.Vector3();
    }

    // ambient background stars
    const sn = this.low ? 1500 : 3500, sp = new Float32Array(sn * 3);
    for (let i = 0; i < sn; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const r = 900 + Math.random() * 900;
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph);
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

    // ---- Sun ----
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(2.1, 48, 32),
      new THREE.MeshBasicMaterial({ map: tex('sun') }));
    this.scene.add(this.sun);
    this.sun.add(new THREE.PointLight(0xffffff, 3.2, 0, 0));   // decay 0 = even light out to Neptune
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));
    this.sun.add(new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.18,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));

    // ---- planets ----
    this.orbits = new THREE.Group(); this.scene.add(this.orbits);
    this.planets = PLANETS.map((p) => {
      const holder = new THREE.Group();
      const tiltG = new THREE.Group();
      tiltG.rotation.z = p.tilt * DEG;
      holder.add(tiltG);
      const R = visRadius(p.km);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32),
        new THREE.MeshStandardMaterial({ map: tex(p.tex), roughness: 1, metalness: 0 }));
      tiltG.add(mesh);
      this.scene.add(holder);

      if (p.ring) {
        const inner = R * p.ring[0], outer = R * p.ring[1];
        const rg = new THREE.RingGeometry(inner, outer, 128);
        const rp = rg.attributes.position, ruv = rg.attributes.uv, rv = new THREE.Vector3();
        for (let i = 0; i < rp.count; i++) {
          rv.fromBufferAttribute(rp, i);
          ruv.setXY(i, (rv.length() - inner) / (outer - inner), 0.5);
        }
        const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
          map: p.tex === 'saturn' ? loader.load(TEX + 'saturn_ring.png') : null,
          color: p.tex === 'saturn' ? 0xffffff : 0x9fb0c8, side: THREE.DoubleSide,
          transparent: true, opacity: p.tex === 'saturn' ? 0.95 : 0.35, depthWrite: false }));
        ring.rotation.x = Math.PI / 2;
        tiltG.add(ring);
      }
      if (p.moon) {
        const mp = new THREE.Group(); tiltG.add(mp);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(R * 0.27, 24, 16),
          new THREE.MeshStandardMaterial({ map: tex('moon'), roughness: 1 }));
        moon.position.x = R * 3.2; mp.add(moon);
        p._moon = mp;
      }
      // real orbit path
      const pts = [];
      const [e0, ed] = ELEMENTS[p.name];
      const T = (this.jd - 2451545.0) / 36525;
      const a = e0[0] + ed[0] * T, e = e0[1] + ed[1] * T, I = (e0[2] + ed[2] * T) * DEG;
      const wbar = e0[4] + ed[4] * T, Om = (e0[5] + ed[5] * T) * DEG, w = (wbar - (e0[5] + ed[5] * T)) * DEG;
      const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
      for (let k = 0; k <= 160; k++) {
        const E = (k / 160) * Math.PI * 2;
        const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
        const xe = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
        const ye = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
        const ze = (sw * sI) * xp + (cw * sI) * yp;
        pts.push(new THREE.Vector3(xe * PARAMS.dist, ze * PARAMS.dist, ye * PARAMS.dist));
      }
      const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x3a5570, transparent: true, opacity: 0.45 }));
      this.orbits.add(orbit);

      return { data: p, holder, mesh, R, spinDir: Math.sign(p.rot) || 1,
        spin: 24 / Math.abs(p.rot), moonPivot: p._moon || null };
    });

    // ---- bloom ----
    this.composer = new EffectComposer(renderer);
    if (this.low) this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.7, 0.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ---- mouse-orbit camera state (spherical around a movable target) ----
    this.yaw = 0.6; this.pitch = 1.15; this.dist = 440;       // radians, radians, world units
    this.yawG = this.yaw; this.pitchG = this.pitch; this.distG = this.dist;
    this.target = new THREE.Vector3();
    this.targetG = new THREE.Vector3();
    this.focusIdx = null; this.hoverIdx = null;
    this.mx = 0.5; this.my = 0.5;                              // mouse in stage fraction
    this.drag = 0; this.moved = false; this.lx = 0; this.ly = 0;
    this._right = new THREE.Vector3(); this._up = new THREE.Vector3();

    this._buildFactDom();
    this._buildLearnDom();
    this._makeHandlers();
    this.onEnter();               // attach mouse listeners (also re-attached on scene switch)
    this.computePositions();
  }

  computePositions() {
    for (const pl of this.planets) planetPos(pl.data.name, this.jd, pl.holder.position);
  }

  // ---- info DOM over the stage ----
  _buildFactDom() {
    const stage = document.getElementById('stage'); if (!stage) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:14px;bottom:14px;z-index:20;max-width:300px;display:none;' +
      'background:rgba(4,8,20,.86);border:1px solid rgba(143,208,255,.4);border-radius:10px;padding:12px 14px;' +
      'font-family:VT323,monospace;color:#dff0ff;backdrop-filter:blur(4px)';
    stage.appendChild(el); this.factEl = el;
  }
  showFact(p) {
    if (!this.factEl) return;
    this.factEl.innerHTML = `<div style="color:#ffd27a;font-size:26px;line-height:1">${p.name}</div>` +
      '<ul style="margin:6px 0 0;padding-left:18px;font-size:18px;line-height:1.3">' +
      p.facts.map((f) => `<li>${f}</li>`).join('') + '</ul>' +
      '<div style="color:#7fb0d0;font-size:15px;margin-top:6px">double-click to learn more</div>';
    this.factEl.style.display = 'block';
  }
  hideFact() { if (this.factEl) this.factEl.style.display = 'none'; }

  _buildLearnDom() {
    const stage = document.getElementById('stage'); if (!stage) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;z-index:24;display:none;flex-direction:column;' +
      'background:rgba(3,5,14,.93);color:#dff0ff;font-family:VT323,monospace;padding:20px;' +
      'overflow:auto;backdrop-filter:blur(3px)';
    el.innerHTML = '<button data-x style="align-self:flex-end;background:none;border:1px solid #8fd0ff;' +
      'color:#8fd0ff;font-family:inherit;font-size:20px;padding:2px 12px;cursor:pointer">CLOSE ✕</button>' +
      '<div data-body style="max-width:640px;margin:6px auto 0;font-size:20px;line-height:1.4"></div>';
    el.querySelector('[data-x]').addEventListener('click', () => this.hideLearn());
    stage.appendChild(el); this.learnEl = el;
  }
  showLearn(p) {
    if (!this.learnEl) return;
    const b = this.learnEl.querySelector('[data-body]');
    b.innerHTML = `<h2 style="color:#ffd27a;font-size:34px;margin:0 0 8px">${p.name}</h2>` +
      `<p style="margin:0 0 14px">${p.blurb}</p>` +
      '<ul style="padding-left:20px;line-height:1.4;color:#bfe4ff">' +
      p.facts.map((f) => `<li>${f}</li>`).join('') + '</ul>' +
      '<div style="color:#7fb0d0;font-size:15px;margin-top:14px">real positions from JPL · textures NASA / Solar System Scope (CC-BY)</div>';
    this.learnEl.style.display = 'flex';
    this.learnEl.scrollTop = 0;
  }
  hideLearn() { if (this.learnEl) this.learnEl.style.display = 'none'; }

  // ---- mouse input ----
  _makeHandlers() {
    const cv = this.renderer.domElement;
    this.canvas = cv;
    this._onDown = (e) => {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      this.drag = (e.button === 2 || e.button === 1 || e.shiftKey) ? 2 : 1;   // 2 = pan, 1 = orbit
      this.lx = e.clientX; this.ly = e.clientY; this.moved = false;
    };
    this._onMove = (e) => {
      const r = cv.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / r.width; this.my = (e.clientY - r.top) / r.height;
      if (!this.drag) return;
      const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
      this.lx = e.clientX; this.ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
      if (this.drag === 1) {                        // orbit
        this.yawG -= dx * 0.005;
        this.pitchG = Math.min(1.54, Math.max(0.03, this.pitchG - dy * 0.005));
      } else {                                       // pan — glide the whole view
        this.focusIdx = null;
        const s = this.dist * 0.0016;
        this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        this.targetG.addScaledVector(this._right, -dx * s);
        this.targetG.addScaledVector(this._up, dy * s);
        const rr = Math.hypot(this.targetG.x, this.targetG.z);
        if (rr > 640) { this.targetG.x *= 640 / rr; this.targetG.z *= 640 / rr; }
      }
    };
    this._onUp = () => { if (this.drag === 1 && !this.moved) this._click(); this.drag = 0; };
    this._onWheel = (e) => {
      e.preventDefault();
      const min = this.focusIdx != null ? this.planets[this.focusIdx].R * 1.4 : 2;
      this.distG = Math.min(1400, Math.max(min, this.distG * Math.exp(e.deltaY * 0.0012)));
    };
    this._onDbl = () => { const i = this._pick(); if (i != null) { this._select(i, true); this.showLearn(this.planets[i].data); } };
    this._onCtx = (e) => e.preventDefault();
  }

  // Scenes stay cached when you switch away, so the mouse listeners must only be
  // live while this scene is active — main.js calls onEnter/onLeave on switch.
  onEnter() {
    const cv = this.canvas; if (!cv || this._listening) return;
    this._listening = true;
    cv.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    cv.addEventListener('wheel', this._onWheel, { passive: false });
    cv.addEventListener('dblclick', this._onDbl);
    cv.addEventListener('contextmenu', this._onCtx);
  }
  onLeave() {
    const cv = this.canvas; if (!cv || !this._listening) return;
    this._listening = false;
    cv.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    cv.removeEventListener('wheel', this._onWheel);
    cv.removeEventListener('dblclick', this._onDbl);
    cv.removeEventListener('contextmenu', this._onCtx);
    cv.style.cursor = 'default';
    this.drag = 0;
  }

  // nearest planet to the mouse in screen space (forgiving for tiny far planets)
  _pick() {
    let best = null, bd = 0.045;
    for (let i = 0; i < this.planets.length; i++) {
      this.planets[i].holder.getWorldPosition(this._wp).project(this.camera);
      if (this._wp.z > 1) continue;
      const sx = (this._wp.x + 1) / 2, sy = (1 - this._wp.y) / 2;
      const d = Math.hypot(sx - this.mx, sy - this.my);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  _click() { const i = this._pick(); if (i != null) this._select(i, false); else this.focusIdx = null; }
  _select(i, close) {
    this.focusIdx = i;
    this.distG = this.planets[i].R * (close ? 3.4 : 7) + 1.4;   // frame it (double-click gets closer)
    this.showFact(this.planets[i].data);
  }

  update(dt) {
    // advance real time; spin planets on their real axes; move along real orbits
    this.jd += dt * this.timeRate;
    if (this.timeRate) this.computePositions();
    for (const pl of this.planets) {
      pl.mesh.rotation.y += dt * pl.spin * pl.spinDir * 0.6;
      if (pl.moonPivot) pl.moonPivot.rotation.y += dt * 0.5;
    }
    this.sun.rotation.y += dt * 0.03;

    // ease camera state toward its goals (buttery orbit / zoom / fly-to)
    const k = Math.min(1, dt * 9);
    this.yaw += (this.yawG - this.yaw) * k;
    this.pitch += (this.pitchG - this.pitch) * k;
    this.dist += (this.distG - this.dist) * k;
    if (this.focusIdx != null) this.planets[this.focusIdx].holder.getWorldPosition(this.targetG);
    this.target.lerp(this.targetG, k);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.dist * cp * Math.sin(this.yaw),
      this.target.y + this.dist * Math.sin(this.pitch),
      this.target.z + this.dist * cp * Math.cos(this.yaw));
    this.camera.lookAt(this.target);

    // hover highlight + fact card
    const hi = this.drag ? this.hoverIdx : this._pick();
    this.hoverIdx = hi;
    for (let i = 0; i < this.planets.length; i++) {
      const want = i === hi ? 1.28 : 1.0;
      const m = this.planets[i].mesh;
      m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, want, 0.2));
    }
    if (this.canvas) this.canvas.style.cursor = hi != null ? 'pointer' : 'default';
    if (this.focusIdx != null) this.showFact(this.planets[this.focusIdx].data);
    else if (hi != null) this.showFact(this.planets[hi].data);
    else this.hideFact();

    if (this.backdrop) {
      this.backdrop.visible = this.showCamera;
      if (this.showCamera) {
        const D = 2200;
        this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.backdrop.position.copy(this.camera.position).addScaledVector(this._fwd, D);
        this.backdrop.quaternion.copy(this.camera.quaternion);
        const hh = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * D;
        this.backdrop.scale.set(hh * this.camera.aspect, hh, 1);
      }
    }
    this.orbits.visible = this.showOrbits;
  }

  recenter() {
    this.focusIdx = null;
    this.targetG.set(0, 0, 0);
    this.distG = 440; this.yawG = 0.6; this.pitchG = 1.15;
    this.hideLearn();
  }

  updateBgCover() {
    if (!this.bgMat) return;
    const sa = this.camera.aspect;
    const va = (this.video.videoWidth || 1280) / (this.video.videoHeight || 720);
    const cu = Math.min(1, sa / va), cv = Math.min(1, va / sa);
    this.bgMat.uniforms.uRepeat.value.set(-cu, cv);
    this.bgMat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
  }

  render() { this.composer.render(); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.updateBgCover();
  }

  dispose() {
    this.onLeave();
    if (this.factEl) this.factEl.remove();
    if (this.learnEl) this.learnEl.remove();
    disposeObject(this.scene);
    disposeTarget(this.composer);
  }

  getControls() {
    return [
      { type: 'slider', id: 'time', label: 'TIME', min: 0, max: 60, step: 1,
        value: this.timeRate, set: (v) => { this.timeRate = v; } },
      { type: 'button', id: 'today', label: '⏱ JUMP TO TODAY',
        onClick: () => { this.jd = 2440587.5 + Date.now() / 86400000; this.computePositions(); } },
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0.1, max: 1.0, step: 0.05,
        value: this.bloom.strength, set: (v) => { this.bloom.strength = v; } },
      { type: 'toggle', id: 'orbits', label: 'ORBITS', value: this.showOrbits,
        set: (on) => { this.showOrbits = on; } },
      { type: 'button', id: 'recenter', label: '☀ RECENTRE ON THE SUN',
        onClick: () => this.recenter() },
      { type: 'toggle', id: 'camera', label: 'WEBCAM SKY', value: this.showCamera,
        set: (on) => { this.showCamera = on; } },
      { type: 'slider', id: 'feed', label: 'FEED', min: 0.08, max: 0.6, step: 0.04,
        value: this.bgMat ? this.bgMat.uniforms.uDim.value : 0.22,
        set: (v) => { if (this.bgMat) this.bgMat.uniforms.uDim.value = v; } },
    ];
  }
}
