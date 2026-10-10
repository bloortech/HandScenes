// Linear programming, geometrically. Every constraint `a*x + b*y <= d` is
// a half-plane; a set of them, intersected, is the feasible region, a
// convex polygon here since we always keep x, y bounded. A classic fact
// (the one the simplex method is built on) is that a linear objective's
// maximum over a convex polygon is always attained at a corner, never
// strictly inside an edge or the interior: if it were better somewhere in
// the middle of an edge, it would be at least as good at one of that
// edge's two endpoints (linearity along a line is monotone, never a hill).
// So it is enough to walk corner to corner, each time moving to whichever
// neighbouring corner improves the objective most, until neither neighbour
// does better; that corner is the optimum. No DOM access.
import { randInt } from '../engine/rng.js';
import { enumerateVertices, orderAroundCentroid, simplexWalk, objectiveValue } from '../engine/lp.js';

const CODE = [
  'feasible region = intersection of every half-plane a*x + b*y <= d (including x >= 0, y >= 0)',
  'corners = where two of those boundary lines meet, filtered to the ones still feasible',
  'start at a feasible corner (here, the origin)',
  'while a neighbouring corner has a better objective value: move to the best one',
  'stop: no neighbour does better, so (by convexity) this corner is the optimum',
];

function fmt(p) {
  return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
}

function frame(ordered, visitedPath, caption, line) {
  const xs = ordered.map((p) => p.x), ys = ordered.map((p) => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  const sx = (x) => 8 + ((x - minX) / ((maxX - minX) || 1)) * 84;
  const sy = (y) => 92 - ((y - minY) / ((maxY - minY) || 1)) * 84;
  const visitedSet = new Set(visitedPath || []);
  const cur = visitedPath ? visitedPath[visitedPath.length - 1] : -1;
  const n = ordered.length;
  const nodes = ordered.map((p, i) => ({
    id: i,
    label: fmt(p),
    x: sx(p.x),
    y: sy(p.y),
    active: i === cur,
    compare: visitedSet.has(i) && i !== cur,
  }));
  const edges = [];
  for (let i = 0; i < n; i++) if (n >= 2) edges.push([i, (i + 1) % n]);
  if (visitedPath) {
    for (let k = 0; k < visitedPath.length - 1; k++) edges.push([visitedPath[k], visitedPath[k + 1], '->']);
  }
  return { kind: 'tree', line, code: CODE, caption, nodes, edges, emptyText: '(no feasible region)' };
}

function* run(input) {
  const { constraints, c } = input;
  const vertices = enumerateVertices(constraints);
  if (vertices.length === 0) {
    yield frame([], null, 'No feasible region: nothing to walk.', 0);
    return { vertex: null, value: -Infinity };
  }
  const ordered = orderAroundCentroid(vertices);
  let startIdx = ordered.findIndex((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6);
  if (startIdx === -1) startIdx = 0;

  yield frame(ordered, [startIdx], `Feasible region has ${ordered.length} corner(s). Start the walk at ${fmt(ordered[startIdx])}.`, 0);
  const path = simplexWalk(ordered, c, startIdx);
  for (let i = 1; i < path.length; i++) {
    const p = ordered[path[i]];
    yield frame(ordered, path.slice(0, i + 1), `Move to ${fmt(p)}: objective improves to ${objectiveValue(c, p).toFixed(1)}.`, 3);
  }
  const optIdx = path[path.length - 1];
  const opt = ordered[optIdx];
  const value = objectiveValue(c, opt);
  yield frame(ordered, path, `No neighbouring corner does better: the optimum is ${fmt(opt)}, value ${value.toFixed(1)}.`, 4);
  return { vertex: opt, value };
}

export default {
  id: 'lp-geometry',
  title: 'Linear programming, geometrically',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Linear Programming',
  summary:
    'A linear program maximizes (or minimizes) a linear objective subject to linear inequality constraints; in two variables, each constraint a*x + b*y <= d is a half-plane, and the feasible region (everywhere all the constraints hold) is their intersection, a convex polygon when it is bounded. ' +
    "The key geometric fact behind the simplex method: a linear objective's maximum over a convex polygon always sits at a corner, never strictly inside an edge, because moving along a straight line a linear function only ever increases, decreases, or stays flat, so one of the two endpoints is at least as good. " +
    'That turns optimization into a walk: start at any feasible corner, and as long as some neighbouring corner has a better objective value, move there; stop once neither neighbour does better. ' +
    "Convexity is what makes that stopping rule trustworthy: a corner with no better *adjacent* corner cannot be beaten by any corner at all, so there is never a 'local but not global' optimum to get stuck at. " +
    'The sandbox shows the feasible region as a polygon, walks it corner to corner in amber, and reports the optimal corner and value it lands on.',
  code: CODE,
  complexity: {
    time: 'O(1) corner-to-corner steps here (a fixed small 2D polygon); the simplex method in general can take up to exponentially many pivots in the worst case, though it is fast in practice.',
    why: 'Each step moves to a strictly better corner (never revisits one), and this sandbox\'s polygon has a small, fixed number of corners; real simplex implementations pivot through a much larger polytope the same way, one improving vertex at a time.',
  },
  makeInput(rng, size) {
    const extra = Math.max(0, Math.min(6, size));
    const M = randInt(rng, 8, 14);
    const constraints = [
      { a: -1, b: 0, d: 0 }, // x >= 0
      { a: 0, b: -1, d: 0 }, // y >= 0
      { a: 1, b: 0, d: M }, // x <= M
      { a: 0, b: 1, d: M }, // y <= M
    ];
    for (let k = 0; k < extra; k++) {
      const a = randInt(rng, 1, 4);
      const b = randInt(rng, 1, 4);
      const d = randInt(rng, Math.ceil(M / 2), 2 * M);
      constraints.push({ a, b, d });
    }
    const cx = randInt(rng, 1, 6);
    const cy = randInt(rng, 1, 6);
    return { constraints, c: { cx, cy } };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { constraints, c } = input;
    const vertices = enumerateVertices(constraints);
    if (vertices.length === 0) return result.vertex === null;
    if (!result.vertex) return false;
    let best = -Infinity;
    for (const p of vertices) best = Math.max(best, objectiveValue(c, p));
    const onBoundary = constraints.every((cc) => cc.a * result.vertex.x + cc.b * result.vertex.y <= cc.d + 1e-6);
    return onBoundary && Math.abs(result.value - best) < 1e-6 && Math.abs(objectiveValue(c, result.vertex) - result.value) < 1e-6;
  },
  sandbox: { type: 'n', min: 0, max: 6, default: 3, label: 'extra constraints' },
};
