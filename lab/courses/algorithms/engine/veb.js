// A van Emde Boas tree (CLRS 3rd ed: van Emde Boas Trees), restricted to
// universe sizes u = 4^m (so the "upper sqrt"/"lower sqrt" split CLRS uses
// for general powers of two collapses to a single exact sqrt(u) on both
// sides, which keeps the demo's index/high/low arithmetic simple without
// changing the algorithm's shape). No DOM access.
//
// The classic trick that gets insert/member/successor down to O(lg lg u):
// a non-empty structure's min is never stored anywhere in its own
// clusters, only in `.min` directly, which is also why member() has to
// check `.min`/`.max` as a special case before recursing.

export function createVEB(u) {
  if (u <= 2) {
    return { u, min: null, max: null, summary: null, clusters: null };
  }
  const c = Math.sqrt(u); // exact: u is a power of 4
  return {
    u,
    min: null,
    max: null,
    summary: createVEB(c),
    clusters: Array.from({ length: c }, () => createVEB(c)),
  };
}

function low(x, u) { return x % Math.sqrt(u); }
function high(x, u) { return Math.floor(x / Math.sqrt(u)); }
function index(h, l, u) { return h * Math.sqrt(u) + l; }

export function member(V, x) {
  if (V.min === x || V.max === x) return true;
  if (V.u <= 2 || V.min === null) return false;
  return member(V.clusters[high(x, V.u)], low(x, V.u));
}

function insertEmpty(V, x) {
  V.min = x;
  V.max = x;
}

export function insert(V, x, log) {
  // A set, not a multiset, like this course's other search structures:
  // inserting an already-present value is a no-op. Checked up front since
  // the recursive insert below assumes x is genuinely new (that's what
  // lets it skip straight to insertEmpty on an empty cluster).
  if (member(V, x)) {
    if (log) log.push({ type: 'duplicate', u: V.u, value: x });
    return;
  }
  if (V.min === null) {
    insertEmpty(V, x);
    if (log) log.push({ type: 'set-min-max', u: V.u, value: x });
    return;
  }
  if (x < V.min) {
    const t = x; x = V.min; V.min = t;
  }
  if (V.u > 2) {
    const h = high(x, V.u), l = low(x, V.u);
    if (V.clusters[h].min === null) {
      insert(V.summary, h, log);
      insertEmpty(V.clusters[h], l);
      if (log) log.push({ type: 'new-cluster', u: V.u, cluster: h, value: l });
    } else {
      insert(V.clusters[h], l, log);
    }
  }
  if (x > V.max) V.max = x;
}

export function successor(V, x) {
  if (V.u === 2) {
    if (x === 0 && V.max === 1) return 1;
    return null;
  }
  if (V.min !== null && x < V.min) return V.min;
  const h = high(x, V.u), l = low(x, V.u);
  const maxLow = V.clusters[h].max;
  if (maxLow !== null && l < maxLow) {
    const offset = successor(V.clusters[h], l);
    return index(h, offset, V.u);
  }
  const succCluster = successor(V.summary, h);
  if (succCluster === null) return null;
  const offset = V.clusters[succCluster].min;
  return index(succCluster, offset, V.u);
}

// Every element actually present, found by direct enumeration (not via the
// structure's own recursion), used to independently check member/successor
// against ground truth.
export function allMembers(V, base = 0, out = []) {
  if (V.u <= 2) {
    if (V.min !== null) out.push(base + V.min);
    if (V.max !== null && V.max !== V.min) out.push(base + V.max);
    return out;
  }
  if (V.min !== null) out.push(base + V.min);
  const c = Math.sqrt(V.u);
  for (let h = 0; h < c; h++) {
    allMembers(V.clusters[h], base + h * c, out);
  }
  if (V.max !== null) out.push(base + V.max);
  return Array.from(new Set(out));
}
