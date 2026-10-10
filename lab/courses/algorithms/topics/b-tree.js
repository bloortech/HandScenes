// B-trees: insert with proactive splits, delete with merges/borrows.
// No DOM access. Logic lives in engine/btree.js; this file turns its event
// log into frames, drawing each node as a single box holding all its keys
// (reusing the boxes renderer, one row per tree level) since a B-tree
// node isn't a 2-children shape the plain tree renderer expects.
import { createTree, insert, remove, inorder, isValidBTree, resetIds } from '../engine/btree.js';

const CODE_INSERT = [
  'insert(key):',
  '  if root is full: split it first (tree grows by one level)',
  '  walk down, splitting any full child before descending into it',
  '  place key in the leaf it belongs in',
];
const CODE_DELETE = [
  'delete(key):',
  '  if key is in an internal node: replace it with its predecessor',
  '    or successor, then delete that from the leaf it came from',
  '  on the way down, ensure every child has more than the minimum keys',
  '    (borrow from a sibling, or merge with one, before descending)',
];

function collectLevels(root) {
  const levels = [];
  (function walk(node, depth) {
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(node);
    for (const c of node.children || []) walk(c, depth + 1);
  })(root, 0);
  return levels;
}

function treeFrame(root, { touchedIds = [], caption, line, code }) {
  const levels = collectLevels(root);
  const nodes = [];
  const edges = [];
  const depthCount = Math.max(1, levels.length - 1);
  levels.forEach((level, depth) => {
    const y = 10 + (depth / depthCount) * 80;
    level.forEach((node, i) => {
      const x = ((i + 0.5) / level.length) * 100;
      nodes.push({
        id: node.id,
        label: node.keys.join(','),
        x, y, w: Math.max(10, node.keys.length * 8 + 6), h: 10,
        active: touchedIds.includes(node.id),
      });
      for (const c of node.children || []) edges.push([node.id, c.id]);
    });
  });
  return { kind: 'boxes', line, code, caption, nodes, edges, emptyText: '(empty tree)' };
}

function* run(input) {
  resetIds();
  const t = input.t;
  const tree = createTree(t);
  if (input.array.length === 0) {
    yield treeFrame(tree.root, { caption: `An empty B-tree, minimum degree t = ${t}.`, line: 0, code: CODE_INSERT });
  }
  for (const v of input.array) {
    const log = [];
    insert(tree, v, log);
    const splitIds = log.filter((e) => e.type === 'split').map((e) => e.parentId);
    yield treeFrame(tree.root, {
      touchedIds: splitIds.length ? splitIds : [tree.root.id],
      caption: splitIds.length
        ? `Insert ${v}: a full node split on the way down, pushing its median key up.`
        : `Insert ${v} into its leaf. No split needed.`,
      line: splitIds.length ? 1 : 3,
      code: CODE_INSERT,
    });
  }

  const deletes = input.array.filter((_, i) => i % 3 === 1);
  for (const v of deletes) {
    const log = [];
    remove(tree, v, log);
    const mergeIds = log.filter((e) => e.type === 'merge').map((e) => e.intoId);
    yield treeFrame(tree.root, {
      touchedIds: mergeIds,
      caption: mergeIds.length
        ? `Delete ${v}: a node and sibling merged (both at the minimum) to keep every node full enough.`
        : `Delete ${v}, borrowing from a sibling or replacing with a predecessor/successor as needed.`,
      line: 3,
      code: CODE_DELETE,
    });
  }

  return { values: inorder(tree.root), valid: isValidBTree(tree), deletedCount: deletes.length };
}

export default {
  id: 'b-tree',
  title: 'B-trees',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'B-Trees',
  summary:
    'A B-tree is a balanced search tree where every node holds many keys at once (between t-1 and 2t-1, for a chosen minimum degree t) instead of just one, which keeps the tree extremely shallow, the point when nodes live on disk and every level costs a seek. ' +
    'Inserting walks down from the root looking for the right leaf, but proactively splits any full node it passes through first, so a split on the way down never has to be undone or redone: the tree only ever grows upward, by splitting a full root. ' +
    'Deleting is the mirror image: if the key to remove sits in an internal node, swap it with its predecessor or successor (always found in a leaf), then delete from there; on the way down, any child with only the bare minimum of keys gets topped up first, either by borrowing a key from a sibling that has one to spare, or by merging with a sibling if neither does. ' +
    'Because both operations fix underfull or overfull nodes before descending into them, a single root-to-leaf pass is always enough, which is exactly why every operation costs O(log n) disk accesses. ' +
    'This sandbox builds a t=2 B-tree (every node has 1 to 3 keys, a 2-3-4 tree) from the array, inserting every value, then deleting every third one to show both splits and merges.',
  code: CODE_INSERT,
  complexity: {
    time: 'O(log n) for search, insert, and delete.',
    why: 'A B-tree of minimum degree t and n keys has height O(log_t n), since every internal node (except the root) has at least t children, so the number of nodes grows by at least a factor of t with each level down. Search, insert and delete all do O(t) work per node (scanning its keys) times O(log_t n) levels, which for a fixed t is O(log n).',
  },
  makeInput(rng, size) {
    const array = [];
    const seen = new Set();
    for (let i = 0; i < size; i++) {
      let v;
      do { v = 1 + Math.floor(rng() * 499); } while (seen.has(v));
      seen.add(v);
      array.push(v);
    }
    return { array, t: 2 };
  },
  run,
  check(input, result) {
    if (!result || !result.valid) return false;
    const inserted = Array.from(new Set(input.array));
    const deleted = new Set(input.array.filter((_, i) => i % 3 === 1));
    const expected = inserted.filter((v) => !deleted.has(v)).sort((a, b) => a - b);
    return JSON.stringify(result.values) === JSON.stringify(expected);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 12 },
};
