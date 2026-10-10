// Turing machine engine shared by turing-machine, multitape, halting-problem,
// decidability-map, rice-theorem and mapping-reductions (m10): parses a
// transition table written as short text lines, steps a one-tape machine,
// and simulates it to completion with a step bound plus exact-configuration
// cycle detection (if the same (state, tape, head) triple repeats, the
// machine is deterministic, so it is PROVABLY going to loop forever: this is
// a genuinely decidable fact about bounded instances, not a guess). No DOM
// access, like automaton.js and bintree.js.

export const BLANK = '_';
export const ACCEPT = 'qaccept';
export const REJECT = 'qreject';

// Each rule line is: state,symbol => write,move,nextState
// e.g. "q0,0 => 0,R,q0". Blank lines and lines starting with # are skipped.
const RULE_RE = /^([^\s,]+)\s*,\s*([^\s,]+)\s*(?:=>|->)\s*([^\s,]+)\s*,\s*([LRS])\s*,\s*([^\s,]+)$/i;

export function parseRules(text) {
  const rules = new Map();
  const errors = [];
  const lines = String(text || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(RULE_RE);
    if (!m) { errors.push(line); continue; }
    const [, state, sym, write, move, next] = m;
    rules.set(`${state}|${sym}`, { write, move: move.toUpperCase(), next });
  }
  return { rules, errors };
}

export function rulesToText(ruleList) {
  // ruleList: [{ state, sym, write, move, next }]
  return ruleList.map((r) => `${r.state},${r.sym} => ${r.write},${r.move},${r.next}`).join('\n');
}

function configKey(state, tape, head) {
  return `${state}|${head}|${tape.join('')}`;
}

// Advance one step. Returns null if there is no matching rule (the machine
// is "stuck": in this engine that counts as a halt-and-reject, the usual
// convention for a transition function that is not total).
export function step(rules, state, tape, head, blank = BLANK) {
  const sym = tape[head] ?? blank;
  const rule = rules.get(`${state}|${sym}`);
  if (!rule) return null;
  const newTape = tape.slice();
  newTape[head] = rule.write === '_' ? blank : rule.write;
  let newHead = head;
  if (rule.move === 'R') newHead = head + 1;
  else if (rule.move === 'L') newHead = head - 1;
  if (newHead < 0) { newTape.unshift(blank); newHead = 0; }
  if (newHead >= newTape.length) newTape.push(blank);
  return { state: rule.next, tape: newTape, head: newHead };
}

// Simulate from a start configuration. Returns:
//   { accept, halted, looped, steps, history }
// where `history` is a list of { state, tape, head } snapshots (including
// the starting one), capped at maxSteps + 1 entries. `looped` is true only
// when an exact repeated configuration was observed (a provable infinite
// loop, not a timeout); `halted` false with `looped` false means the step
// bound ran out without enough evidence either way.
export function simulate(rules, {
  start = 'q0',
  accept = ACCEPT,
  reject = REJECT,
  tape = [],
  maxSteps = 500,
  blank = BLANK,
} = {}) {
  let state = start;
  let cur = tape.length ? tape.slice() : [blank];
  let head = 0;
  const history = [{ state, tape: cur.slice(), head }];
  const seen = new Set([configKey(state, cur, head)]);

  for (let i = 0; i < maxSteps; i++) {
    if (state === accept) return { accept: true, halted: true, looped: false, steps: i, history };
    if (state === reject) return { accept: false, halted: true, looped: false, steps: i, history };
    const next = step(rules, state, cur, head, blank);
    if (!next) return { accept: false, halted: true, looped: false, steps: i, history, stuck: true };
    state = next.state; cur = next.tape; head = next.head;
    history.push({ state, tape: cur.slice(), head });
    const key = configKey(state, cur, head);
    if (seen.has(key)) return { accept: false, halted: false, looped: true, steps: i + 1, history };
    seen.add(key);
  }
  if (state === accept) return { accept: true, halted: true, looped: false, steps: maxSteps, history };
  if (state === reject) return { accept: false, halted: true, looped: false, steps: maxSteps, history };
  return { accept: false, halted: false, looped: false, steps: maxSteps, history };
}

// Build a new rule set that behaves exactly like `rules` but, before doing
// anything else, overwrites the tape with the fixed literal string `w`
// (ignoring whatever input it is actually given) and then jumps into the
// original machine's start state. Used by the mapping-reductions topic: it
// is the standard "hardwire an input into a machine" construction behind
// several of Sipser's A_TM reductions (to E_TM, EQ_TM and others).
export function hardwireInput(rules, w, originalStart, { blank = BLANK } = {}) {
  const combined = new Map(rules);
  const n = w.length;
  for (let i = 0; i < n; i++) {
    const me = `w${i}`;
    // After the last character, rewind the head back to position 0 (where
    // the original machine expects to start) before continuing: see the
    // "r" states below.
    const next = i + 1 < n ? `w${i + 1}` : (n > 0 ? 'r0' : originalStart);
    // Overwrite whatever symbol is here with w[i], then move right, no
    // matter what the actual input tape held (both '0' and '1' and blank
    // are covered so this is total over a {0,1} alphabet plus blank).
    for (const sym of ['0', '1', blank]) {
      combined.set(`${me}|${sym}`, { write: w[i], move: 'R', next });
    }
  }
  // n leftward moves, from position n (just past the last written
  // character) back to position 0, without touching any symbol.
  for (let k = 0; k < n; k++) {
    const me = `r${k}`;
    const next = k + 1 < n ? `r${k + 1}` : originalStart;
    for (const sym of ['0', '1', blank]) {
      combined.set(`${me}|${sym}`, { write: sym, move: 'L', next });
    }
  }
  const writerStart = n > 0 ? 'w0' : originalStart;
  return { rules: combined, start: writerStart };
}
