// Rabin-Karp string matching: instead of comparing characters at every
// shift, hash the pattern once and hash every length-m window of the text,
// then only bother comparing characters when the hashes match (a "spurious
// hit" is still checked character by character, so the algorithm is always
// correct, just usually fast). Each window's hash is computed from the
// previous one in O(1) (a rolling hash), which is what makes this
// different from just hashing every window from scratch. No DOM access.
// CLRS: String Matching (Rabin-Karp).
import { randomTextAndPattern, bruteForceMatches, stringMatchFrame } from '../engine/strings.js';

const ALPHABET = ['a', 'b', 'c'];
const RADIX = ALPHABET.length; // d in CLRS's notation
const MOD = 101; // q: a modest prime, big enough to make collisions occasional, not constant

const CODE = [
  'd = alphabet size, q = a prime modulus',
  'p = hash(pattern) mod q;  t0 = hash(text[0..m-1]) mod q',
  'h = d^(m-1) mod q          // weight of the leading digit',
  'for s from 0 to n-m:',
  '  if p == ts: verify character by character (hashes can collide)',
  '  ts+1 = (d*(ts - text[s]*h) + text[s+m]) mod q     // roll the window',
];

function codeOf(ch) { return ALPHABET.indexOf(ch); }

function hashOf(str) {
  let h = 0;
  for (const ch of str) h = (h * RADIX + codeOf(ch)) % MOD;
  return h;
}

function* run(input) {
  const { text, pattern } = input;
  const n = text.length, m = pattern.length;
  const matches = [];
  let hashChecks = 0, verifications = 0;

  if (m === 0 || m > n) {
    yield stringMatchFrame({ text, pattern, shift: null, caption: m === 0 ? 'Empty pattern: nothing to match.' : `Pattern (length ${m}) is longer than the text (length ${n}): no shift fits.`, line: 0, code: CODE });
    return { matches, hashChecks, verifications };
  }

  const p = hashOf(pattern);
  let h = 1;
  for (let i = 0; i < m - 1; i++) h = (h * RADIX) % MOD;

  let t = hashOf(text.slice(0, m));
  yield stringMatchFrame({ text, pattern, shift: 0, caption: `Pattern hash p = ${p}. Window 0's hash t0 = ${t}.`, line: 1, code: CODE });

  for (let s = 0; s <= n - m; s++) {
    hashChecks++;
    if (t === p) {
      let j = 0;
      while (j < m && text[s + j] === pattern[j]) j++;
      verifications++;
      if (j === m) {
        matches.push(s);
        const marks = {};
        for (let k = 0; k < m; k++) marks[k] = 'active';
        yield stringMatchFrame({ text, pattern, shift: s, patternMarks: marks, caption: `Shift ${s}: hash matches (${t} = ${p}) and every character checks out. Report a match.`, line: 4, code: CODE });
      } else {
        yield stringMatchFrame({ text, pattern, shift: s, textMarks: { [s + j]: 'compare' }, patternMarks: { [j]: 'compare' }, caption: `Shift ${s}: hash matched (${t} = ${p}) but character ${j} differs: a spurious hit, mod ${MOD} collided. Verify and move on.`, line: 4, code: CODE });
      }
    } else {
      yield stringMatchFrame({ text, pattern, shift: s, caption: `Shift ${s}: hash ${t} != pattern hash ${p}. Skip straight to the next shift, no character comparisons needed.`, line: 4, code: CODE });
    }
    if (s < n - m) {
      const outgoing = codeOf(text[s]);
      const incoming = codeOf(text[s + m]);
      t = (RADIX * (t - outgoing * h) + incoming) % MOD;
      if (t < 0) t += MOD;
      yield stringMatchFrame({ text, pattern, shift: s + 1, caption: `Roll the window: drop text[${s}] = '${text[s]}', add text[${s + m}] = '${text[s + m]}'. New hash t${s + 1} = ${t}.`, line: 6, code: CODE });
    }
  }

  yield stringMatchFrame({ text, pattern, shift: null, caption: `Done. ${matches.length} match${matches.length === 1 ? '' : 'es'} at shift${matches.length === 1 ? '' : 's'} [${matches.join(', ')}]: ${hashChecks} hash comparisons, ${verifications} character-by-character verification${verifications === 1 ? '' : 's'}.`, line: 0, code: CODE });
  return { matches, hashChecks, verifications };
}

export default {
  id: 'rabin-karp',
  title: 'Rabin-Karp string matching',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'String Matching',
  summary:
    'Rabin-Karp hashes the pattern once and compares that hash against a rolling hash of every length-m window of the text, instead of comparing characters at every shift. ' +
    'The trick that makes this cheap is that the hash of the next window can be computed from the current one in constant time: multiply by the alphabet size, subtract the outgoing character weighted by its position, and add the incoming one, all mod a prime q. ' +
    'A hash match does not prove a real match, since two different windows can collide mod q (a "spurious hit"), so Rabin-Karp always verifies character by character before reporting a match, which keeps it exactly as correct as the naive matcher. ' +
    'Its worst case is still O(nm) if q is chosen badly (every window collides, forcing a full verification every time), but for a random text and a reasonably large prime q, the expected number of spurious hits is small, giving O(n+m) expected time. ' +
    'This sandbox uses a small modulus (q=101) on purpose, so a spurious hit (hash matches but the characters do not) shows up now and then, as a reminder that the hash check alone is never enough.',
  code: CODE,
  complexity: {
    time: 'O(n+m) expected (with a well-chosen q), O(nm) worst case if every window collides mod q.',
    why: 'Computing p and rolling each window\'s hash is O(1) per shift after an O(m) setup, so O(n+m) total just for the hashing. Verification only costs real character comparisons when the hash matches; with q large relative to the number of windows, the expected number of spurious hits is small (a birthday-style argument over values mod q), keeping the expected total close to O(n+m). A small or unlucky q can make every window collide, falling back to the naive matcher\'s O(nm).',
  },
  makeInput(rng, size) {
    const textLen = Math.max(0, Math.min(20, size));
    const patternLen = 1 + Math.floor(rng() * 3);
    return randomTextAndPattern(rng, ALPHABET, textLen, patternLen);
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = bruteForceMatches(input.text, input.pattern);
    return JSON.stringify(result.matches) === JSON.stringify(expected);
  },
  sandbox: { type: 'string', field: 'text', fieldLabel: 'text', alphabet: ALPHABET, min: 0, max: 20, default: 10, label: 'text length' },
};
