// Hand Block — MediaPipe HandLandmarker + canvas 2D.
// First-person: balls fly OUT of the screen toward you and you physically throw
// your hand up to block them where they land. Your whole hand is the blocker —
// an open palm covers more, so spreading your fingers helps. Miss three and the
// rally is over. Fully vendored (no CDN); all client-side.
//
// A ball is a point travelling in fake depth: it starts small at the horizon and
// grows as it approaches, arriving at a target spot on the near plane. Its screen
// position is tracked to your smoothed, mirrored hand each frame — when your hand
// disk overlaps the ball as it gets close, you've blocked it and it rockets back.

import { FilesetResolver, HandLandmarker }
  from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/hand_landmarker.task';
const WASM = '/vendor/mediapipe/wasm';

// palm ring (wrist + the four finger knuckles) → a steady hand centre
const PALM_PTS = [0, 5, 9, 13, 17];
const MID_TIP = 12;
const SMOOTH = 0.55;          // hand lerp (fast, low latency)
const LIVES = 3;
const CYAN = '#38f9d7', ORANGE = '#ff9f1c', WHITE = '#eaf6ff', RED = '#ff5470';

// ---- dom / boot -----------------------------------------------------------
const gate = document.getElementById('gate');
const startBtn = document.getElementById('start');
const note = document.getElementById('note');
const video = document.getElementById('cam');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let landmarker = null;
let audioCtx = null;
let lastVideoTime = -1;

startBtn.addEventListener('click', boot);

async function boot() {
  startBtn.disabled = true;
  gate.classList.add('loading');
  note.textContent = 'setting up… this may take a few seconds';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const opts = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO', numHands: 1,
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    } catch (e) {
      opts.baseOptions.delegate = 'CPU';    // some devices (iOS) lack the GPU path
      landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    document.fonts.load('16px "Press Start 2P"').catch(() => {});
    gate.remove();
    document.body.classList.add('go');
    resize();
    reset();
    requestAnimationFrame(loop);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'camera failed: ' + err.message + ' — allow camera and retry';
  }
}

// ---- tiny synth (no library) ----------------------------------------------
let soundOn = true;
function beep(f0, f1, dur, type = 'square', vol = 0.12) {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// ---- hand state ------------------------------------------------------------
// hand = { x, y (palm centre, normalized, mirrored), dx, dy (palm→mid-tip) }
let hand = null;
let handSeenAt = -1e9;
let lmRaw = null;

function detect(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  try { res = landmarker.detectForVideo(video, now); } catch (e) { return; }
  const lm = res.landmarks && res.landmarks[0];
  if (!lm) { lmRaw = null; return; }
  lmRaw = lm;

  let cx = 0, cy = 0;
  for (const i of PALM_PTS) { cx += 1 - lm[i].x; cy += lm[i].y; }   // mirror x
  cx /= PALM_PTS.length; cy /= PALM_PTS.length;
  const tx = 1 - lm[MID_TIP].x, ty = lm[MID_TIP].y;
  const ndx = tx - cx, ndy = ty - cy;                              // palm→fingertip
  if (!hand) hand = { x: cx, y: cy, dx: ndx, dy: ndy };
  else {
    hand.x += (cx - hand.x) * SMOOTH;
    hand.y += (cy - hand.y) * SMOOTH;
    hand.dx += (ndx - hand.dx) * SMOOTH;
    hand.dy += (ndy - hand.dy) * SMOOTH;
  }
  handSeenAt = now;
}

// hand centre + block radius in canvas px (exact hand length, aspect-correct)
function handDisk() {
  if (!hand) return null;
  const w = W(), h = H();
  const hx = hand.x * w, hy = hand.y * h;
  const len = Math.hypot(hand.dx * w, hand.dy * h);   // wrist→fingertip in px
  return { x: hx, y: hy, r: Math.max(38, len * 1.15 * blockMult) };
}

// ---- game state ------------------------------------------------------------
const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
const horizon = () => ({ x: W() / 2, y: H() * 0.42 });   // vanishing point

let speed = 3;         // 1..5, from SPEED slider
let blockMult = 1;     // 0.8..1.6, from BLOCK SIZE slider
let camOn = true;

let balls = [];
let bursts = [];
let score = 0, best = +(localStorage.getItem('hs-block-hi') || 0);
let combo = 0, lives = LIVES;
let state = 'play';    // play | over
let spawnT = 0, nextSpawn = 0.8;
let shake = 0, flash = 0, overSince = 0;

function reset() {
  balls = []; bursts = [];
  score = 0; combo = 0; lives = LIVES; state = 'play';
  spawnT = 0; nextSpawn = 0.8; shake = 0; flash = 0; overSince = 0;
}

// difficulty curve: travel time (telegraph) + spawn gap shrink with speed+score
function travelTime() { return Math.max(0.85, 1.95 - speed * 0.18 - Math.min(0.5, score * 0.006)); }
function spawnGap() { return Math.max(0.55, 1.7 - speed * 0.16 - Math.min(0.6, score * 0.008)); }

function spawnBall() {
  const hz = horizon();
  balls.push({
    // land somewhere in the reachable frame, biased away from the very edges
    tx: (0.14 + Math.random() * 0.72) * W(),
    ty: (0.16 + Math.random() * 0.66) * H(),
    sx: hz.x + (Math.random() * 2 - 1) * W() * 0.06,   // emerges near the horizon
    sy: hz.y + (Math.random() * 2 - 1) * H() * 0.04,
    p: 0, life: travelTime(), done: false,
    hue: 190 + Math.random() * 40,   // cyan-ish incoming
  });
  beep(300, 520, 0.08, 'sine', 0.05);   // "incoming" whoosh
}

// where a ball is on screen + how big, for a given progress p (0 far → 1 near)
function ballPos(b) {
  const e = b.p * b.p;                 // accelerate toward you
  return {
    x: b.sx + (b.tx - b.sx) * e,
    y: b.sy + (b.ty - b.sy) * e,
    r: 5 + Math.min(W(), H()) * 0.055 * (b.p * b.p * b.p),
  };
}

// ---- main loop -------------------------------------------------------------
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.033);
  lastT = now;
  detect(now);
  update(now, dt);
  draw(now);
}

