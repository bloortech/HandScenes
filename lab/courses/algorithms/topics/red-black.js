// Red-black trees: insert, with CLRS's recolouring and rotation fixup. No
// DOM access. Logic lives in engine/rbtree.js; this file turns its event
// log into frames. Node colour is shown persistently (amber = red, plain
// ink = black) via each node's own `active` flag, rather than `active`
// meaning "the current step" the way other tree topics use it; a second,
// separate pulse (`compare`) marks whichever nodes a fixup step just
// touched, so colour and "what's happening now" don't fight for the same
// visual slot.
import { rbInsert, inorder, isValidBST, isValidRB, resetIds } from '../engine/rbtree.js';
import { layoutBST } from '../engine/layout.js';

const CODE = [
  'insert(value):',
  '  insert like a plain BST; colour the new node red',
  '  while the new node\'s parent is red:',
  '    uncle red:   recolour parent/uncle black, grandparent red; move up',
  '    uncle black: one or two rotations, then recolour',
  '  colour the root black',
];

function treeFrame(root, { touchedIds = [], caption, line }) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    if (!node) return;
    nodes.push({
      id: node.id,
      label: String(node.value),
      x: node.x,
      y: node.y,
      active: node.color === 'R',
      compare: touchedIds.includes(node.id),
    });
    if (node.left) { edges.push([node.id, node.left.id]); walk(node.left); }
    if (node.right) { edges.push([node.id, node.right.id]); walk(node.right); }
  })(root);
  return { kind: 'tree', line, code: CODE, caption, nodes, edges, emptyText: '(empty tree)' };
}

function layout(root) {
  // layoutBST reads/writes x/y on left/right nodes; rbtree's nodes also
  // carry a parent pointer, which layoutBST never looks at.
  layoutBST(root);
}

function* run(input) {
  resetIds();
  let root = null;
  for (const v of input.array) {
    const log = [];
    const { root: newRoot } = rbInsert(root, v, log);
    root = newRoot;
    layout(root);
    if (log.length === 1) {
      // Just the plain insert, no fixup needed (e.g. the very first node).
      yield treeFrame(root, { touchedIds: [log[0].nodeId], caption: `Insert ${v} as a red leaf. No fixup needed.`, line: 1 });
      continue;
    }
    for (const ev of log) {
      if (ev.type === 'insert') {
        yield treeFrame(root, { touchedIds: [ev.nodeId], caption: `Insert ${v} as a red leaf.`, line: 1 });
      } else if (ev.type === 'recolor') {
        yield treeFrame(root, { touchedIds: ev.nodeIds, caption: `Its parent is red too: recolour to fix the violation.`, line: 3, });
      } else {
        yield treeFrame(root, { touchedIds: [ev.nodeId], caption: `Rotate ${ev.kind} to restore the tree's shape.`, line: 4 });
      }
    }
  }

  return {
    values: inorder(root),
    valid: isValidBST(root) && isValidRB(root),
  };
}

export default {
  id: 'red-black',
  title: 'Red-black trees',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Red-Black Trees',
  summary:
    'A red-black tree is a binary search tree where every node is coloured red or black, following four rules: the root is black, no red node has a red child, and every path from a node down to an empty spot passes through the same number of black nodes. ' +
    'Those rules together force the tree\'s height to stay O(log n), which is a looser guarantee than an AVL tree\'s but cheaper to maintain. ' +
    'Inserting always colours the new node red (a new leaf keeps the black-count rule intact), which can only break the "no red node has a red child" rule at its parent. ' +
    'The fixup loop climbs upward fixing that one violation at a time: if the new red node\'s uncle is also red, it recolours three nodes and moves the problem up to the grandparent; if the uncle is black, one or two rotations plus a recolour fix it for good. ' +
    'CLRS proves the black-height rule bounds the tree\'s height at 2*log2(n+1), which is why every operation stays logarithmic.',
  code: CODE,
  complexity: {
    time: 'O(log n) for search, insert, and delete, worst case.',
    why: 'Every root-to-leaf path has the same number of black nodes (the black-height), and no two reds are ever adjacent, so a path can have at most twice as many nodes as its black-height. CLRS shows this bounds the tree\'s height by 2*log2(n+1), so a walk from the root, or the fixup loop\'s climb back up, both take O(log n) steps.',
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
    return { array };
  },
  run,
  check(input, result) {
    if (!result || !result.valid) return false;
    const expected = Array.from(new Set(input.array)).sort((a, b) => a - b);
    return result.values.join(',') === expected.join(',');
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
