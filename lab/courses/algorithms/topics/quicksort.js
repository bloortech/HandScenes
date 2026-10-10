// Quicksort (Lomuto partition scheme, last element as pivot). No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'quicksort(array, lo, hi):',
  '  if lo >= hi: return',
  '  pivot = array[hi]',
  '  i = lo - 1',
  '  for j from lo to hi-1:',
  '    if array[j] < pivot:',
  '      i = i + 1',
  '      swap array[i], array[j]',
  '  swap array[i+1], array[hi]',
  '  quicksort(array, lo, i)',
  '  quicksort(array, i+2, hi)',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  yield { line: 0, caption: `Starting quicksort on ${n} item${n === 1 ? '' : 's'}.`, array: a.slice(), range: n > 0 ? [0, n - 1] : null, counters: counters() };

  yield* quicksort(0, n - 1);

  yield { line: 0, caption: 'Every partition has been sorted. The array is fully sorted.', array: a.slice(), sortedIdx: range0(n - 1), counters: counters() };
  return a;

  function* quicksort(lo, hi) {
    if (lo >= hi) {
      if (lo >= 0 && hi >= 0 && lo < n) {
        yield { line: 1, caption: `Range [${lo}, ${hi}] has 0 or 1 items. It is already sorted.`, array: a.slice(), range: [Math.max(lo, 0), Math.min(hi, n - 1)], counters: counters() };
      }
      return;
    }
    const pivotValue = a[hi];
    yield { line: 2, caption: `Pick array[${hi}] = ${pivotValue} as the pivot for range [${lo}, ${hi}].`, array: a.slice(), range: [lo, hi], activeIdx: [hi], counters: counters() };

    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      comparisons++;
      yield { line: 5, caption: `Compare array[${j}] = ${a[j]} with the pivot, ${pivotValue}.`, array: a.slice(), range: [lo, hi], compareIdx: [j, hi], activeIdx: [hi], counters: counters() };
      if (a[j] < pivotValue) {
        i++;
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        swaps++;
        yield { line: 7, caption: `${a[j]} is smaller than the pivot. Swap it into the "smaller than pivot" zone at index ${i}.`, array: a.slice(), range: [lo, hi], activeIdx: [i, j], counters: counters() };
      }
    }
    const tmp = a[i + 1]; a[i + 1] = a[hi]; a[hi] = tmp;
    swaps++;
    yield { line: 8, caption: `Swap the pivot into position ${i + 1}. Everything left of it is smaller, everything right is bigger or equal.`, array: a.slice(), range: [lo, hi], activeIdx: [i + 1], counters: counters() };

    yield* quicksort(lo, i);
    yield* quicksort(i + 2, hi);
  }

  function range0(hi) {
    const out = [];
    for (let k = 0; k <= hi; k++) out.push(k);
    return out;
  }
}

export default {
  id: 'quicksort',
  title: 'Quicksort',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Quicksort',
  summary:
    'Quicksort picks a pivot value, then partitions the array so everything smaller than the pivot ends up on its left and everything bigger ends up on its right. ' +
    'This version always picks the last element of the current range as the pivot (the Lomuto partition scheme), which keeps the logic simple to follow. ' +
    'After partitioning, the pivot is in its final sorted spot, so quicksort recurses on the smaller range to its left and the one to its right. ' +
    'When partitions split roughly in half, the total work is about n log(n), which is why quicksort is fast in practice and widely used. ' +
    'If the pivot is consistently the smallest or largest value (for example, on an already-sorted array with this pivot rule), partitions barely shrink and the cost rises to about n^2. ' +
    'CLRS covers this exact trade-off and introduces randomized pivot selection as the usual fix, which a later module in this course builds on.',
  code: CODE,
  complexity: {
    time: 'O(n log n) on average; O(n^2) in the worst case.',
    why: 'When the pivot splits the range roughly in half, there are about log(n) levels of recursion and each level does O(n) partitioning work, giving O(n log n). This version always picks the last element as pivot, so a sorted or reverse-sorted array makes every partition split as 1 and n-1, giving n levels of O(n) work each: O(n^2). Randomizing the pivot choice (a later module) fixes this in expectation.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let k = 0; k < size; k++) array.push(randInt(rng, 0, 99));
    return { array };
  },
  run,
  check(input, result) {
    if (!Array.isArray(result) || result.length !== input.array.length) return false;
    for (let i = 1; i < result.length; i++) if (result[i - 1] > result[i]) return false;
    const a = result.slice().sort((x, y) => x - y);
    const b = input.array.slice().sort((x, y) => x - y);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  },
  sandbox: { type: 'array', min: 1, max: 40, default: 12 },
};
