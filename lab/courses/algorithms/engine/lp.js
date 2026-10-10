// Shared 2D linear-programming geometry for m08's lp-geometry and
// lp-duality topics. A constraint is always written in one single form,
// `a*x + b*y <= d` (so `x >= 0` is `-x + 0y <= 0`, and `x <= M` is
// `x + 0y <= M`): every feasible region, no matter where its boundary
// pieces come from, is just "the intersection of these half-planes," and
// one piece of code can enumerate corners for any of them. No DOM access,
// like graph.js.

const EPS = 1e-7;
const FEAS_EPS = 1e-6;

export function objectiveValue(c, p) {
  return c.cx * p.x + c.cy * p.y;
}

// Every vertex of a polytope sits where some set of constraints are tight;
// in 2D that set is always exactly two non-parallel lines. So: intersect
// every pair of constraint *lines* (treat each inequality as an equality),
// keep the intersection only if it also satisfies every other constraint,
// and dedupe. Works for bounded regions (a closed polygon) and the
// "bounded below, open above" regions a dual LP's feasible set can be:
// either way, this only ever returns real corners, never a point out on
// an unbounded ray.
export function enumerateVertices(constraints) {
  const pts = [];
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const { a: a1, b: b1, d: d1 } = constraints[i];
      const { a: a2, b: b2, d: d2 } = constraints[j];
      const det = a1 * b2 - a2 * b1;
      if (Math.abs(det) < EPS) continue;
      const x = (d1 * b2 - d2 * b1) / det;
      const y = (a1 * d2 - a2 * d1) / det;
      if (constraints.every((c) => c.a * x + c.b * y <= c.d + FEAS_EPS)) {
        pts.push({ x, y });
      }
    }
  }
  const out = [];
  for (const p of pts) {
    if (!out.some((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)) out.push(p);
  }
  return out;
}

// Orders a *bounded* feasible region's vertices around its centroid, which
// for a convex polygon is exactly the boundary order: two consecutive
// points in the result are connected by an edge of the polygon.
export function orderAroundCentroid(points) {
  if (points.length < 3) return points.slice();
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points
    .map((p) => ({ x: p.x, y: p.y, angle: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ x, y }) => ({ x, y }));
}

// Walks a bounded, ordered polygon's vertices the way simplex pivots
// between adjacent basic feasible solutions: from the current corner,
// move to whichever neighbour (previous or next in the cyclic order)
// improves the objective, preferring the bigger improvement, and stop
// once neither neighbour does better. For a linear objective over a
// convex polygon that stopping point is the true optimum: a vertex with
// no better *adjacent* vertex can't be beaten by any vertex at all, since
// the whole region is convex (no "hill" to climb around). Returns the
// list of vertex indices visited, in order.
export function simplexWalk(orderedPoints, c, startIdx) {
  const n = orderedPoints.length;
  if (n === 0) return [];
  let cur = startIdx;
  const path = [cur];
  if (n < 2) return path;
  for (let guard = 0; guard < n + 1; guard++) {
    const prev = (cur - 1 + n) % n;
    const next = (cur + 1) % n;
    const curVal = objectiveValue(c, orderedPoints[cur]);
    const prevVal = objectiveValue(c, orderedPoints[prev]);
    const nextVal = objectiveValue(c, orderedPoints[next]);
    let bestNeighbor = null;
    let bestVal = curVal;
    if (prevVal > bestVal + EPS) { bestVal = prevVal; bestNeighbor = prev; }
    if (nextVal > bestVal + EPS) { bestVal = nextVal; bestNeighbor = next; }
    if (bestNeighbor == null) break;
    cur = bestNeighbor;
    path.push(cur);
  }
  return path;
}

// Edges to draw between a (possibly unbounded) region's finite vertices:
// two vertices are joined whenever they both lie exactly on one of the
// original constraint lines (so unbounded rays, which have no second
// endpoint, are correctly never drawn).
export function sharedConstraintEdges(points, constraints) {
  const edges = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const shares = constraints.some(
        (c) =>
          Math.abs(c.a * points[i].x + c.b * points[i].y - c.d) < 1e-5 &&
          Math.abs(c.a * points[j].x + c.b * points[j].y - c.d) < 1e-5
      );
      if (shares) edges.push([i, j]);
    }
  }
  return edges;
}
