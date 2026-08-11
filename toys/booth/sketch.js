// DJ Booth — a four-deck booth you play with your hands.
//   ┌ DRUMS  · 8-step sequencer ┬ CHORDS · latching pads + bass ┐
//   ├ VOICE  · mic autotune     ┼ DJ     · XY filter, crossfade ┤
// Your index fingertip is the cursor (one per hand, two hands = two decks at
// once). Controls arm on DWELL, and only while the fingertip is moving slowly —
// that's what stops you toggling half the grid on the way to the DJ pad.
// Grew out of toys/beats (same dwell-to-toggle grid, same synthesised kits).
// Fully client-side: MediaPipe + the model are vendored, audio never leaves the
// page, and the mic stays closed until you switch it on.

import { FilesetResolver, HandLandmarker } from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/hand_landmarker.task';
const WASM = '/vendor/mediapipe/wasm';

const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');
const video = document.getElementById('cam');
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const toastEl = document.getElementById('toast');

// ---- palette -------------------------------------------------------------
const COL = {
  drums: [255, 95, 162],
  synth: [56, 249, 215],
  voice: [255, 196, 92],
  dj: [167, 139, 250],
  ink: [232, 236, 244],
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---- music ---------------------------------------------------------------
const STEPS = 8;                 // eighth notes — one bar
const ROWS = 4;
const ROW_META = [
  { name: 'kick', key: 0 },
  { name: 'snare', key: 1 },
  { name: 'hat', key: 2 },
  { name: 'clap', key: 3 },
];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const WAVES = [
  { label: 'SAW', set: { type: 'fatsawtooth', count: 3, spread: 22 } },
  { label: 'SQR', set: { type: 'fatsquare', count: 3, spread: 18 } },
  { label: 'SOFT', set: { type: 'triangle' } },
];
// starter grooves, one string per row (kick / snare / hat / clap)
const PRESETS = [
  { name: 'TECHNO', rows: ['10101010', '00000000', '01010101', '00100010'] },
  { name: 'HOUSE', rows: ['10101010', '00100010', '01010101', '00000000'] },
  { name: 'BREAK', rows: ['10000010', '00100010', '11111111', '00000000'] },
  { name: 'TRAP', rows: ['10010010', '00100010', '11111111', '00000000'] },
  { name: 'EMPTY', rows: ['00000000', '00000000', '00000000', '00000000'] },
];

const pattern = Array.from({ length: ROWS }, () => Array(STEPS).fill(false));
let presetIdx = 0, kitIdx = 0, waveIdx = 0;
const KIT_NAMES = ['808', '909', 'ACOUSTIC'];

let rootPc = 9, mode = 'minor';   // A minor
let heldChord = -1, arpOn = false, bassOn = true, arpIdx = 0;

// ---- transport state -----------------------------------------------------
let tick = 0, step = 0, playStep = 0;
let stutter = false, stutSteps = null, stutIdx = 0;
let dropLeft = 0, dropFlash = 0;
const rowFlash = [0, 0, 0, 0];

// ---- dj state ------------------------------------------------------------
let filtX = 0.5, fxY = 0.2, xfade = 0.5;

// ---- audio ---------------------------------------------------------------
const A = {};                     // the shared graph
const V = { on: false };          // the vocal chain (built on first MIC press)
let kit = null;

function buildKit(s) {
  const nodes = [], reg = (n) => { nodes.push(n); return n; };
  const kick = reg(new Tone.MembraneSynth(s.kick)).connect(A.drums); kick.volume.value = s.kickVol;
  const snare = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.snareDecay, sustain: 0 } })).connect(A.drums); snare.volume.value = s.snareVol;
  const hp = reg(new Tone.Filter(s.hatFreq, 'highpass')).connect(A.drums);
  const hat = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.hatDecay, sustain: 0 } })).connect(hp); hat.volume.value = s.hatVol;
  const bp = reg(new Tone.Filter(s.clapFreq, 'bandpass')); bp.Q.value = 1.2; bp.connect(A.drums);
  const clap = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.clapDecay, sustain: 0 } })).connect(bp); clap.volume.value = s.clapVol;
  return {
    trigger(r, t) {
      if (r === 0) kick.triggerAttackRelease(s.kickNote, s.kickDur, t);
      else if (r === 1) snare.triggerAttackRelease(s.snareDur, t);
      else if (r === 2) hat.triggerAttackRelease('32n', t);
      else clap.triggerAttackRelease('16n', t);
    },
    dispose() { nodes.forEach((n) => { try { n.dispose(); } catch (e) { /* noop */ } }); },
  };
}
const KITS = {
  '808': () => buildKit({
    kick: { pitchDecay: 0.05, octaves: 8, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.6, sustain: 0.01, release: 1.2 } },
    kickNote: 'C1', kickDur: '2n', kickVol: 4,
    snareDecay: 0.2, snareDur: '8n', snareVol: -10,
    hatFreq: 8000, hatDecay: 0.04, hatVol: -16,
    clapFreq: 1200, clapDecay: 0.13, clapVol: -8,
  }),
  '909': () => buildKit({
    kick: { pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 } },
    kickNote: 'C1', kickDur: '4n', kickVol: 3,
    snareDecay: 0.18, snareDur: '8n', snareVol: -8,
    hatFreq: 9000, hatDecay: 0.05, hatVol: -14,
    clapFreq: 1500, clapDecay: 0.12, clapVol: -7,
  }),
  'ACOUSTIC': () => buildKit({
    kick: { pitchDecay: 0.02, octaves: 4, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 } },
    kickNote: 'C1', kickDur: '8n', kickVol: 2,
    snareDecay: 0.15, snareDur: '16n', snareVol: -7,
    hatFreq: 7000, hatDecay: 0.03, hatVol: -13,
    clapFreq: 1800, clapDecay: 0.1, clapVol: -9,
  }),
};
function loadKit(name) { if (kit && kit.dispose) kit.dispose(); kit = KITS[name](); }

// The whole booth funnels through one filter + FX bus so the DJ deck can grab
// everything at once:  drums ─┐          ┌ dry ┐
//                             ├ xfade ─ pre ─ delay ├ mix ─ HP ─ LP ─ limiter
//                     chords ─┘   +vocal  └ verb ┘
async function buildAudio() {
  A.limiter = new Tone.Limiter(-1.5).toDestination();
  A.lp = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -24, Q: 1 }).connect(A.limiter);
  A.hp = new Tone.Filter({ type: 'highpass', frequency: 20, rolloff: -24, Q: 1 }).connect(A.lp);
  A.mix = new Tone.Gain(1).connect(A.hp);

  A.reverb = new Tone.Reverb({ decay: 3.4, wet: 1 }).connect(A.mix);
  A.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.42, wet: 1 }).connect(A.mix);
  A.revSend = new Tone.Gain(0).connect(A.reverb);
  A.dlySend = new Tone.Gain(0).connect(A.delay);
  A.dry = new Tone.Gain(1).connect(A.mix);

  A.pre = new Tone.Gain(1);
  A.pre.connect(A.dry); A.pre.connect(A.revSend); A.pre.connect(A.dlySend);

  A.xfade = new Tone.CrossFade(0.5).connect(A.pre);
  A.drums = new Tone.Gain(1).connect(A.xfade.a);
  A.synthBus = new Tone.Gain(1).connect(A.xfade.b);
  A.voice = new Tone.Gain(1).connect(A.pre);        // vocals sit outside the crossfade

  A.synthFilt = new Tone.Filter(2800, 'lowpass').connect(A.synthBus);
  A.synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: WAVES[0].set,
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.55, release: 1.4 },
  }).connect(A.synthFilt);
  A.synth.volume.value = -15;

  A.bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.012, decay: 0.2, sustain: 0.9, release: 0.35 },
    filterEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.45, release: 0.4, baseFrequency: 110, octaves: 2.4 },
  }).connect(A.synthBus);
  A.bass.volume.value = -12;

  loadKit(KIT_NAMES[kitIdx]);
  try { await A.reverb.generate(); } catch (e) { /* the IR renders lazily anyway */ }
}

