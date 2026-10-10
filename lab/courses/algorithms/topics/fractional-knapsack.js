// Fractional knapsack: items can be split, so the greedy rule (always take
// as much as possible of the item with the best value-per-weight ratio) is
// optimal, unlike the 0/1 version a few topics over. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'sort items by value/weight ratio, descending',
  'remaining = capacity, total = 0',
  'for item in sorted items:',
  '  take = min(item.weight, remaining)',
  '  total += take * item.ratio; remaining -= take',
  '  if remaining == 0: break',
];

function frame(items, taken, activeIdx, caption, line) {
  const maxV = Math.max(1, ...items.map((it) => it.value));
  const nodes = items.map((it, i) => ({
    id: String(i),
    label: `w${it.weight}/v${it.value}`,
    x: 6 + (i / items.length) * 90,
    y: 50 - (it.value / maxV) * 40,
    w: Math.max(4, 85 / items.length),
    h: (it.value / maxV) * 40 + 4,
    active: i === activeIdx,
    compare: (taken[i] || 0) > 0,
  }));
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], emptyText: '(no items)' };
}

function* run(input) {
  const items = input.items;
  const n = items.length;
  const capacity = input.capacity;
  if (n === 0) {
    yield frame([], [], null, 'No items.', 0);
    return { fractions: [], total: 0 };
  }
  const order = items.map((_, i) => i).sort((a, b) => items[b].value / items[b].weight - items[a].value / items[a].weight);
  yield frame(items, Array(n).fill(0), null, `Sort ${n} items by value/weight ratio, best first.`, 0);

  let remaining = capacity;
  const fractions = Array(n).fill(0);
  let total = 0;
  for (const i of order) {
    const it = items[i];
    const ratio = it.value / it.weight;
    yield frame(items, fractions, i, `Consider item ${i} (ratio ${ratio.toFixed(2)}). Capacity left: ${remaining}.`, 2);
    const take = Math.min(it.weight, remaining);
    fractions[i] = take / it.weight;
    total += take * ratio;
    remaining -= take;
    yield frame(items, fractions, i, `Take ${take.toFixed(2)} of its ${it.weight} units (${(fractions[i] * 100).toFixed(0)}%). Running total value: ${total.toFixed(2)}.`, 4);
    if (remaining === 0) { yield frame(items, fractions, i, `Knapsack full.`, 5); break; }
  }
  return { fractions, total };
}

// Optimality certificate via the exchange argument: every fully-taken item
// must have ratio >= every partially- or un-taken item's ratio, and at
// most one item is partially taken (the capacity is used exactly, or every
// item was fully taken). That is exactly what makes the greedy choice
// optimal; checking it directly (rather than re-sorting and re-simulating)
// is an independent verification of the result's structure.
function isOptimalFraction(items, capacity, fractions) {
  const n = items.length;
  const weightUsed = items.reduce((s, it, i) => s + it.weight * fractions[i], 0);
  if (weightUsed > capacity + 1e-6) return false;
  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  if (weightUsed < Math.min(capacity, totalWeight) - 1e-6) return false;
  const full = [], partial = [], none = [];
  for (let i = 0; i < n; i++) {
    if (fractions[i] > 1 - 1e-9) full.push(i);
    else if (fractions[i] > 1e-9) partial.push(i);
    else none.push(i);
  }
  if (partial.length > 1) return false;
  const ratio = (i) => items[i].value / items[i].weight;
  for (const f of full) for (const p of partial) if (ratio(f) < ratio(p) - 1e-9) return false;
  for (const f of full) for (const u of none) if (ratio(f) < ratio(u) - 1e-9) return false;
  for (const p of partial) for (const u of none) if (ratio(p) < ratio(u) - 1e-9) return false;
  return true;
}

export default {
  id: 'fractional-knapsack',
  title: 'Fractional knapsack',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Greedy Algorithms',
  summary:
    'The fractional knapsack problem: given items with a weight and a value, and a knapsack with limited capacity, choose how much of each item to take (any fraction allowed) to maximise total value without exceeding the capacity. ' +
    'Because fractions are allowed, the greedy rule is simple and optimal: sort items by value per unit weight, and fill the knapsack from the best ratio down, taking as much of each as fits, until it is full. ' +
    'The exchange argument: if any solution leaves room while skipping some of a better-ratio item in favour of a worse one, swapping a unit of capacity from the worse item to the better one strictly improves total value, so an optimal solution can never do that. ' +
    'This is the fractional cousin of the 0/1 knapsack problem elsewhere in this module; 0/1 (whole items only) does not have this greedy property; and needs dynamic programming instead, which is exactly why these two problems are usually taught side by side.',
  code: CODE,
  complexity: {
    time: 'O(n log n), dominated by sorting the items by ratio.',
    why: 'Sorting n items by value/weight costs O(n log n). The greedy fill afterward is a single O(n) pass. Using a selection algorithm instead of a full sort can bring this down to O(n) expected, but sorting is simpler and already dominates.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(31, size));
    const items = [];
    for (let k = 0; k < n; k++) items.push({ weight: randInt(rng, 1, 15), value: randInt(rng, 1, 50) });
    const capacity = Math.max(5, Math.floor(items.reduce((s, it) => s + it.weight, 0) * 0.5));
    return { items, capacity };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { items, capacity } = input;
    if (items.length === 0) return result.total === 0;
    if (result.fractions.length !== items.length) return false;
    for (const f of result.fractions) if (f < -1e-9 || f > 1 + 1e-9) return false;
    const total = items.reduce((s, it, i) => s + it.value * result.fractions[i], 0);
    if (Math.abs(total - result.total) > 1e-6) return false;
    return isOptimalFraction(items, capacity, result.fractions);
  },
  sandbox: { type: 'n', min: 0, max: 31, default: 10, label: 'items' },
};
