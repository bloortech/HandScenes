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
V.chunks = []; V.times = []; V.chunkSize = 2048; V.targetTime = 0; V.needSamples = 0;
V.player = null; V.loopOn = false; V.loopPending = false; V.finish = false; V.collect = false;
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

async function openMic() {
  const raw = Tone.getContext().rawContext;
  // Tone.UserMedia opens the stream with echo-cancellation and noise-suppression
  // OFF, which is exactly what a pitch tracker wants (and exactly why you need
  // headphones — the speakers will otherwise feed straight back in).
  V.mic = new Tone.UserMedia();
  await V.mic.open();

  V.hp = new Tone.Filter(95, 'highpass');
  V.comp = new Tone.Compressor({ threshold: -24, ratio: 3, attack: 0.005, release: 0.12 });
  V.shift = new Tone.PitchShift({ pitch: 0, windowSize: 0.055, delayTime: 0, wet: 1 });
  V.mixer = new Tone.CrossFade(0);                  // a = raw, b = tuned
  V.gain = new Tone.Gain(0.9).connect(A.voice);
  V.wave = new Tone.Analyser('waveform', 2048);

  V.mic.connect(V.hp);
  V.hp.connect(V.wave);
  V.hp.connect(V.comp);
  V.comp.connect(V.mixer.a);
  V.comp.connect(V.shift);
  V.shift.connect(V.mixer.b);
  V.mixer.connect(V.gain);

  // A tap for the loop recorder. ScriptProcessor is deprecated but universally
  // present, and it gives us a sample counter we can line up with the bar —
  // MediaRecorder's start latency would smear the loop point.
  V.chunkSize = 2048;
  V.tap = raw.createScriptProcessor(V.chunkSize, 1, 1);
  V.sink = raw.createGain(); V.sink.gain.value = 0;
  V.gain.connect(V.tap);
  V.tap.connect(V.sink); V.sink.connect(raw.destination);
  V.tap.onaudioprocess = (e) => {
    if (!V.collect) return;
    const inp = e.inputBuffer.getChannelData(0);
    // stamp every chunk with its place on the audio clock, so the downbeat can
    // later be found to the sample instead of to the nearest 2048-frame block
    V.times.push(typeof e.playbackTime === 'number' ? e.playbackTime : raw.currentTime);
    V.chunks.push(new Float32Array(inp));
    if (V.chunks.length * V.chunkSize >= V.needSamples + V.chunkSize * 4) V.finish = true;
  };
  V.on = true;
  V.mixer.fade.value = V.tune > 0.05 ? 1 : 0;
}

function beginCapture(time) {
  const raw = Tone.getContext().rawContext;
  V.needSamples = Math.round(LOOP_BARS * 4 * (60 / Tone.Transport.bpm.value) * raw.sampleRate);
  V.recBpm = Tone.Transport.bpm.value;
  V.recPhase = 'rec'; V.recBars = 0;
  V.chunks = []; V.times = []; V.collect = true; V.finish = false;
  V.targetTime = time;               // audio-clock time of the downbeat we start on
}

function finishCapture() {
  const raw = Tone.getContext().rawContext;
  const sr = raw.sampleRate;
  V.collect = false; V.recPhase = 'idle'; V.finish = false;
  const total = V.chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0; for (const c of V.chunks) { all.set(c, o); o += c.length; }

  // walk the stamped chunks to find the sample sitting exactly on the downbeat
  let start = 0;
  for (let i = 0; i < V.times.length; i++) {
    if (V.times[i] <= V.targetTime) start = i * V.chunkSize + Math.round((V.targetTime - V.times[i]) * sr);
  }
  V.chunks = []; V.times = [];
  // the tuned signal arrives one pitch-shift window late, so slide the window on
  const lat = V.tune > 0.05 ? Math.round(0.055 * sr) : 0;
  const from = Math.max(0, Math.min(total, start + lat));
  const slice = all.subarray(from, from + V.needSamples);
  if (slice.length < V.needSamples * 0.5) { toast('recording came up short — try again'); return; }

  const take = new Float32Array(V.needSamples);   // pad with silence if we ran out
  take.set(slice.subarray(0, Math.min(slice.length, V.needSamples)));
  const ab = raw.createBuffer(1, V.needSamples, raw.sampleRate);
  ab.copyToChannel(take, 0);

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
  V.recPhase = 'idle'; V.collect = false; V.chunks = []; V.times = [];
}

