// Hand Beats — a hand-tracked step sequencer. Project #3 of the series.
// (Modeled on the wxll.hx "interactive drum pad" reel.)
//   - webcam behind a grid: 4 rows (clap / snare / hihat / kick) x 16 sixteenths
//   - Tone.js Transport sweeps a playhead on a fixed tempo + metronome
//   - aim your fingertip at a cell and DWELL ~0.45s to toggle it on/off
//   - pick a drum machine (KIT); toggled cells loop every bar
// Everything runs client-side. CDN deps for now (vendor before any public deploy).

import { FilesetResolver, HandLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/' +
  'hand_landmarker/float16/1/hand_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');
const video = document.getElementById('cam');

const STEPS = 16, ROWS = 4, GROUP = 4;   // 16 sixteenths, grouped in 4s
const ROW_META = [
  { name: 'clap',  col: [255, 196, 92] },
  { name: 'snare', col: [120, 220, 255] },
  { name: 'hihat', col: [170, 255, 150] },
  { name: 'kick',  col: [255, 95, 162] },
];
const pattern = Array.from({ length: ROWS }, () => Array(STEPS).fill(false));

let landmarker = null, tips = [], lastVideoTime = -1;
let kit = null, metro = null;
let step = 0, playStep = 0, metroOn = true;

// ---- drum machines (synthesized — zero load latency) --------------------
function buildKit(s) {
  const nodes = [], reg = (n) => { nodes.push(n); return n; };
  const kick = reg(new Tone.MembraneSynth(s.kick)).toDestination(); kick.volume.value = s.kickVol;
  const snare = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.snareDecay, sustain: 0 } })).toDestination(); snare.volume.value = s.snareVol;
  const hp = reg(new Tone.Filter(s.hatFreq, 'highpass')).toDestination();
  const hat = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.hatDecay, sustain: 0 } })).connect(hp); hat.volume.value = s.hatVol;
  const bp = reg(new Tone.Filter(s.clapFreq, 'bandpass')); bp.Q.value = 1.2; bp.toDestination();
  const clap = reg(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: s.clapDecay, sustain: 0 } })).connect(bp); clap.volume.value = s.clapVol;
  return {
    trigger(r, t) {
      if (r === 3) kick.triggerAttackRelease(s.kickNote, s.kickDur, t);
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
    clapFreq: 1200, clapDecay: 0.13, clapVol: -8 }),
  '909': () => buildKit({
    kick: { pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.4 } },
    kickNote: 'C1', kickDur: '4n', kickVol: 3,
    snareDecay: 0.18, snareDur: '8n', snareVol: -8,
    hatFreq: 9000, hatDecay: 0.05, hatVol: -14,
    clapFreq: 1500, clapDecay: 0.12, clapVol: -7 }),
  'acoustic': () => buildKit({
    kick: { pitchDecay: 0.02, octaves: 4, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 } },
    kickNote: 'C1', kickDur: '8n', kickVol: 2,
    snareDecay: 0.15, snareDur: '16n', snareVol: -7,
    hatFreq: 7000, hatDecay: 0.03, hatVol: -13,
    clapFreq: 1800, clapDecay: 0.1, clapVol: -9 }),
};
function loadKit(name) { if (kit && kit.dispose) kit.dispose(); kit = KITS[name](); }

startBtn.addEventListener('click', start);

async function start() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  note.textContent = 'setting up… this may take a few seconds';
  try {
    await Tone.start();
    metro = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 } }).toDestination();
    metro.volume.value = -20;
    loadKit('808');

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const opts = { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, numHands: 2, runningMode: 'VIDEO' };
    try { landmarker = await HandLandmarker.createFromOptions(fileset, opts); }
    catch (e) { opts.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(fileset, opts); }

    Tone.Transport.scheduleRepeat((time) => {
      const s = step;
      for (let r = 0; r < ROWS; r++) if (pattern[r][s]) kit.trigger(r, time);
      if (metroOn && s % GROUP === 0) metro.triggerAttackRelease(s === 0 ? 'C6' : 'G5', '32n', time, 0.5);
      Tone.Draw.schedule(() => { playStep = s; }, time);
      step = (step + 1) % STEPS;
    }, '16n');
    Tone.Transport.start();

    document.body.classList.add('go');
    gate.remove();
    new p5(sketch);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'setup failed: ' + (err && err.message ? err.message : err) +
      ' — allow camera + audio and retry';
  }
}

