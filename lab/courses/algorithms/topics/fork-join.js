// Fork-join parallelism: work and span. A computation is a DAG of tasks,
// each task costing some amount of time, with edges meaning "this task
// must finish before that one starts" (a fork splits one task into several
// that can run in parallel; a join waits for them all to finish). Work
// (T1) is the total time every task costs added up, as if run on one
// processor; span (T_infinity) is the length of the longest chain of
// dependent tasks, the fastest the computation could possibly finish even
// with infinitely many processors. A greedy scheduler (never leave a
// processor idle while a ready task exists) is guaranteed to finish within
// T1/P + T_infinity on P processors. No DOM access. CLRS: Multithreaded
// Algorithms (work, span, the greedy scheduler bound).
import { makeRandomGraph } from '../engine/graph.js';
import { layoutLayered } from '../engine/layout.js';

const CODE = [
  'T1 = sum of every task\'s cost                    // the work',
  'T_inf = length of the longest chain of dependent tasks   // the span',
  'greedy scheduler on P processors: whenever a processor is idle',
  '  and some task\'s dependencies are all done, start it immediately',
  'theorem: the greedy schedule finishes within T1/P + T_inf',
];

function buildSuccessors(n, edges) {
  const succ = Array.from({ length: n }, () => []);
  const indeg = Array(n).fill(0);
  for (const { u, v } of edges) { succ[u].push(v); indeg[v]++; }
  return { succ, indeg };
}

// Longest-path DP over a topological order: finish[u] is the earliest
// possible completion time of task u with unlimited processors (every
// dependency free to start the moment it's ready), so the span is the
// largest finish time over all tasks.
function computeSpan(n, succ, indeg0, work) {
  const indeg = indeg0.slice();
  const order = [];
  const q = [];
  for (let i = 0; i < n; i++) if (indeg0[i] === 0) q.push(i);
  while (q.length) {
    const u = q.shift();
    order.push(u);
    for (const v of succ[u]) { indeg[v]--; if (indeg[v] === 0) q.push(v); }
  }
  const finish = Array(n).fill(0);
  for (const u of order) {
    finish[u] += work[u];
    for (const v of succ[u]) finish[v] = Math.max(finish[v], finish[u]);
  }
  return n === 0 ? 0 : Math.max(...finish);
}

function greedySchedule(n, succ, indeg0, work, P) {
  const indeg = indeg0.slice();
  const procBusyUntil = Array(P).fill(0);
  const procTask = Array(P).fill(null);
  const finishTime = Array(n).fill(null);
  let readyQueue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) readyQueue.push(i);
  readyQueue.sort((a, b) => a - b);
  let t = 0, completed = 0;
  const log = [];
  const totalWork = work.reduce((s, w) => s + w, 0);
  const safety = totalWork + n + 5;
  while (completed < n && t <= safety) {
    for (let p = 0; p < P; p++) {
      if (procTask[p] != null && procBusyUntil[p] === t) {
        const node = procTask[p];
        finishTime[node] = t;
        completed++;
        procTask[p] = null;
        for (const s of succ[node]) { indeg[s]--; if (indeg[s] === 0) readyQueue.push(s); }
      }
    }
    readyQueue.sort((a, b) => a - b);
    for (let p = 0; p < P; p++) {
      if (procTask[p] == null && readyQueue.length > 0) {
        const node = readyQueue.shift();
        procTask[p] = node;
        procBusyUntil[p] = t + work[node];
        log.push({ node, start: t, end: t + work[node], proc: p });
      }
    }
    if (completed >= n) break;
    t++;
  }
  const makespan = n === 0 ? 0 : Math.max(...finishTime);
  return { finishTime, log, makespan };
}

function dagFrame(n, nodes, edges, work, activeNodes, caption, line) {
  const laidOut = nodes.map((p, id) => ({ id, label: `${id}:${work[id]}`, x: p.x, y: p.y, active: activeNodes.includes(id) }));
  return { kind: 'tree', code: CODE, line, caption, nodes: laidOut, edges: edges.map((e) => [e.u, e.v]), emptyText: '(no tasks)' };
}

