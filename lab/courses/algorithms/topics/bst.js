// Binary search trees: search, insert, and delete (all three delete cases:
// deleting a leaf, a node with one child, and a node with two children).
// No DOM access. Shares its tree structure with tree-traversals.js via
// engine/bintree.js.
import { bstInsert, bstSearchPath, bstDelete, inorder, isValidBST, resetIds } from '../engine/bintree.js';
import { layoutBST } from '../engine/layout.js';

const CODE_SEARCH = [
  'search(node, value):',
  '  if node is null: return not found',
  '  if value == node.value: return node',
  '  if value < node.value: return search(node.left, value)',
  '  return search(node.right, value)',
];
const CODE_INSERT = [
  'insert(node, value):',
  '  walk down, going left or right by comparing to each node',
  '  when you reach an empty spot, put the new node there',
];
const CODE_DELETE = [
  'delete(node, value):',
  '  find the node (same walk as search)',
  '  if it has no children: remove it directly       (leaf case)',
  '  if it has one child: replace it with that child  (one-child case)',
  '  if it has two children: replace its value with its in-order',
  '    successor (smallest value in its right subtree), then delete',
  '    that successor node instead                    (two-children case)',
];

function treeFrame(root, { pathIds = [], activeIds = [], foundId = null, caption, line, code }) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    if (!node) return;
    nodes.push({
      id: node.id,
      label: String(node.value),
      x: node.x,
      y: node.y,
      compare: pathIds.includes(node.id) && node.id !== foundId,
      active: activeIds.includes(node.id) || node.id === foundId,
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
    yield treeFrame(root, { activeIds: [], caption: `Insert ${v} to build the starting tree.`, line: 0, code: CODE_INSERT });
  }
  if (array.length === 0) {
    yield treeFrame(null, { caption: 'Starting from an empty tree.', line: 0, code: CODE_INSERT });
  }
  return root;
}

function* doSearch(root, value) {
  const { path, found } = bstSearchPath(root, value);
  for (let i = 0; i < path.length; i++) {
    layoutBST(root);
    const partial = path.slice(0, i + 1).map((n) => n.id);
    yield treeFrame(root, {
      pathIds: partial,
      caption: `Compare ${value} to ${path[i].value}.`,
      line: i === 0 ? 1 : 2,
      code: CODE_SEARCH,
    });
  }
  layoutBST(root);
  yield treeFrame(root, {
    pathIds: path.map((n) => n.id),
    foundId: found ? found.id : null,
    caption: found ? `Found ${value}.` : `${value} is not in the tree (search fell off the bottom).`,
    line: 1,
    code: CODE_SEARCH,
  });
  return !!found;
}

function* doInsert(root, value) {
  const before = bstSearchPath(root, value);
  yield treeFrame(root, { pathIds: before.path.map((n) => n.id), caption: `Walk down to find where ${value} belongs.`, line: 1, code: CODE_INSERT });
  const after = bstInsert(root, value);
  layoutBST(after);
  const { path: afterPath } = bstSearchPath(after, value);
  const newNode = afterPath[afterPath.length - 1];
  yield treeFrame(after, { activeIds: newNode ? [newNode.id] : [], caption: `Place ${value} in the empty spot the walk landed on.`, line: 2, code: CODE_INSERT });
  return after;
}

function* doDelete(root, value) {
  const { path } = bstSearchPath(root, value);
  yield treeFrame(root, { pathIds: path.map((n) => n.id), caption: `Walk down to find ${value}.`, line: 1, code: CODE_DELETE });
  const { root: newRoot, caseHit } = bstDelete(root, value);
  layoutBST(newRoot);
  const caseText = {
    'not-found': `${value} was not in the tree. Nothing to delete.`,
    leaf: `${value} had no children, so it was removed directly (the leaf case).`,
    'one-child': `${value} had exactly one child, so that child took its place (the one-child case).`,
    'two-children': `${value} had two children, so it was replaced by its in-order successor (the two-children case).`,
  }[caseHit];
  yield treeFrame(newRoot, { caption: caseText, line: caseHit === 'leaf' ? 2 : caseHit === 'one-child' ? 3 : caseHit === 'two-children' ? 4 : 1, code: CODE_DELETE });
  return { root: newRoot, caseHit };
}

function* run(input) {
  resetIds();
  let root = yield* buildTree(input.array);
  const searchFound = yield* doSearch(root, input.searchValue);
  root = yield* doInsert(root, input.insertValue);
  const { root: afterDelete, caseHit } = yield* doDelete(root, input.deleteValue);
  root = afterDelete;
  return { sortedValues: inorder(root), searchFound, caseHit, valid: isValidBST(root) };
}

export default {
  id: 'bst',
  title: 'Binary search trees',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Binary Search Trees',
  summary:
    'A binary search tree keeps every value in a node with up to two children, arranged so everything in a node\'s left subtree is smaller and everything in its right subtree is bigger. ' +
    'That ordering is what makes search fast: at each node, comparing the target to that node\'s value tells you which single subtree could possibly contain it, so you never have to look at the other side. ' +
    'Insertion follows the exact same walk as search, just placing the new value in the empty spot where the walk falls off the tree. ' +
    'Deletion is the trickiest of the three. Removing a leaf is easy, removing a node with one child just promotes that child, but removing a node with two children needs care: it gets replaced by its in-order successor (the smallest value in its right subtree), which is always safe to move up because nothing in between sits in its way. ' +
    'When the tree is roughly balanced, all three operations take time proportional to its height, about log(n). A tree built from already-sorted input degenerates into a straight line, with no benefit over a linked list. ' +
    'CLRS devotes a chapter to exactly this structure, before introducing red-black trees as a way to guarantee the tree never degenerates.',
  code: CODE_SEARCH,
  complexity: {
    time: 'O(h) for search, insert, and delete, where h is the tree\'s height. O(log n) if the tree stays balanced; O(n) in the worst case.',
    why: 'Every one of these operations does one comparison per node and moves to exactly one child, so the work is proportional to how many nodes are on the path, which is the tree\'s height. A balanced tree built from n values has height O(log n), but inserting values in sorted order builds a tree that is really just a linked list in disguise, with height O(n).',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 199));
    const unique = Array.from(new Set(array));
    const pickExisting = unique.length > 0 && rng() < 0.6;
    const searchValue = pickExisting ? unique[Math.floor(rng() * unique.length)] : 1 + Math.floor(rng() * 199);
    const insertValue = 1 + Math.floor(rng() * 199);
    const deletePickExisting = unique.length > 0 && rng() < 0.7;
    const deleteValue = deletePickExisting ? unique[Math.floor(rng() * unique.length)] : 1 + Math.floor(rng() * 199);
    return { array, searchValue, insertValue, deleteValue };
  },
  run,
  check(input, result) {
    if (!result || !result.valid) return false;
    const unique = new Set(input.array);
    const expectedSearchFound = unique.has(input.searchValue);
    if (result.searchFound !== expectedSearchFound) return false;
    unique.add(input.insertValue);
    unique.delete(input.deleteValue);
    const expectedSorted = Array.from(unique).sort((a, b) => a - b);
    const got = result.sortedValues;
    if (!Array.isArray(got) || got.length !== expectedSorted.length) return false;
    return got.every((v, i) => v === expectedSorted[i]);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 9 },
};
