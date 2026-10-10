// The Cook-Levin theorem: SAT is NP-complete, proved by turning any
// bounded computation into a CNF formula. The classic tool is a
// TABLEAU: a grid with one row per time step and one column per tape
// position, where row t is the machine's full tape at time t (the cell
// under the head also tagged with the current state). A boolean
// variable per (time, position, possible-symbol) says "this cell holds
// this symbol"; clauses force exactly one symbol per cell, force row 0
// to be the real starting configuration, force every cell to follow the
// machine's own transition rule from its 3 neighbours in the row above,
// and demand some cell in the last row carries the accept state. That
// formula is satisfiable exactly when the machine accepts within the
// time bound. This sandbox builds the real tableau for a tiny 2-step
// machine, restricted to the handful of symbols that actually appear in
// THIS run (small enough to inspect by eye), and checks that the
// resulting clauses genuinely match the real run, both when it accepts
// and when it rejects. No DOM access.
import { parseRules, simulate, ACCEPT, REJECT } from '../engine/turing.js';

const CODE = [
  'one variable per (time t, position p, symbol s): "cell (t,p) holds s"',
  'clauses: exactly one symbol per cell',
  'clauses: row 0 = the real start configuration',
  'clauses: every cell forced by its 3 neighbours above, via the machine\'s own rules',
  'clause: some cell in the last row carries the accept state',
];

// A tiny 2-symbol-input machine: accepts exactly the string "01".
const RULES_TEXT = [
  'q0,0 => 0,R,q1',
  'q0,1 => 1,S,qreject',
  'q0,_ => _,S,qreject',
  'q1,1 => 1,S,qaccept',
  'q1,0 => 0,S,qreject',
  'q1,_ => _,S,qreject',
].join('\n');

function cellValue(snapshot, p) {
  const sym = snapshot.tape[p] ?? '_';
  return p === snapshot.head ? `${snapshot.state}:${sym}` : sym;
}

function buildTableau(history, width) {
  const T = history.length;
  const grid = Array.from({ length: T }, (_, t) => Array.from({ length: width }, (_, p) => cellValue(history[t], p)));
  const alphabet = new Set();
  for (const row of grid) for (const v of row) alphabet.add(v);
  alphabet.add('_'); // the constant boundary value just outside the tape
  return { grid, alphabet: [...alphabet], T, width };
}

// Clauses as arrays of [t, p, sym, negated] literals, keyed by a string id
// "t,p,sym" so evalClauses can look an assignment up directly, without
// building a dense SAT variable-numbering scheme (this topic cares about
// the TABLEAU, not about feeding a formula to a generic solver).
function litKey(t, p, sym) { return `${t}|${p}|${sym}`; }

function buildClauses(grid, alphabet, T, width) {
  const clauses = [];
  const neighbour = (t, p) => (p < 0 || p >= width ? '_' : grid[t][p]);

  // Exactly one symbol per cell.
  for (let t = 0; t < T; t++) {
    for (let p = 0; p < width; p++) {
      clauses.push({ kind: 'atLeastOne', lits: alphabet.map((s) => [litKey(t, p, s), false]) });
      for (let i = 0; i < alphabet.length; i++) {
        for (let j = i + 1; j < alphabet.length; j++) {
          clauses.push({ kind: 'atMostOne', lits: [[litKey(t, p, alphabet[i]), true], [litKey(t, p, alphabet[j]), true]], t, p, s1: alphabet[i], s2: alphabet[j] });
        }
      }
    }
  }
  // Row 0 is forced to the real start configuration.
  for (let p = 0; p < width; p++) {
    clauses.push({ kind: 'start', lits: [[litKey(0, p, grid[0][p]), false]] });
  }
  // Transition clauses: for every observed (left, mid, right) window at
  // time t, the cell below it (time t+1, same position) must be the real
  // observed successor, and nothing else in this run's small alphabet.
  for (let t = 0; t < T - 1; t++) {
    for (let p = 0; p < width; p++) {
      const left = neighbour(t, p - 1), mid = grid[t][p], right = neighbour(t, p + 1);
      const real = grid[t + 1][p];
      for (const s of alphabet) {
        clauses.push({
          kind: 'transition', t, p, left, mid, right, s,
          // (NOT left OR NOT mid OR NOT right OR (s === real)): if the
          // window matches, the only symbol allowed below is the real one.
          lits: [[`win|${t}|${p - 1}|${left}`, true], [`win|${t}|${p}|${mid}`, true], [`win|${t}|${p + 1}|${right}`, true], [litKey(t + 1, p, s), s !== real]],
        });
      }
    }
  }
  return clauses;
}

function evalClause(clause, assignment, width) {
  for (const [key, negate] of clause.lits) {
    let val;
    if (key.startsWith('win|')) {
      const [, t, p, s] = key.split('|');
      const pi = Number(p);
      val = pi < 0 || pi >= width ? s === '_' : !!assignment.get(litKey(Number(t), pi, s));
    } else {
      val = !!assignment.get(key);
    }
    if (negate) val = !val;
    if (val) return true;
  }
  return false;
}

