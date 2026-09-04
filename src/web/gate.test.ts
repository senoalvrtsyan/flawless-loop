// B39 — D20's ladder under D67's criterion, and every failure here is invisible.
//
// A rung chosen one step too fine draws a normal-looking chart of mostly gaps; one step too coarse
// draws a smooth line that has thrown away the resolution the strategist was looking for. A bar
// tested against the wrong count (clicks instead of conversions — the correction D20 records in
// Seno's words) gates the wrong points. A gated count that is off makes the sentence on screen a
// lie while every pixel stays right. And an all-zero point counted as "failing" rather than "empty"
// makes a young ad fail every rung for a reason that has nothing to do with evidence.
//
// The fixtures are deliberately shaped like `SIMULATOR.md` §18.3's own rows, because that table is
// the claim: `a_08` clears hourly CPA at peak and falls to counts overnight, `a_01` clears CTR at
// 15 minutes, `a_09` clears nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BARS,
  CLEARING_SHARE,
  LADDER,
  admissible,
  barFor,
  clears,
  planChart,
  tally,
} from './gate.ts';
import { ZERO_COUNTS, type MetricCounts } from '../shared/metrics.ts';
import type { AdRow, BucketRow } from '../server/snapshot.ts';

const T = (h: number, m: number): string => new Date(Date.UTC(2026, 8, 1, h, m)).toISOString();

const ad = (ad_id: string, launched = T(0, 0)): AdRow => ({
  ad_id,
  name: ad_id,
  status: 'live',
  channel: 'meta_feed',
  audience_id: 'rt_us',
  daily_budget_cents: 50_000,
  launched_at: launched,
  current_generation_id: `g_${ad_id}_002`,
  last_decision_seq: 2,
});

const bucket = (ad_id: string, minute: string, over: Partial<MetricCounts>): BucketRow =>
  ({
    ad_id,
    minute_start: minute,
    ...ZERO_COUNTS,
    ...over,
    first_written_at: minute,
    restated_at: null,
    restatement_count: 0,
    max_ingest_seq: 1,
    state: 'live',
  }) as BucketRow;

const counts = (over: Partial<MetricCounts>): MetricCounts => ({ ...ZERO_COUNTS, ...over });

/** Six hours, so the hour rung has six points and the 15-min rung twenty-four. */
const WINDOW = { from: T(0, 0), to: T(6, 0) };

/** `impressionsPerMinute` spread evenly over the window, one bucket a minute. */
function evenly(ad_id: string, per: Partial<MetricCounts>, minutes = 360): BucketRow[] {
  const rows: BucketRow[] = [];
  for (let m = 0; m < minutes; m++) rows.push(bucket(ad_id, T(Math.floor(m / 60), m % 60), per));
  return rows;
}

test('D20’s constants are the ones D20 ratified — conversions, not clicks', () => {
  assert.deepEqual(LADDER, [60, 300, 900, 3_600], 'minute, 5 min, 15 min, hour — and STOP');
  assert.equal(BARS.ctr.min, 500);
  assert.equal(BARS.ctr.basis, 'impressions');
  assert.equal(BARS.cpa.basis, 'conversions', 'CPA’s denominator is conversions (D20’s correction)');
  assert.equal(BARS.cpa.min, 10);
  assert.deepEqual(BARS.roas, BARS.cpa, 'ROAS is gated on the same evidence as CPA');
  assert.equal(CLEARING_SHARE, 0.5, 'D67’s constant');
  assert.equal(barFor('impressions'), null, 'a count is its own evidence — no bar');
});

test('the per-point test reads the ratio’s own denominator, nothing else', () => {
  assert.equal(clears(counts({ impressions: 500 }), BARS.ctr), true, 'the bar is inclusive at 500');
  assert.equal(clears(counts({ impressions: 499, clicks: 400 }), BARS.ctr), false);
  assert.equal(clears(counts({ conversions: 10 }), BARS.cpa), true);
  assert.equal(clears(counts({ clicks: 5_000, conversions: 9 }), BARS.cpa), false, 'clicks are not the bar');
});

test('an EMPTY point is neither evidence nor failure', () => {
  const points = [null, counts({}), counts({ impressions: 600 }), counts({ impressions: 100 })];
  const t = tally(points, BARS.ctr);
  assert.deepEqual(t, { nonEmpty: 2, clearing: 1, gated: 1 }, 'the null and the zero are skipped');
  assert.equal(admissible(t), false, 'one of two is not MORE than half');
  assert.equal(admissible({ nonEmpty: 3, clearing: 2, gated: 1 }), true);
  assert.equal(admissible({ nonEmpty: 0, clearing: 0, gated: 0 }), false, 'no data clears nothing');
});

test('CTR: the ladder coarsens to the finest rung that clears — §18.3’s 15-minute row', () => {
  // 51 impressions a minute: 51 at a minute (fails), 255 at 5 min (fails), 765 at 15 min (clears).
  const plan = planChart(evenly('a_01', { impressions: 51, clicks: 1 }), WINDOW, [ad('a_01')], 'ctr', 60);
  assert.equal(plan.granularity_s, 900, 'the 15-minute rung, exactly as §18.3 tabulates a_01');
  assert.equal(plan.coarsened, true);
  assert.equal(plan.dropped.length, 0);
  assert.equal(plan.gated, 0, 'every point clears at the rung that was chosen');
  assert.equal(plan.plotted, 24, 'six hours of 15-minute points');
});

