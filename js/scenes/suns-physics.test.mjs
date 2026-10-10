// Zero-token tests: run with `node js/scenes/suns-physics.test.mjs`.
import {
  stepSuns, totalEnergy, EraTracker, figureEight, hierarchicalTriple, chaoticStart,
} from './suns-physics.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`ok   - ${name}`);
  else { console.error(`FAIL - ${name}`); failures++; }
}

// --- energy conservation over one figure-eight period ----------------------

{
  const dt = 0.01;
  const period = 6.32591398;
  const steps = Math.round(period / dt);
  let { suns } = figureEight();
  const e0 = totalEnergy(suns);
  for (let i = 0; i < steps; i++) suns = stepSuns(suns, dt);
  const e1 = totalEnergy(suns);
  const driftPct = Math.abs((e1 - e0) / e0) * 100;
  check(`figure-eight energy drift under 1% over one period (got ${driftPct.toFixed(4)}%)`, driftPct < 1);

  // it's a closed choreography: after one full period each sun should be
  // back close to where it started, not just "energy happens to match"
  const moved = Math.hypot(suns[0].x - figureEight().suns[0].x, suns[0].z - figureEight().suns[0].z);
  check(`figure-eight body 0 returns close to start after one period (drift ${moved.toFixed(3)} units)`, moved < 0.25);
}

// --- energy conservation for the other presets (shorter runs) --------------

for (const [name, make] of [['hierarchical triple', hierarchicalTriple], ['chaotic start', chaoticStart]]) {
  const dt = 0.01, steps = 2000;
  let { suns } = make();
  const e0 = totalEnergy(suns);
  for (let i = 0; i < steps; i++) suns = stepSuns(suns, dt);
  const e1 = totalEnergy(suns);
  const driftPct = Math.abs((e1 - e0) / e0) * 100;
  check(`${name}: energy drift under 1% over 2000 steps (got ${driftPct.toFixed(4)}%)`, driftPct < 1);
}

// --- era classifier ----------------------------------------------------

{
  // a planet locked onto one sun, step after step, should read Stable
  const t = new EraTracker();
  let era;
  for (let i = 0; i < 200; i++) era = t.push(0);
  check('tight single-sun orbit classifies as Stable', t.era === 'stable' && era === true);
}

{
  // a dominant sun that keeps changing every step should read Chaotic
  const t = new EraTracker();
  for (let i = 0; i < 200; i++) t.push(i % 3);
  check('rapidly switching dominant sun classifies as Chaotic', t.era === 'chaotic');
}

{
  // hysteresis: a brief wobble after a long stable run shouldn't immediately
  // flip the era back to chaotic
  const t = new EraTracker();
  for (let i = 0; i < 150; i++) t.push(0);
  check('stays Stable mid-run', t.era === 'stable');
  for (let i = 0; i < 5; i++) t.push(1);
  check('a brief wobble does not instantly flip to Chaotic', t.era === 'stable');
}

// --- preset shape --------------------------------------------------------

for (const [name, make] of Object.entries({ figureEight, hierarchicalTriple, chaoticStart })) {
  const { suns, planet } = make();
  check(`${name}: has 3 suns`, suns.length === 3);
  check(`${name}: all suns have mass`, suns.every((s) => s.m > 0));
  check(`${name}: planet has a position and velocity`, Number.isFinite(planet.x) && Number.isFinite(planet.vx));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
}
