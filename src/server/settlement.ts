// Settlement: the three honest things we can say about a bucket. B21.
// DESIGN.md §5.4, §5.7 · D13 · D38.
//
// READ-SIDE ONLY, and derived. Nothing here writes: `restated_at` and `restatement_count` are
// written by `apply()` at the moment a settled bucket moves (B20, D7), and whether a bucket has
// merely *aged* past the horizon is a question about the read clock, not a fact to store. Storing
// it would mean a projection column that changes without an event — every rebuild would produce a
// different value and `/api/verify` would report divergence on a correct store, which is the same
// reasoning D54 settled for `orphan_expired`.
//
// The vocabulary the UI speaks in (§5.4):
//
//   live      inside the horizon; still accruing; expect it to move
//   settled   past the horizon; we assert it will not move
//   restated  it was settled and it moved anyway — with when, and how many times

// **This file stays free of `node:sqlite` and of `./db.ts`, deliberately** — B49's sweep lives in
// `sweep.ts` for exactly that reason. `bucketState` is imported by the CLIENT (`App.tsx`) so that a
// row arriving on the stream, which the server stamped at the account horizon, can be re-derived at
// a swept horizon using THIS function rather than a second copy of the rule in the browser.
import { HORIZON_MS } from '../shared/config.ts';
import { MINUTE_MS } from '../shared/time.ts';

export type SettlementState = 'live' | 'settled' | 'restated';

/**
 * Was bucket `B` already settled at instant `at`? **D38.**
 *
 * When `apply()` asks, `at` is the arriving event's `received_at` and **never** wall-clock `now`:
 * the question a restatement flag answers is *"was this bucket settled when this event arrived"*.
 * For a live event the two are the same; they diverge exactly once and expensively, during the
 * seed, where `now` is boot time and the wall-clock form would stamp `restated_at` on every
 * backfilled event landing in a bucket older than 72 h (SIMULATOR §15.3(c)).
 *
 * When the READ side asks, `at` is the read moment, which is the same question asked of now.
 *
 * A bucket closes at `minute_start + 60 s` and the horizon runs from there. Strictly greater than,
 * so a bucket is live for the whole horizon and settles the instant after.
 */
export function settledAt(minute_start: string, at: string, horizon_ms: number = HORIZON_MS): boolean {
  return Date.parse(at) - (Date.parse(minute_start) + MINUTE_MS) > horizon_ms;
}

/**
 * The state of one bucket as of `at`.
 *
 * **`restated` outranks the horizon test** and is not an `else`: a restated bucket is by definition
 * one that had already settled, so the two are never in competition — but reading it off
 * `restated_at` rather than recomputing keeps the claim anchored to the event that caused it. That
 * is what makes the badge answerable: *when* did it move, and *how many times*.
 */
export function bucketState(
  bucket: { minute_start: string; restated_at: string | null },
  at: string,
  horizon_ms: number = HORIZON_MS,
): SettlementState {
  if (bucket.restated_at !== null) return 'restated';
  return settledAt(bucket.minute_start, at, horizon_ms) ? 'settled' : 'live';
}
