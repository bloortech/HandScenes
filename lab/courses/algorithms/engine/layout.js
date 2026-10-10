// Pure tree-layout helpers: given a tree's shape, assign each node an (x, y)
// position in a normalised 0..100 box so the renderer can draw it without
// knowing anything about canvas pixels. No DOM access, like rng.js.
//
// Two flavours, because this course's tree-shaped topics use two different
// child representations:
//   layoutTree(root)    - nodes have a `children` array (recursion-stack)
//   layoutBST(root)      - nodes have `left` / `right` (bst, tree-traversals)
// Both use the standard "leaves get consecutive x slots, an internal node is
// centered over its children" layout, which keeps every level readable and
// never overlaps siblings.

function layoutGeneric(root, getKids, { width = 100, height = 100, padX = 8, padY = 10 } = {}) {
  if (!root) return;
  let leafIndex = 0;
  let maxDepth = 0;

  function assign(node, depth) {
    maxDepth = Math.max(maxDepth, depth);
    const kids = getKids(node);
    if (kids.length === 0) {
      node._x = leafIndex;
      leafIndex += 1;
    } else {
      for (const kid of kids) assign(kid, depth + 1);
      node._x = kids.reduce((sum, kid) => sum + kid._x, 0) / kids.length;
    }
    node._depth = depth;
  }
  assign(root, 0);

  const leafCount = leafIndex; // number of leaves, >= 1
  const depthCount = Math.max(1, maxDepth);

  function place(node) {
    node.x =
      leafCount <= 1
        ? width / 2
        : padX + (node._x / (leafCount - 1)) * (width - 2 * padX);
    node.y = padY + (node._depth / depthCount) * (height - 2 * padY);
    for (const kid of getKids(node)) place(kid);
  }
  place(root);
}

export function layoutTree(root, opts) {
  layoutGeneric(root, (n) => n.children || [], opts);
}

export function layoutBST(root, opts) {
  layoutGeneric(root, (n) => [n.left, n.right].filter(Boolean), opts);
}

// Places a flat list of nodes (states of an automaton, not a tree) evenly
// around a circle in the same normalised 0..100 box, so diagrams with
// cycles (DFAs, NFAs) can reuse the tree/box renderer's node+edge drawing
// without needing a parent/child shape at all. Mutates each node's x/y.
export function layoutCircle(nodes, { cx = 50, cy = 50, r = 36 } = {}) {
  const n = nodes.length;
  if (n === 0) return;
  if (n === 1) { nodes[0].x = cx; nodes[0].y = cy; return; }
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    node.x = cx + r * Math.cos(angle);
    node.y = cy + r * Math.sin(angle);
  });
}
