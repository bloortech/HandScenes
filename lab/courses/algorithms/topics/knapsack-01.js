// 0/1 knapsack: each item is taken whole or not at all, so the greedy
// "best ratio first" rule from fractional knapsack no longer works (a
// counterexample: two items that barely fit together can lose to one big
// high-ratio item that wastes capacity). Solved with the classic DP table
// dp[i][w] = best value using the first i items with capacity w. No DOM.
import { randInt } from '../engine/rng.js';

const CODE = [
  'dp[0][w] = 0 for all w',
  'for i in 1..n:',
  '  for w in 0..capacity:',
  '    dp[i][w] = dp[i-1][w]',
  '    if weight[i] <= w: dp[i][w] = max(dp[i][w], value[i] + dp[i-1][w - weight[i]])',
  'return dp[n][capacity]',
];

function bruteBest(items, capacity) {
  const n = items.length;
  let best = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    let w = 0, v = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { w += items[i].weight; v += items[i].value; }
    if (w <= capacity && v > best) best = v;
  }
  return best;
}

function tableFrame(dp, i, n, capacity, activeCell, caption, line) {
  const rows = i + 1;
  const cols = capacity + 1;
  const cellW = Math.min(90 / cols, 14);
  const cellH = Math.min(80 / (n + 1), 10);
  const nodes = [];
  for (let r = 0; r <= i; r++) {
    for (let c = 0; c <= capacity; c++) {
      nodes.push({
        id: `${r}_${c}`,
        label: String(dp[r][c]),
        x: 6 + (c + 0.5) * cellW,
        y: 6 + (r + 0.5) * cellH,
        w: cellW * 0.9, h: cellH * 0.9,
        active: activeCell && activeCell[0] === r && activeCell[1] === c,
      });
    }
  }
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no items)' };
}

function* run(input) {
  const items = input.items;
  const capacity = input.capacity;
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));
  if (n === 0 || capacity === 0) {
    yield tableFrame(dp, n, n, capacity, null, 'Nothing to fill (no items or zero capacity).', 0);
    return { best: 0, dp };
  }
  yield tableFrame(dp, 0, n, capacity, null, 'Row 0 (no items available): best value is always 0.', 0);

  for (let i = 1; i <= n; i++) {
    const it = items[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (it.weight <= w) dp[i][w] = Math.max(dp[i][w], it.value + dp[i - 1][w - it.weight]);
      yield tableFrame(dp, i, n, capacity, [i, w], `Item ${i} (w=${it.weight}, v=${it.value}), capacity ${w}: dp[${i}][${w}] = ${dp[i][w]}.`, 4);
    }
  }
  yield tableFrame(dp, n, n, capacity, [n, capacity], `Done: dp[${n}][${capacity}] = ${dp[n][capacity]}.`, 5);

  // Reconstruct which items were taken.
  const taken = [];
  let w = capacity;
  for (let i = n; i >= 1; i--) {
    if (dp[i][w] !== dp[i - 1][w]) { taken.push(i - 1); w -= items[i - 1].weight; }
  }
  taken.reverse();
  return { best: dp[n][capacity], taken };
}

export default {
  id: 'knapsack-01',
  title: '0/1 knapsack',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Dynamic Programming',
  summary:
    'The 0/1 knapsack problem: each item has a weight and a value, the knapsack has a fixed capacity, and every item is taken whole or left out entirely (no fractions, unlike the fractional knapsack elsewhere in this module). ' +
    'This small change breaks the greedy "best ratio first" rule: taking a whole item can waste leftover capacity that two other items together would have filled better. ' +
    'The fix is dynamic programming: dp[i][w] is the best value achievable using only the first i items with capacity w. Item i either goes in (its value plus the best solution for the remaining capacity among the first i-1 items) or stays out (the best solution for the first i-1 items at the same capacity); taking the better of those fills in the whole table row by row. ' +
    'The amber cell traces exactly that choice at each (item, capacity) pair; the final answer is the bottom-right corner, and walking back through which choice achieved each cell recovers the actual set of items taken.',
  code: CODE,
  complexity: {
    time: 'O(n * capacity), the size of the DP table, each cell O(1) to fill.',
    why: 'There are (n+1) * (capacity+1) table cells, and each one does O(1) work: look up two previous cells, compare, and take the max. This is pseudo-polynomial, not polynomial in the input size, since capacity can be exponentially large relative to the number of bits used to write it down, which is why 0/1 knapsack is still NP-hard in general even though this table runs fast for small capacities.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(16, size));
    const items = [];
    for (let k = 0; k < n; k++) items.push({ weight: randInt(rng, 1, 5), value: randInt(rng, 1, 30) });
    // Capped at 16 so the DP table's columns stay wide enough to read in
    // the sandbox; the DP itself has no trouble with a larger capacity.
    const capacity = Math.min(16, Math.max(1, Math.floor(items.reduce((s, it) => s + it.weight, 0) * 0.5))) || 1;
    return { items, capacity: n === 0 ? 0 : capacity };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { items, capacity } = input;
    if (items.length === 0 || capacity === 0) return result.best === 0;
    const seen = new Set();
    let w = 0, v = 0;
    for (const idx of result.taken) {
      if (idx < 0 || idx >= items.length || seen.has(idx)) return false;
      seen.add(idx);
      w += items[idx].weight;
      v += items[idx].value;
    }
    if (w > capacity) return false;
    if (v !== result.best) return false;
    return result.best === bruteBest(items, capacity);
  },
  sandbox: { type: 'n', min: 0, max: 16, default: 8, label: 'items' },
};
