// The Karp/Kleinberg-Tardos reduction from 3SAT to Subset Sum. Build a
// column of base-10 digits for each variable and each clause. For
// variable x_i: two numbers y_i (x_i = true) and z_i (x_i = false), each
// with a 1 in that variable's own column, plus a 1 in clause j's column
// for every clause where that literal (positive for y_i, negative for
// z_i) appears. For clause j: two "slack" numbers g_j (digit 1) and h_j
// (digit 2) in that clause's column only. Target T has a 1 in every
// variable column (forcing exactly one of y_i/z_i chosen per variable,
// i.e. a real assignment) and a 4 in every clause column (reachable only
// if at least one literal in that clause is satisfied: 0 satisfied
// literals maxes out at 3 from slack alone, never 4). No DOM access.
// Reuses engine/sat.js.
import { bruteForceSAT, randomKCNF } from '../engine/sat.js';

const CODE = [
  'for each variable x_i: y_i (true-choice), z_i (false-choice), digit 1 in column i',
  '  + digit 1 in clause column j wherever that literal appears in clause j',
  'for each clause j: slack numbers g_j (digit 1), h_j (digit 2) in column j only',
  'target: digit 1 in every variable column, digit 4 in every clause column',
];

function digitsToString(digits) {
  return digits.join('');
}

function buildInstance(formula) {
  const { numVars: n, clauses } = formula;
  const m = clauses.length;
  const width = n + m;
  const mkDigits = () => Array(width).fill(0);

  const numbers = []; // { label, digits, kind, var/clause index }
  for (let i = 1; i <= n; i++) {
    const y = mkDigits(); y[i - 1] = 1;
    const z = mkDigits(); z[i - 1] = 1;
    clauses.forEach((clause, j) => {
      if (clause.includes(i)) y[n + j] += 1;
      if (clause.includes(-i)) z[n + j] += 1;
    });
    numbers.push({ label: `y${i} (x${i}=T)`, digits: y, kind: 'true', idx: i });
    numbers.push({ label: `z${i} (x${i}=F)`, digits: z, kind: 'false', idx: i });
  }
  for (let j = 0; j < m; j++) {
    const g = mkDigits(); g[n + j] = 1;
    const h = mkDigits(); h[n + j] = 2;
    numbers.push({ label: `g${j + 1} (slack+1)`, digits: g, kind: 'slackG', idx: j });
    numbers.push({ label: `h${j + 1} (slack+2)`, digits: h, kind: 'slackH', idx: j });
  }
  const target = mkDigits();
  for (let i = 0; i < n; i++) target[i] = 1;
  for (let j = 0; j < m; j++) target[n + j] = 4;

  return { numbers, target, width, n, m };
}

function toInt(digits) {
  // Column i has value base^i, base 10, read least-significant digit
  // first (digits[0] is the ones place for variable column 1, and so on);
  // every column sum here is always under 10 (at most 3 literal hits + 3
  // slack), so plain base-10 digits never carry into each other.
  let v = 0;
  for (let i = digits.length - 1; i >= 0; i--) v = v * 10 + digits[i];
  return v;
}

function bruteForceSubsetSum(numbers, targetVal) {
  const n = numbers.length;
  const vals = numbers.map((x) => toInt(x.digits));
  for (let mask = 0; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += vals[i];
    if (sum === targetVal) {
      const chosen = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(numbers[i]);
      return { found: true, chosen };
    }
  }
  return { found: false, chosen: null };
}

function instanceFrame(numbers, target, highlightIdx, caption, line) {
  const nodes = numbers.map((x, i) => ({
    id: i,
    label: `${x.label}: ${digitsToString(x.digits)}`,
    x: 50,
    y: 4 + (i + 0.5) * (84 / Math.max(1, numbers.length)),
    w: 92,
    h: 78 / Math.max(1, numbers.length),
    active: highlightIdx && highlightIdx.has(i),
  }));
  const pointers = [{ x: 50, y: 95, text: `target: ${digitsToString(target)}` }];
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers, emptyText: '(no numbers)' };
}

function* run(input) {
  const { formula } = input;
  const { numbers, target } = buildInstance(formula);

  yield instanceFrame(numbers, target, null, `3SAT formula over ${formula.numVars} variable(s), ${formula.clauses.length} clause(s): build 2 numbers per variable (true/false choice) and 2 slack numbers per clause.`, 0);
  yield instanceFrame(numbers, target, null, `Target has digit 1 in every variable column (pick exactly one of y_i/z_i) and digit 4 in every clause column (reachable only if the clause has at least one satisfied literal).`, 3);

  const result = bruteForceSubsetSum(numbers, toInt(target));
  if (result.found) {
    const idxSet = new Set(numbers.map((x, i) => i).filter((i) => result.chosen.includes(numbers[i])));
    yield instanceFrame(numbers, target, idxSet, `Found a subset summing to the target: ${result.chosen.map((x) => x.label).join(', ')}. The chosen y_i/z_i's spell out a satisfying assignment.`, 3);
  } else {
    yield instanceFrame(numbers, target, null, 'No subset sums to the target: the formula is unsatisfiable.', 3);
  }

  const sat = bruteForceSAT(formula);
  return { satisfiable: sat.satisfiable, subsetFound: result.found };
}

export default {
  id: '3sat-to-subset-sum',
  title: '3SAT to Subset Sum',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'Subset Sum asks whether some subset of a list of numbers adds up to exactly a target. This sandbox builds an instance straight from a 3SAT formula, using one column of decimal digits per variable and one per clause. ' +
    'Each variable gets two candidate numbers, one for setting it true and one for false, both carrying a 1 in that variable\'s own column (so the target\'s 1 in that column forces exactly one of the two to be chosen, which is exactly "pick an assignment"), plus a 1 in every clause column where that literal shows up. ' +
    'Each clause also gets two small "slack" numbers worth 1 and 2 in that clause\'s column only, and nothing else, there purely to pad a column up to the target. ' +
    'The target asks for a 4 in every clause column. A clause column can get at most 3 from the literal numbers (at most 3 literals per clause) and at most 3 more from slack (1 + 2), but hitting exactly 4 is only possible when at least one chosen literal number already contributes to that column, since slack alone tops out at 3. ' +
    "So reaching exactly 4 in every clause column, while also reaching exactly 1 in every variable column, is possible precisely when some assignment of the variables satisfies every clause: a subset summing to the target exists exactly when the original formula is satisfiable. This sandbox builds the numbers, brute-forces both sides, and checks they always agree.",
  code: CODE,
  complexity: {
    time: 'O(n + m) numbers, each with O(n + m) digits: linear in the formula size to build.',
    why: 'Every number is written down once, digit by digit, by scanning the formula once per variable or clause; the brute-force subset-sum SEARCH used here to supply ground truth is exponential, which is expected, since Subset Sum is NP-complete too.',
  },
  makeInput(rng, size) {
    const numVars = Math.max(1, Math.min(3, size || 2));
    const numClauses = Math.max(1, Math.min(2, Math.ceil((size || 2) * 0.6)));
    const formula = randomKCNF(rng, numVars, numClauses, 3);
    return { formula };
  },
  run,
  check(input, result) {
    if (!result) return false;
    return result.satisfiable === result.subsetFound;
  },
  sandbox: { type: 'n', min: 1, max: 3, default: 2, label: 'variables' },
};
