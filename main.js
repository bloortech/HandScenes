// Browser side: draws the slab, the ants, and the HUD. All behaviour lives in sim.js.
(function () {
'use strict';
const { Sim, W, H, SURFACE, DT, DAY, CASTES, AIR, SOIL, OPEN, LOOSE, GARDEN, ROCK } = AntSim;
const KEY = 'antfarm.atta.v1';
const SPEEDS = [[1, '1× real'], [10, '10×'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 hr/s'], [86400, '1 day/s']];

// ?day=120 starts a fresh colony already fast-forwarded to that day (handy for a look at a grown nest).
const skipTo = +new URLSearchParams(location.search).get('day') || 0;
let sim = skipTo ? null : load();
if (!sim) { sim = new Sim((Math.random() * 2 ** 31) | 0); if (skipTo) sim.advance(skipTo * DAY - sim.t, Infinity); }
let speed = 60, paused = false, owe = 0, follow = null;
let measured = { sim: 0, real: 0 }, actual = 0;

function load() {
  try { const s = localStorage.getItem(KEY); return s ? Sim.fromJSON(JSON.parse(s)) : null; }
  catch (e) { console.warn('could not restore colony', e); return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(sim.toJSON())); }
  catch (e) { console.warn('save failed', e); }
}
setInterval(save, 15000);
addEventListener('beforeunload', save);

// ---------- canvas + camera ----------
const cv = document.getElementById('farm'), ctx = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H;
const octx = off.getContext('2d'), img = octx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
const cam = { x: 0, y: 0, z: 1 };   // screen px = (world mm - cam) * z
let dpr = 1;
function resize() {
  dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
}
function fit() {
  cam.z = Math.min(cv.width / W, cv.height / H);
  cam.x = -(cv.width / cam.z - W) / 2; cam.y = -(cv.height / cam.z - H) / 2;
}
addEventListener('resize', resize);   // keep the camera where you left it
resize(); fit();
const zoomTo = +new URLSearchParams(location.search).get('zoom');   // ?zoom=8 starts zoomed in on the queen
if (zoomTo) { const q = sim.agents[0]; cam.z = zoomTo * dpr; cam.x = q.x - cv.width / cam.z / 2; cam.y = q.y - cv.height / cam.z / 2; }

// ---------- colours (ABGR for the little-endian pixel buffer) ----------
const pack = (r, g, b) => (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
const SOILS = [[86, 58, 40], [146, 70, 40], [170, 134, 88]];   // dark topsoil, red tropical clay, sand
const lut = (rgb, lo, hi) => Array.from({ length: 256 }, (_, s) => { const f = lo + (hi - lo) * s / 255; return pack(rgb[0] * f | 0, rgb[1] * f | 0, rgb[2] * f | 0); });
const SOIL_C = SOILS.map(c => lut(c, 0.72, 1.12));
const LOOSE_C = SOILS.map(c => lut(c, 1.0, 1.35));
const OPEN_C = lut([34, 22, 15], 0.7, 1.2);
const GARDEN_C = lut([214, 208, 188], 0.82, 1.06);
const ROCK_C = lut([118, 114, 108], 0.75, 1.15);

function skyRows(t) {
  const h = (t % DAY) / 3600, day = Math.max(0, Math.min(1, Math.sin((h - 6) / 12 * Math.PI) * 1.6 + 0.3));
  const rows = new Uint32Array(SURFACE + 1);
  for (let y = 0; y <= SURFACE; y++) {
    const k = y / SURFACE, n = [10 + 8 * k, 12 + 10 * k, 26 + 14 * k], d = [120 + 60 * k, 165 + 45 * k, 215 + 20 * k];
    rows[y] = pack(n[0] + (d[0] - n[0]) * day | 0, n[1] + (d[1] - n[1]) * day | 0, n[2] + (d[2] - n[2]) * day | 0);
  }
  return rows;
}

function paint() {
  const { cell, layer, shade } = sim, sky = skyRows(sim.t);
  for (let y = 0, i = 0; y < H; y++) {
    const s = sky[Math.min(y, SURFACE)];
    for (let x = 0; x < W; x++, i++) {
      switch (cell[i]) {
        case AIR: buf[i] = s; break;
        case SOIL: buf[i] = SOIL_C[layer[i]][shade[i]]; break;
        case OPEN: buf[i] = OPEN_C[shade[i]]; break;
        case LOOSE: buf[i] = LOOSE_C[layer[i]][shade[i]]; break;
        case GARDEN: buf[i] = GARDEN_C[shade[i]]; break;
        default: buf[i] = ROCK_C[shade[i]];
      }
    }
  }
  octx.putImageData(img, 0, 0);
}

// ---------- ants ----------
const ANT = { queen: '#8c3a16', major: '#a24c20', media: '#b85c2a', minor: '#cc6a32', minim: '#dd7c40' };   // rusty Atta red, bright enough to read on dark tunnels
function antPos(a, alpha) {
  const jx = ((a.id * 7919) % 97) / 97 - 0.5, jy = ((a.id * 104729) % 89) / 89 - 0.5;
  const big = Math.abs(a.x - a.px) > 3 || Math.abs(a.y - a.py) > 3;   // don't smear across entering/exiting jumps
  const x = big ? a.x : a.px + (a.x - a.px) * alpha, y = big ? a.y : a.py + (a.y - a.py) * alpha;
  return [(x + 0.5 + jx * 0.6 - cam.x) * cam.z, (y + 0.5 + jy * 0.6 - cam.y) * cam.z];
}
function drawAnts(alpha) {
  const z = cam.z;
  for (const a of sim.agents) {
    if (a.state === 'away') continue;
    const [sx, sy] = antPos(a, alpha);
    if (sx < -40 || sy < -40 || sx > cv.width + 40 || sy > cv.height + 40) continue;
    const L = CASTES[a.caste].len * z;
    if (L < 4) {
      ctx.fillStyle = a.caste === 'queen' ? '#ffcc66' : ANT[a.caste];
      const s = Math.max(1.6 * dpr, L * 0.6); ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      continue;
    }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(a.hy, a.hx));
    ctx.fillStyle = ANT[a.caste];
    if (L > 14) {
      ctx.strokeStyle = ANT[a.caste]; ctx.lineWidth = Math.max(1, L * 0.025);
      ctx.beginPath();
      for (const lx of [-0.05, 0.03, 0.1]) for (const sgn of [-1, 1]) { ctx.moveTo(L * lx, 0); ctx.lineTo(L * (lx * 2 - 0.05), sgn * L * 0.28); }
      ctx.stroke();
    }
    const head = a.caste === 'major' ? 0.2 : 0.13;
    ell(-L * 0.28, 0, L * (a.caste === 'queen' ? 0.27 : 0.2), L * (a.caste === 'queen' ? 0.17 : 0.13));
    ell(0.02 * L, 0, L * 0.16, L * 0.07);
    ell(L * 0.3, 0, L * head, L * head * 0.9);
    if (a.load) { ctx.fillStyle = '#c9a16e'; ell(L * 0.48, 0, L * 0.1, L * 0.1); }
    if (a.leaf) {
      ctx.fillStyle = '#5fa83a'; ctx.beginPath();
      ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 0.1, -L * 0.75); ctx.lineTo(L * 0.75, -L * 0.6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  if (follow) {
    const [sx, sy] = antPos(follow, alpha);
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(8 * dpr, CASTES[follow.caste].len * z * 0.8), 0, 6.283); ctx.stroke();
  }
}
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fill(); }

function draw(alpha) {
  ctx.fillStyle = '#0b0907'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, -cam.x * cam.z, -cam.y * cam.z, W * cam.z, H * cam.z);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2 * dpr;   // the glass edge
  ctx.strokeRect(-cam.x * cam.z, -cam.y * cam.z, W * cam.z, H * cam.z);
  drawAnts(alpha);
}

// ---------- input ----------
let drag = null;
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const mx = e.offsetX * dpr, my = e.offsetY * dpr, wx = mx / cam.z + cam.x, wy = my / cam.z + cam.y;
  cam.z = Math.max(0.3, Math.min(40, cam.z * Math.exp(-e.deltaY * 0.0015)));
  cam.x = wx - mx / cam.z; cam.y = wy - my / cam.z;
}, { passive: false });
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.classList.add('dragging'); });
addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; follow = null; }
  cam.x = drag.cx - dx * dpr / cam.z; cam.y = drag.cy - dy * dpr / cam.z;
});
addEventListener('pointerup', e => {
  if (drag && !drag.moved) pick(e.clientX * dpr, e.clientY * dpr);
  drag = null; cv.classList.remove('dragging');
});
function pick(sx, sy) {
  let best = null, bd = (14 * dpr) ** 2;
  for (const a of sim.agents) {
    if (a.state === 'away') continue;
    const [ax, ay] = antPos(a, 1), d = (ax - sx) ** 2 + (ay - sy) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  follow = best;
}
addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  else if (e.key >= '1' && e.key <= '6') setSpeed(SPEEDS[+e.key - 1][0]);
  else if (e.key === 'f') { follow = null; fit(); }
  else if (e.key === 'Escape') follow = null;
});

