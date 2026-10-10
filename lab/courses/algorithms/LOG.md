# Build log

## ALG07 — m08: flows, matching and linear programming (2026-10-10)

Built all seven m08 topics. Two new engine files (both pure, no DOM
access, same style as `engine/graph.js`):
- `engine/flow.js`: residual-graph flow-network helpers shared by
  Ford-Fulkerson, Edmonds-Karp, max-flow min-cut and bipartite matching
  (`buildResidual`, `dfsAugmentingPath`/`bfsAugmentingPath`, `pushFlow`,
  `residualReachable`, `edgeFlows`, `isMaxFlowCertificate`,
  `minCutFromFlow`). Each residual arc carries its origin edge's index
  (`origIdx`), which `edgeFlows`/`residualWithFlows` key off directly;
  an earlier version guessed an edge's arc position from per-vertex
  counting order and was wrong whenever a vertex was both a source and a
  destination of different edges (every flow network with more than one
  hop), caught by test.mjs failing on literally every random case before
  it shipped.
- `engine/lp.js`: 2D linear-programming geometry for lp-geometry and
  lp-duality (`enumerateVertices` intersects every pair of constraint
  lines and filters to the feasible ones, `orderAroundCentroid` turns that
  into a polygon boundary order, `simplexWalk` walks corner to corner
  always improving, `sharedConstraintEdges` draws an unbounded region's
  finite boundary pieces).
- `engine/layout.js` gained `layoutLayered`, a left-to-right DAG layout by
  longest-path level, used by the three flow topics so flow visibly moves
  left to right.

Topics:
- `ford-fulkerson`, `edmonds-karp`: same residual-graph loop, DFS vs. BFS
  augmenting paths; both `check()` against `isMaxFlowCertificate` (flow
  conservation + capacity bounds + "no augmenting path remains," the
  max-flow min-cut theorem's own optimality certificate, independent of
  which algorithm produced the flow).
- `max-flow-min-cut`: runs Edmonds-Karp, then reads S (reachable from s in
  the final residual graph), T, and the cut edges straight off it; checks
  the cut's capacity against the flow value.
- `bipartite-matching`: reduces to max flow (source/sink, capacity 1
  everywhere) and checked against a from-scratch, non-flow oracle (Kuhn's
  classic augmenting-path matching algorithm, worked directly on the
  bipartite adjacency).
- `stable-matching`: Gale-Shapley deferred acceptance; checked by scanning
  every (man, woman) pair not married to each other for a blocking pair.
- `lp-geometry`: a random bounded 2D feasible region (a box plus up to six
  cutting half-planes), walked corner to corner from the origin; checked
  against the true max over every enumerated vertex.
- `lp-duality`: a 2-constraint primal and its dual side by side, primal
  solved by the same corner walk, dual's (few, finite) corners evaluated
  directly; checked that both optimal values equal their own independently
  enumerated vertex maxima/minima, and equal each other (strong duality).

### Screenshot pass

Served the worktree with `python3 -m http.server 8830` and captured the
course map plus all seven new topic pages with headless Chrome. Found and
fixed two issues: `bipartite-matching`'s first pseudocode line ran past the
canvas width (shortened it), and `lp-duality`'s summary used "." as a
dot-product symbol ("c . x"), which collided with `topic.js`'s
sentence-splitting (`summary.split('. ')[0]`) and truncated the page
subtitle; reworded to "c^Tx" throughout.

### Skipped / deferred

- Nothing in m08's required scope was skipped.

## ALG06 — m07: divide and conquer, greedy, dynamic programming (2026-10-10)

