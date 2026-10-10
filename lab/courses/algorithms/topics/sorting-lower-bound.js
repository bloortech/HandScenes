// The comparison-sort lower bound: any sorting algorithm that only learns
// about the input by comparing pairs of elements can be modelled as a
// decision tree, one leaf per possible output permutation. A tree with n!
// leaves needs depth at least ceil(log2(n!)), so no comparison sort can
// always use fewer than that many comparisons in the worst case. No DOM
// access. Animates insertion sort (a real comparison sort) on a random
// permutation, counting its comparisons, next to that theoretical bound.
const CODE = [
  'Any comparison sort on n items can be drawn as a binary decision tree:',
  '  each internal node asks "is a[i] <= a[j]?" and branches yes/no',
  '  each leaf is one of the n! possible orderings of the input',
  'A binary tree with n! leaves needs height >= log2(n!)',
  '  so the worst case needs at least ceil(log2(n!)) comparisons',
  '  (CLRS: this makes merge sort and heapsort, both O(n log n), optimal',
  '   up to a constant factor; no comparison sort beats O(n log n))',
];

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0;
  const lowerBound = n <= 1 ? 0 : Math.ceil(Math.log2(factorial(n)));

  yield { line: 0, caption: `Any comparison sort on these ${n} item${n === 1 ? '' : 's'} needs at least ceil(log2(${n}!)) = ${lowerBound} comparisons in the worst case. Watching insertion sort run on this input:`, array: a.slice(), counters: { comparisons } };

  for (let i = 1; i < n; i++) {
    const key = a[i];
    let j = i - 1;
    yield { line: 1, caption: `Insert a[${i}] = ${key} into the already-sorted a[0..${i - 1}].`, array: a.slice(), activeIdx: [i], counters: { comparisons } };
    while (j >= 0) {
      comparisons++;
      yield { line: 1, caption: `Compare a[${j}] = ${a[j]} with ${key}.`, array: a.slice(), compareIdx: [j, j + 1], counters: { comparisons } };
      if (a[j] <= key) break;
      a[j + 1] = a[j];
      j--;
      yield { line: 1, caption: `${a[j + 1]} is bigger than ${key}: shift it right.`, array: a.slice(), activeIdx: [j + 1], counters: { comparisons } };
    }
    a[j + 1] = key;
  }

  const sortedIdx = [];
  for (let k = 0; k < n; k++) sortedIdx.push(k);
  yield { line: 0, caption: `Sorted using ${comparisons} comparison${comparisons === 1 ? '' : 's'}. The information-theoretic lower bound for this size is ${lowerBound}; insertion sort's own worst case is n(n-1)/2 = ${(n * (n - 1)) / 2}, well above the bound, which is exactly why insertion sort isn't asymptotically optimal.`, array: a.slice(), sortedIdx, counters: { comparisons } };

  return { sortedArray: a, comparisons, lowerBound, n };
}

export default {
  id: 'sorting-lower-bound',
  title: 'The comparison-sort lower bound',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Sorting in Linear Time',
  summary:
    'Every sorting algorithm that decides what to do only by comparing pairs of elements (which covers insertion sort, merge sort, quicksort, and heapsort) can be modelled as a binary decision tree: each internal node is one comparison, each leaf is one of the n! possible orderings the input could have arrived in. ' +
    'To sort correctly, the algorithm must be able to reach every one of those n! leaves from a different path, since two different input orderings need different answers. ' +
    'A binary tree with n! leaves has height at least log2(n!), so any comparison sort must make at least ceil(log2(n!)) comparisons on its worst-case input. ' +
    'By Stirling\'s approximation, log2(n!) is about n*log2(n), which is exactly where merge sort and heapsort already sit, so no comparison-based sort can beat O(n log n) in the worst case. ' +
    'This is a lower bound on the whole model of computation, not on any one algorithm, which is why the next topic (counting, radix, and bucket sort) matters: those sorts get around it by never comparing elements to each other at all.',
  code: CODE,
  complexity: {
    time: 'Omega(n log n): no comparison sort can do better in the worst case.',
    why: 'A correct comparison sort\'s decision tree needs at least n! leaves (one per possible input ordering) to tell every ordering apart. A binary tree with L leaves has height at least log2(L), so the tree\'s height, which equals the worst-case number of comparisons, is at least log2(n!) = Theta(n log n) by Stirling\'s approximation.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(8, size));
    const array = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = array[i]; array[i] = array[j]; array[j] = tmp;
    }
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const got = result.sortedArray;
    if (!Array.isArray(got) || got.length !== input.array.length) return false;
    for (let i = 1; i < got.length; i++) if (got[i - 1] > got[i]) return false;
    const a = got.slice().sort((x, y) => x - y);
    const b = input.array.slice().sort((x, y) => x - y);
    if (a.length !== b.length || !a.every((v, i) => v === b[i])) return false;
    // Recompute the lower bound completely independently (brute-force
    // factorial and a plain log2), rather than trust run()'s own formula.
    let fact = 1;
    for (let i = 2; i <= result.n; i++) fact *= i;
    const expectedBound = result.n <= 1 ? 0 : Math.ceil(Math.log(fact) / Math.log(2));
    return result.lowerBound === expectedBound;
  },
  sandbox: { type: 'array', min: 0, max: 8, default: 5 },
};
