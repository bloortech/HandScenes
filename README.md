# HandScenes

Hand-tracked video effects that run entirely in your browser. Point a webcam at
yourself and control 3D scenes with your hands — no install, nothing uploaded.

## Tech stack

- **three.js** (WebGL2 / GLSL) — all rendering: post-processing bloom, custom
  GLSL filter shaders, a fullscreen raymarcher.
- **MediaPipe Tasks Vision** (`HandLandmarker`, WASM) — real-time hand tracking,
  running on-device.
- **Vanilla JS, ES modules, no build step.** No framework, no bundler, no
  backend. It's a static site: a live-webcam app processes everything on the
  viewer's own GPU, so there's nothing for a server to do.
- **Self-hosted dependencies.** three.js, MediaPipe (JS + WASM) and the fonts
  are vendored under `vendor/`; at runtime the page hits no third-party CDN.
- **Hosting:** any static host. Designed for Vercel (`vercel.json` ships the
  cache + security headers).

## Install / run

There's nothing to install to *use* it — open the deployed URL and allow the
camera. To run it locally for development you only need Python (no Node):

```
git clone <your-repo-url> handscenes
cd handscenes
python serve.py            # serves http://localhost:8000 with no-cache headers
```

Then open <http://localhost:8000>. A local server is required — the camera and
ES modules don't work from a `file://` page, and browsers only allow the camera
on `localhost` or `https`. Edit a file and refresh; there is no build step.

> Note: `serve.py` is a tiny no-cache `http.server` for dev. It does **not**
> apply the `vercel.json` headers (CSP etc.), so test those on a Vercel preview.

## Deploy to Vercel

Zero-build static deploy:

1. Push to a GitHub repo (the local git repo is already initialized):
   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Import it at <https://vercel.com/new>: Framework Preset **Other**, empty
   **Build Command**, Output Directory `./`. Deploy.

Or with the CLI (`npm i -g vercel`): `vercel` then `vercel --prod`.

## Scenes

Switch with the on-screen tabs or keys `1`–`4`. Pick a recording shape with
**FULL / 16:9 / 9:16**, toggle the selfie preview with **CAM** (`v`), and hide
all UI for a clean capture with **HIDE UI** (`h`). In 16:9/9:16 the controls sit
in the letterbox margins, never over the video.

- **✋ Cat's cradle** — both hands; glowing strings span your fingers. Each of
  the five finger panels shows a filter you pick in CONTROLS (thermal, b&w,
  duotone, sepia, negative, pixelate, ascii).
- **🌼 Garden** — open your fist to bloom a wireframe dandelion; pinch
  apart/together to grow/shrink a field of flowers.
- **⌨️ Filter box** — both hands frame a rectangle (index = top corners,
  thumbs = bottom); pick the effect inside it (ascii terminal, thermal, riso,
  cyanotype, halftone, b&w, invert, duotone).
- **◈ Mandelbox fractal** — open fist zooms, hand x orbits, hand y folds, pinch
  morphs. Ported from a TouchDesigner build.

Each scene exposes live knobs (colors, density, glow, etc.) in the CONTROLS
panel.

## Privacy

Everything the app needs is self-hosted under `vendor/`, so at runtime the page
makes **no third-party requests** (no jsDelivr, no Google Fonts). The camera
feed and the hand positions detected from it **never leave the device** — there
is no upload, recording, analytics, or storage. The only data anyone receives is
the standard request metadata your host (Vercel) logs. See `privacy.html`;
`vercel.json` sets a Content-Security-Policy, a camera Permissions-Policy, and
anti-framing headers.

## Project layout

```
index.html          UI shell, scene tabs, controls panel, start gate
privacy.html        privacy policy + "how it works"
serve.py            local no-cache dev server
vercel.json         static hosting headers (cache, CSP, permissions)
favicon.svg
js/
  main.js           boot, scene switching, layout, control-panel builder
  hands.js          webcam + MediaPipe; smoothed landmarks + openness/pinch
  videobg.js        shared "live camera as 3D backdrop" helper
  scenes/
    cradle.js       cat's cradle + per-finger filter matrix (selective bloom)
    garden.js       wireframe dandelion garden
    shapes.js       filter box (8 pickable filters)
    fractal.js      morphing Mandelbox raymarch
models/
  hand_landmarker.task   MediaPipe hand model
vendor/             self-hosted deps: three/, mediapipe/ (+wasm), fonts/
```

## Credits

three.js (MIT), Google MediaPipe Tasks (Apache-2.0) + the `hand_landmarker`
model, fonts VT323 + Press Start 2P (OFL) — all vendored under `vendor/`.
