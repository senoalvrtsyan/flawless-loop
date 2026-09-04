// The maturity indicator — **D33**, `DESIGN.md` §4.5, `SIMULATOR.md` §15.4. B41.
//
// It answers a different question from the gate, and the two must stay visibly distinct: the gate
// (D20/B39) says *too little data to be a ratio*; this says *the data is still arriving*. A young
// cohort trips both, for different reasons, and the surface has to say which.
//
// **The empirical attribution-lag CDF, measured over SETTLED cohorts, global.** Three properties,
// each of which is a decision already taken:
//
//   1. **Empirical, not assumed.** The curve is `received_at − click.ts` over resolved conversions
//      in this store, so the label reads as a histogram of our own data rather than as a forecast.
//      D33's fixed curve (50% @ 1 h, 80% @ 6 h, 95% @ 24 h) is a cold-start fallback only, and with
//      seven days of backfill it never fires.
//   2. **Settled cohorts only, and this is the subtle one.** Measured over *all* resolved
//      conversions the curve is biased short by survivorship: recent cohorts have contributed their
//      fast conversions and not yet their slow ones, so every quantile reads earlier than the truth
//      and the screen claims more maturity than it has. Restricting the sample to cohorts whose
//      credited minute has passed the settlement horizon removes exactly that bias — the cohort is
//      complete, so its lags are a complete sample.
//   3. **Global, not segmented** (D33). At twelve ads a per-channel curve would itself be noise.
//
// **The sample size is always displayed, and so is the seeded share** (§15.4): *"68% mature ·
// measured over 1,432 settled conversions (1,180 seeded)"*. The reason is stated in §15.4 and it is
// a real limit, not modesty — inside the seeded window `received_at` is *designed* rather than
// observed, so a figure resting mostly on seeded arrivals is resting on our own arrival model.

import type { DatabaseSync } from 'node:sqlite';
import { HORIZON_MS } from '../shared/config.ts';
import { MINUTE_MS, floorToMinute } from '../shared/time.ts';

/**
 * Below this many settled conversions the empirical curve is not worth trusting and D33's fixed
 * cold-start curve is used instead, with `fallback: true` so the surface can say so.
 *
 * Thirty is a judgement rather than a ratified constant, and it is stated here rather than buried:
 * an ECDF over fewer than ~30 samples has quantile error wider than the thing it is measuring, so a
 * "12% mature" drawn from nine conversions would be a made-up number with a real-looking decimal.
 * **It never fires with seven days of backfill** (§4.5 says so, and this store has 1,350) — it fires
 * on a freshly migrated store, which is the case it exists for.
 */
export const MIN_SAMPLE = 30;

/** D33's cold-start fallback, verbatim: 50% at 1 h, 80% at 6 h, 95% at 24 h. */
const FALLBACK: readonly { lag_ms: number; share: number }[] = [
  { lag_ms: 1 * 3_600_000, share: 0.5 },
  { lag_ms: 6 * 3_600_000, share: 0.8 },
  { lag_ms: 24 * 3_600_000, share: 0.95 },
];

export type MaturityCurve = {
  /** Settled, resolved conversions the curve was measured over. Always displayed. */
  sample_size: number;
  /** Of those, how many arrived under the seeded arrival model (§15.4's disclosure). */
  seeded: number;
  live: number;
  /** Cohorts credited at or after this minute were excluded as incomplete. */
  settled_before: string;
  /** The ECDF, sampled at 5% steps: the lag by which that share of conversions had arrived. */
  quantiles: { share: number; lag_ms: number }[];
  /** True when the sample was under `MIN_SAMPLE` and D33's fixed curve is standing in. */
  fallback: boolean;
};

/**
 * The curve, plus the two evaluations the surface shows.
 *
 * **Evaluated for the window's newest and oldest minute, and nothing in between.** The alternative
 * — one figure for "the window" — needs a weighting across cohorts that no document specifies, and
 * inventing one would put a made-up number next to two real ones. The newest minute is the floor
 * and the oldest is the ceiling; between them the reader has the range, which is the honest shape of
 * the answer. Both are computed HERE so the client renders a server number (D46/D34).
 */
