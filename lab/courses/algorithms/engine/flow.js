// Shared flow-network helpers for m08 (Ford-Fulkerson, Edmonds-Karp,
// max-flow min-cut, bipartite matching via max flow). A flow network here
// is always `{ n, edges }` with `edges: [{ u, v, cap }]`, directed (model
// an undirected capacity as two antiparallel edges if a topic ever needs
// that). No DOM access, like graph.js.

// Builds a residual-capacity adjacency structure: residual[u] is a list of
// `{ to, cap, flow, rev, origIdx }`, where `rev` is the index (inside
// residual[to]) of the paired reverse arc, and `origIdx` is this arc's
// position in the original `edges` array (-1 for the reverse arc, which
// has no original edge of its own). Every original edge (u, v, cap)
// contributes a forward arc of capacity `cap` and a reverse arc of
// capacity 0, which fills up as flow is pushed, letting a later augmenting
// path "undo" flow along this edge, the residual-graph trick CLRS builds
// Ford-Fulkerson on. Tagging the forward arc with `origIdx` (rather than
// assuming some position in `residual[u]`) is what lets edgeFlows() read
// flow values back out correctly even though a vertex's arc list mixes
// forward arcs (for edges leaving it) with reverse arcs (for edges
// entering it), in whatever order edges happens to list them.
export function buildResidual(n, edges) {
  const residual = Array.from({ length: n }, () => []);
  edges.forEach(({ u, v, cap }, i) => {
    const fwd = { to: v, cap, flow: 0, origIdx: i };
    const bwd = { to: u, cap: 0, flow: 0, origIdx: -1 };
    fwd.rev = residual[v].length;
    bwd.rev = residual[u].length;
    residual[u].push(fwd);
    residual[v].push(bwd);
  });
  return residual;
}

function residualCap(arc) {
  return arc.cap - arc.flow;
}

// Pushes the bottleneck amount of flow along a path (a list of
// `{ u, arcIdx }`, each naming the residual arc out of `u` that the path
// follows) and returns that bottleneck. Updates both directions of every
// arc on the path, which is exactly what keeps the residual graph correct
// for the next augmenting-path search.
export function pushFlow(residual, path) {
  let bottleneck = Infinity;
  for (const { u, arcIdx } of path) {
    bottleneck = Math.min(bottleneck, residualCap(residual[u][arcIdx]));
  }
  for (const { u, arcIdx } of path) {
    const arc = residual[u][arcIdx];
    arc.flow += bottleneck;
    residual[arc.to][arc.rev].flow -= bottleneck;
  }
  return bottleneck;
}

function tracePath(parent, pathArc, s, t) {
  const path = [];
  let v = t;
  while (v !== s) {
    const u = parent[v];
    path.unshift({ u, arcIdx: pathArc[v] });
    v = u;
  }
  return path;
}

// DFS for an augmenting path: Ford-Fulkerson's original choice, any s-t
// path through arcs with positive residual capacity. Returns the path (a
// list of `{ u, arcIdx }`) or null if t is unreachable from s.
export function dfsAugmentingPath(residual, s, t) {
  const n = residual.length;
  const visited = Array(n).fill(false);
  const pathArc = Array(n).fill(-1);
  const parent = Array(n).fill(-1);
  visited[s] = true;
  const stack = [s];
  while (stack.length) {
    const u = stack.pop();
    if (u === t) break;
    for (let i = 0; i < residual[u].length; i++) {
      const arc = residual[u][i];
      if (!visited[arc.to] && residualCap(arc) > 0) {
        visited[arc.to] = true;
        parent[arc.to] = u;
        pathArc[arc.to] = i;
        stack.push(arc.to);
      }
    }
  }
  if (!visited[t]) return null;
  return tracePath(parent, pathArc, s, t);
}

