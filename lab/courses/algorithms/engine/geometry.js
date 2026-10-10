// Pure computational-geometry helpers shared by convex-hull and
// segment-intersection (CLRS: Computational Geometry). No DOM access, like
// graph.js/strings.js. Points are `{x, y}`; segments are `[p, q]`.

// The sign of the cross product of (b-a) and (c-a): positive means c is
// counter-clockwise from b around a (a left turn), negative means a right
// turn, zero means the three points are collinear. The one primitive every
// algorithm here is built from (CLRS 33.1).
export function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

// Graham scan: sort by angle around the lowest (then leftmost) point, and
// sweep, popping any point that would make a non-left (clockwise or
// straight) turn. `steps` logs every push/pop for the animation. Points
// are plain `{x, y, id}`; duplicate/collinear points are handled by the
// final result still being a valid convex polygon (possibly a single point
// or a segment, for degenerate inputs).
export function convexHullGraham(points) {
  const steps = [];
  if (points.length < 3) return { hull: points.slice(), steps };

  let pivot = points[0];
  for (const p of points) {
    if (p.y < pivot.y || (p.y === pivot.y && p.x < pivot.x)) pivot = p;
  }
  const rest = points.filter((p) => p !== pivot).sort((a, b) => {
    const angA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
    if (angA !== angB) return angA - angB;
    return dist2(pivot, a) - dist2(pivot, b);
  });

  const stack = [pivot];
  for (const p of rest) {
    while (stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], p) <= 0) {
      steps.push({ type: 'pop', point: stack.pop() });
    }
    stack.push(p);
    steps.push({ type: 'push', point: p });
  }
  return { hull: stack, steps };
}

// Jarvis march (gift wrapping): starting from the lowest point, repeatedly
// find the point that makes every other point lie to the left of (or on)
// the line to it, which must be the next hull vertex going counter-
// clockwise. O(nh) for h hull points; `steps` logs every candidate point
// considered at each step.
export function convexHullJarvis(points) {
  const steps = [];
  if (points.length < 3) return { hull: points.slice(), steps };

  let start = points[0];
  for (const p of points) {
    if (p.x < start.x || (p.x === start.x && p.y < start.y)) start = p;
  }

  const hull = [];
  let current = start;
  let guard = 0;
  do {
    hull.push(current);
    let candidate = null;
    for (const p of points) {
      if (p === current) continue;
      steps.push({ type: 'consider', from: current, candidate: p });
      if (candidate === null) { candidate = p; continue; }
      const c = cross(current, candidate, p);
      if (c < 0 || (c === 0 && dist2(current, p) > dist2(current, candidate))) candidate = p;
    }
    current = candidate;
    steps.push({ type: 'hull-point', point: current });
    guard++;
  } while (current !== start && guard <= points.length + 1);

  return { hull, steps };
}

// On-segment test for a point known to be collinear with a and b.
function onSegment(a, b, p) {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

// Independent convex-hull validity checker, used by check() instead of
// comparing two hull algorithms' outputs point-for-point (which can
// legitimately differ on whether a collinear boundary point is included).
// A hull (listed counter-clockwise) is valid iff: every consecutive triple
// turns left or straight (it is itself convex), and every input point lies
// inside or on that polygon (cross >= 0 against every edge, since the
// polygon is CCW).
export function isValidConvexHull(points, hull) {
  if (points.length <= 2) return hull.length === points.length;
  const allCollinear = points.every((p) => cross(points[0], points[1], p) === 0);
  if (allCollinear) {
    // Degenerate: the "hull" of a set of collinear points is just its two
    // extreme points along the line.
    let lo = points[0], hi = points[0];
    for (const p of points) {
      if (p.x < lo.x || (p.x === lo.x && p.y < lo.y)) lo = p;
      if (p.x > hi.x || (p.x === hi.x && p.y > hi.y)) hi = p;
    }
    const set = new Set(hull.map((p) => `${p.x},${p.y}`));
    return set.has(`${lo.x},${lo.y}`) && set.has(`${hi.x},${hi.y}`);
  }
  if (hull.length < 3) return false;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    if (cross(hull[i], hull[(i + 1) % n], hull[(i + 2) % n]) < 0) return false;
  }
  for (const p of points) {
    for (let i = 0; i < n; i++) {
      if (cross(hull[i], hull[(i + 1) % n], p) < 0) return false;
    }
  }
  return true;
}

