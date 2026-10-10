// The Master theorem: given T(n) = a*T(n/b) + f(n) with f(n) = c*n^d, decide
// which of the three cases applies by comparing d to e = log_b(a), the
// exponent of the "work done by the recursive calls alone" term. No DOM
// access.

const CODE = [
  'T(n) = a*T(n/b) + f(n), f(n) = c*n^d',
  'e = log_b(a)   (the exponent if every level did equal work)',
  'Case 1: d < e  -> leaves dominate.   T(n) = Theta(n^e)',
  'Case 2: d == e -> every level ties.  T(n) = Theta(n^d log n)',
  'Case 3: d > e  -> the root dominates. T(n) = Theta(n^d)',
];

const EPS = 1e-9;

function classify(a, b, d) {
  const e = Math.log(a) / Math.log(b);
  if (d < e - EPS) return { case: 1, e, bound: `Theta(n^${e.toFixed(3)})  (same as n^log_${b}(${a}))` };
  if (Math.abs(d - e) <= EPS) return { case: 2, e, bound: `Theta(n^${d} log n)` };
  return { case: 3, e, bound: `Theta(n^${d})` };
}

function caseBoxFrame(activeCase, caption, line) {
  const nodes = [1, 2, 3].map((i) => ({
    id: i,
    label: `Case ${i}`,
    x: i === 1 ? 20 : i === 2 ? 50 : 80,
    y: 50,
    w: 22,
    h: 30,
    active: activeCase === i,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [] };
}

function* run(input) {
  const { a, b, d, c } = input;
  yield caseBoxFrame(null, `Recurrence T(n) = ${a}T(n/${b}) + f(n), with f(n) = ${c}n^${d}.`, 0);
  const { case: chosen, e, bound } = classify(a, b, d);
  yield caseBoxFrame(null, `e = log_${b}(${a}) ≈ ${e.toFixed(3)}. Compare it to f(n)'s exponent, d = ${d}.`, 1);
  const line = chosen === 1 ? 2 : chosen === 2 ? 3 : 4;
  const why =
    chosen === 1
      ? `d (${d}) < e (${e.toFixed(3)}): f(n) is smaller than n^e, so the huge number of tiny leaf subproblems dominates the total work.`
      : chosen === 2
        ? `d (${d}) == e (${e.toFixed(3)}): f(n) matches n^e exactly, so every level of the tree contributes about the same amount, and there are log_b(n) of them.`
        : `d (${d}) > e (${e.toFixed(3)}): f(n) is bigger than n^e, so the work at the very top (the original call) already dominates everything below it.`;
  yield caseBoxFrame(chosen, `Case ${chosen} applies. ${why} T(n) = ${bound}.`, line);
  return { a, b, d, c, e, case: chosen, bound };
}

// Independent sanity check: actually iterate the recurrence numerically for
// a range of n and confirm the growth ratio T(b*n)/T(n) is close to what the
// claimed case predicts (b^e = a for cases 1/2, b^d for case 3), instead of
// just trusting the same formula run() used.
function computeT(a, b, d, c, n, memo) {
  if (n <= 1) return c;
  if (memo.has(n)) return memo.get(n);
  const val = a * computeT(a, b, d, c, Math.floor(n / b), memo) + c * Math.pow(n, d);
  memo.set(n, val);
  return val;
}

export default {
  id: 'master-theorem',
  title: 'The Master theorem',
  module: 'm03',
  course: 'CSC236/240',
  clrs: 'Divide-and-Conquer',
  summary:
    'The Master theorem is a shortcut for solving T(n) = aT(n/b) + f(n) without expanding the whole recursion tree by hand. ' +
    'It compares f(n) to n^(log_b a), the exponent you would get if every level of the tree did the same amount of work as the root. ' +
    'If f(n) grows slower than that (case 1), the huge number of leaves dominates and T(n) = Theta(n^log_b a). ' +
    'If f(n) grows at exactly that rate (case 2), every level contributes about equally, and the log_b(n) levels add an extra log factor: T(n) = Theta(n^d log n). ' +
    'If f(n) grows faster (case 3, with a mild regularity condition that polynomial f always satisfies), the very first call already dominates everything its children do, so T(n) = Theta(f(n)). ' +
    'This sandbox lets you pick a, b, and f(n) = c*n^d, and shows exactly which comparison decides the case and why, the same comparison the recursion-tree topic\'s level sums converge to by hand. ' +
    'CLRS proves this theorem right after introducing recursion trees, as the fast way to get the answer the tree approach gets by brute summation.',
  code: CODE,
  complexity: {
    time: 'Depends on the case: Theta(n^log_b a), Theta(n^d log n), or Theta(f(n)) = Theta(n^d).',
    why: 'Whichever of "total leaf work" (n^log_b a) and "root work" (f(n)) is bigger decides the growth rate; the theorem is exactly that comparison made precise.',
  },
  makeInput(rng, size) {
    const a = 1 + Math.floor(rng() * 4); // 1..4
    const b = 2 + Math.floor(rng() * 2); // 2..3
    const d = Math.floor(rng() * 3); // 0..2
    const c = 1 + Math.floor(rng() * 3); // 1..3
    void size;
    return { a, b, c, d };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b, d, c } = input;
    const expected = classify(a, b, d);
    if (result.case !== expected.case) return false;
    if (Math.abs(result.e - expected.e) > 1e-6) return false;

    // Numeric sanity: the growth ratio over one "doubling" (multiplying n by
    // b) should approach max(a, b^d), the dominant term's growth factor.
    const memo = new Map();
    const n = Math.pow(b, 14);
    const Tn = computeT(a, b, d, c, n, memo);
    const Tbn = computeT(a, b, d, c, n * b, memo);
    const ratio = Tbn / Tn;
    const expectedRatio = Math.max(a, Math.pow(b, d));
    const relErr = Math.abs(ratio - expectedRatio) / expectedRatio;
    return relErr < 0.5;
  },
  sandbox: { type: 'n', min: 0, max: 5, default: 0, label: 'example' },
};
