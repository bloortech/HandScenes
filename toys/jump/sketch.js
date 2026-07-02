// Jump Runner — MediaPipe Pose + canvas 2D.
// First BODY-tracked toy (the others track hands). Endless runner in the
// chrome-dino spirit, except the runner is YOUR live pose skeleton: physically
// jump in front of the camera to clear obstacles, physically crouch to duck
// under the fliers. Everything runs client-side; fully vendored (no CDN).
//
// Pose→game mapping: HIP-anchored, so only your head-to-hips needs to be in
// frame — you can stand close to a laptop with your legs cropped out. At
// calibration we memorise your standing hip height and torso length
// (normalized video units). The skeleton is drawn with its hips pinned at
// standing height above the ground line; when you jump for real your hips rise
// above that baseline and the whole figure lifts (scaled by JUMP BOOST so a
// polite indoor hop clears a tall cactus). Crouching drops your head below the
// fliers. If your legs ARE visible they're drawn live; if cropped, simple
// swinging cartoon legs are synthesized so the runner never looks amputated.

import { FilesetResolver, PoseLandmarker }
  from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/pose_landmarker_lite.task';
const WASM = '/vendor/mediapipe/wasm';

// landmark ids (BlazePose 33-point topology)
const NOSE = 0,
  L_SHO = 11, R_SHO = 12, L_ELB = 13, R_ELB = 14, L_WRI = 15, R_WRI = 16,
  L_HIP = 23, R_HIP = 24, L_KNE = 25, R_KNE = 26, L_ANK = 27, R_ANK = 28,
  L_TOE = 31, R_TOE = 32;
const CONNS_UP = [
  [L_SHO, R_SHO], [L_SHO, L_ELB], [L_ELB, L_WRI], [R_SHO, R_ELB], [R_ELB, R_WRI],
  [L_SHO, L_HIP], [R_SHO, R_HIP], [L_HIP, R_HIP],
];
const CONNS_LEG = [
  [L_HIP, L_KNE], [L_KNE, L_ANK], [R_HIP, R_KNE], [R_KNE, R_ANK],
  [L_ANK, L_TOE], [R_ANK, R_TOE],
];
const CONNS = [...CONNS_UP, ...CONNS_LEG];       // cam preview draws everything
const CORE = [NOSE, L_SHO, R_SHO, L_HIP, R_HIP]; // all we NEED in frame

