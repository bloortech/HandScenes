// Sign School — MediaPipe Hands + canvas 2D.
// Duolingo-style trainer for the ASL fingerspelling alphabet. The webcam feed
// fills the screen; a rule-based checker verifies the TARGET letter's handshape
// from the 21 hand landmarks and coaches with live tips ("straighten your
// index", "tuck your thumb across"). Verifying only the target letter — rather
// than classifying all 26 — is what makes landmark rules reliable enough to
// teach with, and it's exactly the Duolingo shape: "did you produce the
// prompt?", not "what did you say?".
//
// 24 static letters in 5 units (J and Z are drawn with motion — later update).
// Reference diagrams are drawn procedurally from a tiny per-letter pose spec
// (forward kinematics on a cartoon hand), so there are no image assets and the
// diagram + checker stay in one place. Everything runs client-side; fully
// vendored, nothing uploaded. Progress lives in localStorage.

import { FilesetResolver, HandLandmarker }
  from '/vendor/mediapipe/tasks-vision.mjs';

const MODEL = '/models/hand_landmarker.task';
const WASM = '/vendor/mediapipe/wasm';

// landmark ids: 0 wrist · thumb 1-4 · index 5-8 · middle 9-12 · ring 13-16 · pinky 17-20
const TIPS = [8, 12, 16, 20];        // index, middle, ring, pinky
const MCPS = [5, 9, 13, 17];
const PIPS = [6, 10, 14, 18];
const DIPS = [7, 11, 15, 19];
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const SMOOTH = 0.5;           // lerp toward raw landmarks per detection
const LOST_MS = 350;          // treat the hand as gone if unseen this long
const HOLD_MS = 900;          // hold a correct sign this long to pass
const WORD_HOLD_MS = 650;     // slightly quicker inside word spelling
const HINT_AFTER_MS = 9000;   // quiz: auto-show the diagram after struggling
const TIP_STABLE_MS = 450;    // a check must fail this long before we nag

// ---- curriculum ------------------------------------------------------------
const UNITS = [
  { id: 'u1', name: 'First shapes', letters: ['A', 'B', 'C', 'L', 'O'], word: 'COLA' },
  { id: 'u2', name: 'Pointers', letters: ['D', 'U', 'V', 'W', 'Y'], word: 'DUO' },
  { id: 'u3', name: 'Pinch & cross', letters: ['F', 'I', 'K', 'R', 'X'], word: 'FIX' },
  { id: 'u4', name: 'Sideways signs', letters: ['G', 'H', 'P', 'Q'], word: 'GAP' },
  { id: 'u5', name: 'Fist family', letters: ['E', 'S', 'T', 'N', 'M'], word: 'NEST' },
];
const XP_LEARN = 5, XP_QUIZ = 10, XP_WORD_LETTER = 8;

// ---- dom / boot -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const gate = $('gate'), startBtn = $('start'), note = $('note');
const video = $('cam'), canvas = $('view'), ctx = canvas.getContext('2d');
const refCanvas = $('ref-canvas'), refCtx = refCanvas.getContext('2d');

let landmarker = null, audioCtx = null, lastVideoTime = -1;
let assist = 1.0;             // >1 = more lenient thresholds
let soundOn = true;
let debug = false;

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
      opts.baseOptions.delegate = 'CPU';   // some devices (iOS) lack the GPU path
      landmarker = await HandLandmarker.createFromOptions(fileset, opts);
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    document.fonts.load('16px "Press Start 2P"').catch(() => {});
    gate.remove();
    buildMap();
    resize();
    requestAnimationFrame(loop);
  } catch (err) {
    gate.classList.remove('loading');
    startBtn.disabled = false;
    note.classList.add('err');
    note.textContent = 'camera failed: ' + err.message + ' — allow camera and retry';
  }
}

// ---- tiny synth -------------------------------------------------------------
function beep(f0, f1, dur, type = 'square', vol = 0.1) {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const dingPass = () => { beep(660, 990, 0.12, 'square', 0.08); setTimeout(() => beep(990, 1320, 0.14, 'square', 0.08), 90); };
const dingWord = () => beep(880, 1100, 0.09, 'square', 0.07);
const fanfare = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, f, 0.16, 'square', 0.09), i * 110));

// ---- hand tracking ----------------------------------------------------------
let lm = null;                // smoothed landmarks [{x,y,z}*21], x mirrored (selfie)
let seenAt = -1e9;

function updateHand(now) {
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, now);
  if (!res.landmarks.length) return;
  const raw = res.landmarks[0];
  if (!lm || now - seenAt > LOST_MS) {
    lm = raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
  } else {
    for (let i = 0; i < raw.length; i++) {
      lm[i].x += ((1 - raw[i].x) - lm[i].x) * SMOOTH;
      lm[i].y += (raw[i].y - lm[i].y) * SMOOTH;
      lm[i].z += (raw[i].z - lm[i].z) * SMOOTH;
    }
  }
  seenAt = now;
}
const handVisible = (now) => lm && now - seenAt < LOST_MS;

