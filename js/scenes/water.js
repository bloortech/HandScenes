// Scene 2: a sphere of water you touch with your hands.
// GPU heightfield wave sim (ping-pong render targets) wrapped around a sphere
// (equirectangular uv, seamless around the equator). Vertices displace along
// the sphere normals. Your hand maps onto the front hemisphere: left/right =
// around, up/down = toward the poles; ripples travel around to the back.

import * as THREE from 'three';

const PARAMS = {
  simRes: 256,           // sim texture resolution
  radius: 5.5,           // sphere radius in world units
  substeps: 3,           // sim steps per frame (faster wave travel)
  stiffness: 1.1,        // wave propagation speed (keep <= ~1.8 for stability)
  damping: 0.987,
  heightScale: 0.55,     // displacement along the normal
  normalScale: 9.0,      // how strongly ripples bend the lighting
  dropRadius: 0.016,     // ripple stamp size in uv
  dropStrength: 0.14,    // scales with finger speed
  minSpeed: 0.08,        // ignore micro-jitter below this normalized speed
  latBand: 0.7,          // fraction of latitude your hand can reach (avoids poles)
  sun: new THREE.Vector3(-0.45, 0.55, 0.7).normalize(),
  deepColor: new THREE.Color(0x06283d),
  shallowColor: new THREE.Color(0x2a7f9e),
  skyTop: new THREE.Color(0x10243f),
  skyBottom: new THREE.Color(0xd9a06b),   // dusk horizon
  background: new THREE.Color(0x070b14),
};

const MAX_DROPS = 10;

const simFrag = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform float uStiffness;
  uniform float uDamping;
  uniform vec3 uDrops[${MAX_DROPS}];   // xy = uv, z = strength
  uniform int uDropCount;
  uniform float uDropRadius;
  varying vec2 vUv;

  void main() {
    vec4 data = texture2D(uPrev, vUv);
    float h = data.x;
    float v = data.y;
    float sum =
      texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).x +
      texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).x +
      texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).x +
      texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).x;
    v += (sum * 0.25 - h) * uStiffness;
    v *= uDamping;
    h += v;
    for (int i = 0; i < ${MAX_DROPS}; i++) {
      if (i >= uDropCount) break;
      vec2 d2 = abs(vUv - uDrops[i].xy);
      d2.x = min(d2.x, 1.0 - d2.x);   // seam-aware distance (u wraps)
      float d = length(d2);
      h -= uDrops[i].z * exp(-d * d / (uDropRadius * uDropRadius));
    }
    h = clamp(h * 0.9995, -4.0, 4.0);
    gl_FragColor = vec4(h, v, 0.0, 1.0);
  }
`;

const surfaceVert = /* glsl */ `
  uniform sampler2D uHeight;
  uniform float uHeightScale;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    float h = texture2D(uHeight, uv).x;
    vec3 p = position + normal * h * uHeightScale;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const surfaceFrag = /* glsl */ `
  uniform sampler2D uHeight;
  uniform vec2 uTexel;
  uniform float uNormalScale;
  uniform vec3 uSunDir;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uCamPos;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    float hL = texture2D(uHeight, vUv - vec2(uTexel.x, 0.0)).x;
    float hR = texture2D(uHeight, vUv + vec2(uTexel.x, 0.0)).x;
    float hB = texture2D(uHeight, vUv - vec2(0.0, uTexel.y)).x;
    float hT = texture2D(uHeight, vUv + vec2(0.0, uTexel.y)).x;

    // tangent frame on the sphere (east/north); nudge avoids pole degeneracy
    vec3 N = normalize(vNormal);
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 0.0));
    vec3 B = cross(N, T);
    vec3 n = normalize(N + ((hL - hR) * T + (hB - hT) * B) * uNormalScale);

    vec3 viewDir = normalize(uCamPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 refl = reflect(-viewDir, n);
    vec3 sky = mix(uSkyBottom, uSkyTop, clamp(refl.y * 1.4 + 0.15, 0.0, 1.0));
    float spec = pow(max(dot(refl, uSunDir), 0.0), 240.0);

    float h = texture2D(uHeight, vUv).x;
    vec3 water = mix(uDeepColor, uShallowColor, clamp(h * 1.5 + 0.4, 0.0, 1.0));
    vec3 col = mix(water, sky, clamp(fresnel * 0.92 + 0.06, 0.0, 1.0));
    col += spec * vec3(1.0, 0.93, 0.75) * 2.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class WaterScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = PARAMS.background.clone();
    this.camera = new THREE.PerspectiveCamera(
      50, innerWidth / innerHeight, 0.1, 200);
    this.camera.position.set(0, 1.5, 15);
    this.camera.lookAt(0, 0, 0);

    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.RepeatWrapping,        // wave sim wraps around the equator
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(PARAMS.simRes, PARAMS.simRes, opts);
    this.rtB = new THREE.WebGLRenderTarget(PARAMS.simRes, PARAMS.simRes, opts);

    const texel = new THREE.Vector2(1 / PARAMS.simRes, 1 / PARAMS.simRes);
    this.simMat = new THREE.ShaderMaterial({
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
      fragmentShader: simFrag,
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: texel },
        uStiffness: { value: PARAMS.stiffness },
        uDamping: { value: PARAMS.damping },
        uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector3()) },
        uDropCount: { value: 0 },
        uDropRadius: { value: PARAMS.dropRadius },
      },
    });
    this.simScene = new THREE.Scene();
    this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMat));

    this.surfMat = new THREE.ShaderMaterial({
      vertexShader: surfaceVert,
      fragmentShader: surfaceFrag,
      uniforms: {
        uHeight: { value: this.rtA.texture },
        uTexel: { value: texel },
        uHeightScale: { value: PARAMS.heightScale },
        uNormalScale: { value: PARAMS.normalScale },
        uSunDir: { value: PARAMS.sun },
        uDeepColor: { value: PARAMS.deepColor },
        uShallowColor: { value: PARAMS.shallowColor },
        uSkyTop: { value: PARAMS.skyTop },
        uSkyBottom: { value: PARAMS.skyBottom },
        uCamPos: { value: this.camera.position },
      },
    });
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(PARAMS.radius, 256, 160), this.surfMat);
    this.scene.add(orb);
  }

  update(dt, hands) {
    const drops = this.simMat.uniforms.uDrops.value;
    let count = 0;
    for (const hand of hands) {
      for (const tip of hand.tips) {
        if (count >= MAX_DROPS) break;
        const speed = Math.min(tip.speed, 3.0);
        if (speed < PARAMS.minSpeed) continue;
        // hand x sweeps the front hemisphere (u=0.25 faces the camera),
        // hand y moves between the poles (band-limited to avoid pinching)
        const u = 0.25 + (tip.x - 0.5) * 0.5;
        const v = 0.5 - (tip.y - 0.5) * PARAMS.latBand;
        drops[count].set((u + 1) % 1, v, PARAMS.dropStrength * speed);
        count++;
      }
    }
    this.simMat.uniforms.uDropCount.value = count;

    for (let s = 0; s < PARAMS.substeps; s++) {
      this.simMat.uniforms.uPrev.value = this.rtA.texture;
      this.renderer.setRenderTarget(this.rtB);
      this.renderer.render(this.simScene, this.simCamera);
      this.renderer.setRenderTarget(null);
      [this.rtA, this.rtB] = [this.rtB, this.rtA];
      this.simMat.uniforms.uDropCount.value = 0; // inject drops once per frame
    }
    this.surfMat.uniforms.uHeight.value = this.rtA.texture;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