const SMOOTH = 0.55;          // lerp toward raw per detection (jumps are fast; keep latency low)
const LOST_MS = 1000;         // pause the run if unseen this long
const STATURE = 3.4;          // full body height ≈ 3.4 × shoulder-to-hip torso length
const HIP_FRAC = 0.53;        // standing hip height as a fraction of stature
// NES-Mario-ish palette
const SKY = '#5c94fc', BRICK = '#c84c0c', BRICK_DK = '#7c2e00', BRICK_LT = '#e8a058';
const PIPE = '#00a800', PIPE_LT = '#58d854', PIPE_DK = '#004000';
const RED = '#e52521', BLUE = '#2038ec', SKIN = '#ffb877', WHITE = '#ffffff', COIN = '#ffd800';
const NEON = '#b6ff3e', PINK = '#ff5fa2';   // cam-preview skeleton overlay only

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
      runningMode: 'VIDEO', numPoses: 1,
    };
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, opts);
    } catch (e) {
      opts.baseOptions.delegate = 'CPU';    // some devices (iOS) lack the GPU path
      landmarker = await PoseLandmarker.createFromOptions(fileset, opts);
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    document.fonts.load('16px "Press Start 2P"').catch(() => {});
    gate.remove();
    document.body.classList.add('go');
    resize();
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

// ---- chiptune background music ----------------------------------------------
// Original 8-bit style loop (square lead + triangle bass + noise hats),
// synthesized live — no audio file. Plays only while the run is on, and the
// tempo creeps up with the level, hurry-up style. NOT the Nintendo theme on
// purpose: that melody is copyrighted; this is our own tune in the same spirit.
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const LEAD = [   // 4 bars of 8ths in G major, 0 = rest (midi numbers)
  79, 0, 74, 79, 81, 83, 81, 79,   76, 79, 0, 76, 74, 0, 71, 74,
  72, 76, 79, 76, 81, 0, 78, 81,   79, 0, 83, 81, 78, 74, 79, 0,
];
const BASS = [   // bouncing root/octave, NES-style
  43, 0, 55, 0, 43, 0, 55, 0,   40, 0, 52, 0, 40, 0, 52, 0,
  48, 0, 60, 0, 50, 0, 62, 0,   43, 0, 55, 0, 50, 0, 43, 0,
];
let musicOn = true;
const music = { playing: false, step: 0, nextTime: 0, timer: null };
let noiseBuf = null;

function scheduleNote(freq, t, dur, type, vol) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function scheduleHat(t) {
  if (!noiseBuf) {
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  const f = audioCtx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7000;
  s.buffer = noiseBuf;
  g.gain.setValueAtTime(0.02, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f).connect(g).connect(audioCtx.destination);
  s.start(t); s.stop(t + 0.05);
}

function musicTick() {
  const bpm = 150 + Math.min(45, level() * 1.5);   // hurry up!
  const stepDur = 60 / bpm / 2;                    // 8th notes
  while (music.nextTime < audioCtx.currentTime + 0.12) {
    const t = music.nextTime, i = music.step;
    if (LEAD[i]) scheduleNote(mf(LEAD[i]), t, stepDur * 0.9, 'square', 0.038);
    if (BASS[i]) scheduleNote(mf(BASS[i]), t, stepDur * 0.95, 'triangle', 0.055);
    if (i % 2 === 1) scheduleHat(t);
    music.step = (music.step + 1) % LEAD.length;
    music.nextTime += stepDur;
  }
}

function startMusic() {
  if (!audioCtx || !musicOn || music.playing) return;
  music.playing = true;
  music.step = 0;
  music.nextTime = audioCtx.currentTime + 0.05;
  music.timer = setInterval(musicTick, 25);
}

function stopMusic() {
  if (!music.playing) return;
  music.playing = false;
  clearInterval(music.timer);
}

// the game loop freezes in a hidden tab but setInterval wouldn't — mute with it
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusic();
});

// ---- pose state ------------------------------------------------------------
let lm = null;              // smoothed landmarks [{x,y,vis}*33], x mirrored (selfie)
let poseSeenAt = 0;         // performance.now() of last detection
let calib = null;           // { hipY, torso } normalized units, standing baseline
let airborne = false, wasAirborne = false, jumpEdge = false;

function detect(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  try { res = landmarker.detectForVideo(video, now); } catch (e) { return; }
  const raw = res.landmarks && res.landmarks[0];
  if (!raw) return;
  if (!lm) lm = raw.map((p) => ({ x: 1 - p.x, y: p.y, vis: p.visibility ?? 1 }));
  else for (let i = 0; i < raw.length; i++) {
    lm[i].x += ((1 - raw[i].x) - lm[i].x) * SMOOTH;   // mirror x for selfie view
    lm[i].y += (raw[i].y - lm[i].y) * SMOOTH;
    lm[i].vis = raw[i].visibility ?? 1;
  }
  poseSeenAt = now;
}

const mid = (a, b) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// some builds leave visibility at 0 for every landmark — only trust the
// scores if at least one landmark reports a real value
const visScored = () => lm.some((p) => (p.vis ?? 0) > 0);

function bodyMetrics() {
  const hip = mid(L_HIP, R_HIP), sho = mid(L_SHO, R_SHO);
  const headR = 0.45 * dist(lm[NOSE], sho);                 // cartoon head radius
  return {
    hip, sho, headR,
    torso: dist(hip, sho),
    headTop: lm[NOSE].y - headR,
  };
}

function upperBodyVisible() {
  if (!lm) return false;
  if (visScored()) for (const i of CORE) if ((lm[i].vis ?? 1) < 0.4) return false;
  const m = bodyMetrics();
  return m.headTop > 0.01 && m.hip.y < 0.99 && m.torso > 0.08;
}

// hip rise above the standing baseline, in torso units (body-size invariant)
function hipRise(m) { return (calib.hipY - m.hip.y) / calib.torso; }

