// Binary max-heaps: insert, extract-max, sift up and down, and building a
// heap from scratch in O(n). No DOM access. A heap is really just an array
// with an implicit tree shape (index i's children are 2i+1 and 2i+2), so
// this draws it with `kind: 'tree'` using engine/layout.js's
// layoutHeapPositions, which computes that implicit shape directly from the
// array length instead of needing real node objects.
import { layoutHeapPositions } from '../engine/layout.js';

const CODE_SIFT_DOWN = [
  'siftDown(a, i, n):',
  '  loop:',
  '    largest = i; l = 2i+1; r = 2i+2',
  '    if l < n and a[l] > a[largest]: largest = l',
  '    if r < n and a[r] > a[largest]: largest = r',
  '    if largest == i: return   (heap property holds here)',
  '    swap a[i], a[largest]; i = largest',
];
const CODE_SIFT_UP = [
  'siftUp(a, i):',
  '  while i > 0 and a[parent(i)] < a[i]:',
  '    swap a[i], a[parent(i)]',
  '    i = parent(i)',
];
const CODE_BUILD = [
  'buildMaxHeap(a):',
  '  for i from floor(n/2)-1 down to 0:',
  '    siftDown(a, i, n)',
];
const CODE_EXTRACT = [
  'extractMax(a):',
  '  max = a[0]',
  '  a[0] = a[n-1]; remove last element',
  '  siftDown(a, 0, n-1)',
  '  return max',
];

function isMaxHeap(a) {
  for (let i = 0; i < a.length; i++) {
    const l = 2 * i + 1, r = 2 * i + 2;
    if (l < a.length && a[l] > a[i]) return false;
    if (r < a.length && a[r] > a[i]) return false;
  }
  return true;
}

function* run(input) {
  const a = input.array.slice();
  let comparisons = 0, swaps = 0;
  const counters = () => ({ comparisons, swaps });

  function frame(opts) {
    const positions = layoutHeapPositions(a.length);
    const activeSet = new Set(opts.activeIds || []);
    const compareSet = new Set(opts.compareIds || []);
    const nodes = a.map((v, i) => ({
      id: i,
      label: String(v),
      x: positions[i].x,
      y: positions[i].y,
      active: activeSet.has(i),
      compare: compareSet.has(i),
    }));
    const edges = [];
    for (let i = 0; i < a.length; i++) {
      if (2 * i + 1 < a.length) edges.push([i, 2 * i + 1]);
      if (2 * i + 2 < a.length) edges.push([i, 2 * i + 2]);
    }
    return { kind: 'tree', nodes, edges, emptyText: '(empty heap)', counters: counters(), ...opts };
  }

  function* siftDown(n, startI, code) {
    let i = startI;
    while (true) {
      let largest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      yield frame({ activeIds: [i], compareIds: [l, r].filter((x) => x < n), caption: `Sift down from index ${i} (=${a[i]}): compare it with its children.`, line: 1, code });
      if (l < n) { comparisons++; if (a[l] > a[largest]) largest = l; }
      if (r < n) { comparisons++; if (a[r] > a[largest]) largest = r; }
      if (largest === i) {
        yield frame({ activeIds: [i], caption: `Index ${i} (=${a[i]}) is already at least as big as both children. Heap property holds here.`, line: 5, code });
        return;
      }
      const tmp = a[i]; a[i] = a[largest]; a[largest] = tmp;
      swaps++;
      yield frame({ activeIds: [i, largest], caption: `A child was bigger than its parent: swap ${a[i]} and ${a[largest]}.`, line: 6, code });
      i = largest;
    }
  }

  function* siftUp(startI, code) {
    let i = startI;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      comparisons++;
      yield frame({ activeIds: [i, p], caption: `Compare the new node (${a[i]}) with its parent (${a[p]}).`, line: 1, code });
      if (a[p] >= a[i]) {
        yield frame({ activeIds: [i], caption: `The parent is already bigger. Sifting up stops here.`, line: 1, code });
        return;
      }
      const tmp = a[i]; a[i] = a[p]; a[p] = tmp;
      swaps++;
      yield frame({ activeIds: [i, p], caption: `Parent was smaller: swap it up to index ${p}.`, line: 2, code });
      i = p;
    }
    yield frame({ activeIds: [i], caption: `Reached the root. Sifting up is done.`, line: 1, code });
  }

  yield frame({ caption: `Starting from an array of ${a.length} item${a.length === 1 ? '' : 's'}, treated as a heap-shaped tree.`, line: 0, code: CODE_BUILD });

  for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) {
    yield* siftDown(a.length, i, CODE_BUILD);
  }
  const afterBuild = a.slice();
  const buildValid = isMaxHeap(afterBuild);
  yield frame({ caption: `Build-heap is done in O(n): every index from the bottom-most internal node up to the root has been sifted down.`, line: 2, code: CODE_BUILD });

  a.push(input.insertValue);
  yield frame({ activeIds: [a.length - 1], caption: `Insert ${input.insertValue} at the end of the array, then sift it up.`, line: 0, code: CODE_SIFT_UP });
  yield* siftUp(a.length - 1, CODE_SIFT_UP);
  const afterInsert = a.slice();
  const insertValid = isMaxHeap(afterInsert);

  const max = a.length ? a[0] : null;
  let afterExtract = a.slice();
  let extractValid = true;
  if (a.length) {
    yield frame({ activeIds: [0], caption: `Extract-max: the maximum is always at the root, ${max}.`, line: 0, code: CODE_EXTRACT });
    a[0] = a[a.length - 1];
    a.pop();
    yield frame({ activeIds: a.length ? [0] : [], caption: `Move the last element to the root and shrink the heap by one, then sift down.`, line: 1, code: CODE_EXTRACT });
    yield* siftDown(a.length, 0, CODE_EXTRACT);
    afterExtract = a.slice();
    extractValid = isMaxHeap(afterExtract);
  }

  yield frame({ caption: `Done: built a heap, inserted ${input.insertValue}, then extracted the max (${max}).`, line: 0, code: CODE_BUILD });

  return { afterBuild, buildValid, afterInsert, insertValid, max, afterExtract, extractValid };
}

