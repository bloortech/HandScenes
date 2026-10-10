// Pure number-theoretic helpers shared by euclid, modular-exponentiation,
// rsa, miller-rabin and crt (CLRS: Number-Theoretic Algorithms). No DOM
// access, like strings.js/graph.js. Every number here is a plain JS
// integer; this course keeps them small enough (well under 2^31) that
// plain numbers never lose precision, instead of pulling in BigInt.

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b !== 0) { [a, b] = [b, a % b]; }
  return a;
}

// Extended Euclid: returns {g, x, y} with a*x + b*y = g = gcd(a, b), plus
// `steps`, the sequence of (a, b, q, r) divisions the recursive version
// walks through on the way down (used to animate the recursion before
// the back-substitution that produces x, y).
export function extendedEuclid(a0, b0) {
  const steps = [];
  function go(a, b) {
    if (b === 0) return { g: a, x: 1, y: 0 };
    const q = Math.floor(a / b), r = a % b;
    steps.push({ a, b, q, r });
    const { g, x: x1, y: y1 } = go(b, r);
    return { g, x: y1, y: x1 - q * y1 };
  }
  const { g, x, y } = go(a0, b0);
  return { g, x, y, steps };
}

// Right-to-left binary modular exponentiation, CLRS 31.6's MODULAR-
// EXPONENTIATION: squares the base and halves the exponent each round,
// multiplying the running result in whenever the current exponent bit is
// 1. `steps` records (bit, base, result) at each round for the animation.
export function modPow(base, exp, mod) {
  if (mod === 1) return { result: 0, steps: [] };
  let result = 1;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  const steps = [];
  if (e === 0) return { result: 1 % mod, steps };
  // Process bits from least significant to most significant (CLRS's
  // right-to-left version), recording them in that order; callers that
  // want to display most-significant-first can reverse `steps`.
  while (e > 0) {
    const bit = e & 1;
    if (bit === 1) result = (result * b) % mod;
    steps.push({ bit, base: b, result });
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return { result, steps };
}

// Trial-division primality (reference oracle only, for small numbers this
// course ever generates: used by check()s, never by the Miller-Rabin
// topic's own algorithm).
export function isPrimeTrial(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

// One round of the Miller-Rabin witness test (CLRS 31.8's WITNESS): writes
// n-1 = 2^t * u with u odd, then returns true if `a` is a WITNESS that n is
// composite (i.e. a proves n composite), false if `a` gives no evidence
// either way (n might still be prime, or might be a composite that fooled
// this particular base). `trace` records every squaring step for the
// animation.
export function millerRabinWitness(n, a) {
  let u = n - 1, t = 0;
  while (u % 2 === 0) { u /= 2; t++; }
  const trace = [];
  let x = modPow(a, u, n).result;
  trace.push({ exp: u, value: x });
  for (let i = 0; i < t; i++) {
    const y = (x * x) % n;
    const isWitness = y === 1 && x !== 1 && x !== n - 1;
    trace.push({ exp: u * (2 ** (i + 1)), value: y, squaredFrom: x });
    if (isWitness) return { witness: true, trace };
    x = y;
  }
  if (x !== 1) return { witness: true, trace };
  return { witness: false, trace };
}

// Chinese Remainder Theorem for two pairwise-coprime moduli: finds the
// unique x in [0, m1*m2) with x = a1 (mod m1) and x = a2 (mod m2), via the
// extended-Euclid construction x = a1 + m1 * k1 * ((a2-a1)*inv(k1) mod m2)
// (CLRS 31.5). Returns null if gcd(m1, m2) != 1 (CRT's hypothesis fails).
export function crtPair(a1, m1, a2, m2) {
  const { g, x: inv1 } = extendedEuclid(m1, m2);
  if (g !== 1) return null;
  const m = m1 * m2;
  const diff = ((a2 - a1) % m2 + m2) % m2;
  const k = (((diff * inv1) % m2) + m2) % m2;
  const x = ((a1 + m1 * k) % m + m) % m;
  return { x, m };
}
