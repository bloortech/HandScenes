# Build log

## ALG02 — m03: proofs, recurrences and automata (2026-10-10)

Built all nine m03 topics, reusing and extending the ALG00/ALG01 engine:

- **Engine additions**:
  - `engine/automaton.js` (new, pure, no DOM, like `bintree.js`): DFA/NFA
    simulation, epsilon-closure, the subset construction, Moore's
    partition-refinement DFA minimisation, a brute-force DFA-language-
    equality checker (sound up to the Myhill-Nerode string-length bound), a
    small regex parser (literals, `|`, implicit concatenation, `* + ?`,
    parentheses), Thompson's construction from that parser's AST, an
    independent backtracking regex matcher (used only to cross-check
    Thompson's construction from an unrelated direction), and
    `randomDFA`/`randomNFA`/`randomString` generators for `makeInput`.
  - `engine/layout.js`: added `layoutCircle`, placing a flat list of nodes
    (not a tree) evenly around a circle in the same normalised 0..100 box,
    so automaton diagrams (which have cycles) can reuse the existing
    `kind: 'tree'` node/edge renderer without needing a parent/child shape.
  - `engine/renderer.js`'s `_drawTree`: extended to draw edge labels (a
    third `[from, to, label]` element, used for transition symbols),
    self-loops (`from === to`, drawn as a small arc above the node instead
    of a degenerate line), a double ring for `node.accept` (an automaton's
    accepting states), and a short incoming arrow for `node.start`. All
    additive and optional, so m01/m02's existing tree frames (which never
    set these fields) render exactly as before.
  - `engine/sandbox.js`: added a third sandbox kind, `type: 'string'`, for
    topics whose editable input is a single text string (dfa/nfa-subset's
    test string, regex-nfa's regex) instead of an array or a bare number,
    following the same "preserve extra fields across edits" pattern the
    array sandbox already uses for bst/linked-list.

- **Topics**:
  - `induction`: three modes picked at random (like recursion-stack picks
    its three modes), animated as falling dominoes. Simple induction proves
    sum_{i=1}^n i = n(n+1)/2; strong induction proves a Fibonacci-style
    F(n) < 2^n, needing the *two* previous dominoes, not just one; structural
    induction builds a random full binary tree leaf-by-leaf and proves
    leaves = internal+1 by combining two already-proven subtrees under a new
    root (`kind: 'tree'`, reusing `layoutTree`).
  - `loop-invariant`: steps insertion sort (invariant: `a[0..i-1]` is
    sorted) or binary search (invariant: if the target is anywhere in the
    array, it's within `a[lo..hi]`), chosen at random, reusing the m01
    array-bar renderer. `check` fails closed if any recorded invariant
    check was false, not just if the final answer was wrong.
  - `recursion-tree`: expands T(n) = aT(n/b) + f(n), f(n) = c*n^d, level by
    level as an actual tree (`kind: 'tree'`), with a running total shown
    each level; `check` recomputes the same sum independently via the
    closed-form per-level formula rather than re-running the tree builder.
  - `master-theorem`: compares d to e = log_b(a) and picks the matching
    case; `check` does not just recompute the same comparison, it also
    numerically iterates the actual recurrence T(n) = aT(floor(n/b)) +
    c*n^d out to n = b^15 and confirms the real growth ratio matches what
    the claimed case predicts, as a brute-force sanity check independent of
    the classification formula.
  - `dfa`: a random total DFA (`engine/automaton.js randomDFA`) fed a
    user-edited test string one character at a time, drawn as a node/edge
    diagram with the double-ring/start-arrow renderer additions.
  - `nfa-subset`: a random NFA (with real nondeterminism: multiple
    transitions per symbol, and epsilon edges) simulated as a *set* of
    active states, then the subset construction building the equivalent DFA
    state by state. `check` brute-forces language equality between the NFA
    and the constructed DFA over every string up to the Myhill-Nerode bound,
    not just the one test string shown.
  - `regex-nfa`: Thompson's construction from a user-typed regex over
    {a,b}, animated fragment by fragment (literal, concat, union, star,
    plus, optional). `check` cross-verifies the independent backtracking
    matcher against the built NFA over every string up to length 6.
    **Found and fixed a real bug** here: the `opt` (`?`) case of
    `thompson()` originally reused the inner fragment's own start/accept
    nodes for its "skip the whole group" epsilon edge; whenever the inner
    fragment itself looped back through its own start (e.g. `(a+)?`), that
    skip edge became wrongly reachable again after every repetition,
    letting the NFA accept strings like `"a"` for `((a)+bb)?...` that the
    regex should reject (missing the required trailing `bb`). Fixed by
    giving `opt` its own fresh start/accept pair, the same shape `star`
    already correctly uses minus the loop-back edge. Caught by `regex-nfa`'s
    own independent-matcher cross-check during development, before this was
    ever wired into `test.mjs`.
  - `dfa-minimise`: a random DFA deliberately padded with a few states that
    are exact duplicates of existing ones (so there is always real merging
    to watch), minimised with Moore's partition-refinement algorithm.
    `check` brute-forces that the minimised DFA accepts exactly the same
    language as the original.
  - `pumping-lemma`: played as a game against the computer for L = {a^n
    b^n}, the standard non-regular witness language. The computer claims a
    pumping length p; the player's string s = a^p b^p is split so that y
    always lands entirely inside the leading a-block (the only way `|xy| <=
    p` can be satisfied for this s), and pumping y to y^2 is shown to break
    membership for every valid split, which is the whole proof. `check`
    re-verifies the split obeys the lemma's own constraints (`|xy| <= p`,
    `|y| >= 1`) and that the pumped string is genuinely not in the language.

- `test.mjs`/`coverage.mjs`: unchanged, same as ALG01 found. The structured
  all-duplicates/sorted/reverse-sorted edge cases spread an unused `array`
  field onto inputs for topics whose sandbox type isn't `array-sorted`
  (here: all nine m03 topics, which use `n` or `string` sandboxes); that
  field is simply ignored by every m03 topic's `run`/`check`, same as
  ALG01's `n`-shaped topics. 664 total cases across all 22 built topics (m01
  + m02 + m03), 0 failures.

