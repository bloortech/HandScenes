// Browser side: draws the slab, plants and ants, and the HUD. All behaviour lives in sim.js.
(function () {
'use strict';
const { Sim, W, H, SURFACE, DT, DAY, CASTES, AIR, SOIL, OPEN, LOOSE, GARDEN } = AntSim;
const KEY = 'antfarm.atta.v2';
const SPEEDS = [[1, '1× real'], [10, '10×'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 hr/s'], [86400, '1 day/s']];
const $ = id => document.getElementById(id);

// ?mode=war&day=200&zoom=9 : start a fresh farm in that mode, fast-forwarded, zoomed in on the first queen.
const qs = new URLSearchParams(location.search);
const skipTo = +qs.get('day') || 0, urlMode = qs.get('mode'), zoomTo = +qs.get('zoom');
let sim = urlMode || skipTo ? null : load();
let speed = 60, paused = false, owe = 0, follow = null, trueSize = false;
let measured = { sim: 0, real: 0 }, actual = 0, lastLog = -1;

function load() {
  try { const s = localStorage.getItem(KEY); return s ? Sim.fromJSON(JSON.parse(s)) : null; }
  catch (e) { console.warn('could not restore farm', e); return null; }
}
function save() {
  if (!sim) return;
  try { localStorage.setItem(KEY, JSON.stringify(sim.toJSON())); }
  catch (e) { console.warn('save failed', e); }
}
setInterval(save, 15000);
addEventListener('beforeunload', save);

function start(mode) {
  sim = new Sim((Math.random() * 2 ** 31) | 0, mode);
  if (skipTo) sim.advance(skipTo * DAY - sim.t, Infinity);
  follow = null; lastLog = -1; $('chooser').style.display = 'none';
  buildViews(); fit(); save();
}

// ---------- canvas + camera ----------
const cv = $('farm'), ctx = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H;
const octx = off.getContext('2d'), img = octx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
const cam = { x: 0, y: 0, z: 1 };   // screen px = (world mm - cam) * z
let dpr = 1;
function resize() { dpr = devicePixelRatio || 1; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
function fit() {
  cam.z = Math.min(cv.width / W, cv.height / H);
  cam.x = -(cv.width / cam.z - W) / 2; cam.y = -(cv.height / cam.z - H) / 2;
}
function lookAt(x, y, z) { cam.z = z * dpr; cam.x = x - cv.width / cam.z / 2; cam.y = y - cv.height / cam.z / 2; }
addEventListener('resize', resize);   // keep the camera where you left it
resize(); fit();

// ---------- colours (ABGR for the little-endian pixel buffer) ----------
const pack = (r, g, b) => (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
const SOILS = [[86, 58, 40], [146, 70, 40], [170, 134, 88]];   // dark topsoil, red tropical clay, sand
const lut = (rgb, lo, hi) => Array.from({ length: 256 }, (_, s) => { const f = lo + (hi - lo) * s / 255; return pack(rgb[0] * f | 0, rgb[1] * f | 0, rgb[2] * f | 0); });
const SOIL_C = SOILS.map(c => lut(c, 0.62, 0.98));             // a touch darker so ants and tunnels read clearly
const LOOSE_C = SOILS.map(c => lut(c, 0.95, 1.3));
const OPEN_C = lut([44, 30, 22], 0.8, 1.15);
const GARDEN_C = lut([206, 202, 184], 0.85, 1.05);
const ROCK_C = lut([110, 106, 100], 0.75, 1.1);

function skyRows(t) {
  const h = (t % DAY) / 3600, day = Math.max(0, Math.min(1, Math.sin((h - 6) / 12 * Math.PI) * 1.6 + 0.3));
  const rows = new Uint32Array(SURFACE + 1);
  for (let y = 0; y <= SURFACE; y++) {
    const k = y / SURFACE, n = [12 + 8 * k, 16 + 10 * k, 32 + 14 * k], d = [120 + 60 * k, 165 + 45 * k, 215 + 20 * k];
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

// ---------- plants, corpses, ants ----------
const sx = x => (x - cam.x) * cam.z, sy = y => (y - cam.y) * cam.z;
function drawPlants() {
  for (const p of sim.plants) {
    const base = sim.colTop[Math.max(0, Math.min(W - 1, Math.round(p.x)))], f = p.leaves / p.max, z = cam.z;
    ctx.strokeStyle = '#5b3d22'; ctx.lineWidth = Math.max(1.5, 3 * z); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx(p.x), sy(base)); ctx.lineTo(sx(p.x), sy(base - p.h)); ctx.stroke();
    // branches stay, leaf clumps shrink and yellow as they're stripped
    const g = Math.round(90 + 70 * f), r = Math.round(150 - 90 * f);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + p.x, ox = Math.cos(a) * p.r * 0.7, oy = -p.h + Math.sin(a) * p.r * 0.45;
      ctx.beginPath(); ctx.lineWidth = Math.max(1, 1.5 * z);
      ctx.moveTo(sx(p.x), sy(base - p.h * 0.6)); ctx.lineTo(sx(p.x + ox), sy(base + oy)); ctx.stroke();
      const rad = p.r * 0.38 * Math.sqrt(Math.max(0.04, f)) * z;
      ctx.fillStyle = `rgba(${r},${g + (k % 3) * 12},${40 + (k % 2) * 14},.92)`;
      ctx.beginPath(); ctx.arc(sx(p.x + ox), sy(base + oy), rad, 0, 6.283); ctx.fill();
    }
  }
}
function drawCorpses() {
  for (const k of sim.corpses) {
    const age = (sim.t - k.t) / (2 * DAY), s = Math.max(3 * dpr, 4 * cam.z);
    ctx.strokeStyle = `rgba(20,14,10,${0.85 * (1 - age)})`; ctx.lineWidth = Math.max(1, s * 0.3);
    ctx.beginPath(); ctx.moveTo(sx(k.x) - s, sy(k.y) - s); ctx.lineTo(sx(k.x) + s, sy(k.y) + s);
    ctx.moveTo(sx(k.x) + s, sy(k.y) - s); ctx.lineTo(sx(k.x) - s, sy(k.y) + s); ctx.stroke();
  }
}
const ANT = [
  { queen: '#a63c14', major: '#bf4a1e', media: '#d65c28', minor: '#e46c32', minim: '#f08446' },   // Red
  { queen: '#a87a12', major: '#c4921c', media: '#ddb030', minor: '#ecc244', minim: '#f6d466' },   // Gold
];
const MIN_PX = { queen: 22, major: 16, media: 12, minor: 10, minim: 8 };   // drawn size when zoomed out (unless true size)
function antPos(a, alpha) {
  const jx = ((a.id * 7919) % 97) / 97 - 0.5, jy = ((a.id * 104729) % 89) / 89 - 0.5;
  const big = Math.abs(a.x - a.px) > 3 || Math.abs(a.y - a.py) > 3;   // don't smear across entering/exiting jumps
  const x = big ? a.x : a.px + (a.x - a.px) * alpha, y = big ? a.y : a.py + (a.y - a.py) * alpha;
  return [sx(x + 0.5 + jx * 0.6), sy(y + 0.5 + jy * 0.6)];
}
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fill(); ctx.stroke(); }
function drawAnt(a, alpha) {
  const [px, py] = antPos(a, alpha);
  if (px < -40 || py < -40 || px > cv.width + 40 || py > cv.height + 40) return;
  const real = CASTES[a.caste].len * cam.z, L = trueSize ? real : Math.max(real, MIN_PX[a.caste] * dpr);
  const col = ANT[a.col][a.caste];
  if (L < 3) { ctx.fillStyle = col; ctx.fillRect(px - 1, py - 1, 2, 2); return; }
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(a.hy, a.hx));
  if (a.state === 'fight') ctx.rotate(Math.sin(sim.t * 9 + a.id) * 0.5);      // grappling wobble
  ctx.strokeStyle = 'rgba(12,6,3,.9)'; ctx.lineWidth = Math.max(1, L * 0.07); ctx.fillStyle = col;
  if (L > 9) {   // legs and antennae
    ctx.beginPath();
    for (const lx of [-0.06, 0.02, 0.1]) for (const s of [-1, 1]) { ctx.moveTo(L * lx, 0); ctx.lineTo(L * (lx * 2.2 - 0.05), s * L * 0.3); }
    ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 0.62, -L * 0.2); ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 0.62, L * 0.2);
    ctx.stroke();
  }
  const q = a.caste === 'queen', head = a.caste === 'major' ? 0.2 : 0.14;
  ell(-L * 0.27, 0, L * (q ? 0.28 : 0.2), L * (q ? 0.17 : 0.13));
  ell(0.02 * L, 0, L * 0.15, L * 0.08);
  ell(L * 0.3, 0, L * head, L * head * 0.9);
  if (a.load) { ctx.fillStyle = '#c9a16e'; ell(L * 0.5, 0, L * 0.11, L * 0.11); }
  if (a.leaf) {
    ctx.fillStyle = '#62b23a'; ctx.beginPath();
    ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 0.05, -L * 0.85); ctx.lineTo(L * 0.8, -L * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  if (q) {   // queens get a soft ring so you can always find them
    ctx.strokeStyle = 'rgba(255,214,120,.7)'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(px, py, L * 0.75, 0, 6.283); ctx.stroke();
  }
}
function draw(alpha) {
  ctx.fillStyle = '#0b0907'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, sx(0), sy(0), W * cam.z, H * cam.z);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2 * dpr;   // the glass edge
  ctx.strokeRect(sx(0), sy(0), W * cam.z, H * cam.z);
  drawPlants(); drawCorpses();
  // resting ants first, busy ones on top so the action is never hidden under a crowd
  for (const a of sim.agents) if (a.state === 'rest' || a.state === 'settle') drawAnt(a, alpha);
  for (const a of sim.agents) if (a.state !== 'rest' && a.state !== 'settle') drawAnt(a, alpha);
  if (follow) {
    const [px, py] = antPos(follow, alpha);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.arc(px, py, 16 * dpr, 0, 6.283); ctx.stroke();
  }
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
  if (drag && !drag.moved && sim) pick(e.clientX * dpr, e.clientY * dpr);
  drag = null; cv.classList.remove('dragging');
});
function pick(px, py) {
  let best = null, bd = (16 * dpr) ** 2;
  for (const a of sim.agents) {
    const [ax, ay] = antPos(a, 1), d = (ax - px) ** 2 + (ay - py) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  follow = best;
}
addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  else if (e.key >= '1' && e.key <= '6') setSpeed(SPEEDS[+e.key - 1][0]);
  else if (e.key === 'f') { follow = null; fit(); }
  else if (e.key === 't') toggleSize();
  else if (e.key === 'h') document.body.classList.toggle('bare');
  else if (e.key === 'Escape') follow = null;
});

