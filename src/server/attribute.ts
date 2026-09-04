// Attribution: which click earned this conversion, and therefore which minute it counts in.
// DESIGN.md §5.2, D14, D16, I8/G30. B17.
//
// READ AND COMPUTE ONLY. This module does not write `conversion_attribution` — that table is a
// projection and apply.ts is its only writer (D7). `resolveAttribution()` returns the row it
// believes in; **B18** is the chunk that persists it and moves the bucket. A function here that
// reached for an INSERT would break the property B24's sweep exists to prove, and it would not
// show up as a test failure.
//
// Its caller is `apply()`, from B18 on — and it is called there, not at the ingest boundary, so
// that B22/B23's rebuild re-derives placement by pushing raw `signals` back through the same
// function instead of through a second implementation of the same rule.

import type { DatabaseSync } from 'node:sqlite';
import { floorMinute } from './apply.ts';

/**
 * `conversion_attribution.state`.
 *
 * **The store only ever holds two of these (D54).** `orphan_expired` is DERIVED at read by
 * `attributionStateAt()` below and is never written: a stored expiry would put a clock inside a
 * projection, and B22's rebuild would then reproduce a different value for every row whose
 * expiry was decided at a different moment — `/api/verify` reporting divergence on a correct
 * store, which is the trap family `first_written_at` and D38's `restated_at` are already in
 * (`BUILD_PLAN.md` §14). The CHECK in `002_projections.sql` still admits the value; nothing
 * writes it. `DESIGN.md` §5.2 carries the amendment.
 */
export type AttributionState = 'resolved' | 'orphan_provisional' | 'orphan_expired';

/** What the resolver is told about the conversion. Exactly the columns `signals` holds. */
export type ConversionFacts = {
  event_id: string;
  ad_id: string;
  ts_effective: string;
  attributed_click_id: string;
};

/** One `conversion_attribution` row, as a value. B18 writes it; nothing here does. */
export type Attribution = {
  event_id: string;
  state: AttributionState;
  click_event_id: string | null;
  credited_ad_id: string;
  credited_minute: string;
  credited_generation_id: string | null;
  ad_id_conflict: 0 | 1;
  resolved_at: string | null;
};

/**
 * The generation whose half-open `[valid_from, valid_to)` contains `at` — **D14**.
 *
 * Exported because B18 and B48 need the same lookup and a second copy would be a second thing to
 * keep in step with the fold's window arithmetic. Uses `ix_gen_ad_window`.
 *
 * Returns `null` when no generation covers the instant, and that is a real answer, not a bug: an
 * event older than the ad's `create_ad` decision has no config to have been served under. It is
 * also the shape of the failure D53 chose against — with the seeded decisions stamped at boot, an
 * entire backfilled week would answer `null` here and read as "attribution works, generations
 * don't".
 */
export function generationAt(db: DatabaseSync, ad_id: string, at: string): string | null {
  const row = db.prepare(`
    SELECT generation_id FROM config_generations
     WHERE ad_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
     ORDER BY seq_in_ad DESC LIMIT 1
  `).get(ad_id, at, at) as { generation_id: string } | undefined;
  return row?.generation_id ?? null;
}

/**
 * §5.2, in full. Given a conversion, decide what we currently believe about it.
 *
 * `resolved_at` is the CALLER's clock — during the seed it is the event's own `received_at`, for
 * the same reason `apply()`'s `applied_at` is (B06): a rebuild clock would write a different
 * value into every row and `/api/verify` would report divergence on a correct store.
 */
export function resolveAttribution(
  db: DatabaseSync,
  conversion: ConversionFacts,
  resolved_at: string,
): Attribution {
  // `kind = 'click'` is spelled literally because `ux_signals_click_id` is a PARTIAL index with
  // exactly that predicate — without the term SQLite full-scans `signals`, correctly and slowly
  // (the B03 finding, in the other direction).
  const click = db.prepare(`
    SELECT event_id, ad_id, ts_effective FROM signals WHERE click_id = ? AND kind = 'click'
  `).get(conversion.attributed_click_id) as
    { event_id: string; ad_id: string; ts_effective: string } | undefined;

  if (click === undefined) {
    // D16: revenue is NEVER silently lost. With no click there is no click-minute, so it is held
    // provisionally at its OWN minute and — since B19 — in the `provisional_*` columns, apart from
    // the settled counts, so an orphan can never be mistaken for an attributed conversion.
    return {
      event_id: conversion.event_id,
      state: 'orphan_provisional',
      click_event_id: null,
      // The column is NOT NULL and there is no click to be authoritative, so this is the
      // conversion's own claim — true of what we were told, not of what we have verified. It is
      // overwritten by the click's `ad_id` the moment B20 promotes the orphan.
      credited_ad_id: conversion.ad_id,
      credited_minute: floorMinute(conversion.ts_effective),
      credited_generation_id: null,
      ad_id_conflict: 0,
      resolved_at: null,
    };
  }

  return {
    event_id: conversion.event_id,
    state: 'resolved',
    click_event_id: click.event_id,
    // I8/G30: THE CLICK IS AUTHORITATIVE. The conversion's own `ad_id` is a claim by the party
    // with the weaker evidence — the click is the event that actually happened on an ad.
    credited_ad_id: click.ad_id,
    // D27-B, cohort placement: the CLICK's minute, not the conversion's. This is the single line
    // that makes CPA(T) and ROAS(T) real cohort ratios instead of two unrelated populations
    // divided by each other — and it is why they lag while CTR does not.
    credited_minute: floorMinute(click.ts_effective),
    credited_generation_id: generationAt(db, click.ad_id, click.ts_effective),
    // Surfaced, never silently reconciled. §5.2 keeps the disagreement as a countable fact.
    ad_id_conflict: conversion.ad_id === click.ad_id ? 0 : 1,
    resolved_at,
  };
}

