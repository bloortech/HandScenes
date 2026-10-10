// Weighted interval scheduling: each interval now has a weight, and the
// greedy "finish earliest" rule from plain interval scheduling no longer
// finds the best total weight, so this needs dynamic programming instead.
// Sort by finish time; p(j) is the latest interval that finishes before
// interval j starts; OPT(j) = max(OPT(j-1), weight(j) + OPT(p(j))), the
// classic "include j or don't" DP. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'sort intervals by finish time: 1..n',
  'p(j) = the largest index i < j with finish[i] <= start[j] (or 0 if none)',
  'OPT(0) = 0',
  'OPT(j) = max(OPT(j-1), weight[j] + OPT(p(j)))   for j = 1..n',
  'return OPT(n), reconstructed by walking the "include j?" choices backward',
];

function bruteBest(intervals) {
  const n = intervals.length;
  let best = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    const chosen = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(i);
    chosen.sort((a, b) => intervals[a].f - intervals[b].f);
    let ok = true, w = 0;
    for (let k = 0; k < chosen.length; k++) {
      if (k > 0 && intervals[chosen[k]].s < intervals[chosen[k - 1]].f) { ok = false; break; }
      w += intervals[chosen[k]].weight;
    }
    if (ok && w > best) best = w;
  }
  return best;
}

function frame(sorted, opt, activeJ, picked, caption, line) {
  const maxF = Math.max(1, ...sorted.map((iv) => iv.f));
  const nodes = sorted.map((iv, idx) => ({
    id: String(idx),
    label: `${iv.s}-${iv.f}`,
    x: 4 + (iv.s / maxF) * 92,
    y: 10 + idx * 8,
    w: Math.max(4, ((iv.f - iv.s) / maxF) * 92),
    h: 6,
    active: idx + 1 === activeJ,
    compare: picked && picked.has(idx),
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no intervals)' };
}

function* run(input) {
  const intervals = input.intervals;
  const n = intervals.length;
  if (n === 0) {
    yield frame([], [0], null, null, 'No intervals.', 0);
    return { total: 0, picked: [] };
  }
  const sorted = intervals.map((iv, i) => ({ ...iv, orig: i })).sort((a, b) => a.f - b.f);
  yield frame(sorted, null, null, null, `Sort ${n} intervals by finish time.`, 0);

  const p = sorted.map((iv, j) => {
    let k = 0; // 1-indexed "none" sentinel
    for (let i = j - 1; i >= 0; i--) if (sorted[i].f <= iv.s) { k = i + 1; break; }
    return k;
  });
  yield frame(sorted, null, null, null, `Compute p(j) for each interval: the latest earlier interval that doesn't overlap it.`, 1);

  const OPT = Array(n + 1).fill(0);
  for (let j = 1; j <= n; j++) {
    const iv = sorted[j - 1];
    const withJ = iv.weight + OPT[p[j - 1]];
    OPT[j] = Math.max(OPT[j - 1], withJ);
    yield frame(sorted, null, j, null, `OPT(${j}) = max(OPT(${j - 1})=${OPT[j - 1]}, weight+OPT(p(${j}))=${iv.weight}+${OPT[p[j - 1]]}=${withJ}) = ${OPT[j]}.`, 3);
  }

  // Reconstruct which intervals were picked.
  const picked = [];
  let j = n;
  while (j > 0) {
    const iv = sorted[j - 1];
    const withJ = iv.weight + OPT[p[j - 1]];
    if (withJ >= OPT[j - 1]) { picked.push(j - 1); j = p[j - 1]; }
    else j = j - 1;
  }
  picked.reverse();
  yield frame(sorted, null, null, new Set(picked), `Done: OPT(${n}) = ${OPT[n]}. Reconstructed picks highlighted.`, 4);

  const pickedOrig = picked.map((idx) => sorted[idx].orig);
  return { total: OPT[n], picked: pickedOrig };
}

export default {
  id: 'weighted-interval-scheduling',
  title: 'Weighted interval scheduling',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'Add a weight (value) to each interval in the interval scheduling problem, and ask for the maximum total weight of a non-overlapping subset, and the plain "finish earliest" greedy rule stops being optimal: a low-weight interval that finishes early can block a much higher-weight interval that finishes just a bit later. ' +
    'Sort intervals by finish time anyway (it is still useful for a different reason), and define OPT(j) as the best total weight using only the first j intervals in that order. ' +
    'Interval j is either in the optimal solution or it isn\'t: if it is, it contributes its own weight plus the best solution among intervals that finish before it starts, OPT(p(j)); if it isn\'t, the answer is just OPT(j-1). ' +
    'Taking the better of those two options at every j, in order, fills in the whole OPT table in O(n) once p(j) is known (binary search or a single merge-style pass over the sorted list finds every p(j) in O(n log n) total). ' +
    'Walking back through which choice ("include j" vs "skip j") achieved each OPT(j) reconstructs the actual chosen set.',
  code: CODE,
  complexity: {
    time: 'O(n log n): sorting plus computing every p(j) by binary search, then an O(n) DP fill.',
    why: 'Sorting by finish time is O(n log n). Finding p(j) for every j with binary search against the sorted finish times is O(log n) per interval, O(n log n) total. Filling OPT(1..n) does O(1) work per entry given p(j), so O(n). The sort/binary-search dominates.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(16, size));
    const intervals = [];
    for (let k = 0; k < n; k++) {
      const s = randInt(rng, 0, 30);
      const f = s + randInt(rng, 1, 12);
      intervals.push({ s, f, weight: randInt(rng, 1, 20) });
    }
    return { intervals };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { intervals } = input;
    if (intervals.length === 0) return result.total === 0 && result.picked.length === 0;
    const seen = new Set();
    let total = 0;
    const chosen = [];
    for (const idx of result.picked) {
      if (idx < 0 || idx >= intervals.length || seen.has(idx)) return false;
      seen.add(idx);
      total += intervals[idx].weight;
      chosen.push(intervals[idx]);
    }
    chosen.sort((a, b) => a.f - b.f);
    for (let i = 1; i < chosen.length; i++) if (chosen[i].s < chosen[i - 1].f) return false;
    if (total !== result.total) return false;
    return total === bruteBest(intervals);
  },
  sandbox: { type: 'n', min: 0, max: 16, default: 10, label: 'intervals' },
};