// ---------- HUD ----------
const speedBox = $('speeds');
for (const [v, label] of SPEEDS) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
  b.onclick = () => setSpeed(v); speedBox.appendChild(b);
}
function setSpeed(v) { speed = v; owe = 0; paused = false; refreshButtons(); }
function togglePause() { paused = !paused; refreshButtons(); }
function toggleSize() { trueSize = !trueSize; refreshButtons(); }
function refreshButtons() {
  for (const b of speedBox.children) b.classList.toggle('on', +b.dataset.v === speed && !paused);
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('size').classList.toggle('on', trueSize);
}
function buildViews() {   // camera shortcuts: whole farm, each queen, the plants
  const box = $('views'); box.innerHTML = '';
  const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; box.appendChild(b); };
  add('Whole farm', () => { follow = null; fit(); });
  for (const c of sim.colonies) add(sim.mode === 'war' ? `${c.name} queen` : 'Queen', () => {
    const q = sim.agents.find(a => a.id === c.queenId);
    if (q) { follow = q; lookAt(q.x, q.y, 6); }
  });
  add('Surface', () => { follow = null; lookAt(W / 2, SURFACE - 40, Math.max(1.4, cv.width / dpr / W)); });
}
$('pause').onclick = togglePause;
$('size').onclick = toggleSize;
$('reset').onclick = () => { $('chooser').style.display = 'block'; };
$('logtoggle').onclick = () => { $('log').classList.toggle('closed'); $('logtoggle').textContent = $('log').classList.contains('closed') ? 'Diary ▸' : 'Diary ▾'; };
for (const b of document.querySelectorAll('#chooser .opt')) b.onclick = () => start(b.dataset.mode);
refreshButtons();