// slow-adapt the calibration while you're standing still, so drifting toward /
// away from the camera doesn't turn into phantom jumps or a growing figure
function updateCalib(m) {
  const rise = hipRise(m);
  airborne = rise > (airborne ? 0.12 : 0.25);   // hysteresis so it doesn't flicker
  jumpEdge = airborne && !wasAirborne;
  wasAirborne = airborne;
  if (Math.abs(rise) < 0.1) {
    const k = 0.02;
    calib.hipY += (m.hip.y - calib.hipY) * k;
    calib.torso += (m.torso - calib.torso) * k;
  }
}

// ---- game state -------------------------------------------------------------
// calibrate → armed (jump to start) → run; crash = flash + score reset, keep
// running; lost (pose gone) pauses, then re-arms.
let state = 'calibrate';
let keyboardMode = false;   // fallback: classic stick-runner on space/arrow-down
let stableFrames = 0;
let score = 0, hi = +(localStorage.getItem('hs-jump-hi') || 0);
let obstacles = [];         // { x, type, seed }  (y/size derived at draw time → resize-safe)
let distGap = 0, nextGap = 400;
let crashAt = -1e9, lastMilestone = 0;
let flash = 0;
let scrollX = 0;            // total distance scrolled (drives parallax + ground tiles)

// keyboard fallback physics
let kbY = 0, kbVy = 0, kbDuck = false;

let boost = 2.5, fliersOn = true, camOn = true;

const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
const groundY = () => H() * 0.82;
const figH = () => Math.min(H() * 0.30, 280);
const playerX = () => W() * 0.24;
// difficulty steps up every 15 points: track speeds up, gaps tighten
const level = () => Math.floor(score / 15);
const speed = () => Math.min(W() * (0.26 + 0.012 * level()), W() * 0.85);
const gapFactor = () => Math.max(0.85, 1.5 - 0.04 * level());

// obstacle catalogue: heights/positions in units of figure height so the game
// stays fair on any window size or body size. Tuned so a modest ~30cm hop (at
// default boost) clears low/wide and a proper jump clears tall.
const TYPES = {
  low:   { w: 0.16, h: 0.22, minScore: 0 },
  tall:  { w: 0.16, h: 0.38, minScore: 40 },
  flier: { w: 0.26, h: 0.18, minScore: 70, fly: 0.72 },  // bottom 0.72·figH up → crouch under it
  wide:  { w: 0.50, h: 0.20, minScore: 110 },
};
// the action each obstacle wants, shown as a pop-in prompt while it approaches
const ACTION = { low: 'JUMP!', tall: 'JUMP!', wide: 'JUMP!', flier: 'DUCK!' };
const ACTION_COLOR = { 'JUMP!': WHITE, 'DUCK!': COIN };
const HINTS = { flier: 'CROUCH TO DUCK THE BULLETS!' };
const hintShown = {};
let hintText = '', hintAt = -1e9;

function pickType() {
  const pool = Object.keys(TYPES).filter((k) =>
    score >= TYPES[k].minScore && (k !== 'flier' || fliersOn));
  return pool[(Math.random() * pool.length) | 0];
}

function obstacleRect(o) {
  const f = figH(), t = TYPES[o.type];
  const w = t.w * f, h = t.h * f;
  const y = t.fly ? groundY() - t.fly * f - h : groundY() - h;
  return { x: o.x, y, w, h };
}

function resetRun() {
  obstacles = [];
  score = 0; distGap = 0; nextGap = W() * 0.5; lastMilestone = 0;
  kbY = 0; kbVy = 0;
}

// ---- player geometry ---------------------------------------------------------
// figure scale (game px per normalized unit) and current lift above the ground
function poseFrame(m) {
  const s = figH() / (STATURE * calib.torso);
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  // full boost on the way up; crouching lowers the figure a little (clamped)
  const lift = Math.max(-0.25 * figH(), hipRise(m) * calib.torso * s * boost) + kbY;
  const hipScreenY = groundY() - HIP_FRAC * figH() - lift;
  const P = (j) => ({
    x: playerX() + (j.x - m.hip.x) * s * aspect,
    y: hipScreenY + (j.y - m.hip.y) * s,
  });
  return { s, aspect, lift, P };
}

