// Pure Newtonian gravity for the Three Suns scene. No DOM, no three.js, so
// this half can be unit-tested from Node (see suns-physics.test.mjs) and
// imported unchanged into the browser scene.
//
// Three suns (real mutual gravity, velocity-Verlet, softened so two suns
// never divide by zero) plus Trisolaris: a massless test-body planet that
// the suns pull around but that never pulls back.

export const G = 1;            // sim units, chosen so the presets look lively
const EPS2 = 1e-6;              // softening (added to r^2)

// ---- N-body gravity (the suns) -------------------------------------------

export function accelerations(bodies) {
  const n = bodies.length;
  const ax = new Array(n).fill(0), ay = new Array(n).fill(0), az = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dz = bodies[j].z - bodies[i].z;
      const r2 = dx * dx + dy * dy + dz * dz + EPS2;
      const f = G / (r2 * Math.sqrt(r2));
      ax[i] += f * dx * bodies[j].m; ay[i] += f * dy * bodies[j].m; az[i] += f * dz * bodies[j].m;
      ax[j] -= f * dx * bodies[i].m; ay[j] -= f * dy * bodies[i].m; az[j] -= f * dz * bodies[i].m;
    }
  }
  return { ax, ay, az };
}

// One velocity-Verlet step for the suns. Returns a NEW array (input untouched).
export function stepSuns(bodies, dt) {
  const n = bodies.length;
  const a0 = accelerations(bodies);
  const next = bodies.map((b, i) => ({
    ...b,
    x: b.x + b.vx * dt + 0.5 * a0.ax[i] * dt * dt,
    y: b.y + b.vy * dt + 0.5 * a0.ay[i] * dt * dt,
    z: b.z + b.vz * dt + 0.5 * a0.az[i] * dt * dt,
  }));
  const a1 = accelerations(next);
  for (let i = 0; i < n; i++) {
    next[i].vx = bodies[i].vx + 0.5 * (a0.ax[i] + a1.ax[i]) * dt;
    next[i].vy = bodies[i].vy + 0.5 * (a0.ay[i] + a1.ay[i]) * dt;
    next[i].vz = bodies[i].vz + 0.5 * (a0.az[i] + a1.az[i]) * dt;
  }
  return next;
}

export function totalEnergy(bodies) {
  let ke = 0, pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    ke += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - b.x, dy = bodies[j].y - b.y, dz = bodies[j].z - b.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + EPS2);
      pe -= (G * b.m * bodies[j].m) / r;
    }
  }
  return ke + pe;
}

// ---- the planet (a massless test body pulled by the suns) ---------------

// Acceleration on a point from the suns, plus each sun's individual
// contribution magnitude (used to decide which sun "dominates" right now).
export function accelOnPoint(p, suns) {
  let ax = 0, ay = 0, az = 0;
  const contrib = new Array(suns.length);
  for (let i = 0; i < suns.length; i++) {
    const s = suns[i];
    const dx = s.x - p.x, dy = s.y - p.y, dz = s.z - p.z;
    const r2 = dx * dx + dy * dy + dz * dz + EPS2;
    const f = G * s.m / (r2 * Math.sqrt(r2));
    const cax = f * dx, cay = f * dy, caz = f * dz;
    ax += cax; ay += cay; az += caz;
    contrib[i] = Math.hypot(cax, cay, caz);
  }
  return { ax, ay, az, contrib };
}

// Velocity-Verlet for the planet using the suns' positions before and after
// their own step (both already known by the time this is called).
export function stepPlanet(planet, sunsBefore, sunsAfter, dt) {
  const a0 = accelOnPoint(planet, sunsBefore);
  const next = {
    x: planet.x + planet.vx * dt + 0.5 * a0.ax * dt * dt,
    y: planet.y + planet.vy * dt + 0.5 * a0.ay * dt * dt,
    z: planet.z + planet.vz * dt + 0.5 * a0.az * dt * dt,
    vx: planet.vx, vy: planet.vy, vz: planet.vz,
  };
  const a1 = accelOnPoint(next, sunsAfter);
  next.vx = planet.vx + 0.5 * (a0.ax + a1.ax) * dt;
  next.vy = planet.vy + 0.5 * (a0.ay + a1.ay) * dt;
  next.vz = planet.vz + 0.5 * (a0.az + a1.az) * dt;
  let dominant = 0, best = -1;
  for (let i = 0; i < a1.contrib.length; i++) if (a1.contrib[i] > best) { best = a1.contrib[i]; dominant = i; }
  return { body: next, dominant };
}

// ---- era classifier --------------------------------------------------
// "Stable Era": one sun has dominated the planet's pull for most of a
// rolling window of recent physics steps. "Chaotic Era": no sun has, i.e.
// the dominant sun keeps changing. Schmitt-trigger thresholds (enter higher
// than exit) so it doesn't flicker right at the boundary.
export class EraTracker {
  constructor(windowSize = 180, enterFrac = 0.82, exitFrac = 0.55, minSamples = 30) {
    this.windowSize = windowSize;
    this.enterFrac = enterFrac;
    this.exitFrac = exitFrac;
    this.minSamples = Math.min(minSamples, windowSize);
    this.history = [];
    this.stable = false;
    this.dominant = null;
  }
  push(domIndex) {
    this.history.push(domIndex);
    if (this.history.length > this.windowSize) this.history.shift();
    if (this.history.length < this.minSamples) return this.stable;
    const counts = new Map();
    for (const d of this.history) counts.set(d, (counts.get(d) || 0) + 1);
    let best = -1, bestCount = 0;
    for (const [k, c] of counts) if (c > bestCount) { bestCount = c; best = k; }
    const frac = bestCount / this.history.length;
    if (!this.stable && frac >= this.enterFrac) { this.stable = true; this.dominant = best; }
    else if (this.stable && frac < this.exitFrac) { this.stable = false; }
    else if (this.stable) { this.dominant = best; }
    return this.stable;
  }
  get era() { return this.stable ? 'stable' : 'chaotic'; }
  reset() { this.history = []; this.stable = false; this.dominant = null; }
}

