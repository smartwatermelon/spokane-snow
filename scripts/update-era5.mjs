#!/usr/bin/env node
// Refreshes data/era5.json with recent days from the Open-Meteo archive.
//
// The page reads this file instead of calling Open-Meteo on every visit.
// Open-Meteo weights requests by length (each 2 weeks of data counts as a
// call), so the full 1950–present history costs roughly 2,000 calls against
// a 10,000/day free limit. This script fetches only a trailing window,
// which also picks up ERA5 revisions to recent days.
//
// State between runs lives in the deployed site: `adopt` replaces the
// committed file with the currently deployed one when that is newer, so each
// run fetches only ~90 days and a failed fetch never rolls the site back.
//
// Usage:
//   node scripts/update-era5.mjs adopt   data/era5.json <deployed era5.json URL>
//   node scripts/update-era5.mjs refresh data/era5.json

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

// YYYY-MM-DD in America/Los_Angeles, the timezone the archive request uses.
export function laDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
}

export function isContiguous(daily) {
  for (let i = 1; i < daily.time.length; i++) {
    if (daily.time[i] !== addDays(daily.time[i - 1], 1)) return false;
  }
  return true;
}

function readDaily(file) {
  return JSON.parse(readFileSync(file, 'utf8')).daily;
}

// Replaces `file` with the deployed copy at `url` when that copy is a valid
// series with the same start date and later data. Returns true if adopted.
export async function adopt(file, url, { fetchImpl = fetch } = {}) {
  const current = readDaily(file);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const deployed = (await res.json()).daily;
  if (!deployed || !Array.isArray(deployed.time) || !Array.isArray(deployed.snowfall_sum)
      || deployed.time.length !== deployed.snowfall_sum.length
      || deployed.time[0] !== current.time[0] || !isContiguous(deployed)) {
    throw new Error(`deployed data at ${url} is not a valid series`);
  }
  const ours = lastDataDate(current), theirs = lastDataDate(deployed);
  if (!theirs || (ours && theirs <= ours)) {
    console.log(`Keeping committed data (through ${ours}; deployed through ${theirs}).`);
    return false;
  }
  writeFileSync(file, JSON.stringify({ daily: deployed }) + '\n');
  console.log(`Adopted deployed data (through ${theirs}; committed through ${ours}).`);
  return true;
}

export async function refresh(file, { fetchImpl = fetch, today = new Date() } = {}) {
  const daily = readDaily(file);
  const last = lastDataDate(daily);
  if (!last) throw new Error(`${file} has no data`);
  const start = addDays(last, -WINDOW_DAYS);
  const end = addDays(laDate(today), -1);
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
  const merged = merge(daily, validate(body));
  writeFileSync(file, JSON.stringify({ daily: merged }) + '\n');
  console.log(`Fetched ${start}..${end}; data now through ${lastDataDate(merged)}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file, url] = process.argv.slice(2);
  const run = cmd === 'adopt' && file && url ? adopt(file, url)
    : cmd === 'refresh' && file ? refresh(file)
    : Promise.reject(new Error('usage: update-era5.mjs adopt <file> <url> | refresh <file>'));
  run.catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
