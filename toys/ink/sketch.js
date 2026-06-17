// Watercolour — paint with sound. Project #2 of the creative-coding series.
// Mic in (play a song near the laptop) -> Web Audio AnalyserNode -> vivid
// watercolour that mixes like real pigment:
//   bass beats -> big colour blooms     mids -> medium blooms
//   highs -> colour spray               (overlaps blend via MULTIPLY)
// No webcam — audio only. CDN deps for now (vendor before any public deploy).

const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');

// native Web Audio (no p5.sound — avoids its AudioWorklet load race)
let audioCtx = null, analyser = null, freqData = null, timeData = null, inputGain = null;
const PARAMS = { sensitivity: 1.4 };
const TAU = Math.PI * 2;

function bandEnergy(lo, hi) {
  if (!analyser) return 0;
  const nyq = audioCtx.sampleRate / 2, n = freqData.length;
  const i0 = Math.max(0, Math.floor((lo / nyq) * n));
  const i1 = Math.min(n - 1, Math.ceil((hi / nyq) * n));
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += freqData[i];
  return sum / Math.max(1, i1 - i0 + 1);
}
function rmsLevel() {
  if (!analyser) return 0;
  let s = 0;
  for (let i = 0; i < timeData.length; i++) { const x = (timeData[i] - 128) / 128; s += x * x; }
  return Math.sqrt(s / timeData.length);
}

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
    inputGain.gain.value = 6;          // boost a quiet mic (tunable via INPUT slider)
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -20;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    src.connect(inputGain).connect(analyser);   // not connected to destination -> no echo

    document.body.classList.add('go');
    gate.remove();
    new p5(sketch);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'mic failed: ' + (err && err.message ? err.message : err) +
      ' — allow the microphone and retry';
  }
}

// ---- generative helpers --------------------------------------------------
function place(p) {
  const g = () => (p.randomGaussian ? p.randomGaussian() : Math.random() * 2 - 1);
  return { x: p.width / 2 + g() * p.width * 0.19, y: p.height / 2 + g() * p.height * 0.19 };
}
function spot(p) { const s = place(p); return [s.x, s.y]; }

function circlePts(x, y, r, n) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, rr = r * (0.82 + Math.random() * 0.36);
    a.push({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr });
  }
  return a;
}
// midpoint-displacement: organic watercolour edges (Tyler-Hobbs technique)
function deform(pts, depth, variance) {
  let cur = pts, v = variance;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      next.push(a);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const disp = (Math.random() * 2 - 1) * len * v;
      next.push({ x: (a.x + b.x) / 2 + nx * disp, y: (a.y + b.y) / 2 + ny * disp });
    }
    cur = next; v *= 0.6;
  }
  return cur;
}
function bloom(g, x, y, r, col, layers, alpha) {
  const base = deform(circlePts(x, y, r, 7), 3, 0.45);
  g.noStroke();
  for (let l = 0; l < layers; l++) {
    const poly = deform(base.map((pt) => ({ x: pt.x, y: pt.y })), 2, 0.26);
    g.fill(col[0], col[1], col[2], alpha);
    g.beginShape();
    for (const pt of poly) g.vertex(pt.x, pt.y);
    g.endShape(g.CLOSE);
  }
}
function spray(g, x, y, spread, count, col) {
  g.noStroke();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, d = Math.pow(Math.random(), 2) * spread;
    g.fill(col[0], col[1], col[2], 45 + Math.random() * 70);
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + Math.random() * 3);
  }
}

