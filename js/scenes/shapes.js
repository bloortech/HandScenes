// Scene 3: ASCII terminal shape.
// No strings: the region between your two hands becomes a geometric shape,
// and everything inside it is re-rendered as live ASCII characters (green
// phosphor on black, like a terminal) while keeping its shape — your face
// inside the rectangle becomes a face built from characters.
// Top edge runs between your index fingertips, bottom edge between your
// thumb tips; tilting/crossing your hands skews and folds the shape.
// Needs both hands in view.

import * as THREE from 'three';
import { disposeObject } from './dispose.js';

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
  uniform float uScan;        // 1 = CRT scanlines on, 0 = off
  uniform int uMode;          // 0 = flat 2D rectangle, 1 = 3D box
  uniform vec2 uQuad[4];      // front face (and the 2D rectangle)
  uniform vec2 uBack[4];      // back face (3D) -> same filter as front
  uniform vec2 uTop[4];       // top face (3D)
  uniform vec2 uBottom[4];    // bottom face (3D) -> same filter as top
  uniform vec2 uSide[4];      // right face (3D)
  uniform vec2 uLeft[4];      // left face (3D) -> same filter as side
  uniform int uFilterFront;   // front + back filter (also the 2D filter)
  uniform int uFilterTop;     // top + bottom filter
  uniform int uFilterSide;    // left + right filter
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

  bool inQuad(vec2 q[4], vec2 uv) {
    bool inside = false;
    for (int i = 0; i < 4; i++) {
      vec2 a = q[i];
      vec2 b = q[i == 3 ? 0 : i + 1];
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

  vec3 applyFilter(int f, vec2 uv, vec3 raw) {
    float luma = dot(raw, vec3(0.299, 0.587, 0.114));
    vec3 paper = vec3(0.96, 0.95, 0.90);
    if (f == 0) return asciiAt(uv);
    if (f == 1) return jet(luma);
    if (f == 2) {                       // risograph (grainy 2-ink green + white)
      float l = luma + (hash(uv * 431.7) - 0.5) * 0.12;
      vec3 col = paper;
      if (l < 0.74) col = mix(col, vec3(0.20, 0.62, 0.36), 0.88);
      if (l < 0.34) col = mix(col, vec3(0.04, 0.30, 0.16), 0.85);
      return col;
    }
    if (f == 3) return mix(vec3(0.04, 0.12, 0.34), vec3(0.93, 0.96, 0.98),
                           smoothstep(0.05, 0.95, luma));
    if (f == 4) {                       // halftone stipple
      vec2 g = vec2(uv.x * uAspect, uv.y) * (uGrid * 0.8);
      g = mat2(0.966, -0.259, 0.259, 0.966) * g;
      float ink = step(length(fract(g) - 0.5), (1.0 - luma) * 0.62);
      return mix(paper, vec3(0.10, 0.10, 0.12), ink);
    }
    if (f == 5) return vec3(smoothstep(0.05, 0.95, luma));
    if (f == 6) return 1.0 - raw;
    if (f == 7) return mix(vec3(0.10, 0.0, 0.25), uTerm, luma);   // duotone
    // stipple (f == 8): pointillist ink dots, darker -> bigger jittered dot
    float g = uGrid * 0.7;
    vec2 cells = vec2(floor(g * uAspect), g);
    vec2 id = floor(uv * cells);
    float sg = dot(texture(uMap, uOffset + ((id + 0.5) / cells) * uRepeat).rgb, vec3(0.3, 0.59, 0.11));
    vec2 fp = fract(uv * cells) - 0.5;
    vec2 jit = (vec2(hash(id), hash(id + 7.1)) - 0.5) * 0.5;
    float rad = (1.0 - sg) * 0.62;
    float dot = 1.0 - smoothstep(rad - 0.12, rad, length(fp - jit));
    return mix(vec3(0.96, 0.95, 0.90), vec3(0.07, 0.07, 0.09), dot);
  }

  void main() {
    vec3 raw = texture(uMap, uOffset + vUv * uRepeat).rgb;
    int fid = -1;
    if (uActive == 1) {
      if (uMode == 1) {
        // 3D box: front (nearest) wins, then the 4 connecting faces, then back.
        // opposite faces share a filter: front=back, top=bottom, left=right.
        if (inQuad(uQuad, vUv)) fid = uFilterFront;
        else if (inQuad(uTop, vUv)) fid = uFilterTop;
        else if (inQuad(uBottom, vUv)) fid = uFilterTop;
        else if (inQuad(uSide, vUv)) fid = uFilterSide;
        else if (inQuad(uLeft, vUv)) fid = uFilterSide;
        else if (inQuad(uBack, vUv)) fid = uFilterFront;
      } else if (inQuad(uQuad, vUv)) {
        fid = uFilterFront;
      }
    }
    fragColor = (fid >= 0) ? vec4(applyFilter(fid, vUv, raw), 1.0)
                           : vec4(raw * uDim, 1.0);
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
    this.backPts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.topPts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.bottomPts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.sidePts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.leftPts = Array.from({ length: 4 }, () => new THREE.Vector2());
    this.mode = 0; // 0 = 2D rectangle (default), 1 = 3D box
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
        uMode: { value: 0 },
        uQuad: { value: this.quadPts },
        uBack: { value: this.backPts },
        uTop: { value: this.topPts },
        uBottom: { value: this.bottomPts },
        uSide: { value: this.sidePts },
        uLeft: { value: this.leftPts },
        uFilterFront: { value: 0 },
        uFilterTop: { value: 1 },
        uFilterSide: { value: 5 },
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

    // wireframe cuboid: the front face is the filtered quad; spreading your
    // index & middle fingers extrudes it back into a 3D box (12 edges).
    const boxGeo = new THREE.BufferGeometry();
    this.boxPos = new Float32Array(24 * 3);   // 12 edges (full cuboid)
    boxGeo.setAttribute('position', new THREE.BufferAttribute(this.boxPos, 3));
    this.box = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({
      color: 0x3dff72, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthTest: false }));
    this.box.frustumCulled = false;
    this.box.visible = false;
    this.scene.add(this.box);
    this.depthMax = 1.6;   // how far the index<->middle spread extrudes the box
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
      // front face corners (index tips top, thumbs bottom): Ltop,Rtop,Rbot,Lbot
      const corners = [L[TOP_ID], R[TOP_ID], R[BOT_ID], L[BOT_ID]];
      const FP = [];               // front corners in plane-uv space
      for (let i = 0; i < 4; i++) {
        const s = this.toPlaneUv(corners[i]);
        this.quadPts[i].set(s.x, s.y);
        FP.push(s);
        const w = this.toWorld(corners[i]);
        this.cornerDots[i].position.set(w.x, w.y, 0);
        this.cornerDots[i].visible = true;
      }
      this.bgMat.uniforms.uActive.value = 1;
      this.bgMat.uniforms.uMode.value = this.mode;

      if (this.mode === 1) {
        // the box's DEPTH is tracked by your middle fingers: the back face is
        // offset by the (index -> middle) vector of each hand, in screen space
        const g = this.depthMax;
        const offUv = (() => {
          const v = (lm) => {
            const a = this.toPlaneUv(lm[8]), b = this.toPlaneUv(lm[12]);
            return { x: b.x - a.x, y: b.y - a.y };
          };
          const vl = v(L), vr = v(R);
          return { x: (vl.x + vr.x) / 2 * g, y: (vl.y + vr.y) / 2 * g };
        })();
        const BP = FP.map((p) => ({ x: p.x + offUv.x, y: p.y + offUv.y }));
        // top face = front-top edge extruded; side face = front-right edge extruded
        const setFace = (arr, a, b) => { arr[0].copy(this.quadPts[a]); arr[1].copy(this.quadPts[b]);
          arr[2].set(BP[b].x, BP[b].y); arr[3].set(BP[a].x, BP[a].y); };
        setFace(this.topPts, 0, 1);     // top edge
        setFace(this.sidePts, 1, 2);    // right edge
        setFace(this.bottomPts, 2, 3);  // bottom edge (shares top filter)
        setFace(this.leftPts, 3, 0);    // left edge (shares side filter)
        for (let i = 0; i < 4; i++) this.backPts[i].set(BP[i].x, BP[i].y);

        // wireframe cuboid in world space (back = front + the same offset)
        const PW = corners.map((c) => this.toWorld(c));
        const mv = (lm) => {
          const a = this.toWorld(lm[8]), b = this.toWorld(lm[12]);
          return { x: b.x - a.x, y: b.y - a.y };
        };
        const ml = mv(L), mr = mv(R);
        const ox = (ml.x + mr.x) / 2 * g, oy = (ml.y + mr.y) / 2 * g;
        const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        const vert = (i) => (i < 4 ? PW[i] : { x: PW[i - 4].x + ox, y: PW[i - 4].y + oy, z: 0 });
        let o = 0;
        for (const [a, b] of EDGES) {
          const va = vert(a), vb = vert(b);
          this.boxPos[o++] = va.x; this.boxPos[o++] = va.y; this.boxPos[o++] = va.z;
          this.boxPos[o++] = vb.x; this.boxPos[o++] = vb.y; this.boxPos[o++] = vb.z;
        }
        this.box.geometry.attributes.position.needsUpdate = true;
        this.box.visible = true;
      } else {
        this.box.visible = false;
      }
    } else {
      this.bgMat.uniforms.uActive.value = 0;
      for (const d of this.cornerDots) d.visible = false;
      this.box.visible = false;
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

  dispose() {
    disposeObject(this.scene);
  }

  getControls() {
    const u = this.bgMat.uniforms;
    const filters = [
      { label: 'ascii', value: 0 }, { label: 'thermal', value: 1 },
      { label: 'riso', value: 2 }, { label: 'cyano', value: 3 },
      { label: 'halftone', value: 4 }, { label: 'b&w', value: 5 },
      { label: 'invert', value: 6 }, { label: 'duotone', value: 7 },
      { label: 'stipple', value: 8 },
    ];
    // rebuild:true — changing a face's filter changes which knobs are relevant
    const filt = (id, label, key) => ({
      type: 'select', id, label, value: u[key].value, options: filters, rebuild: true,
      set: (v) => { u[key].value = v; },
    });
    const is3D = this.mode === 1;
    // filters actually visible right now (2D shows only the front face)
    const active = is3D
      ? [u.uFilterFront.value, u.uFilterTop.value, u.uFilterSide.value]
      : [u.uFilterFront.value];
    const uses = (...fs) => fs.some((f) => active.includes(f));

    const list = [
      { type: 'select', id: 'mode', label: 'MODE', value: this.mode, rebuild: true,
        options: [{ label: '2D', value: 0 }, { label: '3D', value: 1 }],
        set: (v) => { this.mode = v; u.uMode.value = v; } },
      filt('front', is3D ? 'FRONT / BACK' : 'FILTER', 'uFilterFront'),
    ];
    if (is3D) {
      list.push(filt('top', 'TOP / BOTTOM', 'uFilterTop'));
      list.push(filt('side', 'LEFT / RIGHT', 'uFilterSide'));
      list.push({ type: 'slider', id: 'depth', label: 'DEPTH', min: 0.2, max: 3, step: 0.1,
        value: this.depthMax, set: (v) => { this.depthMax = v; } });
    }
    // grid size drives ascii text, halftone + stipple dots; ink colour is for
    // ascii + duotone; scanlines only affect ascii. Show each only when used.
    if (uses(0, 4, 8)) {
      list.push({ type: 'slider', id: 'grid', label: uses(0) ? 'TEXT SIZE' : 'DOT SIZE',
        min: 30, max: 150, step: 5,
        value: u.uGrid.value, set: (v) => { u.uGrid.value = v; } });
    }
    if (uses(0, 7)) {
      list.push({ type: 'select', id: 'color', label: uses(0) ? 'ASCII COLOR' : 'DUOTONE COLOR',
        value: PHOSPHORS[0].value,
        options: PHOSPHORS.map((p) => ({ label: p.label, value: p.value })),
        set: (v) => u.uTerm.value.set(v[0], v[1], v[2]) });
    }
    list.push({ type: 'slider', id: 'dim', label: 'OUTSIDE', min: 0, max: 1, step: 0.05,
      value: u.uDim.value, set: (v) => { u.uDim.value = v; } });
    if (uses(0)) {
      list.push({ type: 'toggle', id: 'scan', label: 'SCANLINES',
        value: u.uScan.value === 1, set: (v) => { u.uScan.value = v ? 1 : 0; } });
    }
    return list;
  }
}
