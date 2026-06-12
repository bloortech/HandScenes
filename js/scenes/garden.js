// Scene 2: digital garden (replaces the petal flowers).
// White wireframe dandelions over a darkened black & white camera feed,
// like the caroleann.vi "growing my own digital garden" reel.
//   open fist  -> the big dandelion's arcs bloom from a spike into a bulb,
//                 and every small flower head opens
//   pinch out  -> a field of small spark-flowers grows up, staggered
//   pinch in   -> the field sinks back down
// Either hand works for either gesture (the strongest reading wins).

import * as THREE from 'three';
import { VideoBackground } from '../videobg.js';

const PARAMS = {
  videoDim: 0.26,        // how visible the b&w camera feed is behind the garden
  bloomSmooth: 6,
  growSmooth: 3.5,
  fieldCount: 30,        // small flowers
  arcs: 36,              // meridian arcs on the big dandelion head
  arcPoints: 24,
  bulbRadius: 0.95,
  bulbHeight: 1.5,
  stemTop: 1.3,          // big dandelion stem height (bulb starts here)
  headSpokes: 22,        // spokes per small flower head
  dotsPerArc: 6,         // sparkle dots riding each arc
};

const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
const win = (g, start, span) => clamp01((g - start) / span);
const ease = (t) => t * t * (3 - 2 * t);

