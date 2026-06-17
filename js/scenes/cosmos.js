// Scene 5: Cosmos — a solar system that lives at the heart of a galaxy.
// Same "control a 3D world with your hand" idea as the Mandelbox, but here the
// zoom IS the journey:
//   open fist        -> fly out from the solar system into the whole galaxy
//   hand left/right  -> orbit around it
//   hand up/down     -> tilt from top-down spiral to edge-on disk
//   pinch open       -> spin / orbit faster
// Real geometry (glowing sun + orbiting planets) + a ~16k-star spiral galaxy,
// lit by selective bloom. No webcam feed in the picture; the camera only tracks.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { disposeObject, disposeTarget } from './dispose.js';

const PARAMS = {
  smooth: 5,          // how fast the camera follows your hand
  galaxyR: 320,       // galaxy radius (world units)
  bulgeR: 34,         // central bulge radius (where the solar system sits)
  arms: 4,
  turns: 1.7,         // how many times the arms wrap
  nDisk: 12000,
  nBulge: 4000,
};

// inner (core) color, outer (rim) color, accent sprinkle, sun tint
const THEMES = {
  classic: { in: [1.0, 0.95, 0.78], out: [0.42, 0.66, 1.0], acc: [1.0, 0.6, 0.85], sun: [1.0, 0.82, 0.45] },
  ember:   { in: [1.0, 0.94, 0.72], out: [1.0, 0.36, 0.12], acc: [1.0, 0.82, 0.30], sun: [1.0, 0.55, 0.18] },
  ice:     { in: [0.92, 1.0, 1.0],  out: [0.18, 0.45, 1.0], acc: [0.55, 1.0, 1.0],  sun: [0.7, 0.92, 1.0] },
  candy:   { in: [1.0, 0.95, 1.0],  out: [0.70, 0.36, 1.0], acc: [1.0, 0.36, 0.72], sun: [1.0, 0.6, 0.95] },
  mono:    { in: [1.0, 1.0, 1.0],   out: [0.55, 0.58, 0.62], acc: [0.8, 0.83, 0.88], sun: [0.95, 0.97, 1.0] },
};

// planets: orbit radius, sphere radius, color, relative orbital speed
const PLANETS = [
  { d: 6.0,  r: 0.35, c: 0x9c6b4f, s: 1.7 },
  { d: 8.2,  r: 0.55, c: 0xc9a06a, s: 1.15 },
  { d: 10.8, r: 0.62, c: 0x2f6fd0, s: 0.85, earth: true },
  { d: 13.5, r: 0.45, c: 0xb55a3a, s: 0.62 },
  { d: 17.5, r: 1.25, c: 0xd8b07a, s: 0.40 },
  { d: 22.0, r: 1.05, c: 0xc8b89a, s: 0.28, ring: true },
];

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starVert = /* glsl */ `
  attribute float aSize;
  varying vec3 vColor;
  uniform float uSizeScale;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uSizeScale * (320.0 / -mv.z), 0.0, 46.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const starFrag = /* glsl */ `
  varying vec3 vColor;
  uniform sampler2D uTex;
  void main() {
    float a = texture2D(uTex, gl_PointCoord).a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, 1.0) * a;
  }
`;

// dim, mirrored "cover"-cropped webcam used as the cosmic backdrop
const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const bgFrag = /* glsl */ `
  uniform sampler2D uMap; uniform vec2 uRepeat; uniform vec2 uOffset; uniform float uDim;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uMap, uOffset + vUv * uRepeat).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));   // black & white, like the garden
    gl_FragColor = vec4(vec3(l) * uDim, 1.0);
  }
