# Spokane Snow Seasonality

When does winter end in Spokane? This page tracks the last spring snowfall
and the first fall snowfall near Spokane International Airport since 1950,
with climate-model projections to 2050.

**Live:** <https://smartwatermelon.github.io/spokane-snow/>

## What it shows

- **Observed record, 1950 to present.** Daily snowfall from the ERA5
  reanalysis for the ~25 km grid cell containing 47.62°N, 117.53°W. ERA5 is
  a model-based reconstruction, not a station snow gauge.
- **Projections to 2050.** Five high-resolution CMIP6 models (HiRAM-SIT-HR,
  MRI-AGCM3-2-S, EC-Earth3P-HR, MPI-ESM1-2-XR, NICAM16-8S) under a
  high-emissions scenario. Each model is shifted so its 1950–2024 mean
  matches ERA5's; only the change over time comes from the model. The chart
  shows the median and the min/max band.
- **Trend text computed from the data.** Each annotation reports a 95%
  interval and says "no clear trend" when that interval includes zero.
- **Minimum-snowfall toggle.** A day counts as snowy at any amount,
  ≥0.5 cm, or ≥1 cm.

Spring is Jan 1–Jun 30 and fall is Jul 1–Dec 31. Seasons still in progress
are left out.

## How it works

The site is a single static `index.html` (Chart.js from cdnjs) served by
GitHub Pages. The data ships with the page, so visitors never call
Open-Meteo:

| File | Contents | Updated |
| --- | --- | --- |
| `data/era5.json` | ERA5 daily `snowfall_sum` (cm), 1950 to present | Daily |
| `data/climate.json` | CMIP6 daily snowfall, 1950–2050 | Never (static) |

`climate.json` loads only when the viewer opens "Projections".

`.github/workflows/pages.yml` builds and deploys the site on every push to
`main`, once a day at 14:23 UTC, and on manual dispatch. Each run:

1. **Adopts** the currently deployed `data/era5.json` when it holds later
   data than the committed copy (`scripts/update-era5.mjs adopt`).
2. **Refreshes** the last 90 days from the Open-Meteo Historical API with
   `models=era5`, which also picks up ERA5 revisions to recent days
   (`scripts/update-era5.mjs refresh`).
3. **Deploys** the result.

State between runs lives in the deployed site, not in commits. A failed
data step logs a warning, and the deploy still goes ahead with the data it
has.

## Local development

`index.html` loads its data with `fetch`, so serve the directory instead of
opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Run the updater tests (Node, no dependencies):

```sh
node --test scripts/update-era5.test.mjs
```

## Data sources

- ERA5: Hersbach et al. (2020), via the
  [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api).
- CMIP6 projections: via the
  [Open-Meteo Climate API](https://open-meteo.com/en/docs/climate-api)
  (CC BY 4.0).

---

By [Andrew Rich](https://projectinsomnia.com/).
