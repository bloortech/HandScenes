// CLRS's GREEDY-SET-COVER (35.3): repeatedly pick the set that covers the
// most still-uncovered elements, until the whole universe is covered.
// No DOM access.
const CODE = [
  'U = universe; C = {} (chosen sets); covered = {}',
  'while covered != U:',
  '  pick the set S maximising |S \\ covered|',
  '  C = C union {S}; covered = covered union S',
  'return C',
];

function frame(universeSize, sets, chosen, covered, candidate, caption, line) {
  const nodes = sets.map((s, i) => ({
    id: i,
    label: `S${i + 1} = {${s.join(',')}}`,
    x: 50,
    y: 4 + (i + 0.5) * (84 / Math.max(1, sets.length)),
    w: 90,
    h: 78 / Math.max(1, sets.length),
    active: chosen.has(i),
    compare: candidate === i,
  }));
  const pointers = [{ x: 50, y: 95, text: `covered: {${[...covered].sort((a, b) => a - b).join(',')}} / ${universeSize}` }];
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges: [], pointers, emptyText: '(no sets)' };
}

function greedySetCover(universeSize, sets) {
  const covered = new Set();
  const chosen = [];
  const universe = new Set(Array.from({ length: universeSize }, (_, i) => i));
  const steps = [];
  while (covered.size < universeSize) {
    let bestIdx = -1, bestGain = -1;
    for (let i = 0; i < sets.length; i++) {
      if (chosen.includes(i)) continue;
      const gain = sets[i].filter((x) => !covered.has(x)).length;
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }
    if (bestIdx === -1 || bestGain === 0) break; // no further progress possible (universe not fully coverable by these sets)
    chosen.push(bestIdx);
    for (const x of sets[bestIdx]) covered.add(x);
    steps.push({ chosenIdx: bestIdx, covered: new Set(covered) });
  }
  void universe;
  return { chosen, covered, steps, fullyCovered: covered.size === universeSize };
}

function bruteForceMinSetCover(universeSize, sets) {
  const universe = (1 << universeSize) - 1;
  const masks = sets.map((s) => s.reduce((m, x) => m | (1 << x), 0));
  for (let size = 1; size <= sets.length; size++) {
    const idx = Array.from({ length: sets.length }, (_, i) => i);
    let best = null;
    (function combo(start, chosen) {
      if (best) return;
      if (chosen.length === size) {
        const u = chosen.reduce((m, i) => m | masks[i], 0);
        if (u === universe) best = chosen.slice();
        return;
      }
      for (let i = start; i < idx.length; i++) combo(i + 1, [...chosen, i]);
    })(0, []);
    if (best) return best.length;
  }
  return sets.length;
}

function* run(input) {
  const { universeSize, sets } = input;
  const result = greedySetCover(universeSize, sets);

  yield frame(universeSize, sets, new Set(), new Set(), null, `Universe of ${universeSize} elements, ${sets.length} candidate set(s).`, 0);
  const chosenSoFar = new Set();
  const coveredSoFar = new Set();
  for (const step of result.steps) {
    yield frame(universeSize, sets, chosenSoFar, coveredSoFar, step.chosenIdx, `Pick S${step.chosenIdx + 1}: it covers the most new elements right now.`, 2);
    chosenSoFar.add(step.chosenIdx);
    for (const x of sets[step.chosenIdx]) coveredSoFar.add(x);
    yield frame(universeSize, sets, chosenSoFar, coveredSoFar, null, `Covered so far: ${coveredSoFar.size}/${universeSize}.`, 3);
  }
  yield frame(universeSize, sets, chosenSoFar, coveredSoFar, null, `Done. Chose ${result.chosen.length} set(s): {${result.chosen.map((i) => `S${i + 1}`).join(', ')}}.`, 4);

  return { chosenCount: result.chosen.length, fullyCovered: result.fullyCovered, universeSize, setsCount: sets.length };
}

export default {
  id: 'set-cover-greedy',
  title: 'Greedy set cover',
  module: 'm11',
  course: 'CSC363/463, CSC373',
  clrs: 'Approximation Algorithms',
  summary:
    'Set Cover asks for the fewest sets, from a given family, whose union is the whole universe of elements. Optimal set cover is NP-hard, but greedily picking, at every step, whichever remaining set covers the most still-uncovered elements gets surprisingly close. ' +
    'Call the optimal number of sets k. The greedy choice always covers at least a 1/k fraction of whatever is still uncovered (since the optimal k sets together cover everything, some one of them must cover at least 1/k of the remainder, and greedy picks the single best set available, which is at least that good). ' +
    'That shrinks the uncovered amount by a factor of (1 - 1/k) every round, which works out to needing at most k * ln(n) rounds to finish, for a universe of n elements: an H(n)-approximation (H(n) is the n-th harmonic number, about ln(n)), not a constant factor like vertex cover gets, but still a guarantee, and the best possible one for Set Cover unless P = NP. ' +
    'This sandbox runs the greedy choice on a real universe and family of sets and checks the result actually covers everything and never uses dramatically more sets than brute-force optimal allows.',
  code: CODE,
  complexity: {
    time: 'O(k * m * n) for k rounds, m sets, n universe elements (recomputing every set\'s remaining gain each round); O(sum of set sizes) per round with a smarter priority queue.',
    why: 'Each round scans every remaining set to find the one with the biggest remaining gain, which costs O(m * n) per round in the simplest implementation; the number of rounds is at most min(k * ln(n), m), which is why the straightforward nested-loop version used here stays fast for the sizes this course animates.',
  },
  makeInput(rng, size) {
    const universeSize = Math.max(0, Math.min(8, size));
    const numSets = Math.max(2, Math.min(6, universeSize + 1));
    // Guarantee coverability: first, a random partition-like cover so every
    // element is in at least one set, then a few more random sets layered
    // on top so greedy has real choices to make.
    const sets = Array.from({ length: numSets }, () => []);
    for (let x = 0; x < universeSize; x++) {
      const s = Math.floor(rng() * numSets);
      sets[s].push(x);
    }
    for (let s = 0; s < numSets; s++) {
      for (let x = 0; x < universeSize; x++) {
        if (rng() < 0.25 && !sets[s].includes(x)) sets[s].push(x);
      }
      sets[s].sort((a, b) => a - b);
    }
    return { universeSize, sets: sets.filter((s) => s.length > 0) };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { universeSize, sets } = input;
    if (!result.fullyCovered) return false;
    if (sets.length === 0) return universeSize === 0;
    if (universeSize > 16) return true; // too big to brute-force the optimum
    const opt = bruteForceMinSetCover(universeSize, sets);
    const harmonic = 1 + Math.log(universeSize || 1);
    return result.chosenCount <= Math.max(opt, Math.ceil(opt * harmonic) + 1);
  },
  sandbox: { type: 'n', min: 1, max: 8, default: 5, label: 'universe size' },
};
