// Karatsuba multiplication: multiply two n-digit numbers in
// O(n^1.585) instead of the grade-school O(n^2), by splitting each number
// into a high and low half and combining three half-size multiplications
// (not four) via one extra addition/subtraction trick. No DOM access.
// Numbers are kept as decimal-digit strings throughout so the split is
// visible; BigInt is only used as the independent reference in check().
const CODE = [
  'karatsuba(x, y):',
  '  if x or y is a single digit: return x * y',
  '  m = half the digit length of the longer number',
  '  xHigh, xLow = split x at m digits; yHigh, yLow = split y at m digits',
  '  p1 = karatsuba(xHigh, yHigh)',
  '  p2 = karatsuba(xLow, yLow)',
  '  p3 = karatsuba(xHigh + xLow, yHigh + yLow)',
  '  return p1 * 10^(2m) + (p3 - p1 - p2) * 10^m + p2',
];

function randDigits(rng, len) {
  if (len === 0) return '0';
  let s = String(1 + Math.floor(rng() * 9));
  for (let i = 1; i < len; i++) s += String(Math.floor(rng() * 10));
  return s;
}

function* run(input) {
  const xStr = input.x, yStr = input.y;
  let steps = 0;
  const counters = () => ({ multiplications: steps });

  yield { kind: 'boxes', line: 0, code: CODE, caption: `Multiply ${xStr} x ${yStr} with Karatsuba's trick.`, nodes: boxesFor(xStr, yStr), edges: [], counters: counters() };

  const value = yield* karatsuba(xStr, yStr, 0);
  yield { kind: 'boxes', line: 7, code: CODE, caption: `Done: ${xStr} x ${yStr} = ${value}.`, nodes: boxesFor(xStr, yStr, value), edges: [], counters: counters() };
  return { product: value, multiplications: steps };

  function boxesFor(x, y, product, extraLabel) {
    const nodes = [
      { id: 'x', label: `x=${x}`, x: 25, y: 20, w: 36, h: 14 },
      { id: 'y', label: `y=${y}`, x: 75, y: 20, w: 36, h: 14, active: true },
    ];
    if (product != null) nodes.push({ id: 'p', label: `product=${product}`, x: 50, y: 60, w: 70, h: 16, active: true });
    if (extraLabel) nodes.push({ id: 'extra', label: extraLabel, x: 50, y: 85, w: 90, h: 14, compare: true });
    return nodes;
  }

  function* karatsuba(x, y, depth) {
    if (x.length <= 1 || y.length <= 1) {
      steps++;
      const product = String(BigInt(x) * BigInt(y));
      yield { kind: 'boxes', line: 1, code: CODE, caption: `Base case at depth ${depth}: ${x} x ${y} = ${product}.`, nodes: boxesFor(x, y, product), edges: [], counters: counters() };
      return product;
    }
    const m = Math.ceil(Math.max(x.length, y.length) / 2);
    const [xHigh, xLow] = splitAt(x, m);
    const [yHigh, yLow] = splitAt(y, m);
    yield {
      kind: 'boxes', line: 2, code: CODE,
      caption: `Depth ${depth}: split at ${m} digits. x -> high=${xHigh}, low=${xLow}; y -> high=${yHigh}, low=${yLow}.`,
      nodes: boxesFor(x, y, null, `high/low split, m=${m}`), edges: [], counters: counters(),
    };

    const p1 = yield* karatsuba(xHigh, yHigh, depth + 1);
    const p2 = yield* karatsuba(xLow, yLow, depth + 1);
    const sumX = String(BigInt(xHigh) + BigInt(xLow));
    const sumY = String(BigInt(yHigh) + BigInt(yLow));
    const p3 = yield* karatsuba(sumX, sumY, depth + 1);

    const P1 = BigInt(p1), P2 = BigInt(p2), P3 = BigInt(p3);
    const mid = P3 - P1 - P2;
    const result = String(P1 * (10n ** BigInt(2 * m)) + mid * (10n ** BigInt(m)) + P2);
    yield {
      kind: 'boxes', line: 7, code: CODE,
      caption: `Depth ${depth}: combine p1=${p1}, p2=${p2}, p3=${p3} into ${x} x ${y} = ${result}.`,
      nodes: boxesFor(x, y, result), edges: [], counters: counters(),
    };
    return result;
  }

  function splitAt(s, m) {
    if (s.length <= m) return [stripLeadingZeros('0'), stripLeadingZeros(s)];
    const cut = s.length - m;
    return [stripLeadingZeros(s.slice(0, cut)), stripLeadingZeros(s.slice(cut))];
  }
  function stripLeadingZeros(s) {
    const stripped = s.replace(/^0+(?=\d)/, '');
    return stripped.length ? stripped : '0';
  }
}

export default {
  id: 'karatsuba',
  title: 'Karatsuba multiplication',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Divide-and-Conquer',
  summary:
    'Grade-school long multiplication of two n-digit numbers takes O(n^2) single-digit multiplications. ' +
    'Karatsuba\'s trick splits each number into a high half and a low half (x = xHigh * 10^m + xLow) and notices that the cross term needed for the middle digits, xHigh*yLow + xLow*yHigh, can be recovered from (xHigh+xLow)*(yHigh+yLow) minus the two products already being computed, so only three half-size multiplications are needed instead of four. ' +
    'That turns the recurrence from T(n) = 4T(n/2) + O(n) (grade school) into T(n) = 3T(n/2) + O(n), which by the Master theorem is O(n^log2(3)), about O(n^1.585), beating quadratic. ' +
    'This was one of the first results to show that the "obvious" algorithm for a basic problem is not always optimal. ' +
    'The sandbox below shows the digit split and the three recursive sub-multiplications at every level, down to the single-digit base case.',
  code: CODE,
  complexity: {
    time: 'O(n^log2(3)) = O(n^1.585), versus O(n^2) for grade-school multiplication.',
    why: 'The recurrence is T(n) = 3T(n/2) + O(n): three half-size recursive multiplications per level, plus O(n) work to add/subtract the pieces together. By the Master theorem, a = 3, b = 2, so the critical exponent is log2(3) ~ 1.585, which dominates the O(n) combine step, giving T(n) = O(n^1.585).',
  },
  makeInput(rng, size) {
    const len = Math.max(1, Math.min(12, size || 1));
    return { x: randDigits(rng, len), y: randDigits(rng, len) };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = BigInt(input.x) * BigInt(input.y);
    return BigInt(result.product) === expected;
  },
  sandbox: { type: 'n', min: 1, max: 12, default: 4, label: 'digits' },
};
