// String matching with a finite automaton: precompute a transition table
// delta[state][symbol] straight from the pattern (no backtracking logic
// needed at match time at all, every step is one table lookup), then feed
// the whole text through it, same as running any DFA. No DOM access.
// CLRS: String Matching (the string-matching automaton).
import { randomTextAndPattern, bruteForceMatches, buildMatchingAutomaton, stringMatchFrame } from '../engine/strings.js';
import { layoutCircle } from '../engine/layout.js';

const ALPHABET = ['a', 'b', 'c'];
const CODE = [
  'delta = the matching automaton built from pattern',
  '  // state q = length of the longest pattern prefix',
  '  // that is a suffix of what has been read so far',
  'state = 0',
  'for i from 0 to n-1:',
  '  state = delta[state][text[i]]     // one lookup per char',
  '  if state == m: report a match ending at i',
];

function automatonFrame(automaton, laidOut, edges, state, caption, line) {
  const nodes = laidOut.map((n) => ({
    id: n.id,
    label: String(n.id),
    x: n.x,
    y: n.y,
    active: n.id === state,
    accept: n.id === automaton.m,
    start: n.id === 0,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function diagramEdges(automaton) {
  const edges = [];
  for (let q = 0; q <= automaton.m; q++) {
    for (const a of automaton.alphabet) {
      const to = automaton.delta[q][a];
      if (to !== 0) edges.push([q, to, a]);
    }
  }
  return edges;
}

function* run(input) {
  const { text, pattern } = input;
  const n = text.length, m = pattern.length;

  if (m === 0 || m > n) {
    yield { kind: 'boxes', code: CODE, line: 0, caption: m === 0 ? 'Empty pattern: nothing to match.' : `Pattern (length ${m}) is longer than the text (length ${n}): no shift fits.`, nodes: [], edges: [] };
    return { matches: [], finalState: 0 };
  }

  const automaton = buildMatchingAutomaton(pattern, ALPHABET);
  const laidOut = Array.from({ length: m + 1 }, (_, id) => ({ id }));
  layoutCircle(laidOut);
  const edges = diagramEdges(automaton);

  let state = 0;
  const matches = [];
  yield automatonFrame(automaton, laidOut, edges, state, `Built the matching automaton for "${pattern}": ${m + 1} states (0 = nothing matched yet, ${m} = accepting, a full match). Now read "${text}" one character at a time.`, 0);

  for (let i = 0; i < n; i++) {
    const next = automaton.delta[state][text[i]];
    yield automatonFrame(automaton, laidOut, edges, next, `Read '${text[i]}' (position ${i}): state ${state} -> ${next}.`, 5);
    state = next;
    if (state === m) {
      matches.push(i - m + 1);
      yield automatonFrame(automaton, laidOut, edges, state, `State ${state} is the accepting state: report a match at shift ${i - m + 1}.`, 6);
    }
  }

  yield automatonFrame(automaton, laidOut, edges, state, `Done. ${matches.length} match${matches.length === 1 ? '' : 'es'} at shift${matches.length === 1 ? '' : 's'} [${matches.join(', ')}], one transition lookup per character of the text.`, 0);
  return { matches, finalState: state };
}

export default {
  id: 'string-automaton',
  title: 'String matching with a finite automaton',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'String Matching',
  summary:
    'This is KMP\'s idea pushed all the way to its logical end: instead of a prefix function and a fallback loop at match time, precompute a full transition table delta[state][symbol] that says exactly what state to move to for every possible next character, for every state. ' +
    'A state q means "the longest suffix of what has been read so far that is also a prefix of the pattern has length q"; reading a character that extends that overlap moves to a higher state, and one that breaks it moves to whatever state captures the longest overlap that survives. ' +
    'Once that table is built, matching the whole text is just running a DFA: one table lookup per character, with no loop inside the loop at all, state m (the pattern\'s full length) marking a match. ' +
    'The cost is building the table, which takes O(m^3 |alphabet|) the naive way CLRS presents first (checking every candidate overlap length from scratch for every state and symbol), though it can be built in O(m |alphabet|) using the prefix function, the same object KMP computes. ' +
    'The double ring in this sandbox marks the accepting state (a completed match); the active (amber) state moves by exactly one transition per character, same as the plain DFA topic earlier in this course.',
  code: CODE,
  complexity: {
    time: 'O(n) to scan the text once built; O(m^3 |alphabet|) to build the table the naive way shown here (O(m |alphabet|) is possible using the prefix function).',
    why: 'Scanning is one delta lookup per text character, O(n) total, with no backtracking at all (unlike KMP\'s while loop, which is O(1) amortised but not literally O(1) every step). Building the table the naive way checks, for every one of the m+1 states and every symbol in the alphabet, candidate overlap lengths down from the current length, each candidate costing up to O(m) to verify as a suffix, giving O(m^3 |alphabet|). The faster O(m |alphabet|) construction reuses the prefix function\'s recurrence instead of re-deriving each entry from scratch.',
  },
  makeInput(rng, size) {
    const textLen = Math.max(0, Math.min(16, size));
    const patternLen = 1 + Math.floor(rng() * 3);
    return randomTextAndPattern(rng, ALPHABET, textLen, patternLen);
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = bruteForceMatches(input.text, input.pattern);
    return JSON.stringify(result.matches) === JSON.stringify(expected);
  },
  sandbox: { type: 'string', field: 'text', fieldLabel: 'text', alphabet: ALPHABET, min: 0, max: 16, default: 8, label: 'text length' },
};
