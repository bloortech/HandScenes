// A mapping reduction from A to B: a computable function f such that
// x is in A exactly when f(x) is in B. If you had a decider for B, you
// could decide A too, just by computing f and asking B's decider about
// f(x): the answer carries straight over. This is the standard tool Sipser
// uses to prove new languages undecidable, by reducing a known-undecidable
// one to them.
//
// A = "does machine M accept string w?" (A_TM, restricted to the bounded
// toy machines this course already simulates).
// B = "does machine M' accept the empty string?" (a special case of A_TM).
// f(M, w) = hardwire w into M: build M' that ignores its real input,
// overwrites the tape with the literal string w, then runs M. So M'
// accepts ANY input (including empty) exactly when M accepts w, and the
// empty string is as good a test as any. This hardwiring trick is exactly
// what proves A_TM reduces to E_TM, EQ_TM and others in Sipser.
// No DOM access.
import { parseRules, simulate, hardwireInput, ACCEPT, REJECT } from '../engine/turing.js';
import { DEFAULT_RULES as ANBN_RULES } from './turing-machine.js';

const CODE = [
  'Problem A: does M accept w?            Problem B: does M\' accept ε?',
  'f(M, w) = M\' := "overwrite tape with w, then run M"',
  'M accepts w  <=>  M\' accepts every input, in particular ε',
  'decide(A, M, w) = decide(B, f(M, w))   // the answer carries straight over',
];

function tapeFrame(tape, head, state, caption, line) {
  const n = Math.max(1, tape.length);
  const nodes = tape.map((ch, i) => ({
    id: i, label: ch,
    x: n === 1 ? 50 : 4 + (i / (n - 1)) * 92, y: 50,
    w: Math.max(4, Math.min(9, 90 / n)), h: 18, active: i === head,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [{ x: 50, y: 25, text: state }] };
}

function* run(input) {
  const { w, maxSteps } = input;
  const { rules } = parseRules(ANBN_RULES);

  const directOutcome = simulate(rules, { start: 'qcheck0', accept: ACCEPT, reject: REJECT, tape: w.length ? w.split('') : ['_'], maxSteps });
  yield tapeFrame(directOutcome.history[0].tape, 0, 'qcheck0', `Problem A: does the {0^n 1^n} machine accept w = "${w}"? Run it directly on w.`, 0);
  yield tapeFrame(directOutcome.history[directOutcome.history.length - 1].tape, directOutcome.history[directOutcome.history.length - 1].head, directOutcome.accept ? 'qaccept' : 'qreject', `Direct answer: M ${directOutcome.accept ? 'accepts' : 'does not accept'} w, after ${directOutcome.steps} step(s).`, 0);

  const { rules: hardwired, start: newStart } = hardwireInput(rules, w, 'qcheck0');
  yield tapeFrame(w.length ? w.split('') : ['_'], 0, newStart, `Build M' = f(M, w): new states write "${w}" onto the tape one symbol at a time, no matter what the real input is, then jump into M's own start state.`, 1);

  const reducedOutcome = simulate(hardwired, { start: newStart, accept: ACCEPT, reject: REJECT, tape: [], maxSteps: maxSteps + w.length + 2 });
  yield tapeFrame(reducedOutcome.history[reducedOutcome.history.length - 1].tape, reducedOutcome.history[reducedOutcome.history.length - 1].head, reducedOutcome.accept ? 'qaccept' : 'qreject', `Problem B on f(M, w): run M' on the EMPTY string (its real input is irrelevant; M' overwrites it with w first). M' ${reducedOutcome.accept ? 'accepts' : 'does not accept'} ε.`, 2);

  const agree = directOutcome.accept === reducedOutcome.accept;
  yield tapeFrame(reducedOutcome.history[reducedOutcome.history.length - 1].tape, reducedOutcome.history[reducedOutcome.history.length - 1].head, reducedOutcome.accept ? 'qaccept' : 'qreject', `${agree ? 'They agree' : 'MISMATCH'}: "M accepts w" and "M\' accepts ε" came out the same way, exactly as the reduction promised. Deciding B on f(M, w) is exactly as good as deciding A on (M, w) directly.`, 3);

  return { directAccept: directOutcome.accept, reducedAccept: reducedOutcome.accept, agree };
}

export default {
  id: 'mapping-reductions',
  title: 'Mapping reductions',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: Reducibility, Mapping Reducibility)',
  summary:
    'A mapping reduction from problem A to problem B is a computable function f that translates every instance of A into an instance of B, so that the yes/no answer always carries over: x is a "yes" for A exactly when f(x) is a "yes" for B. ' +
    'That one property is enough to transplant a decider: if B were decidable, you could decide A too, just by computing f(x) and asking B\'s decider about it. Flip it around, and it also transplants undecidability: if A is known to be undecidable and A reduces to B, then B must be undecidable too, since a decider for B would hand you one for A, which does not exist. ' +
    'This sandbox builds a real reduction from "does machine M accept string w" to "does machine M\' accept the empty string", using the standard hardwiring trick: M\' ignores its actual input, overwrites the tape with the literal string w, and then runs M. ' +
    'So M\' accepts everything (in particular the empty string) exactly when M accepts w, and nothing (in particular the empty string) otherwise. ' +
    'Run both the direct question and its reduced version on the same instance and watch them land on the identical answer, which is the reduction actually doing its job, not just a claim about it.',
  code: CODE,
  complexity: {
    time: `O(|w|) extra states and O(|w|) extra steps to build and run M'`,
    why: 'The reduction only has to write w onto the tape once, one new state per character, before handing off to M, so it is a cheap, purely mechanical translation: exactly what "computable function f" requires.',
  },
  makeInput(rng, size) {
    const len = Math.max(0, Math.min(10, size));
    let w = '';
    for (let i = 0; i < len; i++) w += rng() < 0.5 ? '0' : '1';
    return { w, maxSteps: 2000 };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { w } = input;
    const m = w.match(/^(0*)(1*)$/);
    const expectedAccept = !!m && m[1].length === m[2].length;
    return result.directAccept === expectedAccept && result.agree === true && result.reducedAccept === expectedAccept;
  },
  sandbox: { type: 'string', field: 'w', fieldLabel: 'w (instance of A)', alphabet: ['0', '1'], min: 0, max: 10, default: 4, label: 'length' },
};
