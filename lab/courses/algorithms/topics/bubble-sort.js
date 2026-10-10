// Bubble sort. No DOM access: this file only describes the algorithm.
import { randInt } from '../engine/rng.js';

const CODE = [
  'repeat:',
  '  swapped = false',
  '  for j from 0 to n-2:',
  '    if array[j] > array[j+1]:',
  '      swap array[j], array[j+1]',
  '      swapped = true',
  'until swapped is false',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });
  let sortedFrom = n; // index from which the tail is known sorted

  yield { line: 0, caption: `Starting bubble sort on ${n} item${n === 1 ? '' : 's'}.`, array: a.slice(), counters: counters() };

  let swapped = true;
  let pass = 0;
  while (swapped) {
    swapped = false;
    pass++;
    yield { line: 1, caption: `Pass ${pass}: sweep left to right, swapping any out-of-order neighbours.`, array: a.slice(), sortedIdx: range(sortedFrom, n - 1), counters: counters() };

    for (let j = 0; j < sortedFrom - 1; j++) {
      comparisons++;
      yield { line: 3, caption: `Compare neighbours array[${j}] = ${a[j]} and array[${j + 1}] = ${a[j + 1]}.`, array: a.slice(), compareIdx: [j, j + 1], sortedIdx: range(sortedFrom, n - 1), counters: counters() };
      if (a[j] > a[j + 1]) {
        const tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp;
        swaps++;
        swapped = true;
        yield { line: 4, caption: `${a[j + 1]} is smaller than ${a[j]}. Swap them so the bigger value bubbles right.`, array: a.slice(), activeIdx: [j, j + 1], sortedIdx: range(sortedFrom, n - 1), counters: counters() };
      }
    }
    sortedFrom = Math.max(0, sortedFrom - 1);
  }

  yield { line: 6, caption: 'No swaps happened in the last pass, so the array is fully sorted.', array: a.slice(), sortedIdx: range(0, n - 1), counters: counters() };
  return a;
}

function range(lo, hi) {
  const out = [];
  for (let k = lo; k <= hi; k++) out.push(k);
  return out;
}

export default {
  id: 'bubble-sort',
  title: 'Bubble sort',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Getting Started (problem 2-2 in several editions)',
  summary:
    'Bubble sort repeatedly sweeps through the array, swapping any two neighbours that are in the wrong order. ' +
    'After one full sweep, the largest remaining value has "bubbled" all the way to the end, so each pass needs to check one fewer position. ' +
    'It stops as soon as a sweep makes no swaps, because that means the array is already sorted. ' +
    'It is one of the simplest sorts to write correctly, which is why it shows up early in most courses, but it is rarely used in real software. ' +
    'Like selection sort it costs about n^2/2 comparisons in the worst case, but unlike selection sort it can finish early on nearly-sorted input. ' +
    'CLRS does not give bubble sort its own section; it appears as an exercise asking you to prove it is correct and analyse its running time.',
  code: CODE,
  complexity: {
    time: 'O(n) best case (already sorted), O(n^2) worst case (reverse sorted).',
    why: 'If a pass makes no swaps, the array is sorted and the algorithm stops, so an already-sorted array costs one pass, O(n). In the worst case, every pass fixes only one out-of-order pair at the far end, needing about n passes of about n comparisons each, O(n^2) total.',
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
