// Socrates' elenchus: a claim is tested with questions until it contradicts
// itself. The goal isn't to win, it's to reach aporia, a genuine "I don't
// know" that clears space for real inquiry.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss, easeOutCubic } from "../lib/canvas-utils.js";

const STAGES = [
  { label: "Claim", text: "“Courage is enduring whatever comes, no matter what.”" },
  { label: "Question", text: "What about enduring something foolish, out of sheer stubbornness?" },
  { label: "Counter-example", text: "Reckless endurance isn't courage, it's folly wearing courage's mask." },
  { label: "Contradiction", text: "So the claim covers cases it shouldn't. It can't be the whole truth." },
  { label: "Aporia", text: "We came in sure we knew. Now we see we don't. That's the opening." },
];

export const id = "socrates";
export const shelf = "vervaeke";
export const title = "Socrates and the elenchus";
export const source = "Awakening from the Meaning Crisis, episode 4 (John Vervaeke, 2019)";
export const cite = "Vervaeke, Awakening from the Meaning Crisis, ep. 4: Socrates and the Quest for Wisdom";
export const blurb =
  "Socrates' method, the elenchus, takes someone's confident claim and tests it with " +
  "questions until it contradicts itself. That's not a trick to embarrass people. Vervaeke " +
  "reads it as a technology for producing aporia, a genuine loss of your footing, where you " +
  "realize you don't know what you were sure you knew. Aporia matters because it's the only " +
  "state honest enough to make room for real learning instead of borrowed certainty.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <button class="prev" type="button">Back</button>
      <button class="next" type="button">Next question</button>
      <button class="reset" type="button">Restart</button>
    `,
  });
  const prevBtn = controls.querySelector(".prev");
  const nextBtn = controls.querySelector(".next");
  const resetBtn = controls.querySelector(".reset");

  let stage = 0;
  let animT = performance.now();

  const setStage = (n) => {
    stage = Math.max(0, Math.min(STAGES.length - 1, n));
    animT = performance.now();
  };
  nextBtn.addEventListener("click", () => setStage(stage + 1));
  prevBtn.addEventListener("click", () => setStage(stage - 1));
  resetBtn.addEventListener("click", () => setStage(0));

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      const n = STAGES.length;
      const top = h * 0.16;
      const bottom = h * 0.68;
      const stepY = (bottom - top) / (n - 1);
      const cx = w * 0.28;

      // the chain of nodes, descending toward aporia
      for (let i = 0; i < n; i++) {
        const y = top + stepY * i;
        const active = i <= stage;
        const justArrived = i === stage ? Math.min(1, (now - animT) / 450) : 1;
        const e = easeOutCubic(justArrived);

        if (i > 0) {
          const y0 = top + stepY * (i - 1);
          ctx.beginPath();
          ctx.moveTo(cx, y0 + 9);
          ctx.lineTo(cx, y0 + 9 + (y - y0 - 18) * (i <= stage ? e : 0));
          ctx.strokeStyle = active ? rgbCss(CYAN, 0.55) : INK + "0.12)";
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, y, i === n - 1 ? 9 : 7, 0, Math.PI * 2);
        if (i === n - 1 && active) {
          ctx.fillStyle = rgbCss(AMBER, 0.15 + 0.25 * e);
          ctx.fill();
          ctx.strokeStyle = rgbCss(AMBER, 0.9);
        } else {
          ctx.fillStyle = active ? rgbCss(CYAN, 0.25) : "rgba(237,237,230,.06)";
          ctx.fill();
          ctx.strokeStyle = active ? rgbCss(CYAN, 0.8) : INK + "0.2)";
        }
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.font = "11px ui-sans-serif, sans-serif";
        ctx.fillStyle = active ? INK + "0.85)" : INK + "0.3)";
        ctx.fillText(STAGES[i].label, cx + 18, y + 4);
      }

      // the live text panel for the current stage
      const panelX = w * 0.5;
      const panelY = h * 0.18;
      const panelW = w * 0.46;
      ctx.font = "12px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.4)";
      ctx.fillText(STAGES[stage].label.toUpperCase(), panelX, panelY);

      ctx.font = "15px ui-sans-serif, sans-serif";
      ctx.fillStyle = stage === n - 1 ? rgbCss(AMBER, 0.95) : INK + "0.9)";
      wrapText(ctx, STAGES[stage].text, panelX, panelY + 26, panelW, 20);

      if (stage === n - 1) {
        // aporia glyph: a question mark dissolving into dots, the "productive confusion"
        const gx = panelX + panelW * 0.5;
        const gy = h * 0.58;
        const pulse = 0.5 + 0.5 * Math.sin(now / 500);
        ctx.font = `${26 + pulse * 2}px ui-sans-serif, sans-serif`;
        ctx.fillStyle = rgbCss(AMBER, 0.5 + pulse * 0.3);
        ctx.textAlign = "center";
        ctx.fillText("?", gx, gy);
        ctx.textAlign = "left";
      }
    });
  });

  return () => stop();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
