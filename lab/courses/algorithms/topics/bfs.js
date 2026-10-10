// Breadth-first search: explore a graph in waves outward from a source,
// so the first time a vertex is reached is always via a shortest (fewest
// edges) path. No DOM access.
import { makeRandomGraph, adjList, bfsDistances } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'queue = [src]; dist[src] = 0; visited = {src}',
  'while queue is not empty:',
  '  u = queue.dequeue()',
  '  for v in Adj[u]:',
  '    if v not visited: visited.add(v); dist[v] = dist[u] + 1; queue.enqueue(v)',
];

function frame(nodes, edges, dist, current, queue, caption, line) {
  return {
    kind: 'tree',
    line,
    code: CODE,
    caption,
    nodes: nodes.map((nd) => ({
      ...nd,
      label: dist[nd.id] === Infinity ? String(nd.id) : `${nd.id}:${dist[nd.id]}`,
      active: nd.id === current,
      compare: queue.includes(nd.id) && nd.id !== current,
      dim: dist[nd.id] === Infinity,
    })),
    edges: edges.map((e) => [e.u, e.v]),
    counters: { queued: queue.length },
  };
}

function* run(input) {
  const { n, edges, directed, src } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  const adj = adjList(n, edges, directed);
  const dist = Array(n).fill(Infinity);
  const parent = Array(n).fill(-1);
  if (n === 0) return { dist, parent };

  dist[src] = 0;
  const queue = [src];
  yield frame(nodes, edges, dist, src, queue, `Start BFS at vertex ${src}: distance 0, queued.`, 0);

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    yield frame(nodes, edges, dist, u, queue.slice(head - 1), `Dequeue ${u} (distance ${dist[u]}) and look at its neighbours.`, 2);
    for (const { to: v } of adj[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        parent[v] = u;
        queue.push(v);
        yield frame(nodes, edges, dist, u, queue.slice(head), `Discover ${v}: distance ${dist[v]} via ${u}, queued.`, 4);
      }
    }
  }
  yield frame(nodes, edges, dist, -1, [], 'Queue empty: every reachable vertex has its shortest (fewest-edges) distance.', 1);
  return { dist, parent };
}

export default {
  id: 'bfs',
  title: 'Breadth-first search',
  module: 'm06',
  course: 'CSC263/265',
  clrs: 'Elementary Graph Algorithms (Breadth-First Search)',
  summary:
    'Breadth-first search explores a graph outward in waves: first the source, then everything one edge away, then everything two edges away, and so on. ' +
    'It uses a queue so vertices are always processed in the order they were discovered, which is exactly what guarantees each vertex\'s first discovery is via a shortest path in terms of number of edges. ' +
    'The amber vertex is the one currently being expanded; cyan vertices are sitting in the queue waiting their turn; dim vertices have not been reached yet. ' +
    'Every vertex and edge is looked at at most once, so the whole search costs O(V + E) using an adjacency list. ' +
    'BFS only measures hops, not weight: Dijkstra (later in this module) is the weighted version of the same wave idea.',
  code: CODE,
  complexity: { time: 'O(V + E) with an adjacency list.', why: 'Every vertex is enqueued at most once, and every edge is examined at most once (twice if undirected, once from each endpoint).' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(14, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: false, extraEdgeFraction: 0.35 });
    const src = n > 0 ? Math.floor(rng() * n) : 0;
    return { n, directed, edges, src };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, directed, src } = input;
    if (n === 0) return result.dist.length === 0;
    const adj = adjList(n, edges, directed);
    const { dist: expected } = bfsDistances(n, adj, src);
    for (let v = 0; v < n; v++) if (result.dist[v] !== expected[v]) return false;
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 14, default: 8, label: 'vertices' },
};