function update(now, dt) {
  shake *= 0.86; flash *= 0.9;
  for (const bu of bursts) { bu.r += bu.vr * dt; bu.life -= dt; }
  bursts = bursts.filter((b) => b.life > 0);

  if (state === 'over') {
    // raise a steady hand (or space/click) to play again
    if (hand && now - handSeenAt < 300 && hand.y < 0.6) {
      if (!overSince) overSince = now;
      if (now - overSince > 700) reset();
    } else overSince = 0;
    return;
  }

  // spawn
  spawnT += dt;
  if (spawnT >= nextSpawn && balls.length < 5) {
    spawnT = 0; nextSpawn = spawnGap();
    spawnBall();
  }

  const disk = handDisk();
  for (const b of balls) {
    if (b.done) continue;
    b.p += dt / b.life;
    const pos = ballPos(b);
    // blockable once it's close enough to reach; overlap with the hand disk = block
    if (disk && b.p > 0.72) {
      const d = Math.hypot(disk.x - pos.x, disk.y - pos.y);
      if (d < disk.r + pos.r) { blockBall(b, pos, disk); continue; }
    }
    if (b.p >= 1) missBall(b, pos);
  }
  balls = balls.filter((b) => !b.done);
}

function blockBall(b, pos, disk) {
  b.done = true;
  score++; combo++;
  if (combo > 0 && combo % 5 === 0) { score += 2; beep(1046, 1568, 0.12, 'sine', 0.08); }
  best = Math.max(best, score); localStorage.setItem('hs-block-hi', best);
  bursts.push({ x: pos.x, y: pos.y, r: pos.r, vr: 900, life: 0.35, color: ORANGE });
  // little knock toward the hand centre for a "smacked away" read
  beep(520, 900, 0.06, 'square', 0.11);
}

function missBall(b, pos) {
  b.done = true;
  combo = 0;
  lives--;
  shake = 16; flash = 1;
  bursts.push({ x: pos.x, y: pos.y, r: pos.r, vr: 500, life: 0.4, color: RED });
  beep(240, 70, 0.3, 'sawtooth', 0.14);
  if (lives <= 0) { state = 'over'; beep(200, 55, 0.5, 'sawtooth', 0.16); }
}

// ---- drawing ---------------------------------------------------------------
let scanPat = null;
function scanlines() {
  if (!scanPat) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, 2, 4, 1);
    scanPat = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = scanPat;
  ctx.fillRect(0, 0, W(), H());
}