// ---- features ---------------------------------------------------------------
// Everything is normalized by hand size and expressed in a palm frame, so the
// checks work at any distance, any screen position, and with EITHER hand:
//   u axis = wrist -> middle MCP (up along the palm)
//   r axis = ring MCP -> index MCP (always points to the THUMB side, which
//            makes the frame chirality-proof — no handedness special-casing)
function features() {
  const d3 = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, lm[a].z - lm[b].z);
  const scale = d3(0, 9) || 1e-4;

  const ux = lm[9].x - lm[0].x, uy = lm[9].y - lm[0].y;
  const ul = Math.hypot(ux, uy) || 1e-4;
  const u = { x: ux / ul, y: uy / ul };
  const rx = lm[5].x - lm[13].x, ry = lm[5].y - lm[13].y;
  const rl = Math.hypot(rx, ry) || 1e-4;
  const r = { x: rx / rl, y: ry / rl };
  const pf = (i) => ({
    r: ((lm[i].x - lm[0].x) * r.x + (lm[i].y - lm[0].y) * r.y) / scale,
    u: ((lm[i].x - lm[0].x) * u.x + (lm[i].y - lm[0].y) * u.y) / scale,
  });

  const fingers = [];
  for (let f = 0; f < 4; f++) {
    const mcp = MCPS[f], pip = PIPS[f], dip = DIPS[f], tip = TIPS[f];
    const straight = d3(mcp, tip) / ((d3(mcp, pip) + d3(pip, dip) + d3(dip, tip)) || 1e-4);
    const reach = d3(0, tip) / scale;
    const dx = lm[tip].x - lm[mcp].x, dy = lm[tip].y - lm[mcp].y;
    const dl = Math.hypot(dx, dy) || 1e-4;
    fingers.push({ straight, reach, dir: { x: dx / dl, y: dy / dl } });
  }
  const tStraight = d3(2, 4) / ((d3(2, 3) + d3(3, 4)) || 1e-4);
  const tdx = lm[4].x - lm[2].x, tdy = lm[4].y - lm[2].y;
  const tdl = Math.hypot(tdx, tdy) || 1e-4;

  return {
    scale, d3, pf, fingers,
    thumb: { straight: tStraight, dir: { x: tdx / tdl, y: tdy / tdl }, pf: pf(4) },
    pinch: (f) => d3(4, TIPS[f]) / scale,                       // thumb tip <-> finger tip
    gap: (a, b) => d3(TIPS[a], TIPS[b]) / scale,                // finger tip <-> finger tip
    zTip: (i) => (lm[i].z - lm[0].z) / scale,                   // relative depth (neg = toward camera)
  };
}

// Predicate helpers. `assist` widens every tolerance; per-finger reach limits
// account for the pinky being much shorter than the middle finger.
function makeQ(F) {
  const A = assist;
  const EXT_REACH = [1.5, 1.6, 1.5, 1.25];
  const FOLD_REACH = [1.25, 1.3, 1.25, 1.1];
  const ext = (f) => F.fingers[f].straight > 0.86 - 0.08 * A && F.fingers[f].reach > EXT_REACH[f] - 0.12 * A;
  const fold = (f) => F.fingers[f].reach < FOLD_REACH[f] + 0.12 * A || F.fingers[f].straight < 0.52 + 0.05 * A;
  const half = (f) => !ext(f) && F.fingers[f].reach > 1.05 - 0.05 * A && F.fingers[f].reach < 1.85;
  const up = (f) => F.fingers[f].dir.y < -0.6 + 0.12 * A;
  const upish = (f) => F.fingers[f].dir.y < -0.25;
  const down = (f) => F.fingers[f].dir.y > 0.45 - 0.1 * A;
  const side = (f) => Math.abs(F.fingers[f].dir.y) < 0.6 + 0.1 * A;
  const together = (a, b) => F.gap(a, b) < 0.45 + 0.12 * A;
  const apart = (a, b) => F.gap(a, b) > 0.5 - 0.1 * A;
  const pinch = (f, t = 0.45) => F.pinch(f) < t + 0.15 * A;
  const all = (fn, ...fs) => fs.every(fn);
  const T = F.thumb;
  const thumbPar = (f) => T.dir.x * F.fingers[f].dir.x + T.dir.y * F.fingers[f].dir.y > 0.45 - 0.1 * A;
  const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI;
  return { ext, fold, half, up, upish, down, side, together, apart, pinch, all, T, thumbPar, angleDeg, F, A };
}

