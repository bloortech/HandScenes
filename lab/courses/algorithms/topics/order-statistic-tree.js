// Order-statistic trees: a BST augmented with each node's subtree size,
// supporting rank(value) and select(i) in O(h). No DOM access. CLRS
// augments a red-black tree for a guaranteed O(log n); this demo augments a
// plain BST instead (same augmentation idea, simpler to show), since the
// teaching point here is the augmentation technique itself: keep an extra
// field consistent under every update, then use it to answer a query a
// plain BST can't answer efficiently on its own.
const CODE_SELECT = [
  'select(x, i):              # i-th smallest in x\'s subtree, 1-indexed',
  '  r = size(x.left) + 1     # x\'s own rank within its subtree',
  '  if i == r: return x',
  '  if i < r: return select(x.left, i)',
  '  return select(x.right, i - r)',
];
const CODE_RANK = [
  'rank(root, value):',
  '  rank = 0; node = root',
  '  while node:',
  '    if value == node.value: return rank + size(node.left) + 1',
  '    if value < node.value: node = node.left',
  '    else: rank += size(node.left) + 1; node = node.right',
  '  return not found',
];
const CODE_INSERT = [
  'insert(root, value):',
  '  walk down like a plain BST, incrementing size(node) at every',
  '  node passed through, then place the new node (size 1)',
];

let nextId = 1;
function makeNode(value) {
  return { id: nextId++, value, left: null, right: null, size: 1 };
}
function size(node) {
  return node ? node.size : 0;
}

function osInsert(root, value, path) {
  if (!root) return makeNode(value);
  // Check first, without touching any sizes: a duplicate causes no
  // structural change at all, so speculatively incrementing ancestors'
  // sizes while walking down (then trying to "undo" it at the matching
  // node) would wrongly leave every ancestor above the match inflated.
  let probe = root;
  while (probe) {
    if (value === probe.value) return root; // no duplicates
    probe = value < probe.value ? probe.left : probe.right;
  }
  let node = root;
  while (true) {
    path.push(node.id);
    node.size++;
    if (value < node.value) {
      if (!node.left) { node.left = makeNode(value); return root; }
      node = node.left;
    } else {
      if (!node.right) { node.right = makeNode(value); return root; }
      node = node.right;
    }
  }
}

function osSelect(root, i, path) {
  let node = root;
  let k = i;
  while (node) {
    path.push(node.id);
    const r = size(node.left) + 1;
    if (k === r) return node;
    if (k < r) node = node.left;
    else { k -= r; node = node.right; }
  }
  return null;
}

function osRank(root, value, path) {
  let rank = 0;
  let node = root;
  while (node) {
    path.push(node.id);
    if (value === node.value) return rank + size(node.left) + 1;
    if (value < node.value) node = node.left;
    else { rank += size(node.left) + 1; node = node.right; }
  }
  return -1;
}

function layout(root, { width = 100, height = 100, padX = 8, padY = 10 } = {}) {
  if (!root) return;
  let leafIndex = 0, maxDepth = 0;
  function assign(node, depth) {
    maxDepth = Math.max(maxDepth, depth);
    node._depth = depth;
    if (!node.left && !node.right) { node._x = leafIndex++; return; }
    let sum = 0, count = 0;
    if (node.left) { assign(node.left, depth + 1); sum += node.left._x; count++; }
    if (node.right) { assign(node.right, depth + 1); sum += node.right._x; count++; }
    node._x = sum / count;
  }
  assign(root, 0);
  function place(node) {
    node.x = leafIndex <= 1 ? width / 2 : padX + (node._x / (leafIndex - 1)) * (width - 2 * padX);
    node.y = maxDepth === 0 ? height / 2 : padY + (node._depth / maxDepth) * (height - 2 * padY);
    if (node.left) place(node.left);
    if (node.right) place(node.right);
  }
  place(root);
}

function treeFrame(root, { pathIds = [], foundId = null, caption, line, code }) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    if (!node) return;
    nodes.push({
      id: node.id,
      label: `${node.value} (${node.size})`,
      x: node.x,
      y: node.y,
      compare: pathIds.includes(node.id) && node.id !== foundId,
      active: node.id === foundId,
    });
    if (node.left) { edges.push([node.id, node.left.id]); walk(node.left); }
    if (node.right) { edges.push([node.id, node.right.id]); walk(node.right); }
  })(root);
  return { kind: 'tree', line, code, caption, nodes, edges, emptyText: '(empty tree)' };
}

