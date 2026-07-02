// Jump Runner — MediaPipe Pose + canvas 2D.
// First BODY-tracked toy (the others track hands). Endless runner in the
// chrome-dino spirit, except the runner is YOUR live pose skeleton: physically
// jump in front of the camera to clear obstacles, physically crouch to duck
// under the fliers. Everything runs client-side; fully vendored (no CDN).
//
// Pose→game mapping: at calibration we memorise where your ankles/hips sit and
// how tall you are (normalized video units). Each frame the skeleton is drawn
// anchored so calibrated-ankle-height = the game's ground line. When you jump
// for real, every joint rises above that anchor and the figure simply leaves
// the ground — no simulated physics, your legs are the physics. JUMP BOOST
// amplifies the lift so a polite indoor hop still clears a tall cactus.

import { FilesetResolver, PoseLandmarker }
  from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/pose_landmarker_lite.task';
const WASM = '/vendor/mediapipe/wasm';

// landmark ids (BlazePose 33-point topology)
const NOSE = 0, L_EAR = 7, R_EAR = 8,
  L_SHO = 11, R_SHO = 12, L_ELB = 13, R_ELB = 14, L_WRI = 15, R_WRI = 16,
  L_HIP = 23, R_HIP = 24, L_KNE = 25, R_KNE = 26, L_ANK = 27, R_ANK = 28,
  L_TOE = 31, R_TOE = 32;
const CONNS = [
  [L_SHO, R_SHO], [L_SHO, L_ELB], [L_ELB, L_WRI], [R_SHO, R_ELB], [R_ELB, R_WRI],
  [L_SHO, L_HIP], [R_SHO, R_HIP], [L_HIP, R_HIP],
  [L_HIP, L_KNE], [L_KNE, L_ANK], [R_HIP, R_KNE], [R_KNE, R_ANK],
  [L_ANK, L_TOE], [R_ANK, R_TOE],
];
const CORE = [NOSE, L_SHO, R_SHO, L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK];

const SMOOTH = 0.55;          // lerp toward raw per detection (jumps are fast; keep latency low)
const LOST_MS = 1000;         // pause the run if unseen this long
const NEON = '#b6ff3e', PINK = '#ff5fa2', CYAN = '#38f9d7';

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

// ---- pose state ------------------------------------------------------------
let lm = null;              // smoothed landmarks [{x,y,vis}*33], x mirrored (selfie)
let poseSeenAt = 0;         // performance.now() of last detection
let calib = null;           // { ankleY, hipY, torso, bodyH, headTop } normalized units
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

function bodyMetrics() {
  const hip = mid(L_HIP, R_HIP), sho = mid(L_SHO, R_SHO);
  const ankleY = Math.max(lm[L_ANK].y, lm[R_ANK].y);        // lower foot = ground contact
  const headR = 0.45 * dist(lm[NOSE], sho);                 // cartoon head radius
  return {
    hip, sho, ankleY,
    torso: dist(hip, sho),
    headTop: lm[NOSE].y - headR,
    headR,
    bodyH: ankleY - (lm[NOSE].y - headR),
  };
}

function fullBodyVisible() {
  if (!lm) return false;
  // some builds leave visibility at 0 for every landmark — only trust the
  // scores if at least one landmark reports a real value
  const scored = lm.some((p) => (p.vis ?? 0) > 0);
  if (scored) for (const i of CORE) if ((lm[i].vis ?? 1) < 0.4) return false;
  const m = bodyMetrics();
  return m.headTop > 0.02 && m.ankleY < 0.99 && m.bodyH > 0.3;
}

// slow-adapt the calibration while you're standing still, so drifting toward /
// away from the camera doesn't turn into phantom jumps or a growing hitbox
function updateCalib(m) {
  const rise = calib.ankleY - m.ankleY;
  const hipOff = Math.abs(m.hip.y - calib.hipY);
  airborne = rise > 0.06 * calib.bodyH + 0.02;
  jumpEdge = airborne && !wasAirborne;
  wasAirborne = airborne;
  if (Math.abs(rise) < 0.03 && hipOff < 0.05) {
    const k = 0.02;
    calib.ankleY += (m.ankleY - calib.ankleY) * k;
    calib.hipY += (m.hip.y - calib.hipY) * k;
    calib.torso += (m.torso - calib.torso) * k;
    calib.bodyH += (m.bodyH - calib.bodyH) * k;
  }
}