export type Maturity = MaturityCurve & {
  newest_minute: string;
  newest_share: number;
  oldest_minute: string;
  oldest_share: number;
};

const SELECT_LAGS = `
  SELECT s.received_at AS received_at, c.ts AS click_ts, s.source AS source
    FROM conversion_attribution a
    JOIN signals s ON s.event_id = a.event_id
    JOIN signals c ON c.event_id = a.click_event_id
   WHERE a.state = 'resolved' AND a.credited_minute < ?
`;

type LagRow = { received_at: string; click_ts: string; source: 'backfill' | 'live' };

/**
 * Measure the curve. **Read-only, and called inside the caller's read transaction** so the label and
 * the numbers it qualifies come from one instant.
 *
 * `at` is the read clock, threaded rather than taken here for the same reason `settledAt` threads
 * it (D38): two figures in one response must not be judged against two different clocks.
 */
export function maturityCurve(db: DatabaseSync, at: string): MaturityCurve {
  const settledBefore = floorToMinute(Date.parse(at) - HORIZON_MS);
  const rows = db.prepare(SELECT_LAGS).all(settledBefore) as unknown as LagRow[];

  const lags: number[] = [];
  let seeded = 0;
  for (const row of rows) {
    // `received_at − click.ts` — §4.5's own words. Not `received_at − ts`: the cohort a conversion
    // belongs to is its CLICK's minute (D27-B), so the lag that matters for "has this bucket
    // finished arriving" is measured from the click, not from the purchase.
    const lag = Date.parse(row.received_at) - Date.parse(row.click_ts);
    // A negative lag is impossible in the model and would mean a conversion recorded before the
    // click it is attributed to. Dropped rather than clamped, and counted out of the sample size,
    // so it cannot quietly pull a quantile below zero.
    if (Number.isFinite(lag) && lag >= 0) {
      lags.push(lag);
      if (row.source === 'backfill') seeded += 1;
    }
  }
  lags.sort((a, b) => a - b);

  const fallback = lags.length < MIN_SAMPLE;
  const quantiles = fallback
    ? FALLBACK.map((point) => ({ ...point }))
    : Array.from({ length: 20 }, (_, i) => {
        const share = (i + 1) / 20;
        // The `share` quantile of an n-sample ECDF: the smallest observed lag by which that share
        // had arrived. `ceil(share * n) - 1` rather than a rounded index, so `quantiles[19]` is the
        // maximum observed lag and not something just short of it.
        const index = Math.min(lags.length - 1, Math.max(0, Math.ceil(share * lags.length) - 1));
        return { share, lag_ms: lags[index] ?? 0 };
      });

  return {
    sample_size: lags.length,
    seeded,
    live: lags.length - seeded,
    settled_before: settledBefore,
    quantiles,
    fallback,
  };
}

/**
 * The share of a cohort's conversions expected to have arrived by `ageMs` — the CDF, read forward.
 *
 * A step function over the sampled quantiles rather than an interpolation, because the quantiles ARE
 * the measurement and interpolating between them would invent precision the sample does not have.
 * Past the last quantile it reports the largest measured share, never 1: with a 7-day purchase-lag
 * cutoff the model itself drops some conversions (`lag.ts`), so claiming 100% would claim something
 * the data cannot show.
 */
export function shareAt(curve: MaturityCurve, ageMs: number): number {
  let share = 0;
  for (const point of curve.quantiles) {
    if (ageMs >= point.lag_ms) share = point.share;
    else break;
  }
  return share;
}

/** The curve plus its two evaluations for one resolved window. */
export function maturityFor(
  db: DatabaseSync,
  window: { from: string; to: string },
  at: string,
): Maturity {
  const curve = maturityCurve(db, at);
  const now = Date.parse(at);
  // `to` is exclusive and minute-aligned (B07), so the newest minute IN the window starts one
  // minute before it. Off by one here and the label describes a minute the window does not contain.
  const newestMinute = new Date(Date.parse(window.to) - MINUTE_MS).toISOString();
  return {
    ...curve,
    newest_minute: newestMinute,
    newest_share: shareAt(curve, now - Date.parse(newestMinute)),
    oldest_minute: window.from,
    oldest_share: shareAt(curve, now - Date.parse(window.from)),
  };
}
