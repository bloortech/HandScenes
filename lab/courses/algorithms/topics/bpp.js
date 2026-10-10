// BPP (Bounded-error Probabilistic Polynomial time): decidable by a
// polynomial-time algorithm that flips coins, and is allowed to be wrong,
// as long as it is wrong on at most 1/3 of its coin flips, for EVERY
// input (an error bound fixed in advance, not something that gets worse
// on harder inputs). Miller-Rabin primality testing is the textbook
// example: one run can be fooled by an unlucky base, but the error
// probability is at most 1/4 per independent random base, so running s
// independent rounds and taking "composite if ANY round finds a witness,
// prime otherwise" drives the error down to at most (1/4)^s, exponentially
// fast, with only a linear increase in running time: the "amplification"
// trick that makes bounded one-sided error as good as no error at all in
// practice. No DOM access. Reuses engine/numtheory.js, the same engine
// m09's miller-rabin topic uses.
import { isPrimeTrial, millerRabinWitness } from '../engine/numtheory.js';

const CODE = [
  'for s independent random bases a:',
  '  if WITNESS(n, a): return COMPOSITE   // one-sided error: never wrong here',
  'return PROBABLY PRIME                   // error probability <= (1/4)^s',
];

function frame(n, rounds, caption, line) {
  const nodes = rounds.map((r, i) => ({
    id: i,
    label: `round ${i + 1}: a=${r.a} -> ${r.witness ? 'WITNESS (composite)' : 'no evidence'}`,
    x: 50,
    y: 8 + (i + 0.5) * (84 / Math.max(1, rounds.length)),
    w: 86,
    h: 76 / Math.max(1, rounds.length),
    active: i === rounds.length - 1,
  }));
  const pointers = [{ x: 50, y: 97, text: `n=${n}, error <= (1/4)^${rounds.length} = ${(Math.pow(0.25, rounds.length)).toExponential(1)}` }];
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers, emptyText: '(no rounds yet)' };
}

function* run(input) {
  const { n, bases } = input;
  if (n < 4) {
    yield frame(n, [], `n = ${n} too small for a meaningful randomised test.`, 2);
    return { n, declaredComposite: n < 2 || (n !== 2 && n !== 3), rounds: 0 };
  }

  const rounds = [];
  for (const a of bases) {
    const { witness } = millerRabinWitness(n, a);
    rounds.push({ a, witness });
    yield frame(n, rounds.slice(), `Round ${rounds.length}, base a = ${a}: ${witness ? 'a witness! n is definitely composite.' : 'no evidence this round.'}`, witness ? 1 : 0);
    if (witness) {
      yield frame(n, rounds, `Found a witness after ${rounds.length} round(s): n = ${n} is COMPOSITE. One-sided error means this answer is never wrong.`, 1);
      return { n, declaredComposite: true, rounds: rounds.length };
    }
  }
  yield frame(n, rounds, `No witness in ${rounds.length} independent round(s): n = ${n} is PROBABLY PRIME, with error probability at most (1/4)^${rounds.length}.`, 2);
  return { n, declaredComposite: false, rounds: rounds.length };
}

export default {
  id: 'bpp',
  title: 'Randomised complexity (BPP)',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: '(Sipser: BPP; CLRS: Number-Theoretic Algorithms)',
  summary:
    'BPP is the class of problems with a polynomial-time algorithm that can flip coins and is allowed a bounded chance of being wrong, as long as that chance never exceeds some fixed constant below 1/2 (classically 1/3), no matter which input it is given. ' +
    'That bound might sound weak, but it amplifies: running k INDEPENDENT copies of the algorithm and taking a majority vote drives the error down exponentially in k, while only multiplying the running time by k, so "probably right" becomes "right with overwhelming probability" very cheaply. ' +
    'Miller-Rabin primality testing is the standard example, and it is even better than the general BPP picture: its error is ONE-SIDED. A base that reports "composite" is always telling the truth (that is a mathematical proof, a nontrivial square root of 1 mod n), so the only possible mistake is an unlucky base failing to catch a true composite, which happens with probability at most 1/4 per independent random base. ' +
    'Running s rounds and declaring "composite" the moment any round finds a witness, "probably prime" otherwise, pushes the false-prime probability down to at most (1/4)^s: a handful of rounds is enough for cryptographic-strength confidence, which is exactly the amplification trick this sandbox runs live.',
  code: CODE,
  complexity: {
    time: 'O(s log n) modular multiplications for s rounds on an n-bit-ish number.',
    why: 'Each round is one Miller-Rabin witness check (O(log n) modular multiplications); running s independent rounds just multiplies that by s, trading a constant-factor time increase for an exponential drop in error probability, which is the whole BPP amplification argument in one line.',
  },
  makeInput(rng, size) {
    const smallPrimes = [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 61];
    const smallComposites = [9, 15, 21, 25, 33, 35, 49, 51, 91, 561, 1105];
    const n = rng() < 0.5
      ? smallPrimes[Math.floor(rng() * smallPrimes.length)]
      : smallComposites[Math.floor(rng() * smallComposites.length)];
    const roundCount = 1 + Math.floor(rng() * (2 + Math.min(4, size)));
    const bases = [];
    for (let i = 0; i < roundCount && n > 3; i++) bases.push(2 + Math.floor(rng() * (n - 3)));
    return { n, bases };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expectedComposite = !isPrimeTrial(input.n);
    // Same one-sided-error logic as m09's miller-rabin topic: a declared
    // "composite" must always be a real composite (never a false
    // positive); a declared "probably prime" can only be wrong if every
    // base tried genuinely gave no evidence (never a bug in this run).
    if (result.declaredComposite && !expectedComposite) return false;
    if (!result.declaredComposite && expectedComposite) {
      for (const a of input.bases) {
        if (input.n > 3 && millerRabinWitness(input.n, a).witness) return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 6, default: 3, label: 'rounds' },
};
