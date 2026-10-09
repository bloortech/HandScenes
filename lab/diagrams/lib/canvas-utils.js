// Shared canvas helpers for all diagrams. Plain DOM + Canvas 2D, no deps.
// Bloort palette: dark background, dots/lines in INK, amber accent, cyan pulse.

export const INK = "rgba(237,237,230,";
export const AMBER = "#E8B84B";
export const CYAN = "#7CD5E8";

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbCss(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Sizes a canvas to its CSS box at devicePixelRatio (capped at 2), returns a
// 2D context already scaled so drawing code can use CSS pixel coordinates.
export function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

// Runs `cb` once a container scrolls into view (used to start animations lazily,
// so an index page with ten diagrams doesn't animate all of them at once).
export function onEnterView(el, cb, opts = {}) {
  if (typeof IntersectionObserver === "undefined") {
    cb();
    return () => {};
  }
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0] && entries[0].isIntersecting) cb();
    },
    { threshold: 0.35, ...opts }
  );
  obs.observe(el);
  return () => obs.disconnect();
}

// A small animation-loop wrapper that respects reduced motion (draws exactly
// one static frame instead of looping) and stops cleanly when the element is
// removed or the tab is hidden.
export function runLoop(drawFrame, { reduced = prefersReducedMotion() } = {}) {
  let raf = 0;
  let running = true;
  const t0 = performance.now();

  const frame = (now) => {
    if (!running) return;
    const keepGoing = drawFrame(now - t0, now);
    if (!reduced && keepGoing !== false) {
      raf = requestAnimationFrame(frame);
    }
  };

  // Always paint one frame synchronously before handing off to
  // requestAnimationFrame, so a diagram never shows a blank canvas while it
  // waits for the first animation tick (matters most right as it scrolls
  // into view).
  drawFrame(0, t0);
  if (!reduced) {
    raf = requestAnimationFrame(frame);
  }

  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!reduced) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Builds the standard diagram chrome (canvas + caption + controls slot) inside
// `el` and returns the pieces so each diagram module only writes its own logic.
export function buildStage(el, { controlsHtml = "" } = {}) {
  el.innerHTML = `
    <div class="dg-stage">
      <canvas class="dg-canvas"></canvas>
    </div>
    <div class="dg-controls">${controlsHtml}</div>
  `;
  const canvas = el.querySelector(".dg-canvas");
  const controls = el.querySelector(".dg-controls");
  return { canvas, controls };
}
