// A sophon: Trisolaris unfolds a proton from higher dimensions down to two,
// then etches a circuit into that vast surface, folding it back into
// something smaller than an atom. An intelligent supercomputer, invisible,
// already on Earth.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss, easeInOutSine } from "../lib/canvas-utils.js";

export const id = "sophon";
export const shelf = "threebody";
export const spoilerBook = 1;
export const title = "Unfolding a sophon";
export const source = "Liu Cixin, The Three-Body Problem (2008), ch. 33, “Trisolaris: Sophon”";
export const cite = "Liu Cixin, The Three-Body Problem, ch. 33: Trisolaris: Sophon";
export const blurb =
  "A proton has extra spatial dimensions curled up inside it. Trisolaris builds a planet-sized " +
  "accelerator to unfold one, layer by layer, down into a flat two-dimensional surface the " +
  "size of a solar system, mirror-smooth. Then they etch an entire computer's circuitry " +
  "directly onto that surface, and fold it all back up. The result, a sophon, is an " +
  "intelligent, proton-sized supercomputer that can fly to Earth and interfere with physics " +
  "experiments, undetectable. Drag the slider to unfold and refold it yourself.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <label>Unfold ↔ fold
        <input type="range" class="pos" min="0" max="100" value="0">
      </label>
      <button class="auto" type="button">Auto-run</button>
    `,
  });
  const slider = controls.querySelector(".pos");
  const autoBtn = controls.querySelector(".auto");
  let autoOn = true;
  autoBtn.classList.add("on");
  autoBtn.addEventListener("click", () => {
    autoOn = !autoOn;
    autoBtn.classList.toggle("on", autoOn);
  });
  slider.addEventListener("input", () => { autoOn = false; autoBtn.classList.remove("on"); });

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    let autoT = 0;
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      if (autoOn) {
        autoT += 0.006;
        slider.value = String(Math.round(((Math.sin(autoT) + 1) / 2) * 100));
      }
      const p = Number(slider.value) / 100; // 0 = folded proton, 1 = fully unfolded 2D circuit
      const e = easeInOutSine(p);

      const cx = w / 2, cy = h / 2;

      if (e < 0.001) {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = rgbCss(AMBER, 0.95);
        ctx.fill();
        ctx.font = "11px ui-sans-serif, sans-serif";
        ctx.fillStyle = INK + "0.6)";
        ctx.textAlign = "center";
        ctx.fillText("a folded proton", cx, cy + 24);
        ctx.textAlign = "left";
        return;
      }

      // the unfolding surface: a square whose side grows with e, filled with
      // an etched circuit grid once mostly unfolded
      const side = 14 + e * Math.min(w, h) * 0.75;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(now / 4000) * 0.04);
      ctx.strokeStyle = rgbCss(CYAN, 0.5 + e * 0.3);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-side / 2, -side / 2, side, side);

      if (e > 0.35) {
        const grid = 7;
        const cell = side / grid;
        ctx.strokeStyle = rgbCss(AMBER, 0.15 + (e - 0.35) * 0.5);
        ctx.lineWidth = 0.8;
        for (let i = 1; i < grid; i++) {
          ctx.beginPath();
          ctx.moveTo(-side / 2 + i * cell, -side / 2);
          ctx.lineTo(-side / 2 + i * cell, side / 2);
          ctx.moveTo(-side / 2, -side / 2 + i * cell);
          ctx.lineTo(side / 2, -side / 2 + i * cell);
          ctx.stroke();
        }
        // a few etched "trace" paths, like circuit wiring — clipped to the
        // surface so they can't wander off the unfolded square
        ctx.save();
        ctx.beginPath();
        ctx.rect(-side / 2, -side / 2, side, side);
        ctx.clip();
        const traces = 9;
        for (let t = 0; t < traces; t++) {
          const seed = t * 7.13;
          ctx.beginPath();
          let x = -side / 2 + ((seed * 37) % grid) * cell;
          let y = -side / 2 + ((seed * 53) % grid) * cell;
          ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (((seed + k) * 29) % grid - grid / 2) * cell * 0.4;
            y += (((seed + k) * 17) % grid - grid / 2) * cell * 0.4;
            ctx.lineTo(x, y);
          }
          ctx.strokeStyle = rgbCss(AMBER, 0.3 + (e - 0.35) * 0.4);
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
        ctx.restore(); // pop the clip, keep the translate/rotate below
      }
      ctx.restore();

      ctx.font = "11px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.6)";
      ctx.textAlign = "center";
      ctx.fillText(
        e < 0.35 ? "unfolding into two dimensions…" : "a circuit, etched across the whole surface",
        cx, h - 16
      );
      ctx.textAlign = "left";
    });
  });

  return () => stop();
}
