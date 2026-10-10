// AVL trees: inserts and deletes that rebalance with the four classic
// rotations (LL, RR, LR, RL). No DOM access. Logic lives in
// engine/avltree.js (shared pattern with bst.js/engine/bintree.js); this
// file just turns its rotation log into frames.
import { avlInsert, avlDelete, inorder, isValidBST, isBalanced, resetIds } from '../engine/avltree.js';
import { layoutBST } from '../engine/layout.js';

const CODE_INSERT = [
  'insert(node, value):',
  '  walk down and insert like a plain BST',
  '  walking back up, update each ancestor\'s height',
  '  if an ancestor\'s balance factor is now +-2, rotate:',
  '    left-left or right-right: one rotation',
  '    left-right or right-left: two rotations',
];
const CODE_DELETE = [
  'delete(node, value):',
  '  remove like a plain BST (leaf / one-child / two-children)',
  '  walking back up from the removal point, update heights',
  '  rebalance every ancestor whose balance factor is now +-2',
];

function treeFrame(root, { activeIds = [], caption, line, code }) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    if (!node) return;
    nodes.push({ id: node.id, label: String(node.value), x: node.x, y: node.y, active: activeIds.includes(node.id) });
    if (node.left) { edges.push([node.id, node.left.id]); walk(node.left); }
    if (node.right) { edges.push([node.id, node.right.id]); walk(node.right); }
  })(root);
  return { kind: 'tree', line, code, caption, nodes, edges, emptyText: '(empty tree)' };
}

const ROTATE_TEXT = {
  LL: 'a left-left imbalance: one right rotation',
  RR: 'a right-right imbalance: one left rotation',
  LR: 'a left-right imbalance: a left rotation then a right rotation',
  RL: 'a right-left imbalance: a right rotation then a left rotation',
};

function* run(input) {
  resetIds();
  let root = null;
  for (const v of input.array) {
    const log = [];
    const before = root;
    root = avlInsert(root, v, log);
    layoutBST(root);
    if (log.length === 0) {
      yield treeFrame(root, { caption: `Insert ${v}. Still balanced, no rotation needed.`, line: 1, code: CODE_INSERT });
    } else {
      for (const ev of log) {
        yield treeFrame(root, { activeIds: [ev.nodeId], caption: `Insert ${v} unbalanced the tree at one node: fix it with ${ROTATE_TEXT[ev.kind]}.`, line: 3, code: CODE_INSERT });
      }
    }
    void before;
  }
  // Snapshot the inserted-values list and validity now, before delete
  // mutates the same node objects in place (avlInsert/avlDelete rotate by
  // mutating left/right pointers on the existing nodes, not by copying the
  // tree, so a bare reference to `root` taken here would silently reflect
  // post-delete state too).
  const insertedValues = inorder(root);
  const insertedValid = isValidBST(root) && isBalanced(root);

  const log = [];
  const { root: afterDelete, caseHit } = avlDelete(root, input.deleteValue, log);
  root = afterDelete;
  layoutBST(root);
  const caseText = {
    'not-found': `${input.deleteValue} was not in the tree. Nothing to delete.`,
    leaf: `${input.deleteValue} had no children: removed directly (leaf case).`,
    'one-child': `${input.deleteValue} had one child: that child took its place (one-child case).`,
    'two-children': `${input.deleteValue} had two children: replaced by its in-order successor (two-children case).`,
  }[caseHit];
  if (log.length === 0) {
    yield treeFrame(root, { caption: caseText, line: 1, code: CODE_DELETE });
  } else {
    for (const ev of log) {
      yield treeFrame(root, { activeIds: [ev.nodeId], caption: `${caseText} That unbalanced an ancestor: fix it with ${ROTATE_TEXT[ev.kind]}.`, line: 3, code: CODE_DELETE });
    }
  }

  return {
    insertedValues,
    insertedValid,
    caseHit,
    finalValues: inorder(root),
    finalValid: isValidBST(root) && isBalanced(root),
  };
}

export default {
  id: 'avl',
  title: 'AVL trees',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Red-Black Trees',
  summary:
    'An AVL tree is a binary search tree that keeps itself balanced automatically: at every node, the heights of its left and right subtrees can differ by at most 1. ' +
    'Insert and delete start out exactly like a plain BST, but then walk back up from where the tree changed, checking each ancestor\'s balance factor. ' +
    'If a node\'s subtrees now differ by 2, one of four shapes caused it (left-left, right-right, left-right, right-left), and each has a fixed rotation (or pair of rotations) that restores balance in O(1). ' +
    'Because the imbalance is caught and fixed immediately, the tree never drifts toward a degenerate line the way an unbalanced BST can from sorted input. ' +
    'That guarantee is what the AVL height-balance invariant buys: every operation stays O(log n), no matter the insertion order.',
  code: CODE_INSERT,
  complexity: {
    time: 'O(log n) for search, insert, and delete, worst case.',
    why: 'The balance factor invariant (subtree heights differ by at most 1 everywhere) forces the tree\'s height to stay O(log n) no matter what order values are inserted or deleted in. Each insert or delete does one O(log n) walk down (or up, for rebalancing), and at most O(log n) rotations, each O(1), so the whole operation is O(log n).',
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
    const deletePickExisting = array.length > 0 && rng() < 0.7;
    const deleteValue = deletePickExisting ? array[Math.floor(rng() * array.length)] : 1 + Math.floor(rng() * 199);
    return { array, deleteValue };
  },
  run,
  check(input, result) {
    if (!result || !result.insertedValid || !result.finalValid) return false;
    const unique = new Set(input.array);
    const expectedInserted = Array.from(unique).sort((a, b) => a - b);
    if (result.insertedValues.join(',') !== expectedInserted.join(',')) return false;
    const expectedFound = unique.has(input.deleteValue);
    if ((result.caseHit !== 'not-found') !== expectedFound) return false;
    const expectedFinal = Array.from(unique);
    if (expectedFound) expectedFinal.splice(expectedFinal.indexOf(input.deleteValue), 1);
    expectedFinal.sort((a, b) => a - b);
    return result.finalValues.join(',') === expectedFinal.join(',');
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
