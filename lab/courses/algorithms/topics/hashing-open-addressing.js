// Hashing with open addressing: every key lives directly in the table
// itself (no chains), found by probing a sequence of candidate slots when
// there's a collision. Three probe sequences, picked at random per run
// (like recursion-stack/induction's "pick a mode" pattern): linear,
// quadratic, and double hashing. No DOM access.
const CODE = [
  'insert(key):',
  '  h1 = key mod m',
  '  for i from 0 to m-1:',
  '    slot = probe(h1, i)       # depends on the mode (see below)',
  '    if table[slot] is empty: place key there; done',
  '  // linear:    probe(h1, i) = (h1 + i) mod m',
  '  // quadratic: probe(h1, i) = (h1 + i*i) mod m',
  '  // double:    probe(h1, i) = (h1 + i*h2) mod m,  h2 = 1 + (key mod (m-1))',
];

function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
function nextPrime(n) {
  let m = Math.max(2, Math.ceil(n));
  while (!isPrime(m)) m++;
  return m;
}

function probeSlot(mode, h1, h2, m, i) {
  if (mode === 'linear') return (h1 + i) % m;
  if (mode === 'quadratic') return (h1 + i * i) % m;
  return (h1 + i * h2) % m; // double
}

function modeLabel(mode) {
  return mode === 'linear' ? 'linear probing' : mode === 'quadratic' ? 'quadratic probing' : 'double hashing';
}

function frame(table, m, { probeIdx = null, activeSlot = null, caption, line }) {
  const nodes = [];
  for (let s = 0; s < m; s++) {
    nodes.push({
      id: `s${s}`,
      label: table[s] == null ? String(s) : String(table[s]),
      x: ((s + 0.5) / m) * 100,
      y: 50,
      w: Math.max(4, Math.min(10, 90 / m)),
      h: 20,
      compare: s === probeIdx,
      active: s === activeSlot,
    });
  }
  return { kind: 'boxes', nodes, edges: [], emptyText: '(empty table)', caption, line, code: CODE };
}

function* run(input) {
  const { array: keys, m, mode } = input;
  const table = new Array(m).fill(null);
  const records = [];
  yield frame(table, m, { caption: `Starting from an empty table of ${m} slots, using ${modeLabel(mode)}.`, line: 0 });

  for (const key of keys) {
    const h1 = key % m;
    const h2 = mode === 'double' ? 1 + (key % (m - 1)) : null;
    let probes = 0, slot = null;
    for (let i = 0; i < m; i++) {
      const cand = probeSlot(mode, h1, h2, m, i);
      probes++;
      if (table[cand] == null) {
        slot = cand;
        break;
      }
      yield frame(table, m, { probeIdx: cand, caption: `Probe slot ${cand} for key ${key} (attempt ${probes}): already occupied by ${table[cand]}.`, line: 2 });
    }
    if (slot == null) {
      records.push({ key, slot: -1, probes });
      continue;
    }
    table[slot] = key;
    records.push({ key, slot, probes });
    yield frame(table, m, { activeSlot: slot, caption: `Place ${key} in slot ${slot} after ${probes} probe${probes === 1 ? '' : 's'}.`, line: 3 });
  }

  const loadFactor = keys.length / m;
  yield frame(table, m, { caption: `Done. Load factor (keys / slots) = ${keys.length}/${m} = ${loadFactor.toFixed(2)}.`, line: 0 });
  return { table, m, mode, records, loadFactor };
}

export default {
  id: 'hashing-open-addressing',
  title: 'Hashing with open addressing',
  module: 'm04',
  course: 'CSC263/265',
  clrs: 'Hash Tables',
  summary:
    'Open addressing stores every key directly inside the table array itself, with no linked chains: when a slot is already taken, it probes a sequence of other candidate slots until it finds an empty one. ' +
    'Linear probing just tries the next slot, then the next, which is simple but tends to form clusters of occupied slots that make later insertions probe even longer (primary clustering). ' +
    'Quadratic probing jumps by i^2 instead of i, scattering the probe sequence enough to avoid most of that clustering, as long as the table size is prime and stays under half full. ' +
    'Double hashing uses a second hash function to pick the step size itself, so two keys with the same first hash still probe completely different sequences, avoiding clustering almost entirely. ' +
    'Open addressing needs the table to always have at least one empty slot (the load factor can never reach 1), unlike chaining, which keeps working however full it gets.',
  code: CODE,
  complexity: {
    time: 'O(1/(1-alpha)) expected probes per insert or search, where alpha = n/m is the load factor (assuming uniform hashing).',
    why: 'Each probe either lands on an empty slot (success) or a full one (keep going); under the uniform hashing assumption, the expected number of probes before hitting an empty slot is 1/(1-alpha). As the table approaches full (alpha close to 1), this blows up, which is exactly why open addressing always keeps some slots free, unlike chaining.',
  },
  makeInput(rng, size) {
    const m = nextPrime(Math.max(5, size * 2 + 1));
    const array = [];
    for (let i = 0; i < size; i++) array.push(Math.floor(rng() * 100));
    const modes = ['linear', 'quadratic', 'double'];
    const mode = modes[Math.floor(rng() * modes.length)];
    return { array, m, mode };
  },
  run,
  check(input, result) {
    if (!result || result.m !== input.m || result.mode !== input.mode) return false;
    if (!Array.isArray(result.table) || result.table.length !== input.m) return false;
    const placed = result.table.filter((x) => x != null).sort((a, b) => a - b);
    const expectedKeys = input.array.slice().sort((a, b) => a - b);
    if (placed.join(',') !== expectedKeys.join(',')) return false;
    const seenSlots = new Set();
    for (const rec of result.records) {
      if (rec.slot === -1) return false; // the load factor is kept below 1, this should never happen
      if (seenSlots.has(rec.slot)) return false;
      seenSlots.add(rec.slot);
      const h1 = rec.key % input.m;
      const h2 = input.mode === 'double' ? 1 + (rec.key % (input.m - 1)) : null;
      const expectedSlot = probeSlot(input.mode, h1, h2, input.m, rec.probes - 1);
      if (expectedSlot !== rec.slot) return false;
    }
    return Math.abs(result.loadFactor - input.array.length / input.m) < 1e-9;
  },
  sandbox: { type: 'array', min: 0, max: 15, default: 8 },
};
