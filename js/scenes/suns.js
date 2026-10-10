// Scene 5: Three Suns — Liu Cixin's three-body problem, flown by hand.
// Three suns with real mutual gravity drag Trisolaris (a small test planet)
// between them. When one sun dominates the planet's sky for a while, that's
// a Stable Era; when the dominant sun keeps changing, that's a Chaotic Era.
//   right hand open/closed  -> zoom out / in
//   right hand left/right   -> orbit the camera
//   left hand up/down       -> tilt (top-down <-> edge-on)
//   left hand left/right    -> pan
//   pinch near a sun        -> grab it; drag it, let go to fling it
// Camera control mirrors Cosmos exactly, so the two scenes feel like one hand
// language. No webcam feed in the picture; the camera only tracks your hands.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { disposeObject, disposeTarget } from './dispose.js';
import { stepSuns, stepPlanet, EraTracker, PRESETS } from './suns-physics.js';

const PARAMS = {
  smooth: 5,          // hand -> camera follow speed, same feel as Cosmos
  distMin: 2,
  distMax: 40,
  physDt: 0.01,        // fixed physics substep (seconds of sim time)
  maxSubsteps: 12,      // bounds worst-case cost on a slow/lagging frame
  trailMax: 220,
};

const SUN_LOOK = [
  { r: 1.05, color: 0xffcf6a, lightColor: 0xfff0d0 },
  { r: 0.92, color: 0xff6a4a, lightColor: 0xffc8a8 },
  { r: 0.85, color: 0x9ad8ff, lightColor: 0xcfe8ff },
];
const PLANET_COLOR = 0x8fa6c2;

const PINCH_GRAB = 0.28;      // pinch value (0=closed..1=open) to START a grab
const PINCH_RELEASE = 0.42;   // must open past this to release (hysteresis)
const PINCH_GRAB_RADIUS = 0.16; // normalized-screen distance to a sun to grab it
const NEAR_DIST = 6;          // "tri-solar day": all suns within this range
const FAR_DIST = 20;          // "flying stars": every sun farther than this
const SKY_TOAST_COOLDOWN = 15000; // ms between tri-solar-day / flying-stars toasts

// trails render as fading glow dots (not lines) so they read clearly through
// the bloom pass, the same visual language as the starfield/Oort-style points.
const trailVert = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uSize;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uSize * (0.4 + aAlpha) * (140.0 / -mv.z), 1.0, 18.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const trailFrag = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uTex, gl_PointCoord).a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * vAlpha);
  }