// ---- game state -------------------------------------------------------------
let state = 'calibrate';    // calibrate | countdown | run | lost | dead
let keyboardMode = false;   // fallback: classic stick-runner on space/arrow-down
let stableFrames = 0;
let countT = 0;             // countdown timer (s)
let score = 0, hi = +(localStorage.getItem('hs-jump-hi') || 0);
let runTime = 0;            // seconds since run started (drives speed ramp)
let obstacles = [];         // { x, type, seed }  (y/size derived at draw time → resize-safe)
let distGap = 0, nextGap = 400;
let deadAt = 0, lastMilestone = 0;
let flash = 0;

// keyboard fallback physics
let kbY = 0, kbVy = 0, kbDuck = false;

let boost = 2.0, fliersOn = true, camOn = true;

const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
const groundY = () => H() * 0.82;
const figH = () => Math.min(H() * 0.30, 280);
const playerX = () => W() * 0.24;
const speed = () => Math.min(W() * (0.35 + 0.010 * runTime), W() * 0.95);

// obstacle catalogue: heights/positions in units of figure height so the game
// stays fair on any window size or body size
// heights tuned so a modest ~30cm real-world hop (at default boost) clears
// low/wide, and a proper jump clears tall — see mapJoint: total rise ≈ rise·s·boost
const TYPES = {
  low:  { w: 0.16, h: 0.22, minScore: 0 },
  tall: { w: 0.16, h: 0.38, minScore: 250 },
  wide: { w: 0.50, h: 0.20, minScore: 450 },
  flier:{ w: 0.26, h: 0.18, minScore: 550, fly: 0.72 },  // bottom sits 0.72·figH up → crouch under it
};

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
  score = 0; runTime = 0; distGap = 0; nextGap = W() * 0.5; lastMilestone = 0;
  kbY = 0; kbVy = 0;
}

// ---- player geometry ---------------------------------------------------------
// maps a normalized landmark into game space, feet anchored to the ground line
function mapJoint(j, m, lift, s, aspect) {
  return {
    x: playerX() + (j.x - m.hip.x) * s * aspect,
    y: groundY() - (calib.ankleY - j.y) * s - lift,
  };
}

function playerBox() {
  if (keyboardMode || !calib || !lm) {
    const f = figH() * 0.9, w = f * 0.30;
    const h = kbDuck ? f * 0.55 : f;
    return { x: playerX() - w / 2, y: groundY() - h - kbY, w, h };
  }
  const m = bodyMetrics();
  const s = figH() / calib.bodyH;
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const lift = Math.max(0, calib.ankleY - m.ankleY) * s * (boost - 1) + kbY;
  const head = mapJoint({ x: m.hip.x, y: m.headTop }, m, lift, s, aspect);
  const feet = mapJoint({ x: m.hip.x, y: m.ankleY }, m, lift, s, aspect);
  const width = Math.max(
    18, dist(lm[L_HIP], lm[R_HIP]) * s * aspect * 1.6);
  // core column only — flailing arms shouldn't get you killed
  const inset = (feet.y - head.y) * 0.06;
  return { x: playerX() - width / 2, y: head.y + inset, w: width, h: feet.y - head.y - inset * 2 };
}

// ---- main loop ----------------------------------------------------------------
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.05);  // clamp: tab-away shouldn't teleport obstacles
  lastT = now;

  detect(now);
  const m = (lm && calib) ? bodyMetrics() : null;
  if (m && !keyboardMode) updateCalib(m);

  // keyboard fallback physics (also active as an extra input in pose mode)
  const g = figH() * 14;
  if (kbY > 0 || kbVy > 0) { kbVy -= g * dt; kbY = Math.max(0, kbY + kbVy * dt); if (kbY === 0) kbVy = 0; }

  update(now, dt);
  draw(now);
}