const PHASE = { landing: 'just landed', digging: 'queen digging', claustral: 'sealed in', opening: 'digging out', open: 'open' };
const STATE = {
  toWork: 'walking to the dig face', dig: 'digging', carry: 'carrying soil out', dump: 'dumping soil on the mound',
  home: 'heading back in', fOut: 'heading out to forage', fWalk: 'walking to a plant', cut: 'cutting a leaf',
  fHome: 'bringing a leaf home', fIn: 'taking the leaf to the garden', toRest: 'going to the garden', settle: 'finding a spot',
  rest: 'resting / tending fungus', land: 'shedding her wings', seal: 'plugging the shaft', pOut: 'answering the alarm',
  patrol: 'patrolling for enemies', fight: 'fighting!',
};
const clock = t => { const d = Math.floor(t / DAY), s = t % DAY; return `Day ${d} · ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; };
const fmtSpeed = v => v >= 86400 ? `${(v / 86400).toFixed(1)} days/s` : v >= 3600 ? `${(v / 3600).toFixed(1)} hr/s` : v >= 60 ? `${(v / 60).toFixed(1)} min/s` : `${v.toFixed(1)}×`;
const cls = c => sim.mode === 'war' ? (c.id ? 'gold' : 'red') : '';
function hud() {
  if (!sim) return;
  $('clock').textContent = clock(sim.t);
  $('speedline').textContent = paused ? 'paused' : `running at ${fmtSpeed(actual)}` + (actual < speed * 0.8 ? ` (asked ${fmtSpeed(speed)}, CPU-limited)` : '');
  const cs = sim.colonies, war = sim.mode === 'war';
  const row = (label, f) => `<tr><td>${label}</td>${cs.map(c => `<td class="${cls(c)}">${f(c)}</td>`).join('')}</tr>`;
  const deep = c => sim.chambersOf(c).reduce((m, ch) => Math.max(m, ch.cy - SURFACE), 0);
  $('stats').innerHTML =
    (war ? `<tr><th></th>${cs.map(c => `<th class="${cls(c)}">${c.name}</th>`).join('')}</tr>` : '') +
    row('Status', c => c.gone ? 'gone' : c.dead ? 'queen dead' : PHASE[c.phase]) +
    row('Workers', c => Math.round(c.workers).toLocaleString()) +
    row('Brood', c => Math.round(c.brood.reduce((a, b) => a + b, 0)).toLocaleString()) +
    row('Chambers', c => { const n = sim.chambersOf(c).length; return n ? `${n} · ${(deep(c) / 10).toFixed(0)} cm` : '0'; }) +
    row('Fungus', c => `${Math.round(100 * Math.min(1.5, c.stats.garden / c.gardenTarget))}% fed`) +
    row('Leaves in', c => c.stats.leaves.toLocaleString()) +
    row('Dig / forage / rest', c => `${c.roles.dig}/${c.roles.forage}/${c.roles.rest}`) +
    (war ? row('Soldiers out', c => c.roles.defend) + row('Lost in battle', c => Math.round(c.stats.deaths)) + row('Kills', c => Math.round(c.stats.kills)) : '') +
    row('Starved', c => Math.round(c.stats.starved)) +
    row('1 dot =', c => c.scale > 1.05 ? `${c.scale.toFixed(1)} ants` : '1 ant');
  $('plants').innerHTML = 'Food plants' + sim.plants.map(p => `<span class="bar"><i style="width:${(100 * p.leaves / p.max).toFixed(0)}%"></i></span>`).join('');
  if (sim.log.length !== lastLog || lastLog < 0) {
    lastLog = sim.log.length;
    $('entries').innerHTML = sim.log.slice().reverse().map(e =>
      `<div class="${e.col < 0 || !war ? '' : e.col ? 'gold' : 'red'}"><b>${clock(e.t)}</b><br>${e.msg}</div>`).join('');
  }
  if (follow && (follow.dead || !sim.agents.includes(follow))) follow = null;
  $('ant').style.display = follow ? 'block' : 'none';
  if (follow) $('antinfo').innerHTML = `<b class="${war ? (follow.col ? 'gold' : 'red') : ''}">${war ? sim.colonies[follow.col].name + ' ' : ''}${follow.caste}</b> · ${CASTES[follow.caste].len} mm<br>${STATE[follow.state] || follow.state}` +
    `<br>${follow.y < SURFACE ? 'on the surface' : `depth ${((follow.y - SURFACE) / 10).toFixed(1)} cm`}`;
}
setInterval(hud, 250);

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (sim) {
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
  }
  requestAnimationFrame(frame);
}

if (urlMode || skipTo) start(urlMode === 'war' ? 'war' : 'solo');
else if (sim) buildViews();
else $('chooser').style.display = 'block';
if (sim && zoomTo) { const q = sim.agents.find(a => a.caste === 'queen'); if (q) lookAt(q.x, q.y, zoomTo); }
requestAnimationFrame(frame);
})();
