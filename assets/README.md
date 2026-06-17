# Scene assets

## canary.png — the Canary flock sprite-sheet

The Canary flock scene (`js/scenes/canaries.js`) looks for `assets/canary.png`.
Until it exists, a procedural yellow placeholder bird is used.

To drop in the real photographic birds, save a file here named exactly
**`canary.png`** with:

- **4 equal frames laid out side by side** (one row), in this wing order:
  1. wings **up**
  2. wings **mid** (coming down)
  3. wings **down**
  4. wings **mid** (coming up)
- **Square frames**, transparent background (PNG with alpha).
- Recommended size **512×128** (4 × 128px) — sharp but light. 256×64 also fine.
- A real canary cut out cleanly on transparency reads best at flock scale.

The scene cycles those 4 frames to flap the wings. If you use a different
frame count, change `SPRITE_COLS` in `js/scenes/canaries.js` to match.
