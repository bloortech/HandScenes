// Induction, animated as falling dominoes (simple and strong) plus
// structural induction built up from the leaves of a tree. No DOM access.
// Three modes, picked at random by makeInput the same way recursion-stack
// picks between factorial/fib/fib-memo:
//   'simple'     - P(0): sum_{i=1}^0 i = 0. P(k) => P(k+1): adding one more
//                  domino. Proves sum_{i=1}^n i = n(n+1)/2.
//   'strong'     - needs the last TWO dominoes down, not just one, to prove
//                  F(n) < 2^n for a Fibonacci-like sequence F.
//   'structural' - a full binary tree (every internal node has exactly two
//                  children) built leaf-by-leaf; proves leaves = internal+1
//                  by combining the property from a node's two subtrees.

import { layoutTree } from '../engine/layout.js';

const CODE_SIMPLE = [
  'Claim: for all n >= 0, sum_{i=1}^{n} i = n(n+1)/2.',
  'Base case P(0): the empty sum is 0 = 0(1)/2. True.',
  'Inductive step: assume P(k) holds, show P(k+1) holds.',
  '  sum_{i=1}^{k+1} i = (sum_{i=1}^{k} i) + (k+1) = k(k+1)/2 + (k+1)',
  '                     = (k+1)(k+2)/2, which is exactly P(k+1).',
];
const CODE_STRONG = [
  'Claim: for all n >= 1, F(n) < 2^n, where F(1)=1, F(2)=1, F(n)=F(n-1)+F(n-2).',
  'Base cases P(1), P(2): F(1)=1<2, F(2)=1<4. True.',
  'Inductive step (strong): assume P(k-1) AND P(k-2) hold, show P(k) holds.',
  '  F(k) = F(k-1) + F(k-2) < 2^(k-1) + 2^(k-2) < 2^(k-1) + 2^(k-1) = 2^k.',
  '  This needs BOTH previous cases, not just the one before it.',
];
const CODE_STRUCTURAL = [
  'Claim: in any full binary tree (every internal node has 2 children),',
  '  leaves = internal nodes + 1.',
  'Base case: a single leaf. leaves=1, internal=0. 1 = 0+1. True.',
  'Inductive step: a tree built from two full subtrees T1, T2 joined under',
  '  a new root. If leaves(Ti) = internal(Ti)+1 for each Ti, then the whole',
  '  tree has leaves = leaves(T1)+leaves(T2), internal = internal(T1)+internal(T2)+1,',
  '  so leaves = (internal(T1)+1)+(internal(T2)+1) = internal+1. True.',
];

function dominoFrame(nodes, { activeIds = [], fallenIds = [], caption, line, code }) {
  const n = Math.max(1, nodes.length);
  const boxes = nodes.map((nd, i) => ({
    id: nd.id,
    label: nd.label,
    x: n === 1 ? 50 : 6 + (i / (n - 1)) * 88,
    y: 50,
    w: Math.max(6, Math.min(16, 90 / n)),
    h: 20,
    active: activeIds.includes(nd.id),
    dim: fallenIds.includes(nd.id) && !activeIds.includes(nd.id),
  }));
  return { kind: 'boxes', line, code, caption, nodes: boxes, edges: [], pointers: [] };
}

function* runSimple(n) {
  const nodes = Array.from({ length: n + 1 }, (_, i) => ({ id: i, label: `P(${i})` }));
  const fallen = [];
  yield dominoFrame(nodes, { activeIds: [0], fallenIds: fallen, line: 1, code: CODE_SIMPLE, caption: 'Base case P(0): the empty sum is 0, and 0(1)/2 = 0. Domino 0 falls.' });
  fallen.push(0);
  for (let k = 0; k < n; k++) {
    yield dominoFrame(nodes, { activeIds: [k, k + 1], fallenIds: fallen, line: 2, code: CODE_SIMPLE, caption: `P(${k}) has fallen, so it knocks over P(${k + 1}): sum_{i=1}^{${k + 1}} i = ${k}(${k}+1)/2 + ${k + 1} = ${k + 1}(${k + 2})/2.` });
    fallen.push(k + 1);
  }
  yield dominoFrame(nodes, { activeIds: [], fallenIds: fallen, line: 3, code: CODE_SIMPLE, caption: `Every domino from P(0) to P(${n}) has fallen. The formula holds for all of them.` });
  return { mode: 'simple', n, fallenCount: fallen.length };
}

