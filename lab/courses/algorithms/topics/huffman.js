// Huffman coding: a greedy algorithm that builds an optimal prefix-free
// binary code for a set of symbols given their frequencies. Repeatedly
// merge the two least-frequent trees into one new tree (frequency = sum of
// the two), until only one tree is left; a symbol's code is the path of
// left/right edges from the root to its leaf. No DOM access.
import { layoutTree } from '../engine/layout.js';
import { randInt } from '../engine/rng.js';

const CODE = [
  'forest = one leaf per symbol, weight = its frequency',
  'while forest has more than one tree:',
  '  x, y = the two trees with the smallest weight',
  '  merge x and y under a new node, weight = weight(x) + weight(y)',
  '  put the merged tree back into the forest',
  'return the single remaining tree; each symbol\'s code = its root-to-leaf path',
];

let uid = 0;
function leaf(sym, w) { return { id: `n${uid++}`, label: `${sym}:${w}`, weight: w, sym, children: [] }; }
function merge(x, y) { return { id: `n${uid++}`, label: `${x.weight + y.weight}`, weight: x.weight + y.weight, children: [x, y] }; }

function collectCodes(node, prefix, out) {
  if (node.children.length === 0) { out[node.sym] = prefix || '0'; return; }
  collectCodes(node.children[0], prefix + '0', out);
  collectCodes(node.children[1], prefix + '1', out);
}

function collectAll(node, nodes, edges) {
  nodes.push(node);
  for (const c of node.children) { edges.push([node.id, c.id]); collectAll(c, nodes, edges); }
}

// Brute-force optimal cost, completely independent of the greedy merge
// order run() uses: enumerate every full binary tree *shape* with n leaves
// (there are Catalan(n-1) of them, fine for the n <= 10 this topic allows),
// collect each shape's multiset of leaf depths, and for each shape work out
// the best possible assignment of frequencies to those depths via the
// rearrangement inequality (pair the largest frequency with the smallest
// depth), then take the best cost over every shape. This also happens to be
// exactly how Huffman's greedy algorithm is proven optimal, but it is
// computed here by brute enumeration, not by replaying the greedy merges.
function allDepthLists(n, memo = new Map()) {
  if (memo.has(n)) return memo.get(n);
  let result;
  if (n === 1) {
    result = [[0]];
  } else {
    result = [];
    for (let k = 1; k < n; k++) {
      for (const L of allDepthLists(k, memo)) {
        for (const R of allDepthLists(n - k, memo)) {
          result.push([...L.map((d) => d + 1), ...R.map((d) => d + 1)]);
        }
      }
    }
  }
  memo.set(n, result);
  return result;
}

function bruteOptimalCost(freqs) {
  const n = freqs.length;
  if (n <= 1) return 0; // 0 or 1 symbols need 0 bits of distinguishing code
  const sortedDesc = freqs.slice().sort((a, b) => b - a);
  let best = Infinity;
  for (const depths of allDepthLists(n)) {
    const sortedAsc = depths.slice().sort((a, b) => a - b);
    let cost = 0;
    for (let i = 0; i < n; i++) cost += sortedAsc[i] * sortedDesc[i];
    if (cost < best) best = cost;
  }
  return best;
}

function treeFrame(nodes, edges, activeIds, caption, line) {
  return {
    kind: 'tree', line, code: CODE, caption,
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, x: n.x, y: n.y, active: activeIds && activeIds.includes(n.id) })),
    edges,
  };
}

