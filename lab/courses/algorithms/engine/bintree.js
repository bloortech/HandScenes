// A plain binary search tree: no DOM access, shared by the `bst` and
// `tree-traversals` topics (both build and walk the same kind of tree, so
// the structure lives here instead of being forked twice).

let nextId = 1;
export function makeNode(value) {
  return { id: nextId++, value, left: null, right: null };
}

// Resets the id counter. Topics call this at the start of each run() so ids
// (used as React-key-ish identity for frames) are small and deterministic
// per run, instead of climbing forever across many sandbox randomizations.
export function resetIds() {
  nextId = 1;
}

export function bstInsert(root, value) {
  if (!root) return makeNode(value);
  let node = root;
  while (true) {
    if (value === node.value) return root; // no duplicates
    if (value < node.value) {
      if (!node.left) { node.left = makeNode(value); return root; }
      node = node.left;
    } else {
      if (!node.right) { node.right = makeNode(value); return root; }
      node = node.right;
    }
  }
}

// Returns the path of nodes visited while searching for `value` (inclusive
// of the final node whether or not it matches), used to animate the probe.
export function bstSearchPath(root, value) {
  const path = [];
  let node = root;
  while (node) {
    path.push(node);
    if (value === node.value) return { path, found: node };
    node = value < node.value ? node.left : node.right;
  }
  return { path, found: null };
}

function minNode(node) {
  while (node.left) node = node.left;
  return node;
}

// Deletes `value` from the tree rooted at `root`, returning the new root and
// which textbook case applied: 'not-found', 'leaf', 'one-child', or
// 'two-children' (CLRS's three delete cases for a BST).
// Removes the minimum node from the subtree rooted at `node` (used only to
// splice out an in-order successor by identity, never by value, since the
// successor's value may equal some other node's value after the caller
// copies it upward).
function delMin(node) {
  if (!node.left) return node.right;
  node.left = delMin(node.left);
  return node;
}

export function bstDelete(root, value) {
  let caseHit = 'not-found';
  function del(node) {
    if (!node) return null;
    if (value < node.value) { node.left = del(node.left); return node; }
    if (value > node.value) { node.right = del(node.right); return node; }
    // Found the node to delete.
    if (!node.left && !node.right) {
      caseHit = 'leaf';
      return null;
    }
    if (!node.left || !node.right) {
      caseHit = 'one-child';
      return node.left || node.right;
    }
    caseHit = 'two-children';
    const successor = minNode(node.right);
    node.value = successor.value;
    // Splice the successor itself out of the right subtree by identity
    // (delMin always removes the leftmost node, which is exactly
    // `successor`), not by searching for its value again.
    node.right = delMin(node.right);
    return node;
  }
  const newRoot = del(root);
  return { root: newRoot, caseHit };
}

export function preorder(root, out = []) {
  if (!root) return out;
  out.push(root.value);
  preorder(root.left, out);
  preorder(root.right, out);
  return out;
}

export function inorder(root, out = []) {
  if (!root) return out;
  inorder(root.left, out);
  out.push(root.value);
  inorder(root.right, out);
  return out;
}

export function postorder(root, out = []) {
  if (!root) return out;
  postorder(root.left, out);
  postorder(root.right, out);
  out.push(root.value);
  return out;
}

export function levelorder(root) {
  const out = [];
  if (!root) return out;
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    out.push(node.value);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
  return out;
}

export function isValidBST(root, lo = -Infinity, hi = Infinity) {
  if (!root) return true;
  if (!(root.value > lo && root.value < hi)) return false;
  return isValidBST(root.left, lo, root.value) && isValidBST(root.right, root.value, hi);
}

export function countNodes(root) {
  if (!root) return 0;
  return 1 + countNodes(root.left) + countNodes(root.right);
}