// ---- chords --------------------------------------------------------------
const midiName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// degree 0..7 (7 = the root an octave up) -> { notes:[midi], label, name }
function chordAt(deg) {
  const sc = SCALES[mode];
  const base = 48 + rootPc;                       // C3 + key
  const at = (i) => base + sc[i % 7] + 12 * Math.floor(i / 7);
  if (deg === 7) {
    const r = at(0) + 12;
    return { notes: [r, at(2) + 12, at(4) + 12], label: (mode === 'minor' ? 'i' : 'I') + '⁸', name: NOTE_NAMES[((r % 12) + 12) % 12] + (mode === 'minor' ? 'm' : '') };
  }
  const notes = [at(deg), at(deg + 2), at(deg + 4)];
  const i3 = notes[1] - notes[0], i5 = notes[2] - notes[0];
  const minor = i3 === 3 && i5 === 7, dim = i3 === 3 && i5 === 6;
  const rn = minor || dim ? ROMAN[deg].toLowerCase() : ROMAN[deg];
  const pc = ((notes[0] % 12) + 12) % 12;
  return {
    notes,
    label: rn + (dim ? '°' : ''),
    name: NOTE_NAMES[pc] + (dim ? 'dim' : minor ? 'm' : ''),
  };
}

function releaseChord() {
  try { A.synth.releaseAll(); } catch (e) { /* noop */ }
  try { A.bass.triggerRelease(); } catch (e) { /* noop */ }
}
function attackHeld() {
  if (heldChord < 0) return;
  const ch = chordAt(heldChord);
  if (!arpOn) A.synth.triggerAttack(ch.notes.map(midiHz));   // arp retriggers per step instead
  if (bassOn) A.bass.triggerAttack(midiHz(ch.notes[0] - 24));
}
function selectChord(i) {
  releaseChord();
  if (heldChord === i) { heldChord = -1; return; }            // tapping a lit pad turns it off
  heldChord = i; arpIdx = 0;
  attackHeld();
}

// ---- sequencer -----------------------------------------------------------
function barEvents(time) {
  // recording is bar-locked: press REC -> one bar of count-in -> two bars captured
  if (V.recPhase === 'armed') { V.recPhase = 'countin'; }
  else if (V.recPhase === 'countin') { beginCapture(time); }
  else if (V.recPhase === 'rec') {
    V.recBars++;
    if (V.recBars >= LOOP_BARS) V.finish = true;   // backstop if the tap never fills up
  }
  if (V.loopPending && V.player) {
    V.loopPending = false;
    try { V.player.stop(); V.player.start(time); } catch (e) { /* noop */ }
  }
}

function startTransport() {
  Tone.Transport.scheduleRepeat((time) => {
    const isOffTick = tick % 2 === 1;
    tick++;
    if (!stutter && isOffTick) return;              // normally we run on eighths

    let s;
    if (stutter) { s = stutSteps[stutIdx % stutSteps.length]; stutIdx++; }
    else { s = step; }

    if (!stutter && s === 0) barEvents(time);

    if (dropLeft > 0) {
      dropLeft--;
      if (dropLeft === 0) Tone.Draw.schedule(() => { filtX = 0.5; applyFilter(); }, time);
    } else {
      for (let r = 0; r < ROWS; r++) {
        if (pattern[r][s]) {
          kit.trigger(r, time);
          Tone.Draw.schedule(() => { rowFlash[r] = 1; }, time);
        }
      }
      if (arpOn && heldChord >= 0) {
        const n = chordAt(heldChord).notes;
        const seq = [n[0], n[1], n[2], n[0] + 12];
        A.synth.triggerAttackRelease(midiHz(seq[arpIdx % seq.length]), '16n', time);
        arpIdx++;
      }
    }

    Tone.Draw.schedule(() => { playStep = s; }, time);
    if (!stutter) step = (step + 1) % STEPS;
  }, '16n');
  Tone.Transport.start();
}

function setStutter(on) {
  stutter = on;
  if (on) {
    stutSteps = [(step + STEPS - 2) % STEPS, (step + STEPS - 1) % STEPS];
    stutIdx = 0;
  }
}
function fireDrop() { dropLeft = 4; dropFlash = 1; }   // half a bar of silence, then reset

// ---- dj deck -------------------------------------------------------------
const expMap = (t, lo, hi) => lo * Math.pow(hi / lo, t);
function applyFilter() {
  // one bipolar knob: middle = open, left sweeps a lowpass down, right a highpass up
  const lpF = filtX < 0.46 ? expMap(filtX / 0.46, 160, 20000) : 20000;
  const hpF = filtX > 0.54 ? expMap((filtX - 0.54) / 0.46, 20, 3800) : 20;
  const res = Math.min(1, Math.abs(filtX - 0.5) * 2.4);
  A.lp.frequency.rampTo(lpF, 0.06);
  A.hp.frequency.rampTo(hpF, 0.06);
  A.lp.Q.rampTo(0.7 + res * 3, 0.08);       // -24dB rolloff stacks biquads, so keep Q modest
  A.hp.Q.rampTo(0.7 + res * 2, 0.08);
}
function applyFx() {
  A.dlySend.gain.rampTo(fxY * 0.55, 0.08);
  A.revSend.gain.rampTo(fxY * 0.5, 0.08);
  A.dry.gain.rampTo(1 - fxY * 0.3, 0.08);
}
function applyXfade() { A.xfade.fade.rampTo(xfade, 0.06); }

// ---- vocal booth ---------------------------------------------------------
const LOOP_BARS = 2;
V.tune = 0.85; V.recPhase = 'idle'; V.recBars = 0; V.level = 0; V.f0 = -1; V.snapped = null;
V.blocks = []; V.startFrame = 0; V.fromFrame = 0; V.needSamples = 0;
V.player = null; V.loopOn = false; V.loopPending = false; V.finish = false; V.collect = false;
V.gainAmt = 6;      // mic preamp; laptop mics need a lot of it
V.ready = false;    // the chain exists (permission was granted at the gate)
V.canRec = false;   // the recorder worklet loaded
V.denied = false;   // permission was refused, so there is nothing to switch on
let curShift = 0;