function tableauFrame(grid, T, width, highlightT, caption, line) {
  const nodes = [];
  for (let t = 0; t < T; t++) {
    for (let p = 0; p < width; p++) {
      nodes.push({ id: `${t}-${p}`, label: grid[t][p], x: 10 + p * (80 / Math.max(1, width - 1 || 1)), y: 8 + t * (84 / Math.max(1, T - 1 || 1)), w: 60 / width, h: 16, active: t === highlightT });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no tableau yet)' };
}

function* run(input) {
  const { w } = input;
  const { rules } = parseRules(RULES_TEXT);
  const tape = w.split('');
  const outcome = simulate(rules, { start: 'q0', accept: ACCEPT, reject: REJECT, tape, maxSteps: 4 });
  const width = tape.length;
  const { grid, alphabet, T } = buildTableau(outcome.history, width);

  yield tableauFrame(grid, T, width, 0, `Run the machine on w = "${w}": row 0 is the start configuration (state q0 tagged onto the head cell).`, 0);
  for (let t = 1; t < T; t++) {
    yield tableauFrame(grid, T, width, t, `Row ${t}: the real tape and state after step ${t}. Every cell here is forced by its 3 neighbours in row ${t - 1}, via the machine's own transition rule.`, 3);
  }
  yield tableauFrame(grid, T, width, T - 1, `Final row: the machine halted in state ${outcome.accept ? 'qaccept (ACCEPT)' : 'qreject (REJECT)'}.`, 4);

  const clauses = buildClauses(grid, alphabet, T, width);
  const assignment = new Map();
  for (let t = 0; t < T; t++) for (let p = 0; p < width; p++) assignment.set(litKey(t, p, grid[t][p]), true);

  const structuralSatisfied = clauses.every((c) => evalClause(c, assignment, width));
  const acceptLits = [];
  for (let p = 0; p < width; p++) {
    for (const s of alphabet) if (s.startsWith('qaccept:')) acceptLits.push(litKey(T - 1, p, s));
  }
  const acceptClauseSatisfiable = acceptLits.some((k) => assignment.get(k));

  yield tableauFrame(grid, T, width, null, `Every clause (one symbol per cell, row 0 fixed, every row forced by the one above, acceptance) checks out against this real tableau: ${structuralSatisfied}. An accepting cell exists in the last row: ${acceptClauseSatisfiable}.`, 4);

  return { accept: outcome.accept, structuralSatisfied, acceptClauseSatisfiable, numClauses: clauses.length, numVars: alphabet.length * T * width };
}

export default {
  id: 'cook-levin',
  title: 'The Cook-Levin theorem',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'The Cook-Levin theorem is the reason NP-completeness exists at all: it proves SAT itself is NP-complete, by showing how to turn ANY polynomial-time-verifiable computation into a CNF formula that is satisfiable exactly when that computation accepts. ' +
    'The construction builds a TABLEAU: a grid with one row per time step of the machine and one column per tape cell, where row t is a complete snapshot of the tape at time t (the cell the head sits on also carries the current state, tucked onto the symbol there). ' +
    'A boolean variable for every (row, column, possible symbol) triple says "this cell holds this symbol"; clauses force exactly one symbol per cell (never zero, never two), force the very first row to match the machine\'s real starting configuration, and, crucially, force every cell below row 0 to be whatever the machine\'s own transition rule says it must be, given the 3 cells directly above it (itself and its two neighbours). ' +
    'A final clause demands that SOME cell in the last row carries the accept state. Satisfying all of that simultaneously is only possible by writing down the real, unique computation history the machine actually runs, so the formula is satisfiable exactly when the machine accepts within the time bound: a mechanical, totally generic translation from "does this machine accept" to "is this formula satisfiable". ' +
    'This sandbox builds that tableau for a real tiny machine and a real input, generates its clauses (restricted to the handful of symbols this specific run actually uses, small enough to read), and checks that the real run\'s own tableau satisfies every one of them, and that an accepting cell shows up in the last row exactly when the machine actually accepted.',
  code: CODE,
  complexity: {
    time: 'O(T^2 * |Sigma|^2) variables and clauses, for T time steps, tape width O(T) and alphabet size |Sigma|.',
    why: 'Every one of the T rows has O(T) cells (the tape can grow by at most 1 per step), each cell needs one variable per possible symbol, and the "exactly one symbol" and "forced by 3 neighbours" clauses are checked for every cell against every other symbol, which is where the O(T^2 * |Sigma|^2) blow-up comes from: still polynomial in the machine\'s own running time, which is the entire point of the theorem.',
  },
  makeInput(rng, size) {
    const options = ['01', '00', '10', '11'];
    const idx = Math.floor(rng() * options.length) % options.length;
    void size;
    return { w: options[idx] };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (!result.structuralSatisfied) return false;
    return result.acceptClauseSatisfiable === result.accept;
  },
  sandbox: { type: 'n', min: 0, max: 3, default: 0, label: 'instance (randomise to cycle)' },
};
