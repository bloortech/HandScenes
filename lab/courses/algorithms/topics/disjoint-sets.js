// Disjoint sets (union-find): a forest of trees, one per set, with union
// by rank (attach the shallower tree under the deeper one) and path
// compression (every node visited by find points straight at the root
// afterward). No DOM access. Logic lives in engine/unionfind.js; this file
// turns its event log into frames, drawing the whole forest as a set of
// small trees side by side (reusing the tree renderer, just with several
// roots instead of one).
import { makeSets, find, union, components } from '../engine/unionfind.js';
import { layoutTree } from '../engine/layout.js';

const CODE = [
  'find(x): while parent[x] != x: x = parent[x]; return x',
  '  (path compression: point every visited node straight at the root)',
  'union(a, b):',
  '  ra = find(a); rb = find(b)',
  '  if ra == rb: return   # already in the same set',
  '  attach the shallower root under the deeper one   # union by rank',
];

function buildChildren(parent) {
  const n = parent.length;
  const children = Array.from({ length: n }, () => []);
  const roots = [];
  for (let i = 0; i < n; i++) {
    if (parent[i] === i) roots.push(i);
    else children[parent[i]].push(i);
  }
  return { children, roots };
}

function forestFrame(parent, { touched = [], caption, line }) {
  const { children, roots } = buildChildren(parent);
  const nodes = [];
  const edges = [];
  const slotW = 100 / Math.max(1, roots.length);
  roots.forEach((r, slot) => {
    const node = { id: r, children: children[r].map((c) => wrap(c)) };
    function wrap(id) {
      return { id, children: children[id].map(wrap) };
    }
    layoutTree(node, { width: slotW, padX: slotW * 0.12, padY: 12 });
    (function shift(n2) {
      n2.x += slot * slotW;
      nodes.push({ id: n2.id, label: String(n2.id), x: n2.x, y: n2.y, active: touched.includes(n2.id), compare: false });
      for (const c of n2.children) { edges.push([c.id, n2.id]); shift(c); }
    })(node);
  });
  return { kind: 'tree', line, code: CODE, caption, nodes, edges, emptyText: '(no elements)' };
}

function* run(input) {
  const n = input.n;
  const uf = makeSets(n);
  if (n === 0) {
    yield forestFrame(uf.parent, { caption: 'No elements to union.', line: 0 });
    return { parent: [], n: 0 };
  }
  yield forestFrame(uf.parent, { caption: `Start with ${n} singleton sets: every element is its own root.`, line: 0 });

  const pairs = [];
  for (let i = 0; i + 1 < input.array.length; i += 2) {
    const norm = (v) => ((Math.trunc(v) % n) + n) % n;
    pairs.push([norm(input.array[i]), norm(input.array[i + 1])]);
  }

  for (const [a, b] of pairs) {
    const log = [];
    const ra = find(uf, a, log);
    yield forestFrame(uf.parent, { touched: [a, ra], caption: `find(${a}) walks up to root ${ra}, compressing every node on the way.`, line: 0 });
    const rb = find(uf, b, log);
    yield forestFrame(uf.parent, { touched: [b, rb], caption: `find(${b}) walks up to root ${rb}, compressing every node on the way.`, line: 0 });
    if (ra === rb) {
      yield forestFrame(uf.parent, { touched: [ra], caption: `${a} and ${b} are already in the same set (root ${ra}). Nothing to do.`, line: 4 });
    } else {
      union(uf, a, b, []);
      const newRoot = uf.parent[ra] === ra ? ra : rb;
      yield forestFrame(uf.parent, { touched: [ra, rb], caption: `union(${a}, ${b}): attach the shallower tree under the other, root is now ${find(uf, a, [])}.`, line: 5 });
      void newRoot;
    }
  }

  return { parent: uf.parent.slice(), n };
}

export default {
  id: 'disjoint-sets',
  title: 'Disjoint sets (union-find)',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'Data Structures for Disjoint Sets',
  summary:
    'A disjoint-set forest keeps each set as a tree, where every node points at its parent and a set\'s representative is whichever node points at itself (the root). ' +
    'find(x) just walks parent pointers up to the root; union(a, b) finds both roots and, if they differ, makes one point at the other. ' +
    'Two tricks keep this fast: union by rank always attaches the shallower tree under the deeper one, so trees never get taller than they have to, and path compression has every find reattach every node it just walked through directly to the root, flattening the tree for next time. ' +
    'Neither trick alone gets the best bound, but together CLRS proves m operations on n elements cost O(m * alpha(n)), where alpha is the inverse Ackermann function, so slow-growing it is effectively a constant for any n that could exist in memory. ' +
    'This sandbox reads the array two numbers at a time as a sequence of union(a, b) requests (each number taken mod the element count), and draws the forest as a handful of small trees side by side, one per surviving set.',
  code: CODE,
  complexity: {
    time: 'O(alpha(n)) amortised per operation, with union by rank and path compression together.',
    why: 'Union by rank alone bounds every tree\'s height by O(log n); path compression alone already gives an O(log n) amortised bound via a potential argument; combined, CLRS proves a tighter bound of O(alpha(n)) per operation over a sequence of m operations, where alpha grows so slowly that it is at most 4 for any n that could ever be stored.',
  },
  makeInput(rng, size) {
    const n = Math.max(1, size);
    const array = [];
    const pairCount = Math.max(0, size - 1) + Math.floor(rng() * 3);
    for (let i = 0; i < pairCount * 2; i++) array.push(Math.floor(rng() * n));
    return { array, n };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const n = Math.max(0, input.n | 0);
    if (n === 0) return result.parent.length === 0;
    if (result.parent.length !== n) return false;

    // Recompute the expected partition with a plain reference union-find
    // (no compression needed for correctness, just for connectivity), using
    // the exact same pair-extraction rule the topic's run() uses.
    const refParent = Array.from({ length: n }, (_, i) => i);
    function refFind(x) { while (refParent[x] !== x) x = refParent[x]; return x; }
    const norm = (v) => ((Math.trunc(v) % n) + n) % n;
    for (let i = 0; i + 1 < input.array.length; i += 2) {
      const a = norm(input.array[i]), b = norm(input.array[i + 1]);
      const ra = refFind(a), rb = refFind(b);
      if (ra !== rb) refParent[ra] = rb;
    }

    const expected = components(refParent);
    const got = components(result.parent);
    return JSON.stringify(expected) === JSON.stringify(got);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
