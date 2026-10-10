// Randomized quicksort: the pivot is chosen uniformly at random from the
// current range (instead of always the last element), which is what turns
// quicksort's O(n^2) worst case into an expected O(n log n) for every
// input, with no input an adversary can target. No DOM access. The random
// pivot choice is seeded from `input.pivotSeed` so the same input always
// replays the same run (needed since test.mjs drains a run's generator
// once and checks its one result).
import { mulberry32 } from '../engine/rng.js';

const CODE = [
  'randomizedQuicksort(array, lo, hi):',
  '  if lo >= hi: return',
  '  r = a random index in [lo, hi]',
  '  swap array[r], array[hi]        // randomize which element is the pivot',
  '  pivot = array[hi]',
  '  i = lo - 1',
  '  for j from lo to hi-1:',
  '    if array[j] < pivot: i++; swap array[i], array[j]',
  '  swap array[i+1], array[hi]',
  '  randomizedQuicksort(array, lo, i)',
  '  randomizedQuicksort(array, i+2, hi)',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  const rng = mulberry32(input.pivotSeed);
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  yield { line: 0, caption: `Starting randomized quicksort on ${n} item${n === 1 ? '' : 's'}. Expected comparisons: about 2n*ln(n) ≈ ${Math.round(2 * n * Math.log(Math.max(1, n)))}. Worst case for any pivot rule: n(n-1)/2 = ${(n * (n - 1)) / 2}.`, array: a.slice(), range: n > 0 ? [0, n - 1] : null, counters: counters() };

  yield* quicksort(0, n - 1);

  yield { line: 0, caption: `Sorted. Used ${comparisons} comparisons this run (randomness means this varies run to run, but stays close to n*log(n) in expectation).`, array: a.slice(), sortedIdx: range0(n - 1), counters: counters() };
  return a;

  function* quicksort(lo, hi) {
    if (lo >= hi) {
      if (lo >= 0 && hi >= 0 && lo < n) {
        yield { line: 1, caption: `Range [${lo}, ${hi}] has 0 or 1 items.`, array: a.slice(), range: [Math.max(lo, 0), Math.min(hi, n - 1)], counters: counters() };
      }
      return;
    }
    const r = lo + Math.floor(rng() * (hi - lo + 1));
    if (r !== hi) {
      const tmp = a[r]; a[r] = a[hi]; a[hi] = tmp;
      swaps++;
    }
    const pivotValue = a[hi];
    yield { line: 4, caption: `Pick a random index in [${lo}, ${hi}] as the pivot. This run: ${pivotValue}.`, array: a.slice(), range: [lo, hi], activeIdx: [hi], counters: counters() };

    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      comparisons++;
      yield { line: 7, caption: `Compare array[${j}] = ${a[j]} with the pivot, ${pivotValue}.`, array: a.slice(), range: [lo, hi], compareIdx: [j, hi], activeIdx: [hi], counters: counters() };
      if (a[j] < pivotValue) {
        i++;
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        swaps++;
        yield { line: 7, caption: `Smaller than the pivot: swap into the "smaller" zone at index ${i}.`, array: a.slice(), range: [lo, hi], activeIdx: [i, j], counters: counters() };
      }
    }
    const tmp = a[i + 1]; a[i + 1] = a[hi]; a[hi] = tmp;
    swaps++;
    yield { line: 8, caption: `Swap the pivot into its final position, ${i + 1}.`, array: a.slice(), range: [lo, hi], activeIdx: [i + 1], counters: counters() };

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
  id: 'randomized-quicksort',
  title: 'Randomized quicksort',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Quicksort',
  summary:
    'Plain quicksort is only slow, O(n^2), when the pivot rule keeps picking the smallest or largest remaining element, which an already-sorted or reverse-sorted array does to the "always pick the last element" rule. ' +
    'Randomized quicksort removes that weakness by picking the pivot uniformly at random from the current range before partitioning. ' +
    'Now no single input can reliably trigger the bad case: the worst case still exists (an unlucky sequence of random choices), but its probability is vanishingly small, and the expected running time over the randomness is O(n log n) for every input, including already-sorted ones. ' +
    'The partitioning logic is identical to ordinary quicksort; the only change is swapping a randomly chosen element into the pivot position first. ' +
    'This is the standard fix CLRS introduces right after showing quicksort\'s O(n^2) worst case, and the same "randomize the choice, not the input" idea reappears in quickselect.',
  code: CODE,
  complexity: {
    time: 'O(n log n) expected, for every input. Worst case is still O(n^2), but only for an exponentially unlikely run of bad random pivot choices.',
    why: 'The expected number of comparisons, taken over the random pivot choices, is the same O(n log n) bound as merge sort\'s, by a counting argument (CLRS 7.4.2): summing the probability each pair of elements ever gets compared gives about 2n*ln(n). This expectation holds no matter what the input array looks like, since the randomness comes from the algorithm\'s own coin flips, not from assuming a "typical" input.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let k = 0; k < size; k++) array.push(Math.floor(rng() * 100));
    const pivotSeed = Math.floor(rng() * 2 ** 31);
    return { array, pivotSeed };
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
