// NP = the class of problems where a "yes" answer can be checked quickly,
// given the right hint (a certificate), even if finding that hint from
// scratch might take a long time. This sandbox makes that split literal
// for 3SAT: a certificate is a variable assignment, and the verifier
// V(formula, certificate) just plugs it in and checks every clause, one
// pass, linear time, regardless of how the certificate was ever found.
// No DOM access. Reuses engine/sat.js (also used by cook-levin,
// sat-to-3sat and the two 3SAT reductions in this module).
import { bruteForceSAT, evalClause, evalLiteral, clauseToString, literalToString } from '../engine/sat.js';

const CODE = [
  'verifier V(formula, certificate):',
  '  for each clause in formula:',
  '    if no literal in clause is satisfied by certificate: return REJECT',
  '  return ACCEPT          // one pass, O(formula size), no searching at all',
];

function clauseFrame(formula, assignment, idx, verdict, caption, line) {
  const nodes = formula.clauses.map((clause, i) => ({
    id: i,
    label: clause.map((lit) => `${literalToString(lit)}=${evalLiteral(lit, assignment) ? 'T' : 'F'}`).join(' '),
    x: 50,
    y: 6 + (i + 0.5) * (88 / formula.clauses.length),
    w: 86,
    h: 76 / formula.clauses.length,
    active: i === idx,
    dim: verdict === 'reject' && i > idx,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [], emptyText: '(no clauses)' };
}

function verify(formula, assignment) {
  for (let i = 0; i < formula.clauses.length; i++) {
    if (!evalClause(formula.clauses[i], assignment)) return { accept: false, failedAt: i };
  }
  return { accept: true, failedAt: -1 };
}

function* run(input) {
  const { formula, goodCertificate, badCertificate } = input;

  if (formula.clauses.length === 0) {
    yield clauseFrame(formula, [], -1, 'accept', 'An empty formula has no clauses to fail, so any certificate verifies as ACCEPT.', 3);
    return { goodVerifies: true, badVerifies: true, satisfiable: true };
  }

  // Pass 1: the certificate claimed to be satisfying (if one exists).
  let goodVerifies = true, goodFailedAt = -1;
  for (let i = 0; i < formula.clauses.length; i++) {
    const ok = evalClause(formula.clauses[i], goodCertificate);
    yield clauseFrame(formula, goodCertificate, i, ok ? null : 'reject', `Checking clause ${i + 1} ${clauseToString(formula.clauses[i])} against the certificate: ${ok ? 'satisfied, keep going' : 'NOT satisfied, reject'}.`, 2);
    if (!ok) { goodVerifies = false; goodFailedAt = i; break; }
  }
  yield clauseFrame(formula, goodCertificate, -1, goodVerifies ? 'accept' : 'reject', `Certificate 1 (claimed satisfying): verifier says ${goodVerifies ? 'ACCEPT' : 'REJECT'}${goodFailedAt >= 0 ? ` (failed at clause ${goodFailedAt + 1})` : ''}. One linear pass, no search.`, 3);

  // Pass 2: a certificate chosen to very likely be wrong, to show the
  // verifier actually rejects bad hints instead of rubber-stamping them.
  let badVerifies = true, badFailedAt = -1;
  for (let i = 0; i < formula.clauses.length; i++) {
    const ok = evalClause(formula.clauses[i], badCertificate);
    yield clauseFrame(formula, badCertificate, i, ok ? null : 'reject', `Checking clause ${i + 1} against a DIFFERENT certificate: ${ok ? 'satisfied so far' : 'NOT satisfied, reject'}.`, 2);
    if (!ok) { badVerifies = false; badFailedAt = i; break; }
  }
  yield clauseFrame(formula, badCertificate, -1, badVerifies ? 'accept' : 'reject', `Certificate 2: verifier says ${badVerifies ? 'ACCEPT' : 'REJECT'}. The verifier never searches for a certificate, it only checks the one it is handed.`, 3);

  return { goodVerifies, badVerifies, goodFailedAt, badFailedAt };
}

export default {
  id: 'verifiers',
  title: 'Verifiers and NP',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'A problem is in NP when every "yes" instance comes with a certificate (a hint, like a satisfying assignment, a short route, a factorisation) that some verifier can check in polynomial time, just by plugging it in and looking. ' +
    'The definition says nothing about how fast it is to FIND that certificate: that search can be exponential, and usually is, for the problems this module is about. It only requires that CHECKING a certificate you are handed is fast. ' +
    'For 3SAT, the certificate is a setting of every variable, and the verifier is exactly the pseudocode above: one pass over the clauses, accept only if every clause has at least one satisfied literal. ' +
    "That pass costs time proportional to the formula's size no matter how big the formula is, which is the whole point. This sandbox hands the verifier two certificates on the same formula, one meant to satisfy it and one that probably does not, and watches the same cheap, linear verifier give the right answer to both.",
  code: CODE,
  complexity: {
    time: 'O(sum of clause lengths): one pass over the formula.',
    why: 'The verifier only ever reads each literal once to see whether the certificate satisfies it; it never backtracks or tries another assignment, which is exactly what makes verifying cheap even when SEARCHING for a certificate is believed to be hard.',
  },
  makeInput(rng, size) {
    const numVars = Math.max(1, Math.min(6, size || 3));
    const numClauses = Math.max(1, Math.min(6, Math.ceil(numVars * 1.3)));
    const clauses = [];
    for (let c = 0; c < numClauses; c++) {
      const k = Math.min(3, numVars);
      const vars = [];
      const used = new Set();
      while (vars.length < k) {
        const v = 1 + Math.floor(rng() * numVars);
        if (used.has(v)) continue;
        used.add(v);
        vars.push(v);
      }
      clauses.push(vars.map((v) => (rng() < 0.5 ? v : -v)));
    }
    const formula = { numVars, clauses };
    const solved = bruteForceSAT(formula);
    const goodCertificate = solved.satisfiable
      ? solved.assignment
      : Array.from({ length: numVars + 1 }, () => rng() < 0.5); // formula is unsatisfiable: no certificate can verify, which the run demonstrates too
    const badCertificate = Array.from({ length: numVars + 1 }, (_, i) => (i === 0 ? false : rng() < 0.5));
    return { formula, goodCertificate, badCertificate, satisfiable: solved.satisfiable };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { formula, satisfiable } = input;
    if (formula.clauses.length === 0) return result.goodVerifies === true && result.badVerifies === true;
    // The verifier's own verdict must match independently re-evaluating the
    // formula against the same certificates (the definition of "a
    // verifier is just a checker", so re-checking it a different way must
    // always agree).
    const expectedGood = evalEvery(formula, input.goodCertificate);
    const expectedBad = evalEvery(formula, input.badCertificate);
    if (result.goodVerifies !== expectedGood) return false;
    if (result.badVerifies !== expectedBad) return false;
    // If the formula is satisfiable, the certificate built from bruteForceSAT
    // must verify (soundness of the whole setup: a real satisfying
    // assignment always passes its own verifier).
    if (satisfiable && !result.goodVerifies) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 6, default: 3, label: 'variables' },
};

function evalEvery(formula, assignment) {
  return formula.clauses.every((clause) => evalClause(clause, assignment));
}
