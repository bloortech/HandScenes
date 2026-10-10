# Build log

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
