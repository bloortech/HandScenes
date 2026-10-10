// Segment intersection via a sweep line: does any pair of segments in a
// set cross? Instead of checking every pair (O(n^2)), sweep a vertical
// line left to right over the endpoints, keeping the segments crossing it
// ordered top to bottom in a status structure. Any two segments that will
// ever intersect must become adjacent in that order before they cross, so
// checking only newly-adjacent neighbours at each endpoint event still
// finds every intersection. No DOM access. CLRS: Computational Geometry
// (ANY-SEGMENTS-INTERSECT).
import { randInt } from '../engine/rng.js';
import { sweepAnySegmentsIntersect, anySegmentsIntersectBruteForce } from '../engine/geometry.js';

const CODE = [
  'sort the 2n endpoints left to right',
  'T = empty status structure, ordered by y at the sweep line',
  'for each endpoint event, left to right:',
  '  if left endpoint of segment s: insert s into T',
  '    if s intersects its neighbour above or below: report it',
  '  if right endpoint of segment s:',
  '    if the neighbours above and below s intersect: report it',
  '    remove s from T',
];

function segFrame(segments, statusIdx, highlightIdx, caption, line) {
  const xs = segments.flatMap((s) => [s[0].x, s[1].x]);
  const ys = segments.flatMap((s) => [s[0].y, s[1].y]);
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys);
  const sx = (x) => 6 + ((x - minX) / (maxX - minX || 1)) * 88;
  const sy = (y) => 94 - ((y - minY) / (maxY - minY || 1)) * 88;

  const nodes = [];
  const edges = [];
  segments.forEach((seg, i) => {
    const aId = `a${i}`, bId = `b${i}`;
    const highlighted = highlightIdx && highlightIdx.includes(i);
    const inStatus = statusIdx && statusIdx.includes(i);
    nodes.push({ id: aId, label: '', x: sx(seg[0].x), y: sy(seg[0].y), w: 3, h: 3, active: highlighted, compare: inStatus && !highlighted, dim: !inStatus && !highlighted });
    nodes.push({ id: bId, label: '', x: sx(seg[1].x), y: sy(seg[1].y), w: 3, h: 3, active: highlighted, compare: inStatus && !highlighted, dim: !inStatus && !highlighted });
    edges.push([aId, bId]);
  });
  return { kind: 'boxes', code: CODE, line, caption, nodes, edges, emptyText: '(no segments)' };
}

function* run(input) {
  const { segments } = input;
  if (segments.length < 2) {
    yield segFrame(segments, segments.map((_, i) => i), null, 'Fewer than two segments: nothing can intersect.', 0);
    return { found: false, i: -1, j: -1 };
  }

  yield segFrame(segments, null, null, `Sweep left to right over ${segments.length} segments, checking only neighbours in the status structure.`, 0);

  const { found, i, j, events } = sweepAnySegmentsIntersect(segments);
  for (const ev of events) {
    if (ev.type === 'insert') {
      yield segFrame(segments, ev.status, [ev.idx], `Left endpoint: insert segment ${ev.idx} into the status structure.`, 3);
    } else if (ev.type === 'remove') {
      yield segFrame(segments, ev.status, [ev.idx], `Right endpoint: remove segment ${ev.idx} from the status structure.`, 7);
    } else if (ev.type === 'found') {
      yield segFrame(segments, null, [ev.idx, ev.other], `Segments ${ev.idx} and ${ev.other} are adjacent in the status structure and intersect: report it.`, 4);
    }
  }

  yield segFrame(segments, null, found ? [i, j] : null, found ? `Done: segments ${i} and ${j} intersect.` : 'Done: no pair of segments intersects.', 0);
  return { found, i, j };
}

export default {
  id: 'segment-intersection',
  title: 'Segment intersection: the sweep line',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Computational Geometry',
  summary:
    'Checking whether any two segments among n cross each other, the obvious way, means testing every pair: O(n^2). ' +
    'A sweep line does much better by imagining a vertical line moving left to right across the picture, pausing only at the 2n segment endpoints, and keeping the segments currently crossing the line in a status structure ordered top to bottom by where they cross it. ' +
    "The key fact (CLRS's lemma behind ANY-SEGMENTS-INTERSECT) is that if two segments are ever going to intersect, they must become adjacent to each other in that top-to-bottom order at some point before they actually cross; so it is enough to check only newly adjacent neighbours whenever a segment is inserted or removed, never every pair. " +
    'A left endpoint inserts its segment and checks its immediate neighbours above and below; a right endpoint checks whether removing its segment makes two other segments newly adjacent, and if so checks those, then removes it. ' +
    'That turns an O(n^2) all-pairs scan into an O(n log n) sweep (the sort of endpoints dominates, with an O(log n) status structure), the same "reduce to only checking neighbours" idea this course will reuse for other geometric sweeps.',
  code: CODE,
  complexity: {
    time: 'O(n log n) for n segments, versus O(n^2) checking every pair.',
    why: 'Sorting 2n endpoints costs O(n log n). Each of the 2n events does O(log n) work in a balanced status structure (insert, delete, and a constant number of neighbour lookups), so the sweep itself is O(n log n) too. The all-pairs baseline instead checks every one of the C(n,2) pairs directly, O(n^2).',
  },
  makeInput(rng, size) {
    const n = Math.max(0, size);
    const segments = [];
    for (let k = 0; k < n; k++) {
      let a, b;
      do {
        a = { x: randInt(rng, 0, 19), y: randInt(rng, 0, 19) };
        b = { x: randInt(rng, 0, 19), y: randInt(rng, 0, 19) };
      } while (a.x === b.x);
      segments.push([a, b]);
    }
    return { segments };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const expected = anySegmentsIntersectBruteForce(input.segments);
    return result.found === expected.found;
  },
  sandbox: { type: 'n', min: 0, max: 16, default: 8, label: 'segments' },
};
