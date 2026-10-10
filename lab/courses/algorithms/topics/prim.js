// Prim's algorithm for minimum spanning trees: grow one tree from an
// arbitrary root, always adding the cheapest edge that reaches a new
// vertex. No DOM access.
import { makeRandomGraph, adjList } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'key[root] = 0, key[*] = Infinity, inTree[*] = false',
  'for n iterations:',
  '  u = vertex not in tree with the smallest key   # the fringe edge to add',
  '  inTree[u] = true',
  '  for (u, v, w) in Adj[u]: if not inTree[v] and w < key[v]: key[v] = w; parent[v] = u',
];

function frame(nodes, edges, inTree, key, active, mstEdges, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: inTree[nd.id] ? String(nd.id) : `${nd.id}(${key[nd.id] === Infinity ? '-' : key[nd.id]})`,
    active: nd.id === active,
    memoHit: inTree[nd.id] && nd.id !== active,
    dim: !inTree[nd.id],
  }));
  const mstKeys = new Set(mstEdges.map((e) => `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`));
  const dispEdges = edges.map((e) => [e.u, e.v, mstKeys.has(`${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`) ? `${e.w}*` : String(e.w)]);
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: dispEdges };
}

function* run(input) {
  const { n, edges } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  if (n === 0) return { mstEdges: [], total: 0 };
  const adj = adjList(n, edges, false);
  const inTree = Array(n).fill(false);
  const key = Array(n).fill(Infinity);
  const parent = Array(n).fill(-1);
  key[0] = 0;
  const mstEdges = [];
  let total = 0;

  yield frame(nodes, edges, inTree, key, -1, mstEdges, `Start Prim's algorithm at vertex 0: key[0] = 0, everything else Infinity.`, 0);
  for (let step = 0; step < n; step++) {
    let u = -1, best = Infinity;
    for (let v = 0; v < n; v++) if (!inTree[v] && key[v] < best) { best = key[v]; u = v; }
    if (u === -1) break;
    inTree[u] = true;
    if (parent[u] !== -1) {
      mstEdges.push({ u: parent[u], v: u, w: key[u] });
      total += key[u];
    }
    yield frame(nodes, edges, inTree, key, u, mstEdges, `Add ${u} to the tree (cheapest fringe edge, weight ${best === Infinity ? 0 : best}). Total weight so far: ${total}.`, 3);
    for (const { to: v, w } of adj[u]) {
      if (!inTree[v] && w < key[v]) {
        key[v] = w;
        parent[v] = u;
        yield frame(nodes, edges, inTree, key, u, mstEdges, `Edge (${u}, ${v}) weight ${w} beats ${v}'s old key: key[${v}] = ${w}.`, 4);
      }
    }
  }
  yield frame(nodes, edges, inTree, key, -1, mstEdges, `Done. MST weight: ${total}.`, 1);
  return { mstEdges, total };
}

export default {
  id: 'prim',
  title: "Prim's algorithm",
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'Minimum Spanning Trees',
  summary:
    "Prim's algorithm builds a minimum spanning tree the opposite way from Kruskal: instead of picking edges globally by weight, it grows one tree outward from a single root, always adding whichever fringe edge (one endpoint in the tree, one not) is currently cheapest. " +
    "Every vertex not yet in the tree keeps a key: the weight of the cheapest edge seen so far connecting it to the tree, updated every time a new vertex joins. " +
    'The label under each vertex not yet in the tree is that running key; once a vertex joins, the label is just its id. ' +
    'Starred edge weights mark the edges actually chosen for the tree. ' +
    "This is the same cut-property argument as Kruskal's: the cheapest edge leaving the current tree (a cut separating tree from non-tree) is always safe to add.",
  code: CODE,
  complexity: {
    time: 'O(V^2) with this simple array scan for the minimum key (O(E log V) with a binary heap, O(E + V log V) with a Fibonacci heap).',
    why: 'Finding the smallest key among untreed vertices costs O(V) per iteration over V iterations here; a heap turns that scan into an O(log V) extract-min instead.',
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

    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
    for (const { u, v } of result.mstEdges) {
      const ru = find(u), rv = find(v);
      if (ru === rv) return false;
      parent[ru] = rv;
    }
    const root0 = find(0);
    for (let i = 1; i < n; i++) if (find(i) !== root0) return false;

    // Weight-optimality oracle: Kruskal's algorithm, run independently.
    const sorted = edges.slice().sort((a, b) => a.w - b.w);
    const uf = Array.from({ length: n }, (_, i) => i);
    const ufind = (x) => { while (uf[x] !== x) x = uf[x]; return x; };
    let kruskalTotal = 0;
    for (const e of sorted) {
      const ra = ufind(e.u), rb = ufind(e.v);
      if (ra !== rb) { uf[ra] = rb; kruskalTotal += e.w; }
    }
    return result.total === kruskalTotal;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
