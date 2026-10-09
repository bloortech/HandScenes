import { detrend, foldOnPeriod } from "./bls.mjs";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SEARCH_MIN_PERIOD = 0.3;
const SEARCH_MAX_PERIOD = 15;

const STARS = {
  qatar1: { file: "data/qatar1.json", mystery: false },
  gj357: { file: "data/gj357.json", mystery: false },
  hd189733: { file: "data/hd189733.json", mystery: true },
};

const state = {
  starKey: null,
  star: null,
  flat: null,
  trend: null,
  windowDays: 12 / 24,
  worker: null,
  bls: null, // { periods, power, bestPeriod, bestDuration, bestDepth, bestT0 }
  chosenPeriod: null,
  fold: null, // { phase, flux }
  handles: null, // { left, right, floor } in data units (phase, phase, flux)
  dragging: null,
  revealed: false,
};

const statusLine = document.getElementById("status-line");
function setStatus(msg) { statusLine.textContent = msg; }

// ---------- canvas helpers ----------

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceDomain(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

const MARGIN = { l: 8, r: 8, t: 10, b: 8 };

function mapper(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  return (v) => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
}

function drawScatter(canvas, xs, ys, { xDomain, yDomain, color = "rgba(237,237,230,0.55)", radius = 1.4 } = {}) {
  const { ctx, w, h } = fitCanvas(canvas);
  const xd = xDomain || niceDomain(xs);
  const yd = yDomain || niceDomain(ys);
  const xm = mapper(xd, [MARGIN.l, w - MARGIN.r]);
  const ym = mapper(yd, [h - MARGIN.b, MARGIN.t]);
  ctx.fillStyle = color;
  for (let i = 0; i < xs.length; i++) {
    const px = xm(xs[i]), py = ym(ys[i]);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return { ctx, w, h, xd, yd, xm, ym };
}

function drawLineOver(plotCtx, xs, ys, color, width = 1.5, breakGap = null) {
  const { ctx, xm, ym } = plotCtx;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const px = xm(xs[i]), py = ym(ys[i]);
    const gapBreak = breakGap != null && i > 0 && (xs[i] - xs[i - 1]) > breakGap;
    if (i === 0 || gapBreak) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// ---------- step 1: raw ----------

function drawRaw() {
  const { time, flux } = state.star;
  drawScatter(document.getElementById("plot-raw"), time, flux, { color: "rgba(237,237,230,0.5)" });
  const span = (time[time.length - 1] - time[0]).toFixed(1);
  document.getElementById("raw-note").textContent =
    `${time.length} points over about ${span} days, TESS 2-minute cadence.`;
}

// ---------- step 2: detrend ----------

function recomputeDetrend() {
  const { time, flux } = state.star;
  const { trend, flat } = detrend(time, flux, state.windowDays);
  state.trend = trend;
  state.flat = flat;
}

function drawDetrend() {
  const { time, flux } = state.star;
  const p = drawScatter(document.getElementById("plot-trend"), time, flux, { color: "rgba(237,237,230,0.35)" });
  drawLineOver(p, time, state.trend, "#7CD5E8", 1.6, 1.0);
  drawScatter(document.getElementById("plot-flat"), time, state.flat, { color: "rgba(232,184,75,0.55)" });
}

// ---------- step 3: BLS search ----------

function drawPeriodogram(periods, power, highlightPeriod) {
  const canvas = document.getElementById("plot-periodogram");
  const xDomain = [SEARCH_MIN_PERIOD, SEARCH_MAX_PERIOD];
  const p = drawScatter(canvas, [], [], { xDomain, yDomain: niceDomain(power.length ? power : [0, 1]) });
  const { ctx, xm, ym, w, h } = p;
  ctx.strokeStyle = "#7CD5E8";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < power.length; i++) {
    const px = xm(periods[i]), py = ym(power[i]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  if (highlightPeriod != null) {
    const px = xm(highlightPeriod);
    ctx.strokeStyle = "#E8B84B";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, MARGIN.t);
    ctx.lineTo(px, h - MARGIN.b);
    ctx.stroke();
  }
  return { periods, xDomain, w, h, xm };
}

function runSearch() {
  const btn = document.getElementById("search-btn");
  btn.disabled = true;
  document.getElementById("search-status").textContent = "searching...";
  const bar = document.getElementById("search-progress");
  bar.style.width = "0%";

  const worker = new Worker("worker.js", { type: "module" });
  state.worker = worker;
  const { time } = state.star;

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "progress") {
      bar.style.width = (100 * msg.done / msg.total).toFixed(1) + "%";
      drawPeriodogram(msg.periods, msg.power);
    } else if (msg.type === "done") {
      state.bls = msg;
      state.periodGrid = msg.periods;
      bar.style.width = "100%";
      document.getElementById("search-status").textContent =
        `done. ${msg.periods.length} periods tried, best so far at ${msg.bestPeriod.toFixed(4)} d. Click the tallest peak.`;
      drawPeriodogram(msg.periods, msg.power, null);
      state.lastPeriodogram = { periods: msg.periods, power: msg.power };
      btn.disabled = false;
      enablePeriodogramClick();
    } else if (msg.type === "error") {
      document.getElementById("search-status").textContent = "error: " + msg.message;
      btn.disabled = false;
    }
  };

  worker.postMessage({
    time,
    flux: state.flat,
    minPeriod: SEARCH_MIN_PERIOD,
    maxPeriod: SEARCH_MAX_PERIOD,
    periods: 3000,
  });
}

function enablePeriodogramClick() {
  const canvas = document.getElementById("plot-periodogram");
  canvas.style.cursor = "pointer";
  canvas.onclick = (ev) => {
    if (!state.lastPeriodogram) return;
    const rect = canvas.getBoundingClientRect();
    const xFrac = (ev.clientX - rect.left - MARGIN.l) / (rect.width - MARGIN.l - MARGIN.r);
    const { periods, power } = state.lastPeriodogram;
    const xDomain = [periods[0], periods[periods.length - 1]];
    const clickedPeriod = xDomain[0] + xFrac * (xDomain[1] - xDomain[0]);
    // snap to the highest power within a small window around the click
    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < periods.length; i++) {
      const dist = Math.abs(periods[i] - clickedPeriod) / clickedPeriod;
      if (dist < 0.03 && power[i] > bestVal) { bestVal = power[i]; bestIdx = i; }
    }
    state.chosenPeriod = periods[bestIdx];
    drawPeriodogram(periods, power, state.chosenPeriod);
    document.getElementById("period-pick-note").textContent =
      `Picked ${state.chosenPeriod.toFixed(4)} days. Fine-tune it in step 4.`;
    unlockFold();
  };
}

