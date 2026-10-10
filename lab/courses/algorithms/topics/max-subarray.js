// Maximum subarray: the classic divide-and-conquer warm-up for CLRS's
// divide-and-conquer chapter, solved here with Kadane's linear-time scan
// (the practical answer), checked against a brute-force O(n^2) scan (the
// "try every subarray" baseline the divide-and-conquer algorithm beats).
// No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'bestSum = -infinity, best = [0, -1]',
  'curSum = 0, curStart = 0',
  'for i in 0..n-1:',
  '  curSum += a[i]',
  '  if curSum > bestSum: bestSum = curSum, best = [curStart, i]',
  '  if curSum < 0: curSum = 0, curStart = i + 1',
  'return bestSum, best',
];

function bruteForce(array) {
  const n = array.length;
  if (n === 0) return { sum: 0, lo: 0, hi: -1 };
  let best = -Infinity, lo = 0, hi = -1;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i; j < n; j++) {
      sum += array[j];
      if (sum > best) { best = sum; lo = i; hi = j; }
    }
  }
  return { sum: best, lo, hi };
}

function* run(input) {
  const a = input.array;
  const n = a.length;
  if (n === 0) {
    yield { line: 0, caption: 'Empty array: the best subarray sum is 0 (the empty subarray).', array: [], range: null };
    return { sum: 0, lo: 0, hi: -1 };
  }

  let bestSum = -Infinity, bestLo = 0, bestHi = -1;
  let curSum = 0, curStart = 0;

  yield { line: 0, caption: 'Scan left to right, tracking the best sum seen so far and the best run ending right here.', array: a.slice(), range: [0, n - 1] };

  for (let i = 0; i < n; i++) {
    curSum += a[i];
    yield { line: 3, caption: `Extend the current run to index ${i}: running sum = ${curSum}.`, array: a.slice(), activeIdx: [i], range: curStart <= i ? [curStart, i] : [i, i] };
    if (curSum > bestSum) {
      bestSum = curSum; bestLo = curStart; bestHi = i;
      yield { line: 4, caption: `New best subarray: [${bestLo}, ${bestHi}] sums to ${bestSum}.`, array: a.slice(), activeIdx: [i], sortedIdx: range0(bestLo, bestHi) };
    }
    if (curSum < 0) {
      yield { line: 5, caption: `Running sum went negative (${curSum}). No prefix ending here can help a later run: restart after index ${i}.`, array: a.slice(), compareIdx: [i] };
      curSum = 0; curStart = i + 1;
    }
  }

  yield { line: 6, caption: `Done. The maximum subarray is [${bestLo}, ${bestHi}] with sum ${bestSum}.`, array: a.slice(), sortedIdx: range0(bestLo, bestHi) };
  return { sum: bestSum, lo: bestLo, hi: bestHi };

  function range0(lo, hi) {
    const out = [];
    for (let k = lo; k <= hi; k++) out.push(k);
    return out;
  }
}

export default {
  id: 'max-subarray',
  title: 'Maximum subarray',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Divide-and-Conquer',
  summary:
    'The maximum subarray problem asks for the contiguous run of the array with the largest possible sum. ' +
    'CLRS introduces it as a divide-and-conquer example: split the array in half, find the best run entirely on the left, entirely on the right, or straddling the middle, and take the best of the three, in O(n log n). ' +
    'This sandbox instead shows Kadane\'s algorithm, a linear-time scan that tracks the best run ending at the current index: extend the running sum, and whenever it would go negative, a fresh start from the next index can only do better, so reset it to zero. ' +
    'Whenever the running sum beats the best seen so far, remember its start and end. ' +
    'Both approaches are correct and this one is the one practitioners actually use, since O(n) beats O(n log n); the divide-and-conquer version is checked against a brute-force O(n^2) "try every subarray" scan here instead, as the baseline it improves on. ' +
    'If every value is negative, the best subarray is a single element, the least negative one; this scan handles that correctly because the reset only happens after recording a candidate.',
  code: CODE,
  complexity: {
    time: 'O(n) with Kadane\'s scan (O(n log n) for the divide-and-conquer version CLRS presents; both beat the brute-force O(n^2)).',
    why: 'Kadane\'s algorithm makes one pass, doing O(1) work per element: extend the running sum, compare to the best, maybe reset. The divide-and-conquer version does O(n) work to find the best "crossing the middle" subarray at each of log(n) levels of recursion, giving O(n log n), the same shape as merge sort\'s recurrence T(n) = 2T(n/2) + O(n).',
  },
  makeInput(rng, size) {
    const array = [];
    for (let k = 0; k < size; k++) array.push(randInt(rng, -20, 20));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = bruteForce(input.array);
    if (result.sum !== expected.sum) return false;
    if (input.array.length === 0) return true;
    // The brute force may not find the same [lo, hi] when several runs tie
    // the best sum; verify this result's own range sums to the claimed
    // value instead of demanding an exact index match.
    if (result.lo < 0 || result.hi < result.lo || result.hi >= input.array.length) return false;
    let sum = 0;
    for (let k = result.lo; k <= result.hi; k++) sum += input.array[k];
    return sum === result.sum;
  },
  sandbox: { type: 'array', min: 0, max: 40, default: 14 },
};