// ---- letters ----------------------------------------------------------------
// Each letter: desc (card text) · pose (diagram spec, see drawRef) · checks(q)
// -> list of [passed, coaching tip]. ALL checks must pass; failing tips are
// what the player sees. pose.f = curl per finger 0..1 (index..pinky),
// pose.th = thumb {a: angle°, c: curl}, rot = whole-hand rotation, spread =
// extra splay, cross/hook/layer = special cases.
const LETTERS = {
  A: {
    desc: 'A fist, thumb standing tall against the side.',
    pose: { f: [1, 1, 1, 1], th: { a: -14, c: 0.05 } },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'curl all four fingers into a fist'],
      [q.T.pf.r > q.F.pf(5).r - 0.15 && q.T.pf.u > 0.35, 'thumb straight up beside the fist — not across the front'],
      [q.T.straight > 0.75 - 0.1 * q.A, 'straighten your thumb'],
    ],
  },
  B: {
    desc: 'Flat hand, fingers together, thumb folded across the palm.',
    pose: { f: [0, 0, 0, 0], spread: 0.15, th: { a: 62, c: 0.4 } },
    checks: (q) => [
      [q.all(q.ext, 0, 1, 2, 3), 'straighten all four fingers'],
      [q.all(q.up, 0, 1, 2, 3), 'point your fingers at the ceiling'],
      [q.together(0, 1) && q.together(1, 2) && q.together(2, 3), 'keep your fingers glued together'],
      [q.T.pf.r < q.F.pf(9).r + 0.25, 'fold your thumb across your palm'],
    ],
  },
  C: {
    desc: 'Curve the whole hand — like holding a cup. Your hand IS the letter.',
    pose: { f: [0.45, 0.45, 0.45, 0.45], spread: 0.2, th: { a: -38, c: 0.35 } },
    checks: (q) => [
      [q.all(q.half, 0, 1, 2, 3), 'curve your fingers — half-closed, like holding a cup'],
      [q.F.pinch(0) > 0.45 - 0.1 * q.A && q.F.pinch(0) < 1.3 + 0.2 * q.A, 'keep a C-shaped gap between fingertips and thumb'],
      [q.together(0, 1) && q.together(1, 2), 'fingers together, one smooth curve'],
    ],
  },
  D: {
    desc: 'Index points up; middle, ring and pinky tips rest on your thumb.',
    pose: { f: [0, 0.75, 0.8, 0.85], th: { a: 26, c: 0.5 } },
    checks: (q) => [
      [q.ext(0) && q.up(0), 'point your index straight up'],
      [!q.ext(1) && !q.ext(2) && !q.ext(3), 'bring middle, ring and pinky down'],
      [q.pinch(1, 0.6), 'rest your middle fingertip on your thumb'],
    ],
  },
  E: {
    desc: 'Curl your fingertips down onto your thumb — a scrunched little claw.',
    pose: { f: [0.85, 0.85, 0.85, 0.85], th: { a: 74, c: 0.45 } },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'curl all four fingertips down'],
      [q.T.pf.r < q.F.pf(5).r + 0.1, 'lay your thumb across, under your fingertips'],
      [q.T.pf.u < 1.15, 'thumb low — fingertips curl down to meet it'],
    ],
  },
  F: {
    desc: 'OK sign 👌 — thumb and index make a ring, other three stand up.',
    pose: { f: [0.55, 0, 0, 0], spread: 0.35, th: { a: 16, c: 0.5 } },
    checks: (q) => [
      [q.pinch(0, 0.4), 'touch your thumb tip to your index tip — like OK 👌'],
      [q.all(q.ext, 1, 2, 3), 'keep middle, ring and pinky standing'],
      [q.upish(1) && q.upish(2), 'those three fingers point up'],
    ],
  },
  G: {
    desc: 'A flat pinch pointing sideways — index and thumb level, parallel.',
    pose: { f: [0, 1, 1, 1], th: { a: -8, c: 0.05 }, rot: -78 },
    checks: (q) => [
      [q.ext(0) && q.side(0), 'point your index sideways — flat, not up'],
      [q.all(q.fold, 1, 2, 3), 'curl middle, ring and pinky away'],
      [q.T.straight > 0.7 - 0.1 * q.A && q.thumbPar(0), 'thumb flat under your index, pointing the same way'],
    ],
  },
  H: {
    desc: 'Index + middle together, pointing sideways. The rest folds away.',
    pose: { f: [0, 0, 1, 1], spread: 0.05, th: { a: 40, c: 0.5 }, rot: -78 },
    checks: (q) => [
      [q.ext(0) && q.ext(1), 'straighten index AND middle'],
      [q.side(0) && q.side(1), 'point them sideways, not up'],
      [q.together(0, 1), 'keep the two fingers glued together'],
      [q.all(q.fold, 2, 3), 'curl ring and pinky away'],
    ],
  },
  I: {
    desc: 'Pinky up, everything else in a fist. Tiny letter, tiny finger.',
    pose: { f: [1, 1, 1, 0], th: { a: 55, c: 0.5 } },
    checks: (q) => [
      [q.ext(3) && q.up(3), 'pinky straight up!'],
      [q.all(q.fold, 0, 1, 2), 'curl index, middle and ring into a fist'],
      [q.T.pf.r < q.F.pf(5).r + 0.25, 'keep your thumb tucked in, not sticking out'],
    ],
  },
  K: {
    desc: 'Index and middle up in a V, thumb planted between them on the middle knuckle.',
    pose: { f: [0, 0, 1, 1], spread: 0.75, th: { a: 8, c: 0.15 } },
    checks: (q) => [
      [q.ext(0) && q.ext(1) && q.upish(0) && q.upish(1), 'index and middle up'],
      [q.apart(0, 1), 'spread the two fingers into a V'],
      [q.F.d3(4, 10) / q.F.scale < 0.55 + 0.15 * q.A, 'plant your thumb tip between them, on the middle finger’s knuckle'],
      [q.all(q.fold, 2, 3), 'ring and pinky down'],
    ],
  },
  L: {
    desc: 'Index up, thumb out to the side — an actual letter L.',
    pose: { f: [0, 1, 1, 1], th: { a: -82, c: 0 } },
    checks: (q) => [
      [q.ext(0) && q.up(0), 'index straight up'],
      [q.T.straight > 0.8 - 0.1 * q.A && q.angleDeg(q.T.dir, q.F.fingers[0].dir) > 45 && q.angleDeg(q.T.dir, q.F.fingers[0].dir) < 135, 'stick your thumb out sideways — make the corner of an L'],
      [q.all(q.fold, 1, 2, 3), 'curl middle, ring and pinky down'],
    ],
  },
  M: {
    desc: 'A fist with your thumb tucked under THREE fingers — its tip peeks out by the pinky.',
    pose: { f: [0.9, 0.9, 0.9, 1], th: { a: 62, c: 0.55 }, layer: 'back' },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'fold all four fingers down'],
      [q.T.pf.r < q.F.pf(13).r + 0.12 + 0.08 * q.A, 'slide your thumb under three fingers — tip peeks out by your pinky'],
      [q.T.pf.u > 0.25, 'thumb tip up at knuckle height, tucked under the fingers'],
    ],
  },
  N: {
    desc: 'Like M but under TWO fingers — thumb tip peeks out between middle and ring.',
    pose: { f: [0.9, 0.9, 1, 1], th: { a: 50, c: 0.55 }, layer: 'back' },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'fold all four fingers down'],
      [q.T.pf.r > q.F.pf(13).r - 0.18 && q.T.pf.r < q.F.pf(9).r + 0.15, 'tuck your thumb under two fingers — tip between middle and ring'],
      [q.T.pf.u > 0.25, 'thumb tip up at knuckle height, tucked under the fingers'],
    ],
  },
  O: {
    desc: 'All fingertips curve round to meet your thumb — a round O.',
    pose: { f: [0.55, 0.55, 0.55, 0.6], spread: 0.1, th: { a: 6, c: 0.45 } },
    checks: (q) => [
      [q.pinch(0, 0.5) && q.F.pinch(1) < 0.65 + 0.15 * q.A, 'bring ALL your fingertips round to meet your thumb'],
      [!q.all(q.fold, 0, 1) || q.F.fingers[0].straight > 0.45, 'keep it round like an O — not squeezed into a fist'],
      [q.together(0, 1) && q.together(1, 2), 'fingers together, one round rim'],
    ],
  },
  P: {
    desc: 'The K shape, tipped over to point at the floor.',
    pose: { f: [0, 0.05, 1, 1], spread: 0.6, th: { a: 8, c: 0.15 }, rot: 145 },
    checks: (q) => [
      [q.ext(0) && q.ext(1), 'index and middle straight (it’s K, tipped over)'],
      [q.down(1) || q.F.fingers[1].dir.y > 0.25, 'tip your hand forward — middle finger points at the floor'],
      [q.F.d3(4, 10) / q.F.scale < 0.6 + 0.15 * q.A, 'thumb tip on the middle finger’s knuckle'],
      [q.all(q.fold, 2, 3), 'ring and pinky stay curled'],
    ],
  },
  Q: {
    desc: 'The G pinch, hanging straight down.',
    pose: { f: [0, 1, 1, 1], th: { a: -8, c: 0.05 }, rot: 168 },
    checks: (q) => [
      [q.ext(0) && q.down(0), 'index points straight down'],
      [q.T.dir.y > 0.25 && q.thumbPar(0), 'thumb hangs down next to it, parallel'],
      [q.all(q.fold, 1, 2, 3), 'other fingers curl away'],
    ],
  },
  R: {
    desc: 'Fingers crossed! Index twists over your middle finger.',
    pose: { f: [0, 0, 1, 1], spread: 0.05, th: { a: 45, c: 0.5 }, cross: true },
    checks: (q) => [
      [q.ext(0) && q.ext(1) && q.upish(0) && q.upish(1), 'index and middle up'],
      [q.F.pf(8).r < q.F.pf(12).r + 0.05 * q.A, 'cross your index OVER your middle finger'],
      [q.F.gap(0, 1) < 0.55 + 0.1 * q.A, 'keep them wrapped tight'],
      [q.all(q.fold, 2, 3), 'ring and pinky down'],
    ],
  },
  S: {
    desc: 'A solid fist, thumb locked ACROSS the front of your fingers.',
    pose: { f: [1, 1, 1, 1], th: { a: 78, c: 0.45 }, layer: 'front' },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'squeeze all four fingers into a fist'],
      [q.T.pf.r < q.F.pf(9).r + 0.2, 'lock your thumb across the FRONT of the fist'],
      [q.T.pf.u > 0.2 && q.T.pf.u < 1.1, 'thumb rides across the middle of your fingers'],
    ],
  },
  T: {
    desc: 'Thumb pokes up between index and middle — like a tiny hitchhiker in a fist.',
    pose: { f: [0.9, 1, 1, 1], th: { a: 28, c: 0.35 } },
    checks: (q) => [
      [q.all(q.fold, 0, 1, 2, 3), 'fold all four fingers down'],
      [q.T.pf.r > q.F.pf(9).r - 0.12 && q.T.pf.r < q.F.pf(5).r + 0.25, 'poke your thumb up between index and middle'],
      [q.T.pf.u > 0.35, 'push the thumb tip up to knuckle height'],
    ],
  },
  U: {
    desc: 'Index + middle up, glued together. (Spread them and you get V.)',
    pose: { f: [0, 0, 1, 1], spread: 0.02, th: { a: 45, c: 0.5 } },
    checks: (q) => [
      [q.ext(0) && q.ext(1) && q.up(0) && q.up(1), 'index and middle straight up'],
      [q.together(0, 1), 'keep the two fingers glued together'],
      [q.all(q.fold, 2, 3), 'ring and pinky down'],
    ],
  },
  V: {
    desc: 'Peace sign ✌ — index + middle up and spread apart.',
    pose: { f: [0, 0, 1, 1], spread: 0.8, th: { a: 45, c: 0.5 } },
    checks: (q) => [
      [q.ext(0) && q.ext(1) && q.up(0) && q.up(1), 'index and middle straight up'],
      [q.apart(0, 1), 'spread them into a V'],
      [q.F.d3(4, 10) / q.F.scale > 0.5 - 0.1 * q.A, 'tuck your thumb down (touching the middle knuckle makes K)'],
      [q.all(q.fold, 2, 3), 'ring and pinky down'],
    ],
  },
  W: {
    desc: 'Three fingers up and spread — index, middle, ring. Pinky meets thumb.',
    pose: { f: [0, 0, 0, 1], spread: 0.55, th: { a: 48, c: 0.55 } },
    checks: (q) => [
      [q.all(q.ext, 0, 1, 2), 'index, middle AND ring up'],
      [q.fold(3), 'pinky folds down'],
      [q.apart(0, 1) && q.apart(1, 2), 'spread the three fingers — W has gaps'],
    ],
  },
  X: {
    desc: 'Index makes a hook, everything else in a fist. X marks the spot.',
    pose: { f: [0.4, 1, 1, 1], th: { a: 60, c: 0.5 }, hook: true },
    checks: (q) => [
      [!q.ext(0) && q.F.fingers[0].reach > 1.0 - 0.08 * q.A && q.F.fingers[0].reach < 1.75, 'bend your index into a hook — half-closed'],
      [q.all(q.fold, 1, 2, 3), 'curl the rest into a fist'],
      [q.F.pf(6).u > q.F.pf(5).u, 'hook points up, knuckle first'],
    ],
  },
  Y: {
    desc: 'Thumb and pinky out wide — hang loose 🤙.',
    pose: { f: [1, 1, 1, 0], spread: 0.3, th: { a: -85, c: 0 } },
    checks: (q) => [
      [q.ext(3), 'pinky out!'],
      [q.T.straight > 0.8 - 0.1 * q.A && q.T.pf.r > q.F.pf(5).r, 'thumb out wide the other way'],
      [q.all(q.fold, 0, 1, 2), 'middle three fingers stay down'],
      [q.F.d3(4, 20) / q.F.scale > 1.5 - 0.2 * q.A, 'stretch thumb and pinky apart — hang loose'],
    ],
  },
};

