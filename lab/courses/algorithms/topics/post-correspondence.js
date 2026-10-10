// The Post correspondence problem: given a set of dominoes, each with a
// string on top and a string on the bottom, is there a sequence of
// dominoes (repeats allowed) so that reading all the tops in order spells
// the same string as reading all the bottoms in order? PCP is undecidable
// in general, but any SPECIFIC attempted sequence is trivial to check by
// just concatenating both sides and comparing, which is exactly what this
// sandbox's "play" interaction is: type a sequence of tile indices and see
// whether it solves the puzzle. Every instance here ships with a known
// solution built in (so there is always something solvable to find), but
// the checker verifies whatever sequence you actually typed, solved or not.
// No DOM access.

const CODE = [
  'tiles[i] = (top_i, bottom_i)',
  'given a sequence of indices i1, i2, ..., ik (repeats allowed):',
  '  top = top[i1] + top[i2] + ... + top[ik]',
  '  bottom = bottom[i1] + bottom[i2] + ... + bottom[ik]',
  'solved if top == bottom',
];

const NUM_TILES = 4;

function buildTiles(rng, n) {
  // Partition a shared random string BIG (length n) into NUM_TILES chunks
  // two different ways: once for the tops, once for the bottoms. Since
  // both partitions cover the same BIG string end to end, concatenating
  // ALL tiles in order 0,1,2,...,NUM_TILES-1 reproduces BIG on both the top
  // and the bottom, which is a guaranteed solution, built by construction
  // (not searched for).
  let big = '';
  for (let i = 0; i < n; i++) big += rng() < 0.5 ? 'a' : 'b';

  function randomPartition(total, parts) {
    // `parts` positive integers summing to `total`.
    const cuts = [];
    for (let i = 0; i < parts - 1; i++) cuts.push(1 + Math.floor(rng() * (total - 1)));
    cuts.sort((a, b) => a - b);
    const lens = [];
    let prev = 0;
    for (const c of cuts) { lens.push(Math.max(1, c - prev)); prev = c; }
    lens.push(Math.max(1, total - prev));
    // Fix up rounding so the lengths sum exactly to total.
    let sum = lens.reduce((a, b) => a + b, 0);
    lens[lens.length - 1] += total - sum;
    return lens;
  }

  const topLens = randomPartition(big.length, NUM_TILES);
  const bottomLens = randomPartition(big.length, NUM_TILES);
  const tiles = [];
  let ti = 0, bi = 0;
  for (let k = 0; k < NUM_TILES; k++) {
    tiles.push({ top: big.slice(ti, ti + topLens[k]), bottom: big.slice(bi, bi + bottomLens[k]) });
    ti += topLens[k];
    bi += bottomLens[k];
  }
  return { tiles, big };
}

function concatFor(tiles, sequence) {
  let top = '', bottom = '';
  for (const ch of sequence) {
    const idx = Number(ch);
    if (!Number.isInteger(idx) || idx < 0 || idx >= tiles.length) return null;
    top += tiles[idx].top;
    bottom += tiles[idx].bottom;
  }
  return { top, bottom };
}

function tilesFrame(tiles, sequence, upTo, caption, line) {
  const nodes = [];
  const m = Math.max(1, sequence.length);
  for (let i = 0; i < sequence.length; i++) {
    const idx = Number(sequence[i]);
    const tile = tiles[idx];
    const x = m === 1 ? 50 : 4 + (i / Math.max(1, m - 1)) * 92;
    const active = i <= upTo;
    nodes.push({ id: `top-${i}`, label: tile ? tile.top : '?', x, y: 30, w: Math.max(6, 85 / m), h: 16, active, dim: !active });
    nodes.push({ id: `bot-${i}`, label: tile ? tile.bottom : '?', x, y: 60, w: Math.max(6, 85 / m), h: 16, active, dim: !active });
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers: [{ x: 2, y: 15, text: 'top' }, { x: 2, y: 75, text: 'bottom' }] };
}