export class GardenScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    // darkened black & white feed, like the reel
    this.videoBg = new VideoBackground(video, this.camera, {
      dim: PARAMS.videoDim, sat: 0,
    });
    this.scene.add(this.videoBg.mesh);

    this.lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.dotMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.035, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.buildBigDandelion();
    this.buildField();

    this.bloom = 0;
    this.growth = 0;
    this.targetBloom = 0;
    this.targetGrowth = 0;
    this.time = 0;
    this.densityFrac = 1;  // fraction of the field shown (FLOWERS control)
    this.swayAmt = 1;      // idle-sway multiplier (SWAY control)
    this.updateBulb(0);
  }

  // big dandelion: stem + a cage of meridian arcs that unfolds from a
  // vertical spike (closed) into a full bulb (open), sparkle dots riding along
  buildBigDandelion() {
    this.dandelion = new THREE.Group();
    this.dandelion.position.set(0, -1.85, 0);
    this.scene.add(this.dandelion);

    const stemPts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.04, PARAMS.stemTop * 0.4, 0),
      new THREE.Vector3(-0.03, PARAMS.stemTop * 0.75, 0),
      new THREE.Vector3(0, PARAMS.stemTop, 0),
    ];
    this.dandelion.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        new THREE.CatmullRomCurve3(stemPts).getPoints(16)),
      this.lineMat));

    const segs = PARAMS.arcs * (PARAMS.arcPoints - 1) * 2;
    this.bulbGeo = new THREE.BufferGeometry();
    this.bulbGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(segs * 3), 3));
    const bulb = new THREE.LineSegments(this.bulbGeo, this.lineMat);
    bulb.frustumCulled = false;
    this.dandelion.add(bulb);

    this.bulbDotsGeo = new THREE.BufferGeometry();
    this.bulbDotsGeo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(PARAMS.arcs * PARAMS.dotsPerArc * 3), 3));
    const dots = new THREE.Points(this.bulbDotsGeo, this.dotMat);
    dots.frustumCulled = false;
    this.dandelion.add(dots);
  }

  updateBulb(o) {
    const pos = this.bulbGeo.attributes.position.array;
    const dpos = this.bulbDotsGeo.attributes.position.array;
    const { arcs, arcPoints, bulbRadius, bulbHeight, stemTop, dotsPerArc } = PARAMS;
    const dotStep = Math.max(1, Math.floor(arcPoints / dotsPerArc));
    let vi = 0, di = 0;
    for (let m = 0; m < arcs; m++) {
      const phi = (m / arcs) * Math.PI * 2;
      const cx = Math.cos(phi), sz = Math.sin(phi);
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k < arcPoints; k++) {
        const th = (k / (arcPoints - 1)) * Math.PI;
        const r = Math.sin(th) * bulbRadius * o;
        const y = stemTop +
          ((1 - Math.cos(th)) / 2) * bulbHeight * (0.35 + 0.65 * o);
        const x = r * cx, z = r * sz;
        if (k > 0) {
          pos[vi++] = px; pos[vi++] = py; pos[vi++] = pz;
          pos[vi++] = x; pos[vi++] = y; pos[vi++] = z;
        }
        px = x; py = y; pz = z;
        if (k % dotStep === 2 && di < dpos.length - 2) {
          dpos[di++] = x; dpos[di++] = y; dpos[di++] = z;
        }
      }
    }
    this.bulbGeo.attributes.position.needsUpdate = true;
    this.bulbDotsGeo.attributes.position.needsUpdate = true;
  }

  // field of small spark-flowers: stem line + asterisk head with tip dots,
  // scattered with fake depth (farther = higher on screen + smaller)
  buildField() {
    this.field = [];
    for (let i = 0; i < PARAMS.fieldCount; i++) {
      const depth = Math.random();
      const group = new THREE.Group();
      group.position.set(
        (Math.random() * 2 - 1) * 2.9,
        -1.9 + depth * 1.15,
        -depth * 0.8);
      const size = lerp(1.0, 0.45, depth);

      const h = (0.45 + Math.random() * 0.35) * size;
      const lean = (Math.random() - 0.5) * 0.12;
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(lean, h * 0.6, 0),
          new THREE.Vector3(lean * 0.5, h, 0),
        ]), this.lineMat));

      const head = new THREE.Group();
      head.position.set(lean * 0.5, h, 0);
      const spokeLen = 0.26 * size;
      const spokePts = [];
      const dotPts = [];
      for (let s = 0; s < PARAMS.headSpokes; s++) {
        const a = (s / PARAMS.headSpokes) * Math.PI * 2 + Math.random() * 0.2;
        const dir = new THREE.Vector3(
          Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.5).normalize();
        spokePts.push(new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(spokeLen));
        dotPts.push(dir.clone().multiplyScalar(spokeLen));
      }
      head.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(spokePts), this.lineMat));
      head.add(new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(dotPts), this.dotMat));
      group.add(head);

      this.scene.add(group);
      this.field.push({
        group, head,
        startG: Math.random() * 0.65, // staggered growth order
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt, hands) {
    this.time += dt;
    // either hand can grow or bloom; strongest reading wins
    for (const h of hands) {
      if (hands.indexOf(h) === 0) {
        this.targetBloom = h.openness;
        this.targetGrowth = h.pinch;
      } else {
        this.targetBloom = Math.max(this.targetBloom, h.openness);
        this.targetGrowth = Math.max(this.targetGrowth, h.pinch);
      }
    }
    this.bloom = lerp(this.bloom, this.targetBloom,
      Math.min(1, dt * PARAMS.bloomSmooth));
    this.growth = lerp(this.growth, this.targetGrowth,
      Math.min(1, dt * PARAMS.growSmooth));

    this.updateBulb(ease(this.bloom));
    this.dandelion.rotation.y += dt * 0.18; // slow shimmer spin
    this.dandelion.rotation.z = Math.sin(this.time * 0.6) * 0.015 * this.swayAmt;

    const headScale = 0.3 + 0.7 * ease(this.bloom);
    const visible = Math.round(this.densityFrac * this.field.length);
    for (let i = 0; i < this.field.length; i++) {
      const f = this.field[i];
      const gi = i < visible ? ease(win(this.growth, f.startG, 0.35)) : 0;
      f.group.scale.setScalar(Math.max(gi, 0.001));
      f.head.scale.setScalar(headScale);
      f.group.rotation.z = Math.sin(this.time * 0.8 + f.phase) * 0.04 * this.swayAmt;
    }
    // subtle twinkle
    this.dotMat.size = 0.035 + Math.sin(this.time * 3.1) * 0.007;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.videoBg.updateLayout();
  }

  getControls() {
    const ink = [
      { label: 'white', value: 0xffffff },
      { label: 'cyan', value: 0x6ff7ff },
      { label: 'magenta', value: 0xff6fe0 },
      { label: 'amber', value: 0xffd45e },
      { label: 'green', value: 0x7cff6b },
    ];
    return [
      { type: 'slider', id: 'feed', label: 'FEED', min: 0, max: 1, step: 0.05,
        value: this.videoBg.mat.uniforms.uDim.value,
        set: (v) => { this.videoBg.mat.uniforms.uDim.value = v; } },
      { type: 'select', id: 'ink', label: 'INK', value: 0xffffff,
        options: ink,
        set: (v) => { this.lineMat.color.setHex(v); this.dotMat.color.setHex(v); } },
      { type: 'slider', id: 'flowers', label: 'FLOWERS', min: 0, max: 1, step: 0.05,
        value: this.densityFrac, set: (v) => { this.densityFrac = v; } },
      { type: 'slider', id: 'bulb', label: 'BULB', min: 0.5, max: 1.6, step: 0.05,
        value: 1, set: (v) => this.dandelion.scale.setScalar(v) },
      { type: 'slider', id: 'sway', label: 'SWAY', min: 0, max: 2.5, step: 0.1,
        value: this.swayAmt, set: (v) => { this.swayAmt = v; } },
    ];
  }
}