function snapMidi(m) {
  const pcs = SCALES[mode].map((x) => (x + rootPc) % 12);
  let best = null, bd = 99;
  const c0 = Math.round(m);
  for (let d = -6; d <= 6; d++) {
    const cand = c0 + d;
    if (pcs.includes(((cand % 12) + 12) % 12)) {
      const dd = Math.abs(cand - m);
      if (dd < bd) { bd = dd; best = cand; }
    }
  }
  return best;
}

// bounded normalised autocorrelation — only the lags we care about (70–900 Hz),
// so it costs ~1M ops instead of the 4M a full O(n²) pass would.
function detectPitch(buf, sr) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return { f: -1, rms };
  const minLag = Math.max(2, Math.floor(sr / 900));
  const maxLag = Math.min(n - 2, Math.floor(sr / 80));
  // every other sample is plenty for finding a period, and it halves the cost
  const win = Math.min(1100, n - maxLag);
  let bestNc = 0, bestLag = -1;
  const nc = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < win; i += 2) {
      const a = buf[i], b = buf[i + lag];
      c += a * b; e1 += a * a; e2 += b * b;
    }
    const v = c / (Math.sqrt(e1 * e2) + 1e-9);
    nc[lag] = v;
    if (v > bestNc) { bestNc = v; bestLag = lag; }
  }
  if (bestNc < 0.55 || bestLag < 0) return { f: -1, rms };
  // prefer the earliest lag that is nearly as good — kills octave-down errors
  for (let lag = minLag; lag < bestLag; lag++) {
    if (nc[lag] > bestNc * 0.9 && nc[lag] > nc[lag - 1] && nc[lag] > nc[lag + 1]) { bestLag = lag; break; }
  }
  const x1 = nc[bestLag - 1] || 0, x2 = nc[bestLag], x3 = nc[bestLag + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
  const lag = a ? bestLag - b / (2 * a) : bestLag;
  return { f: sr / lag, rms };
}

// Built once at boot from the stream the START click already got permission
// for. Asking for the mic later — when a hand dwells on the MIC tile — has no
// user gesture behind it, so the browser blocks the request outright.
async function buildVoice(stream) {
  const raw = Tone.getContext().rawContext;
  V.stream = stream;
  V.src = raw.createMediaStreamSource(stream);

  // Laptop mics run very quiet. The preamp sits FIRST so the pitch tracker and
  // the meter see the boosted signal too, not just the speakers.
  V.boost = new Tone.Gain(V.gainAmt);
  V.hp = new Tone.Filter(95, 'highpass');
  V.comp = new Tone.Compressor({ threshold: -34, ratio: 5, attack: 0.004, release: 0.12 });
  V.makeup = new Tone.Gain(2.2);
  V.shift = new Tone.PitchShift({ pitch: 0, windowSize: 0.055, delayTime: 0, wet: 1 });
  V.mixer = new Tone.CrossFade(0);                  // a = raw, b = tuned
  V.gain = new Tone.Gain(0).connect(A.voice);       // silent until MIC is switched on
  V.wave = new Tone.Analyser('waveform', 2048);

  Tone.connect(V.src, V.boost);
  V.boost.connect(V.hp);
  V.hp.connect(V.wave);
  V.hp.connect(V.comp);
  V.comp.connect(V.makeup);
  V.makeup.connect(V.mixer.a);
  V.makeup.connect(V.shift);
  V.shift.connect(V.mixer.b);
  V.mixer.connect(V.gain);
  V.mixer.fade.value = V.tune > 0.05 ? 1 : 0;

  // Loop-recorder tap, on an audio worklet. Tapping the processed voice
  // pre-mute keeps the captured level independent of the monitor volume.
  try {
    await raw.audioWorklet.addModule('rec-tap.js');
    V.tap = new AudioWorkletNode(raw, 'rec-tap', { numberOfInputs: 1, numberOfOutputs: 1 });
    V.sink = raw.createGain(); V.sink.gain.value = 0;
    V.mixer.connect(V.tap);
    V.tap.connect(V.sink); V.sink.connect(raw.destination);
    V.tap.port.onmessage = (e) => {
      if (!V.collect) return;
      V.blocks.push(e.data);
      if (e.data.f + e.data.d.length >= V.fromFrame + V.needSamples) V.finish = true;
    };
    V.canRec = true;
  } catch (e) {
    V.canRec = false;                               // singing still works, looping doesn't
  }
  V.ready = true;
}

function beginCapture(time) {
  const raw = Tone.getContext().rawContext;
  const sr = raw.sampleRate;
  V.needSamples = Math.round(LOOP_BARS * 4 * (60 / Tone.Transport.bpm.value) * sr);
  V.recBpm = Tone.Transport.bpm.value;
  V.recPhase = 'rec'; V.recBars = 0;
  V.blocks = []; V.collect = true; V.finish = false;
  // `time` is an audio-clock timestamp and the worklet stamps blocks with
  // frames on that same clock, so the downbeat is a plain frame index. The
  // tuned signal arrives one pitch-shift window late, so slide the cut forward.
  V.startFrame = Math.round(time * sr);
  V.fromFrame = V.startFrame + (V.tune > 0.05 ? Math.round(0.055 * sr) : 0);
  if (V.tap) V.tap.port.postMessage({ on: true });
}

function finishCapture() {
  const raw = Tone.getContext().rawContext;
  V.collect = false; V.recPhase = 'idle'; V.finish = false;
  if (V.tap) V.tap.port.postMessage({ on: false });

  // drop each stamped block into place; gaps stay silent rather than shifting
  const out = new Float32Array(V.needSamples);
  let written = 0;
  for (const b of V.blocks) {
    const off = b.f - V.fromFrame;
    if (off + b.d.length <= 0 || off >= out.length) continue;
    const from = Math.max(0, -off), to = Math.max(0, off);
    const n = Math.min(b.d.length - from, out.length - to);
    if (n > 0) { out.set(b.d.subarray(from, from + n), to); written += n; }
  }
  V.blocks = [];
  if (written < V.needSamples * 0.5) { toast('recording came up short — try again'); return; }

  // Normalise. A quiet take is the usual outcome on a laptop mic, and a loop
  // you can't hear reads as "it didn't record".
  let peak = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  if (peak < 0.002) { toast('that came out silent — raise GAIN and try again'); return; }
  const norm = Math.min(12, 0.9 / peak);
  if (norm > 1) for (let i = 0; i < out.length; i++) out[i] *= norm;

  const ab = raw.createBuffer(1, V.needSamples, raw.sampleRate);
  ab.copyToChannel(out, 0);

  if (V.player) { try { V.player.stop(); V.player.dispose(); } catch (e) { /* noop */ } }
  V.player = new Tone.Player(ab).connect(A.voice);
  V.player.loop = true;
  V.player.playbackRate = Tone.Transport.bpm.value / V.recBpm;
  V.loopOn = true; V.loopPending = true;
  toast('loop captured — plays on the next bar');
}

function setLoop(on) {
  if (!V.player) { toast('record something first'); return; }
  V.loopOn = on;
  if (on) V.loopPending = true;
  else { V.loopPending = false; try { V.player.stop(); } catch (e) { /* noop */ } }
}
function clearLoop() {
  if (V.player) { try { V.player.stop(); V.player.dispose(); } catch (e) { /* noop */ } }
  V.player = null; V.loopOn = false; V.loopPending = false;
  V.recPhase = 'idle'; V.collect = false; V.blocks = [];
  if (V.tap) V.tap.port.postMessage({ on: false });
}

