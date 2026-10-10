// Canvas 2D renderer for algorithm frames. DOM-facing (unlike topics/*.js).
// Draws arrays as a row of blocks: each block's height is a bar whose
// fill level reflects the value, with a column of dots as the fill
// texture (the "Bloort" look: dots and blocks together, one consistent
// visual, applied consistently everywhere in this engine).
//
// Colors:
//   ink    rgba(237,237,230, a)  default block
//   amber  #E8B84B                active element (pivot, index pointer)
//   cyan   #7CD5E8                comparison pulse
// Extensible: node/edge drawing for graph modules is included but unused
// by m01 topics.

const INK = [237, 237, 230];
const AMBER = '#E8B84B';
const CYAN = '#7CD5E8';
const BG = '#0b0b0c';
const DIM_RANGE_ALPHA = 0.35;

function reducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

export class ArrayRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);
    this.resize();
    // Animation state for smooth block transitions between frames.
    this._prevFrame = null;
    this._animStart = 0;
    this._animFrom = null;
    this._raf = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = w;
    this.height = h;
    // resizing a canvas clears it, so repaint whatever was showing
    if (this._lastFrame) this._drawFrame(this._lastFrame);
  }

  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  // Render a single frame (plain object from a topic's run() generator).
  render(frame) {
    if (!frame) return;
    this._lastFrame = frame;
    this._drawFrame(frame);
  }

  _drawFrame(frame) {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const array = frame.array || [];
    const n = array.length;
    if (n === 0) {
      ctx.fillStyle = `rgba(${INK.join(',')},0.5)`;
      ctx.font = '13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('(empty array)', w / 2, h / 2);
      return;
    }

    const maxVal = Math.max(1, ...array.map((v) => Math.abs(v)));
    const padX = 16, padTop = 16, padBottom = 28;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;
    const gap = Math.max(2, Math.min(8, plotW / n * 0.15));
    const blockW = Math.max(2, (plotW - gap * (n - 1)) / n);

    const compareSet = new Set(frame.compareIdx || []);
    const activeSet = new Set(
      Array.isArray(frame.activeIdx) ? frame.activeIdx : (frame.activeIdx != null ? [frame.activeIdx] : [])
    );
    const sortedSet = new Set(frame.sortedIdx || []);
    const rangeLo = frame.range ? frame.range[0] : null;
    const rangeHi = frame.range ? frame.range[1] : null;

    for (let i = 0; i < n; i++) {
      const v = array[i];
      const blockH = Math.max(3, (Math.abs(v) / maxVal) * plotH);
      const x = padX + i * (blockW + gap);
      const y = padTop + (plotH - blockH);

      let inRange = rangeLo == null || (i >= rangeLo && i <= rangeHi);
      let alpha = inRange ? 0.85 : DIM_RANGE_ALPHA;
      let fillColor = `rgba(${INK.join(',')},${alpha})`;
      let strokeColor = null;

      if (sortedSet.has(i)) {
        fillColor = `rgba(${INK.join(',')},0.55)`;
      }
      if (compareSet.has(i)) {
        strokeColor = CYAN;
        fillColor = 'rgba(124,213,232,0.35)';
      }
      if (activeSet.has(i)) {
        strokeColor = AMBER;
        fillColor = 'rgba(232,184,75,0.4)';
      }

      // Block body.
      ctx.fillStyle = fillColor;
      roundRect(ctx, x, y, blockW, blockH, 3);
      ctx.fill();

      if (strokeColor) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = strokeColor;
        roundRect(ctx, x, y, blockW, blockH, 3);
        ctx.stroke();
      }

      // Dot column texture: a few dots up the inside of the block.
      const dotCount = Math.max(1, Math.floor(blockH / 10));
      ctx.fillStyle = `rgba(11,11,12,0.5)`;
      for (let d = 0; d < dotCount; d++) {
        const dy = y + blockH - 6 - d * 10;
        if (dy < y + 4) break;
        ctx.beginPath();
        ctx.arc(x + blockW / 2, dy, Math.min(2, blockW / 6), 0, Math.PI * 2);
        ctx.fill();
      }

      // Value label under small arrays.
      if (n <= 24) {
        ctx.fillStyle = `rgba(${INK.join(',')},0.7)`;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(v), x + blockW / 2, h - padBottom + 14);
      }

      // Index pointer markers for binary search (lo/hi/mid/target region).
      if (frame.mid === i) {
        ctx.fillStyle = AMBER;
        ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
        ctx.fillText('mid', x + blockW / 2, y - 6);
      }
      if (frame.lo === i && frame.lo !== frame.mid) {
        ctx.fillStyle = `rgba(124,213,232,0.9)`;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText('lo', x + blockW / 2, y - 6);
      }
      if (frame.hi === i && frame.hi !== frame.mid) {
        ctx.fillStyle = `rgba(124,213,232,0.9)`;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText('hi', x + blockW / 2, y - 6);
      }
    }
  }

  // Minimal node/edge drawing, kept here so later graph modules can reuse
  // this same renderer/canvas setup without redoing DPR/resize plumbing.
  renderGraph(frame) {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const nodes = frame.nodes || [];
    const edges = frame.edges || [];
    ctx.strokeStyle = `rgba(${INK.join(',')},0.3)`;
    ctx.lineWidth = 1.5;
    for (const e of edges) {
      const a = nodes[e[0]], b = nodes[e[1]];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const node of nodes) {
      ctx.beginPath();
      ctx.fillStyle = node.active ? AMBER : (node.compare ? CYAN : `rgba(${INK.join(',')},0.85)`);
      ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export { reducedMotion, AMBER, CYAN, INK, BG };
