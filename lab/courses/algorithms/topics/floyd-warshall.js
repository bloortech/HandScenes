// Floyd-Warshall: all-pairs shortest paths by dynamic programming over
// which vertices are allowed as intermediate stops. d_k[i][j] is the
// shortest i-to-j distance using only {0..k-1} as intermediates; allowing
// one more vertex k either helps (go through k) or doesn't, so the whole
// n x n table can be updated in place, one "allowed intermediate" at a
// time. No DOM access.
import { makeRandomGraph, adjMatrix, adjList, bfsDistances, hasNegativeCycleReachableFrom } from '../engine/graph.js';

const CODE = [
  'D = the adjacency matrix (Infinity where there is no edge, 0 on the diagonal)',
  'for k in 0..n-1:',
  '  for i in 0..n-1:',
  '    for j in 0..n-1:',
  '      if D[i][k] + D[k][j] < D[i][j]: D[i][j] = D[i][k] + D[k][j]   # route i->j through k',
];

function cellLabel(v) {
  if (v === Infinity) return '.';
  if (v === -Infinity) return '-inf';
  return String(v);
}

function tableFrame(n, D, k, highlight, caption, line) {
  const nodes = [];
  const cellSize = Math.min(14, 84 / n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      nodes.push({
        id: `${i}-${j}`,
        label: cellLabel(D[i][j]),
        x: 8 + (j + 0.5) * (84 / n),
        y: 8 + (i + 0.5) * (84 / n),
        w: cellSize,
        h: cellSize,
        active: highlight && highlight[0] === i && highlight[1] === j,
        compare: (i === k || j === k) && !(highlight && highlight[0] === i && highlight[1] === j),
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no vertices)' };
}

function* run(input) {
  const { n, edges, directed } = input;
  if (n === 0) return { D: [] };
  const D = adjMatrix(n, edges, directed);
  yield tableFrame(n, D, -1, null, 'Start: D is just the adjacency matrix (no intermediates allowed yet).', 0);

  for (let k = 0; k < n; k++) {
    yield tableFrame(n, D, k, null, `Allow vertex ${k} as an intermediate stop. Try routing every (i, j) through it.`, 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (D[i][k] + D[k][j] < D[i][j]) {
          D[i][j] = D[i][k] + D[k][j];
          yield tableFrame(n, D, k, [i, j], `D[${i}][${j}] improves by routing through ${k}: D[${i}][${k}] + D[${k}][${j}] = ${D[i][j]}.`, 4);
        }
      }
    }
  }
  for (let i = 0; i < n; i++) if (D[i][i] < 0) D[i][i] = -Infinity;
  yield tableFrame(n, D, -1, null, 'Done: every intermediate vertex has been allowed. A negative diagonal cell means a negative-weight cycle.', 0);
  return { D };
}

export default {
  id: 'floyd-warshall',
  title: 'Floyd-Warshall',
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'All-Pairs Shortest Paths',
  summary:
    'Floyd-Warshall finds the shortest distance between every pair of vertices at once, by dynamic programming over which vertices are allowed to be used as stops along the way. ' +
    'Start with the plain adjacency matrix: that is the shortest distance using zero intermediate stops. ' +
    'Then, one vertex k at a time, ask every pair (i, j): does routing through k, as i -> ... -> k -> ... -> j, beat the best distance found so far? If so, update the table. ' +
    'After allowing all n vertices as possible stops, D[i][j] is the true shortest distance, since any shortest path uses some subset of the vertices as intermediates, and every one of them gets considered exactly once. ' +
    'Cyan cells in this sandbox are the current row/column for k; the amber cell is whichever (i, j) a route through k just improved. ' +
    'A negative number left on the diagonal at the end means some vertex can reach a negative-weight cycle, so shortest paths through it are undefined.',
  code: CODE,
  complexity: { time: 'O(V^3).', why: 'Three nested loops over all n vertices, each doing O(1) work per cell.' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(9, size));
    // dag: true guarantees the graph has no cycle at all (so certainly no
    // negative-weight one), which keeps every table entry a well-defined
    // finite shortest distance to check against, while still allowing
    // negative edge weights to show in the table filling in.
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, dag: true, weighted: true, weightMin: 1, weightMax: 8, allowNegative: true, extraEdgeFraction: 0.45 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, directed } = input;
    if (n === 0) return result.D.length === 0;
    const D = result.D;
    const EPS = 1e-9;
    // makeInput always generates a DAG, so there is never a negative
    // cycle; every row should be a well-defined, finite shortest-path row
    // (this still exercises the same diagonal-check code the real
    // algorithm runs, it just never has anything to flag here).
    if (hasNegativeCycleReachableFrom(n, edges, directed, 0)) return false;
    for (let s = 0; s < n; s++) {
      if (D[s][s] !== 0) return false;
      if (!isShortestPathish(n, edges, directed, s, D[s])) return false;
    }
    return true;

    function isShortestPathish(n, edges, directed, src, dist) {
      // Same certificate as isShortestPathCertificate (dist[src]=0, every
      // edge relaxed, reachable <-> finite), inlined here since D's rows
      // can also legitimately hold a -Infinity escape hatch that the
      // plain certificate helper does not expect.
      if (dist[src] !== 0) return false;
      const adj = adjList(n, edges, directed);
      const { dist: reach } = bfsDistances(n, adj, src);
      for (let v = 0; v < n; v++) {
        const isReachable = reach[v] !== Infinity;
        if (isReachable && dist[v] === Infinity) return false;
        if (!isReachable && dist[v] !== Infinity) return false;
      }
      for (const { u, v, w } of edges) {
        if (dist[u] !== Infinity && dist[v] > dist[u] + w + EPS) return false;
        if (!directed && dist[v] !== Infinity && dist[u] > dist[v] + w + EPS) return false;
      }
      return true;
    }
  },
  sandbox: { type: 'n', min: 0, max: 9, default: 6, label: 'vertices' },
};
