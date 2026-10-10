// The Chinese Remainder Theorem: given pairwise coprime moduli m1..mk and
// residues a1..ak, there is exactly one x mod (m1*m2*...*mk) satisfying
// every congruence x = ai (mod mi) at once. Solved here by folding the
// congruences together two at a time, each fold using extended Euclid.
// No DOM access. CLRS: Number-Theoretic Algorithms (the Chinese remainder
// theorem).
import { gcd, crtPair } from '../engine/numtheory.js';

const CODE = [
  'x = a1, m = m1',
  'for each remaining congruence (ai, mi):',
  '  combine x (mod m) with ai (mod mi) into one x (mod m*mi)',
  '    // via extended Euclid',
  '  m = m * mi',
  'return x (mod m)',
];

function frame(pairs, current, caption, line) {
  const nodes = pairs.map((p, i) => ({
    id: i,
    label: `x = ${p.a} (mod ${p.m})`,
    x: 50,
    y: 10 + i * (80 / Math.max(1, pairs.length)),
    w: 72,
    h: 60 / Math.max(1, pairs.length),
    active: i === pairs.length - 1,
    compare: current != null && i === current,
  }));
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [], emptyText: '(no congruences)' };
}

function* run(input) {
  const { congruences } = input;
  if (congruences.length === 0) {
    yield frame([], 'No congruences to solve.', 0);
    return { x: 0, m: 1 };
  }

  let x = ((congruences[0].a % congruences[0].m) + congruences[0].m) % congruences[0].m;
  let m = congruences[0].m;
  const history = [{ a: x, m }];
  yield frame(history, null, `Start with x = ${x} (mod ${m}), the first congruence.`, 0);

  for (let i = 1; i < congruences.length; i++) {
    const { a: ai, m: mi } = congruences[i];
    yield frame(history, i, `Fold in congruence x = ${ai} (mod ${mi}).`, 2);
    const combined = crtPair(x, m, ai, mi);
    if (!combined) {
      yield frame(history, i, `gcd(${m}, ${mi}) != 1: these moduli aren't coprime, CRT's hypothesis fails here.`, 2);
      return { x: null, m: null, failedAt: i };
    }
    x = combined.x;
    m = combined.m;
    history.push({ a: x, m });
    yield frame(history, null, `Combined: x = ${x} (mod ${m}).`, 4);
  }

  yield frame(history, null, `Done. x = ${x} is the unique solution mod ${m}, satisfying every congruence at once.`, 5);
  return { x, m };
}

export default {
  id: 'crt',
  title: 'The Chinese Remainder Theorem',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Number-Theoretic Algorithms',
  summary:
    'The Chinese Remainder Theorem says that a system of congruences x = a1 (mod m1), x = a2 (mod m2), ..., x = ak (mod mk), with the moduli pairwise coprime, has exactly one solution mod M = m1*m2*...*mk. ' +
    'It is both an existence proof and, constructively, an algorithm: fold two congruences into one at a time, each fold using extended Euclid to find how to blend "x = a1 mod m1" and "x = a2 mod m2" into a single "x = a12 mod (m1*m2)". ' +
    "Intuitively, CRT says knowing a number's remainder mod every one of several coprime moduli is exactly as much information as knowing the number mod their product: nothing is lost by splitting a computation into independent pieces mod each small modulus and recombining at the end. " +
    'That is exactly how CRT speeds up RSA decryption in practice (compute mod p and mod q separately, each a smaller exponentiation, then combine), and it is the same "split into coprime pieces, solve each small piece, recombine" idea that shows up again in Fast Fourier Transform-style divide and conquer over different structures. ' +
    "This sandbox folds the congruences in left to right, one at a time, so the moduli are always pairwise coprime among whatever has been folded in so far.",
  code: CODE,
  complexity: {
    time: 'O(k log M) for k congruences, where M is the product of all the moduli.',
    why: 'Folding in each new congruence runs one extended Euclid call, each costing O(log(max modulus so far)) divisions, and there are k-1 folds, so the total is O(k log M) where M bounds every modulus encountered along the way.',
  },
  makeInput(rng, size) {
    const primes = [2, 3, 5, 7, 11, 13];
    const count = Math.max(1, Math.min(4, 1 + Math.floor(size / 6)));
    const chosen = [];
    const shuffled = primes.slice().sort(() => rng() - 0.5);
    for (let i = 0; i < count && i < shuffled.length; i++) chosen.push(shuffled[i]);
    const congruences = chosen.map((m) => ({ a: Math.floor(rng() * m), m }));
    return { congruences };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { congruences } = input;
    if (congruences.length === 0) return result.x === 0 && result.m === 1;
    if (result.x == null) {
      // Only acceptable if some pair of chosen moduli genuinely isn't
      // coprime (shouldn't happen with this sandbox's distinct-prime
      // moduli, but check() should still catch it honestly if it ever did).
      for (let i = 0; i < congruences.length; i++) {
        for (let j = i + 1; j < congruences.length; j++) {
          if (gcd(congruences[i].m, congruences[j].m) !== 1) return true;
        }
      }
      return false;
    }
    const expectedM = congruences.reduce((p, c) => p * c.m, 1);
    if (result.m !== expectedM) return false;
    return congruences.every((c) => ((result.x % c.m) + c.m) % c.m === ((c.a % c.m) + c.m) % c.m);
  },
  sandbox: { type: 'n', min: 0, max: 24, default: 6, label: 'size' },
};
