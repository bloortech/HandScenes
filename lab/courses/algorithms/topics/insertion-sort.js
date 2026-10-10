// Insertion sort. No DOM access: this file only describes the algorithm.
import { randInt } from '../engine/rng.js';

const CODE = [
  'for i from 1 to n-1:',
  '  key = array[i]',
  '  j = i - 1',
  '  while j >= 0 and array[j] > key:',
  '    array[j+1] = array[j]',
  '    j = j - 1',
  '  array[j+1] = key',
];

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  yield { line: 0, caption: `Starting insertion sort on ${n} item${n === 1 ? '' : 's'}. The first item counts as a sorted run of length 1.`, array: a.slice(), sortedIdx: n > 0 ? [0] : [], counters: counters() };

  for (let i = 1; i < n; i++) {
    const key = a[i];
    let j = i - 1;
    yield { line: 1, caption: `Pick up array[${i}] = ${key} as the key to insert into the sorted run on its left.`, array: a.slice(), activeIdx: [i], sortedIdx: range(0, i - 1), counters: counters() };

    while (j >= 0) {
      comparisons++;
      yield { line: 3, caption: `Compare the key ${key} with array[${j}] = ${a[j]}.`, array: a.slice(), compareIdx: [j, i], activeIdx: [i], sortedIdx: range(0, i - 1), counters: counters() };
      if (a[j] > key) {
        a[j + 1] = a[j];
        swaps++;
        j--;
        yield { line: 5, caption: `${key} is smaller, so slide array[${j + 1}] right to make room.`, array: a.slice(), activeIdx: [j + 1], sortedIdx: range(0, i - 1), counters: counters() };
      } else {
        break;
      }
    }
    a[j + 1] = key;
    yield { line: 6, caption: `Drop the key ${key} into the gap at index ${j + 1}. The sorted run now covers 0..${i}.`, array: a.slice(), activeIdx: [j + 1], sortedIdx: range(0, i), counters: counters() };
  }

  yield { line: 0, caption: 'Every position is now in its final, sorted place.', array: a.slice(), sortedIdx: range(0, n - 1), counters: counters() };
  return a;
}

function range(lo, hi) {
  const out = [];
  for (let k = lo; k <= hi; k++) out.push(k);
  return out;
}

export default {
  id: 'insertion-sort',
  title: 'Insertion sort',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Getting Started',
  summary:
    'Insertion sort builds up a sorted run on the left, one item at a time, the way you might sort playing cards in your hand. ' +
    'It takes the next item, the "key", and slides it left past anything bigger until it reaches a spot where everything to its left is smaller. ' +
    'This is the sort CLRS opens with, because its correctness is easy to prove with a loop invariant: before each pass, the left part is already sorted. ' +
    'On an already-sorted array it does almost no work (close to n comparisons, no shifting), which makes it fast on nearly-sorted data. ' +
    'On a reverse-sorted array every new key has to slide all the way to the front, which costs about n^2/2 comparisons and shifts. ' +
    'It is still used today for small arrays, often as the base case inside faster sorts like quicksort and merge sort.',
  code: CODE,
  complexity: {
    time: 'O(n) best case (already sorted), O(n^2) worst case (reverse sorted).',
    why: 'Each key only needs to slide past items bigger than it. If the array is already sorted, no item ever has to move, so each pass does one comparison: O(n) total. If the array is reverse sorted, every new key has to slide all the way to the front, so the total is about n^2/2 comparisons and shifts.',
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
