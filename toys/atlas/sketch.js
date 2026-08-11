// ============================================================
//  Anatomy Atlas — page glue.
//
//  The atlas itself is anatomy.js, ported verbatim from the
//  prabhat-saharia-site build. This file only wires it to the
//  HandScenes-style page chrome: start gate, toolbar, HUD.
//
//  The 3D atlas uses no camera. Live Motion does, but it is opt-in:
//  motion.js is dynamically imported and getUserMedia is only called
//  when the user presses the button, so a visitor who never touches it
//  never loads the tracking models and is never prompted.
// ============================================================
import { initAtlas } from './anatomy.js';

const $ = (id) => document.getElementById(id);
const gate = $('gate');
const note = $('note');
const stageEl = $('stage');

const chipBones = $('chip-bones');
const chipMuscles = $('chip-muscles');
const btnLabels = $('btn-labels');
const btnReset = $('btn-reset');

let atlas = null;
let labelsOn = true;

async function boot() {
  gate.classList.add('loading');
  note.classList.remove('err');
  note.textContent = 'Building the scene…';

  try {
    atlas = initAtlas({
      canvas: $('anatomy-canvas'),
      stageEl,
      hud: {
        name: $('hud-name'), sub: $('hud-sub'),
        meta: $('hud-meta'), level: $('detail-level'),
      },
    });
  } catch (err) {
    console.warn('atlas unavailable:', err);
    note.classList.add('err');
    note.textContent =
      'This needs WebGL, which is not available in this browser. Try the latest ' +
      'Chrome, Safari, Firefox or Edge on a device with graphics support.';
    gate.classList.remove('loading');
    return;
  }

  // Swap the procedural skeleton for the real anatomical model. If it is
  // missing or fails, anatomy.js keeps the built-in one and we carry on.
  note.textContent = 'Loading the anatomical model (~48 MB)…';
  let loaded = false;
  try {
    loaded = await atlas.loadExternalModel('/models/skeleton.obj');
  } catch (e) {
    console.warn('anatomical model failed; keeping the simplified skeleton.', e);
  }
  if (!loaded) {
    // Fallback skeleton is in: say so rather than passing it off as the real one.
    $('detail-level').textContent = 'Simplified skeleton';
  }

  gate.style.display = 'none';
}

$('start').addEventListener('click', boot, { once: true });

// ---- toolbar ----
for (const chip of [chipBones, chipMuscles]) {
  chip.addEventListener('click', () => {
    if (chip.disabled) return;
    chipBones.classList.toggle('solid', chip === chipBones);
    chipMuscles.classList.toggle('solid', chip === chipMuscles);
    atlas?.setMuscles(chip === chipMuscles);
  });
}

btnLabels.addEventListener('click', () => {
  if (!atlas || btnLabels.disabled) return;
  labelsOn = !labelsOn;
  atlas.toggleLabels(labelsOn);
  btnLabels.textContent = `LABELS: ${labelsOn ? 'ON' : 'OFF'}`;
  btnLabels.classList.toggle('solid', labelsOn);
});
btnLabels.classList.add('solid');

btnReset.addEventListener('click', () => atlas?.resetView());

// ---- zoom ----------------------------------------------------------------
// Buttons as well as the wheel: on a trackpad or touchscreen a scroll gesture
// often never reaches the canvas, which left the detail tiers unreachable.
const ZOOM_STEP = 0.8;                       // <1 moves the camera closer
const zoomIn = () => atlas?.zoomBy(ZOOM_STEP);
const zoomOut = () => atlas?.zoomBy(1 / ZOOM_STEP);
$('btn-zoom-in').addEventListener('click', zoomIn);
$('btn-zoom-out').addEventListener('click', zoomOut);
addEventListener('keydown', (e) => {
  if (motion?.isRunning()) return;
  if (e.key === '+' || e.key === '=') zoomIn();
  if (e.key === '-' || e.key === '_') zoomOut();
});

// ---- Live Motion (opt-in webcam) ----------------------------------------
const btnMotion = $('btn-motion');
const motionEl = $('motion');
let motion = null;

async function getMotion() {
  if (motion) return motion;
  // Dynamic import: a visitor who never presses the button never downloads
  // motion.js, the three tracking models, or the MediaPipe wasm.
  const { createMotion } = await import('./motion.js');
  motion = createMotion({
    video: $('motion-video'),
    canvas: $('motion-canvas'),
    statusEl: $('motion-status'),
  });
  return motion;
}

async function enterMotion() {
  btnMotion.disabled = true;
  btnMotion.textContent = '◉ STARTING…';
  motionEl.hidden = false;
  atlas?.setMotion(true);          // pause orbit/raycast under the overlay
  try {
    const m = await getMotion();
    const ok = await m.start();    // motion.js writes its own failure text
    if (!ok) { exitMotion(); return; }
    btnMotion.textContent = '■ STOP MOTION';
    btnMotion.classList.add('solid');
  } catch (err) {
    console.warn('Live Motion failed to start:', err);
    $('motion-status').textContent = 'Live Motion could not start on this device.';
    setTimeout(exitMotion, 2200);
  } finally {
    btnMotion.disabled = false;
  }
}

function exitMotion() {
  motion?.stop();                  // releases the camera track
  motionEl.hidden = true;
  atlas?.setMotion(false);
  btnMotion.textContent = '◉ LIVE MOTION';
  btnMotion.classList.remove('solid');
  btnMotion.disabled = false;
}

btnMotion.addEventListener('click', () => {
  if (motion?.isRunning()) exitMotion();
  else enterMotion();
});
$('motion-exit').addEventListener('click', exitMotion);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && motion?.isRunning()) exitMotion();
});

// Layer toggles (bones / joints / muscles / face / hands)
for (const chip of document.querySelectorAll('[data-mlayer]')) {
  chip.addEventListener('click', () => {
    const on = !chip.classList.contains('solid');
    chip.classList.toggle('solid', on);
    motion?.setLayer(chip.dataset.mlayer, on);
  });
}

// Never leave the camera open on a backgrounded or closing tab.
addEventListener('pagehide', () => motion?.stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && motion?.isRunning()) exitMotion();
});
