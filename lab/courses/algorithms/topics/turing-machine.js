// A Turing machine: a tape of cells, a head that reads/writes/moves one
// cell at a time, and a transition table that looks up (state, symbol) and
// gets back (write, move, next state). This sandbox ships a working table
// that decides B = {0^n 1^n}, and the table itself is editable text: change
// a rule, rerun, and watch the machine do something else on the same tape.
// No DOM access.
import { parseRules, simulate, ACCEPT, REJECT, BLANK } from '../engine/turing.js';

const START = 'qcheck0';

// The default table: first confirm the input looks like 0*1* (reject the
// moment a 0 shows up after a 1 has been seen), then repeatedly cross off
// one leftmost unmarked 0 (write x) and the nearest unmarked 1 to its right
// (write y), sweeping back to the left edge between rounds. Accepting means
// every 0 found a matching 1 and vice versa.
export const DEFAULT_RULES = [
  '# decide B = {0^n 1^n}: first check order, then cross off pairs',
  'qcheck0,0 => 0,R,qcheck0',
  'qcheck0,1 => 1,R,qcheck1',
  `qcheck0,${BLANK} => ${BLANK},L,qreturn`,
  'qcheck1,1 => 1,R,qcheck1',
  'qcheck1,0 => 0,S,qreject',
  `qcheck1,${BLANK} => ${BLANK},L,qreturn`,
  'qreturn,0 => 0,L,qreturn',
  'qreturn,1 => 1,L,qreturn',
  `qreturn,${BLANK} => ${BLANK},R,q0`,
  'q0,0 => x,R,q1',
  'q0,x => x,R,q0',
  'q0,y => y,R,q0',
  'q0,1 => 1,S,qreject',
  `q0,${BLANK} => ${BLANK},S,qaccept`,
  'q1,0 => 0,R,q1',
  'q1,x => x,R,q1',
  'q1,y => y,R,q1',
  'q1,1 => y,L,qback',
  `q1,${BLANK} => ${BLANK},S,qreject`,
  'qback,0 => 0,L,qback',
  'qback,1 => 1,L,qback',
  'qback,x => x,L,qback',
  'qback,y => y,L,qback',
  `qback,${BLANK} => ${BLANK},R,q0`,
].join('\n');

const CODE = [
  'state = start; head = 0',
  'loop:',
  '  sym = tape[head]',
  '  (write, move, next) = table[state, sym]   // reject if no rule',
  '  tape[head] = write; head += move; state = next',
  'until state is qaccept or qreject (or table has no matching rule)',
];

function tapeFrame(snap, { caption, line, note }) {
  const tape = snap.tape;
  const n = Math.max(1, tape.length);
  const nodes = tape.map((ch, i) => ({
    id: i,
    label: ch,
    x: n === 1 ? 50 : 4 + (i / (n - 1)) * 92,
    y: 50,
    w: Math.max(4, Math.min(9, 90 / n)),
    h: 20,
    active: i === snap.head,
  }));
  const pointers = [{ x: nodes[snap.head] ? nodes[snap.head].x : 50, y: 30, text: `${snap.state}${note ? ' ' + note : ''}` }];
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers };
}

