// The droplet: a single two-metre Trisolaran probe, a perfect mirror made of
// matter bonded by the strong force, destroys Earth's entire combined fleet
// of nearly 2,000 warships in under an hour, simply by ramming through them.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss, easeOutCubic } from "../lib/canvas-utils.js";

export const id = "droplet";
export const shelf = "threebody";
export const spoilerBook = 2;
export const title = "The droplet";
export const source = "Liu Cixin, The Dark Forest (2008), the Doomsday Battle";
export const cite = "Liu Cixin, The Dark Forest, the Doomsday Battle (fleet destruction near Jupiter)";
export const blurb =
  "The droplet is two metres long, perfectly smooth, and looks harmless. It's actually matter " +
  "held together by the strong nuclear force instead of chemical bonds, making it close to " +
  "indestructible and able to move fast enough to ram through a warship's hull like paper. " +
  "One droplet, with no visible weapon at all, tears through Earth's combined fleet, over six " +
  "hundred ships in about thirteen minutes, just by flying in straight lines. Press launch to " +
  "watch it make a single pass.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <button class="launch" type="button">Launch the droplet</button>
      <label>Ships destroyed: <span class="count">0</span> / <span class="total">24</span></label>
    `,
  });
  const launchBtn = controls.querySelector(".launch");
  const countEl = controls.querySelector(".count");

  const SHIP_COUNT = 24;
  let ships = [];
  let dropletT = -1; // ms since launch, -1 idle
  let destroyed = 0;
  let path = [];

  function seedShips(w, h) {
    ships = Array.from({ length: SHIP_COUNT }, (_, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      return {
        x: w * (0.18 + col * 0.13) + (Math.random() - 0.5) * 10,
        y: h * (0.2 + row * 0.16) + (Math.random() - 0.5) * 10,
        alive: true,
        hitAt: -1,
      };
    });
    destroyed = 0;
    countEl.textContent = "0";
  }

  launchBtn.addEventListener("click", () => {
    dropletT = 0;
  });

  let stop = () => {};
  let seeded = false;
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      if (!seeded) { seedShips(w, h); seeded = true; }
      ctx.clearRect(0, 0, w, h);

      // starfield-ish faint grid
      ctx.strokeStyle = INK + "0.04)";
      ctx.lineWidth = 1;

      ships.forEach((s) => {
        if (!s.alive) {
          if (s.hitAt >= 0) {
            const age = (performance.now() - s.hitAt) / 500;
            if (age < 1) {
              ctx.beginPath();
              ctx.arc(s.x, s.y, 4 + age * 18, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(224,100,100,${0.6 * (1 - age)})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
          return;
        }
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.fillStyle = rgbCss(CYAN, 0.75);
        ctx.fillRect(-5, -2, 10, 4);
        ctx.restore();
      });

      if (dropletT >= 0) {
        dropletT += 16;
        const dur = 2600;
        const p = Math.min(1, dropletT / dur);
        const e = easeOutCubic(p);
        const sx = -20, sy = h * 0.15, ex = w + 20, ey = h * 0.82;
        // slight zigzag, the droplet changes course between passes
        const x = sx + (ex - sx) * e;
        const y = sy + (ey - sy) * e + Math.sin(e * Math.PI * 3) * 14;

        ships.forEach((s) => {
          if (!s.alive) return;
          const d = Math.hypot(s.x - x, s.y - y);
          if (d < 16) {
            s.alive = false;
            s.hitAt = performance.now();
            destroyed += 1;
            countEl.textContent = String(destroyed);
          }
        });

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#e9e9e4";
        ctx.shadowColor = "rgba(237,237,230,0.8)";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (p >= 1) dropletT = -1;
      }

      ctx.font = "11px monospace";
      ctx.fillStyle = INK + "0.4)";
      ctx.fillText("no visible weapon — it destroys ships by impact alone", 10, h - 12);
    });
  });

  return () => stop();
}
