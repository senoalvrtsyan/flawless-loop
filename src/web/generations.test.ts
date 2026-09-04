// B48. Four properties, all of them things that draw a completely normal chart when wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundariesIn, describeChange } from './generations.ts';
import type { GenerationRow } from '../server/snapshot.ts';

const T = (h: number, m: number): string => new Date(Date.UTC(2026, 8, 1, h, m)).toISOString();

const gen = (over: Partial<GenerationRow> & { ad_id: string; seq_in_ad: number }): GenerationRow => ({
  generation_id: `g_${over.ad_id}_00${over.seq_in_ad}`,
  valid_from: T(0, 0),
  valid_to: null,
  opened_by_decision: `d_${over.ad_id}_${over.seq_in_ad}`,
  video_id: 'v_04',
  headline_id: 'h_01',
  audience_id: 'rt_us',
  channel: 'meta_feed',
  daily_budget_cents: 50_000,
  status: 'live',
  ...over,
});

const ALL = new Set(['a_01', 'a_02']);
const WINDOW = { from: T(0, 0), to: T(6, 0) };

test('generation 1 is not a boundary — it is the ad coming into existence', () => {
  const rows = [gen({ ad_id: 'a_01', seq_in_ad: 1, valid_from: T(1, 0) })];
  assert.deepEqual(boundariesIn(rows, WINDOW, ALL), []);
});

test('the window is half-open on valid_from, so a boundary is drawn in exactly one view', () => {
  const rows = [
    gen({ ad_id: 'a_01', seq_in_ad: 1 }),
    gen({ ad_id: 'a_01', seq_in_ad: 2, valid_from: T(6, 0), status: 'paused' }),
  ];
  // Exactly ON the closing bound: excluded here...
  assert.equal(boundariesIn(rows, WINDOW, ALL).length, 0);
  // ...and included by the window that opens there. Drawn once across the two, never twice.
  assert.equal(boundariesIn(rows, { from: T(6, 0), to: T(12, 0) }, ALL).length, 1);
});

test('the previous generation is found by seq_in_ad, so a diff cannot cross an ad boundary', () => {
  const rows = [
    gen({ ad_id: 'a_01', seq_in_ad: 1, video_id: 'v_01' }),
    gen({ ad_id: 'a_01', seq_in_ad: 2, video_id: 'v_01', valid_from: T(1, 0), status: 'paused' }),
    // `a_02`'s chain starts fresh. Position-based lookup would diff this against a_01's gen 2
    // and label it `video v_01 → v_09`, which never happened.
    gen({ ad_id: 'a_02', seq_in_ad: 1, video_id: 'v_09' }),
    gen({ ad_id: 'a_02', seq_in_ad: 2, video_id: 'v_09', valid_from: T(2, 0), daily_budget_cents: 80_000 }),
  ];
  const found = boundariesIn(rows, WINDOW, ALL);
  assert.deepEqual(found.map((b) => b.changes), [
    ['status live → paused'],
    ['budget $500 → $800/day'],
  ]);
});

test('only charted ads produce boundaries, and they come back in time order', () => {
  const rows = [
    gen({ ad_id: 'a_02', seq_in_ad: 1 }),
    gen({ ad_id: 'a_02', seq_in_ad: 2, valid_from: T(1, 0), status: 'paused' }),
    gen({ ad_id: 'a_01', seq_in_ad: 1 }),
    gen({ ad_id: 'a_01', seq_in_ad: 2, valid_from: T(3, 0), status: 'paused' }),
  ];
  assert.deepEqual(boundariesIn(rows, WINDOW, ALL).map((b) => b.ad_id), ['a_02', 'a_01']);
  assert.deepEqual(boundariesIn(rows, WINDOW, new Set(['a_01'])).map((b) => b.ad_id), ['a_01']);
});

test('a swap and a budget move in one generation are both named', () => {
  const prev = gen({ ad_id: 'a_01', seq_in_ad: 1 });
  const next = gen({ ad_id: 'a_01', seq_in_ad: 2, video_id: 'v_07', daily_budget_cents: 120_000 });
  assert.deepEqual(describeChange(prev, next), ['video v_04 → v_07', 'budget $500 → $1,200/day']);
});
