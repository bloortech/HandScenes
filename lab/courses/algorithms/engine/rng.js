// Tiny seeded PRNG (mulberry32), used so every random input is reproducible:
// same seed -> same sequence of numbers -> same test run every time.
// No DOM access. Safe to import from Node or the browser.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience: an int in [min, max] inclusive, using a given rng() in [0,1).
export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