function* run(input) {
  const freqs = input.array;
  const syms = freqs.map((_, i) => String.fromCharCode(65 + i));
  uid = 0;
  let forest = freqs.map((f, i) => leaf(syms[i], f));

  if (forest.length === 0) {
    yield treeFrame([], [], null, 'No symbols.', 0);
    return { codes: {}, cost: 0 };
  }
  if (forest.length === 1) {
    yield treeFrame(forest, [], [forest[0].id], `Only one symbol (${forest[0].sym}): it needs 0 bits (always known).`, 5);
    return { codes: { [forest[0].sym]: '0' }, cost: 0 };
  }

  yield* snapshot('Start: one leaf per symbol, labelled symbol:frequency.', 0, null);

  while (forest.length > 1) {
    forest.sort((a, b) => a.weight - b.weight);
    const x = forest[0], y = forest[1];
    yield* snapshot(`Pick the two smallest-weight trees: ${x.label} and ${y.label}.`, 2, [x.id, y.id]);
    const m = merge(x, y);
    forest = [m, ...forest.slice(2)];
    yield* snapshot(`Merge them under a new node of weight ${m.weight}.`, 3, [m.id]);
  }

  const root = forest[0];
  const codes = {};
  collectCodes(root, '', codes);
  const cost = freqs.reduce((sum, f, i) => sum + f * codes[syms[i]].length, 0);
  yield* snapshot(`Done. Codes: ${syms.map((s) => `${s}=${codes[s]}`).join(', ')}. Total bits: ${cost}.`, 5, null);
  return { codes, cost };

  function* snapshot(caption, line, activeIds) {
    const nodes = [];
    const edges = [];
    for (const root of forest) collectAll(root, nodes, edges);
    for (const root of forest) layoutTree(root);
    // layoutTree lays each tree out independently in the same 0..100 box;
    // shift each forest member into its own horizontal slot so multiple
    // trees don't overlap (same trick fibonacci-heap/disjoint-sets use).
    const slotW = 100 / forest.length;
    forest.forEach((root, slot) => {
      const shift = (n) => { n.x = slot * slotW + (n.x / 100) * slotW; for (const c of n.children) shift(c); };
      shift(root);
    });
    const allNodes = [];
    const allEdges = [];
    for (const root of forest) collectAll(root, allNodes, allEdges);
    yield treeFrame(allNodes, allEdges, activeIds, caption, line);
  }
}

export default {
  id: 'huffman',
  title: 'Huffman coding',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Greedy Algorithms',
  summary:
    'Huffman coding builds a binary prefix code (no code is a prefix of another, so a stream of codes can be decoded unambiguously with no separators) that minimises the expected number of bits per symbol, given each symbol\'s frequency. ' +
    'The greedy idea: the two least frequent symbols should end up as deep (long codes) and as close to each other (sibling leaves) as possible, since they are used least often. ' +
    'So repeatedly take the two lowest-weight trees in the forest and merge them under a new node, whose weight is their sum; that merged tree then competes with everything else on equal footing. ' +
    'After n-1 merges, one tree remains, and each symbol\'s code is just the sequence of left (0) and right (1) edges from the root down to its leaf. ' +
    'This greedy exchange argument (always safe to merge the two cheapest first) is provably optimal, which is why Huffman coding is still the basis of the final compression stage in formats like DEFLATE/zip and JPEG.',
  code: CODE,
  complexity: {
    time: 'O(n log n) with a priority queue (O(n^2) with the plain "sort every round" approach shown here).',
    why: 'There are n-1 merges. With a min-heap, finding and removing the two smallest weights and inserting the merged result is O(log n) each, giving O(n log n) total. This sandbox re-sorts the whole forest each round for clarity, which costs O(n log n) per round, O(n^2 log n) overall; the asymptotic classification Huffman coding is known by uses the heap-based version.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    const array = Array.from({ length: n }, () => randInt(rng, 1, 30));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const freqs = input.array;
    const n = freqs.length;
    if (n === 0) return result.cost === 0;
    const syms = freqs.map((_, i) => String.fromCharCode(65 + i));
    const codes = result.codes;
    if (Object.keys(codes).length !== n) return false;
    const codeList = syms.map((s) => codes[s]);
    if (codeList.some((c) => c == null)) return false;
    if (n === 1) return result.cost === 0; // a single symbol needs 0 bits
    // Prefix-free: no code is a proper prefix of another.
    for (let i = 0; i < codeList.length; i++) {
      for (let j = 0; j < codeList.length; j++) {
        if (i === j) continue;
        if (codeList[j].startsWith(codeList[i]) && codeList[j] !== codeList[i]) return false;
      }
    }
    const cost = freqs.reduce((sum, f, i) => sum + f * codes[syms[i]].length, 0);
    if (cost !== result.cost) return false;
    return cost === bruteOptimalCost(freqs);
  },
  sandbox: { type: 'array', min: 0, max: 10, default: 6 },
};
