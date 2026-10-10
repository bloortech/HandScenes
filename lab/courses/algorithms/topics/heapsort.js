// Heapsort: build a max-heap in place, then repeatedly move the max to the
// end of the unsorted region and sift down. No DOM access. Drawn with the
// plain array-bar frames (like the other m01 sorts), since heapsort's whole
// point is that it sorts in place with no extra array; topics/heap.js shows
// the same sift operations as an explicit tree.
const CODE = [
  'heapsort(a):',
  '  buildMaxHeap(a)',
  '  for end from n-1 down to 1:',
  '    swap a[0], a[end]        (move the max to the sorted tail)',
  '    siftDown(a, 0, end)      (end shrinks the heap by one)',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  function* siftDown(heapSize, startI) {
    let i = startI;
    while (true) {
      let largest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < heapSize) {
        comparisons++;
        yield { line: 4, caption: `Compare a[${i}]=${a[i]} with its left child a[${l}]=${a[l]}.`, array: a.slice(), compareIdx: [i, l], activeIdx: [i], counters: counters() };
        if (a[l] > a[largest]) largest = l;
      }
      if (r < heapSize) {
        comparisons++;
        yield { line: 4, caption: `Compare the larger so far with the right child a[${r}]=${a[r]}.`, array: a.slice(), compareIdx: [largest, r], activeIdx: [i], counters: counters() };
        if (a[r] > a[largest]) largest = r;
      }
      if (largest === i) return;
      const tmp = a[i]; a[i] = a[largest]; a[largest] = tmp;
      swaps++;
      yield { line: 4, caption: `Swap a[${i}] and a[${largest}] to fix the heap property.`, array: a.slice(), activeIdx: [i, largest], counters: counters() };
      i = largest;
    }
  }

  yield { line: 0, caption: `Starting heapsort on ${n} item${n === 1 ? '' : 's'}.`, array: a.slice(), counters: counters() };

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    yield* siftDown(n, i);
  }
  yield { line: 1, caption: 'Build-max-heap is done: a[0] now holds the largest value.', array: a.slice(), counters: counters() };

  for (let end = n - 1; end >= 1; end--) {
    const tmp = a[0]; a[0] = a[end]; a[end] = tmp;
    swaps++;
    const sortedIdx = [];
    for (let k = end; k < n; k++) sortedIdx.push(k);
    yield { line: 3, caption: `Move the max, ${a[end]}, to the sorted tail at index ${end}.`, array: a.slice(), activeIdx: [0, end], sortedIdx, counters: counters() };
    yield* siftDown(end, 0);
    yield { line: 4, caption: `Re-heapify the remaining ${end} item${end === 1 ? '' : 's'}.`, array: a.slice(), sortedIdx, counters: counters() };
  }

  const allSorted = [];
  for (let k = 0; k < n; k++) allSorted.push(k);
  yield { line: 0, caption: 'The array is fully sorted.', array: a.slice(), sortedIdx: allSorted, counters: counters() };
  return a;
}

export default {
  id: 'heapsort',
  title: 'Heapsort',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Heapsort',
  summary:
    'Heapsort gets its speed guarantee from the binary heap: first it builds a max-heap out of the whole array in O(n), so the biggest value sits at index 0. ' +
    'Then it repeatedly swaps that max to the end of the still-unsorted region, shrinks the heap by one, and sifts the new root down to restore the heap property. ' +
    'Each of those n-1 extract-max steps costs O(log n), for O(n log n) total, and unlike quicksort there is no bad input that makes it worse: the bound holds for every input. ' +
    'It also sorts in place, using no extra array the way merge sort does. ' +
    'The trade-off is that heapsort tends to be a bit slower in practice than a well-tuned quicksort, and it is not stable (equal elements can end up reordered).',
  code: CODE,
  complexity: {
    time: 'O(n log n) in every case (best, average, worst).',
    why: 'Build-max-heap costs O(n). After that, there are n-1 extract-max steps, each a swap plus one sift-down that costs O(log n) because the heap has height O(log n). That is O(n) + O(n log n) = O(n log n), with no input making it worse the way an already-sorted array does to Lomuto quicksort.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let k = 0; k < size; k++) array.push(Math.floor(rng() * 100));
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
  sandbox: { type: 'array', min: 0, max: 40, default: 14 },
};