### Screenshot pass

Served the worktree with `python3 -m http.server 8830` and captured the
course map plus all nine new topic pages with headless Chrome. First pass
caught one real rendering issue: `regex-nfa`'s very first frame (before any
NFA fragment is built) showed a literally empty canvas ("(empty tree)"),
since its node set started genuinely empty. Fixed by showing every state's
final laid-out position from frame 0 onward (dimmed, unconnected), with
edges still revealed one at a time by the actual construction, so the
diagram is never blank. After the fix, all nine re-screenshotted cleanly:
the domino rows for `induction`, the array-bar invariant panels for
`loop-invariant`, the growing level-by-level tree for `recursion-tree`, the
three-box case picker for `master-theorem`, and the state diagrams (with
double rings on accepting states and an incoming arrow on the start state)
for `dfa`, `nfa-subset`, `regex-nfa`, and `dfa-minimise`, plus the domino
row again for `pumping-lemma`.

### Skipped / deferred

- Nothing in m03's required topic list was skipped.
- The brief's "build a DFA by clicking" and "simulate an NFA, then convert
  it" framing is interpreted here the same way every other topic in this
  engine interprets "sandbox": the automaton itself is randomly generated
  by `makeInput` (seeded, reproducible, regenerable with "Randomize"), and
  the user drives the *test string* fed into it, not a click-to-add-states-
  and-edges graph editor. A true click-to-build state-diagram editor would
  need its own bespoke sandbox input type (mouse-driven node placement and
  edge drawing, not just a text/array field), which is a materially bigger
  UI surface than this ticket's other topics; flagging it as a
  simplification rather than hiding it, the same way ALG01 flagged
  `recursion-stack`'s mode picker and `stack-queue`'s single continuous run.
