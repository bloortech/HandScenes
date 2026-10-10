// Pure automata logic shared by dfa, nfa-subset, regex-nfa, dfa-minimise and
// pumping-lemma: DFA/NFA simulation, epsilon closures, subset construction,
// a tiny regex parser + Thompson's construction, an independent backtracking
// regex matcher (used to check Thompson's construction from a second,
// unrelated direction), and DFA minimisation by partition refinement
// (Moore's algorithm). No DOM access, like rng.js and bintree.js.

export const EPS = 'ε';

// --- DFA ---------------------------------------------------------------
// A dfa is { states: [...ids], alphabet: [...symbols], start, accept: Set,
// delta: Map(`${state}|${sym}` -> state) }. Total: delta.get(...) returning
// undefined means "no transition" (used only transiently while building a
// DFA from subset construction; every DFA a topic hands to a user is total).

export function dfaStep(dfa, state, sym) {
  const key = `${state}|${sym}`;
  return dfa.delta.has(key) ? dfa.delta.get(key) : null;
}

export function dfaSimulate(dfa, str) {
  let state = dfa.start;
  const path = [state];
  for (const ch of str) {
    state = dfaStep(dfa, state, ch);
    path.push(state);
    if (state == null) break;
  }
  const accept = state != null && dfa.accept.has(state);
  return { path, accept };
}

// --- NFA -----------------------------------------------------------------
// An nfa is { states, alphabet, start, accept: Set, delta: Map(`${state}|${sym}`
// -> Set(states)) }, where `sym` can be EPS.

export function epsilonClosure(nfa, states) {
  const stack = [...states];
  const result = new Set(states);
  while (stack.length) {
    const s = stack.pop();
    const targets = nfa.delta.get(`${s}|${EPS}`);
    if (targets) {
      for (const t of targets) {
        if (!result.has(t)) { result.add(t); stack.push(t); }
      }
    }
  }
  return result;
}

export function nfaMove(nfa, states, sym) {
  const out = new Set();
  for (const s of states) {
    const targets = nfa.delta.get(`${s}|${sym}`);
    if (targets) for (const t of targets) out.add(t);
  }
  return out;
}

export function nfaSimulate(nfa, str) {
  let current = epsilonClosure(nfa, new Set([nfa.start]));
  const path = [current];
  for (const ch of str) {
    current = epsilonClosure(nfa, nfaMove(nfa, current, ch));
    path.push(current);
  }
  const accept = [...current].some((s) => nfa.accept.has(s));
  return { path, accept };
}

function setKey(set) {
  if (set.size === 0) return '∅'; // the empty/"dead" subset
  return [...set].sort((a, b) => a - b).join(',');
}

// Subset construction: turns an NFA (with epsilon transitions allowed) into
// an equivalent, total DFA whose states are subsets of NFA states. Returns
// the dfa plus bookkeeping (`stateSets`: key -> Set of NFA states it stands
// for, `steps`: the order states/transitions were discovered in, for the
// animation) so a topic can show its work.
export function subsetConstruction(nfa, alphabet) {
  const startSet = epsilonClosure(nfa, new Set([nfa.start]));
  const startKey = setKey(startSet);
  const stateSets = new Map([[startKey, startSet]]);
  const delta = new Map();
  const steps = [];
  const queue = [startKey];
  const seen = new Set([startKey]);
  while (queue.length) {
    const key = queue.shift();
    const set = stateSets.get(key);
    for (const sym of alphabet) {
      const moved = epsilonClosure(nfa, nfaMove(nfa, set, sym));
      const mkey = setKey(moved);
      if (!stateSets.has(mkey)) stateSets.set(mkey, moved);
      delta.set(`${key}|${sym}`, mkey);
      steps.push({ fromKey: key, sym, toKey: mkey });
      if (!seen.has(mkey)) { seen.add(mkey); queue.push(mkey); }
    }
  }
  const states = [...stateSets.keys()];
  const accept = new Set(states.filter((k) => [...stateSets.get(k)].some((s) => nfa.accept.has(s))));
  return { dfa: { states, alphabet, start: startKey, accept, delta }, stateSets, steps };
}