// ---------------------------------------------------------------------------------------------
// B19 — expiry, derived. D54, D13, DESIGN.md §5.2, §5.4.
// ---------------------------------------------------------------------------------------------

/**
 * The lateness horizon — 72 h (**D13**), displayed and adjustable.
 *
 * **B21 moves this into `src/shared/config.ts`** with the `America/New_York` account timezone, so
 * that the horizon and the day boundary sit in one place. It lives here for two chunks only
 * because B19 needs the number before B21 exists, and a literal `72 * 3600e3` inlined at a call
 * site is how two of them come to disagree.
 */
export const HORIZON_MS = 72 * 60 * 60 * 1000;

/**
 * Was bucket `B` already settled when an event arriving at `at` touched it? **D38, §5.4.**
 *
 * `at` is the arriving event's `received_at`, NEVER wall-clock `now`. The question a restatement
 * flag answers is *"was this bucket settled when this event arrived"*; for a live event the two
 * are the same, and they diverge exactly once and expensively — during the seed, where `now` is
 * boot time and the wall-clock form would stamp `restated_at` on every backfilled event landing in
 * a bucket older than 72 h (SIMULATOR §15.3(c)).
 *
 * A bucket closes at `minute_start + 60 s`; the horizon runs from there. Strictly greater than, so
 * a bucket is live for the full horizon and settles the instant after.
 */
export function settledAt(minute_start: string, at: string, horizon_ms: number = HORIZON_MS): boolean {
  return Date.parse(at) - (Date.parse(minute_start) + 60_000) > horizon_ms;
}

/**
 * What we say about a conversion AT A GIVEN INSTANT — §5.2's third state, computed.
 *
 * The same arithmetic as §5.4's `settled_at(B, at)`: a bucket closes at `minute_start + 60 s`, and
 * the horizon runs from there. An unresolved conversion whose own minute closed more than 72 h
 * before `at` is one we no longer expect a click for — *"6 conversions, $890, no matching click"*.
 *
 * It is still counted and still stored (D13/D16): expiry changes what we SAY about the row, never
 * whether we keep it, and never which bucket it sits in. A click arriving on day eight still
 * promotes it, because age is not a state it could be stuck in.
 */
export function attributionStateAt(
  row: { state: AttributionState; credited_minute: string },
  at: string,
  horizon_ms: number = HORIZON_MS,
): AttributionState {
  if (row.state === 'resolved') return 'resolved';
  // The SAME arithmetic settlement uses, and deliberately the same function: an orphan expires
  // when the bucket holding it would have settled, so two copies of this could drift apart and
  // produce a conversion that is expired in one panel and provisional in another.
  return settledAt(row.credited_minute, at, horizon_ms) ? 'orphan_expired' : 'orphan_provisional';
}

/** The data-health figure §5.2 asks for: unresolved conversions, split by derived state. */
export type OrphanTally = {
  orphan_provisional: { conversions: number; value_cents: number };
  orphan_expired: { conversions: number; value_cents: number };
};

/**
 * Tally the unresolved conversions as of `at`.
 *
 * `state <> 'resolved'` is spelled LITERALLY because `ix_attr_unresolved` is a partial index with
 * exactly that predicate — `state = 'orphan_provisional'` and `state IN (…)` both full-scan
 * `conversion_attribution`, correctly and slowly (the B03 finding). Splitting the two states in
 * JS rather than in SQL is therefore not a shortcut: it is what keeps the index in play now that
 * one of the two states does not exist in the column.
 *
 * The value joins from `signals` because `conversion_attribution` holds placement, not money —
 * the amount is a fact about the event and lives with the event.
 */
export function orphanTally(
  db: DatabaseSync,
  at: string,
  horizon_ms: number = HORIZON_MS,
): OrphanTally {
  const rows = db.prepare(`
    SELECT a.state AS state, a.credited_minute AS credited_minute, s.value_cents AS value_cents
      FROM conversion_attribution a
      JOIN signals s ON s.event_id = a.event_id
     WHERE a.state <> 'resolved'
  `).all() as { state: AttributionState; credited_minute: string; value_cents: number }[];

  const tally: OrphanTally = {
    orphan_provisional: { conversions: 0, value_cents: 0 },
    orphan_expired: { conversions: 0, value_cents: 0 },
  };
  for (const row of rows) {
    const state = attributionStateAt(row, at, horizon_ms);
    // `resolved` is unreachable — the WHERE excluded it — but narrowing the union here is what
    // keeps the two buckets above exhaustive if a fourth state is ever added.
    if (state === 'resolved') continue;
    tally[state].conversions += 1;
    tally[state].value_cents += row.value_cents;
  }
  return tally;
}