// verify the target letter against the live hand; returns {ok, tips: [failed…]}
function checkLetter(letter) {
  const q = makeQ(features());
  const rows = LETTERS[letter].checks(q);
  return { ok: rows.every((r) => r[0]), rows };
}

// ---- reference diagram (procedural FK hand) ---------------------------------
// Draws the letter's handshape from its pose spec. Fingers curl "over the
// palm": each joint rotates in-plane and foreshortens a little, so a full curl
// reads as a fist knuckle-row, a half curl as a C. Drawn as the MIRROR view —
// exactly what you see of your own hand in the camera — so players can copy
// it 1:1 (thumb side on the LEFT, like your right hand in a mirror).
function drawRef(letter) {
  const spec = LETTERS[letter].pose;
  const W = refCanvas.width, H = refCanvas.height;
  const c = refCtx;
  c.clearRect(0, 0, W, H);
  c.save();
  // rotated letters (G/H/P/Q) pivot around the canvas center at a smaller
  // scale so sideways/downward fingers stay in frame
  if (spec.rot) {
    c.translate(W / 2, H * 0.52);
    c.scale(1.35, 1.35);
    c.rotate((spec.rot * Math.PI) / 180);
    c.translate(0, 90);            // hand centroid (≈90 above wrist) stays centered
  } else {
    c.translate(W / 2, H * 0.86);
    c.scale(1.9, 1.9);
  }

  const stroke = (pts, w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  };

  // palm (wrist at origin, up = -y). Thumb side LEFT (mirror view).
  const mcp = [[-30, -88], [-10, -94], [10, -90], [28, -80]];   // index..pinky
  c.fillStyle = 'rgba(56,249,215,0.10)';
  c.strokeStyle = 'rgba(56,249,215,0.75)';
  c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-26, 0);
  c.quadraticCurveTo(-40, -40, mcp[0][0] - 4, mcp[0][1] + 6);
  c.lineTo(mcp[3][0] + 6, mcp[3][1] + 4);
  c.quadraticCurveTo(38, -36, 24, 2);
  c.quadraticCurveTo(0, 10, -26, 0);
  c.closePath();
  c.fill(); c.stroke();

  // finger FK: base splay + per-joint in-plane bend from curl
  const segLens = [[34, 22, 17], [38, 24, 18], [34, 22, 17], [26, 17, 13]];
  const splayBase = [-7, -1, 6, 13];
  const finger = (f) => {
    const curl = spec.f[f];
    const spr = (spec.spread ?? 0.25);
    let ang = (-90 + splayBase[f] * (0.4 + spr * 2.2)) * Math.PI / 180;
    if (spec.cross && f === 0) ang += 0.38;           // R: index leans over middle
    if (spec.cross && f === 1) ang -= 0.06;
    let x = mcp[f][0], y = mcp[f][1];
    const pts = [[x, y]];
    const bends = spec.hook && f === 0 ? [0.15, 1.25, 1.1] : [1.0, 1.05, 0.7];
    for (let s = 0; s < 3; s++) {
      ang += curl * bends[s] * 1.05;
      const len = segLens[f][s] * (1 - 0.35 * curl);
      x += Math.cos(ang) * len; y += Math.sin(ang) * len;
      pts.push([x, y]);
    }
    return pts;
  };

  // thumb FK: angle a (0 = up, negative = out to the side, positive = across)
  const thumbPts = () => {
    const t = spec.th || { a: -20, c: 0.2 };
    let ang = (-90 + t.a) * Math.PI / 180;
    let x = -30, y = -42;
    const pts = [[x, y]];
    for (const [len, bend] of [[30, 0.9], [24, 1.1]]) {
      ang += t.c * bend;
      const l = len * (1 - 0.3 * t.c);
      x += Math.cos(ang) * l; y += Math.sin(ang) * l;
      pts.push([x, y]);
    }
    return pts;
  };

  const drawFinger = (pts, dim) => {
    stroke(pts, 10, dim ? 'rgba(56,249,215,0.35)' : 'rgba(56,249,215,0.85)');
    const tip = pts[pts.length - 1];
    c.fillStyle = dim ? 'rgba(255,75,216,0.4)' : '#ff4bd8';
    c.beginPath(); c.arc(tip[0], tip[1], 3.4, 0, Math.PI * 2); c.fill();
  };

  const th = thumbPts();
  if ((spec.layer || 'mid') === 'back') drawFinger(th, true);   // tucked under fingers
  const order = spec.cross ? [3, 2, 0, 1] : [3, 2, 1, 0];       // draw index last (on top)
  for (const f of order) drawFinger(finger(f), false);
  if ((spec.layer || 'mid') !== 'back') drawFinger(th, false);

  c.restore();

  // orientation arrow for rotated letters
  if (spec.rot) {
    c.save();
    c.strokeStyle = '#ffcf5a'; c.fillStyle = '#ffcf5a'; c.lineWidth = 3;
    const ax = W - 34, ay = 34, a = ((spec.rot - 90) * Math.PI) / 180;
    c.translate(ax, ay); c.rotate(a);
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(10, 0); c.stroke();
    c.beginPath(); c.moveTo(10, -6); c.lineTo(20, 0); c.lineTo(10, 6); c.closePath(); c.fill();
    c.restore();
  }
}