// ---- helpers ---------------------------------------------------------

// Shift to the zero-momentum, center-of-mass-at-origin frame, so the
// system doesn't drift off camera over time (guards against float drift
// too, not just picking nice initial conditions).
function centerFrame(bodies) {
  let M = 0, cx = 0, cy = 0, cz = 0, px = 0, py = 0, pz = 0;
  for (const b of bodies) {
    M += b.m; cx += b.m * b.x; cy += b.m * b.y; cz += b.m * b.z;
    px += b.m * b.vx; py += b.m * b.vy; pz += b.m * b.vz;
  }
  cx /= M; cy /= M; cz /= M; px /= M; py /= M; pz /= M;
  return bodies.map((b) => ({
    ...b, x: b.x - cx, y: b.y - cy, z: b.z - cz, vx: b.vx - px, vy: b.vy - py, vz: b.vz - pz,
  }));
}

// A small circular orbit around `sun`, offset along `axis` ('x' or 'z');
// used to start the planet close to one sun for a visibly stable orbit.
function orbitAround(sun, radius, axis = 'x') {
  const vCirc = Math.sqrt((G * sun.m) / radius);
  if (axis === 'x') {
    return { x: sun.x + radius, y: sun.y, z: sun.z, vx: sun.vx, vy: sun.vy, vz: sun.vz + vCirc };
  }
  return { x: sun.x, y: sun.y, z: sun.z + radius, vx: sun.vx + vCirc, vy: sun.vy, vz: sun.vz };
}

// ---- presets -----------------------------------------------------------

// The Chenciner-Montgomery figure-eight choreography: three equal masses
// chase each other around a single figure-8 curve forever. Real published
// initial conditions (G=1, m=1, period T ~= 6.3259).
export function figureEight() {
  const m = 1;
  const vx = 0.466203685, vz = 0.43236573;
  const suns = [
    { x: 0.97000436, y: 0, z: -0.24308753, vx, vy: 0, vz, m },
    { x: -0.97000436, y: 0, z: 0.24308753, vx, vy: 0, vz, m },
    { x: 0, y: 0, z: 0, vx: -2 * vx, vy: 0, vz: -2 * vz, m },
  ];
  // a close orbit around any single figure-8 body gets flung out fast (each
  // body swings through the shared centre at real speed), so the planet
  // instead circles the system's combined mass at a safer distance — close
  // enough that the suns' flyby still tosses it between eras, far enough
  // that it doesn't get ejected outright.
  const totalM = suns.reduce((s, b) => s + b.m, 0);
  const r = 4;
  const v = Math.sqrt((G * totalM) / r);
  const planet = { x: r, y: 0.1, z: 0, vx: 0, vy: 0, vz: v };
  return { suns: centerFrame(suns), planet };
}

// A hierarchical triple: two suns locked in a tight binary, a third far out
// orbiting the pair's combined mass. The planet circles the near binary
// member, so one sun dominates its sky almost all the time -> long Stable
// Eras, exactly as the book describes the rare calm stretches.
export function hierarchicalTriple() {
  const m = 1;
  const dAB = 1.3;   // inner (binary) separation
  const R = 11;      // outer separation: binary's COM <-> the far sun
  const r1 = R / 3, r2 = (2 * R) / 3;
  const vOuter = Math.sqrt((G * 3 * m) / R);
  const v1 = vOuter / 3, v2 = (2 * vOuter) / 3;
  const vInner = Math.sqrt((G * 2 * m) / dAB) / 2;

  const A = { x: -r1, y: 0, z: dAB / 2, vx: vInner, vy: 0, vz: v1, m };
  const B = { x: -r1, y: 0, z: -dAB / 2, vx: -vInner, vy: 0, vz: v1, m };
  const C = { x: r2, y: 0, z: 0, vx: 0, vy: 0, vz: -v2, m };

  const planet = orbitAround(A, 0.4, 'x');
  planet.y = 0.05;
  return { suns: centerFrame([A, B, C]), planet };
}

// A chaotic start: the same equal-mass equilateral triangle that rotates
// rigidly if left alone (see the Lagrange solution), but perturbed off that
// balance so it genuinely tumbles with no exact closed-form solution — the
// three-body problem as Liu Cixin's Trisolarans actually experience it. The
// planet starts right at the shared center, where no single sun dominates.
export function chaoticStart() {
  const m = 1;
  const r = 1;
  const vCirc = Math.sqrt(G * m / (Math.sqrt(3) * r));
  const angles = [90, 210, 330].map((d) => (d * Math.PI) / 180);
  const bumps = [0.22, -0.14, 0.09];
  const suns = angles.map((a, i) => {
    const px = r * Math.cos(a), pz = r * Math.sin(a);
    const vx = -vCirc * Math.sin(a), vz = vCirc * Math.cos(a);
    const bump = bumps[i];
    return { x: px + bump, y: 0, z: pz, vx, vy: 0, vz: vz * (1 + bump * 0.6), m };
  });
  const planet = { x: 0.05, y: 0.1, z: 0, vx: 0.15, vy: 0, vz: -0.1 };
  return { suns: centerFrame(suns), planet };
}

export const PRESETS = {
  figureEight: { label: 'Figure-8', make: figureEight },
  hierarchical: { label: 'Hierarchical', make: hierarchicalTriple },
  chaotic: { label: 'Chaotic', make: chaoticStart },
};
