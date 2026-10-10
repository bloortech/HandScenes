// Optimal binary search tree: given n keys in sorted order with search
// frequencies, build the BST that minimises expected search cost (sum of
// frequency * depth, root at depth 1). Same table shape as matrix chain:
// e[i][j] = minimum cost of a tree holding keys i..j; try every root choice
// r in i..j, paying the subtree costs plus one extra frequency-weighted
// unit per key in the range for the extra depth of being under this root.
// No DOM access.
import { layoutBST } from '../engine/layout.js';

const CODE = [
  'e[i][i-1] = 0 for all i   (an empty subtree costs nothing)',
  'w[i][j] = sum of freq[i..j]',
  'for len in 1..n:',
  '  for i in 1..n-len+1: j = i + len - 1',
  '    e[i][j] = min over r in i..j of (e[i][r-1] + e[r+1][j]) + w[i][j]',
  'return e[1][n]',
];

function bruteBest(freqs) {
  // Every possible BST shape over the n sorted keys, via the same
  // recursive-partition idea matrix-chain uses (no memo), independent of
  // the DP table: cost(i, j) with root r in [i, j], base cost(i, i-1) = 0.
  const n = freqs.length;
  const w = [0];
  for (const f of freqs) w.push(w[w.length - 1] + f);
  const sum = (i, j) => w[j] - w[i - 1]; // 1-indexed inclusive sum of freq[i..j]
  function cost(i, j) {
    if (i > j) return 0;
    let best = Infinity;
    for (let r = i; r <= j; r++) best = Math.min(best, cost(i, r - 1) + cost(r + 1, j));
    return best + sum(i, j);
  }
  return cost(1, n);
}

function tableFrame(e, n, activeCell, caption, line) {
  const cellSize = Math.min(90 / Math.max(1, n), 12);
  const nodes = [];
  for (let i = 1; i <= n; i++) {
    for (let j = i - 1; j <= n; j++) {
      if (j < i - 1) continue;
      const v = e[i] && e[i][j] !== undefined ? e[i][j] : 0;
      nodes.push({
        id: `${i}_${j}`, label: v === Infinity ? '' : String(v),
        x: 6 + (j - 1 + 0.5) * cellSize, y: 6 + (i - 1 + 0.5) * cellSize,
        w: cellSize * 0.9, h: cellSize * 0.9,
        active: activeCell && activeCell[0] === i && activeCell[1] === j,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no keys)' };
}

function buildTree(root, i, j) {
  if (i > j) return null;
  const r = root[i][j];
  return { id: `${i}_${j}_${r}`, label: `k${r}`, left: buildTree(root, i, r - 1), right: buildTree(root, r + 1, j) };
}

function* run(input) {
  const freqs = input.array;
  const n = freqs.length;
  if (n === 0) {
    yield tableFrame([], 0, null, 'No keys.', 0);
    return { cost: 0 };
  }
  const w = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= n + 1; i++) w[i][i - 1] = 0;
  for (let i = 1; i <= n; i++) for (let j = i; j <= n; j++) w[i][j] = w[i][j - 1] + freqs[j - 1];

  const e = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));
  const root = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= n + 1; i++) e[i][i - 1] = 0;
  yield tableFrame(e, n, null, `${n} keys. An empty subtree (e[i][i-1]) costs 0.`, 0);

  for (let len = 1; len <= n; len++) {
    for (let i = 1; i <= n - len + 1; i++) {
      const j = i + len - 1;
      let best = Infinity, bestR = i;
      for (let r = i; r <= j; r++) {
        const cost = e[i][r - 1] + e[r + 1][j] + (w[i][j] - w[i][i - 1]);
        if (cost < best) { best = cost; bestR = r; }
      }
      e[i][j] = best;
      root[i][j] = bestR;
      yield tableFrame(e, n, [i, j], `e[${i}][${j}]: best root is key ${bestR}, cost ${best} (range length ${len}).`, 4);
    }
  }

  const treeRoot = buildTree(root, 1, n);
  layoutBST(treeRoot);
  const nodes = [];
  const edges = [];
  (function collect(nd) {
    if (!nd) return;
    nodes.push({ id: nd.id, label: nd.label, x: nd.x, y: nd.y, active: true });
    if (nd.left) { edges.push([nd.id, nd.left.id]); collect(nd.left); }
    if (nd.right) { edges.push([nd.id, nd.right.id]); collect(nd.right); }
  })(treeRoot);
  yield { kind: 'tree', line: 5, code: CODE, caption: `Done: e[1][${n}] = ${e[1][n]}. The optimal tree, built from the stored root choices.`, nodes, edges };

  return { cost: e[1][n] };
}

export default {
  id: 'optimal-bst',
  title: 'Optimal binary search trees',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'Given n keys already sorted, each with a search frequency, an optimal binary search tree arranges them to minimise expected search cost: the sum, over every key, of its frequency times its depth in the tree (root at depth 1), since that is how many comparisons a search for that key takes. ' +
    'A balanced tree is not always best: a key searched for constantly should sit near the root even if that unbalances the tree, and a rarely-searched key can afford to sit deep. ' +
    'e[i][j] is the minimum cost of a tree holding exactly the sorted keys i through j; choosing which of those keys, r, becomes the root splits the rest into a left subtree (keys i..r-1) and a right subtree (keys r+1..j), and every key in this range sits one level deeper than it would have at the top, which is exactly where the w[i][j] frequency-sum term in the recurrence comes from. ' +
    'Trying every possible root r and keeping the cheapest, for every range, fills the same triangular table shape matrix chain multiplication uses just before this topic, and for the same structural reason: a range\'s best split needs every smaller range\'s answer first. ' +
    'Remembering which root won at each (i, j) lets the actual tree be rebuilt afterward, shown here once the table is filled.',
  code: CODE,
  complexity: {
    time: 'O(n^3).',
    why: 'There are O(n^2) ranges (i, j), and filling each tries every possible root r in that range, O(n) work. O(n^2) ranges times O(n) work each gives O(n^3), the same shape as matrix chain multiplication.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const array = Array.from({ length: n }, () => 1 + Math.floor(rng() * 20));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (input.array.length === 0) return result.cost === 0;
    return result.cost === bruteBest(input.array);
  },
  sandbox: { type: 'array', min: 0, max: 10, default: 6 },
};
