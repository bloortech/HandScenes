// Aristotle: why a thing is the way it is (four causes), and how to act well
// (virtue as a mean between two failure modes, not a midpoint on a ruler).
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

const CAUSES = [
  { name: "Material", text: "what it's made of: bronze" },
  { name: "Formal", text: "the shape/pattern that makes it that thing: “statue of a man”" },
  { name: "Efficient", text: "what brought it about: the sculptor's work" },
  { name: "Final", text: "what it's for: to honour or remember someone" },
];

const VIRTUES = [
  { name: "Courage", vice1: "Cowardice", vice2: "Recklessness" },
  { name: "Generosity", vice1: "Stinginess", vice2: "Wastefulness" },
  { name: "Temperance", vice1: "Insensibility", vice2: "Self-indulgence" },
];

export const id = "aristotle";
export const shelf = "vervaeke";
export const title = "Aristotle: four causes, virtue as a mean";
export const source = "Awakening from the Meaning Crisis, episode 6 (John Vervaeke, 2019)";
export const cite = "Vervaeke, Awakening from the Meaning Crisis, ep. 6: Aristotle, Kant, and Evolution";
export const blurb =
  "Aristotle thought a full explanation of anything needs four causes: what it's made of, " +
  "what shape makes it that thing, what brought it into being, and what it's for. The same " +
  "four-part thinking shows up in his ethics: a virtue like courage isn't a fixed rule, it's " +
  "the mean between two opposite failures, cowardice on one side and recklessness on the " +
  "other, found by practiced judgment rather than a formula.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <button class="mode on" data-m="causes" type="button">Four causes</button>
      <button class="mode" data-m="virtue" type="button">Virtue as a mean</button>
      <div class="virtue-pick" style="display:none; gap:6px;"></div>
      <label class="virtue-slider" style="display:none;">Where you land
        <input type="range" class="pos" min="0" max="100" value="50">
      </label>
    `,
  });
  const modeBtns = [...controls.querySelectorAll(".mode")];
  const pick = controls.querySelector(".virtue-pick");
  const sliderWrap = controls.querySelector(".virtue-slider");
  const slider = controls.querySelector(".pos");

  let mode = "causes";
  let virtueIdx = 0;

  VIRTUES.forEach((v, i) => {
    const b = document.createElement("button");
    b.textContent = v.name;
    b.className = i === 0 ? "on" : "";
    b.addEventListener("click", () => {
      virtueIdx = i;
      [...pick.children].forEach((c) => c.classList.toggle("on", c === b));
    });
    pick.appendChild(b);
  });

  modeBtns.forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.m;
    modeBtns.forEach((x) => x.classList.toggle("on", x === b));
    pick.style.display = mode === "virtue" ? "flex" : "none";
    sliderWrap.style.display = mode === "virtue" ? "block" : "none";
  }));

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      if (mode === "causes") drawCauses(ctx, w, h, now);
      else drawVirtue(ctx, w, h, Number(slider.value) / 100, VIRTUES[virtueIdx]);
    });
  });

  return () => stop();
}

function drawCauses(ctx, w, h, now) {
  const cx = w / 2, cy = h * 0.42, r = Math.min(w, h) * 0.17;
  const pulse = 0.5 + 0.5 * Math.sin(now / 900);

  // the statue at the center
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(AMBER, 0.85);
  ctx.fill();
  ctx.font = "11px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = INK + "0.9)";
  ctx.fillText("the statue", cx, cy + 26);
  ctx.textAlign = "left";

  CAUSES.forEach((c, i) => {
    const a = -Math.PI / 2 + (i / CAUSES.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * r * (1 + pulse * 0.04);
    const y = cy + Math.sin(a) * r * (1 + pulse * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = rgbCss(CYAN, 0.35 + pulse * 0.15);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(CYAN, 0.9);
    ctx.fill();

    const labelX = cx + Math.cos(a) * (r + 18);
    const labelY = cy + Math.sin(a) * (r + 18);
    ctx.font = "bold 12px ui-sans-serif, sans-serif";
    ctx.fillStyle = INK + "0.9)";
    ctx.textAlign = Math.cos(a) > 0.2 ? "left" : Math.cos(a) < -0.2 ? "right" : "center";
    ctx.fillText(c.name, labelX, labelY - 4);
    ctx.font = "10px ui-sans-serif, sans-serif";
    ctx.fillStyle = INK + "0.5)";
    const words = c.text.split(" ");
    let line = "", ly = labelY + 10;
    for (const word of words) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > 120 && line) {
        ctx.fillText(line, labelX, ly);
        line = word; ly += 12;
      } else line = t;
    }
    if (line) ctx.fillText(line, labelX, ly);
    ctx.textAlign = "left";
  });
}

function drawVirtue(ctx, w, h, p, v) {
  const left = w * 0.1, right = w * 0.9, y = h * 0.5;
  ctx.beginPath();
  ctx.moveTo(left, y); ctx.lineTo(right, y);
  ctx.strokeStyle = INK + "0.25)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // the mean is a zone, not a point: shade the healthy middle band
  const bandL = left + (right - left) * 0.38;
  const bandR = left + (right - left) * 0.62;
  ctx.fillStyle = "rgba(124,213,232,.14)";
  ctx.fillRect(bandL, y - 14, bandR - bandL, 28);
  ctx.font = "11px ui-sans-serif, sans-serif";
  ctx.fillStyle = rgbCss(CYAN, 0.8);
  ctx.textAlign = "center";
  ctx.fillText(v.name + " (the mean)", (bandL + bandR) / 2, y - 22);

  ctx.fillStyle = INK + "0.6)";
  ctx.fillText(v.vice1, left + (right - left) * 0.08, y + 30);
  ctx.fillText(v.vice2, right - (right - left) * 0.08, y + 30);
  ctx.font = "10px ui-sans-serif, sans-serif";
  ctx.fillStyle = INK + "0.35)";
  ctx.fillText("deficiency", left + (right - left) * 0.08, y + 44);
  ctx.fillText("excess", right - (right - left) * 0.08, y + 44);

  const markerX = left + (right - left) * p;
  const inBand = markerX >= bandL && markerX <= bandR;
  ctx.beginPath();
  ctx.arc(markerX, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = inBand ? rgbCss(AMBER, 0.95) : "rgba(224,100,100,.85)";
  ctx.fill();
  ctx.textAlign = "left";
}
