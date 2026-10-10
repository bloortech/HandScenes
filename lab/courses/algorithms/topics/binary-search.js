// Binary search over a sorted array. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'lo = 0, hi = n - 1',
  'while lo <= hi:',
  '  mid = (lo + hi) // 2',
  '  if array[mid] == target: return mid',
  '  else if array[mid] < target: lo = mid + 1',
  '  else: hi = mid - 1',
  'return -1  (not found)',
];

function* run(input) {
  const a = input.array;
  const target = input.target;
  const n = a.length;
  let comparisons = 0;
  const counters = () => ({ comparisons });

  let lo = 0, hi = n - 1;
  yield { line: 0, caption: `Searching for ${target} in a sorted array of ${n} item${n === 1 ? '' : 's'}. Start with the whole array as the search range.`, array: a.slice(), target, lo, hi, counters: counters() };

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    comparisons++;
    yield { line: 2, caption: `The middle of the range [${lo}, ${hi}] is index ${mid}.`, array: a.slice(), target, lo, hi, mid, counters: counters() };
    if (a[mid] === target) {
      yield { line: 3, caption: `array[${mid}] = ${a[mid]} matches the target. Found it.`, array: a.slice(), target, lo, hi, mid, found: true, counters: counters() };
      return mid;
    } else if (a[mid] < target) {
      yield { line: 4, caption: `array[${mid}] = ${a[mid]} is less than ${target}, so the target must be to the right. Narrow the range.`, array: a.slice(), target, lo, hi, mid, counters: counters() };
      lo = mid + 1;
    } else {
      yield { line: 5, caption: `array[${mid}] = ${a[mid]} is greater than ${target}, so the target must be to the left. Narrow the range.`, array: a.slice(), target, lo, hi, mid, counters: counters() };
      hi = mid - 1;
    }
  }

  yield { line: 6, caption: `The range is empty (lo > hi). ${target} is not in the array.`, array: a.slice(), target, lo, hi, found: false, counters: counters() };
  return -1;
}

export default {
  id: 'binary-search',
  title: 'Binary search',
  module: 'm01',
  course: 'CSC108/148 (or CSC110/111)',
  clrs: 'Getting Started (classic divide-and-conquer exercise)',
  summary:
    'Binary search finds a target value in a sorted array by repeatedly checking the middle of the current range. ' +
    'If the middle value is too small, the target (if present) must be to its right, so the search continues only in the right half. ' +
    'If the middle value is too big, the search continues only in the left half. This cuts the search range in half every step. ' +
    'Because the range halves each time, it takes only about log(n) steps to search an array of n items, far fewer than checking every item. ' +
    'It only works when the array is sorted first. Searching an unsorted array this way gives wrong answers. ' +
    'CLRS introduces this as an early example of divide-and-conquer thinking, well before the Divide-and-Conquer chapter formalises the idea.',
  code: CODE,
  complexity: {
    time: 'O(log n).',
    why: 'Each step throws away half of the remaining search range, no matter which half the target turns out to be in. Starting from n items, you can halve at most log2(n) times before the range is down to one item, so the number of steps grows with log(n) instead of n.',
  },
  makeInput(rng, size) {
    const array = [];
    let v = randInt(rng, 0, 4);
    for (let k = 0; k < size; k++) {
      array.push(v);
      v += randInt(rng, 0, 4); // non-decreasing, so duplicates happen sometimes
    }
    let target;
    if (size === 0) {
      target = randInt(rng, 0, 50);
    } else if (rng() < 0.5) {
      target = array[randInt(rng, 0, size - 1)]; // present
    } else {
      target = -1 - randInt(rng, 0, 20); // guaranteed absent (array values are >= 0)
    }
    return { array, target };
  },
  run,
  check(input, result) {
    const a = input.array;
    const target = input.target;
    if (result === -1) {
      return !a.includes(target);
    }
    return Number.isInteger(result) && result >= 0 && result < a.length && a[result] === target;
  },
  sandbox: { type: 'array-sorted', min: 1, max: 40, default: 16 },
};
