// Loop invariants, stepped explicitly so the invariant itself (not just the
// algorithm) is on screen every frame: insertion sort's "a[0..i-1] is
// already sorted" and binary search's "if the target is anywhere in the
// array, it's within a[lo..hi]". No DOM access.
import { randInt } from '../engine/rng.js';

const CODE_INSERTION = [
  'for i from 1 to n-1:',
  '  // invariant: a[0..i-1] is sorted',
  '  key = a[i]; j = i - 1',
  '  while j >= 0 and a[j] > key:',
  '    a[j+1] = a[j]; j = j - 1',
  '  a[j+1] = key',
  '  // invariant now holds for a[0..i]',
];
const CODE_BINARY = [
  'lo = 0, hi = n - 1',
  '// invariant: if target is in a, it is within a[lo..hi]',
  'while lo <= hi:',
  '  mid = (lo + hi) // 2',
  '  if a[mid] == target: return mid',
  '  else if a[mid] < target: lo = mid + 1',
  '  else: hi = mid - 1',
];

function isSortedRange(a, lo, hi) {
  for (let k = lo + 1; k <= hi; k++) if (a[k - 1] > a[k]) return false;
  return true;
}

function* runInsertionSort(array) {
  const a = array.slice();
  const n = a.length;
  const invariantChecks = [];

  invariantChecks.push(isSortedRange(a, 0, 0));
  yield { line: 1, caption: n > 0 ? 'Before the loop starts, a[0..0] (just the first item) is trivially sorted.' : 'Empty array: the invariant holds vacuously.', array: a.slice(), sortedIdx: n > 0 ? [0] : [], invariantHolds: true };

  for (let i = 1; i < n; i++) {
    const holdsBefore = isSortedRange(a, 0, i - 1);
    invariantChecks.push(holdsBefore);
    yield {
      line: 1,
      caption: `Invariant check: a[0..${i - 1}] = [${a.slice(0, i).join(', ')}] is sorted (${holdsBefore ? 'holds' : 'FAILS'}).`,
      array: a.slice(),
      activeIdx: [i],
      sortedIdx: range(0, i - 1),
      invariantHolds: holdsBefore,
    };
    const key = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > key) {
      yield { line: 3, caption: `a[${j}]=${a[j]} > key=${key}, so slide it right.`, array: a.slice(), compareIdx: [j], activeIdx: [i], sortedIdx: range(0, i - 1) };
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = key;
    const holdsAfter = isSortedRange(a, 0, i);
    yield { line: 5, caption: `Placed key=${key} at index ${j + 1}. Invariant now holds for a[0..${i}] (${holdsAfter ? 'confirmed' : 'FAILS'}).`, array: a.slice(), activeIdx: [j + 1], sortedIdx: range(0, i), invariantHolds: holdsAfter };
  }
  const finalHolds = isSortedRange(a, 0, n - 1);
  invariantChecks.push(finalHolds);
  yield { line: 0, caption: `Loop ends with i = n: the invariant a[0..n-1] is sorted is exactly the postcondition we wanted.`, array: a.slice(), sortedIdx: range(0, n - 1), invariantHolds: finalHolds };
  return { mode: 'insertion-sort', array: a, invariantChecks };
}

function range(lo, hi) {
  const out = [];
  for (let k = lo; k <= hi; k++) out.push(k);
  return out;
}