function playerBox() {
  if (keyboardMode || !calib || !lm) {
    const f = figH() * 0.9, w = f * 0.26;
    const h = kbDuck ? f * 0.55 : f;
    return { x: playerX() - w / 2, y: groundY() - h - kbY, w, h };
  }
  const m = bodyMetrics();
  const { s, aspect, lift, P } = poseFrame(m);
  const head = P({ x: m.hip.x, y: m.headTop });
  const bottom = groundY() - Math.max(0, lift);      // feet = ground unless airborne
  const width = Math.max(18, dist(lm[L_HIP], lm[R_HIP]) * s * aspect * 1.3);
  // core column only, generously inset — a grazing limb shouldn't kill you
  const inset = (bottom - head.y) * 0.09;
  return { x: playerX() - width / 2, y: head.y + inset, w: width, h: bottom - head.y - inset * 2 };
}

// ---- main loop ----------------------------------------------------------------
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);  // clamp: tab-away shouldn't teleport obstacles
  lastT = now;

  detect(now);
  if (lm && calib && !keyboardMode) updateCalib(bodyMetrics());

  // keyboard fallback physics (also usable as an extra input in pose mode)
  const g = figH() * 14;
  if (kbY > 0 || kbVy > 0) { kbVy -= g * dt; kbY = Math.max(0, kbY + kbVy * dt); if (kbY === 0) kbVy = 0; }

  update(now, dt);
  if (state === 'run') startMusic(); else stopMusic();
  draw(now);
}

function update(now, dt) {
  const poseLive = now - poseSeenAt < LOST_MS;

  if (state === 'calibrate') {
    if (keyboardMode) { resetRun(); state = 'armed'; return; }
    if (now - poseSeenAt < 400 && upperBodyVisible()) {
      stableFrames++;
      if (stableFrames > 30) {
        const m = bodyMetrics();
        calib = { hipY: m.hip.y, torso: m.torso };
        resetRun();
        state = 'armed';
        beep(440, 880, 0.12, 'sine');
      }
    } else stableFrames = Math.max(0, stableFrames - 3);
    return;
  }

  if (state === 'armed') {
    if (!keyboardMode && !poseLive) { state = 'lost'; return; }
    if (jumpEdge || kbY > 5) { state = 'run'; beep(880, 880, 0.12, 'sine'); }
    return;
  }

  if (state === 'run') {
    if (!keyboardMode && !poseLive) { state = 'lost'; return; }

    score += dt * 12;
    if (score - lastMilestone >= 100) { lastMilestone += 100; beep(880, 1320, 0.08, 'sine', 0.08); }
    if (jumpEdge) beep(220, 560, 0.12);

    const v = speed() * dt;
    distGap += v;
    scrollX += v;
    for (const o of obstacles) o.x -= v;
    obstacles = obstacles.filter((o) => o.x > -W() * 0.2);
    if (distGap >= nextGap) {
      distGap = 0;
      // gaps start roomy and tighten as the level climbs
      nextGap = speed() * gapFactor() * (1 + Math.random() * 0.8);
      const t = pickType();
      obstacles.push({ x: W() + 80, type: t, seed: Math.random() });
      if (HINTS[t] && !hintShown[t]) { hintShown[t] = true; hintText = HINTS[t]; hintAt = now; }
    }

    const p = playerBox();
    for (const o of obstacles) {
      const r = obstacleRect(o);
      // forgiving collision: shrink the obstacle box so a graze doesn't kill
      const fx = Math.min(r.w, r.h) * 0.18 + 2;
      r.x += fx; r.y += fx; r.w -= fx * 2; r.h -= fx * 2;
      if (p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y) {
        // crash = instant retry: score back to zero, keep running
        hi = Math.max(hi, Math.floor(score));
        localStorage.setItem('hs-jump-hi', hi);
        crashAt = now; flash = 1;
        beep(300, 55, 0.4, 'sawtooth', 0.16);
        resetRun();
        break;
      }
    }
    return;
  }

  if (state === 'lost') {
    if (poseLive && upperBodyVisible()) {
      // drop anything about to hit you, then ask for a jump to resume
      obstacles = obstacles.filter((o) => o.x > W() * 0.6);
      state = 'armed';
    }
  }
}

// ---- drawing --------------------------------------------------------------------
let scanPat = null;
function scanlines() {
  if (!scanPat) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.07)';   // gentle CRT stripes; the sky is bright
    x.fillRect(0, 2, 4, 1);
    scanPat = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = scanPat;
  ctx.fillRect(0, 0, W(), H());
}

