// Decision scoring — B50a / P18. `SCOPE.md` §4 cut #1, taken back by **D68**; window by **D70**.
//
// The brief, L125: *"If you score outcomes, a stated before-window vs. after-window heuristic next
// to each log entry is enough."* That sentence is the whole specification, and L147 warns off the
// rest: *"A well-chosen heuristic, honestly presented with its limits, beats an opaque model."*
//
// **The subtlety the brief does not mention, and the reason D19 exists.** Without a lateness guard
// the comparison is *systematically* biased: the before-window has had longer to accumulate late
// conversions than the after-window, so **every decision looks worse than it was**. Nothing errors,
// every number is plausible, and the bias is in one direction — which is the worst shape a wrong
// number can have. So a score is **withheld until both windows are past the lateness horizon**
// (D19 option B, D13), and until then the entry says how long is left.
//
// **`w` is symmetric, 6 h either side of `decision.ts` — D70**, in Seno's words:
//
//   *"use the symmetric 6-hour before/after window with any second lever inside it flagged as
//   contaminated on the log entry, since a stated-and-visible contamination beats two unequal
//   windows needing normalisation against a moving `valid_to`"*
//
// So contamination is **detected and shown, never engineered away**. A second lever inside either
// window marks the entry and names the offending `decision_seq`s. The generation-pinned alternative
// buys cleanliness with normalisation; this buys legibility and pays with a label — and because the
// contamination is already computed here, a pinned column would be additive rather than a rewrite.
//
// **This module writes nothing and stores nothing.** There is no `score` column and there must not
// be: a score is a function of (the decision log, the rollups, the horizon, the read clock), and
// three of those four move. Storing it would be a projection that changes without an event —
// exactly what `settlement.ts` refuses for the same reason (D7, D54).

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { HORIZON_MS } from '../shared/config.ts';
import { MINUTE_MS } from '../shared/time.ts';
import { ZERO_COUNTS, addCounts, derive, type MetricCounts, type MetricSet } from '../shared/metrics.ts';

/** **D70: `w` = 6 h, symmetric.** One constant, one reader, quoted in the UI beside the number. */
export const SCORING_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Which metric a score is expressed in.
 *
 * **D19's recommendation, and it is flagged as such rather than presented as ratified**: D19 asked
 * *"which metric?"* and that half was never answered. One metric only — a surface that showed both
 * would let a reader pick whichever moved the way they hoped, which is the opposite of a stated
 * heuristic. CPA where there is conversion volume on BOTH sides; CTR otherwise.
 */
export type ScoreMetric = 'cpa' | 'ctr';

/** Why a score is not being shown, when it is not. Never silence, and never a zero. */
export type Withheld =
  | { reason: 'settling'; ready_at: string; hours_remaining: number }
  | { reason: 'no_before_window'; detail: string }
  | { reason: 'no_evidence'; detail: string };

export type DecisionScore = {
  decision_id: string;
  decision_seq: number;
  ad_id: string;
  action: string;
  ts: string;
  window: { before_from: string; before_to: string; after_from: string; after_to: string };
  before: MetricSet;
  after: MetricSet;
  /**
   * The comparison, or `null` while it is withheld. `metric` says which; `delta_pct` is signed and
   * is a change in the metric, not in a count.
   *
   * **`improved` is not just `delta_pct > 0`** — CPA improves when it FALLS and CTR when it rises,
   * so the direction is per metric. Reading one as the other flips the verdict on half the log and
   * renders a perfectly ordinary sentence.
   */
  score: { metric: ScoreMetric; before: number; after: number; delta_pct: number; improved: boolean } | null;
  withheld: Withheld | null;
  /** **D70.** Other decisions on the same ad whose `ts` lands inside either window. */
  contaminated_by: number[];
};

type CountRow = MetricCounts & { minute_start: string };

/**
 * The counts for one ad over one half-open window of minutes.
 *
 * Summed in SQL over `rollup_minute` — the same projection every other number on the surface comes
 * from, which is what makes a score walk back to raw events by the route B53 already builds. The
 * window bounds are snapped to whole minutes because that is the bucket unit (D28): an unsnapped
 * bound silently includes or excludes a boundary minute, and B07 found that trap the hard way.
 */