// --- DFA minimisation (Moore's algorithm): drop unreachable states, then
// repeatedly refine a partition of states by "same accept status and same
// partition-block for every symbol's next state" until it stops changing.
export function minimizeDFA(dfa) {
  const reachable = new Set([dfa.start]);
  const rq = [dfa.start];
  while (rq.length) {
    const s = rq.shift();
    for (const sym of dfa.alphabet) {
      const t = dfa.delta.get(`${s}|${sym}`);
      if (t != null && !reachable.has(t)) { reachable.add(t); rq.push(t); }
    }
  }
  const states = dfa.states.filter((s) => reachable.has(s));

  let partition = [states.filter((s) => dfa.accept.has(s)), states.filter((s) => !dfa.accept.has(s))].filter(
    (g) => g.length > 0
  );
  const steps = [partition.map((g) => g.slice())];
  let changed = true;
  while (changed) {
    changed = false;
    const groupOf = new Map();
    partition.forEach((g, i) => g.forEach((s) => groupOf.set(s, i)));
    const newPartition = [];
    for (const group of partition) {
      const buckets = new Map();
      for (const s of group) {
        const sig = dfa.alphabet
          .map((sym) => {
            const t = dfa.delta.get(`${s}|${sym}`);
            return t == null ? -1 : groupOf.get(t);
          })
          .join(',');
        if (!buckets.has(sig)) buckets.set(sig, []);
        buckets.get(sig).push(s);
      }
      if (buckets.size > 1) changed = true;
      for (const b of buckets.values()) newPartition.push(b);
    }
    partition = newPartition;
    steps.push(partition.map((g) => g.slice()));
  }

  const groupOf = new Map();
  partition.forEach((g, i) => g.forEach((s) => groupOf.set(s, i)));
  const newStates = partition.map((_, i) => i);
  const newStart = groupOf.get(dfa.start);
  const newAccept = new Set(partition.map((g, i) => (dfa.accept.has(g[0]) ? i : -1)).filter((i) => i >= 0));
  const newDelta = new Map();
  partition.forEach((g, i) => {
    for (const sym of dfa.alphabet) {
      const t = dfa.delta.get(`${g[0]}|${sym}`);
      if (t != null) newDelta.set(`${i}|${sym}`, groupOf.get(t));
    }
  });
  return {
    dfa: { states: newStates, alphabet: dfa.alphabet, start: newStart, accept: newAccept, delta: newDelta },
    partition,
    steps,
  };
}

// Brute-force check that two total DFAs over the same alphabet accept the
// same language, by trying every string up to maxLen. The Myhill-Nerode
// theorem says two DFAs with n1/n2 states that disagree must disagree on
// some string shorter than n1+n2, so maxLen = states1+states2 is enough to
// be a real proof, not just a spot check, for the small DFAs this course
// builds.
export function dfaLanguagesEqual(dfa1, dfa2, alphabet, maxLen) {
  let frontier = [''];
  for (let len = 0; len <= maxLen; len++) {
    for (const str of frontier) {
      if (dfaSimulate(dfa1, str).accept !== dfaSimulate(dfa2, str).accept) return false;
    }
    const next = [];
    for (const str of frontier) {
      for (const sym of alphabet) next.push(str + sym);
    }
    frontier = next;
  }
  return true;
}

