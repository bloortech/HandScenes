// Scene 6: Ninja hand-seals (Naruto-style jutsu).
// v1 = Chidori. Recognising the exact 12 zodiac seals from 21 landmarks isn't
// reliable, so a jutsu triggers off one distinctive, detectable pose: bring
// both hands together and hold to "channel", then lightning crackles around
// your hand. (Shadow Clone + Substitution, which need the selfie segmenter,
// come next.)

import * as THREE from 'three';
import { VideoBackground } from '../videobg.js';
import { disposeObject } from './dispose.js';

const CHARGE_TIME = 1.1;     // seconds holding the seal to fully charge
const ACTIVE_TIME = 6.0;     // chidori lasts this long once charged
const ARCS = 28, SEG = 8;    // lightning bolts + segments per bolt
const SEAL_DIST = 0.24;      // hands-together threshold (normalized)

// soft radial glow for the chidori core / charge ball
function glowTexture() {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(230,248,255,1)');
  g.addColorStop(0.3, 'rgba(120,200,255,0.85)');
  g.addColorStop(1.0, 'rgba(70,150,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NinjaScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.z = 5;

    this.dim = 0.75;
    this.intensity = 1;

    // you, as the backdrop (kept dim for drama)
    this.videoBg = new VideoBackground(video, this.camera, { dim: this.dim, sat: 1.0, z: -3 });
    this.scene.add(this.videoBg.mesh);

    // lightning = additive line segments, rebuilt every frame for the flicker
    this.lgeo = new THREE.BufferGeometry();
    this.lpos = new Float32Array(ARCS * SEG * 2 * 3);
    this.lgeo.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3));
    this.lmat = new THREE.LineBasicMaterial({
      color: 0xbfe8ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthTest: false,
    });
    this.light = new THREE.LineSegments(this.lgeo, this.lmat);
    this.light.frustumCulled = false;
    this.light.visible = false;
    this.scene.add(this.light);

    // glowing core (doubles as the charge ball while channeling)
    this.coreMat = new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false,
    });
    this.core = new THREE.Sprite(this.coreMat);
    this.scene.add(this.core);

    this.charge = 0;       // 0..1 while channeling
    this.active = 0;       // seconds of chidori remaining
    this.forced = false;   // test toggle
  }

  update(dt, hands) {
    // seal: both hands brought together (palm centers close)
    let sealing = false, mid = null;
    if (hands.length >= 2) {
      const a = hands[0].landmarks[9], b = hands[1].landmarks[9];
      if (Math.hypot(a.x - b.x, a.y - b.y) < SEAL_DIST) {
        sealing = true;
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
      }
    }

    // charge -> activate
    if (this.active <= 0 && !this.forced) {
      this.charge = sealing
        ? Math.min(1, this.charge + dt / CHARGE_TIME)
        : Math.max(0, this.charge - dt * 1.5);
      if (this.charge >= 1) {
        this.active = ACTIVE_TIME;
        this.charge = 0;
        dispatchEvent(new CustomEvent('hs-toast', { detail: '⚡ CHIDORI' }));
      }
    } else if (this.active > 0) {
      this.active = Math.max(0, this.active - dt);
    }
    const on = this.forced || this.active > 0;

    // emit from a single hand when active; from the joined hands while charging
    const hand = hands.length ? hands[hands.length - 1] : null;
    const src = on && hand ? hand.landmarks[9] : (mid || (hand && hand.landmarks[9]));
    if (src) {
      const w = this.videoBg.toWorld(src);
      this.core.position.set(w.x, w.y, 0.2);
    }

    if (on && hand) {
      this.light.visible = true;
      this.buildLightning(hand);
      this.lmat.opacity = 0.6 + 0.4 * Math.random();         // flicker
      this.coreMat.opacity = 0.9;
      this.core.scale.setScalar(0.45 + 0.08 * Math.sin(performance.now() * 0.04));
    } else {
      this.light.visible = false;
      this.coreMat.opacity = this.charge * 0.85;               // charge ball grows
      this.core.scale.setScalar(0.15 + this.charge * 0.5);
    }
    this.videoBg.mesh.material.uniforms.uDim.value = this.dim;
  }

  buildLightning(hand) {
    const c = this.videoBg.toWorld(hand.landmarks[9]);
    const p = this.lpos;
    let o = 0;
    for (let a = 0; a < ARCS; a++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = (0.22 + Math.random() * 0.5) * this.intensity;
      const ex = c.x + Math.cos(ang) * rad, ey = c.y + Math.sin(ang) * rad;
      for (let s = 0; s < SEG; s++) {
        const t1 = s / SEG, t2 = (s + 1) / SEG;
        const jit = 0.11 * this.intensity;
        const jx = (Math.random() - 0.5) * jit, jy = (Math.random() - 0.5) * jit;
        const ax = c.x + (ex - c.x) * t1 + (s === 0 ? 0 : jx);
        const ay = c.y + (ey - c.y) * t1 + (s === 0 ? 0 : jy);
        const bx = c.x + (ex - c.x) * t2 + (s === SEG - 1 ? 0 : jx);
        const by = c.y + (ey - c.y) * t2 + (s === SEG - 1 ? 0 : jy);
        p[o++] = ax; p[o++] = ay; p[o++] = 0.2;
        p[o++] = bx; p[o++] = by; p[o++] = 0.2;
      }
    }
    this.lgeo.attributes.position.needsUpdate = true;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.videoBg.updateLayout();
  }

  getControls() {
    return [
      { type: 'slider', id: 'int', label: 'LIGHTNING', min: 0.4, max: 2, step: 0.1,
        value: this.intensity, set: (v) => { this.intensity = v; } },
      { type: 'slider', id: 'dim', label: 'BACKDROP DIM', min: 0.3, max: 1, step: 0.05,
        value: this.dim, set: (v) => { this.dim = v; } },
      { type: 'toggle', id: 'fire', label: 'FORCE CHIDORI (test)',
        value: false, set: (v) => { this.forced = v; if (!v) this.active = 0; } },
    ];
  }

  dispose() { disposeObject(this.scene); }
}
