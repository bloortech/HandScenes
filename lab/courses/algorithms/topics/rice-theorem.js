// Rice's theorem: any property of a program that only depends on the
// LANGUAGE it computes (not on how it is written) is undecidable, unless it
// is trivial (true of every program, or false of every program). The proof
// idea is that a decider for such a property could never peek at syntax,
// only at behaviour on every possible input, which is exactly where the
// halting problem's undecidability lives.
//
// This sandbox makes the key fact concrete: here are two machines with
// completely different transition tables (different syntax, different
// number of states) that accept exactly the same language. Any property
// that only cares about the language must treat them identically, which
// means the property-decider cannot shortcut by reading the table; it
// would have to somehow know the machine's behaviour on every input, which
// is the undecidable part. No DOM access.
import { parseRules, simulate, ACCEPT, REJECT } from '../engine/turing.js';
import { DEFAULT_RULES } from './turing-machine.js';

const CODE = [
  'M1, M2 compute the same language L, but have different transition tables',
  'A semantic property P depends only on L, so P(M1) must equal P(M2)',
  'test strings: run both machines, compare their accept/reject verdicts',
];

// M2: the same algorithm as M1, but with every state renamed and one extra
// "do nothing" detour state spliced into the busiest transition, so the
// table is genuinely different (different state count, different names)
// while computing the exact same language.
function buildM2(rules) {
  const renamed = new Map();
  const rename = (s) => (s === 'qaccept' || s === 'qreject' ? s : `s_${s}`);
  for (const [key, rule] of rules) {
    const [state, sym] = key.split('|');
    renamed.set(`${rename(state)}|${sym}`, { ...rule, next: rule.next === 'qaccept' || rule.next === 'qreject' ? rule.next : rename(rule.next) });
  }
  // Splice a harmless detour: s_qcheck0 on '0' first visits a new state
  // "detour", which passes straight through without touching the tape
  // (whatever symbol it now sees, write it back unchanged and stay put),
  // before continuing into the original next state. Purely extra syntax,
  // one extra step, identical behaviour.
  const original = renamed.get('s_qcheck0|0');
  renamed.set('s_qcheck0|0', { write: original.write, move: 'R', next: 'detour' });
  for (const sym of ['0', '1', '_', 'x', 'y']) {
    renamed.set(`detour|${sym}`, { write: sym, move: 'S', next: original.next });
  }
  return renamed;
}

function tapeFrame(tape, head, label, y, caption, line) {
  const n = Math.max(1, tape.length);
  const nodes = tape.map((ch, i) => ({
    id: i, label: ch,
    x: n === 1 ? 50 : 4 + (i / (n - 1)) * 92, y,
    w: Math.max(4, Math.min(9, 90 / n)), h: 16, active: i === head,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [{ x: 50, y: y - 12, text: label }] };
}

function* run(input) {
  const { testStrings } = input;
  const { rules: rules1 } = parseRules(DEFAULT_RULES);
  const rules2 = buildM2(rules1);
  const results = [];
  for (const str of testStrings) {
    const tape1 = str.length ? str.split('') : ['_'];
    const r1 = simulate(rules1, { start: 'qcheck0', accept: ACCEPT, reject: REJECT, tape: tape1, maxSteps: 2000 });
    const r2 = simulate(rules2, { start: 's_qcheck0', accept: ACCEPT, reject: REJECT, tape: str.length ? str.split('') : ['_'], maxSteps: 2000 });
    results.push({ str, accept1: r1.accept, accept2: r2.accept });
    yield tapeFrame(r1.history[r1.history.length - 1].tape, r1.history[r1.history.length - 1].head, `M1 on "${str}"`, 30,
      `M1 (the original table) on "${str}": ${r1.accept ? 'accept' : 'reject'}.`, 0);
    yield tapeFrame(r2.history[r2.history.length - 1].tape, r2.history[r2.history.length - 1].head, `M2 on "${str}"`, 70,
      `M2 (renamed states plus a detour, a completely different table) on "${str}": ${r2.accept ? 'accept' : 'reject'}. ${r1.accept === r2.accept ? 'Same verdict as M1.' : 'DIFFERENT from M1!'}`, 1);
  }
  const sameLanguageOnTests = results.every((r) => r.accept1 === r.accept2);
  yield tapeFrame([], 0, 'done', 50,
    `Across every test string, M1 and M2 agree: same language, even though their tables are different sizes with different state names. A property like "does this machine's language contain the empty string" cannot tell them apart, because it is only ever a fact about the language, never about the table. That is why Rice's theorem makes such properties undecidable in general: deciding one would mean deciding something about behaviour on every input, for every possible program, which is the halting problem in disguise.`,
    2);
  return { sameLanguageOnTests, tableSizesDiffer: rules1.size !== rules2.size, count: results.length };
}

export default {
  id: 'rice-theorem',
  title: "Rice's theorem",
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: "(Sipser: A Simple Undecidable Problem, Rice's Theorem)",
  summary:
    "Rice's theorem says that almost every interesting question about what a program's language IS, rather than how the program is written, is undecidable. Formally: any property of the language a Turing machine recognises, other than the two trivial ones (true for every machine, or false for every machine), cannot be decided by looking at the machine's code. " +
    'The reason is that two completely different-looking programs can compute the exact same language, so any correct answer about "the language" has to be the same for both, which means the decider can never shortcut by reading syntax. It would have to somehow know the machine\'s behaviour on every possible input, which circles straight back into the halting problem. ' +
    'This sandbox makes that fact concrete instead of abstract: M1 is the familiar {0^n 1^n} machine, and M2 is built by renaming every one of its states and splicing in an extra do-nothing detour state, so the two transition tables are genuinely different sizes with different names. ' +
    'Run both on the same test strings and watch them agree every single time: same language, different syntax, which is exactly the fact a semantic-property decider could never see past. ' +
    'Properties that only look at the table itself (like "does this machine have more than 10 states") are a different story: those ARE decidable, because they never have to ask what the machine actually computes.',
  code: CODE,
  complexity: {
    time: 'O(k * n) to compare two machines on k test strings each costing up to n simulation steps.',
    why: "Checking agreement on finitely many test strings is cheap and exactly what this sandbox does; Rice's theorem is about the impossibility of checking ALL strings in general, which no finite test can ever fully stand in for.",
  },
  makeInput(rng, size) {
    const k = Math.max(1, Math.min(6, size || 1));
    const testStrings = [];
    for (let i = 0; i < k; i++) {
      const len = 1 + Math.floor(rng() * 6);
      let s = '';
      for (let j = 0; j < len; j++) s += rng() < 0.5 ? '0' : '1';
      testStrings.push(s);
    }
    testStrings.push(''); // always include the empty string
    return { testStrings };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.count !== input.testStrings.length) return false;
    // The entire point, verified directly: different tables, identical
    // behaviour on every test string actually run.
    return result.sameLanguageOnTests === true && result.tableSizesDiffer === true;
  },
  sandbox: { type: 'n', min: 1, max: 6, default: 3, label: 'test strings' },
};