// --- Tiny regex parser: literals over a given alphabet, `|` union, implicit
// concatenation, `*` `+` `?`, and parentheses. Grammar:
//   expr   := term ('|' term)*
//   term   := factor*            (empty term allowed, matches "")
//   factor := atom ('*' | '+' | '?')?
//   atom   := letter | '(' expr ')'
export function parseRegex(src) {
  let i = 0;
  const peek = () => src[i];
  const eat = (c) => {
    if (src[i] !== c) throw new Error(`regex: expected "${c}" at position ${i} in "${src}"`);
    i++;
  };

  function parseExpr() {
    let node = parseTerm();
    while (i < src.length && peek() === '|') {
      eat('|');
      node = { type: 'union', left: node, right: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = null;
    while (i < src.length && peek() !== '|' && peek() !== ')') {
      const f = parseFactor();
      node = node ? { type: 'concat', left: node, right: f } : f;
    }
    return node || { type: 'empty' };
  }
  function parseFactor() {
    let node = parseAtom();
    while (i < src.length && (peek() === '*' || peek() === '+' || peek() === '?')) {
      const op = peek();
      i++;
      node = { type: op === '*' ? 'star' : op === '+' ? 'plus' : 'opt', inner: node };
    }
    return node;
  }
  function parseAtom() {
    if (peek() === '(') {
      eat('(');
      const node = parseExpr();
      eat(')');
      return node;
    }
    const ch = peek();
    if (ch == null || ch === '*' || ch === '+' || ch === '?' || ch === '|' || ch === ')') {
      throw new Error(`regex: unexpected character at position ${i} in "${src}"`);
    }
    i++;
    return { type: 'lit', ch };
  }

  const result = src.length === 0 ? { type: 'empty' } : parseExpr();
  if (i !== src.length) throw new Error(`regex: unexpected trailing input at ${i} in "${src}"`);
  return result;
}

// Thompson's construction: builds an NFA fragment per AST node, gluing
// fragments together with epsilon transitions exactly as CLRS/Sipser
// describe it. Returns the finished NFA plus the raw edge list (for the
// step-by-step animation).
export function thompson(ast) {
  let id = 0;
  const nextId = () => id++;
  const edges = [];

  function build(node) {
    switch (node.type) {
      case 'empty': {
        const s = nextId(), a = nextId();
        edges.push({ from: s, to: a, sym: EPS });
        return { start: s, accept: a };
      }
      case 'lit': {
        const s = nextId(), a = nextId();
        edges.push({ from: s, to: a, sym: node.ch });
        return { start: s, accept: a };
      }
      case 'concat': {
        const l = build(node.left), r = build(node.right);
        edges.push({ from: l.accept, to: r.start, sym: EPS });
        return { start: l.start, accept: r.accept };
      }
      case 'union': {
        const l = build(node.left), r = build(node.right);
        const s = nextId(), a = nextId();
        edges.push({ from: s, to: l.start, sym: EPS });
        edges.push({ from: s, to: r.start, sym: EPS });
        edges.push({ from: l.accept, to: a, sym: EPS });
        edges.push({ from: r.accept, to: a, sym: EPS });
        return { start: s, accept: a };
      }
      case 'star': {
        const inner = build(node.inner);
        const s = nextId(), a = nextId();
        edges.push({ from: s, to: inner.start, sym: EPS });
        edges.push({ from: inner.accept, to: inner.start, sym: EPS });
        edges.push({ from: inner.accept, to: a, sym: EPS });
        edges.push({ from: s, to: a, sym: EPS });
        return { start: s, accept: a };
      }
      case 'plus': {
        const inner = build(node.inner);
        const a = nextId();
        edges.push({ from: inner.accept, to: inner.start, sym: EPS });
        edges.push({ from: inner.accept, to: a, sym: EPS });
        return { start: inner.start, accept: a };
      }
      case 'opt': {
        // Same shape as star, minus the loop-back edge: a fresh start/accept
        // pair, so the "skip entirely" epsilon edge is only reachable once,
        // at the true entry point. (Reusing inner.start/inner.accept here,
        // as an earlier version of this did, is wrong whenever inner itself
        // loops back through its own start, e.g. `(a+)?`: the skip edge
        // would then be reachable again after every repetition, letting
        // the construction bypass whatever comes after the `?` group.)
        const inner = build(node.inner);
        const s = nextId(), a = nextId();
        edges.push({ from: s, to: inner.start, sym: EPS });
        edges.push({ from: s, to: a, sym: EPS });
        edges.push({ from: inner.accept, to: a, sym: EPS });
        return { start: s, accept: a };
      }
      default:
        throw new Error(`thompson: unknown node type ${node.type}`);
    }
  }

  const frag = build(ast);
  const statesSet = new Set([frag.start, frag.accept]);
  for (const e of edges) { statesSet.add(e.from); statesSet.add(e.to); }
  const delta = new Map();
  for (const e of edges) {
    const key = `${e.from}|${e.sym}`;
    if (!delta.has(key)) delta.set(key, new Set());
    delta.get(key).add(e.to);
  }
  const alphabet = [...new Set(edges.map((e) => e.sym).filter((s) => s !== EPS))].sort();
  const nfa = { states: [...statesSet].sort((a, b) => a - b), alphabet, start: frag.start, accept: new Set([frag.accept]), delta };
  return { nfa, edges, frag };
}

// An independent backtracking matcher over the same AST, used only to check
// Thompson's construction + NFA simulation from an unrelated direction
// (continuation-passing so `concat`/`star` compose correctly on a whole
// string, not just a prefix).
export function regexMatches(ast, str) {
  function go(node, s, cont) {
    switch (node.type) {
      case 'empty':
        return cont(s);
      case 'lit':
        return s.length > 0 && s[0] === node.ch && cont(s.slice(1));
      case 'concat':
        return go(node.left, s, (rest) => go(node.right, rest, cont));
      case 'union':
        return go(node.left, s, cont) || go(node.right, s, cont);
      case 'star':
        if (cont(s)) return true;
        return go(node.inner, s, (rest) => rest.length < s.length && go(node, rest, cont));
      case 'plus':
        return go(node.inner, s, (rest) => cont(rest) || (rest.length < s.length && go({ type: 'star', inner: node.inner }, rest, cont)));
      case 'opt':
        return cont(s) || go(node.inner, s, cont);
      default:
        throw new Error(`regexMatches: unknown node type ${node.type}`);
    }
  }
  return go(ast, str, (rest) => rest.length === 0);
}

// --- Random generation (used by makeInput) --------------------------------

// A random, total DFA: every (state, symbol) pair has a transition.
export function randomDFA(rng, numStates, alphabet) {
  const states = Array.from({ length: Math.max(1, numStates) }, (_, i) => i);
  const delta = new Map();
  for (const s of states) {
    for (const sym of alphabet) {
      delta.set(`${s}|${sym}`, Math.floor(rng() * states.length));
    }
  }
  const accept = new Set(states.filter(() => rng() < 0.4));
  if (accept.size === 0) accept.add(states[states.length - 1]);
  return { states, alphabet, start: 0, accept, delta };
}

// A random NFA: 1-2 transitions per (state, symbol), plus a chance of an
// epsilon edge to another state, so it is genuinely nondeterministic.
export function randomNFA(rng, numStates, alphabet) {
  const states = Array.from({ length: Math.max(1, numStates) }, (_, i) => i);
  const delta = new Map();
  const addEdge = (from, sym, to) => {
    const key = `${from}|${sym}`;
    if (!delta.has(key)) delta.set(key, new Set());
    delta.get(key).add(to);
  };
  for (const s of states) {
    for (const sym of alphabet) {
      addEdge(s, sym, Math.floor(rng() * states.length));
      if (rng() < 0.35) addEdge(s, sym, Math.floor(rng() * states.length));
    }
    if (states.length > 1 && rng() < 0.3) {
      let t = Math.floor(rng() * states.length);
      if (t !== s) addEdge(s, EPS, t);
    }
  }
  const accept = new Set(states.filter(() => rng() < 0.4));
  if (accept.size === 0) accept.add(states[states.length - 1]);
  return { states, alphabet, start: 0, accept, delta };
}

export function randomString(rng, alphabet, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}