// CLRS 33.1's SEGMENTS-INTERSECT: true iff segments (p1,p2) and (p3,p4)
// share at least one point, including touching at an endpoint or
// overlapping collinearly.
export function segmentsIntersect([p1, p2], [p3, p4]) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

// The brute-force reference: does ANY pair of segments in the set
// intersect? O(n^2), used only by check() to grade the sweep's answer.
export function anySegmentsIntersectBruteForce(segments) {
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsIntersect(segments[i], segments[j])) return { found: true, i, j };
    }
  }
  return { found: false, i: -1, j: -1 };
}

// CLRS 33.2's ANY-SEGMENTS-INTERSECT, the sweep-line algorithm: sweep a
// vertical line left to right over the endpoints; a status structure T
// holds the segments crossing the sweep line, ordered by where they cross
// it. A left endpoint inserts its segment into T and checks the segments
// immediately above/below it for an intersection; a right endpoint checks
// whatever ends up newly adjacent after removing its segment, then removes
// it. Any two segments that ever intersect must become adjacent in T at
// some point before they cross, so checking only neighbours (instead of
// every pair) still finds every intersection. `events` logs every
// insert/check/remove step for the animation. Segments are assumed to have
// no vertical segments sharing an x-coordinate boundary case beyond what
// the generic ordering below already handles (ties broken by y, then by
// which endpoint).
export function sweepAnySegmentsIntersect(segments) {
  const events = [];
  const pts = [];
  segments.forEach((seg, idx) => {
    const [a, b] = seg[0].x <= seg[1].x ? seg : [seg[1], seg[0]];
    pts.push({ x: a.x, y: a.y, idx, kind: 'left' });
    pts.push({ x: b.x, y: b.y, idx, kind: 'right' });
  });
  pts.sort((p, q) => (p.x - q.x) || (p.y - q.y) || (p.kind === q.kind ? 0 : p.kind === 'left' ? -1 : 1));

  // Status structure: an array of segment indices, kept ordered by their
  // y-coordinate at the current sweep position (approximated by the
  // segment's y at its left endpoint plus slope, which is exact for the
  // non-degenerate random segments this sandbox generates and good enough,
  // visually, for the rare near-degenerate case).
  const yAt = (idx, x) => {
    const [a, b] = segments[idx][0].x <= segments[idx][1].x ? segments[idx] : [segments[idx][1], segments[idx][0]];
    if (b.x === a.x) return a.y;
    return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  };

  let status = [];
  function resort(x) {
    status.sort((i, j) => yAt(i, x) - yAt(j, x));
  }

  for (const ev of pts) {
    if (ev.kind === 'left') {
      status.push(ev.idx);
      resort(ev.x);
      const pos = status.indexOf(ev.idx);
      events.push({ type: 'insert', idx: ev.idx, x: ev.x, status: status.slice() });
      const above = status[pos - 1], below = status[pos + 1];
      if (above != null && segmentsIntersect(segments[ev.idx], segments[above])) {
        events.push({ type: 'found', idx: ev.idx, other: above });
        return { found: true, i: ev.idx, j: above, events };
      }
      if (below != null && segmentsIntersect(segments[ev.idx], segments[below])) {
        events.push({ type: 'found', idx: ev.idx, other: below });
        return { found: true, i: ev.idx, j: below, events };
      }
    } else {
      resort(ev.x);
      const pos = status.indexOf(ev.idx);
      const above = status[pos - 1], below = status[pos + 1];
      status.splice(pos, 1);
      events.push({ type: 'remove', idx: ev.idx, x: ev.x, status: status.slice() });
      if (above != null && below != null && segmentsIntersect(segments[above], segments[below])) {
        events.push({ type: 'found', idx: above, other: below });
        return { found: true, i: above, j: below, events };
      }
    }
  }
  return { found: false, i: -1, j: -1, events };
}
