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
  { d: 10.8, r: 0.62, c: 0x3f7bd6, s: 0.85 },
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

export class CosmosScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050d);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);

    this.theme = 'classic';
    this.speed = 1;

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

    this.planets = PLANETS.map((p) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = Math.random() * Math.PI * 2;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 24, 16),
        new THREE.MeshStandardMaterial({ color: p.c, roughness: 0.85, metalness: 0.0 }));
      mesh.position.x = p.d;
      pivot.add(mesh);
      if (p.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 48),
          new THREE.MeshBasicMaterial({ color: 0xd9c7a0, side: THREE.DoubleSide,
            transparent: true, opacity: 0.5 }));
        ring.rotation.x = Math.PI / 2.3;
        mesh.add(ring);
      }
      // faint orbit ring
      const orbit = new THREE.Mesh(
        new THREE.RingGeometry(p.d - 0.02, p.d + 0.02, 96),
        new THREE.MeshBasicMaterial({ color: 0x3a5570, side: THREE.DoubleSide,
          transparent: true, opacity: 0.35 }));
      orbit.rotation.x = Math.PI / 2;
      this.system.add(orbit);
      this.system.add(pivot);
      return { pivot, speed: p.s };
    });

    this.applyTheme('classic');

    // ---- bloom ----
    this.composer = new EffectComposer(renderer);
    // on low-power devices render the (expensive) bloom buffer at 1x, not retina
    if (this.low) this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.8, 0.24);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // smoothed gesture state (held when no hand is visible)
    this.open = 0.0; this.x = 0.5; this.y = 0.35; this.pinch = 0.4;
    this.spin = 0;   // accumulated auto-rotation
    this.showPlanets = true;
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
    const hand = hands[0];
    if (hand) {
      const k = Math.min(1, dt * PARAMS.smooth);
      this.open += (hand.openness - this.open) * k;
      this.x += (hand.landmarks[0].x - this.x) * k;
      this.y += (hand.landmarks[0].y - this.y) * k;
      this.pinch += (hand.pinch - this.pinch) * k;
    }

    const eff = this.speed * (0.25 + this.pinch * 2.0);
    this.spin += dt * eff * 0.05;

    // planets orbit; whole disk turns slowly
    for (const pl of this.planets) pl.pivot.rotation.y += dt * pl.speed * eff * 0.5;
    this.galaxy.rotation.y = this.spin;
    this.sun.rotation.y += dt * 0.2;

    // hand -> camera orbit (dist = the solar-system <-> galaxy journey)
    const dist = 26 + Math.pow(this.open, 1.4) * (760 - 26);
    const yaw = this.spin * 0.6 + (this.x - 0.5) * Math.PI * 2.2;
    const pitch = THREE.MathUtils.lerp(1.35, 0.06, this.y);
    const cp = Math.cos(pitch);
    this.camera.position.set(
      dist * cp * Math.sin(yaw), dist * Math.sin(pitch), dist * cp * Math.cos(yaw));
    this.camera.lookAt(0, 0, 0);

    // tiny planets need bloom off when far away or the core just smears
    this.system.visible = this.showPlanets && dist < 140;
  }

  render() {
    this.composer.render();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.starMat.uniforms.uSizeScale.value = Math.max(0.5, h / 900);
  }

  getControls() {
    return [
      { type: 'slider', id: 'spin', label: 'SPIN', min: 0, max: 4, step: 0.1,
        value: this.speed, set: (v) => { this.speed = v; } },
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0.2, max: 1.3, step: 0.05,
        value: this.bloom.strength, set: (v) => { this.bloom.strength = v; } },
      { type: 'select', id: 'theme', label: 'THEME', value: this.theme,
        options: Object.keys(THEMES).map((k) => ({ label: k, value: k })),
        set: (name) => this.applyTheme(name) },
      { type: 'toggle', id: 'planets', label: 'PLANETS', value: this.showPlanets,
        set: (on) => { this.showPlanets = on; } },
    ];
  }
}
