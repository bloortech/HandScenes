#!/usr/bin/env python3
"""
Fetch real TESS light curves (SPOC 2-min PDCSAP flux) from MAST for three
confirmed exoplanet host stars, plus their confirmed parameters from the
NASA Exoplanet Archive, and write small JSON files the browser page loads.

Run inside a throwaway venv:
    python3 -m venv /tmp/exo-venv
    source /tmp/exo-venv/bin/activate
    pip install lightkurve
    python3 lab/exoplanets/tools/fetch.py

Writes into lab/exoplanets/data/. Never commit the venv.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import warnings

import numpy as np

warnings.filterwarnings("ignore")

try:
    import lightkurve as lk
except ImportError:
    print("lightkurve not installed. pip install lightkurve first.", file=sys.stderr)
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

ARCHIVE_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"

# Three real, confirmed, TESS-observed planets.
#  1. qatar1  - obvious hot Jupiter, deep transit (2.1%), short period. Guided run.
#  2. gj357   - small planet, shallow transit (0.1%), harder to see.
#  3. hd189733 - "mystery" star for a blind solve, revealed at the end
#                (the famous "blue planet", a hot Jupiter with a deep transit).
TARGETS = [
    {
        "key": "star1",
        "slug": "qatar1",
        "label": "Star 1 (guided): Qatar-1",
        "pl_name": "Qatar-1 b",
        "tic": "TIC 236887394",
        "sectors": [17],
        "bin_minutes": 10,
        "role": "guided",
    },
    {
        "key": "star2",
        "slug": "gj357",
        "label": "Star 2 (harder): GJ 357",
        "pl_name": "GJ 357 b",
        "tic": "TIC 413248763",
        "sectors": [8, 35],
        "bin_minutes": 8,
        "role": "harder",
    },
    {
        "key": "star3",
        "slug": "hd189733",
        "label": "Star 3 (mystery)",
        "pl_name": "HD 189733 b",
        "tic": "TIC 256364928",
        "sectors": [41],
        "bin_minutes": 10,
        "role": "mystery",
    },
]


def archive_lookup(pl_name):
    """Pull confirmed parameters for one planet from the NASA Exoplanet Archive
    (pscomppars = the archive's single best-parameter-set-per-planet table)."""
    fields = [
        "pl_name", "hostname", "pl_orbper", "pl_orbpererr1", "pl_rade", "pl_radj",
        "pl_ratror", "pl_trandep", "pl_trandur", "pl_orbsmax", "pl_eqt",
        "st_rad", "st_mass", "st_teff", "ra", "dec", "tic_id",
    ]
    query = "select {} from pscomppars where pl_name = '{}'".format(
        ",".join(fields), pl_name
    )
    params = urllib.parse.urlencode({"query": query, "format": "json"})
    url = ARCHIVE_TAP + "?" + params
    with urllib.request.urlopen(url, timeout=30) as r:
        rows = json.loads(r.read())
    if not rows:
        raise RuntimeError("No archive row for " + pl_name)
    return rows[0]


def fetch_lightcurve(tic, sectors, bin_minutes):
    """Download SPOC 2-min PDCSAP flux for the given sectors, stitch, clean,
    normalize, and bin to keep the file small."""
    sr = lk.search_lightcurve(tic, author="SPOC", exptime=120)
    if len(sr) == 0:
        raise RuntimeError("No SPOC 2-min light curves found for " + tic)

    missions = [int(m.split()[-1]) for m in sr.table["mission"]]
    wanted_idx = [i for i, s in enumerate(missions) if s in sectors]
    if not wanted_idx:
        raise RuntimeError(
            "None of sectors {} available for {} (have {})".format(sectors, tic, missions)
        )

    lcs = []
    for i in wanted_idx:
        lc = sr[i].download(flux_column="pdcsap_flux")
        lcs.append(lc)

    if len(lcs) == 1:
        stitched = lcs[0]
    else:
        stitched = lk.LightCurveCollection(lcs).stitch()

    stitched = stitched.remove_nans().remove_outliers(sigma=6)
    stitched = stitched.normalize()

    binned = stitched.bin(time_bin_size=bin_minutes / 1440.0 * 1.0)  # minutes -> days
    binned = binned.remove_nans()

    t = np.asarray(binned.time.value, dtype=float)
    f = np.asarray(binned.flux.value, dtype=float)
    e = np.asarray(binned.flux_err.value, dtype=float)

    good = np.isfinite(t) & np.isfinite(f) & np.isfinite(e)
    t, f, e = t[good], f[good], e[good]

    t0 = float(t[0])
    t = t - t0

    return t, f, e, t0


def main():
    index = []
    for target in TARGETS:
        print("=== {} ({}) ===".format(target["label"], target["pl_name"]))

        print("  querying NASA Exoplanet Archive...")
        row = archive_lookup(target["pl_name"])

        print("  downloading TESS sectors {} for {}...".format(target["sectors"], target["tic"]))
        t, f, e, t0 = fetch_lightcurve(target["tic"], target["sectors"], target["bin_minutes"])
        print("  {} points after cleaning + binning to {} min".format(len(t), target["bin_minutes"]))

        out = {
            "key": target["key"],
            "role": target["role"],
            "label": target["label"],
            "planet_name": row["pl_name"],
            "host_name": row["hostname"],
            "tic": target["tic"],
            "sectors": target["sectors"],
            "bin_minutes": target["bin_minutes"],
            "bjd_offset": t0,
            "star": {
                "radius_rsun": row["st_rad"],
                "mass_msun": row["st_mass"],
                "teff_k": row["st_teff"],
            },
            "archive": {
                "period_days": row["pl_orbper"],
                "transit_depth_pct": row["pl_trandep"],
                "rp_rs": row["pl_ratror"],
                "rp_rearth": row["pl_rade"],
                "rp_rjup": row["pl_radj"],
                "transit_dur_hours": row["pl_trandur"],
                "a_au": row["pl_orbsmax"],
                "eq_temp_k": row["pl_eqt"],
                "source_url": "https://exoplanetarchive.ipac.caltech.edu/overview/"
                + urllib.parse.quote(row["hostname"]),
            },
            "time": [round(x, 6) for x in t.tolist()],
            "flux": [round(x, 6) for x in f.tolist()],
            "flux_err": [round(x, 6) for x in e.tolist()],
        }

        path = os.path.join(DATA_DIR, target["slug"] + ".json")
        with open(path, "w") as fh:
            json.dump(out, fh, separators=(",", ":"))
        size_kb = os.path.getsize(path) / 1024.0
        print("  wrote {} ({:.1f} KB)".format(path, size_kb))

        index.append({
            "key": target["key"],
            "role": target["role"],
            "label": target["label"],
            "file": target["slug"] + ".json",
        })

    index_path = os.path.join(DATA_DIR, "index.json")
    with open(index_path, "w") as fh:
        json.dump(index, fh, indent=2)
    print("wrote", index_path)


if __name__ == "__main__":
    main()
