// Rod cutting: a rod of length n, and a price table price[1..maxLen] for
// selling a piece of each length, what's the maximum revenue from cutting
// it up (any number of cuts, any lengths, as long as the pieces add up to
// n)? r[n] = max over the first cut length i of (price[i] + r[n-i]).
// No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'r[0] = 0',
  'for j in 1..n:',
  '  r[j] = max over i in 1..j of (price[i] + r[j - i])',
  'return r[n]',
];

function bruteBest(prices, n) {
  // Brute force by trying every composition (ordered set of partition
  // sizes) of n via recursion with no memo, independent of the DP's own
  // recurrence/table.
  function go(len) {
    if (len === 0) return 0;
    let best = -Infinity;
    for (let i = 1; i <= len; i++) best = Math.max(best, prices[i - 1] + go(len - i));
    return best;
  }
  return go(n);
}

function frame(r, upTo, n, activeJ, caption, line) {
  const array = r.slice(0, upTo + 1);
  return { line, code: CODE, caption, array, activeIdx: activeJ != null ? [activeJ] : undefined, range: [0, upTo] };
}

function* run(input) {
  const prices = input.array; // prices[i-1] = price of a piece of length i
  const n = prices.length;
  const r = Array(n + 1).fill(0);
  yield frame(r, 0, n, null, 'r[0] = 0: a zero-length rod sells for nothing.', 0);
  for (let j = 1; j <= n; j++) {
    let best = -Infinity;
    for (let i = 1; i <= j; i++) {
      const candidate = prices[i - 1] + r[j - i];
      if (candidate > best) best = candidate;
      yield { ...frame(r, j - 1, n, null, `r[${j}]: try first cut of length ${i}: price[${i}]=${prices[i - 1]} + r[${j - i}]=${r[j - i]} = ${candidate}.`, 2), array: r.slice(0, j) };
    }
    r[j] = best;
    yield frame(r, j, n, j, `r[${j}] = ${r[j]}.`, 2);
  }
  yield frame(r, n, n, n, `Done: the best revenue from a rod of length ${n} is r[${n}] = ${r[n]}.`, 3);
  return { r, best: r[n] };
}

export default {
  id: 'rod-cutting',
  title: 'Rod cutting',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'Given a rod of length n and a price for each whole-number piece length someone will pay, rod cutting asks for the cutting (any number of pieces, any lengths summing to n) that maximises total revenue. ' +
    'A length-j rod\'s best revenue, r[j], depends only on the first cut: cut off a piece of length i (for some i from 1 to j), sell it for price[i], and then solve the same problem on the remaining length j-i rod, recursively. ' +
    'Since r[j-i] for every i < j is needed, and the same subproblem would otherwise be solved over and over (the same explosion naive recursive Fibonacci has), filling the table bottom-up from r[0] up to r[n] means every smaller answer is already sitting there when it is needed. ' +
    'This is the simplest DP in CLRS\'s dynamic programming chapter and sets up the pattern every later DP topic in this module follows: define subproblems, write a recurrence in terms of smaller subproblems, then fill a table in an order that always has what it needs.',
  code: CODE,
  complexity: {
    time: 'O(n^2).',
    why: 'There are n subproblems r[1..n], and computing r[j] tries every first-cut length from 1 to j, O(j) work. Summing j from 1 to n gives O(n^2) total.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(14, size));
    const array = [];
    let base = 0;
    for (let k = 1; k <= n; k++) { base += randInt(rng, 1, 5); array.push(base); }
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const n = input.array.length;
    if (n === 0) return result.best === 0;
    if (result.r.length !== n + 1) return false;
    if (result.r[0] !== 0) return false;
    return result.best === bruteBest(input.array, n) && result.r[n] === result.best;
  },
  sandbox: { type: 'array', min: 0, max: 14, default: 8 },
};
