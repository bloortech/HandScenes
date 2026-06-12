# HandScenes

Hand-tracked video effects that run entirely in your browser. Point a webcam
at yourself and control 3D scenes with your hands — no install, nothing
uploaded. Built with [three.js](https://threejs.org) (WebGL) and
[MediaPipe Tasks](https://ai.google.dev/edge/mediapipe) (hand tracking, WASM).

**Everything runs client-side on your own device's GPU** — that's why it's a
static site with no backend. A live webcam app can't offload tracking/rendering
to a server, so a "backend" would only add cost and latency. This makes it a
perfect fit for static hosting (e.g. Vercel).

## Scenes

- **✋ Cat's cradle** — both hands; glowing strings stretch between your
  fingers. Spread your fingers to weave the web. Each finger paints the area
  behind it with a different filter (thermal, b&w, duotone, sepia, invert).
- **🌼 Digital garden** — open your fist to bloom a wireframe dandelion; pinch
  your fingers apart/together to grow/shrink a field of flowers. Over a
  darkened black-and-white feed.
- **⌨️ ASCII terminal** — both hands frame a rectangle (index fingers = top,
  thumbs = bottom); everything inside renders as live green-on-black ASCII
  characters.

Switch scenes with the on-screen buttons or keys `1` / `2` / `3`. Toggle the
camera preview with the button or `v`.

## Run locally

It's static files, so any static server works. Easiest (no Node needed):

```
cd HandScenes
python serve.py      # http://localhost:8000  (no-cache, so edits show instantly)
```

A local server is required — the camera and ES modules don't work from a
`file://` page. Browsers also only allow the camera on `localhost` or `https`.

## Deploy to Vercel

This is a zero-build static site. Two ways:

**A. GitHub + Vercel dashboard (recommended)**
1. Create an empty repo at <https://github.com/new> (signed in as the account
   you want to own it).
2. From this folder, push it (the local git repo is already initialized):
   ```
   git remote add origin https://github.com/<you>/handscenes.git
   git push -u origin main
   ```
3. Go to <https://vercel.com/new>, import that repo. When asked for a
   **Framework Preset** choose **Other**, leave **Build Command** empty and
   **Output Directory** as `./`. Deploy.

**B. Vercel CLI** (if you install it: `npm i -g vercel`)
```
vercel        # follow prompts; accept the static defaults
vercel --prod # promote to production
```

`vercel.json` already sets a long cache on the hand-tracking model and a
camera permissions policy.

## Project layout

```
index.html            UI shell, scene switcher, instruction card
serve.py              local no-cache dev server
vercel.json           static hosting config (headers)
js/
  main.js             boot: webcam -> tracker -> active scene; scene switching
  hands.js            webcam + MediaPipe HandLandmarker; smoothed landmarks +
                      openness / pinch gestures
  videobg.js          shared "live camera as 3D backdrop" helper
  scenes/
    cradle.js         cat's cradle (selective bloom: only strings glow)
    garden.js         wireframe dandelion garden
    shapes.js         ASCII terminal filter
models/
  hand_landmarker.task   MediaPipe model (served with the site)
```

Note: `js/scenes/water.js` and `js/scenes/flower.js` are earlier scenes kept on
disk but not wired into the app.

## Credits

three.js and MediaPipe are loaded from CDN (jsDelivr). Hand model:
Google MediaPipe `hand_landmarker`.
