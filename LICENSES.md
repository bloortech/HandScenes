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
- **VT323** and **Press Start 2P** — © their authors.
  Licence: **SIL Open Font License 1.1**. Self-hosted in `vendor/fonts/`.

## Loaded from a CDN at runtime (not vendored)

These are the only outside origins a visitor's browser contacts. They are
disclosed in `privacy.html` under "Third parties" and mirrored in the
`disclosed-hosts` comment there.

- **p5.js** (`toys/beats/`, `toys/bubbles/`) via jsDelivr. Licence: **LGPL-2.1**.
- **Tone.js** (`toys/beats/`) via jsDelivr. Licence: **MIT**.
- **VT323 / Press Start 2P** via Google Fonts in those same two toys.
  Licence: **SIL OFL 1.1**.

> Note: these two toys predate the self-hosting policy the rest of the app
> follows. Moving them onto the local `vendor/` copies would remove the last
> two outside origins entirely — and let `privacy.html` go back to claiming
> everything is first-party.

## Not medical advice

The Anatomy Atlas is an educational reference built on a published anatomical
model. It is not a medical device and gives no diagnosis or medical advice.
