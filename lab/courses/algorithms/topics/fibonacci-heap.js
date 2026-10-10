// Fibonacci heaps: insert (just drop a new tree in the root list),
// extract-min (remove the min, promote its children to roots, then
// consolidate same-degree roots together), and decrease-key (cut the node
// out and, if its parent had already lost a child, cascade the cut
// upward). No DOM access. Logic lives in engine/fibheap.js; drawn as a
// forest of root trees side by side, same idea as disjoint-sets.
import { createHeap, insert, extractMin, decreaseKey, isHeapOrdered, resetIds } from '../engine/fibheap.js';
import { layoutTree } from '../engine/layout.js';

const CODE = [
  'insert(key): add a new single-node tree to the root list',
  'extractMin(): remove the min root, add its children to the root list,',
  '  then consolidate: repeatedly link equal-degree roots (smaller key',
  '  on top) until every root has a distinct degree',
  'decreaseKey(x, newKey): if x is now smaller than its parent, cut it',
  '  into the root list; if its parent had already lost a child, cut',
  '  the parent too (cascading), and so on up the tree',
];

function forestFrame(heap, { touchedIds = [], caption, line }) {
  const nodes = [];
  const edges = [];
  const roots = heap.roots;
  const slotW = 100 / Math.max(1, roots.length);
  roots.forEach((root, slot) => {
    layoutTree(root, { width: slotW, padX: slotW * 0.15, padY: 12 });
    (function shift(n) {
      n.x += slot * slotW;
      nodes.push({
        id: n.id,
        label: n.mark ? `${n.key}*` : String(n.key),
        x: n.x, y: n.y,
        active: touchedIds.includes(n.id),
        compare: n === heap.min,
      });
      for (const c of n.children) { edges.push([n.id, c.id]); shift(c); }
    })(root);
  });
  return { kind: 'tree', line, code: CODE, caption, nodes, edges, emptyText: '(empty heap)' };
}

function* run(input) {
  resetIds();
  const heap = createHeap();
  const keys = input.array.slice();
  const n = keys.length;
  const nodeRefs = [];

  if (n === 0) {
    yield forestFrame(heap, { caption: 'An empty Fibonacci heap.', line: 0 });
    return { extracted: [], expected: [] };
  }

  for (let i = 0; i < n; i++) {
    const node = insert(heap, keys[i], []);
    nodeRefs.push(node);
    yield forestFrame(heap, { touchedIds: [node.id], caption: `Insert ${keys[i]}: a new single-node tree joins the root list. Current min: ${heap.min.key}.`, line: 0 });
  }

  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) {
      const dec = 1 + (i % 5);
      const newKey = keys[i] - dec;
      keys[i] = newKey;
      const log = [];
      decreaseKey(heap, nodeRefs[i], newKey, log);
      const cutIds = log.filter((e) => e.type === 'cut').map((e) => e.nodeId);
      yield forestFrame(heap, {
        touchedIds: cutIds.length ? cutIds : [nodeRefs[i].id],
        caption: cutIds.length
          ? `decreaseKey to ${newKey}: cut it (and cascade upward) into the root list.`
          : `decreaseKey to ${newKey}: still >= its parent's key, no cut needed.`,
        line: 4,
      });
    }
  }

  let heapOrdered = isHeapOrdered(heap);

  const extracted = [];
  let guard = 0;
  while (heap.roots.length > 0 && guard < n + 5) {
    guard++;
    const before = heap.roots.length;
    const m = extractMin(heap, []);
    extracted.push(m);
    heapOrdered = heapOrdered && isHeapOrdered(heap);
    yield forestFrame(heap, { caption: `extractMin() removes ${m}. Its children (if any) join the root list, then equal-degree roots consolidate (${before} root(s) before -> ${heap.roots.length} after).`, line: 1 });
  }

  return { extracted, expected: keys.slice().sort((a, b) => a - b), heapOrdered };
}

export default {
  id: 'fibonacci-heap',
  title: 'Fibonacci heaps',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'Fibonacci Heaps',
  summary:
    'A Fibonacci heap is a collection of heap-ordered trees sitting in a root list, deliberately left messy: insert just drops a new single-node tree in, O(1), with no attempt to keep anything balanced. ' +
    'That laziness is paid back at extract-min, which removes the minimum root, promotes its children to the root list, and then consolidates by repeatedly linking any two roots of equal degree (the larger key becomes a child of the smaller), until every remaining root has a distinct degree, leaving at most O(log n) roots to scan for the new minimum. ' +
    'Decrease-key just lowers a node\'s key and, if that breaks heap order with its parent, cuts it free into the root list. ' +
    'The clever part is the cascading cut: a node that has already lost one child to a cut gets marked, and the moment it would lose a second, it gets cut too (and unmarked), with the cut propagating upward, which is exactly what keeps any single tree from getting too lopsided and is the key to the amortised bound. ' +
    'This sandbox inserts every value from the array, decreases some of them, then repeatedly extracts the minimum until the heap is empty, so the sequence of extracted values has to come out in sorted order if the heap is working.',
  code: CODE,
  complexity: {
    time: 'Insert and decrease-key: O(1) amortised. Extract-min: O(log n) amortised.',
    why: 'CLRS bounds this with a potential function (number of trees plus twice the number of marked nodes). Insert and a decrease-key without cascading only add O(1) actual work and change the potential by O(1). A decrease-key\'s cascading cut can do many cuts in one call, but each cut un-marks a node and lowers the potential enough to pay for itself, leaving O(1) amortised. Extract-min\'s consolidation pass costs O(log n) amortised because a node can only reach degree k by having merged with k smaller-or-equal subtrees already, which (CLRS proves via Fibonacci numbers, the structure\'s namesake) bounds the maximum degree, and so the number of roots, by O(log n).',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 299));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (input.array.length === 0) return result.extracted.length === 0;
    if (result.heapOrdered === false) return false;
    return JSON.stringify(result.extracted) === JSON.stringify(result.expected);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 12 },
};
