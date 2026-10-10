// Towers of Hanoi: move n disks from peg A to peg C, one at a time, never
// placing a bigger disk on a smaller one, using a spare peg B. No DOM
// access. Disks are drawn as boxes stacked on three pegs.

const CODE = [
  'hanoi(n, from, to, via):',
  '  if n == 0: return',
  '  hanoi(n - 1, from, via, to)',
  '  move disk n from "from" to "to"',
  '  hanoi(n - 1, via, to, from)',
];

const PEG_X = { A: 20, B: 50, C: 80 };

function frameFromPegs(pegs, n, activeDisk, caption, moves, line) {
  const nodes = [];
  for (const pegName of ['A', 'B', 'C']) {
    const stack = pegs[pegName];
    stack.forEach((disk, level) => {
      nodes.push({
        id: `${pegName}-${disk}`,
        label: String(disk),
        x: PEG_X[pegName],
        y: 88 - level * 11,
        w: 10 + (disk / n) * 22,
        h: 9,
        active: disk === activeDisk,
      });
    });
  }
  const pointers = ['A', 'B', 'C'].map((pegName) => ({ x: PEG_X[pegName], y: 97, text: pegName }));
  return { kind: 'boxes', line, caption, nodes, edges: [], pointers, counters: { moves } };
}

function* run(input) {
  const n = Math.max(0, Math.min(input.n, 8));
  const pegs = { A: [], B: [], C: [] };
  for (let d = n; d >= 1; d--) pegs.A.push(d); // biggest disk at the bottom
  let moves = 0;
  const moveLog = [];

  yield frameFromPegs(pegs, Math.max(n, 1), null, `${n} disk${n === 1 ? '' : 's'} stacked on peg A. Move them all to peg C.`, moves, 0);

  function* solve(k, from, to, via) {
    if (k === 0) return;
    yield* solve(k - 1, from, via, to);
    const disk = pegs[from].pop();
    pegs[to].push(disk);
    moves++;
    moveLog.push([disk, from, to]);
    yield frameFromPegs(pegs, Math.max(n, 1), disk, `Move disk ${disk} from peg ${from} to peg ${to}.`, moves, 3);
    yield* solve(k - 1, via, to, from);
  }

  yield* solve(n, 'A', 'C', 'B');

  if (n > 0) {
    yield frameFromPegs(pegs, n, null, `All ${n} disks are on peg C, in ${moves} moves.`, moves, 1);
  }

  return { n, moves, moveLog, finalPegs: { A: pegs.A.slice(), B: pegs.B.slice(), C: pegs.C.slice() } };
}

// Replays a move log against a fresh set of pegs to check it is a legal,
// complete solution: every move takes the top disk of one peg, never drops
// a bigger disk onto a smaller one, and ends with every disk on peg C.
function replayIsLegal(n, moveLog) {
  const pegs = { A: [], B: [], C: [] };
  for (let d = n; d >= 1; d--) pegs.A.push(d);
  for (const [disk, from, to] of moveLog) {
    const top = pegs[from][pegs[from].length - 1];
    if (top !== disk) return false;
    const destTop = pegs[to][pegs[to].length - 1];
    if (destTop != null && destTop < disk) return false;
    pegs[from].pop();
    pegs[to].push(disk);
  }
  return pegs.A.length === 0 && pegs.B.length === 0 && pegs.C.length === n;
}

export default {
  id: 'hanoi',
  title: 'Towers of Hanoi',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Growth of Functions (classic exponential recurrence example)',
  summary:
    'The Towers of Hanoi puzzle moves a stack of disks from one peg to another, one disk at a time, never placing a bigger disk on top of a smaller one. ' +
    'The recursive trick: to move n disks from "from" to "to", first move the top n-1 disks out of the way onto the spare peg, then move the biggest disk directly, then move the n-1 disks from the spare peg onto the biggest one. ' +
    'Each call makes two recursive calls on a problem one smaller, so the number of moves follows the recurrence T(n) = 2*T(n-1) + 1, which works out to exactly 2^n - 1 moves. ' +
    'That is an exponential recurrence: adding just one more disk roughly doubles the number of moves needed. ' +
    'This puzzle is a standard first example of a recursive algorithm whose running time is provably exponential, not just large.',
  code: CODE,
  complexity: {
    time: 'Exactly 2^n - 1 moves for n disks.',
    why: 'hanoi(n) makes two recursive calls to hanoi(n-1) plus one direct move, so the move count T(n) satisfies T(n) = 2*T(n-1) + 1 with T(0) = 0. Solving that recurrence gives T(n) = 2^n - 1, which grows exponentially in n.',
  },
  makeInput(rng, size) {
    return { n: Math.max(0, Math.min(size, 8)) };
  },
  run,
  check(input, result) {
    const n = Math.max(0, Math.min(input.n, 8));
    if (!result || result.n !== n) return false;
    if (result.moves !== (n === 0 ? 0 : 2 ** n - 1)) return false;
    return replayIsLegal(n, result.moveLog);
  },
  sandbox: { type: 'n', min: 0, max: 8, default: 4, label: 'disks' },
};
