// Scene 6: Canary flock.
// MediaPipe ImageSegmenter cuts you out of the live feed and composites you
// against a synthetic sky (so there's no person-shaped "hole" to fill — the
// classic disappear problem). Snap your fingers (thumb to middle finger) and
// you dissolve into a flock of birds that scatter into the sky; snap again and
// they fly back and reform you.
//
// Birds are drawn from a sprite-sheet at  assets/canary.png  — 4 equal frames
// side by side (wing up / mid / down / mid), transparent background, square
// frames (e.g. 256x64). Until that file exists a procedural placeholder is
// used, so the effect is testable now and the real photo sprite just drops in.

import * as THREE from 'three';
import { ImageSegmenter, FilesetResolver } from '../vendor/mediapipe/tasks-vision.mjs';
import { disposeObject } from './dispose.js';

const SEG_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const SPRITE_URL = 'assets/canary.png';
const SPRITE_COLS = 4;          // flap frames across the sheet
const NBIRDS = 320;
// snap proxy: thumb tip (4) -> middle tip (12) distance, normalized by hand size
const SNAP_ON = 0.45, SNAP_OFF = 0.8;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

const bgVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
`;

// sky gradient + you (video masked by the segmenter), eroded away as uMorph->1
const bgFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uVideo;
  uniform sampler2D uMask;
  uniform vec2 uRepeat;     // cover crop (x<0 mirrors, selfie view)
  uniform vec2 uOffset;
  uniform float uHasMask;
  uniform float uMaskFlip;  // 1 = flip mask vertically (tune if upside down)
  uniform float uMorph;     // 0 = solid you, 1 = fully gone
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    // sky: warm horizon up to deep blue, with a slow soft band
    vec3 horizon = vec3(0.88, 0.93, 0.99);
    vec3 zenith  = vec3(0.23, 0.46, 0.86);
    vec3 sky = mix(horizon, zenith, smoothstep(0.0, 1.05, vUv.y));
    sky += 0.04 * sin(vUv.y * 18.0 + uTime * 0.2);

    vec2 cuv = uOffset + vUv * uRepeat;
    vec2 muv = vec2(cuv.x, mix(cuv.y, 1.0 - cuv.y, uMaskFlip));
    vec3 vid = texture2D(uVideo, cuv).rgb;
    float m = (uHasMask > 0.5) ? texture2D(uMask, muv).r : 0.0;

    // erode the person away with per-pixel noise as morph rises
    float person = smoothstep(0.45, 0.6, m);
    float keep = step(uMorph, hash(floor(cuv * 240.0)));
    // no mask yet (still loading / unavailable) -> show the full feed, not blank sky
    float a = (uHasMask > 0.5) ? person * keep : 1.0;
    // thin glowing rim while dissolving, for a bit of magic
    float edge = (uHasMask > 0.5) ? person * (1.0 - keep) * step(0.02, uMorph) * (1.0 - uMorph) : 0.0;
    vec3 col = mix(sky, vid, a) + vec3(0.9, 0.85, 0.4) * edge * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const birdVert = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uPixel;     // px-per-unit so point size tracks resolution
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel;
  }
`;

const birdFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uSprite;
  uniform float uTime;
  uniform float uShow;      // global fade-in of the flock
  uniform float uCols;
  varying float vPhase;
  void main() {
    float frame = mod(floor(uTime * 13.0 + vPhase * uCols), uCols);
    vec2 uv = vec2((gl_PointCoord.x + frame) / uCols, gl_PointCoord.y);
    vec4 tex = texture2D(uSprite, uv);
    if (tex.a * uShow < 0.35) discard;
    gl_FragColor = vec4(tex.rgb, tex.a * uShow);
  }
