// The classic 3SAT-to-Independent-Set gadget (Sipser / Kleinberg-Tardos).
// For each clause, build a triangle of 3 "literal nodes", one per literal
// in that clause: a triangle's 3 edges mean at most one literal per clause
// can ever be in an independent set (picking 2 corners of a triangle
// always picks an edge). Then connect every literal node to every node for
// its negation in a DIFFERENT clause: picking both would mean setting the
// same variable both true and false. An independent set of size m (the
// number of clauses) exists exactly when the formula is satisfiable: one
// node per clause, each corresponding to a literal that assignment made
// true, and the contradiction edges guarantee no variable gets picked both
// ways. No DOM access. Reuses engine/sat.js.
import { bruteForceSAT, randomKCNF, literalToString } from '../engine/sat.js';
import { layoutCircle } from '../engine/layout.js';

const CODE = [
  'for each clause, 3 literal-nodes joined in a triangle (pick at most 1 per clause)',
  'join literal l in one clause to NOT-l in another clause (cannot pick both)',
  'target k = number of clauses',
  'independent set of size k exists  <=>  formula is satisfiable',
];

function graphFrame(nodes, edges, highlightSet, caption, line) {
  const drawn = nodes.map((n) => ({ ...n, active: highlightSet && highlightSet.has(n.id) }));
  return { kind: 'tree', line, code: CODE, caption, nodes: drawn, edges, emptyText: '(no clauses)' };
}

function buildGraph(formula) {
  const { clauses } = formula;
  const nodes = [];
  const idOf = (c, p) => `c${c}p${p}`;
  clauses.forEach((clause, c) => {
    clause.forEach((lit, p) => {
      nodes.push({ id: idOf(c, p), label: literalToString(lit), clause: c, pos: p, lit });
    });
  });
  const edges = [];
  // Triangle edges, within each clause.
  clauses.forEach((clause, c) => {
    for (let p = 0; p < clause.length; p++) {
      for (let q = p + 1; q < clause.length; q++) edges.push([idOf(c, p), idOf(c, q)]);
    }
  });
  // Contradiction edges: literal l in one clause to NOT-l in a different clause.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].clause === nodes[j].clause) continue;
      if (nodes[i].lit === -nodes[j].lit) edges.push([nodes[i].id, nodes[j].id]);
    }
  }
  return { nodes, edges };
}

function bruteForceMaxIndependentSet(nodes, edges, target) {
  const n = nodes.length;
  const adjacent = new Set(edges.map(([a, b]) => `${a}|${b}`).concat(edges.map(([a, b]) => `${b}|${a}`)));
  let best = null;
  for (let mask = 0; mask < (1 << n); mask++) {
    const bits = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i);
    if (bits.length < target) continue;
    let ok = true;
    outer: for (let a = 0; a < bits.length && ok; a++) {
      for (let b = a + 1; b < bits.length; b++) {
        if (adjacent.has(`${nodes[bits[a]].id}|${nodes[bits[b]].id}`)) { ok = false; break outer; }
      }
    }
    if (ok) { best = bits.map((i) => nodes[i].id); if (best.length >= target) return best; }
  }
  return best;
}

function* run(input) {
  const { formula } = input;
  const { nodes, edges } = buildGraph(formula);
  layoutCircle(nodes, { r: 36 });

  yield graphFrame(nodes, edges, null, `3SAT instance with ${formula.clauses.length} clause(s): one triangle gadget per clause, contradiction edges between opposite literals.`, 0);
  yield graphFrame(nodes, edges, null, `Target: find an independent set of size k = ${formula.clauses.length} (one node per clause, no two adjacent).`, 2);

  const target = formula.clauses.length;
  const found = nodes.length <= 18 ? bruteForceMaxIndependentSet(nodes, edges, target) : null;
  const hasIndependentSet = !!found && found.length >= target;
  if (found) {
    yield graphFrame(nodes, edges, new Set(found), `Found an independent set of size ${found.length}: one literal per clause, consistent (no variable chosen both true and false).`, 3);
  } else {
    yield graphFrame(nodes, edges, null, `No independent set of size ${target} exists: the formula is unsatisfiable.`, 3);
  }

  const sat = bruteForceSAT(formula);
  return { satisfiable: sat.satisfiable, hasIndependentSet, numNodes: nodes.length, target };
}

export default {
  id: '3sat-to-independent-set',
  title: '3SAT to Independent Set',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'Independent Set asks for the largest set of vertices in a graph with no edge between any two of them. This sandbox builds one instance directly from a 3SAT formula, using the textbook gadget. ' +
    'Each clause becomes a triangle of 3 "literal nodes", one per literal in that clause. A triangle has an edge between every pair of its corners, so an independent set can take at most one corner from each triangle: exactly "at most one literal per clause gets credit", which still leaves room for one TRUE literal per satisfied clause. ' +
    'Then, every literal node is joined to every node for its negation that sits in a different clause, so an independent set can never contain both "x is true" and "x is false" at once: that would be a contradictory assignment. ' +
    'Put a target of k = the number of clauses, and an independent set of size k exists exactly when the formula is satisfiable: pick, in each clause\'s triangle, the one node whose literal a satisfying assignment made true (every clause has at least one, since it is satisfied), and the contradiction edges guarantee that choice is self-consistent across clauses. ' +
    'Run both sides on the same formula and watch the independent set (if any) and the satisfying assignment (if any) agree on whether the instance is a "yes" or a "no".',
  code: CODE,
  complexity: {
    time: 'O(m) nodes and O(m + n^2) edges for m clauses over n variables; building the gadget is linear-ish in the formula size.',
    why: 'Each clause contributes exactly 3 nodes and 3 triangle edges; the contradiction edges are at most one per pair of opposite literals, which is quadratic in the number of literal occurrences but still polynomial, which is all a reduction needs to be.',
  },
  makeInput(rng, size) {
    const numVars = Math.max(1, Math.min(4, size || 2));
    const numClauses = Math.max(1, Math.min(3, Math.ceil((size || 2) * 0.8)));
    const formula = randomKCNF(rng, numVars, numClauses, 3);
    return { formula };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.hasIndependentSet !== result.satisfiable) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 4, default: 2, label: 'variables' },
};