let pitchFrame = 0;
function updateVoice() {
  if (!V.ready || !V.on) return;
  if (V.finish) finishCapture();
  const raw = Tone.getContext().rawContext;
  V.buf = V.wave.getValue();
  let rms = 0;
  for (let i = 0; i < V.buf.length; i++) rms += V.buf[i] * V.buf[i];
  V.level = V.level * 0.7 + Math.sqrt(rms / V.buf.length) * 0.3;

  if (++pitchFrame % 2 === 0) {                     // ~30 Hz is plenty for a voice
    const { f } = detectPitch(V.buf, raw.sampleRate);
    if (f > 0) {
      V.f0 = f;
      const m = 69 + 12 * Math.log2(f / 440);
      const t = snapMidi(m);
      V.snapped = t;
      V.cents = (m - t) * 100;
      const want = Math.max(-6, Math.min(6, t - m)) * V.tune;
      // hard settings snap instantly; soft ones glide, which is the whole point
      const k = 0.25 + V.tune * 0.65;
      curShift += (want - curShift) * k;
    } else {
      V.f0 = -1; V.snapped = null;
      curShift += (0 - curShift) * 0.15;
    }
    if (Math.abs(V.shift.pitch - curShift) > 0.02) V.shift.pitch = curShift;
  }
}

// ---- hand tracking -------------------------------------------------------
let landmarker = null, lastVideoTime = -1, camOk = false;
const slots = new Map();                            // handedness label -> smoothed tip
let cursors = [];
const mouse = { x: 0, y: 0, down: false };
const hoverPt = { x: -1, y: -1 };     // pointer position regardless of buttons, for hints

function detect() {
  if (!landmarker || !video.videoWidth) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  try {
    const res = landmarker.detectForVideo(video, performance.now());
    const seen = new Set();
    const hands = res.handednesses || res.handedness;   // field name moved across MediaPipe builds
    (res.landmarks || []).forEach((lm, i) => {
      const label = (hands && hands[i] && hands[i][0] && hands[i][0].categoryName) || ('h' + i);
      seen.add(label);
      const raw = { x: lm[8].x, y: lm[8].y };
      const prev = slots.get(label);
      const sm = prev
        ? { x: prev.x * 0.5 + raw.x * 0.5, y: prev.y * 0.5 + raw.y * 0.5 }
        : { x: raw.x, y: raw.y };
      slots.set(label, sm);
    });
    for (const k of [...slots.keys()]) if (!seen.has(k)) slots.delete(k);
  } catch (e) { /* skip a bad frame */ }
}

const SLOW = 520;                                   // px/s — above this you're travelling, not aiming
const lastPos = new Map();
function buildCursors(W, H, dt) {
  cursors = [];
  if (video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    for (const [label, t] of slots) {
      const x = W - (ox + t.x * dw), y = oy + t.y * dh;
      const p = lastPos.get(label);
      const speed = p && dt > 0 ? Math.hypot(x - p.x, y - p.y) / dt : 0;
      lastPos.set(label, { x, y });
      cursors.push({ x, y, speed, slow: speed < SLOW, instant: false, hand: true });
    }
  }
  if (mouse.down) cursors.push({ x: mouse.x, y: mouse.y, speed: 0, slow: true, instant: true, hand: false });
}

// ---- widget helpers ------------------------------------------------------
const inRect = (r, c) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;
const presses = new Map();
let dt = 0;

// Hands drive the DJ pad only. Aiming a fingertip at a small tile is fiddly and
// the grids are far easier to click, but sweeping a filter is exactly what a
// hand is good at — so this is true only while the DJ deck is drawing.
let allowHands = false;
// Plain-English label for whatever the pointer is over, shown up in the bar.
let hint = '';
function tellHint(r, tip) {
  if (!tip) return;
  if (inRect(r, hoverPt)) { hint = tip; return; }
  if (!allowHands) return;
  for (const c of cursors) if (c.hand && inRect(r, c)) { hint = tip; return; }
}

// Dwell-to-arm. Fires once per entry; a mouse click fires immediately. A fast
// blip only PAUSES the fill rather than clearing it — tracking jitter would
// otherwise keep resetting a dwell you were halfway through.
function press(key, r, need = 0.26, tip) {
  tellHint(r, tip);
  let inside = false, moving = true, instant = false;
  for (const c of cursors) {
    if (c.hand && !allowHands) continue;
    if (!inRect(r, c)) continue;
    inside = true;
    if (c.slow) moving = false;
    if (c.instant) instant = true;
  }
  let d = presses.get(key);
  if (!d) { d = { t: 0, done: false }; presses.set(key, d); }
  if (!inside) { d.t = 0; d.done = false; return { p: 0, fired: false, hot: false }; }
  if (d.done) return { p: 1, fired: false, hot: true };
  if (instant) { d.done = true; return { p: 1, fired: true, hot: true }; }
  if (!moving) d.t += dt;
  if (d.t >= need) { d.done = true; return { p: 1, fired: true, hot: true }; }
  return { p: d.t / need, fired: false, hot: true };
}
// Continuous widgets (XY pad, faders) latch where you leave them. They need a
// short settle before engaging — otherwise a hand crossing the deck on its way
// somewhere else would yank the filter with it — but once engaged you can move
// as fast as you like, which is the opposite of the dwell rule above.
const grabs = new Map();
function grab(key, r, settle = 0.14, tip) {
  tellHint(r, tip);
  let hit = null;
  for (const c of cursors) {
    if (c.hand && !allowHands) continue;
    if (inRect(r, c)) { hit = c; break; }
  }
  let g = grabs.get(key);
  if (!g) { g = { t: 0 }; grabs.set(key, g); }
  if (!hit) { g.t = 0; return null; }
  if (hit.instant) return hit;                      // a mouse press means it on the spot
  g.t += dt;
  return g.t >= settle ? hit : null;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- layout --------------------------------------------------------------
const BAR_H = 42, PAD = 14, TITLE = 24, FOOT = 34, GAPY = 9;
function quads(W, H) {
  const top = BAR_H, h = H - top, mx = Math.round(W / 2), my = top + Math.round(h / 2);
  return [
    { x: 0, y: top, w: mx, h: my - top, col: COL.drums, title: 'DRUMS' },
    { x: mx, y: top, w: W - mx, h: my - top, col: COL.synth, title: 'CHORDS' },
    { x: 0, y: my, w: mx, h: H - my, col: COL.voice, title: 'VOICE' },
    { x: mx, y: my, w: W - mx, h: H - my, col: COL.dj, title: 'DJ' },
  ];
}
function frame(r) {
  const x = r.x + PAD, w = r.w - PAD * 2;
  const ty = r.y + PAD + 4, by = r.y + PAD + TITLE;
  const bh = Math.max(60, r.h - PAD * 2 - TITLE - FOOT - GAPY);
  return { tx: x, ty, body: { x, y: by, w, h: bh }, foot: { x, y: by + bh + GAPY, w, h: FOOT } };
}
function row(r, n, gap = 8) {
  const w = (r.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }));
}
function gridCells(r, cols, rows, gap = 6) {
  const w = (r.w - gap * (cols - 1)) / cols, h = (r.h - gap * (rows - 1)) / rows;
  const out = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      out.push({ x: r.x + cx * (w + gap), y: r.y + ry * (h + gap), w, h, c: cx, r: ry });
    }
  }
  return out;
}

