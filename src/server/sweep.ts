// The settlement sweep — B49 / P16. `DESIGN.md` §5.7, **F2**.
//
// Split from `settlement.ts` because that file is imported by the CLIENT: `bucketState` has to run
// in the browser so a streamed row (stamped by the server at the account horizon) can be re-derived
// at a swept horizon without a second copy of the rule. This file opens the store, so it stays on
// the server side of that line.

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { MINUTE_MS } from '../shared/time.ts';
import { bucketState, settledAt, type SettlementState } from './settlement.ts';
import { HORIZON_CHOICES_H } from '../shared/config.ts';

export { HORIZON_CHOICES_H };

/**
 * ── **B49 / P16 — the settlement sweep** (`DESIGN.md` §5.7, **F2**) ──────────────────────────────
 *
 * F2's arithmetic is the reason this chunk exists: with a 72 h horizon and 7 days of backfill,
 * backfilled buckets are *already* settled and live buckets never reach settlement inside a demo.
 * So P7's restatement path would be built, correct, and **invisible**. Shortening the horizon is
 * what makes it visible, and §5.7 sizes it as *"a settlement re-evaluation path with a control on
 * it"* rather than a toggle.
 *
 * **The horizon is a READ parameter, and that is forced rather than chosen.** The tempting
 * alternative — persist it as an account setting so `apply()` stamps `restated_at` against it too —
 * is not a defensible option, it is a broken one: `restated_at` is written at ingest against the
 * horizon in force *then*, and `GET /api/verify` rebuilds the projections by replaying the log
 * against the horizon in force *now*. Change it between the two and **verify reports divergence on
 * a correct store** — the same failure D54 avoided for `orphan_expired` and this file's own header
 * warns about. The only way a persisted horizon could work is by versioning it into the decision
 * log, which is a schema change and a fold branch for a demo control. So: the write side keeps
 * `HORIZON_MS`, the read side takes a parameter, and nothing here writes anything.
 *
 * **What "the affected range" means.** A bucket closes at `minute_start + 60 s` and settles once it
 * has been closed longer than the horizon. Shortening `H₁ → H₂` therefore flips exactly the buckets
 * whose age since close lies in `(H₂, H₁]` — a contiguous band of `minute_start`, which is one
 * range scan on `ix_rollup_time`. Lengthening flips the same band the other way. **Not a full
 * scan**: the seeded week holds 71,584 buckets and a 72 h → 2 h sweep touches the 70 h band, so the
 * bound is what keeps this a sweep rather than a table walk.
 */

/** One bucket that changes settlement state under the new horizon. Evidence, not just a count. */
export type Flip = {
  ad_id: string;
  minute_start: string;
  /** State under the horizon we came FROM, and under the one we are going TO. */
  was: SettlementState;
  now: SettlementState;
  /**
   * Under the NEW horizon, had this bucket already settled when its latest arrival landed?
   *
   * **This is the derived restatement** — the thing the plan row means by *"any that had moved
   * since are marked restated"*. It is computed, never written: the stored `restated_at` records
   * what was true at `HORIZON_MS`, and a sweep that overwrote it would be a projection write
   * outside `apply()` (D7) whose only effect would be to break `/api/verify`.
   */
  restated_under_new_horizon: boolean;
  /** The arrival that makes it so, when there is one — `max(received_at)` over credited events. */
  latest_arrival_at: string | null;
};

export type SweepResult = {
  from_horizon_h: number;
  to_horizon_h: number;
  /** The `minute_start` band actually scanned — half-open, and the proof this was not a full scan. */
  affected_range: { from: string; to: string };
  /** How many rows the range scan touched, against how many the table holds. */
  scanned: number;
  total_buckets: number;
  /** Buckets whose settlement state changed. `live → settled` when shortening. */
  flipped: number;
  /** Of those, the ones that had already moved by the time the new horizon says they were settled. */
  newly_restated: number;
  /** A bounded sample, newest first, so the answer is inspectable and the response is not a dump. */
  sample: Flip[];
  duration_ms: number;
};

/**
 * The band of `minute_start` whose state differs between two horizons, as of `at`.
 *
 * Half-open `[from, to)` on `minute_start`, matching every other window in this codebase. Derived
 * from `settledAt`'s own inequality rather than restated in prose: `at − (minute_start + 60 s) > H`,
 * so the flip band is `minute_start ∈ [at − 60 s − H_long, at − 60 s − H_short)`.
 */
