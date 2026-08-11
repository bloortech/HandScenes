// ============================================================
//  Interactive musculoskeletal atlas
//  A procedurally-built, anatomically-recognisable human skeleton
//  with a toggleable muscle layer and click-to-identify labels.
//
//  NOTE: this is a clean-room, stylised model built from primitives
//  so it is fully self-contained and legally unencumbered. The scene
//  graph is structured so a licensed / CC-licensed GLTF atlas
//  (e.g. Z-Anatomy / BodyParts3D) can be dropped in later — see
//  loadExternalModel() at the bottom.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export function initAtlas({ canvas, stageEl, hud }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.08, 2.7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 5.5;
  controls.target.set(0, 0.02, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  // ---- Label renderer (for the "Labels" toggle) ----
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.width = '100%';
  labelRenderer.domElement.style.height = '100%';
  labelRenderer.domElement.style.pointerEvents = 'none';
  stageEl.appendChild(labelRenderer.domElement);

  // ---- Lighting (bright, for the light stage) ----
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3e8, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ee, 0.5);
  fill.position.set(-4, 1, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(0, 2, -5);
  scene.add(rim);

  // ---- Materials ----
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xeae4d6, roughness: 0.62, metalness: 0.04 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0xe4ddcb, roughness: 0.5, metalness: 0.04 });
  const muscleMat = new THREE.MeshStandardMaterial({
    color: 0xc0433f, roughness: 0.75, metalness: 0.0,
    transparent: true, opacity: 0.62, depthWrite: false,
  });
  // Neon, to match the HandScenes palette the rest of this toy uses.
  const HIGHLIGHT = new THREE.Color(0x38f9d7);

  const model = new THREE.Group();
  const skeleton = new THREE.Group();
  const muscles = new THREE.Group();
  muscles.visible = false;
  model.add(skeleton, muscles);
  scene.add(model);

  const pickables = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let externalModel = null;

  // Tidy a model node name ("Femur.r", "Cervical_vertebrae_(C3)") into a label,
  // pulling the .r/.l side out as "(right)/(left)".
  function prettyName(s) {
    if (!s) return 'Bone';
    let t = s.replace(/\.\d+$/, ''), side = '';
    if (/\.r\.?$/i.test(t)) { side = ' (right)'; t = t.replace(/\.r\.?$/i, ''); }
    else if (/\.l\.?$/i.test(t)) { side = ' (left)'; t = t.replace(/\.l\.?$/i, ''); }
    t = t.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) + side : 'Bone';
  }

  // Educational definition for a bone, matched by keyword from its node name.
  // Order matters: more specific keys come before general ones.
  const BONE_DEFS = [
    ['atlas', 'First cervical vertebra (C1); the ring that carries the skull and lets you nod.'],
    ['axis', 'Second cervical vertebra (C2); its peg (the dens) lets the head rotate side to side.'],
    ['cervical', 'One of the seven neck vertebrae that support the skull and allow head movement.'],
    ['thoracic', 'One of twelve mid-back vertebrae; each pair articulates with a pair of ribs.'],
    ['lumbar', 'One of five lower-back vertebrae, the largest and most weight-bearing of the spine.'],
    ['sacrum', 'A triangular bone of fused vertebrae wedged into the pelvis, transmitting body weight.'],
    ['coccyx', 'The tailbone: three to five small fused vertebrae at the base of the spine.'],
    ['costal', 'Costal cartilage: the flexible bar linking a rib to the sternum.'],
    ['rib', 'One of the curved bones of the thoracic cage, shielding the heart and lungs.'],
    ['manubrium', 'The upper part of the sternum, meeting the clavicles and the first ribs.'],
    ['sternum', 'The breastbone: the flat central bone the ribs attach to at the front.'],
    ['clavicle', 'The collarbone: an S-shaped strut bracing the shoulder, and a commonly fractured bone.'],
    ['scapula', 'The shoulder blade: a flat triangular bone carrying the shoulder socket (glenoid).'],
    ['humerus', 'The upper-arm bone, running from the shoulder to the elbow.'],
    ['radius', 'The forearm bone on the thumb side, which rotates around the ulna.'],
    ['ulna', 'The forearm bone on the little-finger side, forming the point of the elbow.'],
    ['metacarpal', 'One of five long bones forming the palm of the hand.'],
    ['scaphoid', 'A wrist (carpal) bone on the thumb side; the most commonly fractured carpal.'],
    ['lunate', 'A crescent-shaped carpal bone in the proximal row of the wrist.'],
    ['triquetrum', 'A pyramid-shaped carpal bone on the little-finger side of the wrist.'],
    ['pisiform', 'A small pea-shaped sesamoid carpal sitting on the triquetrum.'],
    ['trapezium', 'A carpal at the base of the thumb, forming its saddle joint.'],
    ['trapezoid', 'A small wedge-shaped carpal at the base of the index finger.'],
    ['capitate', 'The largest carpal bone, at the centre of the wrist.'],
    ['hamate', 'A wedge-shaped carpal with a hook on the little-finger side of the palm.'],
    ['hip_bone', 'The hip bone (fused ilium, ischium and pubis), forming half of the pelvis.'],
    ['femur', 'The thigh bone: the longest and strongest bone in the body.'],
    ['patella', 'The kneecap: a sesamoid bone in the quadriceps tendon that shields the knee.'],
    ['tibia', 'The shin bone: the larger, weight-bearing bone of the lower leg.'],
    ['fibula', 'The slender outer bone of the lower leg, adding ankle stability and muscle attachment.'],
    ['calcaneus', 'The heel bone: the largest tarsal, the lever for the calf muscles.'],
    ['talus', 'The ankle bone linking the leg to the foot and carrying weight downward.'],
    ['navicular', 'A boat-shaped tarsal on the inner arch of the foot.'],
    ['cuboid', 'A cube-shaped tarsal on the outer side of the foot.'],
    ['cuneiform', 'One of three wedge-shaped tarsals supporting the arch of the foot.'],
    ['metatarsal', 'One of five long bones forming the sole and ball of the foot.'],
    ['sesamoid', 'A small bone embedded in a tendon, easing the tendon over a joint.'],
    ['distal_phalanx', 'The tip bone of a finger or toe.'],
    ['middle_phalanx', 'The middle bone of a finger or toe (absent in the thumb and big toe).'],
    ['proximal_phalanx', 'The base bone of a finger or toe, joining it to the palm or sole.'],
    ['phalanx', 'A bone of a finger or toe.'],
    ['frontal', 'The forehead bone, forming the front of the cranium and the upper eye sockets.'],
    ['parietal', 'One of the paired bones forming the sides and roof of the cranium.'],
    ['occipital', 'The bone at the back and base of the skull, with the opening for the spinal cord.'],
    ['temporal', 'The bone at the side and base of the skull, housing the middle and inner ear.'],
    ['sphenoid', 'A butterfly-shaped bone at the skull base that cradles the pituitary gland.'],
    ['ethmoid', 'A light, spongy bone between the eyes forming part of the nasal cavity and orbits.'],
    ['nasal', 'One of the two small bones forming the bridge of the nose.'],
    ['lacrimal', 'A tiny bone in the inner eye socket that channels tears to the nose.'],
    ['zygomatic', 'The cheekbone, forming the cheek prominence and part of the eye socket.'],
    ['maxilla', 'The upper jaw, holding the upper teeth and shaping the orbit and nasal cavity.'],
    ['palatine', 'An L-shaped bone forming the back of the hard palate and floor of the nose.'],
    ['vomer', 'A thin bone forming the lower part of the nasal septum.'],
    ['concha', 'A scroll-like bone in the nasal cavity that warms and filters inhaled air.'],
    ['mandible', 'The lower jaw: the only mobile bone of the skull.'],
    ['incisor', 'A chisel-shaped front tooth used for cutting food.'],
    ['canine', 'A pointed tooth beside the incisors, used for gripping and tearing.'],
    ['premolar', 'A transitional tooth used for crushing and grinding food.'],
    ['molar', 'A large back tooth with a broad surface for grinding food.'],
  ];
  function describeBone(raw) {
    const n = (raw || '').toLowerCase();
    for (const [k, d] of BONE_DEFS) if (n.includes(k)) return d;
    return 'A bone of the human skeleton.';
  }

  // --- helpers ---------------------------------------------------
  function tag(mesh, name, desc) {
    mesh.userData = { name, desc, baseColor: mesh.material.color.clone() };
    return mesh;
  }
  function addBone(mesh, name, desc) {
    // give each pickable its own material instance so highlight is isolated
    mesh.material = boneMat.clone();
    tag(mesh, name, desc);
    skeleton.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function boneBetween(a, b, r0, r1, name, desc) {
    const start = a.clone(), end = b.clone();
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r0, r1 ?? r0, len, 18);
    const m = new THREE.Mesh(geo, boneMat);
    m.position.copy(start).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    return addBone(m, name, desc);
  }
  function joint(pos, r, name, desc) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), jointMat);
    m.position.copy(pos);
    return addBone(m, name, desc);
  }
  function muscleCapsule(a, b, r, extra) {
    const start = a.clone(), end = b.clone();
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, len, 18), muscleMat);
    g.add(cyl);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), muscleMat));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.82, 16, 12), muscleMat);
    bot.position.y = -len / 2; g.children[1].position.y = len / 2;
    g.add(bot);
    g.position.copy(start).addScaledVector(dir, 0.5);
    g.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    if (extra) extra(g);
    muscles.add(g);
    return g;
  }
  function muscleBlob(pos, sx, sy, sz) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), muscleMat);
    m.position.copy(pos); m.scale.set(sx, sy, sz);
    muscles.add(m);
    return m;
  }

  // --- Landmark points (right side; mirror x for left) -----------
  const P = {
    neckBase: V(0, 0.60, 0.02), skull: V(0, 0.79, 0.03),
    spineBase: V(0, -0.02, -0.02),
    shoulderR: V(0.18, 0.55, 0.02), elbowR: V(0.225, 0.28, 0.03),
    wristR: V(0.205, 0.05, 0.05), handR: V(0.20, -0.05, 0.06),
    hipR: V(0.095, -0.03, 0), kneeR: V(0.105, -0.44, 0.02),
    ankleR: V(0.095, -0.82, -0.02), footR: V(0.10, -0.88, 0.10),
  };
  const mirror = (p) => V(-p.x, p.y, p.z);

  // ============================================================
  //  BUILD THE SKELETON
  // ============================================================

  // --- Skull + jaw ---
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.098, 28, 24), boneMat);
  skull.scale.set(0.92, 1.05, 1.0);
  skull.position.copy(P.skull);
  addBone(skull, 'Cranium (skull)',
    'Bony braincase that protects the brain, built from the frontal, parietal, temporal and occipital bones.');
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 10, 20, Math.PI), boneMat);
  jaw.position.set(0, P.skull.y - 0.075, 0.055);
  jaw.rotation.x = Math.PI * 0.06; jaw.rotation.z = Math.PI;
  addBone(jaw, 'Mandible (jaw)', 'Lower jawbone, and the only mobile bone of the skull.');

  // --- Vertebral column (S-curve of segments + vertebra rings) ---
  const spinePts = [
    V(0, -0.03, -0.02), V(0, 0.10, 0.0), V(0, 0.24, -0.02),
    V(0, 0.38, 0.0), V(0, 0.50, 0.02), V(0, 0.60, 0.02),
  ];
  for (let i = 0; i < spinePts.length - 1; i++) {
    boneBetween(spinePts[i], spinePts[i + 1], 0.03, 0.028,
      'Vertebral column (spine)',
      'Stack of 33 vertebrae (cervical, thoracic, lumbar, sacrum, coccyx) that houses the spinal cord.');
  }
  for (const p of spinePts) {
    const vert = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.012, 8, 18), boneMat);
    vert.rotation.x = Math.PI / 2; vert.position.copy(p).add(V(0, 0, -0.01));
    addBone(vert, 'Vertebra', 'One spinal segment, cushioned from its neighbours by an intervertebral disc.');
  }

  // --- Neck (cervical) + connection to skull ---
  boneBetween(P.neckBase, V(0, 0.71, 0.03), 0.026, 0.024,
    'Cervical spine (neck)', 'Seven cervical vertebrae that support the skull and let the head turn.');

  // --- Rib cage (horizontal oval rings) + sternum ---
  const ribLevels = [
    { y: 0.30, r: 0.15 }, { y: 0.37, r: 0.165 }, { y: 0.44, r: 0.165 },
    { y: 0.50, r: 0.15 }, { y: 0.55, r: 0.12 },
  ];
  ribLevels.forEach((lv, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(lv.r, 0.011, 10, 40, Math.PI * 1.55), boneMat);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = -Math.PI * 0.775; // open the gap toward the back
    ring.position.set(0, lv.y, 0.03);
    ring.scale.set(1, 0.72, 1);
    addBone(ring, `Rib ${i + 1}`, 'One of twelve rib pairs forming the thoracic cage around the heart and lungs.');
  });
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 0.02), boneMat);
  sternum.position.set(0, 0.43, 0.135);
  addBone(sternum, 'Sternum (breastbone)', 'Flat central chest bone where the ribs meet at the front.');

  // --- Shoulder girdle: clavicle + scapula (both sides) ---
  [1, -1].forEach((side) => {
    const sh = side === 1 ? P.shoulderR : mirror(P.shoulderR);
    boneBetween(V(0.02 * side, 0.575, 0.09), V(sh.x, sh.y + 0.02, 0.06), 0.017, 0.015,
      'Clavicle (collarbone)', 'S-shaped strut linking the arm to the trunk, and one of the most commonly fractured bones.');
    const scap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.018), boneMat);
    scap.position.set(sh.x * 0.72, 0.50, -0.075);
    scap.rotation.z = 0.2 * side; scap.rotation.y = 0.3 * side;
    addBone(scap, 'Scapula (shoulder blade)', 'Flat triangular bone that forms the back of the shoulder and its glenoid socket.');
  });

  // --- Arms (both sides) ---
  [1, -1].forEach((side) => {
    const sh = side === 1 ? P.shoulderR : mirror(P.shoulderR);
    const el = side === 1 ? P.elbowR : mirror(P.elbowR);
    const wr = side === 1 ? P.wristR : mirror(P.wristR);
    const hd = side === 1 ? P.handR : mirror(P.handR);

    joint(sh, 0.036, 'Shoulder joint (glenohumeral)', 'Ball-and-socket joint, the most mobile in the body.');
    boneBetween(sh, el, 0.028, 0.024, 'Humerus', 'Upper arm bone, running from shoulder to elbow.');
    joint(el, 0.03, 'Elbow joint', 'Hinge joint where the humerus meets the radius and ulna.');
    // radius + ulna, slightly separated
    const off = V(0.018 * side, 0, 0.012);
    boneBetween(el.clone().add(off), wr.clone().add(off), 0.017, 0.013, 'Radius', 'Forearm bone on the thumb side.');
    boneBetween(el.clone().sub(off), wr.clone().sub(off), 0.017, 0.013, 'Ulna', 'Forearm bone on the little-finger side, forming the point of the elbow.');
    joint(wr, 0.022, 'Wrist (carpals)', 'Eight small carpal bones linking the forearm to the hand.');
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.02), boneMat);
    palm.position.copy(hd); palm.rotation.z = 0.1 * side;
    addBone(palm, 'Hand (metacarpals & phalanges)', 'Bones of the palm and fingers.');
  });

  // --- Pelvis ---
  const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 12, 32), boneMat);
  pelvis.rotation.x = Math.PI / 2; pelvis.position.set(0, -0.05, 0);
  pelvis.scale.set(1, 0.7, 0.62);
  addBone(pelvis, 'Pelvis', 'Bony basin of ilium, ischium, pubis and sacrum that carries weight from spine to legs.');
  [1, -1].forEach((side) => {
    const ilium = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.09), boneMat);
    ilium.position.set(0.10 * side, 0.01, -0.01);
    ilium.rotation.z = 0.25 * side;
    addBone(ilium, 'Ilium (iliac wing)', 'Broad upper flare of the hip bone, felt as the crest at your waist.');
  });

  // --- Legs (both sides) ---
  [1, -1].forEach((side) => {
    const hip = side === 1 ? P.hipR : mirror(P.hipR);
    const kn = side === 1 ? P.kneeR : mirror(P.kneeR);
    const an = side === 1 ? P.ankleR : mirror(P.ankleR);
    const ft = side === 1 ? P.footR : mirror(P.footR);

    joint(hip, 0.04, 'Hip joint', 'Deep ball-and-socket joint between the femoral head and the acetabulum.');
    boneBetween(hip, kn, 0.036, 0.03, 'Femur (thigh bone)', 'Longest and strongest bone in the body.');
    const patella = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), jointMat);
    patella.position.copy(kn).add(V(0, 0, 0.035));
    addBone(patella, 'Patella (kneecap)', 'Sesamoid bone set in the quadriceps tendon to shield the knee.');
    joint(kn, 0.034, 'Knee joint', 'Hinge joint linking femur, tibia and patella.');
    const off = V(0.016 * side, 0, 0);
    boneBetween(kn.clone().add(off), an.clone().add(off), 0.028, 0.02, 'Tibia (shin bone)', 'Larger, weight-bearing bone of the lower leg.');
    boneBetween(kn.clone().sub(off).add(V(0, -0.02, 0)), an.clone().sub(off), 0.014, 0.011, 'Fibula', 'Slender outer bone of the lower leg.');
    joint(an, 0.024, 'Ankle joint (talus)', 'Joint linking leg to foot that lets it point and flex.');
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.14), boneMat);
    foot.position.copy(ft);
    addBone(foot, 'Foot (tarsals & metatarsals)', 'Twenty-six bones forming the arch and lever of the foot.');
  });

  // --- Soft contact shadow under the feet ---
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 40),
    new THREE.MeshBasicMaterial({ color: 0x9aa2ac, transparent: true, opacity: 0.22 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.92;
  model.add(shadow);

  // ============================================================
  //  BUILD THE MUSCLE LAYER
  // ============================================================
  // Torso block (pecs + abdomen)
  muscleBlob(V(0, 0.34, 0.05), 0.16, 0.24, 0.12);
  muscleBlob(V(0, 0.02, 0.02), 0.13, 0.12, 0.10); // lower abdomen
  [1, -1].forEach((side) => {
    const sh = side === 1 ? P.shoulderR : mirror(P.shoulderR);
    const el = side === 1 ? P.elbowR : mirror(P.elbowR);
    const wr = side === 1 ? P.wristR : mirror(P.wristR);
    const hip = side === 1 ? P.hipR : mirror(P.hipR);
    const kn = side === 1 ? P.kneeR : mirror(P.kneeR);
    const an = side === 1 ? P.ankleR : mirror(P.ankleR);
    muscleBlob(sh.clone(), 0.06, 0.07, 0.06);            // deltoid
    muscleCapsule(sh, el, 0.05);                          // biceps / triceps
    muscleCapsule(el, wr, 0.04);                          // forearm
    muscleBlob(V(0.055 * side, 0.42, 0.10), 0.06, 0.05, 0.04); // pectoral
    muscleBlob(hip.clone().add(V(0.01 * side, -0.02, -0.03)), 0.08, 0.08, 0.08); // gluteal
    muscleCapsule(hip, kn, 0.075);                        // quadriceps / hamstring
    muscleCapsule(kn.clone().add(V(0, -0.02, 0)), an, 0.05, (g) => { g.children[0].scale.set(1, 0.9, 1); }); // calf
  });

  // ============================================================
  //  ADAPTIVE LABELS — level of detail driven by zoom distance
  //    tier 0 = regions (far)  ·  tier 1 = major bones (mid)
  //    tier 2 = fine detail (close)  ·  m = muscle (needs muscle layer)
  // ============================================================
  const labelDefs = [
    // tier 0 — regions (zoomed out: the big picture)
    { t: 0, x: 'Skull', p: V(0, 0.96, 0) },
    { t: 0, x: 'Axial skeleton', p: V(-0.32, 0.40, 0) },
    { t: 0, x: 'Upper limb', p: V(0.37, 0.42, 0) },
    { t: 0, x: 'Pelvic girdle', p: V(0, -0.18, 0.24) },
    { t: 0, x: 'Lower limb', p: V(0.25, -0.52, 0) },

    // tier 1 — major bones (default / mid zoom)
    { t: 1, x: 'Cranium', p: V(0, 0.90, 0) },
    { t: 1, x: 'Clavicle', p: V(0.11, 0.585, 0.13) },
    { t: 1, x: 'Sternum', p: V(0, 0.43, 0.20) },
    { t: 1, x: 'Rib cage', p: V(0.21, 0.45, 0.06) },
    { t: 1, x: 'Humerus', p: V(0.27, 0.42, 0.03) },
    { t: 1, x: 'Radius & ulna', p: V(0.26, 0.16, 0.05) },
    { t: 1, x: 'Vertebral column', p: V(-0.17, 0.30, -0.05) },
    { t: 1, x: 'Pelvis', p: V(0, -0.05, 0.18) },
    { t: 1, x: 'Femur', p: V(0.16, -0.22, 0.03) },
    { t: 1, x: 'Patella', p: V(-0.17, -0.44, 0.06) },
    { t: 1, x: 'Tibia & fibula', p: V(0.16, -0.63, 0.02) },
    { t: 1, x: 'Foot', p: V(0.10, -0.90, 0.24) },

    // tier 2 — fine detail (zoomed in)
    { t: 2, x: 'Cervical spine (C1–C7)', p: V(-0.11, 0.66, 0.04) },
    { t: 2, x: 'Thoracic spine (T1–T12)', p: V(-0.13, 0.44, -0.05) },
    { t: 2, x: 'Lumbar spine (L1–L5)', p: V(-0.12, 0.15, 0.02) },
    { t: 2, x: 'Scapula', p: V(0.25, 0.50, -0.13) },
    { t: 2, x: 'Radius', p: V(0.31, 0.18, 0.09) },
    { t: 2, x: 'Ulna', p: V(0.13, 0.12, 0.0) },
    { t: 2, x: 'Carpals & phalanges', p: V(0.26, -0.06, 0.11) },
    { t: 2, x: 'Ilium', p: V(0.19, 0.02, 0.09) },
    { t: 2, x: 'Tibia', p: V(0.19, -0.62, 0.06) },
    { t: 2, x: 'Fibula', p: V(0.02, -0.62, -0.03) },
    { t: 2, x: 'Tarsals & calcaneus', p: V(0.10, -0.92, 0.27) },

    // tier 2 — muscles (only when the muscle layer is on)
    { t: 2, m: true, x: 'Deltoid', p: V(0.25, 0.56, 0.08) },
    { t: 2, m: true, x: 'Biceps brachii', p: V(0.30, 0.42, 0.07) },
    { t: 2, m: true, x: 'Pectoralis major', p: V(0.11, 0.43, 0.16) },
    { t: 2, m: true, x: 'Rectus abdominis', p: V(0.08, 0.10, 0.16) },
    { t: 2, m: true, x: 'Quadriceps femoris', p: V(0.18, -0.22, 0.11) },
    { t: 2, m: true, x: 'Gastrocnemius', p: V(0.15, -0.60, -0.08) },
  ];

  const TIER_STYLE = {
    0: 'font:600 13px Geist,Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0b835c;background:rgba(255,255,255,.95);padding:4px 12px',
    1: 'font:600 11px Geist,Inter,system-ui,sans-serif;color:#1c1c1e;background:rgba(255,255,255,.92);padding:3px 9px',
    2: 'font:500 10px Geist,Inter,system-ui,sans-serif;color:#676768;background:rgba(255,255,255,.88);padding:2px 8px',
    m: 'font:600 10px Geist,Inter,system-ui,sans-serif;color:#0b835c;background:rgba(11,131,92,.10);padding:2px 8px',
  };
  const labels = [];
  labelDefs.forEach((d) => {
    const el = document.createElement('div');
    el.textContent = d.x;
    el.style.cssText =
      (d.m ? TIER_STYLE.m : TIER_STYLE[d.t]) +
      ';border:1px solid rgba(18,22,28,.12);border-radius:999px;white-space:nowrap;' +
      'box-shadow:0 2px 8px rgba(18,22,28,.10);transform:translate(-50%,-50%)';
    const obj = new CSS2DObject(el);
    obj.position.copy(d.p);
    obj.visible = false;
    model.add(obj);
    labels.push({ obj, tier: d.t, muscle: !!d.m });
  });
  let labelsEnabled = true;
  let lastLevel = '';

  function updateLOD() {
    if (motionActive) {
      for (const L of labels) if (L.obj.visible) L.obj.visible = false;
      for (const L of extLabels) if (L.obj.visible) L.obj.visible = false;
      if (hud.level && lastLevel !== 'Live motion') { hud.level.textContent = 'Live motion'; lastLevel = 'Live motion'; }
      return;
    }
    const active = externalModel ? extLabels : labels;
    const d = camera.position.distanceTo(controls.target);
    for (const L of active) {
      let vis = labelsEnabled;
      if (vis) {
        if (L.tier === 0) vis = d >= 3.0;                    // regions: far
        else if (L.tier === 1) vis = d < 3.5 && d >= 2.05;   // major bones: mid
        else vis = d < 2.4 && (!L.muscle || muscles.visible); // fine detail: close
      }
      if (L.obj.visible !== vis) L.obj.visible = vis;
    }
    let level;
    if (d >= 3.15) level = 'Overview · regions';
    else if (d >= 2.25) level = 'Major bones';
    else level = muscles.visible ? 'Fine detail · muscles' : 'Fine detail · bones';
    if (hud.level && level !== lastLevel) { hud.level.textContent = level; lastLevel = level; }
  }

  // ============================================================
  //  RAYCAST — hover / click to identify
  // ============================================================
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let pinned = null;

  function setHud(mesh) {
    const show = mesh || pinned;
    if (show) {
      const u = show.userData;
      hud.name.textContent = u.name;
      hud.sub.textContent = u.desc;
      if (hud.meta) {
        // Only the external model carries region/class/side; the procedural
        // one has no such taxonomy, so the strip stays empty there.
        const bits = [u.region, u.cls, u.side && u.side !== 'Midline' ? u.side + ' side' : null]
          .filter(Boolean);
        hud.meta.textContent = bits.join('  ·  ');
        hud.meta.style.display = bits.length ? '' : 'none';
      }
    } else {
      hud.name.textContent = 'Select a bone';
      hud.sub.textContent = 'Hover any bone to identify it, or click to pin it here. '
        + 'Zoom in for finer structures — the labels change with the detail level.';
      if (hud.meta) { hud.meta.textContent = ''; hud.meta.style.display = 'none'; }
    }
  }
  function highlight(mesh, on) {
    if (!mesh) return;
    if (on) mesh.material.color.copy(HIGHLIGHT);
    else if (mesh !== pinned) mesh.material.color.copy(mesh.userData.baseColor);
  }
  function pointerFromEvent(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    // Muscles are only hoverable while their layer is showing, so the bones
    // stay reachable underneath when it is off.
    const targets = muscles.visible && muscleTargets.length
      ? pickables.concat(muscleTargets)
      : pickables;
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (motionActive) return;
    pointerFromEvent(e);
    const hit = pick();
    if (hit !== hovered) {
      if (hovered && hovered !== pinned) highlight(hovered, false);
      hovered = hit;
      if (hovered) highlight(hovered, true);
      setHud(hovered);
    }
  });
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });
  renderer.domElement.addEventListener('click', (e) => {
    if (motionActive) return;
    pointerFromEvent(e);
    const hit = pick();
    if (pinned && pinned !== hit) pinned.material.color.copy(pinned.userData.baseColor);
    pinned = hit;
    if (pinned) pinned.material.color.copy(HIGHLIGHT);
    setHud(hit);
  });

  // ============================================================
  //  EXTERNAL-MODEL LABELS + MUSCLES
  //
  //  The tiered labels above and the muscle meshes are positioned in the
  //  PROCEDURAL skeleton's coordinates, so they do not line up with a real
  //  anatomical model — which is why loading one used to switch both off and
  //  leave the viewer with nothing but a silent mesh. Instead, rebuild both
  //  from the loaded model's own geometry: every anchor below is the centre of
  //  the actual named bone's bounding box, so it lands on the real bone at
  //  whatever scale the model was normalised to.
  //
  //  Bilateral specs match only the `.r` meshes (the originals; `.l` are the
  //  mirrored clones) so a label sits ON a bone rather than floating at the
  //  midline between the pair.
  // ============================================================
  const IS_RIGHT = /\.r\.?$/i;

  // Region + bone class, used for labels and for the identify card.
  // Foot is tested before hand: "..._finger_of_foot" contains "finger".
  const REGION_MAP = [
    [/of_foot|calcaneus|talus|navicular|cuboid|cuneiform|metatarsal/i, 'Foot'],
    [/of_hand|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|finger/i, 'Hand'],
    [/frontal|parietal|occipital|temporal|sphenoid|ethmoid|nasal|lacrimal|zygomat|maxilla|palatine|vomer|concha|mandible|incisor|canine|premolar|molar/i, 'Skull'],
    [/atlas|axis|cervical/i, 'Cervical spine'],
    [/thoracic_vert/i, 'Thoracic spine'],
    [/lumbar/i, 'Lumbar spine'],
    [/sacrum|coccyx|hip_bone/i, 'Pelvis'],
    [/rib|costal|sternum|manubrium/i, 'Thoracic cage'],
    [/clavicle|scapula/i, 'Shoulder girdle'],
    [/humerus|radius|ulna/i, 'Arm'],
    [/femur|patella|tibia|fibula/i, 'Leg'],
  ];
  const CLASS_MAP = [
    [/incisor|canine|premolar|molar/i, 'Tooth'],
    [/patella|sesamoid/i, 'Sesamoid bone'],
    [/femur|humerus|tibia|fibula|radius|ulna|metacarpal|metatarsal|phalanx|clavicle/i, 'Long bone'],
    [/scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|talus|calcaneus|navicular|cuboid|cuneiform/i, 'Short bone'],
    [/scapula|rib|costal|sternum|manubrium|hip_bone|frontal|parietal|occipital|nasal|lacrimal|vomer/i, 'Flat bone'],
    [/vertebra|atlas|axis|sacrum|coccyx|maxilla|mandible|palatine|zygomat|sphenoid|ethmoid|temporal|concha/i, 'Irregular bone'],
  ];
  const lookup = (table, name, fallback) => {
    for (const [re, v] of table) if (re.test(name)) return v;
    return fallback;
  };

  const EXT_LABELS = [
    // tier 0 — regions (zoomed out)
    { t: 0, x: 'Skull', re: /frontal|parietal|occipital|temporal|sphenoid|ethmoid|maxilla|mandible|zygomat|nasal|vomer|palatine|lacrimal|concha/i },
    { t: 0, x: 'Vertebral column', re: /atlas|axis|cervical|thoracic_vert|lumbar|sacrum|coccyx/i },
    { t: 0, x: 'Thoracic cage', re: /rib_\(|costal|sternum|manubrium/i, side: 'r' },
    { t: 0, x: 'Upper limb', re: /humerus|radius|ulna/i, side: 'r' },
    { t: 0, x: 'Pelvic girdle', re: /hip_bone/i, side: 'r' },
    { t: 0, x: 'Lower limb', re: /femur|tibia|fibula/i, side: 'r' },
    // tier 1 — major bones (mid zoom)
    { t: 1, x: 'Cranium', re: /frontal_bone|parietal/i },
    { t: 1, x: 'Mandible', re: /mandible/i },
    { t: 1, x: 'Clavicle', re: /clavicle/i, side: 'r' },
    { t: 1, x: 'Scapula', re: /scapula/i, side: 'r' },
    { t: 1, x: 'Sternum', re: /sternum|manubrium/i },
    { t: 1, x: 'Ribs', re: /rib_\(/i, side: 'r' },
    { t: 1, x: 'Humerus', re: /humerus/i, side: 'r' },
    { t: 1, x: 'Radius', re: /radius/i, side: 'r' },
    { t: 1, x: 'Ulna', re: /ulna/i, side: 'r' },
    { t: 1, x: 'Hip bone', re: /hip_bone/i, side: 'r' },
    { t: 1, x: 'Femur', re: /femur/i, side: 'r' },
    { t: 1, x: 'Patella', re: /patella/i, side: 'r' },
    { t: 1, x: 'Tibia', re: /tibia/i, side: 'r' },
    { t: 1, x: 'Fibula', re: /fibula/i, side: 'r' },
    // tier 2 — fine detail (zoomed in)
    { t: 2, x: 'Cervical spine (C1–C7)', re: /atlas|axis|cervical/i },
    { t: 2, x: 'Thoracic spine (T1–T12)', re: /thoracic_vert/i },
    { t: 2, x: 'Lumbar spine (L1–L5)', re: /lumbar/i },
    { t: 2, x: 'Sacrum', re: /sacrum/i },
    { t: 2, x: 'Coccyx', re: /coccyx/i },
    { t: 2, x: 'Carpals', re: /scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate/i, side: 'r' },
    { t: 2, x: 'Metacarpals', re: /metacarpal/i, side: 'r' },
    { t: 2, x: 'Phalanges', re: /phalanx/i, not: /of_foot/i, side: 'r' },
    { t: 2, x: 'Tarsals', re: /talus|navicular|cuboid|cuneiform/i, side: 'r' },
    { t: 2, x: 'Calcaneus', re: /calcaneus/i, side: 'r' },
    { t: 2, x: 'Metatarsals', re: /metatarsal/i, side: 'r' },
    { t: 2, x: 'Toe phalanges', re: /phalanx.*of_foot/i, side: 'r' },
  ];

  // World-space bounding box of every mesh in `meshes` matching a spec.
  function specBox(meshes, spec) {
    const box = new THREE.Box3();
    let hit = 0;
    for (const m of meshes) {
      if (!spec.re.test(m.name)) continue;
      if (spec.not && spec.not.test(m.name)) continue;
      if (spec.side === 'r' && !IS_RIGHT.test(m.name)) continue;
      box.expandByObject(m);
      hit++;
    }
    return hit && !box.isEmpty() ? box : null;
  }

  const extLabels = [];
  function buildExternalLabels(meshes) {
    for (const { obj } of extLabels) obj.parent && obj.parent.remove(obj);
    extLabels.length = 0;
    for (const spec of EXT_LABELS) {
      const box = specBox(meshes, spec);
      if (!box) continue;                      // model lacks that bone: skip it
      const p = model.worldToLocal(box.getCenter(new THREE.Vector3()));
      const el = document.createElement('div');
      el.textContent = spec.x;
      el.style.cssText =
        TIER_STYLE[spec.t] +
        ';border:1px solid rgba(18,22,28,.12);border-radius:999px;white-space:nowrap;' +
        'box-shadow:0 2px 8px rgba(18,22,28,.10);transform:translate(-50%,-50%)';
      const o = new CSS2DObject(el);
      o.position.copy(p);
      o.visible = false;
      model.add(o);
      extLabels.push({ obj: o, tier: spec.t, muscle: false });
    }
    return extLabels.length;
  }

  // Schematic muscle layer laid over the real skeleton. Each belly is a capsule
  // along a REAL bone's axis (not a scanned muscle mesh) — indicative of where
  // the muscle sits, at whatever scale the model loaded at.
  const MUSCLE_SPECS = [
    { name: 'Deltoid', from: /humerus/i, at: 'top', span: 0.28, r: 0.55, z: 0.0 },
    { name: 'Biceps brachii', from: /humerus/i, at: 'mid', span: 0.62, r: 0.34, z: 0.5 },
    { name: 'Quadriceps femoris', from: /femur/i, at: 'mid', span: 0.72, r: 0.34, z: 0.5 },
    { name: 'Gastrocnemius', from: /tibia/i, at: 'upper', span: 0.5, r: 0.38, z: -0.6 },
  ];

  const muscleTargets = [];
  function buildExternalMuscles(meshes) {
    for (let i = muscles.children.length - 1; i >= 0; i--) {
      const c = muscles.children[i];
      muscles.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
    muscleTargets.length = 0;
    let made = 0;
    for (const side of ['r', 'l']) {
      for (const spec of MUSCLE_SPECS) {
        // Filter by side explicitly: specBox's 'r' filter cannot express "the
        // mirrored .l clone only", and we need one belly per limb.
        const b = new THREE.Box3();
        let hit = 0;
        for (const m of meshes) {
          if (!spec.from.test(m.name)) continue;
          const isR = IS_RIGHT.test(m.name);
          if ((side === 'r') !== isR) continue;
          b.expandByObject(m); hit++;
        }
        if (!hit || b.isEmpty()) continue;
        const size = b.getSize(new THREE.Vector3());
        const c = b.getCenter(new THREE.Vector3());
        const len = size.y;
        const yTop = c.y + len / 2, yBot = c.y - len / 2;
        let ya, yb;
        if (spec.at === 'top') { ya = yTop; yb = yTop - len * spec.span; }
        else if (spec.at === 'upper') { ya = yTop - len * 0.05; yb = yTop - len * (0.05 + spec.span); }
        else { ya = c.y + len * spec.span / 2; yb = c.y - len * spec.span / 2; }
        const thick = Math.max(size.x, size.z);
        const a = model.worldToLocal(new THREE.Vector3(c.x, ya, c.z + thick * spec.z));
        const d = model.worldToLocal(new THREE.Vector3(c.x, yb, c.z + thick * spec.z));
        const g = muscleCapsule(a, d, thick * spec.r);
        // muscleCapsule builds a 3-mesh Group sharing the one muscleMat. Give
        // each belly its own material clone so highlighting picks out that
        // muscle and not every muscle at once, and register the meshes so the
        // layer can be hovered and identified like the bones.
        const mat = muscleMat.clone();
        const info = {
          name: spec.name,
          desc: describeMuscle(spec.name),
          region: lookup(REGION_MAP, spec.from.source, 'Skeleton'),
          cls: 'Skeletal muscle',
          side: side === 'r' ? 'Right' : 'Left',
          baseColor: mat.color.clone(),
        };
        g.traverse((n) => {
          if (!n.isMesh) return;
          n.material = mat;
          n.userData = info;
          muscleTargets.push(n);
        });
        made++;
      }
    }
    return made;
  }

  const MUSCLE_DEFS = {
    'Deltoid': 'The rounded shoulder cap that lifts the arm away from the body.',
    'Biceps brachii': 'The front upper-arm muscle that bends the elbow and turns the palm up.',
    'Quadriceps femoris': 'The four-part front thigh muscle that straightens the knee.',
    'Gastrocnemius': 'The calf muscle that points the foot down and pushes you off the ground.',
  };
  const describeMuscle = (n) => MUSCLE_DEFS[n] || 'A skeletal muscle.';

  // ============================================================
  //  RESIZE + RENDER LOOP
  // ============================================================
  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let motionActive = false;
  let raf;
  function loop() {
    controls.update();
    updateLOD();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();

  // hide the loading veil now that the first frame is up
  requestAnimationFrame(() => stageEl.dispatchEvent(new CustomEvent('atlas:ready', { bubbles: true })));

  // ============================================================
  //  PUBLIC API
  // ============================================================
  return {
    // Both now work on the real model too: the muscle layer and the labels are
    // rebuilt from its own bones when it loads.
    setMuscles(on) { muscles.visible = on; },
    toggleLabels(on) { labelsEnabled = on; return on; },
    // Zoom by a factor along the view direction, clamped to the orbit limits,
    // so the buttons feel identical to scrolling (and work on touch/trackpads
    // where a wheel gesture may not reach the canvas).
    zoomBy(factor) {
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      const d = THREE.MathUtils.clamp(dir.length() * factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(dir.setLength(d));
      controls.update();
      return d;
    },
    resetView() {
      controls.autoRotate = true;
      camera.position.set(0, 0.08, 2.7);
      controls.target.set(0, 0.02, 0);
      controls.update();
      if (pinned) { pinned.material.color.copy(pinned.userData.baseColor); pinned = null; }
      setHud(null);
    },
    setMotion(active) {
      // Live Motion shows the full webcam view on top of the stage, so the 3D
      // model just pauses interaction underneath.
      motionActive = active;
      controls.enabled = !active;
      controls.autoRotate = !active;
    },
    getCamera: () => camera,
    // What actually got built. Useful when checking that a swapped-in model
    // still yields labels and muscles rather than silently producing none.
    stats: () => ({
      external: !!externalModel,
      pickable: pickables.length,
      labels: (externalModel ? extLabels : labels).length,
      muscles: muscles.children.length,
    }),

    // Load a real anatomical model (GLTF/GLB). Auto-centres it, scales to a
    // human height, frames the camera, gives every mesh a clickable name, and
    // swaps out the procedural skeleton. Returns false (keeping the built-in
    // model) if the file is missing or fails to load.
    async loadExternalModel(url) {
      try {
        let obj;
        if (/\.obj($|\?)/i.test(url)) {
          const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
          obj = await new OBJLoader().loadAsync(url);
        } else {
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          obj = (await new GLTFLoader().loadAsync(url)).scene;
        }

        // Some exports are hemi-skeletons: midline (axial) bones + only the
        // right-side (.r) appendicular bones. If there are .r bones but no .l
        // bones, mirror the right side across the sagittal plane to build the
        // missing left side, so it renders as a full skeleton.
        const rSide = [];
        let hasL = false;
        obj.traverse((n) => {
          if (!n.isMesh) return;
          if (/\.r\.?$/i.test(n.name)) rSide.push(n);
          else if (/\.l\.?$/i.test(n.name)) hasL = true;
        });
        if (rSide.length && !hasL) {
          const axial = new THREE.Box3();
          let any = false;
          obj.traverse((n) => { if (n.isMesh && !/\.r\.?$/i.test(n.name)) { axial.expandByObject(n); any = true; } });
          const c = any ? axial.getCenter(new THREE.Vector3()).x : 0;
          for (const n of rSide) {
            const m = n.clone();
            m.name = n.name.replace(/\.r(\.?)$/i, '.l$1');
            m.scale.x *= -1;            // reflect …
            m.position.x = 2 * c - n.position.x; // … across the sagittal plane x = c
            obj.add(m);
          }
        }

        // Orient: stand the model up so its longest axis is vertical (Y).
        obj.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(obj);
        let size = box.getSize(new THREE.Vector3());
        if (size.z > size.y && size.z > size.x) obj.rotation.x = -Math.PI / 2;
        else if (size.x > size.y && size.x > size.z) obj.rotation.z = Math.PI / 2;

        // Fit: scale to ~1.8 units tall and centre at the origin.
        obj.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(obj);
        size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 1.8 / (size.y || Math.max(size.x, size.z) || 1);
        obj.scale.setScalar(s);
        obj.position.set(-center.x * s, -center.y * s, -center.z * s);

        // Bone material for untextured meshes; keep textured ones. Each mesh
        // stays identifiable by its node name for the click-to-identify HUD.
        const ext = [];
        obj.traverse((n) => {
          if (!n.isMesh) return;
          if (!n.material || !n.material.map) n.material = boneMat.clone();
          else n.material = n.material.clone();
          n.material.side = THREE.DoubleSide; // mirrored (negative-scale) meshes render correctly
          const col = n.material.color ? n.material.color.clone() : new THREE.Color(0xffffff);
          n.userData = {
            name: prettyName(n.name),
            desc: describeBone(n.name),
            region: lookup(REGION_MAP, n.name, 'Skeleton'),
            cls: lookup(CLASS_MAP, n.name, 'Bone'),
            side: IS_RIGHT.test(n.name) ? 'Right' : (/\.l\.?$/i.test(n.name) ? 'Left' : 'Midline'),
            baseColor: col,
          };
          ext.push(n);
        });

        // Swap in: hide the procedural skeleton, repoint raycasting + labels.
        skeleton.visible = false; shadow.visible = false;
        labels.forEach((L) => (L.obj.visible = false));
        pickables.length = 0; pickables.push(...ext);
        model.add(obj);
        externalModel = obj;

        // Rebuild labels and the muscle layer against the REAL bones, so both
        // toggles keep working instead of going dead on the good model.
        obj.updateMatrixWorld(true);
        buildExternalLabels(ext);
        buildExternalMuscles(ext);
        muscles.visible = false;   // off until the user asks, as before
        labelsEnabled = true;

        controls.target.set(0, 0, 0);
        camera.position.set(0, 0.1, 2.7);
        controls.update();
        return true;
      } catch (e) {
        console.warn('External model failed to load; keeping the built-in skeleton.', e);
        return false;
      }
    },
  };
}
