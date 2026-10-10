// A map of the big complexity classes, drawn as nested regions: P sits
// inside NP (every problem with a fast solution also has a fast-to-check
// certificate: just run the solver and keep its output), NP-complete is
// the hardest corner of NP (every NP problem reduces to it in polynomial
// time), co-NP mirrors NP (fast-to-check "no" certificates instead of
// "yes" ones), and both NP and co-NP sit inside PSPACE, which sits inside
// EXP. P is believed to sit inside NP ∩ co-NP (nobody has ever found a
// problem in both without finding a direct polynomial algorithm for it).
// No DOM access.
const CODE = [
  'P            = solvable in polynomial time',
  'NP           = YES-answers checkable in polynomial time (a certificate)',
  'co-NP        = NO-answers checkable in polynomial time',
  'NP-complete  = the hardest problems in NP (every NP problem reduces to one)',
  'PSPACE       = solvable in polynomial SPACE (NP, co-NP subset PSPACE)',
  'EXP          = solvable in exponential time (PSPACE subset EXP)',
];

// Each box: { id, label, x, y, w, h } in a normalised 0..100 square,
// center-based (x,y is the box's centre). Listed outermost-first so later
// (smaller) boxes draw on top and stay visible.
const BOXES = [
  { id: 'exp', label: 'EXP', x: 50, y: 50, w: 94, h: 92 },
  { id: 'pspace', label: 'PSPACE', x: 50, y: 52, w: 76, h: 74 },
  { id: 'np', label: 'NP', x: 38, y: 58, w: 46, h: 46 },
  { id: 'conp', label: 'co-NP', x: 62, y: 58, w: 46, h: 46 },
  { id: 'p', label: 'P', x: 50, y: 58, w: 14, h: 14 },
  { id: 'npc', label: 'NP-complete', x: 26, y: 72, w: 16, h: 13 },
];

const EXAMPLES = [
  { id: 'sorting', label: 'Sorting', region: 'p', note: 'Sorting an array: a polynomial-time algorithm exists (merge sort), so it sits in P (and therefore in NP and co-NP too, trivially).' },
  { id: 'sat', label: '3SAT', region: 'npc', note: '3SAT: a certificate (a satisfying assignment) checks in linear time, so it is in NP; every other NP problem reduces to it, so it is NP-complete too (Cook-Levin, plus the chain of reductions this module builds).' },
  { id: 'unsat', label: 'UNSAT', region: 'conp', note: 'UNSAT (is this formula unsatisfiable?) is the complement of SAT: a "no" certificate for SAT is a "yes" certificate for UNSAT, so UNSAT sits in co-NP.' },
  { id: 'tqbf', label: 'TQBF', region: 'pspace', note: 'TQBF (is this quantified boolean formula true?) needs to explore both branches of every quantifier, which takes polynomial SPACE but can cost exponential time, so it lands in PSPACE, believed to be strictly bigger than NP union co-NP.' },
  { id: 'brute', label: 'Brute-force SAT search', region: 'exp', note: 'Trying every one of the 2^n assignments by brute force (what this very engine falls back to for its own correctness checks) runs in exponential time, so it is in EXP, same as everything smaller.' },
];

function boxFrame(revealed, activeId, exampleId, caption, line) {
  const nodes = BOXES.filter((b) => revealed.has(b.id)).map((b) => ({
    id: b.id, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, active: b.id === activeId,
  }));
  const pointers = [];
  if (exampleId) {
    const ex = EXAMPLES.find((e) => e.id === exampleId);
    const region = BOXES.find((b) => b.id === ex.region);
    pointers.push({ x: region.x, y: region.y + region.h / 2 + 6, text: ex.label });
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers };
}

function* run(input) {
  const { exampleId } = input;
  const revealed = new Set();
  const order = ['exp', 'pspace', 'np', 'conp', 'p', 'npc'];
  for (let i = 0; i < order.length; i++) {
    revealed.add(order[i]);
    const id = order[i];
    const label = BOXES.find((b) => b.id === id).label;
    yield boxFrame(revealed, id, null, `Add ${label}: ${captionFor(id)}`, i);
  }
  const ex = EXAMPLES.find((e) => e.id === exampleId);
  yield boxFrame(revealed, ex.region, exampleId, `Example: ${ex.note}`, order.indexOf(ex.region));

  return { regions: BOXES.map((b) => b.id), exampleId, exampleRegion: ex.region };
}

