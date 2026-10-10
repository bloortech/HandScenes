// Edmonds-Karp: Ford-Fulkerson with one refinement that turns an
// unbounded-looking method into a polynomial one. Instead of finding *any*
// augmenting path, always find the *shortest* one (fewest edges), via a
// plain BFS of the residual graph. CLRS proves that choice bounds the
// total number of augmentations by O(VE), giving O(VE^2) overall; a bad
// choice of path under plain Ford-Fulkerson can, in principle, need far
// more augmentations than that on the same network. No DOM access.
import { makeRandomGraph } from '../engine/graph.js';
import { layoutLayered } from '../engine/layout.js';
import { buildResidual, bfsAugmentingPath, pushFlow, edgeFlows, isMaxFlowCertificate } from '../engine/flow.js';

const CODE = [
  'flow(u, v) = 0 for every edge (u, v)',
  'while BFS finds a shortest path p from s to t using edges with residual capacity > 0:',
  '  c_f(p) = the smallest residual capacity along p   # the bottleneck',
  '  push c_f(p) units of flow along p, and c_f(p) of "give-back" capacity on its reverse arcs',
  'return flow   # at most O(VE) augmentations happen before BFS finds no path left',
];

function frame(nodes, edges, residual, pathNodes, s, t, caption, line) {
  const flows = edgeFlows(residual, edges);
  const pathSet = new Set(pathNodes || []);
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: nd.id === s ? `${nd.id} (s)` : nd.id === t ? `${nd.id} (t)` : String(nd.id),
    active: pathSet.has(nd.id),
  }));
  const dispEdges = edges.map((e, i) => [e.u, e.v, `${flows[i]}/${e.cap}`]);
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: dispEdges };
}

function* run(input) {
  const { n, edges, s, t } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutLayered(nodes, edges);
  if (n === 0) {
    yield frame(nodes, edges, buildResidual(0, []), null, 0, 0, 'Empty network: nothing to flow.', 0);
    return { maxFlow: 0, flows: [] };
  }
  if (s === t) {
    yield frame(nodes, edges, buildResidual(n, edges), null, s, t, 'Source and sink are the same vertex: the flow is vacuously 0.', 0);
    return { maxFlow: 0, flows: edgeFlows(buildResidual(n, edges), edges) };
  }

  const residual = buildResidual(n, edges);
  let maxFlow = 0;
  let rounds = 0;
  yield frame(nodes, edges, residual, null, s, t, `Start: every edge carries 0 flow. BFS for the shortest path from ${s} to ${t} with residual capacity.`, 0);

  let path = bfsAugmentingPath(residual, s, t);
  while (path) {
    rounds++;
    const pathNodes = [...path.map((p) => p.u), t];
    yield frame(nodes, edges, residual, pathNodes, s, t, `Shortest augmenting path (${path.length} edges): ${pathNodes.join(' -> ')}.`, 1);
    const bottleneck = pushFlow(residual, path);
    maxFlow += bottleneck;
    yield frame(nodes, edges, residual, pathNodes, s, t, `Bottleneck ${bottleneck}: push that much flow. Total flow after ${rounds} augmentation(s): ${maxFlow}.`, 3);
    path = bfsAugmentingPath(residual, s, t);
  }

  const flows = edgeFlows(residual, edges);
  yield frame(nodes, edges, residual, null, s, t, `BFS finds no path left: the max flow is ${maxFlow}, found in ${rounds} augmentation(s).`, 4);
  return { maxFlow, flows };
}

export default {
  id: 'edmonds-karp',
  title: 'Edmonds-Karp',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Maximum Flow',
  summary:
    'Edmonds-Karp is Ford-Fulkerson with one specific tie-breaking rule: among all the augmenting paths available in the residual graph, always take a shortest one, measured by number of edges, which a plain breadth-first search finds directly. ' +
    'Plain Ford-Fulkerson is correct no matter which augmenting path it picks, but with an unlucky choice it can take far more augmentations than the capacities would suggest; always taking the shortest path rules that out. ' +
    'CLRS proves that with this rule, the total number of augmentations is at most O(VE), and each BFS costs O(E), for an overall O(VE^2), a bound that depends only on the size of the graph, not on how large the capacities are. ' +
    'The sandbox shows the same residual-graph bookkeeping as Ford-Fulkerson, but the path it finds each round is always the one BFS would reach first.',
  code: CODE,
  complexity: {
    time: 'O(V E^2).',
    why: 'CLRS shows the number of BFS-found augmentations is O(VE) (each edge can be the "bottleneck" edge of a shortest path only O(V) times, since its distance from the source only increases from then on), and each BFS costs O(E), giving O(VE) * O(E) = O(VE^2).',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(8, size));
    if (n <= 1) return { n, edges: [], s: 0, t: 0 };
    const { edges } = makeRandomGraph(rng, n, { directed: true, weighted: true, weightMin: 1, weightMax: 8, dag: true, extraEdgeFraction: 0.5 });
    const capEdges = edges.map(({ u, v, w }) => ({ u, v, cap: w }));
    return { n, edges: capEdges, s: 0, t: n - 1 };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, s, t } = input;
    if (n <= 1 || s === t) return result.maxFlow === 0;
    return isMaxFlowCertificate(n, edges, s, t, result.flows, result.maxFlow);
  },
  sandbox: { type: 'n', min: 0, max: 8, default: 6, label: 'vertices' },
};
