// Naive string matching: try every possible shift of the pattern against
// the text, left to right, and for each shift compare characters one by
// one until a mismatch or a full match. No DOM access. CLRS: String
// Matching (the naive algorithm NAIVE-STRING-MATCHER).
import { randomTextAndPattern, bruteForceMatches, stringMatchFrame } from '../engine/strings.js';

const ALPHABET = ['a', 'b', 'c'];
const CODE = [
  'for s from 0 to n-m:',
  '  j = 0',
  '  while j < m and text[s+j] == pattern[j]: j += 1',
  '  if j == m: report a match at shift s',
];

function* run(input) {
  const { text, pattern } = input;
  const n = text.length, m = pattern.length;
  const matches = [];
  let comparisons = 0;

  if (m === 0 || m > n) {
    yield stringMatchFrame({ text, pattern, shift: null, caption: m === 0 ? 'Empty pattern: nothing to match.' : `Pattern (length ${m}) is longer than the text (length ${n}): no shift fits.`, line: 0, code: CODE });
    return { matches, comparisons };
  }

  for (let s = 0; s <= n - m; s++) {
    let j = 0;
    while (j < m && text[s + j] === pattern[j]) {
      comparisons++;
      yield stringMatchFrame({ text, pattern, shift: s, textMarks: { [s + j]: 'compare' }, patternMarks: { [j]: 'compare' }, caption: `Shift ${s}: text[${s + j}] = '${text[s + j]}' matches pattern[${j}].`, line: 2, code: CODE });
      j++;
    }
    if (j < m) {
      comparisons++;
      yield stringMatchFrame({ text, pattern, shift: s, textMarks: { [s + j]: 'compare' }, patternMarks: { [j]: 'compare' }, caption: `Shift ${s}: mismatch at pattern[${j}]. Slide the pattern one position right.`, line: 2, code: CODE });
    } else {
      matches.push(s);
      const marks = {};
      for (let k = 0; k < m; k++) marks[k] = 'active';
      yield stringMatchFrame({ text, pattern, shift: s, patternMarks: marks, caption: `Shift ${s}: every character matched. Report a match here.`, line: 3, code: CODE });
    }
  }

  yield stringMatchFrame({ text, pattern, shift: null, caption: `Done. ${matches.length} match${matches.length === 1 ? '' : 'es'} found at shift${matches.length === 1 ? '' : 's'} [${matches.join(', ')}], using ${comparisons} character comparisons.`, line: 0, code: CODE });
  return { matches, comparisons };
}

export default {
  id: 'naive-string-match',
  title: 'Naive string matching',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'String Matching',
  summary:
    'The naive string matcher checks every possible shift s of the pattern against the text, comparing characters one at a time until either a mismatch stops it early or the whole pattern lines up. ' +
    'There are n-m+1 shifts to try (n the text length, m the pattern length), and each one can take up to m comparisons, so the worst case is O((n-m+1)m), which is O(nm) when m is a constant fraction of n. ' +
    'That worst case really happens: a text of all "a"s and a pattern of "a"s ending in "b" forces every shift to scan almost the whole pattern before failing. ' +
    'Despite that, the naive matcher is simple, uses no extra data structure, and in practice (on typical text, not adversarial text) its average-case behaviour is close to linear, since most mismatches happen in the first character or two. ' +
    'Rabin-Karp, KMP and the matching automaton (the next three topics) all exist to fix this same worst case in different ways: hashing whole windows at once, remembering overlap to avoid re-comparing, or precomputing every transition.',
  code: CODE,
  complexity: {
    time: 'O((n-m+1)m) worst case, where n = text length, m = pattern length.',
    why: 'There are n-m+1 shifts, and the inner while loop compares at most m characters per shift before a mismatch or a full match, so the total work is bounded by (n-m+1)*m. A pattern like "aaaab" against a text of all "a"s realizes that bound, since almost every shift gets all the way to the last character before failing.',
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