- `master-theorem`'s sandbox slider is labelled "example" and has no real
  effect on the recurrence shown (a, b, d, c are entirely chosen by
  `makeInput`'s rng); it exists only so "Randomize" has a size argument to
  pass through, consistent with the `n`-sandbox's shape used elsewhere.

## ALG01 — m02: recursion, lists and trees (2026-10-10)

Built all seven m02 topics, reusing and extending the ALG00 engine rather than
forking it:

- **Engine additions** (all pure, no DOM, like `rng.js`):
  - `engine/layout.js`: a leaf-counting tree layout (`layoutTree` for
    `children`-array trees, `layoutBST` for `left`/`right` trees), assigning
    every node an (x, y) in a normalised 0..100 box so topics never need to
    know about canvas pixels.
  - `engine/bintree.js`: a plain binary search tree (insert, search path,
    delete with the three CLRS cases reported back as `leaf` /
    `one-child` / `two-children`, the four traversals, `isValidBST`), shared
    by `bst.js` and `tree-traversals.js` so the structure isn't duplicated.
  - `engine/renderer.js`: added two new frame kinds alongside the existing
    array-bars drawing: `kind: 'boxes'` (labelled rounded-rect boxes with
    arrows and floating pointer labels, used by linked-list, stack-queue,
    and hanoi's pegs) and `kind: 'tree'` (circular nodes and edges, used by
    recursion-stack, bst, and tree-traversals). Also fixed a real bug this
    ticket's own screenshots caught: `resize()`'s repaint-on-resize path
    called `_drawFrame` directly instead of dispatching on `frame.kind`, so
    any non-array topic rendered as a blank "(empty array)" the moment the
    canvas's `ResizeObserver` fired (which is always, a frame or two after
    first paint). Fixed by routing both the main `render()` entry point and
    the resize repaint through one `_dispatch()` method.
  - `engine/renderer.js`: array-bars drawing can now show a custom label
    per bar (`frame.labels`) instead of the bar's own value, used by
    big-o-race to show growth-function names under five bars that are
    otherwise just counts.
  - `engine/sandbox.js`: added a second sandbox kind, `type: 'n'`, for
    topics whose whole input is one size-like number with no array to edit
    (big-o-race's max n, recursion-stack's n, hanoi's disk count). Also
    fixed the existing `array`/`array-sorted` sandbox to preserve any extra
    fields a topic's `makeInput` returns beyond `array`/`target` (bst's
    `searchValue`/`insertValue`/`deleteValue`, linked-list's
    `insertValue`/`insertPos`/`deleteValue`) across manual array edits,
    instead of silently dropping them.
  - `topic.js`: a frame can now carry its own `code` to show in the
    pseudocode panel, overriding the topic's default `code`. Needed because
    recursion-stack picks one of three pseudocode listings (factorial, naive
    fib, memoized fib) per run, chosen by its own `makeInput`.

- **Topics** (all seven, each with `run`/`check`/`makeInput`/`sandbox` per the
  brief's contract):
  - `big-o-race`: races five *actually counted* step totals (not the
    closed-form formula) for O(1), O(log n), O(n), O(n log n), O(n^2) as n
    grows from 1 to a chosen max; `check` recomputes the same counts by
    direct formula and compares.
  - `recursion-stack`: builds the full recursion tree up front for
    factorial, naive Fibonacci, or memoized Fibonacci (mode chosen randomly
    by `makeInput`, same as the engine's seed-driven pattern elsewhere),
    then walks it in real call order, marking the active call-stack path in
    amber and memo hits in cyan. Naive fib's n is clamped to 9 (its tree size
    is exponential); factorial/memoized fib are clamped to 20.
  - `hanoi`: classic recursive solve, disks drawn as stacked boxes on three
    pegs; `check` replays the returned move log against a fresh peg state to
    confirm every move was legal (top disk only, never onto a smaller disk)
    and ends with all n disks on peg C in exactly 2^n - 1 moves. Disk count
    clamped to 8 (255 moves).
  - `linked-list`: real `.next`-linked node objects (not an array standing
    in for one). Builds a list from the array, inserts one value at a
    chosen position, deletes one value if present, then reverses the whole
    list in place, re-pointing every `.next`. `check` mirrors the same
    sequence of operations on a plain array independently.
  - `stack-queue`: pushes/enqueues every value onto an array-backed stack,
    a linked stack, an array-backed queue, and a linked queue, then
    pops/dequeues everything back off all four, so the sandbox shows array
    vs. linked side by side (by scrubbing) and LIFO vs. FIFO. `check`
    verifies all four end up with the stacks reversed and the queues
    unchanged.
  - `bst`: search, insert, and delete, built on the shared
    `engine/bintree.js`. Delete reports which of the three CLRS cases fired
    and the sandbox's `makeInput` biases its random search/delete values to
    land inside the tree most of the time, so all three cases (and the
    not-found case) come up across the 30+ seeded runs. `check` recomputes
    the expected final sorted value set from a plain `Set` and checks
    `isValidBST`.
  - `tree-traversals`: all four orders (pre, in, post, level) on the same
    tree, built with the shared `engine/bintree.js`. `check` recomputes all
    four with an independent brute-force walk and compares.

- Found and fixed a real bug in `engine/bintree.js`'s delete, caught by the
  very first edge-size-2 test case: when a node with two children was
  deleted, the old code searched the right subtree for the *original*
  target value to splice out the in-order successor, but after copying the
  successor's value onto the deleted node, that search could silently miss
  the successor's actual node (if the successor's value didn't match the
  comparison path from the new, already-overwritten node value) and instead
  delete the wrong node, or none, leaving a duplicate value and an invalid
  tree. Fixed with a `delMin` that splices out the successor by tree
  identity/position (always the leftmost node of the right subtree), not by
  re-searching for its value.