Built all fifteen m07 topics, reusing the existing engine as-is (no engine
changes needed: the `kind: 'boxes'` grid pattern floyd-warshall established
for m06 covers every DP table and matrix here, `kind: 'tree'` covers
huffman and optimal-bst's constructed tree, and the plain array-bar frames
cover max-subarray/rod-cutting). Sandbox types span all four existing
kinds: `array` (max-subarray, rod-cutting, matrix-chain's dimensions,
optimal-bst's frequencies, huffman's frequencies, fft's polynomial A),
`n` (karatsuba's digit count, strassen's matrix size, closest-pair's point
count, interval-scheduling, fractional-knapsack, weighted-interval-
scheduling, knapsack-01), and `string` (lcs, edit-distance, with the second
string kept as a preserved extra field, the same pattern bst/linked-list
already use for their extra params).

Every topic's `check()` is independent of its own `run()`, mostly via
brute force on small clamped sizes rather than re-running the same
algorithm:
- `max-subarray` (Kadane's scan): checked against an O(n^2) try-every-
  subarray brute force.
- `karatsuba`, `strassen`: checked against `BigInt` multiplication and a
  plain triple-loop matrix multiply, respectively.
- `closest-pair`: checked against an O(n^2) all-pairs distance scan.
- `fft` (recursive Cooley-Tukey, used to multiply two polynomials): checked
  against direct O(n^2) convolution; coefficients are small integers so the
  rounded inverse transform is exact.
- `interval-scheduling` (greedy by finish time): count checked against an
  independent weighted-interval-scheduling-style DP with every weight set
  to 1, a genuinely different algorithm, not a replay of the greedy.
- `huffman`: checked for prefix-freedom and against a from-scratch brute
  force over every full binary tree *shape* with n leaves (Catalan(n-1) of
  them, feasible up to the n <= 10 this topic allows), picking the best
  frequency-to-depth assignment per shape via the rearrangement inequality.
  An earlier version of this brute force wrongly assumed an optimal tree's
  leaves stay in sorted-contiguous order (true for the *alphabetic* tree
  problem, not plain Huffman); caught before it ever shipped by reasoning
  through a potential counterexample, replaced with the true per-shape
  enumeration above.
- `fractional-knapsack`: checked against the greedy's own exchange-argument
  optimality certificate (every fully-taken item's ratio >= every partial
  or untaken item's ratio, at most one item partially taken), not a second
  simulation.
- `weighted-interval-scheduling`, `knapsack-01`: checked against an O(2^n)
  bitmask brute force, n clamped to 16.
- `rod-cutting`: checked against an unmemoized recursive brute force over
  every composition of the rod length, n clamped to 14.
- `lcs`: checked that the returned subsequence is genuinely common to both
  strings, and that its length is maximal by brute-force enumeration of
  every subsequence of the shorter string, length clamped to 15.
- `edit-distance`: checked against an independent top-down memoized
  reimplementation (distinct code path from the bottom-up table `run()`
  fills), plus replaying the returned edit script step by step to confirm
  it actually turns a into b in exactly the claimed number of edits.
- `matrix-chain`, `optimal-bst`: checked against an unmemoized recursive
  brute force over every parenthesization/tree shape (the same recursive-
  partition idea as rod-cutting), n clamped to 10 and 10 respectively
  (Catalan(9) = 4862 shapes, fine at that size).

Nothing in m07's required topic list was skipped.

### Screenshot pass

Served the worktree with `python3 -m http.server 8830` and captured the
course map plus all fifteen new topic pages with headless Chrome. Two
real rendering issues found and fixed:
- `knapsack-01`'s default-sized DP table (capacity up to ~80 from 16 items
  of weight up to 10) packed dozens of cells into one row, overlapping
  their "0" labels into an unreadable blob. Fixed by capping the generated
  capacity at 16 and item weights at 1-5, keeping every cell wide enough to
  read, matching how floyd-warshall already caps its table size for m06.
- `weighted-interval-scheduling`'s interval boxes labelled both the time
  range and the weight (`"3-7 (w1)"`), which overflowed the narrower boxes
  and smeared text across neighbouring rows. Fixed by trimming the box
  label to just the time range (the weight is already in the caption).
All fifteen re-screenshotted cleanly after those two fixes.

## ALG05 — m06: graph algorithms (2026-10-10)

Built all twelve m06 topics on one new engine module, `engine/graph.js`
(pure, DOM-free): `makeRandomGraph` (a connected random spanning structure
plus extra edges, with `directed`/`weighted`/`allowNegative`/`dag` options),
`adjList`/`adjMatrix`, `bfsDistances` (also the reachability oracle other
checks call), `isShortestPathCertificate` (the CLRS relaxation-optimality
certificate: `dist[src] = 0`, every edge relaxed, finite dist iff
reachable), and `hasNegativeCycleReachableFrom` (a plain |V|+1-round
relaxation oracle). Every weighted shortest-path topic's `check()` verifies
this certificate instead of recomputing the same algorithm, so it is a real
independent check.

- `graph-representations`: builds an adjacency list and an adjacency matrix
  from the same graph, one row at a time, reusing the `boxes` frame kind as
  a grid.
- `bfs`, `dfs` (discovery/finish times, tree/back/forward/cross edge
  classification via CLRS's parenthesis-theorem invariants, checked
  independently rather than recomputed), `topological-sort` (DFS finish
  order, verified as a real topological order against every edge),
  `scc` (Kosaraju's two-pass DFS; checked against a brute-force mutual
  BFS-reachability oracle, independent of the finish-order trick).
- `kruskal`: sorts edges, grows the MST with `engine/unionfind.js` (reused
  from m05, not forked), and draws the graph and the live disjoint-set
  forest stacked in one canvas. `prim`: grows a tree from vertex 0 by
  cheapest fringe edge. Each checks spanning-tree validity itself and cross-
  checks its MST weight against the other algorithm run independently.
- `dijkstra` (array-scan, non-negative weights), `bellman-ford` (|V|-1
  relax rounds plus one more to detect a negative cycle reachable from the
  source), `dag-shortest-paths` (topological-order relaxation, one pass,
  works with negative weights since a DAG has no cycles to go negative).
- `floyd-warshall`: the O(V^3) distance table filling in, one allowed
  intermediate vertex at a time, drawn as a grid of cells (cyan row/column
  for the current *k*, amber for whichever cell just improved). `johnson`:
  dummy-source Bellman-Ford for the reweighting potentials, then Dijkstra
  from every vertex on the reweighted (non-negative) graph, un-reweighted
  back.
- Floyd-Warshall and Johnson's random inputs are generated as DAGs
  (`dag: true`), which allows negative edge weights while guaranteeing no
  negative-weight cycle exists anywhere, keeping every table entry a
  well-defined finite distance to check (CLRS notes Floyd-Warshall's
  negative-diagonal cycle detection is a sound check for *whether* a
  negative cycle exists, but makes no correctness promise about unrelated
  table entries once one does, so letting the generator produce one would
  make a precise `check()` for every cell impossible without re-deriving a
  separate negative-cycle-aware all-pairs algorithm just for the test).
  Bellman-Ford's own topic still exercises real negative cycles directly,
  since detecting them is that topic's job.

## ALG04 — m05: amortised analysis and advanced data structures (2026-10-10)

Built all six m05 topics, reusing the existing player/renderer/sandbox engine
and adding four new pure, DOM-free engine modules alongside `avltree.js`/
`rbtree.js`:

- **Engine additions**:
  - `engine/unionfind.js`: a disjoint-set forest, union by rank with path
    compression, plus `components()` to independently re-derive the
    partition from a parent array for `check()`.
  - `engine/btree.js`: a CLRS B-tree of minimum degree t, insert with
    proactive splits on the way down, delete with CLRS's full six-case
    algorithm (predecessor/successor swap, borrow from a sibling, merge
    with a sibling). Keys are a set, like this course's other search trees,
    so a duplicate insert is a checked no-op (an unguarded duplicate was
    the first fuzz-test failure: the validity checker assumes strictly
    increasing keys per node). `isValidBTree` independently re-verifies
    every invariant (key order, min/max degree per node, equal leaf depth)
    for `check()`.
  - `engine/fibheap.js`: a Fibonacci heap with lazy insert, extract-min via
    degree-bucketed consolidation, and decrease-key with cascading cuts.
    Degree is read directly from `children.length` rather than maintained
    as a separate counter (equivalent, simpler). `isHeapOrdered`
    independently re-verifies the heap-order invariant across the whole
    forest for `check()`.
  - `engine/veb.js`: a recursive van Emde Boas tree restricted to universe
    sizes on the u=2, 4, 16, 256, ... tower (so the upper/lower sqrt split
    CLRS uses for general powers of two collapses to one exact sqrt(u) on
    both sides, without changing the algorithm's shape), with the classic
    min-excluded-from-recursion trick for O(lg lg u) member/successor.
    Values are a set here too (an unguarded duplicate insert corrupted a
    cluster in the first fuzz test, since the algorithm assumes the
    inserted value is genuinely new). `allMembers` independently
    re-enumerates every present value by direct traversal, not via the
    structure's own recursive logic, for `check()`.
  - Both new forest-shaped topics (disjoint-sets, fibonacci-heap) draw
    their structure as several small trees side by side via the existing
    `kind: 'tree'` renderer and `layoutTree`, one call per root, shifted
    into its own horizontal slot: no renderer changes needed.
  - `topic.js` already supports a `counters` object per frame (shown in a
    live strip under the player); dynamic-array's three amortised-analysis
    views (aggregate/accounting/potential) use this as-is, no engine change.

- **Topics**:
  - `dynamic-array`: doubling capacity, with all three classic
    amortised-analysis proofs computed and shown side by side every push:
    the aggregate method's running average, the accounting method's bank
    balance (a flat per-push charge of 3, `check()` asserts it never goes
    negative), and the potential method's `2*size - capacity`.
  - `binary-counter`: a k-bit counter, incremented n times; `check()`
    asserts the classic 2n bound on total bit flips.
  - `disjoint-sets`: union by rank with path compression, driven by
    reading the array two values at a time as `union(a, b)` requests
    (each reduced mod the element count); `check()` recomputes the
    expected partition with a plain reference union-find and compares
    connectivity, independent of compression.
  - `b-tree`: a t=2 (2-3-4) B-tree, inserting every array value then
    deleting every third one, exercising both splits and merges/borrows.
  - `fibonacci-heap`: inserts every value, decrease-keys some of them, then
    extracts everything; since repeated extract-min from a correct heap
    must come out in sorted order, `check()` just compares the extracted
    sequence to the (decrease-adjusted) sorted input, a strong end-to-end
    correctness test of insert + decrease-key + cascading cuts +
    consolidation together.
  - `van-emde-boas`: a fixed u=16 universe (two real recursion levels),
    inserting every distinct array value (reduced mod 16), then a few
    member/successor queries; `check()` exhaustively re-checks member and
    successor against the known inserted set for every value in the
    universe, not just the demoed queries.

Nothing skipped. `node test.mjs` and `node coverage.mjs m05` both pass.
Screenshots of the course map and all six topics (mid-animation where
applicable) were reviewed; two topics (binary-counter, van-emde-boas)
initially rendered a stray second numeric line under each bar from setting
custom `labels` alongside non-integer "dimming" array values, fixed by using
plain 0/1 values with no custom labels, which is also just a cleaner read.

## ALG03 — m04: heaps, balanced trees and hashing (2026-10-10)

Built all twelve m04 topics, reusing and extending the ALG00-ALG02 engine:

- **Engine additions**:
  - `engine/layout.js`: `layoutHeapPositions(n)`, a complete-binary-tree-by-
    index layout for a plain array treated as a heap (parent of i is
    floor((i-1)/2), children 2i+1/2i+2), positioned level by level so
    `heap.js` can draw it with the existing `kind: 'tree'` node/edge
    renderer without needing real node objects at all, just the array
    length.
  - `engine/avltree.js` (new, pure, like `bintree.js`): AVL insert and
    delete, both rebalancing with the four classic rotation cases (LL, RR,
    LR, RL), each rotation logged as an event so the topic can show exactly
    which fired. `isBalanced` independently re-verifies the height-balance
    invariant at every node for `check()`.
  - `engine/rbtree.js` (new, pure): CLRS's RB-INSERT and RB-INSERT-FIXUP,
    with real parent pointers (unlike `bintree.js`'s plain BST) and every
    recolour/rotation logged. `isValidRB` independently re-verifies all
    four red-black properties (root black, no red-red parent/child, equal
    black-height on every root-to-nil path) for `check()`. Only insert is
    built, per this ticket's topic list (no red-black delete).

- **Topics**:
  - `heap`: build-max-heap (bottom-up sift-down, O(n)), insert (append +
    sift-up), and extract-max (swap root with last, shrink, sift-down),
    all drawn as the heap's implicit tree shape via `layoutHeapPositions`.
    `check` independently re-verifies the max-heap property after each
    phase and that every phase preserves/updates the right multiset.
  - `heapsort`: build-max-heap then repeatedly swap the max to the sorted
    tail and re-heapify, drawn with the same array-bar frames as the other
    m01 sorts (heapsort's whole point is in-place sorting with no tree
    visible in the final array), with a growing `sortedIdx` tail.
  - `avl`: inserts a sequence then deletes one value, both animated via
    `engine/avltree.js`'s rotation log, reusing `layoutBST` (which only
    needs `left`/`right`, so it works unchanged on AVL's extra `height`
    field). **Found and fixed a real bug** during the first test run: the
    topic captured `const afterInserts = root` as a bare reference before
    running delete, but `avlInsert`/`avlDelete` rebalance by mutating the
    existing node objects' `left`/`right` pointers in place rather than
    copying the tree, so that reference silently reflected the *post*-
    delete tree by the time `inorder(afterInserts)` ran at the very end,
    making the "values after insert, before delete" check wrong for any
    tree where delete actually changed the structure. Fixed by snapshotting
    `inorder(root)` and `isValidBST(root) && isBalanced(root)` right after
    the insert loop, before delete runs at all.
  - `red-black`: insert only (per the topic list), via `engine/rbtree.js`.
    Colour is shown persistently per node (amber = red, plain ink = black,
    using each node's own `active` flag) rather than `active` meaning "the
    current step" the way other tree topics use it; a separate `compare`
    pulse marks whichever nodes the current recolour/rotation step touched,
    so persistent colour and "what's happening now" don't fight for the
    same visual slot.
  - `order-statistic-tree`: a BST augmented with each node's subtree size,
    supporting OS-SELECT and OS-RANK per CLRS 14.1. Augments a plain BST
    rather than a red-black tree (CLRS augments a red-black tree for a
    guaranteed O(log n)); flagged in the summary as a simplification, since
    the teaching point is the augmentation technique (keep an extra field
    consistent under every update, then answer a query the base structure
    can't on its own), not balancing, which `avl`/`red-black` already cover.
    Caught and fixed a size-corruption bug of its own before it ever hit
    `test.mjs`: inserting a value equal to an existing one must be a no-op,
    but speculatively incrementing every ancestor's size while walking down
    and only "undoing" it at the matching node leaves every ancestor
    *above* that match wrongly inflated; fixed by checking for an existing
    value with a plain read-only probe first, only touching sizes on the
    walk if the value is confirmed new.
  - `hashing-chaining`: a fixed 7-slot table, `key mod 7`, chains drawn as
    `kind: 'boxes'` nodes hanging below each slot. `check` independently
    recomputes every slot's expected chain from the same hash formula.
  - `hashing-open-addressing`: linear, quadratic, and double hashing, mode
    picked at random per run (like `induction`/`master-theorem`'s pattern).
    Table size is always the next prime at least `2*size+1`, keeping the
    load factor under 0.5 so quadratic probing's classic guarantee
    (prime table, load factor <= 0.5 implies an empty slot is always found)
    always holds, regardless of how many duplicate keys land on the same
    first probe. `check` recomputes each key's expected slot from its
    reported probe count and the same probe formula, an internal-
    consistency check that doesn't just replay the stepwise insert logic.
  - `universal-hashing`: the Carter-Wegman family h(k) = ((a*k+b) mod p)
    mod m, p = 101 fixed (bigger than every key this topic generates).
    Builds a chaining table with one randomly-picked (a, b), then shows a
    second independently-picked (a', b') pair's collision count side by
    side, to make the "holds for any key set, because the randomness is in
    the function" property visible rather than asserted. `check`
    recomputes both tables and both collision counts from the formula
    independently.
  - `randomized-quicksort`: identical partitioning to m01's quicksort, but
    swaps a uniformly random index into the pivot slot first, seeded via
    `input.pivotSeed` (mulberry32) so a run replays deterministically for
    `test.mjs` despite being randomized. Captions show the expected
    comparison count (~2n*ln(n)) and the worst case any pivot rule shares
    (n(n-1)/2) next to the actual count for that run.
  - `quickselect-median-of-medians`: one topic, two modes picked at random
    per run (same pattern as `avl`'s rotations/`red-black`'s fixup, but
    for algorithm choice): quickselect (random pivot, expected O(n)) and
    median-of-medians (groups-of-5 deterministic pivot, worst-case O(n)).
    Both implemented as the real recursive partition-and-recurse-one-side
    algorithm, not a stand-in. `check` recomputes the true k-th smallest
    via a full sort and compares, independent of which mode ran.
  - `sorting-lower-bound`: runs real insertion sort on a random permutation
    (size clamped to <= 8, since n! grows fast) counting its actual
    comparisons, next to the independently-computed information-theoretic
    bound ceil(log2(n!)). `check` recomputes that bound via a brute-force
    factorial and `Math.log`, not by trusting `run()`'s own formula.
  - `counting-radix-bucket`: three real linear-time sorts, mode picked at
    random per run: counting sort (direct per-value counting, O(n+k)),
    radix sort (counting sort applied digit by digit, least significant
    first, relying on counting sort's stability), and bucket sort (scatter
    by value into buckets, sort each small bucket, concatenate). `check`
    is the same sortedness-plus-multiset check every other sort topic uses.

- `test.mjs`/`coverage.mjs`: unchanged. 1024 total cases across all 34
  built topics (m01 + m02 + m03 + m04), 0 failures after fixing the two
  bugs above (both caught by `test.mjs` itself or by writing `check()`,
  before any screenshot was taken).

### Screenshot pass

Served the worktree with `python3 -m http.server 8830` and captured the
course map (confirming all twelve m04 cards show LIVE, not TONIGHT) plus
every one of the twelve new topic pages with headless Chrome. All
screenshotted cleanly on the first pass: the heap/avl/red-black/order-
statistic-tree node diagrams, the hashing-chaining/hashing-open-addressing/
universal-hashing slot-and-chain boxes, and the heapsort/randomized-
quicksort/quickselect-median-of-medians/sorting-lower-bound/counting-radix-
bucket array bars. No rendering fixes were needed this round (the two real
bugs found this ticket were both caught by `test.mjs`/`check()` before the
screenshot pass, not by it).

### Skipped / deferred

- Nothing in m04's required topic list was skipped.
- `order-statistic-tree` augments a plain BST, not a red-black tree; see
  above, flagged in the topic's own summary text too, not just here.
- `red-black` builds only insert, matching this ticket's topic list exactly
  (delete is not named as a required sub-topic the way avl's both
  insert-and-delete are).
- `hashing-open-addressing`'s "clustering" is shown implicitly (probe
  counts rise visibly when keys cluster near each other, especially under
  linear probing) rather than as its own separate tracked metric; adding an
  explicit cluster-length counter would need another UI element for a
  marginal gain over what the probe animation already makes visible.

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