// ---- progress ---------------------------------------------------------------
const SAVE_KEY = 'hs_asl_v1';
let progress = { xp: 0, units: {} };
try { progress = { ...progress, ...(JSON.parse(localStorage.getItem(SAVE_KEY)) || {}) }; } catch (e) {}
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch (e) {} };

// ---- lesson map -------------------------------------------------------------
const mapEl = $('map'), unitsEl = $('units'), gridEl = $('practice-grid');

function unitUnlocked(i) {
  return i === 0 || (progress.units[UNITS[i - 1].id] && progress.units[UNITS[i - 1].id].done);
}

function buildMap() {
  $('xp-total').textContent = `✦ ${progress.xp} XP`;
  unitsEl.innerHTML = '';
  UNITS.forEach((u, i) => {
    const done = progress.units[u.id] && progress.units[u.id].done;
    const unlocked = unitUnlocked(i);
    const el = document.createElement('button');
    el.className = 'unit panel' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
    el.innerHTML = `
      <div class="num">${done ? '✓' : i + 1}</div>
      <div>
        <div class="t">${u.name}</div>
        <div class="d">${u.letters.join(' · ')} — then spell “${u.word}”</div>
      </div>
      <div class="st">${done ? 'again ↻' : unlocked ? 'start →' : '🔒'}</div>`;
    if (unlocked) el.addEventListener('click', () => startLesson(u));
    unitsEl.appendChild(el);
  });

  gridEl.innerHTML = '';
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const b = document.createElement('button');
    b.textContent = ch;
    if (LETTERS[ch]) b.addEventListener('click', () => startPractice(ch));
    else { b.className = 'soon'; b.title = 'motion letter — coming soon'; }
    gridEl.appendChild(b);
  }
}

