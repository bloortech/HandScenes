// The human computer: inside the "Three Body" game, Qin Shi Huang's army of
// three million soldiers forms logic gates by raising flags, building a giant
// mechanical computer meant to predict the suns' motion.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

export const id = "human-computer";
export const shelf = "threebody";
export const spoilerBook = 1;
export const title = "The human computer";
export const source = "Liu Cixin, The Three-Body Problem (2008), the Qin Shi Huang “Three Body” game sequence";
export const cite = "Liu Cixin, The Three-Body Problem, Qin Shi Huang human-formation computer";
export const blurb =
  "Inside the Three Body game, Qin Shi Huang gathers three million soldiers on a plain and " +
  "drills them into a working computer: each soldier is a switch, raising a black or white " +
  "flag to hold a 0 or a 1, and whole blocks of soldiers are wired together by shouted orders " +
  "to act as logic gates. Toggle the two inputs below and watch the AND gate's soldiers raise " +
  "the matching flags, exactly the mechanism the game uses to try (and fail) to predict the " +
  "three suns.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <label><input type="checkbox" class="a"> Input A = 1</label>
      <label><input type="checkbox" class="b"> Input B = 1</label>
      <div class="gatepick"></div>
    `,
  });
  const aBox = controls.querySelector(".a");
  const bBox = controls.querySelector(".b");
  const gatePick = controls.querySelector(".gatepick");
  const GATES = ["AND", "OR", "XOR"];
  let gate = "AND";
  GATES.forEach((g, i) => {
    const btn = document.createElement("button");
    btn.textContent = g;
    if (i === 0) btn.classList.add("on");
    btn.addEventListener("click", () => {
      gate = g;
      [...gatePick.children].forEach((c) => c.classList.toggle("on", c === btn));
    });
    gatePick.appendChild(btn);
  });

  function compute(a, b) {
    if (gate === "AND") return a && b ? 1 : 0;
    if (gate === "OR") return a || b ? 1 : 0;
    return a !== b ? 1 : 0;
  }

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      const a = aBox.checked ? 1 : 0;
      const b = bBox.checked ? 1 : 0;
      const out = compute(a, b);

      // three blocks of soldiers: input A, input B, output. Each soldier is a tiny flag.
      const blocks = [
        { x: w * 0.12, label: "A", val: a },
        { x: w * 0.42, label: "B", val: b },
        { x: w * 0.78, label: gate, val: out, isGate: true },
      ];
      const rows = 6, cols = 6;
      const cellSize = Math.min(w, h) * 0.07;

      blocks.forEach((blk) => {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = blk.x + c * cellSize;
            const y = h * 0.28 + r * cellSize;
            const flip = Math.sin(now / 400 + r * 0.6 + c * 0.3) * 0.5 + 0.5;
            const raised = blk.val === 1;
            const wobble = raised ? Math.sin(now / 300 + r + c) * 1.5 : 0;
            ctx.save();
            ctx.translate(x, y + wobble);
            // pole
            ctx.strokeStyle = INK + "0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -cellSize * 0.5 * (raised ? 1 : 0.55));
            ctx.stroke();
            // flag
            ctx.fillStyle = raised
              ? rgbCss(blk.isGate ? AMBER : CYAN, 0.85)
              : "rgba(237,237,230,0.12)";
            ctx.fillRect(1, -cellSize * 0.5 * (raised ? 1 : 0.55), cellSize * 0.32, cellSize * 0.22);
            ctx.restore();
          }
        }
        ctx.font = "11px ui-sans-serif, sans-serif";
        ctx.fillStyle = blk.isGate ? rgbCss(AMBER, 0.9) : INK + "0.7)";
        ctx.fillText(`${blk.label} = ${blk.val}`, blk.x, h * 0.28 - 14);
      });

      // wires from A and B into the gate block
      ctx.strokeStyle = rgbCss(CYAN, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.12 + cols * cellSize, h * 0.42);
      ctx.lineTo(w * 0.78, h * 0.38);
      ctx.moveTo(w * 0.42 + cols * cellSize, h * 0.42);
      ctx.lineTo(w * 0.78, h * 0.46);
      ctx.stroke();

      ctx.font = "10px monospace";
      ctx.fillStyle = INK + "0.35)";
      ctx.fillText("each soldier = 1 bit · blocks wired by shouted drill orders = logic gates", 10, h - 12);
    });
  });

  return () => stop();
}