- `test.mjs`/`coverage.mjs`: unchanged. `inputHasWork` only checks
  `input.array`, so it doesn't force frame counts for the `n`-shaped topics,
  but all three still always yield frames regardless. The structured
  all-duplicates/sorted/reverse-sorted edge cases in `test.mjs` get applied
  to every topic including the new ones; for `n`-shaped topics the
  overridden `array` field is simply unused by `run`/`check`, which is
  harmless. 392 total cases, 0 failures.

### Screenshot pass

Served the worktree with `python3 -m http.server` and captured the course
map plus all seven new topic pages with headless Chrome. The first pass
caught the `resize()`/`_dispatch` bug above (recursion-stack rendered a
blank "(empty array)" canvas despite the right caption and pseudocode); after
the fix, all seven re-screenshotted cleanly: big-o-race's five labelled
bars, the recursion/call-stack tree, the hanoi pegs, the linked list with a
"head" pointer, the stack/queue boxes with "top"/"front"/"rear" pointers,
and the BST and tree-traversal node diagrams.

### Skipped / deferred

- Nothing in m02's required topic list was skipped.
- `recursion-stack`'s sandbox only exposes an `n` slider; which of the three
  modes (factorial, naive fib, memoized fib) gets demonstrated is chosen
  randomly by `makeInput` on each randomize, not picked explicitly in the
  UI. Flagged as a simplification rather than hidden: a mode picker would
  need its own sandbox input type, and the three modes are already
  exercised thoroughly by the random seeds used in both the sandbox and
  `test.mjs`.
- `stack-queue` demonstrates all four structures (array stack, linked stack,
  array queue, linked queue) in one continuous run rather than letting the
  user pick push/pop operations interactively one at a time; the user still
  drives the *input values* and can scrub through every push/pop/enqueue/
  dequeue step at their own pace.

## ALG00 — bootstrap the engine + syllabus, build m01 (2026-10-09)

Built from scratch (first ticket for this course):

- `syllabus.json` with all 11 modules and every topic listed in the ticket
  brief, ids fixed for reuse by later tickets. Only m01's six topics are
  marked `"built"`; every other topic (m02-m11) is `"todo"`.
- Checked the U of T course codes named in the brief against
  artsci.calendar.utoronto.ca (Oct 2026): CSC108, CSC110/111, CSC111,
  CSC148, CSC165, CSC236, CSC240, CSC263, CSC265, CSC363, CSC373, CSC438,
  CSC448, CSC463, CSC473 are all real, current St. George CS course codes.
  Confirmed titles: CSC108H1 Introduction to Computer Programming, CSC110Y1
  Foundations of Computer Science I, CSC111H1 Foundations of Computer
  Science II, CSC165H1 Mathematical Expression and Reasoning for Computer
  Science, CSC240H1 Enriched Introduction to the Theory of Computation,
  CSC263H1 Data Structures and Analysis, CSC265H1 Enriched Data Structures
  and Analysis, CSC373H1 Algorithm Design, Analysis & Complexity, CSC438H1
  Computability and Logic, CSC448H1 Formal Languages and Automata, CSC463H1
  Computational Complexity and Computability, CSC473H1 Advanced Algorithm
  Design. Didn't find an explicit calendar snippet with CSC236's or
  CSC363's exact title in the search results; left both course-code
  groupings as given in the brief (CSC236/240 and CSC363/463) rather than
  guess at exact titles, since the codes themselves checked out and the
  groupings (236 pairs with 240 as the enriched version; 363 pairs with 463
  as the enriched version) match U of T's usual enriched/regular pairing
  pattern. No topic or course-code corrections were needed to the topic
  list itself; nothing was added or removed.
