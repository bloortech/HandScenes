// A reduction from general CNF-SAT to 3SAT (every clause has EXACTLY 3
// distinct literals): short clauses get padded with fresh variables so
// every one of their settings still forces the original clause true, and
// long clauses get split into a chain of 3-literal clauses linked by
// fresh variables, one new variable per extra literal. No DOM access.
// Reuses engine/sat.js's convertTo3CNF, also used conceptually by
// cook-levin (SAT itself) and the two 3SAT-based reductions in this
// module.
import { bruteForceSAT, convertTo3CNF, clauseToString, formulaToString } from '../engine/sat.js';

const CODE = [
  'clause with 1 literal (l):   expand with 2 fresh vars y1,y2, all 4 combos',
  'clause with 2 literals (l1,l2): add 1 fresh var y: (l1,l2,y), (l1,l2,-y)',
  'clause with k>=4 literals: chain fresh vars y1..y(k-3) across k-2 clauses',
  'clause with exactly 3 literals: keep as is',
];

function formulaFrame(formula, activeIdx, caption, line) {
  const nodes = formula.clauses.map((clause, i) => ({
    id: i,
    label: clauseToString(clause),
    x: 50,
    y: 6 + (i + 0.5) * (88 / Math.max(1, formula.clauses.length)),
    w: 90,
    h: 76 / Math.max(1, formula.clauses.length),
    active: i === activeIdx,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [], emptyText: '(no clauses)' };
}

function* run(input) {
  const { formula } = input;

  yield formulaFrame(formula, -1, `Start: a CNF formula with ${formula.clauses.length} clause(s) of mixed length over ${formula.numVars} variable(s).`, 0);
  for (let i = 0; i < formula.clauses.length; i++) {
    const len = formula.clauses[i].length;
    const line = len === 1 ? 0 : len === 2 ? 1 : len >= 4 ? 2 : 3;
    yield formulaFrame(formula, i, `Clause ${i + 1} ${clauseToString(formula.clauses[i])} has ${len} literal${len === 1 ? '' : 's'}: ${len === 3 ? 'already exactly 3, keep it' : 'rewrite it into exactly-3-literal clauses.'}`, line);
  }

  const formula3 = convertTo3CNF(formula);
  yield formulaFrame(formula3, -1, `Result: an equisatisfiable 3CNF formula with ${formula3.clauses.length} clauses over ${formula3.numVars} variables (${formula3.numVars - formula.numVars} fresh "gadget" variable(s) added).`, 3);

  const before = bruteForceSAT(formula);
  const after = bruteForceSAT(formula3);
  yield formulaFrame(formula3, -1, `Original formula is ${before.satisfiable ? 'SATISFIABLE' : 'UNSATISFIABLE'}; the 3CNF version is ${after.satisfiable ? 'SATISFIABLE' : 'UNSATISFIABLE'}. They agree, as the reduction promises: ${formulaToString(formula)} vs ${formulaToString(formula3)}.`, 3);

  return { beforeSat: before.satisfiable, afterSat: after.satisfiable, numVarsBefore: formula.numVars, numVarsAfter: formula3.numVars };
}

export default {
  id: 'sat-to-3sat',
  title: 'SAT to 3SAT',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    '3SAT is the special case of SAT where every clause has exactly 3 literals. It sounds more restrictive than general SAT, but it is just as hard: there is a polynomial-time reduction turning any CNF formula into an exactly-3-literal one that is satisfiable if and only if the original was. ' +
    'A clause with 2 literals (l1, l2) gets one fresh variable y added as two clauses, (l1, l2, y) and (l1, l2, NOT y): whichever way y is set, one of the two clauses still needs l1 or l2 to be true, so the pair is satisfiable exactly when the original 2-literal clause was. ' +
    'A clause with a single literal l gets two fresh variables y1, y2, written out as all four of their combinations alongside l: if l is false, no setting of y1 and y2 can satisfy all four at once (they cover every possible pair of truth values), so the only way out is forcing l true, same as the original clause demanded. ' +
    'A long clause (4 or more literals) gets split into a chain: fresh variables link consecutive 3-literal clauses so that at least one literal in the chain, or one of the hand-off variables, has to be true all the way through, exactly mirroring "at least one of these k literals is true". ' +
    'This sandbox runs a real formula through every case and checks both formulas against the same brute-force satisfiability oracle: same answer, every time, which is exactly what "equisatisfiable" means.',
  code: CODE,
  complexity: {
    time: 'O(sum of clause lengths): a constant number of new clauses and variables per literal.',
    why: 'Each clause is rewritten independently in time proportional to its own length (at most 2 extra variables for a unit clause, 1 for a pair, or one new variable per extra literal beyond 3 for a long clause), so the whole formula grows by at most a small constant factor.',
  },
  makeInput(rng, size) {
    const numVars = Math.max(1, Math.min(5, size || 3));
    const numClauses = Math.max(1, Math.min(4, Math.ceil((size || 3) * 0.8)));
    const clauses = [];
    for (let c = 0; c < numClauses; c++) {
      const len = 1 + Math.floor(rng() * Math.min(4, numVars));
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
    return { formula: { numVars, clauses } };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.beforeSat !== result.afterSat) return false;
    if (result.numVarsAfter < result.numVarsBefore) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 5, default: 3, label: 'variables' },
};
