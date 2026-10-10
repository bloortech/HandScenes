// Thompson's construction: turns a regular expression into an NFA by
// building one small fragment per piece of the expression (a literal, a
// concatenation, a union, a star) and gluing the fragments together with
// epsilon transitions. No DOM access.
import { parseRegex, thompson, regexMatches, nfaSimulate, EPS } from '../engine/automaton.js';
import { layoutCircle } from '../engine/layout.js';

const ALPHABET = ['a', 'b'];
const CODE = [
  'thompson(regex):',
  '  literal "c": one edge, start --c--> accept',
  '  r1 r2 (concat): glue r1.accept --eps--> r2.start',
  '  r1|r2 (union): new start/accept, eps-branch into each, eps-join out',
  '  r* (star): eps around the fragment (0 times) and eps back into it (repeat)',
];

function framesFor(nfa, builtNodes, builtEdges, posById, activeIds, caption, line) {
  const nodes = [...builtNodes].map((id) => ({
    id,
    label: String(id),
    x: posById.get(id).x,
    y: posById.get(id).y,
    active: activeIds.includes(id),
    accept: nfa.accept.has(id),
    start: id === nfa.start,
  }));
  const edges = builtEdges.map((e) => [e.from, e.to, e.sym === EPS ? 'ε' : e.sym]);
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function* runThompson(ast, regex) {
  const { nfa, edges } = thompson(ast);
  const laidOut = nfa.states.map((s) => ({ id: s }));
  layoutCircle(laidOut);
  const posById = new Map(laidOut.map((n) => [n.id, n]));

  // Show every state's final position up front (dimmed, unconnected), so
  // the diagram is never blank; edges (the actual construction) are
  // revealed one at a time below.
  const builtNodes = new Set(nfa.states);
  const builtEdges = [];
  yield framesFor(nfa, builtNodes, builtEdges, posById, [], `Building an NFA from the regex "${regex || '(empty)'}" with Thompson's construction: ${nfa.states.length} states total, one fragment per piece of the expression, glued with epsilon transitions.`, 0);
  for (const e of edges) {
    builtNodes.add(e.from);
    builtNodes.add(e.to);
    builtEdges.push(e);
    const label = e.sym === EPS ? 'epsilon' : `'${e.sym}'`;
    yield framesFor(nfa, builtNodes, builtEdges, posById, [e.from, e.to], `Add a ${label} transition from state ${e.from} to state ${e.to}.`, e.sym === EPS ? 2 : 1);
  }
  yield framesFor(nfa, builtNodes, builtEdges, posById, [], `Finished: ${nfa.states.length} states, start = ${nfa.start}, accept = ${[...nfa.accept].join(', ')}.`, 0);
  return nfa;
}

function enumerateStrings(alphabet, maxLen) {
  let frontier = [''];
  const all = [...frontier];
  for (let len = 1; len <= maxLen; len++) {
    const next = [];
    for (const s of frontier) for (const sym of alphabet) next.push(s + sym);
    all.push(...next);
    frontier = next;
  }
  return all;
}

function* run(input) {
  const { regex } = input;
  let ast;
  try {
    ast = parseRegex(regex);
  } catch (e) {
    yield { kind: 'boxes', line: 0, code: CODE, caption: `"${regex}" is not a valid regex over {a, b} with |, *, +, ?, (, ): ${e.message}`, nodes: [], edges: [], pointers: [] };
    return { regex, error: true };
  }
  const nfa = yield* runThompson(ast, regex);
  const sample = enumerateStrings(ALPHABET, 4).map((s) => [s, nfaSimulate(nfa, s).accept]);
  return { regex, stateCount: nfa.states.length, sample };
}

export default {
  id: 'regex-nfa',
  title: 'Regular expressions to NFAs',
  module: 'm03',
  course: 'CSC236/240',
  clrs: '(Sipser: Regular Expressions, the proof that regexes and finite automata describe the same languages)',
  summary:
    'Thompson\'s construction turns any regular expression into an NFA that accepts exactly the strings the expression matches, built recursively, one small fragment at a time. ' +
    'A single letter becomes a two-state fragment with one edge. Concatenation glues one fragment\'s accept state to the next fragment\'s start state with a free epsilon move. Union builds a new start and accept state with epsilon branches fanning out to each alternative and back in. Star wraps a fragment in epsilon edges that let it be skipped entirely or repeated any number of times. ' +
    'Every one of those gluing steps only ever adds epsilon transitions and never touches the fragments\' own internal edges, which is exactly why the construction composes correctly no matter how deeply the expression is nested. ' +
    'This sandbox lets you type a regex over {a, b} (literals, "|" for union, "*" "+" "?" for repetition, and parentheses for grouping) and watch the NFA grow fragment by fragment. ' +
    'Sipser uses this construction as the "regex implies NFA" direction of the proof that regular expressions, NFAs, and DFAs all capture exactly the regular languages.',
  code: CODE,
  complexity: {
    time: 'Building the NFA takes O(m) time and produces O(m) states, where m is the length of the regex.',
    why: 'Each piece of the regex (each literal, and each operator) contributes a constant number of new states and edges, so the whole construction is linear in how long the expression is, regardless of what it matches.',
  },
  makeInput(rng, size) {
    const depth = Math.max(1, Math.min(4, Math.floor(size / 3) + 1));
    function gen(d) {
      if (d <= 0) return ALPHABET[Math.floor(rng() * ALPHABET.length)];
      const r = rng();
      if (r < 0.3) return gen(d - 1) + gen(d - 1);
      if (r < 0.5) return `(${gen(d - 1)}|${gen(d - 1)})`;
      if (r < 0.7) return `(${gen(d - 1)})*`;
      if (r < 0.85) return `(${gen(d - 1)})+`;
      if (r < 0.95) return `(${gen(d - 1)})?`;
      return ALPHABET[Math.floor(rng() * ALPHABET.length)];
    }
    return { regex: gen(depth) };
  },
  run,
  check(input, result) {
    if (!result || result.regex !== input.regex) return false;
    let ast;
    try {
      ast = parseRegex(input.regex);
    } catch (e) {
      return !!result.error;
    }
    if (result.error) return false;
    const { nfa } = thompson(ast);
    if (result.stateCount !== nfa.states.length) return false;
    // Cross-check two independent ways of deciding membership (a backtracking
    // matcher over the AST, and simulating the Thompson-built NFA) against
    // every string up to a fixed length, not just the handful run() sampled.
    for (const s of enumerateStrings(ALPHABET, 6)) {
      if (regexMatches(ast, s) !== nfaSimulate(nfa, s).accept) return false;
    }
    // result.sample itself should also agree with a fresh NFA simulation.
    for (const [s, accept] of result.sample) {
      if (nfaSimulate(nfa, s).accept !== accept) return false;
    }
    return true;
  },
  sandbox: { type: 'string', field: 'regex', fieldLabel: 'regex', alphabet: ALPHABET.concat(['|', '*', '+', '?', '(', ')']), min: 0, max: 9, default: 3, label: 'complexity' },
};
