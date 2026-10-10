// Hashing with chaining: each table slot holds a linked list of the keys
// that hashed there. No DOM access. Drawn with `kind: 'boxes'`: one box per
// slot in a row, with a chain of key boxes hanging below each occupied
// slot (reusing the same boxes/edges shape linked-list.js uses).
const CODE = [
  'insert(key):',
  '  slot = h(key) = key mod m',
  '  prepend key to the linked list at table[slot]',
];

function frame(buckets, m, { activeSlot = null, activeKey = null, caption, line }) {
  const nodes = [];
  const edges = [];
  for (let s = 0; s < m; s++) {
    nodes.push({ id: `slot${s}`, label: String(s), x: ((s + 0.5) / m) * 100, y: 14, w: 10, h: 10, active: s === activeSlot });
  }
  for (let s = 0; s < m; s++) {
    let prevId = `slot${s}`;
    buckets[s].forEach((key, idx) => {
      const nodeId = `b${s}_${idx}`;
      nodes.push({
        id: nodeId,
        label: String(key),
        x: ((s + 0.5) / m) * 100,
        y: 14 + (idx + 1) * 13,
        w: 10,
        h: 10,
        active: key === activeKey && s === activeSlot,
      });
      edges.push([prevId, nodeId]);
      prevId = nodeId;
    });
  }
  return { kind: 'boxes', nodes, edges, emptyText: '(empty table)', caption, line, code: CODE };
}

function* run(input) {
  const m = input.m;
  const buckets = Array.from({ length: m }, () => []);
  yield frame(buckets, m, { caption: `Starting from an empty table of ${m} slots.`, line: 0 });
  for (const key of input.array) {
    const slot = key % m;
    yield frame(buckets, m, { activeSlot: slot, caption: `Hash ${key}: ${key} mod ${m} = ${slot}.`, line: 1 });
    buckets[slot].unshift(key);
    yield frame(buckets, m, { activeSlot: slot, activeKey: key, caption: `Prepend ${key} to the chain at slot ${slot}.`, line: 2 });
  }
  const loadFactor = input.array.length / m;
  yield frame(buckets, m, { caption: `Done. Load factor (keys / slots) = ${input.array.length}/${m} = ${loadFactor.toFixed(2)}.`, line: 0 });
  return { buckets, m, loadFactor };
}

export default {
  id: 'hashing-chaining',
  title: 'Hashing with chaining',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Hash Tables',
  summary:
    'A hash table with chaining keeps a fixed-size array of slots, where slot i holds a linked list of every key whose hash landed on i. ' +
    'Inserting a key just hashes it and prepends it to that slot\'s list, an O(1) operation regardless of how full the table is. ' +
    'Searching has to walk that one slot\'s whole list comparing each key, so it costs O(1 + load factor) on average, where the load factor is the number of keys divided by the number of slots. ' +
    'A good hash function spreads keys evenly across slots, keeping every chain short; a bad one (or an unlucky key set) can pile everything into one slot and degrade to a single linked list, O(n). ' +
    'This demo uses the simplest possible hash, key mod m, which is enough to show chaining itself but is easy to defeat with an adversarial key set, which is exactly why real hash tables use something closer to universal hashing.',
  code: CODE,
  complexity: {
    time: 'O(1 + alpha) expected for search, insert, delete, where alpha = n/m is the load factor.',
    why: 'Insert only ever touches one slot and prepends, O(1). Search (and delete) have to scan the whole chain at their slot, which has expected length alpha under simple uniform hashing (every key equally likely to land in any slot). Keeping m roughly proportional to n keeps alpha = O(1), so every operation stays O(1) on average.',
  },
  makeInput(rng, size) {
    const m = 7;
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * 50));
    return { array, m };
  },
  run,
  check(input, result) {
    if (!result || result.m !== input.m) return false;
    const expected = Array.from({ length: input.m }, () => []);
    for (const key of input.array) expected[key % input.m].unshift(key);
    for (let s = 0; s < input.m; s++) {
      if (result.buckets[s].length !== expected[s].length) return false;
      for (let i = 0; i < expected[s].length; i++) {
        if (result.buckets[s][i] !== expected[s][i]) return false;
      }
    }
    return Math.abs(result.loadFactor - input.array.length / input.m) < 1e-9;
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
