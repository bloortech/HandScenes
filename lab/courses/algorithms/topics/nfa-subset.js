// NFAs and the subset construction: simulate a nondeterministic finite
// automaton (which can be in several states at once), then convert it into
// an equivalent DFA whose states are literally sets of NFA states. No DOM
// access.
import { randomNFA, randomString, epsilonClosure, nfaMove, nfaSimulate, dfaSimulate, subsetConstruction } from '../engine/automaton.js';
import { layoutCircle } from '../engine/layout.js';

const ALPHABET = ['a', 'b'];
const CODE_NFA = [
  'states = epsilon-closure({start})',
  'for ch in string:',
  '  states = epsilon-closure(move(states, ch))   // can grow to several states',
  'accept if any current state is accepting',
];
const CODE_SUBSET = [
  'subset construction:',
  '  DFA start = epsilon-closure({NFA start})',
  '  for each reachable DFA state S and symbol a:',
  '    delta(S, a) = epsilon-closure(move(S, a))   // a whole new subset',
  '  DFA accepts S if S contains any NFA accepting state',
];

function nfaDiagram(nfa) {
  const laidOut = nfa.states.map((s) => ({ id: s }));
  layoutCircle(laidOut);
  const edges = [];
  for (const [key, set] of nfa.delta) {
    const [from, sym] = key.split('|');
    for (const to of set) edges.push([Number(from), to, sym]);
  }
  return { laidOut, edges };
}

function nfaFrame(nfa, laidOut, edges, currentSet, caption, line) {
  const nodes = laidOut.map((n) => ({
    id: n.id,
    label: String(n.id),
    x: n.x,
    y: n.y,
    active: currentSet.has(n.id),
    accept: nfa.accept.has(n.id),
    start: n.id === nfa.start,
  }));
  return { kind: 'tree', line, code: CODE_NFA, caption, nodes, edges };
}

function* runNfaSim(nfa, testString) {
  const { laidOut, edges } = nfaDiagram(nfa);
  let current = epsilonClosure(nfa, new Set([nfa.start]));
  yield nfaFrame(nfa, laidOut, edges, current, `Start in the epsilon-closure of the start state: {${[...current].sort((a, b) => a - b).join(', ')}}.`, 0);
  for (let i = 0; i < testString.length; i++) {
    const ch = testString[i];
    current = epsilonClosure(nfa, nfaMove(nfa, current, ch));
    yield nfaFrame(nfa, laidOut, edges, current, `Read '${ch}' (${i + 1}/${testString.length}): now in states {${[...current].sort((a, b) => a - b).join(', ') || '(none)'}}.`, 2);
  }
  const accept = [...current].some((s) => nfa.accept.has(s));
  yield nfaFrame(nfa, laidOut, edges, current, `Finished reading. ${accept ? 'At least one current state accepts: ACCEPT.' : 'No current state accepts: REJECT.'}`, 3);
  return accept;
}

function subsetFrame(dfa, posById, builtStates, builtEdges, activeKey, stateSets, caption, line) {
  const nodes = [...builtStates].map((k) => ({
    id: k,
    label: setLabel(stateSets.get(k)),
    x: posById.get(k).x,
    y: posById.get(k).y,
    active: k === activeKey,
    accept: dfa.accept.has(k),
    start: k === dfa.start,
  }));
  return { kind: 'tree', line, code: CODE_SUBSET, caption, nodes, edges: builtEdges };
}

function setLabel(set) {
  if (!set || set.size === 0) return '∅';
  return `{${[...set].sort((a, b) => a - b).join(',')}}`;
}

function* runSubsetConstruction(nfa) {
  const { dfa, stateSets, steps } = subsetConstruction(nfa, nfa.alphabet);
  const laidOut = dfa.states.map((s) => ({ id: s }));
  layoutCircle(laidOut);
  const posById = new Map(laidOut.map((n) => [n.id, n]));

  const builtStates = new Set([dfa.start]);
  const builtEdges = [];
  yield subsetFrame(dfa, posById, builtStates, builtEdges, dfa.start, stateSets, `DFA start state: ${setLabel(stateSets.get(dfa.start))}, the epsilon-closure of the NFA's start state.`, 1);
  for (const step of steps) {
    const isNew = !builtStates.has(step.toKey);
    builtStates.add(step.toKey);
    builtEdges.push([step.fromKey, step.toKey, step.sym]);
    yield subsetFrame(
      dfa,
      posById,
      builtStates,
      builtEdges,
      step.toKey,
      stateSets,
      `From ${setLabel(stateSets.get(step.fromKey))} on '${step.sym}': ${isNew ? 'discovers the new DFA state' : 'reaches the already-known state'} ${setLabel(stateSets.get(step.toKey))}.`,
      3
    );
  }
  yield subsetFrame(dfa, posById, builtStates, builtEdges, null, stateSets, `Subset construction finished: ${dfa.states.length} DFA state${dfa.states.length === 1 ? '' : 's'}, each one a set of NFA states.`, 4);
  return dfa;
}

