// Scene 1: 3D cat's cradle.
// Verlet-simulated elastic strings pinned to finger anchor points
// (each finger's tip AND mid joint = 10 anchors per hand).
// Two hands  -> 10 strings, anchor-to-matching-anchor across hands.
// One hand   -> 10 strings: a loop through the tips + a loop through the joints.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const PARAMS = {
  segments: 28,        // points per string
  sag: 1.25,           // rest length = pin distance * sag (>1 droops)
  gravity: -3.0,
  damping: 0.985,
  iterations: 4,       // constraint solver passes
  depthScale: 3.0,     // how much MediaPipe z pushes into the scene
  bloomStrength: 1.1,
  bloomRadius: 0.7,
  bloomThreshold: 0.0,  // bloom runs on a glow-only layer, so no gate needed
  videoDim: 1.0,        // camera feed renders clean (no bloom washout)
  hues: [0.55, 0.62, 0.72, 0.85, 0.95], // per-finger color
};

// MediaPipe landmark ids used as string anchors: 5 fingertips + 5 mid joints
// (thumb IP + finger PIPs). Index i and i+5 belong to the same finger.
const ANCHORS = [4, 8, 12, 16, 20, 3, 6, 10, 14, 18];
const NUM_ROPES = ANCHORS.length;
// one-hand mode: string loop through the tips + loop through the joints
const ONE_HAND_PAIRS = [
  [4, 8], [8, 12], [12, 16], [16, 20], [20, 4],
  [3, 6], [6, 10], [10, 14], [14, 18], [18, 3],
];

// Per-finger filter quads (two-hand mode): Ltip -> Rtip -> Rpip -> Lpip.
// Inside each quad the video gets a different filter:
// thumb=duotone, index=thermal, middle=b&w, ring=sepia, pinky=invert.
const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bgFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  uniform float uDim;
  uniform vec2 uQuads[20];   // 5 quads x 4 corners, in screen (plane uv) space
  uniform int uQuadCount;
  varying vec2 vUv;

  vec3 thermal(float t) {
    // jet-style false color (like the reference reel):
    // cold = blue/cyan, mid = green/yellow, hot = orange/red
    return clamp(vec3(
      1.5 - abs(4.0 * t - 3.0),
      1.5 - abs(4.0 * t - 2.0),
      1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
  }

  void main() {
    // even-odd point-in-polygon per quad; handles crossed-string bowties too
    int region = -1;
    for (int q = 0; q < 5; q++) {
      if (q >= uQuadCount) break;
      bool inside = false;
      for (int i = 0; i < 4; i++) {
        vec2 a = uQuads[q * 4 + i];
        vec2 b = (i == 3) ? uQuads[q * 4] : uQuads[q * 4 + i + 1];
        if (((a.y > vUv.y) != (b.y > vUv.y)) &&
            (vUv.x < (b.x - a.x) * (vUv.y - a.y) / (b.y - a.y) + a.x)) {
          inside = !inside;
        }
      }
      if (inside && region < 0) region = q;
    }

    vec3 col = texture2D(uMap, uOffset + vUv * uRepeat).rgb;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));

    if (region == 0) col = mix(vec3(0.10, 0.00, 0.25),     // thumb: duotone
                               vec3(0.20, 1.00, 0.90), luma);
    else if (region == 1) col = thermal(luma);              // index: thermal
    else if (region == 2) col = vec3(smoothstep(0.05, 0.95, luma)); // middle: b&w
    else if (region == 3) col = vec3(                       // ring: sepia
      dot(col, vec3(0.393, 0.769, 0.189)),
      dot(col, vec3(0.349, 0.686, 0.168)),
      dot(col, vec3(0.272, 0.534, 0.131)));
    else if (region == 4) col = 1.0 - col;                  // pinky: invert
    if (region < 0) col *= uDim; // only dim the unfiltered video

    gl_FragColor = vec4(col, 1.0);
  }
