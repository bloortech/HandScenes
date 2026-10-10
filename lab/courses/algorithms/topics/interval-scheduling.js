// Interval scheduling (unweighted activity selection): pick the largest
// possible set of non-overlapping intervals. The greedy rule is simple -
// always take the interval that finishes earliest among those still
// compatible with what's already picked - and the classic "exchange
// argument" proves it is never worse than any other choice: any optimal
// solution can be rewritten, interval by interval, to start with the
// earliest-finishing choice without shrinking its size. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'sort intervals by finish time',
  'lastFinish = -infinity, picked = []',
  'for (s, f) in sorted intervals:',
  '  if s >= lastFinish:',
  '    picked.append((s, f)); lastFinish = f',
];

function maxCountDP(intervals) {
  // Independent correctness oracle: weighted-interval-scheduling's DP with
  // every weight set to 1 also finds the true maximum count, via a
  // completely different recurrence (not "finish earliest"), so agreement
  // between the two is a real cross-check.
  const n = intervals.length;
  if (n === 0) return 0;
  const sorted = intervals.slice().sort((a, b) => a.f - b.f);
  const p = sorted.map((iv, j) => {
    let k = -1;
    for (let i = j - 1; i >= 0; i--) if (sorted[i].f <= iv.s) { k = i; break; }
    return k;
  });
  const dp = Array(n + 1).fill(0);
  for (let j = 1; j <= n; j++) {
    const iv = sorted[j - 1];
    dp[j] = Math.max(dp[j - 1], 1 + dp[p[j - 1] + 1]);
  }
  return dp[n];
}

function frame(intervals, picked, activeIdx, caption, line) {
  const maxF = Math.max(1, ...intervals.map((iv) => iv.f));
  const nodes = intervals.map((iv, i) => ({
    id: String(i),
    label: `${iv.s}-${iv.f}`,
    x: 4 + (iv.s / maxF) * 92,
    y: 10 + i * 8,
    w: Math.max(4, ((iv.f - iv.s) / maxF) * 92),
    h: 6,
    active: i === activeIdx,
    dim: !picked.has(i) && i !== activeIdx,
    compare: picked.has(i),
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no intervals)' };
}

function* run(input) {
  const intervals = input.intervals;
  const n = intervals.length;
  if (n === 0) {
    yield frame([], new Set(), null, 'No intervals to schedule.', 0);
    return { picked: [] };
  }
  const sorted = intervals.map((iv, i) => ({ ...iv, orig: i })).sort((a, b) => a.f - b.f);
  yield frame(intervals, new Set(), null, `Sort ${n} intervals by finish time.`, 0);

  let lastFinish = -Infinity;
  const pickedOrig = new Set();
  for (const iv of sorted) {
    yield frame(intervals, pickedOrig, iv.orig, `Consider [${iv.s}, ${iv.f}] (finishes earliest among the rest).`, 3);
    if (iv.s >= lastFinish) {
      pickedOrig.add(iv.orig);
      lastFinish = iv.f;
      yield frame(intervals, pickedOrig, iv.orig, `It starts at ${iv.s}, which is at or after the last pick's finish (${lastFinish === iv.f ? iv.s : 'ok'}). Take it; the new cutoff is ${lastFinish}.`, 4);
    }
  }
  const picked = Array.from(pickedOrig).sort((a, b) => a - b);
  yield frame(intervals, pickedOrig, null, `Done: picked ${picked.length} of ${n} intervals, the largest possible non-overlapping set.`, 4);
  return { picked };
}

export default {
  id: 'interval-scheduling',
  title: 'Interval scheduling',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Greedy Algorithms',
  summary:
    'Given a set of intervals (think: requests to use one shared room, each with a start and finish time), interval scheduling asks for the largest possible subset that does not overlap. ' +
    'The greedy rule is: sort by finish time, and repeatedly take the next interval whose start is at or after the finish time of the last one taken, skipping any interval that would overlap. ' +
    'Why does finishing earliest win? The exchange argument: take any optimal solution, and if its first pick does not finish before the greedy pick does, swap the greedy pick in instead. ' +
    'Since the greedy pick finishes earliest of all, it still leaves at least as much room for everything after it, so the swap never makes the solution worse, and by induction the whole greedy sequence can replace the whole optimal one without losing anything. ' +
    'This "greedy choice is always safe to make first" argument is the template the rest of this module\'s greedy algorithms (Huffman coding, fractional knapsack) reuse.',
  code: CODE,
  complexity: {
    time: 'O(n log n), dominated by the sort; the scan afterward is O(n).',
    why: 'Sorting n intervals by finish time costs O(n log n). The single left-to-right scan that follows does O(1) work per interval (compare its start to the running cutoff), so O(n) total, making the sort the bottleneck.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(31, size));
    const intervals = [];
    for (let k = 0; k < n; k++) {
      const s = randInt(rng, 0, 40);
      const f = s + randInt(rng, 1, 15);
      intervals.push({ s, f });
    }
    return { intervals };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const picked = result.picked;
    const seen = new Set();
    for (const idx of picked) {
      if (idx < 0 || idx >= input.intervals.length || seen.has(idx)) return false;
      seen.add(idx);
    }
    const chosen = picked.map((i) => input.intervals[i]).sort((a, b) => a.f - b.f);
    for (let i = 1; i < chosen.length; i++) if (chosen[i].s < chosen[i - 1].f) return false;
    return picked.length === maxCountDP(input.intervals);
  },
  sandbox: { type: 'n', min: 0, max: 31, default: 10, label: 'intervals' },
};