`;

// a simple yellow canary sprite-sheet drawn to a canvas (placeholder)
function placeholderSprite() {
  const f = 64, c = document.createElement('canvas');
  c.width = f * SPRITE_COLS; c.height = f;
  const x = c.getContext('2d');
  const wingY = [0.62, 0.5, 0.34, 0.5];  // up, mid, down, mid
  for (let i = 0; i < SPRITE_COLS; i++) {
    const ox = i * f, cx = ox + f / 2, cy = f * 0.5;
    x.fillStyle = '#f4c430';               // canary yellow
    // body
    x.beginPath(); x.ellipse(cx, cy + 2, 9, 7, 0, 0, Math.PI * 2); x.fill();
    // head
    x.beginPath(); x.arc(cx + 8, cy - 3, 5, 0, Math.PI * 2); x.fill();
    // beak
    x.fillStyle = '#e8902a';
    x.beginPath(); x.moveTo(cx + 12, cy - 4); x.lineTo(cx + 18, cy - 2); x.lineTo(cx + 12, cy); x.fill();
    // wings (angle by frame)
    x.fillStyle = '#e6b020';
    const wy = f * wingY[i];
    x.beginPath(); x.moveTo(cx - 2, cy); x.lineTo(cx - 16, wy); x.lineTo(cx + 4, cy + 2); x.fill();
    x.beginPath(); x.moveTo(cx + 2, cy); x.lineTo(cx + 16, wy); x.lineTo(cx - 2, cy + 2); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  return tex;
}

export class CanariesScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    this.camera.position.z = 2;

    this.time = 0;
    this.target = 0;      // 0 = you, 1 = flock
    this.morph = 0;       // eased toward target
    this.snapArmed = false;
    this.snapCooldown = 0;
    this.segFrame = 0;
    this.maskTex = null;

    // backdrop (sky + segmented you)
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uVideo: { value: new THREE.VideoTexture(video) },
        uMask: { value: null },
        uRepeat: { value: new THREE.Vector2(-1, 1) },
        uOffset: { value: new THREE.Vector2(1, 0) },
        uHasMask: { value: 0 },
        uMaskFlip: { value: 1 },
        uMorph: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    this.bg.frustumCulled = false;
    this.bg.renderOrder = -10;
    this.scene.add(this.bg);

    // flock
    this.N = NBIRDS;
    this.pos = new Float32Array(this.N * 3);
    this.homeX = new Float32Array(this.N);
    this.homeY = new Float32Array(this.N);
    this.seed = new Float32Array(this.N);
    const phase = new Float32Array(this.N), size = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.seed[i] = Math.random();
      phase[i] = Math.random();
      size[i] = 0.5 + Math.random() * 0.7;
      this.homeX[i] = 0; this.homeY[i] = -0.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.birdSize = 26;
    this.birdMat = new THREE.ShaderMaterial({
      vertexShader: birdVert, fragmentShader: birdFrag, transparent: true, depthTest: false,
      uniforms: {
        uSprite: { value: placeholderSprite() },
        uTime: { value: 0 }, uShow: { value: 0 }, uCols: { value: SPRITE_COLS },
        uPixel: { value: this.birdSize },
      },
    });
    this.birds = new THREE.Points(g, this.birdMat);
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);

    // try the real photo sprite-sheet; fall back to the placeholder silently
    new THREE.TextureLoader().load(
      SPRITE_URL,
      (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; this.birdMat.uniforms.uSprite.value = t; },
      undefined,
      () => {/* keep placeholder */},
    );

    this.initSegmenter();
  }

  async initSegmenter() {
    try {
      const vision = await FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    } catch (e) {
      console.warn('canaries: segmenter unavailable, running without cutout', e);
      this.segmenter = null;
    }
  }

  // map mask pixel (row-major, top-left origin) to ortho cam space, mirrored
  segment(nowMs) {
    if (!this.segmenter || this.video.readyState < 2) return;
    if ((this.segFrame++ & 1) === 1) return;        // every other frame is enough
    let res;
    try { res = this.segmenter.segmentForVideo(this.video, nowMs); } catch (e) { return; }
    const mask = res && res.confidenceMasks && res.confidenceMasks[0];
    if (mask) {
      const w = mask.width, h = mask.height, arr = mask.getAsFloat32Array();
      if (!this.maskTex || this.maskTex.image.width !== w || this.maskTex.image.height !== h) {
        if (this.maskTex) this.maskTex.dispose();
        this.maskTex = new THREE.DataTexture(arr.slice(), w, h, THREE.RedFormat, THREE.FloatType);
        this.maskTex.minFilter = this.maskTex.magFilter = THREE.LinearFilter;
      } else {
        this.maskTex.image.data.set(arr);
      }
      this.maskTex.needsUpdate = true;
      this.bgMat.uniforms.uMask.value = this.maskTex;
      this.bgMat.uniforms.uHasMask.value = 1;
      this._lastMask = { w, h, arr: arr.slice() };
    }
    if (res && res.close) res.close();
  }

  // sample the latest mask to seed bird "home" points where the person is
  spawnFromPerson() {
    const aspect = -this.camera.left; // camera.left = -aspect
    const m = this._lastMask;
    let cx = 0, cy = -0.1, rx = 0.35 * aspect, ry = 0.5;
    if (m) {
      let sx = 0, sy = 0, n = 0, minx = 1, maxx = 0, miny = 1, maxy = 0;
      const step = 4;
      for (let y = 0; y < m.h; y += step) {
        for (let x = 0; x < m.w; x += step) {
          if (m.arr[y * m.w + x] > 0.5) {
            const u = 1 - x / m.w, v = y / m.h;   // mirror x for selfie view
            sx += u; sy += v; n++;
            if (u < minx) minx = u; if (u > maxx) maxx = u;
            if (v < miny) miny = v; if (v > maxy) maxy = v;
          }
        }
      }
      if (n > 30) {
        cx = ((sx / n) - 0.5) * 2 * aspect;
        cy = (0.5 - (sy / n)) * 2;
        rx = Math.max(0.1, (maxx - minx)) * aspect;
        ry = Math.max(0.1, (maxy - miny));
      }
    }
    for (let i = 0; i < this.N; i++) {
      this.homeX[i] = cx + (Math.random() - 0.5) * rx * 2;
      this.homeY[i] = cy + (Math.random() - 0.5) * ry * 2;
    }
  }

  update(dt, hands) {
    this.time += dt;
    const nowMs = performance.now();
    this.segment(nowMs);

    // snap proxy: thumb tip -> middle finger tip closes quickly
    this.snapCooldown = Math.max(0, this.snapCooldown - dt);
    let closed = false, apart = false;
    for (const hand of hands) {
      const lm = hand.landmarks;
      const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
      const sep = d(4, 12) / (d(0, 9) || 1e-3);
      if (sep < SNAP_ON) closed = true;
      if (sep > SNAP_OFF) apart = true;
    }
    if (apart) this.snapArmed = true;
    if (this.snapArmed && closed && this.snapCooldown === 0) {
      this.snapArmed = false; this.snapCooldown = 0.7;
      if (this.target < 0.5) { this.spawnFromPerson(); this.target = 1; }
      else this.target = 0;
      dispatchEvent(new CustomEvent('hs-toast', { detail: this.target ? '🐦 …poof!' : '↩ reforming' }));
    }

    // ease morph toward target
    this.morph += (this.target - this.morph) * Math.min(1, dt * 2.2);
    this.bgMat.uniforms.uMorph.value = this.morph;
    this.bgMat.uniforms.uTime.value = this.time;

    // place birds: lerp home -> wandering sky position by a staggered morph
    const aspect = -this.camera.left;
    const t = this.time;
    const p = this.pos;
    for (let i = 0; i < this.N; i++) {
      const s = this.seed[i];
      const wx = (aspect * 0.95) * Math.sin(t * (0.18 + 0.12 * s) + s * 6.28)
        + 0.12 * Math.sin(t * 0.9 + s * 12.0);
      const wy = 0.15 + 0.75 * Math.abs(Math.sin(t * (0.12 + 0.1 * s) + s * 3.14))
        + 0.06 * Math.cos(t * 1.3 + s * 9.0);
      const mi = smooth(0, 1, clamp01(this.morph * 1.3 - s * 0.25));
      const k = i * 3;
      p[k] = this.homeX[i] + (wx - this.homeX[i]) * mi;
      p[k + 1] = this.homeY[i] + (wy - this.homeY[i]) * mi;
      p[k + 2] = 0;
    }
    this.birds.geometry.attributes.position.needsUpdate = true;
    this.birdMat.uniforms.uTime.value = t;
    this.birdMat.uniforms.uShow.value = clamp01(this.morph * 3);
    this.birds.visible = this.morph > 0.01;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize(w, h) {
    const aspect = w / h;
    this.camera.left = -aspect; this.camera.right = aspect;
    this.camera.top = 1; this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
    // cover-crop the camera feed onto the sky plane (mirrored)
    const va = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    const cu = Math.min(1, aspect / va), cv = Math.min(1, va / aspect);
    this.bgMat.uniforms.uRepeat.value.set(-cu, cv);
    this.bgMat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
    this.birdMat.uniforms.uPixel.value = this.birdSize * (h / 720);
  }

  getControls() {
    return [
      { type: 'toggle', id: 'birds', label: 'BIRDS (or snap fingers)',
        value: this.target > 0.5, set: (v) => { if (v) { this.spawnFromPerson(); this.target = 1; } else this.target = 0; } },
      { type: 'slider', id: 'size', label: 'BIRD SIZE', min: 10, max: 60, step: 2,
        value: this.birdSize, set: (v) => { this.birdSize = v; this.birdMat.uniforms.uPixel.value = v * (innerHeight / 720); } },
      { type: 'toggle', id: 'flip', label: 'FLIP CUTOUT (if misaligned)',
        value: this.bgMat.uniforms.uMaskFlip.value === 1,
        set: (v) => { this.bgMat.uniforms.uMaskFlip.value = v ? 1 : 0; } },
    ];
  }

  dispose() {
    disposeObject(this.scene);
    if (this.maskTex) this.maskTex.dispose();
    if (this.segmenter && this.segmenter.close) { try { this.segmenter.close(); } catch (e) {} }
  }
}
