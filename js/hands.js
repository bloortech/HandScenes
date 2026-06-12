// Webcam + MediaPipe Tasks HandLandmarker (browser edition of hand_tracker.py).
// Exposes per-frame smoothed landmarks for up to 2 hands, mirrored to selfie view.

import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const SMOOTHING = 0.45;       // 0 = frozen, 1 = raw (per-frame lerp toward new data)
const LOST_AFTER_MS = 250;    // drop a hand slot if unseen this long
const TIP_IDS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export async function createHands(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'models/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  // Persistent slots keyed by handedness so scenes get stable hand identity.
  // slots[label] = { landmarks: [{x,y,z}*21], tips: [{x,y,z,vx,vy,speed}*5], lastSeen }
  const slots = new Map();
  let lastVideoTime = -1;

  function update(nowMs) {
    if (video.readyState < 2 || video.currentTime === lastVideoTime) {
      return current(nowMs);
    }
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, nowMs);

    for (let h = 0; h < result.landmarks.length; h++) {
      const label = result.handednesses[h][0].categoryName; // 'Left' | 'Right'
      const raw = result.landmarks[h];
      let slot = slots.get(label);
      if (!slot || nowMs - slot.lastSeen > LOST_AFTER_MS) {
        slot = {
          landmarks: raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
          tips: TIP_IDS.map(() => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 0 })),
          lastSeen: nowMs,
        };
        slots.set(label, slot);
      }
      const dt = Math.max((nowMs - slot.lastSeen) / 1000, 1 / 120);
      for (let i = 0; i < raw.length; i++) {
        const p = slot.landmarks[i];
        p.x += ((1 - raw[i].x) - p.x) * SMOOTHING; // mirror x for selfie view
        p.y += (raw[i].y - p.y) * SMOOTHING;
        p.z += (raw[i].z - p.z) * SMOOTHING;
      }
      for (let i = 0; i < TIP_IDS.length; i++) {
        const lm = slot.landmarks[TIP_IDS[i]];
        const tip = slot.tips[i];
        tip.vx = (lm.x - tip.x) / dt;
        tip.vy = (lm.y - tip.y) / dt;
        tip.x = lm.x;
        tip.y = lm.y;
        tip.z = lm.z;
        tip.speed = Math.hypot(tip.vx, tip.vy);
      }

      // gestures, normalized by hand size so camera distance doesn't matter
      const lm = slot.landmarks;
      const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
      const scale = d(0, 9) || 1e-3; // wrist -> middle knuckle
      const reach = (d(0, 8) + d(0, 12) + d(0, 16) + d(0, 20)) / 4 / scale;
      slot.openness = clamp01((reach - 1.1) / (2.0 - 1.1)); // fist=0, open=1
      slot.pinch = clamp01((d(4, 8) / scale - 0.2) / (1.1 - 0.2)); // closed=0, spread=1

      slot.lastSeen = nowMs;
    }
    return current(nowMs);
  }

  function current(nowMs) {
    const hands = [];
    for (const [label, slot] of slots) {
      if (nowMs - slot.lastSeen > LOST_AFTER_MS) {
        slots.delete(label);
        continue;
      }
      hands.push({
        label,
        landmarks: slot.landmarks,
        tips: slot.tips,
        openness: slot.openness ?? 0,
        pinch: slot.pinch ?? 0,
      });
    }
    return hands;
  }

  return { update };
}