// ---------- step 4: fold ----------

function unlockFold() {
  document.getElementById("step4").dataset.locked = "false";
  document.getElementById("step5").dataset.locked = "false";

  const period = state.chosenPeriod;
  const slider = document.getElementById("period-slider");
  slider.min = (period * 0.85).toFixed(5);
  slider.max = (period * 1.15).toFixed(5);
  slider.step = (period * 0.0005).toFixed(6);
  slider.value = period;
  document.getElementById("period-val").textContent = period.toFixed(4) + " d";

  const durPhase = Math.min(0.45, state.bls.bestDuration / period);
  state.handles = {
    left: 0.5 - durPhase / 2,
    right: 0.5 + durPhase / 2,
    floor: 1 - state.bls.bestDepth,
  };
  drawFold();
  updateMeasurements();
}

function computeFold(period) {
  const { time } = state.star;
  state.fold = foldOnPeriod(time, state.flat, period, state.bls.bestT0);
  return state.fold;
}

let foldPlotCache = null;

function drawFold() {
  const period = parseFloat(document.getElementById("period-slider").value) || state.chosenPeriod;
  const { phase, flux } = computeFold(period);
  const canvas = document.getElementById("plot-fold");
  const p = drawScatter(canvas, phase, flux, {
    xDomain: [0, 1],
    color: "rgba(237,237,230,0.5)",
  });
  foldPlotCache = p;
  const { ctx, xm, ym, w, h } = p;
  const { left, right, floor } = state.handles;

  // duration handles (vertical)
  ctx.strokeStyle = "#7CD5E8";
  ctx.lineWidth = 1.5;
  for (const ph of [left, right]) {
    const px = xm(ph);
    ctx.beginPath();
    ctx.moveTo(px, MARGIN.t);
    ctx.lineTo(px, h - MARGIN.b);
    ctx.stroke();
  }
  // shade the marked box
  ctx.fillStyle = "rgba(124,213,232,0.08)";
  ctx.fillRect(xm(left), MARGIN.t, xm(right) - xm(left), h - MARGIN.t - MARGIN.b);

  // depth handle (horizontal), plus the baseline for reference
  ctx.strokeStyle = "rgba(237,237,230,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN.l, ym(1));
  ctx.lineTo(w - MARGIN.r, ym(1));
  ctx.stroke();

  ctx.strokeStyle = "#E8B84B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN.l, ym(floor));
  ctx.lineTo(w - MARGIN.r, ym(floor));
  ctx.stroke();

  updateMarkReadouts(period);
}