function* runStrong(n) {
  const nodes = Array.from({ length: n + 1 }, (_, i) => ({ id: i, label: `P(${i})` }));
  const fallen = [];
  if (n >= 1) {
    yield dominoFrame(nodes, { activeIds: [1], fallenIds: fallen, line: 1, code: CODE_STRONG, caption: 'Base case P(1): F(1) = 1 < 2^1 = 2. Domino 1 falls.' });
    fallen.push(1);
  }
  if (n >= 2) {
    yield dominoFrame(nodes, { activeIds: [2], fallenIds: fallen, line: 1, code: CODE_STRONG, caption: 'Base case P(2): F(2) = 1 < 2^2 = 4. Domino 2 falls.' });
    fallen.push(2);
  }
  for (let k = 3; k <= n; k++) {
    yield dominoFrame(nodes, { activeIds: [k - 2, k - 1, k], fallenIds: fallen, line: 3, code: CODE_STRONG, caption: `P(${k - 1}) AND P(${k - 2}) have both fallen, so together they knock over P(${k}): F(${k}) = F(${k - 1}) + F(${k - 2}) < 2^${k - 1} + 2^${k - 2} < 2^${k}.` });
    fallen.push(k);
  }
  yield dominoFrame(nodes, { activeIds: [], fallenIds: fallen, line: 3, code: CODE_STRONG, caption: `Every domino from P(1) to P(${n}) has fallen, each one needing both of the two before it.` });
  return { mode: 'strong', n, fallenCount: fallen.length };
}

// Builds a full binary tree with exactly `leafTarget` leaves by repeatedly
// splitting a random current leaf into two new leaves.
function buildFullTree(rng, leafTarget) {
  let nextId = 0;
  const root = { id: nextId++, isLeaf: true, children: [] };
  let leaves = [root];
  while (leaves.length < leafTarget) {
    const idx = Math.floor(rng() * leaves.length);
    const node = leaves[idx];
    node.isLeaf = false;
    const a = { id: nextId++, isLeaf: true, children: [] };
    const b = { id: nextId++, isLeaf: true, children: [] };
    node.children = [a, b];
    leaves.splice(idx, 1, a, b);
  }
  return root;
}

function countLeavesInternal(node) {
  if (node.isLeaf) return { leaves: 1, internal: 0 };
  const l = countLeavesInternal(node.children[0]);
  const r = countLeavesInternal(node.children[1]);
  return { leaves: l.leaves + r.leaves, internal: l.internal + r.internal + 1 };
}

function treeFrameFor(root, allNodes, edges, { doneIds = [], activeId = null, caption, line }) {
  const nodes = allNodes.map((n) => ({
    id: n.id,
    label: n.isLeaf ? 'leaf' : (n.counted ? `L=${n.counted.leaves} I=${n.counted.internal}` : '?'),
    x: n.x,
    y: n.y,
    active: n.id === activeId,
    compare: doneIds.includes(n.id) && n.id !== activeId,
  }));
  return { kind: 'tree', line, code: CODE_STRUCTURAL, caption, nodes, edges };
}

