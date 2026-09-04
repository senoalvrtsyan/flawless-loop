// The ratio arithmetic — **one implementation, two callers** (B38).
//
// D10 is the whole file: *"store counts, derive ratios"*. `rollup_minute` carries additive counts
// and nothing else, so CTR, CPA and ROAS are divisions taken at read time, after the counts have
// been aggregated. Ratios do not aggregate; their numerators and denominators do.
//
// **Why this is in `shared/` and not in `server/`.** The server divides window totals (B38); the
// client divides per-point counts for the chart, at the granularity the gate picked (B39, under
// D46). Two implementations of `clicks / impressions` is the divergence class this repo has already
// paid to remove three times — `shared/time.ts` collapsed four copies of the timestamp invariant
// (B20a), `snapshot.ts` holds one bucket-row reader for three call sites (B07/B09/B10a), and
// `fatigue.ts` holds one φ rule for two sources of input (B31b). The formatting and re-bucketing
// layer is `src/web/metrics.ts`; the numbers themselves are here.
//
// ** NOTHING HERE IS STORED. ** There is no ratio column in any migration and there must never be
// one: a stored ratio is wrong at every other granularity, and the restatement path would have to
// rewrite it in every affected bucket instead of only fixing integers (`DESIGN.md` §4.3).

/**
 * The additive half of a `rollup_minute` row — the only fields a ratio may be built from.
 *
 * `BucketRow` satisfies this structurally, so a bucket, a re-bucketed chart point and a window
 * total are all the same input to the functions below.
 */
export type MetricCounts = {
  impressions: number;
  clicks: number;
  click_cost_cents: number;
  spend_cents: number;
  conversions: number;
  value_cents: number;
  provisional_conversions: number;
  provisional_value_cents: number;
};

export const ZERO_COUNTS: MetricCounts = {
  impressions: 0,
  clicks: 0,
  click_cost_cents: 0,
  spend_cents: 0,
  conversions: 0,
  value_cents: 0,
  provisional_conversions: 0,
  provisional_value_cents: 0,
};

/** Integer addition, field by field. **Aggregate with this, then divide** — never the reverse. */
export function addCounts(a: MetricCounts, b: MetricCounts): MetricCounts {
  return {
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    click_cost_cents: a.click_cost_cents + b.click_cost_cents,
    spend_cents: a.spend_cents + b.spend_cents,
    conversions: a.conversions + b.conversions,
    value_cents: a.value_cents + b.value_cents,
    provisional_conversions: a.provisional_conversions + b.provisional_conversions,
    provisional_value_cents: a.provisional_value_cents + b.provisional_value_cents,
  };
}

/**
 * Is this point EMPTY — nothing at all was delivered into it?
 *
 * Distinct from "the ratio's denominator is zero", and B39's gate turns on the difference. A minute
 * with 4,000 impressions and no conversions is **not** empty: it is a minute in which CPA is
 * unmeasurable, which is a gated point and must count against the rung. A minute with nothing in it
 * is not evidence about any bar — it is a minute the ad delivered nothing in (D64 fills those with
 * zeros precisely so the chart can draw them), and counting it either way would let the window's
 * quiet stretches decide the granularity.
 *
 * Written as "every count is zero" rather than "impressions are zero" because a bucket can hold a
 * `spend` row and no impressions (the 60-second CPM accrual, I1) and that is still activity.
 */
export function isEmpty(c: MetricCounts): boolean {
  return (
    c.impressions === 0 &&
    c.clicks === 0 &&
    c.click_cost_cents === 0 &&
    c.spend_cents === 0 &&
    c.conversions === 0 &&
    c.value_cents === 0 &&
    c.provisional_conversions === 0 &&
    c.provisional_value_cents === 0
  );
}

/**
 * Total spend — **the sum of two disjoint columns**, at read time, never a stored third one.
 *
 * The brief, L79-80: spend events are *"non-click charges (CPM, fees); disjoint from click costs —
 * total spend = sum of both"*. `DESIGN.md` §2.4 keeps them apart for that reason and says so: "total
 * spend is a read-time sum, never a stored third column that could disagree with its parts".
 */