function updateMarkReadouts(period) {
  const { left, right, floor } = state.handles;
  const depth = 1 - floor;
  const durHours = (right - left) * period * 24;
  document.getElementById("mark-depth").textContent = (depth * 100).toFixed(3) + " %";
  document.getElementById("mark-duration").textContent = durHours.toFixed(2) + " h";
}

function setupFoldDragging() {
  const canvas = document.getElementById("plot-fold");
  const HIT_PX = 14;

  function pointerToHandle(ev) {
    if (!foldPlotCache) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const { xm, ym } = foldPlotCache;
    const { left, right, floor } = state.handles;
    const candidates = [
      { name: "left", dist: Math.abs(px - xm(left)) },
      { name: "right", dist: Math.abs(px - xm(right)) },
      { name: "floor", dist: Math.abs(py - ym(floor)) },
    ];
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].dist <= HIT_PX ? candidates[0].name : null;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (document.getElementById("step4").dataset.locked === "true") return;
    const handle = pointerToHandle(ev);
    if (handle) {
      state.dragging = handle;
      canvas.setPointerCapture(ev.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!state.dragging || !foldPlotCache) return;
    const rect = canvas.getBoundingClientRect();
    const { xm, ym, xd, yd, w, h } = foldPlotCache;
    const invX = (px) => xd[0] + (px - MARGIN.l) / (w - MARGIN.l - MARGIN.r) * (xd[1] - xd[0]);
    const invY = (py) => yd[1] - (py - MARGIN.t) / (h - MARGIN.t - MARGIN.b) * (yd[1] - yd[0]);
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    if (state.dragging === "left") {
      state.handles.left = Math.min(invX(px), state.handles.right - 0.005);
    } else if (state.dragging === "right") {
      state.handles.right = Math.max(invX(px), state.handles.left + 0.005);
    } else if (state.dragging === "floor") {
      state.handles.floor = Math.min(1, invY(py));
    }
    drawFold();
    updateMeasurements();
  });

  function endDrag() { state.dragging = null; }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

document.getElementById("period-slider").addEventListener("input", (ev) => {
  document.getElementById("period-val").textContent = parseFloat(ev.target.value).toFixed(4) + " d";
  drawFold();
  updateMeasurements();
});

// ---------- step 5: measure ----------

const RSUN_REARTH = 109.2;
const RSUN_RJUP = 9.731;
const RSUN_AU = 0.00465047;
const DAYS_PER_YEAR = 365.25;

function fmt(x, digits = 3) {
  if (x == null || !isFinite(x)) return "–";
  return x.toPrecision(digits);
}

function pctError(computed, archive) {
  if (archive == null || !isFinite(archive) || archive === 0) return null;
  return Math.abs(computed - archive) / Math.abs(archive) * 100;
}

