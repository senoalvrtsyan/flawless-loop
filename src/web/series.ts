// Bucket rows to chart columns — B37's arithmetic, extracted from `Chart.tsx` so it can be tested.
//
// **D43's criterion is why this is a separate file with a test**: *"tests only where a wrong answer
// is invisible"*. An off-by-one bucket index or a mis-summed hour draws a chart that looks entirely
// normal — it is the same family as `BUILD_PLAN.md` §14's D46 trap, where a client re-bucketing bug
// "can pass by coincidence". `Chart.tsx` keeps the uPlot lifecycle and nothing else, which also
// keeps D44's single-import-site rule cheap to hold.
//
// No ratio is computed here and none may be: D10 puts the division after the aggregation, and B38
// adds ratios server-side.

import { ZERO_COUNTS, addCounts, metricValue, type MetricCounts, type MetricKey } from '../shared/metrics.ts';
import type { AdRow, BucketRow } from '../server/snapshot.ts';

/** One x column (unix SECONDS — uPlot's unit) and one y column per ad, aligned to it. */
export type Columns = { x: number[]; series: (number | null)[][]; labels: string[] };

/**
 * The same shape, but each point carries the whole **count set** rather than one number — B39.
 *
 * This is what the gate needs (D20 tests a point's own denominator) and what a ratio needs (D10
 * divides after the counts are summed). `null` keeps D64's meaning exactly: not "zero", but "the
 * ad did not exist yet".
 */
export type CountPoints = { x: number[]; series: (MetricCounts | null)[][]; labels: string[] };

/**
 * Bucket rows to aligned points: one x array, and one array of COUNT SETS per ad.
 *
 * **Hours derive from minutes by SUMMING COUNTS** — `DESIGN.md` §4.1's own words ("base grain is
 * the minute; hours derive from minutes"), and it stays inside **D10**: counts aggregate, the
 * division comes after. Nothing here divides.
 *
 * ** D46 LANDS ON THIS FUNCTION AT B51. ** Once the server issues a `TraceDescriptor`, this
 * aggregation must use the descriptor's own `granularity_s` rather than the viewport's — otherwise
 * the drill-down replays a different question from the one the number answers, and it can pass by
 * coincidence (`BUILD_PLAN.md` §14). Today there is no descriptor to disagree with, which is why
 * the viewport's granularity is the honest input; at B51 that changes and this comment is the hook.
 *
 * **Missing buckets are ZERO, not a gap — inside the ad's life, and `null` before it (D64).** A bucket
 * exists if and only if an event landed in it, so an absent minute inside a live ad's span is a
 * minute in which it delivered nothing: drawing zero states that, drawing a gap implies we do not
 * know. Before `launched_at` the ad did not exist, and there zero would be a fabricated data
 * point — so the series starts null and begins at launch.
 */
export function pointCounts(
  rows: readonly BucketRow[],
  window: { from: string; to: string },
  ads: readonly AdRow[],
  granularitySeconds: number,
): CountPoints {
  const stepMs = granularitySeconds * 1_000;
  const fromMs = Math.floor(Date.parse(window.from) / stepMs) * stepMs;
  const toMs = Date.parse(window.to);
  const points = Math.max(0, Math.ceil((toMs - fromMs) / stepMs));

  const x = new Array<number>(points);
  for (let i = 0; i < points; i++) x[i] = (fromMs + i * stepMs) / 1_000; // uPlot wants seconds

  const index = new Map(ads.map((ad, i) => [ad.ad_id, i]));
  const launchIndex = ads.map((ad) =>
    ad.launched_at === null ? points : Math.floor((Date.parse(ad.launched_at) - fromMs) / stepMs),
  );
  // `null` everywhere first, then zero-counts from launch on, then the buckets. Three passes rather
  // than one branchy loop, because the middle pass is the claim being made (D64) and it deserves to
  // be legible.
  const series = ads.map((_, s) => {
    const column = new Array<MetricCounts | null>(points).fill(null);
    for (let i = Math.max(0, launchIndex[s] ?? points); i < points; i++) column[i] = ZERO_COUNTS;
    return column;
  });

  for (const row of rows) {
    const s = index.get(row.ad_id);
    if (s === undefined) continue;
    const i = Math.floor((Date.parse(row.minute_start) - fromMs) / stepMs);
    if (i < 0 || i >= points) continue;
    const column = series[s];
    if (column === undefined) continue;
    // `?? ZERO_COUNTS` covers the pre-launch nulls: a bucket that exists before the ad's
    // `launched_at` is a real event on an ad the fold says had not launched, and it is counted
    // rather than dropped. `addCounts` is integer addition — the division never happens here.
    column[i] = addCounts(column[i] ?? ZERO_COUNTS, row);
  }

  return { x, series, labels: ads.map((ad) => ad.name) };
}

/**
 * One metric's y column out of a set of count points — **the division, after the aggregation**.
 *
 * A `null` point stays `null` (D64: the ad did not exist). A point the gate suppressed is `null`
 * too, and that collapse is deliberate: both mean *"no value is claimed here"*, and B39's surface
 * carries the gated COUNT so the two are distinguishable where it matters, on the label rather than
 * in the pixels.
 */
export function metricColumn(
  points: readonly (MetricCounts | null)[],
  metric: MetricKey,
  gated: (counts: MetricCounts) => boolean,
): (number | null)[] {
  return points.map((counts) => (counts === null || gated(counts) ? null : metricValue(metric, counts)));
}

/**
 * Impressions per point — B37's original entry point, kept because its tests are the guard on the
 * re-bucketing above. It is now a projection of `pointCounts` rather than a second implementation:
 * one re-bucketing, one place for the D46 trap to be got right.
 */
export function toColumns(
  rows: readonly BucketRow[],
  window: { from: string; to: string },
  ads: readonly AdRow[],
  granularitySeconds: number,
): Columns {
  const counted = pointCounts(rows, window, ads, granularitySeconds);
  return {
    x: counted.x,
    series: counted.series.map((column) => metricColumn(column, 'impressions', () => false)),
    labels: counted.labels,
  };
}