export function affectedRange(
  fromHorizonMs: number,
  toHorizonMs: number,
  at: string,
): { from: string; to: string } {
  const close = Date.parse(at) - MINUTE_MS;
  const longer = Math.max(fromHorizonMs, toHorizonMs);
  const shorter = Math.min(fromHorizonMs, toHorizonMs);
  return {
    from: new Date(close - longer).toISOString(),
    to: new Date(close - shorter).toISOString(),
  };
}

/** Buckets in the band, plus the newest arrival credited to each — `ix_rollup_time`, one range. */
const SELECT_BAND = `
  SELECT ad_id, minute_start, restated_at
    FROM rollup_minute
   WHERE minute_start >= ? AND minute_start < ?
   ORDER BY minute_start DESC
`;

/**
 * The newest arrival credited to a bucket. Same join `restatements.ts` uses, aggregated — the
 * question here is only "did anything land after the new horizon", not what it was worth.
 */
const SELECT_LATEST_ARRIVAL = `
  SELECT a.credited_ad_id AS ad_id, a.credited_minute AS minute_start,
         MAX(s.received_at) AS latest_arrival_at
    FROM conversion_attribution a
    JOIN signals s ON s.event_id = a.event_id
   WHERE a.state = 'resolved' AND a.credited_minute >= ? AND a.credited_minute < ?
   GROUP BY a.credited_ad_id, a.credited_minute
`;

const SAMPLE_LIMIT = 25;

export function sweep(
  db: DatabaseSync,
  fromHorizonMs: number,
  toHorizonMs: number,
  at: string = new Date().toISOString(),
): SweepResult {
  const started = Date.now();
  const range = affectedRange(fromHorizonMs, toHorizonMs, at);

  return readTx(db, () => {
    const band = db.prepare(SELECT_BAND).all(range.from, range.to) as unknown as {
      ad_id: string;
      minute_start: string;
      restated_at: string | null;
    }[];
    const arrivals = new Map<string, string>();
    for (const row of db.prepare(SELECT_LATEST_ARRIVAL).all(range.from, range.to) as unknown as {
      ad_id: string;
      minute_start: string;
      latest_arrival_at: string;
    }[]) {
      arrivals.set(`${row.ad_id}\n${row.minute_start}`, row.latest_arrival_at);
    }
    const total = (db.prepare('SELECT COUNT(*) AS n FROM rollup_minute').get() as { n: number }).n;

    let flipped = 0;
    let newlyRestated = 0;
    // **Two samples, and the split is not cosmetic — measured.** A 72 h → 2 h sweep on the seeded
    // week flips 40,889 buckets of which 172 are restated, and the band is read newest-first, so a
    // single capped list contains **none** of them: the caption would say "172 had already moved"
    // above six examples that had not. The restated ones are what the control exists to show, so
    // they fill the sample first and ordinary flips only pad it out.
    const restatedSample: Flip[] = [];
    const plainSample: Flip[] = [];

    for (const row of band) {
      const was = bucketState(row, at, fromHorizonMs);
      const now = bucketState(row, at, toHorizonMs);
      if (was === now) continue;
      flipped += 1;
      const latest = arrivals.get(`${row.ad_id}\n${row.minute_start}`) ?? null;
      // The derived restatement: settled under the NEW horizon at the moment its newest credited
      // conversion arrived. Exactly `settledAt`'s question, asked of the arrival rather than of now
      // — which is D38's rule, and reusing the function is what stops the two drifting apart.
      const restated =
        latest !== null && settledAt(row.minute_start, latest, toHorizonMs);
      const target = restated ? (newlyRestated += 1, restatedSample) : plainSample;
      if (target.length < SAMPLE_LIMIT) {
        target.push({
          ad_id: row.ad_id,
          minute_start: row.minute_start,
          was,
          now,
          restated_under_new_horizon: restated,
          latest_arrival_at: latest,
        });
      }
    }

    const sample = [...restatedSample, ...plainSample].slice(0, SAMPLE_LIMIT);

    return {
      from_horizon_h: fromHorizonMs / 3_600_000,
      to_horizon_h: toHorizonMs / 3_600_000,
      affected_range: range,
      scanned: band.length,
      total_buckets: total,
      flipped,
      newly_restated: newlyRestated,
      sample,
      duration_ms: Date.now() - started,
    };
  });
}
