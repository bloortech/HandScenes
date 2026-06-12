// Scene 2: blooming branch flowers over the live camera feed.
// Three plants fixed along the bottom of the frame (they don't follow hands).
// Hands are assigned by screen position: the left-most hand drives the left
// plant, the right-most the right plant, the center plant blends both.
// With one hand visible, it drives all three.
//   open fist  -> flowers bloom open (petals swing out)
//   pinch out  -> side branches unfold with big leaves + mini flowers
//   pinch in   -> branches fold back against the stem
// Both gestures are continuous and smoothed, not on/off triggers.

import * as THREE from 'three';
import { VideoBackground } from '../videobg.js';

const PARAMS = {
  plants: [               // fixed spots; tweak x/scale freely
    { x: -1.7, y: -1.85, scale: 0.55 },
    { x: 0.0, y: -1.85, scale: 0.75 },
    { x: 1.7, y: -1.85, scale: 0.55 },
  ],
  bloomSmooth: 6,        // how fast bloom follows openness (higher = snappier)
  growSmooth: 3.5,       // how fast branches follow pinch
  branchCount: 6,
  stemHeight: 2.2,       // local stem rise above the root (shorter than before)
  leafSize: 0.72,        // big leaves
  petalColor: 0xe84f9a,
  petalEmissive: 0x40102a,
  miniPetalColor: 0xc06ae8,
  centerColor: 0xffd45e,
  stemColor: 0x3d6b2f,
  leafColor: 0x4f9a3c,
};

const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
// growth window: branch eases in over its own slice of the 0..1 growth value
const win = (g, start, span) => clamp01((g - start) / span);
const ease = (t) => t * t * (3 - 2 * t); // smoothstep

function petalGeometry(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid * 0.7, len * 0.35, 0, len);
  s.quadraticCurveTo(-wid * 0.7, len * 0.35, 0, 0);
  return new THREE.ShapeGeometry(s, 8);
}

// Flower: ring(s) of petals on tilt pivots. setBloom(0..1) swings them
// from a closed bud to fully fanned open.
function makeFlower({ petalLen, petalCount, petalMat, centerMat }) {
  const group = new THREE.Group();
  const tilts = [];
  const rings = [
    { count: petalCount, len: petalLen, closed: 0.10, open: 1.25 },
    { count: petalCount - 2, len: petalLen * 0.7, closed: 0.06, open: 0.85 },
  ];
  for (const ring of rings) {
    const geo = petalGeometry(ring.len, ring.len * 0.45);
    for (let i = 0; i < ring.count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / ring.count) * Math.PI * 2 + ring.len; // offset rings
      const tilt = new THREE.Group();
      tilt.userData = { closed: ring.closed, open: ring.open };
      tilt.add(new THREE.Mesh(geo, petalMat));
      pivot.add(tilt);
      group.add(pivot);
      tilts.push(tilt);
    }
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(petalLen * 0.18, 12, 10), centerMat);
  group.add(center);

  return {
    group,
    setBloom(o) {
      for (const t of tilts) {
        t.rotation.x = lerp(t.userData.closed, t.userData.open, ease(o));
      }
      center.scale.setScalar(0.6 + o * 0.6);
    },
  };
}

function leafGeometry(len) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.35, len * 0.4, 0, len);
  s.quadraticCurveTo(-len * 0.35, len * 0.4, 0, 0);
  return new THREE.ShapeGeometry(s, 6);
}

