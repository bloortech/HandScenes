// ============================================================
//  Anatomy Atlas — page glue.
//
//  The atlas itself is anatomy.js, ported verbatim from the
//  prabhat-saharia-site build. This file only wires it to the
//  HandScenes-style page chrome: start gate, toolbar, HUD.
//
//  No camera, no microphone. Mouse/touch only.
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

// The real anatomical model replaces the procedural skeleton, and with it the
// procedural muscle layer and the tiered labels (anatomy.js disables both once
// an external model is in). Reflect that in the toolbar rather than leaving
// dead buttons the user can click for no effect.
function lockProceduralControls() {
  for (const el of [chipBones, chipMuscles, btnLabels]) el.disabled = true;
  chipMuscles.classList.remove('solid');
  chipBones.classList.add('solid');
  btnLabels.textContent = 'LABELS: —';
  btnLabels.title = 'The anatomical model names bones on click instead of floating labels';
  chipMuscles.title = 'The muscle layer belongs to the simplified fallback skeleton';
}

async function boot() {
  gate.classList.add('loading');
  note.classList.remove('err');
  note.textContent = 'Building the scene…';

  try {
    atlas = initAtlas({
      canvas: $('anatomy-canvas'),
      stageEl,
      hud: { name: $('hud-name'), sub: $('hud-sub'), level: $('detail-level') },
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
  if (loaded) lockProceduralControls();

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