test('CPA: it clears at the hour at peak and is DROPPED to counts overnight', () => {
  const peak = [
    ...evenly('a_08', { impressions: 90, clicks: 3, click_cost_cents: 180 }),
    // Twelve conversions in each of the six hours — §18.3's peak figure for a_08.
    ...Array.from({ length: 6 }, (_, h) => bucket('a_08', T(h, 30), { conversions: 12, value_cents: 120_000 })),
  ];
  const clearing = planChart(peak, WINDOW, [ad('a_08')], 'cpa', 60);
  assert.equal(clearing.granularity_s, 3_600, 'the hour — the cap, and it is enough at peak');
  assert.equal(clearing.dropped.length, 0);
  assert.equal(clearing.gated, 0);

  const trough = [
    ...evenly('a_08', { impressions: 90, clicks: 3, click_cost_cents: 180 }),
    ...Array.from({ length: 6 }, (_, h) => bucket('a_08', T(h, 30), { conversions: 3, value_cents: 30_000 })),
  ];
  const dropped = planChart(trough, WINDOW, [ad('a_08')], 'cpa', 60);
  assert.equal(dropped.drawn.length, 0, 'no rung up to the hour clears three conversions an hour');
  assert.equal(dropped.granularity_s, 3_600, 'it stops at the cap rather than widening further');
  assert.equal(dropped.dropped[0]?.ad_id, 'a_08');
  assert.match(dropped.dropped[0]?.reason ?? '', /under 10 conversions/);
});

test('a mixed window gates the thin points and SAYS how many — D67’s amendment', () => {
  // Three hours at 600 impressions/hour (clears) and three at 300 (does not): 3 of 6 clear, which
  // is not MORE than half, so the hour is inadmissible and the ad drops. Tip it to 4 of 6 and the
  // hour is chosen with two points gated — the case the sentence on screen exists for.
  const rows = Array.from({ length: 6 }, (_, h) =>
    bucket('a_02', T(h, 10), { impressions: h < 4 ? 600 : 300, clicks: 12 }),
  );
  const plan = planChart(rows, WINDOW, [ad('a_02')], 'ctr', 3_600);
  assert.equal(plan.granularity_s, 3_600);
  assert.equal(plan.plotted, 4);
  assert.equal(plan.gated, 2, 'the two thin hours draw no ratio, and the surface counts them');
  assert.equal(plan.bar?.reason, 'under 500 impressions');
});

test('selection rule (i): the COARSEST rung the drawable ads need, and a_09 is named not carried', () => {
  const rows = [
    ...evenly('a_01', { impressions: 51, clicks: 1 }), //  15 min
    ...evenly('a_03', { impressions: 12, clicks: 1 }), //  hour (720/h)
    ...evenly('a_09', { impressions: 3, clicks: 1 }), //   nothing, at any rung
  ];
  const plan = planChart(rows, WINDOW, [ad('a_01'), ad('a_03'), ad('a_09')], 'ctr', 60);
  assert.equal(plan.granularity_s, 3_600, 'a_03 needs the hour, so the chart is drawn at the hour');
  assert.deepEqual(plan.drawn.map((a) => a.ad_id), ['a_01', 'a_03']);
  assert.deepEqual(plan.dropped.map((d) => d.ad_id), ['a_09'], 'named, not silently absent');
});

test('a count metric is not gated and is drawn at the granularity ASKED FOR', () => {
  const plan = planChart(evenly('a_09', { impressions: 3 }), WINDOW, [ad('a_09')], 'impressions', 60);
  assert.equal(plan.granularity_s, 60, 'the viewport’s own granularity, untouched');
  assert.equal(plan.bar, null);
  assert.equal(plan.gated, 0);
  assert.equal(plan.dropped.length, 0, 'nothing is ever dropped from a count chart');
});

test('the ladder never refines PAST the viewport: hour asked for is hour drawn', () => {
  // These points clear at 15 min, but the control asked for the hour and the gate may only coarsen.
  const plan = planChart(evenly('a_01', { impressions: 51, clicks: 1 }), WINDOW, [ad('a_01')], 'ctr', 3_600);
  assert.equal(plan.granularity_s, 3_600);
  assert.equal(plan.coarsened, false);
});

test('a pre-launch point is never evidence — D64 and the bar agree', () => {
  // The ad launched three hours into the window; the first three hours are `null`, not zero.
  const rows = Array.from({ length: 3 }, (_, h) => bucket('a_07', T(h + 3, 10), { impressions: 600, clicks: 9 }));
  const plan = planChart(rows, WINDOW, [ad('a_07', T(3, 0))], 'ctr', 3_600);
  assert.equal(plan.plotted, 3, 'three hours of evidence');
  assert.equal(plan.gated, 0, 'the three pre-launch hours are not gated points — they are no points');
});
