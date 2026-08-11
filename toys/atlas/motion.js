// ============================================================
//  Live Motion — MediaPipe Pose + Face + Hands → anatomy overlay
//  Tracks the body, face mesh and both hands on-device and labels
//  joints, bones, the skull and facial/skeletal muscles in real time.
//  Runs entirely in the browser (webcam frames never leave the device).
//  Loaded lazily so the page stays light until the user opts in.
// ============================================================

// Paths are absolute, not page-relative: this toy lives at /toys/atlas/, so the
// source build's relative paths would resolve to /toys/atlas/models/... and 404.
// Matches how every other HandScenes toy loads MediaPipe.
import {
  FilesetResolver, PoseLandmarker, FaceLandmarker, HandLandmarker,
} from '/vendor/mediapipe/tasks-vision.mjs';

const WASM_PATH = '/vendor/mediapipe/wasm';
const MODELS = {
  pose: '/models/pose_landmarker_lite.task',
  face: '/models/face_landmarker.task',
  hand: '/models/hand_landmarker.task',
};

// ---- Pose (33-landmark) anatomy maps -------------------------
// Long bones labelled once (on the even-index side) to limit clutter.
const POSE_BONES_SIDE = [
  { a: 12, b: 14, name: 'Humerus' },
  { a: 14, b: 16, name: 'Radius / ulna' },
  { a: 24, b: 26, name: 'Femur' },
  { a: 26, b: 28, name: 'Tibia / fibula' },
];
const POSE_BONES_MID = [
  { a: 11, b: 12, name: 'Clavicle' },
  { a: 23, b: 24, name: 'Pelvis' },
];
// Joints — labelled on BOTH sides (elbow, knee, etc.)
const POSE_JOINTS = [
  { i: [11, 12], name: 'Shoulder' },
  { i: [13, 14], name: 'Elbow' },
  { i: [15, 16], name: 'Wrist' },
  { i: [23, 24], name: 'Hip' },
  { i: [25, 26], name: 'Knee' },
  { i: [27, 28], name: 'Ankle' },
];
const POSE_MUSCLES = [
  { a: 12, b: 14, name: 'Biceps brachii' },
  { a: 24, b: 26, name: 'Quadriceps' },
  { a: 26, b: 28, name: 'Gastrocnemius' },
];
// Face-landmark anchors (indices in the 478-point mesh)
const FACE_BONES = { 10: 'Frontal bone', 152: 'Mandible', 234: 'Zygomatic bone' };
const FACE_MUSCLES = { 67: 'Frontalis', 130: 'Orbicularis oculi', 61: 'Orbicularis oris', 434: 'Masseter' };

