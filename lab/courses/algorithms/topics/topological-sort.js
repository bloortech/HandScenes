// Topological sort: for a DAG (directed, acyclic), line up every vertex so
// that every edge points forward in the line. CLRS's algorithm just runs
// DFS and reads vertices off in decreasing order of finish time. No DOM
// access.
import { makeRandomGraph, adjList } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const WHITE = 0, GRAY = 1, BLACK = 2;

const CODE = [
  'for each vertex u, in order: if white(u): visit(u)',
  'visit(u): color[u] = gray',
  '  for v in Adj[u]: if white(v): visit(v)',
  'color[u] = black; prepend u to the output list',
];

function snap(nodes, edges, color, order, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    active: color[nd.id] === GRAY,
    dim: color[nd.id] === WHITE,
    memoHit: color[nd.id] === BLACK,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: edges.map((e) => [e.u, e.v]), counters: { ordered: order.length } };
}

function* visit(u, adj, color, order, nodes, edges) {
  color[u] = GRAY;
  yield snap(nodes, edges, color, order, `Visit ${u}.`, 1);
  for (const { to: v } of adj[u]) {
    if (color[v] === WHITE) {
      yield* visit(v, adj, color, order, nodes, edges);
    }
  }
  color[u] = BLACK;
  order.unshift(u);
  yield snap(nodes, edges, color, order, `${u} is done: every vertex it can reach is already placed, so prepend ${u}. Order so far (left to right): ${order.join(', ')}.`, 3);
}

function* run(input) {
  const { n, edges, directed } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  const adj = adjList(n, edges, directed);
  const color = Array(n).fill(WHITE);
  const order = [];
  for (let u = 0; u < n; u++) {
    if (color[u] === WHITE) yield* visit(u, adj, color, order, nodes, edges);
  }
  yield snap(nodes, edges, color, order, `Done. Topological order: ${order.join(', ')}.`, 0);
  return { order };
}

export default {
  id: 'topological-sort',
  title: 'Topological sort',
  module: 'm06',
  course: 'CSC263/265',
  clrs: 'Elementary Graph Algorithms (Topological Sort)',
  summary:
    'A topological sort lines up the vertices of a DAG (a directed graph with no cycles) so that every edge u -> v has u appearing before v. ' +
    'It only makes sense for DAGs: a cycle would demand some vertex come before itself. ' +
    'CLRS\'s algorithm is almost free once you already have DFS: run DFS, and every time a vertex finishes (its whole reachable subtree is done), tuck it onto the front of the output list. ' +
    'A vertex can only finish after everything it points to has finished, so finishing order, reversed, is exactly a valid topological order. ' +
    'This shows up constantly: ordering a build\'s compilation steps, a course\'s prerequisites, or (later in this module) relaxing edges of a DAG in exactly the right order for shortest paths.',
  code: CODE,
  complexity: { time: 'O(V + E).', why: 'It is one DFS pass: every vertex and edge is visited once, plus an O(1) prepend per finished vertex.' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, dag: true, extraEdgeFraction: 0.45 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    const order = result.order;
    if (order.length !== n) return false;
    if (new Set(order).size !== n) return false;
    const pos = Array(n);
    order.forEach((v, i) => { pos[v] = i; });
    for (const { u, v } of edges) {
      if (pos[u] >= pos[v]) return false;
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
