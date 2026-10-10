// Matrix chain multiplication: given matrix dimensions p[0..n] (matrix i is
// p[i-1] x p[i]), find the parenthesization that minimises the total number
// of scalar multiplications to compute the whole product A1*A2*...*An.
// Matrix multiplication is associative, so every parenthesization gives the
// same matrix, but the multiplication *cost* can differ enormously.
// m[i][j] = min cost to multiply Ai..Aj; try every split point k.
// No DOM access.
const CODE = [
  'm[i][i] = 0 for all i',
  'for len in 2..n:',
  '  for i in 1..n-len+1: j = i + len - 1',
  '    m[i][j] = min over k in i..j-1 of (m[i][k] + m[k+1][j] + p[i-1]*p[k]*p[j])',
  'return m[1][n]',
];

function bruteBest(p) {
  // Every parenthesization of a chain of n matrices, via the same
  // recursive-partition idea (no memo), independent of the DP table.
  const n = p.length - 1;
  function go(i, j) {
    if (i === j) return 0;
    let best = Infinity;
    for (let k = i; k < j; k++) best = Math.min(best, go(i, k) + go(k + 1, j) + p[i - 1] * p[k] * p[j]);
    return best;
  }
  return go(1, n);
}

function tableFrame(m, n, activeCell, caption, line) {
  const cellSize = Math.min(90 / n, 12);
  const nodes = [];
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= n; j++) {
      nodes.push({
        id: `${i}_${j}`, label: m[i][j] === Infinity ? '' : String(m[i][j]),
        x: 6 + (j - 1 + 0.5) * cellSize, y: 6 + (i - 1 + 0.5) * cellSize,
        w: cellSize * 0.9, h: cellSize * 0.9,
        active: activeCell && activeCell[0] === i && activeCell[1] === j,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(need at least one matrix)' };
}

function* run(input) {
  const p = input.array; // p[0..n]
  const n = p.length - 1;
  if (n <= 0) {
    yield tableFrame([], 0, null, 'Need at least one matrix dimension pair.', 0);
    return { cost: 0 };
  }
  const m = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= n; i++) m[i][i] = 0;
  yield tableFrame(m, n, null, `${n} matrices. The diagonal m[i][i] = 0 (a single matrix needs no multiplication).`, 0);

  for (let len = 2; len <= n; len++) {
    for (let i = 1; i <= n - len + 1; i++) {
      const j = i + len - 1;
      m[i][j] = Infinity;
      let bestK = i;
      for (let k = i; k < j; k++) {
        const cost = m[i][k] + m[k + 1][j] + p[i - 1] * p[k] * p[j];
        if (cost < m[i][j]) { m[i][j] = cost; bestK = k; }
      }
      yield tableFrame(m, n, [i, j], `m[${i}][${j}]: best split at k=${bestK}, cost ${m[i][j]} (chain length ${len}).`, 3);
    }
  }
  return { cost: m[1][n] };
}

export default {
  id: 'matrix-chain',
  title: 'Matrix chain multiplication',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'Matrix multiplication is associative, so A1*A2*...*An gives the same result no matter how it is parenthesized, but the number of scalar multiplications needed can differ enormously depending on the order the pairwise multiplications happen in. ' +
    'Given each matrix\'s dimensions as p[0..n] (matrix i is p[i-1] x p[i], so consecutive matrices always fit), m[i][j] is the minimum cost to multiply the chain Ai through Aj. ' +
    'The chain Ai..Aj must split somewhere: multiply Ai..Ak first, Ak+1..Aj second, then combine the two results, which costs p[i-1]*p[k]*p[j] scalar multiplications for that final combine, plus whatever the two sub-chains cost. ' +
    'Trying every split point k and keeping the cheapest gives m[i][j]; filling the table by increasing chain length (short chains first, since every m[i][j] needs shorter m[i][k] and m[k+1][j] already computed) builds up to the whole chain\'s optimal cost, m[1][n]. ' +
    'The amber cell traces each chain-length pass; the table is filled one diagonal band at a time, moving outward from the all-zero main diagonal.',
  code: CODE,
  complexity: {
    time: 'O(n^3).',
    why: 'There are O(n^2) table entries m[i][j] (one per (i, j) pair with i <= j), and filling each one tries every split point k from i to j-1, O(n) work. O(n^2) entries times O(n) work each is O(n^3).',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const array = [];
    for (let k = 0; k <= n; k++) array.push(10 + Math.floor(rng() * 40));
    return { array: n === 0 ? [] : array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const n = input.array.length - 1;
    if (n <= 0) return result.cost === 0;
    return result.cost === bruteBest(input.array);
  },
  sandbox: { type: 'array', min: 0, max: 11, default: 6 },
};