// ---- lesson state machine ----------------------------------------------------
const promptEl = $('prompt'), ringEl = $('ring'), ringLetter = ringEl.querySelector('.inner');
const taskEl = $('task'), wordStrip = $('word-strip');
const refEl = $('ref'), refDesc = $('ref-desc'), hintBtn = $('hint-btn');
const tipsEl = $('tips'), barFill = document.querySelector('#bar > div');
const streakEl = $('streak'), doneEl = $('done');

let session = null;   // { steps, idx, unit?, practice?, xp, streak, hold, stepStart, hintShown, wordIdx }
let flashUntil = 0;   // "correct!" pause between steps
const tipFailSince = new Map();   // tip text -> first-failed timestamp (anti-flicker)

function shuffled(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function buildSteps(unit) {
  const steps = [];
  unit.letters.forEach((L, i) => {
    steps.push({ type: 'learn', letter: L });
    if (i % 2 === 1) {                       // quick recall of a letter so far
      const pool = unit.letters.slice(0, i + 1);
      steps.push({ type: 'quiz', letter: pool[Math.floor(Math.random() * pool.length)] });
    }
  });
  for (const L of shuffled(unit.letters)) steps.push({ type: 'quiz', letter: L });
  if (unit.word) steps.push({ type: 'word', word: unit.word });
  return steps;
}

function startLesson(unit) {
  session = {
    unit, steps: buildSteps(unit), idx: 0,
    xp: 0, streak: 0, hold: 0, stepStart: performance.now(),
    hintShown: false, wordIdx: 0, practice: null,
  };
  document.body.classList.remove('on-map');
  enterStep();
}

function startPractice(letter) {
  session = {
    unit: null, practice: letter, steps: [{ type: 'learn', letter }], idx: 0,
    xp: 0, streak: 0, hold: 0, stepStart: performance.now(),
    hintShown: false, wordIdx: 0,
  };
  document.body.classList.remove('on-map');
  enterStep();
}

function step() { return session.steps[session.idx]; }
function stepLetter() {
  const s = step();
  return s.type === 'word' ? s.word[session.wordIdx] : s.letter;
}

function enterStep() {
  const s = step();
  session.hold = 0;
  session.hintShown = false;
  session.stepStart = performance.now();
  tipFailSince.clear();
  lastTipText = '';
  tipsEl.textContent = '';
  tipsEl.classList.remove('ok');
  promptEl.classList.remove('good');
  wordStrip.innerHTML = '';

  if (s.type === 'learn') {
    taskEl.innerHTML = `Copy the sign for <span class="g">${s.letter}</span>` +
      (session.practice ? ' — free practice, leave whenever' : '');
    showRef(s.letter, true);
  } else if (s.type === 'quiz') {
    taskEl.innerHTML = `From memory: sign <span class="g">${s.letter}</span>`;
    showRef(s.letter, false);
  } else {
    session.wordIdx = 0;
    taskEl.innerHTML = `Spell the word — hold each letter`;
    renderWordStrip();
    showRef(stepLetter(), false);
  }
  ringLetter.textContent = stepLetter();
  const total = session.steps.length;
  barFill.style.width = `${(session.idx / total) * 100}%`;
  streakEl.textContent = session.streak > 1 ? `🔥${session.streak}` : '';
}

function renderWordStrip() {
  const s = step();
  wordStrip.innerHTML = s.word.split('').map((ch, i) =>
    `<span class="${i < session.wordIdx ? 'done' : i === session.wordIdx ? 'cur' : 'todo'}">${ch}</span>`
  ).join('');
}

function showRef(letter, visible) {
  refDesc.textContent = LETTERS[letter].desc;
  drawRef(letter);
  refEl.classList.toggle('hidden', !visible);
  hintBtn.classList.toggle('hidden', visible);
}
hintBtn.addEventListener('click', () => {
  session.hintShown = true;
  showRef(stepLetter(), true);
});

function passStep(now) {
  const s = step();
  if (s.type === 'word') {
    session.xp += XP_WORD_LETTER;
    session.wordIdx++;
    if (session.wordIdx < s.word.length) {
      dingWord();
      session.hold = 0;
      ringLetter.textContent = stepLetter();
      showRef(stepLetter(), session.hintShown);
      renderWordStrip();
      tipFailSince.clear();
      return;
    }
  } else {
    session.xp += s.type === 'learn' ? XP_LEARN : XP_QUIZ;
  }
  session.streak++;
  dingPass();
  flashUntil = now + 650;
  tipsEl.textContent = '✓ nice!';
  tipsEl.classList.add('ok');
  promptEl.classList.add('good');
}

function advance() {
  session.idx++;
  if (session.idx >= session.steps.length) {
    if (session.practice) { enterStepAgain(); return; }   // practice loops forever
    finishLesson();
  } else {
    enterStep();
  }
}
function enterStepAgain() { session.idx = 0; enterStep(); }

function finishLesson() {
  const u = session.unit;
  progress.xp += session.xp;
  progress.units[u.id] = { done: true };
  save();
  fanfare();
  const known = UNITS.filter((x) => progress.units[x.id] && progress.units[x.id].done)
    .reduce((n, x) => n + x.letters.length, 0);
  $('done-title').innerHTML = 'LESSON<br>COMPLETE!';
  $('done-stats').innerHTML =
    `<b>+${session.xp} XP</b> earned<br>` +
    `you can now fingerspell with <b>${known}</b> of 26 letters 🤟`;
  doneEl.classList.add('open');
}
$('done-again').addEventListener('click', () => {
  doneEl.classList.remove('open');
  startLesson(session.unit);
});
$('done-map').addEventListener('click', () => {
  doneEl.classList.remove('open');
  toMap();
});

function toMap() {
  session = null;
  buildMap();
  document.body.classList.add('on-map');
}
$('quit').addEventListener('click', toMap);

// ---- per-frame check + coaching ----------------------------------------------
function updatePlay(now, dt) {
  if (!session || session.idx >= session.steps.length) return;
  if (now < flashUntil) return;                 // little "✓ nice!" pause
  if (flashUntil && now >= flashUntil) { flashUntil = 0; advance(); return; }

  const s = step();
  const holdNeed = s.type === 'word' ? WORD_HOLD_MS : HOLD_MS;

  // quiz: struggling for a while -> auto-hint with the diagram
  if (s.type !== 'learn' && !session.hintShown && now - session.stepStart > HINT_AFTER_MS) {
    session.hintShown = true;
    showRef(stepLetter(), true);
  }

  if (!handVisible(now)) {
    session.hold = 0;
    setTips(now, [[false, 'show me one hand, palm to the camera 🖐']]);
    setRing(0, false);
    return;
  }

  let ok = false, rows = [];
  try {
    ({ ok, rows } = checkLetter(stepLetter()));
  } catch (e) { /* one bad frame shouldn't kill the loop */ }

  if (ok) {
    session.hold += dt;
    setTips(now, [], true);
    if (session.hold >= holdNeed) { passStep(now); setRing(1, true); return; }
  } else {
    session.hold = Math.max(0, session.hold - dt * 3.3);   // drain, don't reset
  }
  setRing(Math.min(1, session.hold / holdNeed), ok);
  if (!ok) setTips(now, rows);
}

function setRing(t, good) {
  const col = good ? 'var(--good)' : 'var(--neon)';
  ringEl.style.background =
    `conic-gradient(${col} ${t * 100}%, rgba(56,249,215,0.12) ${t * 100}%)`;
  ringLetter.style.color = good ? 'var(--good)' : 'var(--neon)';
}

// Coaching: show the first 1-2 checks that have been failing for a moment
// (TIP_STABLE_MS) so tips don't flicker as the hand moves between frames.
let lastTipText = '';
function setTips(now, rows, holdingOk = false) {
  if (holdingOk) {
    if (lastTipText !== 'hold') {
      tipsEl.textContent = 'hold it… ✋';
      tipsEl.classList.add('ok');
      lastTipText = 'hold';
    }
    return;
  }
  tipsEl.classList.remove('ok');
  const failing = [];
  for (const [pass, tip] of rows) {
    if (pass) { tipFailSince.delete(tip); continue; }
    if (!tipFailSince.has(tip)) tipFailSince.set(tip, now);
    if (now - tipFailSince.get(tip) > TIP_STABLE_MS) failing.push(tip);
  }
  const text = failing.slice(0, 2).join('  ·  ');
  if (text !== lastTipText) {
    tipsEl.textContent = text;
    lastTipText = text;
  }
}

// ---- render loop ---------------------------------------------------------------
function resize() {
  canvas.width = innerWidth * Math.min(devicePixelRatio || 1, 2);
  canvas.height = innerHeight * Math.min(devicePixelRatio || 1, 2);
}
addEventListener('resize', resize);

function drawVideo() {
  const cw = canvas.width, ch = canvas.height;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) { ctx.fillStyle = '#07080f'; ctx.fillRect(0, 0, cw, ch); return null; }
  const s = Math.max(cw / vw, ch / vh);
  const dw = vw * s, dh = vh * s;
  const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
  ctx.save();
  ctx.translate(cw, 0); ctx.scale(-1, 1);              // selfie mirror
  ctx.drawImage(video, ox, oy, dw, dh);
  ctx.restore();
  ctx.fillStyle = 'rgba(4,5,11,0.35)';                 // dim so the HUD reads
  ctx.fillRect(0, 0, cw, ch);
  return { ox, oy, dw, dh };
}

