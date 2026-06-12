// HandScenes — hand-tracked video effects in the browser.
// Everything (webcam, MediaPipe tracking, three.js) runs client-side; nothing
// is uploaded. Init is gated behind PRESS START so getUserMedia runs from a
// user gesture — that's what makes the camera come up reliably on first load
// (no more "allow then refresh").

import * as THREE from 'three';
import { createHands } from './hands.js';
import { CradleScene } from './scenes/cradle.js';
import { GardenScene } from './scenes/garden.js';
import { ShapesScene } from './scenes/shapes.js';

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

const SCENE_META = {
  1: {
    make: (r) => new CradleScene(r, video),
    name: "cat's cradle",
    title: "✋ Cat's cradle",
    body: 'Hold up <span class="g">both hands</span> — glowing strings stretch ' +
      'between your fingers. <span class="g">Spread your fingers</span> to weave ' +
      'the web; each finger paints the space behind it with a different filter.',
  },
  2: {
    make: (r) => new GardenScene(r, video),
    name: 'garden',
    title: '🌼 Digital garden',
    body: '<span class="g">Open your fist</span> to bloom the big dandelion. ' +
      '<span class="g">Pinch your fingers apart</span> to grow the field, ' +
      '<span class="g">pinch them together</span> to shrink it back.',
  },
  3: {
    make: (r) => new ShapesScene(r, video),
    name: 'ascii terminal',
    title: '⌨ ASCII terminal',
    body: 'Use <span class="g">both hands</span> to frame a rectangle — ' +
      '<span class="g">index fingers</span> set the top corners, ' +
      '<span class="g">thumbs</span> the bottom. Everything inside becomes ' +
      'live ASCII. Move your hands to reshape it.',
  },
};

let renderer, hands, scenes, active;
let aspectMode = 'full';

// ---- stage / aspect sizing ----------------------------------------------
function layout() {
  const vw = innerWidth, vh = innerHeight;
  let w, h;
  if (aspectMode === 'full') {
    w = vw; h = vh;
  } else {
    const a = aspectMode === '16:9' ? 16 / 9 : 9 / 16;
    if (vw / vh > a) { h = vh; w = h * a; } else { w = vw; h = w / a; }
  }
  w = Math.round(w); h = Math.round(h);
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
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
      wrap.innerHTML =
        `<div class="row"><span>${c.label}</span><span class="val"></span></div>`;
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
      });
      wrap.appendChild(b);
    }
    controlsEl.appendChild(wrap);
  }
}

function selectScene(key) {
  if (!scenes[key]) return;
  active = { scene: scenes[key], ...SCENE_META[key] };
  howtoTitle.textContent = active.title;
  howtoBody.innerHTML = active.body;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.scene === String(key)));
  buildControls();
}

// ---- UI wiring (safe to attach before init) ------------------------------
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => selectScene(t.dataset.scene)));

document.querySelectorAll('#format button').forEach((b) =>
  b.addEventListener('click', () => {
    aspectMode = b.dataset.fmt;
    document.querySelectorAll('#format button').forEach((x) =>
      x.classList.toggle('active', x === b));
    layout();
  }));

$('toggle-cam').addEventListener('click', () => video.classList.toggle('hidden'));
$('toggle-clean').addEventListener('click', () => document.body.classList.toggle('clean'));
$('panel-min').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

addEventListener('keydown', (e) => {
  if (['1', '2', '3'].includes(e.key)) selectScene(e.key);
  if (e.key === 'v') video.classList.toggle('hidden');
  if (e.key === 'h') document.body.classList.toggle('clean');
});

// ---- boot ----------------------------------------------------------------
async function init() {
  startBtn.disabled = true;
  gateNote.textContent = 'starting camera + hand tracker…';
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
    };
    layout();
    selectScene('1');
    gate.remove();
    requestAnimationFrame(loop);
  } catch (err) {
    startBtn.disabled = false;
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

  const tracked = hands.update(now);
  active.scene.update(dt, tracked);
  active.scene.render();

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.5) {
    const fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0; fpsFrames = 0;
    statusEl.textContent =
      `${tracked.length} hand${tracked.length === 1 ? '' : 's'} · ${fps} fps`;
  }
  requestAnimationFrame(loop);
}
