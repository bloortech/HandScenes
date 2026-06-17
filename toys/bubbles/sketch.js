// Bubble Machine — p5.js + MediaPipe.
// Project #1 of the creative-coding series: a deliberately simple warm-up to
// learn p5. Bubbles rise from the bottom; your index fingertip (tracked by
// MediaPipe) pops them. The webcam is drawn mirrored behind, so you "reach in".
//
// Everything runs client-side. CDN deps for now (p5, MediaPipe + model) — we'll
// vendor + harden before any public deploy, same as HandScenes.

import { FilesetResolver, HandLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/' +
  'hand_landmarker/float16/1/hand_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');
const video = document.getElementById('cam');

let landmarker = null;
let tips = [];            // [{x,y}] index-fingertips, normalized in video frame
let audioCtx = null;
let lastVideoTime = -1;

startBtn.addEventListener('click', start);

async function start() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  note.textContent = 'setting up… this may take a few seconds';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const opts = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      numHands: 2, runningMode: 'VIDEO',
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    } catch (e) {
      opts.baseOptions.delegate = 'CPU';   // some devices (iOS) lack the GPU path
      landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gate.remove();
    new p5(sketch);                         // start drawing only once tracking is ready
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'camera failed: ' + err.message + ' — allow camera and retry';
  }
}

// short synthetic "pop" so bursting feels good (no audio library needed)
function popSound() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(420 + Math.random() * 320, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.15);
}

function detect() {
  if (!landmarker || !video.videoWidth) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  try {
    const res = landmarker.detectForVideo(video, performance.now());
    tips = (res.landmarks || []).map((lm) => ({ x: lm[8].x, y: lm[8].y }));
  } catch (e) { /* skip a bad frame, keep going */ }
}

// ---- p5 sketch (instance mode) ------------------------------------------
const sketch = (p) => {
  let bubbles = [];
  let drops = [];          // splash particles from a pop
  let popCount = 0;
  let hint = 255;          // fades out the on-screen hint

  const makeBubble = () => ({
    x: p.random(p.width * 0.08, p.width * 0.92),
    y: p.height + p.random(20, 120),
    r: p.random(34, 78),
    rise: p.random(0.6, 1.6),
    drift: p.random(0.4, 1.2),
    phase: p.random(p.TWO_PI),
    hue: p.random(360),
  });

  // "cover" fit of the (mirrored) video into the canvas
  const cover = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(p.width / vw, p.height / vh);
    const dw = vw * s, dh = vh * s;
    return { s, dw, dh, ox: (p.width - dw) / 2, oy: (p.height - dh) / 2, vw, vh };
  };
  const tipToScreen = (t, c) => ({
    x: p.width - (c.ox + t.x * c.dw),     // mirrored
    y: c.oy + t.y * c.dh,
  });

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    for (let i = 0; i < 6; i++) bubbles.push(makeBubble());
  };
  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    detect();
    const ctx = p.drawingContext;

    // --- mirrored webcam background, slightly darkened ---
    p.background(5, 7, 15);
    if (video.videoWidth) {
      const c = cover();
      ctx.save();
      ctx.translate(p.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, c.ox, c.oy, c.dw, c.dh);
      ctx.restore();
      p.noStroke(); p.fill(5, 7, 20, 110); p.rect(0, 0, p.width, p.height);
    }

    const c = video.videoWidth ? cover() : null;
    const fingers = c ? tips.map((t) => tipToScreen(t, c)) : [];

    // --- spawn ---
    if (p.frameCount % 16 === 0 && bubbles.length < 26) bubbles.push(makeBubble());

    // --- bubbles ---
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.phase += 0.03;
      b.y -= b.rise;
      b.x += Math.sin(b.phase) * b.drift;

      // pop if a fingertip is inside
      let popped = false;
      for (const f of fingers) {
        if (p.dist(f.x, f.y, b.x, b.y) < b.r * 0.9) { popped = true; break; }
      }
      if (popped) {
        burst(b);
        bubbles.splice(i, 1);
        popCount++;
        popSound();
        continue;
      }
      if (b.y < -b.r) { bubbles.splice(i, 1); continue; }
      drawBubble(ctx, b);
    }

    // --- splash droplets ---
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.vx; d.y += d.vy; d.vy += 0.18; d.life -= 0.04;
      if (d.life <= 0) { drops.splice(i, 1); continue; }
      p.noStroke();
      p.fill(180, 230, 255, d.life * 230);
      p.circle(d.x, d.y, d.r * d.life);
    }

    // --- fingertip cursors ---
    for (const f of fingers) {
      p.noFill();
      p.stroke(122, 215, 255, 230); p.strokeWeight(3);
      p.circle(f.x, f.y, 26);
      p.noStroke(); p.fill(122, 215, 255, 220);
      p.circle(f.x, f.y, 7);
    }

    // --- HUD ---
    p.noStroke();
    p.textFont('VT323');
    p.fill(122, 215, 255);
    p.textSize(34); p.textAlign(p.LEFT, p.TOP);
    p.text('POPPED  ' + popCount, 20, 16);

    if (hint > 0 && popCount === 0) {
      p.fill(223, 244, 255, hint);
      p.textSize(40); p.textAlign(p.CENTER, p.CENTER);
      p.text('poke the bubbles 🫧', p.width / 2, p.height * 0.86);
    } else if (popCount > 0) {
      hint = Math.max(0, hint - 8);
    }
  };

  const drawBubble = (ctx, b) => {
    const g = ctx.createRadialGradient(
      b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0.0, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.65, `hsla(${b.hue}, 80%, 72%, 0.10)`);
    g.addColorStop(0.86, `hsla(${(b.hue + 60) % 360}, 90%, 76%, 0.30)`);
    g.addColorStop(1.0, 'rgba(255,255,255,0.05)');
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, p.TWO_PI);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(220,245,255,0.45)'; ctx.stroke();
    // specular highlight
    ctx.beginPath();
    ctx.ellipse(b.x - b.r * 0.34, b.y - b.r * 0.38, b.r * 0.16, b.r * 0.1, -0.6, 0, p.TWO_PI);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  };

  const burst = (b) => {
    // expanding ring
    p.push();
    p.noFill(); p.stroke(200, 240, 255, 180); p.strokeWeight(2);
    p.circle(b.x, b.y, b.r * 2);
    p.pop();
    const n = Math.floor(b.r / 6) + 6;
    for (let i = 0; i < n; i++) {
      const a = p.random(p.TWO_PI), sp = p.random(2, 7);
      drops.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: p.random(4, 9), life: 1 });
    }
  };
};