`;

// a bounded, fading orbit trail: push() adds the newest point and drops the
// oldest once full, so the buffer never grows.
class Trail {
  constructor(color, max, sprite) {
    this.max = max;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: trailVert, fragmentShader: trailFrag,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTex: { value: sprite }, uSize: { value: 6 } },
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.line = new THREE.Points(geo, mat);
    this.line.frustumCulled = false;
    this.geo = geo;
  }
  push(x, y, z) {
    this.pts.push(x, y, z);
    if (this.pts.length > this.max * 3) this.pts.splice(0, 3);
    const n = this.pts.length / 3;
    for (let i = 0; i < n; i++) {
      this.posAttr.array[i * 3] = this.pts[i * 3];
      this.posAttr.array[i * 3 + 1] = this.pts[i * 3 + 1];
      this.posAttr.array[i * 3 + 2] = this.pts[i * 3 + 2];
      this.alphaAttr.array[i] = ((i + 1) / n) * 0.6;
    }
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }
  clear() { this.pts = []; this.geo.setDrawRange(0, 0); }
}

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SunsScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03040a);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);

    this.speed = 1;
    this.low = matchMedia('(pointer: coarse)').matches ||
      (navigator.hardwareConcurrency || 8) <= 4;

    // ---- starfield (just a backdrop; the drama is the suns) ----
    const nStars = this.low ? 2200 : 5000;
    const sp = new Float32Array(nStars * 3);
    for (let i = 0; i < nStars; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const r = 220 + Math.random() * 420;
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph);
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sGeo, new THREE.PointsMaterial({
      color: 0xbfd4ff, size: 1.1, map: softSprite(), transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.stars);

    this.scene.add(new THREE.AmbientLight(0x1a2030, 0.9));

    // ---- the three suns ----
    this.sunMeshes = SUN_LOOK.map((look) => {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(look.r, 3),
        new THREE.MeshBasicMaterial({ color: look.color }));
      const light = new THREE.PointLight(look.lightColor, 340, 0, 2);
      mesh.add(light);
      this.scene.add(mesh);
      return mesh;
    });
    const trailSprite = softSprite();
    this.sunTrails = SUN_LOOK.map((look) => new Trail(look.color, PARAMS.trailMax, trailSprite));
    for (const t of this.sunTrails) this.scene.add(t.line);

    // ---- Trisolaris: a small lit test planet ----
    this.planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 28, 20),
      new THREE.MeshStandardMaterial({ color: PLANET_COLOR, roughness: 0.75, metalness: 0.1 }));
    this.scene.add(this.planetMesh);
    this.planetTrail = new Trail(0x9fd0ff, PARAMS.trailMax, trailSprite);
    this.scene.add(this.planetTrail.line);

    // ---- bloom ----
    this.composer = new EffectComposer(renderer);
    if (this.low) this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.42, 0.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // smoothed gesture state, camera framing
    this.open = 0.5; this.x = 0.5; this.y = 0.42; this.pan = 0.5;
    this.spin = 0;
    this.lookTarget = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._panTarget = new THREE.Vector3();

    // pinch-grab state
    this.grabbed = null;
    this.grabHandLabel = null;
    this.grabTarget = new THREE.Vector3();
    this.grabVel = new THREE.Vector3();
    this.grabCamDist = 10;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector3();
    this.tmpV = new THREE.Vector3();

    // physics state
    this.physAccum = 0;
    this.era = new EraTracker();
    this.wasStable = false;
    this.wasTriDay = false;
    this.wasFlying = false;
    this.lastSkyToast = 0;

    this.loadPreset('figureEight');
  }

  loadPreset(name) {
    const preset = PRESETS[name] || PRESETS.figureEight;
    this.presetName = PRESETS[name] ? name : 'figureEight';
    const { suns, planet } = preset.make();
    this.suns = suns;
    this.planet = planet;
    this.physAccum = 0;
    this.era.reset();
    this.wasStable = false; this.wasTriDay = false; this.wasFlying = false;
    this.grabbed = null;
    for (const t of this.sunTrails) t.clear();
    this.planetTrail.clear();
    this.lookTarget.set(0, 0, 0);
    this.syncVisuals();
  }

  sunsCOM() {
    let M = 0, x = 0, y = 0, z = 0;
    for (const s of this.suns) { M += s.m; x += s.m * s.x; y += s.m * s.y; z += s.m * s.z; }
    return this.tmpV.set(x / M, y / M, z / M);
  }

  physStep(h) {
    const before = this.suns;
    const after = stepSuns(before, h);
    if (this.grabbed != null) {
      const g = this.grabbed;
      after[g] = {
        ...after[g],
        x: this.grabTarget.x, y: this.grabTarget.y, z: this.grabTarget.z,
        vx: this.grabVel.x, vy: this.grabVel.y, vz: this.grabVel.z,
      };
    }
    const res = stepPlanet(this.planet, before, after, h);
    this.suns = after;
    this.planet = res.body;
    this.era.push(res.dominant);
  }

  // find/drag/release a grabbed sun from pinch gestures, screen-projected
  updateGrab(hands, dt) {
    const pinchPoints = hands.map((h) => {
      const t0 = h.tips[0], t1 = h.tips[1]; // thumb, index
      return { label: h.label, x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2, pinch: h.pinch };
    });

    if (this.grabbed != null) {
      const pp = pinchPoints.find((p) => p.label === this.grabHandLabel);
      if (!pp || pp.pinch > PINCH_RELEASE) { this.grabbed = null; return; }
      this.ndc.set(pp.x * 2 - 1, 1 - pp.y * 2, 0.5);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const p = this.raycaster.ray.origin.clone()
        .addScaledVector(this.raycaster.ray.direction, this.grabCamDist);
      const safedt = Math.max(dt, 1 / 240);
      this.grabVel.set(
        (p.x - this.grabTarget.x) / safedt,
        (p.y - this.grabTarget.y) / safedt,
        (p.z - this.grabTarget.z) / safedt);
      this.grabTarget.copy(p);
      return;
    }

    let bestI = -1, bestLabel = null, bestDist = PINCH_GRAB_RADIUS;
    for (const pp of pinchPoints) {
      if (pp.pinch > PINCH_GRAB) continue;
      for (let i = 0; i < this.suns.length; i++) {
        const s = this.suns[i];
        this.tmpV.set(s.x, s.y, s.z).project(this.camera);
        const sx = (this.tmpV.x + 1) / 2, sy = (1 - this.tmpV.y) / 2;
        const d = Math.hypot(sx - pp.x, sy - pp.y);
        if (d < bestDist) { bestDist = d; bestI = i; bestLabel = pp.label; }
      }
    }
    if (bestI >= 0) {
      this.grabbed = bestI;
      this.grabHandLabel = bestLabel;
      const s = this.suns[bestI];
      this.grabCamDist = this.camera.position.distanceTo(new THREE.Vector3(s.x, s.y, s.z));
      this.grabTarget.set(s.x, s.y, s.z);
      this.grabVel.set(0, 0, 0);
      dispatchEvent(new CustomEvent('hs-toast', { detail: '☉ sun grabbed — drag it, let go to fling it' }));
    }
  }

  syncVisuals() {
    for (let i = 0; i < this.suns.length; i++) {
      const s = this.suns[i];
      this.sunMeshes[i].position.set(s.x, s.y, s.z);
      this.sunTrails[i].push(s.x, s.y, s.z);
    }
    this.planetMesh.position.set(this.planet.x, this.planet.y, this.planet.z);
    this.planetTrail.push(this.planet.x, this.planet.y, this.planet.z);
  }

  updateEraAndToasts() {
    const stableNow = this.era.stable;
    if (stableNow !== this.wasStable) {
      this.wasStable = stableNow;
      dispatchEvent(new CustomEvent('hs-toast',
        { detail: stableNow ? '☉ Stable Era begins' : '☄ Chaotic Era' }));
    }

    const p = this.planet;
    let minDot = 1, minDist = Infinity;
    const dirs = this.suns.map((s) => {
      const dx = s.x - p.x, dy = s.y - p.y, dz = s.z - p.z;
      const d = Math.max(Math.hypot(dx, dy, dz), 1e-6);
      return { d, ux: dx / d, uy: dy / d, uz: dz / d };
    });
    for (let i = 0; i < dirs.length; i++) {
      minDist = Math.min(minDist, dirs[i].d);
      for (let j = i + 1; j < dirs.length; j++) {
        const dot = dirs[i].ux * dirs[j].ux + dirs[i].uy * dirs[j].uy + dirs[i].uz * dirs[j].uz;
        minDot = Math.min(minDot, dot);
      }
    }
    const triDay = minDot > 0.3 && minDist < NEAR_DIST;
    const flying = minDist > FAR_DIST;
    const now = performance.now();
    if (triDay && !this.wasTriDay && now - this.lastSkyToast > SKY_TOAST_COOLDOWN) {
      dispatchEvent(new CustomEvent('hs-toast', { detail: '☀ Tri-solar day: three suns in the sky' }));
      this.lastSkyToast = now;
    } else if (flying && !this.wasFlying && now - this.lastSkyToast > SKY_TOAST_COOLDOWN) {
      dispatchEvent(new CustomEvent('hs-toast',
        { detail: '❄ Flying stars: the suns are far away, deep cold' }));
      this.lastSkyToast = now;
    }
    this.wasTriDay = triDay; this.wasFlying = flying;
  }

  update(dt, hands) {
    if (hands.length) {
      const k = Math.min(1, dt * PARAMS.smooth);
      let right = hands[0], left = hands[0];
      if (hands.length >= 2) {
        const [a, b] = hands;
        if (a.landmarks[0].x >= b.landmarks[0].x) { right = a; left = b; } else { right = b; left = a; }
      }
      this.open += (right.openness - this.open) * k;
      this.x += (right.landmarks[0].x - this.x) * k;
      if (hands.length >= 2) {
        this.y += (left.landmarks[0].y - this.y) * k;
        this.pan += (left.landmarks[0].x - this.pan) * k;
      }
    }

    this.spin += dt * this.speed * 0.05;
    const dist = PARAMS.distMin + Math.pow(this.open, 1.5) * (PARAMS.distMax - PARAMS.distMin);
    const yaw = this.spin * 0.6 + (this.x - 0.5) * Math.PI * 2.2;
    const pitch = THREE.MathUtils.lerp(1.3, 0.08, this.y);
    const cp = Math.cos(pitch);

    const com = this.sunsCOM().clone();
    this.lookTarget.lerp(com, Math.min(1, dt * 2));
    this.camera.position.set(
      this.lookTarget.x + dist * cp * Math.sin(yaw),
      this.lookTarget.y + dist * Math.sin(pitch),
      this.lookTarget.z + dist * cp * Math.cos(yaw));
    this.camera.lookAt(this.lookTarget);
    const panAmt = (this.pan - 0.5) * dist * 1.1;
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(this._right, panAmt);
    this._panTarget.copy(this.lookTarget).addScaledVector(this._right, panAmt);
    this.camera.lookAt(this._panTarget);

    this.updateGrab(hands, dt);

    this.physAccum += dt * this.speed;
    let steps = 0;
    while (this.physAccum >= PARAMS.physDt && steps < PARAMS.maxSubsteps) {
      this.physStep(PARAMS.physDt);
      this.physAccum -= PARAMS.physDt;
      steps++;
    }
    if (steps === PARAMS.maxSubsteps) this.physAccum = 0;

    this.stars.rotation.y += dt * 0.004;
    this.syncVisuals();
    this.updateEraAndToasts();
  }

  render() {
    this.composer.render();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
  }

  dispose() {
    disposeObject(this.scene);
    disposeTarget(this.composer);
  }

  getControls() {
    return [
      { type: 'select', id: 'preset', label: 'PRESET', value: this.presetName,
        options: Object.entries(PRESETS).map(([k, v]) => ({ label: v.label, value: k })),
        set: (name) => this.loadPreset(name) },
      { type: 'slider', id: 'speed', label: 'SPEED', min: 0, max: 3, step: 0.1,
        value: this.speed, set: (v) => { this.speed = v; } },
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0.1, max: 1.6, step: 0.05,
        value: this.bloom.strength, set: (v) => { this.bloom.strength = v; } },
      { type: 'button', id: 'reset', label: '↺ RESET', onClick: () => this.loadPreset(this.presetName) },
    ];
  }
}
