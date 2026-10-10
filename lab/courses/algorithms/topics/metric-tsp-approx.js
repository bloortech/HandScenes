// CLRS's APPROX-TSP-TOUR (35.2): build a minimum spanning tree, then walk
// it in a depth-first preorder, shortcutting straight to the next NEW city
// whenever DFS would revisit one already seen. Works only for METRIC TSP
// (distances satisfy the triangle inequality, which is automatic here
// since every distance is a straight-line Euclidean distance between
// points), and the resulting tour never costs more than twice the MST's
// weight, which is itself never more than the optimal tour's weight. No
// DOM access. Reuses engine/unionfind.js for the MST.
import { makeSets, find, union } from '../engine/unionfind.js';

const CODE = [
  'build a minimum spanning tree T of the (metric) graph',
  'walk T in DFS preorder, listing each city the first time it is visited',
  'return to the start: that preorder list, closed into a cycle, is the tour',
];

function dist(points, a, b) {
  const dx = points[a].x - points[b].x, dy = points[a].y - points[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildMST(n, points) {
  const edges = [];
  for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) edges.push({ u, v, w: dist(points, u, v) });
  edges.sort((a, b) => a.w - b.w);
  const uf = makeSets(n);
  const mstEdges = [];
  const adj = Array.from({ length: n }, () => []);
  for (const e of edges) {
    if (find(uf, e.u, []) !== find(uf, e.v, [])) {
      union(uf, e.u, e.v, []);
      mstEdges.push(e);
      adj[e.u].push(e.v);
      adj[e.v].push(e.u);
    }
  }
  return { mstEdges, adj };
}

function dfsPreorder(adj, start) {
  const visited = new Array(adj.length).fill(false);
  const order = [];
  (function go(u) {
    visited[u] = true;
    order.push(u);
    for (const v of adj[u]) if (!visited[v]) go(v);
  })(start);
  return order;
}

function tourLength(points, tour) {
  let total = 0;
  for (let i = 0; i < tour.length; i++) total += dist(points, tour[i], tour[(i + 1) % tour.length]);
  return total;
}

function frame(points, mstEdges, tour, caption, line) {
  const nodes = points.map((p, i) => ({ id: i, label: String(i), x: p.x, y: p.y, active: tour && tour.includes(i) }));
  const edges = [];
  for (const e of mstEdges) edges.push([e.u, e.v]);
  if (tour) for (let i = 0; i < tour.length; i++) edges.push([tour[i], tour[(i + 1) % tour.length], '*']);
  return { kind: 'tree', line, code: CODE, caption, nodes, edges, emptyText: '(no cities)' };
}

function* run(input) {
  const { n, points } = input;
  if (n === 0) {
    yield frame([], [], null, 'No cities: an empty tour, length 0.', 0);
    return { tourLength: 0, mstWeight: 0, n };
  }
  if (n === 1) {
    yield frame(points, [], [0], 'One city: the tour stays put, length 0.', 2);
    return { tourLength: 0, mstWeight: 0, n };
  }

  const { mstEdges, adj } = buildMST(n, points);
  const mstWeight = mstEdges.reduce((s, e) => s + e.w, 0);
  yield frame(points, mstEdges, null, `Minimum spanning tree over ${n} cities, total weight ${mstWeight.toFixed(1)}.`, 0);

  const order = dfsPreorder(adj, 0);
  yield frame(points, mstEdges, order, `DFS preorder of the tree starting at city 0: ${order.join(' -> ')}. Shortcutting straight to the next new city whenever DFS would backtrack.`, 1);

  const length = tourLength(points, order);
  yield frame(points, [], order, `Tour (marked *): ${order.join(' -> ')} -> ${order[0]}. Length ${length.toFixed(1)}, at most twice the MST weight ${mstWeight.toFixed(1)}.`, 2);

  return { tourLength: length, mstWeight, n, tour: order };
}

export default {
  id: 'metric-tsp-approx',
  title: 'Metric TSP approximation',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'Approximation Algorithms',
  summary:
    'The travelling salesman problem asks for the shortest tour visiting every city once and returning home; optimal TSP is NP-hard even in the metric case (distances obey the triangle inequality, as any real set of straight-line distances does). ' +
    'The double-tree-ish trick here needs only a minimum spanning tree, which IS solvable fast: build the MST, then walk it with a depth-first search, listing each city the first time DFS visits it. Whenever DFS would walk back up the tree to a city it already listed, SHORTCUT straight to the next new city instead, using the triangle inequality to guarantee that shortcut is never longer than the path it replaces. ' +
    "That preorder walk, closed into a cycle by returning to the start, visits every city exactly once (it's a tour) and costs at most twice the MST's weight: every tree edge gets walked at most twice in a full DFS (once down, once back up) before shortcutting removes the backtracking, so the tour length is at most 2 x the MST weight. " +
    "Since any tour minus one edge is itself a spanning tree, the optimal tour's length is always at least the MST's weight, which chains together into the tour this algorithm finds costing at most 2x the true optimum: a 2-approximation, without ever having to solve TSP itself.",
  code: CODE,
  complexity: {
    time: 'O(n^2 log n) for n cities: building the MST with a dense graph dominates (sorting O(n^2) candidate edges); the DFS preorder walk afterwards is O(n).',
    why: "Every pair of cities is a candidate MST edge in the dense metric case, so sorting them costs O(n^2 log n); Kruskal's union-find processing after that is near-linear in the number of edges, and the DFS walk touches each of the n-1 tree edges once.",
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const points = Array.from({ length: n }, () => ({ x: 10 + rng() * 80, y: 10 + rng() * 80 }));
    return { n, points };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n } = input;
    if (result.n !== n) return false;
    if (n <= 1) return result.tourLength === 0;
    if (result.tour.length !== n) return false;
    if (new Set(result.tour).size !== n) return false;
    // The algorithm's own 2-approximation guarantee, checked directly
    // against the MST weight it actually built (both computed by the
    // same run, so this is a correctness check on the construction, not
    // a tautology: it would fail if the shortcutting ever skipped the
    // triangle inequality's guarantee).
    return result.tourLength <= 2 * result.mstWeight + 1e-6;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 6, label: 'cities' },
};
