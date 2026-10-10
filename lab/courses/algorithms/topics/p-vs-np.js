// The biggest open question in this field: is P = NP? Every problem in P
// is trivially in NP (solve it, keep the answer as your own certificate),
// so the real question is the other direction: does every problem with a
// fast CHECKER also have a fast SOLVER? This sandbox makes the gap
// concrete on a small 3SAT instance: searching for a satisfying
// assignment by brute force costs one step per candidate assignment
// (exponential in the number of variables), while checking a GIVEN
// assignment costs one pass over the clauses (polynomial). If P = NP,
// some clever algorithm would close that gap completely, for every NP
// problem at once, since SAT is NP-complete; nobody has ever found one,
// which is why almost everyone believes P != NP, even though nobody has
// proven it. No DOM access. Reuses engine/sat.js.
import { bruteForceSAT, evalClause, randomKCNF, formulaToString } from '../engine/sat.js';

const CODE = [
  'SEARCH (what P=NP would make fast): try assignments until one satisfies every clause',
  'CHECK (always fast, certificate in hand): one pass over the clauses',
  'SAT is NP-complete: a fast SEARCH for SAT => a fast SEARCH for every NP problem',
];

function frame(formula, step, total, caption, line) {
  const nodes = [{ id: 0, label: formulaToString(formula), x: 50, y: 15, w: 92, h: 16, active: false }];
  const pointers = [{ x: 50, y: 50, text: `search steps tried: ${step} / 2^${formula.numVars} = ${total}` }];
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers };
}

function* run(input) {
  const { formula } = input;
  const total = 1 << formula.numVars;

  yield frame(formula, 0, total, `Formula: ${formulaToString(formula)}. Searching for a satisfying assignment means trying candidates until one works.`, 0);

  let steps = 0;
  let found = null;
  for (let mask = 0; mask < total && !found; mask++) {
    steps++;
    const assignment = new Array(formula.numVars + 1);
    for (let i = 1; i <= formula.numVars; i++) assignment[i] = !!(mask & (1 << (i - 1)));
    if (formula.clauses.every((c) => evalClause(c, assignment))) found = assignment;
  }
  yield frame(formula, steps, total, `Search finished after ${steps} candidate(s) tried (brute force: no shortcut is known for SAT in general). ${found ? 'Found a satisfying assignment.' : 'No satisfying assignment exists.'}`, 0);

  if (found) {
    let checkSteps = 0;
    for (const clause of formula.clauses) { checkSteps++; if (!evalClause(clause, found)) break; }
    yield frame(formula, checkSteps, formula.clauses.length, `CHECKING that same assignment costs ${checkSteps} step(s): one look per clause, however big ${total} (the search space) was.`, 1);
  }

  const oracle = bruteForceSAT(formula);
  return { searchSteps: steps, searchFound: !!found, satisfiable: oracle.satisfiable, numVars: formula.numVars };
}

export default {
  id: 'p-vs-np',
  title: 'P vs NP',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'P is "fast to solve"; NP is "fast to check, given the right hint". Every problem in P is automatically in NP (just solve it and hand back the solution as the hint), so P is a subset of NP; the open question is whether that containment is actually equality. ' +
    'If P = NP, then every problem with a fast checker would also have a fast solver, and because SAT is NP-complete (every NP problem reduces to it in polynomial time, as this module\'s own reductions build concretely), a single fast SAT solver would instantly become a fast solver for every problem in NP: factoring, scheduling, packing, routing, and everything else in that enormous class, all at once. ' +
    'If P != NP, there is at least one problem (and by the reductions, essentially every NP-complete problem) where checking a hint is forever easier than finding one. ' +
    'This sandbox makes the gap tangible on a tiny SAT instance: brute-force SEARCHING for a satisfying assignment costs one attempt per candidate, up to 2^n of them, while CHECKING a candidate you are handed costs one pass over the clauses, totally independent of how big that search space was. ' +
    'Nobody has found a way to close that gap for SAT (or for any other NP-complete problem) despite decades of trying, which is the entire empirical case for believing P != NP; nobody has proven it either, which is why it stays the most famous open problem in this field.',
  code: CODE,
  complexity: {
    time: 'SEARCH: O(2^n * formula size) in the worst case (brute force, no known polynomial algorithm). CHECK: O(formula size), always.',
    why: 'This gap, exponential search vs polynomial check, is exactly what "NP but not known to be in P" means; closing it for any single NP-complete problem would close it for all of them, via the reductions this module builds.',
  },
  makeInput(rng, size) {
    const numVars = Math.max(1, Math.min(8, size || 4));
    const numClauses = Math.max(1, Math.min(5, Math.ceil(numVars * 0.9)));
    const formula = randomKCNF(rng, numVars, numClauses, Math.min(3, numVars));
    return { formula };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.searchFound !== result.satisfiable) return false;
    if (result.searchSteps > (1 << result.numVars)) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 8, default: 4, label: 'variables' },
};
