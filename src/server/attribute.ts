// Attribution: which click earned this conversion, and therefore which minute it counts in.
// DESIGN.md §5.2, D14, D16, I8/G30. B17.
//
// READ AND COMPUTE ONLY. This module does not write `conversion_attribution` — that table is a
// projection and apply.ts is its only writer (D7). `resolveAttribution()` returns the row it
// believes in; **B18** is the chunk that persists it and moves the bucket. A function here that
// reached for an INSERT would break the property B24's sweep exists to prove, and it would not
// show up as a test failure.
//
// It has no caller yet: conversions do not enter `ingest()` until B18, because `ingest()` calls
// `apply()` for every accepted signal and a conversion arriving before `apply()` can place it
// would need a silent no-op branch — the exact divergence `default: throw` prevents.

import type { DatabaseSync } from 'node:sqlite';
import { floorMinute } from './apply.ts';

/** `conversion_attribution.state`. `orphan_expired` is B19's — the horizon sweep sets it. */
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
    // provisionally at its OWN minute and — at B18 — in the `provisional_*` columns, apart from
    // the settled counts, so an orphan can never be mistaken for an attributed conversion.
    return {
      event_id: conversion.event_id,
      state: 'orphan_provisional',
      click_event_id: null,
      // The column is NOT NULL and there is no click to be authoritative, so this is the
      // conversion's own claim — true of what we were told, not of what we have verified. It is
      // overwritten by the click's `ad_id` the moment B19 promotes the orphan.
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
