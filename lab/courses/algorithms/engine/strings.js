// Pure string-matching helpers shared by naive-string-match, rabin-karp, kmp
// and string-automaton (CLRS: String Matching). No DOM access, like
// automaton.js/graph.js. A "match" is the starting index (0-based) of an
// occurrence of `pattern` inside `text`.

import { randInt } from './rng.js';

// The textbook-definition reference: every starting index s such that
// text.slice(s, s + pattern.length) === pattern. Used independently by
// every topic's check() so a bug in one topic's clever algorithm can't also
// be baked into its own correctness check.
export function bruteForceMatches(text, pattern) {
  const matches = [];
  const n = text.length, m = pattern.length;
  if (m === 0 || m > n) return matches;
  for (let s = 0; s <= n - m; s++) {
    let ok = true;
    for (let j = 0; j < m; j++) {
      if (text[s + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) matches.push(s);
  }
  return matches;
}

// Picks a random pattern and a random text that is built to contain the
// pattern some of the time (half the time embedded at a random offset,
// otherwise the text is just random), so matches aren't vanishingly rare in
// the test suite or the sandbox.
export function randomTextAndPattern(rng, alphabet, textLen, patternLen) {
  const pLen = Math.max(1, Math.min(patternLen, Math.max(1, textLen)));
  let pattern = '';
  for (let i = 0; i < pLen; i++) pattern += alphabet[randInt(rng, 0, alphabet.length - 1)];

  let text = '';
  for (let i = 0; i < textLen; i++) text += alphabet[randInt(rng, 0, alphabet.length - 1)];

  if (textLen >= pLen && rng() < 0.6) {
    const offset = randInt(rng, 0, textLen - pLen);
    text = text.slice(0, offset) + pattern + text.slice(offset + pLen);
  }
  return { text, pattern };
}

// CLRS 32.4's prefix function: pi[q] is the length of the longest proper
// prefix of pattern[0..q] that is also a suffix of it. The backbone of both
// KMP matching and the string-matching automaton's transition table.
export function computePrefixFunction(pattern) {
  const m = pattern.length;
  const pi = Array(m).fill(0);
  let k = 0;
  for (let q = 1; q < m; q++) {
    while (k > 0 && pattern[k] !== pattern[q]) k = pi[k - 1];
    if (pattern[k] === pattern[q]) k++;
    pi[q] = k;
  }
  return pi;
}

// CLRS 32.4's COMPUTE-TRANSITION-FUNCTION: delta[q][a] for every state
// 0..m (m = pattern.length) and every symbol a in alphabet, built directly
// from the definition (the length of the longest prefix of pattern that is
// a suffix of pattern[0..q-1]+a), without needing the prefix function at
// all (this is the O(m^3 |alphabet|) naive construction CLRS presents
// first; small enough for every pattern this sandbox ever builds).
export function buildMatchingAutomaton(pattern, alphabet) {
  const m = pattern.length;
  const delta = [];
  for (let q = 0; q <= m; q++) {
    const row = {};
    for (const a of alphabet) {
      let k = Math.min(m, q + 1);
      const candidate = pattern.slice(0, q) + a;
      while (k > 0 && !isSuffix(candidate, pattern.slice(0, k))) k--;
      row[a] = k;
    }
    delta.push(row);
  }
  return { m, alphabet, delta };
}

// Shared frame builder for naive-string-match, rabin-karp and kmp: draws
// the text as a row of boxes and the pattern as a second row of boxes
// slid under it at the current shift, reusing the engine's 'boxes'
// renderer (DOM-facing code lives in the renderer; this just produces the
// plain-object description). `textMarks`/`patternMarks` are
// `{ [index]: 'compare' | 'active' }` (compare = cyan pulse, active =
// amber, for a confirmed match).
export function stringMatchFrame({ text, pattern, shift, textMarks = {}, patternMarks = {}, caption, line, code }) {
  const n = Math.max(text.length, 1);
  const cellW = Math.min(9, 88 / n);
  const xAt = (i) => 5 + (i + 0.5) * (88 / n);
  const nodes = [];
  for (let i = 0; i < text.length; i++) {
    const mark = textMarks[i];
    nodes.push({ id: `t${i}`, label: text[i], x: xAt(i), y: 22, w: cellW, h: 16, compare: mark === 'compare', active: mark === 'active' });
  }
  if (shift != null) {
    for (let j = 0; j < pattern.length; j++) {
      const mark = patternMarks[j];
      nodes.push({ id: `p${j}`, label: pattern[j], x: xAt(shift + j), y: 50, w: cellW, h: 16, compare: mark === 'compare', active: mark === 'active' });
    }
  }
  return { kind: 'boxes', code, line, caption, nodes, edges: [], emptyText: '(empty text)' };
}

function isSuffix(s, suf) {
  if (suf.length > s.length) return false;
  return s.slice(s.length - suf.length) === suf;
}
