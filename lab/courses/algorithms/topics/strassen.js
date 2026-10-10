// Strassen's algorithm: multiply two n x n matrices (n a power of two) with
// 7 recursive half-size multiplications instead of the 8 grade-school
// divide-and-conquer would need, trading one multiplication for a handful
// of extra additions. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'strassen(A, B):',
  '  if n == 1: return A[0][0] * B[0][0]',
  '  split A, B into four (n/2)x(n/2) quadrants each',
  '  M1 = strassen(A11+A22, B11+B22)',
  '  M2..M7 = six more quadrant combinations (one multiplication each)',
  '  combine M1..M7 with additions/subtractions into C\'s four quadrants',
];

function zeros(n) { return Array.from({ length: n }, () => Array(n).fill(0)); }
function addM(A, B) { const n = A.length; const C = zeros(n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = A[i][j] + B[i][j]; return C; }
function subM(A, B) { const n = A.length; const C = zeros(n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] = A[i][j] - B[i][j]; return C; }

function split(M) {
  const n = M.length, h = n / 2;
  const A11 = zeros(h), A12 = zeros(h), A21 = zeros(h), A22 = zeros(h);
  for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) {
    A11[i][j] = M[i][j];
    A12[i][j] = M[i][j + h];
    A21[i][j] = M[i + h][j];
    A22[i][j] = M[i + h][j + h];
  }
  return { A11, A12, A21, A22 };
}

function join(C11, C12, C21, C22) {
  const h = C11.length, n = h * 2;
  const C = zeros(n);
  for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) {
    C[i][j] = C11[i][j];
    C[i][j + h] = C12[i][j];
    C[i + h][j] = C21[i][j];
    C[i + h][j + h] = C22[i][j];
  }
  return C;
}

function bruteMultiply(A, B) {
  const n = A.length;
  const C = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += A[i][k] * B[k][j];
    C[i][j] = s;
  }
  return C;
}

function matBoxes(M, x0, y0, size, active) {
  const n = M.length;
  const nodes = [];
  const cell = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    nodes.push({ id: `${x0}_${y0}_${i}_${j}`, label: String(M[i][j]), x: x0 + (j + 0.5) * cell, y: y0 + (i + 0.5) * cell, w: Math.min(16, cell * 0.9), h: Math.min(16, cell * 0.9), active: !!active });
  }
  return nodes;
}

function* run(input) {
  const { A, B } = input;
  let mults = 0;
  const counters = () => ({ multiplications: mults });

  function frame(caption, line, extraNodes) {
    const size = 36;
    const nodes = [
      ...matBoxes(A, 6, 10, size),
      ...matBoxes(B, 56, 10, size, true),
      ...(extraNodes || []),
    ];
    return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], counters: counters() };
  }

  yield frame(`Multiply two ${A.length}x${A.length} matrices A and B.`, 0);
  const C = yield* strassen(A, B, 0);
  yield frame(`Done: C = A x B, computed with ${mults} scalar/sub-matrix multiplications instead of ${A.length === 0 ? 0 : Math.pow(A.length, 3)} for the grade-school triple loop.`, 5, matBoxes(C, 30, 55, 36));
  return { C, multiplications: mults };

  function* strassen(A, B, depth) {
    const n = A.length;
    if (n === 1) {
      mults++;
      const v = A[0][0] * B[0][0];
      yield frame(`Depth ${depth}: base case, 1x1 multiply: ${A[0][0]} x ${B[0][0]} = ${v}.`, 1, [{ id: `base${depth}`, label: String(v), x: 50, y: 85, w: 16, h: 14, compare: true }]);
      return [[v]];
    }
    const { A11, A12, A21, A22 } = split(A);
    const { A11: B11, A12: B12, A21: B21, A22: B22 } = (() => { const s = split(B); return { A11: s.A11, A12: s.A12, A21: s.A21, A22: s.A22 }; })();
    yield frame(`Depth ${depth}: split both ${n}x${n} matrices into four ${n / 2}x${n / 2} quadrants.`, 2);

    const M1 = yield* strassen(addM(A11, A22), addM(B11, B22), depth + 1);
    const M2 = yield* strassen(addM(A21, A22), B11, depth + 1);
    const M3 = yield* strassen(A11, subM(B12, B22), depth + 1);
    const M4 = yield* strassen(A22, subM(B21, B11), depth + 1);
    const M5 = yield* strassen(addM(A11, A12), B22, depth + 1);
    const M6 = yield* strassen(subM(A21, A11), addM(B11, B12), depth + 1);
    const M7 = yield* strassen(subM(A12, A22), addM(B21, B22), depth + 1);

    const C11 = addM(subM(addM(M1, M4), M5), M7);
    const C12 = addM(M3, M5);
    const C21 = addM(M2, M4);
    const C22 = addM(subM(addM(M1, M3), M2), M6);
    const C = join(C11, C12, C21, C22);
    yield frame(`Depth ${depth}: combine the 7 products (M1..M7) into this level's ${n}x${n} result with additions and subtractions.`, 5, matBoxes(C, 30, 55, 28));
    return C;
  }
}

export default {
  id: 'strassen',
  title: "Strassen's matrix multiplication",
  module: 'm07',
  course: 'CSC373',
  clrs: 'Divide-and-Conquer',
  summary:
    'Multiplying two n x n matrices the ordinary way (triple nested loop) costs O(n^3). ' +
    'Splitting each matrix into four (n/2) x (n/2) quadrants and multiplying quadrants the obvious way still needs 8 half-size multiplications, giving the same O(n^3) (the recurrence T(n) = 8T(n/2) + O(n^2) has critical exponent log2(8) = 3). ' +
    "Strassen found a way to combine the quadrants with extra additions and subtractions first, so only 7 half-size multiplications (M1 through M7) are needed, each on a sum or difference of quadrants rather than a quadrant itself. " +
    'That changes the recurrence to T(n) = 7T(n/2) + O(n^2), whose critical exponent is log2(7) ~ 2.807, strictly better than 3 for large n (even though it uses more additions and has worse constants, which is why grade-school multiplication is often faster in practice for small matrices). ' +
    'This sandbox multiplies two small power-of-two matrices, showing the quadrant split at each recursive level and the seven sub-multiplications before they combine back up.',
  code: CODE,
  complexity: {
    time: 'O(n^log2(7)) ~ O(n^2.807), versus O(n^3) for the grade-school triple loop.',
    why: 'The recurrence is T(n) = 7T(n/2) + O(n^2): seven half-size recursive multiplications per level, plus O(n^2) work to add/subtract quadrants into the seven inputs and combine the seven outputs. By the Master theorem, a = 7, b = 2, so the critical exponent log2(7) ~ 2.807 dominates the O(n^2) combine step.',
  },
  makeInput(rng, size) {
    const n = size <= 2 ? 2 : size <= 5 ? 4 : 8;
    const A = Array.from({ length: n }, () => Array.from({ length: n }, () => randInt(rng, -5, 5)));
    const B = Array.from({ length: n }, () => Array.from({ length: n }, () => randInt(rng, -5, 5)));
    return { A, B };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = bruteMultiply(input.A, input.B);
    const n = input.A.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (result.C[i][j] !== expected[i][j]) return false;
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 8, default: 4, label: 'size hint' },
};
