// Adjacency list vs adjacency matrix: the same graph, drawn two ways, built
// up vertex by vertex so you can see each row fill in. No DOM access.
import { makeRandomGraph, adjList, adjMatrix } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'for each vertex u:',
  '  list: Adj[u] = neighbours of u',
  '  matrix: for each vertex v: M[u][v] = weight(u, v) or Infinity',
];

function graphNodes(n) {
  const nodes = Array.from({ length: n }, (_, id) => ({ id, label: String(id) }));
  layoutCircle(nodes);
  return nodes;
}

function graphFrame(nodes, edges, caption, line) {
  return {
    kind: 'tree',
    line,
    code: CODE,
    caption,
    nodes: nodes.map((nd) => ({ ...nd })),
    edges: edges.map((e) => [e.u, e.v, e.w]),
  };
}

// A grid of labelled boxes in a normalised 0..100 box, reused for both the
// per-vertex adjacency-list rows and the n x n matrix.
function gridFrame(rows, caption, line, emptyText) {
  const nodes = [];
  const edges = [];
  const rowCount = rows.length;
  for (let r = 0; r < rowCount; r++) {
    const cols = rows[r].cells.length;
    for (let c = 0; c < cols; c++) {
      const cell = rows[r].cells[c];
      nodes.push({
        id: `${r}-${c}`,
        label: cell.label,
        x: 8 + (c + 0.5) * (84 / Math.max(cols, 1)),
        y: 10 + (r + 0.5) * (84 / Math.max(rowCount, 1)),
        w: Math.min(16, 84 / Math.max(cols, 1) - 2),
        h: Math.min(14, 84 / Math.max(rowCount, 1) - 2),
        active: cell.active,
        dim: cell.dim,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges, emptyText };
}

function* run(input) {
  const { n, edges, directed } = input;
  const nodes = graphNodes(n);
  yield graphFrame(nodes, edges, `A graph with ${n} vertices and ${edges.length} edges. First build its adjacency list, then its adjacency matrix.`, undefined);

  const adj = adjList(n, edges, directed);
  const listRows = [];
  for (let u = 0; u < n; u++) {
    listRows.push({ cells: [{ label: `${u}: [${adj[u].map((e) => e.to).join(', ')}]`, active: true }] });
    yield gridFrame(
      listRows.map((row, i) => ({ cells: [{ ...row.cells[0], active: i === listRows.length - 1 }] })),
      `Adjacency list row ${u}: vertex ${u}'s neighbours are stored directly, so listing them costs O(deg(${u})).`,
      1,
      '(no vertices)'
    );
  }

  const matrix = adjMatrix(n, edges, directed);
  const matRows = [];
  for (let u = 0; u < n; u++) {
    const cells = [];
    for (let v = 0; v < n; v++) {
      cells.push({ label: matrix[u][v] === Infinity ? '.' : String(matrix[u][v]), active: false });
    }
    matRows.push({ cells });
    yield gridFrame(
      matRows.map((row, i) => ({ cells: row.cells.map((cell, j) => ({ ...cell, active: i === matRows.length - 1 })) })),
      `Adjacency matrix row ${u}: one cell per vertex, so checking "is there an edge u->v" is O(1) but the whole matrix costs Theta(n^2) space regardless of how sparse the graph is.`,
      2,
      '(no vertices)'
    );
  }

  return { adjList: adj.map((l) => l.map((e) => e.to)), matrix };
}

export default {
  id: 'graph-representations',
  title: 'Graph representations',
  module: 'm06',
  course: 'CSC263/265',
  clrs: 'Elementary Graph Algorithms (Representations of graphs)',
  summary:
    'Every graph algorithm needs to answer "who are u\'s neighbours?", and there are two standard ways to store that. ' +
    'An adjacency list keeps, for each vertex, a short list of its neighbours: compact when the graph is sparse (few edges), and exactly what most of this course\'s algorithms (BFS, DFS, Dijkstra) walk over. ' +
    'An adjacency matrix keeps an n x n table where cell (u, v) is the weight of the edge from u to v, or "no edge": one O(1) lookup to ask "is there an edge", at the cost of Theta(n^2) memory even for a graph with almost no edges. ' +
    'This sandbox builds both from the same graph, one row at a time, so you can see the list rows are only as long as each vertex\'s degree, while the matrix rows are always exactly n wide. ' +
    'Later topics in this module default to adjacency lists, since most real graphs are sparse.',
  code: CODE,
  complexity: {
    time: 'Building either representation from an edge list takes O(V + E) for the list, O(V^2) for the matrix (every cell needs initialising).',
    why: 'The list only ever writes down an edge where it actually exists; the matrix always allocates and fills every one of the n^2 cells.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const { directed, edges } = makeRandomGraph(rng, n, { directed: false, weighted: true, extraEdgeFraction: 0.4 });
    return { n, directed, edges };
  },
  run,
  check(input, result) {
    if (!result) return input.n === 0;
    const { n, edges } = input;
    const expectedAdj = Array.from({ length: n }, () => new Set());
    for (const { u, v } of edges) { expectedAdj[u].add(v); expectedAdj[v].add(u); }
    for (let u = 0; u < n; u++) {
      const got = new Set(result.adjList[u]);
      if (got.size !== expectedAdj[u].size) return false;
      for (const x of got) if (!expectedAdj[u].has(x)) return false;
    }
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) {
        const hasEdge = expectedAdj[u].has(v);
        const cell = result.matrix[u][v];
        if (u === v) { if (cell !== 0) return false; continue; }
        if (hasEdge && cell === Infinity) return false;
        if (!hasEdge && cell !== Infinity) return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 6, label: 'vertices' },
};
