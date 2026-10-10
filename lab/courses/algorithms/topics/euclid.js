// Euclid's algorithm and extended Euclid: gcd(a, b) by repeated remainder
// (gcd(a,b) = gcd(b, a mod b)), then back-substituting through the same
// divisions to find x, y with a*x + b*y = gcd(a, b) (Bezout's identity).
// No DOM access. CLRS: Number-Theoretic Algorithms (Euclid's algorithm,
// extended Euclid).
import { gcd, extendedEuclid } from '../engine/numtheory.js';

const CODE = [
  'EUCLID(a, b):',
  '  if b == 0: return a',
  '  return EUCLID(b, a mod b)',
  'EXTENDED-EUCLID(a, b):',
  '  if b == 0: return (a, 1, 0)',
  '  (g, x1, y1) = EXTENDED-EUCLID(b, a mod b)',
  '  return (g, y1, x1 - floor(a/b)*y1)      // back-substitute',
];

function stepFrame(steps, caption, line) {
  const nodes = steps.map((s, i) => ({
    id: i,
    label: `${s.a} = ${s.q}*${s.b} + ${s.r}`,
    x: 50,
    y: 10 + i * (80 / Math.max(1, steps.length)),
    w: 70,
    h: 60 / Math.max(1, steps.length),
    active: i === steps.length - 1,
  }));
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [], emptyText: '(b = 0 immediately: gcd is a)' };
}

function* run(input) {
  const { a, b } = input;
  const { g, x, y, steps } = extendedEuclid(a, b);

  yield stepFrame([], `Find gcd(${a}, ${b}) and integers x, y with ${a}x + ${b}y = gcd.`, 0);
  for (let i = 0; i < steps.length; i++) {
    yield stepFrame(steps.slice(0, i + 1), `Divide: ${steps[i].a} = ${steps[i].q} * ${steps[i].b} + ${steps[i].r}. Recurse on gcd(${steps[i].b}, ${steps[i].r}).`, 2);
  }
  yield stepFrame(steps, `gcd(${a}, ${b}) = ${g}. Back-substituting through every division gives ${a}*(${x}) + ${b}*(${y}) = ${g}.`, 6);
  return { g, x, y, stepCount: steps.length };
}

export default {
  id: 'euclid',
  title: "Euclid's algorithm and extended Euclid",
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Number-Theoretic Algorithms',
  summary:
    "Euclid's algorithm computes gcd(a, b) using one fact: gcd(a, b) = gcd(b, a mod b), since any number dividing both a and b also divides a mod b, and vice versa. " +
    'Repeating that shrinks the pair every time (the remainder is always smaller than the divisor) until the second number hits 0, at which point the first number is the gcd. ' +
    "Extended Euclid runs the same recursion but also tracks enough information to write the gcd as an integer combination of the original a and b: a*x + b*y = gcd(a, b), Bezout's identity. " +
    'It does this by back-substituting on the way out of the recursion: each level expresses its gcd using the coefficients one level down, swapping and adjusting them using that level\'s quotient. ' +
    'Those coefficients x and y are exactly what RSA key generation needs next, to find a decryption exponent that is the multiplicative inverse of the encryption exponent mod phi(n).',
  code: CODE,
  complexity: {
    time: 'O(log(min(a, b))) divisions.',
    why: "Lame's theorem: consecutive remainders in Euclid's algorithm shrink at least as fast as the Fibonacci sequence grows, specifically each remainder is less than half of the one two steps back whenever both exceed 1, so the number of divisions is O(log(min(a,b))). Extended Euclid does the same divisions plus O(1) extra arithmetic per level on the way back out, so it has the same O(log(min(a,b))) bound.",
  },
  makeInput(rng, size) {
    const scale = 2 + size * 6;
    const a = 1 + Math.floor(rng() * scale);
    const b = 1 + Math.floor(rng() * scale);
    return { a, b };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b } = input;
    const expectedG = gcd(a, b);
    if (result.g !== expectedG) return false;
    return a * result.x + b * result.y === expectedG;
  },
  sandbox: { type: 'n', min: 0, max: 20, default: 8, label: 'size' },
};
