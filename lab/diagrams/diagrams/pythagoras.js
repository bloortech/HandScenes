// Pythagoras and the monochord: string-length ratios make the consonances
// (octave, fifth, fourth), and Pythagoras read that as proof the cosmos
// itself was ordered by number — "the harmony of the spheres".
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

const RATIOS = [
  { id: "1:1", num: 1, den: 1, name: "unison", desc: "the same string, the same note" },
  { id: "2:1", num: 2, den: 1, name: "octave", desc: "half the string, double the frequency" },
  { id: "3:2", num: 3, den: 2, name: "fifth", desc: "the most consonant ratio after the octave" },
  { id: "4:3", num: 4, den: 3, name: "fourth", desc: "a slightly tighter interval" },
  { id: "9:8", num: 9, den: 8, name: "whole tone", desc: "a small step, still a clean ratio" },
];

export const id = "pythagoras";
export const shelf = "vervaeke";
export const title = "Pythagoras and the monochord";
export const source = "Awakening from the Meaning Crisis, episode 4 (John Vervaeke, 2019)";
export const cite = "Vervaeke, Awakening from the Meaning Crisis, ep. 4: Pythagoras & Socrates";
export const blurb =
  "Pythagoras found that stopping a vibrating string at simple fractions of its length " +
  "(1/2, 2/3, 3/4) produces the notes that sound most pleasing together. Because a messy " +
  "physical thing like a plucked string obeyed clean whole-number ratios, he took it as " +
  "evidence that number itself was the hidden order behind the whole cosmos, not just music. " +
  "That leap, from a vibrating string to the structure of reality, is where the Western idea " +
  "of a rationally ordered universe begins.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <div class="ratio-btns"></div>
      <button class="play" type="button">Pluck</button>
    `,
  });
  const btnRow = controls.querySelector(".ratio-btns");
  RATIOS.forEach((r, i) => {
    const b = document.createElement("button");
    b.textContent = r.id;
    b.dataset.i = i;
    if (i === 0) b.classList.add("on");
    btnRow.appendChild(b);
  });
  const playBtn = controls.querySelector(".play");

  let current = 0;
  let audioCtx = null;
  let pluckT = -1; // ms since last pluck, -1 = idle

  btnRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    current = Number(btn.dataset.i);
    [...btnRow.children].forEach((c) => c.classList.toggle("on", c === btn));
    pluckT = 0;
  });

  playBtn.addEventListener("click", () => {
    pluckT = 0;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const base = 220; // A3, arbitrary but musical
      const r = RATIOS[current];
      const freq = base * (r.num / r.den);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.1);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1.15);
    } catch {
      // WebAudio unavailable (e.g. headless screenshot) — animation still runs.
    }
  });

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((tMs) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      const r = RATIOS[current];
      const stringY = h * 0.42;
      const left = w * 0.1;
      const right = w * 0.9;
      const len = right - left;
      const nodeX = left + (len * 1) / r.num; // first internal node for this ratio

      // the string, vibrating as a standing wave scaled by the ratio
      const age = pluckT < 0 ? 999 : (tMs - pluckT) / 1000;
      const decay = pluckT < 0 ? 0 : Math.exp(-age * 1.4);
      const amp = 10 * decay;
      ctx.beginPath();
      const segs = 120;
      for (let i = 0; i <= segs; i++) {
        const x = left + (len * i) / segs;
        const phase = (i / segs) * Math.PI * r.num;
        const y = stringY + Math.sin(phase) * amp * Math.sin(tMs / 90);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgbCss(AMBER, 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();

      // bridge / stop point marking the ratio's division
      ctx.beginPath();
      ctx.moveTo(nodeX, stringY - 26);
      ctx.lineTo(nodeX, stringY + 26);
      ctx.strokeStyle = rgbCss(CYAN, 0.6);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = "11px monospace";
      ctx.fillStyle = rgbCss(CYAN, 0.9);
      ctx.fillText(`stop at ${r.den}/${r.num}`, nodeX - 24, stringY - 32);

      // endpoints
      ctx.fillStyle = INK + "0.5)";
      ctx.beginPath(); ctx.arc(left, stringY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(right, stringY, 3, 0, Math.PI * 2); ctx.fill();

      // label
      ctx.font = "13px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.85)";
      ctx.fillText(`${r.id}: the ${r.name}`, left, stringY + 60);
      ctx.font = "12px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.5)";
      ctx.fillText(r.desc, left, stringY + 80);

      // cosmos hint: concentric orbits scaled by the same ratios, bottom strip
      const cy = h * 0.82;
      const cx = w * 0.5;
      ctx.font = "10px monospace";
      ctx.fillStyle = INK + "0.35)";
      ctx.fillText("the same ratios, read as the order of the heavens:", left, cy - 18);
      RATIOS.forEach((rr, i) => {
        const radius = 10 + i * 9 * (rr.num / rr.den) * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy + 20, Math.min(radius, h * 0.14), 0, Math.PI * 2);
        ctx.strokeStyle = i === current ? rgbCss(AMBER, 0.7) : INK + "0.15)";
        ctx.lineWidth = i === current ? 1.6 : 1;
        ctx.stroke();
      });
    });
  });

  return () => stop();
}