function draw(now) {
  const w = W(), h = H(), gy = groundY();
  ctx.clearRect(0, 0, w, h);

  // backdrop: flat NES sky + parallax clouds / hills / bushes + brick ground
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);
  drawScenery(w, gy);
  drawGround(w, h, gy);

  for (const o of obstacles) drawObstacle(o, now);
  drawPlayer(now);
  drawHud();
  // calibrating / re-finding you needs the feed visible no matter the toggle
  if (camOn || state === 'calibrate' || state === 'lost') drawCam();
  drawOverlays(now);

  if (flash > 0) {
    ctx.fillStyle = `rgba(229,37,33,${flash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
    flash = Math.max(0, flash - 0.04);
  }
  scanlines();
}

const mod = (a, n) => ((a % n) + n) % n;

function cloudShape(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - s * 1.1, y, s * 0.75, 0, 7);
  ctx.arc(x, y - s * 0.35, s, 0, 7);
  ctx.arc(x + s * 1.1, y, s * 0.75, 0, 7);
  ctx.fill();
}

function drawScenery(w, gy) {
  // clouds — slowest layer
  const cs = Math.max(24, w * 0.024);
  for (let i = 0; i < 5; i++) {
    const span = w + cs * 8;
    const x = mod(i * (span / 5) + i * 37 - scrollX * 0.2, span) - cs * 4;
    const y = gy * (0.12 + 0.08 * ((i * 53) % 3));
    cloudShape(x, y, cs, WHITE);
  }
  // round green hills
  for (let i = 0; i < 3; i++) {
    const span = w * 1.6;
    const x = mod(i * (span / 3) + i * 91 - scrollX * 0.45, span) - w * 0.3;
    const r = w * (0.09 + 0.05 * (i % 2));
    ctx.fillStyle = PIPE;
    ctx.beginPath(); ctx.arc(x, gy, r, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = PIPE_DK; ctx.lineWidth = 3; ctx.stroke();
  }
  // bushes — cloud shapes in green, ground layer speed
  const bs = Math.max(16, w * 0.016);
  for (let i = 0; i < 4; i++) {
    const span = w + bs * 8;
    const x = mod(i * (span / 4) + i * 61 - scrollX * 0.8, span) - bs * 4;
    cloudShape(x, gy - bs * 0.8, bs, PIPE_LT);
  }
}

function drawGround(w, h, gy) {
  ctx.fillStyle = BRICK;
  ctx.fillRect(0, gy, w, h - gy);
  const T = 26, off = mod(scrollX, T * 2);
  ctx.strokeStyle = BRICK_DK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let row = 0; gy + row * T < h; row++) {
    const y = Math.min(gy + (row + 1) * T, h);
    ctx.moveTo(0, y); ctx.lineTo(w, y);                 // horizontal seams
    const stag = row % 2 ? T : 0;                       // half-brick stagger per row
    for (let x = stag - off - T * 2; x < w + T; x += T * 2) {
      ctx.moveTo(x, gy + row * T); ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  // crisp top edge with highlight, like the SMB floor blocks
  ctx.fillStyle = '#000';
  ctx.fillRect(0, gy - 2, w, 3);
  ctx.fillStyle = BRICK_LT;
  ctx.fillRect(0, gy + 1, w, 3);
}

function drawObstacle(o, now) {
  const r = obstacleRect(o);
  if (TYPES[o.type].fly) drawBullet(r, now, o.seed);
  else if (o.type === 'wide') drawBricks(r);
  else drawPipe(r);

  // action prompt: pops in ~1.15s before the obstacle reaches you, rides with
  // it, and is gone the moment it's on you (dealt with or not)
  if (state === 'run') {
    const distAhead = r.x - playerX();
    const warn = speed() * 1.15;
    if (distAhead > 0 && distAhead < warn) {
      const a = ACTION[o.type];
      const pop = Math.min(1, (warn - distAhead) / (warn * 0.25));
      const bob = Math.sin(now * 0.012) * 3;
      const tx = r.x + r.w / 2, ty = r.y - 16 + bob;
      ctx.save();
      ctx.font = `${Math.round(11 + 5 * pop)}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = pop;
      ctx.fillStyle = '#000';
      ctx.fillText(a, tx + 2, ty + 2);
      ctx.fillStyle = ACTION_COLOR[a];
      ctx.fillText(a, tx, ty);
      ctx.restore();
    }
  }
}

