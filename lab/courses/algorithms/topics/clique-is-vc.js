// Clique, Independent Set and Vertex Cover are three faces of the same
// coin. For any graph G on n vertices and any set S of vertices:
//   S is a clique in G             <=>  S is an independent set in the
//                                        complement graph G'
//   S is an independent set in G   <=>  V \ S is a vertex cover of G
// So "does G have a clique of size k" reduces to "does G' have an
// independent set of size k" (just complement the graph) and "does G have
// an independent set of size k" reduces to "does G have a vertex cover of
// size n-k" (just take the complement of the set). All three problems are
// NP-complete, by this one small argument chaining them together. No DOM
// access.
import { makeRandomGraph } from '../engine/graph.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'S is a clique in G             <=>  S is an independent set in complement(G)',
  'S is an independent set in G   <=>  V \\ S is a vertex cover of G',
  'so: max-clique(G) = max-independent-set(complement(G))',
  'and: min-vertex-cover(G) = n - max-independent-set(G)',
];

function complement(n, edges) {
  const present = new Set(edges.map(({ u, v }) => `${Math.min(u, v)}-${Math.max(u, v)}`));
  const compEdges = [];
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (!present.has(`${u}-${v}`)) compEdges.push({ u, v, w: 1 });
    }
  }
  return compEdges;
}

function isClique(n, edges, set) {
  const adjSet = new Set(edges.map(({ u, v }) => `${Math.min(u, v)}-${Math.max(u, v)}`));
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = Math.min(set[i], set[j]), b = Math.max(set[i], set[j]);
      if (!adjSet.has(`${a}-${b}`)) return false;
    }
  }
  return true;
}

function bruteForceMaxClique(n, edges) {
  let best = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const set = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.push(i);
    if (set.length <= best.length) continue;
    if (isClique(n, edges, set)) best = set;
  }
  return best;
}

function isVertexCover(n, edges, cover) {
  const coverSet = new Set(cover);
  return edges.every(({ u, v }) => coverSet.has(u) || coverSet.has(v));
}

function isIndependentSet(n, edges, set) {
  const adjSet = new Set(edges.map(({ u, v }) => `${Math.min(u, v)}-${Math.max(u, v)}`));
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = Math.min(set[i], set[j]), b = Math.max(set[i], set[j]);
      if (adjSet.has(`${a}-${b}`)) return false;
    }
  }
  return true;
}

// A direct (not clique-of-complement) brute-force independent-set search,
// used only so check() can confirm maxClique(G) really equals
// max-independent-set(complement(G)) using two genuinely different
// algorithms on two genuinely different edge sets, rather than comparing
// a number against itself.
function bruteForceMaxIndependentSetDirect(n, edges) {
  let best = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const set = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.push(i);
    if (set.length <= best.length) continue;
    if (isIndependentSet(n, edges, set)) best = set;
  }
  return best;
}

function graphFrame(nodes, edges, highlight, caption, line) {
  const drawn = nodes.map((n) => ({ ...n, active: highlight && highlight.has(n.id) }));
  return { kind: 'tree', line, code: CODE, caption, nodes: drawn, edges: edges.map((e) => [e.u, e.v]), emptyText: '(empty graph)' };
}

