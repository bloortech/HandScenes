// The halting problem, proved undecidable by self-reference, the same
// diagonal move as the previous topic. Toy "programs" here are tagged
// objects whose behaviour on an input is one of 'accept', 'reject', or
// 'loop' (a symbolic tag meaning "never halts", so this sandbox never
// actually hangs). H is a hypothetical halting decider for this toy
// universe: H(prog, input) just runs prog(input) and reports what happened.
// D is built FROM H: D(x) runs H(x, x) (does program x halt on its own
// description?) and does the opposite. Running D on its own description is
// exactly self-reference, and it cannot be assigned any consistent outcome,
// which is the contradiction that proves no H can exist for every program.
// No DOM access.

const CODE = [
  'H(prog, input) = what prog does on input: accept, reject, or loop',
  'D(x):',
  '  if H(x, x) == accept: loop forever',
  '  else: accept',
  'Ask: what does D(D) do? Either answer contradicts H.',
];

const PROGRAMS = {
  alwaysAccept: { label: 'always-accept', run: () => 'accept' },
  alwaysReject: { label: 'always-reject', run: () => 'reject' },
  loopsForever: { label: 'loop-forever', run: () => 'loop' },
  acceptsOwnName: { label: 'accept-if-input-is-self', run: (self, input) => (input === self ? 'accept' : 'reject') },
};

function H(progId, input) {
  const prog = PROGRAMS[progId];
  return prog.run(progId, input);
}

// D's defining rule, evaluated for a HYPOTHETICAL verdict of H(D, D)
// (rather than by actually calling H on D, which would recurse forever,
// since D is defined in terms of H applied to D itself).
function dOutcomeGivenHVerdict(hVerdict) {
  return hVerdict === 'accept' ? 'loop' : 'accept';
}

function box(label, x, y, active) {
  return { id: label, label, x, y, w: 26, h: 16, active };
}

function* run(input) {
  const { sampleProgId, sampleInput } = input;
  const sampleVerdict = H(sampleProgId, sampleInput);
  yield {
    kind: 'boxes', line: 0, code: CODE,
    caption: `Warm-up: H correctly decides ordinary programs. H("${PROGRAMS[sampleProgId].label}", "${sampleInput}") = ${sampleVerdict}, found just by running the program (none of these ordinary programs refer to H itself, so there is no paradox yet).`,
    nodes: [box('H', 20, 30, true), box(PROGRAMS[sampleProgId].label, 70, 30, false)],
    edges: [['H', PROGRAMS[sampleProgId].label]],
    pointers: [{ x: 45, y: 50, text: `-> ${sampleVerdict}` }],
  };

  yield {
    kind: 'boxes', line: 1, code: CODE,
    caption: 'Now define D from H: D(x) runs H(x, x) (does x halt on its own description?). If H says x accepts itself, D loops forever; otherwise D accepts. D is a perfectly good program, built only from H.',
    nodes: [box('H', 20, 30, true), box('D', 70, 30, true)],
    edges: [['D', 'H']],
    pointers: [],
  };

  // Case split on the only two possible hypothetical verdicts for H(D, D).
  // Both are derived from D's OWN rule (never by literally calling H(D,D),
  // which is undefined precisely because it would recurse into itself).
  const caseAccept = dOutcomeGivenHVerdict('accept'); // D's rule says: loop
  const caseNotAccept = dOutcomeGivenHVerdict('reject'); // D's rule says: accept
  const contradictionA = caseAccept !== 'accept'; // H said accept, D actually loops
  const contradictionB = caseNotAccept === 'accept'; // H said not-accept, D actually accepts

  yield {
    kind: 'boxes', line: 2, code: CODE,
    caption: `Ask what D(D) does. Case 1: suppose H(D, D) = accept (H claims D halts and accepts on its own description). By D's own rule, that forces D(D) to loop forever instead, which means D(D) does NOT halt: it contradicts what H just claimed.`,
    nodes: [box('H says accept', 25, 30, false), box('D(D) actually loops', 75, 30, true)],
    edges: [['H says accept', 'D(D) actually loops']],
    pointers: [{ x: 50, y: 55, text: 'contradiction' }],
  };

  yield {
    kind: 'boxes', line: 3, code: CODE,
    caption: `Case 2: suppose H(D, D) is reject or loop (H claims D does not halt-and-accept). By D's own rule, that forces D(D) to accept, which means D(D) DOES halt: it contradicts what H just claimed, the other way round.`,
    nodes: [box('H says not-accept', 25, 30, false), box('D(D) actually accepts', 75, 30, true)],
    edges: [['H says not-accept', 'D(D) actually accepts']],
    pointers: [{ x: 50, y: 55, text: 'contradiction' }],
  };

  yield {
    kind: 'boxes', line: 4, code: CODE,
    caption: 'Every possible verdict H could give about D(D) is wrong. That is not a bug in this particular H: it means no halting decider, however cleverly written, can be correct on every program. The halting problem is undecidable.',
    nodes: [box('no valid H', 50, 40, true)],
    edges: [],
    pointers: [],
  };

  return { sampleVerdict, contradictionA, contradictionB };
}

export default {
  id: 'halting-problem',
  title: 'The halting problem',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: The Halting Problem Is Undecidable)',
  summary:
    'The halting problem asks for an algorithm H that, given any program and any input, always correctly says whether that program halts on that input. Turing proved no such H can exist, using self-reference: the same trick as Cantor\'s diagonal argument, aimed at programs instead of numbers. ' +
    'Build a new program D out of H: D(x) asks H whether x halts and accepts when run on its own description, and then deliberately does the opposite, looping forever if H says yes and accepting immediately if H says no. ' +
    'Now ask what D does when it is run on its own description, D(D). Whatever H predicts, D is built to contradict it: if H says "D(D) accepts", D\'s own rule makes it loop instead; if H says "D(D) does not accept", D\'s own rule makes it accept instead. ' +
    'Since both of the only two possible answers lead to a contradiction, no H that is always correct can exist, for any program whatsoever: this is exactly why "does this program halt" can never be answered in general by running another program. ' +
    'This sandbox runs a warm-up where H correctly decides a few ordinary programs by just running them, then walks through both halves of the contradiction once D enters the picture.',
  code: CODE,
  complexity: {
    time: 'Not applicable: the whole point is that no algorithm computes this, for any amount of time.',
    why: 'If H existed, running it would take some finite time on any input, which is exactly the hypothesis the diagonal argument contradicts. There is no fallback "slow but correct" version: the proof shows none can exist at all.',
  },
  makeInput(rng, size) {
    const ids = Object.keys(PROGRAMS);
    const sampleProgId = ids[Math.floor(rng() * ids.length)];
    const alphabet = ['x', 'y', 'z', sampleProgId];
    const len = Math.max(1, Math.min(6, size || 1));
    let sampleInput = '';
    for (let i = 0; i < len; i++) sampleInput += alphabet[Math.floor(rng() * alphabet.length)];
    return { sampleProgId, sampleInput };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { sampleProgId, sampleInput } = input;
    // Re-derive the warm-up verdict completely independently (direct call,
    // not reusing run()'s computation) and confirm it matches.
    const expectedVerdict = PROGRAMS[sampleProgId].run(sampleProgId, sampleInput);
    if (result.sampleVerdict !== expectedVerdict) return false;
    // Both halves of the case split must be genuine contradictions: this is
    // the actual theorem, verified directly from D's two-line definition,
    // not assumed.
    return result.contradictionA === true && result.contradictionB === true;
  },
  sandbox: { type: 'n', min: 1, max: 6, default: 3, label: 'warm-up input length' },
};
