// TQBF (True Quantified Boolean Formula) asks whether a fully-quantified
// boolean formula like "exists x1. forall x2. exists x3. phi" is true.
// It is PSPACE-complete, and evaluating it is exactly playing a two-player
// game: an EXISTS quantifier is the Prover's move (try to find a setting
// that makes the rest true, like a logical OR over both choices), a
// FORALL quantifier is the Adversary's move (the rest must hold no matter
// what, like a logical AND over both choices). The formula is true
// exactly when the Prover has a winning strategy against every move the
// Adversary makes. No DOM access. Reuses engine/sat.js's evalFormula on
// the final, fully-assigned leaf.
import { evalFormula } from '../engine/sat.js';
import { layoutTree } from '../engine/layout.js';

const CODE = [
  'eval(formula, quantifiers, assignment, i):',
  '  if i == numVars: return check(formula, assignment)   // leaf: plug in and check',
  "  if quantifiers[i] == 'exists': return eval(..., assign x_i=T) OR eval(..., assign x_i=F)",
  "  if quantifiers[i] == 'forall': return eval(..., assign x_i=T) AND eval(..., assign x_i=F)",
];

function nodeLabel(i, quant, numVars) {
  if (i === numVars) return 'check phi';
  return `${quant[i] === 'exists' ? '∃' : '∀'} x${i + 1}`;
}

function* run(input) {
  const { formula, quant } = input;
  const numVars = formula.numVars;
  const assignment = new Array(numVars + 1).fill(false);
  const nodes = [];
  const edges = [];
  let nextId = 0;
  const moves = [];

  function evalRec(i, parentId, branchLabel) {
    const id = nextId++;
    nodes.push({ id, label: nodeLabel(i, quant, numVars), player: i < numVars ? quant[i] : 'leaf' });
    if (parentId != null) edges.push([parentId, id, branchLabel]);
    if (i === numVars) {
      const val = evalFormula(formula, assignment);
      nodes[id].label += val ? ' = TRUE' : ' = FALSE';
      nodes[id].value = val;
      moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `Leaf: x1..x${numVars} = [${Array.from({ length: numVars }, (_, k) => (assignment[k + 1] ? 'T' : 'F')).join(',')}], phi = ${val}.`, line: 0 });
      return val;
    }
    assignment[i + 1] = true;
    moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `${quant[i] === 'exists' ? 'Exists' : 'Forall'} x${i + 1}: try x${i + 1} = TRUE.`, line: quant[i] === 'exists' ? 2 : 3 });
    const vTrue = evalRec(i + 1, id, 'T');
    if (quant[i] === 'exists' && vTrue) {
      nodes[id].value = true;
      moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `Exists x${i + 1}: TRUE branch already works, no need to try FALSE.`, line: 2 });
      assignment[i + 1] = false;
      return true;
    }
    if (quant[i] === 'forall' && !vTrue) {
      nodes[id].value = false;
      moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `Forall x${i + 1}: TRUE branch already fails, so the formula fails too.`, line: 3 });
      assignment[i + 1] = false;
      return false;
    }
    assignment[i + 1] = false;
    moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `${quant[i] === 'exists' ? 'Exists' : 'Forall'} x${i + 1}: now try x${i + 1} = FALSE.`, line: quant[i] === 'exists' ? 2 : 3 });
    const vFalse = evalRec(i + 1, id, 'F');
    const val = quant[i] === 'exists' ? (vTrue || vFalse) : (vTrue && vFalse);
    nodes[id].value = val;
    moves.push({ nodes: nodes.slice(), edges: edges.slice(), caption: `x${i + 1} (${quant[i]}): ${quant[i] === 'exists' ? 'TRUE or FALSE branch' : 'both branches'} gives ${val}.`, line: quant[i] === 'exists' ? 2 : 3 });
    return val;
  }

  const result = numVars === 0 ? evalFormula(formula, assignment) : evalRec(0, null, null);

  // Lay out the full game tree once it is built, by mutating each node's
  // x/y in place: since every earlier move snapshot (`moves[i].nodes`) is
  // a shallow slice sharing the SAME node objects, this retroactively
  // gives every frame correct, stable positions.
  if (nodes.length > 0) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) n.children = [];
    for (const [fromId, toId] of edges) byId.get(fromId).children.push(byId.get(toId));
    layoutTree(nodes[0], { padX: 8, padY: 10 });
  }

  if (numVars === 0) {
    yield { kind: 'boxes', line: 0, code: CODE, caption: `No quantifiers: just check phi directly. Result: ${result}.`, nodes: [], edges: [] };
  } else {
    for (const m of moves) yield { kind: 'tree', line: m.line, code: CODE, caption: m.caption, nodes: m.nodes, edges: m.edges, emptyText: '(no moves yet)' };
  }

  // Brute-force oracle: evaluate the same quantifier string over ALL 2^numVars
  // assignments directly (a flat truth table, computed without any of the
  // short-circuiting or recursion the game-tree evaluator above uses), to
  // make sure the two independent methods agree.
  const bruteForce = bruteForceEval(formula, quant, numVars);

  return { result, bruteForce, numVars };
}