function drawHand(map, now, good) {
  if (!map || !handVisible(now)) return;
  const X = (p) => map.ox + p.x * map.dw;
  const Y = (p) => map.oy + p.y * map.dh;
  const u = Math.max(2, canvas.height * 0.004);
  ctx.strokeStyle = good ? 'rgba(125,255,138,0.9)' : 'rgba(56,249,215,0.85)';
  ctx.lineWidth = u * 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(X(lm[a]), Y(lm[a]));
    ctx.lineTo(X(lm[b]), Y(lm[b]));
  }
  ctx.stroke();
  ctx.fillStyle = good ? '#7dff8a' : '#ff4bd8';
  for (const p of lm) {
    ctx.beginPath(); ctx.arc(X(p), Y(p), u, 0, Math.PI * 2); ctx.fill();
  }
}

function drawDebug(now) {
  if (!debug || !session || session.idx >= session.steps.length || !handVisible(now)) return;
  let rows = [];
  try { rows = checkLetter(stepLetter()).rows; } catch (e) { return; }
  ctx.font = `${Math.round(canvas.height * 0.022)}px VT323, monospace`;
  ctx.textBaseline = 'top';
  const x = 14, lh = canvas.height * 0.026;
  let y = canvas.height * 0.3;
  for (const [pass, tip] of rows) {
    ctx.fillStyle = pass ? 'rgba(125,255,138,0.9)' : 'rgba(255,143,143,0.9)';
    ctx.fillText(`${pass ? '✓' : '✗'} ${tip}`, x, y);
    y += lh;
  }
}