// ---------- HUD ----------
const $ = id => document.getElementById(id);
const speedBox = $('speeds');
for (const [v, label] of SPEEDS) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
  b.onclick = () => setSpeed(v); speedBox.appendChild(b);
}
function setSpeed(v) { speed = v; owe = 0; paused = false; refreshButtons(); }
function togglePause() { paused = !paused; refreshButtons(); }
function refreshButtons() {
  for (const b of speedBox.children) b.classList.toggle('on', +b.dataset.v === speed && !paused);
  $('pause').textContent = paused ? 'Resume' : 'Pause';
}
$('pause').onclick = togglePause;
$('fit').onclick = () => { follow = null; fit(); };
$('reset').onclick = () => {
  if (!confirm('Start a new colony? The current one is deleted.')) return;
  localStorage.removeItem(KEY); sim = new Sim((Math.random() * 2 ** 31) | 0); follow = null; lastLog = -1;
};
refreshButtons();

const PHASES = {
  landing: 'A queen has just landed', digging: 'The queen is digging her founding nest',
  claustral: 'Sealed in: the queen raises her first brood on fungus', opening: 'Workers are digging out',
  open: 'Open colony: foraging, farming, excavating',
};
const STATE = {
  toWork: 'walking to the dig face', dig: 'digging', carry: 'carrying soil out', dump: 'dumping soil on the mound',
  home: 'heading back in', fOut: 'heading out to forage', fWalk: 'walking the foraging trail', away: 'cutting leaves (off-screen)',
  fHome: 'bringing a leaf home', fIn: 'taking the leaf to the garden', toRest: 'going to the garden', rest: 'resting / tending fungus',
  land: 'shedding her wings', seal: 'plugging the shaft',
};
const clock = t => { const d = Math.floor(t / DAY), s = t % DAY; return `Day ${d} · ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; };
const fmtSpeed = v => v >= 86400 ? `${(v / 86400).toFixed(1)} days/s` : v >= 3600 ? `${(v / 3600).toFixed(1)} hr/s` : v >= 60 ? `${(v / 60).toFixed(1)} min/s` : `${v.toFixed(1)}×`;
let lastLog = -1;
function hud() {
  const c = sim.col, n = sim.agents.length - 1;
  $('phase').textContent = PHASES[c.phase];
  $('clock').textContent = clock(sim.t);
  $('speedline').textContent = paused ? 'paused' : `running at ${fmtSpeed(actual)}` + (actual < speed * 0.8 ? ` (asked ${fmtSpeed(speed)}, CPU-limited)` : '');
  const brood = c.brood.reduce((a, b) => a + b, 0), deep = sim.chambers.reduce((m, ch) => Math.max(m, ch.cy - SURFACE), 0);
  const rows = [
    ['Workers', Math.round(c.workers).toLocaleString()],
    ['On screen', n ? `${n} dots${c.scale > 1.05 ? ` (1 dot ≈ ${c.scale.toFixed(1)} ants)` : ''}` : 'queen only'],
    ['Brood developing', Math.round(brood).toLocaleString()],
    ['Chambers', sim.chambers.length + (deep ? `, deepest ${(deep / 10).toFixed(0)} cm` : '')],
    ['Soil excavated', `${(sim.stats.dug / 100).toFixed(1)} cm²`],
    ['Fungus garden', `${(sim.stats.garden / 100).toFixed(1)} cm²`],
    ['Leaf loads in', sim.stats.leaves.toLocaleString()],
    ['Digging / foraging / resting', `${sim.roles.dig} / ${sim.roles.forage} / ${sim.roles.rest}`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (sim.log.length !== lastLog) {
    lastLog = sim.log.length;
    $('entries').innerHTML = sim.log.slice().reverse().map(e => `<div><b>${clock(e.t)}</b><br>${e.msg}</div>`).join('');
  }
  const box = $('ant');
  if (follow && !sim.agents.includes(follow)) follow = null;
  box.style.display = follow ? 'block' : 'none';
  if (follow) $('antinfo').innerHTML = `<b>${follow.caste}</b> #${follow.id} · ${CASTES[follow.caste].len} mm<br>${STATE[follow.state] || follow.state}` +
    `<br>depth ${Math.max(0, (follow.y - SURFACE) / 10).toFixed(1)} cm`;
}
setInterval(hud, 250);

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    owe = Math.min(owe + speed * dt, speed * 0.25 + DT);   // never build up a backlog we can't run
    const t0 = sim.t;
    sim.advance(owe, 12);
    owe -= sim.t - t0;
    measured.sim += sim.t - t0;
  }
  measured.real += dt;
  if (measured.real >= 1) { actual = measured.sim / measured.real; measured.sim = measured.real = 0; }
  if (follow) { cam.x = follow.x - cv.width / cam.z / 2; cam.y = follow.y - cv.height / cam.z / 2; }
  paint();
  draw(speed <= 60 ? Math.max(0, Math.min(1, owe / DT)) : 1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
