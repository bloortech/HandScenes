// Merge sort. No DOM access: this file only describes the algorithm.
// The whole-array snapshot is yielded at each step; `range` marks which
// slice [lo, hi] the current step is working inside, for the renderer to
// frame/dim the rest of the array.
import { randInt } from '../engine/rng.js';

const CODE = [
  'mergeSort(array, lo, hi):',
  '  if lo >= hi: return',
  '  mid = (lo + hi) // 2',
  '  mergeSort(array, lo, mid)',
  '  mergeSort(array, mid+1, hi)',
  '  merge(array, lo, mid, hi)',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  yield { line: 0, caption: `Starting merge sort on ${n} item${n === 1 ? '' : 's'}.`, array: a.slice(), range: [0, n - 1], counters: counters() };

  yield* mergeSort(0, n - 1);

  yield { line: 0, caption: 'All subranges have been merged. The array is fully sorted.', array: a.slice(), range: n > 0 ? [0, n - 1] : null, sortedIdx: range0(n - 1), counters: counters() };
  return a;

  function* mergeSort(lo, hi) {
    if (lo >= hi) {
      yield { line: 1, caption: `Range [${lo}, ${hi}] has 0 or 1 items. It is already sorted.`, array: a.slice(), range: [lo, hi], counters: counters() };
      return;
    }
    const mid = Math.floor((lo + hi) / 2);
    yield { line: 2, caption: `Split range [${lo}, ${hi}] at the middle, index ${mid}.`, array: a.slice(), range: [lo, hi], activeIdx: [mid], counters: counters() };
    yield* mergeSort(lo, mid);
    yield* mergeSort(mid + 1, hi);
    yield* merge(lo, mid, hi);
  }

  function* merge(lo, mid, hi) {
    yield { line: 5, caption: `Merge the two sorted halves [${lo}, ${mid}] and [${mid + 1}, ${hi}].`, array: a.slice(), range: [lo, hi], counters: counters() };
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0, j = 0, k = lo;
    while (i < left.length && j < right.length) {
      comparisons++;
      yield { line: 5, caption: `Compare ${left[i]} (left half) with ${right[j]} (right half).`, array: a.slice(), range: [lo, hi], compareIdx: [lo + i, mid + 1 + j], counters: counters() };
      if (left[i] <= right[j]) {
        a[k] = left[i];
        i++;
      } else {
        a[k] = right[j];
        j++;
      }
      swaps++;
      yield { line: 5, caption: `Place the smaller value, ${a[k]}, at index ${k}.`, array: a.slice(), range: [lo, hi], activeIdx: [k], counters: counters() };
      k++;
    }
    while (i < left.length) {
      a[k] = left[i]; i++; k++; swaps++;
      yield { line: 5, caption: `Copy the rest of the left half into place.`, array: a.slice(), range: [lo, hi], activeIdx: [k - 1], counters: counters() };
    }
    while (j < right.length) {
      a[k] = right[j]; j++; k++; swaps++;
      yield { line: 5, caption: `Copy the rest of the right half into place.`, array: a.slice(), range: [lo, hi], activeIdx: [k - 1], counters: counters() };
    }
    yield { line: 5, caption: `Range [${lo}, ${hi}] is now merged and sorted.`, array: a.slice(), range: [lo, hi], counters: counters() };
  }

  function range0(hi) {
    const out = [];
    for (let k = 0; k <= hi; k++) out.push(k);
    return out;
  }
}

export default {
  id: 'merge-sort',
  title: 'Merge sort',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Getting Started',
  summary:
    'Merge sort splits the array in half, sorts each half by calling itself, then merges the two sorted halves back together. ' +
    'The merge step walks both halves with two pointers, always taking the smaller of the two current items, which takes one pass through the data. ' +
    'Splitting in half repeatedly takes log(n) levels, and each level does a linear amount of merging work, giving n log(n) total comparisons. ' +
    'This running time holds for every input: best, average and worst case all cost about the same, which makes merge sort very predictable. ' +
    'The trade-off is space: a typical implementation needs extra memory about the size of the array to hold the halves during a merge. ' +
    'CLRS opens with merge sort (alongside insertion sort) specifically to introduce divide-and-conquer and the recurrence T(n) = 2T(n/2) + O(n).',
  code: CODE,
  complexity: {
    time: 'O(n log n) in every case (best, average, worst).',
    why: 'Splitting the array in half each time takes log(n) levels of recursion. At every level, merging all the pieces back together costs O(n) total work (each item is copied once). That is log(n) levels times O(n) work, so O(n log n) overall, regardless of the input order.',
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
