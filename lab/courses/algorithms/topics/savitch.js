// Savitch's theorem: reachability in a directed graph can be decided in
// O(log^2 n) SPACE, far less than the O(n) a visited-set needs, by never
// remembering more than the single path of midpoints currently being
// tried. CANREACH(u, v, i) asks "can v be reached from u in at most 2^i
// steps", and recurses on a GUESSED midpoint w: CANREACH(u, w, i-1) AND
// CANREACH(w, v, i-1), each half checked (and then its stack frame
// THROWN AWAY) before the other half is even started. The recursion is
// only O(log n) deep (since i halves the step budget each level, and
// n steps cover any path), and each stack frame only needs to remember
// a constant number of vertex names (each O(log n) bits), for a total of
// O(log^2 n) bits on the stack at once, which is the whole theorem. No
// DOM access. Reuses engine/graph.js's bfsDistances purely as the
// independent correctness oracle this topic's check() compares against,
// never as part of the algorithm itself.
import { makeRandomGraph, adjList, bfsDistances } from '../engine/graph.js';

const CODE = [
  'CANREACH(u, v, i):',
  '  if i == 0: return (u == v) or edge(u, v)',
  '  for each candidate midpoint w:',
  '    if CANREACH(u, w, i-1) and CANREACH(w, v, i-1): return true',
  '  return false   // tried every midpoint, none worked',
];

function treeFrame(callStack, caption, line) {
  const nodes = callStack.map((c, idx) => ({
    id: idx,
    label: `canReach(${c.u}, ${c.v}, i=${c.i})${c.w != null ? ` via w=${c.w}` : ''}`,
    x: 50,
    y: 6 + idx * (84 / Math.max(1, callStack.length + 1)),
    w: 92,
    h: 70 / Math.max(1, callStack.length + 1),
    active: idx === callStack.length - 1,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(done)' };
}

function* run(input) {
  const { n, edges, src, dst, maxI } = input;
  const adj = adjList(n, edges, true);
  const edgeSet = new Set();
  for (let u = 0; u < n; u++) for (const { to } of adj[u]) edgeSet.add(`${u}>${to}`);
  const hasEdge = (u, v) => u === v || edgeSet.has(`${u}>${v}`);

  const callStack = [];
  let calls = 0;
  const frames = [];

  function canReach(u, v, i) {
    calls++;
    callStack.push({ u, v, i });
    if (frames.length < 400) frames.push(treeFrame(callStack, `canReach(${u}, ${v}, i=${i}): ${i === 0 ? `base case, check the edge directly.` : `try every midpoint w, recursing on half the budget each time.`}`, i === 0 ? 1 : 2));
    let result;
    if (i === 0) {
      result = hasEdge(u, v);
    } else {
      result = false;
      for (let w = 0; w < n && !result; w++) {
        callStack[callStack.length - 1].w = w;
        const left = canReach(u, w, i - 1);
        const right = left && canReach(w, v, i - 1);
        if (left && right) result = true;
      }
    }
    callStack.pop();
    return result;
  }

  const reachable = n > 0 ? canReach(src, dst, maxI) : false;
  for (const f of frames) yield f;
  yield treeFrame([], `Done: ${src} can${reachable ? '' : 'not'} reach ${dst} within 2^${maxI} steps, using ${calls} recursive call(s) and never more than O(log n) stack frames at once.`, 4);

  const { dist } = bfsDistances(n, adj, src);
  const trueReachable = n > 0 && dist[dst] !== Infinity;
  return { reachable, trueReachable, calls, maxDepth: maxI };
}

export default {
  id: 'savitch',
  title: "Savitch's theorem",
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: '(Sipser: Savitch\'s Theorem; PSPACE)',
  summary:
    'A plain BFS or DFS decides reachability fast, but it needs a visited set of size O(n), which is O(n log n) bits. Savitch\'s theorem shows reachability only needs O(log^2 n) bits, by trading that memory for recursion instead. ' +
    'CANREACH(u, v, i) asks whether v is reachable from u in at most 2^i steps. The base case (i = 0, at most 1 step) is just "is there an edge from u to v, or are they the same vertex". ' +
    'The recursive case guesses a midpoint w and asks two SMALLER questions: can u reach w in 2^(i-1) steps, and can w reach v in 2^(i-1) steps. If both hold for some w, then u reaches v in 2^i steps by going through it. ' +
    'The trick is that the first recursive call finishes, returns its single true/false answer, and its entire stack frame is thrown away before the second call even starts, so at any one instant the algorithm only remembers ONE path down the recursion, not the whole fan-out of midpoints it tried. ' +
    'That recursion is only O(log n) levels deep (since i halves each level, and n steps is always enough to cover a path through n vertices), and each level needs only O(log n) bits to name its two or three vertices, for a total of O(log^2 n) bits on the stack: more time than BFS, but dramatically less space, which is exactly what PSPACE-vs-P-is-probably-different theorems are built from.',
  code: CODE,
  complexity: {
    time: 'O(n^(log n)) time (recursion branches n ways, O(log n) levels deep): much slower than BFS.',
    why: 'Trading time for space is the whole point: Savitch\'s theorem is a space bound (O(log^2 n) bits), not a claim this beats BFS on time, which it very much does not.',
  },
  makeInput(rng, size) {
    const n = Math.max(1, Math.min(8, size || 5));
    const { edges } = makeRandomGraph(rng, n, { directed: true, weighted: false, extraEdgeFraction: 0.3 });
    const src = 0;
    const dst = n - 1;
    const maxI = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
    return { n, edges, src, dst, maxI };
  },
  run,
  check(input, result) {
    if (!result) return false;
    return result.reachable === result.trueReachable;
  },
  sandbox: { type: 'n', min: 1, max: 8, default: 5, label: 'vertices' },
};