- `engine/rng.js`: mulberry32 seeded PRNG + `randInt`, used by both
  `makeInput` in topics and by `test.mjs`/`coverage.mjs`, so random inputs
  are reproducible.
- `engine/renderer.js`: canvas 2D renderer. Arrays draw as rows of blocks
  (bar height = value, dotted fill texture). Amber marks the active
  element, cyan marks a comparison pulse, dimmed blocks mark values outside
  the current working range (used by merge sort / quicksort to show which
  slice is active). devicePixelRatio-aware via ResizeObserver. Includes a
  minimal node/edge draw path for later graph modules, unused by m01.
- `engine/player.js`: play/pause/step-back/step-forward/scrub/speed, over
  an eagerly-drained list of frames (`drain()`). Respects
  `prefers-reduced-motion` by shortening the default tick interval.
- `engine/sandbox.js`: DOM widgets for the array editor, randomize button,
  size slider, and (for binary-search) a target field. Reads a topic's
  `sandbox` descriptor to decide what to show.
- Built all six m01 topics: `selection-sort`, `insertion-sort`,
  `bubble-sort`, `merge-sort`, `quicksort` (Lomuto partition, last element
  as pivot), `binary-search`. Each is a generator yielding frames with a
  `line` index into its pseudocode, a plain-English `caption`, and
  highlight fields the renderer reads (`compareIdx`, `activeIdx`,
  `sortedIdx`, `range`, plus `lo`/`hi`/`mid`/`target`/`found` for binary
  search). Added an optional `complexity: { time, why }` field (beyond the
  ticket's required export list) so topic.html has something concrete to
  show in the "running time" panel; every other required field matches the
  brief exactly.
- `index.html` + `course-map.js`: course map with a toggle between "by
  course" and "by CLRS chapter" views, built from `syllabus.json`.
- `topic.html` + `topic.js`: single topic page wiring the sandbox, player,
  canvas renderer, pseudocode-with-active-line, explanation, running time,
  and "where it appears" together.
- `test.mjs`: drains every built topic's generator across 8 sizes x 3 seeded
  random runs each, plus edge cases (empty, size 1, size 2) and structured
  cases (all-duplicates, already-sorted, reverse-sorted for the general
  array sandbox type; sorted-with-duplicates and boundary targets for the
  array-sorted sandbox type used by binary search, since reverse-sorted
  input would violate binary search's own precondition that the array is
  sorted). Exports `TESTED_IDS`, guards its `main()` behind an
  "am I the entry point" check so `coverage.mjs` can import it without
  re-running the whole suite. 182 cases, 0 failures.
- `coverage.mjs m01`: passes, 6/6 topics built, filed, and tested.
- Edited exactly one line in `js/main.js` (outside this folder, as the
  ticket allows): the Courses category's Algorithms card now links to
  `/lab/courses/algorithms/` instead of showing `soon: true`.

### Screenshot pass

Served the worktree with `python3 -m http.server 8830` and captured the
course map plus insertion-sort, quicksort, and binary-search topic pages
with headless Chrome. See the final ticket summary for what was found and
fixed.

### Skipped / deferred

- Nothing in m01's required scope was skipped.
- The "race two algorithms side by side" nice-to-have (explicitly optional
  in the brief) was not built in this ticket, to keep ALG00's surface area
  focused and reviewable; the player/renderer are already structured so a
  second `Player`/`ArrayRenderer` pair can run side by side later without
  changes to the engine's public shape.
