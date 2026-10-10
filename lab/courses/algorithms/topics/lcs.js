// Longest common subsequence: the classic two-string DP. c[i][j] = LCS
// length of a[0..i-1] and b[0..j-1]; if the last characters match, extend
// the diagonal; otherwise take the best of dropping one character from
// either string. No DOM access.
const CODE = [
  'c[i][0] = c[0][j] = 0',
  'for i in 1..m: for j in 1..n:',
  '  if a[i-1] == b[j-1]: c[i][j] = c[i-1][j-1] + 1',
  '  else: c[i][j] = max(c[i-1][j], c[i][j-1])',
  'return c[m][n], reconstructed by walking the table from (m, n)',
];

function tableFrame(c, m, n, i, activeCell, caption, line) {
  const rows = i + 1, cols = n + 1;
  const cellW = Math.min(90 / (n + 1), 10);
  const cellH = Math.min(80 / (m + 1), 10);
  const nodes = [];
  for (let r = 0; r <= i; r++) {
    for (let col = 0; col <= n; col++) {
      nodes.push({
        id: `${r}_${col}`, label: String(c[r][col]),
        x: 6 + (col + 0.5) * cellW, y: 6 + (r + 0.5) * cellH,
        w: cellW * 0.9, h: cellH * 0.9,
        active: activeCell && activeCell[0] === r && activeCell[1] === col,
      });
    }
  }
  void rows, void cols;
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(empty string)' };
}

function* run(input) {
  const a = input.a, b = input.b;
  const m = a.length, n = b.length;
  const c = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  if (m === 0 || n === 0) {
    yield tableFrame(c, m, n, m, null, 'An empty string has LCS length 0 with anything.', 0);
    return { length: 0, subsequence: '' };
  }
  yield tableFrame(c, m, n, 0, null, `Row 0 and column 0 are all 0 (an empty prefix shares nothing).`, 0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        c[i][j] = c[i - 1][j - 1] + 1;
        yield tableFrame(c, m, n, i, [i, j], `a[${i - 1}]='${a[i - 1]}' matches b[${j - 1}]='${b[j - 1]}': extend the diagonal, c[${i}][${j}] = ${c[i][j]}.`, 2);
      } else {
        c[i][j] = Math.max(c[i - 1][j], c[i][j - 1]);
        yield tableFrame(c, m, n, i, [i, j], `a[${i - 1}]='${a[i - 1]}' != b[${j - 1}]='${b[j - 1]}': c[${i}][${j}] = max(c[${i - 1}][${j}]=${c[i - 1][j]}, c[${i}][${j - 1}]=${c[i][j - 1]}) = ${c[i][j]}.`, 3);
      }
    }
  }
  yield tableFrame(c, m, n, m, [m, n], `Done: LCS length is c[${m}][${n}] = ${c[m][n]}.`, 4);

  let i = m, j = n, sub = '';
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { sub = a[i - 1] + sub; i--; j--; }
    else if (c[i - 1][j] >= c[i][j - 1]) i--;
    else j--;
  }
  return { length: c[m][n], subsequence: sub };
}

// Brute-force check: verify the returned subsequence is a genuine common
// subsequence of both strings, then verify its length is actually maximal
// by enumerating every subsequence of the shorter string (feasible for the
// small sizes this topic allows) and confirming none of them is both
// longer and a subsequence of the other string.
function isSubsequence(sub, s) {
  let k = 0;
  for (const ch of s) { if (k < sub.length && sub[k] === ch) k++; }
  return k === sub.length;
}

function bruteMaxLength(a, b) {
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  const n = short.length;
  let best = 0;
  for (let mask = 1; mask < (1 << n); mask++) {
    let s = '';
    for (let k = 0; k < n; k++) if (mask & (1 << k)) s += short[k];
    if (s.length > best && isSubsequence(s, long)) best = s.length;
  }
  return best;
}

export default {
  id: 'lcs',
  title: 'Longest common subsequence',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'A subsequence of a string keeps characters in order but can skip any of them (unlike a substring, which must be contiguous); the longest common subsequence (LCS) of two strings is the longest sequence that is a subsequence of both. ' +
    'The DP looks at the last character of each prefix: if a\'s last character equals b\'s last character, it must be part of some LCS (a classic exchange-style argument), so the answer extends the LCS of both strings with their last character dropped, c[i-1][j-1] + 1. ' +
    'If they differ, at least one of the two last characters cannot be in this particular LCS, so the answer is the better of dropping a\'s last character or dropping b\'s, c[i-1][j] or c[i][j-1]. ' +
    'Filling the (m+1) x (n+1) table this way, row by row, gives every prefix pair\'s LCS length; walking back from the bottom-right corner along whichever rule produced each cell reconstructs an actual longest common subsequence, not just its length. ' +
    'This same table shape (diagonal match, or best of up/left) reappears, with small variations, in edit distance right after it in this module.',
  code: CODE,
  complexity: {
    time: 'O(m * n), the size of the table.',
    why: 'The table has (m+1) * (n+1) cells, each filled with O(1) work (one character comparison and at most a two-way max). Reconstructing the subsequence afterward walks from one corner to the other, at most m + n steps.',
  },
  makeInput(rng, size) {
    const len = Math.max(0, Math.min(15, size));
    const alphabet = 'abc';
    const mk = (l) => Array.from({ length: l }, () => alphabet[Math.floor(rng() * alphabet.length)]).join('');
    return { a: mk(len), b: mk(Math.max(0, len - 1 + Math.floor(rng() * 3))) };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b } = input;
    if (result.subsequence.length !== result.length) return false;
    if (!isSubsequence(result.subsequence, a) || !isSubsequence(result.subsequence, b)) return false;
    return result.length === bruteMaxLength(a, b);
  },
  sandbox: { type: 'string', field: 'a', min: 0, max: 15, default: 8, label: 'length', alphabet: ['a', 'b', 'c'] },
};
