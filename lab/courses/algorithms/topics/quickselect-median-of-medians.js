// Finding the k-th smallest value without fully sorting: quickselect
// (random pivot, expected O(n), like randomized quicksort) and
// median-of-medians (a deterministic pivot choice that guarantees O(n)
// worst case, at the cost of a bigger constant). Mode picked at random per
// run, the same "pick a mode" pattern induction.js/master-theorem.js use.
// No DOM access.
import { mulberry32 } from '../engine/rng.js';

const CODE_QS = [
  'quickselect(array, k):          # k-th smallest, 1-indexed',
  '  if array has 1 item: return it',
  '  pivot = a uniformly random element of array',
  '  less, equal, greater = partition array around pivot',
  '  if k <= len(less): return quickselect(less, k)',
  '  if k <= len(less) + len(equal): return pivot',
  '  return quickselect(greater, k - len(less) - len(equal))',
];
const CODE_MOM = [
  'medianOfMedians(array, k):       # k-th smallest, 1-indexed',
  '  if array has <= 5 items: sort it and return position k',
  '  split array into groups of 5; take each group\'s median',
  '  pivot = medianOfMedians(that list of medians, middle index)',
  '  less, equal, greater = partition array around pivot',
  '  if k <= len(less): return medianOfMedians(less, k)',
  '  if k <= len(less) + len(equal): return pivot',
  '  return medianOfMedians(greater, k - len(less) - len(equal))',
];

function frame(arr, { pivot = null, caption, line, code, comparisons, swaps }) {
  const activeIdx = pivot != null ? [arr.indexOf(pivot)].filter((i) => i >= 0) : [];
  return { array: arr.slice(), activeIdx, caption, line, code, counters: { comparisons, swaps } };
}

function* run(input) {
  let comparisons = 0, swaps = 0;
  const arr0 = input.array.slice();

  if (arr0.length === 0) {
    yield { array: [], caption: 'An empty array has no k-th smallest value.', line: 0, code: input.mode === 'quickselect' ? CODE_QS : CODE_MOM, counters: { comparisons, swaps } };
    return { value: null, mode: input.mode };
  }

  const k = Math.min(Math.max(1, input.k), arr0.length);

  function* quickselect(arr, kk, rng) {
    yield frame(arr, { caption: `Looking for the ${kk}-th smallest among ${arr.length} value${arr.length === 1 ? '' : 's'}.`, line: 0, code: CODE_QS, comparisons, swaps });
    if (arr.length === 1) return arr[0];
    const pivot = arr[Math.floor(rng() * arr.length)];
    yield frame(arr, { pivot, caption: `Pick a random pivot: ${pivot}.`, line: 2, code: CODE_QS, comparisons, swaps });
    const less = [], equal = [], greater = [];
    for (const x of arr) {
      comparisons++;
      if (x < pivot) less.push(x);
      else if (x > pivot) greater.push(x);
      else equal.push(x);
    }
    yield frame(arr, { pivot, caption: `Partition: ${less.length} smaller, ${equal.length} equal, ${greater.length} bigger than ${pivot}.`, line: 3, code: CODE_QS, comparisons, swaps });
    if (kk <= less.length) return yield* quickselect(less, kk, rng);
    if (kk <= less.length + equal.length) {
      yield frame([pivot], { pivot, caption: `${kk} falls among the values equal to the pivot: the answer is ${pivot}.`, line: 5, code: CODE_QS, comparisons, swaps });
      return pivot;
    }
    return yield* quickselect(greater, kk - less.length - equal.length, rng);
  }

  function* medianOfMedians(arr, kk) {
    yield frame(arr, { caption: `Looking for the ${kk}-th smallest among ${arr.length} value${arr.length === 1 ? '' : 's'}.`, line: 0, code: CODE_MOM, comparisons, swaps });
    if (arr.length <= 5) {
      const sorted = arr.slice().sort((a, b) => a - b);
      comparisons += arr.length > 1 ? arr.length - 1 : 0;
      yield frame(sorted, { pivot: sorted[kk - 1], caption: `5 or fewer items: sort directly and take position ${kk}.`, line: 1, code: CODE_MOM, comparisons, swaps });
      return sorted[kk - 1];
    }
    const groups = [];
    for (let i = 0; i < arr.length; i += 5) groups.push(arr.slice(i, i + 5));
    const medians = groups.map((g) => {
      const s = g.slice().sort((a, b) => a - b);
      comparisons += s.length > 1 ? s.length - 1 : 0;
      return s[Math.floor((s.length - 1) / 2)];
    });
    yield frame(medians, { caption: `Split into ${groups.length} groups of up to 5; this is every group's median.`, line: 2, code: CODE_MOM, comparisons, swaps });
    const pivot = yield* medianOfMedians(medians, Math.ceil(medians.length / 2));
    yield frame(arr, { pivot, caption: `Pivot = the median of medians, ${pivot}. This guarantees a reasonable split even in the worst case.`, line: 3, code: CODE_MOM, comparisons, swaps });
    const less = [], equal = [], greater = [];
    for (const x of arr) {
      comparisons++;
      if (x < pivot) less.push(x);
      else if (x > pivot) greater.push(x);
      else equal.push(x);
    }
    yield frame(arr, { pivot, caption: `Partition: ${less.length} smaller, ${equal.length} equal, ${greater.length} bigger than ${pivot}.`, line: 3, code: CODE_MOM, comparisons, swaps });
    if (kk <= less.length) return yield* medianOfMedians(less, kk);
    if (kk <= less.length + equal.length) {
      yield frame([pivot], { pivot, caption: `${kk} falls among the values equal to the pivot: the answer is ${pivot}.`, line: 5, code: CODE_MOM, comparisons, swaps });
      return pivot;
    }
    return yield* medianOfMedians(greater, kk - less.length - equal.length);
  }

  let value;
  if (input.mode === 'quickselect') {
    const rng = mulberry32(input.pivotSeed);
    value = yield* quickselect(arr0, k, rng);
  } else {
    value = yield* medianOfMedians(arr0, k);
  }
  yield frame(arr0, { pivot: value, caption: `Done: the ${k}-th smallest value is ${value}.`, line: 0, code: input.mode === 'quickselect' ? CODE_QS : CODE_MOM, comparisons, swaps });
  return { value, mode: input.mode };
}

