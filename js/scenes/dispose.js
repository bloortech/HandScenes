// Free a scene's GPU resources when it's evicted from the LRU warm cache.
// IMPORTANT: the WebGLRenderer is SHARED across every scene and is never
// touched here — we only release what a scene built in its own constructor
// (geometry, materials, the textures they reference, and render targets).
// VideoTextures are per-scene wrappers around the shared <video> element, so
// disposing them frees GL state without stopping the camera feed.

function disposeMaterial(mat) {
  // textures stored as direct material properties (.map, .normalMap, …)
  for (const key of Object.keys(mat)) {
    const v = mat[key];
    if (v && v.isTexture) v.dispose();
  }
  // textures passed through shader uniforms (uMap, etc.)
  if (mat.uniforms) {
    for (const u of Object.values(mat.uniforms)) {
      if (u && u.value && u.value.isTexture) u.value.dispose();
    }
  }
  mat.dispose();
}

// Walk a scene graph (or any Object3D) and dispose geometry + materials.
export function disposeObject(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(disposeMaterial);
    else if (m) disposeMaterial(m);
  });
}

// EffectComposer / WebGLRenderTarget both expose dispose(); guard for safety.
export function disposeTarget(t) {
  if (t && typeof t.dispose === 'function') t.dispose();
}
