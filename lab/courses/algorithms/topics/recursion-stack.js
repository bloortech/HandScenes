// Recursion and the call stack: factorial, naive Fibonacci, and memoized
// Fibonacci, all drawn as a recursion tree. The currently "active" nodes
// (amber) are exactly the calls on the stack right now; a call that returns
// gets dimmed; a memoized Fibonacci call that finds its answer already
// cached (instead of recursing again) is marked cyan. No DOM access.
import { layoutTree } from '../engine/layout.js';

const CODE_FACTORIAL = [
  'factorial(n):',
  '  if n <= 1: return 1',
  '  return n * factorial(n - 1)',
];
const CODE_FIB = [
  'fib(n):',
  '  if n <= 1: return n',
  '  return fib(n - 1) + fib(n - 2)',
];
const CODE_FIB_MEMO = [
  'fib_memo(n, memo):',
  '  if n <= 1: return n',
  '  if n in memo: return memo[n]',
  '  memo[n] = fib_memo(n-1, memo) + fib_memo(n-2, memo)',
  '  return memo[n]',
];

function factorialExpected(n) {
  let v = 1;
  for (let k = 2; k <= n; k++) v *= k;
  return v;
}
function fibExpected(n) {
  let a = 0, b = 1;
  for (let k = 0; k < n; k++) { [a, b] = [b, a + b]; }
  return a;
}

// Builds the full recursion tree up front (pure data, no yielding), then a
// second pass walks it to produce frames. `build` returns a node:
// { id, label, k, value, isBase, isMemoHit, children: [] }.
function buildFactorial(n, nextId) {
  const node = { id: nextId(), label: `factorial(${n})`, k: n, children: [] };
  if (n <= 1) { node.value = 1; node.isBase = true; return node; }
  const child = buildFactorial(n - 1, nextId);
  node.children = [child];
  node.value = n * child.value;
  return node;
}

function buildFib(n, nextId) {
  const node = { id: nextId(), label: `fib(${n})`, k: n, children: [] };
  if (n <= 1) { node.value = n; node.isBase = true; return node; }
  const left = buildFib(n - 1, nextId);
  const right = buildFib(n - 2, nextId);
  node.children = [left, right];
  node.value = left.value + right.value;
  return node;
}

function buildFibMemo(n, nextId, memo) {
  const node = { id: nextId(), label: `fib(${n})`, k: n, children: [] };
  if (n <= 1) { node.value = n; node.isBase = true; return node; }
  if (memo.has(n)) {
    node.value = memo.get(n);
    node.isMemoHit = true;
    return node;
  }
  const left = buildFibMemo(n - 1, nextId, memo);
  const right = buildFibMemo(n - 2, nextId, memo);
  node.children = [left, right];
  node.value = left.value + right.value;
  memo.set(n, node.value);
  return node;
}

// Walks the finished tree in actual call order, yielding an "enter" frame
// (node becomes active, call pushed on the stack) and an "exit" frame
// (node's result known, call popped) for every node.
function* walk(root, allNodes, edges, mode) {
  const activePath = new Set();
  let calls = 0;

  function snapshot(finishedSet, extraCaption) {
    const nodes = allNodes.map((n) => ({
      id: n.id,
      label: n.finished ? `${n.label}=${n.value}` : n.label,
      x: n.x,
      y: n.y,
      active: activePath.has(n.id),
      dim: finishedSet.has(n.id) && !activePath.has(n.id),
      memoHit: !!n.isMemoHit,
    }));
    return { kind: 'tree', line: undefined, nodes, edges, caption: extraCaption, counters: { calls } };
  }

  const finished = new Set();

  function* visit(node) {
    calls++;
    activePath.add(node.id);
    const callLine = node.isBase ? 1 : node.isMemoHit ? 2 : 0;
    yield { ...snapshot(finished, `Call ${node.label}.`), line: callLine };

    for (const child of node.children) {
      yield* visit(child);
    }

    node.finished = true;
    finished.add(node.id);
    activePath.delete(node.id);
    const reason = node.isBase
      ? 'hits the base case'
      : node.isMemoHit
        ? 'is already in the memo table'
        : 'has both of its recursive calls back';
    const exitLine = node.isBase ? 1 : node.isMemoHit ? 2 : mode === 'fib-memo' ? 4 : 2;
    yield { ...snapshot(finished, `${node.label} ${reason} and returns ${node.value}.`), line: exitLine };
  }

  yield* visit(root);
}

