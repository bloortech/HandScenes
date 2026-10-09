// Box Least Squares (BLS) period search, plain JS, no DOM.
// Used by both the page (inside a Web Worker) and the test script, so this
// file must never touch window/document/canvas.
//
// The idea: a transiting planet makes a short, flat-bottomed dip once per
// orbit. BLS tries many candidate periods. For each one, it folds the light
// curve (lines every orbit up on top of each other) and slides a "box" of a
// few trial widths around the folded curve, looking for the position where
// the points inside the box are reliably fainter than the points outside.
// The period whose best box fits deepest and cleanest wins.

/**
 * Detrend a light curve with a moving median, then divide it out so the
 * star's slow brightness drifts (spots, instrument drift) don't swamp the
 * tiny transit dip.
 * @param {number[]} time - days
 * @param {number[]} flux - relative flux, ~1.0 out of transit
 * @param {number} windowDays - width of the moving-median window, in days
 * @returns {{trend: number[], flat: number[]}}
 */
export function detrend(time, flux, windowDays) {
  const n = time.length;
  const trend = new Array(n);
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    const t = time[i];
    while (lo < n && time[lo] < t - windowDays / 2) lo++;
    while (hi < n && time[hi] <= t + windowDays / 2) hi++;
    trend[i] = medianOf(flux, lo, hi);
  }
  const flat = new Array(n);
  for (let i = 0; i < n; i++) {
    flat[i] = trend[i] ? flux[i] / trend[i] : 1;
  }
  return { trend, flat };
}

function medianOf(arr, lo, hi) {
  if (hi <= lo) return 1;
  const slice = arr.slice(lo, hi).sort((a, b) => a - b);
  const mid = slice.length >> 1;
  return slice.length % 2 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
}

function logGrid(lo, hi, n) {
  const out = new Array(n);
  const logLo = Math.log(lo), logHi = Math.log(hi);
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0 : i / (n - 1);
    out[i] = Math.exp(logLo + frac * (logHi - logLo));
  }
  return out;
}

/** Default trial transit durations, in hours, used by blsSearch. */
export const DEFAULT_DURATIONS_HOURS = [0.5, 1, 1.5, 2, 3, 4, 6];

/**
 * One BLS power evaluation for a single trial period: fold the data on
 * that period, then for every trial duration slide a box across the
 * sorted phase with a two-pointer sweep (O(n) per duration, not O(n^2)).
 */
function evalPeriod(time, flux, n, sumAll, period, durationsDays) {
  const phase = new Array(n);
  const t0ref = time[0];
  for (let i = 0; i < n; i++) {
    let ph = ((time[i] - t0ref) % period) / period;
    if (ph < 0) ph += 1;
    phase[i] = ph;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => phase[a] - phase[b]);
  const sPhase = new Array(2 * n);
  const sFlux = new Array(2 * n);
  for (let i = 0; i < n; i++) {
    sPhase[i] = phase[order[i]];
    sFlux[i] = flux[order[i]];
    sPhase[i + n] = sPhase[i] + 1;
    sFlux[i + n] = sFlux[i];
  }

  let best = { power: 0, duration: durationsDays[0], depth: 0, phaseStart: 0 };

  for (const durDays of durationsDays) {
    const durPhase = durDays / period;
    if (durPhase >= 0.5) continue;

    let end = 0, inSum = 0, inCount = 0;
    for (let j = 0; j < n; j++) {
      // remove the previous window start if it fell out
      if (j > 0) {
        inSum -= sFlux[j - 1];
        inCount -= 1;
      }
      if (end < j) { end = j; inSum = 0; inCount = 0; }
      while (end < j + n && sPhase[end] - sPhase[j] < durPhase) {
        inSum += sFlux[end];
        inCount += 1;
        end++;
      }
      if (inCount < 3 || inCount > n * 0.5) continue;
      const inMean = inSum / inCount;
      const outCount = n - inCount;
      const outMean = (sumAll - inSum) / outCount;
      const depth = outMean - inMean;
      if (depth <= 0) continue;
      const r = inCount / n;
      const power = depth * depth * r * (1 - r);
      if (power > best.power) {
        best = { power, duration: durDays, depth, phaseStart: sPhase[j] };
      }
    }
  }
  return best;
}

/**
 * Run a BLS period search over a log-spaced period grid.
 * @param {number[]} time
 * @param {number[]} flux - flattened (detrended) flux, ~1.0 out of transit
 * @param {object} opts
 * @param {number} opts.minPeriod
 * @param {number} opts.maxPeriod
 * @param {number} opts.periods - how many trial periods to test
 * @param {number[]} [opts.durationsDays] - trial transit durations, in days
 * @param {function} [opts.onProgress] - called with (doneCount, total) occasionally
 * @returns {object} search result, including the periodogram and the best fit
 */
export function blsSearch(time, flux, opts) {
  const {
    minPeriod,
    maxPeriod,
    periods: nPeriods,
    durationsDays = DEFAULT_DURATIONS_HOURS.map((h) => h / 24),
    onProgress,
  } = opts;

  const n = time.length;
  const periodGrid = logGrid(minPeriod, maxPeriod, nPeriods);
  const power = new Array(nPeriods).fill(0);

  let sumAll = 0;
  for (let i = 0; i < n; i++) sumAll += flux[i];

  let bestPower = -Infinity;
  let bestPeriod = periodGrid[0];
  let bestDuration = durationsDays[0];
  let bestDepth = 0;
  let bestT0 = time[0];

  for (let p = 0; p < nPeriods; p++) {
    const period = periodGrid[p];
    const r = evalPeriod(time, flux, n, sumAll, period, durationsDays);
    power[p] = r.power;
    if (r.power > bestPower) {
      bestPower = r.power;
      bestPeriod = period;
      bestDuration = r.duration;
      bestDepth = r.depth;
      bestT0 = time[0] + r.phaseStart * period;
    }
    if (onProgress && (p % 20 === 0 || p === nPeriods - 1)) {
      onProgress(p + 1, nPeriods, power, periodGrid);
    }
  }

  return { periods: periodGrid, power, bestPeriod, bestPower, bestDuration, bestDepth, bestT0 };
}

/**
 * Fold a light curve on a period, returning phase (0..1) and flux sorted by
 * phase, for plotting. t0 shifts the fold so phase 0 lands on the transit.
 */
export function foldOnPeriod(time, flux, period, t0 = time[0]) {
  const n = time.length;
  const phase = new Array(n);
  for (let i = 0; i < n; i++) {
    let ph = ((time[i] - t0) % period) / period;
    if (ph < 0) ph += 1;
    // center the transit at phase 0.5 so it's easy to see mid-plot
    ph = (ph + 0.5) % 1;
    phase[i] = ph;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => phase[a] - phase[b]);
  return { phase: order.map((i) => phase[i]), flux: order.map((i) => flux[i]) };
}
