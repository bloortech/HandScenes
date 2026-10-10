// Dynamic arrays: doubling capacity when full. No DOM access. Shows the
// same run through three different amortised-analysis lenses at once
// (CLRS: Amortized Analysis, the dynamic table section): the aggregate
// method (total cost / n), the accounting method (charge a flat fee per
// push, bank the leftover as credit), and the potential method (a
// potential function that pays for the expensive steps out of the slack
// it stored during the cheap ones). All three must agree the amortised
// cost per push is O(1), even though an individual doubling push is O(n).
const CODE = [
  'push(value):',
  '  if size == capacity:',
  '    capacity = (capacity == 0) ? 1 : capacity * 2',
  '    copy all size elements into the new array   # the expensive step',
  '  array[size] = value; size += 1',
];

// The accounting method's flat per-push charge. CLRS proves 3 is enough to
// keep the bank balance non-negative forever under doubling: 1 pays for
// this element's own placement, 1 is banked for this element's own future
// move, and 1 is banked to help pay for some other element's future move.
const CHARGE = 3;

function potential(size, capacity) {
  // Phi = 2*size - capacity. Zero right after a resize (size==capacity),
  // and it grows back up to capacity again by the time the array refills,
  // which is exactly the slack the next doubling needs to pay for itself.
  return 2 * size - capacity;
}

function frame(array, capacity, { activeIdx, caption, line, counters }) {
  const slots = Array.from({ length: capacity }, (_, i) => (i < array.length ? array[i] : 0));
  return {
    array: slots,
    activeIdx,
    sortedIdx: Array.from({ length: Math.max(0, capacity - array.length) }, (_, i) => array.length + i),
    labels: slots.map((_, i) => (i < array.length ? String(i) : '-')),
    caption,
    line,
    code: CODE,
    counters,
  };
}

function* run(input) {
  let capacity = 0;
  const array = [];
  let totalActual = 0;
  let totalCharged = 0;
  let bank = 0;
  let minBank = 0;
  let phi = potential(0, 0);

  const counters = () => ({
    aggregate: (totalActual / Math.max(1, array.length)).toFixed(2),
    accounting: bank,
    potential: phi,
  });

  if (input.array.length === 0) {
    yield frame(array, capacity, { caption: 'An empty dynamic array: no capacity yet.', line: 0, counters: counters() });
  }

  for (const v of input.array) {
    let cost;
    if (array.length === capacity) {
      const oldCapacity = capacity;
      capacity = capacity === 0 ? 1 : capacity * 2;
      cost = oldCapacity + 1; // copy every old element, plus placing the new one
      yield frame(array, oldCapacity, { caption: `Push ${v}: full at capacity ${oldCapacity}. Double to ${capacity} and copy all ${oldCapacity} elements over.`, line: 2, counters: counters() });
    } else {
      cost = 1;
    }
    const phiBefore = phi;
    array.push(v);
    phi = potential(array.length, capacity);
    totalActual += cost;
    totalCharged += CHARGE;
    bank += CHARGE - cost;
    minBank = Math.min(minBank, bank);
    yield frame(array, capacity, {
      activeIdx: array.length - 1,
      caption: `Place ${v} at index ${array.length - 1} (actual cost ${cost}). Aggregate running average ${(totalActual / array.length).toFixed(2)}/push; accounting bank ${bank}; potential ${phiBefore} -> ${phi}.`,
      line: 4,
      counters: counters(),
    });
  }

  return {
    values: array.slice(),
    capacity,
    totalActual,
    totalCharged,
    finalBank: bank,
    minBank,
    finalPotential: phi,
  };
}

export default {
  id: 'dynamic-array',
  title: 'Dynamic arrays',
  module: 'm05',
  course: 'CSC263/265, CSC473',
  clrs: 'Amortized Analysis (the dynamic table section)',
  summary:
    'A dynamic array (a plain fixed-size array underneath) grows by doubling its capacity whenever it fills up, copying every existing element into the new, bigger array. ' +
    'That copy is expensive, O(n), but it only happens O(log n) times total as the array grows to size n, so the total cost of n pushes is O(n), an O(1) amortised cost per push even though individual pushes are not all equally cheap. ' +
    'Three ways to prove that: the aggregate method just divides total cost by n operations. ' +
    'The accounting method charges every push a flat fee (here, 3) that is more than its usual O(1) cost, banking the extra as credit on the array, and proves the bank balance never goes negative, so the flat fee really did cover every doubling. ' +
    'The potential method defines a single number from the array\'s current state, here 2*size - capacity, that is zero right after a resize and climbs back up as the array refills, exactly matching the slack the next doubling will need, and its ups and downs make every push look amortised-cheap no matter what the actual cost was that step.',
  code: CODE,
  complexity: {
    time: 'O(1) amortised per push; O(n) worst case for the one push that triggers a doubling.',
    why: 'Doubling means the i-th resize happens after capacity 2^(i-1) fills, so resizes happen only O(log n) times by size n, and the k-th resize costs O(2^k). The total cost of all resizes up to n is a geometric series bounded by O(n), so spread over n pushes that is O(1) each, which the aggregate, accounting and potential methods all confirm from different angles.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 99));
    return { array };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (result.values.length !== input.array.length) return false;
    for (let i = 0; i < input.array.length; i++) {
      if (result.values[i] !== input.array[i]) return false;
    }
    const n = input.array.length;
    if (n > 0 && (result.capacity < n || result.capacity > Math.max(1, 2 * n))) return false;
    if (n > 0 && result.capacity !== 0) {
      // Capacity must be a power of two reached purely by doubling from 1.
      let c = 1;
      while (c < n) c *= 2;
      if (result.capacity !== c) return false;
    }
    // The accounting method's whole point: the bank balance, built from a
    // flat per-push charge, must never have gone negative.
    if (result.minBank < 0) return false;
    return true;
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 10 },
};
