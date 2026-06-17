// HandScenes — hand-tracked video effects in the browser.
// Everything (webcam, MediaPipe tracking, three.js) runs client-side; nothing
// is uploaded. Init is gated behind PRESS START so getUserMedia runs from a
// user gesture — that's what makes the camera come up reliably on first load.
// The UI lives OUTSIDE the recording stage (in the letterbox margins) so a
// screen-recording of the stage is clean; HIDE UI removes it entirely.

import * as THREE from 'three';
import { createHands } from './hands.js';
import { CradleScene } from './scenes/cradle.js';
import { GardenScene } from './scenes/garden.js';
import { ShapesScene } from './scenes/shapes.js';
import { FractalScene } from './scenes/fractal.js';
import { CosmosScene } from './scenes/cosmos.js';
import { CanariesScene } from './scenes/canaries.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const video = $('cam');
const statusEl = $('status');
const sceneName = $('scene-name');
const howtoBody = $('howto-body');
const howto = $('howto');
const controlsEl = $('controls');
const gate = $('gate');
const startBtn = $('start');
const gateNote = $('gate-note');
const uiToggle = $('ui-toggle');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const home = $('home');
const homeCats = $('home-cats');
const sheet = $('sheet');
let showTrack = false;
const TRACK_DPR = Math.min(devicePixelRatio || 1, 2);
// MediaPipe hand skeleton edges (21 landmarks)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// Vercel Web Analytics custom events (aggregate, anonymous; no-op if blocked).
const SCENE_NAMES = { 1: 'cradle', 2: 'garden', 3: 'filterbox', 4: 'fractal', 5: 'cosmos', 6: 'canaries' };
function track(name, data) {
  try { if (window.va) window.va('event', { name, data }); } catch (e) { /* ignore */ }
}

const SCENE_META = {
  1: {
    make: (r) => new CradleScene(r, video),
    title: "✋ Cat's cradle",
    tag: 'Glowing elastic strings stretch between your fingertips — spread your hands to weave a web of light.',
    body: 'Hold up <span class="g">both hands</span> — glowing strings stretch ' +
      'between your fingers. <span class="g">Spread your fingers</span> to weave ' +
      'the web; each finger fills its panel with a filter you choose in ' +
      '<span class="g">CONTROLS</span>.',
  },
  2: {
    make: (r) => new GardenScene(r, video),
    title: '🌼 Digital garden',
    tag: 'Open your fist and a wireframe dandelion blooms over your feed; pinch to grow a whole field.',
    body: '<span class="g">Open your fist</span> to bloom the big dandelion. ' +
      '<span class="g">Pinch your fingers apart</span> to grow the field, ' +
      '<span class="g">pinch them together</span> to shrink it back.',
  },
  3: {
    make: (r) => new ShapesScene(r, video),
    title: '⌨ Filter box',
    tag: 'Frame a rectangle with both hands; everything inside turns to ASCII, halftone, riso… In 3D mode, pull it into a cube with a filter per face.',
    body: 'Use <span class="g">both hands</span> to frame a rectangle — ' +
      '<span class="g">index fingers</span> top, <span class="g">thumbs</span> ' +
      'bottom. Switch <span class="g">MODE</span> to 3D and ' +
      '<span class="g">move your middle fingers</span> to pull it into a box, ' +
      'with a filter on each face.',
  },
  4: {
    make: (r) => new FractalScene(r),
    title: '◈ Mandelbox fractal',
    tag: 'Sculpt an endless 3D fractal in real time — open your hand to dive in, pinch to morph the shape.',
    body: '<span class="g">Open your fist</span> to zoom in, ' +
      '<span class="g">move your hand left/right</span> to orbit, ' +
      '<span class="g">up/down</span> to fold the box, and ' +
      '<span class="g">pinch</span> to morph the shape.',
  },
  5: {
    make: (r) => new CosmosScene(r, video),
    title: '🪐 Cosmos',
    tag: 'Fly from a single planet out to a whole galaxy with one hand; tilt and pan the view with the other.',
    body: '<span class="g">Right hand</span>: open your fist to zoom out, close ' +
      'to zoom in, move left/right to orbit. ' +
      '<span class="g">Left hand</span>: up/down to tilt, left/right to pan.',
  },
  6: {
    make: (r) => new CanariesScene(r, video),
    title: '🐦 Canary flock',
    tag: 'Stand against a synthetic sky, then snap your fingers to dissolve into a flock of canaries — snap again to reform.',
    body: 'You appear cut out against a sky. <span class="g">Snap your fingers</span> ' +
      '(thumb to middle finger) to scatter into a flock of birds; ' +
      '<span class="g">snap again</span> to fly back together. Give the cutout a ' +
      'second to load.',
  },
};