export default {
  id: 'quickselect-median-of-medians',
  title: 'Quickselect and median-of-medians',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Medians and Order Statistics',
  summary:
    'Finding the k-th smallest value doesn\'t need a full sort: both algorithms here partition around a pivot like quicksort, but only recurse into the one side that still contains the answer, throwing the other side away. ' +
    'Quickselect picks that pivot uniformly at random, same as randomized quicksort, which gives an expected O(n) running time (each level of recursion does O(current size) work, and sizes shrink geometrically in expectation). ' +
    'Median-of-medians picks its pivot differently: split the array into groups of 5, take each group\'s median, then recursively find the median of those medians. ' +
    'That pivot is provably never too extreme (it\'s bigger than at least 3 elements in at least half the groups, and smaller than at least 3 in the other half), which guarantees the partition always discards a meaningful fraction, giving worst-case O(n), not just expected O(n). ' +
    'The group size 5 isn\'t arbitrary: it is the smallest odd group size that makes the recursion\'s two pieces (finding the medians, and recursing on the bigger side) both shrink fast enough for the total work to stay linear.',
  code: CODE_QS,
  complexity: {
    time: 'Quickselect: O(n) expected, O(n^2) worst case. Median-of-medians: O(n) worst case, always.',
    why: 'Quickselect\'s recursion only visits one side of each partition, and a random pivot splits the array into a geometrically-shrinking expected size, giving T(n) = T(n/2-ish) + O(n) in expectation, which solves to O(n) (CLRS 9.2). Median-of-medians spends O(n) finding the pivot itself (sorting n/5 tiny groups, then one recursive call on n/5 medians), but that guarantees the partition always discards at least 3n/10 elements, giving the recurrence T(n) <= T(n/5) + T(7n/10) + O(n), which also solves to O(n), this time without any randomness or luck involved.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * 50));
    const k = 1 + Math.floor(rng() * Math.max(1, size));
    const pivotSeed = Math.floor(rng() * 2 ** 31);
    const mode = rng() < 0.5 ? 'quickselect' : 'median-of-medians';
    return { array, k, pivotSeed, mode };
  },
  run,
  check(input, result) {
    if (!result || result.mode !== input.mode) return false;
    if (input.array.length === 0) return result.value === null;
    const sorted = input.array.slice().sort((a, b) => a - b);
    const k = Math.min(Math.max(1, input.k), sorted.length);
    return result.value === sorted[k - 1];
  },
  sandbox: { type: 'array', min: 0, max: 30, default: 12 },
};