// ---- drawing -------------------------------------------------------------
function roundRect(r, rad) {
  const k = Math.min(rad, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}
function text(s, x, y, size, col, align = 'left', baseline = 'alphabetic', font = 'VT323') {
  ctx.font = `${size}px "${font}", monospace`;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
// one tile: outline + dwell fill + label
function tile(r, label, opt = {}) {
  const col = opt.col || COL.ink, on = !!opt.on, p = opt.p || 0;
  roundRect(r, 6);
  ctx.fillStyle = on ? rgba(col, 0.8) : rgba(col, 0.06);
  ctx.fill();
  if (p > 0.02 && !on) {
    ctx.save(); roundRect(r, 6); ctx.clip();
    ctx.fillStyle = rgba(col, 0.34);
    ctx.fillRect(r.x, r.y + r.h * (1 - p), r.w, r.h * p);
    ctx.restore();
  }
  roundRect(r, 6);
  ctx.strokeStyle = rgba(col, opt.hot ? 0.95 : 0.42);
  ctx.lineWidth = opt.hot ? 2 : 1;
  ctx.stroke();
  const fs = Math.min(opt.size || 17, r.h * 0.62);
  text(label, r.x + r.w / 2, r.y + r.h / 2 + (opt.sub ? -fs * 0.32 : 0), fs,
    on ? '#06060b' : rgba(col, 0.92), 'center', 'middle');
  if (opt.sub) {
    text(opt.sub, r.x + r.w / 2, r.y + r.h / 2 + fs * 0.62, fs * 0.72,
      on ? 'rgba(6,6,11,0.7)' : rgba(col, 0.55), 'center', 'middle');
  }
}
function slider(r, v, col, label) {
  roundRect(r, 4);
  ctx.fillStyle = rgba(col, 0.07); ctx.fill();
  ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); roundRect(r, 4); ctx.clip();
  ctx.fillStyle = rgba(col, 0.32); ctx.fillRect(r.x, r.y, r.w * v, r.h);
  ctx.restore();
  ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(r.x + r.w * v, r.y + 2); ctx.lineTo(r.x + r.w * v, r.y + r.h - 2); ctx.stroke();
  if (label) text(label, r.x + 8, r.y + r.h / 2, Math.min(17, r.h * 0.6), rgba(col, 0.9), 'left', 'middle');
}

// ---- decks ---------------------------------------------------------------
// deck title plus a plain-language line saying what the panel is for
function deckHead(f, col, title, sub, tag) {
  ctx.font = '15px "Press Start 2P", monospace';
  const tw = ctx.measureText(title).width;
  text(title, f.tx, f.ty, 15, rgba(col, 0.85), 'left', 'top', 'Press Start 2P');
  if (tag) text(tag, f.tx + f.body.w, f.ty + 3, 17, rgba(col, 0.5), 'right', 'top');
  // the subtitle is the first thing to go when a quadrant gets narrow
  if (f.body.w > 400) text(sub, f.tx + tw + 12, f.ty + 3, 17, rgba(COL.ink, 0.4), 'left', 'top');
}

function deckDrums(q) {
  const f = frame(q), col = q.col;
  deckHead(f, col, 'DRUMS', 'the beat — click squares');

  const labW = Math.min(52, f.body.w * 0.13);
  const gridR = { x: f.body.x + labW, y: f.body.y, w: f.body.w - labW, h: f.body.h };
  const cells = gridCells(gridR, STEPS, ROWS, 6);

  // playhead wash
  const cw = (gridR.w - 6 * (STEPS - 1)) / STEPS;
  ctx.fillStyle = rgba(COL.ink, 0.07);
  ctx.fillRect(gridR.x + playStep * (cw + 6) - 3, gridR.y - 2, cw + 6, gridR.h + 4);

  for (const c of cells) {
    const r = c.r, s = c.c;
    const st = press('d' + r + '-' + s, c, 0.38,
      'Click a square to make the ' + ROW_META[r].name + ' hit on beat ' + (s / 2 + 1).toFixed(1).replace('.0', '') +
      ' of the bar. Lit squares play; the bar sweeps left to right.');
    if (st.fired) pattern[r][s] = !pattern[r][s];
    const live = pattern[r][s] && s === playStep;
    if (live) { ctx.save(); ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = 18; }
    roundRect(c, 5);
    ctx.fillStyle = pattern[r][s] ? rgba(col, live ? 0.95 : 0.62) : rgba(COL.ink, s % 2 === 0 ? 0.07 : 0.035);
    ctx.fill();
    if (live) ctx.restore();
    if (!pattern[r][s]) {
      roundRect(c, 5);
      ctx.strokeStyle = rgba(COL.ink, s % 2 === 0 ? 0.22 : 0.1);
      ctx.lineWidth = 1; ctx.stroke();
    }
    if (st.p > 0.02 && st.p < 1) {
      ctx.save(); roundRect(c, 5); ctx.clip();
      ctx.fillStyle = rgba(COL.ink, 0.4);
      ctx.fillRect(c.x, c.y + c.h * (1 - st.p), c.w, c.h * st.p);
      ctx.restore();
      roundRect(c, 5); ctx.strokeStyle = rgba(COL.ink, 0.9); ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const ch = (f.body.h - 6 * (ROWS - 1)) / ROWS;
  for (let r = 0; r < ROWS; r++) {
    text(ROW_META[r].name, f.body.x, f.body.y + r * (ch + 6) + ch / 2,
      Math.min(17, ch * 0.6), rgba(col, 0.4 + rowFlash[r] * 0.55), 'left', 'middle');
  }

  const [kb, pb, cb] = row(f.foot, 3);
  const k = press('kit', kb, 0.26, 'KIT — which drum machine the sounds come from. 808 is deep and boomy, 909 punchier, acoustic is a real-ish kit.');
  if (k.fired) { kitIdx = (kitIdx + 1) % KIT_NAMES.length; loadKit(KIT_NAMES[kitIdx]); }
  tile(kb, KIT_NAMES[kitIdx], { col, p: k.p, hot: k.hot, sub: 'KIT' });
  const pr = press('preset', pb, 0.26, 'GROOVE — drop in a ready-made beat. Click again for the next one. Good place to start, then edit the squares.');
  if (pr.fired) { presetIdx = (presetIdx + 1) % PRESETS.length; loadPreset(presetIdx); }
  tile(pb, PRESETS[presetIdx].name, { col, p: pr.p, hot: pr.hot, sub: 'GROOVE' });
  const cl = press('clr', cb, 0.26, 'CLEAR — switch every drum square off and start the beat from scratch.');
  if (cl.fired) clearDrums();
  tile(cb, 'CLEAR', { col, p: cl.p, hot: cl.hot });
}

function deckSynth(q) {
  const f = frame(q), col = q.col;
  const keyName = NOTE_NAMES[rootPc] + (mode === 'minor' ? ' minor' : ' major');
  deckHead(f, col, 'CHORDS', 'the tune — click a pad to hold it', keyName);

  const cells = gridCells(f.body, 4, 2, 8);
  cells.forEach((c, i) => {
    const ch = chordAt(i);
    const st = press('ch' + i, c, 0.24,
      ch.name + ' — click to hold this chord; it keeps ringing while you go do something else. ' +
      'Click it again to stop. All eight belong to the key, so none of them can sound wrong.');
    if (st.fired) selectChord(i);
    tile(c, ch.label, { col, on: heldChord === i, p: st.p, hot: st.hot, sub: ch.name, size: 26 });
  });

  const [wb, ab, bb] = row(f.foot, 3);
  const w = press('wave', wb, 0.26, 'WAVE — the flavour of the synth. SAW is bright and buzzy, SQR is hollow and video-gamey, SOFT is a mellow pad.');
  if (w.fired) {
    waveIdx = (waveIdx + 1) % WAVES.length;
    A.synth.set({ oscillator: WAVES[waveIdx].set });
    // a sustaining chord keeps its old oscillators, so the change wouldn't be
    // audible until you played the next pad — retrigger and you hear it now
    if (heldChord >= 0 && !arpOn) {
      A.synth.releaseAll();
      A.synth.triggerAttack(chordAt(heldChord).notes.map(midiHz));
    }
  }
  tile(wb, WAVES[waveIdx].label, { col, p: w.p, hot: w.hot, sub: 'WAVE' });
  const ar = press('arp', ab, 0.26, 'ARP — instead of holding the chord as one block, plays its notes one at a time in time with the beat.');
  if (ar.fired) { arpOn = !arpOn; releaseChord(); arpIdx = 0; attackHeld(); }
  tile(ab, 'ARP', { col, on: arpOn, p: ar.p, hot: ar.hot });
  const bs = press('bass', bb, 0.26, 'BASS — add a deep bass note underneath whatever chord is held. Usually leave this on.');
  if (bs.fired) {
    bassOn = !bassOn;
    if (!bassOn) { try { A.bass.triggerRelease(); } catch (e) { /* noop */ } }
    else if (heldChord >= 0) A.bass.triggerAttack(midiHz(chordAt(heldChord).notes[0] - 24));
  }
  tile(bb, 'BASS', { col, on: bassOn, p: bs.p, hot: bs.hot });
}

function deckVoice(q) {
  const f = frame(q), col = q.col;
  deckHead(f, col, 'VOICE', 'sing over it', V.on ? '🎧 headphones!' : '');

  const sliderH = Math.min(30, f.body.h * 0.2), gapT = 7;
  const scopeH = f.body.h - sliderH * 2 - gapT * 2;
  const scope = { x: f.body.x, y: f.body.y, w: f.body.w, h: scopeH };
  roundRect(scope, 6); ctx.fillStyle = rgba(col, 0.05); ctx.fill();
  roundRect(scope, 6); ctx.strokeStyle = rgba(col, 0.25); ctx.lineWidth = 1; ctx.stroke();

  if (V.on && V.buf) {
    ctx.save(); roundRect(scope, 6); ctx.clip();
    ctx.beginPath();
    const n = V.buf.length, mid = scope.y + scope.h / 2;
    for (let i = 0; i < n; i += 2) {
      const x = scope.x + (i / n) * scope.w;
      const y = mid - V.buf[i] * scope.h * 0.44;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    // the note you're landing on, and how far off you were before the snap
    const big = V.snapped != null ? midiName(V.snapped) : '—';
    text(big, scope.x + scope.w / 2, scope.y + scope.h / 2, Math.min(58, scope.h * 0.6),
      rgba(col, V.snapped != null ? 0.95 : 0.25), 'center', 'middle');
    if (V.snapped != null) {
      const cx = scope.x + scope.w / 2, off = Math.max(-50, Math.min(50, V.cents)) / 50;
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, scope.y + scope.h - 12);
      ctx.lineTo(cx + off * scope.w * 0.3, scope.y + scope.h - 12);
      ctx.stroke();
    }
  } else {
    const msg = !V.ready ? (V.denied ? 'NO MIC' : 'MIC UNAVAILABLE')
      : V.on ? 'listening…' : 'MIC MUTED';
    text(msg, scope.x + scope.w / 2, scope.y + scope.h / 2,
      Math.min(30, scope.h * 0.34), rgba(col, 0.35), 'center', 'middle');
  }
  if (V.recPhase === 'countin' || V.recPhase === 'rec') {
    const msg = V.recPhase === 'countin' ? 'REC IN ' + (4 - Math.floor(playStep / 2)) : '● REC';
    text(msg, scope.x + 10, scope.y + 12, 22, rgba(V.recPhase === 'rec' ? [255, 90, 90] : col, 0.95), 'left', 'top');
  }
  // input meter — turns green when there's enough signal to track a pitch
  if (V.on) {
    const lvl = Math.min(1, V.level * 6);
    ctx.fillStyle = rgba(COL.ink, 0.12);
    ctx.fillRect(scope.x + 8, scope.y + scope.h - 8, scope.w - 16, 4);
    ctx.fillStyle = V.level > 0.02 ? 'rgba(120,235,140,0.85)' : rgba(col, 0.5);
    ctx.fillRect(scope.x + 8, scope.y + scope.h - 8, (scope.w - 16) * lvl, 4);
    if (V.level < 0.012) {
      text('too quiet — raise GAIN', scope.x + scope.w / 2, scope.y + scope.h - 16, 17,
        rgba(col, 0.6), 'center', 'bottom');
    }
  }

  const gainR = { x: f.body.x, y: scope.y + scopeH + gapT, w: f.body.w, h: sliderH };
  const gg = grab('gain', gainR, 0.14, 'GAIN — how hard your mic is boosted. If the green meter barely moves, push this up.');
  if (gg) {
    V.gainAmt = 1 + clamp01((gg.x - gainR.x) / gainR.w) * 19;    // 1x .. 20x
    if (V.ready) V.boost.gain.rampTo(V.gainAmt, 0.05);
  }
  slider(gainR, (V.gainAmt - 1) / 19, col, 'GAIN ' + V.gainAmt.toFixed(0) + '×');

  const tuneR = { x: f.body.x, y: gainR.y + sliderH + gapT, w: f.body.w, h: sliderH };
  const g = grab('tune', tuneR, 0.14, 'TUNE — drags your singing onto the nearest note of the key. Left is your natural voice, right is full robot.');
  if (g) {
    V.tune = clamp01((g.x - tuneR.x) / tuneR.w);
    if (V.on) V.mixer.fade.value = V.tune > 0.05 ? 1 : 0;
  }
  slider(tuneR, V.tune, col, 'TUNE ' + (V.tune < 0.05 ? 'off' : Math.round(V.tune * 100) + '%'));

  const [mb, rb, lb, cb] = row(f.foot, 4);
  const m = press('mic', mb, 0.26, 'MIC — unmute your voice. Permission was already given at the start screen, so this is instant. Wear headphones.');
  if (m.fired) toggleMic();
  tile(mb, 'MIC', { col, on: V.on, p: m.p, hot: m.hot });
  const rc = press('rec', rb, 0.26, 'REC — counts you in for one bar, then records the next two bars of singing and starts looping it.');
  if (rc.fired) {
    if (!V.on) toast('switch the mic on first');
    else if (!V.canRec) toast('recording is unavailable in this browser');
    else if (V.recPhase === 'idle') { V.recPhase = 'armed'; toast('recording starts on the next bar'); }
    else { V.recPhase = 'idle'; V.collect = false; V.blocks = []; }
  }
  tile(rb, V.recPhase === 'idle' ? 'REC' : V.recPhase === 'rec' ? '●' : '…',
    { col: V.recPhase === 'rec' ? [255, 90, 90] : col, on: V.recPhase !== 'idle', p: rc.p, hot: rc.hot });
  const lp = press('loop', lb, 0.26, 'LOOP — play the phrase you recorded over and over, in time with the beat.');
  if (lp.fired) setLoop(!V.loopOn);
  tile(lb, 'LOOP', { col, on: V.loopOn, p: lp.p, hot: lp.hot });
  const cl = press('vclr', cb, 0.26, 'CLR — throw the recorded phrase away so you can sing a new one.');
  if (cl.fired) clearLoop();
  tile(cb, 'CLR', { col, p: cl.p, hot: cl.hot });
}

function deckDj(q) {
  const f = frame(q), col = q.col;
  deckHead(f, col, 'DJ', 'shape the whole mix', '✋ hands work here');

  const xfH = 30, gap = 9;
  const pad = { x: f.body.x, y: f.body.y, w: f.body.w, h: f.body.h - xfH - gap };
  const g = grab('xy', pad, 0.14,
    'Move your hand (or drag) around this pad. LEFT muffles everything like it is behind a wall, RIGHT thins it out ' +
    'to a tinny radio, MIDDLE is normal. UP adds echo and space. It stays where you leave it.');
  if (g) {
    filtX = clamp01((g.x - pad.x) / pad.w);
    fxY = clamp01(1 - (g.y - pad.y) / pad.h);
    applyFilter(); applyFx();
  }
  roundRect(pad, 8); ctx.fillStyle = rgba(col, 0.05); ctx.fill();
  ctx.save(); roundRect(pad, 8); ctx.clip();
  ctx.strokeStyle = rgba(col, 0.13); ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(pad.x + pad.w * i / 4, pad.y); ctx.lineTo(pad.x + pad.w * i / 4, pad.y + pad.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.x, pad.y + pad.h * i / 4); ctx.lineTo(pad.x + pad.w, pad.y + pad.h * i / 4); ctx.stroke();
  }
  ctx.strokeStyle = rgba(col, 0.34);
  ctx.beginPath(); ctx.moveTo(pad.x + pad.w / 2, pad.y); ctx.lineTo(pad.x + pad.w / 2, pad.y + pad.h); ctx.stroke();
  ctx.restore();
  roundRect(pad, 8); ctx.strokeStyle = rgba(col, g ? 0.9 : 0.32); ctx.lineWidth = g ? 2 : 1; ctx.stroke();

  const px = pad.x + filtX * pad.w, py = pad.y + (1 - fxY) * pad.h;
  ctx.save(); ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = g ? 22 : 10;
  ctx.fillStyle = rgba(col, g ? 1 : 0.7);
  ctx.beginPath(); ctx.arc(px, py, g ? 9 : 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.x, py); ctx.lineTo(pad.x + pad.w, py);
  ctx.moveTo(px, pad.y); ctx.lineTo(px, pad.y + pad.h); ctx.stroke();

  text('◄ LOW', pad.x + 8, pad.y + pad.h - 8, 16, rgba(col, 0.4), 'left', 'bottom');
  text('HIGH ►', pad.x + pad.w - 8, pad.y + pad.h - 8, 16, rgba(col, 0.4), 'right', 'bottom');
  text('FX ▲', pad.x + 8, pad.y + 8, 16, rgba(col, 0.4), 'left', 'top');

  const xf = { x: f.body.x, y: pad.y + pad.h + gap, w: f.body.w, h: xfH };
  const gx = grab('xfade', xf, 0.14,
    'CROSSFADER — slide between drums only (left) and chords only (right). Middle plays both. Your voice is never faded out.');
  if (gx) { xfade = clamp01((gx.x - xf.x) / xf.w); applyXfade(); }
  roundRect(xf, 4); ctx.fillStyle = rgba(col, 0.06); ctx.fill();
  ctx.save(); roundRect(xf, 4); ctx.clip();
  ctx.fillStyle = rgba(COL.drums, 0.28 * (1 - xfade) + 0.06); ctx.fillRect(xf.x, xf.y, xf.w / 2, xf.h);
  ctx.fillStyle = rgba(COL.synth, 0.28 * xfade + 0.06); ctx.fillRect(xf.x + xf.w / 2, xf.y, xf.w / 2, xf.h);
  ctx.restore();
  roundRect(xf, 4); ctx.strokeStyle = rgba(col, 0.32); ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = rgba(COL.ink, 0.95); ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xf.x + xf.w * xfade, xf.y + 3); ctx.lineTo(xf.x + xf.w * xfade, xf.y + xf.h - 3); ctx.stroke();
  text('DRUMS', xf.x + 8, xf.y + xf.h / 2, 16, rgba(COL.drums, 0.8), 'left', 'middle');
  text('CHORDS', xf.x + xf.w - 8, xf.y + xf.h / 2, 16, rgba(COL.synth, 0.8), 'right', 'middle');

  const [sb, db] = row(f.foot, 2);
  // stutter is momentary — hold your hand on it and the beat repeats, take it
  // away and the bar carries on, which is how you'd actually use a beat-repeat
  const sHot = !!grab('stut', sb, 0.12,
    'STUTTER — hold your hand here (or hold the mouse down) and the last half-beat repeats fast, like a stuck record. Let go and the beat carries on.');
  if (sHot !== stutter) setStutter(sHot);
  tile(sb, 'STUTTER', { col, on: stutter, hot: sHot });
  const dp = press('drop', db, 0.26,
    'DROP — cuts everything to silence for half a bar, then slams back in with the filter reset. The classic build-up trick.');
  if (dp.fired) fireDrop();
  tile(db, 'DROP', { col, on: dropLeft > 0, p: dp.p, hot: dp.hot });
}

function loadPreset(i) {
  const rows = PRESETS[i].rows;
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < STEPS; s++) pattern[r][s] = rows[r][s] === '1';
}
function clearDrums() { for (let r = 0; r < ROWS; r++) for (let s = 0; s < STEPS; s++) pattern[r][s] = false; }

