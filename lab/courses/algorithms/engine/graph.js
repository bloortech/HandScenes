// Pure graph helpers shared by every m06 (graph algorithms) topic. No DOM
// access, like rng.js/layout.js. A graph here is always
// `{ n, directed, weighted, edges }` with `edges: [{ u, v, w }]` (undirected
// edges are stored once, u < v is NOT enforced by convention here so callers
// that need a canonical direction should sort themselves; weight defaults to
// 1 when the graph is unweighted).

import { randInt } from './rng.js';

// Builds a random graph on n labelled vertices 0..n-1. Always connected
// (as an undirected graph, even when `directed` is true) via a random
// spanning structure, then sprinkled with a few extra edges.
//   directed: edges have a direction (u -> v)
//   weighted: edges carry a random integer weight in [weightMin, weightMax]
//   allowNegative: weights can be negated (still never on a dag edge's
//     direction being reversed, so callers that need "no negative cycle"
//     should also pass dag: true, since a DAG can never have a cycle at all)
//   dag: every edge goes from a lower index to a higher index, so the graph
//     is guaranteed acyclic regardless of weights (used by topological-sort,
//     dag-shortest-paths)
export function makeRandomGraph(rng, n, opts = {}) {
  const {
    directed = false,
    weighted = false,
    weightMin = 1,
    weightMax = 9,
    allowNegative = false,
    dag = false,
    extraEdgeFraction = 0.35,
  } = opts;

  const edges = [];
  const seen = new Set();
  const keyOf = (a, b) => (directed ? `${a}>${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`);

  function weightFor() {
    if (!weighted) return 1;
    let w = randInt(rng, weightMin, weightMax);
    if (allowNegative && rng() < 0.3) w = -w;
    return w;
  }

  function addEdge(u, v) {
    if (u === v) return false;
    const key = keyOf(u, v);
    if (seen.has(key)) return false;
    if (!directed && seen.has(keyOf(v, u))) return false;
    seen.add(key);
    edges.push({ u, v, w: weightFor() });
    return true;
  }

  // Random spanning structure: node i (i > 0) attaches to a random earlier
  // node, which keeps the whole vertex set reachable from node 0 (and,
  // undirected, connected outright).
  for (let i = 1; i < n; i++) {
    const j = randInt(rng, 0, i - 1);
    if (dag) addEdge(j, i);
    else if (directed) addEdge(rng() < 0.5 ? j : i, rng() < 0.5 ? i : j);
    else addEdge(j, i);
  }

  // A few extra edges on top, for cycles/alternate paths.
  const possible = dag || !directed ? (n * (n - 1)) / 2 : n * (n - 1);
  const extra = Math.round(possible * extraEdgeFraction) - (n - 1);
  for (let k = 0; k < Math.max(0, extra); k++) {
    if (n < 2) break;
    let a = randInt(rng, 0, n - 1);
    let b = randInt(rng, 0, n - 1);
    if (a === b) continue;
    if (dag && a > b) [a, b] = [b, a];
    addEdge(a, b);
  }

  return { n, directed, weighted, edges };
}

// Adjacency list, sorted by neighbour id (deterministic iteration order for
// every algorithm that walks it, which is what makes dfs's discovery/finish
// times and edge classification reproducible).
export function adjList(n, edges, directed) {
  const adj = Array.from({ length: n }, () => []);
  for (const { u, v, w } of edges) {
    adj[u].push({ to: v, w });
    if (!directed) adj[v].push({ to: u, w });
  }
  for (const list of adj) list.sort((a, b) => a.to - b.to);
  return adj;
}

// Adjacency matrix: matrix[u][v] is the edge weight, or Infinity if there is
// no edge (0 on the diagonal). For an unweighted graph, matrix[u][v] is 1.
export function adjMatrix(n, edges, directed) {
  const m = Array.from({ length: n }, () => Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) m[i][i] = 0;
  for (const { u, v, w } of edges) {
    m[u][v] = w;
    if (!directed) m[v][u] = w;
  }
  return m;
}

// Plain unweighted BFS distances/parents from src, used both as its own
// topic (bfs) and as a reachability oracle other topics' check()s call to
// tell "unreachable" apart from "reachable but not yet relaxed".
export function bfsDistances(n, adj, src) {
  const dist = Array(n).fill(Infinity);
  const parent = Array(n).fill(-1);
  if (n === 0) return { dist, parent };
  dist[src] = 0;
  const queue = [src];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const { to: v } of adj[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        parent[v] = u;
        queue.push(v);
      }
    }
  }
  return { dist, parent };
}

// The CLRS optimality certificate for single-source shortest paths: dist[src]
// is 0, every edge is "relaxed" (dist[v] <= dist[u] + w, and for undirected
// graphs the same check in both directions), and a vertex has finite dist
// exactly when it is reachable from src. Independent of how dist was
// computed, so every weighted shortest-path topic's check() can call this
// instead of re-deriving the algorithm.
export function isShortestPathCertificate(n, edges, directed, src, dist) {
  if (dist.length !== n) return false;
  if (n === 0) return true;
  if (dist[src] !== 0) return false;
  const adj = adjList(n, edges, directed);
  const { dist: reach } = bfsDistances(n, adj, src);
  for (let v = 0; v < n; v++) {
    const isReachable = reach[v] !== Infinity;
    if (isReachable && dist[v] === Infinity) return false;
    if (!isReachable && dist[v] !== Infinity) return false;
  }
  const EPS = 1e-9;
  for (const { u, v, w } of edges) {
    if (dist[u] !== Infinity && dist[v] > dist[u] + w + EPS) return false;
    if (!directed && dist[v] !== Infinity && dist[u] > dist[v] + w + EPS) return false;
  }
  return true;
}

// A plain (non-animated) Bellman-Ford style relaxation, used only as an
// independent "is there a negative cycle reachable from src" oracle:
// n rounds of relaxing every edge should stabilise distances unless some
// reachable cycle has negative total weight, in which case round n+1 can
// still improve something.
export function hasNegativeCycleReachableFrom(n, edges, directed, src) {
  const dist = Array(n).fill(Infinity);
  dist[src] = 0;
  const relaxOnce = () => {
    let changed = false;
    for (const { u, v, w } of edges) {
      if (dist[u] !== Infinity && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
      if (!directed && dist[v] !== Infinity && dist[v] + w < dist[u]) { dist[u] = dist[v] + w; changed = true; }
    }
    return changed;
  };
  for (let i = 0; i < n; i++) relaxOnce();
  return relaxOnce();
}