function* runBinarySearch(array, target) {
  const n = array.length;
  const present = array.includes(target);
  let lo = 0, hi = n - 1;
  const invariantChecks = [];
  let found = -1;

  const invariantNow = (lo, hi) => !present || (lo <= hi && target >= array[lo] && target <= array[hi]);

  invariantChecks.push(invariantNow(lo, hi));
  yield { line: 1, caption: `Invariant: if ${target} is anywhere in the array, it's within a[${lo}..${hi}]. That's the whole array, so it trivially holds.`, array: array.slice(), target, lo, hi, invariantHolds: true };

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    yield { line: 3, caption: `Look at the middle, a[${mid}] = ${array[mid]}.`, array: array.slice(), target, lo, hi, mid };
    if (array[mid] === target) {
      found = mid;
      yield { line: 4, caption: `a[${mid}] = ${target}. Found it, and the invariant held the whole way.`, array: array.slice(), target, lo, hi, mid, found: true };
      break;
    } else if (array[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
    const holds = invariantNow(lo, hi);
    invariantChecks.push(holds);
    yield { line: 1, caption: `Narrowed the range to a[${lo}..${hi}]. Invariant: if ${target} is in the array, it's still within this range (${holds ? 'holds' : 'FAILS'}).`, array: array.slice(), target, lo, hi, invariantHolds: holds };
  }
  if (found === -1) {
    yield { line: 2, caption: `Range is empty (lo > hi). By the invariant, ${target} cannot be in the array, so it isn't.`, array: array.slice(), target, lo, hi, found: false, invariantHolds: !present };
  }
  return { mode: 'binary-search', found, invariantChecks };
}

function* run(input) {
  const mode = input.mode === 'insertion-sort' ? 'insertion-sort' : input.mode === 'binary-search' ? 'binary-search' : input.target != null ? 'binary-search' : 'insertion-sort';
  if (mode === 'insertion-sort') return yield* runInsertionSort(input.array);
  return yield* runBinarySearch(input.array, input.target);
}

export default {
  id: 'loop-invariant',
  title: 'Loop invariants',
  module: 'm03',
  course: 'CSC236/240',
  clrs: 'Getting Started (insertion sort\'s correctness proof); Divide-and-Conquer (binary search as a recurrence)',
  summary:
    'A loop invariant is a statement that is true before every single iteration of a loop, including before the first one and after the last one. ' +
    'It\'s how you prove a loop does what you think it does, using exactly the same base-case-plus-step shape as induction: the invariant holding before the loop is the base case, and "it held before this iteration, so it holds before the next one" is the inductive step. ' +
    'Insertion sort\'s invariant is simple: before processing index i, the slice a[0..i-1] is already sorted. When i reaches n, that invariant becomes exactly the claim "the whole array is sorted", which is the postcondition the algorithm is supposed to deliver. ' +
    'Binary search\'s invariant is an implication rather than a flat fact: if the target is anywhere in the array, it is within the current search range a[lo..hi]. Each iteration shrinks that range but never throws away the half that could contain the target, which is exactly why the algorithm can safely conclude "not found" once the range is empty. ' +
    'CLRS opens with insertion sort\'s invariant as the first worked example of this proof technique, and CSC236/240 formalizes it as the main way to prove any loop correct.',
  code: CODE_INSERTION,
  complexity: {
    time: 'Same as the underlying algorithm: insertion sort is O(n^2) worst case, binary search is O(log n).',
    why: 'The invariant check itself is free (it is a fact about the state, not extra work); this topic is about correctness, not speed, so see the insertion-sort and binary-search topics for the running-time argument.',
  },
  makeInput(rng, size) {
    const mode = rng() < 0.5 ? 'insertion-sort' : 'binary-search';
    if (mode === 'insertion-sort') {
      const array = [];
      for (let k = 0; k < size; k++) array.push(randInt(rng, 0, 99));
      return { mode, array };
    }
    const array = [];
    let v = randInt(rng, 0, 4);
    for (let k = 0; k < size; k++) { array.push(v); v += randInt(rng, 0, 4); }
    let target;
    if (size === 0) target = randInt(rng, 0, 50);
    else if (rng() < 0.5) target = array[randInt(rng, 0, size - 1)];
    else target = -1 - randInt(rng, 0, 20);
    return { mode, array, target };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (!result.invariantChecks.every(Boolean)) return false;
    if (result.mode === 'insertion-sort') {
      const got = result.array;
      const expected = input.array.slice().sort((x, y) => x - y);
      return got.length === expected.length && got.every((v, i) => v === expected[i]) && isSortedRange(got, 0, got.length - 1);
    }
    const a = input.array, target = input.target;
    if (result.found === -1) return !a.includes(target);
    return result.found >= 0 && result.found < a.length && a[result.found] === target;
  },
  sandbox: { type: 'array-sorted', min: 0, max: 40, default: 16 },
};
