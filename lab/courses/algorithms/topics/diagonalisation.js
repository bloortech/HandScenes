// Cantor's diagonal argument: given any attempted list of binary strings,
// build one new string that provably is not on the list, by flipping the
// i-th bit of the i-th row to get the i-th bit of the answer. Do this to a
// finite list of length n and you get a string different from every row in
// at least the diagonal position; do the same thing to an infinite list
// claiming to enumerate ALL infinite binary sequences, and you get a
// contradiction, which is exactly how Cantor proved the reals are
// uncountable. No DOM access.

const CODE = [
  'rows = list of n binary strings, each of length n',
  'for i in 0..n-1:',
  '  diagonal[i] = flip(rows[i][i])   // differ from row i at position i',
  'diagonal differs from EVERY row (at index i, if nowhere else)',
];

function gridFrame(rows, diagonal, { highlightRow = -1, highlightCol = -1, caption, line }) {
  const n = rows.length;
  const cell = n === 0 ? 100 : Math.min(90 / n, 12);
  const nodes = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      nodes.push({
        id: `${r}-${c}`,
        label: rows[r][c],
        x: 6 + c * cell,
        y: 8 + r * cell,
        w: cell * 0.85,
        h: cell * 0.85,
        active: r === highlightRow && c === highlightCol,
        dim: highlightRow >= 0 && r !== highlightRow,
      });
    }
  }
  for (let r = 0; r < diagonal.length; r++) {
    nodes.push({
      id: `d-${r}`,
      label: diagonal[r],
      x: 6 + n * cell + 6,
      y: 8 + r * cell,
      w: cell * 0.85,
      h: cell * 0.85,
      active: r === highlightRow,
    });
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [{ x: 6 + n * cell + 6, y: 2, text: 'diagonal' }] };
}

function* run(input) {
  const { rows } = input;
  const n = rows.length;
  const diagonal = [];
  if (n === 0) {
    yield gridFrame([], [], { caption: 'An empty list (n = 0): there is nothing to diagonalise, and nothing to prove.', line: 0 });
    return { n: 0, diagonal: [], differsFromAll: true };
  }
  yield gridFrame(rows, [], { caption: `${n} rows claim to list every binary string of length ${n}, but there are 2^${n} = ${Math.pow(2, n)} of those, so the list is already too short to be complete. Watch anyway: this is the same move used on an infinite list.`, line: 0 });
  for (let i = 0; i < n; i++) {
    const bit = rows[i][i];
    const flipped = bit === '0' ? '1' : '0';
    diagonal.push(flipped);
    yield gridFrame(rows, diagonal, { highlightRow: i, highlightCol: i, caption: `Row ${i}, position ${i} is '${bit}'. Flip it: the diagonal string's bit ${i} is '${flipped}', so the diagonal string can never equal row ${i} (they differ right there).`, line: 2 });
  }
  const diagStr = diagonal.join('');
  const differsFromAll = rows.every((row) => row.join('') !== diagStr);
  yield gridFrame(rows, diagonal, { caption: `Diagonal string = "${diagStr}". It differs from every row in the list, at least at that row's own diagonal position. ${differsFromAll ? 'Confirmed: not equal to any row.' : ''} Do this to a list that claims to enumerate ALL of an infinite set, and the same construction produces an element missing from the list: a contradiction, which is Cantor's proof that no such list can exist.`, line: 3 });
  return { n, diagonal, differsFromAll };
}

export default {
  id: 'diagonalisation',
  title: 'Diagonalisation',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: Decidability, Diagonalization)',
  summary:
    'Diagonalisation is a recipe for building something that is guaranteed to be different from every item on a list, even a list you have not finished looking at: lay the items out as rows, read down the diagonal (item i\'s i-th piece), and build a new item that disagrees with every row at exactly that one position. ' +
    'Cantor used this to prove the real numbers are uncountable: if you could list every real number (as an infinite binary sequence), the diagonal construction builds a number not on the list, contradicting the claim that the list was complete, so no such list exists. ' +
    'This sandbox runs the same construction on a small finite grid: n rows of length-n binary strings. The grid is far too short to list all 2^n strings of that length (that is not the point), but the diagonal still provably differs from every single row, which is exactly the move the infinite argument scales up. ' +
    'The same technique, applied to a list of "deciders" instead of numbers, is exactly how the next topic, the halting problem, proves no algorithm can decide whether an arbitrary program halts. ' +
    'Watch the active cell crawl down the diagonal, flipping as it goes, and building the one string guaranteed to escape the whole list.',
  code: CODE,
  complexity: {
    time: 'O(n) to build the diagonal string from an n x n grid: one flip per row, reading only the diagonal cell.',
    why: 'The entire argument only ever touches n cells (the diagonal), never the full n^2 grid, which is part of why it generalizes cleanly to infinite lists: you never need to finish reading any row.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(14, size));
    const rows = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(rng() < 0.5 ? '0' : '1');
      rows.push(row);
    }
    return { rows };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { rows } = input;
    const n = rows.length;
    if (result.n !== n) return false;
    if (n === 0) return result.differsFromAll === true && result.diagonal.length === 0;
    if (result.diagonal.length !== n) return false;
    // Brute force: the diagonal must flip every rows[i][i], and must differ
    // from every single row (checked directly, not just at the diagonal).
    for (let i = 0; i < n; i++) {
      const expectedBit = rows[i][i] === '0' ? '1' : '0';
      if (result.diagonal[i] !== expectedBit) return false;
    }
    const diagStr = result.diagonal.join('');
    const reallyDiffersFromAll = rows.every((row) => row.join('') !== diagStr);
    return result.differsFromAll === reallyDiffersFromAll && reallyDiffersFromAll === true;
  },
  sandbox: { type: 'n', min: 0, max: 14, default: 6, label: 'rows (n x n grid)' },
};
