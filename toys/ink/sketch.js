// Water Ink — drum-reactive suminagashi. Browser port of the DrumReactive
// TouchDesigner water-ink node (build_ink.py + inksim.glsl + inkrender.glsl):
// drum hits drop coloured ink that swirls along a curl-noise flow, bleeds,
// and dries on warm paper. Mic in -> 5-band onset detection; each drum has
// its own ink: KICK indigo, SNARE teal, HAT slate, TOM rust, CYMBAL sage.
// Works with any sound (or tap the paper to drop ink by hand). All client-side.
//
// TD Feedback TOP -> ping-pong pair of half-float render targets here; the two
// GLSL TOPs port almost line-for-line (vUV.st->vUv, sTD2DInputs->sampler2D).

import * as THREE from '/vendor/three/three.module.js';

const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');

// ---- fluid feel (same defaults as the TD build) ----------------------------
const PARAMS = {
  input: 6,        // mic pre-gain
  sens: 1.4,       // onset sensitivity (divides the thresholds)
  dry: 0.995,      // closer to 1 = ink lingers longer
  advect: 0.0016,  // swirl / flow amount
  diffuse: 0.13,   // how fast ink bleeds
};
const SIM_W = 1280, SIM_H = 720;

// ---- drum split (single mic: bands + onset vs running average) -------------
const INKS = {
  kick:  [0.10, 0.13, 0.38],   // indigo
  snare: [0.08, 0.40, 0.44],   // teal
  hat:   [0.32, 0.48, 0.62],   // slate blue
  tom:   [0.55, 0.28, 0.12],   // rust
  cym:   [0.24, 0.44, 0.30],   // sage
};
const DRUMS = [
  { key: 'kick',  lo: 30,    hi: 160,   gain: 1.5, thrOff: 0.0 },
  { key: 'tom',   lo: 120,   hi: 320,   gain: 1.6, thrOff: 0.2 },
  { key: 'snare', lo: 200,   hi: 450,   gain: 1.0, thrOff: 0.1, crack: [2000, 4500, 0.7] },
  { key: 'hat',   lo: 6000,  hi: 11000, gain: 1.5, thrOff: 0.2 },
  { key: 'cym',   lo: 12000, hi: 18000, gain: 2.0, thrOff: 0.3 },
];
const BASE_THR = 1.6;
const REFRACT_MS = 70;      // one blob per drum per 70ms max

// ---- audio -----------------------------------------------------------------
let audioCtx = null, analyser = null, freqData = null, inputGain = null;
const avgs = {}, lastHit = {};

function bandE(lo, hi) {
  const nyq = audioCtx.sampleRate / 2, n = freqData.length;
  const i0 = Math.max(0, Math.floor((lo / nyq) * n));
  const i1 = Math.min(n - 1, Math.ceil((hi / nyq) * n));
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += freqData[i];
  return sum / Math.max(1, i1 - i0 + 1) / 255;
}

// returns {key, e} for the strongest drum that fired this frame, else null
function detectDrums(now) {
  analyser.getByteFrequencyData(freqData);
  const E = {};
  for (const d of DRUMS) {
    let e = bandE(d.lo, d.hi);
    if (d.crack) e += bandE(d.crack[0], d.crack[1]) * d.crack[2];
    E[d.key] = e * d.gain;
  }
  // kick/snare bleed into the other bands — same suppression as the TD drive
  E.hat = Math.max(0, E.hat - E.kick * 0.4);
  E.cym = Math.max(0, E.cym - E.kick * 0.3);
  E.tom = Math.max(0, E.tom - E.snare * 0.3);

  let best = null, bestE = 0;
  for (const d of DRUMS) {
    const e = E[d.key];
    const prev = avgs[d.key] ?? e;
    const avg = prev + (e - prev) * 0.10;     // slow running average = the room
    avgs[d.key] = avg;
    const thr = (BASE_THR + d.thrOff) / PARAMS.sens;
    if (e > avg * thr && e > 0.012 && now - (lastHit[d.key] ?? -1e9) > REFRACT_MS) {
      lastHit[d.key] = now;
      if (e > bestE) { bestE = e; best = d.key; }
    }
  }
  return best ? { key: best, e: bestE } : null;
}

