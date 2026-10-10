// A singly linked list, built from real node objects linked by `.next`
// (not a plain array under the hood), demonstrating insert, delete and
// in-place reversal. No DOM access.

const CODE_INSERT = [
  'insert(head, pos, value):',
  '  new_node = Node(value)',
  '  if pos == 0: new_node.next = head; return new_node',
  '  prev = walk to node at index pos - 1',
  '  new_node.next = prev.next',
  '  prev.next = new_node',
  '  return head',
];
const CODE_DELETE = [
  'delete(head, value):',
  '  if head.value == value: return head.next',
  '  prev = head, cur = head.next',
  '  while cur is not null:',
  '    if cur.value == value: prev.next = cur.next; return head',
  '    prev = cur, cur = cur.next',
  '  return head  (value not found)',
];
const CODE_REVERSE = [
  'reverse(head):',
  '  prev = null, cur = head',
  '  while cur is not null:',
  '    next = cur.next',
  '    cur.next = prev',
  '    prev = cur, cur = next',
  '  return prev  (the new head)',
];

let idCounter = 0;
function makeNode(value) {
  return { id: idCounter++, value, next: null };
}

function toNodeArray(head) {
  const out = [];
  let node = head;
  while (node) { out.push(node); node = node.next; }
  return out;
}

function toValueArray(head) {
  return toNodeArray(head).map((n) => n.value);
}

function sceneFrame(head, { active = [], compare = [], caption, line, code }) {
  const nodes = toNodeArray(head);
  const n = Math.max(1, nodes.length);
  const boxNodes = nodes.map((node, i) => ({
    id: node.id,
    label: String(node.value),
    x: n === 1 ? 50 : 8 + (i / (n - 1)) * 84,
    y: 45,
    w: 12,
    h: 16,
    active: active.includes(node.id),
    compare: compare.includes(node.id),
  }));
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push([nodes[i].id, nodes[i + 1].id]);
  const pointers = nodes.length ? [{ x: boxNodes[0].x, y: 20, text: 'head' }] : [];
  return { kind: 'boxes', line, code, caption, nodes: boxNodes, edges, pointers, emptyText: '(empty list)' };
}

function* buildList(array) {
  let head = null, tail = null;
  if (array.length === 0) {
    yield sceneFrame(null, { caption: 'Starting from an empty list.', line: 0, code: CODE_INSERT });
    return null;
  }
  for (const v of array) {
    const node = makeNode(v);
    if (!head) head = node; else tail.next = node;
    tail = node;
    yield sceneFrame(head, { active: [node.id], caption: `Append ${v} to build the starting list.`, line: 0, code: CODE_INSERT });
  }
  return head;
}

function* insertAt(head, pos, value) {
  const len = toNodeArray(head).length;
  const clampedPos = Math.max(0, Math.min(pos, len));
  const newNode = makeNode(value);
  yield sceneFrame(head, { caption: `Insert ${value} at position ${clampedPos}.`, line: 0, code: CODE_INSERT });

  if (clampedPos === 0) {
    newNode.next = head;
    yield sceneFrame(newNode, { active: [newNode.id], caption: `Position is 0: the new node becomes the head.`, line: 2, code: CODE_INSERT });
    return newNode;
  }

  let prev = head;
  for (let i = 0; i < clampedPos - 1; i++) {
    yield sceneFrame(head, { compare: [prev.id], caption: `Walk forward to find the node just before position ${clampedPos}.`, line: 3, code: CODE_INSERT });
    prev = prev.next;
  }
  yield sceneFrame(head, { active: [prev.id], caption: `Found the node just before position ${clampedPos}.`, line: 3, code: CODE_INSERT });
  newNode.next = prev.next;
  prev.next = newNode;
  yield sceneFrame(head, { active: [newNode.id, prev.id], caption: `Link ${value} in right after that node.`, line: 5, code: CODE_INSERT });
  return head;
}

function* deleteValue(head, value) {
  yield sceneFrame(head, { caption: `Delete the first node holding ${value}, if any.`, line: 0, code: CODE_DELETE });
  if (!head) return head;
  if (head.value === value) {
    yield sceneFrame(head, { active: [head.id], caption: `The head holds ${value}. Drop it; its next node becomes the new head.`, line: 0, code: CODE_DELETE });
    return head.next;
  }
  let prev = head, cur = head.next;
  while (cur) {
    yield sceneFrame(head, { compare: [cur.id], active: [prev.id], caption: `Check node ${cur.value}.`, line: 4, code: CODE_DELETE });
    if (cur.value === value) {
      prev.next = cur.next;
      yield sceneFrame(head, { active: [prev.id], caption: `Found ${value}. Skip past it by relinking.`, line: 4, code: CODE_DELETE });
      return head;
    }
    prev = cur;
    cur = cur.next;
  }
  yield sceneFrame(head, { caption: `${value} is not in the list. Nothing to delete.`, line: 6, code: CODE_DELETE });
  return head;
}

