// A height-balanced AVL tree: insert and delete, both self-balancing with
// the four classic rotation cases (LL, RR, LR, RL). No DOM access, shared
// structure/logic pattern with engine/bintree.js, but AVL needs its own
// `height` field and its own rebalancing, so it is its own file rather than
// an extension of the plain BST.

let nextId = 1;
export function makeNode(value) {
  return { id: nextId++, value, left: null, right: null, height: 1 };
}
export function resetIds() {
  nextId = 1;
}

function height(node) {
  return node ? node.height : 0;
}
function updateHeight(node) {
  node.height = 1 + Math.max(height(node.left), height(node.right));
}
function balanceFactor(node) {
  return height(node.left) - height(node.right);
}

function rotateRight(y) {
  const x = y.left;
  const t2 = x.right;
  x.right = y;
  y.left = t2;
  updateHeight(y);
  updateHeight(x);
  return x;
}
function rotateLeft(x) {
  const y = x.right;
  const t2 = y.left;
  y.left = x;
  x.right = t2;
  updateHeight(x);
  updateHeight(y);
  return y;
}

// Rebalances `node` (whose subtrees are already balanced) and returns the
// new subtree root, pushing a `{ type: 'rotate', kind, nodeId }` entry onto
// `log` for every rotation actually performed.
function rebalance(node, log) {
  updateHeight(node);
  const bf = balanceFactor(node);
  if (bf > 1) {
    if (balanceFactor(node.left) < 0) {
      log.push({ type: 'rotate', kind: 'LR', nodeId: node.id });
      node.left = rotateLeft(node.left);
    } else {
      log.push({ type: 'rotate', kind: 'LL', nodeId: node.id });
    }
    return rotateRight(node);
  }
  if (bf < -1) {
    if (balanceFactor(node.right) > 0) {
      log.push({ type: 'rotate', kind: 'RL', nodeId: node.id });
      node.right = rotateRight(node.right);
    } else {
      log.push({ type: 'rotate', kind: 'RR', nodeId: node.id });
    }
    return rotateLeft(node);
  }
  return node;
}

// Inserts `value`, returning the new root. Ignores duplicates (same as the
// plain BST in engine/bintree.js). `log` collects rotation events so the
// topic can animate exactly which ones fired.
export function avlInsert(root, value, log = []) {
  if (!root) return makeNode(value);
  if (value === root.value) return root;
  if (value < root.value) root.left = avlInsert(root.left, value, log);
  else root.right = avlInsert(root.right, value, log);
  return rebalance(root, log);
}

function minNode(node) {
  while (node.left) node = node.left;
  return node;
}

// Deletes `value`, returning the new root and which BST delete case fired
// ('not-found' | 'leaf' | 'one-child' | 'two-children'), same vocabulary as
// engine/bintree.js's bstDelete, plus the rotation log.
export function avlDelete(root, value, log = []) {
  let caseHit = 'not-found';
  // Splice the in-order successor out by identity (always the leftmost node
  // of the right subtree), never by re-searching for its (now-duplicated)
  // value, for the same reason engine/bintree.js's delMin does this.
  function delSuccessor(node) {
    if (!node.left) return node.right;
    node.left = delSuccessor(node.left);
    return rebalance(node, log);
  }
  function del(node) {
    if (!node) return null;
    if (value < node.value) { node.left = del(node.left); return rebalance(node, log); }
    if (value > node.value) { node.right = del(node.right); return rebalance(node, log); }
    if (!node.left && !node.right) { caseHit = 'leaf'; return null; }
    if (!node.left || !node.right) { caseHit = 'one-child'; return node.left || node.right; }
    caseHit = 'two-children';
    const successor = minNode(node.right);
    node.value = successor.value;
    node.right = delSuccessor(node.right);
    return rebalance(node, log);
  }
  const newRoot = del(root);
  return { root: newRoot, caseHit };
}

export function inorder(root, out = []) {
  if (!root) return out;
  inorder(root.left, out);
  out.push(root.value);
  inorder(root.right, out);
  return out;
}

export function isValidBST(root, lo = -Infinity, hi = Infinity) {
  if (!root) return true;
  if (!(root.value > lo && root.value < hi)) return false;
  return isValidBST(root.left, lo, root.value) && isValidBST(root.right, root.value, hi);
}

// Verifies the AVL height-balance invariant holds at every node: the two
// subtrees' heights never differ by more than 1.
export function isBalanced(root) {
  function check(node) {
    if (!node) return 0;
    const lh = check(node.left);
    const rh = check(node.right);
    if (lh === -1 || rh === -1 || Math.abs(lh - rh) > 1) return -1;
    return 1 + Math.max(lh, rh);
  }
  return check(root) !== -1;
}