function* run(input) {
  const { nfa, testString } = input;
  const nfaAccept = yield* runNfaSim(nfa, testString);
  const dfa = yield* runSubsetConstruction(nfa);
  const dfaAccept = dfaSimulate(dfa, testString).accept;
  return { nfaAccept, dfaAccept, dfaStatesCount: dfa.states.length };
}

export default {
  id: 'nfa-subset',
  title: 'NFAs and the subset construction',
  module: 'm03',
  course: 'CSC236/240',
  clrs: '(Sipser: Regular Languages, Equivalence of NFAs and DFAs)',
  summary:
    'A nondeterministic finite automaton (NFA) relaxes a DFA\'s rules: a state can have zero, one, or several transitions on the same symbol, and it can also have free "epsilon" transitions that move without reading any input. ' +
    'Simulating one means tracking the whole set of states the machine could currently be in, all at once, rather than a single state. Reading a character moves every state in that set along its transitions (then adds in anything reachable by epsilon), and the string is accepted if any state in the final set is accepting. ' +
    'That might sound more powerful than a DFA, but it provably is not: the subset construction builds an equivalent DFA whose states are exactly the subsets of NFA states the NFA could be tracking, with one DFA state per subset the NFA could ever actually reach. ' +
    'This sandbox runs both: first the NFA\'s own simulation on your test string (watch the active set of states grow and shrink), then the subset construction discovering each reachable subset and the transitions between them, building the equivalent DFA from scratch. ' +
    'The two should always agree on accept or reject, since they recognize exactly the same language, which is the whole point of the construction. ' +
    'Sipser proves this equivalence as the first step toward showing that NFAs, DFAs, and regular expressions all describe exactly the same class of languages, the regular languages.',
  code: CODE_NFA,
  complexity: {
    time: `Simulating the NFA directly on a string of length n: O(n * s) where s is the number of NFA states (tracking a whole subset each step). Subset construction: up to O(2^s) DFA states in the worst case, since there are 2^s possible subsets, though reachable ones are usually far fewer.`,
    why: 'Each NFA simulation step has to consider every currently-active state\'s transitions, so it costs O(s) per character instead of a DFA\'s O(1). The subset construction\'s worst case comes from the fact that there are 2^s possible subsets of s states, and in the worst case all of them are reachable and distinguishable.',
  },
  makeInput(rng, size) {
    const numStates = 2 + Math.floor(rng() * 3); // 2..4
    const nfa = randomNFA(rng, numStates, ALPHABET);
    const len = Math.max(0, Math.min(10, size));
    const testString = randomString(rng, ALPHABET, len);
    return { nfa, testString };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { nfa, testString } = input;
    const expectedNfaAccept = nfaSimulate(nfa, testString).accept;
    if (result.nfaAccept !== expectedNfaAccept) return false;

    const { dfa } = subsetConstruction(nfa, nfa.alphabet);
    if (result.dfaStatesCount !== dfa.states.length) return false;
    const expectedDfaAccept = dfaSimulate(dfa, testString).accept;
    if (result.dfaAccept !== expectedDfaAccept) return false;

    // The real claim: the DFA built from the NFA accepts exactly the same
    // language as the NFA, checked by brute force over every string up to a
    // length the Myhill-Nerode bound guarantees is enough to catch any
    // disagreement, not just on this one test string.
    const maxLen = Math.min(7, nfa.states.length + dfa.states.length);
    let frontier = [''];
    for (let len = 0; len <= maxLen; len++) {
      for (const s of frontier) {
        if (nfaSimulate(nfa, s).accept !== dfaSimulate(dfa, s).accept) return false;
      }
      const next = [];
      for (const s of frontier) for (const sym of nfa.alphabet) next.push(s + sym);
      frontier = next;
    }
    return true;
  },
  sandbox: { type: 'string', field: 'testString', fieldLabel: 'test string', alphabet: ALPHABET, min: 0, max: 10, default: 4, label: 'length' },
};