function* run(input) {
  const { n, edges, work, procCount } = input;
  const { succ, indeg } = buildSuccessors(n, edges);
  const positions = Array.from({ length: n }, () => ({ x: 50, y: 50 }));
  layoutLayered(positions, edges);

  if (n === 0) {
    yield dagFrame(n, positions, edges, work, [], 'No tasks.', 0);
    return { workTotal: 0, span: 0, makespan: 0, procCount };
  }

  const workTotal = work.reduce((s, w) => s + w, 0);
  const span = computeSpan(n, succ, indeg, work);
  yield dagFrame(n, positions, edges, work, [], `${n} tasks. Work T1 = ${workTotal} (every task's cost added up). Span T_inf = ${span} (the longest dependency chain).`, 0);

  const { log, makespan } = greedySchedule(n, succ, indeg, work, procCount);
  const byStart = {};
  for (const l of log) { (byStart[l.start] ||= []).push(l.node); }
  const times = Object.keys(byStart).map(Number).sort((a, b) => a - b);
  for (const t of times) {
    yield dagFrame(n, positions, edges, work, byStart[t], `Time ${t}: start task${byStart[t].length === 1 ? '' : 's'} [${byStart[t].join(', ')}] (${procCount} processor${procCount === 1 ? '' : 's'}, greedy: never leave one idle while a ready task exists).`, 3);
  }
  const bound = workTotal / procCount + span;
  yield dagFrame(n, positions, edges, work, [], `Finished at time ${makespan} on ${procCount} processors. T1/P + T_inf = ${workTotal}/${procCount} + ${span} = ${bound.toFixed(2)}: the greedy bound holds (${makespan} <= ${bound.toFixed(2)}).`, 4);

  return { workTotal, span, makespan, procCount };
}

export default {
  id: 'fork-join',
  title: 'Fork-join parallelism: work and span',
  module: 'm09',
  course: 'CSC373, CSC473',
  clrs: 'Multithreaded Algorithms',
  summary:
    'A fork-join computation is a DAG: forking a task spawns children that can run in parallel, and joining waits for all of them to finish before continuing. ' +
    'Work, T1, is the total cost of every task added up, exactly how long the whole computation would take on a single processor. ' +
    'Span, T_infinity, is the length of the longest chain of tasks that must run one after another no matter how many processors are available, a hard lower bound on the finishing time even with unlimited parallelism. ' +
    'A greedy scheduler (one that never lets a processor sit idle while some task with all its dependencies satisfied is waiting to run) is guaranteed, by a clean potential-style argument, to finish within T1/P + T_infinity time on P processors: the T1/P term bounds how long it takes if parallelism is the bottleneck, and the T_infinity term bounds the unavoidable serial chain. ' +
    'That single inequality is the main reason "work and span" is the right pair of numbers to reason about a parallel algorithm with: T1/P alone is the best possible speedup on P processors, and comparing it against T_infinity tells you exactly how much parallelism the computation actually has to give.',
  code: CODE,
  complexity: {
    time: 'Greedy scheduler finishes within T1/P + T_infinity on P processors.',
    why: 'This is CLRS\'s greedy scheduler theorem: split time into "complete" steps (every processor busy, contributing at most T1/P of them before the remaining work runs out) and "incomplete" steps (some processor idle, which can only happen when the ready set is a bottleneck on the current longest remaining chain, contributing at most T_infinity of them). Summing those two bounds on the number of steps gives T1/P + T_infinity as an upper bound on the total makespan, regardless of the DAG\'s shape.',
  },
  makeInput(rng, size) {
    const n = Math.max(0, Math.min(10, size));
    if (n === 0) return { n: 0, edges: [], work: [], procCount: 2 };
    const g = makeRandomGraph(rng, n, { directed: true, dag: true, extraEdgeFraction: 0.3 });
    const work = Array.from({ length: n }, () => 1 + Math.floor(rng() * 4));
    const procCount = 1 + Math.floor(rng() * 3);
    return { n, edges: g.edges.map((e) => ({ u: e.u, v: e.v })), work, procCount };
  },
  run,
  check(input, result) {
    if (!result) return false;
    const { n, edges, work, procCount } = input;
    if (n === 0) return result.workTotal === 0 && result.span === 0 && result.makespan === 0;
    const { succ, indeg } = buildSuccessors(n, edges);
    const expectedWork = work.reduce((s, w) => s + w, 0);
    const expectedSpan = computeSpan(n, succ, indeg, work);
    if (result.workTotal !== expectedWork || result.span !== expectedSpan) return false;
    const bound = expectedWork / procCount + expectedSpan;
    return result.makespan <= bound + 1e-9 && result.makespan >= Math.max(expectedSpan, expectedWork / procCount) - 1e-9;
  },
  sandbox: { type: 'n', min: 0, max: 10, default: 6, label: 'tasks' },
};
