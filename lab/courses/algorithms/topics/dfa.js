// Deterministic finite automata: feed a string through a DFA one character
// at a time, watching the current state move along exactly one transition
// per character, and see whether it ends in an accepting state. No DOM
// access.
import { randomDFA, randomString } from '../engine/automaton.js';
import { layoutCircle } from '../engine/layout.js';

const ALPHABET = ['a', 'b'];
const CODE = [
  'state = start',
  'for ch in string:',
  '  state = delta(state, ch)   // follow exactly one transition',
  'accept if state is an accepting state, else reject',
];

function diagram(dfa) {
  const edges = [];
  for (const [key, to] of dfa.delta) {
    const [from, sym] = key.split('|');
    edges.push([Number(from), to, sym]);
  }
  return edges;
}

function frameFor(dfa, laidOutNodes, edges, current, caption, line) {
  const nodes = laidOutNodes.map((n) => ({
    id: n.id,
    label: String(n.id),
    x: n.x,
    y: n.y,
    active: n.id === current,
    accept: dfa.accept.has(n.id),
    start: n.id === dfa.start,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function* run(input) {
  const { dfa, testString } = input;
  const laidOutNodes = dfa.states.map((s) => ({ id: s }));
  layoutCircle(laidOutNodes);
  const edges = diagram(dfa);

  let state = dfa.start;
  yield frameFor(dfa, laidOutNodes, edges, state, `Start in state ${state}. Read "${testString}" one character at a time.`, 0);

  for (let i = 0; i < testString.length; i++) {
    const ch = testString[i];
    const next = dfa.delta.get(`${state}|${ch}`);
    yield frameFor(dfa, laidOutNodes, edges, state, `Read '${ch}' (character ${i + 1} of ${testString.length}): state ${state} -> ${next}.`, 2);
    state = next;
  }
  const accept = dfa.accept.has(state);
  yield frameFor(
    dfa,
    laidOutNodes,
    edges,
    state,
    `Finished. State ${state} is ${accept ? 'an accepting state: ACCEPT.' : 'not accepting: REJECT.'}`,
    3
  );
  return { accept, finalState: state };
}

export default {
  id: 'dfa',
  title: 'Deterministic finite automata',
  module: 'm03',
  course: 'CSC236/240',
  clrs: '(Sipser: Regular Languages; CLRS covers finite automata briefly in String Matching)',
  summary:
    'A deterministic finite automaton (DFA) is a tiny machine: a fixed set of states, one of them the start state, some of them marked accepting, and exactly one transition out of every state for every symbol in the alphabet. ' +
    'Feeding it a string just means starting at the start state and following one transition per character, with no choices and no guessing: the next state is always uniquely determined, hence "deterministic". ' +
    'Once the whole string has been read, the machine accepts if it landed on an accepting state, and rejects otherwise. ' +
    'The double ring in this sandbox marks accepting states, and the arrow with no source marks the start state. Watch the active (amber) state move exactly once per character as the string is fed in. ' +
    'DFAs are the simplest model of computation that can still recognize interesting patterns (the regular languages), and the next few topics build NFAs, regexes, and minimisation on top of this same idea.',
  code: CODE,
  complexity: {
    time: 'O(n) to run a string of length n: exactly one transition lookup per character.',
    why: 'A DFA is total and deterministic, so there is never any backtracking or branching: each character does exactly one O(1) table lookup to find the next state.',
  },
  makeInput(rng, size) {
    const numStates = 2 + Math.floor(rng() * 4); // 2..5
    const dfa = randomDFA(rng, numStates, ALPHABET);
    const len = Math.max(0, Math.min(14, size));
    const testString = randomString(rng, ALPHABET, len);
    return { dfa, testString };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { dfa, testString } = input;
    let state = dfa.start;
    for (const ch of testString) {
      const next = dfa.delta.get(`${state}|${ch}`);
      if (next == null) { state = null; break; }
      state = next;
    }
    const expectedAccept = state != null && dfa.accept.has(state);
    return result.accept === expectedAccept && result.finalState === state;
  },
  sandbox: { type: 'string', field: 'testString', fieldLabel: 'test string', alphabet: ALPHABET, min: 0, max: 14, default: 5, label: 'length' },
};
