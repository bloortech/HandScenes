// Kosaraju's algorithm for strongly connected components: two DFS passes,
// first on G to get a finishing order, then on G^T (every edge reversed)
// visiting roots in decreasing finish order, where each resulting DFS tree
// is exactly one SCC. No DOM access.
import { makeRandomGraph, adjList } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const WHITE = 0, GRAY = 1, BLACK = 2;

const CODE = [
  'pass 1: run DFS on G, record each vertex\'s finish order',
  'pass 2: build G^T (every edge reversed)',
  '  for u in decreasing order of finish time from pass 1:',
  '    if white(u): visit(u) in G^T -> that whole tree is one SCC',
];

function snap(nodes, edges, color, comp, active, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: comp[nd.id] != null ? `${nd.id}:c${comp[nd.id]}` : String(nd.id),
    active: nd.id === active,
    dim: color[nd.id] === WHITE,
    memoHit: color[nd.id] === BLACK && comp[nd.id] == null,
    compare: comp[nd.id] != null,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: edges.map((e) => [e.u, e.v]) };
}

function* dfsFinish(u, adj, color, order, nodes, edges, comp) {
  color[u] = GRAY;
  yield snap(nodes, edges, color, comp, u, `Pass 1, visit ${u}.`, 0);
  for (const { to: v } of adj[u]) {
    if (color[v] === WHITE) yield* dfsFinish(v, adj, color, order, nodes, edges, comp);
  }
  color[u] = BLACK;
  order.push(u);
  yield snap(nodes, edges, color, comp, u, `Pass 1, ${u} finishes (position ${order.length} in finish order).`, 0);
}

function* dfsAssign(u, adjT, color, comp, id, nodes, edges) {
  color[u] = GRAY;
  comp[u] = id;
  yield snap(nodes, edges, color, comp, u, `Pass 2, assign ${u} to component ${id}.`, 3);
  for (const { to: v } of adjT[u]) {
    if (color[v] === WHITE) yield* dfsAssign(v, adjT, color, comp, id, nodes, edges);
  }
  color[u] = BLACK;
}

function* run(input) {
  const { n, edges } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  const adj = adjList(n, edges, true);
  const comp = Array(n).fill(null);
  let color = Array(n).fill(WHITE);
  const order = [];
  for (let u = 0; u < n; u++) {
    if (color[u] === WHITE) yield* dfsFinish(u, adj, color, order, nodes, edges, comp);
  }

  const adjT = adjList(n, edges.map(({ u, v, w }) => ({ u: v, v: u, w })), true);
  color = Array(n).fill(WHITE);
  let nextId = 0;
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (color[u] === WHITE) {
      yield snap(nodes, edges, color, comp, u, `Pass 2: ${u} is the next unvisited vertex in decreasing finish order, start a new component.`, 2);
      yield* dfsAssign(u, adjT, color, comp, nextId, nodes, edges);
      nextId++;
    }
  }
  yield snap(nodes, edges, color, comp, -1, `Done: ${nextId} strongly connected component(s).`, 3);
  return { comp, count: nextId };
}

export default {
  id: 'scc',
  title: 'Strongly connected components',
  module: 'm06',
  course: 'CSC263/265',
  clrs: 'Elementary Graph Algorithms (Strongly Connected Components)',
  summary:
    'A strongly connected component (SCC) is a maximal set of vertices where every vertex can reach every other vertex by a directed path. ' +
    'Kosaraju\'s algorithm finds all of them with two DFS passes and one clever trick. ' +
    'Pass one runs plain DFS on the graph and records each vertex\'s finish time. ' +
    'Pass two builds the transpose graph (every edge reversed) and runs DFS again, but picking roots in decreasing order of pass one\'s finish times: each resulting DFS tree is exactly one SCC. ' +
    'The amber vertex is whichever DFS is currently visiting it; the label "u:cK" means vertex u has been placed in component K. ' +
    'Reversing every edge cannot create or destroy a cycle, which is why mutual reachability (strong connectivity) survives the swap to G^T, and that is what makes the second pass\'s trees line up exactly with the SCCs.',
  code: CODE,
  complexity: { time: 'O(V + E).', why: 'It is two DFS passes (one on G, one on G^T, which takes the same O(V+E) to build and to search) plus one linear-time reorder of the finish list.' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, extraEdgeFraction: 0.6 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    if (n === 0) return result.count === 0;
    const { comp } = result;
    if (comp.some((c) => c == null)) return false;
    // Brute-force oracle: u and v are in the same SCC iff u reaches v and v
    // reaches u (plain reachability via BFS on the forward and transpose
    // adjacency), independent of how `comp` was computed.
    const adj = adjList(n, edges, true);
    const adjT = adjList(n, edges.map(({ u, v, w }) => ({ u: v, v: u, w })), true);
    const reachableFrom = (start, graph) => {
      const seen = Array(n).fill(false);
      seen[start] = true;
      const stack = [start];
      while (stack.length) {
        const u = stack.pop();
        for (const { to: v } of graph[u]) if (!seen[v]) { seen[v] = true; stack.push(v); }
      }
      return seen;
    };
    for (let u = 0; u < n; u++) {
      const fwd = reachableFrom(u, adj);
      const back = reachableFrom(u, adjT);
      for (let v = 0; v < n; v++) {
        const sameComp = comp[u] === comp[v];
        const mutuallyReachable = fwd[v] && back[v];
        if (sameComp !== mutuallyReachable) return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
