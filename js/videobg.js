// Live webcam feed as a frustum-filling backdrop inside a 3D scene
// (mirrored selfie view, CSS-style "cover" crop), plus the landmark->world
// mapping that keeps 3D objects glued to the on-screen image.
// Supports dimming and desaturation; the cradle scene keeps its own
// shader version with the per-finger filter quads.

import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  uniform float uDim;
  uniform float uSat;
  varying vec2 vUv;
  void main() {
    vec3 col = texture2D(uMap, uOffset + vUv * uRepeat).rgb;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, uSat) * uDim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class VideoBackground {
  constructor(video, camera, { dim = 0.85, sat = 1.0, z = -2.5 } = {}) {
    this.video = video;
    this.camera = camera;
    this.tex = new THREE.VideoTexture(video);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uMap: { value: this.tex },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uDim: { value: dim },
        uSat: { value: sat },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.position.z = z;
    this.cover = { u: 1, v: 1 };
    this.updateLayout();
  }

  updateLayout() {
    const sa = this.camera.aspect;
    const va = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    const cu = Math.min(1, sa / va);
    const cv = Math.min(1, va / sa);
    this.cover.u = cu;
    this.cover.v = cv;
    // repeat.x negative = mirrored (matches the mirrored landmarks)
    this.mat.uniforms.uRepeat.value.set(-cu, cv);
    this.mat.uniforms.uOffset.value.set(0.5 + cu / 2, 0.5 - cv / 2);
    const dist = this.camera.position.z - this.mesh.position.z;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
    this.mesh.scale.set(h * sa, h, 1);
  }

  // normalized video coords (0..1, y down) -> world, glued to the image
  toWorld(p, depthScale = 0) {
    const camZ = this.camera.position.z;
    const sx = 0.5 + (p.x - 0.5) / this.cover.u;
    const sy = 0.5 + (p.y - 0.5) / this.cover.v;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * camZ;
    const w = h * this.camera.aspect;
    const z = THREE.MathUtils.clamp(-p.z * depthScale, -1.5, 1.5);
    const k = (camZ - z) / camZ;
    return { x: (sx - 0.5) * w * k, y: (0.5 - sy) * h * k, z };
  }

  // normalized video coords -> background plane uv (screen space, v up)
  toPlaneUv(p) {
    return {
      x: 0.5 + (p.x - 0.5) / this.cover.u,
      y: 0.5 - (p.y - 0.5) / this.cover.v,
    };
  }
}
