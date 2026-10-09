// Dark forest theory: Ye Wenjie's two axioms (survival first, matter is
// finite) plus chains of suspicion and technological explosion, conclude
// that broadcasting your location is almost always fatal.
import { setupCanvas, buildStage, onEnterView, runLoop, INK, AMBER, CYAN, rgbCss } from "../lib/canvas-utils.js";

export const id = "dark-forest";
export const shelf = "threebody";
export const spoilerBook = 2;
export const title = "Dark forest theory";
export const source = "Liu Cixin, The Dark Forest (2008), Ye Wenjie's axioms to Luo Ji";
export const cite = "Liu Cixin, The Dark Forest, part 4, Ye Wenjie's cosmic sociology lecture to Luo Ji";
export const blurb =
  "Ye Wenjie gives Luo Ji two axioms: survival is every civilization's first need, and the " +
  "total matter in the universe is fixed, so growth is always competition. Add two facts: " +
  "you can never be sure another civilization's intentions will stay peaceful (the chain of " +
  "suspicion), and a primitive-looking civilization can leap forward unpredictably fast (the " +
  "technological explosion). Put together, the only safe move, for anyone, is to stay silent " +
  "and strike first if discovered. Play a few rounds below and see how fast silence wins.";

export function mount(el) {
  const { canvas, controls } = buildStage(el, {
    controlsHtml: `
      <button class="broadcast" type="button">Broadcast your location</button>
      <button class="hide" type="button">Stay silent</button>
      <button class="again" type="button" style="display:none;">Play again</button>
    `,
  });
  const broadcastBtn = controls.querySelector(".broadcast");
  const hideBtn = controls.querySelector(".hide");
  const againBtn = controls.querySelector(".again");

  let civs = [];
  let log = [];
  let outcome = null; // null | "struck" | "survived"
  let youAlive = true;

  function seed() {
    civs = Array.from({ length: 7 }, (_, i) => ({
      a: (i / 7) * Math.PI * 2,
      r: 0.55 + Math.random() * 0.35,
      alive: true,
      suspicious: Math.random() < 0.7, // most civilizations default to the chain of suspicion
    }));
    log = [];
    outcome = null;
    youAlive = true;
    broadcastBtn.disabled = false;
    hideBtn.disabled = false;
    againBtn.style.display = "none";
  }
  seed();

  function round(choice) {
    broadcastBtn.disabled = true;
    hideBtn.disabled = true;
    if (choice === "silent") {
      outcome = "survived";
      log = ["You stayed silent.", "No one could find you to judge your intentions.", "Another round passes. You're still here."];
      setTimeout(() => { againBtn.style.display = ""; }, 400);
      return;
    }
    // broadcasting: each suspicious civilization that notices considers striking
    const noticing = civs.filter((c) => c.alive && Math.random() < 0.6);
    const strikers = noticing.filter((c) => c.suspicious);
    log = [`You broadcast. ${noticing.length} civilizations heard you.`];
    if (strikers.length) {
      log.push(`${strikers.length} couldn't verify you'd stay harmless forever (chain of suspicion).`);
      log.push("One has had a technological explosion since you last measured it.");
      log.push("It strikes first, so it doesn't have to find out if you would.");
      outcome = "struck";
      youAlive = false;
    } else {
      log.push("This time, no one struck. You got lucky — the theory says that doesn't hold forever.");
      outcome = "lucky";
    }
    setTimeout(() => { againBtn.style.display = ""; }, 400);
  }

  broadcastBtn.addEventListener("click", () => round("broadcast"));
  hideBtn.addEventListener("click", () => round("silent"));
  againBtn.addEventListener("click", seed);

  let stop = () => {};
  onEnterView(el, () => {
    stop();
    stop = runLoop((_tMs, now) => {
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h * 0.42, R = Math.min(w, h) * 0.32;

      // the forest: other civilizations as dim, mostly-hidden dots
      civs.forEach((c) => {
        if (!c.alive) return;
        const x = cx + Math.cos(c.a) * R * c.r;
        const y = cy + Math.sin(c.a) * R * c.r;
        const flicker = 0.4 + 0.3 * Math.sin(now / 900 + c.a * 5);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = INK + `${0.12 + flicker * 0.12})`;
        ctx.fill();
      });

      // you, at the center
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = youAlive ? rgbCss(CYAN, 0.9) : "rgba(224,100,100,.9)";
      ctx.fill();

      if (outcome === "struck") {
        const burst = ((now / 1000) % 1);
        ctx.beginPath();
        ctx.arc(cx, cy, 10 + burst * 40, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(224,100,100,${0.6 * (1 - burst)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (outcome === "survived") {
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.strokeStyle = rgbCss(AMBER, 0.4 + 0.2 * Math.sin(now / 500));
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      ctx.font = "12px ui-sans-serif, sans-serif";
      ctx.fillStyle = INK + "0.85)";
      let ly = h * 0.78;
      log.forEach((line) => {
        ctx.fillText(line, 14, ly);
        ly += 16;
      });
      if (!log.length) {
        ctx.fillStyle = INK + "0.4)";
        ctx.fillText("Choose a move.", 14, ly);
      }
    });
  });

  return () => stop();
}
