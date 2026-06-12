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

  void main() {
    vec3 raw = texture(uMap, uOffset + vUv * uRepeat).rgb;

    if (uActive == 1 && insideQuad(vUv)) {
      // snap to a character cell, sample the video at the cell's center
      vec2 cells = vec2(floor(uGrid * uAspect), uGrid);
      vec2 p = vUv * cells;
      vec2 cellUv = (floor(p) + 0.5) / cells;
      vec3 c = texture(uMap, uOffset + cellUv * uRepeat).rgb;
      float gray = dot(c, vec3(0.3, 0.59, 0.11));

      // brightness -> glyph (sparse for dark cells, dense for bright)
      int n = 4096;                       // .
      if (gray > 0.2) n = 65600;          // :
      if (gray > 0.3) n = 332772;         // *
      if (gray > 0.4) n = 15255086;       // o
      if (gray > 0.5) n = 23385164;       // &
      if (gray > 0.6) n = 15252014;       // 8
      if (gray > 0.7) n = 13199452;       // @
      if (gray > 0.8) n = 11512810;       // #

      float glyph = character(n, fract(p) - 0.5);
      float scan = mix(1.0, 0.85 + 0.15 * sin(vUv.y * uGrid * 3.14159 * 2.0), uScan);
      vec3 col = uTerm * glyph * (0.55 + 0.6 * gray) * scan;
      col += uTerm * 0.04; // faint phosphor glow in empty cells
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
    return [
      { type: 'slider', id: 'grid', label: 'TEXT SIZE', min: 30, max: 150, step: 5,
        value: u.uGrid.value, set: (v) => { u.uGrid.value = v; } },
      { type: 'select', id: 'color', label: 'PHOSPHOR',
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