`;

export class CosmosScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050d);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);

    this.theme = 'ember';
    this.speed = 1;
    this.showCamera = true;

    // dim webcam backdrop: a screen-aligned billboard far behind the galaxy, so
    // you float in the cosmos (like the garden's feed). Built only if we have a video.
    if (video) {
      const bgTex = new THREE.VideoTexture(video);
      bgTex.colorSpace = THREE.SRGBColorSpace;   // natural brightness through OutputPass
      this.bgMat = new THREE.ShaderMaterial({
        vertexShader: bgVert, fragmentShader: bgFrag,
        depthTest: false, depthWrite: false,
        uniforms: {
          uMap: { value: bgTex },
          uRepeat: { value: new THREE.Vector2(1, 1) },
          uOffset: { value: new THREE.Vector2(0, 0) },
          uDim: { value: 0.26 },
        },
      });
      this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bgMat);
      this.backdrop.frustumCulled = false;
      this.backdrop.renderOrder = -10;   // draw first, behind everything
      this.scene.add(this.backdrop);
      this._fwd = new THREE.Vector3();
    }

    // lighter star field + smaller bloom buffer on phones / low-core machines
    this.low = matchMedia('(pointer: coarse)').matches ||
      (navigator.hardwareConcurrency || 8) <= 4;
    const nDisk = this.low ? 5200 : PARAMS.nDisk;
    const nBulge = this.low ? 1800 : PARAMS.nBulge;

    // ---- galaxy stars ----
    const N = nDisk + nBulge;
    const pos = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    this.starT = new Float32Array(N);     // 0 core .. 1 rim, drives color
    this.starAccent = new Uint8Array(N);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const { galaxyR: R, bulgeR, arms, turns } = PARAMS;

    for (let i = 0; i < nDisk; i++) {
      const rr = Math.sqrt(Math.random());
      const r = bulgeR * 0.4 + rr * (R - bulgeR * 0.4);
      const t = r / R;
      const arm = Math.floor(Math.random() * arms);
      const angle = arm * (2 * Math.PI / arms) + rr * turns * 2 * Math.PI +
        gauss() * (0.25 + 0.55 * (1 - t));
      const rad = r + gauss() * R * 0.015;
      const thick = R * 0.012 + 6 * Math.exp(-t * 4);
      pos[i * 3] = Math.cos(angle) * rad;
      pos[i * 3 + 1] = gauss() * thick;
      pos[i * 3 + 2] = Math.sin(angle) * rad;
      sizes[i] = 1.0 + Math.random() * 1.6 + (t < 0.12 ? 1.6 : 0);
      this.starT[i] = t;
      this.starAccent[i] = Math.random() < 0.07 ? 1 : 0;
    }
    for (let i = nDisk; i < N; i++) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const rb = Math.sqrt(Math.random()) * bulgeR;
      pos[i * 3] = rb * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = rb * Math.cos(phi) * 0.55;
      pos[i * 3 + 2] = rb * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 1.0 + Math.random() * 1.4;
      this.starT[i] = Math.random() * 0.14;
      this.starAccent[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    geo.setAttribute('color', this.colorAttr);

    this.starMat = new THREE.ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag,
      uniforms: { uTex: { value: softSprite() }, uSizeScale: { value: 1 } },
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.galaxy = new THREE.Points(geo, this.starMat);
    this.scene.add(this.galaxy);

    // ---- solar system (at the galactic core) ----
    this.system = new THREE.Group();
    this.scene.add(this.system);

    this.sunMat = new THREE.MeshBasicMaterial({ color: 0xffcf6a });
    this.sun = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 4), this.sunMat);
    this.system.add(this.sun);
    const sunLight = new THREE.PointLight(0xfff0d0, 420, 0, 2);
    this.sun.add(sunLight);
    this.system.add(new THREE.AmbientLight(0x223044, 1.2));

    this.earthExtras = [];
    this.planets = PLANETS.map((p) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = Math.random() * Math.PI * 2;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 36, 24),
        new THREE.MeshStandardMaterial({ color: p.c, roughness: 0.82, metalness: 0.05 }));
      mesh.position.x = p.d;
      pivot.add(mesh);
      if (p.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 64),
          new THREE.MeshBasicMaterial({ color: 0xd9c7a0, side: THREE.DoubleSide,
            transparent: true, opacity: 0.5 }));
        ring.rotation.x = Math.PI / 2.3;
        mesh.add(ring);
      }
      if (p.earth) {
        // soft blue atmosphere glow
        mesh.add(new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.13, 28, 18),
          new THREE.MeshBasicMaterial({ color: 0x6ab0ff, transparent: true, opacity: 0.22,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
        // moon on its own orbit pivot
        const moonPivot = new THREE.Group(); mesh.add(moonPivot);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.27, 18, 12),
          new THREE.MeshStandardMaterial({ color: 0xbdbdc2, roughness: 1 }));
        moon.position.x = p.r * 2.6; moonPivot.add(moon);
        this.earthExtras.push({ g: moonPivot, s: 0.5 });
      }
      const orbit = new THREE.Mesh(
        new THREE.RingGeometry(p.d - 0.02, p.d + 0.02, 96),
        new THREE.MeshBasicMaterial({ color: 0x3a5570, side: THREE.DoubleSide,
          transparent: true, opacity: 0.35 }));
      orbit.rotation.x = Math.PI / 2;
      this.system.add(orbit);
      this.system.add(pivot);
      return { pivot, mesh, speed: p.s, spin: 0.15 + Math.random() * 0.3 };
    });

    this.buildAmbient();

    this.applyTheme('ember');

    // ---- bloom ----
    this.composer = new EffectComposer(renderer);
    // on low-power devices render the (expensive) bloom buffer at 1x, not retina
    if (this.low) this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.8, 0.28);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // smoothed gesture state (held when no hand is visible)
    // default open=0.9 -> starts zoomed OUT on the whole galaxy
    this.open = 0.9; this.x = 0.5; this.y = 0.35; this.pan = 0.5;
    this.spin = 0;   // accumulated auto-rotation
    this.showPlanets = true;
  }

  // ambient (non-hand-controlled) life: drifting asteroids, shooting meteors,
  // a faint Oort cloud, and a few distant star systems out in the disk.
  buildAmbient() {
    const f = this.low ? 0.5 : 1;

    this.meteors = [];
    const meteorGeo = new THREE.SphereGeometry(0.13, 8, 6);
    for (let i = 0; i < Math.round(5 * f); i++) {
      const m = new THREE.Mesh(meteorGeo, new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
      this.resetMeteor(m);
      this.scene.add(m); this.meteors.push(m);
    }

    // Oort cloud: a faint icy shell around the solar system
    const oN = Math.round(500 * f), op = new Float32Array(oN * 3);
    for (let i = 0; i < oN; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const r = 42 + Math.random() * 34;
      op[i * 3] = r * Math.sin(ph) * Math.cos(th);
      op[i * 3 + 1] = r * Math.cos(ph);
      op[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.BufferAttribute(op, 3));
    this.oort = new THREE.Points(oGeo, new THREE.PointsMaterial({
      color: 0x9fb4d0, size: 0.7, map: softSprite(), transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.oort);

    // other star systems (kepler-like) further out in the disk
    this.systems2 = new THREE.Group(); this.scene.add(this.systems2);
    const starCols = [0x9fd0ff, 0xffd9a0, 0xff9a7a, 0xfff2cc];
    for (let i = 0; i < Math.round(4 * f); i++) {
      const g = new THREE.Group();
      const ang = Math.random() * Math.PI * 2, rad = 75 + Math.random() * 190;
      g.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 14, Math.sin(ang) * rad);
      const col = starCols[i % starCols.length];
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.8, 18, 12),
        new THREE.MeshBasicMaterial({ color: col })));
      g.add(new THREE.PointLight(col, 140, 70, 2));
      g.userData.orbits = [];
      for (let j = 0; j < 1 + Math.floor(Math.random() * 2); j++) {
        const pv = new THREE.Group(); pv.rotation.y = Math.random() * 6.28;
        const pl = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.22, 14, 10),
          new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.9 }));
        pl.position.x = 2.2 + j * 1.7 + Math.random(); pv.add(pl); g.add(pv);
        g.userData.orbits.push({ pv, s: 0.2 + Math.random() * 0.5 });
      }
      this.systems2.add(g);
    }
  }

  resetMeteor(m) {
    const ang = Math.random() * Math.PI * 2, r = 30 + Math.random() * 32;
    m.position.set(Math.cos(ang) * r, (Math.random() - 0.5) * 34, Math.sin(ang) * r);
    m.userData.vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize().multiplyScalar(18 + Math.random() * 24);
    m.userData.life = 0; m.userData.max = 1.2 + Math.random() * 1.6;
  }

  animateAmbient(dt) {
    for (const m of this.meteors) {
      m.userData.life += dt;
      m.position.addScaledVector(m.userData.vel, dt);
      m.lookAt(m.position.x + m.userData.vel.x, m.position.y + m.userData.vel.y, m.position.z + m.userData.vel.z);
      m.scale.set(1, 1, Math.min(11, 2 + m.userData.vel.length() * 0.4));  // streak
      if (m.userData.life > m.userData.max || m.position.length() > 130) this.resetMeteor(m);
    }
    if (this.oort) this.oort.rotation.y += dt * 0.01;
    if (this.systems2) for (const g of this.systems2.children)
      for (const o of g.userData.orbits) o.pv.rotation.y += dt * o.s;
  }

  applyTheme(name) {
    this.theme = name;
    const th = THEMES[name];
    const inC = new THREE.Color(...th.in), outC = new THREE.Color(...th.out);
    const acc = new THREE.Color(...th.acc);
    const arr = this.colorAttr.array;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.starT.length; i++) {
      if (this.starAccent[i]) tmp.copy(acc);
      else tmp.copy(inC).lerp(outC, Math.pow(this.starT[i], 0.8));
      arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
    }
    this.colorAttr.needsUpdate = true;
    this.sunMat.color.set(...th.sun);
  }

  update(dt, hands) {
    if (hands.length) {
      const k = Math.min(1, dt * PARAMS.smooth);
      // the hand further right on the (mirrored) screen = the user's right hand
      let right = hands[0], left = hands[0];
      if (hands.length >= 2) {
        const [a, b] = hands;
        if (a.landmarks[0].x >= b.landmarks[0].x) { right = a; left = b; } else { right = b; left = a; }
      }
      this.open += (right.openness - this.open) * k;            // RIGHT: open=zoom out, closed=in
      this.x += (right.landmarks[0].x - this.x) * k;            // RIGHT L/R -> orbital spin
      if (hands.length >= 2) {
        this.y += (left.landmarks[0].y - this.y) * k;           // LEFT U/D -> tilt
        this.pan += (left.landmarks[0].x - this.pan) * k;       // LEFT L/R -> pan
      }
    }

    const eff = this.speed;
    this.spin += dt * eff * 0.05;

    // planets orbit (pivot) and spin on their axis (mesh); moon + satellite too
    for (const pl of this.planets) {
      pl.pivot.rotation.y += dt * pl.speed * eff * 0.5;
      pl.mesh.rotation.y += dt * pl.spin;
    }
    for (const e of this.earthExtras) e.g.rotation.y += dt * e.s * (0.5 + eff);
    this.galaxy.rotation.y = this.spin;
    this.sun.rotation.y += dt * 0.2;
    this.animateAmbient(dt);

    // hand -> camera orbit (dist = the solar-system <-> galaxy journey)
    const dist = 7 + Math.pow(this.open, 1.5) * (760 - 7);
    const yaw = this.spin * 0.6 + (this.x - 0.5) * Math.PI * 2.2;
    const pitch = THREE.MathUtils.lerp(1.35, 0.06, this.y);
    const cp = Math.cos(pitch);
    this.camera.position.set(
      dist * cp * Math.sin(yaw), dist * Math.sin(pitch), dist * cp * Math.cos(yaw));
    this.camera.lookAt(0, 0, 0);
    // left-hand pan: slide the framing sideways along the camera's right axis
    const panAmt = (this.pan - 0.5) * dist * 1.1;
    this._right = this._right || new THREE.Vector3();
    this._target = this._target || new THREE.Vector3();
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(this._right, panAmt);
    this._target.set(0, 0, 0).addScaledVector(this._right, panAmt);
    this.camera.lookAt(this._target);

    // tiny planets need bloom off when far away or the core just smears
    this.system.visible = this.showPlanets && dist < 140;

    // keep the webcam backdrop filling the view, far behind the stars
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
  }

  updateBgCover() {
    if (!this.bgMat) return;
    const sa = this.camera.aspect;
    const va = (this.video.videoWidth || 1280) / (this.video.videoHeight || 720);
    const cu = Math.min(1, sa / va), cv = Math.min(1, va / sa);
    this.bgMat.uniforms.uRepeat.value.set(-cu, cv);   // mirror x for selfie view
    this.bgMat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
  }

  render() {
    this.composer.render();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.starMat.uniforms.uSizeScale.value = Math.max(0.5, h / 900);
    this.updateBgCover();
  }

  dispose() {
    disposeObject(this.scene);
    disposeTarget(this.composer);
  }

  getControls() {
    return [
      { type: 'slider', id: 'spin', label: 'SPIN', min: 0, max: 4, step: 0.1,
        value: this.speed, set: (v) => { this.speed = v; } },
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0.1, max: 1.0, step: 0.05,
        value: this.bloom.strength, set: (v) => { this.bloom.strength = v; } },
      { type: 'select', id: 'theme', label: 'THEME', value: this.theme,
        options: Object.keys(THEMES).map((k) => ({ label: k, value: k })),
        set: (name) => this.applyTheme(name) },
      { type: 'toggle', id: 'planets', label: 'PLANETS', value: this.showPlanets,
        set: (on) => { this.showPlanets = on; } },
      { type: 'toggle', id: 'camera', label: 'CAMERA', value: this.showCamera,
        set: (on) => { this.showCamera = on; } },
      { type: 'slider', id: 'feed', label: 'FEED', min: 0.1, max: 0.8, step: 0.05,
        value: this.bgMat ? this.bgMat.uniforms.uDim.value : 0.3,
        set: (v) => { if (this.bgMat) this.bgMat.uniforms.uDim.value = v; } },
    ];
  }
}
