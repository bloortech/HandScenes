// The four kinds of knowing: Vervaeke's argument that "knowing" has been
// flattened to just propositional (believing facts), losing three other real
// kinds we still depend on every day.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

const KINDS = [
  {
    name: "Propositional",
    short: "knowing THAT",
    example: "knowing that Toronto is in Canada",
    draw: (ctx, cx, cy, s, now) => {
      ctx.font = `${s * 0.5}px ui-monospace, monospace`;
      ctx.fillStyle = rgbCss(AMBER, 0.85);
      ctx.textAlign = "center";
      ctx.fillText("P → Q", cx, cy + s * 0.08);
      ctx.textAlign = "left";
    },
  },
  {
    name: "Procedural",
    short: "knowing HOW",
    example: "knowing how to ride a bike",
    draw: (ctx, cx, cy, s, now) => {
      const a = (now / 700) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.strokeStyle = INK + "0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
      const x = cx + Math.cos(a) * s * 0.3, y = cy + Math.sin(a) * s * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(AMBER, 0.9);
      ctx.fill();
    },
  },
  {
    name: "Perspectival",
    short: "knowing WHAT IT'S LIKE",
    example: "what stands out to you from where you stand",
    draw: (ctx, cx, cy, s, now) => {
      const sweep = (Math.sin(now / 900) + 1) / 2;
      const a0 = -0.5 + sweep * 1.0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, s * 0.32, a0 - 0.35, a0 + 0.35);
      ctx.closePath();
      ctx.fillStyle = rgbCss(CYAN, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(CYAN, 0.9);
      ctx.fill();
    },
  },
  {
    name: "Participatory",
    short: "knowing BY BEING PART OF",
    example: "who you are, shaped by what you're in relationship with",
    draw: (ctx, cx, cy, s, now) => {
      const d = 10 + Math.sin(now / 600) * 4;
      ctx.beginPath();
      ctx.arc(cx - d, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(AMBER, 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + d, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(CYAN, 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - d + 6, cy);
      ctx.lineTo(cx + d - 6, cy);
      ctx.strokeStyle = INK + "0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
  },
];

export const id = "four-knowings";
export const shelf = "vervaeke";
export const title = "The four kinds of knowing";
export const source = "Awakening from the Meaning Crisis, episode 1 (John Vervaeke, 2019)";
export const cite = "Vervaeke, Awakening from the Meaning Crisis, ep. 1: Introduction";
export const blurb =
  "Modern culture tends to treat “knowing” as just one thing: having a justified true " +
  "belief, a fact in your head. Vervaeke opens the series by arguing we lost three other real " +
  "kinds of knowing along the way: procedural (how to do something), perspectival (what's " +
  "salient from where you're standing), and participatory (who you are, inseparable from what " +
  "you're coupled with). Click each quadrant. The meaning crisis, in his account, is partly " +
  "this collapse down to propositional knowing alone.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `<div class="k-pick"></div>`,
  });
  const pick = controls.querySelector(".k-pick");
  let active = 0;
  KINDS.forEach((k, i) => {
    const b = document.createElement("button");
    b.textContent = k.name;
    if (i === 0) b.classList.add("on");
    b.addEventListener("click", () => {
      active = i;
      [...pick.children].forEach((c) => c.classList.toggle("on", c === b));
    });
    pick.appendChild(b);
  });

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      const cols = 2, rows = 2;
      const cellW = w / cols, cellH = h / rows;
      KINDS.forEach((k, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = cellW * (col + 0.5), cy = cellH * (row + 0.5);
        const isActive = i === active;

        ctx.strokeStyle = isActive ? rgbCss(AMBER, 0.5) : INK + "0.08)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cellW * col + 8, cellH * row + 8, cellW - 16, cellH - 16);

        k.draw(ctx, cx, cy - cellH * 0.08, Math.min(cellW, cellH) * 0.7, now);

        ctx.font = isActive ? "bold 12px ui-sans-serif, sans-serif" : "12px ui-sans-serif, sans-serif";
        ctx.fillStyle = isActive ? rgbCss(AMBER, 1) : INK + "0.55)";
        ctx.textAlign = "center";
        ctx.fillText(k.name, cx, cy + cellH * 0.28);
        ctx.font = "10px ui-sans-serif, sans-serif";
        ctx.fillStyle = INK + "0.4)";
        ctx.fillText(k.short, cx, cy + cellH * 0.28 + 14);
        ctx.textAlign = "left";
      });

      // example caption for the active kind, bottom strip
      ctx.font = "11px ui-sans-serif, sans-serif";
      ctx.fillStyle = rgbCss(CYAN, 0.85);
      ctx.textAlign = "center";
      ctx.fillText(KINDS[active].example, w / 2, h - 10);
      ctx.textAlign = "left";
    });
  });

  return () => stop();
}
