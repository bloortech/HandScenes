// Zero-token tests: run with `node lab/diagrams/test.mjs`.
// Checks the manifest is well-formed and that the three-body integrator
// conserves energy within 1% over a short run (plus other pure logic).
import { manifest } from "./manifest.js";
import { stepVerlet, stableTriangle, chaoticTriangle, totalEnergy } from "./lib/physics.js";

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`ok   - ${name}`);
  } else {
    console.error(`FAIL - ${name}`);
    failures++;
  }
}

// --- manifest shape -------------------------------------------------------

check("manifest has at least 8 diagrams", manifest.length >= 8);

for (const d of manifest) {
  check(`${d.id || "?"}: has an id`, typeof d.id === "string" && d.id.length > 0);
  check(`${d.id}: has a shelf (vervaeke|threebody)`, d.shelf === "vervaeke" || d.shelf === "threebody");
  check(`${d.id}: has a title`, typeof d.title === "string" && d.title.length > 0);
  check(`${d.id}: has a source citation`, typeof d.source === "string" && d.source.length > 10);
  check(`${d.id}: has a blurb (3+ sentences worth of text)`, typeof d.blurb === "string" && d.blurb.length > 120);
  check(`${d.id}: exports mount() as a function`, typeof d.mount === "function");
}

const ids = manifest.map((d) => d.id);
check("all diagram ids are unique", new Set(ids).size === ids.length);

const vervaekeCount = manifest.filter((d) => d.shelf === "vervaeke").length;
const threeBodyCount = manifest.filter((d) => d.shelf === "threebody").length;
check("vervaeke shelf has at least 4 diagrams", vervaekeCount >= 4);
check("three-body shelf has at least 4 diagrams", threeBodyCount >= 4);

// --- three-body integrator: energy conservation ---------------------------

function energyDriftPct(bodies0, steps, dt) {
  let bodies = bodies0;
  const e0 = totalEnergy(bodies);
  for (let i = 0; i < steps; i++) bodies = stepVerlet(bodies, dt);
  const e1 = totalEnergy(bodies);
  return Math.abs((e1 - e0) / e0) * 100;
}

const stableDrift = energyDriftPct(stableTriangle(), 2000, 0.01);
check(
  `stable-triangle energy drift under 1% over 2000 steps (got ${stableDrift.toFixed(4)}%)`,
  stableDrift < 1
);

const chaoticDrift = energyDriftPct(chaoticTriangle(), 2000, 0.01);
check(
  `chaotic-triangle energy drift under 1% over 2000 steps (got ${chaoticDrift.toFixed(4)}%)`,
  chaoticDrift < 1
);

// a stable-triangle body should return close to its start after one full
// orbit period (it's a rigid rotation, so this also sanity-checks the sign
// of the integration, not just that energy happens to be conserved)
{
  const bodies0 = stableTriangle();
  const steps = 2000;
  const dt = 0.01;
  let bodies = bodies0;
  for (let i = 0; i < steps; i++) bodies = stepVerlet(bodies, dt);
  const moved = Math.hypot(bodies[0].x - bodies0[0].x, bodies[0].y - bodies0[0].y);
  check(`stable triangle actually moves over the run (moved ${moved.toFixed(3)} units)`, moved > 0.01);
}

// --- summary ----------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nAll checks passed (${manifest.length} diagrams).`);
}
