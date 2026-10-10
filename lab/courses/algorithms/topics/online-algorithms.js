// Online algorithms: decisions made one at a time, with no knowledge of
// the future, graded by their competitive ratio (worst case, cost of the
// online algorithm divided by cost of the best algorithm that could see
// the whole future in advance). Two classic examples, picked at random by
// makeInput the same way induction.js alternates between its proof modes:
//   'ski'    - ski rental: rent each day (cost 1) or buy once (cost B) and
//              ski free forever after; the "rent until it would have paid
//              to buy, then buy" rule is 2-competitive.
//   'paging' - paging with a cache of size k: LRU (evict the least
//              recently used page) versus the offline optimum, Belady's
//              algorithm (evict whichever page already in the cache is
//              needed furthest in the future, or never again). LRU is
//              k-competitive.
// No DOM access. CLRS: Online Algorithms (4th ed).
import { randInt } from '../engine/rng.js';

const CODE_SKI = [
  'B = cost to buy; rent costs 1/day',
  'rented = 0',
  'for each day, unknown how many remain:',
  '  if rented == B - 1: buy now (would equal B either way)',
  '  else: rent for a day (cost 1); rented += 1',
];
const CODE_PAGING = [
  'cache of size k, initially empty',
  'for each page request p:',
  '  if p already in the cache: hit, no eviction',
  '  else: miss. if cache is full, evict a page',
  '    LRU: evict the least recently used page',
  '    OPT: evict whichever is needed furthest ahead, or never again',
  '  put p in the cache',
];

function skiFrame(buyCost, days, boughtOnDay, currentDay, caption, line) {
  const nodes = days.map((d, i) => ({
    id: i,
    label: boughtOnDay != null && i === boughtOnDay ? 'BUY' : i < (boughtOnDay != null ? boughtOnDay : days.length) ? 'rent' : '',
    x: 50,
    y: 6 + i * (88 / Math.max(1, days.length)),
    w: 60,
    h: 76 / Math.max(1, days.length),
    active: i === currentDay,
    dim: boughtOnDay != null && i > boughtOnDay,
  })).filter((n) => n.label !== '' || n.active);
  return { kind: 'boxes', code: CODE_SKI, line, caption, nodes, edges: [], emptyText: '(no days)' };
}

function pagingFrame(sequence, idx, cacheLRU, cacheOPT, caption, line) {
  const nodes = [];
  sequence.forEach((p, i) => {
    nodes.push({ id: `req${i}`, label: String(p), x: 6 + (i / Math.max(1, sequence.length - 1)) * 88, y: 10, w: 7, h: 12, active: i === idx });
  });
  cacheLRU.forEach((p, i) => {
    nodes.push({ id: `lru${i}`, label: String(p), x: 15 + i * 12, y: 45, w: 8, h: 10 });
  });
  cacheOPT.forEach((p, i) => {
    nodes.push({ id: `opt${i}`, label: String(p), x: 15 + i * 12, y: 75, w: 8, h: 10 });
  });
  return { kind: 'boxes', code: CODE_PAGING, line, caption, nodes, edges: [], emptyText: '(no requests)' };
}

function* runSki(B, n) {
  let rented = 0;
  let boughtOnDay = null;
  let cost = 0;
  const days = Array.from({ length: n }, (_, i) => i);
  yield skiFrame(B, days, null, -1, `Buying costs ${B}; renting costs 1/day. Ski for ${n} day${n === 1 ? '' : 's'} total (unknown in advance).`, 0);

  for (let day = 0; day < n && boughtOnDay == null; day++) {
    if (rented === B - 1) {
      boughtOnDay = day;
      cost += B;
      yield skiFrame(B, days, boughtOnDay, day, `Day ${day}: have rented ${rented} times (would cost ${B} total either way): buy now for ${B}.`, 3);
    } else {
      rented++;
      cost += 1;
      yield skiFrame(B, days, boughtOnDay, day, `Day ${day}: rent for 1. Rented ${rented} time${rented === 1 ? '' : 's'} so far.`, 4);
    }
  }
  // If days ran out before buying, no more cost is incurred (already paid
  // for every day actually skied).
  const optimalCost = Math.min(B, n);
  yield skiFrame(B, days, boughtOnDay, -1, `Done. Spent ${cost}, versus the best possible (knowing n=${n} in advance) of min(B, n) = ${optimalCost}.`, 0);
  return { mode: 'ski', cost, optimalCost, B, n };
}

