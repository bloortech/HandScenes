// The binary counter trick: incrementing a binary counter one at a time
// flips some bits every time, but the amortised number of flips per
// increment is O(1), not O(k) (the number of bits). No DOM access.
// CLRS: Amortized Analysis (the binary counter section).
const CODE = [
  'increment(A):',
  '  i = 0',
  '  while i < length(A) and A[i] == 1:',
  '    A[i] = 0; i += 1      # flips a trailing 1 to 0',
  '  if i < length(A): A[i] = 1   # flips the first trailing 0 to 1',
];

function frame(bits, { flippedIdx = [], caption, line, counters }) {
  // Index 0 is the low bit; draw it on the left for a natural reading
  // order. Values are the bits themselves (0 or 1), so the renderer's
  // default "print the value under the bar" already shows the bit, and a
  // flipped bit's bar visibly grows (0->1) or shrinks (1->0).
  return {
    array: bits.slice(),
    compareIdx: flippedIdx,
    caption,
    line,
    code: CODE,
    counters,
  };
}

function* run(input) {
  const n = input.array.length;
  const bitCount = Math.max(1, Math.ceil(Math.log2(n + 2)));
  const bits = Array(bitCount).fill(0);
  let totalFlips = 0;

  yield frame(bits, { caption: `Start a ${bitCount}-bit counter at 0, then increment it ${n} time${n === 1 ? '' : 's'}.`, line: 0, counters: { totalFlips, amortised: '0.00' } });

  for (let op = 0; op < n; op++) {
    const flipped = [];
    let i = 0;
    while (i < bits.length && bits[i] === 1) {
      bits[i] = 0;
      flipped.push(i);
      totalFlips++;
      i++;
    }
    if (i < bits.length) {
      bits[i] = 1;
      flipped.push(i);
      totalFlips++;
    }
    yield frame(bits, {
      flippedIdx: flipped,
      caption: `Increment ${op + 1}: flip bit${flipped.length === 1 ? '' : 's'} ${flipped.join(', ')}. Total flips so far: ${totalFlips} (${(totalFlips / (op + 1)).toFixed(2)}/increment).`,
      line: 3,
      counters: { totalFlips, amortised: (totalFlips / (op + 1)).toFixed(2) },
    });
  }

  const value = bits.reduce((acc, b, idx) => acc + b * (2 ** idx), 0);
  return { bits: bits.slice(), value, totalFlips, ops: n };
}

export default {
  id: 'binary-counter',
  title: 'The binary counter trick',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'Amortized Analysis (the binary counter section)',
  summary:
    'A k-bit binary counter starts at all zeros, and incrementing it flips every trailing 1 to 0 (a carry) and then the first 0 it finds to 1. ' +
    'A single increment can flip all k bits (when the counter is all 1s, like 0111 -> 1000), which looks like O(k) work every time. ' +
    'But bit 0 flips on every increment, bit 1 flips on every other increment, bit 2 on every fourth, and so on: bit i flips at most n/2^i times in n increments. ' +
    'Summing that geometric series over all bits gives at most 2n total flips for n increments, so the amortised cost is O(1) flips per increment, not O(k). ' +
    'This is the simplest possible instance of the potential method: define the potential as the number of 1 bits, which only goes up by 1 (the final set bit) no matter how many 0s a carry resets, so the amortised cost of any increment is capped at 2.',
  code: CODE,
  complexity: {
    time: 'O(1) amortised per increment; O(k) worst case for one increment that carries all the way through k bits.',
    why: 'Bit i only flips on an increment when every lower bit was 1, which happens at most once every 2^i increments, so across n increments bit i flips at most ceil(n/2^i) times. Summing that over all k bits is a geometric series bounded by 2n, so n increments cost O(n) total, O(1) each on average no matter how the carries line up.',
  },
  makeInput(rng, size) {
    const array = Array.from({ length: size }, () => 1);
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const n = input.array.length;
    if (result.ops !== n) return false;
    if (result.value !== n % (2 ** result.bits.length)) return false;
    // The amortised bound this whole topic exists to prove: at most 2
    // flips per increment, total.
    return result.totalFlips <= 2 * Math.max(1, n);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 12 },
};
