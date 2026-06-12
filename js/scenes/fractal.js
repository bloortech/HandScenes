// Scene 4: morphing Mandelbox fractal.
// Ported from the HandFlower TouchDesigner build (shaders/fractal.glsl), with
// the same hand mapping:
//   open fist   -> zoom in (+ brightness/fold)
//   hand left/right -> orbit
//   hand up/down    -> fold the box
//   pinch       -> morph the shape
// Pure generated visual (no webcam feed in the picture); the webcam only
// drives the tracking. Fullscreen raymarch.

import * as THREE from 'three';

const PARAMS = {
  smooth: 6,        // how fast the fractal follows your hand
};

// meteoric gold/purple, plus a few alternates for the PALETTE control
const PALETTES = {
  meteoric: [[0.16, 0.14, 0.12], [0.74, 0.56, 0.22], [0.42, 0.20, 0.55]],
  ember:    [[0.10, 0.02, 0.02], [0.80, 0.30, 0.05], [1.00, 0.85, 0.40]],
  ice:      [[0.05, 0.08, 0.12], [0.20, 0.50, 0.70], [0.85, 0.96, 1.00]],
  mono:     [[0.05, 0.05, 0.06], [0.45, 0.47, 0.50], [0.95, 0.97, 1.00]],
  acid:     [[0.05, 0.10, 0.04], [0.35, 0.85, 0.15], [0.85, 0.30, 0.85]],
};

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  precision highp float;
  uniform float u_energy, u_time, u_open, u_x, u_y, u_pinch;
  uniform float u_aspect, u_speed, u_glow;
  uniform vec3 u_colA, u_colB, u_colC;
  varying vec2 vUv;

  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  vec3 palette3(float x){
    x = clamp(x, 0.0, 1.0);
    return x < 0.5 ? mix(u_colA, u_colB, x * 2.0)
                   : mix(u_colB, u_colC, (x - 0.5) * 2.0);
  }

  float deMandelbox(vec3 p, float scale, float foldLimit){
    vec3 z = p; float dr = 1.0;
    for (int i = 0; i < 8; i++){
      z = clamp(z, -foldLimit, foldLimit) * 2.0 - z;
      float r2 = dot(z, z);
      if      (r2 < 0.25) { z *= 4.0;            dr *= 4.0; }
      else if (r2 < 1.0)  { float k = 1.0 / r2;  z *= k; dr *= k; }
      z  = z * scale + p;
      dr = dr * abs(scale) + 1.0;
    }
    return length(z) / abs(dr);
  }

  void main(){
    vec2 uv = vUv - vec2(0.5);
    uv.x *= u_aspect;

    float scale     = -1.7 - u_pinch * 0.9;            // PINCH morphs the shape
    float foldLimit =  0.8 + u_y     * 0.8;            // RAISE hand folds
    float yaw       = u_time * 0.01 * u_speed + (u_x - 0.5) * 3.0;
    float pitch     = -0.15;
    float dist      =  4.2 - u_open  * 2.5;            // OPEN hand zooms in

    vec3 ro = vec3(0.0, 0.0, -dist);
    vec3 rd = normalize(vec3(uv, 1.25));
    rd.yz *= rot(pitch); ro.yz *= rot(pitch);
    rd.xz *= rot(yaw);   ro.xz *= rot(yaw);

    float t = 0.0, glow = 0.0;
    for (int i = 0; i < 90; i++){
      vec3 p = ro + rd * t;
      float d = deMandelbox(p, scale, foldLimit);
      glow += 0.020 / (d + 0.05);
      if (d < 0.0008 || t > 14.0) break;
      t += max(d * 0.85, 0.004);
    }

    float k = clamp(t * 0.12 + 0.05 * sin(u_time * 0.05), 0.0, 1.0);
    vec3 col = palette3(k) * glow * 0.05 * u_glow;
    col *= 0.45 + u_energy * 1.00 + u_open * 0.40;
    col  = col / (1.0 + col);
    col  = pow(col, vec3(0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class FractalScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera(); // vertex writes clip space directly

    const p = PALETTES.meteoric;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        u_energy: { value: 0.2 }, u_time: { value: 0 },
        u_open: { value: 0.5 }, u_x: { value: 0.5 },
        u_y: { value: 0.5 }, u_pinch: { value: 0.5 },
        u_aspect: { value: 1 }, u_speed: { value: 1 }, u_glow: { value: 1 },
        u_colA: { value: new THREE.Vector3(...p[0]) },
        u_colB: { value: new THREE.Vector3(...p[1]) },
        u_colC: { value: new THREE.Vector3(...p[2]) },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));

    this.time = 0;
    // smoothed gesture state (held when no hand is visible, like the TD build)
    this.open = 0.5; this.x = 0.5; this.y = 0.5; this.pinch = 0.5;
  }

  update(dt, hands) {
    this.time += dt;
    const u = this.mat.uniforms;
    const hand = hands[0];
    if (hand) {
      const k = Math.min(1, dt * PARAMS.smooth);
      this.open += (hand.openness - this.open) * k;
      this.x += (hand.landmarks[0].x - this.x) * k;
      this.y += (hand.landmarks[0].y - this.y) * k;
      this.pinch += (hand.pinch - this.pinch) * k;
    }
    u.u_time.value = this.time;
    u.u_energy.value = 0.2 + 0.08 * Math.sin(this.time * 0.35); // slow breathing
    u.u_open.value = this.open;
    u.u_x.value = this.x;
    u.u_y.value = this.y;
    u.u_pinch.value = this.pinch;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.mat.uniforms.u_aspect.value = w / h;
  }

  getControls() {
    const u = this.mat.uniforms;
    return [
      { type: 'slider', id: 'speed', label: 'SPIN', min: 0, max: 4, step: 0.1,
        value: u.u_speed.value, set: (v) => { u.u_speed.value = v; } },
      { type: 'slider', id: 'glow', label: 'GLOW', min: 0.3, max: 2.5, step: 0.1,
        value: u.u_glow.value, set: (v) => { u.u_glow.value = v; } },
      { type: 'select', id: 'palette', label: 'PALETTE', value: 'meteoric',
        options: Object.keys(PALETTES).map((k) => ({ label: k, value: k })),
        set: (name) => {
          const pal = PALETTES[name];
          u.u_colA.value.set(...pal[0]);
          u.u_colB.value.set(...pal[1]);
          u.u_colC.value.set(...pal[2]);
        } },
    ];
  }
}
