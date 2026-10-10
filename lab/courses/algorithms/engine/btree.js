// A B-tree of minimum degree t (CLRS: B-Trees): every non-root node has
// between t-1 and 2t-1 keys, every internal node has one more child than
// keys. No DOM access. Insert splits full nodes on the way down
// (B-TREE-SPLIT-CHILD); delete merges underfull nodes on the way down
// (CLRS's six delete cases), so a single top-to-bottom pass never has to
// back up and re-fix an ancestor.

let nextId = 1;
export function resetIds() { nextId = 1; }

function makeNode(leaf) {
  return { id: nextId++, leaf, keys: [], children: [] };
}

export function createTree(t) {
  return { t, root: makeNode(true) };
}

// Splits y, the i-th child of x (which must be full, 2t-1 keys), into two
// nodes of t-1 keys each, pushing y's median key up into x.
function splitChild(x, i, t, log) {
  const y = x.children[i];
  const z = makeNode(y.leaf);
  const mid = y.keys[t - 1];
  z.keys = y.keys.slice(t);
  y.keys = y.keys.slice(0, t - 1);
  if (!y.leaf) {
    z.children = y.children.slice(t);
    y.children = y.children.slice(0, t);
  }
  x.children.splice(i + 1, 0, z);
  x.keys.splice(i, 0, mid);
  if (log) log.push({ type: 'split', parentId: x.id, leftId: y.id, rightId: z.id, median: mid });
}

function insertNonFull(x, key, t, log) {
  let i = x.keys.length - 1;
  if (x.leaf) {
    while (i >= 0 && key < x.keys[i]) i--;
    x.keys.splice(i + 1, 0, key);
    if (log) log.push({ type: 'place', nodeId: x.id, key });
  } else {
    while (i >= 0 && key < x.keys[i]) i--;
    i++;
    if (x.children[i].keys.length === 2 * t - 1) {
      splitChild(x, i, t, log);
      if (key > x.keys[i]) i++;
    }
    insertNonFull(x.children[i], key, t, log);
  }
}

export function search(node, key) {
  let i = 0;
  while (i < node.keys.length && key > node.keys[i]) i++;
  if (i < node.keys.length && node.keys[i] === key) return true;
  if (node.leaf) return false;
  return search(node.children[i], key);
}

// B-TREE-INSERT: if the root is full, it must split first (the only time
// the tree's height grows), so the final root is a brand-new node. Like
// this course's other search-tree topics, keys are a set (no duplicates):
// inserting an existing key is a no-op, checked before touching the tree
// so a full root never splits pointlessly for a key that won't be added.
export function insert(tree, key, log) {
  if (search(tree.root, key)) {
    if (log) log.push({ type: 'duplicate', key });
    return;
  }
  const r = tree.root;
  if (r.keys.length === 2 * tree.t - 1) {
    const s = makeNode(false);
    s.children = [r];
    splitChild(s, 0, tree.t, log);
    tree.root = s;
    insertNonFull(s, key, tree.t, log);
  } else {
    insertNonFull(r, key, tree.t, log);
  }
}

function findKeyIndex(node, key) {
  let i = 0;
  while (i < node.keys.length && key > node.keys[i]) i++;
  return i;
}

function subtreeMax(node, log) {
  let x = node;
  while (!x.leaf) { if (log) log.push({ type: 'visit', nodeId: x.id }); x = x.children[x.children.length - 1]; }
  if (log) log.push({ type: 'visit', nodeId: x.id });
  return x.keys[x.keys.length - 1];
}
function subtreeMin(node, log) {
  let x = node;
  while (!x.leaf) { if (log) log.push({ type: 'visit', nodeId: x.id }); x = x.children[0]; }
  if (log) log.push({ type: 'visit', nodeId: x.id });
  return x.keys[0];
}

// Ensures x.children[i] has at least t keys before recursing into it,
// borrowing from a sibling if one has a key to spare, else merging with a
// sibling (CLRS cases 3a/3b).
function ensureChildHasEnough(x, i, t, log) {
  const t_min = t - 1;
  const child = x.children[i];
  if (child.keys.length > t_min) return i;

  const leftSib = i > 0 ? x.children[i - 1] : null;
  const rightSib = i < x.children.length - 1 ? x.children[i + 1] : null;

  if (leftSib && leftSib.keys.length > t_min) {
    // Rotate: parent's separator key comes down into child, leftSib's last
    // key (and child, if internal) goes up/over.
    child.keys.unshift(x.keys[i - 1]);
    x.keys[i - 1] = leftSib.keys.pop();
    if (!leftSib.leaf) child.children.unshift(leftSib.children.pop());
    if (log) log.push({ type: 'borrow', from: leftSib.id, to: child.id, parentId: x.id });
    return i;
  }
  if (rightSib && rightSib.keys.length > t_min) {
    child.keys.push(x.keys[i]);
    x.keys[i] = rightSib.keys.shift();
    if (!rightSib.leaf) child.children.push(rightSib.children.shift());
    if (log) log.push({ type: 'borrow', from: rightSib.id, to: child.id, parentId: x.id });
    return i;
  }
  // Merge child with a sibling (and the separator key between them).
  if (leftSib) {
    leftSib.keys.push(x.keys[i - 1]);
    leftSib.keys.push(...child.keys);
    if (!leftSib.leaf) leftSib.children.push(...child.children);
    x.keys.splice(i - 1, 1);
    x.children.splice(i, 1);
    if (log) log.push({ type: 'merge', intoId: leftSib.id, removedId: child.id, parentId: x.id });
    return i - 1;
  } else {
    child.keys.push(x.keys[i]);
    child.keys.push(...rightSib.keys);
    if (!child.leaf) child.children.push(...rightSib.children);
    x.keys.splice(i, 1);
    x.children.splice(i + 1, 1);
    if (log) log.push({ type: 'merge', intoId: child.id, removedId: rightSib.id, parentId: x.id });
    return i;
  }
}

