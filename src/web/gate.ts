// D20's gate and its adaptive ladder — B39, and **D67 is what makes it mechanical**.
//
// D20 fixes the bars and the rungs and says the chart *"picks the smallest bucket size at which its
// points clear the bar"*. It does not say what happens when SOME points clear, which is the normal
// case for anything with a daily rhythm. D67 answers it, measured against the seeded week:
//
//   - the bar is tested **per point** — a point whose own denominator is under the bar draws no
//     ratio, because a CTR over 30 impressions is noise whether or not its neighbours are fine;
//   - a rung is admissible when **more than 50% of the window's non-empty points clear** it, and
//     the finest admissible rung wins. Measured, this reproduces `SIMULATOR.md` §18.3's rung table
//     from realised counts: `a_08` draws hourly CPA on a peak window and falls to counts overnight,
//     `a_01` draws CTR at 15 min, `a_09` never clears at any rung;
//   - **the gated count and its reason are always on screen** (D67's amendment) — a series drawn at
//     the hour with two thirds of its points silently absent is a chart that has quietly become
//     something else, which is the failure D20's cap exists to prevent;
//   - one chart, one granularity: the **coarsest rung the drawable ads need**, and ads that clear at
//     no rung are **named** as counts-only rather than dragging everything down with them.
//
// The two bars are D20's, unchanged: >= 500 impressions for CTR (RSE about 30% at p about 2%) and
// >= 10 CONVERSIONS for CPA and ROAS (RSE of a count of 10 about 32%). Conversions, not clicks —
// CPA's denominator is conversions, so gating on clicks measures the wrong thing, and D20 records
// that correction in Seno's words.

import { isEmpty, isRatio, type MetricCounts, type MetricKey } from '../shared/metrics.ts';
import { pointCounts } from './series.ts';
import type { AdRow, BucketRow } from '../server/snapshot.ts';

/** What a point must carry before its ratio may be drawn. */
export type Bar = {
  /** The count that IS the evidence — the ratio's noisy denominator. */
  basis: 'impressions' | 'conversions';
  min: number;
  /** Said on the surface, verbatim, whenever a point or an ad is gated. */
  reason: string;
};

export const BARS: Record<'ctr' | 'cpa' | 'roas', Bar> = {
  ctr: { basis: 'impressions', min: 500, reason: 'under 500 impressions' },
  cpa: { basis: 'conversions', min: 10, reason: 'under 10 conversions' },
  roas: { basis: 'conversions', min: 10, reason: 'under 10 conversions' },
};

/**
 * **Minute → 5 min → 15 min → hour, and STOP** (D20's amendment, in Seno's words: *"a young cohort
 * will never clear 10 conversions, so adaptive granularity could coarsen forever chasing a bar it
 * can't reach. Cap the coarsening (hour, say) and past that just show the counts"*).
 */
export const LADDER = [60, 300, 900, 3_600] as const;

/**
 * **D67's constant.** More than half of a window's non-empty points must clear the bar before the
 * rung is admissible.
 *
 * Measured on the seeded week, this is the only one of the three candidates that reproduces §18.3:
 * requiring EVERY point makes CPA undrawable on any window containing a quiet hour, and requiring
 * ANY point picks 5-minute CTR for `a_01` where §18.3 says 15 minutes and then gaps most of the
 * series. Moving it is a one-line change with a measurable effect, and `BUILD_PLAN.md` §14 carries
 * the warning that changing it looks like a tidy-up.
 */
export const CLEARING_SHARE = 0.5;

export function barFor(metric: MetricKey): Bar | null {
  return isRatio(metric) ? (BARS[metric as 'ctr' | 'cpa' | 'roas'] ?? null) : null;
}

/** Does this one point carry enough evidence? The per-point test, and the only place it lives. */
export function clears(counts: MetricCounts, bar: Bar): boolean {
  return counts[bar.basis] >= bar.min;
}

/**
 * How one ad's points fare at one rung. A point with **nothing in it** is EMPTY and is skipped; a
 * point with activity but too little of the bar's own count is **GATED** and counts against the
 * rung.
 *
 * That distinction is the whole correctness of the ladder, and getting it wrong is invisible: read
 * "empty" as "this point has no conversions", and a sparse conversion series clears trivially at
 * the MINUTE rung — six points out of three hundred and sixty, all of them above the bar, 100%
 * clearing. The chart would then be drawn at the minute with 98% of its points absent, which is the
 * chart-of-holes outcome D67 rejected option C for. Caught by `gate.test.ts`, not by looking.
 */
export type RungTally = { nonEmpty: number; clearing: number; gated: number };

export function tally(points: readonly (MetricCounts | null)[], bar: Bar): RungTally {
  let nonEmpty = 0;
  let clearing = 0;
  for (const counts of points) {
    // `null` is "the ad did not exist" (D64); an all-zero point is a minute in which nothing was
    // delivered. Neither is evidence about a bar, so neither counts for or against a rung —
    // otherwise a 7-day window on a one-day-old ad would be judged mostly on minutes before it
    // launched, and every rung would fail for a reason that has nothing to do with the bar.
    if (counts === null || isEmpty(counts)) continue;
    nonEmpty += 1;
    if (clears(counts, bar)) clearing += 1;
  }
  return { nonEmpty, clearing, gated: nonEmpty - clearing };
}

