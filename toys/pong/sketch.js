// Hand Pong — MediaPipe HandLandmarker + canvas 2D.
// Play ping pong against the computer with your bare hand: your palm drives the
// left paddle, the AI defends the right. Move up/down to rally, flick to add
// spin and smash. First to 7. Fully vendored (no CDN); all client-side.
//
// The paddle tracks landmark 9 (middle-finger knuckle) — the steadiest point on
// the hand — smoothed, with its frame-to-frame velocity fed into the ball on a
// hit so a fast swing carries the ball. X is mirrored for a selfie view.

import { FilesetResolver, HandLandmarker }
  from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/hand_landmarker.task';
const WASM = '/vendor/mediapipe/wasm';

const PALM = 9;               // middle-finger MCP: stable hand centre
const SMOOTH = 0.5;           // paddle target lerp (fast, low latency)
const WIN_SCORE = 7;
const YOU = '#ff9f1c', AI = '#38f9d7', WHITE = '#eaf6ff';

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
    serve(Math.random() < 0.5 ? -1 : 1);
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
let hand = null;            // { x, y } smoothed palm, normalized (x mirrored)
let handSeenAt = -1e9;
let lmRaw = null;          // latest raw landmarks for the skeleton overlay

function detect(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  try { res = landmarker.detectForVideo(video, now); } catch (e) { return; }
  const lm = res.landmarks && res.landmarks[0];
  if (!lm) { lmRaw = null; return; }
  lmRaw = lm;
  const px = 1 - lm[PALM].x, py = lm[PALM].y;   // mirror x for selfie view
  if (!hand) hand = { x: px, y: py };
  else { hand.x += (px - hand.x) * SMOOTH; hand.y += (py - hand.y) * SMOOTH; }
  handSeenAt = now;
}

// ---- game state ------------------------------------------------------------
const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
let paddleH = 110;                 // your paddle height (px), from PADDLE slider
let difficulty = 3;                // 1..5 → AI reflex, from DIFFICULTY slider
let camOn = true;

let scoreYou = 0, scoreAI = 0;
let state = 'play';                // play | serve | over
let serveAt = 0, serveDir = 1;
let winner = null;

const PAD_W = 16;
const AI_H = 120;
// paddle rigs (positions/geometry recomputed against live canvas size)
const you = { x: 0, y: 0, py: 0, vy: 0, h: 110 };
const cpu = { x: 0, y: 0, h: 120 };
const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 11, speed: 0 };
const trail = [];

function serve(dir) {
  state = 'serve';
  serveAt = performance.now();
  serveDir = dir;
  ball.x = W() / 2; ball.y = H() / 2;
  ball.speed = W() * 0.55;                    // px/s, grows through a rally
  ball.vx = 0; ball.vy = 0;
  trail.length = 0;
}

function launch() {
  const ang = (Math.random() * 0.6 - 0.3);    // ±0.3 rad off horizontal
  ball.vx = Math.cos(ang) * ball.speed * serveDir;
  ball.vy = Math.sin(ang) * ball.speed;
  state = 'play';
  beep(660, 880, 0.06, 'square', 0.08);
}

function point(who) {
  if (who === 'you') scoreYou++; else scoreAI++;
  beep(who === 'you' ? 880 : 200, who === 'you' ? 1320 : 120, 0.25,
    who === 'you' ? 'sine' : 'sawtooth', 0.14);
  if (scoreYou >= WIN_SCORE || scoreAI >= WIN_SCORE) {
    winner = scoreYou > scoreAI ? 'you' : 'ai';
    state = 'over';
  } else {
    serve(who === 'you' ? -1 : 1);            // loser receives
  }
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
  const w = W(), h = H();

  // your paddle: fixed near the left wall, tracks the hand vertically
  you.h = paddleH;
  you.x = w * 0.07;
  const targetY = hand ? hand.y * h : you.y || h / 2;
  const clampedY = Math.max(you.h / 2, Math.min(h - you.h / 2, targetY));
  you.vy = (clampedY - you.y) / Math.max(dt, 1e-3);
  you.y = clampedY;

  // AI paddle
  cpu.h = AI_H;
  cpu.x = w - w * 0.06;
  const react = 0.06 + difficulty * 0.032;        // fraction of the gap closed per frame
  const err = (6 - difficulty) * h * 0.014;        // aim wobble; lower diff = sloppier
  const aim = ball.y + Math.sin(now * 0.004) * err;
  const aiTarget = Math.max(cpu.h / 2, Math.min(h - cpu.h / 2, aim));
  cpu.y += (aiTarget - cpu.y) * react;

  if (state === 'serve') {
    ball.x = w / 2; ball.y = h / 2;
    if (now - serveAt > 800) launch();
    return;
  }
  if (state !== 'play') return;

  // integrate (remember prev x for the swept paddle test)
  const prevX = ball.x;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  trail.push({ x: ball.x, y: ball.y });
  if (trail.length > 14) trail.shift();

  // top / bottom walls
  if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); beep(300, 300, 0.03, 'square', 0.05); }
  if (ball.y > h - ball.r) { ball.y = h - ball.r; ball.vy = -Math.abs(ball.vy); beep(300, 300, 0.03, 'square', 0.05); }

  // paddle hits (only the one the ball is heading toward)
  if (ball.vx < 0) hitPaddle(you, +1, prevX);
  else hitPaddle(cpu, -1, prevX);

  // scoring
  if (ball.x < -ball.r * 3) point('ai');
  else if (ball.x > w + ball.r * 3) point('you');
}