`;

class Rope {
  constructor(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.alive = false;
  }

  resetBetween(a, b) {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
    }
    this.alive = true;
  }

  step(a, b, dt) {
    const { pos, prev, n } = this;
    // big endpoint jump (new detection) -> re-lay the string instead of exploding
    const jump = Math.hypot(pos[0] - a.x, pos[1] - a.y) +
      Math.hypot(pos[(n - 1) * 3] - b.x, pos[(n - 1) * 3 + 1] - b.y);
    if (!this.alive || jump > 3.0) {
      this.resetBetween(a, b);
      return;
    }

    const g = PARAMS.gravity * dt * dt;
    for (let i = 1; i < n - 1; i++) {
      const k = i * 3;
      const vx = (pos[k] - prev[k]) * PARAMS.damping;
      const vy = (pos[k + 1] - prev[k + 1]) * PARAMS.damping;
      const vz = (pos[k + 2] - prev[k + 2]) * PARAMS.damping;
      prev[k] = pos[k];
      prev[k + 1] = pos[k + 1];
      prev[k + 2] = pos[k + 2];
      pos[k] += vx;
      pos[k + 1] += vy + g;
      pos[k + 2] += vz;
    }

    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const segLen = (dist * PARAMS.sag) / (n - 1);
    for (let it = 0; it < PARAMS.iterations; it++) {
      pos.set([a.x, a.y, a.z], 0);
      pos.set([b.x, b.y, b.z], (n - 1) * 3);
      for (let i = 0; i < n - 1; i++) {
        const k1 = i * 3, k2 = (i + 1) * 3;
        const dx = pos[k2] - pos[k1];
        const dy = pos[k2 + 1] - pos[k1 + 1];
        const dz = pos[k2 + 2] - pos[k1 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = ((d - segLen) / d) * 0.5;
        const pin1 = i === 0, pin2 = i === n - 2;
        const w1 = pin1 ? 0 : pin2 ? 1 : 0.5;
        const w2 = pin2 ? 0 : pin1 ? 1 : 0.5;
        pos[k1] += dx * diff * w1 * 2 * 0.5;
        pos[k1 + 1] += dy * diff * w1 * 2 * 0.5;
        pos[k1 + 2] += dz * diff * w1 * 2 * 0.5;
        pos[k2] -= dx * diff * w2 * 2 * 0.5;
        pos[k2 + 1] -= dy * diff * w2 * 2 * 0.5;
        pos[k2 + 2] -= dz * diff * w2 * 2 * 0.5;
      }
    }
    pos.set([a.x, a.y, a.z], 0);
    pos.set([b.x, b.y, b.z], (n - 1) * 3);
  }
}

export class CradleScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.camera = new THREE.PerspectiveCamera(
      50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    // live camera feed fills the frame behind the strings, with per-finger
    // filter regions (quads) applied in the shader
    this.videoTex = new THREE.VideoTexture(video); // raw passthrough; filters run in sRGB
    this.quadPts = Array.from({ length: 20 }, () => new THREE.Vector2());
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      uniforms: {
        uMap: { value: this.videoTex },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uDim: { value: PARAMS.videoDim },
        uQuads: { value: this.quadPts },
        uQuadCount: { value: 0 },
      },
    });
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bgMat);
    this.bg.position.z = -2.5;
    this.scene.add(this.bg);
    this.cover = { u: 1, v: 1 }; // crop factors so landmarks line up with the feed
    this.updateLayout();

    // Glowing strings/dots live in their own scene over a black background, so
    // bloom only affects them — the video (in this.scene) renders clean and no
    // longer washes out under bright lighting.
    this.glowScene = new THREE.Scene();
    this.glowScene.background = new THREE.Color(0x000000);

    this.ropes = [];
    this.lines = [];
    for (let i = 0; i < NUM_ROPES; i++) {
      const rope = new Rope(PARAMS.segments);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(rope.pos, 3));
      // tip strings bright, joint strings of the same finger a bit dimmer
      const color = new THREE.Color().setHSL(
        PARAMS.hues[i % 5], 0.9, i < 5 ? 0.6 : 0.45);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      }));
      line.frustumCulled = false;
      line.visible = false;
      this.glowScene.add(line);
      this.ropes.push(rope);
      this.lines.push(line);
    }

    // glow dots on every anchor point (10 per hand)
    this.tipDots = [];
    const dotGeo = new THREE.SphereGeometry(0.03, 12, 12);
    for (let i = 0; i < NUM_ROPES * 2; i++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(PARAMS.hues[i % 5], 0.8, 0.75),
      }));
      dot.visible = false;
      this.glowScene.add(dot);
      this.tipDots.push(dot);
    }

    // Pass 1: render the glow layer and bloom it (off-screen).
    this.bloomComposer = new EffectComposer(renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.glowScene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      PARAMS.bloomStrength, PARAMS.bloomRadius, PARAMS.bloomThreshold);
    this.bloomComposer.addPass(this.bloom);

    // Pass 2: render the clean video, then add the bloomed glow on top.
    this.finalComposer = new EffectComposer(renderer);
    this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
    const mixPass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }`,
    }), 'baseTexture');
    mixPass.needsSwap = true;
    this.finalComposer.addPass(mixPass);
  }

  // Size the video plane to fill the frustum ("cover" fit, like CSS) and
  // mirror it; this.cover records the crop so landmarks map onto the image.
  updateLayout() {
    const sa = this.camera.aspect;
    const va = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    const cu = Math.min(1, sa / va);
    const cv = Math.min(1, va / sa);
    this.cover.u = cu;
    this.cover.v = cv;
    // repeat.x negative = mirrored (selfie view, matches the mirrored landmarks)
    this.bgMat.uniforms.uRepeat.value.set(-cu, cv);
    this.bgMat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
    const dist = this.camera.position.z - this.bg.position.z;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
    this.bg.scale.set(h * sa, h, 1);
  }

  // normalized video coords (0..1, y down) -> world, glued to the on-screen image
  toWorld(p) {
    const camZ = this.camera.position.z;
    const sx = 0.5 + (p.x - 0.5) / this.cover.u; // undo the cover crop
    const sy = 0.5 + (p.y - 0.5) / this.cover.v;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * camZ;
    const w = h * this.camera.aspect;
    const z = THREE.MathUtils.clamp(-p.z * PARAMS.depthScale, -1.5, 1.5);
    const k = (camZ - z) / camZ; // scale so depth never slides off the fingertip
    return { x: (sx - 0.5) * w * k, y: (0.5 - sy) * h * k, z };
  }

  // normalized video coords -> background plane uv (screen space, v up)
  toPlaneUv(p) {
    return {
      x: 0.5 + (p.x - 0.5) / this.cover.u,
      y: 0.5 - (p.y - 0.5) / this.cover.v,
    };
  }

  update(dt, hands) {
    const pairs = []; // [{a, b}] world-space pin points, up to NUM_ROPES
    if (hands.length >= 2) {
      for (const id of ANCHORS) {
        pairs.push({
          a: this.toWorld(hands[0].landmarks[id]),
          b: this.toWorld(hands[1].landmarks[id]),
        });
      }
    } else if (hands.length === 1) {
      for (const [i, j] of ONE_HAND_PAIRS) {
        pairs.push({
          a: this.toWorld(hands[0].landmarks[i]),
          b: this.toWorld(hands[0].landmarks[j]),
        });
      }
    }

    // per-finger filter quads (two hands only): Ltip -> Rtip -> Rpip -> Lpip
    if (hands.length >= 2) {
      for (let f = 0; f < 5; f++) {
        const corners = [
          hands[0].landmarks[ANCHORS[f]],
          hands[1].landmarks[ANCHORS[f]],
          hands[1].landmarks[ANCHORS[f + 5]],
          hands[0].landmarks[ANCHORS[f + 5]],
        ];
        for (let k = 0; k < 4; k++) {
          const s = this.toPlaneUv(corners[k]);
          this.quadPts[f * 4 + k].set(s.x, s.y);
        }
      }
      this.bgMat.uniforms.uQuadCount.value = 5;
    } else {
      this.bgMat.uniforms.uQuadCount.value = 0;
    }

    for (let i = 0; i < NUM_ROPES; i++) {
      const line = this.lines[i];
      if (i < pairs.length) {
        this.ropes[i].step(pairs[i].a, pairs[i].b, Math.min(dt, 1 / 30));
        line.geometry.attributes.position.needsUpdate = true;
        line.visible = true;
      } else {
        line.visible = false;
        this.ropes[i].alive = false;
      }
    }

    let d = 0;
    for (const hand of hands) {
      for (const id of ANCHORS) {
        if (d >= this.tipDots.length) break;
        const w = this.toWorld(hand.landmarks[id]);
        const dot = this.tipDots[d++];
        dot.position.set(w.x, w.y, w.z);
        dot.visible = true;
      }
    }
    for (; d < this.tipDots.length; d++) this.tipDots[d].visible = false;
  }

  render() {
    this.bloomComposer.render(); // glow layer -> off-screen bloom texture
    this.finalComposer.render(); // clean video + bloom on top -> screen
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bloomComposer.setSize(w, h);
    this.finalComposer.setSize(w, h);
    this.updateLayout();
  }

  getControls() {
    return [
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0, max: 3, step: 0.1,
        value: this.bloom.strength, set: (v) => { this.bloom.strength = v; } },
      { type: 'slider', id: 'droop', label: 'DROOP', min: 1, max: 1.8, step: 0.02,
        value: PARAMS.sag, set: (v) => { PARAMS.sag = v; } },
      { type: 'slider', id: 'depth', label: 'DEPTH', min: 0, max: 6, step: 0.2,
        value: PARAMS.depthScale, set: (v) => { PARAMS.depthScale = v; } },
      { type: 'slider', id: 'feed', label: 'FEED', min: 0.2, max: 1, step: 0.05,
        value: this.bgMat.uniforms.uDim.value,
        set: (v) => { this.bgMat.uniforms.uDim.value = v; } },
    ];
  }
}
