#!/usr/bin/env node
// Refreshes data/era5.json with recent days from the Open-Meteo archive.
//
// The page reads this file instead of calling Open-Meteo on every visit.
// Open-Meteo weights requests by length (each 2 weeks of data counts as a
// call), so the full 1950–present history costs roughly 2,000 calls against
// a 10,000/day free limit. This script fetches only a trailing window,
// which also picks up ERA5 revisions to recent days.
//
// Usage: node scripts/update-era5.mjs [path/to/era5.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LAT = 47.6205, LON = -117.5326;
export const WINDOW_DAYS = 90;

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function lastDataDate(daily) {
  for (let i = daily.time.length - 1; i >= 0; i--) {
    if (daily.snowfall_sum[i] !== null) return daily.time[i];
  }
  return null;
}

// Overlays `incoming` onto `existing`. An incoming null never replaces a
// value (it means "not available yet"). Returns a contiguous daily series
// from the existing start to the later of the two end dates.
export function merge(existing, incoming) {
  const byDate = new Map();
  existing.time.forEach((t, i) => byDate.set(t, existing.snowfall_sum[i]));
  incoming.time.forEach((t, i) => {
    const v = incoming.snowfall_sum[i];
    if (v !== null || !byDate.has(t)) byDate.set(t, v);
  });
  const start = existing.time[0];
  const endA = existing.time[existing.time.length - 1];
  const endB = incoming.time.length ? incoming.time[incoming.time.length - 1] : endA;
  const end = endB > endA ? endB : endA;
  const time = [], snowfall_sum = [];
  for (let t = start; t <= end; t = addDays(t, 1)) {
    time.push(t);
    snowfall_sum.push(byDate.has(t) ? byDate.get(t) : null);
  }
  return { time, snowfall_sum };
}

export function archiveUrl(start, end) {
  return 'https://archive-api.open-meteo.com/v1/archive'
    + `?latitude=${LAT}&longitude=${LON}&start_date=${start}&end_date=${end}`
    + '&daily=snowfall_sum&models=era5&timezone=America%2FLos_Angeles';
}

export function validate(json) {
  const d = json && json.daily;
  if (!d || !Array.isArray(d.time) || !Array.isArray(d.snowfall_sum)
      || d.time.length !== d.snowfall_sum.length) {
    throw new Error('unexpected response shape');
  }
  const unit = json.daily_units && json.daily_units.snowfall_sum;
  if (unit !== 'cm') throw new Error(`unexpected snowfall unit: ${unit}`);
  return d;
}

export async function main(file, { fetchImpl = fetch, today = new Date() } = {}) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const last = lastDataDate(data.daily);
  if (!last) throw new Error(`${file} has no data`);
  const start = addDays(last, -WINDOW_DAYS);
  const end = addDays(today.toISOString().slice(0, 10), -1);
  if (start > end) {
    console.log(`Nothing to fetch (last data ${last}).`);
    return;
  }
  const url = archiveUrl(start, end);
  const res = await fetchImpl(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from Open-Meteo: ${body && body.reason}`);
  }
  const merged = merge(data.daily, validate(body));
  writeFileSync(file, JSON.stringify({ daily: merged }) + '\n');
  console.log(`Fetched ${start}..${end}; data now through ${lastDataDate(merged)}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2] || 'data/era5.json').catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
