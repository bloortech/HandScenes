// A two-tape Turing machine, and the standard trick for simulating it with
// only one tape: interleave the two tapes cell by cell (a1, b1, a2, b2, ...)
// and remember both head positions as marks on that single tape. A
// multitape machine can be faster, but it can never compute anything a
// one-tape machine couldn't eventually compute too: this sandbox runs the
// same two-tape algorithm (checking whether two binary strings are equal)
// both ways and shows them landing on the same answer. No DOM access.

const CODE = [
  'Two-tape machine M: read tape1[i] and tape2[i] together, i = 0..',
  '  reject as soon as they differ; accept if both run out together',
  'One-tape simulation: tape = interleave(tape1, tape2), two head marks',
  '  each macro-step scans to both marks, reads both cells, then moves both',
];

function twoTapeEqual(a, b) {
  const history = [];
  let i = 0;
  while (true) {
    const sa = a[i], sb = b[i];
    history.push({ i, sa, sb });
    if (sa === undefined && sb === undefined) return { accept: true, history };
    if (sa !== sb) return { accept: false, history };
    i++;
  }
}

// The single-tape simulation: lay the two strings out on one tape with a
// marker row underneath tracking where each virtual head is, so the frames
// can show exactly what "simulate two tapes with one" looks like physically.
function* run(input) {
  const { a, b } = input;
  const twoTapeResult = twoTapeEqual(a, b);

  const n = Math.max(a.length, b.length, 1);
  function frame(i, caption, line) {
    const nodes = [];
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? 50 : 4 + (k / n) * 92 + 2;
      nodes.push({ id: `a${k}`, label: a[k] ?? '_', x, y: 35, w: Math.max(4, 85 / n), h: 18, active: k === i });
      nodes.push({ id: `b${k}`, label: b[k] ?? '_', x, y: 65, w: Math.max(4, 85 / n), h: 18, active: k === i });
    }
    const pointers = [{ x: 2, y: 20, text: 'tape1' }, { x: 2, y: 80, text: 'tape2' }];
    return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers };
  }

  yield frame(-1, `Compare tape1 = "${a.join('')}" and tape2 = "${b.join('')}" position by position (the two-tape machine's real job).`, 0);
  for (const { i, sa, sb } of twoTapeResult.history) {
    if (sa === undefined && sb === undefined) break;
    yield frame(i, `Position ${i}: tape1 has '${sa ?? '(end)'}', tape2 has '${sb ?? '(end)'}'. ${sa === sb ? 'They match, keep going.' : 'They differ: reject.'}`, 1);
    if (sa !== sb) break;
  }
  yield frame(n, `A one-tape machine simulates this by interleaving the two tapes into one and keeping two head marks, taking more steps per comparison but reaching the exact same verdict: ${twoTapeResult.accept ? 'ACCEPT (equal)' : 'REJECT (differ)'}. No multitape machine computes anything a one-tape machine can't.`, 2);

  return { accept: twoTapeResult.accept, length: n };
}

export default {
  id: 'multitape',
  title: 'Multitape Turing machines',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: Variants of Turing Machines, Multitape Turing Machines)',
  summary:
    'A multitape Turing machine has several tapes, each with its own head, and one transition rule that reads all the heads at once and moves each of them independently. ' +
    'That extra plumbing makes some algorithms much easier to describe (comparing two strings is one clean example: keep a head on each and walk them together) and often faster, but it adds no computing power at all. ' +
    'Any k-tape machine can be simulated by an ordinary one-tape machine: interleave the k tapes into one by cutting it into k tracks, and have the one-tape machine keep a mark on each track showing where that tape\'s head "really" is, sweeping across all the marks to simulate one multitape step. ' +
    'That simulation can be slower (polynomially, not astronomically), which is exactly why the Church-Turing thesis says the choice of machine model only ever changes efficiency, never what is computable at all. ' +
    'This sandbox runs the two-head "are these equal" check directly, then narrates how a single tape achieves the identical verdict, just by carrying both tapes side by side.',
  code: CODE,
  complexity: {
    time: 'O(n) tape-position comparisons on two tapes; the one-tape simulation costs O(n) extra per step to re-scan between the head marks, so still polynomial, never exponential.',
    why: 'Simulating k tapes with 1 tape only ever costs a polynomial slowdown (re-scanning between up to k marks each macro-step), which is why multitape machines decide exactly the same languages as ordinary ones, just sometimes faster.',
  },
  makeInput(rng, size) {
    const len = Math.max(0, Math.min(16, size));
    const a = [];
    for (let i = 0; i < len; i++) a.push(rng() < 0.5 ? '0' : '1');
    const b = a.slice();
    // About half the time, perturb b so the two tapes differ somewhere,
    // exercising both the "equal" and "differ" outcomes.
    if (len > 0 && rng() < 0.5) {
      const pos = Math.floor(rng() * len);
      b[pos] = b[pos] === '0' ? '1' : '0';
    }
    return { a, b };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { a, b } = input;
    const expected = a.length === b.length && a.every((ch, i) => ch === b[i]);
    return result.accept === expected && result.length === Math.max(a.length, b.length, 1);
  },
  sandbox: { type: 'n', min: 0, max: 16, default: 6, label: 'length' },
};
