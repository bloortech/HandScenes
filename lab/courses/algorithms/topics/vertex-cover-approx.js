// CLRS's APPROX-VERTEX-COVER (35.1): a dead-simple 2-approximation. Pick
// any remaining edge, throw BOTH its endpoints into the cover, delete
// every edge either endpoint touches, repeat. No DOM access.
import { makeRandomGraph } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'C = {}; E\' = all edges',
  'while E\' is not empty:',
  '  pick an arbitrary (u, v) in E\'',
  '  C = C union {u, v}',
  '  remove from E\' every edge touching u or v',
  'return C',
];

function graphFrame(nodes, edges, cover, candidate, caption, line) {
  const coverSet = new Set(cover);
  const drawn = nodes.map((n) => ({ ...n, active: coverSet.has(n.id), compare: candidate && (n.id === candidate.u || n.id === candidate.v) && !coverSet.has(n.id) }));
  return { kind: 'tree', line, code: CODE, caption, nodes: drawn, edges: edges.map((e) => [e.u, e.v]), emptyText: '(no edges)' };
}

function isVertexCover(edges, cover) {
  const s = new Set(cover);
  return edges.every(({ u, v }) => s.has(u) || s.has(v));
}

function bruteForceMinVertexCover(n, edges) {
  for (let size = 0; size <= n; size++) {
    for (let mask = 0; mask < (1 << n); mask++) {
      const bits = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i);
      if (bits.length !== size) continue;
      if (isVertexCover(edges, bits)) return bits.length;
    }
  }
  return n;
}

function* run(input) {
  const { n, edges } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id, label: String(id) }));
  layoutCircle(nodes, { r: 32 });

  let remaining = edges.slice();
  const cover = [];
  yield graphFrame(nodes, edges, cover, null, `Graph with ${edges.length} edge(s). Build a vertex cover by repeatedly grabbing both ends of an uncovered edge.`, 0);

  while (remaining.length > 0) {
    const { u, v } = remaining[0];
    yield graphFrame(nodes, edges, cover, { u, v }, `Pick edge (${u}, ${v}): add both endpoints to the cover.`, 2);
    cover.push(u, v);
    remaining = remaining.filter((e) => e.u !== u && e.v !== u && e.u !== v && e.v !== v);
    yield graphFrame(nodes, edges, cover, null, `Cover so far: {${cover.join(', ')}}. Removed every edge touching ${u} or ${v}; ${remaining.length} edge(s) left.`, 4);
  }
  yield graphFrame(nodes, edges, cover, null, `Done. Vertex cover of size ${cover.length}: {${cover.join(', ')}}.`, 5);

  return { cover, n, edges };
}

export default {
  id: 'vertex-cover-approx',
  title: 'Vertex cover approximation',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'Approximation Algorithms',
  summary:
    "Finding the SMALLEST vertex cover is NP-hard, but getting within a factor of 2 of the smallest one is easy and fast. Pick any edge that is not yet covered, throw BOTH its endpoints into the cover (even though only one of them might really be needed), and delete every edge either endpoint touches, since those are now covered no matter what. Repeat until no edges are left. " +
    'Every edge the algorithm picks contributes 2 vertices to the cover, and no two picked edges can ever share a vertex (if they did, the second edge would already have been deleted when the first one was processed). So the picked edges form a MATCHING, a set of edges with no shared endpoints, and any vertex cover (including the optimal one) must contain at least one endpoint of every edge in that matching, which means the optimal cover has size at least as big as the number of edges picked. ' +
    "This algorithm's cover has exactly twice that many vertices (2 per picked edge), so it is never worse than 2 times the optimal size: a 2-approximation, and about as simple as an approximation algorithm gets.",
  code: CODE,
  complexity: {
    time: 'O(E) (or O(V + E) with an adjacency list): each edge is looked at O(1) amortised times across the whole run.',
    why: 'Each iteration removes at least one edge (the one just picked) and the endpoints it adds are never revisited as "pick points" again, so the total work across all iterations is proportional to the number of edges.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { edges } = makeRandomGraph(rng, n, { directed: false, weighted: false, extraEdgeFraction: 0.4 });
    return { n, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    if (!isVertexCover(edges, result.cover)) return false;
    if (n === 0 || edges.length === 0) return result.cover.length === 0;
    if (n > 14) return true; // too big to brute-force the optimum here; coverage still validated at smaller sizes
    const opt = bruteForceMinVertexCover(n, edges);
    return result.cover.length <= 2 * opt;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 6, label: 'vertices' },
};
