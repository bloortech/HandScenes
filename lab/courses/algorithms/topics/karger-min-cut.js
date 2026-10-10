// Karger's min-cut algorithm: repeatedly pick a uniformly random remaining
// edge and contract it (merge its two endpoints into one supernode,
// dropping any edge that becomes a self-loop but keeping parallel edges),
// until only two supernodes are left. The edges still connecting them form
// a cut, and with decent probability it is a minimum cut; repeating the
// whole process and keeping the smallest cut seen pushes that probability
// close to 1. No DOM access. CLRS: a randomized algorithm in the spirit of
// Multithreaded/Randomized Algorithms; Karger's contraction algorithm.
import { makeRandomGraph } from '../engine/graph.js';
import { makeSets, find, union } from '../engine/unionfind.js';
import { randInt } from '../engine/rng.js';

const CODE = [
  'while more than 2 supernodes remain:',
  '  pick a uniformly random edge (u, v) among the remaining edges',
  '  contract u and v into one supernode (union-find union)',
  '  drop edges that became self-loops; keep parallel edges',
  'the edges crossing the final two supernodes are a cut',
  'repeat many times; keep the smallest cut found',
];

function graphFrame(n, positions, edges, uf, activeEdge, caption, line) {
  const nodes = positions.map((p, id) => ({ id, label: String(find(uf, id)), x: p.x, y: p.y, active: activeEdge && (find(uf, id) === find(uf, activeEdge[0]) || find(uf, id) === find(uf, activeEdge[1])) }));
  const edgeList = edges.filter((e) => find(uf, e.u) !== find(uf, e.v)).map((e) => [String(e.u), String(e.v)]);
  return { kind: 'tree', code: CODE, line, caption, nodes, edges: edgeList, emptyText: '(empty graph)' };
}

function circlePositions(n) {
  const positions = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    positions.push({ x: 50 + 36 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) });
  }
  return positions;
}

// One run of the contraction algorithm, returning the cut size found and a
// log of every contraction (for the animation of the first trial only;
// later trials run silently, the way a real Monte Carlo repeat would).
function contract(n, edges, rng, log) {
  const uf = makeSets(n);
  let remaining = edges.slice();
  let groups = n;
  while (groups > 2 && remaining.length > 0) {
    const pick = remaining[randInt(rng, 0, remaining.length - 1)];
    if (find(uf, pick.u) !== find(uf, pick.v)) {
      union(uf, pick.u, pick.v);
      groups--;
      if (log) log.push({ u: pick.u, v: pick.v });
    }
    remaining = remaining.filter((e) => find(uf, e.u) !== find(uf, e.v));
  }
  const cutSize = edges.filter((e) => find(uf, e.u) !== find(uf, e.v)).length;
  return { cutSize, uf };
}

// Brute-force minimum cut: try every way to split the n vertices into two
// non-empty groups (2^(n-1) distinct splits, fine for the small n this
// sandbox ever generates) and count crossing edges.
export function bruteMinCut(n, edges) {
  if (n < 2) return Infinity;
  let best = Infinity;
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    let cut = 0;
    for (const { u, v } of edges) {
      const su = (mask >> u) & 1, sv = (mask >> v) & 1;
      if (su !== sv) cut++;
    }
    if (cut < best) best = cut;
  }
  return best;
}