function deleteFrom(x, key, t, log) {
  const i = findKeyIndex(x, key);
  if (i < x.keys.length && x.keys[i] === key) {
    if (x.leaf) {
      x.keys.splice(i, 1);
      if (log) log.push({ type: 'remove', nodeId: x.id, key });
      return;
    }
    const left = x.children[i], right = x.children[i + 1];
    if (left.keys.length > t - 1) {
      const pred = subtreeMax(left, log);
      x.keys[i] = pred;
      if (log) log.push({ type: 'replace', nodeId: x.id, key: pred, with: key });
      deleteFrom(left, pred, t, log);
    } else if (right.keys.length > t - 1) {
      const succ = subtreeMin(right, log);
      x.keys[i] = succ;
      if (log) log.push({ type: 'replace', nodeId: x.id, key: succ, with: key });
      deleteFrom(right, succ, t, log);
    } else {
      // Both children at minimum: merge them (and the separator) into the
      // left one, then recurse into it for the same key. This merges
      // specifically x.children[i] and x.children[i+1] (not whichever
      // sibling happens to have a spare key), per CLRS's case 2c.
      left.keys.push(x.keys[i]);
      left.keys.push(...right.keys);
      if (!left.leaf) left.children.push(...right.children);
      x.keys.splice(i, 1);
      x.children.splice(i + 1, 1);
      if (log) log.push({ type: 'merge', intoId: left.id, removedId: right.id, parentId: x.id });
      deleteFrom(left, key, t, log);
    }
    return;
  }
  if (x.leaf) {
    if (log) log.push({ type: 'absent', key });
    return; // key not present
  }
  // ensureChildHasEnough may merge child i with a sibling, which shifts
  // where the key we want to recurse into now lives; it returns the right
  // index to use either way.
  const childIdx = ensureChildHasEnough(x, i, t, log);
  deleteFrom(x.children[childIdx], key, t, log);
}

export function remove(tree, key, log) {
  deleteFrom(tree.root, key, tree.t, log);
  if (tree.root.keys.length === 0 && !tree.root.leaf) {
    if (log) log.push({ type: 'shrink', oldRootId: tree.root.id, newRootId: tree.root.children[0].id });
    tree.root = tree.root.children[0];
  }
}

export function inorder(node, out = []) {
  if (!node) return out;
  for (let i = 0; i < node.keys.length; i++) {
    if (!node.leaf) inorder(node.children[i], out);
    out.push(node.keys[i]);
  }
  if (!node.leaf) inorder(node.children[node.keys.length], out);
  return out;
}

// Independently re-verifies every B-tree invariant: keys within a node are
// sorted, every non-root node has >= t-1 keys and <= 2t-1, every internal
// node has keys.length+1 children, all leaves at the same depth, and every
// subtree's keys fall strictly between its bounding separator keys.
export function isValidBTree(tree) {
  const t = tree.t;
  let leafDepth = -1;
  function check(node, depth, lo, hi) {
    if (node !== tree.root && (node.keys.length < t - 1 || node.keys.length > 2 * t - 1)) return false;
    if (node.keys.length > 2 * t - 1) return false;
    for (let i = 0; i < node.keys.length; i++) {
      if (node.keys[i] <= lo || node.keys[i] >= hi) return false;
      if (i > 0 && node.keys[i - 1] >= node.keys[i]) return false;
    }
    if (node.leaf) {
      if (leafDepth === -1) leafDepth = depth;
      return depth === leafDepth;
    }
    if (node.children.length !== node.keys.length + 1) return false;
    for (let i = 0; i < node.children.length; i++) {
      const childLo = i === 0 ? lo : node.keys[i - 1];
      const childHi = i === node.keys.length ? hi : node.keys[i];
      if (!check(node.children[i], depth + 1, childLo, childHi)) return false;
    }
    return true;
  }
  return check(tree.root, 0, -Infinity, Infinity);
}
