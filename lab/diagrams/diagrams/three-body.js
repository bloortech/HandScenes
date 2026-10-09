// The three-body problem itself: Trisolaris orbits three suns with no exact
// closed-form solution. Most configurations are chaotic (unpredictable,
// Chaotic Eras); a few special ones are periodic (predictable, Stable Eras).
// This runs a real velocity-Verlet integration, not a canned animation.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";
import { stepVerlet, stableTriangle, chaoticTriangle } from "../lib/physics.js";

export const id = "three-body";
export const shelf = "threebody";
export const spoilerBook = 1;
export const title = "The three-body problem";
export const source = "Liu Cixin, The Three-Body Problem (2008), part 2, “Three Body” (the game)";
export const cite = "Liu Cixin, The Three-Body Problem, the “Three Body” VR game chapters";
export const blurb =
  "Trisolaris orbits three suns, and three mutually gravitating bodies have no general exact " +
  "solution, unlike two. Most starting conditions are chaotic: small differences blow up fast, " +
  "and the suns' combined pull on the planet becomes unpredictable within a few orbits " +
  "(a Chaotic Era, sometimes ending in a sun grazing too close or too far). A few special, " +
  "almost perfectly symmetric configurations stay periodic for a long time (a Stable Era). " +
  "Drag any of the three suns, then run it, to feel how fast the system forgets the difference.";

const COLORS = [AMBER, CYAN, "#E07A6A"];

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <button class="preset on" data-p="stable" type="button">Stable era</button>
      <button class="preset" data-p="chaotic" type="button">Chaotic era</button>
      <button class="run" type="button">Run</button>
      <button class="resetbtn" type="button">Reset</button>
      <span style="font-size:11px;color:var(--dim);align-self:center;">drag a sun before running</span>
    `,
  });
  const presetBtns = [...controls.querySelectorAll(".preset")];
  const runBtn = controls.querySelector(".run");
  const resetBtn = controls.querySelector(".resetbtn");

  let preset = "stable";
  let bodies = stableTriangle();
  let trail = bodies.map(() => []);
  let running = false;
  const scale = 70; // pixels per simulation unit, set properly on draw from canvas size
  let dragIdx = -1;

  function load() {
    bodies = (preset === "stable" ? stableTriangle() : chaoticTriangle()).map((b) => ({ ...b }));
    trail = bodies.map(() => []);
    running = false;
  }

  presetBtns.forEach((b) => b.addEventListener("click", () => {
    preset = b.dataset.p;
    presetBtns.forEach((x) => x.classList.toggle("on", x === b));
    load();
  }));
  runBtn.addEventListener("click", () => { running = !running; runBtn.textContent = running ? "Pause" : "Run"; });
  resetBtn.addEventListener("click", load);

  function toScreen(x, y, w, h) {
    return [w / 2 + x * scale, h / 2 + y * scale];
  }
  function toSim(px, py, w, h) {
    return [(px - w / 2) / scale, (py - h / 2) / scale];
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = -1, bd = 400;
    bodies.forEach((b, i) => {
      const [sx, sy] = toScreen(b.x, b.y, w, h);
      const d = (sx - px) ** 2 + (sy - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { dragIdx = best; running = false; runBtn.textContent = "Run"; }
  });
  window.addEventListener("pointermove", (e) => {
    if (dragIdx < 0) return;
    const rect = canvas.getBoundingClientRect();
    const [sx, sy] = toSim(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    bodies[dragIdx].x = sx;
    bodies[dragIdx].y = sy;
    trail[dragIdx] = [];
  });
  window.addEventListener("pointerup", () => { dragIdx = -1; });

  let stop = () => {};
  onEnterView(el, () => {
    load();
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      if (running) {
        const dt = 0.01;
        for (let i = 0; i < 3; i++) bodies = stepVerlet(bodies, dt);
        bodies.forEach((b, i) => {
          const [sx, sy] = toScreen(b.x, b.y, w, h);
          trail[i].push([sx, sy]);
          if (trail[i].length > 260) trail[i].shift();
        });
      }

      trail.forEach((pts, i) => {
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.strokeStyle = rgbCss(COLORS[i], 0.35);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      bodies.forEach((b, i) => {
        const [sx, sy] = toScreen(b.x, b.y, w, h);
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fillStyle = rgbCss(COLORS[i], 0.95);
        ctx.fill();
      });

      // planet-side readout: a tiny dot whose brightness swings with the net pull
      ctx.font = "11px monospace";
      ctx.fillStyle = INK + "0.4)";
      ctx.fillText(preset === "stable" ? "Stable Era: the triangle rotates, predictable" : "Chaotic Era: nudged off balance, unpredictable", 10, h - 12);
    });
  });

  return () => stop();
}