let holdOk = false;
let prevNow = 0;
function loop(now) {
  const dt = Math.min(prevNow ? now - prevNow : 16.7, 100);   // ms, real frame time
  prevNow = now;
  try {
    updateHand(now);
    const map = drawVideo();
    if (session) {
      updatePlay(now, dt);
      holdOk = false;
      if (session && session.idx < session.steps.length && handVisible(now)) {
        try { holdOk = checkLetter(stepLetter()).ok; } catch (e) {}
      }
    }
    drawHand(map, now, holdOk);
    drawDebug(now);
  } catch (err) {
    console.error('frame error (continuing):', err);
  }
  requestAnimationFrame(loop);
}

// ---- settings panel -------------------------------------------------------------
$('panel-btn').addEventListener('click', () => $('panel').classList.toggle('open'));
const assistEl = $('assist'), assistVal = $('v-assist');
assistEl.value = assist;
const updAssist = () => { assist = parseFloat(assistEl.value); assistVal.textContent = assist.toFixed(2); };
assistEl.addEventListener('input', updAssist); updAssist();
$('sound').addEventListener('click', (e) => {
  soundOn = !soundOn;
  e.target.classList.toggle('on', soundOn);
  e.target.textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`;
});
$('debug').addEventListener('click', (e) => {
  debug = !debug;
  e.target.classList.toggle('on', debug);
  e.target.textContent = `CHECK DEBUG: ${debug ? 'ON' : 'OFF'}`;
});
