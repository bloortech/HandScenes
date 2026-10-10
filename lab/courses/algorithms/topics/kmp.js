// Knuth-Morris-Pratt string matching: precompute the pattern's prefix
// function (how much overlap a mismatch can fall back on), then scan the
// text once, never re-examining a text character after it has matched.
// No DOM access. CLRS: String Matching (the prefix function and the KMP
// matcher).
import { randomTextAndPattern, bruteForceMatches, computePrefixFunction, stringMatchFrame } from '../engine/strings.js';

const ALPHABET = ['a', 'b', 'c'];
const CODE = [
  'pi = prefix function of pattern',
  '  // pi[q] = longest prefix of pattern[0..q] that is also a suffix',
  'q = 0   // number of characters currently matched',
  'for i from 0 to n-1:',
  '  while q > 0 and pattern[q] != text[i]: q = pi[q-1]   // fall back',
  '  if pattern[q] == text[i]: q += 1',
  '  if q == m: report a match ending at i; q = pi[q-1]',
];

function* run(input) {
  const { text, pattern } = input;
  const n = text.length, m = pattern.length;
  const matches = [];
  let comparisons = 0;

  const pi = computePrefixFunction(pattern);

  if (m === 0 || m > n) {
    yield stringMatchFrame({ text, pattern, shift: null, caption: m === 0 ? 'Empty pattern: nothing to match.' : `Pattern (length ${m}) is longer than the text (length ${n}): no shift fits.`, line: 0, code: CODE });
    return { matches, comparisons, pi };
  }

  yield stringMatchFrame({ text, pattern, shift: 0, caption: `Prefix function of "${pattern}": [${pi.join(', ')}]. This tells us, after a mismatch, how much of the match we can keep instead of starting over.`, line: 0, code: CODE });

  let q = 0;
  for (let i = 0; i < n; i++) {
    while (q > 0 && pattern[q] !== text[i]) {
      comparisons++;
      yield stringMatchFrame({ text, pattern, shift: i - q, textMarks: { [i]: 'compare' }, patternMarks: { [q]: 'compare' }, caption: `text[${i}] = '${text[i]}' doesn't extend the match (pattern[${q}] = '${pattern[q]}'). Fall back using pi: q = pi[${q - 1}] = ${pi[q - 1]}.`, line: 4, code: CODE });
      q = pi[q - 1];
    }
    comparisons++;
    if (pattern[q] === text[i]) {
      q++;
      yield stringMatchFrame({ text, pattern, shift: i - q + 1, textMarks: { [i]: 'compare' }, patternMarks: { [q - 1]: 'compare' }, caption: `text[${i}] = '${text[i]}' matches pattern[${q - 1}]. Matched length is now ${q}.`, line: 5, code: CODE });
    } else {
      yield stringMatchFrame({ text, pattern, shift: i - q, textMarks: { [i]: 'compare' }, caption: `text[${i}] = '${text[i]}' doesn't match pattern[0] either (q stays 0).`, line: 5, code: CODE });
    }
    if (q === m) {
      matches.push(i - m + 1);
      const marks = {};
      for (let k = 0; k < m; k++) marks[k] = 'active';
      yield stringMatchFrame({ text, pattern, shift: i - m + 1, patternMarks: marks, caption: `Matched the whole pattern, ending at text[${i}]: report a match at shift ${i - m + 1}.`, line: 6, code: CODE });
      q = pi[q - 1];
    }
  }

  yield stringMatchFrame({ text, pattern, shift: null, caption: `Done. ${matches.length} match${matches.length === 1 ? '' : 'es'} at shift${matches.length === 1 ? '' : 's'} [${matches.join(', ')}], using ${comparisons} character comparisons (never re-reading a text character once it has advanced q).`, line: 0, code: CODE });
  return { matches, comparisons, pi };
}

export default {
  id: 'kmp',
  title: 'Knuth-Morris-Pratt (KMP) string matching',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'String Matching',
  summary:
    'KMP fixes the naive matcher\'s wasted work by noticing that when a mismatch happens after matching q characters, the pattern itself already tells you how much of that partial match can be reused, without ever looking at the text again. ' +
    'That information is the prefix function pi: pi[q] is the length of the longest proper prefix of pattern[0..q] that is also a suffix of it, computed once from the pattern alone, in O(m) time, before scanning any text. ' +
    'While matching, a mismatch at matched-length q falls back to q = pi[q-1] and tries again, using the pattern\'s own self-overlap instead of sliding back to a fresh shift and re-comparing characters already known to match. ' +
    'The key invariant is that the text pointer i only ever moves forward: no text character is examined more than a bounded number of times, which is what makes the whole scan O(n) instead of the naive matcher\'s O(nm). ' +
    'Computing the prefix function is itself a smaller instance of the same idea applied to the pattern against itself, which is why this sandbox shows it as its own step before the match scan begins.',
  code: CODE,
  complexity: {
    time: 'O(n+m): O(m) to build the prefix function, O(n) to scan the text.',
    why: 'The prefix function computation is an amortised O(m): the inner while loop can run many times for one i, but each successful match step increases q by exactly 1 and the loop never increases q, so across the whole computation the total number of while-loop iterations is bounded by the total number of increments to q, which is at most m. The same amortised argument bounds the matching scan by O(n): i advances by exactly 1 each outer iteration, and the fallback steps are paid for by past increments of q, which can total at most n over the whole scan.',
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
    if (JSON.stringify(result.matches) !== JSON.stringify(expected)) return false;
    const expectedPi = computePrefixFunction(input.pattern);
    return JSON.stringify(result.pi) === JSON.stringify(expectedPi);
  },
  sandbox: { type: 'string', field: 'text', fieldLabel: 'text', alphabet: ALPHABET, min: 0, max: 20, default: 10, label: 'text length' },
};
