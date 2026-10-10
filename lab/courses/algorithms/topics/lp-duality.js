// LP duality: every linear program (the primal) has a matching dual
// program, built by flipping max to min (or back), swapping the roles of
// the constraint matrix's rows and columns, and swapping the objective
// coefficients with the right-hand sides. For `max c^T x s.t. A x <= b,
// x >= 0`, the dual is `min b^T y s.t. A^T y >= c, y >= 0`. Weak duality
// (any feasible x and y satisfy c^T x <= b^T y) always holds; strong
// duality (CLRS) says that when the primal has an optimum, the dual does
// too, and the two optimal values are exactly equal. This sandbox solves
// a small 2-variable primal geometrically (same corner walk as
// lp-geometry), solves its dual the same geometric way, and shows the two
// optimal values land on the same number. No DOM access.
import { randInt } from '../engine/rng.js';
import { enumerateVertices, orderAroundCentroid, simplexWalk, objectiveValue, sharedConstraintEdges } from '../engine/lp.js';

const CODE = [
  'primal: maximize cx*x1 + cy*x2  subject to A x <= b, x >= 0',
  'dual:   minimize b1*y1 + b2*y2  subject to A^T y >= c, y >= 0',
  'walk the primal region corner to corner, always improving, to find its optimum',
  'evaluate every corner of the (small) dual region directly',
  'strong duality: the primal optimum and the dual optimum are exactly equal',
];

function fmt(p) {
  return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
}

function scale(points, xMin, xMax) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  return points.map((p) => ({
    x: xMin + ((p.x - minX) / ((maxX - minX) || 1)) * (xMax - xMin),
    y: 92 - ((p.y - minY) / ((maxY - minY) || 1)) * 84,
  }));
}

function frame(pOrdered, pVisited, pLabel, dPoints, dConstraints, dHighlight, dLabel, caption, line) {
  const pScaled = scale(pOrdered, 4, 46);
  const dScaled = scale(dPoints, 54, 96);
  const pSet = new Set(pVisited || []);
  const curP = pVisited ? pVisited[pVisited.length - 1] : -1;
  const nodes = [
    ...pOrdered.map((p, i) => ({
      id: `p${i}`,
      label: fmt(p),
      x: pScaled[i].x,
      y: pScaled[i].y,
      active: i === curP,
      compare: pSet.has(i) && i !== curP,
    })),
    ...dPoints.map((p, i) => ({
      id: `d${i}`,
      label: fmt(p),
      x: dScaled[i].x,
      y: dScaled[i].y,
      active: dHighlight != null && dHighlight === i,
    })),
  ];
  const edges = [];
  const n = pOrdered.length;
  for (let i = 0; i < n; i++) if (n >= 2) edges.push([`p${i}`, `p${(i + 1) % n}`]);
  for (const [a, b] of sharedConstraintEdges(dPoints, dConstraints)) edges.push([`d${a}`, `d${b}`]);
  void pLabel;
  void dLabel;
  return { kind: 'tree', line, code: CODE, caption, nodes, edges };
}

