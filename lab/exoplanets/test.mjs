// Run with: node lab/exoplanets/test.mjs
//
// Loads the committed TESS light curves, runs the same BLS code the page
// uses, and checks that the recovered period matches the NASA Exoplanet
// Archive's confirmed period for star 1 (obvious) and star 2 (harder).
// Star 3 is the mystery star for the user to solve by hand, so it isn't
// graded here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detrend, blsSearch } from "./bls.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "data");

function loadStar(slug) {
  return JSON.parse(readFileSync(join(dataDir, slug + ".json"), "utf8"));
}

function checkRecovery(slug, detrendWindowDays) {
  const star = loadStar(slug);
  const { time, flux, archive, planet_name } = star;
  const { flat } = detrend(time, flux, detrendWindowDays);

  const t0 = Date.now();
  const result = blsSearch(time, flat, {
    minPeriod: 0.3,
    maxPeriod: 15,
    periods: 4000,
  });
  const ms = Date.now() - t0;

  const truePeriod = archive.period_days;
  const pctError = Math.abs(result.bestPeriod - truePeriod) / truePeriod * 100;

  console.log(
    `${slug} (${planet_name}): archive period ${truePeriod.toFixed(5)} d, ` +
    `recovered ${result.bestPeriod.toFixed(5)} d, error ${pctError.toFixed(3)}% ` +
    `(${result.periods.length} trial periods, ${ms} ms)`
  );

  return { pctError, result, truePeriod };
}

let failures = 0;

function assertWithin(label, pctError, maxPct) {
  if (pctError > maxPct) {
    console.error(`FAIL: ${label} period error ${pctError.toFixed(3)}% exceeds ${maxPct}%`);
    failures++;
  } else {
    console.log(`PASS: ${label} within ${maxPct}% (actual ${pctError.toFixed(3)}%)`);
  }
}

console.log("Exoplanet Hunt: BLS recovery test\n");

const star1 = checkRecovery("qatar1", 0.5);
assertWithin("star1 (qatar1, guided)", star1.pctError, 1);

const star2 = checkRecovery("gj357", 0.5);
assertWithin("star2 (gj357, harder)", star2.pctError, 1);

// Sanity-only check on the mystery star: don't assert a tight tolerance
// since the user solves it blind, but make sure the module runs on it too.
const star3 = checkRecovery("hd189733", 0.5);
console.log(`(star3 mystery star, no assertion, error was ${star3.pctError.toFixed(3)}%)`);

console.log("");
if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("All tests passed.");
}