function captionFor(id) {
  if (id === 'exp') return 'every problem solvable in exponential time, 2^(n^O(1)), the outermost region this map draws.';
  if (id === 'pspace') return 'solvable using only a polynomial amount of memory (time can still be exponential). Contains NP and co-NP.';
  if (id === 'np') return 'a "yes" answer has a certificate some verifier checks in polynomial time.';
  if (id === 'conp') return 'a "no" answer has a certificate some verifier checks in polynomial time: the mirror image of NP.';
  if (id === 'p') return 'solvable outright in polynomial time. Believed (not proven) to be the overlap of NP and co-NP.';
  if (id === 'npc') return 'the hardest problems in NP: every problem in NP reduces to any one of them in polynomial time.';
  return '';
}

// Structural containment check: box a (by id) must be fully inside box b,
// both center-based rectangles in the same normalised 0..100 square.
function boxById(id) { return BOXES.find((b) => b.id === id); }
function contains(outerId, innerId) {
  const o = boxById(outerId), i = boxById(innerId);
  const oLeft = o.x - o.w / 2, oRight = o.x + o.w / 2, oTop = o.y - o.h / 2, oBottom = o.y + o.h / 2;
  const iLeft = i.x - i.w / 2, iRight = i.x + i.w / 2, iTop = i.y - i.h / 2, iBottom = i.y + i.h / 2;
  return iLeft >= oLeft - 1e-9 && iRight <= oRight + 1e-9 && iTop >= oTop - 1e-9 && iBottom <= oBottom + 1e-9;
}

export default {
  id: 'complexity-map',
  title: 'Map of complexity classes',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'NP-Completeness',
  summary:
    'Every decision problem can be sorted into complexity classes by how much time or space the best known algorithm needs. ' +
    'P is "solvable in polynomial time": fast, outright. NP is "a yes-answer has a certificate that checks in polynomial time", which is a much weaker requirement than solving the problem, since finding that certificate might still take exponential time; P sits inside NP because any polynomial-time solver IS a certificate-generator (just run it and keep the answer). ' +
    'co-NP is the mirror image, fast-to-check "no" certificates instead of "yes" ones; P sits inside co-NP for the same reason. Nobody has ever found a problem that lives in both NP and co-NP without a direct polynomial algorithm for it, which is why P = NP ∩ co-NP is believed but not proven. ' +
    'NP-complete is the hardest corner of NP: every single problem in NP can be translated (reduced) into any NP-complete problem in polynomial time, so a fast algorithm for one NP-complete problem would instantly give a fast algorithm for every problem in NP, which is exactly what "P vs NP" is asking about. ' +
    'PSPACE (solvable using only polynomially much memory, even if time runs long) contains both NP and co-NP, since checking a certificate or exploring a tree of guesses never needs more than polynomial space to track where you are. EXP (exponential time) contains PSPACE, since a machine with unlimited time can always just try every possible memory configuration.',
  code: CODE,
  complexity: {
    time: 'Not applicable: this topic maps classes of problems by their running time, rather than being an algorithm with one of its own.',
    why: 'The classes are defined by the fastest algorithm that could ever solve a problem in them, not by anything this sandbox computes.',
  },
  makeInput(rng, size) {
    const idx = Math.floor(rng() * EXAMPLES.length) % EXAMPLES.length;
    void size;
    return { exampleId: EXAMPLES[idx].id };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (!EXAMPLES.some((e) => e.id === result.exampleId)) return false;
    const ex = EXAMPLES.find((e) => e.id === result.exampleId);
    if (result.exampleRegion !== ex.region) return false;
    // The facts this map claims, checked structurally against the box
    // coordinates defined above: every inclusion the summary states must
    // actually hold geometrically, not just be asserted in prose.
    if (!contains('exp', 'pspace')) return false;
    if (!contains('pspace', 'np')) return false;
    if (!contains('pspace', 'conp')) return false;
    if (!contains('np', 'npc')) return false;
    if (!contains('np', 'p')) return false;
    if (!contains('conp', 'p')) return false;
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 4, default: 0, label: 'example (randomise to cycle)' },
};
