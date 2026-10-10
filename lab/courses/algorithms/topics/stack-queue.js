// Stacks and queues, each built two ways: backed by a plain array, and
// backed by a linked chain of nodes. Same push/pop (stack, LIFO) and
// enqueue/dequeue (queue, FIFO) operations, same results, different
// underlying storage. No DOM access.

const CODE_STACK_ARRAY = [
  'push(value): array.append(value)',
  'pop(): return array.remove_last()',
];
const CODE_STACK_LINKED = [
  'push(value): node = Node(value); node.next = top; top = node',
  'pop(): value = top.value; top = top.next; return value',
];
const CODE_QUEUE_ARRAY = [
  'enqueue(value): array.append(value)',
  'dequeue(): return array.remove_first()  (shifts every later item)',
];
const CODE_QUEUE_LINKED = [
  'enqueue(value): node = Node(value); link node after rear; rear = node',
  'dequeue(): value = front.value; front = front.next; return value',
];

let idCounter = 0;

function boxesFrame(items, { pointerLabel, active, caption, line, code }) {
  const n = Math.max(1, items.length);
  const nodes = items.map((it, i) => ({
    id: it.id,
    label: String(it.value),
    x: n === 1 ? 50 : 8 + (i / (n - 1)) * 84,
    y: 50,
    w: 12,
    h: 16,
    active: active != null && it.id === active,
  }));
  const pointers = [];
  if (items.length) {
    if (pointerLabel === 'stack') pointers.push({ x: nodes[nodes.length - 1].x, y: 25, text: 'top' });
    else {
      pointers.push({ x: nodes[0].x, y: 25, text: 'front' });
      pointers.push({ x: nodes[nodes.length - 1].x, y: 75, text: 'rear' });
    }
  }
  return { kind: 'boxes', line, code, caption, nodes, edges: [], pointers, emptyText: '(empty)' };
}

// --- Array-backed versions: push/enqueue appends, pop/dequeue removes from
// the matching end (last for a stack, first for a queue, which is the O(n)
// shift a linked queue avoids). ---
function* runArrayStack(values) {
  const arr = [];
  const popped = [];
  for (const v of values) {
    arr.push({ id: idCounter++, value: v });
    yield boxesFrame(arr, { pointerLabel: 'stack', active: arr[arr.length - 1].id, caption: `Array stack: push ${v}.`, line: 0, code: CODE_STACK_ARRAY });
  }
  while (arr.length) {
    const top = arr[arr.length - 1];
    yield boxesFrame(arr, { pointerLabel: 'stack', active: top.id, caption: `Array stack: pop ${top.value} off the end.`, line: 1, code: CODE_STACK_ARRAY });
    arr.pop();
    popped.push(top.value);
    yield boxesFrame(arr, { pointerLabel: 'stack', caption: `Array stack now has ${arr.length} item${arr.length === 1 ? '' : 's'}.`, line: 1, code: CODE_STACK_ARRAY });
  }
  return popped;
}

function* runArrayQueue(values) {
  const arr = [];
  const dequeued = [];
  for (const v of values) {
    arr.push({ id: idCounter++, value: v });
    yield boxesFrame(arr, { pointerLabel: 'queue', active: arr[arr.length - 1].id, caption: `Array queue: enqueue ${v} at the rear.`, line: 0, code: CODE_QUEUE_ARRAY });
  }
  while (arr.length) {
    const front = arr[0];
    yield boxesFrame(arr, { pointerLabel: 'queue', active: front.id, caption: `Array queue: dequeue ${front.value} from the front (shifts everyone else left).`, line: 1, code: CODE_QUEUE_ARRAY });
    arr.shift();
    dequeued.push(front.value);
    yield boxesFrame(arr, { pointerLabel: 'queue', caption: `Array queue now has ${arr.length} item${arr.length === 1 ? '' : 's'}.`, line: 1, code: CODE_QUEUE_ARRAY });
  }
  return dequeued;
}