export class FlowerScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    // live camera feed behind the plants, same as the cradle scene
    this.videoBg = new VideoBackground(video, this.camera);
    this.scene.add(this.videoBg.mesh);

    this.scene.add(new THREE.HemisphereLight(0x8899bb, 0x223311, 0.9));
    const sun = new THREE.DirectionalLight(0xffe8c8, 1.4);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
    const accent = new THREE.PointLight(0xe84f9a, 4, 12);
    accent.position.set(-2, 1.5, 2);
    this.scene.add(accent);

    const side = THREE.DoubleSide;
    this.mats = {
      petal: new THREE.MeshStandardMaterial({
        color: PARAMS.petalColor, emissive: PARAMS.petalEmissive,
        roughness: 0.55, side,
      }),
      miniPetal: new THREE.MeshStandardMaterial({
        color: PARAMS.miniPetalColor, emissive: 0x2a1040,
        roughness: 0.55, side,
      }),
      center: new THREE.MeshStandardMaterial({
        color: PARAMS.centerColor, emissive: 0x664400, roughness: 0.4,
      }),
      stem: new THREE.MeshStandardMaterial({
        color: PARAMS.stemColor, roughness: 0.8,
      }),
      leaf: new THREE.MeshStandardMaterial({
        color: PARAMS.leafColor, roughness: 0.7, side,
      }),
    };

    this.time = 0;
    this.plants = PARAMS.plants.map((cfg, i) => this.makePlant(cfg, i * 2.1));
  }

  // one full plant: short stem, main flower on top, staggered side branches
  makePlant({ x, y, scale }, phase) {
    const root = new THREE.Group();
    root.position.set(x, y, 0);
    this.scene.add(root);
    const plant = new THREE.Group();
    plant.scale.setScalar(scale);
    root.add(plant);

    const rise = PARAMS.stemHeight;
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.16, rise * 0.35, 0.05),
      new THREE.Vector3(-0.10, rise * 0.7, -0.04),
      new THREE.Vector3(0.04, rise, 0),
    ]);
    plant.add(new THREE.Mesh(
      new THREE.TubeGeometry(stemCurve, 24, 0.06, 8), this.mats.stem));

    const mainFlower = makeFlower({
      petalLen: 0.66, petalCount: 9,
      petalMat: this.mats.petal, centerMat: this.mats.center,
    });
    mainFlower.group.position.copy(stemCurve.getPoint(1));
    plant.add(mainFlower.group);

    const branches = [];
    for (let i = 0; i < PARAMS.branchCount; i++) {
      const t = 0.30 + (i / (PARAMS.branchCount - 1)) * 0.55;
      const branch = this.makeBranch({
        len: lerp(1.15, 0.65, i / (PARAMS.branchCount - 1)), // lower = longer
        azimuth: i * 2.4 + phase, // golden-angle-ish spread around the stem
        openAngle: lerp(1.15, 0.7, i / (PARAMS.branchCount - 1)),
        startG: (i / PARAMS.branchCount) * 0.5,
        withSub: i % 2 === 0,
      });
      branch.pivot.position.copy(stemCurve.getPoint(t));
      branches.push(branch);
      plant.add(branch.pivot);
    }

    const p = {
      plant, mainFlower, branches, phase,
      bloom: 0, growth: 0, targetBloom: 0, targetGrowth: 0,
    };
    mainFlower.setBloom(0);
    for (const b of branches) b.setGrowth(0, 0);
    return p;
  }

  // a branch: fold group (animated) holding a twig, leaves, a mini flower,
  // and optionally a smaller sub-branch that unfolds late in the growth range
  makeBranch({ len, azimuth, openAngle, startG, withSub }) {
    const pivot = new THREE.Group();
    pivot.rotation.y = azimuth;
    const fold = new THREE.Group();
    pivot.add(fold);

    const twig = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.038, len, 6), this.mats.stem);
    twig.position.y = len / 2;
    fold.add(twig);

    const leaves = [];
    const leafGeo = leafGeometry(PARAMS.leafSize);
    for (let k = 0; k < 3; k++) {
      const holder = new THREE.Group();
      holder.position.y = len * (0.3 + k * 0.25);
      holder.rotation.z = (k % 2 ? -1 : 1) * 1.05; // alternate sides
      holder.rotation.y = k * 0.8;
      const leaf = new THREE.Mesh(leafGeo, this.mats.leaf);
      holder.add(leaf);
      fold.add(holder);
      leaves.push(holder);
    }

    const flower = makeFlower({
      petalLen: 0.26, petalCount: 7,
      petalMat: this.mats.miniPetal, centerMat: this.mats.center,
    });
    flower.group.position.y = len;
    fold.add(flower.group);

    let sub = null;
    if (withSub) {
      sub = this.makeBranch({
        len: len * 0.55, azimuth: 1.9, openAngle: openAngle * 0.9,
        startG: 0, withSub: false,
      });
      sub.pivot.position.y = len * 0.6;
      fold.add(sub.pivot);
    }

    return {
      pivot, fold, flower, leaves, sub, startG,
      setGrowth(g, bloom) {
        const gi = ease(win(g, startG, 0.5));
        fold.scale.setScalar(Math.max(gi, 0.001));
        fold.rotation.z = lerp(0.12, openAngle, gi);
        for (let k = 0; k < leaves.length; k++) {
          leaves[k].scale.setScalar(Math.max(ease(win(gi, 0.35 + k * 0.15, 0.5)), 0.001));
        }
        flower.setBloom(bloom * gi);
        flower.group.scale.setScalar(Math.max(gi, 0.001));
        if (sub) sub.setGrowth(win(g, 0.65, 0.35), bloom); // sub-branches come late
      },
    };
  }

  update(dt, hands) {
    this.time += dt;

    // hand -> plant assignment by screen position (not handedness labels)
    const sorted = [...hands].sort(
      (a, b) => a.landmarks[0].x - b.landmarks[0].x);
    const [left, center, right] = this.plants;
    if (sorted.length === 1) {
      const h = sorted[0];
      for (const p of this.plants) {
        p.targetBloom = h.openness;
        p.targetGrowth = h.pinch;
      }
    } else if (sorted.length >= 2) {
      const l = sorted[0];
      const r = sorted[sorted.length - 1];
      left.targetBloom = l.openness;
      left.targetGrowth = l.pinch;
      right.targetBloom = r.openness;
      right.targetGrowth = r.pinch;
      center.targetBloom = (l.openness + r.openness) / 2;
      center.targetGrowth = (l.pinch + r.pinch) / 2;
    }
    // no hands -> targets hold their last values, plants stay put

    for (const p of this.plants) {
      p.bloom = lerp(p.bloom, p.targetBloom, Math.min(1, dt * PARAMS.bloomSmooth));
      p.growth = lerp(p.growth, p.targetGrowth, Math.min(1, dt * PARAMS.growSmooth));
      p.mainFlower.setBloom(p.bloom);
      for (const b of p.branches) b.setGrowth(p.growth, p.bloom);

      // gentle idle sway, a touch livelier as the plant grows
      const sway = 0.018 + p.growth * 0.012;
      p.plant.rotation.z = Math.sin(this.time * 0.7 + p.phase) * sway;
      p.plant.rotation.x = Math.sin(this.time * 0.43 + p.phase) * sway * 0.6;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.videoBg.updateLayout();
  }
}
