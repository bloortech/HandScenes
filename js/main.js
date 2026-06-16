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

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const video = $('cam');
const statusEl = $('status');
const howtoTitle = $('howto-title');
const howtoBody = $('howto-body');
const controlsEl = $('controls');
const gate = $('gate');
const startBtn = $('start');
const gateNote = $('gate-note');
const uiToggle = $('ui-toggle');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
let showTrack = false;
const TRACK_DPR = Math.min(devicePixelRatio || 1, 2);
// MediaPipe hand skeleton edges (21 landmarks)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// Vercel Web Analytics custom events (aggregate, anonymous; no-op if blocked).
const SCENE_NAMES = { 1: 'cradle', 2: 'garden', 3: 'filterbox', 4: 'fractal', 5: 'cosmos' };
function track(name, data) {
  try { if (window.va) window.va('event', { name, data }); } catch (e) { /* ignore */ }
}

const SCENE_META = {
  1: {
    make: (r) => new CradleScene(r, video),
    title: "✋ Cat's cradle",
    body: 'Hold up <span class="g">both hands</span> — glowing strings stretch ' +
      'between your fingers. <span class="g">Spread your fingers</span> to weave ' +
      'the web; each finger fills its panel with a filter you choose in ' +
      '<span class="g">CONTROLS</span>.',
  },
  2: {
    make: (r) => new GardenScene(r, video),
    title: '🌼 Digital garden',
    body: '<span class="g">Open your fist</span> to bloom the big dandelion. ' +
      '<span class="g">Pinch your fingers apart</span> to grow the field, ' +
      '<span class="g">pinch them together</span> to shrink it back.',
  },
  3: {
    make: (r) => new ShapesScene(r, video),
    title: '⌨ Filter box',
    body: 'Use <span class="g">both hands</span> to frame a rectangle — ' +
      '<span class="g">index fingers</span> top, <span class="g">thumbs</span> ' +
      'bottom. Switch <span class="g">MODE</span> to 3D and ' +
      '<span class="g">move your middle fingers</span> to pull it into a box, ' +
      'with a filter on each face.',
  },
  4: {
    make: (r) => new FractalScene(r),
    title: '◈ Mandelbox fractal',
    body: '<span class="g">Open your fist</span> to zoom in, ' +
      '<span class="g">move your hand left/right</span> to orbit, ' +
      '<span class="g">up/down</span> to fold the box, and ' +
      '<span class="g">pinch</span> to morph the shape.',
  },
  5: {
    make: (r) => new CosmosScene(r, video),
    title: '🪐 Cosmos',
    body: '<span class="g">Right hand</span>: open your fist to zoom out, close ' +
      'to zoom in, move left/right to orbit. ' +
      '<span class="g">Left hand</span>: up/down to tilt, left/right to pan.',
  },
};

let renderer, hands, scenes, active;
let aspectMode = 'full';

// ---- stage sizing + UI placement ----------------------------------------
function fitAspect(aw, ah, ratio) {
  let w, h;
  if (aw / ah > ratio) { h = ah; w = h * ratio; } else { w = aw; h = w / ratio; }
  return [Math.round(w), Math.round(h)];
}

function positionUI(mode, sideM, topM) {
  const tb = $('topbar'), pn = $('panel'), ht = $('howto');
  for (const el of [tb, pn, ht]) {
    el.style.left = el.style.right = el.style.top = el.style.bottom = '';
    el.style.width = el.style.transform = el.style.maxHeight = '';
  }
  if (mode === 'sides') {
    const rail = Math.max(150, Math.min(sideM - 16, 260));
    pn.style.left = '8px'; pn.style.top = '70px'; pn.style.width = rail + 'px';
    pn.style.maxHeight = (innerHeight - 90) + 'px';
    tb.style.right = '8px'; tb.style.top = '8px'; tb.style.width = rail + 'px';
    ht.style.right = '8px'; ht.style.bottom = '12px'; ht.style.width = rail + 'px';
  } else if (mode === 'stacked') {
    tb.style.top = '8px'; tb.style.left = '50%'; tb.style.transform = 'translateX(-50%)';
    pn.style.left = '12px'; pn.style.bottom = '10px'; pn.style.width = '224px';
    pn.style.maxHeight = Math.max(140, topM - 16) + 'px';
    ht.style.right = '12px'; ht.style.bottom = '10px'; ht.style.width = 'min(340px, 40vw)';
  } else { // overlay (full screen, or UI hidden)
    tb.style.top = '10px'; tb.style.left = '10px'; tb.style.right = '10px';
    pn.style.left = '12px'; pn.style.bottom = '14px'; pn.style.width = '224px';
    pn.style.maxHeight = '60vh';
    ht.style.left = '50%'; ht.style.bottom = '14px'; ht.style.transform = 'translateX(-50%)';
  }
}

