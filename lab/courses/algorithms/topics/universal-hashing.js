// Universal hashing: instead of one fixed hash function (which an
// adversary could always find keys to defeat), pick one at random, from a
// family where any two keys collide with probability at most 1/m no
// matter which function gets picked. No DOM access.
const CODE = [
  'pick a, b at random:  1 <= a <= p-1,  0 <= b <= p-1   (p prime, p > every key)',
  'h(k) = ((a*k + b) mod p) mod m',
  'insert(key): slot = h(key); prepend key to table[slot]',
];

const P = 101; // fixed prime, bigger than every key this topic generates (keys are 0..99)

function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

function h(a, b, m, key) {
  return ((a * key + b) % P) % m;
}

function buildBuckets(keys, a, b, m) {
  const buckets = Array.from({ length: m }, () => []);
  for (const k of keys) buckets[h(a, b, m, k)].unshift(k);
  return buckets;
}

function collisionCount(buckets) {
  let c = 0;
  for (const bucket of buckets) c += (bucket.length * (bucket.length - 1)) / 2;
  return c;
}

function tableFrame(buckets, m, { activeSlot = null, activeKey = null, caption, line }) {
  const nodes = [];
  const edges = [];
  for (let s = 0; s < m; s++) nodes.push({ id: `slot${s}`, label: String(s), x: ((s + 0.5) / m) * 100, y: 14, w: 10, h: 10, active: s === activeSlot });
  for (let s = 0; s < m; s++) {
    let prevId = `slot${s}`;
    buckets[s].forEach((key, idx) => {
      const nodeId = `b${s}_${idx}`;
      nodes.push({ id: nodeId, label: String(key), x: ((s + 0.5) / m) * 100, y: 14 + (idx + 1) * 13, w: 10, h: 10, active: key === activeKey && s === activeSlot });
      edges.push([prevId, nodeId]);
      prevId = nodeId;
    });
  }
  return { kind: 'boxes', nodes, edges, emptyText: '(empty table)', caption, line, code: CODE };
}

function* run(input) {
  const { array: keys, m, a1, b1, a2, b2 } = input;
  const buckets1 = Array.from({ length: m }, () => []);
  yield tableFrame(buckets1, m, { caption: `Pick a random hash function from the universal family: h(k) = ((${a1}*k + ${b1}) mod ${P}) mod ${m}.`, line: 1 });
  for (const key of keys) {
    const slot = h(a1, b1, m, key);
    yield tableFrame(buckets1, m, { activeSlot: slot, caption: `Hash ${key}: slot ${slot}.`, line: 1 });
    buckets1[slot].unshift(key);
    yield tableFrame(buckets1, m, { activeSlot: slot, activeKey: key, caption: `Insert ${key} into slot ${slot}.`, line: 2 });
  }
  const collisions1 = collisionCount(buckets1);
  const buckets2 = buildBuckets(keys, a2, b2, m);
  const collisions2 = collisionCount(buckets2);
  yield tableFrame(buckets2, m, {
    caption: `A second, independently chosen hash function h'(k) = ((${a2}*k + ${b2}) mod ${P}) mod ${m} gives ${collisions2} colliding pair${collisions2 === 1 ? '' : 's'}, versus ${collisions1} for the first. Universal hashing guarantees the expected number of collisions stays at most C(n,2)/m for ANY key set, whichever (a, b) get picked.`,
    line: 1,
  });
  return { buckets1, buckets2, collisions1, collisions2, p: P, a1, b1, a2, b2, m };
}

export default {
  id: 'universal-hashing',
  title: 'Universal hashing',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Hash Tables',
  summary:
    'A single fixed hash function, however clever, always has some set of keys that all collide into one slot: an adversary (or just bad luck) who knows the function can always find them. ' +
    'Universal hashing sidesteps this by using a whole family of hash functions, h(k) = ((a*k + b) mod p) mod m for a prime p bigger than any key, and picking a and b at random fresh each time a table is built. ' +
    'The family\'s defining property is that for any two distinct keys, the chance a randomly picked function sends them to the same slot is at most 1/m, the same as if the slots were assigned by pure chance. ' +
    'That holds for every possible key set, since the randomness is in which function gets chosen, not in the keys. ' +
    'The payoff (Carter and Wegman\'s theorem) is that the expected number of colliding pairs among n keys is at most C(n,2)/m, giving the same O(1 + load factor) average performance chaining promises, now guaranteed on average no matter what the keys are.',
  code: CODE,
  complexity: {
    time: 'O(1 + alpha) expected, same as ordinary chaining with a good hash function, but guaranteed in expectation for every possible key set.',
    why: 'The universal property bounds the probability any two specific keys collide at 1/m, so summing over all C(n,2) pairs bounds the expected total number of colliding pairs by C(n,2)/m. With m roughly proportional to n, that keeps the expected chain length O(1), and this bound holds regardless of which keys get inserted, unlike a single fixed hash function.',
  },
  makeInput(rng, size) {
    const m = 7;
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * 100));
    const a1 = 1 + Math.floor(rng() * (P - 1));
    const b1 = Math.floor(rng() * P);
    const a2 = 1 + Math.floor(rng() * (P - 1));
    const b2 = Math.floor(rng() * P);
    return { array, m, a1, b1, a2, b2 };
  },
  run,
  check(input, result) {
    if (!result || result.p !== P || result.m !== input.m) return false;
    if (!(result.a1 >= 1 && result.a1 <= P - 1 && result.b1 >= 0 && result.b1 <= P - 1)) return false;
    if (!(result.a2 >= 1 && result.a2 <= P - 1 && result.b2 >= 0 && result.b2 <= P - 1)) return false;
    if (!isPrime(P) || input.array.some((k) => k >= P)) return false;
    const expectedBuckets1 = buildBuckets(input.array, input.a1, input.b1, input.m);
    const expectedBuckets2 = buildBuckets(input.array, input.a2, input.b2, input.m);
    for (let s = 0; s < input.m; s++) {
      if (result.buckets1[s].join(',') !== expectedBuckets1[s].join(',')) return false;
      if (result.buckets2[s].join(',') !== expectedBuckets2[s].join(',')) return false;
    }
    return result.collisions1 === collisionCount(expectedBuckets1) && result.collisions2 === collisionCount(expectedBuckets2);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
