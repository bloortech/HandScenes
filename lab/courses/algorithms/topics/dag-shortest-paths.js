// Shortest paths in a DAG: a directed acyclic graph can have negative
// weights and still never has a negative cycle (there are no cycles at
// all), so relaxing every edge exactly once, in topological order, is
// enough to get every distance exactly right in one pass. No DOM access.
import { makeRandomGraph, adjList, isShortestPathCertificate } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'order = a topological sort of the DAG',
  'dist[src] = 0, dist[*] = Infinity',
  'for u in order:',
  '  for (u, v, w) in Adj[u]: if dist[u] + w < dist[v]: dist[v] = dist[u] + w',
];

function topoOrder(n, adj) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = Array(n).fill(WHITE);
  const order = [];
  function visit(u) {
    color[u] = GRAY;
    for (const { to: v } of adj[u]) if (color[v] === WHITE) visit(v);
    color[u] = BLACK;
    order.unshift(u);
  }
  for (let u = 0; u < n; u++) if (color[u] === WHITE) visit(u);
  return order;
}

function frame(nodes, edges, dist, active, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: `${nd.id}:${dist[nd.id] === Infinity ? '-' : dist[nd.id]}`,
    active: nd.id === active,
    dim: dist[nd.id] === Infinity,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: edges.map((e) => [e.u, e.v, e.w]) };
}

function* run(input) {
  const { n, edges, directed, src } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  if (n === 0) return { dist: [], order: [] };
  const adj = adjList(n, edges, directed);
  const order = topoOrder(n, adj);
  const dist = Array(n).fill(Infinity);
  dist[src] = 0;

  yield frame(nodes, edges, dist, -1, `Topological order: ${order.join(', ')}. Start dist[${src}] = 0.`, 0);
  for (const u of order) {
    yield frame(nodes, edges, dist, u, `Visit ${u} in topological order: everything that could shorten dist[${u}] has already run.`, 2);
    for (const { to: v, w } of adj[u]) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        yield frame(nodes, edges, dist, u, `Relax (${u}, ${v}): dist[${u}] + ${w} = ${dist[v]} beats the old dist[${v}].`, 3);
      }
    }
  }
  yield frame(nodes, edges, dist, -1, 'Done after one pass over the topological order.', 1);
  return { dist, order };
}

export default {
  id: 'dag-shortest-paths',
  title: 'Shortest paths in a DAG',
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'Single-Source Shortest Paths (shortest paths in a DAG)',
  summary:
    'When the graph is a DAG (directed, acyclic), shortest paths get much easier, and that is true even with negative edge weights: a DAG has no cycles at all, let alone a negative-weight one, so Bellman-Ford\'s worry case cannot happen. ' +
    'The trick is to process vertices in topological order. By the time a vertex u is visited, every edge that could possibly shorten dist[u] has already fired, because every such edge comes from a vertex earlier in the order. ' +
    'So one relax of every outgoing edge, done once per vertex in that order, is enough: no vertex ever needs revisiting. ' +
    'This is how longest/shortest path problems on dependency graphs (critical path scheduling, for instance) usually get solved in practice.',
  code: CODE,
  complexity: { time: 'O(V + E).', why: 'One topological sort (O(V + E)) plus one pass relaxing every edge exactly once.' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, dag: true, weighted: true, weightMin: 1, weightMax: 8, allowNegative: true, extraEdgeFraction: 0.45 });
    return { n, directed, edges, src: 0 };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, directed, src } = input;
    if (n === 0) return result.dist.length === 0;
    if (result.order.length !== n) return false;
    const pos = Array(n);
    result.order.forEach((v, i) => { pos[v] = i; });
    for (const { u, v } of edges) if (pos[u] >= pos[v]) return false;
    return isShortestPathCertificate(n, edges, directed, src, result.dist);
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