const SELECT_WINDOW = `
  SELECT COALESCE(SUM(impressions), 0) AS impressions,
         COALESCE(SUM(clicks), 0) AS clicks,
         COALESCE(SUM(click_cost_cents), 0) AS click_cost_cents,
         COALESCE(SUM(spend_cents), 0) AS spend_cents,
         COALESCE(SUM(conversions), 0) AS conversions,
         COALESCE(SUM(value_cents), 0) AS value_cents,
         COALESCE(SUM(provisional_conversions), 0) AS provisional_conversions,
         COALESCE(SUM(provisional_value_cents), 0) AS provisional_value_cents,
         COUNT(*) AS buckets
    FROM rollup_minute
   WHERE ad_id = ? AND minute_start >= ? AND minute_start < ?
`;

const SELECT_DECISIONS = `
  SELECT decision_id, decision_seq, ad_id, action, ts
    FROM decisions ORDER BY decision_seq
`;

/** Snap to the minute floor — the bucket unit. Both bounds, so the window tiles with the rollups. */
function floorMinuteMs(ms: number): string {
  return new Date(Math.floor(ms / MINUTE_MS) * MINUTE_MS).toISOString();
}

/**
 * Is the whole after-window past the horizon at `at`?
 *
 * The last minute of the after-window closes at `after_to`, and settlement runs from a bucket's
 * close — so the window is settled once `at − after_to > horizon`. Using `decision.ts` instead of
 * the window's END would call a score ready six hours early, with the after-window still filling.
 */
function settledAt(afterToMs: number, atMs: number, horizonMs: number): boolean {
  return atMs - afterToMs > horizonMs;
}

