// apply() — THE SINGLE WRITER of every projection. DESIGN.md §1, §4.3, D7.
//
// `ads`, `config_generations`, `conversion_attribution` and `rollup_minute` are derived,
// rebuildable and owned by this file alone. No other module may write them, and a violation will
// NOT show up as a test failure — it shows up as a store that survives a rebuild differently than
// it survives an ingest, which is the one property the design exists to demonstrate. That is why
// the rule is a rule (BUILD_PLAN §14) rather than a preference.
//
// (`sim_scenarios` is the one table in 002_projections.sql that is NOT a projection — simulator
// input, D40 — and apply() does not own it.)
//
// D29: counts are maintained incrementally, at ingest, in the ingest transaction. D10: ratios are
// never stored — nothing here computes one. B06 covers impressions; B13+ widen the switch.

import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SignalKind } from '../shared/types.ts';

/** One accepted signal, as the store holds it. `ts_effective` is the clamped value (I10). */
export type AppliedSignal = {
  event_id: string;
  ingest_seq: number;
  ts_effective: string;
  ad_id: string;
  kind: SignalKind;
};

/** The bucket a signal moved. Returned so B09 can collect the dirty set without reaching in here. */
export type BucketKey = { ad_id: string; minute_start: string };

/**
 * Floor a canonical ISO instant to its minute: `2026-09-04T12:03:45.678Z` -> `…T12:03:00.000Z`.
 *
 * String surgery, not a `Date` round-trip, because every timestamp reaching a projection is
 * already canonical — ingest rejects anything else (B05), and `MIN()` of two canonical strings is
 * canonical. Keeping `minute_start` in the same shape is what makes `ix_rollup_time`'s range
 * queries and `ts_effective` comparisons byte-order == time-order.
 */
export function floorMinute(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
    throw new Error(`floorMinute: '${iso}' is not canonical ISO — a non-canonical value reached a
projection, which means the B05 boundary was bypassed`);
  }
  return `${iso.slice(0, 17)}00.000Z`;
}

/**
 * D29's upsert. `first_written_at` is deliberately absent from the DO UPDATE — it records when the
 * bucket was FIRST materialised and is what makes a restatement legible against it. `max_ingest_seq`
 * only ever advances, so it stays a true as-of stamp (D31) even if a lower seq is applied later
 * during a replay.
 */
const UPSERT_IMPRESSION = `
  INSERT INTO rollup_minute (ad_id, minute_start, impressions, first_written_at, max_ingest_seq)
  VALUES (?, ?, 1, ?, ?)
  ON CONFLICT (ad_id, minute_start) DO UPDATE SET
    impressions    = impressions + 1,
    max_ingest_seq = MAX(max_ingest_seq, excluded.max_ingest_seq)
`;

/**
 * Prepared once per store handle, not once per event. Measured at B06: re-preparing this statement
 * per event costs ~3.6x on the seed path (37k events/s vs 133k), which turns D39's ~12 s backfill
 * into ~45 s of boot before the demo shows anything. `WeakMap` so a closed handle is collectable.
 */
const cache = new WeakMap<DatabaseSync, StatementSync>();

function upsertImpression(db: DatabaseSync): StatementSync {
  let stmt = cache.get(db);
  if (stmt === undefined) {
    stmt = db.prepare(UPSERT_IMPRESSION);
    cache.set(db, stmt);
  }
  return stmt;
}

/**
 * Apply one accepted signal to the projections. MUST be called inside the caller's transaction —
 * DESIGN §11 makes ingest one synchronous transaction, so a reader can never see a signal whose
 * bucket has not moved.
 *
 * `applied_at` is the caller's clock, not a fresh `Date.now()`: during the seed it is the event's
 * own `received_at`, so `first_written_at` describes the seeded world rather than the boot minute.
 */
export function apply(db: DatabaseSync, signal: AppliedSignal, applied_at: string): BucketKey {
  switch (signal.kind) {
    case 'impression': {
      const minute_start = floorMinute(signal.ts_effective);
      upsertImpression(db).run(signal.ad_id, minute_start, applied_at, signal.ingest_seq);
      return { ad_id: signal.ad_id, minute_start };
    }
    // B13-B20 add click, spend and conversion. Until then an unsupported kind cannot reach here —
    // ingest rejects it (B05) — and if one ever does, failing is the only safe answer: silently
    // ignoring it would leave a signal in the log with no bucket, which is exactly the divergence
    // B24's sweep exists to catch, discovered at the worst possible moment.
    default:
      throw new Error(`apply: kind '${signal.kind}' is not implemented yet (B13+)`);
  }
}