// BFS for an augmenting path: Edmonds-Karp's refinement, always the
// shortest (fewest edges) among residual-graph s-t paths. Same shape as
// dfsAugmentingPath, so a topic can swap one for the other with no other
// change.
export function bfsAugmentingPath(residual, s, t) {
  const n = residual.length;
  const visited = Array(n).fill(false);
  const pathArc = Array(n).fill(-1);
  const parent = Array(n).fill(-1);
  visited[s] = true;
  const queue = [s];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    if (u === t) break;
    for (let i = 0; i < residual[u].length; i++) {
      const arc = residual[u][i];
      if (!visited[arc.to] && residualCap(arc) > 0) {
        visited[arc.to] = true;
        parent[arc.to] = u;
        pathArc[arc.to] = i;
        queue.push(arc.to);
      }
    }
  }
  if (!visited[t]) return null;
  return tracePath(parent, pathArc, s, t);
}

// Which vertices are still reachable from s in the current residual graph.
// Once nothing augments, this set is the S side of a minimum s-t cut (the
// other half of the max-flow min-cut theorem: no augmenting path means S
// is fully "saturated" towards its complement).
export function residualReachable(residual, s) {
  const n = residual.length;
  const visited = Array(n).fill(false);
  visited[s] = true;
  const stack = [s];
  while (stack.length) {
    const u = stack.pop();
    for (const arc of residual[u]) {
      if (!visited[arc.to] && residualCap(arc) > 0) {
        visited[arc.to] = true;
        stack.push(arc.to);
      }
    }
  }
  return visited;
}

// Reads the net flow on each original edge back out of a residual graph:
// every arc's `origIdx` (set by buildResidual) says directly which edge it
// came from, so this needs no assumption about arc order within a vertex.
export function edgeFlows(residual, edges) {
  const flows = Array(edges.length).fill(0);
  for (const arcs of residual) {
    for (const arc of arcs) {
      if (arc.origIdx >= 0) flows[arc.origIdx] = arc.flow;
    }
  }
  return flows;
}

// Rebuilds a residual graph from scratch and stamps a given set of
// per-edge flow values onto it (both the forward arc and its paired
// reverse arc), again using `origIdx` rather than assuming any order.
function residualWithFlows(n, edges, flows) {
  const residual = buildResidual(n, edges);
  for (const arcs of residual) {
    for (const arc of arcs) {
      if (arc.origIdx >= 0) {
        arc.flow = flows[arc.origIdx];
        residual[arc.to][arc.rev].flow = -flows[arc.origIdx];
      }
    }
  }
  return residual;
}

// The max-flow min-cut correctness certificate: every edge's flow obeys
// 0 <= flow <= cap, flow is conserved at every vertex except s and t, the
// net flow out of s (into t) equals the claimed value, and (the optimality
// half, via the theorem) no augmenting path remains in the residual graph
// built from that exact flow. That last condition is what makes this a
// genuine independent check rather than "re-run the same algorithm": it is
// the theorem's own certificate of optimality, true for any maximum flow
// regardless of which algorithm produced it.
export function isMaxFlowCertificate(n, edges, s, t, flows, claimedValue) {
  if (flows.length !== edges.length) return false;
  const net = Array(n).fill(0);
  for (let i = 0; i < edges.length; i++) {
    const { u, v, cap } = edges[i];
    const f = flows[i];
    if (f < -1e-9 || f > cap + 1e-9) return false;
    net[u] -= f;
    net[v] += f;
  }
  for (let x = 0; x < n; x++) {
    if (x === s || x === t) continue;
    if (Math.abs(net[x]) > 1e-6) return false;
  }
  if (Math.abs(net[t] - claimedValue) > 1e-6) return false;
  if (Math.abs(-net[s] - claimedValue) > 1e-6) return false;

  const residual = residualWithFlows(n, edges, flows);
  const reach = residualReachable(residual, s);
  return !reach[t];
}

// The minimum s-t cut induced by a maximum flow: S is everything still
// reachable from s in the residual graph once no augmenting path remains,
// T is the rest, and the cut edges are every original edge crossing from S
// to T. By the max-flow min-cut theorem their total capacity equals the
// flow's value exactly.
export function minCutFromFlow(n, edges, s, flows) {
  const residual = residualWithFlows(n, edges, flows);
  const reach = residualReachable(residual, s);
  const cutEdgeIndices = [];
  let cutCap = 0;
  for (let i = 0; i < edges.length; i++) {
    const { u, v, cap } = edges[i];
    if (reach[u] && !reach[v]) {
      cutEdgeIndices.push(i);
      cutCap += cap;
    }
  }
  return { reach, cutEdgeIndices, cutCap };
}