function drawPipe(r) {
  const lipH = Math.min(r.h * 0.32, 22);
  const lipW = r.w * 1.24;
  const lx = r.x - (lipW - r.w) / 2;
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  // body with light/dark vertical shading
  ctx.fillStyle = PIPE;
  ctx.fillRect(r.x, r.y + lipH, r.w, r.h - lipH);
  ctx.fillStyle = PIPE_LT;
  ctx.fillRect(r.x + r.w * 0.12, r.y + lipH, r.w * 0.18, r.h - lipH);
  ctx.fillStyle = PIPE_DK;
  ctx.fillRect(r.x + r.w * 0.78, r.y + lipH, r.w * 0.12, r.h - lipH);
  ctx.strokeRect(r.x, r.y + lipH, r.w, r.h - lipH);
  // lip
  ctx.fillStyle = PIPE;
  ctx.fillRect(lx, r.y, lipW, lipH);
  ctx.fillStyle = PIPE_LT;
  ctx.fillRect(lx + lipW * 0.08, r.y, lipW * 0.16, lipH);
  ctx.fillStyle = PIPE_DK;
  ctx.fillRect(lx + lipW * 0.82, r.y, lipW * 0.1, lipH);
  ctx.strokeRect(lx, r.y, lipW, lipH);
  ctx.restore();
}

function drawBricks(r) {
  const n = Math.max(2, Math.round(r.w / r.h));
  const bw = r.w / n;
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const x = r.x + i * bw;
    ctx.fillStyle = BRICK;
    ctx.fillRect(x, r.y, bw, r.h);
    ctx.fillStyle = BRICK_LT;
    ctx.fillRect(x + 2, r.y + 2, bw - 4, 3);
    ctx.strokeRect(x, r.y, bw, r.h);
    ctx.fillStyle = BRICK_DK;                  // rivet dots like SMB blocks
    ctx.fillRect(x + 4, r.y + r.h - 7, 3, 3);
    ctx.fillRect(x + bw - 7, r.y + r.h - 7, 3, 3);
  }
  ctx.restore();
}

function drawBullet(r, now, seed) {
  const bob = Math.sin(now * 0.004 + seed * 9) * r.h * 0.15;
  const y = r.y + bob, cy = y + r.h / 2;
  ctx.save();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  // tail fins
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w * 0.75, y - r.h * 0.15);
  ctx.lineTo(r.x + r.w, cy);
  ctx.lineTo(r.x + r.w * 0.75, y + r.h * 1.15);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // bullet body, nose pointing left (toward you)
  ctx.fillStyle = '#202020';
  ctx.beginPath();
  ctx.moveTo(r.x + r.w * 0.35, y);
  ctx.lineTo(r.x + r.w * 0.85, y);
  ctx.lineTo(r.x + r.w * 0.85, y + r.h);
  ctx.lineTo(r.x + r.w * 0.35, y + r.h);
  ctx.arc(r.x + r.w * 0.35, cy, r.h / 2, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // eye + arm band
  ctx.fillStyle = WHITE;
  ctx.fillRect(r.x + r.w * 0.32, cy - r.h * 0.22, r.h * 0.15, r.h * 0.3);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(r.x + r.w * 0.6, y + 2, r.h * 0.13, r.h - 4);
  ctx.restore();
}

function strokeSegs(segs, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath();
  for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
}

function dot(p, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
}

