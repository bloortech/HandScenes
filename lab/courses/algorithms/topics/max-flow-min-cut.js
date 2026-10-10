// The max-flow min-cut theorem: the value of a maximum flow always equals
// the capacity of a minimum cut (a partition of the vertices into S
// containing s and T containing t, with the cut's capacity being the total
// capacity of edges crossing from S to T). This sandbox runs Edmonds-Karp
// to completion, then reads the cut straight off the final residual graph:
// S is whatever is still reachable from s once no augmenting path is left,
// T is everything else, and the edges from S to T are the cut. No DOM
// access.
import { makeRandomGraph } from '../engine/graph.js';
import { layoutLayered } from '../engine/layout.js';
import { buildResidual, bfsAugmentingPath, pushFlow, edgeFlows, minCutFromFlow, isMaxFlowCertificate } from '../engine/flow.js';

const CODE = [
  'run Edmonds-Karp to find a maximum flow (and its final residual graph)',
  'S = vertices still reachable from s in the residual graph; T = everything else',
  'the cut edges are every original edge from a vertex in S to a vertex in T',
  'max-flow min-cut theorem: capacity(S, T) = value of the maximum flow, always',
];

function frame(nodes, edges, residual, pathNodes, reach, cutSet, s, t, caption, line) {
  const flows = edgeFlows(residual, edges);
  const pathSet = new Set(pathNodes || []);
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: nd.id === s ? `${nd.id} (s)` : nd.id === t ? `${nd.id} (t)` : String(nd.id),
    active: pathSet.has(nd.id) || (reach && reach[nd.id] && !pathNodes),
    dim: reach ? !reach[nd.id] : false,
  }));
  const dispEdges = edges.map((e, i) => {
    const label = `${flows[i]}/${e.cap}`;
    return [e.u, e.v, cutSet && cutSet.has(i) ? `${label} *cut*` : label];
  });
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: dispEdges };
}

function* run(input) {
  const { n, edges, s, t } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutLayered(nodes, edges);
  if (n === 0 || s === t) {
    yield frame(nodes, edges, buildResidual(Math.max(n, 1), edges), null, null, null, s, t, 'Trivial network: max flow and min cut are both 0.', 0);
    return { maxFlow: 0, flows: edgeFlows(buildResidual(n, edges), edges), cutEdgeIndices: [], cutCap: 0 };
  }

  const residual = buildResidual(n, edges);
  let maxFlow = 0;
  yield frame(nodes, edges, residual, null, null, null, s, t, `Run Edmonds-Karp from ${s} to ${t} first.`, 0);

  let path = bfsAugmentingPath(residual, s, t);
  while (path) {
    const pathNodes = [...path.map((p) => p.u), t];
    const bottleneck = pushFlow(residual, path);
    maxFlow += bottleneck;
    yield frame(nodes, edges, residual, pathNodes, null, null, s, t, `Augment along ${pathNodes.join(' -> ')} by ${bottleneck}. Flow so far: ${maxFlow}.`, 1);
    path = bfsAugmentingPath(residual, s, t);
  }

  const flows = edgeFlows(residual, edges);
  const { reach, cutEdgeIndices, cutCap } = minCutFromFlow(n, edges, s, flows);
  const cutSet = new Set(cutEdgeIndices);
  yield frame(nodes, edges, residual, null, reach, null, s, t, `No augmenting path left. Flow value: ${maxFlow}. S = {${nodes.filter((nd) => reach[nd.id]).map((nd) => nd.id).join(', ')}} is still reachable from ${s}.`, 1);
  yield frame(nodes, edges, residual, null, reach, cutSet, s, t, `Watch the cut appear: the edges from S to T total capacity ${cutCap}, exactly the max flow value.`, 2);
  return { maxFlow, flows, cutEdgeIndices, cutCap };
}

export default {
  id: 'max-flow-min-cut',
  title: 'Max-flow min-cut theorem',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Maximum Flow',
  summary:
    "An s-t cut splits every vertex into two groups, S (containing the source) and T (containing the sink); its capacity is the total capacity of edges that cross from S into T. " +
    'Any flow is bounded above by any cut\'s capacity (everything flowing from s to t has to cross that boundary somewhere), so the maximum flow can never exceed the minimum cut. ' +
    'The max-flow min-cut theorem says that bound is always tight: the maximum flow value equals the minimum cut capacity, exactly. ' +
    'This sandbox runs Edmonds-Karp to find a maximum flow, then reads a minimum cut straight off its final residual graph: S is whatever is still reachable from the source once no augmenting path remains, T is the rest, and the cut edges (marked "*cut*") are exactly the original edges crossing from S to T. ' +
    "That the cut's capacity always comes out equal to the flow value is the theorem itself, shown rather than just stated.",
  code: CODE,
  complexity: {
    time: 'O(V E^2), the cost of the Edmonds-Karp run; reading the cut off the residual graph afterwards is one O(V + E) traversal.',
    why: 'Finding the flow dominates (see Edmonds-Karp). Once the flow is final, the cut is just "which vertices does a DFS/BFS from s still reach in the residual graph," a single linear pass.',
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
    if (n <= 1 || s === t) return result.maxFlow === 0 && result.cutCap === 0;
    if (!isMaxFlowCertificate(n, edges, s, t, result.flows, result.maxFlow)) return false;
    return Math.abs(result.cutCap - result.maxFlow) < 1e-6;
  },
  sandbox: { type: 'n', min: 0, max: 8, default: 6, label: 'vertices' },
};
