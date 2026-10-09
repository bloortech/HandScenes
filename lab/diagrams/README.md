# Diagrams

Animated, interactive diagrams of ideas worth seeing rather than just reading about.
Two shelves: John Vervaeke's *Awakening from the Meaning Crisis*, and Liu Cixin's
Three-Body trilogy. Open `/lab/diagrams/` (or `index.html` under this folder) from the
site root.

## Structure

- `index.html` — the two shelves, cards link to `diagram.html#<id>`.
- `diagram.html` — single viewer page, reads the id from the URL hash and mounts that
  diagram's module next to its explanation and citation.
- `manifest.js` — imports every diagram module and lists them in one place.
- `style.css` — shared chrome (Bloort palette: dark background, amber `#E8B84B`, cyan
  `#7CD5E8`, ink dots/lines).
- `lib/canvas-utils.js` — shared canvas setup (DPR-aware sizing, reduced-motion,
  in-view triggering, a small animation-loop helper).
- `lib/physics.js` — pure gravitational physics (velocity Verlet integrator, energy,
  two preset three-body configurations), no DOM, so it's testable from Node.
- `diagrams/*.js` — one ES module per diagram, each exporting
  `{ id, shelf, title, source, cite, blurb, mount(el) }`. `mount` builds the canvas +
  controls and returns a cleanup function; the explanation text (`blurb`) and citation
  (`cite`) are rendered by `diagram.html`, kept separate from the drawing code.
- `test.mjs` — run with `node lab/diagrams/test.mjs`. Checks every manifest entry has
  the required fields, and that the three-body integrator conserves energy within 1%
  over 2000 steps for both presets.

## What's built (10 diagrams)

**Vervaeke shelf** (all open, episode numbers verified against meaningcrisis.co):
1. Pythagoras and the monochord — string ratios, playable tones via WebAudio (ep. 4)
2. Socrates and the elenchus — claim to aporia, five stages (ep. 4)
3. Plato's cave and the divided line — one climb, two views (ep. 5)
4. Aristotle: four causes, virtue as a mean (ep. 6)
5. The four kinds of knowing — propositional, procedural, perspectival, participatory (ep. 1)

**Three-Body shelf** (Book 1 open, Books 2–3 behind a spoiler gate):
1. The three-body problem — real velocity-Verlet gravity sim, draggable suns, stable
   vs chaotic presets (Book 1)
2. The human computer — Qin Shi Huang's soldier-logic-gates, toggleable AND/OR/XOR (Book 1)
3. Unfolding a sophon — proton to 2D circuit, slider-driven (Book 1, ch. 33)
4. Dark forest theory — Ye Wenjie's axioms as a small broadcast/stay-silent game (Book 2)
5. The droplet — a single probe destroying a model fleet on a launched pass (Book 2)

## Sources and what couldn't be verified

Vervaeke episode numbers were checked against meaningcrisis.co's own episode titles
(ep. 1 Introduction, ep. 4 Socrates and the Quest for Wisdom, ep. 5 Plato and the
Cave, ep. 6 Aristotle, Kant, and Evolution). The relevance-realization/opponent-
processing diagram was left out of v1: its clearest home is episodes 27–32, but no
single primary-source episode title pinned "opponent processing" precisely enough to
cite with confidence in the time available — it's next, see below.

Three-Body citations: the sophon-unfolding chapter (33, "Trisolaris: Sophon") and the
droplet's ship count (600+ ships in the Doomsday Battle) were checked against
secondary sources (LitCharts, plot summaries); I did not have the physical text to
confirm exact chapter numbers for the human-computer scene or Ye Wenjie's axioms
scene beyond "part 2 / part 4", so those citations are intentionally left at the
part/sequence level rather than a specific chapter number.

## Next diagrams (skipped for v1, quality over count)

- Vervaeke: the Axial revolution's "two worlds" mythology; relevance realization as
  opponent processing (needs a firmer episode citation first).
- Three-Body: the dimensional strike flattening the Solar System (Death's End);
  lightspeed propulsion and the black domain (Death's End). Both are Book 3 and need
  their own spoiler handling plus a two-stage animation (fold-down, then the
  aftermath) that didn't fit the token budget this pass.

## Testing

```
node lab/diagrams/test.mjs
```

Serve locally with `python3 serve.py` (port 8000) from the site root, or
`python3 -m http.server 8812` if that port's busy, then open
`http://localhost:<port>/lab/diagrams/`.

One real bug found and fixed during QA: `lib/canvas-utils.js`'s `runLoop` used to wait
for the first `requestAnimationFrame` tick before drawing anything, so a diagram
could show a blank canvas for a frame right as it scrolled into view (and reliably
tripped up headless-screenshot tools waiting on a fixed timeout). It now paints one
frame synchronously before handing off to the animation loop. Also fixed: the sophon
diagram's etched circuit traces could wander outside the unfolded square; they're
clipped to it now.