let pitchFrame = 0;
function updateVoice() {
  if (!V.on) return;
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

// Dwell-to-arm. Fires once per entry; a mouse click fires immediately. A fast
// blip only PAUSES the fill rather than clearing it — tracking jitter would
// otherwise keep resetting a dwell you were halfway through.
function press(key, r, need = 0.34) {
  let inside = false, moving = true, instant = false;
  for (const c of cursors) {
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
function grab(key, r, settle = 0.14) {
  let hit = null;
  for (const c of cursors) if (inRect(r, c)) { hit = c; break; }
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
function deckDrums(q) {
  const f = frame(q), col = q.col;
  text('DRUMS', f.tx, f.ty, 15, rgba(col, 0.85), 'left', 'top', 'Press Start 2P');

  const labW = Math.min(52, f.body.w * 0.13);
  const gridR = { x: f.body.x + labW, y: f.body.y, w: f.body.w - labW, h: f.body.h };
  const cells = gridCells(gridR, STEPS, ROWS, 6);

  // playhead wash
  const cw = (gridR.w - 6 * (STEPS - 1)) / STEPS;
  ctx.fillStyle = rgba(COL.ink, 0.07);
  ctx.fillRect(gridR.x + playStep * (cw + 6) - 3, gridR.y - 2, cw + 6, gridR.h + 4);

  for (const c of cells) {
    const r = c.r, s = c.c;
    const st = press('d' + r + '-' + s, c, 0.38);
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
  const k = press('kit', kb); if (k.fired) { kitIdx = (kitIdx + 1) % KIT_NAMES.length; loadKit(KIT_NAMES[kitIdx]); }
  tile(kb, KIT_NAMES[kitIdx], { col, p: k.p, hot: k.hot, sub: 'KIT' });
  const pr = press('preset', pb);
  if (pr.fired) { presetIdx = (presetIdx + 1) % PRESETS.length; loadPreset(presetIdx); }
  tile(pb, PRESETS[presetIdx].name, { col, p: pr.p, hot: pr.hot, sub: 'GROOVE' });
  const cl = press('clr', cb); if (cl.fired) clearDrums();
  tile(cb, 'CLEAR', { col, p: cl.p, hot: cl.hot });
}

function deckSynth(q) {
  const f = frame(q), col = q.col;
  const keyName = NOTE_NAMES[rootPc] + (mode === 'minor' ? ' minor' : ' major');
  text('CHORDS', f.tx, f.ty, 15, rgba(col, 0.85), 'left', 'top', 'Press Start 2P');
  text(keyName, f.tx + f.body.w, f.ty + 2, 18, rgba(col, 0.5), 'right', 'top');

  const cells = gridCells(f.body, 4, 2, 8);
  cells.forEach((c, i) => {
    const ch = chordAt(i);
    const st = press('ch' + i, c, 0.24);
    if (st.fired) selectChord(i);
    tile(c, ch.label, { col, on: heldChord === i, p: st.p, hot: st.hot, sub: ch.name, size: 26 });
  });

  const [wb, ab, bb] = row(f.foot, 3);
  const w = press('wave', wb);
  if (w.fired) { waveIdx = (waveIdx + 1) % WAVES.length; A.synth.set({ oscillator: WAVES[waveIdx].set }); }
  tile(wb, WAVES[waveIdx].label, { col, p: w.p, hot: w.hot, sub: 'WAVE' });
  const ar = press('arp', ab);
  if (ar.fired) { arpOn = !arpOn; releaseChord(); arpIdx = 0; attackHeld(); }
  tile(ab, 'ARP', { col, on: arpOn, p: ar.p, hot: ar.hot });
  const bs = press('bass', bb);
  if (bs.fired) {
    bassOn = !bassOn;
    if (!bassOn) { try { A.bass.triggerRelease(); } catch (e) { /* noop */ } }
    else if (heldChord >= 0) A.bass.triggerAttack(midiHz(chordAt(heldChord).notes[0] - 24));
  }
  tile(bb, 'BASS', { col, on: bassOn, p: bs.p, hot: bs.hot });
}

function deckVoice(q) {
  const f = frame(q), col = q.col;
  text('VOICE', f.tx, f.ty, 15, rgba(col, 0.85), 'left', 'top', 'Press Start 2P');
  if (V.on) text('🎧 use headphones', f.tx + f.body.w, f.ty + 2, 17, rgba(col, 0.45), 'right', 'top');

  const tuneH = Math.min(38, f.body.h * 0.3), gapT = 9;
  const scopeH = f.body.h - tuneH - gapT;
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
    text(V.on ? 'listening…' : 'MIC OFF', scope.x + scope.w / 2, scope.y + scope.h / 2,
      Math.min(30, scope.h * 0.34), rgba(col, 0.35), 'center', 'middle');
  }
  if (V.recPhase === 'countin' || V.recPhase === 'rec') {
    const msg = V.recPhase === 'countin' ? 'REC IN ' + (4 - Math.floor(playStep / 2)) : '● REC';
    text(msg, scope.x + 10, scope.y + 12, 22, rgba(V.recPhase === 'rec' ? [255, 90, 90] : col, 0.95), 'left', 'top');
  }
  // level
  ctx.fillStyle = rgba(col, 0.5);
  ctx.fillRect(scope.x + 8, scope.y + scope.h - 7, (scope.w - 16) * Math.min(1, V.level * 6), 3);

  const tuneR = { x: f.body.x, y: scope.y + scopeH + gapT, w: f.body.w, h: tuneH };
  const g = grab('tune', tuneR);
  if (g) {
    V.tune = clamp01((g.x - tuneR.x) / tuneR.w);
    if (V.on) V.mixer.fade.value = V.tune > 0.05 ? 1 : 0;
  }
  slider(tuneR, V.tune, col, 'TUNE ' + (V.tune < 0.05 ? 'off' : Math.round(V.tune * 100) + '%'));

  const [mb, rb, lb, cb] = row(f.foot, 4);
  const m = press('mic', mb);
  if (m.fired) toggleMic();
  tile(mb, 'MIC', { col, on: V.on, p: m.p, hot: m.hot });
  const rc = press('rec', rb);
  if (rc.fired) {
    if (!V.on) toast('switch the mic on first');
    else if (V.recPhase === 'idle') { V.recPhase = 'armed'; toast('recording starts on the next bar'); }
    else { V.recPhase = 'idle'; V.collect = false; }
  }
  tile(rb, V.recPhase === 'idle' ? 'REC' : V.recPhase === 'rec' ? '●' : '…',
    { col: V.recPhase === 'rec' ? [255, 90, 90] : col, on: V.recPhase !== 'idle', p: rc.p, hot: rc.hot });
  const lp = press('loop', lb);
  if (lp.fired) setLoop(!V.loopOn);
  tile(lb, 'LOOP', { col, on: V.loopOn, p: lp.p, hot: lp.hot });
  const cl = press('vclr', cb);
  if (cl.fired) clearLoop();
  tile(cb, 'CLR', { col, p: cl.p, hot: cl.hot });
}

function deckDj(q) {
  const f = frame(q), col = q.col;
  text('DJ', f.tx, f.ty, 15, rgba(col, 0.85), 'left', 'top', 'Press Start 2P');

  const xfH = 30, gap = 9;
  const pad = { x: f.body.x, y: f.body.y, w: f.body.w, h: f.body.h - xfH - gap };
  const g = grab('xy', pad);
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
  const gx = grab('xfade', xf);
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
  const sHot = !!grab('stut', sb, 0.12);
  if (sHot !== stutter) setStutter(sHot);
  tile(sb, 'STUTTER', { col, on: stutter, hot: sHot });
  const dp = press('drop', db);
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
  deckDrums(qs[0]); deckSynth(qs[1]); deckVoice(qs[2]); deckDj(qs[3]);

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

  for (const c of cursors) {
    if (!c.hand) continue;
    ctx.strokeStyle = rgba(COL.ink, c.slow ? 0.95 : 0.4);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.slow ? 12 : 17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(COL.ink, 0.9);
    ctx.beginPath(); ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- ui wiring -----------------------------------------------------------
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// tear the whole chain down rather than just closing the stream — otherwise
// switching the mic back on would build a second one alongside the first
function closeMic() {
  V.on = false; V.buf = null; V.f0 = -1; V.snapped = null;
  V.recPhase = 'idle'; V.collect = false; V.chunks = []; V.times = [];
  if (V.tap) { V.tap.onaudioprocess = null; try { V.tap.disconnect(); } catch (e) { /* noop */ } }
  if (V.sink) { try { V.sink.disconnect(); } catch (e) { /* noop */ } }
  try { V.mic.close(); } catch (e) { /* noop */ }
  for (const n of ['mic', 'hp', 'comp', 'shift', 'mixer', 'gain', 'wave']) {
    if (V[n]) { try { V[n].dispose(); } catch (e) { /* noop */ } V[n] = null; }
  }
  V.tap = null; V.sink = null;
}

async function toggleMic() {
  if (V.on) { closeMic(); toast('mic off'); return; }
  try {
    await openMic();
    toast('mic on — headphones recommended');
  } catch (e) {
    closeMic();                       // don't leave a half-built chain behind
    toast('mic blocked: ' + (e && e.name ? e.name : e));
  }
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
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
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
    await Tone.start();
    try { await document.fonts.ready; } catch (e) { /* canvas will fall back to monospace */ }
    Tone.Transport.bpm.value = 124;      // before the graph, so '8n' delay resolves at this tempo
    await buildAudio();
    loadPreset(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = stream;
      await video.play();
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      const opts = { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, numHands: 2, runningMode: 'VIDEO' };
      try { landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
      catch (e) { opts.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
      camOk = true;
    } catch (e) {
      camOk = false;      // no camera is survivable — the whole booth works with a mouse
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
