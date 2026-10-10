// A Fibonacci heap (CLRS 3rd ed: Fibonacci Heaps): a collection of
// heap-ordered trees in a root list, with lazy consolidation deferred to
// extract-min and cascading cuts keeping decrease-key's amortised cost
// O(1). No DOM access. Represented with plain node objects and arrays
// (rather than the textbook's raw circular doubly linked list pointers)
// since this demo only needs root-list order for drawing, not O(1)
// list-splice performance.

let nextId = 1;
export function resetIds() { nextId = 1; }

function makeNode(key) {
  return { id: nextId++, key, parent: null, children: [], mark: false };
}

export function createHeap() {
  return { roots: [], min: null };
}

export function insert(heap, key, log) {
  const node = makeNode(key);
  heap.roots.push(node);
  if (!heap.min || node.key < heap.min.key) heap.min = node;
  if (log) log.push({ type: 'insert', nodeId: node.id, key });
  return node;
}

// Degree is just how many children a node has right now: real Fibonacci
// heaps maintain it incrementally for O(1) reads, but recomputing it from
// `children.length` is equivalent and simpler here.
function degree(node) {
  return node.children.length;
}

// CONSOLIDATE: repeatedly link two roots of equal degree (the one with the
// larger key becomes a child of the one with the smaller key) until every
// root has a distinct degree. Bucketing by degree makes this O(roots) plus
// O(log n) links, the step that pays back decrease-key's laziness.
function consolidate(heap, log) {
  const byDegree = new Map();
  for (const root of heap.roots) {
    let x = root;
    let d = degree(x);
    while (byDegree.has(d)) {
      let y = byDegree.get(d);
      if (y.key < x.key) { const t = x; x = y; y = t; }
      // y becomes a child of x.
      byDegree.delete(d);
      y.parent = x;
      y.mark = false;
      x.children.push(y);
      if (log) log.push({ type: 'link', childId: y.id, parentId: x.id });
      d = degree(x);
    }
    byDegree.set(d, x);
  }
  heap.roots = Array.from(byDegree.values());
  heap.min = null;
  for (const r of heap.roots) {
    if (!heap.min || r.key < heap.min.key) heap.min = r;
  }
}

export function extractMin(heap, log) {
  const z = heap.min;
  if (!z) return null;
  heap.roots = heap.roots.filter((r) => r !== z);
  for (const c of z.children) {
    c.parent = null;
    c.mark = false;
    heap.roots.push(c);
  }
  z.children = [];
  if (log) log.push({ type: 'extract', nodeId: z.id, key: z.key });
  consolidate(heap, log);
  if (log) log.push({ type: 'consolidated', rootKeys: heap.roots.map((r) => r.key) });
  return z.key;
}

function cut(heap, node, parent, log) {
  parent.children = parent.children.filter((c) => c !== node);
  node.parent = null;
  node.mark = false;
  heap.roots.push(node);
  if (log) log.push({ type: 'cut', nodeId: node.id, parentId: parent.id });
}

// CASCADING-CUT: a node that has already lost one child gets cut itself
// (and marked false) the moment it loses a second; the cut propagates
// upward until it hits a root or an unmarked node, which gets marked
// instead. This bounds how much structure one decrease-key can unravel.
function cascadingCut(heap, node, log) {
  const parent = node.parent;
  if (!parent) return;
  if (!node.mark) {
    node.mark = true;
    if (log) log.push({ type: 'mark', nodeId: node.id });
  } else {
    cut(heap, node, parent, log);
    cascadingCut(heap, parent, log);
  }
}

export function decreaseKey(heap, node, newKey, log) {
  if (newKey > node.key) throw new Error('decreaseKey: new key is larger');
  node.key = newKey;
  const parent = node.parent;
  if (parent && node.key < parent.key) {
    cut(heap, node, parent, log);
    cascadingCut(heap, parent, log);
  }
  if (node.key < heap.min.key) heap.min = node;
  if (log) log.push({ type: 'decrease', nodeId: node.id, key: newKey });
}

// Independently re-verifies the min-heap property (every parent's key is
// <= every child's key) across the whole forest, roots and all.
export function isHeapOrdered(heap) {
  function check(node) {
    for (const c of node.children) {
      if (c.key < node.key) return false;
      if (!check(c)) return false;
    }
    return true;
  }
  return heap.roots.every(check);
}

export function allKeys(heap) {
  const out = [];
  function walk(node) { out.push(node.key); for (const c of node.children) walk(c); }
  heap.roots.forEach(walk);
  return out;
}
