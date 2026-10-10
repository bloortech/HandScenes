// Bellman-Ford: single-source shortest paths that also tolerates negative
// edge weights, by relaxing every edge |V|-1 times (enough rounds for any
// shortest path, which never repeats a vertex, to be fully propagated) and
// then taking one more round to check whether anything can still improve,
// which can only happen if a negative-weight cycle is reachable from the
// source. No DOM access.
import { makeRandomGraph, isShortestPathCertificate, hasNegativeCycleReachableFrom } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'dist[src] = 0, dist[*] = Infinity',
  'repeat |V| - 1 times: for every edge (u, v, w): if dist[u] + w < dist[v]: dist[v] = dist[u] + w',
  'one more pass: if any edge still relaxes, a negative-weight cycle is reachable from src',
];

function frame(nodes, edges, dist, highlight, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: `${nd.id}:${dist[nd.id] === Infinity ? '-' : dist[nd.id]}`,
    active: highlight && (nd.id === highlight.u || nd.id === highlight.v),
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: edges.map((e) => [e.u, e.v, e.w]) };
}

function* run(input) {
  const { n, edges, directed, src } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  if (n === 0) return { dist: [], negativeCycle: false };
  const dist = Array(n).fill(Infinity);
  dist[src] = 0;

  yield frame(nodes, edges, dist, null, `Start at ${src}: dist[${src}] = 0.`, 0);
  for (let round = 1; round <= Math.max(0, n - 1); round++) {
    let improved = false;
    for (const e of edges) {
      if (dist[e.u] !== Infinity && dist[e.u] + e.w < dist[e.v]) {
        dist[e.v] = dist[e.u] + e.w;
        improved = true;
        yield frame(nodes, edges, dist, e, `Round ${round}, relax (${e.u}, ${e.v}): dist[${e.u}] + ${e.w} = ${dist[e.v]} beats the old dist[${e.v}].`, 1);
      }
      if (!directed && dist[e.v] !== Infinity && dist[e.v] + e.w < dist[e.u]) {
        dist[e.u] = dist[e.v] + e.w;
        improved = true;
        yield frame(nodes, edges, dist, e, `Round ${round}, relax (${e.v}, ${e.u}): dist[${e.v}] + ${e.w} = ${dist[e.u]} beats the old dist[${e.u}].`, 1);
      }
    }
    if (!improved) {
      yield frame(nodes, edges, dist, null, `Round ${round} relaxed nothing: distances have stabilised early.`, 1);
      break;
    }
  }

  let negativeCycle = false;
  for (const e of edges) {
    if (dist[e.u] !== Infinity && dist[e.u] + e.w < dist[e.v]) negativeCycle = true;
    if (!directed && dist[e.v] !== Infinity && dist[e.v] + e.w < dist[e.u]) negativeCycle = true;
  }
  yield frame(
    nodes,
    edges,
    dist,
    null,
    negativeCycle
      ? 'Extra pass still finds an edge to relax: a negative-weight cycle is reachable from the source, so "shortest path" is undefined.'
      : 'Extra pass relaxes nothing: every distance is final.',
    2
  );
  return { dist: negativeCycle ? dist.map(() => null) : dist, negativeCycle };
}

export default {
  id: 'bellman-ford',
  title: 'Bellman-Ford',
  module: 'm06',
  course: 'CSC263/265, CSC373',
  clrs: 'Single-Source Shortest Paths',
  summary:
    "Bellman-Ford solves the same single-source shortest-paths problem as Dijkstra, but it also works when some edges have negative weight. " +
    'The idea is brute simplicity: relax every single edge, |V| - 1 times over. A shortest path never repeats a vertex, so it has at most |V| - 1 edges, and each full round of relaxing every edge propagates a correct distance one edge further along every such path, so after |V| - 1 rounds every distance that can stabilise has. ' +
    'One more round then acts as a detector: if any edge can still be relaxed, the only way that can happen is a cycle reachable from the source whose total weight is negative, which makes "shortest path" meaningless (you could loop it forever to drive the distance to minus infinity). ' +
    'When a negative cycle is found, this sandbox reports it instead of a distance table. ' +
    "It costs more than Dijkstra's tight scheduling, but handles a strictly more general problem.",
  code: CODE,
  complexity: {
    time: 'O(V * E).',
    why: 'It is |V| - 1 full rounds, each relaxing every one of the E edges once.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, weighted: true, weightMin: 1, weightMax: 8, allowNegative: true, extraEdgeFraction: 0.45 });
    const src = n > 0 ? Math.floor(rng() * n) : 0;
    return { n, directed, edges, src };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, directed, src } = input;
    if (n === 0) return result.dist.length === 0 && !result.negativeCycle;
    const expectedNegCycle = hasNegativeCycleReachableFrom(n, edges, directed, src);
    if (result.negativeCycle !== expectedNegCycle) return false;
    if (expectedNegCycle) return true;
    return isShortestPathCertificate(n, edges, directed, src, result.dist);
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 6, label: 'vertices' },
};
