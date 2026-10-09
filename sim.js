/* Ant farm engine: Atta sexdens (leafcutter ant) in a 2D soil slab, like a glass ant farm.
   No DOM. Loaded by index.html as a plain script and by node for tests.
   1 cell = 1 mm. Time is real seconds; the UI decides how many to run per frame.
   Numbers marked EST are estimates; see SCIENCE.md for what is sourced and what is a guess. */
(function (root) {
'use strict';

const W = 1000, H = 860, SURFACE = 160;        // 1 m wide, 70 cm of soil, 16 cm of sky for the mound
const DT = 0.25, HOUR = 3600, DAY = 86400;     // sim seconds per tick
const AIR = 0, SOIL = 1, OPEN = 2, LOOSE = 3, GARDEN = 4, ROCK = 5;
const HARDNESS = [1.0, 1.8, 0.8];              // topsoil, clay, sand (EST, relative)
const DIG_S_PER_CELL = 5;                      // EST seconds to loosen 1 mm² of topsoil
const DEV_DAYS = 45;                           // EST egg -> adult worker
const LIFESPAN_DAYS = 120;                     // EST worker life
const AGENT_CAP = 900;                         // above this, one dot stands for several ants
const CASTES = {                               // body length mm, walk speed mm/s, soil per trip mm²
  queen: { len: 22, speed: 5, load: 8 },
  major: { len: 14, speed: 12, load: 6 },
  media: { len: 7, speed: 15, load: 4 },
  minor: { len: 4.5, speed: 10, load: 2 },
  minim: { len: 2.5, speed: 6, load: 1 },
};
const MOVING = { toWork: 1, carry: 1, dump: 1, home: 1, fOut: 1, fWalk: 1, fHome: 1, fIn: 1, toRest: 1 };
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const QUEUE = new Int32Array(W * H);

function Rng(seed) { this.s = seed | 0; }
Rng.prototype.next = function () {
  let t = (this.s = (this.s + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function waves(r, amp, n) {
  const ph = [], fr = [];
  for (let k = 0; k < n; k++) { ph.push(r.next() * 6.283); fr.push((1 + r.next() * 3) * (k + 1) * 6.283 / W); }
  const out = new Float32Array(W);
  for (let x = 0; x < W; x++) for (let k = 0; k < n; k++) out[x] += Math.sin(x * fr[k] + ph[k]) * amp / (k + 1);
  return out;
}

// Deterministic from the seed, so a save only needs the cells that changed.
function terrain(seed) {
  const r = new Rng(seed ^ 0x9e3779b9);
  const cell = new Uint8Array(W * H), layer = new Uint8Array(W * H), shade = new Uint8Array(W * H);
  const b1 = waves(r, 14, 4), b2 = waves(r, 20, 4), band = waves(r, 3, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = y - SURFACE;
    shade[i] = Math.max(0, Math.min(255, r.next() * 150 + 50 + 40 * Math.sin(d * 0.21 + band[x])));
    if (d < 0) continue;
    cell[i] = SOIL;
    layer[i] = d < 250 + b1[x] ? 0 : d < 520 + b2[x] ? 1 : 2;
  }
  for (let k = 0; k < 16; k++) {                 // stones the ants have to dig around
    const cx = 30 + r.next() * (W - 60), cy = SURFACE + 60 + r.next() * (H - SURFACE - 80);
    const rad = 5 + r.next() * 16, ph = r.next() * 6.28, m = rad * 1.3;
    for (let y = Math.floor(cy - m); y <= cy + m; y++) for (let x = Math.floor(cx - m); x <= cx + m; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const rr = rad * (1 + 0.25 * Math.sin(Math.atan2(y - cy, x - cx) * 3 + ph));
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) cell[y * W + x] = ROCK;
    }
  }
  return { cell, layer, shade };
}

function field() { return { d: new Int32Array(W * H).fill(-1), seen: new Int32Array(0) }; }

function rle(arr) {
  const out = []; let v = arr[0], n = 0;
  for (let i = 0; i < arr.length; i++) { if (arr[i] === v) n++; else { out.push(v, n); v = arr[i]; n = 1; } }
  out.push(v, n); return out;
}
function unrle(r, T) {
  const a = new T(W * H); let p = 0;
  for (let k = 0; k < r.length; k += 2) { a.fill(r[k], p, p + r[k + 1]); p += r[k + 1]; }
  return a;
}

class Sim {
  constructor(seed, restoring) {
    this.seed = seed | 0;
    const tr = terrain(this.seed);
    this.cell = tr.cell; this.layer = tr.layer; this.shade = tr.shade;
    this.target = new Int16Array(W * H);       // id of the project that wants this cell dug
    this.chamberOf = new Int16Array(W * H);    // chamber id + 1, 0 = not in a chamber
    this.colTop = new Int16Array(W);           // first non-air row per column (the surface)
    for (let x = 0; x < W; x++) this.fixCol(x);
    this.fields = { work: field(), exit: field(), garden: field() };
    this.entrances = [];
    this.workDirty = this.navDirty = true; this.lastWork = this.lastNav = -1e9;
    this.active = 1;
    if (restoring) return;
    this.rng = new Rng(this.seed);
    this.t = 7 * HOUR; this.nextHour = 8 * HOUR; this.nextDay = DAY;
    this.projects = {}; this.nextProj = 1; this.targetCount = 0;
    this.chambers = []; this.agents = []; this.nextAgent = 1;
    this.roles = { dig: 0, forage: 0, rest: 0, queen: 0 };
    this.stats = { dug: 0, dumped: 0, packed: 0, leaves: 0, garden: 0 };
    this.openCells = 0;
    this.col = {
      phase: 'landing', workers: 0, brood: new Array(DEV_DAYS).fill(0), open: false,
      gardenTarget: 30, scale: 1, trail: this.rng.next() < 0.5 ? 0 : W - 1,
      plug: [], shaftCells: [], firstWorkerDay: -1, queenChamber: -1,
    };
    this.log = [];
    const q = this.spawn('queen', 300 + Math.floor(this.rng.next() * 400), SURFACE - 1, true);
    q.state = 'land'; q.wake = this.t + 120;
    this.note('A newly mated Atta sexdens queen lands after her nuptial flight and sheds her wings.');
  }

  // ---------- grid ----------
  passable(i) { const c = this.cell[i]; return c === OPEN || c === GARDEN; }
  cellAt(x, y) { return x < 0 || x >= W || y < 0 || y >= H ? ROCK : this.cell[y * W + x]; }
  fixCol(x) {
    let y = 0; while (y < H - 1 && this.cell[y * W + x] === AIR) y++;
    if (this.colTop[x] !== y) { this.colTop[x] = y; this.navDirty = true; }
  }
  isEntrance(x) { return this.cell[this.colTop[x] * W + x] === OPEN; }
  setCell(i, v) {
    const old = this.cell[i]; if (old === v) return;
    const wasP = old === OPEN || old === GARDEN, isP = v === OPEN || v === GARDEN;
    this.cell[i] = v;
    if (old === GARDEN) this.stats.garden--;
    if (v === GARDEN) this.stats.garden++;
    if (wasP !== isP) { this.openCells += isP ? 1 : -1; this.navDirty = this.workDirty = true; }
    const x = i % W, y = (i - x) / W;
    if (y <= this.colTop[x] + 1) this.fixCol(x);
  }
  digCell(i) {
    const p = this.projects[this.target[i]];
    this.target[i] = 0; this.targetCount--;
    this.setCell(i, OPEN); this.stats.dug++;
    if (p) { p.remaining--; p.last = this.t; if (p.remaining <= 0) this.projectDone(p); }
  }
  // Excavated soil rolls downhill until the slope is at most one cell per column (~45°, EST angle of repose).
  deposit(x, n, lay) {
    for (let s = 1; s < 40 && this.isEntrance(x); s++) x += x > W / 2 ? -1 : 1;   // never bury an entrance
    for (let g = 0; g < n; g++) {
      let c = x;
      for (let hop = 0; hop < 300; hop++) {
        const l = c - 1, r = c + 1;
        const okL = l > 1 && this.colTop[l] > this.colTop[c] && !this.isEntrance(l);
        const okR = r < W - 2 && this.colTop[r] > this.colTop[c] && !this.isEntrance(r);
        if (okL && okR) c = this.colTop[l] === this.colTop[r] ? (this.rng.next() < 0.5 ? l : r) : this.colTop[l] > this.colTop[r] ? l : r;
        else if (okL) c = l; else if (okR) c = r; else break;
      }
      const y = this.colTop[c] - 1; if (y < 5) continue;
      const i = y * W + c; this.cell[i] = LOOSE; this.layer[i] = lay; this.colTop[c] = y;
    }
  }

  // ---------- navigation fields (BFS distance through open tunnels) ----------
  bfs(f, sources) {
    const d = f.d; for (let k = 0; k < f.seen.length; k++) d[f.seen[k]] = -1;
    let head = 0, tail = 0;
    for (const i of sources) if (d[i] < 0) { d[i] = 0; QUEUE[tail++] = i; }
    while (head < tail) {
      const i = QUEUE[head++], x = i % W, nd = d[i] + 1;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], j = i + DX[k] + DY[k] * W;
        if (nx < 0 || nx >= W || j < 0 || j >= W * H || d[j] >= 0 || !this.passable(j)) continue;
        d[j] = nd; QUEUE[tail++] = j;
      }
    }
    f.seen = QUEUE.slice(0, tail);
  }
  updateFields(force) {
    if (this.navDirty && (force || this.t - this.lastNav >= 30)) {
      this.navDirty = false; this.lastNav = this.t;
      this.entrances = []; const ex = [];
      for (let x = 0; x < W; x++) if (this.isEntrance(x)) { ex.push(this.colTop[x] * W + x); this.entrances.push(x); }
      this.bfs(this.fields.exit, ex);
      const gs = [];
      for (const ch of this.chambers) for (const i of ch.cells) if (this.passable(i)) gs.push(i);
      this.bfs(this.fields.garden, gs);
    }
    if (this.workDirty && (force || this.t - this.lastWork >= 4)) {
      this.workDirty = false; this.lastWork = this.t;
      const src = [];
      for (const id in this.projects) {
        const p = this.projects[id]; if (p.remaining <= 0) continue;
        for (const i of p.cells) {
          if (this.target[i] !== p.id) continue;
          for (let k = 0; k < 8; k++) { const j = i + DX[k] + DY[k] * W; if (j >= 0 && j < W * H && this.passable(j)) src.push(j); }
        }
      }
      this.bfs(this.fields.work, src);
    }
  }
  entranceCount() {
    let n = 0; for (let k = 0; k < this.entrances.length; k++) if (k === 0 || this.entrances[k] - this.entrances[k - 1] > 2) n++;
    return n;
  }

  // ---------- blueprints ----------
  disk(cx, cy, r, out) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = y * W + x, c = this.cell[i];
      if ((c === SOIL || c === LOOSE) && !this.target[i]) { this.target[i] = -1; out.push(i); }
    }
  }
  unmark(cells) { for (const i of cells) if (this.target[i] === -1) this.target[i] = 0; }
  // A meandering tunnel: correlated random walk pulled toward a preferred heading, steering around stones.
  carve(x, y, h, len, width, pull, noise, minY, toAir) {
    const cells = [], r = width / 2; let reached = false;
    for (let s = 0; s < len; s++) {
      h += (this.rng.next() - 0.5) * noise;
      h += Math.atan2(Math.sin(pull - h), Math.cos(pull - h)) * 0.06;
      if (this.cellAt(Math.round(x + Math.cos(h) * (r + 3)), Math.round(y + Math.sin(h) * (r + 3))) === ROCK)
        h += this.rng.next() < 0.5 ? -0.8 : 0.8;
      x += Math.cos(h); y += Math.sin(h);
      if (x < 10 || x > W - 10) { h = Math.PI - h; x = Math.max(10, Math.min(W - 10, x)); }
      if (y > H - 12) break;
      if (y < minY) y = minY;
      this.disk(x, y, r, cells);
      if (toAir && y - r <= this.colTop[Math.round(x)]) { reached = true; break; }
    }
    return { cells, x, y, reached };
  }
  chamberCells(ch, rx, ry) {          // dome roof, flat floor (EST shape)
    const out = [];
    for (let y = Math.floor(ch.cy - ry * 1.1); y <= ch.cy + ry; y++) for (let x = Math.floor(ch.cx - rx * 1.1); x <= ch.cx + rx * 1.1; x++) {
      if (x < 0 || x >= W || y < SURFACE + 4 || y >= H) continue;
      const dx = x - ch.cx, dy = y - ch.cy;
      if (dy > ry * 0.55) continue;
      const k = 1 + 0.08 * Math.sin(Math.atan2(dy, dx) * 5 + ch.ph);
      if ((dx / (rx * k)) ** 2 + (dy / (ry * k)) ** 2 > 1) continue;
      const i = y * W + x, c = this.cell[i];
      if (c === ROCK) continue;
      if (!this.chamberOf[i]) { this.chamberOf[i] = ch.id + 1; ch.cells.push(i); }
      if ((c === SOIL || c === LOOSE) && !this.target[i]) { this.target[i] = -1; out.push(i); }
    }
    return out;
  }
  chamberFits(cx, cy, rx, ry, self) {
    if (cx - rx < 6 || cx + rx > W - 6 || cy + ry > H - 10 || cy - ry < SURFACE + 25) return false;
    for (const ch of this.chambers) {
      if (ch.id === self) continue;
      const dx = (cx - ch.cx) / (rx + ch.rx + 14), dy = (cy - ch.cy) / (ry + ch.ry + 14);
      if (dx * dx + dy * dy < 1) return false;
    }
    return true;
  }
  addProject(type, cells) {
    const id = this.nextProj++;
    const p = { id, type, cells, remaining: cells.length, total: cells.length, last: this.t, next: null, chamber: -1, done: false };
    for (const i of cells) this.target[i] = id;
    this.projects[id] = p; this.targetCount += cells.length;
    this.workDirty = true; this.lastWork = -1e9;
    return p;
  }
  addChamber(cx, cy, rx, ry, founding) {
    const ch = { id: this.chambers.length, cx, cy, rx, ry, cells: [], garden: 0, ph: this.rng.next() * 6.28 };
    this.chambers.push(ch);
    const p = this.addProject(founding ? 'founding' : 'chamber', this.chamberCells(ch, rx, ry));
    p.chamber = ch.id; this.navDirty = true;
    return ch;
  }
  cancel(p) {
    for (const i of p.cells) if (this.target[i] === p.id) { this.target[i] = 0; this.targetCount--; }
    delete this.projects[p.id]; this.workDirty = true;
  }
  projectDone(p) {
    if (p.done) return;
    p.done = true; delete this.projects[p.id];
    const c = this.col, cm = y => ((y - SURFACE) / 10).toFixed(0);
    if (p.next) this.addChamber(p.next.cx, p.next.cy, p.next.rx, p.next.ry, p.type === 'shaft');
    if (p.type === 'shaft') this.note(`Shaft finished, ${cm(p.next.cy)} cm deep. She hollows out a chamber at the bottom.`);
    else if (p.type === 'founding') { c.queenChamber = p.chamber; this.note('The founding chamber is done, about 3.5 cm across.'); }
    else if (p.type === 'chamber') this.note(`New chamber finished at ${cm(this.chambers[p.chamber].cy)} cm depth (chamber #${this.chambers.length}).`);
    else if (p.type === 'entrance') {
      // The mound may have grown over the planned exit while they dug: keep going up until daylight.
      let open = false;
      for (let x = Math.max(0, p.end.x - 6); x <= Math.min(W - 1, p.end.x + 6); x++) if (this.isEntrance(x)) open = true;
      if (open) this.note('A new entrance breaks through the surface.');
      else {
        const path = this.carve(p.end.x, p.end.y, -Math.PI / 2, 300, 7, -Math.PI / 2, 0.1, 0, true);
        this.addProject('entrance', path.cells).end = { x: Math.round(path.x), y: path.y };
      }
    }
    else if (p.type === 'reopen') { c.phase = 'open'; c.open = true; this.note('Workers break through the plug. The nest is open and foraging begins.'); }
  }

  // ---------- colony ----------
  note(msg) { this.log.push({ t: this.t, msg }); if (this.log.length > 300) this.log.shift(); }
  spawn(caste, x, y, surf) {
    const a = { id: this.nextAgent++, caste, x, y, px: x, py: y, surf, state: 'rest', role: null, wake: 0, acc: 0,
      load: 0, loadLayer: 0, leaf: false, hx: 1, hy: 0, goal: 0, patience: 0, after: null };
    this.agents.push(a); return a;
  }
  setRole(a, role) { if (a.role) this.roles[a.role]--; a.role = role; if (role) this.roles[role]++; }
  loadFor(a) { return Math.min(40, Math.max(1, Math.round(CASTES[a.caste].load * (a.caste === 'queen' ? 1 : this.col.scale)))); }
  pickCaste() {   // young colonies make only small workers; size range widens as the colony grows (EST thresholds)
    const n = this.col.workers, r = this.rng.next();
    if (n < 60) return r < 0.6 ? 'minim' : 'minor';
    if (n < 1500) return r < 0.35 ? 'minim' : r < 0.65 ? 'minor' : 'media';
    return r < 0.3 ? 'minim' : r < 0.55 ? 'minor' : r < 0.95 ? 'media' : 'major';
  }
  startFounding(q) {
    const c = this.col; c.phase = 'digging';
    const path = this.carve(q.x, SURFACE, Math.PI / 2, 170 + this.rng.next() * 60, 10, Math.PI / 2, 0.12, 0, false);
    c.shaftCells = path.cells.slice();
    const p = this.addProject('shaft', path.cells);
    p.next = { cx: path.x, cy: path.y + 8, rx: 17, ry: 11 };
    this.note('She starts digging a narrow vertical shaft.');
    this.chooseTask(q);
  }
  sealNest(q) {
    const c = this.col, plug = [];
    for (const i of c.shaftCells) {
      const y = (i / W) | 0;
      if (y >= SURFACE + 4 && y < SURFACE + 24 && this.cell[i] === OPEN) { this.setCell(i, LOOSE); this.layer[i] = 0; plug.push(i); }
    }
    c.plug = plug; c.phase = 'claustral';
    this.growGarden(this.chambers[c.queenChamber], 6);
    this.note("She plugs the shaft from inside and seeds a fungus garden from the pellet she carried from her mother's nest.");
    q.state = 'rest'; q.wake = this.t + 6 * HOUR;
  }
  growGarden(ch, n) {    // fungus fills a chamber from the floor up, to ~85%
    if (!ch) return 0;
    const cap = ch.cells.length * 0.85;
    for (let k = 0; k < n; k++) {
      if (ch.garden >= cap) return k;
      let best = -1, by = -1;
      for (let s = 0; s < 24; s++) {
        const i = ch.cells[(this.rng.next() * ch.cells.length) | 0];
        if (this.cell[i] !== OPEN || this.cell[i + W] === OPEN) continue;
        const y = (i / W) | 0; if (y > by) { by = y; best = i; }
      }
      if (best < 0) return k;
      this.setCell(best, GARDEN); ch.garden++;
    }
    return n;
  }
  decayGarden(n) {       // spent fungus is removed as refuse
    for (let k = 0; k < n; k++) {
      const ch = this.chambers[(this.rng.next() * this.chambers.length) | 0];
      if (!ch || !ch.garden) continue;
      for (let s = 0; s < 30; s++) {
        const i = ch.cells[(this.rng.next() * ch.cells.length) | 0];
        if (this.cell[i] === GARDEN) { this.setCell(i, OPEN); ch.garden--; break; }
      }
    }
  }
  syncAgents() {
    const c = this.col, want = Math.min(Math.round(c.workers), AGENT_CAP), ch = this.chambers[c.queenChamber];
    let have = this.agents.length - 1;
    while (have < want && ch) {
      let i = -1;
      for (let s = 0; s < 40 && i < 0; s++) { const j = ch.cells[(this.rng.next() * ch.cells.length) | 0]; if (this.passable(j)) i = j; }
      if (i < 0) break;
      const a = this.spawn(this.pickCaste(), i % W, (i / W) | 0, false);
      a.state = 'rest'; a.wake = this.t + this.rng.next() * HOUR; this.setRole(a, 'rest'); have++;
    }
    while (have > want) {
      const a = this.agents.pop();
      if (a.caste === 'queen') { this.agents.unshift(a); continue; }
      this.stats.packed += a.load; this.setRole(a, null); have--;
    }
    c.scale = Math.max(1, c.workers / Math.max(1, have));
  }
  daily() {
    const c = this.col, day = Math.floor(this.t / DAY), k = day % DEV_DAYS;
    const ecl = c.brood[k];
    let eggs = 0;
    if (c.phase === 'claustral' || c.phase === 'opening' || c.phase === 'open') {
      const food = c.open ? Math.max(0.2, Math.min(1, this.stats.garden / c.gardenTarget)) : 1;
      eggs = Math.min(20000, 2 + 0.05 * c.workers) * food;     // EST laying rate
    }
    c.brood[k] = eggs;
    c.workers = c.workers * (1 - 1 / LIFESPAN_DAYS) + ecl;
    if (ecl > 0.5 && c.firstWorkerDay < 0) { c.firstWorkerDay = day; this.note('The first workers eclose: tiny minims that tend the fungus.'); }
    if (!c.open) { const ch = this.chambers[c.queenChamber]; if (ch && ch.garden < 20 + c.workers) this.growGarden(ch, 2); }
    else this.decayGarden(Math.floor(this.stats.garden * 0.08));   // EST: fungus eaten by brood, spent garden removed
    if (c.phase === 'claustral' && c.workers >= 25) {
      c.phase = 'opening';
      this.addProject('reopen', c.plug.filter(i => this.cell[i] === LOOSE && !this.target[i]));
      this.note('Workers start digging up through the plug.');
    }
    this.syncAgents();
  }
  hourly() {
    for (const id in this.projects) {
      const p = this.projects[id];
      if (p.remaining <= 0) this.projectDone(p);
      else if (this.t - p.last > 3 * DAY && p.type !== 'reopen') this.cancel(p);   // blocked by stone: give up
    }
    if (this.col.open) this.plan();
  }
  // Nest volume tracks colony size (excavation is demand-driven), with spare room for the fungus.
  plan() {
    const c = this.col, N = c.workers;
    c.gardenTarget = 40 + 8 * N;
    let active = 0, ent = false;
    for (const id in this.projects) { active++; if (this.projects[id].type === 'entrance') ent = true; }
    if (!ent && this.entranceCount() * 300 < N && this.newEntrance()) return;
    // Dig when the fungus is running out of chamber room, or the colony is short of space overall.
    const room = this.chambers.reduce((n, ch) => n + ch.cells.length * 0.85, 0);
    const want = 1.25 * c.gardenTarget + 15 * N + 2500;
    if ((room < 1.2 * c.gardenTarget || this.openCells < want) && active < 1 + Math.floor(N / 500)) this.newDigProject();
  }
  newDigProject() {
    const N = this.col.workers, chs = this.chambers, rMax = 18 + 12 * Math.log10(Math.max(10, N));
    const small = chs.filter(ch => ch.rx + 5 <= rMax);
    if (small.length && this.rng.next() < 0.55) {
      const ch = small[(this.rng.next() * small.length) | 0];
      const rx = ch.rx + 4 + this.rng.next() * 4, ry = Math.min(rx * 0.62, ch.ry + 2 + this.rng.next() * 3);
      if (this.chamberFits(ch.cx, ch.cy, rx, ry, ch.id)) {
        ch.rx = rx; ch.ry = ry;
        this.addProject('enlarge', this.chamberCells(ch, rx, ry)).chamber = ch.id;
        return true;
      }
    }
    for (let tries = 0; tries < 8; tries++) {
      const a = chs[(this.rng.next() * chs.length) | 0], b = chs[(this.rng.next() * chs.length) | 0];
      const from = a.cy > b.cy ? a : b;                         // lean toward deeper chambers
      const ang = Math.PI * (0.12 + this.rng.next() * 0.76);   // downward-ish
      const path = this.carve(from.cx, from.cy, ang, from.rx + 50 + this.rng.next() * 90, 6, ang, 0.25, SURFACE + 30, false);
      const rx = 13 + this.rng.next() * 8, ry = 8 + this.rng.next() * 4;
      const cx = path.x + Math.cos(ang) * rx * 0.6, cy = path.y + ry * 0.5;
      if (!this.chamberFits(cx, cy, rx, ry, -1)) { this.unmark(path.cells); continue; }
      this.addProject('tunnel', path.cells).next = { cx, cy, rx, ry };
      return true;
    }
    return false;
  }
  newEntrance() {
    const top = this.chambers.slice().sort((a, b) => a.cy - b.cy).slice(0, 3);
    if (!top.length) return false;
    const from = top[(this.rng.next() * top.length) | 0];
    const ang = -Math.PI / 2 + (this.rng.next() - 0.5) * 1.4;
    const path = this.carve(from.cx, from.cy, ang, 450, 7, ang, 0.2, 0, true);
    if (!path.reached || Math.abs(path.x - from.cx) > 250) { this.unmark(path.cells); return false; }
    this.addProject('entrance', path.cells).end = { x: Math.round(path.x), y: path.y };
    return true;
  }

  // ---------- ant behaviour ----------
  chooseTask(a) {
    a.leaf = false;
    if (a.caste === 'queen') return this.queenTask(a);
    const n = this.agents.length, c = this.col;
    if (a.caste !== 'minim' && this.targetCount > 0 && this.roles.dig < Math.max(1, Math.min(n * 0.4, this.targetCount / 6))) {
      this.setRole(a, 'dig'); a.state = 'toWork'; a.patience = 4000; return;
    }
    const forager = a.caste === 'media' || a.caste === 'major' || (a.caste === 'minor' && c.workers < 200);
    // Recruitment scales with how short the garden is, so traffic is a steady stream rather than a stampede.
    const hunger = Math.max(0.05, Math.min(1, (c.gardenTarget * 1.15 - this.stats.garden) / (c.gardenTarget * 0.3)));
    if (c.open && forager && this.rng.next() < hunger && this.roles.forage < n * 0.35) {
      this.setRole(a, 'forage'); a.state = 'fOut'; a.patience = 4000; return;
    }
    this.setRole(a, 'rest'); a.state = 'toRest'; a.patience = 3000;
  }
  queenTask(q) {
    this.setRole(q, 'queen'); q.patience = 1e9;
    if (this.col.phase === 'digging') {
      if (this.targetCount > 0) q.state = 'toWork';
      else { q.state = 'toRest'; q.after = 'seal'; }
      return;
    }
    q.state = 'toRest';
  }
  arriveRest(a) {
    if (a.after === 'seal') { a.after = null; a.state = 'seal'; a.wake = this.t + HOUR; return; }
    a.state = 'rest';
    a.wake = this.t + (a.caste === 'queen' ? 6 * HOUR : (20 + this.rng.next() * 70) * 60);   // most workers are idle most of the time
  }
  wakeUp(a) {
    switch (a.state) {
      case 'land': this.startFounding(a); break;
      case 'dig': this.finishDig(a); break;
      case 'seal': this.sealNest(a); break;
      case 'away': a.state = 'fHome'; a.leaf = true; a.surf = true; a.x = a.goal; a.y = this.colTop[a.x] - 1; a.patience = 6000; break;
      default: this.chooseTask(a);
    }
  }
  adjTarget(a) {
    for (let k = 0; k < 8; k++) {
      const nx = a.x + DX[k], ny = a.y + DY[k];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.target[ny * W + nx] > 0) return ny * W + nx;
    }
    return -1;
  }
  finishDig(a) {
    const want = this.loadFor(a), start = a.goal, got = [];
    if (this.target[start] > 0) {
      const list = [start], seen = new Set(list);
      for (let h = 0; h < list.length && got.length < want; h++) {
        const i = list[h]; got.push(i);
        for (let k = 0; k < 4; k++) {
          const j = i + DX[k] + DY[k] * W;
          if (j >= 0 && j < W * H && !seen.has(j) && this.target[j] > 0) { seen.add(j); list.push(j); }
        }
      }
    }
    if (!got.length) { a.state = 'toWork'; return; }
    a.loadLayer = this.layer[start];
    for (const i of got) this.digCell(i);
    a.load = got.length; a.state = 'carry'; a.patience = 6000;
  }
  stepField(a, f) {
    let best = -1, bd = 1e9, nOpen = 0, pick = -1;
    for (let k = 0; k < 8; k++) {
      const nx = a.x + DX[k], ny = a.y + DY[k];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = ny * W + nx; if (!this.passable(j)) continue;
      if (this.rng.next() * ++nOpen < 1) pick = k;
      const dj = f.d[j]; if (dj >= 0 && dj < bd) { bd = dj; best = k; }
    }
    const k = best < 0 || this.rng.next() < 0.1 ? pick : best;
    if (k < 0) return;
    a.x += DX[k]; a.y += DY[k]; a.hx = DX[k]; a.hy = DY[k];
  }
  surfWalk(a, gx) {
    gx = Math.max(0, Math.min(W - 1, gx));
    if (a.x !== gx) { const s = gx > a.x ? 1 : -1; a.x += s; a.hx = s; a.hy = 0; }
    a.y = this.colTop[a.x] - 1;
    return a.x === gx;
  }
  surfToEntrance(a, next) {
    if (!this.entrances.length) { this.surfWalk(a, a.x + (this.rng.next() < 0.5 ? -1 : 1)); return false; }
    let best = this.entrances[0];
    for (const x of this.entrances) if (Math.abs(x - a.x) < Math.abs(best - a.x)) best = x;
    if (!this.surfWalk(a, best)) return false;
    if (!this.isEntrance(a.x)) { this.navDirty = true; return false; }   // stale list; wait for refresh
    a.surf = false; a.y = this.colTop[a.x];
    if (next) a.state = next; else this.chooseTask(a);
    return !MOVING[a.state];
  }
  exitNest(a) { a.surf = true; a.y = this.colTop[a.x] - 1; }
  dumpSpot(x) {
    const q = this.col.phase === 'digging', d = q ? 15 + this.rng.next() * 35 : 20 + this.rng.next() * 220;
    return Math.round(Math.max(3, Math.min(W - 4, x + (this.rng.next() < 0.5 ? -d : d))));
  }
  deliverLeaf(a) {
    const n = Math.max(1, Math.round(2 * this.col.scale)), id = this.chamberOf[a.y * W + a.x] - 1;
    let placed = id >= 0 ? this.growGarden(this.chambers[id], n) : 0;
    for (let t = 0; placed < n && t < 4; t++) placed += this.growGarden(this.chambers[(this.rng.next() * this.chambers.length) | 0], n - placed);
    this.stats.leaves++; this.chooseTask(a);
  }
  move(a) {
    if (--a.patience < 0) {               // lost: drop what it carries and start over
      this.stats.packed += a.load; a.load = 0; a.leaf = false;
      if (a.surf) { a.state = 'home'; a.patience = 5000; return false; }
      this.chooseTask(a); return true;
    }
    const i = a.y * W + a.x;
    switch (a.state) {
      case 'toWork': {
        if (this.targetCount === 0) { this.chooseTask(a); return true; }
        const j = this.adjTarget(a);
        if (j >= 0) { a.goal = j; a.state = 'dig'; a.wake = this.t + DIG_S_PER_CELL * HARDNESS[this.layer[j]] * this.loadFor(a); return true; }
        if (a.surf) return this.surfToEntrance(a, 'toWork');
        this.stepField(a, this.fields.work); return false;
      }
      case 'carry': {
        if (a.surf) { a.state = 'dump'; a.goal = this.dumpSpot(a.x); return false; }
        const d = this.fields.exit.d[i];
        if (d < 0 && this.col.phase !== 'digging' && !this.col.open) {   // sealed nest: pack soil into the walls
          this.stats.packed += a.load; a.load = 0; this.chooseTask(a); return true;
        }
        if (d === 0) { this.exitNest(a); return false; }
        this.stepField(a, this.fields.exit); return false;
      }
      case 'dump':
        if (this.surfWalk(a, a.goal)) { this.deposit(a.x, a.load, a.loadLayer); this.stats.dumped += a.load; a.load = 0; a.state = 'home'; }
        return false;
      case 'home': return this.surfToEntrance(a, null);
      case 'fOut': {
        if (a.surf) { a.state = 'fWalk'; a.goal = this.rng.next() < 0.8 ? this.col.trail : W - 1 - this.col.trail; return false; }
        if (this.fields.exit.d[i] === 0) this.exitNest(a); else this.stepField(a, this.fields.exit);
        return false;
      }
      case 'fWalk':
        if (this.surfWalk(a, a.goal)) { a.state = 'away'; a.wake = this.t + (20 + this.rng.next() * 50) * 60; return true; }
        return false;
      case 'fHome': return this.surfToEntrance(a, 'fIn');
      case 'fIn': case 'toRest': {
        if (a.surf) return this.surfToEntrance(a, a.state);
        if (this.fields.garden.d[i] === 0 || !this.chambers.length) {
          if (a.state === 'fIn') this.deliverLeaf(a); else this.arriveRest(a);
          return !MOVING[a.state];
        }
        this.stepField(a, this.fields.garden); return false;
      }
    }
    return true;
  }
  updateAgent(a) {
    if (!MOVING[a.state]) { if (this.t >= a.wake) this.wakeUp(a); return !!MOVING[a.state]; }
    a.px = a.x; a.py = a.y;
    a.acc += CASTES[a.caste].speed * DT;
    while (a.acc >= 1) { a.acc -= 1; if (this.move(a)) { a.acc = 0; break; } }
    return !!MOVING[a.state];
  }

  // ---------- clock ----------
  tick() {
    this.t += DT;
    if (this.t >= this.nextDay) { this.nextDay += DAY; this.daily(); }
    if (this.t >= this.nextHour) { this.nextHour += HOUR; this.hourly(); }
    this.updateFields(false);
    let act = 0;
    for (let k = 0; k < this.agents.length; k++) if (this.updateAgent(this.agents[k])) act++;
    this.active = act;
  }
  // Runs up to `seconds` of sim time, or until budgetMs of wall time is spent. When every ant is
  // resting, nothing can change before the next wake-up, so the clock jumps straight there.
  advance(seconds, budgetMs) {
    const end = this.t + seconds, start = Date.now(); let n = 0;
    while (this.t + DT <= end + 1e-9) {
      if (this.active === 0) {
        let next = Math.min(end, this.nextHour, this.nextDay);
        for (const a of this.agents) if (a.wake < next) next = a.wake;
        if (next - this.t > DT) this.t = next - DT;
      }
      this.tick();
      if ((++n & 31) === 0 && Date.now() - start > budgetMs) break;
    }
  }

  // ---------- save ----------
  toJSON() {
    return {
      v: 1, seed: this.seed, t: this.t, nextHour: this.nextHour, nextDay: this.nextDay, rng: this.rng.s,
      cell: rle(this.cell), layer: rle(this.layer), target: rle(this.target), chamberOf: rle(this.chamberOf),
      projects: this.projects, nextProj: this.nextProj, targetCount: this.targetCount, chambers: this.chambers,
      agents: this.agents, nextAgent: this.nextAgent, roles: this.roles, stats: this.stats, col: this.col,
      log: this.log, openCells: this.openCells,
    };
  }
  static fromJSON(o) {
    const s = new Sim(o.seed, true);
    s.cell = unrle(o.cell, Uint8Array); s.layer = unrle(o.layer, Uint8Array);
    s.target = unrle(o.target, Int16Array); s.chamberOf = unrle(o.chamberOf, Int16Array);
    for (const k of ['t', 'nextHour', 'nextDay', 'projects', 'nextProj', 'targetCount', 'chambers', 'agents',
      'nextAgent', 'roles', 'stats', 'col', 'log', 'openCells']) s[k] = o[k];
    s.rng = new Rng(o.rng);
    for (let x = 0; x < W; x++) s.fixCol(x);
    s.updateFields(true);
    return s;
  }
}

const api = { Sim, W, H, SURFACE, DT, HOUR, DAY, CASTES, AIR, SOIL, OPEN, LOOSE, GARDEN, ROCK, AGENT_CAP };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AntSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
