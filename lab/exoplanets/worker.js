// Runs the BLS period search off the main thread so the page stays
// responsive while the periodogram fills in. Module worker, no DOM access.
import { blsSearch } from "./bls.mjs";

self.onmessage = (ev) => {
  const { time, flux, minPeriod, maxPeriod, periods } = ev.data;
  try {
    const result = blsSearch(time, flux, {
      minPeriod,
      maxPeriod,
      periods,
      onProgress: (done, total, power, periodGrid) => {
        self.postMessage({
          type: "progress",
          done,
          total,
          power: power.slice(0, done),
          periods: periodGrid.slice(0, done),
        });
      },
    });
    self.postMessage({
      type: "done",
      periods: result.periods,
      power: result.power,
      bestPeriod: result.bestPeriod,
      bestPower: result.bestPower,
      bestDuration: result.bestDuration,
      bestDepth: result.bestDepth,
      bestT0: result.bestT0,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