function* run(input) {
  nextId = 1;
  let root = null;
  for (const v of input.array) {
    const path = [];
    root = osInsert(root, v, path);
    layout(root);
    yield treeFrame(root, { pathIds: path, caption: `Insert ${v}. Every node passed through gets its size incremented (label shows value (subtree size)).`, line: 1, code: CODE_INSERT });
  }
  if (input.array.length === 0) {
    yield treeFrame(null, { caption: 'Starting from an empty tree.', line: 0, code: CODE_INSERT });
  }

  const n = size(root);
  const k = Math.min(Math.max(1, input.selectIndex), Math.max(1, n));
  let selected = null;
  if (root) {
    const path = [];
    selected = osSelect(root, k, path);
    layout(root);
    yield treeFrame(root, { pathIds: path, foundId: selected ? selected.id : null, caption: `select(root, ${k}): find the ${k}-th smallest value by comparing i to size(left)+1 at each node.`, line: 2, code: CODE_SELECT });
  }

  const path2 = [];
  const rank = osRank(root, input.rankValue, path2);
  layout(root);
  yield treeFrame(root, { pathIds: path2, foundId: rank >= 0 ? path2[path2.length - 1] : null, caption: rank >= 0 ? `rank(root, ${input.rankValue}) = ${rank}.` : `${input.rankValue} is not in the tree, so it has no rank.`, line: 3, code: CODE_RANK });

  return { values: (function inorder(node, out = []) { if (!node) return out; inorder(node.left, out); out.push(node.value); inorder(node.right, out); return out; })(root), selected: selected ? selected.value : null, rank };
}

export default {
  id: 'order-statistic-tree',
  title: 'Order-statistic trees',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Augmenting Data Structures',
  summary:
    'An order-statistic tree is a plain binary search tree with one extra field per node: the size of its subtree (its own node plus both children\'s subtrees). ' +
    'That single field is enough to answer two questions a plain BST can\'t: select(i), the i-th smallest value overall, and rank(value), how many values are less than or equal to a given one. ' +
    'Select walks down comparing i to size(left)+1, the current node\'s own rank within its subtree: too small, go left; too big, subtract and go right; just right, that\'s the answer. ' +
    'Rank does the mirror image, adding up left-subtree sizes every time it steps right. ' +
    'The general technique, called augmentation, is to pick a field that can be updated in O(1) alongside the structure\'s existing operations (here, incrementing size at every node an insert passes through) and prove it stays consistent; CLRS\'s own order-statistic tree augments a red-black tree, so this guarantees O(log n), where this demo\'s plain-BST version only guarantees O(h).',
  code: CODE_SELECT,
  complexity: {
    time: 'O(h) for select and rank, where h is the tree\'s height (O(log n) if kept balanced, as CLRS does with a red-black tree).',
    why: 'Both select and rank do one comparison per node and move to exactly one child, the same shape as plain BST search, so the work is proportional to the height of the tree. The size field itself costs nothing extra per query: it is already stored, updated in O(1) per node during insert.',
  },
  makeInput(rng, size) {
    const array = [];
    const seen = new Set();
    for (let i = 0; i < size; i++) {
      let v;
      do { v = 1 + Math.floor(rng() * 199); } while (seen.has(v));
      seen.add(v);
      array.push(v);
    }
    const selectIndex = 1 + Math.floor(rng() * Math.max(1, array.length));
    const rankPickExisting = array.length > 0 && rng() < 0.6;
    const rankValue = rankPickExisting ? array[Math.floor(rng() * array.length)] : 1 + Math.floor(rng() * 199);
    return { array, selectIndex, rankValue };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const unique = Array.from(new Set(input.array)).sort((a, b) => a - b);
    if (result.values.join(',') !== unique.join(',')) return false;
    const n = unique.length;
    const k = Math.min(Math.max(1, input.selectIndex), Math.max(1, n));
    if (n > 0 && result.selected !== unique[k - 1]) return false;
    const expectedRank = unique.includes(input.rankValue) ? unique.indexOf(input.rankValue) + 1 : -1;
    return result.rank === expectedRank;
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
