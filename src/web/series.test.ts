// B37 — the chart's arithmetic, under D43's criterion: *"tests only where a wrong answer is
// invisible"*. Every failure below draws a chart that looks completely normal. An hour summed from
// the wrong minutes, a bucket landing one index left, a zero drawn where the ad did not yet exist —
// none of them error, none of them look wrong, and all of them make HR2's "everything is derived
// from the stream" false while the screen stays plausible.
//
// It is the same family as `BUILD_PLAN.md` §14's D46 trap: a client re-bucketing bug "can pass by
// coincidence". These are the cases where coincidence is most likely.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toColumns } from './series.ts';
import type { AdRow, BucketRow } from '../server/snapshot.ts';

const T = (h: number, m: number): string =>
  new Date(Date.UTC(2026, 8, 1, h, m)).toISOString();

const ad = (over: Partial<AdRow> = {}): AdRow => ({
  ad_id: 'a_12',
  name: 'Product demo · retargeting',
  status: 'live',
  channel: 'meta_feed',
  audience_id: 'cold_us',
  daily_budget_cents: 50_000,
  launched_at: T(0, 0),
  video_id: 'v_04',
  headline_id: 'h_01',
  current_generation_id: 'g_a_12_002',
  last_decision_seq: 2,
  ...over,
});

const bucket = (minute: string, impressions: number, ad_id = 'a_12'): BucketRow =>
  ({
    ad_id,
    minute_start: minute,
    impressions,
    clicks: 0,
    click_cost_cents: 0,
    spend_cents: 0,
    conversions: 0,
    value_cents: 0,
    provisional_conversions: 0,
    provisional_value_cents: 0,
    first_written_at: minute,
    restated_at: null,
    restatement_count: 0,
    max_ingest_seq: 1,
    state: 'live',
  }) as BucketRow;

const WINDOW = { from: T(0, 0), to: T(2, 0) };

test('minute granularity: one point per minute, each carrying its own bucket', () => {
  const columns = toColumns([bucket(T(0, 0), 5), bucket(T(0, 3), 7)], WINDOW, [ad()], 60);
  assert.equal(columns.x.length, 120, 'a two-hour window is 120 minute points');
  assert.equal(columns.series[0]?.[0], 5);
  assert.equal(columns.series[0]?.[3], 7);
  assert.equal(columns.series[0]?.[1], 0, 'a minute with no bucket delivered nothing — that is 0');
});

test('hour granularity SUMS its minutes — DESIGN §4.1, and it is invisible when wrong', () => {
  const rows = [bucket(T(0, 0), 5), bucket(T(0, 59), 7), bucket(T(1, 0), 11)];
  const columns = toColumns(rows, WINDOW, [ad()], 3_600);
  assert.equal(columns.x.length, 2, 'a two-hour window is 2 hour points');
  assert.equal(columns.series[0]?.[0], 12, '00:00 and 00:59 belong to the SAME hour');
  assert.equal(columns.series[0]?.[1], 11, '01:00 opens the next one — an off-by-one lands here');
});

test('the x column is unix SECONDS, aligned down to the granularity', () => {
  const columns = toColumns([], { from: T(0, 30), to: T(2, 0) }, [ad()], 3_600);
  assert.equal(columns.x[0], Date.parse(T(0, 0)) / 1_000,
    'an hour point must start on its own hour, not on the window edge');
});

test('before launched_at the series is NULL, not zero — zero would be a fabricated point', () => {
  const columns = toColumns([], WINDOW, [ad({ launched_at: T(1, 0) })], 60);
  assert.equal(columns.series[0]?.[0], null, 'the ad did not exist at 00:00');
  assert.equal(columns.series[0]?.[59], null);
  assert.equal(columns.series[0]?.[60], 0, 'from launch on, an empty minute is a delivered zero');
});

test('a never-launched ad is null for the whole window', () => {
  const columns = toColumns([], WINDOW, [ad({ launched_at: null, status: 'draft' })], 60);
  assert.equal(columns.series[0]?.every((v) => v === null), true);
});

test('a bucket BEFORE launched_at is still counted, never silently dropped', () => {
  // The fold and the log disagreeing is a real condition, and the honest rendering is to show the
  // events. Dropping them would hide a divergence that `/api/verify` exists to surface.
  const columns = toColumns([bucket(T(0, 5), 9)], WINDOW, [ad({ launched_at: T(1, 0) })], 60);
  assert.equal(columns.series[0]?.[5], 9);
});

test('rows outside the window and rows for unselected ads are dropped', () => {
  const rows = [bucket(T(0, 5), 9), bucket(T(5, 0), 100), bucket(T(0, 5), 100, 'a_03')];
  const columns = toColumns(rows, WINDOW, [ad()], 60);
  const total = columns.series[0]?.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  assert.equal(total, 9, 'a row outside the window or off the selection reached the series');
});

test('one series per selected ad, in the order given, labelled by name', () => {
  const ads = [ad(), ad({ ad_id: 'a_03', name: 'Founder story · warm' })];
  const columns = toColumns([bucket(T(0, 1), 4), bucket(T(0, 1), 6, 'a_03')], WINDOW, ads, 60);
  assert.deepEqual(columns.labels, ['Product demo · retargeting', 'Founder story · warm']);
  assert.equal(columns.series[0]?.[1], 4);
  assert.equal(columns.series[1]?.[1], 6, 'two ads must not share a column');
});