function update(now, dt) {
  const poseLive = now - poseSeenAt < LOST_MS;

  if (state === 'calibrate') {
    if (keyboardMode) { state = 'countdown'; countT = 3; resetRun(); return; }
    if (now - poseSeenAt < 400 && fullBodyVisible()) {
      stableFrames++;
      if (stableFrames > 45) {
        const m = bodyMetrics();
        calib = { ankleY: m.ankleY, hipY: m.hip.y, torso: m.torso, bodyH: m.bodyH };
        state = 'countdown'; countT = 3; resetRun();
        beep(440, 440, 0.08, 'sine');
      }
    } else stableFrames = Math.max(0, stableFrames - 3);
    return;
  }

  if (state === 'countdown') {
    const before = Math.ceil(countT);
    countT -= dt;
    if (Math.ceil(countT) !== before && countT > 0) beep(440, 440, 0.08, 'sine');
    if (countT <= 0) { state = 'run'; beep(880, 880, 0.12, 'sine'); }
    return;
  }

  if (state === 'run') {
    if (!keyboardMode && !poseLive) { state = 'lost'; return; }

    runTime += dt;
    score += dt * 12;
    if (score - lastMilestone >= 100) { lastMilestone += 100; beep(880, 1320, 0.08, 'sine', 0.08); }
    if (jumpEdge) beep(220, 560, 0.12);

    const v = speed() * dt;
    distGap += v;
    for (const o of obstacles) o.x -= v;
    obstacles = obstacles.filter((o) => o.x > -W() * 0.2);
    if (distGap >= nextGap) {
      distGap = 0;
      nextGap = speed() * (0.95 + Math.random() * 0.9);   // always ≥ ~1s between obstacles
      obstacles.push({ x: W() + 80, type: pickType(), seed: Math.random() });
    }

    const p = playerBox();
    for (const o of obstacles) {
      const r = obstacleRect(o);
      if (p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y) {
        state = 'dead'; deadAt = now; flash = 1;
        hi = Math.max(hi, Math.floor(score));
        localStorage.setItem('hs-jump-hi', hi);
        beep(300, 55, 0.4, 'sawtooth', 0.16);
        break;
      }
    }
    return;
  }

  if (state === 'lost') {
    if (poseLive && fullBodyVisible()) { state = 'countdown'; countT = 1; }
    return;
  }

  if (state === 'dead') {
    // jump (or space, which sets kbVy) to go again — small delay so a death-flail
    // doesn't instantly restart
    if (now - deadAt > 800 && (jumpEdge || (keyboardMode && kbY > 5))) {
      state = 'countdown'; countT = 1.5; resetRun();
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
    x.fillStyle = 'rgba(0,0,0,0.16)';
    x.fillRect(0, 2, 4, 1);
    scanPat = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = scanPat;
  ctx.fillRect(0, 0, W(), H());
}

function draw(now) {
  const w = W(), h = H(), gy = groundY();
  ctx.clearRect(0, 0, w, h);

  // backdrop: dark sky, faint grid horizon
  ctx.fillStyle = '#060a06';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(182,255,62,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(0, gy + (h - gy) * (i / 5)); ctx.lineTo(w, gy + (h - gy) * (i / 5)); ctx.stroke();
  }
  // stars
  ctx.fillStyle = 'rgba(234,255,217,0.35)';
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 149.7 + i * i * 13.3) % w);
    const sy = ((i * 83.1) % (gy * 0.8));
    ctx.fillRect(sx, sy, 2, 2);
  }

  // ground line + speed dashes
  ctx.strokeStyle = NEON;
  ctx.shadowColor = NEON; ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(182,255,62,0.4)';
  const dashOff = (now * 0.001 * speed()) % 80;
  ctx.beginPath();
  for (let x = -dashOff; x < w; x += 80) { ctx.moveTo(x, gy + 12); ctx.lineTo(x + 34, gy + 12); }
  ctx.stroke();

  for (const o of obstacles) drawObstacle(o, now);
  drawPlayer(now);
  drawHud();
  // calibrating / re-finding you needs the feed visible no matter the toggle
  if (camOn || state === 'calibrate' || state === 'lost') drawCam();
  drawOverlays(now);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,95,162,${flash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
    flash = Math.max(0, flash - 0.04);
  }
  scanlines();
}

