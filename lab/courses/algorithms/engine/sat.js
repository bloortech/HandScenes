// Pure CNF-SAT helpers shared by m11's NP-completeness topics (cook-levin,
// sat-to-3sat, 3sat-to-independent-set, 3sat-to-subset-sum, verifiers,
// p-vs-np). No DOM access, like graph.js/numtheory.js.
//
// A formula is `{ numVars, clauses }`. A clause is an array of nonzero
// integers ("literals"): a positive integer i means variable x_i, a
// negative integer -i means its negation NOT x_i. Variables are numbered
// 1..numVars (1-indexed, so a literal's absolute value is a valid array
// index into a 1-indexed assignment). An assignment is an array of
// booleans, 1-indexed (assignment[0] is unused/ignored).

export function evalLiteral(lit, assignment) {
  const v = assignment[Math.abs(lit)];
  return lit > 0 ? v : !v;
}

export function evalClause(clause, assignment) {
  return clause.some((lit) => evalLiteral(lit, assignment));
}

export function evalFormula(formula, assignment) {
  return formula.clauses.every((clause) => evalClause(clause, assignment));
}

export function literalToString(lit) {
  return lit > 0 ? `x${lit}` : `¬ x${-lit}`;
}

export function clauseToString(clause) {
  return `(${clause.map(literalToString).join(' ∨ ')})`;
}

export function formulaToString(formula) {
  return formula.clauses.map(clauseToString).join(' ∧ ');
}

// Brute-force SAT solver: tries every one of the 2^numVars assignments.
// Only ever used by this course on tiny instances (numVars <= ~14), as the
// correctness oracle every reduction's check() calls, never as "the
// algorithm" a topic teaches (that would defeat the point: SAT is NP-
// complete precisely because nobody knows a fast way to do this).
export function bruteForceSAT(formula) {
  const { numVars, clauses } = formula;
  const total = 1 << numVars;
  for (let mask = 0; mask < total; mask++) {
    const assignment = new Array(numVars + 1);
    for (let i = 1; i <= numVars; i++) assignment[i] = !!(mask & (1 << (i - 1)));
    if (clauses.every((clause) => evalClause(clause, assignment))) {
      return { satisfiable: true, assignment };
    }
  }
  return { satisfiable: false, assignment: null };
}

// Random k-CNF formula generator: numClauses clauses, each with exactly k
// distinct variables (never both a variable and its own negation in one
// clause, which would make that clause trivially true and uninteresting).
export function randomKCNF(rng, numVars, numClauses, k) {
  const clauses = [];
  for (let c = 0; c < numClauses; c++) {
    const vars = [];
    const used = new Set();
    while (vars.length < Math.min(k, numVars)) {
      const v = 1 + Math.floor(rng() * numVars);
      if (used.has(v)) continue;
      used.add(v);
      vars.push(v);
    }
    clauses.push(vars.map((v) => (rng() < 0.5 ? v : -v)));
  }
  return { numVars, clauses };
}

// Reduces an arbitrary CNF formula to an equisatisfiable EXACT-3-CNF
// formula (Sipser's SAT-to-3SAT construction / CLRS 34.4's "every clause
// has exactly 3 distinct literals" normal form). Short clauses are padded
// with fresh variables so every possible setting of the new variables
// still forces the original clause true; long clauses are split into a
// chain of 3-literal clauses linked by fresh variables.
export function convertTo3CNF(formula) {
  let nextVar = formula.numVars + 1;
  const freshVar = () => nextVar++;
  const clauses3 = [];

  for (const clause of formula.clauses) {
    const k = clause.length;
    if (k === 3) {
      clauses3.push(clause.slice());
    } else if (k === 2) {
      const y = freshVar();
      clauses3.push([clause[0], clause[1], y]);
      clauses3.push([clause[0], clause[1], -y]);
    } else if (k === 1) {
      const y1 = freshVar(), y2 = freshVar();
      clauses3.push([clause[0], y1, y2]);
      clauses3.push([clause[0], y1, -y2]);
      clauses3.push([clause[0], -y1, y2]);
      clauses3.push([clause[0], -y1, -y2]);
    } else if (k >= 4) {
      // Chain: (l1 v l2 v y1), (-y1 v l3 v y2), ..., (-y_{k-3} v l_{k-1} v l_k)
      let prevY = freshVar();
      clauses3.push([clause[0], clause[1], prevY]);
      for (let i = 2; i < k - 2; i++) {
        const y = freshVar();
        clauses3.push([-prevY, clause[i], y]);
        prevY = y;
      }
      clauses3.push([-prevY, clause[k - 2], clause[k - 1]]);
    } else {
      // k === 0, an empty clause: unsatisfiable by definition. Keep it as
      // an impossible-to-satisfy 3-clause (pads with a variable and its
      // negation, so no assignment of anything ever satisfies it).
      const y = freshVar();
      clauses3.push([y, y, y]);
      clauses3.push([-y, -y, -y]);
    }
  }
  return { numVars: nextVar - 1, clauses: clauses3 };
}