function* run(input) {
  const { rulesText, tapeString, maxSteps } = input;
  const { rules, errors } = parseRules(rulesText);
  const tape = tapeString.length ? tapeString.split('') : [BLANK];

  if (errors.length > 0) {
    yield tapeFrame({ state: 'parse-error', tape, head: 0 }, {
      caption: `Could not parse rule(s): ${errors.join(' | ')}. Falling back to reject.`,
      line: 2,
    });
    return { accept: false, halted: true, looped: false, steps: 0, parseError: true };
  }

  const outcome = simulate(rules, { start: START, accept: ACCEPT, reject: REJECT, tape, maxSteps });
  const hist = outcome.history;
  // Cap the number of frames shown for long runs so the player stays usable;
  // the accept/reject/loop verdict and step count are unaffected.
  const shown = hist.length <= 60 ? hist : hist.slice(0, 30).concat(hist.slice(-30));
  for (let i = 0; i < shown.length; i++) {
    const snap = shown[i];
    yield tapeFrame(snap, { caption: `Step ${i === shown.length - 1 && shown.length < hist.length ? '...' : i}: state ${snap.state}, head at ${snap.head}.`, line: 2 });
  }
  const verdict = outcome.looped
    ? 'LOOPS FOREVER (an exact configuration repeated: this is provable, not a guess).'
    : outcome.accept
      ? 'ACCEPT.'
      : outcome.stuck
        ? 'REJECT (no rule matches: the table is not total here).'
        : outcome.halted
          ? 'REJECT.'
          : `ran out of the ${maxSteps}-step budget without halting or looping`;
  yield tapeFrame(hist[hist.length - 1], { caption: `Finished after ${outcome.steps} step(s): ${verdict}`, line: 5 });
  return { accept: outcome.accept, halted: outcome.halted, looped: outcome.looped, steps: outcome.steps };
}

export default {
  id: 'turing-machine',
  title: 'Turing machines',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: The Church-Turing Thesis / Turing Machines)',
  summary:
    'A Turing machine is the simplest model powerful enough to capture everything we mean by "computable": an infinite tape of cells, a head that reads one cell, writes a new symbol into it, and moves one step left or right, and a finite transition table that looks up the current state and symbol to decide what to write, which way to move, and which state to go to next. ' +
    'Unlike a DFA, a Turing machine can move backwards and overwrite the tape, which is exactly the extra power it needs to do unbounded counting and matching, things no finite-state machine can do. ' +
    'The table shipped here decides whether a string is in {0^n 1^n}: it first checks the string looks like some 0s followed by some 1s, then repeatedly crosses off one 0 and one matching 1 until either both run out together (accept) or one runs out first (reject). ' +
    'Edit the table (each line is "state,symbol => write,move,nextState") and rerun it on the same tape to see a different machine take over the same job, or break it to see what a reject, or an infinite loop, actually look like step by step. ' +
    'Every topic in this module reuses this same table-and-tape machinery: multitape machines, the halting problem, and decidability all build on exactly this definition.',
  code: CODE,
  complexity: {
    time: 'Unbounded in general (that is the whole point): this sandbox caps it at a step budget and reports a loop only when it can prove one (an exact configuration repeats).',
    why: 'A Turing machine has no guaranteed running time: the halting problem topic is about exactly why no algorithm can predict it in general. This simulator can only ever answer "accept", "reject", or "definitely loops" (cycle detected); running out of the step budget without either means genuinely "don\'t know yet".',
  },
  makeInput(rng, size) {
    const len = Math.max(0, Math.min(16, size));
    let tapeString = '';
    for (let i = 0; i < len; i++) tapeString += rng() < 0.5 ? '0' : '1';
    return { rulesText: DEFAULT_RULES, tapeString, maxSteps: 2000 };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { tapeString } = input;
    if (result.parseError) return false;
    // Independent brute-force definition of {0^n 1^n}, not derived from the
    // table at all: a prefix of 0s followed by a suffix of 1s of equal
    // lengths covering the whole string.
    const m = tapeString.match(/^(0*)(1*)$/);
    const expectedAccept = !!m && m[1].length === m[2].length;
    if (expectedAccept) {
      return result.accept === true && result.halted === true;
    }
    // Not in the language: the machine must not accept (reject, get stuck,
    // or provably loop are all acceptable "not accept" outcomes).
    return result.accept === false;
  },
  sandbox: {
    type: 'text',
    field: 'rulesText',
    fieldLabel: 'transition table (state,symbol => write,move,nextState)',
    rows: 14,
    min: 0,
    max: 16,
    default: 6,
    label: 'tape length (randomizes a fresh tape; the table stays as you left it until you randomize)',
  },
};
