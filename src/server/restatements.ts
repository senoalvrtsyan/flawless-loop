// The restatement log — B43, and `DESIGN.md` §5.6 clause 2 is the whole specification:
//
//   *"A restatement entry appears on the timeline at the BUCKET's time, not at now: '14:02 Tue —
//   ROAS 1.8 → 2.4 · +3 conversions · $412 · arrived 2 days 4 h late.'"*
//
// **Nothing stores that delta, and nothing should.** `rollup_minute` carries `restated_at` and
// `restatement_count` and the CURRENT counts; the before-figure is derived by subtracting the
// arrivals that caused the restatement. That is the same rule as every other number here (D10, D7):
// the store holds additive facts, the read side does the arithmetic, and a stored `roas_before`
// would be a second thing to keep in step with the rebuild.
//
// **How a restatement is identified, measured rather than assumed.** On the seeded week exactly ten
// buckets carry `restated_at`, and all ten are explained by one rule: a conversion credited to that
// bucket whose `received_at` is more than the horizon past the bucket's own minute. Nine of the ten
// hold exactly that one conversion; the tenth (`a_01` at `2026-08-29T18:33Z`) holds two, of which
// one arrived on time — so its entry reads a real before-and-after rather than nothing-to-something,
// which is what makes it the useful one to demo.
//
// **The direction this does NOT cover, stated instead of papered over.** A late CLICK promoting an
// orphan DECREMENTS the provisional bucket the conversion was parked in (B20's `promoteOrphans`), so
// if that bucket had already settled it is restated by a subtraction. The seeded week contains zero
// of those, and rather than write a derivation no data exercises, each entry reports whether the
// arrivals found account for the bucket's whole `restatement_count`. An entry that does not say
// `explained` is the signal that the other direction has appeared and needs its own chunk.

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { HORIZON_MS } from '../shared/config.ts';
import { MINUTE_MS } from '../shared/time.ts';
import { derive, type MetricCounts, type MetricSet } from '../shared/metrics.ts';
import type { SnapshotQuery } from './snapshot.ts';

/** One late arrival, kept as evidence rather than only as a total — this is HR5's raw half. */
export type LateArrival = {
  event_id: string;
  received_at: string;
  value_cents: number;
  /** `received_at − minute_start`: how late the arrival was **relative to the bucket it moved**. */
  lateness_ms: number;
  /** `backfill` or `live` — a seeded arrival time is designed, not observed (§15.4). */
  source: string;
};

export type RestatementEntry = {
  ad_id: string;
  /** **The bucket's own time.** The timeline is ordered by this, never by `restated_at`. */
  minute_start: string;
  /** When the bucket was last moved after settling — at the arriving event's `received_at` (D38). */
  restated_at: string;
  restatement_count: number;
  /** The counts as they stand now, and the ratios derived from them. */
  after: MetricSet;
  /** `after` minus the late arrivals: what the screen showed before they landed. */
  before: MetricSet;
  arrivals: LateArrival[];
  /** The largest lateness among the arrivals — the figure §5.6's sentence quotes. */
  lateness_ms: number;
  /**
   * Do the arrivals found account for the bucket's whole `restatement_count`?
   *
   * `false` means a restatement happened that this derivation cannot explain — the promotion
   * decrement described in the header being the known candidate. It is reported rather than hidden,
   * because an unexplained restatement is exactly the thing a timeline exists to surface.
   */
  explained: boolean;
};

const SELECT_RESTATED = `
  SELECT ad_id, minute_start, impressions, clicks, click_cost_cents, spend_cents,
         conversions, value_cents, provisional_conversions, provisional_value_cents,
         restated_at, restatement_count
    FROM rollup_minute
   WHERE restated_at IS NOT NULL AND minute_start >= ? AND minute_start < ?
   ORDER BY minute_start
`;

/**
 * The conversions credited to a bucket that arrived after it had settled.
 *
 * The comparison is `received_at > minute_start + horizon`, in JS rather than in SQL, because the
 * horizon is a parameter (P16/B49 sweeps it) and duplicating the arithmetic in a WHERE clause is how
 * a swept horizon comes to disagree with the settlement state on the same screen.
 */
