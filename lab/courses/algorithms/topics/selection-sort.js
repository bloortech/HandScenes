// Selection sort. No DOM access in this file: it only describes the algorithm.
// Frame shape (read by engine/renderer.js):
//   { line, caption, array, compareIdx:[i,j], activeIdx:[i], sortedIdx:[...], counters:{comparisons,swaps} }

import { randInt } from '../engine/rng.js';

const CODE = [
  'for i from 0 to n-2:',
  '  minIndex = i',
  '  for j from i+1 to n-1:',
  '    if array[j] < array[minIndex]:',
  '      minIndex = j',
  '  swap array[i], array[minIndex]',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });
  const sortedIdx = [];

  yield { line: 0, caption: `Starting selection sort on ${n} item${n === 1 ? '' : 's'}.`, array: a.slice(), sortedIdx: sortedIdx.slice(), counters: counters() };

  for (let i = 0; i < n - 1; i++) {
    let minIndex = i;
    yield { line: 1, caption: `Assume index ${i} holds the smallest remaining value, for now.`, array: a.slice(), activeIdx: [minIndex], sortedIdx: sortedIdx.slice(), counters: counters() };

    for (let j = i + 1; j < n; j++) {
      comparisons++;
      yield { line: 3, caption: `Compare array[${j}] = ${a[j]} with the current smallest, array[${minIndex}] = ${a[minIndex]}.`, array: a.slice(), compareIdx: [j, minIndex], sortedIdx: sortedIdx.slice(), counters: counters() };
      if (a[j] < a[minIndex]) {
        minIndex = j;
        yield { line: 4, caption: `${a[j]} is smaller. Index ${j} is now the smallest seen so far.`, array: a.slice(), activeIdx: [minIndex], sortedIdx: sortedIdx.slice(), counters: counters() };
      }
    }

    if (minIndex !== i) {
      swaps++;
      const tmp = a[i]; a[i] = a[minIndex]; a[minIndex] = tmp;
      yield { line: 5, caption: `Swap array[${i}] and array[${minIndex}] so the smallest remaining value lands at position ${i}.`, array: a.slice(), compareIdx: [i, minIndex], sortedIdx: sortedIdx.slice(), counters: counters() };
    } else {
      yield { line: 5, caption: `Position ${i} already holds the smallest remaining value. No swap needed.`, array: a.slice(), sortedIdx: sortedIdx.slice(), counters: counters() };
    }
    sortedIdx.push(i);
  }
  sortedIdx.push(n - 1);
  yield { line: 0, caption: 'Every position is now in its final, sorted place.', array: a.slice(), sortedIdx: sortedIdx.slice(), counters: counters() };

  return a;
}

export default {
  id: 'selection-sort',
  title: 'Selection sort',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Getting Started (classic intro sort, covered as warm-up / exercise material)',
  summary:
    'Selection sort repeatedly finds the smallest value left in the unsorted part of the array and swaps it into place. ' +
    'It does one pass to find a minimum, then one swap, then repeats on the rest of the array. ' +
    'It is simple to reason about because the sorted prefix only ever grows by one correct element at a time. ' +
    'It always does about n^2/2 comparisons, even if the array is already sorted, because it never stops early. ' +
    'It does at most n swaps, which makes it a reasonable choice when writing to memory is expensive and comparisons are cheap. ' +
    'It is not used in practice for large data because faster methods exist, but it is a good first algorithm to study.',
  code: CODE,
  complexity: {
    time: 'O(n^2) comparisons in every case; at most O(n) swaps.',
    why: 'The outer loop runs n-1 times, and each time it scans the whole remaining unsorted part to find the minimum. That inner scan shrinks by one each round, so the total is (n-1)+(n-2)+...+1, about n^2/2 comparisons. There is no early exit, so best, average and worst case all cost the same.',
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
