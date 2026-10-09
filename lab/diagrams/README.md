# Diagrams

Animated, interactive diagrams of ideas worth seeing rather than just reading about.
One shelf: Liu Cixin's Three-Body trilogy. (A Vervaeke *Meaning Crisis* shelf was
built and then removed on 9 Oct 2026, since Ishan wants to go through that course
himself first. It's in git history at commit 8ac8782 if he comes back to it.) Open `/lab/diagrams/` (or `index.html` under this folder) from the
site root.

## Structure

- `index.html` — the shelf, cards link to `diagram.html#<id>`.
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

## What's built (5 diagrams)

**Three-Body shelf** (Book 1 open, Books 2–3 behind a spoiler gate):
1. The three-body problem — real velocity-Verlet gravity sim, draggable suns, stable
   vs chaotic presets (Book 1)
2. The human computer — Qin Shi Huang's soldier-logic-gates, toggleable AND/OR/XOR (Book 1)
3. Unfolding a sophon — proton to 2D circuit, slider-driven (Book 1, ch. 33)
4. Dark forest theory — Ye Wenjie's axioms as a small broadcast/stay-silent game (Book 2)
5. The droplet — a single probe destroying a model fleet on a launched pass (Book 2)

## Sources and what couldn't be verified

Three-Body citations: the sophon-unfolding chapter (33, "Trisolaris: Sophon") and the
droplet's ship count (600+ ships in the Doomsday Battle) were checked against
secondary sources (LitCharts, plot summaries); I did not have the physical text to
confirm exact chapter numbers for the human-computer scene or Ye Wenjie's axioms
scene beyond "part 2 / part 4", so those citations are intentionally left at the
part/sequence level rather than a specific chapter number.

## Next diagrams (skipped for v1, quality over count)

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
