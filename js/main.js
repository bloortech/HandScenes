// HandScenes — hand-tracked video effects in the browser.
// Everything (webcam, MediaPipe hand tracking, three.js rendering) runs
// client-side; nothing is uploaded. Switch scenes with the top buttons or
// keys 1/2/3; press v (or the button) to hide the camera preview.

import * as THREE from 'three';
import { createHands } from './hands.js';
import { CradleScene } from './scenes/cradle.js';
import { GardenScene } from './scenes/garden.js';
import { ShapesScene } from './scenes/shapes.js';

const statusEl = document.getElementById('status');
const loadingEl = document.getElementById('loading');
const video = document.getElementById('cam');
const howtoTitle = document.getElementById('howto-title');
const howtoBody = document.getElementById('howto-body');
const toggleCamBtn = document.getElementById('toggle-cam');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

let hands;
try {
  hands = await createHands(video);
} catch (err) {
  loadingEl.innerHTML =
    `<span class="err">camera / tracker failed to start</span>` +
    `<small>${err.message}. Make sure you allowed camera access and are ` +
    `on https or localhost, then reload.</small>`;
  throw err;
}

// scene metadata: instance, label, and the gesture instructions shown on screen
const SCENES = {
  1: {
    scene: new CradleScene(renderer, video),
    name: "cat's cradle",
    title: "✋ Cat's cradle",
    body: 'Hold up <span class="g">both hands</span> — glowing strings stretch ' +
      'between your fingers. <span class="g">Spread your fingers</span> to weave ' +
      'the web; each finger paints the space behind it with a different filter.',
  },
  2: {
    scene: new GardenScene(renderer, video),
    name: 'garden',
    title: '🌼 Digital garden',
    body: '<span class="g">Open your fist</span> to bloom the big dandelion. ' +
      '<span class="g">Pinch your fingers apart</span> to grow the field of ' +
      'flowers, <span class="g">pinch them together</span> to shrink it back.',
  },
  3: {
    scene: new ShapesScene(renderer, video),
    name: 'ascii terminal',
    title: '⌨️ ASCII terminal',
    body: 'Use <span class="g">both hands</span> to frame a rectangle — ' +
      '<span class="g">index fingers</span> set the top corners, ' +
      '<span class="g">thumbs</span> the bottom. Everything inside turns into ' +
      'live ASCII characters. Move your hands to reshape it.',
  },
};

let active = SCENES[1];
const sceneButtons = [...document.querySelectorAll('.scene-btn')];

function selectScene(key) {
  if (!SCENES[key]) return;
  active = SCENES[key];
  howtoTitle.textContent = active.title;
  howtoBody.innerHTML = active.body;
  for (const btn of sceneButtons) {
    btn.classList.toggle('active', btn.dataset.scene === String(key));
  }
}

for (const btn of sceneButtons) {
  btn.addEventListener('click', () => selectScene(btn.dataset.scene));
}

function setCamHidden(hidden) {
  video.classList.toggle('hidden', hidden);
  toggleCamBtn.textContent = hidden ? 'show camera' : 'hide camera';
}
toggleCamBtn.addEventListener('click', () => setCamHidden(!video.classList.contains('hidden')));

addEventListener('keydown', (e) => {
  if (e.key === '1' || e.key === '2' || e.key === '3') selectScene(e.key);
  if (e.key === 'v') setCamHidden(!video.classList.contains('hidden'));
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  for (const s of Object.values(SCENES)) s.scene.resize(innerWidth, innerHeight);
});

selectScene(1);
loadingEl.remove();

let last = performance.now();
let fpsAccum = 0, fpsFrames = 0, fps = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const tracked = hands.update(now);
  active.scene.update(dt, tracked);
  active.scene.render();

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0; fpsFrames = 0;
    statusEl.textContent =
      `${active.name} · ${tracked.length} hand${tracked.length === 1 ? '' : 's'} · ${fps} fps`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