function* runStructural(rng, leafTarget) {
  const root = buildFullTree(rng, leafTarget);
  // Lay the tree out using the same leaf-counting layout as other trees
  // (layoutTree only needs `.children`, which `root` already has, and it
  // mutates x/y directly on the same node objects).
  layoutTree(root);

  const allNodes = [];
  const edges = [];
  (function collect(node) {
    allNodes.push(node);
    for (const c of node.children) { edges.push([node.id, c.id]); collect(c); }
  })(root);

  const doneIds = [];
  function* visit(node) {
    for (const c of node.children) yield* visit(c);
    if (node.isLeaf) {
      node.counted = { leaves: 1, internal: 0 };
      yield treeFrameFor(root, allNodes, edges, { doneIds, activeId: node.id, line: 2, caption: 'Base case: a single leaf has 1 leaf and 0 internal nodes.' });
    } else {
      const l = node.children[0].counted, r = node.children[1].counted;
      node.counted = { leaves: l.leaves + r.leaves, internal: l.internal + r.internal + 1 };
      yield treeFrameFor(root, allNodes, edges, { doneIds, activeId: node.id, line: 4, caption: `Combine two full subtrees (each already satisfying leaves = internal+1) under a new root: ${node.counted.leaves} leaves, ${node.counted.internal} internal nodes.` });
    }
    doneIds.push(node.id);
  }
  yield* visit(root);
  const final = root.counted;
  yield treeFrameFor(root, allNodes, edges, { doneIds, activeId: null, line: 4, caption: `Whole tree: ${final.leaves} leaves, ${final.internal} internal nodes. ${final.leaves} = ${final.internal} + 1 holds.` });
  return { mode: 'structural', leaves: final.leaves, internal: final.internal };
}

function* run(input) {
  if (input.mode === 'simple') return yield* runSimple(input.n);
  if (input.mode === 'strong') return yield* runStrong(input.n);
  const rng = mulberrySeeded(input.seed);
  return yield* runStructural(rng, input.leaves);
}

// run() needs its own rng for the structural mode's random tree shape, but
// run() only receives `input` (not the rng makeInput used), so makeInput
// stashes a plain integer seed in the input and run() rebuilds a tiny rng
// from it. Keeps `run` a pure function of `input`, as the engine requires.
function mulberrySeeded(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'induction',
  title: 'Induction',
  module: 'm03',
  course: 'CSC236/240',
  clrs: 'Divide-and-Conquer (the Master theorem proof itself is an induction; CLRS also uses induction throughout for loop invariants)',
  summary:
    'Induction proves a claim P(n) for every natural number n by proving just two things: a base case (P(0), or P(1), or whatever the smallest case is), and an inductive step that P(k) implies P(k+1). ' +
    'Think of it as a row of dominoes: if the first one falls, and every domino falling always knocks over the next one, every domino eventually falls. ' +
    'Strong induction is the same idea with a longer reach: the inductive step gets to assume P holds for every smaller case, not just the one right before it, which is exactly what a Fibonacci-style recurrence needs since F(k) depends on both F(k-1) and F(k-2). ' +
    'Structural induction swaps "smaller number" for "smaller piece of a data structure": to prove something about every tree, prove it for a single leaf (the base case), then show that combining two subtrees that already satisfy the claim under a new root keeps it satisfied. ' +
    'CSC236/240 builds its whole proof toolkit on these three shapes of induction, and this course will reuse simple and strong induction again when it proves recurrences correct and the Master theorem\'s bound.',
  code: CODE_SIMPLE,
  complexity: {
    time: 'Not an algorithm, so no running time; the "cost" here is proof length, which is linear in n for all three modes shown.',
    why: 'Each mode does one base case plus one inductive step per additional case (or, for the structural mode, one combining step per internal node of the tree), so the number of steps in the proof is linear in n (or in the number of tree nodes).',
  },
  makeInput(rng, size) {
    const roll = rng();
    const mode = roll < 1 / 3 ? 'simple' : roll < 2 / 3 ? 'strong' : 'structural';
    if (mode === 'structural') {
      const leaves = Math.max(1, Math.min(12, size || 1));
      const seed = 1 + Math.floor(rng() * 1_000_000);
      return { mode, leaves, seed };
    }
    const n = Math.max(mode === 'strong' ? 1 : 0, Math.min(18, size));
    return { mode, n };
  },
  run,
  check(input, result) {
    if (!result || result.mode !== input.mode) return false;
    if (input.mode === 'simple') {
      const n = Math.max(0, Math.min(18, input.n));
      return result.n === n && result.fallenCount === n + 1;
    }
    if (input.mode === 'strong') {
      const n = Math.max(1, Math.min(18, input.n));
      return result.n === n && result.fallenCount === n;
    }
    const leaves = Math.max(1, Math.min(12, input.leaves || 1));
    return result.leaves === leaves && result.internal === leaves - 1;
  },
  sandbox: { type: 'n', min: 0, max: 18, default: 6, label: 'n' },
};