function drawHead(p, r) {
  ctx.fillStyle = SKIN;                                 // face
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = RED;                                  // cap: top half + brim
  ctx.beginPath(); ctx.arc(p.x, p.y, r, Math.PI, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillRect(p.x + r * 0.4, p.y - r * 0.55, r * 0.9, r * 0.32);
  ctx.fillStyle = '#000';                               // eye, looking ahead
  ctx.fillRect(p.x + r * 0.35, p.y - r * 0.12, r * 0.18, r * 0.32);
}

function drawPlayer(now) {
  ctx.save();
  ctx.lineCap = 'round';

  if (keyboardMode || !calib || !lm) {
    // mario-flavoured stick-runner fallback
    const f = figH() * 0.9, x = playerX(), gy = groundY() - kbY;
    const hh = kbDuck ? f * 0.55 : f;
    const headR = f * 0.11;
    const lw = Math.max(4, f * 0.05);
    const step = Math.sin(now * 0.02) * f * 0.12 * (state === 'run' ? 1 : 0.2);
    const spine = [[{ x, y: gy - hh + headR * 2 }, { x, y: gy - f * 0.35 }],
      [{ x, y: gy - hh + headR * 2.6 }, { x: x + f * 0.16, y: gy - hh + headR * 4 }]];
    const legs = [[{ x, y: gy - f * 0.35 }, { x: x - f * 0.1 + step, y: gy }],
      [{ x, y: gy - f * 0.35 }, { x: x + f * 0.1 - step, y: gy }]];
    strokeSegs([...spine, ...legs], '#000', lw + 4);
    strokeSegs(spine, RED, lw);
    strokeSegs(legs, BLUE, lw);
    drawHead({ x, y: gy - hh + headR }, headR);
    ctx.restore();
    return;
  }

  const m = bodyMetrics();
  const { s, lift, P } = poseFrame(m);
  const J = (i) => P(lm[i]);
  const seg = (pairs) => pairs.map(([a, b]) => [J(a), J(b)]);

  const lw = Math.max(4, figH() * 0.03);
  const armSegs = seg([[L_SHO, L_ELB], [L_ELB, L_WRI], [R_SHO, R_ELB], [R_ELB, R_WRI]]);
  const bodySegs = seg([[L_SHO, R_SHO], [L_SHO, L_HIP], [R_SHO, R_HIP], [L_HIP, R_HIP]]);
  // legs: live if the camera can actually see them, synthesized cartoon
  // strides if they're cropped out of frame
  const legsTracked = !visScored() ||
    Math.min(lm[L_KNE].vis, lm[R_KNE].vis, lm[L_ANK].vis, lm[R_ANK].vis) >= 0.35;
  let legSegs;
  if (legsTracked) legSegs = seg(CONNS_LEG);
  else {
    const hipL = J(L_HIP), hipR = J(R_HIP);
    const feetY = Math.min(groundY(), groundY() - lift);
    const step = Math.sin(now * 0.014) * figH() * 0.1 * (state === 'run' ? 1 : 0.15);
    legSegs = [
      [hipL, { x: hipL.x - figH() * 0.05 + step, y: feetY }],
      [hipR, { x: hipR.x + figH() * 0.05 - step, y: feetY }],
    ];
  }

  // black outline pass, then colour passes — cheap pixel-cartoon look:
  // red shirt + arms, blue overall legs, white gloves, brown shoes
  strokeSegs([...bodySegs, ...armSegs, ...legSegs], '#000', lw + 4);
  strokeSegs([...bodySegs, ...armSegs], RED, lw);
  strokeSegs(legSegs, BLUE, lw);
  dot(J(L_WRI), lw * 0.8, WHITE);
  dot(J(R_WRI), lw * 0.8, WHITE);
  for (const sgm of legSegs.slice(-2)) dot(sgm[1], lw * 0.9, BRICK_DK);
  drawHead(J(NOSE), m.headR * s);
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'right';
  // SMB HUD: white with a hard black drop shadow
  ctx.fillStyle = '#000';
  ctx.fillText(String(Math.floor(score)).padStart(6, '0'), W() - 16, 42);
  ctx.fillText('HI ' + String(hi).padStart(6, '0'), W() - 16, 70);
  ctx.fillStyle = WHITE;
  ctx.fillText(String(Math.floor(score)).padStart(6, '0'), W() - 18, 40);
  ctx.fillStyle = COIN;
  ctx.fillText('HI ' + String(hi).padStart(6, '0'), W() - 18, 68);
  ctx.restore();
}

function drawCam() {
  if (!video.videoWidth) return;
  const big = state === 'calibrate';
  const w = big ? Math.min(W() * 0.42, 520) : Math.max(160, Math.min(W() * 0.2, 280));
  const h = w * video.videoHeight / video.videoWidth;
  const x = big ? (W() - w) / 2 : 14;
  const y = big ? H() * 0.16 : H() - h - 14;

  ctx.save();
  ctx.translate(x + w, y); ctx.scale(-1, 1);      // mirror to match selfie view
  ctx.globalAlpha = big ? 0.95 : 0.8;
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  // skeleton overlay (landmarks are pre-mirrored, so plot straight into the rect)
  if (lm) {
    ctx.save();
    ctx.strokeStyle = upperBodyVisible() ? NEON : PINK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of CONNS) {
      ctx.moveTo(x + lm[a].x * w, y + lm[a].y * h);
      ctx.lineTo(x + lm[b].x * w, y + lm[b].y * h);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function centerText(lines, y0) {
  ctx.save();
  ctx.textAlign = 'center';
  let y = y0;
  for (const [txt, size, color] of lines) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    const sh = Math.max(2, size * 0.14);        // hard pixel shadow, no glow
    ctx.fillStyle = '#000';
    ctx.fillText(txt, W() / 2 + sh, y + sh);
    ctx.fillStyle = color;
    ctx.fillText(txt, W() / 2, y);
    y += size * 2.1;
  }
  ctx.restore();
}

function drawOverlays(now) {
  if (state === 'calibrate') {
    const ok = upperBodyVisible();
    centerText([
      ['GET IN FRAME', 22, WHITE],
      [ok ? 'HOLD STILL…' : 'HEAD + HIPS IN VIEW IS ENOUGH', 12, ok ? COIN : WHITE],
    ], H() * 0.09);
    // progress bar
    const bw = Math.min(W() * 0.4, 380), bx = (W() - bw) / 2, by = H() * 0.88;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, 14);
    ctx.fillStyle = COIN;
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * Math.min(stableFrames / 30, 1), 10);
    ctx.font = '15px "VT323", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('no room? press K for keyboard mode (space = jump, ↓ = duck)', W() / 2, by + 38);
  } else if (state === 'armed') {
    centerText([
      ['JUMP TO START', 24, WHITE],
      [keyboardMode ? '(space works too)' : 'physically jump — that jump starts the run', 11, 'rgba(255,255,255,0.95)'],
    ], H() * 0.35);
  } else if (state === 'lost') {
    centerText([
      ["CAN'T SEE YOU", 22, COIN],
      ['get your head + hips back in frame', 12, WHITE],
    ], H() * 0.35);
  } else if (state === 'run' && now - crashAt < 1200) {
    centerText([
      ['OUCH!', 26, RED],
      ['from the top — best ' + hi, 12, WHITE],
    ], H() * 0.3);
  }
  // teach each new obstacle the first time it shows up
  if (state === 'run' && now - hintAt < 2200) {
    centerText([[hintText, 14, COIN]], H() * 0.18);
  }
}

