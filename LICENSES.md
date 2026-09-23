# Third-party licences

Everything HandScenes ships that someone else made, and what their licence
requires of us. Checked by `python tools/audit_disclosures.py`, which fails if a
file under `models/` has no entry here.

Some of these licences (CC BY, CC BY-SA) require **attribution** — the credits
below are not courtesy, they are the licence terms. If an asset is removed,
delete its entry; if one is added, add it before shipping.

## 3D models and assets

- `skeleton.obj` — anatomical skeleton, 144 individually named bones.
  Source: [AnatomyTOOL Open 3D Model](https://anatomytool.org/open3dmodel),
  derived from BodyParts3D © [DBCLS](https://dbcls.rois.ac.jp/).
  Licence: **CC BY-SA 2.1 JP**.
  Requires: attribution + share-alike on modified versions of the model.
  Credited in: `toys/atlas/index.html` (on-screen and in the start gate) and
  `privacy.html` (Credits).

## Machine-learning models

- `hand_landmarker.task` — MediaPipe Hand Landmarker, © Google.
  Licence: **Apache 2.0**. Requires: licence notice retained.
- `pose_landmarker_lite.task` — MediaPipe Pose Landmarker, © Google.
  Licence: **Apache 2.0**. Requires: licence notice retained.
- `face_landmarker.task` — MediaPipe Face Landmarker (478-point mesh), © Google.
  Licence: **Apache 2.0**. Requires: licence notice retained.
  Used only by the Anatomy Atlas's Live Motion mode.
- `candy-9.onnx`, `mosaic-9.onnx`, `udnie-9.onnx` — fast-neural-style transfer,
  from the [ONNX Model Zoo](https://github.com/onnx/models/tree/main/validated/vision/style_transfer/fast_neural_style),
  originally from [pytorch/examples](https://github.com/pytorch/examples/tree/master/fast_neural_style).
  Licence: **BSD-3-Clause** (per the model zoo README).
  Requires: copyright notice + licence text retained in redistributions.

## Vendored libraries (`vendor/`)

- **three.js** r165 — © three.js authors. Licence: **MIT**.
  Includes the addons under `vendor/three/addons/` (OrbitControls,
  CSS2DRenderer, OBJLoader, GLTFLoader, BufferGeometryUtils, postprocessing).
- **MediaPipe Tasks Vision** — © Google. Licence: **Apache 2.0**.
  `vendor/mediapipe/tasks-vision.mjs` plus its WASM fileset.
  Licence text: `vendor/mediapipe/LICENSE`.
- **VT323** (© 2011 The VT323 Project Authors) and **Press Start 2P**
  (© 2012 The Press Start 2P Project Authors).
  Licence: **SIL Open Font License 1.1**. Self-hosted in `vendor/fonts/`,
  licence text in `vendor/fonts/OFL.txt`.
- **p5.js** 1.9.4 (`toys/beats/`, `toys/bubbles/`) — © p5.js contributors.
  Licence: **LGPL-2.1**. Unmodified `vendor/p5/p5.min.js`, licence text in
  `vendor/p5/LICENSE`. Source: https://github.com/processing/p5.js/tree/v1.9.4
- **Tone.js** 14.8.49 (`toys/beats/`, `toys/booth/`) — © Yotam Mann.
  Licence: **MIT**. `vendor/tone/Tone.js`, licence text in `vendor/tone/LICENSE`.
- **ONNX Runtime Web** 1.19.2 (the filter box's neural style filter, `js/style.js`)
  — © Microsoft Corporation. Licence: **MIT**. `vendor/onnxruntime/`
  (`ort.webgpu.min.mjs` + its `ort-wasm-simd-threaded.jsep` .mjs/.wasm),
  licence text in `vendor/onnxruntime/LICENSE`.

## Loaded from a CDN at runtime

None. Every script, font, model and WASM file is served from this site's own
origin, and the `vercel.json` CSP allows only `'self'` for scripts, styles,
fonts and network requests.

## Not medical advice

The Anatomy Atlas is an educational reference built on a published anatomical
model. It is not a medical device and gives no diagnosis or medical advice.
