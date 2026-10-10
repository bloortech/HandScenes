// Kruskal's algorithm for minimum spanning trees: sort every edge by
// weight, then greedily add each one unless it would close a cycle (which
// a disjoint-set forest answers in O(alpha(n))). No DOM access. Reuses
// engine/unionfind.js, the same forest m05's disjoint-sets topic draws.
import { makeRandomGraph, adjList } from '../engine/graph.js';
import { makeSets, find, union } from '../engine/unionfind.js';
import { layoutCircle, layoutTree } from '../engine/layout.js';

const CODE = [
  'sort edges by weight, ascending',
  'for (u, v, w) in sorted edges:',
  '  if find(u) != find(v):   # adding it would not close a cycle',
  '    add (u, v) to the MST; union(u, v)',
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

// Draws the graph (top half) with MST edges highlighted and the current
// disjoint-set forest (bottom half) side by side, by stacking two sets of
// node/edge coordinates into one normalised 0..100 box.
function frame(nodes, edges, mstSet, uf, candidate, caption, line) {
  const graphNodes = nodes.map((nd) => ({
    id: `g${nd.id}`,
    label: String(nd.id),
    x: nd.x,
    y: nd.y * 0.42,
    active: candidate && (nd.id === candidate.u || nd.id === candidate.v),
  }));
  const graphEdges = edges.map((e, i) => [
    `g${e.u}`,
    `g${e.v}`,
    mstSet.has(i) ? `${e.w}*` : String(e.w),
  ]);

  const { children, roots } = buildChildren(uf.parent);
  const forestNodes = [];
  const forestEdges = [];
  const slotW = 100 / Math.max(1, roots.length);
  roots.forEach((r, slot) => {
    const wrap = (id) => ({ id, children: children[id].map(wrap) });
    const root = wrap(r);
    layoutTree(root, { width: slotW, padX: slotW * 0.12, padY: 10 });
    (function place(nd) {
      forestNodes.push({
        id: `f${nd.id}`,
        label: String(nd.id),
        x: nd.x + slot * slotW,
        y: 56 + nd.y * 0.4,
        active: candidate && (nd.id === candidate.u || nd.id === candidate.v),
      });
      for (const c of nd.children) { forestEdges.push([`f${c.id}`, `f${nd.id}`]); place(c); }
    })(root);
  });

  return {
    kind: 'tree',
    line,
    code: CODE,
    caption,
    nodes: [...graphNodes, ...forestNodes],
    edges: [...graphEdges, ...forestEdges],
  };
}

function* run(input) {
  const { n, edges } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes, { cy: 30, r: 26 });
  const uf = makeSets(n);
  const sorted = edges.map((e, i) => ({ ...e, origIdx: i })).sort((a, b) => a.w - b.w);
  const mstSet = new Set();
  const mstEdges = [];
  let total = 0;

  yield frame(nodes, edges, mstSet, uf, null, `Sort all ${edges.length} edges by weight: ${sorted.map((e) => e.w).join(', ')}.`, 0);
  for (const e of sorted) {
    const ra = find(uf, e.u, []);
    const rb = find(uf, e.v, []);
    if (ra !== rb) {
      union(uf, e.u, e.v, []);
      mstSet.add(e.origIdx);
      mstEdges.push({ u: e.u, v: e.v, w: e.w });
      total += e.w;
      yield frame(nodes, edges, mstSet, uf, e, `Edge (${e.u}, ${e.v}) weight ${e.w}: different sets, add it. Total weight so far: ${total}.`, 3);
    } else {
      yield frame(nodes, edges, mstSet, uf, e, `Edge (${e.u}, ${e.v}) weight ${e.w}: same set already, skip it (would close a cycle).`, 2);
    }
  }
  yield frame(nodes, edges, mstSet, uf, null, `Done. MST weight: ${total}.`, 0);
  return { mstEdges, total };
}

export default {
  id: 'kruskal',
  title: "Kruskal's algorithm",
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'Minimum Spanning Trees',
  summary:
    'A minimum spanning tree (MST) connects every vertex of a weighted, undirected graph using the smallest possible total edge weight, with no cycles. ' +
    "Kruskal's algorithm builds one greedily: sort every edge cheapest first, and add each edge unless its two endpoints are already connected by edges already chosen (which would make a cycle). " +
    'That "already connected" question is exactly what a disjoint-set forest answers fast: each vertex starts in its own set, and adding an edge unions its two endpoints\' sets. ' +
    'The top half of this sandbox is the graph, with chosen MST edges marked with a star; the bottom half is the live union-find forest, growing a new tree every time an edge merges two sets. ' +
    "The greedy choice is always safe here because of the cut property: the cheapest edge crossing any cut of the graph is in some MST, and sorting by weight guarantees that edge gets offered first.",
  code: CODE,
  complexity: {
    time: 'O(E log E) (equivalently O(E log V)).',
    why: 'Sorting the edges dominates; after that, each of the E edges does one O(alpha(V)) find and at most one union, which is negligible next to the sort.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: false, weighted: true, extraEdgeFraction: 0.45 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    if (n <= 1) return result.mstEdges.length === 0 && result.total === 0;
    if (result.mstEdges.length !== n - 1) return false;

    // Spanning + acyclic: a fresh union-find over just the chosen edges
    // should merge everything into one set with no edge ever finding an
    // already-same root.
    const uf = makeSets(n);
    for (const { u, v } of result.mstEdges) {
      const ra = find(uf, u, []);
      const rb = find(uf, v, []);
      if (ra === rb) return false;
      union(uf, u, v, []);
    }
    const root0 = find(uf, 0, []);
    for (let i = 1; i < n; i++) if (find(uf, i, []) !== root0) return false;

    // Weight-optimality oracle: Prim's algorithm, run independently, must
    // reach the same total (MST weight is unique even when the tree isn't).
    const adj = adjList(n, edges, false);
    const inTree = Array(n).fill(false);
    const key = Array(n).fill(Infinity);
    key[0] = 0;
    let primTotal = 0;
    for (let k = 0; k < n; k++) {
      let best = -1, bestKey = Infinity;
      for (let v = 0; v < n; v++) if (!inTree[v] && key[v] < bestKey) { bestKey = key[v]; best = v; }
      if (best === -1) break;
      inTree[best] = true;
      primTotal += bestKey;
      for (const { to: v, w } of adj[best]) if (!inTree[v] && w < key[v]) key[v] = w;
    }
    return result.total === primTotal;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
