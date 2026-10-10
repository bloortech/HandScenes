# Algorithms & CS theory sandbox

An interactive course covering the U of T CS theory/algorithms sequence and
all of CLRS (Introduction to Algorithms), ending at P vs NP. It's not a
LeetCode drill site: every algorithm here is something you can poke, step,
and scrub, one frame at a time.

Pure static site: vanilla JS ES modules, no build step, no framework, no
external dependencies, no CDNs. Works fully offline. Served by the repo's
`python3 serve.py` (or any static file server) from the repo root.

## How to use this

Open `index.html` (or the "Algorithms" card from the main HandScenes site).
Every bright "Live" card is a built topic; dim "Tonight" cards are still
`"todo"` (see `LOG.md`'s module-by-module notes for what's left, if
anything). Toggle between **by year** (the U of T teaching order, first
year through fourth) and **by CLRS chapter** with the buttons above the
map. Click any card to open its sandbox (`topic.html?t=<id>`): the canvas
shows the animation, the pseudocode panel highlights the current line, and
the controls below the canvas let you edit or randomise the input, resize
it, and play, pause, step one frame at a time, or scrub freely. Each topic
page also has prev/next links at the top that walk the whole course in U
of T order, so you can read it start to finish like a book, or jump
straight to one topic from the map and ignore the rest. The "running time"
and "where it appears" panels on the right give the Big-O bound and the
original U of T course plus CLRS chapter, since CLRS's own chapter
numbers differ between editions.

## Layout

- `syllabus.json` — every module and topic, with a `status` of `"built"` or
  `"todo"`. The course map (`index.html`) reads this to render both views.
- `topics/<id>.js` — one file per topic. Pure algorithm description: no DOM
  access. Exports `{ id, title, module, course, clrs, summary, code,
  makeInput(rng, size), run(input), check(input, result), sandbox }` (plus an
  optional `complexity: { time, why }` used by the topic page). `run()` is a
  generator that yields animation frames and returns the final result.
- `engine/` — shared, DOM-facing code: `rng.js` (seeded PRNG for
  reproducible random inputs), `renderer.js` (canvas 2D array/graph
  renderer), `player.js` (play/pause/step/scrub/speed over a drained frame
  list), `sandbox.js` (array editor, randomize, size slider, target field).
- `index.html` + `course-map.js` — the course map, browsable by year (the
  U of T teaching order) or by CLRS chapter.
- `topic.html` + `topic.js` — a single topic's sandbox: canvas, pseudocode
  with the active line highlighted, a plain-English explanation, running
  time, and where the topic appears (course + CLRS chapter).
- `test.mjs` — `node test.mjs`. Runs every `"built"` topic through many
  seeded-random inputs plus structured edge cases, drains the generator,
  and checks each result with the topic's own `check()`.
- `coverage.mjs` — `node coverage.mjs <module-id>`, e.g. `node coverage.mjs
  m01`. Fails unless every topic in that module is built, has a real file,
  and is exercised by `test.mjs`.

## Look and feel

Dark background, arrays drawn as rows of blocks (each block is a bar whose
height reflects its value, with a dotted texture). Amber marks the active
element (pivot, current index). Cyan marks a comparison. Blocks animate
between frames; the player respects `prefers-reduced-motion`.

## Running the tests

```
node lab/courses/algorithms/test.mjs
node lab/courses/algorithms/coverage.mjs m01
```

Both must exit 0 before any module is marked `"built"` in `syllabus.json`.
