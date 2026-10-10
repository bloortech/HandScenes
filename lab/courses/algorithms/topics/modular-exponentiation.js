// Modular exponentiation by repeated squaring: computes base^exp mod m in
// O(log exp) multiplications instead of O(exp), by squaring the base and
// halving the exponent each round, folding the running result in whenever
// the current exponent's bit is 1. No DOM access. CLRS: Number-Theoretic
// Algorithms (MODULAR-EXPONENTIATION).
import { modPow } from '../engine/numtheory.js';

const CODE = [
  'MODULAR-EXPONENTIATION(base, exp, m):',
  '  result = 1',
  '  while exp > 0:',
  '    if exp is odd: result = (result * base) mod m',
  '    base = (base * base) mod m',
  '    exp = floor(exp / 2)',
  '  return result',
];

function stepFrame(base, exp, mod, done, caption, line) {
  const nodes = done.map((s, i) => ({
    id: i,
    label: `bit ${s.bit}: base=${s.base} result=${s.result}`,
    x: 50,
    y: 8 + i * (84 / Math.max(1, done.length)),
    w: 80,
    h: 76 / Math.max(1, done.length),
    active: i === done.length - 1,
  }));
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges: [], emptyText: '(exponent is 0: result is 1)' };
}

function* run(input) {
  const { base, exp, mod } = input;
  const { result, steps } = modPow(base, exp, mod);

  yield stepFrame(base, exp, mod, [], `Compute ${base}^${exp} mod ${mod} using O(log ${exp || 1}) squarings instead of ${exp} multiplications.`, 0);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    yield stepFrame(base, exp, mod, steps.slice(0, i + 1), `Bit ${s.bit}${s.bit === 1 ? ': multiply result by the current base' : ': skip the multiply'}. Square the base for next round: ${s.base}.`, s.bit === 1 ? 3 : 4);
  }
  yield stepFrame(base, exp, mod, steps, `Done. ${base}^${exp} mod ${mod} = ${result}.`, 6);
  return { result };
}

export default {
  id: 'modular-exponentiation',
  title: 'Modular exponentiation',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Number-Theoretic Algorithms',
  summary:
    'Computing base^exp the obvious way takes exp-1 multiplications, which is hopeless once exp has dozens of digits, as it does in real RSA keys. ' +
    'Repeated squaring fixes this by looking at the exponent in binary: squaring the base doubles the power it represents, so after k squarings the base represents base^(2^k), and multiplying the right subset of those squared values together (exactly the ones matching a 1 bit in the exponent) reconstructs base^exp. ' +
    'That turns exp multiplications into about log2(exp) squarings plus at most log2(exp) more multiplications, one per 1 bit, all done mod m so the numbers never grow past m^2 before the next reduction. ' +
    "This is the one subroutine RSA's encrypt and decrypt steps both actually run (c = m^e mod n and m = c^d mod n), which is exactly why RSA needs modular exponentiation to be fast even though it works with enormous exponents.",
  code: CODE,
  complexity: {
    time: 'O(log exp) modular multiplications, each on numbers no bigger than m^2 before reduction.',
    why: 'The loop runs once per bit of exp, halving exp each time, so it runs floor(log2(exp))+1 times. Each round does one squaring and, for a 1 bit, one more multiplication, so the total number of modular multiplications is O(log exp), versus O(exp) for multiplying base by itself exp-1 times.',
  },
  makeInput(rng, size) {
    const mod = 2 + Math.floor(rng() * (20 + size * 8));
    const base = Math.floor(rng() * mod);
    const exp = Math.floor(rng() * (10 + size * 4));
    return { base, exp, mod };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { base, exp, mod } = input;
    let expected = 1 % mod;
    let b = ((base % mod) + mod) % mod;
    for (let i = 0; i < exp; i++) expected = (expected * b) % mod;
    return result.result === expected;
  },
  sandbox: { type: 'n', min: 0, max: 20, default: 8, label: 'size' },
};