// reflect the ball off a paddle. dir = +1 sends it right (your paddle, on the
// left), -1 sends it left (the AI, on the right). A swept test catches a fast
// ball that would otherwise skip past the thin paddle in one frame.
function hitPaddle(p, dir, prevX) {
  const halfW = PAD_W / 2, halfH = p.h / 2;
  const plane = p.x + dir * halfW;                 // the paddle face the ball meets
  const lead = ball.x - dir * ball.r;              // ball's leading edge
  const prevLead = prevX - dir * ball.r;
  // did the leading edge reach/cross the paddle face this frame?
  const crossed = dir > 0 ? (prevLead >= plane && lead <= plane)
                          : (prevLead <= plane && lead >= plane);
  const overlapping = Math.abs(ball.x - p.x) <= halfW + ball.r;
  if (!crossed && !overlapping) return;
  if (Math.abs(ball.y - p.y) > halfH + ball.r) return;   // missed vertically → point coming

  ball.speed = Math.min(ball.speed * 1.06, W() * 1.3);   // rally accelerates
  const off = Math.max(-1, Math.min(1, (ball.y - p.y) / halfH));   // -1 top … 1 bottom
  const ang = off * 1.05;                                 // steer by contact point
  ball.vx = dir * Math.cos(ang) * ball.speed;
  ball.vy = Math.sin(ang) * ball.speed;
  if (p === you) ball.vy += you.vy * 0.35;                // swing carries the ball
  ball.x = plane + dir * (ball.r + 1);                    // unstick past the face
  beep(dir > 0 ? 520 : 440, dir > 0 ? 720 : 600, 0.05, 'square', 0.1);
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

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(now) {
  const w = W(), h = H();
  ctx.clearRect(0, 0, w, h);

  // dim webcam behind the court (mirrored to match the selfie view)
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, w, h);
  if (camOn && video.videoWidth) {
    const vr = video.videoWidth / video.videoHeight, cr = w / h;
    let dw = w, dh = h;
    if (vr > cr) dw = h * vr; else dh = w / vr;          // cover-crop
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(w, 0); ctx.scale(-1, 1);       // mirror; a centred image stays centred
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  // centre net
  ctx.strokeStyle = 'rgba(234,246,255,0.25)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 16]);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.setLineDash([]);

  // score
  ctx.font = '30px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = YOU; ctx.fillText(scoreYou, w * 0.4, 52);
  ctx.fillStyle = AI; ctx.fillText(scoreAI, w * 0.6, 52);

  // ball trail + ball
  for (let i = 0; i < trail.length; i++) {
    ctx.globalAlpha = (i / trail.length) * 0.4;
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, ball.r * (i / trail.length), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (state !== 'over') {
    ctx.fillStyle = WHITE;
    ctx.shadowColor = WHITE; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // paddles
  paddle(you, YOU);
  paddle(cpu, AI);

  // hand skeleton hint on your side (only while playing)
  if (lmRaw && camOn) drawHand();

  // overlays
  if (!hand || now - handSeenAt > 600) banner('SHOW YOUR HAND', YOU, h * 0.5, 20);
  else if (state === 'serve') banner('GET READY', WHITE, h * 0.42, 22);
  if (state === 'over') {
    banner(winner === 'you' ? 'YOU WIN!' : 'YOU LOSE', winner === 'you' ? YOU : AI, h * 0.4, 34);
    banner('raise your hand to play again', WHITE, h * 0.5, 13);
    if (hand && now - handSeenAt < 300 && hand.y < 0.55 && hand.y > 0.1) {
      // hand raised & steady → rematch
      if (!overSince) overSince = now;
      if (now - overSince > 700) reset();
    } else overSince = 0;
  }

  scanlines();
}

let overSince = 0;
function reset() {
  scoreYou = 0; scoreAI = 0; winner = null; overSince = 0;
  serve(Math.random() < 0.5 ? -1 : 1);
}

function paddle(p, color) {
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  roundRect(p.x - PAD_W / 2, p.y - p.h / 2, PAD_W, p.h, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHand() {
  const w = W(), h = H();
  const E = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],
    [10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.strokeStyle = 'rgba(255,159,28,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of E) {
    ctx.moveTo((1 - lmRaw[a].x) * w, lmRaw[a].y * h);
    ctx.lineTo((1 - lmRaw[b].x) * w, lmRaw[b].y * h);
  }
  ctx.stroke();
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
  if (!you.y) { you.y = innerHeight / 2; cpu.y = innerHeight / 2; }
}
addEventListener('resize', resize);

const diffEl = document.getElementById('diff'), vDiff = document.getElementById('v-diff');
diffEl.value = difficulty; vDiff.textContent = difficulty;
diffEl.addEventListener('input', () => { difficulty = +diffEl.value; vDiff.textContent = difficulty; });

const sizeEl = document.getElementById('size'), vSize = document.getElementById('v-size');
sizeEl.value = paddleH; vSize.textContent = paddleH;
sizeEl.addEventListener('input', () => { paddleH = +sizeEl.value; vSize.textContent = paddleH; });

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

// space / click also serves through a rematch, for desks without much room
addEventListener('keydown', (e) => { if (e.code === 'Space' && state === 'over') reset(); });
addEventListener('pointerdown', (e) => { if (state === 'over' && e.target === canvas) reset(); });