// Home gallery grouping. Visual scenes reference SCENE_META by key; flows not
// built yet show as dimmed "soon" cards so the categories read as a roadmap.
const CATEGORIES = [
  { name: 'Visuals', items: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }, { key: '5' }, { key: '6' }] },
  { name: 'Music', items: [
    { href: '/toys/beats/', title: '🥁 Hand Beats', tag: 'Tap out a beat in the air — a hand-tracked step sequencer with 808 / 909 / acoustic kits.' },
  ] },
  { name: 'Paint', items: [
    { href: '/toys/ink/', title: '🎨 Watercolour', tag: 'Sing or play and watch audio-reactive watercolour blooms spread across the canvas.' },
    { href: '/toys/bubbles/', title: '🫧 Bubble Machine', tag: 'Poke floating bubbles with your fingertip and pop them.' },
  ] },
];

let renderer, hands, active;
let aspectMode = 'full';

// Scenes are built lazily on first selection — compiling 4 unused scenes'
// shaders at PRESS START was pure load-time waste. A small LRU keeps the most
// recent few warm so switching back is instant; older ones are disposed to cap
// GPU memory (KEEP_WARM=3 is still less than the old "all 5 alive at once").
const KEEP_WARM = 3;
const sceneCache = new Map();   // key -> scene; Map insertion order = recency

function getScene(key) {
  let scene = sceneCache.get(key);
  if (scene) {                  // already warm: bump to most-recent and reuse
    sceneCache.delete(key);
    sceneCache.set(key, scene);
    return scene;
  }
  scene = SCENE_META[key].make(renderer);
  const sz = renderer.getSize(new THREE.Vector2());
  scene.resize(sz.x || innerWidth, sz.y || innerHeight);
  sceneCache.set(key, scene);
  // evict least-recently-used past the warm window. Never the active one: it
  // was just inserted/bumped, so it's the newest entry, not the oldest.
  while (sceneCache.size > KEEP_WARM) {
    const oldestKey = sceneCache.keys().next().value;
    const old = sceneCache.get(oldestKey);
    sceneCache.delete(oldestKey);
    try { old.dispose?.(); } catch (e) { console.warn('scene dispose failed', e); }
  }
  return scene;
}

// ---- stage sizing --------------------------------------------------------
function fitAspect(aw, ah, ratio) {
  let w, h;
  if (aw / ah > ratio) { h = ah; w = h * ratio; } else { w = aw; h = w / ratio; }
  return [Math.round(w), Math.round(h)];
}

// Chrome is fixed-overlay now (top bar, FAB, bottom sheet, home gallery), so
// layout only sizes the recording stage. FULL fills the viewport; 16:9 / 9:16
// letterbox-fit inside it.
function layout() {
  const vw = innerWidth, vh = innerHeight;
  let w, h;
  if (aspectMode === 'full') { w = vw; h = vh; }
  else { [w, h] = fitAspect(vw, vh, aspectMode === '16:9' ? 16 / 9 : 9 / 16); }
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  if (renderer) {
    renderer.setSize(w, h);
    for (const s of sceneCache.values()) s.resize(w, h);
  }
}
addEventListener('resize', layout);
layout();

