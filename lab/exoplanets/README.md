# Exoplanet Hunt

Find a real exoplanet in real NASA TESS telescope data, by the transit method, in your browser.
Five interactive steps: raw light curve, detrend, a Box Least Squares period search, fold, and
measure. No build, no server-side code, no network calls at runtime (the data is pre-fetched and
committed as JSON, since the site's Content Security Policy only allows same-origin requests).

## Run it

    python serve.py      # from the handscenes root, then open http://localhost:8000/lab/exoplanets/
    node lab/exoplanets/test.mjs    # runs the same BLS code the page uses, checks the recovered
                                     # period against the NASA Exoplanet Archive for stars 1 and 2

## What's here

- `index.html`, `style.css`, `main.js`: the page.
- `bls.mjs`: the Box Least Squares period search and the moving-median detrend, plain JS with no
  DOM access, so the page and the test both import the exact same code.
- `worker.js`: runs the BLS search in a Web Worker so the periodogram fills in without freezing
  the page.
- `data/*.json`: the three stars' light curves plus their confirmed NASA Exoplanet Archive
  parameters. `data/index.json` is a small manifest of the three.
- `tools/fetch.py`: the script that built `data/*.json` (see below). Not used at runtime.
- `test.mjs`: `node lab/exoplanets/test.mjs`.

## The three stars

1. **Qatar-1** (guided): a hot Jupiter, Qatar-1 b, with a deep 2.14% transit on a 1.42 day orbit.
   Easy to spot even in the raw data. TESS sector 17.
2. **GJ 357** (harder): a small, close-in planet, GJ 357 b, with a shallow 0.1% transit on a 3.93
   day orbit. TESS sectors 8 and 35, stitched together for more transits.
3. **HD 189733** (mystery, solved blind then revealed): a hot Jupiter, HD 189733 b, the famous
   "blue planet." 2.4% transit depth, 2.22 day orbit. TESS sector 41.

All three are real, confirmed planets. Nothing in the data or the archive numbers is invented.

## How the data was fetched

    python3 -m venv /tmp/exo-venv
    source /tmp/exo-venv/bin/activate
    pip install lightkurve
    python3 lab/exoplanets/tools/fetch.py

`tools/fetch.py`:
1. Looks up each planet's confirmed parameters (period, depth, radius, orbit distance, equilibrium
   temperature, the host star's radius, mass and temperature) from the NASA Exoplanet Archive's
   TAP service (`pscomppars` table, one best parameter set per planet).
2. Downloads the SPOC 2-minute cadence PDCSAP (Pre-search Data Conditioned Simple Aperture
   Photometry) flux from MAST for the listed TESS sectors, using `lightkurve`.
3. Removes NaNs and sigma-clips outliers, normalizes to a median of 1.0, and bins to 8-10 minute
   cadence so each JSON file stays well under 400 KB (76-184 KB in practice) while keeping enough
   points across each ~1-2 hour transit to see its shape.
4. Writes one JSON per star with the light curve, the star's radius/mass/temperature, and the
   archive's planet parameters plus the archive URL as the source.

The venv is throwaway and isn't committed; `/tmp/exo-venv` or wherever you make it.

## Sources

- Light curves: NASA's TESS mission, SPOC pipeline, via MAST and the `lightkurve` package
  (STScI / NASA).
- Confirmed planet and star parameters: the NASA Exoplanet Archive, `pscomppars` table
  (https://exoplanetarchive.ipac.caltech.edu). Each star's page links the exact archive overview
  used.

## Method, honestly

The Box Least Squares search in `bls.mjs` is a simplified version of the real algorithm
(Kovács, Zucker & Mazeh 2002): it tries a log-spaced grid of candidate periods, and for each one
slides a box of a few trial durations across the phase-folded data using a two-pointer sweep,
scoring by depth² × (fraction in transit) × (fraction out of transit). It isn't noise-weighted
like the production BLS in `astropy.timeseries`, but it recovers the true period to well within
1% on all three stars (see `test.mjs`), which is enough for this to be a real measurement, not a
toy.

The equilibrium temperature formula assumes zero albedo and even heat redistribution, which is
never exactly true, so treat it as a rough estimate, as the page itself says.
