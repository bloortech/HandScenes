// The time hierarchy theorem: give a machine strictly more time and it can
// decide strictly more languages. The proof is a diagonal argument, same
// flavour as m10's diagonalisation and halting-problem topics, but
// against a finite TABLE of machines that each run within a SMALL time
// bound, instead of against "every machine" at once. Build a diagonal
// machine D that, on input i, simulates the i-th machine M_i on input i
// within M_i's own time bound and does the OPPOSITE. D cannot be
// equivalent to any M_i in the table (it disagrees with M_i on input i by
// construction), so a strictly bigger time bound (enough to simulate
// plus flip) buys real extra power: the table only ever bounded SMALL
// time budgets, and D needs more time than any of them to even run the
// simulation. No DOM access.
const CODE = [
  'table: M_0 .. M_(k-1), each decides its row within t(n) steps',
  'D(i): simulate M_i on input i within t(n) steps, then output the OPPOSITE',
  'D disagrees with M_i on input i, for every i in the table',
  'so D needs more than t(n) steps (room to simulate + flip), and decides a NEW language',
];

function tableFrame(table, diagonalRow, highlightI, caption, line) {
  const k = table.length;
  const nodes = [];
  // Header row: input indices 0..k-1 across the top.
  for (let j = 0; j < k; j++) {
    nodes.push({ id: `h${j}`, label: `in=${j}`, x: 10 + (j + 1) * (84 / (k + 1)), y: 6, w: 70 / (k + 1), h: 8, dim: true });
  }
  table.forEach((row, i) => {
    nodes.push({ id: `r${i}`, label: `M${i}`, x: 6, y: 16 + (i + 1) * (76 / (k + 1)), w: 10, h: 60 / (k + 1), dim: true, active: i === highlightI });
    row.forEach((val, j) => {
      nodes.push({
        id: `c${i}-${j}`,
        label: val ? '1' : '0',
        x: 10 + (j + 1) * (84 / (k + 1)),
        y: 16 + (i + 1) * (76 / (k + 1)),
        w: 70 / (k + 1),
        h: 60 / (k + 1),
        active: i === j && i === highlightI,
        compare: i === j,
      });
    });
  });
  if (diagonalRow) {
    nodes.push({ id: 'd-label', label: 'D', x: 6, y: 96, w: 10, h: 8, active: true });
    diagonalRow.forEach((val, j) => {
      nodes.push({ id: `d-${j}`, label: val ? '1' : '0', x: 10 + (j + 1) * (84 / (k + 1)), y: 96, w: 70 / (k + 1), h: 8, active: true });
    });
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(empty table)' };
}

function* run(input) {
  const { table } = input;
  const k = table.length;

  yield tableFrame(table, null, null, `A table of ${k} machine(s), each deciding its own row within a small time bound t(n): row i, column j is whether M_i accepts input j.`, 0);

  const diagonal = [];
  for (let i = 0; i < k; i++) {
    const mi_i = table[i][i];
    const flipped = !mi_i;
    diagonal.push(flipped);
    yield tableFrame(table, diagonal.concat(Array(k - diagonal.length).fill(false)).slice(0, k), i, `D(${i}): simulate M${i} on input ${i}, within M${i}'s own time bound. M${i}(${i}) = ${mi_i ? 1 : 0}, so D(${i}) = ${flipped ? 1 : 0} (the opposite).`, 1);
  }

  yield tableFrame(table, diagonal, null, `D disagrees with every M_i on input i, by construction. No row in the table equals D's row, so D decides a language none of these bounded-time machines decide.`, 2);

  const disagreesEverywhere = table.every((row, i) => row[i] !== diagonal[i]);
  return { k, diagonal, disagreesEverywhere };
}

export default {
  id: 'hierarchy-theorems',
  title: 'Time and space hierarchy theorems',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: '(Sipser: The Time Hierarchy Theorem, The Space Hierarchy Theorem)',
  summary:
    'More time (or more space) really does buy more computational power: the time hierarchy theorem says that for a reasonable time bound t(n), there is a language decidable in time t(n) log t(n) that is NOT decidable in time t(n). The space hierarchy theorem says the analogous thing for memory, with an even tighter gap (just t(n) vs a bit more than t(n), no log factor needed). ' +
    'The proof is a diagonal argument: imagine a table listing every machine that runs within the smaller time bound t(n), one row per machine, one column per input length (or, for this small animated version, one column per input INDEX). ' +
    "Build a new machine D that, on input i, simulates the i-th machine M_i on input i (using its OWN time budget, since that is all the table promised) and then outputs the opposite of whatever M_i decided. D's row in the table, read down the diagonal, disagrees with every single M_i's row at position i, so D cannot be equivalent to any machine in the table: it decides a genuinely different language. " +
    "D itself needs strictly more time than t(n), because simulating M_i costs some overhead on top of M_i's own t(n) steps, plus the final flip. That extra room is exactly why a BIGGER time bound buys strictly more power than a smaller one: there is a language the bigger bound can decide that the smaller one provably cannot. " +
    'This sandbox builds a real finite table of toy machines (their accept/reject behaviour on each input index), runs the diagonal construction, and checks that the resulting D really does disagree with every row at its diagonal entry, which is the entire proof made concrete.',
  code: CODE,
  complexity: {
    time: 'D needs O(t(n) log t(n))-ish time: enough to simulate a t(n)-time machine, plus simulation overhead, plus the final flip.',
    why: 'Simulating one step of an arbitrary machine on a fixed machine model can cost a logarithmic factor (bookkeeping which machine and which step is being simulated), which is exactly the gap the time hierarchy theorem states; the space hierarchy theorem needs no such overhead, which is why its gap is tighter.',
  },
  makeInput(rng, size) {
    const k = Math.max(1, Math.min(6, size || 4));
    const table = Array.from({ length: k }, () => Array.from({ length: k }, () => rng() < 0.5));
    return { table };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.diagonal.length !== result.k) return false;
    return result.disagreesEverywhere === true;
  },
  sandbox: { type: 'n', min: 1, max: 6, default: 4, label: 'machines in the table' },
};