// ---- control panel (built from the active scene's getControls()) ---------
function buildControls() {
  controlsEl.innerHTML = '';
  const list = active.scene.getControls ? active.scene.getControls() : [];
  for (const c of list) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    if (c.type === 'slider') {
      const round = c.step < 1 ? (c.step < 0.1 ? 2 : 1) : 0;
      wrap.innerHTML = `<div class="row"><span>${c.label}</span><span class="val"></span></div>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = c.min; input.max = c.max; input.step = c.step; input.value = c.value;
      const val = wrap.querySelector('.val');
      val.textContent = Number(c.value).toFixed(round);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        c.set(v); val.textContent = v.toFixed(round);
      });
      wrap.appendChild(input);
    } else if (c.type === 'select') {
      wrap.innerHTML = `<div class="row"><span>${c.label}</span></div>`;
      const opts = document.createElement('div');
      opts.className = 'opts';
      for (const o of c.options) {
        const b = document.createElement('button');
        b.textContent = o.label;
        if (o.value === c.value) b.classList.add('active');
        b.addEventListener('click', () => {
          c.set(o.value);
          track('control', { name: c.label, value: o.label });
          // some selects (MODE, per-face filter) change which other controls
          // are even relevant — rebuild so stale knobs don't crowd the panel
          if (c.rebuild) { buildControls(); return; }
          opts.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
        });
        opts.appendChild(b);
      }
      wrap.appendChild(opts);
    } else if (c.type === 'toggle') {
      const b = document.createElement('button');
      b.className = 'toggle' + (c.value ? ' on' : '');
      b.textContent = `${c.label}: ${c.value ? 'ON' : 'OFF'}`;
      b.addEventListener('click', () => {
        const on = !b.classList.contains('on');
        c.set(on);
        track('toggle', { name: c.label, value: on ? 'on' : 'off' });
        if (c.rebuild) { buildControls(); return; }
        b.classList.toggle('on', on);
        b.textContent = `${c.label}: ${on ? 'ON' : 'OFF'}`;
      });
      wrap.appendChild(b);
    }
    controlsEl.appendChild(wrap);
  }
}

// MediaPipe overlay — the green skeleton + gesture readout, drawn ON the small
// camera preview box (not the recorded output). The preview shows the whole
// frame and is CSS-mirrored; landmarks are already mirrored, so they map 1:1.
function drawTrack(tracked) {
  const cw = video.clientWidth, ch = video.clientHeight;
  if (!cw || !ch) { octx.clearRect(0, 0, overlay.width, overlay.height); return; }
  // pin the overlay canvas exactly over the camera preview
  overlay.style.left = video.offsetLeft + 'px';
  overlay.style.top = video.offsetTop + 'px';
  overlay.style.width = cw + 'px';
  overlay.style.height = ch + 'px';
  const w = Math.round(cw * TRACK_DPR), h = Math.round(ch * TRACK_DPR);
  if (overlay.width !== w) overlay.width = w;
  if (overlay.height !== h) overlay.height = h;
  octx.clearRect(0, 0, w, h);
  if (!tracked || !tracked.length) return;

  const X = (p) => p.x * w, Y = (p) => p.y * h;
  const u = Math.max(1, h * 0.012);              // line/dot scale relative to box
  octx.lineWidth = u * 1.6;
  octx.font = `${Math.max(9, h * 0.07)}px VT323, monospace`;
  octx.textBaseline = 'bottom';
  for (const hand of tracked) {
    const lm = hand.landmarks;
    octx.strokeStyle = 'rgba(57,255,20,0.9)';   // mediapipe green
    octx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      octx.moveTo(X(lm[a]), Y(lm[a]));
      octx.lineTo(X(lm[b]), Y(lm[b]));
    }
    octx.stroke();
    octx.fillStyle = '#ff4bd8';                  // landmark dots
    for (const p of lm) { octx.beginPath(); octx.arc(X(p), Y(p), u, 0, Math.PI * 2); octx.fill(); }
    const txt = `${hand.label[0]} fist${Math.round(hand.openness * 100)} pinch${Math.round(hand.pinch * 100)}`;
    octx.fillStyle = 'rgba(0,0,0,0.5)';
    octx.fillRect(2, 2 + (hand.label === 'Right' ? h * 0.085 : 0), octx.measureText(txt).width + 6, h * 0.085);
    octx.fillStyle = '#38f9d7';
    octx.fillText(txt, 4, (hand.label === 'Right' ? h * 0.17 : h * 0.085));
  }
}

function selectScene(key) {
  if (!renderer || !SCENE_META[key]) return;
  active = { scene: getScene(key), ...SCENE_META[key] };
  sceneName.textContent = active.title;
  currentInstructions = active.body;
  showInstructions();
  document.querySelectorAll('.card').forEach((c) =>
    c.classList.toggle('active', c.dataset.scene === String(key)));
  buildControls();
  closeHome();
  track('scene', { scene: SCENE_NAMES[key] || String(key) });
}

// ---- home gallery + sheet helpers ----------------------------------------
function openSheet() { document.body.classList.add('sheet-open'); }
function closeSheet() { document.body.classList.remove('sheet-open'); }
function openHome() { home.classList.remove('hidden'); closeSheet(); }
function closeHome() { home.classList.add('hidden'); }

let hintTimer = 0;
let currentInstructions = '';
// the per-scene "what to do" — persistent (top-center), hides with HIDE UI
function showInstructions() {
  howtoBody.innerHTML = currentInstructions;
  howto.classList.add('show');
  clearTimeout(hintTimer);
}
// scenes can flash a short toast (e.g. filter name on a gesture); after it
// fades we restore the standing instructions rather than leaving it blank
addEventListener('hs-toast', (e) => {
  howtoBody.innerHTML = e.detail;
  howto.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(showInstructions, 1600);
});

// Build the scene gallery grouped by category. Visual scenes pull title/tag
// from SCENE_META; not-yet-built flows render as dimmed "soon" cards.
function buildHome() {
  homeCats.innerHTML = '';
  for (const cat of CATEGORIES) {
    const h = document.createElement('div');
    h.className = 'cat-h';
    h.textContent = cat.name;
    homeCats.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'cat-grid';
    for (const item of cat.items) {
      const card = document.createElement('button');
      if (item.href) {                       // a separate flow (p5 / Tone toy)
        card.className = 'card';
        card.innerHTML = `<div class="t">${item.title}</div><div class="d">${item.tag}</div><div class="badge">open ↗</div>`;
        card.addEventListener('click', () => { window.location.href = item.href; });
      } else if (item.soon) {
        card.className = 'card soon';
        card.innerHTML = `<div class="t">${item.title}</div><div class="d">${item.tag}</div><div class="badge">soon</div>`;
      } else {
        const m = SCENE_META[item.key];
        card.className = 'card';
        card.dataset.scene = item.key;
        card.innerHTML = `<div class="t">${m.title}</div><div class="d">${m.tag}</div>`;
        card.addEventListener('click', () => selectScene(item.key));
      }
      grid.appendChild(card);
    }
    homeCats.appendChild(grid);
  }
}

// ---- UI wiring -----------------------------------------------------------
$('home-btn').addEventListener('click', openHome);
$('fab').addEventListener('click', openSheet);
$('sheet-head').addEventListener('click', closeSheet);

// collapsible groups inside the sheet (click a group header to fold it)
sheet.addEventListener('click', (e) => {
  const head = e.target.closest('.grp-h');
  if (head) head.parentElement.classList.toggle('collapsed');
});

document.querySelectorAll('#format button').forEach((b) =>
  b.addEventListener('click', () => {
    aspectMode = b.dataset.fmt;
    document.querySelectorAll('#format button').forEach((x) =>
      x.classList.toggle('active', x === b));
    layout();
  }));

function toggleUI() {
  const hidden = document.body.classList.toggle('hideui');
  uiToggle.textContent = hidden ? 'SHOW' : 'HIDE';
  layout();
}
uiToggle.addEventListener('click', toggleUI);

const camBtn = $('toggle-cam');
function toggleCam() {
  const hidden = video.classList.toggle('hidden');
  camBtn.classList.toggle('on', !hidden);
  camBtn.textContent = `CAMERA PREVIEW: ${hidden ? 'OFF' : 'ON'}`;
}
camBtn.addEventListener('click', toggleCam);
camBtn.classList.add('on');   // preview is on by default

const trackBtn = $('toggle-track');
function toggleTrack() {
  showTrack = document.body.classList.toggle('showtrack');
  trackBtn.classList.toggle('on', showTrack);
  trackBtn.textContent = `TRACKING OVERLAY: ${showTrack ? 'ON' : 'OFF'}`;
  if (!showTrack) octx.clearRect(0, 0, overlay.width, overlay.height);
}
trackBtn.addEventListener('click', toggleTrack);

addEventListener('keydown', (e) => {
  if (['1', '2', '3', '4', '5', '6'].includes(e.key)) selectScene(e.key);
  if (e.key === 'v') toggleCam();
  if (e.key === 'h') toggleUI();
  if (e.key === 't') toggleTrack();
  if (e.key === 'c') openSheet();
  if (e.key === 'Escape') {
    if (document.body.classList.contains('sheet-open')) closeSheet();
    else openHome();
  }
});

// ---- boot ----------------------------------------------------------------
async function init() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  gateNote.textContent = 'Setting up… this may take a few seconds.';
  track('start');                 // pressed START — funnel: did they try at all?
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      stage.insertBefore(renderer.domElement, stage.firstChild);
    }
    hands = await createHands(video);
    layout();
    buildHome();
    selectScene('1');   // builds scene 1 lazily so the stage renders behind home
    openHome();         // ...then let the user pick a scene/category first
    gate.remove();
    track('ready');               // camera granted + app running (got past the gate)
    requestAnimationFrame(loop);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    track('camera_error', { reason: err && err.name ? err.name : 'unknown' });
    gateNote.innerHTML =
      `<span class="err">camera failed: ${err.message}</span><br>` +
      `check the camera permission (address-bar icon) and press start again.`;
  }
}
startBtn.addEventListener('click', init);

let last = performance.now();
let fpsAccum = 0, fpsFrames = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  // never let one bad frame stop the loop (lost GL context, camera unplugged…)
  try {
    const tracked = hands.update(now);
    active.scene.update(dt, tracked);
    active.scene.render();
    if (showTrack) drawTrack(tracked);

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 0.5) {
      const fps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0; fpsFrames = 0;
      statusEl.textContent =
        `${tracked.length} hand${tracked.length === 1 ? '' : 's'} · ${fps} fps`;
    }
  } catch (err) {
    console.error('frame error (continuing):', err);
  }
  requestAnimationFrame(loop);
}