function layout() {
  const vw = innerWidth, vh = innerHeight;
  const uiVisible = !document.body.classList.contains('hideui');
  let w, h, mode = 'overlay';

  if (aspectMode === 'full') {
    w = vw; h = vh;
  } else {
    const ratio = aspectMode === '16:9' ? 16 / 9 : 9 / 16;
    [w, h] = fitAspect(vw, vh, ratio);
    const sideM = (vw - w) / 2, topM = (vh - h) / 2;
    if (!uiVisible) {
      mode = 'overlay';                 // stage at full size; UI hidden anyway
    } else if (sideM >= 200) {
      mode = 'sides';                   // wide letterbox -> rails on the sides
    } else if (topM >= 150) {
      mode = 'stacked';                 // tall letterbox -> bars top/bottom
    } else if (vw >= vh) {
      [w, h] = fitAspect(vw - 2 * 210, vh - 16, ratio); // shrink, make side room
      mode = 'sides';
    } else {
      [w, h] = fitAspect(vw - 12, vh - 96 - 160, ratio); // shrink, make top/bottom room
      mode = 'stacked';
    }
  }

  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  document.body.dataset.ui = mode;
  positionUI(mode, (vw - w) / 2, (vh - h) / 2);

  if (renderer) {
    renderer.setSize(w, h);
    if (scenes) for (const s of Object.values(scenes)) s.resize(w, h);
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
          opts.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          track('control', { name: c.label, value: o.label });
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
        b.classList.toggle('on', on);
        b.textContent = `${c.label}: ${on ? 'ON' : 'OFF'}`;
        track('toggle', { name: c.label, value: on ? 'on' : 'off' });
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
  if (!scenes || !scenes[key]) return;
  active = { scene: scenes[key], ...SCENE_META[key] };
  howtoTitle.textContent = active.title;
  howtoBody.innerHTML = active.body;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.scene === String(key)));
  buildControls();
  track('scene', { scene: SCENE_NAMES[key] || String(key) });
}

// ---- UI wiring -----------------------------------------------------------
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => selectScene(t.dataset.scene)));

document.querySelectorAll('#format button').forEach((b) =>
  b.addEventListener('click', () => {
    aspectMode = b.dataset.fmt;
    document.querySelectorAll('#format button').forEach((x) =>
      x.classList.toggle('active', x === b));
    layout();
  }));

function toggleUI() {
  const hidden = document.body.classList.toggle('hideui');
  uiToggle.textContent = hidden ? 'SHOW UI' : 'HIDE UI';
  layout();
}
uiToggle.addEventListener('click', toggleUI);
$('toggle-cam').addEventListener('click', () => video.classList.toggle('hidden'));
$('panel-min').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

function toggleTrack() {
  showTrack = document.body.classList.toggle('showtrack');
  if (!showTrack) octx.clearRect(0, 0, overlay.width, overlay.height);
}
$('toggle-track').addEventListener('click', toggleTrack);

addEventListener('keydown', (e) => {
  if (['1', '2', '3', '4', '5'].includes(e.key)) selectScene(e.key);
  if (e.key === 'v') video.classList.toggle('hidden');
  if (e.key === 'h') toggleUI();
  if (e.key === 't') toggleTrack();
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
    scenes = {
      1: SCENE_META[1].make(renderer),
      2: SCENE_META[2].make(renderer),
      3: SCENE_META[3].make(renderer),
      4: SCENE_META[4].make(renderer),
      5: SCENE_META[5].make(renderer),
    };
    layout();
    selectScene('1');
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