export function createMotion({ video, canvas, statusEl }) {
  const ctx = canvas.getContext('2d');
  const layers = { bones: true, joints: true, muscles: true, face: true, hands: true };

  let pose = null, face = null, hand = null;
  let CONN = {};
  let stream = null, raf = null, running = false, lastVideoTime = -1;

  // GPU is fast but unsupported on some devices (esp. iOS Safari) — fall back to CPU.
  async function make(files, Cls, path, opts) {
    const build = (delegate) => Cls.createFromOptions(files, {
      baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...opts,
    });
    try { return await build('GPU'); }
    catch (e) { return await build('CPU'); }
  }

  async function ensureModels() {
    if (pose) return;
    const files = await FilesetResolver.forVisionTasks(WASM_PATH);

    statusEl.textContent = 'Loading pose model…';
    pose = await make(files, PoseLandmarker, MODELS.pose, { numPoses: 1 });
    CONN.pose = PoseLandmarker.POSE_CONNECTIONS;

    // Face + hands are best-effort — if either fails we still run pose.
    try {
      statusEl.textContent = 'Loading face-mesh model…';
      face = await make(files, FaceLandmarker, MODELS.face, {
        numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      });
      CONN.faceTess = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
      CONN.faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
      CONN.faceParts = [
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
      ];
    } catch (e) { face = null; }

    try {
      statusEl.textContent = 'Loading hand model…';
      hand = await make(files, HandLandmarker, MODELS.hand, { numHands: 2 });
      CONN.hand = HandLandmarker.HAND_CONNECTIONS;
    } catch (e) { hand = null; }
  }

  // ---- drawing helpers ----
  let W = 0, H = 0;
  const px = (p) => p.x * W;
  const py = (p) => p.y * H;

  function strokeConns(lm, conns, style, lw) {
    if (!conns) return;
    ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath();
    for (const c of conns) {
      const a = lm[c.start], b = lm[c.end];
      if (!a || !b) continue;
      ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b));
    }
    ctx.stroke();
  }
  function dot(p, r, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(px(p), py(p), r, 0, Math.PI * 2); ctx.fill();
  }
  // Text is un-mirrored (canvas is CSS-flipped) so it reads correctly.
  // VT323 is a bitmap face and reads small, so labels are drawn ~1.5x the
  // source build's sizes to stay legible over live video.
  function label(x, y, text, fg, bg, size) {
    const fs = Math.round(size * 1.5);
    ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
    ctx.font = `${fs}px VT323, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    // Box tracks the drawn font size, not the caller's nominal size, or the
    // enlarged text overflows its backing plate and turns unreadable on video.
    ctx.fillStyle = bg; ctx.fillRect(-tw / 2 - 5, -fs * 0.72, tw + 10, fs * 1.44);
    ctx.fillStyle = fg; ctx.fillText(text, 0, 1);
    ctx.restore();
  }
  const mid = (lm, a, b) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2 });

  function drawFace(lm) {
    if (layers.face) {
      strokeConns(lm, CONN.faceTess, 'rgba(120,200,220,0.30)', 0.6);      // mesh
      strokeConns(lm, CONN.faceOval, 'rgba(56,249,215,0.85)', 2);          // skull outline
      for (const parts of (CONN.faceParts || [])) strokeConns(lm, parts, 'rgba(56,249,215,0.85)', 1.4);
      for (const [i, name] of Object.entries(FACE_BONES)) {
        const p = lm[i]; if (p) label(px(p), py(p), name, '#fff', 'rgba(7,8,15,0.86)', 11);
      }
    }
    if (layers.muscles) {
      for (const [i, name] of Object.entries(FACE_MUSCLES)) {
        const p = lm[i]; if (p) label(px(p), py(p), name, '#fff', 'rgba(255,75,216,0.92)', 10);
      }
    }
  }

  function drawPose(lm) {
    if (layers.bones) {
      strokeConns(lm, CONN.pose, 'rgba(56,249,215,0.9)', 4);
      for (const s of POSE_BONES_SIDE) { const m = mid(lm, s.a, s.b); if (lm[s.a] && lm[s.b]) label(px(m), py(m), s.name, '#fff', 'rgba(7,8,15,0.86)', 11); }
      for (const s of POSE_BONES_MID) { const m = mid(lm, s.a, s.b); if (lm[s.a] && lm[s.b]) label(px(m), py(m), s.name, '#fff', 'rgba(7,8,15,0.86)', 11); }
    }
    if (layers.muscles) {
      for (const s of POSE_MUSCLES) { const m = mid(lm, s.a, s.b); if (lm[s.a] && lm[s.b]) label(px(m), py(m), s.name, '#fff', 'rgba(255,75,216,0.92)', 10); }
    }
    if (layers.joints) {
      for (const j of POSE_JOINTS) for (const idx of j.i) {
        const p = lm[idx]; if (!p) continue;
        dot(p, 6, '#38f9d7');
        label(px(p) + 0, py(p) - 14, j.name, '#d7fff6', 'rgba(7,8,15,0.88)', 10);
      }
    }
  }

  function drawHands(hands) {
    if (!layers.hands || !hands) return;
    for (const lm of hands) {
      strokeConns(lm, CONN.hand, 'rgba(56,249,215,0.9)', 3);
      for (const p of lm) dot(p, 3, 'rgba(56,249,215,0.9)');
      if (lm[0]) label(px(lm[0]), py(lm[0]) + 14, 'Carpals', '#d7fff6', 'rgba(7,8,15,0.88)', 9);
      if (lm[9]) label(px(lm[9]), py(lm[9]), 'Metacarpals & phalanges', '#d7fff6', 'rgba(7,8,15,0.88)', 9);
    }
  }

  function render(poseRes, faceRes, handRes) {
    ctx.clearRect(0, 0, W, H);
    if (faceRes && faceRes.faceLandmarks) for (const lm of faceRes.faceLandmarks) drawFace(lm);
    if (poseRes && poseRes.landmarks && poseRes.landmarks.length) drawPose(poseRes.landmarks[0]);
    drawHands(handRes && handRes.landmarks);
  }

  function sizeCanvas() {
    const r = canvas.getBoundingClientRect();
    canvas.width = W = Math.round(r.width);
    canvas.height = H = Math.round(r.height);
  }

  function tick() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const ts = performance.now();
      let poseRes = null, faceRes = null, handRes = null;
      try { if (pose) poseRes = pose.detectForVideo(video, ts); } catch (e) {}
      try { if (face) faceRes = face.detectForVideo(video, ts); } catch (e) {}
      try { if (hand) handRes = hand.detectForVideo(video, ts); } catch (e) {}
      render(poseRes, faceRes, handRes);
      const seen = (poseRes && poseRes.landmarks && poseRes.landmarks.length);
      statusEl.textContent = seen
        ? 'Tracking your body, face and hands. Move to explore.'
        : 'Step back so your whole body fits in frame.';
    }
    raf = requestAnimationFrame(tick);
  }

  async function start() {
    if (running) return true;
    try {
      await ensureModels();
      statusEl.textContent = 'Requesting camera…';
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      sizeCanvas();
      running = true; lastVideoTime = -1;
      statusEl.textContent = 'Tracking…';
      tick();
      return true;
    } catch (err) {
      const msg = err && err.name === 'NotAllowedError'
        ? 'Camera permission denied.'
        : (navigator.mediaDevices ? 'Could not start camera / models. Check your connection.' : 'Camera not available in this browser.');
      statusEl.textContent = msg;
      stop();
      return false;
    }
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { video.pause(); video.srcObject = null; }
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', () => { if (running) sizeCanvas(); });

  return {
    start, stop,
    isRunning: () => running,
    setLayer: (name, on) => { if (name in layers) layers[name] = on; },
  };
}