// ---- frame ---------------------------------------------------------------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const W = cv.clientWidth, H = cv.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  detect();
  buildCursors(W, H, dt);
  updateVoice();
  for (let r = 0; r < ROWS; r++) rowFlash[r] = Math.max(0, rowFlash[r] - dt * 4);
  dropFlash = Math.max(0, dropFlash - dt * 1.6);

  ctx.fillStyle = '#06060b';
  ctx.fillRect(0, 0, W, H);
  if (video.videoWidth) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    ctx.save();
    ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.filter = 'grayscale(1) contrast(1.05) brightness(0.9)';
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(6,6,11,0.76)';
    ctx.fillRect(0, 0, W, H);
  }

  const qs = quads(W, H);
  hint = '';
  allowHands = false;
  deckDrums(qs[0]); deckSynth(qs[1]); deckVoice(qs[2]);
  allowHands = true;                    // hands only reach the DJ deck
  deckDj(qs[3]);
  allowHands = false;
  showHint(hint);

  // quadrant seams
  ctx.strokeStyle = rgba(COL.ink, 0.12); ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(qs[1].x + 0.5, BAR_H); ctx.lineTo(qs[1].x + 0.5, H);
  ctx.moveTo(0, qs[2].y + 0.5); ctx.lineTo(W, qs[2].y + 0.5);
  ctx.stroke();

  if (dropFlash > 0) {
    ctx.fillStyle = rgba(COL.dj, dropFlash * 0.18);
    ctx.fillRect(0, BAR_H, W, H - BAR_H);
  }

  // Hand cursors: bright over the DJ deck where they do something, faint
  // elsewhere so it's obvious the other decks are waiting for a click.
  for (const c of cursors) {
    if (!c.hand) continue;
    const live = inRect(qs[3], c);
    const col = live ? COL.dj : COL.ink;
    ctx.strokeStyle = rgba(col, live ? (c.slow ? 0.95 : 0.5) : 0.16);
    ctx.lineWidth = live ? 2.4 : 1.2;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.slow ? 12 : 17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(col, live ? 0.9 : 0.16);
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- ui wiring -----------------------------------------------------------
const IDLE_HINT = 'Point at any control to read what it does. Only the DJ pad uses your hands — everything else is click.';
let lastHint = null;
const hintEl = document.getElementById('hint');
function showHint(h) {
  const t = h || IDLE_HINT;
  if (t === lastHint) return;             // don't touch the DOM 60x a second
  lastHint = t;
  hintEl.textContent = t;
  hintEl.classList.toggle('idle', !h);
}

let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Just a mute now — the stream was opened at the gate, so switching the mic on
// is instant and never raises a permission prompt mid-performance.
function toggleMic() {
  if (!V.ready) {
    toast(V.denied
      ? 'microphone was blocked — reload and allow it at the start screen'
      : 'no microphone found');
    return;
  }
  V.on = !V.on;
  V.gain.gain.rampTo(V.on ? 0.9 : 0, 0.06);
  if (!V.on) {
    V.buf = null; V.f0 = -1; V.snapped = null;
    if (V.recPhase !== 'idle') { V.recPhase = 'idle'; V.collect = false; V.blocks = []; }
  }
  toast(V.on ? 'mic live — wear headphones' : 'mic muted');
}

function wireBar() {
  const bind = (id, get, set, fmt) => {
    const el = document.getElementById(id), out = document.getElementById('v-' + id);
    el.value = get();
    const upd = () => { const v = parseFloat(el.value); set(v); if (out) out.textContent = fmt(v); };
    el.addEventListener('input', upd); upd();
  };
  bind('bpm', () => Tone.Transport.bpm.value, (v) => {
    Tone.Transport.bpm.value = v;
    A.delay.delayTime.value = 30 / v;                                 // an eighth note, still
    if (V.player && V.recBpm) V.player.playbackRate = v / V.recBpm;   // keep a captured loop in time
  }, (v) => v.toFixed(0));
  bind('vol', () => Tone.getDestination().volume.value, (v) => Tone.getDestination().volume.value = v, (v) => v.toFixed(0));

  const rootSel = document.getElementById('root');
  NOTE_NAMES.forEach((n, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = n; rootSel.appendChild(o);
  });
  rootSel.value = rootPc;
  rootSel.addEventListener('change', () => { rootPc = parseInt(rootSel.value, 10); releaseChord(); heldChord = -1; });
  const modeSel = document.getElementById('mode');
  modeSel.value = mode;
  modeSel.addEventListener('change', () => { mode = modeSel.value; releaseChord(); heldChord = -1; });

  const playBtn = document.getElementById('play');
  playBtn.addEventListener('click', () => {
    if (Tone.Transport.state === 'started') { Tone.Transport.pause(); playBtn.textContent = '▶ PLAY'; playBtn.classList.remove('on'); }
    else { Tone.Transport.start(); playBtn.textContent = '■ STOP'; playBtn.classList.add('on'); }
  });
  const helpBtn = document.getElementById('help');
  const card = document.getElementById('help-card');
  helpBtn.addEventListener('click', () => card.classList.toggle('show'));

  cv.addEventListener('mousedown', (e) => { mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    hoverPt.x = e.clientX; hoverPt.y = e.clientY;
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; mouse.down = true; mouse.x = t.clientX; mouse.y = t.clientY; }, { passive: true });
  cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; }, { passive: true });
  window.addEventListener('touchend', () => { mouse.down = false; });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'r') { filtX = 0.5; fxY = 0; applyFilter(); applyFx(); }
    else if (e.key === 'x') clearDrums();
    else if (e.key === 'm') toggleMic();
  });
}

