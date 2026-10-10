// Convex hull: the smallest convex polygon containing every point, found
// two ways. Graham scan sorts by angle around a pivot and sweeps, popping
// any point that would make a non-left turn. Jarvis march (gift wrapping)
// instead walks the hull directly, at each step finding the point that
// keeps every other point to its left. No DOM access. CLRS: Computational
// Geometry (Graham's scan, Jarvis's march).
import { randInt } from '../engine/rng.js';
import { convexHullGraham, convexHullJarvis, isValidConvexHull } from '../engine/geometry.js';

const CODE_GRAHAM = [
  'pivot = the lowest point (leftmost of ties)',
  'sort the rest by angle around pivot',
  'stack = [pivot]',
  'for each point p in angle order:',
  '  while top two of stack and p do not turn left: pop',
  '  push p',
];
const CODE_JARVIS = [
  'start = the leftmost point',
  'current = start',
  'repeat:',
  '  candidate = any point other than current',
  "  for each point p: if p is more clockwise from current than candidate, candidate = p",
  '  current = candidate; add current to the hull',
  'until current == start',
];

function pointsFrame(points, hullIds, activeIds, code, caption, line) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  const nodes = points.map((p) => ({
    id: String(p.id),
    label: '',
    x: 6 + ((p.x - minX) / (maxX - minX || 1)) * 88,
    y: 94 - ((p.y - minY) / (maxY - minY || 1)) * 88,
    w: 6, h: 6,
    active: activeIds && activeIds.includes(p.id),
    compare: hullIds && hullIds.includes(p.id) && !(activeIds && activeIds.includes(p.id)),
  }));
  const edges = [];
  if (hullIds && hullIds.length >= 2) {
    for (let i = 0; i < hullIds.length; i++) edges.push([String(hullIds[i]), String(hullIds[(i + 1) % hullIds.length])]);
  }
  return { kind: 'boxes', code, line, caption, nodes, edges, emptyText: '(no points)' };
}

function* run(input) {
  const { points: rawPoints, method } = input;
  const points = rawPoints.map((p, idx) => ({ ...p, id: idx }));
  const CODE = method === 'jarvis' ? CODE_JARVIS : CODE_GRAHAM;

  if (points.length < 3) {
    yield pointsFrame(points, points.map((p) => p.id), null, CODE, `Fewer than 3 points: the hull is just the points themselves.`, 0);
    return { hull: points.map((p) => ({ x: p.x, y: p.y })), method };
  }

  yield pointsFrame(points, null, null, CODE, `Find the convex hull of ${points.length} points using ${method === 'jarvis' ? 'Jarvis march' : 'Graham scan'}.`, 0);

  const hullIds = [];
  if (method === 'jarvis') {
    const { hull, steps } = convexHullJarvis(points);
    for (const step of steps) {
      if (step.type === 'consider') {
        yield pointsFrame(points, hullIds.slice(), [step.from.id, step.candidate.id], CODE, `From point ${step.from.id}, consider point ${step.candidate.id} as the next hull vertex.`, 4);
      } else if (step.type === 'hull-point') {
        hullIds.push(step.point.id);
        yield pointsFrame(points, hullIds.slice(), [step.point.id], CODE, `Point ${step.point.id} keeps every other point to its left: add it to the hull.`, 5);
      }
    }
    yield pointsFrame(points, hull.map((p) => p.id), null, CODE, `Done. Hull has ${hull.length} vertices.`, 6);
    return { hull: hull.map((p) => ({ x: p.x, y: p.y })), method };
  }

  const { hull, steps } = convexHullGraham(points);
  const stackIds = [];
  for (const step of steps) {
    if (step.type === 'push') {
      stackIds.push(step.point.id);
      yield pointsFrame(points, stackIds.slice(), [step.point.id], CODE, `Push point ${step.point.id} onto the hull stack.`, 5);
    } else {
      yield pointsFrame(points, stackIds.slice(), [step.point.id], CODE, `Point ${step.point.id} would make a non-left turn with the top of the stack: pop it back off.`, 4);
      stackIds.pop();
    }
  }
  yield pointsFrame(points, hull.map((p) => p.id), null, CODE, `Done. Hull has ${hull.length} vertices.`, 6);
  return { hull: hull.map((p) => ({ x: p.x, y: p.y })), method };
}

export default {
  id: 'convex-hull',
  title: 'Convex hull: Graham scan and Jarvis march',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Computational Geometry',
  summary:
    "The convex hull of a set of points is the smallest convex polygon containing all of them, the shape a rubber band would snap into if stretched around every point and released. " +
    "Graham scan finds it by sorting every point by angle around the lowest point, then sweeping through that order with a stack: whenever the next point would make the path turn right (or go straight) instead of left, the top of the stack cannot be on the hull after all, so it gets popped, and the sweep retries. " +
    "Jarvis march (gift wrapping) takes a more direct route: starting from an extreme point, it repeatedly finds whichever remaining point keeps every other point to its left, which must be the next hull vertex going around counter-clockwise, and stops when it wraps back to the start. " +
    "Graham scan's one sort dominates its cost, O(n log n) total; Jarvis march's cost scales with the hull size h instead, O(nh), which is faster when the hull has very few vertices but slower than Graham scan when most points end up on the hull. " +
    "Both only ever use one primitive, the cross product's sign (does c lie left or right of the line from a to b), which is also convex hull's connection to the sweep-line algorithm in the next topic.",
  code: CODE_GRAHAM,
  complexity: {
    time: 'Graham scan: O(n log n). Jarvis march: O(nh), h the number of hull vertices.',
    why: "Graham scan's sort is O(n log n) and dominates; the stack sweep itself is O(n) amortised, since every point is pushed once and each pop permanently removes a point from further consideration (CLRS's standard aggregate argument). Jarvis march does h outer iterations, one per hull vertex, each scanning all n points to find the next vertex, giving O(nh); this beats O(n log n) only when h is asymptotically smaller than log n.",
  },
  makeInput(rng, size) {
    const n = Math.max(0, size);
    const points = [];
    const seen = new Set();
    for (let k = 0; k < n; k++) {
      let x, y, key;
      do {
        x = randInt(rng, 0, 29);
        y = randInt(rng, 0, 29);
        key = `${x},${y}`;
      } while (seen.has(key));
      seen.add(key);
      points.push({ x, y });
    }
    const method = rng() < 0.5 ? 'graham' : 'jarvis';
    return { points, method };
  },
  run,
  check(input, result) {
    if (!result) return false;
    return isValidConvexHull(input.points, result.hull);
  },
  sandbox: { type: 'n', min: 0, max: 31, default: 14, label: 'points' },
};
