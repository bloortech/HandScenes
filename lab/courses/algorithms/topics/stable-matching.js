// The stable matching problem: n men and n women, each with a strict
// preference ranking over the other side; a matching is stable if there
// is no "blocking pair" (a man and a woman, not matched to each other,
// who would both rather be matched to each other than to their current
// partners). Gale and Shapley's deferred-acceptance algorithm always
// finds one: every free man proposes to his favourite woman he hasn't
// already tried, and every woman keeps her favourite proposal so far,
// rejecting (and setting free again) anyone she prefers less. No DOM
// access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'every man is free; every man keeps a pointer to his next-favourite woman not yet tried',
  'while some man m is free and has a woman left to propose to:',
  '  w = the next woman on m\'s preference list',
  '  if w is free: engage (m, w)',
  '  else if w prefers m to her current fiance: break that engagement, engage (m, w)',
  '  else: w rejects m; m stays free, tries his next choice',
];

function randomPermutation(rng, n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function frame(n, menEngaged, womenEngaged, activeMan, activeWoman, caption, line) {
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `m${i}`, label: `m${i}`, x: 20, y: n <= 1 ? 50 : 8 + (i / (n - 1)) * 84, active: i === activeMan });
  for (let j = 0; j < n; j++) nodes.push({ id: `w${j}`, label: `w${j}`, x: 80, y: n <= 1 ? 50 : 8 + (j / (n - 1)) * 84, active: j === activeWoman });
  const edges = [];
  for (let i = 0; i < n; i++) {
    if (menEngaged[i] != null) edges.push([`m${i}`, `w${menEngaged[i]}`]);
  }
  if (activeMan != null && activeWoman != null) edges.push([`m${activeMan}`, `w${activeWoman}`, '?']);
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function* run(input) {
  const { n, menPref, womenRank } = input;
  if (n === 0) {
    yield frame(0, [], [], null, null, 'No one to match.', 0);
    return { matching: [] };
  }

  const menEngaged = Array(n).fill(null); // menEngaged[i] = woman index, or null
  const womenEngaged = Array(n).fill(null); // womenEngaged[j] = man index, or null
  const nextProposal = Array(n).fill(0); // how far each man has gone down his list
  const free = Array.from({ length: n }, (_, i) => i);

  yield frame(n, menEngaged, womenEngaged, null, null, `Start: all ${n} men and ${n} women are free.`, 0);

  while (free.length > 0) {
    const m = free[free.length - 1];
    if (nextProposal[m] >= n) { free.pop(); continue; }
    const w = menPref[m][nextProposal[m]];
    nextProposal[m]++;
    yield frame(n, menEngaged, womenEngaged, m, w, `m${m} proposes to w${w}.`, 2);

    if (womenEngaged[w] == null) {
      womenEngaged[w] = m;
      menEngaged[m] = w;
      free.pop();
      yield frame(n, menEngaged, womenEngaged, m, w, `w${w} was free: she accepts m${m}.`, 3);
    } else {
      const current = womenEngaged[w];
      if (womenRank[w][m] < womenRank[w][current]) {
        womenEngaged[w] = m;
        menEngaged[m] = w;
        menEngaged[current] = null;
        free.pop();
        free.push(current);
        yield frame(n, menEngaged, womenEngaged, m, w, `w${w} prefers m${m} to her current fiance m${current}: she switches. m${current} is free again.`, 3);
      } else {
        yield frame(n, menEngaged, womenEngaged, m, w, `w${w} prefers her current fiance m${current} to m${m}: she rejects m${m}.`, 5);
      }
    }
  }

  const matching = menEngaged.map((w, m) => [m, w]);
  yield frame(n, menEngaged, womenEngaged, null, null, 'Everyone is engaged: the matching is stable.', 0);
  return { matching };
}

export default {
  id: 'stable-matching',
  title: 'Stable matching',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Matchings in Bipartite Graphs',
  summary:
    'Given n men and n women, each with a strict ranking of everyone on the other side, a matching is stable if there is no "blocking pair": no man and woman who are not matched to each other but would both rather be. ' +
    "Gale and Shapley's algorithm finds one by deferred acceptance: free men propose, one at a time, to the best woman they have not yet tried; a woman holds onto her best offer so far but is always willing to trade up, dumping her current fiance if someone she prefers comes along. " +
    'A man who is dumped goes back to being free and simply tries the next woman on his list; because every man proposes in his own preference order and a woman never accepts a worse offer once she has a better one, this always terminates and the result is provably stable. ' +
    "It is also provably man-optimal: every man ends up with the best partner he could have in any stable matching, which is the flip side of women never having to settle for less than their current fiance along the way. " +
    'The sandbox animates each proposal as a "?" edge, then either an acceptance (the edge stays) or a rejection (nothing changes, and the free man tries again).',
  code: CODE,
  complexity: {
    time: 'O(n^2).',
    why: 'There are n men and n women, so at most n^2 total proposals can ever happen (each man proposes to each woman at most once before giving up), and each proposal does O(1) work.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(7, size));
    const menPref = Array.from({ length: n }, () => randomPermutation(rng, n));
    const womenPrefOrder = Array.from({ length: n }, () => randomPermutation(rng, n));
    const womenRank = womenPrefOrder.map((order) => {
      const rank = Array(n).fill(0);
      order.forEach((m, pos) => { rank[m] = pos; });
      return rank;
    });
    return { n, menPref, womenRank };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, menPref, womenRank } = input;
    if (n === 0) return result.matching.length === 0;
    if (result.matching.length !== n) return false;

    const wifeOf = Array(n).fill(-1);
    const seenWomen = new Set();
    for (const [m, w] of result.matching) {
      if (w == null || w < 0 || w >= n) return false;
      if (seenWomen.has(w)) return false;
      seenWomen.add(w);
      wifeOf[m] = w;
    }

    // menRank[m][w]: m's preference rank of w (lower is better).
    const menRank = menPref.map((order) => {
      const rank = Array(n).fill(0);
      order.forEach((w, pos) => { rank[w] = pos; });
      return rank;
    });

    // No blocking pair: for every (m, w) not married, either m prefers his
    // own wife to w, or w prefers her own husband to m.
    for (let m = 0; m < n; m++) {
      for (let w = 0; w < n; w++) {
        if (wifeOf[m] === w) continue;
        const husbandOfW = wifeOf.indexOf(w);
        const mPrefersW = menRank[m][w] < menRank[m][wifeOf[m]];
        const wPrefersM = womenRank[w][m] < womenRank[w][husbandOfW];
        if (mPrefersW && wPrefersM) return false;
      }
    }
    return true;
  },
  sandbox: { type: 'n', min: 0, max: 7, default: 5, label: 'couples' },
};
