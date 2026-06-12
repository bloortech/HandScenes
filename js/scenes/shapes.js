// Scene 3: ASCII terminal shape.
// No strings: the region between your two hands becomes a geometric shape,
// and everything inside it is re-rendered as live ASCII characters (green
// phosphor on black, like a terminal) while keeping its shape — your face
// inside the rectangle becomes a face built from characters.
// Top edge runs between your index fingertips, bottom edge between your
// thumb tips; tilting/crossing your hands skews and folds the shape.
// Needs both hands in view.

import * as THREE from 'three';

const PARAMS = {
  videoDim: 0.6,    // unfiltered video brightness outside the shape
  asciiGrid: 90.0,  // character rows down the screen (higher = finer text)
  termColor: new THREE.Vector3(0.25, 1.0, 0.45), // green phosphor
};

// retro phosphor palette for the PHOSPHOR control
const PHOSPHORS = [
  { label: 'green', value: [0.25, 1.0, 0.45] },
  { label: 'amber', value: [1.0, 0.72, 0.2] },
  { label: 'cyan', value: [0.3, 0.9, 1.0] },
  { label: 'magenta', value: [1.0, 0.35, 0.8] },
  { label: 'white', value: [0.9, 1.0, 0.95] },
];

const bgVert = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bgFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  uniform float uDim;
  uniform float uAspect;
  uniform float uGrid;
  uniform vec3 uTerm;
  uniform float uScan;     // 1 = CRT scanlines on, 0 = off
  uniform int uFilter;     // which effect to apply inside the shape
  uniform vec2 uQuad[4];   // the 4 corners of the shape, in plane uv space
  uniform int uActive;
  in vec2 vUv;
  out vec4 fragColor;

  // 5x5 bitmap font: bit (x + 5*y) of n is one lit pixel of the glyph.
  float character(int n, vec2 p) {
    p = floor(p * vec2(-4.0, 4.0) + 2.5);
    if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
      int a = int(p.x) + 5 * int(p.y);
      if (((n >> a) & 1) == 1) return 1.0;
    }
    return 0.0;
  }

  bool insideQuad(vec2 uv) {
    bool inside = false;
    for (int i = 0; i < 4; i++) {
      vec2 a = uQuad[i];
      vec2 b = uQuad[i == 3 ? 0 : i + 1];
      if (((a.y > uv.y) != (b.y > uv.y)) &&
          (uv.x < (b.x - a.x) * (uv.y - a.y) / (b.y - a.y) + a.x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 jet(float t) {  // thermal: cold blue -> green -> yellow -> hot red
    return clamp(vec3(1.5 - abs(4.0 * t - 3.0),
                      1.5 - abs(4.0 * t - 2.0),
                      1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
  }

  vec3 asciiAt(vec2 uv) {
    vec2 cells = vec2(floor(uGrid * uAspect), uGrid);
    vec2 p = uv * cells;
    vec2 cellUv = (floor(p) + 0.5) / cells;
    float gray = dot(texture(uMap, uOffset + cellUv * uRepeat).rgb, vec3(0.3, 0.59, 0.11));
    int n = 4096;                  // .
    if (gray > 0.2) n = 65600;     // :
    if (gray > 0.3) n = 332772;    // *
    if (gray > 0.4) n = 15255086;  // o
    if (gray > 0.5) n = 23385164;  // &
    if (gray > 0.6) n = 15252014;  // 8
    if (gray > 0.7) n = 13199452;  // @
    if (gray > 0.8) n = 11512810;  // #
    float glyph = character(n, fract(p) - 0.5);
    float scan = mix(1.0, 0.85 + 0.15 * sin(uv.y * uGrid * 3.14159 * 2.0), uScan);
    return uTerm * glyph * (0.55 + 0.6 * gray) * scan + uTerm * 0.04;
  }

  void main() {
    vec3 raw = texture(uMap, uOffset + vUv * uRepeat).rgb;

    if (uActive == 1 && insideQuad(vUv)) {
      float luma = dot(raw, vec3(0.299, 0.587, 0.114));
      vec3 paper = vec3(0.96, 0.95, 0.90);
      vec3 col;

      if (uFilter == 0) {                 // ASCII terminal
        col = asciiAt(vUv);
      } else if (uFilter == 1) {          // thermal
        col = jet(luma);
      } else if (uFilter == 2) {          // risograph (grainy 2-ink)
        float l = luma + (hash(vUv * 431.7) - 0.5) * 0.12;
        col = paper;
        if (l < 0.74) col = mix(col, vec3(0.07, 0.19, 0.62), 0.88);
        if (l < 0.34) col = mix(col, vec3(0.92, 0.18, 0.22), 0.85);
      } else if (uFilter == 3) {          // cyanotype
        col = mix(vec3(0.04, 0.12, 0.34), vec3(0.93, 0.96, 0.98),
                  smoothstep(0.05, 0.95, luma));
      } else if (uFilter == 4) {          // halftone stipple
        vec2 g = vec2(vUv.x * uAspect, vUv.y) * (uGrid * 0.8);
        g = mat2(0.966, -0.259, 0.259, 0.966) * g;
        float ink = step(length(fract(g) - 0.5), (1.0 - luma) * 0.62);
        col = mix(paper, vec3(0.10, 0.10, 0.12), ink);
      } else if (uFilter == 5) {          // black & white
        col = vec3(smoothstep(0.05, 0.95, luma));
      } else if (uFilter == 6) {          // invert
        col = 1.0 - raw;
      } else {                            // duotone (uses the phosphor color)
        col = mix(vec3(0.10, 0.0, 0.25), uTerm, luma);
      }
      fragColor = vec4(col, 1.0);
    } else {
      fragColor = vec4(raw * uDim, 1.0);
    }
  }
`;

// corner anchors: index tips on top, thumb tips on the bottom
const TOP_ID = 8;
const BOT_ID = 4;

export class ShapesScene {
  constructor(renderer, video) {
    this.renderer = renderer;
    this.video = video;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    this.videoTex = new THREE.VideoTexture(video);
    this.quadPts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.bgMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      uniforms: {
        uMap: { value: this.videoTex },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uDim: { value: PARAMS.videoDim },
        uAspect: { value: 1 },
        uGrid: { value: PARAMS.asciiGrid },
        uTerm: { value: PARAMS.termColor.clone() },
        uScan: { value: 1 },
        uFilter: { value: 0 },
        uQuad: { value: this.quadPts },
        uActive: { value: 0 },
      },
    });
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bgMat);
    this.bg.position.z = -2.5;
    this.scene.add(this.bg);
    this.cover = { u: 1, v: 1 };
    this.updateLayout();

    // small green dots marking the four corners you're "holding"
    this.cornerDots = [];
    const dotGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x3dff72 });
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.visible = false;
      this.scene.add(dot);
      this.cornerDots.push(dot);
    }
  }

  updateLayout() {
    const sa = this.camera.aspect;
    const va = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    const cu = Math.min(1, sa / va);
    const cv = Math.min(1, va / sa);
    this.cover.u = cu;
    this.cover.v = cv;
    this.bgMat.uniforms.uRepeat.value.set(-cu, cv);
    this.bgMat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
    this.bgMat.uniforms.uAspect.value = sa;
    const dist = this.camera.position.z - this.bg.position.z;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
    this.bg.scale.set(h * sa, h, 1);
  }

  toPlaneUv(p) {
    return {
      x: 0.5 + (p.x - 0.5) / this.cover.u,
      y: 0.5 - (p.y - 0.5) / this.cover.v,
    };
  }

  toWorld(p) {
    const camZ = this.camera.position.z;
    const sx = 0.5 + (p.x - 0.5) / this.cover.u;
    const sy = 0.5 + (p.y - 0.5) / this.cover.v;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * camZ;
    const w = h * this.camera.aspect;
    return { x: (sx - 0.5) * w, y: (0.5 - sy) * h, z: 0 };
  }

  update(dt, hands) {
    if (hands.length >= 2) {
      const sorted = [...hands].sort(
        (a, b) => a.landmarks[0].x - b.landmarks[0].x);
      const L = sorted[0].landmarks;
      const R = sorted[sorted.length - 1].landmarks;
      // shape corners: Ltop -> Rtop -> Rbot -> Lbot
      const corners = [L[TOP_ID], R[TOP_ID], R[BOT_ID], L[BOT_ID]];
      for (let i = 0; i < 4; i++) {
        const s = this.toPlaneUv(corners[i]);
        this.quadPts[i].set(s.x, s.y);
        const w = this.toWorld(corners[i]);
        this.cornerDots[i].position.set(w.x, w.y, 0);
        this.cornerDots[i].visible = true;
      }
      this.bgMat.uniforms.uActive.value = 1;
    } else {
      this.bgMat.uniforms.uActive.value = 0;
      for (const d of this.cornerDots) d.visible = false;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateLayout();
  }

  getControls() {
    const u = this.bgMat.uniforms;
    const filters = [
      { label: 'ascii', value: 0 }, { label: 'thermal', value: 1 },
      { label: 'riso', value: 2 }, { label: 'cyano', value: 3 },
      { label: 'halftone', value: 4 }, { label: 'b&w', value: 5 },
      { label: 'invert', value: 6 }, { label: 'duotone', value: 7 },
    ];
    return [
      { type: 'select', id: 'filter', label: 'FILTER',
        value: u.uFilter.value, options: filters,
        set: (v) => { u.uFilter.value = v; } },
      { type: 'slider', id: 'grid', label: 'TEXT SIZE', min: 30, max: 150, step: 5,
        value: u.uGrid.value, set: (v) => { u.uGrid.value = v; } },
      { type: 'select', id: 'color', label: 'ASCII / DUOTONE COLOR',
        value: PHOSPHORS[0].value,
        options: PHOSPHORS.map((p) => ({ label: p.label, value: p.value })),
        set: (v) => u.uTerm.value.set(v[0], v[1], v[2]) },
      { type: 'slider', id: 'dim', label: 'OUTSIDE', min: 0, max: 1, step: 0.05,
        value: u.uDim.value, set: (v) => { u.uDim.value = v; } },
      { type: 'toggle', id: 'scan', label: 'SCANLINES',
        value: u.uScan.value === 1, set: (v) => { u.uScan.value = v ? 1 : 0; } },
    ];
  }
}