// ---- watercolour scene ---------------------------------------------------
function makeWater() {
  let buf, hue = 200, lastMid = 0, lastHigh = 0, dryness = 0.6, palette = 'spectrum';
  const hueFor = () => {
    let b = hue + (Math.random() * 40 - 20);
    if (palette === 'warm') b = 15 + (Math.sin(hue * 0.013) * 0.5 + 0.5) * 70 + (Math.random() * 24 - 12);
    if (palette === 'cool') b = 160 + (Math.sin(hue * 0.013) * 0.5 + 0.5) * 130 + (Math.random() * 24 - 12);
    return (b % 360 + 360) % 360;
  };
  return {
    bg: '#ffffff',
    setup(p) { buf = p.createGraphics(p.width, p.height); buf.colorMode(p.HSB, 360, 100, 100, 255); buf.background(0, 0, 100); },
    clear() { buf.background(0, 0, 100); },
    save(p) { p.saveCanvas(buf, 'watercolour-' + Date.now(), 'png'); },
    controls() {
      return [
        { type: 'slider', label: 'DRYNESS', min: 0, max: 2.5, step: 0.1, value: dryness, set: (v) => dryness = v },
        { type: 'select', label: 'PALETTE', value: palette, set: (v) => palette = v,
          options: [{ label: 'all', value: 'spectrum' }, { label: 'warm', value: 'warm' }, { label: 'cool', value: 'cool' }] },
      ];
    },
    draw(p, a) {
      hue = (hue + 0.3 + a.treble / 255 * 1.6) % 360;
      buf.push(); buf.blendMode(p.MULTIPLY);
      if (a.beat) bloom(buf, ...spot(p), p.map(a.bass, 40, 255, 45, 190, true) * (0.7 + a.sens * 0.2), [hueFor(), 72, 92], 6, 34);
      if (a.mid > 50 && a.now - lastMid > 200 / a.sens) {
        lastMid = a.now; bloom(buf, ...spot(p), p.map(a.mid, 50, 255, 26, 84, true), [hueFor(), 60, 96], 5, 26);
      }
      if (a.treble > 50 && a.now - lastHigh > 120) {
        lastHigh = a.now; spray(buf, ...spot(p), p.map(a.treble, 50, 255, 30, 120, true), Math.floor(p.map(a.treble, 50, 255, 8, 30, true)), [hueFor(), 80, 92]);
      }
      buf.pop();
      const fade = p.map(dryness, 0, 2.5, 0, 12);
      if (fade > 0.1) { buf.push(); buf.blendMode(p.BLEND); buf.noStroke(); buf.fill(0, 0, 100, fade); buf.rect(0, 0, buf.width, buf.height); buf.pop(); }
      p.image(buf, 0, 0, p.width, p.height);
    },
  };
}

function drawHUD(p, lvl) {
  p.colorMode(p.RGB, 255); p.noStroke();
  p.fill(130, 130, 130, 175); p.textFont('VT323'); p.textSize(22); p.textAlign(p.LEFT, p.BOTTOM);
  p.text('♪ listening', 18, p.height - 16);
  p.fill(130, 130, 130, 80); p.rect(120, p.height - 28, 90, 8);
  p.fill(214, 86, 64, 210); p.rect(120, p.height - 28, 90 * Math.min(1, lvl * 6), 8);
}

function buildControls(list) {
  const host = document.getElementById('scene-controls');
  host.innerHTML = '';
  for (const c of list) {
    const w = document.createElement('div'); w.className = 'ctrl';
    if (c.type === 'slider') {
      const round = c.step < 1 ? 1 : 0;
      w.innerHTML = `<div class="row"><span>${c.label}</span><span class="val"></span></div>`;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = c.value;
      const val = w.querySelector('.val'); val.textContent = (+c.value).toFixed(round);
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); c.set(v); val.textContent = v.toFixed(round); });
      w.appendChild(inp);
    } else if (c.type === 'select') {
      w.innerHTML = `<div class="row"><span>${c.label}</span></div>`;
      const opts = document.createElement('div'); opts.className = 'opts';
      for (const o of c.options) {
        const b = document.createElement('button'); b.textContent = o.label;
        if (o.value === c.value) b.classList.add('active');
        b.addEventListener('click', () => {
          c.set(o.value);
          opts.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
        });
        opts.appendChild(b);
      }
      w.appendChild(opts);
    }
    host.appendChild(w);
  }
}

// ---- main ----------------------------------------------------------------
const sketch = (p) => {
  let water, bassAvg = 0, lastBeat = 0;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    water = makeWater(); water.setup(p);
    document.body.style.background = water.bg;
    p.background(255);

    const inEl = document.getElementById('input'), inV = document.getElementById('v-input');
    inEl.value = inputGain ? inputGain.gain.value : 6;
    const updIn = () => { const v = parseFloat(inEl.value); if (inputGain) inputGain.gain.value = v; inV.textContent = v.toFixed(1); };
    inEl.addEventListener('input', updIn); updIn();

    const sensEl = document.getElementById('sens'), sensV = document.getElementById('v-sens');
    sensEl.value = PARAMS.sensitivity;
    const updS = () => { PARAMS.sensitivity = parseFloat(sensEl.value); sensV.textContent = PARAMS.sensitivity.toFixed(1); };
    sensEl.addEventListener('input', updS); updS();

    document.getElementById('save').addEventListener('click', () => water.save(p));
    document.getElementById('clear').addEventListener('click', () => water.clear());
    buildControls(water.controls());
  };

  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    const bass = bandEnergy(20, 140), mid = bandEnergy(300, 1800);
    const treble = bandEnergy(3000, 9000), level = rmsLevel();
    bassAvg += (bass - bassAvg) * 0.05;
    const sens = PARAMS.sensitivity, now = p.millis();
    let beat = false;
    if (bass > bassAvg * (1.32 - sens * 0.14) && bass > 30 && now - lastBeat > 140) { beat = true; lastBeat = now; }
    water.draw(p, { bass, mid, treble, level, beat, now, sens });
    drawHUD(p, level);
  };
};