// ---- shaders (ported from inksim.glsl / inkrender.glsl) ---------------------
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const SIM_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec4 u_a;   // texelX, texelY, time, dry
  uniform vec4 u_b;   // advect, diffuse, reset, _
  uniform vec4 u_c;   // injX, injY, injSize, injStrength (0 = none)
  uniform vec4 u_d;   // ink rgb
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec2 curl(vec2 p){
    float e = 0.06;
    float x1 = vnoise(p + vec2(0.0, e)), x2 = vnoise(p - vec2(0.0, e));
    float y1 = vnoise(p + vec2(e, 0.0)), y2 = vnoise(p - vec2(e, 0.0));
    return vec2(x1 - x2, -(y1 - y2)) / (2.0 * e);
  }

  void main(){
    vec2 uv = vUv;
    if (u_b.z > 0.5){ gl_FragColor = vec4(0.0); return; }   // reset / new sheet

    vec2  t    = u_a.xy;
    float time = u_a.z;

    // advect along a slowly evolving curl-noise flow
    vec2 flow = curl(uv * 4.0 + time * 0.03) * u_b.x;
    vec4 prev = texture2D(uTex, uv - flow);

    // diffuse (ink bleeds outward)
    vec4 bl = (texture2D(uTex, uv + vec2(t.x, 0.0)) +
               texture2D(uTex, uv - vec2(t.x, 0.0)) +
               texture2D(uTex, uv + vec2(0.0, t.y)) +
               texture2D(uTex, uv - vec2(0.0, t.y))) * 0.25;
    prev = mix(prev, bl, u_b.y);

    // dry
    prev *= u_a.w;

    // inject a soft ink blob on a hit
    if (u_c.w > 0.001){
      float dd = distance(uv, u_c.xy);
      float m  = exp(-(dd * dd) / (u_c.z * u_c.z)) * u_c.w;
      prev.rgb += u_d.rgb * m;
      prev.a   += m;
    }

    gl_FragColor = prev;
  }`;

const RENDER_FRAG = /* glsl */`
  uniform sampler2D uTex;
  uniform vec4 u_a;   // texelX, texelY, _, _
  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main(){
    vec2 uv = vUv;
    vec2 t  = u_a.xy;

    vec4  s    = texture2D(uTex, uv);
    float dens = s.a;
    vec3  ink  = s.rgb / max(s.a, 0.001);          // average pigment colour

    // warm paper with faint grain
    vec3 paper = vec3(0.930, 0.910, 0.860);
    paper += (hash(floor(uv * vec2(1280.0, 720.0))) - 0.5) * 0.025;

    // watercolour edge darkening: gradient of coverage
    float gx = texture2D(uTex, uv + vec2(t.x, 0.0)).a - texture2D(uTex, uv - vec2(t.x, 0.0)).a;
    float gy = texture2D(uTex, uv + vec2(0.0, t.y)).a - texture2D(uTex, uv - vec2(0.0, t.y)).a;
    float edge = clamp(length(vec2(gx, gy)) * 6.0, 0.0, 0.6);
    vec3  inkE = ink * (1.0 - edge);               // darker at the spreading front

    float cover = clamp(dens * 1.4, 0.0, 0.94);
    vec3  col   = mix(paper, inkE, cover);

    gl_FragColor = vec4(col, 1.0);
  }`;

// ---- gl setup ----------------------------------------------------------------
let renderer, scene, camera, quad, simMat, renMat, rtA, rtB;
let resetFrames = 3;      // clear the field on the first few frames + NEW SHEET
let inject = null;        // { x, y, size, strength, color } for this frame only

function makeRT() {
  return new THREE.WebGLRenderTarget(SIM_W, SIM_H, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
  });
}

function setupGL() {
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.Camera();

  const texel = new THREE.Vector4(1 / SIM_W, 1 / SIM_H, 0, PARAMS.dry);
  simMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: SIM_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      uTex: { value: null },
      u_a: { value: texel.clone() },
      u_b: { value: new THREE.Vector4(PARAMS.advect, PARAMS.diffuse, 1, 0) },
      u_c: { value: new THREE.Vector4(0, 0, 0, 0) },
      u_d: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
  });
  renMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: RENDER_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      uTex: { value: null },
      u_a: { value: texel.clone() },
    },
  });

  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat);
  quad.frustumCulled = false;
  scene.add(quad);

  rtA = makeRT(); rtB = makeRT();
}

function frame(now) {
  requestAnimationFrame(frame);
  const t = now * 0.001;

  // drum -> ink blob (or a manual tap queued by the pointer handler)
  if (analyser && !inject) {
    const hit = detectDrums(now);
    if (hit) {
      inject = {
        x: 0.12 + Math.random() * 0.76,
        y: 0.15 + Math.random() * 0.70,
        size: 0.03 + Math.min(0.06, hit.e * 0.25),
        strength: 0.3 + Math.min(0.55, hit.e * 1.6),
        color: INKS[hit.key],
      };
      flashLed(hit.key);
    }
  }

  // sim pass: prev field -> next field
  const u = simMat.uniforms;
  u.uTex.value = rtA.texture;
  u.u_a.value.z = t;
  u.u_a.value.w = PARAMS.dry;
  u.u_b.value.x = PARAMS.advect;
  u.u_b.value.y = PARAMS.diffuse;
  u.u_b.value.z = resetFrames > 0 ? 1 : 0;
  if (resetFrames > 0) resetFrames--;
  if (inject) {
    u.u_c.value.set(inject.x, inject.y, inject.size, inject.strength);
    u.u_d.value.set(inject.color[0], inject.color[1], inject.color[2], 0);
    inject = null;
  } else {
    u.u_c.value.w = 0;
  }
  quad.material = simMat;
  renderer.setRenderTarget(rtB);
  renderer.render(scene, camera);

  // render pass: field -> paper on screen
  renMat.uniforms.uTex.value = rtB.texture;
  quad.material = renMat;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  [rtA, rtB] = [rtB, rtA];
}

// ---- boot --------------------------------------------------------------------
startBtn.addEventListener('click', start);

async function start() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  note.textContent = 'setting up… this may take a moment';
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = audioCtx.createMediaStreamSource(stream);
    inputGain = audioCtx.createGain();
    inputGain.gain.value = PARAMS.input;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;                 // fine bins so the 30-160Hz kick band is real
    analyser.smoothingTimeConstant = 0.5;    // less smoothing = sharper onsets
    analyser.minDecibels = -95;
    analyser.maxDecibels = -20;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    src.connect(inputGain).connect(analyser);   // not connected to destination -> no echo

    setupGL();
    document.body.classList.add('go');
    gate.remove();
    requestAnimationFrame(frame);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'microphone failed: ' + err.message + ' — allow the mic and retry';
  }
}

// tap/click the paper to drop ink by hand (random drum colour)
addEventListener('pointerdown', (e) => {
  if (!renderer || e.target !== renderer.domElement) return;
  const keys = Object.keys(INKS);
  const key = keys[(Math.random() * keys.length) | 0];
  inject = {
    x: e.clientX / innerWidth,
    y: 1 - e.clientY / innerHeight,
    size: 0.04, strength: 0.55,
    color: INKS[key],
  };
  flashLed(key);
});

addEventListener('resize', () => { if (renderer) renderer.setSize(innerWidth, innerHeight); });

// ---- panel ---------------------------------------------------------------------
function wireSlider(id, valId, get, set, fmt = (v) => v) {
  const el = document.getElementById(id), val = document.getElementById(valId);
  el.value = get();
  val.textContent = fmt(get());
  el.addEventListener('input', () => { set(+el.value); val.textContent = fmt(get()); });
}
wireSlider('input', 'v-input', () => PARAMS.input, (v) => {
  PARAMS.input = v;
  if (inputGain) inputGain.gain.value = v;
});
wireSlider('sens', 'v-sens', () => PARAMS.sens, (v) => { PARAMS.sens = v; });
wireSlider('swirl', 'v-swirl', () => PARAMS.advect * 1000, (v) => { PARAMS.advect = v / 1000; },
  (v) => (+v).toFixed(1));
wireSlider('bleed', 'v-bleed', () => PARAMS.diffuse, (v) => { PARAMS.diffuse = v; });
wireSlider('life', 'v-life', () => PARAMS.dry, (v) => { PARAMS.dry = v; }, (v) => (+v).toFixed(4));

document.getElementById('clear').addEventListener('click', () => { resetFrames = 3; });
document.getElementById('save').addEventListener('click', () => {
  if (!renderer) return;
  const a = document.createElement('a');
  a.download = 'water-ink.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});

function flashLed(key) {
  const el = document.getElementById('led-' + key);
  if (!el) return;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 180);
}