function* run(input) {
  const mode = input.mode;
  const n = input.n;
  let id = 0;
  const nextId = () => id++;

  let root;
  if (mode === 'factorial') root = buildFactorial(n, nextId);
  else if (mode === 'fib') root = buildFib(n, nextId);
  else root = buildFibMemo(n, nextId, new Map());

  layoutTree(root);

  const allNodes = [];
  const edges = [];
  (function collect(node) {
    allNodes.push(node);
    for (const child of node.children) {
      edges.push([node.id, child.id]);
      collect(child);
    }
  })(root);

  const code = mode === 'factorial' ? CODE_FACTORIAL : mode === 'fib' ? CODE_FIB : CODE_FIB_MEMO;
  yield {
    kind: 'tree',
    line: 0,
    caption: `Call ${mode === 'factorial' ? `factorial(${n})` : `fib(${n})`}${mode === 'fib-memo' ? ' with memoization' : ''}.`,
    nodes: allNodes.map((nd) => ({ id: nd.id, label: nd.label, x: nd.x, y: nd.y })),
    edges,
    counters: { calls: 0 },
  };

  for (const frame of walk(root, allNodes, edges, mode)) {
    frame.code = code;
    yield frame;
  }

  return { mode, n, value: root.value };
}

export default {
  id: 'recursion-stack',
  title: 'Recursion and the call stack',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Elementary Data Structures (the call stack); Growth of Functions (exponential blowup)',
  summary:
    'Every recursive call pushes a new frame onto the call stack, which holds that call\'s local variables (like n) until it returns. ' +
    'The amber nodes in the diagram are exactly the calls currently on the stack: the active call plus everything waiting above it for a recursive call to finish. ' +
    'Factorial recurses once per call, so its stack is a straight line as deep as n. Naive Fibonacci recurses twice per call, so its recursion tree branches and re-solves the same smaller subproblems over and over, which is why its running time explodes exponentially. ' +
    'Memoized Fibonacci caches each subproblem\'s answer the first time it is solved (marked cyan on repeat), so every later call to the same n is an instant lookup instead of a fresh recursion, cutting the tree down to a small, roughly linear shape. ' +
    'This is the core idea behind dynamic programming, which a later module in this course covers in depth. ' +
    'CLRS introduces the call stack as part of elementary data structures and uses exactly this kind of exponential-blowup argument when analysing naive recursive algorithms.',
  code: CODE_FIB,
  complexity: {
    time: 'factorial(n): O(n). fib(n) naive: O(2^n) (actually O(phi^n), the golden-ratio base, but exponential either way). fib(n) memoized: O(n).',
    why: 'Factorial makes one recursive call per level, n levels deep, so O(n) calls total. Naive Fibonacci makes two recursive calls per non-base call, so the number of calls roughly doubles each level the tree gets, giving exponential growth. Memoizing Fibonacci means each distinct value of n is only ever computed once; every repeat call is an O(1) cache lookup, so the total work collapses back down to O(n).',
  },
  makeInput(rng, size) {
    const roll = rng();
    const mode = roll < 1 / 3 ? 'factorial' : roll < 2 / 3 ? 'fib' : 'fib-memo';
    let n = Math.max(0, size);
    if (mode === 'fib') n = Math.min(n, 9); // naive fib's tree size is exponential in n
    else n = Math.min(n, 20);
    return { mode, n };
  },
  run,
  check(input, result) {
    if (!result || result.mode !== input.mode) return false;
    const n = Math.max(0, input.mode === 'fib' ? Math.min(input.n, 9) : Math.min(input.n, 20));
    if (result.n !== n) return false;
    const expected = input.mode === 'factorial' ? factorialExpected(n) : fibExpected(n);
    return result.value === expected;
  },
  sandbox: { type: 'n', min: 0, max: 20, default: 6, label: 'n' },
};
