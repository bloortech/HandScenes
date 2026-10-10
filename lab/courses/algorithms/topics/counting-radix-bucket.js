// Three linear-time sorts that beat the Omega(n log n) comparison-sort
// lower bound by never comparing elements to each other at all: counting
// sort (uses each value as an index), radix sort (counting sort applied
// digit by digit), and bucket sort (scatters values into buckets by their
// leading digit, assuming a roughly uniform input). Mode picked at random
// per run, same "pick a mode" pattern as other multi-algorithm topics in
// this course. No DOM access.
const CODE_COUNTING = [
  'countingSort(array, k):          # every value in 0..k',
  '  count[0..k] = 0',
  '  for v in array: count[v] += 1',
  '  for i from 1 to k: count[i] += count[i-1]   # running total = position',
  '  for v in array (right to left): output[--count[v]] = v',
];
const CODE_RADIX = [
  'radixSort(array, digits):',
  '  for each digit position, least significant first:',
  '    countingSort(array) using that one digit as the key',
  '  // stable at every pass, so earlier (less significant) digit order',
  '  // is preserved whenever the current digit ties',
];
const CODE_BUCKET = [
  'bucketSort(array, numBuckets):   # assumes roughly uniform input',
  '  scatter each value into bucket floor(value / bucketWidth)',
  '  sort each bucket (small, so insertion sort is fine)',
  '  concatenate the buckets in order',
];

function* countingSortPass(a, keyOf, k, code, lineOffset) {
  const n = a.length;
  const count = new Array(k + 1).fill(0);
  for (const v of a) count[keyOf(v)]++;
  yield { array: a.slice(), labels: a.map((v) => String(keyOf(v))), caption: 'Count how many items have each key value.', line: lineOffset + 1, code };
  for (let i = 1; i <= k; i++) count[i] += count[i - 1];
  yield { array: a.slice(), caption: 'Turn counts into running totals: each one is now the output position just past where that key\'s run ends.', line: lineOffset + 2, code };
  const output = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const key = keyOf(a[i]);
    output[--count[key]] = a[i];
  }
  yield { array: output.slice(), caption: 'Place each item at its position, working right to left to keep equal keys in their original relative order (stability).', line: lineOffset + 3, code };
  return output;
}

function* run(input) {
  const a = input.array.slice();
  const n = a.length;
  let result;

  if (input.mode === 'counting') {
    const k = a.length ? Math.max(...a) : 0;
    yield { array: a.slice(), caption: `Counting sort on ${n} item${n === 1 ? '' : 's'}, every value between 0 and ${k}.`, line: 0, code: CODE_COUNTING };
    result = a.length ? yield* countingSortPass(a, (v) => v, k, CODE_COUNTING, 0) : [];
  } else if (input.mode === 'radix') {
    const maxVal = a.length ? Math.max(...a) : 0;
    const numDigits = maxVal > 0 ? Math.floor(Math.log10(maxVal)) + 1 : 1;
    let cur = a.slice();
    yield { array: cur.slice(), caption: `Radix sort on ${n} item${n === 1 ? '' : 's'}, ${numDigits} decimal digit${numDigits === 1 ? '' : 's'} wide, least significant first.`, line: 0, code: CODE_RADIX };
    for (let d = 0; d < numDigits; d++) {
      const place = 10 ** d;
      yield { array: cur.slice(), caption: `Pass for digit place ${d} (the ${place === 1 ? 'ones' : place + 's'} digit): a stable counting sort keyed on just that digit.`, line: 1, code: CODE_RADIX };
      cur = cur.length ? yield* countingSortPass(cur, (v) => Math.floor(v / place) % 10, 9, CODE_RADIX, 1) : [];
    }
    result = cur;
  } else {
    // bucket sort
    const maxVal = a.length ? Math.max(...a, 1) : 1;
    const numBuckets = Math.max(1, Math.min(10, a.length || 1));
    const bucketWidth = (maxVal + 1) / numBuckets;
    const buckets = Array.from({ length: numBuckets }, () => []);
    yield { array: a.slice(), caption: `Bucket sort on ${n} item${n === 1 ? '' : 's'} into ${numBuckets} bucket${numBuckets === 1 ? '' : 's'}, assuming values are roughly spread out.`, line: 0, code: CODE_BUCKET };
    for (const v of a) {
      const b = Math.min(numBuckets - 1, Math.floor(v / bucketWidth));
      buckets[b].push(v);
    }
    yield { array: a.slice(), labels: a.map((v) => String(Math.min(numBuckets - 1, Math.floor(v / bucketWidth)))), caption: 'Scatter every value into its bucket by value, shown above as each item\'s bucket number.', line: 1, code: CODE_BUCKET };
    const sortedBuckets = buckets.map((bucket) => bucket.slice().sort((x, y) => x - y));
    yield { array: sortedBuckets.flat(), caption: 'Sort each bucket on its own (buckets are small, so a simple sort is fine).', line: 2, code: CODE_BUCKET };
    result = sortedBuckets.flat();
    yield { array: result.slice(), caption: 'Concatenate the buckets in order: done.', line: 3, code: CODE_BUCKET };
  }

  const sortedIdx = [];
  for (let k = 0; k < result.length; k++) sortedIdx.push(k);
  yield { array: result.slice(), caption: 'The array is fully sorted.', sortedIdx, line: 0, code: input.mode === 'counting' ? CODE_COUNTING : input.mode === 'radix' ? CODE_RADIX : CODE_BUCKET };
  return result;
}

export default {
  id: 'counting-radix-bucket',
  title: 'Counting, radix and bucket sort',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Sorting in Linear Time',
  summary:
    'These three sorts all run in O(n) by never comparing two elements to each other, which is how they get around the Omega(n log n) comparison-sort lower bound. ' +
    'Counting sort assumes every value is a small integer: it counts how many times each value appears, turns those counts into running totals (so each total is exactly where that value\'s run of outputs should start), then places every item directly at its position. ' +
    'Radix sort handles bigger numbers by applying counting sort one digit at a time, least significant first; because counting sort is stable, an earlier pass\'s ordering survives every tie in a later, more significant digit. ' +
    'Bucket sort assumes the input is roughly uniformly spread out: it scatters values into a fixed number of buckets by value, sorts each small bucket with any simple method, then concatenates them in order. ' +
    'All three trade generality for speed: they only work (or only work well) when something extra is known about the input, which plain comparison sorts never need to assume.',
  code: CODE_COUNTING,
  complexity: {
    time: 'Counting sort: O(n + k), k = the largest value. Radix sort: O(d*(n+k)) for d digits, base k+1. Bucket sort: O(n) expected, if the input really is roughly uniform.',
    why: 'Counting sort does one pass to count (O(n)), one pass to accumulate (O(k)), and one pass to place items (O(n)), total O(n+k); it only beats O(n log n) when k is not too much bigger than n. Radix sort runs counting sort once per digit, so O(d*(n+k)) where d is the number of digits and k is the digit base (10, or a bigger base in practice). Bucket sort\'s O(n) bound relies on the uniform-input assumption spreading items evenly across buckets, so each bucket stays small (O(1) expected size); a skewed input can dump everything into one bucket and degrade toward whatever sort is used inside it.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * 500));
    const modes = ['counting', 'radix', 'bucket'];
    const mode = modes[Math.floor(rng() * modes.length)];
    return { array, mode };
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