export default {
  id: 'heap',
  title: 'Binary heaps',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Heapsort',
  summary:
    'A binary max-heap stores values in an array but treats it as a complete binary tree: index i\'s children live at 2i+1 and 2i+2. ' +
    'The only rule is that every node is at least as big as both of its children, so the biggest value is always sitting at the root. ' +
    'Sift down fixes a node that might be too small by repeatedly swapping it with its biggest child, until it settles somewhere the rule holds again. ' +
    'Sift up does the opposite for a node that might be too big, bubbling it up toward the root. ' +
    'Building a heap from scratch by sifting down every internal node, from the bottom up, takes O(n) total, not O(n log n), because most nodes are near the bottom and only sift a short distance. ' +
    'Insert appends a value and sifts it up; extract-max swaps the root with the last element, shrinks the array, and sifts down, both O(log n).',
  code: CODE_SIFT_DOWN,
  complexity: {
    time: 'Insert and extract-max: O(log n). Build-heap from n items: O(n), not O(n log n).',
    why: 'Sifting (up or down) moves one level per step, and a heap of n nodes has height O(log n), so each sift is O(log n). Build-heap looks like n calls to sift-down (which would suggest O(n log n)), but most nodes are near the bottom of the tree and have almost no distance left to sift; summing the actual work over all starting heights gives a geometric-like series that totals O(n).',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 99));
    const insertValue = 1 + Math.floor(rng() * 99);
    return { array, insertValue };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const multiset = (arr) => arr.slice().sort((x, y) => x - y);
    if (!result.buildValid) return false;
    if (multiset(result.afterBuild).join(',') !== multiset(input.array).join(',')) return false;
    if (!result.insertValid) return false;
    const expectedAfterInsert = multiset([...input.array, input.insertValue]);
    if (multiset(result.afterInsert).join(',') !== expectedAfterInsert.join(',')) return false;
    if (!result.extractValid) return false;
    if (result.max !== Math.max(...result.afterInsert)) return false;
    const expectedAfterExtract = expectedAfterInsert.slice();
    expectedAfterExtract.splice(expectedAfterExtract.indexOf(result.max), 1);
    return multiset(result.afterExtract).join(',') === expectedAfterExtract.join(',');
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