function bruteForceEval(formula, quant, numVars) {
  function go(i, assignment) {
    if (i === numVars) return evalFormula(formula, assignment);
    const a1 = assignment.slice(); a1[i + 1] = true;
    const a0 = assignment.slice(); a0[i + 1] = false;
    const r1 = go(i + 1, a1);
    const r0 = go(i + 1, a0);
    return quant[i] === 'exists' ? (r1 || r0) : (r1 && r0);
  }
  return go(0, new Array(numVars + 1).fill(false));
}

export default {
  id: 'tqbf-game',
  title: 'TQBF and game trees (PSPACE)',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: '(Sipser: PSPACE-completeness, TQBF)',
  summary:
    'A quantified boolean formula alternates "exists" and "forall" in front of each variable, then ends with a plain boolean formula phi: something like "exists x1. forall x2. phi(x1, x2)". TQBF asks whether the whole thing is true, and it is PSPACE-complete. ' +
    'Evaluating it is exactly a two-player game. Think of "exists x_i" as a move by a Prover who gets to pick x_i to try to make the rest come out true (an OR over the two choices); think of "forall x_i" as a move by an Adversary who gets to pick x_i to try to break it (an AND over the two choices, since the Prover has to survive both). ' +
    "The formula is true exactly when the Prover has a strategy that wins against every move the Adversary could make, which this sandbox builds as a literal game tree, one level per quantifier, alternating whose move it is. " +
    'The recursion only ever needs to remember the current path down the tree, which is why TQBF sits in PSPACE (polynomial space) even though the tree it is implicitly exploring has size exponential in the number of variables: the same space-for-time trade this module\'s Savitch\'s theorem topic makes for plain reachability. ' +
    'This sandbox plays the game explicitly, alternating movers, and checks the result against an independent flat truth-table evaluation of the same quantifier string, to make sure the "who moves when" bookkeeping never changes the answer.',
  code: CODE,
  complexity: {
    time: 'O(2^numVars * |phi|) in the worst case: the game tree has 2^numVars leaves.',
    why: "Alpha-beta-style short-circuiting (an exists node stops early on a TRUE branch, a forall node stops early on a FALSE branch) can prune some of the tree, but in the worst case (an adversarial phi) the whole exponential tree still has to be explored, which is expected: TQBF is PSPACE-complete, believed to need exponential TIME even though it only needs polynomial SPACE.",
  },
  makeInput(rng, size) {
    const numVars = Math.max(0, Math.min(4, size));
    const quant = Array.from({ length: numVars }, (_, i) => (i % 2 === 0 ? 'exists' : 'forall'));
    const numClauses = Math.max(1, numVars);
    const clauses = [];
    for (let c = 0; c < numClauses && numVars > 0; c++) {
      const len = Math.min(3, numVars);
      const used = new Set();
      const vars = [];
      while (vars.length < len) {
        const v = 1 + Math.floor(rng() * numVars);
        if (used.has(v)) continue;
        used.add(v);
        vars.push(v);
      }
      clauses.push(vars.map((v) => (rng() < 0.5 ? v : -v)));
    }
    return { formula: { numVars, clauses }, quant };
  },
  run,
  check(input, result) {
    if (!result) return false;
    return result.result === result.bruteForce;
  },
  sandbox: { type: 'n', min: 0, max: 4, default: 3, label: 'variables (alternating exists/forall)' },
};