export function scoreDecisions(
  db: DatabaseSync,
  at: string = new Date().toISOString(),
  horizonMs: number = HORIZON_MS,
): DecisionScore[] {
  const atMs = Date.parse(at);

  return readTx(db, () => {
    const rows = db.prepare(SELECT_DECISIONS).all() as unknown as {
      decision_id: string; decision_seq: number; ad_id: string; action: string; ts: string;
    }[];
    const window = db.prepare(SELECT_WINDOW);

    // Every decision's ts, per ad, for the contamination check. Built once rather than re-queried
    // per decision: 27 rows on the seeded store, and a nested query here would be quadratic for no
    // reason on a table that only ever grows by hand.
    const byAd = new Map<string, { seq: number; ms: number }[]>();
    for (const r of rows) {
      // **`create_ad` is excluded from the CONTAMINATING set, and this narrows D70's wording** —
      // Seno said "any second lever inside it", and this is one decision short of that. The reason
      // it is not conservative to include it: `create_ad` opens generation 1 in `draft`, and §3's
      // rule is that a non-live ad has λ = 0. So a `create_ad` **cannot have moved a single count**
      // in anyone's window; flagging it claims a contamination that provably did not occur.
      //
      // Measured, and this is why it matters rather than being tidy: the seeded week creates and
      // launches each ad a minute apart, so including `create_ad` marked **24 of 24** entries
      // contaminated. A flag that fires on everything teaches the reader to ignore it, which
      // costs exactly the thing D70 chose the symmetric window FOR.
      if (r.action === 'create_ad') continue;
      const list = byAd.get(r.ad_id) ?? [];
      list.push({ seq: r.decision_seq, ms: Date.parse(r.ts) });
      byAd.set(r.ad_id, list);
    }

    /** The counts plus how many buckets carried them — `derive` wants both, and a score over
     *  zero buckets is a different statement from a score over 360 that summed to nothing. */
    const counts = (adId: string, from: string, to: string): { counts: MetricCounts; buckets: number } => {
      const row = window.get(adId, from, to) as unknown as (CountRow & { buckets: number }) | undefined;
      return row === undefined
        ? { counts: ZERO_COUNTS, buckets: 0 }
        : { counts: addCounts(ZERO_COUNTS, row), buckets: row.buckets };
    };

    return rows.map((r): DecisionScore => {
      const tsMs = Date.parse(r.ts);
      const bounds = {
        before_from: floorMinuteMs(tsMs - SCORING_WINDOW_MS),
        before_to: floorMinuteMs(tsMs),
        after_from: floorMinuteMs(tsMs),
        after_to: floorMinuteMs(tsMs + SCORING_WINDOW_MS),
      };
      const beforeRaw = counts(r.ad_id, bounds.before_from, bounds.before_to);
      const afterRaw = counts(r.ad_id, bounds.after_from, bounds.after_to);
      const before = derive(beforeRaw.counts, beforeRaw.buckets);
      const after = derive(afterRaw.counts, afterRaw.buckets);

      // D70: any OTHER lever on this ad inside either window. Half-open on both, matching the
      // count windows exactly — a decision on the boundary belongs to the window that contains it.
      const contaminated_by = (byAd.get(r.ad_id) ?? [])
        .filter((d) => d.seq !== r.decision_seq)
        .filter((d) => d.ms >= Date.parse(bounds.before_from) && d.ms < Date.parse(bounds.after_to))
        .map((d) => d.seq);

      const base = { ...r, window: bounds, before, after, contaminated_by };

      // **`create_ad` and `launch` both have a structurally empty before-window**, and saying so is
      // different from saying "too little evidence". Before `create_ad` the ad did not exist;
      // before `launch` it existed in `draft`, and §3 gives a draft ad λ = 0 — so in both cases the
      // window is empty **by definition** rather than by a lack of delivery. Reporting the second
      // as `no_evidence` would invite a reader to wonder whether the ad was under-delivering.
      if (r.action === 'create_ad' || r.action === 'launch') {
        return {
          ...base, score: null,
          withheld: {
            reason: 'no_before_window',
            detail: r.action === 'create_ad'
              ? 'the ad did not exist before this decision'
              : 'the ad was in draft before this decision, and a draft ad delivers nothing (§3, λ = 0)',
          },
        };
      }

      // D19 option B / D13: withheld until BOTH windows are past the horizon. The before-window is
      // older than the after-window by construction, so testing the after-window tests both.
      if (!settledAt(Date.parse(bounds.after_to), atMs, horizonMs)) {
        const readyAtMs = Date.parse(bounds.after_to) + horizonMs;
        return {
          ...base, score: null,
          withheld: {
            reason: 'settling',
            ready_at: new Date(readyAtMs).toISOString(),
            // Rounded up, so "scoring in 1 h" never means "scoring in 61 minutes".
            hours_remaining: Math.ceil((readyAtMs - atMs) / 3_600_000),
          },
        };
      }

      // The metric choice, D19's recommendation: CPA needs conversions on BOTH sides or the
      // comparison is against a null. CTR needs impressions on both.
      const cpaUsable = before.cpa_cents !== null && after.cpa_cents !== null;
      const metric: ScoreMetric = cpaUsable ? 'cpa' : 'ctr';
      const beforeValue = metric === 'cpa' ? before.cpa_cents : before.ctr;
      const afterValue = metric === 'cpa' ? after.cpa_cents : after.ctr;

      if (beforeValue === null || afterValue === null || beforeValue === 0) {
        return {
          ...base, score: null,
          withheld: {
            reason: 'no_evidence',
            detail: cpaUsable
              ? 'the before-window has no usable CPA to compare against'
              : 'neither window has enough delivery for a CTR',
          },
        };
      }

      // Signed change in the METRIC. Direction of improvement is per metric — CPA improves when it
      // falls, CTR when it rises — and conflating the two flips the verdict on half the log.
      const delta_pct = ((afterValue - beforeValue) / beforeValue) * 100;
      return {
        ...base,
        withheld: null,
        score: {
          metric, before: beforeValue, after: afterValue, delta_pct,
          improved: metric === 'cpa' ? afterValue < beforeValue : afterValue > beforeValue,
        },
      };
    });
  });
}
