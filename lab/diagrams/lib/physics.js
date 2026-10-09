// Pure gravitational physics for the three-body diagram. No DOM, no canvas,
// so it can be imported from Node for a test and from the browser for the sim.
// Velocity Verlet: exact for constant acceleration, cheap, and much better at
// conserving energy over many steps than plain Euler integration.

export const G = 1; // simulation units, not SI — chosen so the presets look lively on screen

export function accelerations(bodies, g = G) {
  const n = bodies.length;
  const ax = new Array(n).fill(0);
  const ay = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + 1e-6; // softened so two bodies never divide by zero
      const r = Math.sqrt(r2);
      const f = g / (r2 * r); // G * m / r^3, mass applied per-body below
      ax[i] += f * dx * bodies[j].m;
      ay[i] += f * dy * bodies[j].m;
      ax[j] -= f * dx * bodies[i].m;
      ay[j] -= f * dy * bodies[i].m;
    }
  }
  return { ax, ay };
}

// One velocity-Verlet step. Returns a NEW array of bodies (does not mutate input).
export function stepVerlet(bodies, dt, g = G) {
  const n = bodies.length;
  const { ax: ax0, ay: ay0 } = accelerations(bodies, g);
  const next = bodies.map((b, i) => ({
    ...b,
    x: b.x + b.vx * dt + 0.5 * ax0[i] * dt * dt,
    y: b.y + b.vy * dt + 0.5 * ay0[i] * dt * dt,
  }));
  const { ax: ax1, ay: ay1 } = accelerations(next, g);
  for (let i = 0; i < n; i++) {
    next[i].vx = bodies[i].vx + 0.5 * (ax0[i] + ax1[i]) * dt;
    next[i].vy = bodies[i].vy + 0.5 * (ay0[i] + ay1[i]) * dt;
  }
  return next;
}

export function totalEnergy(bodies, g = G) {
  let ke = 0;
  let pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    ke += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - b.x;
      const dy = bodies[j].y - b.y;
      const r = Math.sqrt(dx * dx + dy * dy + 1e-6);
      pe -= (g * b.m * bodies[j].m) / r;
    }
  }
  return ke + pe;
}

// A "stable era" preset: three equal masses at the corners of an equilateral
// triangle with velocities tuned for the Lagrange central-configuration
// solution, so the triangle rotates rigidly forever — Trisolaris's rare calm
// stretches, when all three suns line up predictably for a while.
export function stableTriangle() {
  const m = 1;
  const r = 1;
  const v = Math.sqrt(G * m / (Math.sqrt(3) * r)); // circular orbit speed for this configuration
  const angles = [90, 210, 330].map((d) => (d * Math.PI) / 180);
  return angles.map((a) => ({
    x: r * Math.cos(a),
    y: r * Math.sin(a),
    vx: -v * Math.sin(a),
    vy: v * Math.cos(a),
    m,
  }));
}

// A "chaotic era" preset: same three masses, nudged off the stable
// configuration. Three-body systems with no exact closed-form solution are
// exquisitely sensitive to initial conditions — this is the regime Trisolaris
// actually lives in, where the suns' combined pull is unpredictable game to game.
export function chaoticTriangle(seed = 0.18) {
  const base = stableTriangle();
  return base.map((b, i) => ({
    ...b,
    x: b.x + (i === 0 ? seed : -seed * 0.6),
    vy: b.vy * (1 + (i === 1 ? seed : -seed * 0.4)),
  }));
}