// ---- boot ----------------------------------------------------------------
startBtn.addEventListener('click', start);

async function start() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  note.textContent = 'warming up the decks…';
  try {
    // Hand Tone a genuine AudioContext. Left alone it builds a
    // standardized-audio-context proxy, which AudioWorkletNode refuses and
    // which has no createScriptProcessor — the loop recorder needs a real one.
    Tone.setContext(new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }));
    await Tone.start();
    try { await document.fonts.ready; } catch (e) { /* canvas will fall back to monospace */ }
    Tone.Transport.bpm.value = 124;      // before the graph, so '8n' delay resolves at this tempo
    await buildAudio();
    loadPreset(0);

    // ONE prompt, on the START click. Opening the mic later — when a hand
    // dwells on the MIC tile — has no user gesture behind it, so the browser
    // blocks the request. The stream is taken now and simply kept muted.
    const VID = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
    const AUD = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let camStream = null, micStream = null;
    try {
      const both = await navigator.mediaDevices.getUserMedia({ video: VID, audio: AUD });
      camStream = new MediaStream(both.getVideoTracks());
      const at = both.getAudioTracks();
      if (at.length) micStream = new MediaStream(at);
    } catch (e) {
      V.denied = true;                   // refused, or there's no mic on this machine
      try { camStream = await navigator.mediaDevices.getUserMedia({ video: VID }); }
      catch (e2) { camStream = null; }
    }

    if (camStream) {
      try {
        video.srcObject = camStream;
        await video.play();
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        const opts = { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, numHands: 2, runningMode: 'VIDEO' };
        try { landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
        catch (e) { opts.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
        camOk = true;
      } catch (e) {
        camOk = false;    // no camera is survivable — the whole booth works with a mouse
      }
    }
    if (micStream) {
      try { await buildVoice(micStream); } catch (e) { V.ready = false; V.denied = true; }
    }

    applyFilter(); applyFx(); applyXfade();
    startTransport();
    wireBar();
    document.body.classList.add('go');
    gate.remove();
    requestAnimationFrame(loop);
    if (!camOk) toast('no camera — drive the booth with your mouse');
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'setup failed: ' + (err && err.message ? err.message : err) + ' — allow camera + audio and retry';
  }
}