function* reverseList(head) {
  yield sceneFrame(head, { caption: 'Reverse the list in place, one next-pointer at a time.', line: 0, code: CODE_REVERSE });
  let prev = null, cur = head;
  while (cur) {
    const next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
    // Render the already-reversed prefix (now pointing backwards) followed
    // by whatever remains of the original forward chain.
    const reversedChain = prev;
    const frame = sceneFrameSplit(reversedChain, cur, prev.id);
    yield frame;
  }
  return prev;
}

// During reversal the list is briefly split into two chains (the reversed
// part, and the untouched remainder), so lay them both out left to right
// in visit order rather than following a single `.next` chain.
function sceneFrameSplit(reversedHead, remainder, activeId) {
  const reversedNodes = toNodeArray(reversedHead).slice().reverse(); // display left-to-right in original order
  const remainderNodes = toNodeArray(remainder);
  const all = [...reversedNodes, ...remainderNodes];
  const n = Math.max(1, all.length);
  const boxNodes = all.map((node, i) => ({
    id: node.id,
    label: String(node.value),
    x: n === 1 ? 50 : 8 + (i / (n - 1)) * 84,
    y: 45,
    w: 12,
    h: 16,
    active: node.id === activeId,
    dim: reversedNodes.includes(node),
  }));
  const edges = [];
  // Reversed portion's arrows point backwards (toward the earlier node).
  for (let i = reversedNodes.length - 1; i > 0; i--) edges.push([reversedNodes[i].id, reversedNodes[i - 1].id]);
  for (let i = 0; i < remainderNodes.length - 1; i++) edges.push([remainderNodes[i].id, remainderNodes[i + 1].id]);
  return {
    kind: 'boxes',
    line: 3,
    code: CODE_REVERSE,
    caption: `${all.find((n) => n.id === activeId)?.value} now points to the previous node instead of the next one.`,
    nodes: boxNodes,
    edges,
    pointers: boxNodes.length ? [{ x: boxNodes[0].x, y: 20, text: 'head (so far)' }] : [],
    emptyText: '(empty list)',
  };
}

function* run(input) {
  idCounter = 0;
  let head = yield* buildList(input.array);
  head = yield* insertAt(head, input.insertPos, input.insertValue);
  head = yield* deleteValue(head, input.deleteValue);
  head = yield* reverseList(head);
  return toValueArray(head);
}

function expected(input) {
  const arr = input.array.slice();
  const pos = Math.max(0, Math.min(input.insertPos, arr.length));
  arr.splice(pos, 0, input.insertValue);
  const idx = arr.indexOf(input.deleteValue);
  if (idx !== -1) arr.splice(idx, 1);
  arr.reverse();
  return arr;
}

export default {
  id: 'linked-list',
  title: 'Linked lists',
  module: 'm02',
  course: 'CSC148, CSC165',
  clrs: 'Elementary Data Structures',
  summary:
    'A singly linked list is a chain of nodes, each holding a value and a pointer to the next node, with no requirement that they sit next to each other in memory. ' +
    'Inserting or deleting a node only needs to change a couple of next-pointers, no shifting every other element over like an array would. ' +
    'The cost is that you cannot jump straight to position k: you have to walk the chain from the head, one next-pointer at a time. ' +
    'This sandbox builds a list from the array, inserts one value at a chosen position, deletes one value if it is present, and finally reverses the whole list in place by flipping every next-pointer. ' +
    'Reversal needs no extra nodes: it walks the list once, redirecting each node to point at the one before it instead of the one after. ' +
    'CLRS covers linked lists as one of its elementary data structures, alongside arrays, stacks and queues.',
  code: CODE_INSERT,
  complexity: {
    time: 'Insert/delete at a known node: O(1). Insert/delete at position k, or search by value: O(k) or O(n). Reverse: O(n).',
    why: 'Changing next-pointers once you are at the right node is O(1), but singly linked lists have no random access, so reaching position k (or finding a value) means walking k (or up to n) nodes first. Reversal visits every node exactly once to flip its pointer, so it is O(n) with O(1) extra space.',
  },
  makeInput(rng, size) {
    const array = [];
    for (let i = 0; i < size; i++) array.push(10 + Math.floor(rng() * 90));
    const insertValue = 1 + Math.floor(rng() * 9); // distinct range from the built values, keeps traces easy to read
    const insertPos = Math.floor(rng() * (size + 1));
    const deleteValue = size > 0 && rng() < 0.6 ? array[Math.floor(rng() * size)] : 1 + Math.floor(rng() * 9);
    return { array, insertValue, insertPos, deleteValue };
  },
  run,
  check(input, result) {
    const exp = expected(input);
    return Array.isArray(result) && result.length === exp.length && result.every((v, i) => v === exp[i]);
  },
  sandbox: { type: 'array', min: 0, max: 20, default: 7 },
};