function detect() {
  if (!landmarker || !video.videoWidth) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  try {
    const res = landmarker.detectForVideo(video, performance.now());
    tips = (res.landmarks || []).map((lm) => ({ x: lm[8].x, y: lm[8].y }));
  } catch (e) { /* skip a bad frame */ }
}

// ---- p5 sketch -----------------------------------------------------------
const sketch = (p) => {
  let hoverCell = null, dwell = 0, locked = false;
  const DWELL = 0.45;

  const grid = () => {
    const pad = p.width * 0.06;
    const top = p.height * 0.16, gh = p.height * 0.64, gw = p.width - 2 * pad;
    const nGap = STEPS / GROUP - 1, gap = gw * 0.02;
    const cw = (gw - gap * nGap) / STEPS, ch = gh / ROWS;
    const cellX = (s) => pad + s * cw + Math.floor(s / GROUP) * gap + cw / 2;
    const cellY = (r) => top + ch * (r + 0.5);
    return { pad, top, gh, gw, cw, ch, cellX, cellY };
  };
  const cover = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(p.width / vw, p.height / vh);
    return { s, dw: vw * s, dh: vh * s, ox: (p.width - vw * s) / 2, oy: (p.height - vh * s) / 2 };
  };
  const tipToScreen = (t, c) => ({ x: p.width - (c.ox + t.x * c.dw), y: c.oy + t.y * c.dh });

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);

    const bind = (id, get, set, fmt) => {
      const el = document.getElementById(id), out = document.getElementById('v-' + id);
      el.value = get();
      const upd = () => { set(parseFloat(el.value)); if (out) out.textContent = fmt(parseFloat(el.value)); };
      el.addEventListener('input', upd); upd();
    };
    bind('bpm', () => Tone.Transport.bpm.value, (v) => Tone.Transport.bpm.value = v, (v) => v.toFixed(0));
    bind('vol', () => Tone.getDestination().volume.value, (v) => Tone.getDestination().volume.value = v, (v) => v.toFixed(0));
    document.querySelectorAll('#kit button').forEach((b) => b.addEventListener('click', () => {
      loadKit(b.dataset.k);
      document.querySelectorAll('#kit button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    }));
    document.getElementById('metro').addEventListener('click', (e) => {
      metroOn = !metroOn;
      e.target.classList.toggle('on', metroOn);
      e.target.textContent = 'METRONOME: ' + (metroOn ? 'ON' : 'OFF');
    });
    document.getElementById('clear').addEventListener('click', () => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < STEPS; c++) pattern[r][c] = false;
    });
  };
  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    detect();
    const ctx = p.drawingContext;
    p.background(7, 6, 15);

    if (video.videoWidth) {
      const c = cover();
      ctx.save(); ctx.translate(p.width, 0); ctx.scale(-1, 1);
      ctx.filter = 'grayscale(1) contrast(1.08) brightness(0.95)';   // B&W / DnB feel
      ctx.drawImage(video, c.ox, c.oy, c.dw, c.dh); ctx.restore();
      p.noStroke(); p.fill(8, 8, 10, 165); p.rect(0, 0, p.width, p.height);
    }

    const g = grid();
    const c = video.videoWidth ? cover() : null;
    const fingers = c ? tips.map((t) => tipToScreen(t, c)) : [];

    // nearest-cell targeting with a dead-zone (must aim near a dot's center)
    const hitR = Math.min(g.cw, g.ch) * 0.5;
    let over = null, best = Infinity;
    for (const f of fingers) {
      for (let r = 0; r < ROWS; r++) for (let s = 0; s < STEPS; s++) {
        const d = p.dist(f.x, f.y, g.cellX(s), g.cellY(r));
        if (d < hitR && d < best) { best = d; over = { r, c: s }; }
      }
    }

    // dwell-to-toggle
    const key = over ? over.r + '-' + over.c : null;
    const hkey = hoverCell ? hoverCell.r + '-' + hoverCell.c : null;
    if (key && key === hkey) {
      if (!locked) {
        dwell += p.deltaTime / 1000;
        if (dwell >= DWELL) { pattern[over.r][over.c] = !pattern[over.r][over.c]; locked = true; }
      }
    } else { hoverCell = over; dwell = 0; locked = false; }

    drawGrid(p, g, over, dwell / DWELL);

    for (const f of fingers) {
      p.noFill(); p.stroke(255, 255, 255, 235); p.strokeWeight(2.5); p.circle(f.x, f.y, 22);
      p.noStroke(); p.fill(255, 255, 255, 215); p.circle(f.x, f.y, 5);
    }

    p.noStroke(); p.fill(235, 235, 235, 175);
    p.textFont('VT323'); p.textSize(22); p.textAlign(p.LEFT, p.BOTTOM);
    p.text('aim at a cell and hold to toggle it', 18, p.height - 16);
  };

  const drawGrid = (p, g, over, prog) => {
    const ctx = p.drawingContext;
    const tw = g.cw * 0.9, th = g.ch * 0.82;        // tile size within each cell
    const round = Math.min(tw, th) * 0.16;
    p.rectMode(p.CENTER);

    // playhead column wash (monochrome)
    p.noStroke(); p.fill(255, 255, 255, 24);
    p.rect(g.cellX(playStep), g.top + g.gh / 2, g.cw, g.gh);

    p.textFont('VT323'); p.textAlign(p.LEFT, p.TOP); p.textSize(Math.min(20, g.ch * 0.32));
    for (let r = 0; r < ROWS; r++) {
      p.rectMode(p.CORNER);
      p.noStroke(); p.fill(235, 235, 235, 150);
      p.text(ROW_META[r].name, g.pad + 2, g.top + g.ch * r + 3);
      p.rectMode(p.CENTER);
      for (let s = 0; s < STEPS; s++) {
        const cx = g.cellX(s), cy = g.cellY(r);
        const onBeat = s % GROUP === 0;
        const isHead = s === playStep;
        if (pattern[r][s]) {
          // lit glass tile — brighter, with a glow, on the playhead
          if (isHead) { ctx.save(); ctx.shadowColor = 'rgba(255,255,255,0.85)'; ctx.shadowBlur = 24; }
          p.noStroke(); p.fill(255, 255, 255, isHead ? 240 : 168);
          p.rect(cx, cy, tw, th, round);
          if (isHead) ctx.restore();
          // thin inner edge so a lit tile still reads as a tile, not a blob
          p.noFill(); p.stroke(0, 0, 0, 70); p.strokeWeight(1);
          p.rect(cx, cy, tw - 3, th - 3, round);
        } else {
          // empty glass tile: faint fill + outline (stronger on the beat)
          p.noStroke(); p.fill(255, 255, 255, isHead ? 16 : 7);
          p.rect(cx, cy, tw, th, round);
          p.noFill(); p.stroke(255, 255, 255, onBeat ? 95 : 40);
          p.strokeWeight(onBeat ? 1.6 : 1);
          p.rect(cx, cy, tw, th, round);
        }
      }
    }

    // dwell-to-toggle: outline the targeted tile + fill it bottom-up
    if (over && prog > 0.02) {
      const cx = g.cellX(over.c), cy = g.cellY(over.r);
      const fh = th * Math.min(1, prog);
      p.noStroke(); p.fill(255, 255, 255, 70);
      p.rect(cx, cy + th / 2 - fh / 2, tw, fh, round);
      p.noFill(); p.stroke(255, 255, 255, 235); p.strokeWeight(2.5);
      p.rect(cx, cy, tw, th, round);
    }
    p.rectMode(p.CORNER);
  };
};
