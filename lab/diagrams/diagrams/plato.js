// Plato's cave and the divided line, as one continuous climb. The cave is
// the story; the divided line is the same climb's "ladder" of four states of
// mind, from shadow-opinion to direct understanding.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

const STEPS = [
  { t: 0.0, name: "Shadows on the wall", line: "Eikasia: imagining", detail: "taking the image for the thing" },
  { t: 0.33, name: "Turning to the fire and the objects", line: "Pistis: belief", detail: "trusting what the senses show, up close" },
  { t: 0.66, name: "Climbing out of the cave", line: "Dianoia: reasoning", detail: "using concepts and inference, still from assumptions" },
  { t: 1.0, name: "Seeing the sun directly", line: "Noesis: understanding", detail: "grasping the Form itself, the source of the light" },
];

export const id = "plato";
export const shelf = "vervaeke";
export const title = "Plato's cave and the divided line";
export const source = "Awakening from the Meaning Crisis, episode 5 (John Vervaeke, 2019)";
export const cite = "Vervaeke, Awakening from the Meaning Crisis, ep. 5: Plato and the Cave";
export const blurb =
  "Plato's cave tells one story: prisoners mistake shadows for reality until one is dragged " +
  "out and sees the sun. The divided line is the same story as a ladder of four states of " +
  "mind: eikasia (images), pistis (belief), dianoia (reasoning), noesis (direct understanding). " +
  "Drag the slider to walk that climb. Vervaeke's point is that this isn't just a metaphor " +
  "about ignorance, it's a map of real cognitive development, each stage opening up more of " +
  "what's actually there.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <label>Climb out of the cave
        <input type="range" class="pos" min="0" max="100" value="0">
      </label>
    `,
  });
  const slider = controls.querySelector(".pos");

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    let auto = true;
    let autoT = 0;
    slider.addEventListener("input", () => { auto = false; });

    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      if (auto) {
        autoT += 0.0045;
        const v = (Math.sin(autoT) + 1) / 2;
        slider.value = String(Math.round(v * 100));
      }
      const p = Number(slider.value) / 100;
      const step = STEPS.reduce((a, s) => (p >= s.t ? s : a), STEPS[0]);

      // LEFT: the cave cross-section. A tunnel from dark (left) to sunlight (right).
      const caveTop = h * 0.14, caveBot = h * 0.62;
      const caveLeft = w * 0.04, caveRight = w * 0.56;
      ctx.strokeStyle = INK + "0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(caveLeft, caveTop); ctx.lineTo(caveRight, caveTop * 0.4);
      ctx.moveTo(caveLeft, caveBot); ctx.lineTo(caveRight, caveBot + (h - caveBot) * 0.3);
      ctx.stroke();

      // sunlight gradient strengthens as p increases
      const grad = ctx.createLinearGradient(caveLeft, 0, caveRight, 0);
      grad.addColorStop(0, "rgba(10,10,10,0)");
      grad.addColorStop(1, `rgba(232,184,74,${0.05 + p * 0.22})`);
      ctx.fillStyle = grad;
      ctx.fillRect(caveLeft, caveTop * 0.4, caveRight - caveLeft, caveBot - caveTop * 0.4 + (h - caveBot) * 0.2);

      // fire (fixed, near the mouth of the chamber)
      const fireX = caveLeft + (caveRight - caveLeft) * 0.22;
      const fireY = (caveTop + caveBot) / 2;
      const flick = 0.6 + 0.4 * Math.sin(now / 140);
      ctx.beginPath();
      ctx.arc(fireX, fireY - 30, 5 + flick * 2, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(AMBER, 0.6 + flick * 0.3);
      ctx.fill();
      ctx.font = "10px monospace";
      ctx.fillStyle = INK + "0.35)";
      ctx.fillText("fire", fireX - 9, fireY - 44);

      // the prisoner, walking from shadow toward the sun as p increases
      const px = caveLeft + (caveRight - caveLeft) * (0.08 + p * 0.86);
      const py = fireY + 24 - p * 10;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(CYAN, 0.95);
      ctx.fill();

      // shadow cast on the back wall by the prisoner, shrinking as they leave
      const wallX = caveLeft + 4;
      ctx.fillStyle = INK + `${0.4 * (1 - p)})`;
      ctx.beginPath();
      ctx.ellipse(wallX, fireY + 10, 3 + 4 * (1 - p), 10 + 6 * (1 - p), 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "12px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.8)";
      ctx.fillText(step.name, caveLeft, caveBot + 34);

      // RIGHT: the divided line, four segments, marker tracks the same p
      const lx = w * 0.68, rxEnd = w * 0.95;
      const ly = h * 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly); ctx.lineTo(rxEnd, ly);
      ctx.strokeStyle = INK + "0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      STEPS.forEach((s, i) => {
        const x = lx + (rxEnd - lx) * s.t;
        const on = step === s;
        ctx.beginPath();
        ctx.arc(x, ly, on ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = on ? rgbCss(AMBER, 0.95) : INK + "0.3)";
        ctx.fill();
        ctx.save();
        ctx.font = on ? "bold 11px ui-sans-serif, sans-serif" : "10px ui-sans-serif, sans-serif";
        ctx.fillStyle = on ? rgbCss(AMBER, 1) : INK + "0.45)";
        ctx.textAlign = "center";
        ctx.fillText(s.line.split(": ")[0], x, ly - 14);
        ctx.restore();
      });

      ctx.font = "13px ui-sans-serif, sans-serif";
      ctx.fillStyle = rgbCss(CYAN, 0.9);
      ctx.fillText(step.line, lx, ly + 36);
      ctx.font = "12px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.55)";
      // wrap the detail to the ladder's width so it never runs off the canvas
      let lineText = "", lineY = ly + 54;
      for (const word of step.detail.split(" ")) {
        const next = lineText ? lineText + " " + word : word;
        if (ctx.measureText(next).width > rxEnd - lx && lineText) { ctx.fillText(lineText, lx, lineY); lineText = word; lineY += 16; }
        else lineText = next;
      }
      ctx.fillText(lineText, lx, lineY);
    });
  });

  return () => stop();
}