function* run(input) {
  const { n, edges, trials } = input;
  const positions = circlePositions(n);

  if (n < 2) {
    yield graphFrame(n, positions, edges, makeSets(n), null, 'Fewer than 2 vertices: no cut to find.', 0);
    return { bestCut: 0, trials };
  }

  const rng0 = mulberrySeeded(input.seed);
  const log = [];
  let bestCut = Infinity;

  const uf0 = makeSets(n);
  yield graphFrame(n, positions, edges, uf0, null, `Graph with ${n} vertices and ${edges.length} edges. Run Karger's contraction ${trials} time${trials === 1 ? '' : 's'}.`, 0);

  const first = contract(n, edges, rng0, log);
  const replayUf = makeSets(n);
  for (const step of log) {
    yield graphFrame(n, positions, edges, replayUf, [step.u, step.v], `Contract a random edge (${step.u}, ${step.v}).`, 1);
    union(replayUf, step.u, step.v);
  }
  bestCut = Math.min(bestCut, first.cutSize);
  yield graphFrame(n, positions, edges, replayUf, null, `Trial 1: cut size ${first.cutSize}.`, 4);

  for (let t = 1; t < trials; t++) {
    const rngT = mulberrySeeded(input.seed + t * 7919 + 1);
    const { cutSize } = contract(n, edges, rngT, null);
    bestCut = Math.min(bestCut, cutSize);
  }

  yield graphFrame(n, positions, edges, replayUf, null, `Best cut found over ${trials} trial${trials === 1 ? '' : 's'}: ${bestCut}.`, 5);
  return { bestCut, trials };
}

function mulberrySeeded(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'karger-min-cut',
  title: "Karger's minimum cut algorithm",
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'A randomized minimum-cut algorithm (in the spirit of CLRS\'s randomized/multithreaded algorithms chapters)',
  summary:
    "A cut of a connected graph splits its vertices into two non-empty groups; its size is the number of edges crossing between them. Karger's algorithm finds a minimum cut (the fewest crossing edges possible) using nothing but repeated random contraction. " +
    'Each round, pick a uniformly random remaining edge and merge its two endpoints into one supernode, discarding any edge that becomes a self-loop but keeping parallel edges between other pairs intact. ' +
    'Keep contracting until only two supernodes remain; the edges still crossing between them form a cut, and the chance that a single run happens to avoid ever contracting one of the minimum cut\'s own edges (which is exactly what makes that cut survive to the end) is at least 1/C(n,2), polynomially small, not exponentially small. ' +
    'Repeating the whole algorithm O(n^2 log n) times and keeping the smallest cut seen drives the failure probability down to 1/n or better, by a standard boosting argument, which is why this sandbox runs several independent trials and reports the best one. ' +
    'It is a strange-looking algorithm for a graph problem (no BFS, no flow network, just chance), and that is exactly why it is a centerpiece example of what randomization can buy: a simple algorithm that would be hard to derandomize this simply.',
  code: CODE,
  complexity: {
    time: 'O(n) edge contractions per trial (each O(1) with union-find); O(n^2 log n) trials needed to make failure probability small, so O(n^3 log n) total for a high-confidence answer.',
    why: 'A single run contracts down from n vertices to 2, so at most n-2 successful contractions, each O(1) amortised with union-find (ignoring the O(E) filtering this teaching version redoes per round for clarity). A single run keeps any particular minimum cut with probability at least 1/C(n,2) = Omega(1/n^2); independent trials are boosted the usual way (CLRS\'s amplification argument), needing O(n^2 log n) repeats to push the failure probability below 1/n, giving O(n^3 log n) total work for a high-confidence minimum cut.',
  },
  makeInput(rng, size) {
    const n = Math.max(2, Math.min(9, 2 + Math.floor(size / 3)));
    const g = makeRandomGraph(rng, n, { directed: false, weighted: false, extraEdgeFraction: 0.5 });
    // A real run would need only O(n^2 log n) trials to amplify success
    // probability; this sandbox runs many more than that (cheap for graphs
    // this small) so check() can expect the true minimum cut essentially
    // every time, instead of occasionally accepting an unlucky overshoot.
    const trials = 300;
    const seed = 1 + Math.floor(rng() * 1_000_000);
    return { n, edges: g.edges.map((e) => ({ u: e.u, v: e.v })), trials, seed };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges } = input;
    if (n < 2) return result.bestCut === 0;
    const trueMin = bruteMinCut(n, edges);
    // Karger's algorithm can never find a cut smaller than the true
    // minimum, and 300 independent trials on a graph this small drives the
    // chance of missing the true minimum down to essentially zero (each
    // trial alone succeeds with probability >= 1/C(n,2) >= 1/36).
    return result.bestCut === trueMin;
  },
  sandbox: { type: 'n', min: 0, max: 21, default: 9, label: 'size' },
};