function drawObstacle(o, now) {
  const r = obstacleRect(o);
  const fly = TYPES[o.type].fly;
  ctx.save();
  ctx.strokeStyle = fly ? CYAN : PINK;
  ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  if (fly) {
    // drone: body diamond + flapping wings + blink
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const flap = Math.sin(now * 0.02 + o.seed * 9) * r.h * 0.5;
    ctx.beginPath();
    ctx.moveTo(r.x, cy); ctx.lineTo(cx, r.y); ctx.lineTo(r.x + r.w, cy); ctx.lineTo(cx, r.y + r.h);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.2, cy); ctx.lineTo(cx, cy - flap);
    ctx.lineTo(r.x + r.w * 0.8, cy); ctx.stroke();
    if (Math.sin(now * 0.008) > 0) { ctx.fillStyle = CYAN; ctx.fillRect(cx - 2, cy - 2, 4, 4); }
  } else {
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // hatch fill, clipped to the box
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.beginPath();
    for (let x = r.x - r.h; x < r.x + r.w; x += 10) {
      ctx.moveTo(x, r.y + r.h); ctx.lineTo(x + r.h, r.y);
    }
    ctx.globalAlpha = 0.35; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawPlayer(now) {
  ctx.save();
  ctx.strokeStyle = NEON;
  ctx.shadowColor = NEON; ctx.shadowBlur = 12;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  if (keyboardMode || !calib || !lm) {
    // classic stick-runner fallback
    const f = figH() * 0.9, x = playerX(), gy = groundY() - kbY;
    const hh = kbDuck ? f * 0.55 : f;
    const headR = f * 0.11;
    const step = Math.sin(now * 0.02) * f * 0.12 * (state === 'run' ? 1 : 0.2);
    ctx.beginPath();
    ctx.arc(x, gy - hh + headR, headR, 0, Math.PI * 2);          // head
    ctx.moveTo(x, gy - hh + headR * 2); ctx.lineTo(x, gy - f * 0.35);  // spine
    ctx.moveTo(x, gy - hh + headR * 2.6); ctx.lineTo(x + f * 0.16, gy - hh + headR * 4); // arm
    ctx.moveTo(x, gy - f * 0.35); ctx.lineTo(x - f * 0.1 + step, gy);  // legs
    ctx.moveTo(x, gy - f * 0.35); ctx.lineTo(x + f * 0.1 - step, gy);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const m = bodyMetrics();
  const s = figH() / calib.bodyH;
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const lift = Math.max(0, calib.ankleY - m.ankleY) * s * (boost - 1) + kbY;
  const P = (i) => mapJoint(lm[i], m, lift, s, aspect);

  ctx.beginPath();
  for (const [a, b] of CONNS) {
    const pa = P(a), pb = P(b);
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();
  // head
  const nose = P(NOSE);
  ctx.beginPath();
  ctx.arc(nose.x, nose.y, m.headR * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = NEON;
  ctx.shadowColor = NEON; ctx.shadowBlur = 6;
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.floor(score)).padStart(5, '0'), W() - 18, 40);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(234,255,217,0.5)';
  ctx.fillText('HI ' + String(hi).padStart(5, '0'), W() - 18, 66);
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
    ctx.strokeStyle = fullBodyVisible() ? NEON : PINK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of CONNS) {
      ctx.moveTo(x + lm[a].x * w, y + lm[a].y * h);
      ctx.lineTo(x + lm[b].x * w, y + lm[b].y * h);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(182,255,62,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function centerText(lines, y0) {
  ctx.save();
  ctx.textAlign = 'center';
  let y = y0;
  for (const [txt, size, color] of lines) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillText(txt, W() / 2, y);
    y += size * 2.1;
  }
  ctx.restore();
}

function drawOverlays(now) {
  if (state === 'calibrate') {
    const ok = fullBodyVisible();
    centerText([
      ['STEP BACK', 22, NEON],
      [ok ? 'HOLD STILL…' : 'FIT YOUR WHOLE BODY IN FRAME', 12, ok ? CYAN : PINK],
    ], H() * 0.09);
    // progress bar
    const bw = Math.min(W() * 0.4, 380), bx = (W() - bw) / 2, by = H() * 0.88;
    ctx.strokeStyle = NEON; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 14);
    ctx.fillStyle = NEON;
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * Math.min(stableFrames / 45, 1), 10);
    ctx.font = '15px "VT323", monospace';
    ctx.fillStyle = 'rgba(234,255,217,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('no room? press K for keyboard mode (space = jump, ↓ = duck)', W() / 2, by + 38);
  } else if (state === 'countdown') {
    centerText([[countT > 0.3 ? String(Math.ceil(countT)) : 'GO!', 42, NEON]], H() * 0.4);
  } else if (state === 'lost') {
    centerText([
      ["CAN'T SEE YOU", 22, PINK],
      ['step back into frame', 12, 'rgba(234,255,217,0.8)'],
    ], H() * 0.35);
  } else if (state === 'dead') {
    centerText([
      ['GAME OVER', 30, PINK],
      ['SCORE ' + Math.floor(score) + '   HI ' + hi, 14, NEON],
      [keyboardMode ? 'PRESS SPACE TO RUN AGAIN' : 'JUMP TO RUN AGAIN', 12, 'rgba(234,255,217,0.8)'],
    ], H() * 0.32);
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
wireToggle('fliers', 'FLIERS', () => fliersOn, (v) => { fliersOn = v; });
const camTog = wireToggle('cam-tog', 'CAMERA', () => camOn, (v) => { camOn = v; });
wireToggle('sound', 'SOUND', () => soundOn, (v) => { soundOn = v; });