export function admissible(t: RungTally): boolean {
  return t.nonEmpty > 0 && t.clearing / t.nonEmpty > CLEARING_SHARE;
}

/** An ad that cannot be drawn as a ratio at any rung, and the sentence that says why. */
export type DroppedAd = { ad_id: string; name: string; reason: string };

/**
 * What the chart will draw: one granularity, the ads drawn at it, and everything the surface has to
 * say about what was suppressed.
 *
 * `granularity_s` is the rung actually used — **D20 requires it be displayed**, and B39 does.
 */
export type ChartPlan = {
  metric: MetricKey;
  granularity_s: number;
  /** `null` for the three count metrics: D20 gates ratios, and a count is its own evidence. */
  bar: Bar | null;
  /** The ads drawn as a series, in portfolio order. */
  drawn: AdRow[];
  /** Named on the surface, with the reason — D67's amendment. */
  dropped: DroppedAd[];
  /** Points suppressed across the drawn ads, and points actually plotted. */
  gated: number;
  plotted: number;
  /** True when the ladder was walked past the viewport's own granularity. */
  coarsened: boolean;
};

/**
 * Choose the rung, the ads and the suppression for one chart — the whole of D20/D67 in one pass.
 *
 * The ladder is searched **from the viewport's granularity upward**: the control picks a request
 * and the gate may only coarsen it, never refine past what was asked for. A count metric skips the
 * search entirely and draws at the requested granularity, because there is no bar to clear.
 */
export function planChart(
  rows: readonly BucketRow[],
  window: { from: string; to: string },
  ads: readonly AdRow[],
  metric: MetricKey,
  viewportGranularitySeconds: number,
): ChartPlan {
  const bar = barFor(metric);
  if (bar === null) {
    const points = pointCounts(rows, window, ads, viewportGranularitySeconds);
    let plotted = 0;
    for (const column of points.series) for (const p of column) if (p !== null) plotted += 1;
    return {
      metric,
      granularity_s: viewportGranularitySeconds,
      bar: null,
      drawn: [...ads],
      dropped: [],
      gated: 0,
      plotted,
      coarsened: false,
    };
  }

  const rungs = LADDER.filter((r) => r >= viewportGranularitySeconds);
  // If the viewport is coarser than the whole ladder (it cannot be today — the control offers
  // minute and hour — but a wider control must not silently un-cap the ladder), the cap stands.
  const search = rungs.length > 0 ? rungs : [LADDER[LADDER.length - 1] ?? 3_600];

  /** Per rung: which ads clear it, and what that costs in suppressed points. */
  const attempts = search.map((granularity_s) => {
    const points = pointCounts(rows, window, ads, granularity_s);
    const perAd = ads.map((ad, i) => ({
      ad,
      tally: tally(points.series[i] ?? [], bar),
    }));
    return { granularity_s, perAd, clearing: perAd.filter((a) => admissible(a.tally)) };
  });

  // Selection rule (i): the chart is drawn at the COARSEST rung the drawable ads need, so every
  // series on it clears its own bar. Which means: for each ad take the finest rung IT clears, then
  // take the coarsest of those. An ad clearing no rung is dropped rather than coarsening the chart
  // to a granularity that would not save it anyway.
  const finestPerAd = new Map<string, number>();
  for (const attempt of attempts) {
    for (const { ad, tally: t } of attempt.perAd) {
      if (!finestPerAd.has(ad.ad_id) && admissible(t)) finestPerAd.set(ad.ad_id, attempt.granularity_s);
    }
  }

  const granularity_s =
    finestPerAd.size === 0
      ? (search[search.length - 1] ?? 3_600)
      : Math.max(...finestPerAd.values());
  const chosen = attempts.find((a) => a.granularity_s === granularity_s) ?? attempts[attempts.length - 1];

  const drawn: AdRow[] = [];
  const dropped: DroppedAd[] = [];
  let gated = 0;
  let plotted = 0;

  for (const { ad, tally: t } of chosen?.perAd ?? []) {
    if (admissible(t)) {
      drawn.push(ad);
      gated += t.gated;
      plotted += t.clearing;
    } else {
      dropped.push({
        ad_id: ad.ad_id,
        name: ad.name,
        // The honest failure, and the sentence D20 asks for: not enough evidence at ANY rung up to
        // the hour, so the counts are the answer instead of an ever-wider bucket.
        reason:
          t.nonEmpty === 0
            ? 'no data in this window'
            : `${t.clearing} of ${t.nonEmpty} points clear at best — ${bar.reason}`,
      });
    }
  }

  return {
    metric,
    granularity_s,
    bar,
    drawn,
    dropped,
    gated,
    plotted,
    coarsened: granularity_s > viewportGranularitySeconds,
  };
}

/** The rung, in the words the control uses. Displayed because D20 says the chart must say which. */
export function rungLabel(seconds: number): string {
  if (seconds === 60) return 'minute';
  if (seconds === 300) return '5 min';
  if (seconds === 900) return '15 min';
  if (seconds === 3_600) return 'hour';
  return `${seconds}s`;
}
