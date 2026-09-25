// Tests for scripts/update-era5.mjs. Run: node --test scripts/update-era5.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDays, lastDataDate, merge, validate, archiveUrl, main } from './update-era5.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/era5.json', import.meta.url), 'utf8')).daily;

function slice(daily, from, to) {
  const out = { time: [], snowfall_sum: [] };
  daily.time.forEach((t, i) => {
    if (t >= from && t <= to) { out.time.push(t); out.snowfall_sum.push(daily.snowfall_sum[i]); }
  });
  return out;
}

test('seed file is a contiguous daily series from 1950', () => {
  assert.equal(seed.time[0], '1950-01-01');
  assert.equal(seed.time.length, seed.snowfall_sum.length);
  for (let i = 1; i < seed.time.length; i++) {
    assert.equal(seed.time[i], addDays(seed.time[i - 1], 1), `gap after ${seed.time[i - 1]}`);
  }
});

test('addDays crosses month, year, and leap-day boundaries', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('lastDataDate skips trailing nulls', () => {
  assert.equal(lastDataDate({ time: ['a', 'b', 'c'], snowfall_sum: [0, 1.2, null] }), 'b');
  assert.equal(lastDataDate({ time: ['a'], snowfall_sum: [null] }), null);
});

test('truncated history plus a trailing window rebuilds the original', () => {
  const end = seed.time[seed.time.length - 1];
  const truncated = slice(seed, '1950-01-01', '2026-08-01');
  const windowed = slice(seed, addDays('2026-08-01', -90), end);
  assert.deepEqual(merge(truncated, windowed), seed);
});

test('an incoming null does not erase an existing value', () => {
  const existing = { time: ['2026-01-01', '2026-01-02'], snowfall_sum: [3.5, 0] };
  const incoming = { time: ['2026-01-01', '2026-01-02', '2026-01-03'], snowfall_sum: [null, 1.1, null] };
  assert.deepEqual(merge(existing, incoming), {
    time: ['2026-01-01', '2026-01-02', '2026-01-03'],
    snowfall_sum: [3.5, 1.1, null],
  });
});

test('a gap between existing and incoming is filled with nulls', () => {
  const existing = { time: ['2026-01-01'], snowfall_sum: [1] };
  const incoming = { time: ['2026-01-04'], snowfall_sum: [2] };
  assert.deepEqual(merge(existing, incoming).snowfall_sum, [1, null, null, 2]);
});

test('validate rejects bad shapes and units', () => {
  assert.throws(() => validate({}), /shape/);
  assert.throws(() => validate({ daily: { time: ['a'], snowfall_sum: [] } }), /shape/);
  assert.throws(() => validate({ daily: { time: [], snowfall_sum: [] }, daily_units: { snowfall_sum: 'mm' } }), /unit/);
  assert.ok(validate({ daily: { time: [], snowfall_sum: [] }, daily_units: { snowfall_sum: 'cm' } }));
});

test('archiveUrl pins ERA5 and the page location', () => {
  const u = new URL(archiveUrl('2026-01-01', '2026-01-31'));
  assert.equal(u.searchParams.get('models'), 'era5');
  assert.equal(u.searchParams.get('latitude'), '47.6205');
  assert.equal(u.searchParams.get('start_date'), '2026-01-01');
});

function tmpFile(daily) {
  const f = join(mkdtempSync(join(tmpdir(), 'era5-')), 'era5.json');
  writeFileSync(f, JSON.stringify({ daily }) + '\n');
  return f;
}

test('main fetches only the trailing window and writes the merge', async () => {
  const f = tmpFile(slice(seed, '1950-01-01', '2026-08-01'));
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    const q = new URL(url).searchParams;
    return { ok: true, json: async () => ({
      daily: slice(seed, q.get('start_date'), q.get('end_date')),
      daily_units: { snowfall_sum: 'cm' },
    }) };
  };
  await main(f, { fetchImpl, today: new Date('2026-09-25T12:00:00Z') });
  assert.equal(urls.length, 1);
  const q = new URL(urls[0]).searchParams;
  assert.equal(q.get('start_date'), addDays('2026-08-01', -90));
  assert.equal(q.get('end_date'), '2026-09-24');
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).daily, seed);
});

test('main leaves the file untouched when the API refuses', async () => {
  const before = { time: ['2026-01-01'], snowfall_sum: [1] };
  const f = tmpFile(before);
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ reason: 'Daily API request limit exceeded.' }) });
  await assert.rejects(main(f, { fetchImpl, today: new Date('2026-01-10T00:00:00Z') }), /429.*Daily/);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).daily, before);
});
