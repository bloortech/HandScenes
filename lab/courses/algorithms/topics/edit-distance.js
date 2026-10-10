// Edit distance (Levenshtein distance): the minimum number of single-
// character insertions, deletions, and substitutions to turn string a into
// string b. d[i][j] = edit distance between a[0..i-1] and b[0..j-1];
// matching last characters costs nothing extra, otherwise the best of
// insert/delete/substitute is one plus the cheapest smaller subproblem.
// No DOM access.
const CODE = [
  'd[i][0] = i, d[0][j] = j   (delete everything / insert everything)',
  'for i in 1..m: for j in 1..n:',
  '  if a[i-1] == b[j-1]: d[i][j] = d[i-1][j-1]',
  '  else: d[i][j] = 1 + min(d[i-1][j], d[i][j-1], d[i-1][j-1])   # delete, insert, substitute',
  'return d[m][n]',
];

function tableFrame(d, m, n, i, activeCell, caption, line) {
  const cellW = Math.min(90 / (n + 1), 10);
  const cellH = Math.min(80 / (m + 1), 10);
  const nodes = [];
  for (let r = 0; r <= i; r++) {
    for (let col = 0; col <= n; col++) {
      nodes.push({
        id: `${r}_${col}`, label: String(d[r][col]),
        x: 6 + (col + 0.5) * cellW, y: 6 + (r + 0.5) * cellH,
        w: cellW * 0.9, h: cellH * 0.9,
        active: activeCell && activeCell[0] === r && activeCell[1] === col,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(empty string)' };
}

// Independent reimplementation: top-down memoized recursion rather than
// the bottom-up table run() fills, so the check doesn't just replay the
// same loop structure.
function memoEditDistance(a, b) {
  const memo = new Map();
  function go(i, j) {
    if (i === 0) return j;
    if (j === 0) return i;
    const key = `${i}_${j}`;
    if (memo.has(key)) return memo.get(key);
    let v;
    if (a[i - 1] === b[j - 1]) v = go(i - 1, j - 1);
    else v = 1 + Math.min(go(i - 1, j), go(i, j - 1), go(i - 1, j - 1));
    memo.set(key, v);
    return v;
  }
  return go(a.length, b.length);
}

function* run(input) {
  const a = input.a, b = input.b;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  yield tableFrame(d, m, n, m === 0 ? 0 : 0, null, 'Base cases: turning a prefix into the empty string (or vice versa) costs one op per character.', 0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
        yield tableFrame(d, m, n, i, [i, j], `a[${i - 1}]='${a[i - 1]}' matches b[${j - 1}]='${b[j - 1]}': no extra cost, d[${i}][${j}] = d[${i - 1}][${j - 1}] = ${d[i][j]}.`, 2);
      } else {
        d[i][j] = 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
        yield tableFrame(d, m, n, i, [i, j], `a[${i - 1}]='${a[i - 1]}' != b[${j - 1}]='${b[j - 1]}': d[${i}][${j}] = 1 + min(delete=${d[i - 1][j]}, insert=${d[i][j - 1]}, substitute=${d[i - 1][j - 1]}) = ${d[i][j]}.`, 3);
      }
    }
  }
  yield tableFrame(d, m, n, m, [m, n], `Done: edit distance is d[${m}][${n}] = ${d[m][n]}.`, 4);

  // Reconstruct the full edit script by walking back from (m, n), one token
  // per step ('copy'/'substitute' emit a character and consume one from
  // each string; 'delete' consumes only from a; 'insert' emits a character
  // and consumes only from b), then reverse to forward order. Replaying the
  // script in order (see applyScript) rebuilds b from a directly, so it's a
  // genuine end-to-end check of the reconstruction, not just the count.
  const script = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { script.push({ type: 'copy', ch: a[i - 1] }); i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { script.push({ type: 'substitute', ch: b[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { script.push({ type: 'delete' }); i--; }
    else { script.push({ type: 'insert', ch: b[j - 1] }); j--; }
  }
  script.reverse();
  const editCount = script.filter((s) => s.type !== 'copy').length;
  return { distance: d[m][n], script, editCount };
}

// Replays the script left to right: 'copy' and 'substitute' emit a
// character and consume one position from each of a and b; 'insert' emits
// a character and consumes only from b; 'delete' emits nothing and
// consumes only from a. If a's consumed characters (in order, skipping
// deletes) don't match what was actually in a, or the emitted output
// doesn't equal b, the script is invalid.
function applyScript(a, b, script) {
  let ai = 0, bi = 0, out = '';
  for (const op of script) {
    if (op.type === 'copy') {
      if (a[ai] !== op.ch || b[bi] !== op.ch) return false;
      out += op.ch; ai++; bi++;
    } else if (op.type === 'substitute') {
      if (ai >= a.length || bi >= b.length || b[bi] !== op.ch) return false;
      out += op.ch; ai++; bi++;
    } else if (op.type === 'delete') {
      if (ai >= a.length) return false;
      ai++;
    } else if (op.type === 'insert') {
      if (bi >= b.length || b[bi] !== op.ch) return false;
      out += op.ch; bi++;
    } else {
      return false;
    }
  }
  return ai === a.length && bi === b.length && out === b;
}

export default {
  id: 'edit-distance',
  title: 'Edit distance',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'Edit distance (Levenshtein distance) is the minimum number of single-character insertions, deletions, and substitutions to turn one string into another, the measure spell-checkers and diff tools use under the hood. ' +
    'The DP compares prefixes: d[i][j] is the edit distance between a\'s first i characters and b\'s first j characters. ' +
    'If the last characters already match, that pair is free, so d[i][j] = d[i-1][j-1]. ' +
    'If they don\'t, the last edit has to be a delete (match a[0..i-2] to b[0..j-1], then drop a[i-1]), an insert (match a[0..i-1] to b[0..j-2], then add b[j-1]), or a substitute (match a[0..i-2] to b[0..j-2], then swap one character); taking the cheapest of those three, plus one for the edit itself, gives d[i][j]. ' +
    'Base cases d[i][0] = i and d[0][j] = j handle turning a prefix into (or out of) the empty string by deleting (or inserting) every character. ' +
    'This is the same table shape as longest common subsequence a topic earlier in this module, with a slightly different recurrence (a cost to pay on a mismatch, rather than two choices to pick the better of).',
  code: CODE,
  complexity: {
    time: 'O(m * n), the size of the table.',
    why: 'The table has (m+1) * (n+1) cells, each needing O(1) work: one character comparison and a three-way minimum. Reconstructing a sequence of edits afterward walks from one corner to the other, at most m + n steps.',
  },
  makeInput(rng, size) {
    const len = Math.max(0, Math.min(12, size));
    const alphabet = 'abc';
    const mk = (l) => Array.from({ length: l }, () => alphabet[Math.floor(rng() * alphabet.length)]).join('');
    return { a: mk(len), b: mk(Math.max(0, len - 1 + Math.floor(rng() * 3))) };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b } = input;
    if (result.distance !== memoEditDistance(a, b)) return false;
    if (result.editCount !== result.distance) return false;
    return applyScript(a, b, result.script);
  },
  sandbox: { type: 'string', field: 'a', min: 0, max: 12, default: 7, label: 'length', alphabet: ['a', 'b', 'c'] },
};
