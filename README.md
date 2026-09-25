# Spokane Snow Seasonality

When does winter start and end in Spokane? Not the winter solstice and spring equinox, but the first and last snow of the season?

This page tracks the last spring snowfall and the first fall snowfall near Spokane International Airport, every year since 1950, and adds climate-model projections out to 2050.

Live at <https://smartwatermelon.github.io/spokane-snow/>.

## What's on the page

The observed record is ERA5 reanalysis: daily snowfall for the roughly 25 km grid cell containing 47.62°N, 117.53°W, from 1950 to the latest day ERA5 has published. ERA5 is a model-based reconstruction, not a snow gauge at the airport.

The projections come from five high-resolution CMIP6 models: HiRAM-SIT-HR, MRI-AGCM3-2-S, EC-Earth3P-HR, MPI-ESM1-2-XR, and NICAM16-8S, under a high-emissions scenario. I shift each model so its 1950 to 2024 mean matches ERA5's, which means only the change over time comes from the model. The chart shows the median and the min/max band.

None of the trend text is written by hand. The page computes each statement from the data with a 95% interval, and says there's no clear trend when that interval includes zero.

A toggle sets what counts as a snowy day: any snowfall at all, at least 0.5 cm, or at least 1 cm. The answer moves a lot depending on which you pick. "Spring" runs Jan 1 through Jun 30, for our purposes, and "fall" runs Jul 1 through Dec 31. I leave out a season that isn't over yet.

## How the data gets here

The whole site is one static `index.html`, with Chart.js from cdnjs, served by GitHub Pages. The data ships with the page, so a visitor never calls Open-Meteo. Open-Meteo weights requests by length, so by its pricing formula one full-history load costs about 2,000 calls against a free limit of 10,000 a day per IP. I'd rather not spend a fifth of a visitor's daily quota on one page view.

| File | Contents | Updated |
| --- | --- | --- |
| `data/era5.json` | ERA5 daily `snowfall_sum` in cm, 1950 to present | Daily |
| `data/climate.json` | CMIP6 daily snowfall, 1950 to 2050 | Never |

`climate.json` is about 1.2 MB, so the page loads it only when you open
"Projections."

`.github/workflows/pages.yml` builds and deploys on every push to `main`, once a day at 14:23 UTC, and on manual dispatch. Each run:

1. Starts from the currently deployed `data/era5.json` when it holds later data than the committed copy (`scripts/update-era5.mjs adopt`).
2. Fetches the last 90 days from the Open-Meteo Historical API with
   `models=era5`, which also picks up ERA5's revisions to recent days
   (`scripts/update-era5.mjs refresh`).
3. Deploys the result.

`main` is protected, so the bot can't commit the new data back. The state between runs lives in the deployed site instead. If a data step fails, the run logs a warning and deploys whatever data it already has, so a bad fetch never rolls the site back.

## Running it locally

`index.html` loads its data with `fetch`, which doesn't work from a
`file://` URL. Serve the directory:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

The updater has tests, and no dependencies beyond Node:

```sh
node --test scripts/update-era5.test.mjs
```

## Sources

- ERA5: Hersbach et al. (2020), via the
  [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api).
- CMIP6: via the
  [Open-Meteo Climate API](https://open-meteo.com/en/docs/climate-api),
  CC BY 4.0.

Made by [Andrew Rich](https://projectinsomnia.com/).