function* run(input) {
  const { n, edges } = input;
  const nodes = Array.from({ length: n }, (_, id) => ({ id, label: String(id) }));
  layoutCircle(nodes, { r: 36 });

  yield graphFrame(nodes, edges, null, `Graph G on ${n} vertices, ${edges.length} edge(s).`, 0);

  const maxClique = n <= 14 ? bruteForceMaxClique(n, edges) : [];
  yield graphFrame(nodes, edges, new Set(maxClique), `Max clique in G: {${maxClique.join(', ')}}, size ${maxClique.length}.`, 0);

  const compEdges = complement(n, edges);
  const maxIndepInComplement = n <= 14 ? bruteForceMaxClique(n, compEdges) : []; // a clique in G' is an independent set in G
  yield graphFrame(nodes, compEdges, new Set(maxIndepInComplement), `complement(G): same vertices, every non-edge of G becomes an edge. A clique here, {${maxIndepInComplement.join(', ')}}, is exactly an independent set in G.`, 1);

  const cover = nodes.map((nd) => nd.id).filter((id) => !maxIndepInComplement.includes(id));
  yield graphFrame(nodes, edges, new Set(cover), `V \\ (that independent set) = {${cover.join(', ')}}, size ${cover.length}: a vertex cover of G, since every edge must touch a non-independent vertex.`, 3);

  // Two cross-checks of "clique in G <=> independent set in complement(G)",
  // each using a DIFFERENT search algorithm (clique-search vs independent-
  // set-search) on a DIFFERENT edge set, so the comparison is a real test
  // of the theorem, not a number compared against itself:
  //   maxClique(G), via clique-search on G's own edges
  //     must equal   max-independent-set(complement(G)), via independent-
  //     set-search run directly on compEdges
  //   max-independent-set(G), via independent-set-search run directly on
  //     G's own edges
  //     must equal   maxClique(complement(G)) [= maxIndepInComplement
  //     above, via clique-search on compEdges]
  const indepInComplementDirect = n <= 14 ? bruteForceMaxIndependentSetDirect(n, compEdges) : [];
  const indepInGDirect = n <= 14 ? bruteForceMaxIndependentSetDirect(n, edges) : [];

  return {
    n,
    maxCliqueSize: maxClique.length,
    maxIndepInComplementSize: maxIndepInComplement.length, // = max independent set in G (via clique-search on compEdges)
    indepInComplementDirectSize: indepInComplementDirect.length, // = max clique in G, via independent-set-search on compEdges
    indepInGDirectSize: indepInGDirect.length, // = max independent set in G, via independent-set-search on edges
    coverSize: cover.length,
    coverIsValid: isVertexCover(n, edges, cover),
    cliqueIsValid: isClique(n, edges, maxClique),
  };
}

export default {
  id: 'clique-is-vc',
  title: 'Clique, Independent Set and Vertex Cover',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    "Three problems that look different are secretly the same question asked three ways. A clique is a set of vertices that are ALL pairwise adjacent; an independent set is a set of vertices with NO edges between any two of them; a vertex cover is a set of vertices that touches EVERY edge in the graph. " +
    "Flip every edge of G to a non-edge and vice versa (the complement graph G') and a clique in G becomes an independent set in G', and vice versa, since 'pairwise adjacent' in G is exactly 'pairwise non-adjacent' in G'. " +
    'Inside the SAME graph, an independent set S and a vertex cover are complements of each other: if no edge touches two vertices of S, then every edge must touch at least one vertex outside S, which is exactly the definition of a vertex cover; the same argument runs backwards too. ' +
    'Chaining those two facts together: the maximum clique size in G equals the maximum independent set size in complement(G) (NOT the maximum independent set size in G itself, a different number in general), and the minimum vertex cover size in G equals n minus the maximum independent set size in G. ' +
    'This sandbox computes all of these (by brute force, since all three problems are NP-hard to optimise in general) on the same small graph, each quantity TWICE over by two genuinely different search algorithms on two genuinely different edge sets, and checks that every pair agrees exactly as the theorem promises.',
  code: CODE,
  complexity: {
    time: 'Building complement(G) is O(n^2); the brute-force optimum searches used here (not the reduction itself) are O(2^n), since all three problems are NP-hard to solve optimally.',
    why: "The REDUCTION between the three problems is cheap (just complement the edge set, or complement the chosen vertex set), which is the entire point: it proves the three problems are equally hard, without claiming any of them is easy. This sandbox's brute force is only here to supply ground truth on small graphs, not a claim about how to solve them in general.",
  },
  makeInput(rng, size) {
    const n = Math.max(1, Math.min(8, size || 5));
    const { edges } = makeRandomGraph(rng, n, { directed: false, weighted: false, extraEdgeFraction: 0.4 });
    return { n, edges };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n } = input;
    if (result.n !== n) return false;
    if (!result.cliqueIsValid) return false;
    if (!result.coverIsValid) return false;
    if (n <= 14) {
      // Clique in G <=> independent set in complement(G): two different
      // algorithms, same answer.
      if (result.maxCliqueSize !== result.indepInComplementDirectSize) return false;
      // Independent set in G <=> clique in complement(G): two different
      // algorithms, same answer.
      if (result.indepInGDirectSize !== result.maxIndepInComplementSize) return false;
    }
    if (result.coverSize !== n - result.maxIndepInComplementSize) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 8, default: 5, label: 'vertices' },
};
