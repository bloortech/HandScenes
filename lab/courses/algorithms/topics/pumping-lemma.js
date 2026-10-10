// The pumping lemma, played as a game against the computer: the computer
// claims a pumping length p works for a*nb*n (a^n b^n), the player picks a
// string s of length >= p in the language, and then a decomposition s=xyz
// respecting the lemma's constraints (|xy| <= p, |y| >= 1), and pumping y
// (repeating it) always breaks membership, which is exactly the
// contradiction that proves a^n b^n is NOT regular. No DOM access.
const CODE = [
  'Pumping lemma: if L is regular, there is a p such that every s in L with',
  '  |s| >= p can be split s = xyz with |xy| <= p, |y| >= 1, where',
  '  xy^i z is in L for every i >= 0.',
  'To prove L = {a^n b^n} is NOT regular: for ANY p, pick s = a^p b^p.',
  'EVERY valid split (|xy| <= p, |y| >= 1) has y = a^k entirely in the a-block.',
  'Pump i=2: xy^2z = a^(p+k) b^p has more a-s than b-s, so it is NOT in L.',
  'That contradicts the lemma, so no such p exists: L is not regular.',
];

function inLanguage(str) {
  if (!/^a*b*$/.test(str)) return false;
  const as = (str.match(/a/g) || []).length;
  const bs = (str.match(/b/g) || []).length;
  return as === bs;
}

function dominoFrame(labelled, { activeRange = [], caption, line }) {
  const n = Math.max(1, labelled.length);
  const nodes = labelled.map((ch, i) => ({
    id: i,
    label: ch,
    x: n === 1 ? 50 : 4 + (i / (n - 1)) * 92,
    y: 50,
    w: Math.max(4, Math.min(10, 90 / n)),
    h: 18,
    active: i >= activeRange[0] && i <= activeRange[1],
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [] };
}

function* run(input) {
  const { p, k } = input;
  const s = 'a'.repeat(p) + 'b'.repeat(p);
  const chars = s.split('');
  yield dominoFrame(chars, { caption: `The computer claims pumping length p = ${p} works for L = {a^n b^n : n >= 0}. The player picks s = a^${p}b^${p} (length ${s.length} >= p).`, line: 3 });

  // The player's chosen split: y = a^k, placed right at the start of the
  // a-block, with x taking up the rest of the budget before it so that
  // |xy| = p exactly (always satisfying the lemma's |xy| <= p constraint).
  const xEnd = p - k; // x = s[0..xEnd), length p-k
  const yEnd = p; // y = s[xEnd..yEnd), length k

  yield dominoFrame(chars, { activeRange: [0, Math.max(0, xEnd - 1)], caption: `Player's split: x = the first ${xEnd} character${xEnd === 1 ? '' : 's'} (a^${xEnd}).`, line: 4 });
  yield dominoFrame(chars, { activeRange: [xEnd, yEnd - 1], caption: `y = the next ${k} character${k === 1 ? '' : 's'} (a^${k}), entirely inside the a-block since |xy| = ${yEnd} <= p = ${p}.`, line: 4 });
  yield dominoFrame(chars, { activeRange: [yEnd, chars.length - 1], caption: `z = the rest (${chars.length - yEnd} characters): the remaining a-s plus all ${p} b-s.`, line: 4 });

  const pumped = 'a'.repeat(p + k) + 'b'.repeat(p); // xy^2z, since x=a^(p-k), y^2=a^(2k), z=b^p
  const pumpedChars = pumped.split('');
  const pumpedInLang = inLanguage(pumped);
  yield dominoFrame(pumpedChars, {
    activeRange: [xEnd, xEnd + k * 2 - 1],
    caption: `Pump y to y^2 (repeat it once more): xy^2z = a^${p + k}b^${p}, which has ${p + k} a-s and ${p} b-s. ${pumpedInLang ? 'Still in L (unexpected!).' : 'NOT in L: the counts no longer match.'}`,
    line: 5,
  });

  return { p, k, xEnd, yEnd, pumpedInLang, pumpedLength: pumped.length };
}

export default {
  id: 'pumping-lemma',
  title: 'The pumping lemma',
  module: 'm03',
  course: 'CSC236/240',
  clrs: '(Sipser: Nonregular Languages, the Pumping Lemma)',
  summary:
    'The pumping lemma is a tool for proving a language is NOT regular. It says that every regular language has some pumping length p so that any string in the language of length at least p can be split into three pieces, x, y, and z, where y is non-empty, the first two pieces together are no longer than p, and repeating y any number of times (even zero times) always stays in the language. ' +
    'To use it as a proof, you play it as an adversarial game: the computer (standing in for "L is regular") picks p, but you get to pick the string and, crucially, you get to argue that EVERY possible way of splitting it fails. ' +
    'For L = {a^n b^n}, pick s = a^p b^p. Since |xy| <= p, the piece y has to live entirely inside the leading block of a-s, so y is just a^k for some k >= 1. Pumping y up to y^2 adds k more a-s without adding any b-s, so the pumped string has more a-s than b-s and falls out of the language. ' +
    'Since that argument works no matter what p the computer claims, no valid pumping length can exist, so a^n b^n is not regular, which also proves it has no DFA or NFA at all, however many states you allow. ' +
    'This sandbox lets you pick p, then walks through exactly this split-and-pump argument on a concrete string, showing the piece that breaks the moment it is pumped.',
  code: CODE,
  complexity: {
    time: 'Not an algorithm; the "cost" here is the length of the witness string, p + p = 2p characters.',
    why: 'The proof only ever needs one witness string of length 2p (the smallest string in the family that is already at least p long), so the argument itself is O(p) to state and check.',
  },
  makeInput(rng, size) {
    const p = Math.max(1, Math.min(12, size || 1));
    const k = 1 + Math.floor(rng() * p); // 1..p, so |xy| = xEnd+k <= p is satisfiable
    return { p, k };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { p, k } = input;
    if (result.p !== p || result.k !== k) return false;
    // The split must respect the lemma's own constraints: |xy| <= p, |y| >= 1.
    if (result.yEnd > p) return false;
    if (result.yEnd - result.xEnd !== k || k < 1) return false;
    // And pumping must actually break membership, which is the entire proof.
    if (result.pumpedInLang) return false;
    if (result.pumpedLength !== 2 * p + k) return false;
    return true;
  },
  sandbox: { type: 'n', min: 1, max: 12, default: 4, label: 'pumping length p' },
};