function* runPaging(k, sequence) {
  const lru = []; // front = most recently used
  const opt = [];
  let lruMisses = 0, optMisses = 0;

  yield pagingFrame(sequence, -1, lru, opt, `Cache size k=${k}. LRU evicts the least recently used page; OPT (knowing the whole future) evicts whichever cached page is needed furthest ahead, or never again.`, 0);

  for (let i = 0; i < sequence.length; i++) {
    const p = sequence[i];

    const lruIdx = lru.indexOf(p);
    if (lruIdx === -1) {
      lruMisses++;
      if (lru.length >= k) lru.pop(); // evict least recently used (back of the list)
      lru.unshift(p);
    } else {
      lru.splice(lruIdx, 1);
      lru.unshift(p);
    }

    const optIdx = opt.indexOf(p);
    if (optIdx === -1) {
      optMisses++;
      if (opt.length >= k) {
        // Evict whichever cached page's next use is furthest in the
        // future (or never used again): Belady's algorithm, the offline
        // optimum.
        let worst = -1, worstNext = -1;
        for (let c = 0; c < opt.length; c++) {
          let next = sequence.slice(i + 1).indexOf(opt[c]);
          if (next === -1) next = Infinity;
          if (next > worstNext) { worstNext = next; worst = c; }
        }
        opt.splice(worst, 1);
      }
      opt.push(p);
    }

    yield pagingFrame(sequence, i, lru.slice(), opt.slice(), `Request ${p}: LRU cache [${lru.join(', ')}] (${lruMisses} miss${lruMisses === 1 ? '' : 'es'} so far), OPT cache [${opt.join(', ')}] (${optMisses} miss${optMisses === 1 ? '' : 'es'} so far).`, 2);
  }

  yield pagingFrame(sequence, -1, lru, opt, `Done. LRU: ${lruMisses} misses. OPT: ${optMisses} misses. LRU's competitive ratio bound: misses <= k * OPT-misses (here ${lruMisses} <= ${k} * ${optMisses} = ${k * optMisses}).`, 0);
  return { mode: 'paging', lruMisses, optMisses, k, n: sequence.length };
}

function* run(input) {
  if (input.mode === 'ski') return yield* runSki(input.B, input.n);
  return yield* runPaging(input.k, input.sequence);
}

export default {
  id: 'online-algorithms',
  title: 'Online algorithms: ski rental and paging',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Online Algorithms (4th ed)',
  summary:
    'An online algorithm has to commit to each decision as it arrives, with no way to see the future; it is graded by its competitive ratio, the worst-case factor by which it can do worse than an offline algorithm that gets to see the whole input in advance. ' +
    'Ski rental is the simplest example: rent for 1/day or buy once for B and ski free forever after, with no idea in advance how many days are left. ' +
    'The rule "rent until the total rent paid would equal the cost to buy, then buy" is 2-competitive: whichever day skiing actually stops, this rule never spends more than twice what buying on day 1 (the best fixed choice in hindsight) would have cost, and no deterministic rule can guarantee better than 2-competitive against every possible number of days. ' +
    'Paging faces the same kind of blindness: a cache of size k has to decide what to evict on every miss without knowing what gets requested next. ' +
    'LRU (evict the least recently used page) is k-competitive against the offline optimum, Belady\'s algorithm (evict whichever cached page is needed furthest in the future, or never again, which needs to know the whole request sequence up front), and that factor of k is unavoidable for any deterministic paging algorithm with a cache that small.',
  code: CODE_SKI,
  complexity: {
    time: 'Ski rental: O(n) days, O(1) work per day. Paging: O(n) requests, O(k) work per request (checking/evicting from a size-k cache).',
    why: 'Ski rental decides buy-or-rent once per day in constant time, so O(n) total for n days. LRU and OPT each do O(k) work per request (search and possibly evict from a size-k cache); OPT additionally scans the remaining sequence to find the furthest-future use, which this teaching version does naively in O(n) per eviction (a real implementation would track next-use times incrementally).',
  },
  makeInput(rng, size) {
    const mode = rng() < 0.5 ? 'ski' : 'paging';
    if (mode === 'ski') {
      const B = 3 + Math.floor(rng() * 7);
      const n = Math.max(0, Math.min(30, size));
      return { mode, B, n };
    }
    const k = 2 + Math.floor(rng() * 3);
    const alphabetSize = k + 1 + Math.floor(rng() * 2);
    const len = Math.max(0, Math.min(24, size));
    const sequence = Array.from({ length: len }, () => randInt(rng, 0, alphabetSize - 1));
    return { mode, k, sequence };
  },
  run,
  check(input, result) {
    if (!result || result.mode !== input.mode) return false;
    if (input.mode === 'ski') {
      const B = input.B, n = Math.max(0, Math.min(30, input.n));
      const optimalCost = Math.min(B, n);
      if (result.optimalCost !== optimalCost) return false;
      // The 2-competitive guarantee itself: cost <= 2 * optimalCost - 1 for
      // n >= 1 (strict bound), and trivially 0 for n = 0.
      if (n === 0) return result.cost === 0;
      return result.cost <= 2 * optimalCost;
    }
    const k = input.k;
    if (result.optMisses > result.lruMisses && result.lruMisses === 0) return false;
    if (result.optMisses === 0) return result.lruMisses === 0;
    return result.lruMisses <= k * result.optMisses;
  },
  sandbox: { type: 'n', min: 0, max: 30, default: 14, label: 'size' },
};
