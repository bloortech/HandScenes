// Lazy in-browser neural style transfer for the filter box's "style" filter.
// Uses the classic fast-neural-style ONNX models (vendored in models/style/)
// via ONNX Runtime Web — WebGPU when available, single-thread wasm fallback.
// Everything degrades gracefully: if ORT or a model fails, the caller falls
// back to the plain feed (no crash, no broken box).

let ortPromise = null;
function getOrt() {
  if (!ortPromise) {
    const base = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
    ortPromise = import(base + 'ort.webgpu.mjs').then((m) => {
      const ort = m.default || m;
      ort.env.wasm.wasmPaths = base;
      ort.env.wasm.numThreads = 1;          // no SharedArrayBuffer needed
      return ort;
    });
  }
  return ortPromise;
}

export class Stylizer {
  constructor(size = 224) {
    this.size = size;
    this.sessions = new Map();   // url -> InferenceSession
    this.current = null;
    this.busy = false;
    this.ready = false;
    this.failed = false;
    this._ort = null;

    this.inCanvas = document.createElement('canvas');
    this.inCanvas.width = this.inCanvas.height = size;
    this.inCtx = this.inCanvas.getContext('2d', { willReadFrequently: true });
    this.outCanvas = document.createElement('canvas');
    this.outCanvas.width = this.outCanvas.height = size;
    this.outCtx = this.outCanvas.getContext('2d');
  }

  // load (and cache) a model; switching styles just re-points .current
  async load(url) {
    if (this.failed) return null;
    if (this.sessions.has(url)) { this.current = this.sessions.get(url); this.ready = true; return this.current; }
    try {
      const ort = this._ort || (this._ort = await getOrt());
      let sess;
      try { sess = await ort.InferenceSession.create(url, { executionProviders: ['webgpu', 'wasm'] }); }
      catch (e) { sess = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] }); }
      this.sessions.set(url, sess);
      this.current = sess;
      this.ready = true;
      return sess;
    } catch (e) {
      console.warn('stylizer: load failed', e);
      this.failed = true;
      return null;
    }
  }

  // run the current model on a source (video/canvas); resolves to the output
  // canvas, or null if not ready / busy / failed. Self-throttles via `busy`.
  async run(source) {
    if (!this.ready || !this.current || this.busy || this.failed) return null;
    this.busy = true;
    try {
      const ort = this._ort, S = this.size, plane = S * S;
      this.inCtx.drawImage(source, 0, 0, S, S);
      const px = this.inCtx.getImageData(0, 0, S, S).data;
      const f = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        f[i] = px[i * 4];                 // R plane
        f[i + plane] = px[i * 4 + 1];     // G plane
        f[i + 2 * plane] = px[i * 4 + 2]; // B plane
      }
      const input = new ort.Tensor('float32', f, [1, 3, S, S]);
      const feeds = { [this.current.inputNames[0]]: input };
      const res = await this.current.run(feeds);
      const o = res[this.current.outputNames[0]].data;
      const od = this.outCtx.createImageData(S, S);
      for (let i = 0; i < plane; i++) {
        od.data[i * 4] = Math.max(0, Math.min(255, o[i]));
        od.data[i * 4 + 1] = Math.max(0, Math.min(255, o[i + plane]));
        od.data[i * 4 + 2] = Math.max(0, Math.min(255, o[i + 2 * plane]));
        od.data[i * 4 + 3] = 255;
      }
      this.outCtx.putImageData(od, 0, 0);
      return this.outCanvas;
    } catch (e) {
      console.warn('stylizer: run failed', e);
      this.failed = true;
      return null;
    } finally {
      this.busy = false;
    }
  }
}
