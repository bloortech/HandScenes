/* Ant farm engine: Atta sexdens (leafcutter ant) in a 2D soil slab, like a glass ant farm.
   One colony, or two rival colonies competing for the same food plants.
   No DOM. Loaded by index.html as a plain script and by node for tests.
   1 cell = 1 mm. Time is real seconds; the UI decides how many to run per frame.
   Numbers marked EST are estimates; see SCIENCE.md for what is sourced and what is a guess. */
(function (root) {
'use strict';

const W = 1000, H = 860, SURFACE = 160;        // 1 m wide, 70 cm of soil, 16 cm of sky for mound and plants
const DT = 0.25, HOUR = 3600, DAY = 86400;     // sim seconds per tick
const AIR = 0, SOIL = 1, OPEN = 2, LOOSE = 3, GARDEN = 4, ROCK = 5;
const HARDNESS = [1.0, 1.8, 0.8];              // topsoil, clay, sand (EST, relative)
const DIG_S_PER_CELL = 5;                      // EST seconds to loosen 1 mm² of topsoil
const DEV_DAYS = 45;                           // EST egg -> adult worker
const LIFESPAN_DAYS = 120;                     // EST worker life
const AGENT_CAP = 900;                         // dots across all colonies; above this one dot stands for several ants
const CASTES = {                               // body mm, walk mm/s, soil per trip mm², fighting strength (EST)
  queen: { len: 22, speed: 5, load: 8, str: 4 },
  major: { len: 14, speed: 12, load: 6, str: 8 },
  media: { len: 7, speed: 15, load: 4, str: 2 },
  minor: { len: 4.5, speed: 10, load: 2, str: 1 },
  minim: { len: 2.5, speed: 6, load: 1, str: 0.4 },
};
const NAMES = ['Red', 'Gold'];
const MOVING = { toWork: 1, carry: 1, dump: 1, home: 1, fOut: 1, fWalk: 1, fHome: 1, fIn: 1, toRest: 1, settle: 1, pOut: 1, patrol: 1 };
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
function colonyFields() {
  return { work: field(), exit: field(), garden: field(), workDirty: true, navDirty: true, lastWork: -1e9, lastNav: -1e9 };
}
function newColony(id) {
  return {
    id, name: NAMES[id], phase: 'landing', workers: 0, brood: new Array(DEV_DAYS).fill(0), open: false, dead: false, gone: false,
    gardenTarget: 30, scale: 1, space: 0, targetCount: 0, plug: [], shaftCells: [], firstWorkerDay: -1, queenChamber: -1,
    queenId: 0, entrances: [], alarm: null,
    roles: { dig: 0, forage: 0, rest: 0, defend: 0, queen: 0 },
    stats: { dug: 0, dumped: 0, packed: 0, leaves: 0, garden: 0, deaths: 0, kills: 0, starved: 0 },
  };
}
// A food plant: leaf fragments regrow logistically, so a stripped plant recovers slowly (EST rates).
function plant(x, max) {
  return { x, max, leaves: max, h: Math.min(115, 45 + max / 45), r: 14 + Math.sqrt(max) * 0.45 };
}

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
  constructor(seed, mode, restoring) {
    this.seed = seed | 0;
    const tr = terrain(this.seed);
    this.cell = tr.cell; this.layer = tr.layer; this.shade = tr.shade;
    this.target = new Int16Array(W * H);       // id of the project that wants this cell dug
    this.chamberOf = new Int16Array(W * H);    // chamber id + 1, 0 = not in a chamber
    this.owner = new Uint8Array(W * H);        // colony id + 1 that dug this cell
    this.colTop = new Int16Array(W);           // first non-air row per column (the surface)
    this.active = 1; this.anyDead = false; this.fightMap = new Map();
    if (restoring) return;
    this.mode = mode === 'war' ? 'war' : 'solo';
    this.rng = new Rng(this.seed);
    this.t = 7 * HOUR; this.nextHour = 8 * HOUR; this.nextDay = DAY;
    this.projects = {}; this.nextProj = 1;
    this.chambers = []; this.agents = []; this.nextAgent = 1;
    this.log = []; this.corpses = []; this.warStarted = false;
    const war = this.mode === 'war', r = () => this.rng.next();
    const xs = war ? [220 + r() * 70, 710 + r() * 70] : [300 + r() * 400];
    this.colonies = xs.map((_, k) => newColony(k));
    this.cf = this.colonies.map(colonyFields);
    // Food: a small plant near each nest and one big contested plant between them, or scattered plants for one colony.
    this.plants = war
      ? [plant(60 + r() * 40, 900), plant(470 + r() * 60, 3200), plant(900 + r() * 40, 900)]
      : [60, 230, 770, 940].map(x => plant(x + (r() - 0.5) * 60, 500 + r() * 1000));
    for (let x = 0; x < W; x++) this.fixCol(x);
    xs.forEach((x, k) => {
      const q = this.spawn('queen', k, Math.round(x), SURFACE - 1, true);
      q.state = 'land'; q.wake = this.t + 120 + k * 900;
      this.colonies[k].queenId = q.id;
      this.setRole(q, 'queen');
    });
    this.note(null, war
      ? 'Two newly mated queens land 50 cm apart after the same nuptial flight. Leafcutter colonies are fiercely territorial.'
      : 'A newly mated Atta sexdens queen lands after her nuptial flight and sheds her wings.');
  }

  // ---------- grid ----------
  passable(i) { const c = this.cell[i]; return c === OPEN || c === GARDEN; }
  cellAt(x, y) { return x < 0 || x >= W || y < 0 || y >= H ? ROCK : this.cell[y * W + x]; }
  markNav() { for (const f of this.cf) f.navDirty = true; }
  markWork() { for (const f of this.cf) f.workDirty = true; }
  fixCol(x) {
    let y = 0; while (y < H - 1 && this.cell[y * W + x] === AIR) y++;
    if (this.colTop[x] !== y) { this.colTop[x] = y; this.markNav(); }
  }
  isEntrance(x) { return this.cell[this.colTop[x] * W + x] === OPEN; }
  ownEntrance(x, c) { const i = this.colTop[x] * W + x; return this.cell[i] === OPEN && this.owner[i] === c + 1; }
  setCell(i, v) {
    const old = this.cell[i]; if (old === v) return;
    const wasP = old === OPEN || old === GARDEN, isP = v === OPEN || v === GARDEN;
    this.cell[i] = v;
    if (old === GARDEN || v === GARDEN) {
      const ch = this.chambers[this.chamberOf[i] - 1];
      if (ch) this.colonies[ch.colony].stats.garden += v === GARDEN ? 1 : -1;
    }
    if (wasP !== isP) {
      const o = this.owner[i]; if (o) this.colonies[o - 1].space += isP ? 1 : -1;
      this.markNav(); this.markWork();
    }
    const x = i % W, y = (i - x) / W;
    if (y <= this.colTop[x] + 1) this.fixCol(x);
  }
  digCell(i) {
    const p = this.projects[this.target[i]], c = this.colonies[p.colony];
    this.target[i] = 0; c.targetCount--;
    this.owner[i] = c.id + 1;
    this.setCell(i, OPEN); c.stats.dug++;
    p.remaining--; p.last = this.t;
    if (p.remaining <= 0) this.projectDone(p);
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

  // ---------- navigation fields (BFS distance through open tunnels, one set per colony) ----------
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
    for (const c of this.colonies) {
      const f = this.cf[c.id];
      if (f.navDirty && (force || this.t - f.lastNav >= 30)) {
        f.navDirty = false; f.lastNav = this.t;
        c.entrances = []; const ex = [];
        for (let x = 0; x < W; x++) if (this.ownEntrance(x, c.id)) { ex.push(this.colTop[x] * W + x); c.entrances.push(x); }
        this.bfs(f.exit, ex);
        const gs = [];
        for (const ch of this.chambers) if (ch.colony === c.id) for (const i of ch.cells) if (this.passable(i)) gs.push(i);
        this.bfs(f.garden, gs);
      }
      if (f.workDirty && (force || this.t - f.lastWork >= 4)) {
        f.workDirty = false; f.lastWork = this.t;
        const src = [];
        for (const id in this.projects) {
          const p = this.projects[id]; if (p.remaining <= 0 || p.colony !== c.id) continue;
          for (const i of p.cells) {
            if (this.target[i] !== p.id) continue;
            for (let k = 0; k < 8; k++) { const j = i + DX[k] + DY[k] * W; if (j >= 0 && j < W * H && this.passable(j)) src.push(j); }
          }
        }
        this.bfs(f.work, src);
      }
    }
  }
  entranceCount(c) {
    const e = c.entrances; let n = 0;
    for (let k = 0; k < e.length; k++) if (k === 0 || e[k] - e[k - 1] > 2) n++;
    return n;
  }
  chambersOf(c) { return this.chambers.filter(ch => ch.colony === c.id); }

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
  addProject(type, cells, colony) {
    const id = this.nextProj++;
    const p = { id, type, colony, cells, remaining: cells.length, total: cells.length, last: this.t, next: null, chamber: -1, done: false, end: null };
    for (const i of cells) this.target[i] = id;
    this.projects[id] = p; this.colonies[colony].targetCount += cells.length;
    const f = this.cf[colony]; f.workDirty = true; f.lastWork = -1e9;
    return p;
  }
  addChamber(cx, cy, rx, ry, founding, colony) {
    const ch = { id: this.chambers.length, colony, cx, cy, rx, ry, cells: [], garden: 0, ph: this.rng.next() * 6.28 };
    this.chambers.push(ch);
    const p = this.addProject(founding ? 'founding' : 'chamber', this.chamberCells(ch, rx, ry), colony);
    p.chamber = ch.id; this.markNav();
    return ch;
  }
  cancel(p) {
    const c = this.colonies[p.colony];
    for (const i of p.cells) if (this.target[i] === p.id) { this.target[i] = 0; c.targetCount--; }
    delete this.projects[p.id]; this.markWork();
  }
  projectDone(p) {
    if (p.done) return;
    p.done = true; delete this.projects[p.id];
    const c = this.colonies[p.colony], cm = y => ((y - SURFACE) / 10).toFixed(0);
    if (p.next) this.addChamber(p.next.cx, p.next.cy, p.next.rx, p.next.ry, p.type === 'shaft', c.id);
    if (p.type === 'shaft') this.note(c, `Shaft finished, ${cm(p.next.cy)} cm deep. She hollows out a chamber at the bottom.`);
    else if (p.type === 'founding') { c.queenChamber = p.chamber; this.note(c, 'The founding chamber is done, about 3.5 cm across.'); }
    else if (p.type === 'chamber') this.note(c, `New chamber finished at ${cm(this.chambers[p.chamber].cy)} cm depth (chamber #${this.chambersOf(c).length}).`);
    else if (p.type === 'reopen') { c.phase = 'open'; c.open = true; this.note(c, 'Workers break through the plug. The nest is open and foraging begins.'); }
    else if (p.type === 'entrance') {
      // The mound may have grown over the planned exit while they dug: keep going up until daylight.
      let open = false;
      for (let x = Math.max(0, p.end.x - 6); x <= Math.min(W - 1, p.end.x + 6); x++) if (this.isEntrance(x)) open = true;
      if (open) this.note(c, 'A new entrance breaks through the surface.');
      else {
        const path = this.carve(p.end.x, p.end.y, -Math.PI / 2, 300, 7, -Math.PI / 2, 0.1, 0, true);
        this.addProject('entrance', path.cells, c.id).end = { x: Math.round(path.x), y: path.y };
      }
    }
  }

  // ---------- colony ----------
  note(c, msg) {
    this.log.push({ t: this.t, col: c ? c.id : -1, msg: c && this.mode === 'war' ? `${c.name}: ${msg}` : msg });
    if (this.log.length > 300) this.log.shift();
  }
  spawn(caste, col, x, y, surf) {
    const a = { id: this.nextAgent++, col, caste, x, y, px: x, py: y, surf, state: 'rest', role: null, wake: 0, acc: 0,
      load: 0, loadLayer: 0, leaf: false, hx: 1, hy: 0, goal: 0, patience: 0, after: null, plant: -1, until: 0, base: 0,
      doomed: false, killer: -1, dead: false };
    this.agents.push(a); return a;
  }
  setRole(a, role) {
    const R = this.colonies[a.col].roles;
    if (a.role) R[a.role]--; a.role = role; if (role) R[role]++;
  }
  loadFor(a) { return Math.min(40, Math.max(1, Math.round(CASTES[a.caste].load * (a.caste === 'queen' ? 1 : this.colonies[a.col].scale)))); }
  pickCaste(c) {   // young colonies make only small workers; size range widens as the colony grows (EST thresholds)
    const n = c.workers, r = this.rng.next();
    if (n < 60) return r < 0.6 ? 'minim' : 'minor';
    if (n < 1500) return r < 0.32 ? 'minim' : r < 0.6 ? 'minor' : r < 0.97 ? 'media' : 'major';
    return r < 0.3 ? 'minim' : r < 0.55 ? 'minor' : r < 0.93 ? 'media' : 'major';
  }
  startFounding(q) {
    const c = this.colonies[q.col]; c.phase = 'digging';
    const path = this.carve(q.x, SURFACE, Math.PI / 2, 170 + this.rng.next() * 60, 10, Math.PI / 2, 0.12, 0, false);
    c.shaftCells = path.cells.slice();
    const p = this.addProject('shaft', path.cells, c.id);
    p.next = { cx: path.x, cy: path.y + 8, rx: 17, ry: 11 };
    this.note(c, 'She starts digging a narrow vertical shaft.');
    this.chooseTask(q);
  }
  sealNest(q) {
    const c = this.colonies[q.col], plug = [];
    for (const i of c.shaftCells) {
      const y = (i / W) | 0;
      if (y >= SURFACE + 4 && y < SURFACE + 24 && this.cell[i] === OPEN) { this.setCell(i, LOOSE); this.layer[i] = 0; plug.push(i); }
    }
    c.plug = plug; c.phase = 'claustral';
    this.growGarden(this.chambers[c.queenChamber], 6);
    this.note(c, "She plugs the shaft from inside and seeds a fungus garden from the pellet she carried from her mother's nest.");
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
  decayGarden(c, n) {    // spent fungus is removed as refuse
    const chs = this.chambersOf(c).filter(ch => ch.garden > 0);
    for (let k = 0; k < n && chs.length; k++) {
      const ch = chs[(this.rng.next() * chs.length) | 0];
      for (let s = 0; s < 30; s++) {
        const i = ch.cells[(this.rng.next() * ch.cells.length) | 0];
        if (this.cell[i] === GARDEN) { this.setCell(i, OPEN); ch.garden--; break; }
      }
    }
  }
  syncAgents(c) {
    const cap = Math.floor(AGENT_CAP / this.colonies.length), ch = this.chambers[c.queenChamber];
    const want = Math.min(Math.round(c.workers), cap);
    let have = 0;
    for (const a of this.agents) if (a.col === c.id && a.caste !== 'queen' && !a.dead) have++;
    while (have < want && ch) {
      let i = -1;
      for (let s = 0; s < 40 && i < 0; s++) { const j = ch.cells[(this.rng.next() * ch.cells.length) | 0]; if (this.passable(j)) i = j; }
      if (i < 0) break;
      const a = this.spawn(this.pickCaste(c), c.id, i % W, (i / W) | 0, false);
      a.state = 'rest'; a.wake = this.t + this.rng.next() * HOUR; this.setRole(a, 'rest'); have++;
    }
    for (let k = this.agents.length - 1; k >= 0 && have > want; k--) {
      const a = this.agents[k];
      if (a.col !== c.id || a.caste === 'queen' || a.dead) continue;
      this.agents.splice(k, 1); c.stats.packed += a.load; this.setRole(a, null); have--;
    }
    c.scale = Math.max(1, c.workers / Math.max(1, have));
  }
  dailyColony(c) {
    const day = Math.floor(this.t / DAY), k = day % DEV_DAYS, ecl = c.brood[k];
    const food = c.open ? Math.max(0, Math.min(1, c.stats.garden / c.gardenTarget)) : 1;
    let eggs = 0;
    if (!c.dead && (c.phase === 'claustral' || c.phase === 'opening' || c.phase === 'open'))
      eggs = Math.min(20000, 2 + 0.05 * c.workers) * Math.max(0.1, food);     // EST laying rate, throttled by fungus
    c.brood[k] = eggs;
    // A hungry colony loses workers faster (EST): the population tracks the food the plants can supply.
    const starve = food < 0.4 ? (0.4 - food) * 0.05 : 0;
    const lost = c.workers * (1 / LIFESPAN_DAYS + starve);
    c.stats.starved += c.workers * starve;
    c.workers = Math.max(0, c.workers - lost + ecl);
    if (ecl > 0.5 && c.firstWorkerDay < 0) { c.firstWorkerDay = day; this.note(c, 'The first workers eclose: tiny minims that tend the fungus.'); }
    if (!c.open) { const ch = this.chambers[c.queenChamber]; if (ch && ch.garden < 20 + c.workers) this.growGarden(ch, 2); }
    else this.decayGarden(c, Math.floor(c.stats.garden * 0.08));   // EST: fungus eaten by brood, spent garden removed
    if (c.phase === 'claustral' && c.workers >= 25) {
      c.phase = 'opening';
      this.addProject('reopen', c.plug.filter(i => this.cell[i] === LOOSE && !this.target[i]), c.id);
      this.note(c, 'Workers start digging up through the plug.');
    }
    if (c.dead && !c.gone && c.workers < 1) { c.gone = true; c.workers = 0; this.note(c, 'The last workers die. The colony is gone.'); }
    this.syncAgents(c);
  }
  hourly() {
    for (const id in this.projects) {
      const p = this.projects[id];
      if (p.remaining <= 0) this.projectDone(p);
      else if (this.t - p.last > 3 * DAY && p.type !== 'reopen') this.cancel(p);   // blocked by stone: give up
    }
    for (const p of this.plants) {   // logistic regrowth plus a trickle from roots, so a bare plant comes back slowly (EST)
      p.leaves = Math.min(p.max, p.leaves + (0.25 * p.leaves * (1 - p.leaves / p.max) + 0.005 * p.max) / 24);
    }
    if (this.corpses.length) this.corpses = this.corpses.filter(k => this.t - k.t < 2 * DAY);
    for (const c of this.colonies) if (c.open && !c.dead) this.plan(c);
  }
  // Nest volume tracks colony size (excavation is demand-driven), with spare room for the fungus.
  plan(c) {
    const N = c.workers;
    c.gardenTarget = 40 + 8 * N;
    let active = 0, ent = false;
    for (const id in this.projects) { const p = this.projects[id]; if (p.colony !== c.id) continue; active++; if (p.type === 'entrance') ent = true; }
    if (!ent && this.entranceCount(c) * 300 < N && this.newEntrance(c)) return;
    const room = this.chambersOf(c).reduce((n, ch) => n + ch.cells.length * 0.85, 0);
    const want = 1.25 * c.gardenTarget + 15 * N + 2500;
    if ((room < 1.2 * c.gardenTarget || c.space < want) && active < 1 + Math.floor(N / 500)) this.newDigProject(c);
  }
  newDigProject(c) {
    const N = c.workers, chs = this.chambersOf(c), rMax = 18 + 12 * Math.log10(Math.max(10, N));
    if (!chs.length) return false;
    const small = chs.filter(ch => ch.rx + 5 <= rMax);
    if (small.length && this.rng.next() < 0.55) {
      const ch = small[(this.rng.next() * small.length) | 0];
      const rx = ch.rx + 4 + this.rng.next() * 4, ry = Math.min(rx * 0.62, ch.ry + 2 + this.rng.next() * 3);
      if (this.chamberFits(ch.cx, ch.cy, rx, ry, ch.id)) {
        ch.rx = rx; ch.ry = ry;
        this.addProject('enlarge', this.chamberCells(ch, rx, ry), c.id).chamber = ch.id;
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
      this.addProject('tunnel', path.cells, c.id).next = { cx, cy, rx, ry };
      return true;
    }
    return false;
  }
  newEntrance(c) {
    const top = this.chambersOf(c).sort((a, b) => a.cy - b.cy).slice(0, 3);
    if (!top.length) return false;
    const from = top[(this.rng.next() * top.length) | 0];
    const ang = -Math.PI / 2 + (this.rng.next() - 0.5) * 1.4;
    const path = this.carve(from.cx, from.cy, ang, 450, 7, ang, 0.2, 0, true);
    if (!path.reached || Math.abs(path.x - from.cx) > 250) { this.unmark(path.cells); return false; }
    this.addProject('entrance', path.cells, c.id).end = { x: Math.round(path.x), y: path.y };
    return true;
  }

  // ---------- ant behaviour ----------
  chooseTask(a) {
    a.leaf = false;
    const c = this.colonies[a.col], R = c.roles;
    if (a.caste === 'queen') return this.queenTask(a, c);
    const n = R.dig + R.forage + R.rest + R.defend + 1;
    if (a.caste !== 'minim' && c.targetCount > 0 && R.dig < Math.max(1, Math.min(n * 0.4, c.targetCount / 6))) {
      this.setRole(a, 'dig'); a.state = 'toWork'; a.patience = 4000; return;
    }
    const fighter = a.caste === 'major' || a.caste === 'media' || (a.caste === 'minor' && c.workers < 200);
    // Alarm: recent fighting on the surface pulls soldiers and large workers out to patrol there.
    if (c.open && c.alarm && this.t - c.alarm.t < 2 * HOUR && fighter && R.defend < n * 0.25 && this.rng.next() < 0.7) {
      this.setRole(a, 'defend'); a.state = 'pOut'; a.base = c.alarm.x; a.goal = c.alarm.x;
      a.until = this.t + (20 + this.rng.next() * 30) * 60; a.patience = 8000; return;
    }
    // Recruitment scales with how short the garden is, and only if some plant still has leaves.
    const hunger = Math.max(0.05, Math.min(1, (c.gardenTarget * 1.15 - c.stats.garden) / (c.gardenTarget * 0.3)));
    if (c.open && fighter && this.rng.next() < hunger && R.forage < n * 0.4 && this.plants.some(p => p.leaves >= 1)) {
      this.setRole(a, 'forage'); a.state = 'fOut'; a.patience = 6000; return;
    }
    this.setRole(a, 'rest'); a.state = 'toRest'; a.patience = 3000;
  }
  queenTask(q, c) {
    this.setRole(q, 'queen'); q.patience = 1e9;
    if (c.phase === 'digging') {
      if (c.targetCount > 0) q.state = 'toWork';
      else { q.state = 'toRest'; q.after = 'seal'; }
      return;
    }
    q.state = 'toRest';
  }
  arriveRest(a) {
    if (a.after === 'seal') { a.after = null; a.state = 'seal'; a.wake = this.t + HOUR; return; }
    // Spread out through the chamber instead of piling up at its doorway.
    const ch = this.chambers[this.chamberOf[a.y * W + a.x] - 1];
    a.goal = -1;
    if (ch) for (let s = 0; s < 12 && a.goal < 0; s++) { const j = ch.cells[(this.rng.next() * ch.cells.length) | 0]; if (this.passable(j)) a.goal = j; }
    if (a.goal >= 0) { a.state = 'settle'; a.patience = 200; return; }
    this.rest(a);
  }
  rest(a) {
    a.state = 'rest';
    a.wake = this.t + (a.caste === 'queen' ? 6 * HOUR : (20 + this.rng.next() * 70) * 60);   // most workers are idle most of the time
  }
  wakeUp(a) {
    switch (a.state) {
      case 'land': this.startFounding(a); break;
      case 'dig': this.finishDig(a); break;
      case 'seal': this.sealNest(a); break;
      case 'cut': {
        const p = this.plants[a.plant], take = this.colonies[a.col].scale;
        a.y = this.colTop[a.x] - 1;
        if (p && p.leaves >= take) { p.leaves -= take; a.leaf = true; a.state = 'fHome'; }
        else a.state = 'home';
        a.patience = 8000; break;
      }
      case 'fight': this.afterFight(a); break;
      default: this.chooseTask(a);
    }
  }
  ownTarget(j, col) { const p = this.target[j] > 0 && this.projects[this.target[j]]; return !!p && p.colony === col; }
  adjTarget(a) {
    for (let k = 0; k < 8; k++) {
      const nx = a.x + DX[k], ny = a.y + DY[k];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.ownTarget(ny * W + nx, a.col)) return ny * W + nx;
    }
    return -1;
  }
  finishDig(a) {
    const want = this.loadFor(a), start = a.goal, got = [];
    if (this.ownTarget(start, a.col)) {
      const list = [start], seen = new Set(list);
      for (let h = 0; h < list.length && got.length < want; h++) {
        const i = list[h]; got.push(i);
        for (let k = 0; k < 4; k++) {
          const j = i + DX[k] + DY[k] * W;
          if (j >= 0 && j < W * H && !seen.has(j) && this.ownTarget(j, a.col)) { seen.add(j); list.push(j); }
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
    gx = Math.max(0, Math.min(W - 1, Math.round(gx)));
    if (a.x !== gx) { const s = gx > a.x ? 1 : -1; a.x += s; a.hx = s; a.hy = 0; }
    a.y = this.colTop[a.x] - 1;
    return a.x === gx;
  }
  surfToEntrance(a, next) {
    const ents = this.colonies[a.col].entrances;
    if (!ents.length) { this.surfWalk(a, a.x + (this.rng.next() < 0.5 ? -1 : 1)); return false; }
    let best = ents[0];
    for (const x of ents) if (Math.abs(x - a.x) < Math.abs(best - a.x)) best = x;
    if (!this.surfWalk(a, best)) return false;
    if (!this.ownEntrance(a.x, a.col)) { this.cf[a.col].navDirty = true; return false; }   // stale list; wait for refresh
    a.surf = false; a.y = this.colTop[a.x];
    if (next) a.state = next; else this.chooseTask(a);
    return !MOVING[a.state];
  }
  exitNest(a) { a.surf = true; a.y = this.colTop[a.x] - 1; }
  dumpSpot(x, c) {
    const d = c.phase === 'digging' ? 15 + this.rng.next() * 35 : 20 + this.rng.next() * 220;
    return Math.round(Math.max(3, Math.min(W - 4, x + (this.rng.next() < 0.5 ? -d : d))));
  }
  pickPlant(a) {   // richer and closer plants win, with some individual variation
    let best = -1, bs = 0;
    for (let k = 0; k < this.plants.length; k++) {
      const p = this.plants[k]; if (p.leaves < 1) continue;
      const s = (0.3 + p.leaves / p.max) / (Math.abs(p.x - a.x) + 120) * (0.5 + this.rng.next());
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }
  deliverLeaf(a) {
    const c = this.colonies[a.col], n = Math.max(1, Math.round(2 * c.scale)), ch = this.chambers[this.chamberOf[a.y * W + a.x] - 1];
    let placed = ch && ch.colony === a.col ? this.growGarden(ch, n) : 0;
    const own = this.chambersOf(c);
    for (let t = 0; placed < n && t < 4 && own.length; t++) placed += this.growGarden(own[(this.rng.next() * own.length) | 0], n - placed);
    c.stats.leaves++; this.chooseTask(a);
  }
  move(a) {
    if (--a.patience < 0) {               // lost: drop what it carries and start over
      this.colonies[a.col].stats.packed += a.load; a.load = 0; a.leaf = false;
      if (a.surf) { a.state = 'home'; a.patience = 5000; return false; }
      this.chooseTask(a); return true;
    }
    const i = a.y * W + a.x, c = this.colonies[a.col], F = this.cf[a.col];
    switch (a.state) {
      case 'toWork': {
        if (c.targetCount === 0) { this.chooseTask(a); return true; }
        const j = this.adjTarget(a);
        if (j >= 0) { a.goal = j; a.state = 'dig'; a.wake = this.t + DIG_S_PER_CELL * HARDNESS[this.layer[j]] * this.loadFor(a); return true; }
        if (a.surf) return this.surfToEntrance(a, 'toWork');
        this.stepField(a, F.work); return false;
      }
      case 'carry': {
        if (a.surf) { a.state = 'dump'; a.goal = this.dumpSpot(a.x, c); return false; }
        const d = F.exit.d[i];
        if (d < 0 && c.phase !== 'digging' && !c.open) {   // sealed nest: pack soil into the walls
          c.stats.packed += a.load; a.load = 0; this.chooseTask(a); return true;
        }
        if (d === 0) { this.exitNest(a); return false; }
        this.stepField(a, F.exit); return false;
      }
      case 'dump':
        if (this.surfWalk(a, a.goal)) { this.deposit(a.x, a.load, a.loadLayer); c.stats.dumped += a.load; a.load = 0; a.state = 'home'; }
        return false;
      case 'home': return this.surfToEntrance(a, null);
      case 'fOut': case 'pOut': {
        if (a.surf) {
          if (a.state === 'pOut') { a.state = 'patrol'; return false; }
          a.plant = this.pickPlant(a);
          if (a.plant < 0) { a.state = 'home'; return false; }
          const p = this.plants[a.plant];
          a.goal = p.x + (this.rng.next() - 0.5) * p.r * 1.2; a.state = 'fWalk'; return false;
        }
        if (F.exit.d[i] === 0) this.exitNest(a); else this.stepField(a, F.exit);
        return false;
      }
      case 'fWalk':
        if (this.surfWalk(a, a.goal)) {   // climb into the plant and cut a fragment (EST 1-3 min)
          const p = this.plants[a.plant];
          a.state = 'cut'; a.wake = this.t + 60 + this.rng.next() * 120;
          a.y = this.colTop[a.x] - 2 - Math.floor(this.rng.next() * p.h * 0.85);
          return true;
        }
        return false;
      case 'patrol':
        if (this.t > a.until) { a.state = 'home'; return false; }
        if (this.surfWalk(a, a.goal)) a.goal = a.base + (this.rng.next() - 0.5) * 80;
        return false;
      case 'fHome': return this.surfToEntrance(a, 'fIn');
      case 'fIn': case 'toRest': {
        if (a.surf) return this.surfToEntrance(a, a.state);
        if (F.garden.d[i] === 0 || !F.garden.seen.length) {
          if (a.state === 'fIn') this.deliverLeaf(a); else this.arriveRest(a);
          return !MOVING[a.state];
        }
        this.stepField(a, F.garden); return false;
      }
      case 'settle': {
        if (i === a.goal || a.patience < 5) { this.rest(a); return true; }
        const gx = a.goal % W, gy = (a.goal / W) | 0;
        let best = -1, bd = (a.x - gx) ** 2 + (a.y - gy) ** 2;
        for (let k = 0; k < 8; k++) {
          const nx = a.x + DX[k], ny = a.y + DY[k], d = (nx - gx) ** 2 + (ny - gy) ** 2;
          if (d < bd && this.passable(ny * W + nx)) { bd = d; best = k; }
        }
        if (best < 0) { this.rest(a); return true; }
        a.x += DX[best]; a.y += DY[best]; a.hx = DX[best]; a.hy = DY[best];
        return false;
      }
    }
    return true;
  }
  updateAgent(a) {
    if (a.dead) return false;
    if (!MOVING[a.state]) { if (this.t >= a.wake) this.wakeUp(a); return !!MOVING[a.state]; }
    a.px = a.x; a.py = a.y;
    a.acc += CASTES[a.caste].speed * DT;
    while (a.acc >= 1) { a.acc -= 1; if (this.move(a)) { a.acc = 0; break; } }
    return !!MOVING[a.state];
  }

  // ---------- war ----------
  // Rival ants that end up in the same 4 mm patch usually fight. Bigger castes win more often.
  fights() {
    const map = this.fightMap; map.clear();
    for (const a of this.agents) {
      if (a.dead || a.state === 'fight' || (this.colonies[a.col].gone)) continue;
      const key = a.surf ? -1 - (a.x >> 2) : (a.y >> 2) * 256 + (a.x >> 2);
      const b = map.get(key);
      if (!b) { map.set(key, [a]); continue; }
      for (const e of b) if (e.col !== a.col && e.state !== 'fight' && this.rng.next() < 0.6) { this.engage(a, e); break; }
      b.push(a);
    }
  }
  engage(a, b) {
    const sa = CASTES[a.caste].str, sb = CASTES[b.caste].str;
    const loser = this.rng.next() < sa / (sa + sb) ? b : a, winner = loser === a ? b : a;
    const dur = 8 + this.rng.next() * 30;                  // EST seconds of grappling
    for (const x of [a, b]) {
      x.state = 'fight'; x.wake = this.t + dur; x.doomed = x === loser; x.killer = x === loser ? winner.col : -1;
      if (x.surf) x.y = this.colTop[x.x] - 1;             // knocked out of the plant
    }
    a.hx = b.x >= a.x ? 1 : -1; b.hx = -a.hx; a.hy = b.hy = 0;
    for (const c of [this.colonies[a.col], this.colonies[b.col]]) if (a.surf) c.alarm = { x: a.x, t: this.t };
    if (!this.warStarted) { this.warStarted = true; this.note(null, `First clash between Red and Gold ${a.surf ? 'on the surface' : 'underground'}. Soldiers are being recruited.`); }
  }
  afterFight(a) {
    if (a.doomed) return this.kill(a);
    a.killer = -1;
    if (a.surf) a.y = this.colTop[a.x] - 1;
    if (a.load) a.state = 'carry';
    else if (a.surf) a.state = a.leaf ? 'fHome' : a.role === 'defend' && this.t < a.until ? 'patrol' : 'home';
    else if (a.leaf) a.state = 'fIn';
    else this.chooseTask(a);
    a.patience = Math.max(a.patience, 4000);
  }
  kill(a) {
    const c = this.colonies[a.col], n = a.caste === 'queen' ? 1 : c.scale;
    a.dead = true; this.anyDead = true; this.setRole(a, null);
    c.stats.packed += a.load; a.load = 0;
    if (a.caste !== 'queen') c.workers = Math.max(0, c.workers - n);
    c.stats.deaths += n;
    if (a.killer >= 0) this.colonies[a.killer].stats.kills += n;
    this.corpses.push({ x: a.x, y: a.y, t: this.t, col: a.col });
    if (a.caste === 'queen') { c.dead = true; this.note(c, 'The queen has been killed. No more eggs: the colony is doomed.'); }
  }

  // ---------- clock ----------
  tick() {
    this.t += DT;
    if (this.t >= this.nextDay) { this.nextDay += DAY; for (const c of this.colonies) this.dailyColony(c); }
    if (this.t >= this.nextHour) { this.nextHour += HOUR; this.hourly(); }
    this.updateFields(false);
    let act = 0;
    for (let k = 0; k < this.agents.length; k++) if (this.updateAgent(this.agents[k])) act++;
    if (this.colonies.length > 1) this.fights();
    if (this.anyDead) { this.agents = this.agents.filter(a => !a.dead); this.anyDead = false; }
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
      v: 2, mode: this.mode, seed: this.seed, t: this.t, nextHour: this.nextHour, nextDay: this.nextDay, rng: this.rng.s,
      cell: rle(this.cell), layer: rle(this.layer), target: rle(this.target), chamberOf: rle(this.chamberOf), owner: rle(this.owner),
      projects: this.projects, nextProj: this.nextProj, chambers: this.chambers, agents: this.agents, nextAgent: this.nextAgent,
      colonies: this.colonies, plants: this.plants, corpses: this.corpses, log: this.log, warStarted: this.warStarted,
    };
  }
  static fromJSON(o) {
    if (o.v !== 2) return null;
    const s = new Sim(o.seed, o.mode, true);
    s.cell = unrle(o.cell, Uint8Array); s.layer = unrle(o.layer, Uint8Array);
    s.target = unrle(o.target, Int16Array); s.chamberOf = unrle(o.chamberOf, Int16Array); s.owner = unrle(o.owner, Uint8Array);
    for (const k of ['mode', 't', 'nextHour', 'nextDay', 'projects', 'nextProj', 'chambers', 'agents', 'nextAgent',
      'colonies', 'plants', 'corpses', 'log', 'warStarted']) s[k] = o[k];
    s.rng = new Rng(o.rng);
    s.cf = s.colonies.map(colonyFields);
    for (let x = 0; x < W; x++) s.fixCol(x);
    s.updateFields(true);
    return s;
  }
}

const api = { Sim, W, H, SURFACE, DT, HOUR, DAY, CASTES, NAMES, AIR, SOIL, OPEN, LOOSE, GARDEN, ROCK, AGENT_CAP };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AntSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
