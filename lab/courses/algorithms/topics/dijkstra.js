// Dijkstra's algorithm: single-source shortest paths when every edge
// weight is non-negative. Like Prim, it grows a tree by always taking the
// cheapest fringe choice, but the "key" here is a real distance from the
// source, not just one edge's weight. No DOM access.
import { makeRandomGraph, isShortestPathCertificate } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'dist[src] = 0, dist[*] = Infinity, done[*] = false',
  'for n iterations:',
  '  u = vertex not done with the smallest dist   # always safe: dist[u] can only be final once',
  '  done[u] = true',
  '  for (u, v, w) in Adj[u]: if dist[u] + w < dist[v]: dist[v] = dist[u] + w   # relax',
];

function frame(nodes, edges, done, dist, active, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: `${nd.id}:${dist[nd.id] === Infinity ? '-' : dist[nd.id]}`,
    active: nd.id === active,
    memoHit: done[nd.id] && nd.id !== active,
    dim: !done[nd.id] && dist[nd.id] === Infinity,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: edges.map((e) => [e.u, e.v, e.w]) };
}

function* run(input) {
  const { n, edges, directed, src } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  if (n === 0) return { dist: [] };
  const adj = Array.from({ length: n }, () => []);
  for (const { u, v, w } of edges) {
    adj[u].push({ to: v, w });
    if (!directed) adj[v].push({ to: u, w });
  }
  const dist = Array(n).fill(Infinity);
  const done = Array(n).fill(false);
  dist[src] = 0;

  yield frame(nodes, edges, done, dist, -1, `Start at ${src}: dist[${src}] = 0, every other vertex Infinity until relaxed.`, 0);
  for (let step = 0; step < n; step++) {
    let u = -1, best = Infinity;
    for (let v = 0; v < n; v++) if (!done[v] && dist[v] < best) { best = dist[v]; u = v; }
    if (u === -1) break;
    done[u] = true;
    yield frame(nodes, edges, done, dist, u, `${u} has the smallest tentative distance (${dist[u]}) among the rest: that is now final.`, 3);
    for (const { to: v, w } of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        yield frame(nodes, edges, done, dist, u, `Relax (${u}, ${v}): dist[${u}] + ${w} = ${dist[v]} beats the old dist[${v}].`, 4);
      }
    }
  }
  yield frame(nodes, edges, done, dist, -1, 'Done: every reachable vertex has its final shortest distance.', 1);
  return { dist };
}

export default {
  id: 'dijkstra',
  title: "Dijkstra's algorithm",
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'Single-Source Shortest Paths',
  summary:
    "Dijkstra's algorithm finds the shortest distance from one source to every other vertex, as long as no edge weight is negative. " +
    'It keeps a tentative distance for every vertex (Infinity until some edge improves it) and, like Prim, repeatedly commits to whichever not-yet-finalized vertex currently has the smallest tentative distance. ' +
    'Once a vertex is committed, its distance never changes again: because every weight is non-negative, no path discovered later could possibly be shorter. ' +
    "That one assumption (no negative weights) is exactly what Bellman-Ford (later in this module) drops, at the cost of being slower. " +
    'The label under each vertex is its current tentative distance; a filled (non-amber) vertex has already been finalized.',
  code: CODE,
  complexity: {
    time: 'O(V^2) with this simple array scan (O(E log V) with a binary heap).',
    why: 'Finding the minimum tentative distance costs O(V) per iteration over V iterations here; a priority queue turns that into O(log V) per extract-min, and there are O(E) decrease-key-style relaxations total.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(12, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, weighted: true, weightMin: 1, weightMax: 12, extraEdgeFraction: 0.4 });
    const src = n > 0 ? Math.floor(rng() * n) : 0;
    return { n, directed, edges, src };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, directed, src } = input;
    if (n === 0) return result.dist.length === 0;
    return isShortestPathCertificate(n, edges, directed, src, result.dist);
  },
  sandbox: { type: 'n', min: 0, max: 12, default: 7, label: 'vertices' },
};