function* run(input) {
  const { primal, dual } = input;
  const pVerts = enumerateVertices(primal.constraints);
  const dVerts = enumerateVertices(dual.constraints);
  if (pVerts.length === 0 || dVerts.length === 0) {
    yield frame([], null, 'primal', [], dual.constraints, null, 'dual', 'No feasible region on one side.', 0);
    return { primalValue: -Infinity, dualValue: Infinity, primalVertex: null, dualVertex: null };
  }

  const pOrdered = orderAroundCentroid(pVerts);
  let startIdx = pOrdered.findIndex((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6);
  if (startIdx === -1) startIdx = 0;

  yield frame(pOrdered, [startIdx], 'primal (maximize)', dVerts, dual.constraints, null, 'dual (minimize)', `Primal feasible region has ${pOrdered.length} corner(s). Start the walk at ${fmt(pOrdered[startIdx])}.`, 0);
  const path = simplexWalk(pOrdered, primal.c, startIdx);
  for (let i = 1; i < path.length; i++) {
    const p = pOrdered[path[i]];
    yield frame(pOrdered, path.slice(0, i + 1), 'primal (maximize)', dVerts, dual.constraints, null, 'dual (minimize)', `Primal: move to ${fmt(p)}, objective ${objectiveValue(primal.c, p).toFixed(1)}.`, 2);
  }
  const primalOptIdx = path[path.length - 1];
  const primalOpt = pOrdered[primalOptIdx];
  const primalValue = objectiveValue(primal.c, primalOpt);
  yield frame(pOrdered, path, 'primal (maximize)', dVerts, dual.constraints, null, 'dual (minimize)', `Primal optimum: ${fmt(primalOpt)}, value ${primalValue.toFixed(1)}.`, 2);

  let bestIdx = 0, bestVal = Infinity;
  dVerts.forEach((p, i) => {
    const v = objectiveValue(dual.c, p);
    if (v < bestVal) { bestVal = v; bestIdx = i; }
  });
  yield frame(pOrdered, path, 'primal (maximize)', dVerts, dual.constraints, bestIdx, 'dual (minimize)', `Dual's feasible region has ${dVerts.length} corner(s). Its minimum is ${fmt(dVerts[bestIdx])}, value ${bestVal.toFixed(1)}.`, 3);
  yield frame(pOrdered, path, 'primal (maximize)', dVerts, dual.constraints, bestIdx, 'dual (minimize)', `Strong duality: primal optimum ${primalValue.toFixed(1)} equals dual optimum ${bestVal.toFixed(1)}, exactly.`, 4);

  return { primalValue, dualValue: bestVal, primalVertex: primalOpt, dualVertex: dVerts[bestIdx] };
}

export default {
  id: 'lp-duality',
  title: 'LP duality',
  module: 'm08',
  course: 'CSC373',
  clrs: 'Linear Programming',
  summary:
    'Every linear program (the primal) has a matching dual program, built by transposing the constraint matrix and swapping the objective coefficients with the right-hand sides: for "maximize c^Tx subject to Ax <= b, x >= 0" the dual is "minimize b^Ty subject to A^Ty >= c, y >= 0". ' +
    'Weak duality always holds (any feasible x and y satisfy c^Tx <= b^Ty): the dual gives an upper bound on the primal and the primal gives a lower bound on the dual, for free, with no optimization at all. ' +
    'Strong duality is the sharper fact this sandbox animates: whenever the primal has an optimal solution, so does the dual, and their optimal values are exactly equal, not just bounded. ' +
    'The left side walks the primal feasible region corner to corner, the same simplex-style walk as lp-geometry; the right side (small enough here to check directly) shows every corner of the dual region and its minimum. ' +
    'Watching both optima land on the same number is strong duality made concrete, the same fact that makes the dual a useful certificate: proving a primal solution optimal is as easy as exhibiting a dual solution with a matching value.',
  code: CODE,
  complexity: {
    time: 'O(1) here (both regions are small, fixed 2D polygons); in general, solving either the primal or the dual by simplex costs the same, since one directly gives a certificate for the other.',
    why: "Strong duality is exactly what makes that certificate work: once a primal feasible x and a dual feasible y have equal objective values, both must be optimal (weak duality already bounds every other feasible point between them), so there is nothing extra to compute to be sure.",
  },
  makeInput(rng) {
    const a11 = randInt(rng, 1, 5), a12 = randInt(rng, 1, 5);
    const a21 = randInt(rng, 1, 5), a22 = randInt(rng, 1, 5);
    const b1 = randInt(rng, 6, 20), b2 = randInt(rng, 6, 20);
    const cx = randInt(rng, 1, 6), cy = randInt(rng, 1, 6);
    const primal = {
      constraints: [
        { a: -1, b: 0, d: 0 },
        { a: 0, b: -1, d: 0 },
        { a: a11, b: a12, d: b1 },
        { a: a21, b: a22, d: b2 },
      ],
      c: { cx, cy },
    };
    const dual = {
      constraints: [
        { a: -1, b: 0, d: 0 },
        { a: 0, b: -1, d: 0 },
        { a: -a11, b: -a21, d: -cx },
        { a: -a12, b: -a22, d: -cy },
      ],
      c: { cx: b1, cy: b2 },
    };
    return { primal, dual };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { primal, dual } = input;
    const pVerts = enumerateVertices(primal.constraints);
    const dVerts = enumerateVertices(dual.constraints);
    if (pVerts.length === 0 || dVerts.length === 0) return result.primalVertex === null;
    let pBest = -Infinity;
    for (const p of pVerts) pBest = Math.max(pBest, objectiveValue(primal.c, p));
    let dBest = Infinity;
    for (const p of dVerts) dBest = Math.min(dBest, objectiveValue(dual.c, p));
    return (
      Math.abs(result.primalValue - pBest) < 1e-6 &&
      Math.abs(result.dualValue - dBest) < 1e-6 &&
      Math.abs(pBest - dBest) < 1e-6
    );
  },
  sandbox: { type: 'n', min: 0, max: 6, default: 3, label: 'variant' },
};
