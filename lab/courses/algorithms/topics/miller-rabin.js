// Miller-Rabin primality testing: write n-1 = 2^t * u with u odd, then for
// a random base a, repeatedly square x = a^u mod n and watch for a
// "nontrivial square root of 1" (some x with x^2 = 1 mod n but x != +-1
// mod n), which is only possible when n is composite. A base that reveals
// this is a witness to n's compositeness; if no witness turns up after
// several random bases, n is almost certainly prime. No DOM access. CLRS:
// Number-Theoretic Algorithms (MILLER-RABIN).
import { isPrimeTrial, millerRabinWitness } from '../engine/numtheory.js';

const CODE = [
  'write n-1 = 2^t * u, u odd',
  'for s rounds:',
  '  pick a random base a in [2, n-2]',
  '  x = a^u mod n',
  '  for i from 1 to t:',
  '    y = x^2 mod n',
  '    if y==1 and x!=1 and x!=n-1: return COMPOSITE  // x is a',
  '      // nontrivial square root of 1',
  '    x = y',
  '  if x != 1: return COMPOSITE',
  'return PROBABLY PRIME',
];

function traceFrame(trace, caption, line) {
  const nodes = trace.map((t, i) => ({
    id: i,
    label: `x^${i === 0 ? '' : '2^' + i}... = ${t.value}`,
    x: 50,
    y: 8 + i * (84 / Math.max(1, trace.length)),
    w: 80,
    h: 76 / Math.max(1, trace.length),
    active: i === trace.length - 1,
  }));
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [], emptyText: '(no rounds yet)' };
}

function* run(input) {
  const { n, bases } = input;

  if (n < 4) {
    yield traceFrame([], `n = ${n} is too small for a meaningful test; ${n} is ${n < 2 ? 'not' : ''} prime by definition.`, 0);
    return { n, isComposite: n < 2 || (n !== 2 && n !== 3), witnessFound: null, rounds: 0 };
  }

  yield traceFrame([], `Test whether n = ${n} is prime, trying ${bases.length} random base${bases.length === 1 ? '' : 's'}.`, 0);

  for (let round = 0; round < bases.length; round++) {
    const a = bases[round];
    const { witness, trace } = millerRabinWitness(n, a);
    for (let i = 0; i < trace.length; i++) {
      yield traceFrame(trace.slice(0, i + 1), `Base a = ${a}, round ${round + 1}: x = ${trace[i].value}.`, 5);
    }
    if (witness) {
      yield traceFrame(trace, `Base a = ${a} witnesses that n = ${n} is COMPOSITE.`, 6);
      return { n, isComposite: true, witnessFound: a, rounds: round + 1 };
    }
    yield traceFrame(trace, `Base a = ${a} found no evidence of compositeness.`, 9);
  }

  yield traceFrame([], `No witness found after ${bases.length} base${bases.length === 1 ? '' : 's'}: n = ${n} is PROBABLY PRIME.`, 10);
  return { n, isComposite: false, witnessFound: null, rounds: bases.length };
}

export default {
  id: 'miller-rabin',
  title: 'Miller-Rabin primality testing',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Number-Theoretic Algorithms',
  summary:
    "Fermat's little theorem says a^(n-1) = 1 mod n for every prime n and every a coprime to n, so a failure of that equation proves n composite. The trouble is Carmichael numbers: composite n that still pass Fermat's test for every base coprime to n, fooling that simpler test completely. " +
    'Miller-Rabin digs one layer deeper: it writes n-1 = 2^t * u with u odd, computes x = a^u mod n, then repeatedly squares, and checks every intermediate square root along the way, not just the final value. ' +
    'If n is prime, the only square roots of 1 mod n are +1 and -1 (mod a prime, x^2=1 forces x=+-1), so seeing any other square root of 1 appear mid-computation is a mathematical proof that n is composite: a "nontrivial square root of 1", which cannot exist mod a prime. ' +
    'A base that reveals this (or that fails the Fermat check outright) is called a witness; the theorem behind Miller-Rabin is that at least 3/4 of all bases in [1, n-1] are witnesses for any composite n (no n, Carmichael or not, can hide from more than 1/4 of all bases). ' +
    'So trying s independent random bases and finding no witness leaves at most (1/4)^s chance that n is composite anyway, which is why a handful of rounds is enough for a "probably prime" answer good enough to build real cryptographic keys on.',
  code: CODE,
  complexity: {
    time: 'O(s log n) modular multiplications, for s rounds on an n-bit-ish number (one modular exponentiation plus up to log n squarings per round).',
    why: 'Each round computes a^u mod n (one modular exponentiation, O(log n) multiplications) and then squares up to t <= log2(n) more times, so each round costs O(log n) modular multiplications. Doing s rounds multiplies that by s. The error probability bound (at most (1/4)^s of a false "probably prime") is what lets s stay a small constant instead of growing with n.',
  },
  makeInput(rng, size) {
    const smallPrimes = [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];
    const smallComposites = [9, 15, 21, 25, 33, 35, 49, 51, 561, 1105];
    const n = rng() < 0.5
      ? smallPrimes[Math.floor(rng() * smallPrimes.length)]
      : smallComposites[Math.floor(rng() * smallComposites.length)];
    const roundCount = 1 + Math.floor(rng() * (2 + Math.min(3, size)));
    const bases = [];
    for (let i = 0; i < roundCount && n > 3; i++) bases.push(2 + Math.floor(rng() * (n - 3)));
    return { n, bases };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expectedComposite = !isPrimeTrial(input.n);
    // Miller-Rabin can never wrongly call a prime "composite" (every
    // witness check it performs is a mathematically valid proof), so a
    // false positive for compositeness is always a bug. It CAN (rarely)
    // miss a composite with an unlucky set of bases, so only check the
    // "declared composite => really composite" direction unconditionally,
    // and separately confirm every prime is correctly never flagged.
    if (result.isComposite && !expectedComposite) return false;
    if (!result.isComposite && expectedComposite) {
      // Every base tried must genuinely give no evidence, or this topic's
      // own algorithm (not just luck) has a bug.
      for (const a of input.bases) {
        if (input.n > 3 && millerRabinWitness(input.n, a).witness) return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 3, label: 'rounds' },
};