function* run(input) {
  const { tiles, sequence } = input;

  yield {
    kind: 'boxes', line: 0, code: CODE,
    caption: `${tiles.length} dominoes available: ${tiles.map((t, i) => `[${i}: "${t.top}" / "${t.bottom}"]`).join('  ')}. Playing sequence "${sequence}".`,
    nodes: tiles.map((t, i) => ({ id: `tile-${i}`, label: `${t.top}/${t.bottom}`, x: 10 + i * 24, y: 50, w: 20, h: 20, active: false })),
    edges: [], pointers: [],
  };

  if (sequence.length === 0) {
    yield tilesFrame(tiles, '', -1, 'Empty sequence: both the top and bottom concatenations are the empty string, so they trivially match.', 4);
    return { top: '', bottom: '', matches: true, length: 0 };
  }

  let top = '', bottom = '';
  let invalid = false;
  for (let i = 0; i < sequence.length; i++) {
    const idx = Number(sequence[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= tiles.length) {
      invalid = true;
      yield tilesFrame(tiles, sequence, i, `Index ${sequence[i]} is not a valid tile (only 0..${tiles.length - 1} exist): stopping here.`, 2);
      break;
    }
    top += tiles[idx].top;
    bottom += tiles[idx].bottom;
    yield tilesFrame(tiles, sequence, i, `Place tile ${idx} ("${tiles[idx].top}" / "${tiles[idx].bottom}"). Running top = "${top}", running bottom = "${bottom}".`, 2);
  }

  const matches = !invalid && top === bottom;
  yield tilesFrame(tiles, sequence, sequence.length - 1, invalid
    ? 'Invalid sequence: not a solution.'
    : `Final top = "${top}", final bottom = "${bottom}". ${matches ? 'They match: this sequence SOLVES the puzzle.' : 'They differ: not a solution.'}`, 4);

  return { top, bottom, matches, length: sequence.length };
}

export default {
  id: 'post-correspondence',
  title: 'The Post correspondence problem',
  module: 'm10',
  course: 'CSC363, CSC438/448',
  clrs: '(Sipser: Post Correspondence Problem, cf. undecidability via reduction)',
  summary:
    'The Post correspondence problem (PCP) hands you a set of dominoes, each with a string on top and a (usually different) string on the bottom, and asks whether some sequence of dominoes, repeats allowed, makes the tops spell the same string as the bottoms. ' +
    'It sounds like a puzzle, and for any one guessed sequence it is: just concatenate both sides and compare, which this sandbox does directly. The undecidable part is the general question "does SOME sequence exist", which has no bound on how long a solution might need to be, so no algorithm can search "long enough and then safely give up". ' +
    "PCP matters here because it is one of the standard targets mapping reductions are built towards: showing a Turing machine's computation history can be encoded as a domino sequence is how PCP's undecidability gets proved from the halting problem's, the same technique as the previous topic's reduction, aimed at a different, very concrete-looking puzzle. " +
    'Every instance in this sandbox is built with a guaranteed solution baked in (typing "0123" always works), so you can see a real match, then edit the sequence (repeat tiles, drop some, reorder them) and watch the checker verify whatever you actually typed. ' +
    'Dominoes are shown as two stacked rows, tops above and bottoms below, growing left to right as each tile in your sequence gets placed.',
  code: CODE,
  complexity: {
    time: 'O(k) to check one length-k sequence: it is just two concatenations and a string comparison.',
    why: 'Checking a GIVEN sequence is linear and trivial; PCP\'s undecidability is entirely about the unbounded search for whether any sequence exists at all, which this sandbox sidesteps by letting you supply the sequence directly.',
  },
  makeInput(rng, size) {
    const n = 4 + Math.min(10, size);
    const { tiles } = buildTiles(rng, n);
    const solution = Array.from({ length: NUM_TILES }, (_, i) => String(i)).join('');
    return { tiles, sequence: solution };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { tiles, sequence } = input;
    const expected = concatFor(tiles, sequence);
    if (sequence.length === 0) {
      return result.matches === true && result.top === '' && result.bottom === '';
    }
    if (!expected) {
      // Only reachable with an out-of-range digit; run() should report
      // a non-match in that case.
      return result.matches === false;
    }
    if (result.top !== expected.top || result.bottom !== expected.bottom) return false;
    if (result.matches !== (expected.top === expected.bottom)) return false;
    // Sanity on the generator itself: the baked-in solution 0123 must
    // actually solve the puzzle it built.
    const canonical = Array.from({ length: NUM_TILES }, (_, i) => String(i)).join('');
    const canonicalCheck = concatFor(tiles, canonical);
    if (canonicalCheck.top !== canonicalCheck.bottom) return false;
    return true;
  },
  sandbox: { type: 'string', field: 'sequence', fieldLabel: 'tile sequence (repeats and reordering allowed)', alphabet: ['0', '1', '2', '3'], min: 0, max: 10, default: 4, label: 'sequence length' },
};
