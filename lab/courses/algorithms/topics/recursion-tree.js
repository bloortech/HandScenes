// Expands T(n) = a*T(n/b) + f(n), with f(n) = c*n^d, level by level, drawn as
// a literal recursion tree: each node is one subproblem, labelled with its
// size and its own cost (not counting its children), and the running total
// is the sum of every node's cost built so far. No DOM access.
import { layoutTree } from '../engine/layout.js';

const CODE = [
  'T(n) = a*T(n/b) + f(n), f(n) = c*n^d',
  'Level 0: 1 subproblem of size n, costing f(n).',
  'Level k: a^k subproblems of size n/b^k, each costing f(n/b^k).',
  'Total work = sum over all levels of (a^k * f(n/b^k)).',
];

function levelCost(a, b, d, c, L, k) {
  return Math.pow(a, k) * c * Math.pow(b, (L - k) * d);
}

function buildTree(a, b, c, d, n0, L) {
  let id = 0;
  function build(n, depth) {
    const cost = c * Math.pow(n, d);
    const node = { id: id++, n, depth, cost, children: [] };
    if (depth < L) {
      for (let i = 0; i < a; i++) node.children.push(build(n / b, depth + 1));
    }
    return node;
  }
  return build(n0, 0);
}

function collect(root) {
  const nodes = [];
  const edges = [];
  (function walk(node) {
    nodes.push(node);
    for (const c of node.children) { edges.push([node.id, c.id]); walk(c); }
  })(root);
  return { nodes, edges };
}

function* run(input) {
  const { a, b, c, d, L } = input;
  const n0 = Math.pow(b, L);
  const root = buildTree(a, b, c, d, n0, L);
  layoutTree(root);
  const { nodes: allNodes, edges } = collect(root);
  const byDepth = (k) => allNodes.filter((n) => n.depth === k);

  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

  let runningTotal = 0;
  for (let k = 0; k <= L; k++) {
    const levelNodes = byDepth(k);
    const thisLevelCost = levelNodes.reduce((s, n) => s + n.cost, 0);
    runningTotal += thisLevelCost;
    const activeIds = new Set(levelNodes.map((n) => n.id));
    const builtIds = new Set(allNodes.filter((n) => n.depth <= k).map((n) => n.id));
    const nodes = allNodes
      .filter((n) => builtIds.has(n.id))
      .map((n) => ({ id: n.id, label: `${fmt(n.n)}/${fmt(n.cost)}`, x: n.x, y: n.y, active: activeIds.has(n.id), dim: !activeIds.has(n.id) }));
    const visibleEdges = edges.filter(([f, t]) => builtIds.has(f) && builtIds.has(t));
    yield {
      kind: 'tree',
      line: k === 0 ? 1 : 2,
      code: CODE,
      caption: `Level ${k}: ${levelNodes.length} subproblem${levelNodes.length === 1 ? '' : 's'} of size ${fmt(levelNodes[0].n)}, each costing ${fmt(levelNodes[0].cost)}. Level total: ${fmt(thisLevelCost)}. Running total: ${fmt(runningTotal)}.`,
      nodes,
      edges: visibleEdges,
      counters: { level: k, levelTotal: Math.round(thisLevelCost * 100) / 100, runningTotal: Math.round(runningTotal * 100) / 100 },
    };
  }
  yield {
    kind: 'tree',
    line: 3,
    code: CODE,
    caption: `All ${L + 1} levels summed: T(${fmt(n0)}) = ${fmt(runningTotal)}.`,
    nodes: allNodes.map((n) => ({ id: n.id, label: `${fmt(n.n)}/${fmt(n.cost)}`, x: n.x, y: n.y, dim: true })),
    edges,
  };
  return { a, b, c, d, L, n0, total: runningTotal };
}

export default {
  id: 'recursion-tree',
  title: 'Recursion trees',
  module: 'm03',
  course: 'CSC236/240',
  clrs: 'Divide-and-Conquer',
  summary:
    'A recursion tree makes a divide-and-conquer recurrence T(n) = aT(n/b) + f(n) concrete: draw one node per subproblem, label it with the cost f of just that call (not its children), and the total running time is the sum of every node\'s label. ' +
    'Level 0 is the original call, costing f(n). Level 1 has a calls, each on a problem of size n/b, so it costs a times f(n/b). Level k has a^k calls on problems of size n/b^k. ' +
    'The tree bottoms out once n/b^k shrinks to the base case, after log_b(n) levels. Summing every level\'s total gives the exact running time, and which part of that sum dominates (the top level, every level equally, or the bottom levels) is exactly the question the Master theorem answers in one shot. ' +
    'This sandbox lets you pick a, b, and the exponent d in f(n) = c*n^d, then watch the tree grow level by level with a running total, so you can see the sum build up before trusting the closed-form shortcut. ' +
    'CLRS introduces recursion trees as the "expand it by hand" method, right before giving the Master theorem as a faster way to get the same answer.',
  code: CODE,
  complexity: {
    time: 'Depends on a, b, and d: see the master-theorem topic for the three cases. Building and summing the tree itself takes O(a^L) time and space, where L is the number of levels, since that is how many nodes it has.',
    why: 'Each level k has a^k nodes, and there are L+1 levels, so the tree has Theta(a^L) nodes total when a > 1 (geometric growth dominated by the last level); summing them is linear in the number of nodes.',
  },
  makeInput(rng, size) {
    const a = 1 + Math.floor(rng() * 3); // 1..3
    const b = 2 + Math.floor(rng() * 2); // 2..3
    const d = Math.floor(rng() * 3); // 0..2
    const c = 1 + Math.floor(rng() * 3); // 1..3
    const L = Math.max(1, Math.min(5, size || 1));
    return { a, b, c, d, L };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b, c, d, L } = input;
    let expected = 0;
    for (let k = 0; k <= L; k++) expected += levelCost(a, b, d, c, L, k);
    return result.L === L && result.a === a && result.b === b && result.c === c && result.d === d && Math.abs(result.total - expected) < 1e-6;
  },
  sandbox: { type: 'n', min: 1, max: 5, default: 3, label: 'levels' },
};
