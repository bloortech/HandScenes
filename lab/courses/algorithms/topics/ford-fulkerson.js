// Ford-Fulkerson: the generic maximum-flow method. Repeatedly find *any*
// path from source to sink along which every edge still has spare residual
// capacity (an "augmenting path"), push as much flow as the tightest edge
// on it allows, and repeat until no such path remains. The residual graph
// (what capacity is left, plus a "give-back" arc for every unit of flow
// already sent) is what lets a later path undo an earlier bad choice.
// No DOM access.
import { makeRandomGraph } from '../engine/graph.js';
import { layoutLayered } from '../engine/layout.js';
import { buildResidual, dfsAugmentingPath, pushFlow, edgeFlows, isMaxFlowCertificate } from '../engine/flow.js';

const CODE = [
  'flow(u, v) = 0 for every edge (u, v)',
  'while there is a path p from s to t using only edges with residual capacity > 0:',
  '  c_f(p) = the smallest residual capacity along p   # the bottleneck',
  '  push c_f(p) units of flow along p, and c_f(p) of "give-back" capacity on its reverse arcs',
  'return flow   # no augmenting path left: this is a maximum flow',
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
  yield frame(nodes, edges, residual, null, s, t, `Start: every edge carries 0 flow. Look for a path from ${s} to ${t} with spare residual capacity.`, 0);

  let path = dfsAugmentingPath(residual, s, t);
  while (path) {
    const pathNodes = [...path.map((p) => p.u), t];
    yield frame(nodes, edges, residual, pathNodes, s, t, `Found an augmenting path: ${pathNodes.join(' -> ')}.`, 1);
    const bottleneck = pushFlow(residual, path);
    maxFlow += bottleneck;
    yield frame(nodes, edges, residual, pathNodes, s, t, `Bottleneck ${bottleneck}: push that much flow along the path. Total flow so far: ${maxFlow}.`, 3);
    path = dfsAugmentingPath(residual, s, t);
  }

  const flows = edgeFlows(residual, edges);
  yield frame(nodes, edges, residual, null, s, t, `No path from ${s} to ${t} still has residual capacity: the max flow is ${maxFlow}.`, 4);
  return { maxFlow, flows };
}

export default {
  id: 'ford-fulkerson',
  title: 'Ford-Fulkerson',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Maximum Flow',
  summary:
    'A flow network is a directed graph where every edge has a capacity, and a flow sends some amount along each edge, never exceeding that capacity, with every vertex except the source and sink passing on exactly what it receives. ' +
    'Ford-Fulkerson finds the maximum possible flow from source to sink by repeatedly augmenting: find any path from s to t where every edge still has spare room (its residual capacity), and push as much flow as the tightest edge on that path allows. ' +
    'The trick that makes this provably correct is the residual graph: alongside the spare forward capacity, every unit of flow already sent creates a matching unit of "give-back" capacity on the reverse arc, so a later augmenting path is allowed to undo an earlier choice that turns out not to be part of any maximum flow. ' +
    'The loop stops exactly when no augmenting path remains, which (by the max-flow min-cut theorem, the next topic) is exactly when the flow is maximum. ' +
    'The sandbox labels every edge "flow/capacity" and highlights the current augmenting path in amber as it is found and then pushed.',
  code: CODE,
  complexity: {
    time: 'O(E * f*), where f* is the value of the maximum flow (for integer capacities).',
    why: 'Each augmenting path can be found in O(E) time (a plain DFS/BFS over the edges), and since capacities are integers, every augmentation increases the flow by at least 1, so there are at most f* of them.',
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