const SELECT_CREDITED = `
  SELECT s.event_id AS event_id, s.received_at AS received_at, s.value_cents AS value_cents,
         s.source AS source
    FROM conversion_attribution a
    JOIN signals s ON s.event_id = a.event_id
   WHERE a.state = 'resolved' AND a.credited_ad_id = ? AND a.credited_minute = ?
`;

type StoredRow = MetricCounts & {
  ad_id: string;
  minute_start: string;
  restated_at: string;
  restatement_count: number;
};

type CreditedRow = { event_id: string; received_at: string; value_cents: number; source: string };

export function restatements(
  db: DatabaseSync,
  query: SnapshotQuery,
  // **B49**: defaults to the horizon the QUERY was resolved at, not to `HORIZON_MS`. The explicit
  // parameter stays for the tests that sweep it directly. A timeline answered at 72 h beside a
  // chart drawn at 2 h is the disagreement P16 exists to avoid, and this default is what stops it.
  horizonMs: number = query.horizon_ms,
): RestatementEntry[] {
  const restated = db.prepare(SELECT_RESTATED);
  const credited = db.prepare(SELECT_CREDITED);

  return readTx(db, () => {
    const rows = restated.all(query.from, query.to) as unknown as StoredRow[];
    const entries: RestatementEntry[] = [];

    for (const row of rows) {
      // `?ads=` filters the timeline the same way it filters the chart, so the two never describe
      // different portfolios. Filtered here rather than in SQL: the row set is tiny (ten on the
      // seeded week) and a second parameterised IN-list is not worth the prepared-statement churn.
      if (query.ads !== null && !query.ads.includes(row.ad_id)) continue;

      const settledFrom = Date.parse(row.minute_start) + horizonMs;
      const arrivals: LateArrival[] = [];
      for (const c of credited.all(row.ad_id, row.minute_start) as unknown as CreditedRow[]) {
        const received = Date.parse(c.received_at);
        if (received <= settledFrom) continue;
        arrivals.push({
          event_id: c.event_id,
          received_at: c.received_at,
          value_cents: c.value_cents,
          lateness_ms: received - Date.parse(row.minute_start),
          source: c.source,
        });
      }
      if (arrivals.length === 0) {
        // A bucket marked restated with nothing to explain it. Not skipped — surfaced with an
        // empty arrival list and `explained: false`, because silence here would hide precisely the
        // case the header names as uncovered.
        entries.push({
          ad_id: row.ad_id,
          minute_start: row.minute_start,
          restated_at: row.restated_at,
          restatement_count: row.restatement_count,
          after: derive(row, 1),
          before: derive(row, 1),
          arrivals: [],
          lateness_ms: 0,
          explained: false,
        });
        continue;
      }

      const lateConversions = arrivals.length;
      const lateValue = arrivals.reduce((sum, a) => sum + a.value_cents, 0);
      // The before-counts: only the conversion columns move under this direction of restatement, so
      // subtracting them and leaving impressions and spend alone is the whole of it. Every other
      // column is the same fact it was before the conversion arrived.
      const before: MetricCounts = {
        ...row,
        conversions: row.conversions - lateConversions,
        value_cents: row.value_cents - lateValue,
      };

      entries.push({
        ad_id: row.ad_id,
        minute_start: row.minute_start,
        restated_at: row.restated_at,
        restatement_count: row.restatement_count,
        after: derive(row, 1),
        before: derive(before, 1),
        arrivals,
        lateness_ms: Math.max(...arrivals.map((a) => a.lateness_ms)),
        explained: arrivals.length >= row.restatement_count,
      });
    }

    // Newest bucket first — the timeline reads downward into the past, and it is ordered by the
    // BUCKET's time, not by when the restatement happened. That ordering is the point of §5.6:
    // sorted by `restated_at`, every entry would cluster at "recently" and say nothing about which
    // period moved.
    return entries.reverse();
  });
}

/** How far past its own minute a bucket had to be for an arrival to restate it. Displayed. */
export function horizonMinutes(horizonMs: number = HORIZON_MS): number {
  return Math.round(horizonMs / MINUTE_MS);
}