// ---- ui ------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scanPat = null;
}
addEventListener('resize', resize);

addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (kbY === 0 && kbVy === 0) {
      kbVy = figH() * 4.6;                  // ~0.65s hang time, clears a tall block
      if (state === 'run') beep(220, 560, 0.12);
    }
  }
  if (e.code === 'ArrowDown') { e.preventDefault(); kbDuck = true; }
  if (e.key === 'k' || e.key === 'K') {
    if (state === 'calibrate') keyboardMode = true;
  }
  if (e.key === 'v' || e.key === 'V') camTog.click();
});
addEventListener('keyup', (e) => { if (e.code === 'ArrowDown') kbDuck = false; });

const boostEl = document.getElementById('boost');
const vBoost = document.getElementById('v-boost');
boostEl.value = boost;
vBoost.textContent = '×' + boost.toFixed(1);
boostEl.addEventListener('input', () => {
  boost = +boostEl.value;
  vBoost.textContent = '×' + boost.toFixed(1);
});

function wireToggle(id, label, get, set) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    set(!get());
    el.classList.toggle('on', get());
    el.textContent = `${label}: ${get() ? 'ON' : 'OFF'}`;
  });
  return el;
}
wireToggle('fliers', 'BULLETS', () => fliersOn, (v) => { fliersOn = v; });
const camTog = wireToggle('cam-tog', 'CAMERA', () => camOn, (v) => { camOn = v; });
wireToggle('sound', 'SOUND', () => soundOn, (v) => { soundOn = v; });
wireToggle('music', 'MUSIC', () => musicOn, (v) => {
  musicOn = v;
  if (!v) stopMusic();
});
