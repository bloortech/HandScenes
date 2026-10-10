// Johnson's algorithm: all-pairs shortest paths on a sparse graph that may
// have negative weights (but, like Bellman-Ford, no negative-weight
// cycle), by reweighting every edge to be non-negative and then running
// Dijkstra from every vertex. No DOM access.
//
// Reweighting trick: add a new vertex s with a zero-weight edge to every
// vertex, run Bellman-Ford from s to get h[v] = shortest distance s -> v,
// then set w'(u, v) = w(u, v) + h[u] - h[v]. The triangle inequality for
// shortest paths (h[v] <= h[u] + w(u, v)) guarantees every w'(u, v) >= 0,
// and a path's total w' differs from its total w by only h[src] - h[dst]
// (every intermediate h cancels telescoping along the path), so the
// cheapest w'-path and the cheapest w-path between any fixed pair agree.
import { makeRandomGraph, adjList, isShortestPathCertificate } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'add vertex s with a 0-weight edge to every vertex',
  'h[v] = Bellman-Ford shortest distance s -> v   (abort: negative cycle, if any)',
  "reweight: w'(u, v) = w(u, v) + h[u] - h[v]   # now every w' >= 0",
  "for each src: run Dijkstra on w' from src -> d'[src][*]",
  'd[src][v] = d\'[src][v] - h[src] + h[v]',
];

function graphFrame(nodes, edges, labelFor, caption, line) {
  return {
    kind: 'tree',
    line,
    code: CODE,
    caption,
    nodes: nodes.map((nd) => ({ ...nd, label: labelFor(nd.id) })),
    edges: edges.map((e) => [e.u, e.v, e.wLabel != null ? e.wLabel : e.w]),
  };
}

function tableFrame(n, D, caption, line) {
  const nodes = [];
  const cellSize = Math.min(14, 84 / Math.max(1, n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      nodes.push({
        id: `${i}-${j}`,
        label: D[i][j] === Infinity ? '.' : String(D[i][j]),
        x: 8 + (j + 0.5) * (84 / n),
        y: 8 + (i + 0.5) * (84 / n),
        w: cellSize,
        h: cellSize,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no vertices)' };
}

// Plain Bellman-Ford over an explicit edge list (used here for the
// dummy-source reweighting pass, where the extra source isn't part of the
// real graph's vertex set).
function bellmanFord(size, edgeList, source) {
  const dist = Array(size).fill(Infinity);
  dist[source] = 0;
  for (let i = 0; i < size - 1; i++) {
    let changed = false;
    for (const { u, v, w } of edgeList) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
    }
    if (!changed) break;
  }
  let negativeCycle = false;
  for (const { u, v, w } of edgeList) if (dist[u] !== Infinity && dist[u] + w < dist[v]) negativeCycle = true;
  return { dist, negativeCycle };
}

function* run(input) {
  const { n, edges, directed } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  if (n === 0) return { D: [], negativeCycle: false };

  yield graphFrame(nodes, edges, (id) => String(id), `The graph: ${n} vertices, some edges may be negative.`, 0);

  const dummyEdges = edges.map((e) => ({ u: e.u, v: e.v, w: e.w }));
  for (let v = 0; v < n; v++) dummyEdges.push({ u: n, v, w: 0 }); // dummy source is vertex n
  const { dist: h, negativeCycle } = bellmanFord(n + 1, dummyEdges, n);
  if (negativeCycle) {
    yield graphFrame(nodes, edges, (id) => String(id), 'Bellman-Ford from the dummy source finds a negative-weight cycle: Johnson\'s algorithm cannot proceed.', 1);
    return { D: [], negativeCycle: true };
  }
  yield graphFrame(nodes, edges, (id) => `${id}:h=${h[id]}`, `Dummy-source Bellman-Ford gives h[v] = shortest distance from s to v for every v.`, 1);

  const reweighted = edges.map((e) => ({ u: e.u, v: e.v, w: e.w + h[e.u] - h[e.v], wLabel: `${e.w + h[e.u] - h[e.v]}` }));
  yield graphFrame(nodes, reweighted, (id) => String(id), "Reweight: w'(u, v) = w(u, v) + h[u] - h[v]. Every edge is now non-negative.", 2);

  const adj = adjList(n, reweighted, directed);
  const D = Array.from({ length: n }, () => Array(n).fill(Infinity));
  for (let src = 0; src < n; src++) {
    const dp = Array(n).fill(Infinity);
    const done = Array(n).fill(false);
    dp[src] = 0;
    for (let step = 0; step < n; step++) {
      let u = -1, best = Infinity;
      for (let v = 0; v < n; v++) if (!done[v] && dp[v] < best) { best = dp[v]; u = v; }
      if (u === -1) break;
      done[u] = true;
      for (const { to: v, w } of adj[u]) if (dp[u] + w < dp[v]) dp[v] = dp[u] + w;
    }
    for (let v = 0; v < n; v++) D[src][v] = dp[v] === Infinity ? Infinity : dp[v] - h[src] + h[v];
    yield graphFrame(nodes, edges, (id) => `${id}:${D[src][id] === Infinity ? '-' : D[src][id]}`, `Dijkstra on w' from source ${src} gives, after undoing the reweighting, row ${src} of the distance table.`, 3);
  }
  yield tableFrame(n, D, 'Done: the full all-pairs distance table.', 4);
  return { D, negativeCycle: false };
}

export default {
  id: 'johnson',
  title: "Johnson's algorithm",
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'All-Pairs Shortest Paths (Johnson\'s algorithm)',
  summary:
    "Johnson's algorithm answers the same question as Floyd-Warshall (shortest distance between every pair of vertices) but is faster on sparse graphs with some negative edges, by paying for Bellman-Ford once instead of paying its cost V times. " +
    'First it adds a dummy source s with a free (zero-weight) edge to every vertex and runs Bellman-Ford once from s; that both detects a negative cycle, if one exists, and produces a potential h[v] for every vertex. ' +
    "Reweighting every edge (u, v) to w(u, v) + h[u] - h[v] keeps it non-negative (by the shortest-path triangle inequality) and only shifts every path's total by h[src] - h[dst], a constant that depends only on the endpoints, not the path taken, so the cheapest path does not change. " +
    "With every weight non-negative, Dijkstra can run from each of the n vertices, and un-reweighting (d[u][v] = d'[u][v] - h[u] + h[v]) recovers the real distances." ,
  code: CODE,
  complexity: {
    time: 'O(V^2 log V + V E) with a binary-heap Dijkstra.',
    why: 'One O(VE) Bellman-Ford pass for h, then V runs of Dijkstra (O(E log V) each with a heap); this beats Floyd-Warshall\'s O(V^3) once E is much smaller than V^2.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(8, size));
    // dag: true guarantees no cycle at all, so certainly no negative-weight
    // cycle, which is Johnson's (and Bellman-Ford's) precondition.
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, dag: true, weighted: true, weightMin: 1, weightMax: 7, allowNegative: true, extraEdgeFraction: 0.5 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result || result.negativeCycle) return false;
    const { n, edges, directed } = input;
    if (n === 0) return result.D.length === 0;
    for (let src = 0; src < n; src++) {
      if (!isShortestPathCertificate(n, edges, directed, src, result.D[src])) return false;
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 8, default: 6, label: 'vertices' },
};