export function spendTotalCents(c: MetricCounts): number {
  return c.click_cost_cents + c.spend_cents;
}

/**
 * CTR — clicks over impressions. **The one ratio that is readable in near-real-time** (`DESIGN.md`
 * §4.5): both terms land at their own `ts`, so neither waits on a cohort.
 *
 * `null`, not zero, when there are no impressions: 0/0 is unknown, and a zero CTR on an ad that has
 * not been served yet is a claim we cannot make. The gate (D20/B39) answers the different question
 * of *too little* evidence; this answers *none*.
 */
export function ctr(c: MetricCounts): number | null {
  return c.impressions === 0 ? null : c.clicks / c.impressions;
}

/**
 * CPA — total spend over **settled** conversions, in cents.
 *
 * ** `provisional_conversions` IS NOT ADDED IN, EVER. ** They sit side by side in the same row and
 * both count conversions, so adding them is the natural thing to write (`BUILD_PLAN.md` §14 names
 * this trap and names B38 as where it bites). A provisional conversion is an orphan held at its own
 * minute because its click has not arrived — its ad is a guess (I8/G30) and its placement is
 * temporary, so folding it into CPA puts unattributed cost against attributed outcomes and every
 * number stays plausible. They are disjoint by construction precisely so the settled and
 * provisional figures can be shown apart, which is what B38's headline does.
 *
 * Lags by cohort (§4.5): the numerator lands at its own `ts` while the denominator is backdated to
 * its click's minute (D27-B), so a young minute reads a high CPA that comes down as conversions
 * arrive. That is attribution, not a bug, and the surface says so.
 */
export function cpaCents(c: MetricCounts): number | null {
  return c.conversions === 0 ? null : spendTotalCents(c) / c.conversions;
}

/** ROAS — conversion value over total spend. Same cohort lag as CPA, in the other direction. */
export function roas(c: MetricCounts): number | null {
  const spend = spendTotalCents(c);
  return spend === 0 ? null : c.value_cents / spend;
}

/** The metrics a surface can ask for. Three counts, three ratios — the ratios are the gated ones. */
export type MetricKey = 'impressions' | 'clicks' | 'spend' | 'ctr' | 'cpa' | 'roas';

export const RATIO_METRICS = ['ctr', 'cpa', 'roas'] as const satisfies readonly MetricKey[];

export function isRatio(metric: MetricKey): boolean {
  return (RATIO_METRICS as readonly MetricKey[]).includes(metric);
}

/** One metric's value out of a set of counts. The single place a metric name becomes a number. */
export function metricValue(metric: MetricKey, c: MetricCounts): number | null {
  switch (metric) {
    case 'impressions':
      return c.impressions;
    case 'clicks':
      return c.clicks;
    case 'spend':
      return spendTotalCents(c);
    case 'ctr':
      return ctr(c);
    case 'cpa':
      return cpaCents(c);
    case 'roas':
      return roas(c);
    // No `default`. `MetricKey` is a closed union, so adding a metric without teaching this
    // function about it is a compile error rather than an `undefined` on screen.
  }
}

/** The counts and every ratio derived from them, together — B38's wire shape. */
export type MetricSet = MetricCounts & {
  /** How many `rollup_minute` rows these counts came from. The denominator of "n points". */
  buckets: number;
  /** `click_cost_cents + spend_cents` (L79-80), pre-summed so no reader has to know the rule. */
  spend_total_cents: number;
  ctr: number | null;
  cpa_cents: number | null;
  roas: number | null;
};

/** Counts in, counts plus ratios out. The division happens exactly here and nowhere else. */
export function derive(counts: MetricCounts, buckets: number): MetricSet {
  return {
    ...counts,
    buckets,
    spend_total_cents: spendTotalCents(counts),
    ctr: ctr(counts),
    cpa_cents: cpaCents(counts),
    roas: roas(counts),
  };
}