// --- Linked versions: a stack is a chain with push/pop at the head (O(1),
// no shifting); a queue needs both a head (front) and tail (rear) pointer
// so enqueue at the rear is also O(1). ---
function* runLinkedStack(values) {
  let top = null;
  const popped = [];
  const nodeList = () => {
    const out = [];
    let n = top;
    while (n) { out.push(n); n = n.next; }
    return out.reverse(); // display oldest-pushed first, left to right
  };
  for (const v of values) {
    const node = { id: idCounter++, value: v, next: top };
    top = node;
    yield boxesFrame(nodeList(), { pointerLabel: 'stack', active: node.id, caption: `Linked stack: push ${v} as the new top.`, line: 0, code: CODE_STACK_LINKED });
  }
  while (top) {
    yield boxesFrame(nodeList(), { pointerLabel: 'stack', active: top.id, caption: `Linked stack: pop ${top.value} off the top.`, line: 1, code: CODE_STACK_LINKED });
    popped.push(top.value);
    top = top.next;
    yield boxesFrame(nodeList(), { pointerLabel: 'stack', caption: `Top is now ${top ? top.value : 'empty'}.`, line: 1, code: CODE_STACK_LINKED });
  }
  return popped;
}

function* runLinkedQueue(values) {
  let front = null, rear = null;
  const dequeued = [];
  const nodeList = () => {
    const out = [];
    let n = front;
    while (n) { out.push(n); n = n.next; }
    return out;
  };
  for (const v of values) {
    const node = { id: idCounter++, value: v, next: null };
    if (!front) front = node; else rear.next = node;
    rear = node;
    yield boxesFrame(nodeList(), { pointerLabel: 'queue', active: node.id, caption: `Linked queue: enqueue ${v} after the current rear.`, line: 0, code: CODE_QUEUE_LINKED });
  }
  while (front) {
    yield boxesFrame(nodeList(), { pointerLabel: 'queue', active: front.id, caption: `Linked queue: dequeue ${front.value} from the front.`, line: 1, code: CODE_QUEUE_LINKED });
    dequeued.push(front.value);
    front = front.next;
    if (!front) rear = null;
    yield boxesFrame(nodeList(), { pointerLabel: 'queue', caption: `Front is now ${front ? front.value : 'empty'}.`, line: 1, code: CODE_QUEUE_LINKED });
  }
  return dequeued;
}

function* run(input) {
  idCounter = 0;
  const values = input.array;
  const stackArrayPopped = yield* runArrayStack(values);
  const stackLinkedPopped = yield* runLinkedStack(values);
  const queueArrayDequeued = yield* runArrayQueue(values);
  const queueLinkedDequeued = yield* runLinkedQueue(values);
  return { stackArrayPopped, stackLinkedPopped, queueArrayDequeued, queueLinkedDequeued };
}

export default {
  id: 'stack-queue',
  title: 'Stacks and queues',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Elementary Data Structures',
  summary:
    'A stack is last-in-first-out: the next item popped is always the most recently pushed one. A queue is first-in-first-out: the next item dequeued is always the one that has been waiting longest. ' +
    'Both can be built on top of a plain array. A stack works well that way since push and pop only ever touch the last slot. A queue is more awkward: removing from the front of an array means shifting every remaining item one slot left. ' +
    'A linked version fixes that: a stack pushes and pops at the head, and a queue keeps both a front and a rear pointer, so enqueue and dequeue both stay O(1) with no shifting. ' +
    'This sandbox pushes every value from the array onto an array-backed stack and a linked stack, then pops everything back off both, and does the same enqueue/dequeue dance for an array-backed and a linked queue. ' +
    'All four end up producing the same sequence of values (reversed order for the stacks, original order for the queues); only the internal bookkeeping differs. ' +
    'CLRS covers stacks and queues together as elementary data structures built from arrays and from linked lists.',
  code: CODE_STACK_ARRAY,
  complexity: {
    time: 'Array stack push/pop: O(1). Array queue enqueue: O(1), dequeue: O(n) (the shift). Linked stack and linked queue: O(1) for every operation.',
    why: 'An array stack only ever touches its last slot, so push/pop are O(1). An array queue\'s dequeue removes the first slot, so every other element has to shift down, costing O(n). A linked stack pushes/pops at the head (no shifting); a linked queue keeps a separate rear pointer so it can append in O(1) without walking the whole chain, and dequeues at the head in O(1) too.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(1 + Math.floor(rng() * 99));
    return { array };
  },
  run,
  check(input, result) {
    const values = input.array;
    const expectedStack = values.slice().reverse();
    const expectedQueue = values.slice();
    const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
    return (
      result &&
      eq(result.stackArrayPopped, expectedStack) &&
      eq(result.stackLinkedPopped, expectedStack) &&
      eq(result.queueArrayDequeued, expectedQueue) &&
      eq(result.queueLinkedDequeued, expectedQueue)
    );
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 7 },
};
