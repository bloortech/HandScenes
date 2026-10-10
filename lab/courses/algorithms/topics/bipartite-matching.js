// Maximum bipartite matching, via max flow: connect a source to every
// left vertex and every right vertex to a sink, all with capacity 1, keep
// the original left-to-right edges at capacity 1, and the maximum flow in
// that network is exactly the maximum matching (an edge (i, j) is in the
// matching iff the edge carries 1 unit of flow). Capacity 1 everywhere is
// what forces each left vertex to send flow to at most one right vertex,
// and vice versa, i.e. forces a matching. No DOM access.
import { buildResidual, bfsAugmentingPath, pushFlow, edgeFlows } from '../engine/flow.js';

const CODE = [
  'build a flow network: s -> left (cap 1), left -> right edges (cap 1), right -> t (cap 1)',
  'run Edmonds-Karp on it to find the maximum flow',
  'the matching is every left-right edge carrying 1 unit of flow',
  'size of the maximum matching = value of the maximum flow',
];

function buildNetwork(p, q, bipEdges) {
  const s = 0;
  const left = (i) => 1 + i;
  const right = (j) => 1 + p + j;
  const t = 1 + p + q;
  const n = 2 + p + q;
  const edges = [];
  for (let i = 0; i < p; i++) edges.push({ u: s, v: left(i), cap: 1 });
  for (const [i, j] of bipEdges) edges.push({ u: left(i), v: right(j), cap: 1 });
  for (let j = 0; j < q; j++) edges.push({ u: right(j), v: t, cap: 1 });
  return { n, s, t, left, right, edges };
}

function frame(p, q, left, right, s, t, edges, residual, pathNodes, caption, line) {
  const flows = edgeFlows(residual, edges);
  const pathSet = new Set(pathNodes || []);
  const nodes = [
    { id: s, label: 's', x: 4, y: 50, active: pathSet.has(s) },
    { id: t, label: 't', x: 96, y: 50, active: pathSet.has(t) },
  ];
  for (let i = 0; i < p; i++) nodes.push({ id: left(i), label: `L${i}`, x: 35, y: p <= 1 ? 50 : 8 + (i / (p - 1)) * 84, active: pathSet.has(left(i)) });
  for (let j = 0; j < q; j++) nodes.push({ id: right(j), label: `R${j}`, x: 65, y: q <= 1 ? 50 : 8 + (j / (q - 1)) * 84, active: pathSet.has(right(j)) });
  const dispEdges = edges.map((e, i) => [e.u, e.v, flows[i] === 1 ? '1*' : '0']);
  return { kind: 'tree', line, code: CODE, caption, nodes, edges: dispEdges };
}

function* run(input) {
  const { p, q, bipEdges } = input;
  const { n, s, t, left, right, edges } = buildNetwork(p, q, bipEdges);
  const residual = buildResidual(n, edges);
  if (p === 0 || q === 0) {
    yield frame(p, q, left, right, s, t, edges, residual, null, 'One side is empty: the maximum matching is empty.', 0);
    return { matching: [], size: 0, flows: edgeFlows(residual, edges) };
  }

  yield frame(p, q, left, right, s, t, edges, residual, null, `Built the flow network: ${p} left, ${q} right, source and sink added.`, 0);
  let maxFlow = 0;
  let path = bfsAugmentingPath(residual, s, t);
  while (path) {
    const pathNodes = [...path.map((pp) => pp.u), t];
    const bottleneck = pushFlow(residual, path);
    maxFlow += bottleneck;
    yield frame(p, q, left, right, s, t, edges, residual, pathNodes, `Augment along ${pathNodes.join(' -> ')}: one more matched pair. Matching size so far: ${maxFlow}.`, 1);
    path = bfsAugmentingPath(residual, s, t);
  }

  const flows = edgeFlows(residual, edges);
  const matching = [];
  for (let i = 0; i < bipEdges.length; i++) {
    const edgeIdx = p + i; // edges[0..p-1] are s->left, then bipEdges, then right->t
    if (flows[edgeIdx] === 1) matching.push(bipEdges[i]);
  }
  yield frame(p, q, left, right, s, t, edges, residual, null, `No more augmenting path: the maximum matching has ${maxFlow} pair(s), marked with *.`, 2);
  return { matching, size: maxFlow, flows };
}

// Independent oracle: the classic augmenting-path matching algorithm
// (Kuhn's algorithm), worked directly on the bipartite adjacency, with no
// flow network at all. Used only by check(), so a bug shared between it
// and the flow-based run() above would still be caught.
function bruteMaxMatching(p, q, bipEdges) {
  const adj = Array.from({ length: p }, () => []);
  for (const [i, j] of bipEdges) adj[i].push(j);
  const matchRight = Array(q).fill(-1);

  function tryKuhn(i, visited) {
    for (const j of adj[i]) {
      if (visited[j]) continue;
      visited[j] = true;
      if (matchRight[j] === -1 || tryKuhn(matchRight[j], visited)) {
        matchRight[j] = i;
        return true;
      }
    }
    return false;
  }

  let size = 0;
  for (let i = 0; i < p; i++) {
    const visited = Array(q).fill(false);
    if (tryKuhn(i, visited)) size++;
  }
  return size;
}

export default {
  id: 'bipartite-matching',
  title: 'Bipartite matching',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Matchings in Bipartite Graphs',
  summary:
    'A matching in a bipartite graph (vertices split into a left side and a right side, edges only between the two sides) pairs up some left vertices with some right vertices, each vertex used at most once; a maximum matching uses as many pairs as possible. ' +
    'Turning this into a max-flow problem is a clean reduction: add a source wired to every left vertex and a sink wired from every right vertex, give every edge (old and new) capacity 1, and find the maximum flow. ' +
    'Capacity 1 on the source edges stops any left vertex from sending more than one unit (being matched twice); capacity 1 on the sink edges does the same for the right side. ' +
    'Any integer flow in this network is automatically a matching, and the maximum flow is automatically the biggest one, so Ford-Fulkerson (here, Edmonds-Karp) solves bipartite matching for free. ' +
    'The sandbox marks every matched pair with a star as the flow finds it.',
  code: CODE,
  complexity: {
    time: 'O(V E).',
    why: 'Every augmentation sends exactly 1 unit of flow (all capacities are 1), and the maximum possible matching size is at most min(|L|, |R|) <= V, so there are at most O(V) augmentations, each an O(E) BFS.',
  },
  makeInput(rng, size) {
    const p = Math.max(0, Math.min(6, size));
    const q = p;
    const bipEdges = [];
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < q; j++) {
        if (rng() < 0.45) bipEdges.push([i, j]);
      }
    }
    return { p, q, bipEdges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { p, q, bipEdges } = input;
    const edgeSet = new Set(bipEdges.map(([i, j]) => `${i},${j}`));
    const usedLeft = new Set();
    const usedRight = new Set();
    for (const [i, j] of result.matching) {
      if (!edgeSet.has(`${i},${j}`)) return false;
      if (usedLeft.has(i) || usedRight.has(j)) return false;
      usedLeft.add(i);
      usedRight.add(j);
    }
    if (result.matching.length !== result.size) return false;
    return result.size === bruteMaxMatching(p, q, bipEdges);
  },
  sandbox: { type: 'n', min: 0, max: 6, default: 4, label: 'vertices per side' },
};
