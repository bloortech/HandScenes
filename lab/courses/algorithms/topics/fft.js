// The Fast Fourier Transform, used here to multiply two polynomials.
// Evaluating a degree-n polynomial at n points the ordinary way is O(n^2)
// per polynomial; the FFT evaluates a polynomial at all n-th roots of unity
// at once in O(n log n), by splitting it into even- and odd-indexed
// coefficients (a "butterfly": each pair of sub-results combines with a
// twiddle factor to produce two outputs). Multiplying two polynomials of
// degree < n/2 is then: pad to size n (a power of two, n > sum of the two
// degrees), FFT both, multiply pointwise, inverse FFT. No DOM access.
const CODE = [
  'fft(coeffs):',
  '  if len(coeffs) == 1: return coeffs',
  '  even = fft(coeffs at even indices); odd = fft(coeffs at odd indices)',
  '  for k in 0..len/2-1:',
  '    twiddle = e^(-2*pi*i*k/len)   # butterfly combine',
  '    out[k] = even[k] + twiddle * odd[k]',
  '    out[k + len/2] = even[k] - twiddle * odd[k]',
  '  return out',
];

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

// Complex numbers as {re, im} plain objects; +, -, *, and e^(i*theta).
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cExp = (theta) => ({ re: Math.cos(theta), im: Math.sin(theta) });

function fftRecursive(coeffs, sign) {
  const n = coeffs.length;
  if (n === 1) return coeffs.slice();
  const even = fftRecursive(coeffs.filter((_, i) => i % 2 === 0), sign);
  const odd = fftRecursive(coeffs.filter((_, i) => i % 2 === 1), sign);
  const out = Array(n);
  for (let k = 0; k < n / 2; k++) {
    const twiddle = cMul(cExp(sign * 2 * Math.PI * k / n), odd[k]);
    out[k] = cAdd(even[k], twiddle);
    out[k + n / 2] = cSub(even[k], twiddle);
  }
  return out;
}

function multiplyByConvolution(a, b) {
  const out = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}

function levelFrame(level, values, caption, line, n) {
  const nodes = values.map((v, i) => ({
    id: String(i),
    label: typeof v === 'object' ? String(Math.round(v.re * 100) / 100) : String(v),
    x: 6 + ((i + 0.5) / values.length) * 88,
    y: 10 + level * 16,
    w: Math.max(4, Math.min(14, 90 / values.length)),
    h: 10,
    active: true,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(empty)' };
}

function* run(input) {
  const a = input.array, b = input.b;
  const resultLen = a.length + b.length - 1;
  const n = nextPow2(Math.max(1, resultLen));

  yield levelFrame(0, a, `Multiply polynomial A (${a.length} coefficients) by B (${b.length} coefficients). Pad both to size ${n} (a power of two).`, 0, n);

  const aPad = a.concat(Array(n - a.length).fill(0)).map((re) => ({ re, im: 0 }));
  const bPad = b.concat(Array(n - b.length).fill(0)).map((re) => ({ re, im: 0 }));

  yield levelFrame(1, aPad, `Transform A: evaluate it at all ${n} n-th roots of unity via the recursive even/odd split.`, 1, n);
  const FA = fftRecursive(aPad, -1);
  yield levelFrame(2, FA, `FFT(A) computed, ${n} point-values.`, 6, n);

  yield levelFrame(3, bPad, `Transform B the same way.`, 1, n);
  const FB = fftRecursive(bPad, -1);
  yield levelFrame(4, FB, `FFT(B) computed, ${n} point-values.`, 6, n);

  const FC = FA.map((v, k) => cMul(v, FB[k]));
  yield levelFrame(5, FC, `Pointwise multiply: FFT(A)[k] * FFT(B)[k] for every k. This is the whole point: convolution in coefficient space becomes a pointwise product in point-value space.`, 5, n);

  const invRaw = fftRecursive(FC, 1);
  const coeffs = invRaw.map((v) => Math.round(v.re / n));
  yield levelFrame(6, coeffs.slice(0, resultLen), `Inverse FFT and divide by ${n}: back to coefficients. That is A * B.`, 7, n);

  const product = coeffs.slice(0, resultLen);
  return { product };
}

export default {
  id: 'fft',
  title: 'The Fast Fourier Transform',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Polynomials and the FFT',
  summary:
    'A degree-(n-1) polynomial can be represented either by its n coefficients or by its value at any n distinct points; multiplying two polynomials is easy (just a pointwise product) in the point-value representation, but easy to write down (just coefficients) in the coefficient representation. ' +
    'Converting coefficients to point-values by plugging in n points directly costs O(n^2). ' +
    'The Fast Fourier Transform converts between the two representations in O(n log n), by evaluating at a cleverly chosen set of points, the n-th roots of unity, which come in +/- pairs that let a degree-n evaluation be built from two degree-n/2 evaluations (the even-indexed and odd-indexed coefficients) combined by a single "butterfly": out[k] = even[k] + twiddle*odd[k] and out[k+n/2] = even[k] - twiddle*odd[k], reusing the same two half-size results for both outputs. ' +
    'To multiply two polynomials: pad both to a common power-of-two size n bigger than the result\'s degree, FFT both, multiply pointwise, then invert with (essentially) the same transform run backwards and divide by n. ' +
    'This sandbox shows the padded coefficient arrays for A and B, their transforms, the pointwise product, and the inverse transform back to the answer\'s coefficients.',
  code: CODE,
  complexity: {
    time: 'O(n log n) to multiply two polynomials of total degree O(n), versus O(n^2) for direct convolution.',
    why: 'The recurrence for one FFT is T(n) = 2T(n/2) + O(n): two half-size recursive transforms (even/odd split) plus O(n) butterfly combines, the same shape as merge sort, giving O(n log n). Multiplying two polynomials does a constant number of these transforms (two forward, one inverse) plus one O(n) pointwise product, so the total is still O(n log n), beating the O(n^2) of multiplying coefficients directly.',
  },
  makeInput(rng, size) {
    const degA = Math.max(0, Math.min(15, size));
    const degB = Math.max(0, Math.min(15, Math.floor(size * 0.7)));
    const array = Array.from({ length: degA + 1 }, () => Math.floor(rng() * 9) - 4);
    const b = Array.from({ length: degB + 1 }, () => Math.floor(rng() * 9) - 4);
    return { array, b };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = multiplyByConvolution(input.array, input.b);
    if (result.product.length !== expected.length) return false;
    return result.product.every((v, i) => v === expected[i]);
  },
  sandbox: { type: 'array', min: 1, max: 16, default: 6, label: 'coefficients of A' },
};
