// Depth-first search: dive as deep as possible along each edge before
// backtracking, timestamping every vertex with when it was first seen
// (discovery) and when its whole subtree is done (finish), and classifying
// every edge as tree/back/forward/cross by what those timestamps say about
// its two endpoints. No DOM access.
import { makeRandomGraph, adjList } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const WHITE = 0, GRAY = 1, BLACK = 2;

const CODE = [
  'for each vertex u, in order: if white(u): visit(u)',
  'visit(u): color[u] = gray; disc[u] = time++',
  '  for v in Adj[u]:',
  '    white(v): tree edge, parent[v] = u, visit(v)',
  '    gray(v): back edge   black(v): forward (disc[u]<disc[v]) or cross edge',
  'color[u] = black; fin[u] = time++',
];

function edgeKey(u, v) { return `${u}>${v}`; }

function* dfsVisit(u, adj, color, disc, fin, parent, edgeType, time, nodes, edges) {
  color[u] = GRAY;
  disc[u] = time.t++;
  yield snap(nodes, edges, color, disc, fin, edgeType, u, `Discover ${u} at time ${disc[u]}.`, 1);
  for (const { to: v } of adj[u]) {
    if (color[v] === WHITE) {
      edgeType.set(edgeKey(u, v), 'tree');
      parent[v] = u;
      yield snap(nodes, edges, color, disc, fin, edgeType, u, `Edge ${u}->${v}: ${v} is white, so it's a tree edge.`, 3);
      yield* dfsVisit(v, adj, color, disc, fin, parent, edgeType, time, nodes, edges);
    } else if (color[v] === GRAY) {
      edgeType.set(edgeKey(u, v), 'back');
      yield snap(nodes, edges, color, disc, fin, edgeType, u, `Edge ${u}->${v}: ${v} is gray (an ancestor still on the stack), so it's a back edge.`, 4);
    } else {
      const kind = disc[u] < disc[v] ? 'forward' : 'cross';
      edgeType.set(edgeKey(u, v), kind);
      yield snap(nodes, edges, color, disc, fin, edgeType, u, `Edge ${u}->${v}: ${v} is already black, disc[${u}]${kind === 'forward' ? '<' : '>'}disc[${v}], so it's a ${kind} edge.`, 4);
    }
  }
  color[u] = BLACK;
  fin[u] = time.t++;
  yield snap(nodes, edges, color, disc, fin, edgeType, u, `Finish ${u} at time ${fin[u]}: its whole subtree is done.`, 5);
}

function snap(nodes, edges, color, disc, fin, edgeType, active, caption, line) {
  const dispNodes = nodes.map((nd) => ({
    ...nd,
    label: `${nd.id}${disc[nd.id] != null ? `/${disc[nd.id]}${fin[nd.id] != null ? `,${fin[nd.id]}` : ''}` : ''}`,
    active: nd.id === active,
    dim: color[nd.id] === WHITE,
    memoHit: color[nd.id] === BLACK,
    compare: color[nd.id] === GRAY && nd.id !== active,
  }));
  const dispEdges = edges.map(({ u, v }) => [u, v, edgeType.get(edgeKey(u, v)) ? edgeType.get(edgeKey(u, v))[0].toUpperCase() : '']);
  return { kind: 'tree', line, code: CODE, caption, nodes: dispNodes, edges: dispEdges };
}

function* run(input) {
  const { n, edges, directed } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id }));
  layoutCircle(nodes);
  const adj = adjList(n, edges, directed);
  const color = Array(n).fill(WHITE);
  const disc = Array(n).fill(null);
  const fin = Array(n).fill(null);
  const parent = Array(n).fill(-1);
  const edgeType = new Map();
  const time = { t: 0 };

  for (let u = 0; u < n; u++) {
    if (color[u] === WHITE) {
      yield snap(nodes, edges, color, disc, fin, edgeType, -1, `Vertex ${u} is still white: start a new DFS tree there.`, 0);
      yield* dfsVisit(u, adj, color, disc, fin, parent, edgeType, time, nodes, edges);
    }
  }
  yield snap(nodes, edges, color, disc, fin, edgeType, -1, 'Every vertex is black: DFS forest complete.', 0);
  return { disc, fin, parent, edgeType: Array.from(edgeType.entries()) };
}

export default {
  id: 'dfs',
  title: 'Depth-first search',
  module: 'm06',
  course: 'CSC263/265',
  clrs: 'Elementary Graph Algorithms (Depth-First Search)',
  summary:
    'Depth-first search dives as deep as it can along one path before backtracking, in contrast to BFS\'s wave-by-wave exploration. ' +
    'Every vertex gets two timestamps: disc[u] when it is first reached, and fin[u] once every vertex reachable from it (through still-unexplored edges) has also finished. ' +
    'Those timestamps classify every edge: a tree edge finds a new (white) vertex, a back edge points at an ancestor still being visited (gray), and once a vertex is done (black) the edge pointing at it is a forward edge if it leads to a descendant or a cross edge otherwise. ' +
    'Back edges are the key one: a directed graph has a cycle if and only if DFS finds at least one back edge. ' +
    'The label on each edge is the first letter of its type once DFS has looked at it. White vertices are dim, gray ones (on the current path) are cyan, black ones (finished) are a softer highlight.',
  code: CODE,
  complexity: { time: 'O(V + E) with an adjacency list.', why: 'Every vertex is visited exactly once (its color only changes white to gray to black once), and every edge is examined exactly once from its tail.' },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: true, extraEdgeFraction: 0.5 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    if (n === 0) return result.disc.length === 0;
    const { disc, fin, parent } = result;
    const edgeType = new Map(result.edgeType);
    // disc/fin are 2n distinct timestamps, disc[v] < fin[v] for every v.
    const stamps = new Set();
    for (let v = 0; v < n; v++) {
      if (disc[v] == null || fin[v] == null) return false;
      if (disc[v] >= fin[v]) return false;
      stamps.add(disc[v]);
      stamps.add(fin[v]);
    }
    if (stamps.size !== 2 * n) return false;

    // Every tree edge agrees with the recorded parent, and its interval
    // nests strictly inside its parent's (the parenthesis theorem).
    for (const { u, v } of edges) {
      const kind = edgeType.get(edgeKey(u, v));
      if (!kind) return false;
      if (kind === 'tree') {
        if (parent[v] !== u) return false;
        if (!(disc[u] < disc[v] && fin[v] < fin[u])) return false;
      } else if (kind === 'back') {
        if (!(disc[v] < disc[u] && fin[u] < fin[v])) return false;
      } else if (kind === 'forward') {
        if (!(disc[u] < disc[v] && fin[v] < fin[u])) return false;
      } else if (kind === 'cross') {
        if (!(fin[v] < disc[u])) return false;
      } else {
        return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 7, label: 'vertices' },
};