function draw(now) {
  const w = W(), h = H();
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);

  // dim mirrored webcam
  ctx.fillStyle = '#05070d';
  ctx.fillRect(-20, -20, w + 40, h + 40);
  if (camOn && video.videoWidth) {
    const vr = video.videoWidth / video.videoHeight, cr = w / h;
    let dw = w, dh = h;
    if (vr > cr) dw = h * vr; else dh = w / vr;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  drawDepthGrid(w, h);

  // reticles first (behind balls) so the target reads clearly
  for (const b of balls) if (!b.done) drawReticle(b);
  for (const b of balls) if (!b.done) drawBall(b);
  for (const bu of bursts) drawBurst(bu);

  drawHand();
  drawHud();

  if (flash > 0.02) {
    ctx.fillStyle = `rgba(255,84,112,${flash * 0.4})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // overlays (unshaken)
  if (!hand || now - handSeenAt > 600) banner('SHOW YOUR HAND', ORANGE, h * 0.5, 20);
  if (state === 'over') {
    banner('GAME OVER', RED, h * 0.36, 32);
    banner('SCORE ' + score + '   BEST ' + best, WHITE, h * 0.47, 14);
    banner('raise your hand to play again', WHITE, h * 0.56, 12);
  }
  scanlines();
}

function drawDepthGrid(w, h) {
  const hz = horizon();
  ctx.strokeStyle = 'rgba(56,249,215,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) {        // radial lines from the vanishing point
    const ex = w / 2 + i * (w / 8);
    ctx.moveTo(hz.x, hz.y); ctx.lineTo(ex, h + 40);
  }
  for (let i = 1; i <= 5; i++) {         // horizon-parallel rows, denser near you
    const y = hz.y + (h - hz.y) * (i / 5) * (i / 5);
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawReticle(b) {
  const pos = ballPos(b);
  const a = 0.25 + b.p * 0.5;
  ctx.strokeStyle = `rgba(255,159,28,${a})`;
  ctx.lineWidth = 2;
  const rr = pos.r + 14 + (1 - b.p) * 30;
  ctx.beginPath(); ctx.arc(b.tx, b.ty, rr, 0, 7); ctx.stroke();
  // crosshair ticks
  ctx.beginPath();
  for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.moveTo(b.tx + Math.cos(ang) * (rr - 6), b.ty + Math.sin(ang) * (rr - 6));
    ctx.lineTo(b.tx + Math.cos(ang) * (rr + 6), b.ty + Math.sin(ang) * (rr + 6));
  }
  ctx.stroke();
}

function drawBall(b) {
  const pos = ballPos(b);
  // trail toward the horizon so it clearly reads as flying at you
  const hz = horizon();
  const g = ctx.createLinearGradient(hz.x, hz.y, pos.x, pos.y);
  g.addColorStop(0, 'rgba(56,249,215,0)');
  g.addColorStop(1, `hsla(${b.hue},90%,65%,0.35)`);
  ctx.strokeStyle = g; ctx.lineWidth = pos.r * 0.7;
  ctx.beginPath(); ctx.moveTo(hz.x, hz.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();

  ctx.fillStyle = `hsl(${b.hue},90%,68%)`;
  ctx.shadowColor = `hsl(${b.hue},90%,68%)`; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, pos.r, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';   // highlight
  ctx.beginPath(); ctx.arc(pos.x - pos.r * 0.3, pos.y - pos.r * 0.3, pos.r * 0.3, 0, 7); ctx.fill();
}

function drawBurst(bu) {
  ctx.globalAlpha = Math.max(0, bu.life * 2.2);
  ctx.strokeStyle = bu.color; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(bu.x, bu.y, bu.r, 0, 7); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHand() {
  const disk = handDisk();
  if (!disk || !lmRaw) return;
  const w = W(), h = H();
  // block disk — the area you cover
  const near = balls.some((b) => !b.done && b.p > 0.72);
  ctx.fillStyle = near ? 'rgba(56,249,215,0.18)' : 'rgba(56,249,215,0.09)';
  ctx.strokeStyle = 'rgba(56,249,215,0.7)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(disk.x, disk.y, disk.r, 0, 7); ctx.fill(); ctx.stroke();
  // skeleton so you see your hand
  const E = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],
    [10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.strokeStyle = CYAN; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, c] of E) {
    ctx.moveTo((1 - lmRaw[a].x) * w, lmRaw[a].y * h);
    ctx.lineTo((1 - lmRaw[c].x) * w, lmRaw[c].y * h);
  }
  ctx.stroke();
}

function drawHud() {
  const w = W();
  ctx.save();
  ctx.font = '20px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000'; ctx.fillText(String(score).padStart(4, '0'), 18, 40);
  ctx.fillStyle = CYAN; ctx.fillText(String(score).padStart(4, '0'), 16, 38);
  if (combo >= 2) {
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = ORANGE; ctx.fillText('x' + combo, 18, 66);
  }
  // lives as hearts, top-right
  for (let i = 0; i < LIVES; i++) {
    ctx.fillStyle = i < lives ? RED : 'rgba(255,255,255,0.15)';
    heart(w - 30 - i * 34, 30, 11);
  }
  ctx.restore();
}

function heart(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.25);
  ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s, x, y + s * 1.1);
  ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.7, x + s, y + s * 0.25);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.fill();
}

function banner(text, color, y, size) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, W() / 2 + 2, y + 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.fillText(text, W() / 2, y);
  ctx.restore();
}

// ---- ui --------------------------------------------------------------------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scanPat = null;
}
addEventListener('resize', resize);

const spdEl = document.getElementById('speed'), vSpd = document.getElementById('v-speed');
spdEl.value = speed; vSpd.textContent = speed;
spdEl.addEventListener('input', () => { speed = +spdEl.value; vSpd.textContent = speed; });

const bmEl = document.getElementById('block'), vBm = document.getElementById('v-block');
bmEl.value = blockMult * 100; vBm.textContent = Math.round(blockMult * 100) + '%';
bmEl.addEventListener('input', () => { blockMult = +bmEl.value / 100; vBm.textContent = bmEl.value + '%'; });

function wireToggle(id, label, get, set) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    set(!get());
    el.classList.toggle('on', get());
    el.textContent = `${label}: ${get() ? 'ON' : 'OFF'}`;
  });
  return el;
}
wireToggle('cam-tog', 'CAMERA', () => camOn, (v) => { camOn = v; });
wireToggle('sound', 'SOUND', () => soundOn, (v) => { soundOn = v; });

addEventListener('keydown', (e) => { if (e.code === 'Space' && state === 'over') reset(); });
addEventListener('pointerdown', (e) => { if (state === 'over' && e.target === canvas) reset(); });