function updateMeasurements() {
  if (!state.handles || !state.star) return;
  const period = parseFloat(document.getElementById("period-slider").value) || state.chosenPeriod;
  const depth = 1 - state.handles.floor;
  const { radius_rsun, mass_msun, teff_k } = state.star.star;

  const rpRearth = radius_rsun * Math.sqrt(Math.max(depth, 0)) * RSUN_REARTH;
  const rpRjup = radius_rsun * Math.sqrt(Math.max(depth, 0)) * RSUN_RJUP;

  const periodYears = period / DAYS_PER_YEAR;
  const aAu = Math.cbrt(mass_msun * periodYears * periodYears);

  const rStarAu = radius_rsun * RSUN_AU;
  const teq = teff_k * Math.sqrt(rStarAu / (2 * aAu));

  document.getElementById("formula-radius").innerHTML =
    `<b>Planet radius</b> = star radius × √depth<br>` +
    `= ${fmt(radius_rsun)} R☉ × √${fmt(depth)} = <span class="num">${fmt(rpRearth)} R⊕</span> ` +
    `(<span class="num">${fmt(rpRjup)} R♃</span>)`;

  document.getElementById("formula-orbit").innerHTML =
    `<b>Orbit distance</b> (Kepler's third law) = ∛(star mass × period²), period in years<br>` +
    `= ∛(${fmt(mass_msun)} M☉ × ${fmt(periodYears)}²) = <span class="num">${fmt(aAu)} AU</span>`;

  document.getElementById("formula-temp").innerHTML =
    `<b>Rough equilibrium temperature</b> = star temp × √(star radius / (2 × orbit distance))<br>` +
    `= ${fmt(teff_k, 4)} K × √(${fmt(rStarAu)} AU / (2 × ${fmt(aAu)} AU)) = <span class="num">${fmt(teq, 4)} K</span> ` +
    `<span class="hint">(assumes no clouds and even heating; real planets can run hotter or colder)</span>`;

  const archive = state.star.archive;
  const isMystery = STARS[state.starKey].mystery;
  const showArchive = !isMystery || state.revealed;

  const rows = [
    { label: "Period (days)", computed: period, archiveVal: archive.period_days },
    { label: "Planet radius (R⊕)", computed: rpRearth, archiveVal: archive.rp_rearth },
    { label: "Orbit distance (AU)", computed: aAu, archiveVal: archive.a_au },
  ];

  const tbody = document.getElementById("measure-body");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const err = showArchive ? pctError(row.computed, row.archiveVal) : null;
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>${fmt(row.computed)}</td>
      <td>${showArchive ? fmt(row.archiveVal) : "?"}</td>
      <td class="${err != null && err < 15 ? "err-good" : err != null ? "err-bad" : ""}">${err != null ? err.toFixed(1) + " %" : "–"}</td>
    `;
    tbody.appendChild(tr);
  }

  if (isMystery) {
    document.getElementById("reveal-controls").style.display = state.revealed ? "none" : "flex";
  } else {
    document.getElementById("reveal-controls").style.display = "none";
  }
}

document.getElementById("reveal-btn").addEventListener("click", () => {
  state.revealed = true;
  const archive = state.star.archive;
  const box = document.getElementById("reveal-box");
  box.classList.add("shown");
  document.getElementById("reveal-text").innerHTML =
    `This was <b>${state.star.host_name}</b>, and the planet is <b>${state.star.planet_name}</b>, ` +
    `a hot Jupiter known as the "blue planet" because its upper atmosphere scatters blue light. ` +
    `NASA Exoplanet Archive: <a href="${archive.source_url}" target="_blank" rel="noopener">${archive.source_url}</a>`;
  updateMeasurements();
});

// ---------- window slider ----------

document.getElementById("window-slider").addEventListener("input", (ev) => {
  const hours = parseFloat(ev.target.value);
  document.getElementById("window-val").textContent = hours + " h";
  state.windowDays = hours / 24;
  if (state.star) {
    recomputeDetrend();
    drawDetrend();
  }
});

// ---------- star picker ----------

async function loadStar(key) {
  setStatus("loading " + key + "...");
  const res = await fetch(STARS[key].file);
  if (!res.ok) throw new Error("failed to load " + STARS[key].file);
  const data = await res.json();

  state.starKey = key;
  state.star = data;
  state.chosenPeriod = null;
  state.bls = null;
  state.handles = null;
  state.revealed = false;
  state.lastPeriodogram = null;

  document.querySelectorAll(".picker button").forEach((b) => {
    b.classList.toggle("active", b.dataset.star === key);
  });

  for (const id of ["step1", "step2", "step3"]) {
    document.getElementById(id).dataset.locked = "false";
  }
  for (const id of ["step4", "step5"]) {
    document.getElementById(id).dataset.locked = "true";
  }
  document.getElementById("search-status").textContent = "";
  document.getElementById("search-progress").style.width = "0%";
  document.getElementById("period-pick-note").textContent = "Click the tallest peak once the search finishes.";
  document.getElementById("search-btn").disabled = false;
  document.getElementById("reveal-box").classList.remove("shown");

  recomputeDetrend();
  drawRaw();
  drawDetrend();
  drawPeriodogram([SEARCH_MIN_PERIOD, SEARCH_MAX_PERIOD], []);

  const mystery = STARS[key].mystery;
  setStatus(mystery
    ? `Loaded the mystery star. ${data.time.length} points. Work through the steps below, then reveal it.`
    : `Loaded ${data.host_name} (${data.planet_name}). ${data.time.length} points.`);
}

document.querySelectorAll(".picker button").forEach((btn) => {
  btn.addEventListener("click", () => loadStar(btn.dataset.star).catch((err) => setStatus("Error: " + err.message)));
});

document.getElementById("search-btn").addEventListener("click", runSearch);

setupFoldDragging();

window.addEventListener("resize", () => {
  if (!state.star) return;
  drawRaw();
  drawDetrend();
  if (state.lastPeriodogram) drawPeriodogram(state.lastPeriodogram.periods, state.lastPeriodogram.power, state.chosenPeriod);
  if (state.handles) drawFold();
});

// start on the guided star
loadStar("qatar1").catch((err) => setStatus("Error: " + err.message));
