// A red-black tree: insert, with CLRS's RB-INSERT-FIXUP recolouring and
// rotation cases. No DOM access. This ticket's brief only requires insert
// (not delete) for red-black trees, so that is all this file provides.
// Needs real parent pointers (unlike engine/bintree.js's plain BST), so it
// is its own file rather than an extension of it.

let nextId = 1;
export function makeNode(value) {
  return { id: nextId++, value, left: null, right: null, parent: null, color: 'R' };
}
export function resetIds() {
  nextId = 1;
}

function isRed(n) {
  return !!n && n.color === 'R';
}

function leftRotate(root, x) {
  const y = x.right;
  x.right = y.left;
  if (y.left) y.left.parent = x;
  y.parent = x.parent;
  if (!x.parent) root = y;
  else if (x === x.parent.left) x.parent.left = y;
  else x.parent.right = y;
  y.left = x;
  x.parent = y;
  return root;
}
function rightRotate(root, x) {
  const y = x.left;
  x.left = y.right;
  if (y.right) y.right.parent = x;
  y.parent = x.parent;
  if (!x.parent) root = y;
  else if (x === x.parent.right) x.parent.right = y;
  else x.parent.left = y;
  y.right = x;
  x.parent = y;
  return root;
}

// CLRS's RB-INSERT-FIXUP, with every recolour/rotation pushed onto `log` so
// the topic can show exactly which fired.
function fixup(root, z, log) {
  while (z.parent && z.parent.color === 'R') {
    const p = z.parent, g = p.parent;
    if (p === g.left) {
      const y = g.right;
      if (isRed(y)) {
        p.color = 'B'; y.color = 'B'; g.color = 'R';
        log.push({ type: 'recolor', nodeIds: [p.id, y.id, g.id] });
        z = g;
      } else {
        if (z === p.right) {
          z = p;
          root = leftRotate(root, z);
          log.push({ type: 'rotate', kind: 'left', nodeId: z.id });
        }
        z.parent.color = 'B';
        z.parent.parent.color = 'R';
        log.push({ type: 'recolor', nodeIds: [z.parent.id, z.parent.parent.id] });
        root = rightRotate(root, z.parent.parent);
        log.push({ type: 'rotate', kind: 'right', nodeId: z.parent.id });
      }
    } else {
      const y = g.left;
      if (isRed(y)) {
        p.color = 'B'; y.color = 'B'; g.color = 'R';
        log.push({ type: 'recolor', nodeIds: [p.id, y.id, g.id] });
        z = g;
      } else {
        if (z === p.left) {
          z = p;
          root = rightRotate(root, z);
          log.push({ type: 'rotate', kind: 'right', nodeId: z.id });
        }
        z.parent.color = 'B';
        z.parent.parent.color = 'R';
        log.push({ type: 'recolor', nodeIds: [z.parent.id, z.parent.parent.id] });
        root = leftRotate(root, z.parent.parent);
        log.push({ type: 'rotate', kind: 'left', nodeId: z.parent.id });
      }
    }
  }
  root.color = 'B';
  return root;
}

// Inserts `value` (ignoring duplicates), returning the new root plus a log
// of recolour/rotate events for animation.
export function rbInsert(root, value, log = []) {
  let y = null, x = root;
  while (x) {
    if (value === x.value) return { root, log };
    y = x;
    x = value < x.value ? x.left : x.right;
  }
  const z = makeNode(value);
  z.parent = y;
  if (!y) root = z;
  else if (value < y.value) y.left = z;
  else y.right = z;
  log.push({ type: 'insert', nodeId: z.id });
  root = fixup(root, z, log);
  return { root, log };
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

// Verifies the four red-black properties CLRS states (root black, no
// red node with a red child, and every root-to-nil path has the same
// number of black nodes). Returns false on any violation.
export function isValidRB(root) {
  if (root && root.color !== 'B') return false;
  function blackHeight(node) {
    if (!node) return 1; // a nil leaf counts as black
    if (isRed(node) && (isRed(node.left) || isRed(node.right))) return -1;
    const lh = blackHeight(node.left);
    const rh = blackHeight(node.right);
    if (lh === -1 || rh === -1 || lh !== rh) return -1;
    return lh + (node.color === 'B' ? 1 : 0);
  }
  return blackHeight(root) !== -1;
}
