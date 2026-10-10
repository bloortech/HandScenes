// Minimising a DFA: merge states that are provably equivalent (no string
// tells them apart) using Moore's partition-refinement algorithm, starting
// from an accept/non-accept split and refining until it stops changing. No
// DOM access.
import { randomDFA, dfaLanguagesEqual, minimizeDFA } from '../engine/automaton.js';
import { layoutCircle } from '../engine/layout.js';

const ALPHABET = ['a', 'b'];
const CODE = [
  'partition = { accepting states }, { non-accepting states }',
  'repeat:',
  '  split any group whose states disagree on some symbol',
  '    (i.e. land in different groups of the CURRENT partition)',
  'until no group splits',
  'merge each surviving group into one state of the minimal DFA',
];

// Pads a random DFA with duplicate states, so there is always something
// real to merge: each padded state copies an existing state's outgoing
// transitions and accept status exactly, making it provably equivalent to
// the state it copies (indistinguishable by any string).
function padWithDuplicates(dfa, rng, extra) {
  const states = dfa.states.slice();
  const delta = new Map(dfa.delta);
  const accept = new Set(dfa.accept);
  for (let i = 0; i < extra; i++) {
    const copyOf = states[Math.floor(rng() * dfa.states.length)];
    const newId = states.length + i + 1000; // disjoint from originals
    states.push(newId);
    if (accept.has(copyOf)) accept.add(newId);
    for (const sym of dfa.alphabet) delta.set(`${newId}|${sym}`, dfa.delta.get(`${copyOf}|${sym}`));
  }
  // Redirect a few random transitions to point at the duplicates instead of
  // their originals, so the duplicates are actually reachable (otherwise
  // minimisation would just drop them as unreachable, which is correct but
  // less interesting to watch).
  const dupIds = states.slice(dfa.states.length);
  for (const s of dfa.states) {
    for (const sym of dfa.alphabet) {
      if (dupIds.length && rng() < 0.3) {
        const target = delta.get(`${s}|${sym}`);
        const dup = dupIds.find((d) => states.indexOf(d) >= 0 && isEquivalentTarget(dfa, delta, target, d));
        if (dup != null) delta.set(`${s}|${sym}`, dup);
      }
    }
  }
  return { states, alphabet: dfa.alphabet, start: dfa.start, accept, delta };
}

function isEquivalentTarget(dfa, delta, originalTarget, dupId) {
  // dup's transitions must have been copied from originalTarget for this
  // redirect to stay a correct, language-preserving edit.
  for (const sym of dfa.alphabet) {
    if (delta.get(`${dupId}|${sym}`) !== delta.get(`${originalTarget}|${sym}`)) return false;
  }
  return dfa.accept.has(dupId) === dfa.accept.has(originalTarget);
}

function diagramEdges(dfa) {
  const edges = [];
  for (const [key, to] of dfa.delta) {
    const [from, sym] = key.split('|');
    edges.push([isNaN(Number(from)) ? from : Number(from), to, sym]);
  }
  return edges;
}

function frameFor(dfa, laidOut, edges, activeIds, caption, line) {
  const nodes = laidOut.map((n) => ({
    id: n.id,
    label: String(n.id),
    x: n.x,
    y: n.y,
    active: activeIds.includes(n.id),
    accept: dfa.accept.has(n.id),
    start: n.id === dfa.start,
  }));
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function* run(input) {
  const { dfa } = input;
  const laidOut = dfa.states.map((s) => ({ id: s }));
  layoutCircle(laidOut);
  const edges = diagramEdges(dfa);
  yield frameFor(dfa, laidOut, edges, [], `Starting DFA: ${dfa.states.length} states. Some may be equivalent (no string tells them apart).`, 0);

  const { dfa: minDfa, partition, steps } = minimizeDFA(dfa);
  for (let i = 0; i < steps.length; i++) {
    const groups = steps[i];
    const merging = groups.filter((g) => g.length > 1);
    const caption =
      i === 0
        ? `Start the partition with two groups: accepting states ${JSON.stringify(groups[0] || [])} and non-accepting states ${JSON.stringify(groups[1] || [])}.`
        : merging.length
          ? `Refine: group${merging.length === 1 ? '' : 's'} ${merging.map((g) => `{${g.join(',')}}`).join(', ')} still can't be told apart by any symbol, so they stay merged.`
          : 'No group splits further. The partition is stable.';
    yield frameFor(dfa, laidOut, edges, groups.flat(), caption, i === 0 ? 1 : 2);
  }

  const minLaidOut = minDfa.states.map((s) => ({ id: s }));
  layoutCircle(minLaidOut);
  const minEdges = diagramEdges(minDfa);
  yield frameFor(minDfa, minLaidOut, minEdges, [], `Minimised: ${minDfa.states.length} state${minDfa.states.length === 1 ? '' : 's'} (down from ${dfa.states.length}), each one a merged group of equivalent original states.`, 5);

  return { originalStates: dfa.states.length, minimisedStates: minDfa.states.length, partitionGroups: partition.length, minDfa };
}

export default {
  id: 'dfa-minimise',
  title: 'Minimising a DFA',
  module: 'm03',
  course: 'CSC236/240',
  clrs: '(Sipser: Myhill-Nerode / DFA minimisation, usually a course supplement to Regular Languages)',
  summary:
    'Two states of a DFA are equivalent if no string can ever tell them apart, meaning that starting from either one and feeding in the same string always gives the same accept/reject answer. ' +
    'A minimal DFA merges every group of equivalent states into one, which never changes the language the machine accepts, just how many states it takes to recognize it. ' +
    'Moore\'s algorithm finds those groups by starting with the coarsest possible split, accepting states versus non-accepting states, since those obviously differ (one set is accepting, the other isn\'t). ' +
    'Then it repeatedly checks whether every state in a group still agrees with the rest of its group on where each symbol sends it (specifically, which group that destination currently belongs to). The moment two states in the same group disagree, they get split apart. This repeats until nothing splits anymore: at that point, every surviving group really is a set of mutually indistinguishable states. ' +
    'This sandbox deliberately builds some duplicate, equivalent states into the starting DFA so there is always real merging to watch, then runs Moore\'s algorithm to shrink it back down.',
  code: CODE,
  complexity: {
    time: 'O(n^2 * |alphabet|) for this straightforward partition-refinement version (Hopcroft\'s algorithm improves it to O(n log n), but is considerably more intricate).',
    why: 'Each refinement pass looks at every state\'s transition on every symbol to decide which bucket it belongs in, and in the worst case the partition only grows by one group per pass, giving O(n) passes of O(n * |alphabet|) work each.',
  },
  makeInput(rng, size) {
    const numStates = 2 + Math.floor(rng() * 3); // 2..4
    const base = randomDFA(rng, numStates, ALPHABET);
    const extra = Math.max(0, Math.min(4, size));
    const dfa = padWithDuplicates(base, rng, extra);
    return { dfa };
  },
  run,
  check(input, result) {
    if (!result || !result.minDfa) return false;
    const { dfa } = input;
    const { minDfa } = result;
    if (result.originalStates !== dfa.states.length) return false;
    if (result.minimisedStates > dfa.states.length) return false;
    if (result.minimisedStates !== result.partitionGroups) return false;
    // The real claim: the minimised DFA accepts exactly the same language as
    // the original, checked by brute force over enough strings that the
    // Myhill-Nerode bound guarantees no disagreement could be hiding.
    return dfaLanguagesEqual(dfa, minDfa, ALPHABET, dfa.states.length + minDfa.states.length);
  },
  sandbox: { type: 'n', min: 0, max: 4, default: 2, label: 'duplicate states' },
};
