// van Emde Boas trees: a recursive universe split into sqrt(u) clusters of
// size sqrt(u) each, plus a summary structure (itself a smaller vEB tree)
// that tracks which clusters are non-empty, giving O(lg lg u) member and
// successor queries. No DOM access. Logic lives in engine/veb.js; the
// universe is drawn as a row of blocks (one per possible value), amber for
// present, cyan for whichever block a query is currently inspecting.
import { createVEB, insert, member, successor, allMembers } from '../engine/veb.js';

const U = 16; // a 2-level recursive structure: top clusters of size 4, each a vEB of size 4 whose own clusters are the u=2 base case

const CODE = [
  'member(V, x):',
  '  if x == V.min or x == V.max: return true',
  '  if V.u == 2 or V.min == null: return false',
  '  return member(V.cluster[high(x)], low(x))',
  'successor(V, x): climb to the right cluster via V.summary,',
  '  or recurse within x\'s own cluster if it still has room above x',
];

function frame(present, { activeIdx = [], caption, line }) {
  // One bar per universe value, 1 if present, else a short 0: the
  // renderer prints the value itself under each bar (no custom labels),
  // so this doubles as a plain legend of what's in the structure.
  const array = Array.from({ length: U }, (_, i) => (present.has(i) ? 1 : 0));
  return { array, activeIdx, caption, line, code: CODE };
}

function* run(input) {
  const V = createVEB(U);
  const values = Array.from(new Set(input.array.map((v) => ((Math.trunc(v) % U) + U) % U)));
  const present = new Set();

  if (values.length === 0) {
    yield frame(present, { caption: `An empty van Emde Boas tree over universe {0, ..., ${U - 1}}.`, line: 0 });
  }

  for (const v of values) {
    insert(V, v, []);
    present.add(v);
    yield frame(present, { activeIdx: [v], caption: `Insert ${v}. It updates its cluster's min/max and its cluster's slot in the summary, in O(lg lg u).`, line: 0 });
  }

  const sorted = Array.from(present).sort((a, b) => a - b);
  const queryPoints = Array.from(new Set([0, Math.floor(U / 2), U - 1, sorted.length ? sorted[0] : 0]));
  for (const q of queryPoints) {
    const isMember = member(V, q);
    yield frame(present, { activeIdx: [q], caption: `member(${q}) = ${isMember}.`, line: 1 });
    const succ = successor(V, q);
    yield frame(present, { activeIdx: succ == null ? [q] : [q, succ], caption: succ == null ? `successor(${q}) = none; nothing bigger is present.` : `successor(${q}) = ${succ}.`, line: 4 });
  }

  return { V, inserted: sorted };
}

export default {
  id: 'van-emde-boas',
  title: 'van Emde Boas trees',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'van Emde Boas Trees',
  summary:
    'A van Emde Boas tree keeps a fixed universe {0, ..., u-1} and splits it into sqrt(u) clusters of sqrt(u) elements each, recursively: every cluster is itself a smaller vEB tree, and a summary structure, also a vEB tree, tracks which clusters are currently non-empty. ' +
    'The trick that makes it fast: a structure\'s own min (and max) are stored directly, not recursively inside a cluster, so checking "is x here" or "what comes right after x" only ever needs to recurse into one cluster, not all sqrt(u) of them. ' +
    'That turns the recursion u -> sqrt(u) -> sqrt(sqrt(u)) -> ... into O(lg lg u) levels deep instead of O(lg u), since the universe size shrinks by taking its square root each level rather than just halving. ' +
    'Successor either finds the answer within x\'s own cluster (if that cluster still has a bigger element) or asks the summary which cluster comes next, then takes that cluster\'s minimum directly, no recursion needed for that last step since minimums are stored outside the recursive structure. ' +
    'This sandbox fixes the universe at 16 (two real levels of recursion: clusters of size 4, each with its own clusters of size 2), inserts every distinct value from the array (reduced mod 16), then runs a few member and successor queries.',
  code: CODE,
  complexity: {
    time: 'O(lg lg u) for member, insert, and successor, where u is the universe size.',
    why: 'Each recursive call shrinks the universe from u to sqrt(u), so the recursion depth to reach the u=2 base case is log2(log2(u)): starting from log2(u) and halving that at every level. Every level does O(1) extra work (an array lookup plus at most one recursive call, not sqrt(u) of them, thanks to storing min/max outside the recursive structure), so the total cost is O(lg lg u).',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * U));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = Array.from(new Set(input.array.map((v) => ((Math.trunc(v) % U) + U) % U))).sort((a, b) => a - b);
    if (JSON.stringify(result.inserted) !== JSON.stringify(expected)) return false;
    const got = allMembers(result.V).sort((a, b) => a - b);
    if (JSON.stringify(got) !== JSON.stringify(expected)) return false;
    const expectedSet = new Set(expected);
    for (let x = 0; x < U; x++) {
      if (member(result.V, x) !== expectedSet.has(x)) return false;
      const expSucc = expected.find((v) => v > x) ?? null;
      const gotSucc = successor(result.V, x);
      if ((gotSucc ?? null) !== (expSucc ?? null)) return false;
    }
    return true;
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
