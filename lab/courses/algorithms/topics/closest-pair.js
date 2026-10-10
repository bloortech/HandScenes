// Closest pair of points: the classic O(n log n) divide-and-conquer
// algorithm. Sort by x, split in half, recurse on each half, then check a
// thin strip around the dividing line (sorted by y) for a pair closer than
// the best of the two halves; that strip check only ever needs to look at a
// bounded number of neighbours per point. Checked against the brute-force
// O(n^2) "try every pair" baseline. No DOM access.
import { randInt } from '../engine/rng.js';

const CODE = [
  'closest(points sorted by x):',
  '  if n <= 3: return brute force over these few points',
  '  mid = split in half by x; dL = closest(left), dR = closest(right)',
  '  d = min(dL, dR)',
  '  strip = points within d of the dividing line, sorted by y',
  '  for each point in strip, check its next few neighbours in the strip',
  '  return the best distance found',
];

function dist2(p, q) { const dx = p.x - q.x, dy = p.y - q.y; return dx * dx + dy * dy; }

function bruteForce(points) {
  let best = Infinity, bi = -1, bj = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = dist2(points[i], points[j]);
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { d2: best, i: bi, j: bj };
}

function frame(points, best, activeIds, lineX, caption, line) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  const nodes = points.map((p) => ({
    id: String(p.id),
    label: '',
    x: 6 + ((p.x - minX) / (maxX - minX || 1)) * 88,
    y: 6 + ((p.y - minY) / (maxY - minY || 1)) * 88,
    w: 6, h: 6,
    active: activeIds && activeIds.includes(p.id),
  }));
  if (lineX != null) {
    nodes.push({ id: 'divider-top', label: '', x: 6 + ((lineX - minX) / (maxX - minX || 1)) * 88, y: 2, w: 1, h: 1, dim: true });
  }
  const edges = [];
  if (best && best.i != null && best.j != null) edges.push([String(points[best.i].id), String(points[best.j].id)]);
  return { kind: 'boxes', line, code: CODE, caption, nodes, edges, emptyText: '(no points)' };
}

function* run(input) {
  const pts = input.points.map((p, idx) => ({ ...p, id: idx }));
  if (pts.length < 2) {
    yield frame(pts, null, null, null, 'Fewer than two points: no pair to measure.', 0);
    return { d2: Infinity, i: -1, j: -1 };
  }
  const byX = pts.slice().sort((a, b) => a.x - b.x);
  yield frame(pts, null, null, null, `Start: ${pts.length} points, sorted by x.`, 0);

  const result = yield* closest(byX);
  const bestIds = [byX_i(result), byX_j(result)];
  yield frame(pts, null, bestIds, null, `Done: the closest pair is ${Math.sqrt(result.d2).toFixed(2)} apart.`, 6);
  return result;

  function byX_i(r) { return r.i; }
  function byX_j(r) { return r.j; }

  function* closest(points) {
    const n = points.length;
    if (n <= 3) {
      const r = bruteForce(points);
      const r2 = { d2: r.d2, i: r.i >= 0 ? points[r.i].id : -1, j: r.j >= 0 ? points[r.j].id : -1 };
      yield frame(pts, { i: pointIndex(r2.i), j: pointIndex(r2.j) }, [r2.i, r2.j], null, `${n} points or fewer: brute force directly. Best so far: ${n < 2 ? 'n/a' : Math.sqrt(r.d2).toFixed(2)}.`, 1);
      return r2;
    }
    const mid = Math.floor(n / 2);
    const midX = points[mid].x;
    const left = points.slice(0, mid);
    const right = points.slice(mid);
    yield frame(pts, null, null, midX, `Split ${n} points at x=${midX}.`, 2);
    const dL = yield* closest(left);
    const dR = yield* closest(right);
    let best = dL.d2 <= dR.d2 ? dL : dR;
    yield frame(pts, { i: pointIndex(best.i), j: pointIndex(best.j) }, [best.i, best.j], midX, `Best of the two halves: ${Math.sqrt(best.d2).toFixed(2)}.`, 3);

    const d = Math.sqrt(best.d2);
    const strip = points.filter((p) => Math.abs(p.x - midX) < d || d === Infinity).sort((a, b) => a.y - b.y);
    yield frame(pts, { i: pointIndex(best.i), j: pointIndex(best.j) }, strip.map((p) => p.id), midX, `Check the strip within ${d === Infinity ? 'infinity' : d.toFixed(2)} of the dividing line (${strip.length} points, sorted by y).`, 4);

    for (let si = 0; si < strip.length; si++) {
      for (let sj = si + 1; sj < strip.length && strip[sj].y - strip[si].y < (d === Infinity ? Infinity : d); sj++) {
        const dd = dist2(strip[si], strip[sj]);
        if (dd < best.d2) {
          best = { d2: dd, i: strip[si].id, j: strip[sj].id };
          yield frame(pts, { i: pointIndex(best.i), j: pointIndex(best.j) }, [strip[si].id, strip[sj].id], midX, `Strip pair beats the current best: ${Math.sqrt(dd).toFixed(2)}.`, 5);
        }
      }
    }
    return best;
  }

  function pointIndex(id) { return byX.findIndex((p) => p.id === id); }
}

export default {
  id: 'closest-pair',
  title: 'Closest pair of points',
  module: 'm07',
  course: 'CSC373',
  clrs: 'Divide-and-Conquer',
  summary:
    'Given n points in the plane, the brute-force way to find the two closest together checks every pair, O(n^2). ' +
    'The divide-and-conquer algorithm sorts points by x, splits them in half, and recursively finds the closest pair on the left and on the right. ' +
    'The subtle part is pairs that straddle the dividing line: it looks like that needs checking every left point against every right point, but a geometric argument shows only points within the current best distance d of the line can possibly beat it, and among those (sorted by y) each point only needs to check a small constant number of neighbours, since any two points in the strip that are both within d of each other and more than d apart in y cannot both fit. ' +
    'That keeps the "fix-up" step linear (after an O(n log n) sort), giving the recurrence T(n) = 2T(n/2) + O(n), the same shape as merge sort, so O(n log n) overall. ' +
    'The sandbox highlights the dividing line, the strip being checked, and the current best pair (the amber-linked points) as the recursion unwinds.',
  code: CODE,
  complexity: {
    time: 'O(n log n), versus O(n^2) for the brute-force all-pairs scan.',
    why: 'Sorting by x costs O(n log n) once. The recursion is T(n) = 2T(n/2) + O(n): two half-size recursive calls, plus an O(n) strip check at each level (each strip point only compares against a constant number of y-sorted neighbours). That recurrence solves to O(n log n), same shape as merge sort.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, size);
    const points = [];
    const seen = new Set();
    for (let k = 0; k < n; k++) {
      let x, y, key;
      do {
        x = randInt(rng, 0, 99);
        y = randInt(rng, 0, 99);
        key = `${x},${y}`;
      } while (seen.has(key));
      seen.add(key);
      points.push({ x, y });
    }
    return { points };
  },
  run,
  check(input, result) {
    if (!result) return false;
    if (input.points.length < 2) return result.i === -1 && result.j === -1;
    const expected = bruteForce(input.points);
    return Math.abs(result.d2 - expected.d2) < 1e-9;
  },
  sandbox: { type: 'n', min: 0, max: 31, default: 14, label: 'points' },
};
