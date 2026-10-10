// Tree traversals: pre-order, in-order, post-order and level-order, all
// run on the same binary search tree (built from the sandbox array). No
// DOM access. Shares its tree structure with bst.js via engine/bintree.js.
import { bstInsert, resetIds } from '../engine/bintree.js';
import { layoutBST } from '../engine/layout.js';

const CODE_PRE = ['preorder(node):', '  if node is null: return', '  visit(node)', '  preorder(node.left)', '  preorder(node.right)'];
const CODE_IN = ['inorder(node):', '  if node is null: return', '  inorder(node.left)', '  visit(node)', '  inorder(node.right)'];
const CODE_POST = ['postorder(node):', '  if node is null: return', '  postorder(node.left)', '  postorder(node.right)', '  visit(node)'];
const CODE_LEVEL = ['levelorder(root):', '  queue = [root]', '  while queue is not empty:', '    node = queue.pop_front()', '    visit(node)', '    queue.push(node.left, node.right)  (skip nulls)'];

function treeFrame(root, { visitedIds = [], activeId = null, caption, line, code }) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    if (!node) return;
    nodes.push({
      id: node.id,
      label: String(node.value),
      x: node.x,
      y: node.y,
      dim: visitedIds.includes(node.id) && node.id !== activeId,
      active: node.id === activeId,
    });
    if (node.left) { edges.push([node.id, node.left.id]); walk(node.left); }
    if (node.right) { edges.push([node.id, node.right.id]); walk(node.right); }
  })(root);
  return { kind: 'tree', line, code, caption, nodes, edges, emptyText: '(empty tree)' };
}

function* buildTree(array) {
  let root = null;
  for (const v of array) {
    root = bstInsert(root, v);
    layoutBST(root);
  }
  return root;
}

function* preorder(root, order, visited) {
  if (!root) return;
  order.push(root.value);
  visited.push(root.id);
  yield treeFrame(root, { visitedIds: visited.slice(), activeId: root.id, caption: `Visit ${root.value}, then its left subtree, then its right subtree.`, line: 2, code: CODE_PRE });
  yield* preorder(root.left, order, visited);
  yield* preorder(root.right, order, visited);
}

function* inorderWalk(root, order, visited) {
  if (!root) return;
  yield* inorderWalk(root.left, order, visited);
  order.push(root.value);
  visited.push(root.id);
  yield treeFrame(root, { visitedIds: visited.slice(), activeId: root.id, caption: `Left subtree done. Visit ${root.value}, then move to its right subtree.`, line: 3, code: CODE_IN });
  yield* inorderWalk(root.right, order, visited);
}

function* postorderWalk(root, order, visited) {
  if (!root) return;
  yield* postorderWalk(root.left, order, visited);
  yield* postorderWalk(root.right, order, visited);
  order.push(root.value);
  visited.push(root.id);
  yield treeFrame(root, { visitedIds: visited.slice(), activeId: root.id, caption: `Both subtrees of ${root.value} are done. Visit it last.`, line: 4, code: CODE_POST });
}

function* levelorderWalk(root, order, visited) {
  if (!root) return;
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    order.push(node.value);
    visited.push(node.id);
    yield treeFrame(root, { visitedIds: visited.slice(), activeId: node.id, caption: `Visit ${node.value} (this level, left to right), then queue up its children.`, line: 4, code: CODE_LEVEL });
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
}

function* run(input) {
  resetIds();
  const root = yield* buildTree(input.array);

  if (!root) {
    yield treeFrame(null, { caption: 'The tree is empty. Every traversal visits nothing.', line: 0, code: CODE_PRE });
    return { pre: [], in: [], post: [], level: [] };
  }

  const pre = [], in_ = [], post = [], level = [];
  yield* preorder(root, pre, []);
  yield* inorderWalk(root, in_, []);
  yield* postorderWalk(root, post, []);
  yield* levelorderWalk(root, level, []);

  return { pre, in: in_, post, level };
}

// Brute-force traversal, independent of the generator above, used to check
// the yielded orders are the standard recursive/BFS definitions.
function bruteForce(root) {
  const pre = [], in_ = [], post = [], level = [];
  (function walkPre(n) { if (!n) return; pre.push(n.value); walkPre(n.left); walkPre(n.right); })(root);
  (function walkIn(n) { if (!n) return; walkIn(n.left); in_.push(n.value); walkIn(n.right); })(root);
  (function walkPost(n) { if (!n) return; walkPost(n.left); walkPost(n.right); post.push(n.value); })(root);
  if (root) {
    const q = [root];
    while (q.length) {
      const n = q.shift();
      level.push(n.value);
      if (n.left) q.push(n.left);
      if (n.right) q.push(n.right);
    }
  }
  return { pre, in: in_, post, level };
}

export default {
  id: 'tree-traversals',
  title: 'Tree traversals',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Binary Search Trees (traversals of the tree structure)',
  summary:
    'A traversal visits every node in a tree exactly once; the four classic orders just differ in when a node gets visited relative to its children. ' +
    'Pre-order visits a node before its subtrees, which is the order you would need to rebuild the same tree shape from scratch. ' +
    'In-order visits the left subtree, then the node, then the right subtree. On a binary search tree this always produces every value in sorted order, which is exactly the ordering property a BST maintains. ' +
    'Post-order visits both subtrees before the node itself, which is the order you would need to safely delete every node (children before parent). ' +
    'Level-order visits the tree row by row, left to right, using a queue instead of the stack-like recursion the other three use; it is really breadth-first search applied to a tree. ' +
    'All four appear throughout CLRS\'s binary search tree chapter and come up again whenever a tree-shaped structure needs to be walked in a specific order.',
  code: CODE_IN,
  complexity: {
    time: 'O(n) for every traversal, where n is the number of nodes.',
    why: 'Each traversal visits every node exactly once and does a constant amount of work per visit (compare, push to a list, or push neighbours onto a queue), so the total work is proportional to the number of nodes.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 199));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    let root = null;
    for (const v of input.array) root = bstInsert(root, v);
    const expected = bruteForce(root);
    const eq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
    return eq(result.pre, expected.pre) && eq(result.in, expected.in) && eq(result.post, expected.post) && eq(result.level, expected.level);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 9 },
};
