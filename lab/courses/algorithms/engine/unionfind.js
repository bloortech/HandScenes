// Disjoint-set forest (union-find): union by rank with path compression.
// No DOM access. Plain arrays (`parent[i]`, `rank[i]`), not node objects,
// since every op only needs O(1) random access by element id, not pointer
// chasing (CLRS: Data Structures for Disjoint Sets).

export function makeSets(n) {
  return {
    parent: Array.from({ length: n }, (_, i) => i),
    rank: Array(n).fill(0),
  };
}

// Finds x's representative, logging every node visited (for animation) and
// flattening the path it just walked onto the root (path compression).
export function find(uf, x, log) {
  const path = [];
  let r = x;
  while (uf.parent[r] !== r) {
    path.push(r);
    r = uf.parent[r];
  }
  path.push(r);
  if (log) log.push({ type: 'find', path: path.slice(), root: r });
  // Path compression: point every node on the path straight at the root.
  for (const node of path) {
    if (uf.parent[node] !== r) {
      uf.parent[node] = r;
      if (log) log.push({ type: 'compress', node, root: r });
    }
  }
  return r;
}

// Union by rank: the shallower tree's root hangs off the deeper one's root,
// so height stays O(log n) even before path compression kicks in.
export function union(uf, a, b, log) {
  const ra = find(uf, a, log);
  const rb = find(uf, b, log);
  if (ra === rb) {
    if (log) log.push({ type: 'noop', root: ra });
    return;
  }
  let lo = ra, hi = rb;
  if (uf.rank[ra] > uf.rank[rb]) { lo = rb; hi = ra; }
  uf.parent[lo] = hi;
  if (uf.rank[lo] === uf.rank[hi]) uf.rank[hi] += 1;
  if (log) log.push({ type: 'union', attached: lo, under: hi });
}

// Groups every element 0..n-1 by its current root (no compression side
// effects: callers that need to animate it should use find() instead).
export function components(parent) {
  const groups = new Map();
  for (let i = 0; i < parent.length; i++) {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return Array.from(groups.values()).map((g) => g.slice().sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}
