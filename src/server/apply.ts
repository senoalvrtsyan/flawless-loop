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
// never stored — nothing here computes one. B06 covered impressions; B16 added click and
// spend; B18 adds the conversion, which is the one kind that does not land at its own minute.

import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { tx } from './db.ts';
import { fold, precondition, type FoldErrorCode, type FoldState } from './fold.ts';
// A cycle: attribute.ts imports `floorMinute` from here. Both bindings are hoisted
// function declarations used only at call time, so neither module observes the other
// half-initialised. The alternative — attribution resolved by the caller — is the one
// the doc comment on apply() rules out.
import { resolveAttribution } from './attribute.ts';
import type { AdConfig, Decision, DecisionBody } from '../shared/decisions.ts';

/**
 * One accepted signal, as the store holds it. `ts_effective` is the clamped value (I10).
 *
 * A DISCRIMINATED UNION, not a bag with optional money (B16). The money is not decoration: a
 * click's `cost_cents` and a spend's `amount_cents` are summed into different columns that
 * DESIGN §2.4 keeps deliberately disjoint. With optional fields, a caller that forgot one would
 * add zero to a total and report a free click — arithmetic that is wrong on screen and raises
 * nothing. The union makes the omission a compile error at the narrowing site instead.
 */
export type AppliedSignal = {
  event_id: string;
  ingest_seq: number;
  ts_effective: string;
  ad_id: string;
} & (
  | { kind: 'impression' }
  | { kind: 'click'; cost_cents: number }
  | { kind: 'spend'; amount_cents: number }
  | { kind: 'conversion'; attributed_click_id: string; value_cents: number }
);

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
 * D29's upsert, one statement for every additive kind (B16 generalised B06's impression-only
 * form). The deltas are computed in JS and bound; SQLite adds them.
 *
 * `first_written_at` is deliberately absent from the DO UPDATE — it records when the bucket was
 * FIRST materialised and is what makes a restatement legible against it. `max_ingest_seq` only
 * ever advances, so it stays a true as-of stamp (D31) even if a lower seq is applied later during
 * a replay — AND it is the resume contract (B10a): a path that moves a bucket without raising it
 * is invisible to every resuming client, and B24's sweep will not catch it because the counts are
 * right.
 *
 * D10: only additive counts. `click_cost_cents` and `spend_cents` stay disjoint because the brief
 * keeps them disjoint (L79-80) — total spend is a read-time sum of the two, never a stored third
 * column that could disagree with its parts.
 */
const UPSERT_ROLLUP = `
  INSERT INTO rollup_minute (ad_id, minute_start, impressions, clicks, click_cost_cents,
                             spend_cents, conversions, value_cents, first_written_at,
                             max_ingest_seq)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (ad_id, minute_start) DO UPDATE SET
    impressions      = impressions      + excluded.impressions,
    clicks           = clicks           + excluded.clicks,
    click_cost_cents = click_cost_cents + excluded.click_cost_cents,
    spend_cents      = spend_cents      + excluded.spend_cents,
    conversions      = conversions      + excluded.conversions,
    value_cents      = value_cents      + excluded.value_cents,
    max_ingest_seq   = MAX(max_ingest_seq, excluded.max_ingest_seq)
`;

/**
 * The `conversion_attribution` row B17 computes and this file persists — apply() is its only
 * writer (D7), which is why `resolveAttribution()` returns a value and touches nothing.
 *
 * Written for an ORPHAN as readily as for a resolved conversion: D16 makes an unattributed
 * conversion a fact we hold, not one we discard, and the stored `credited_minute` is what lets
 * B20 find the bucket to decrement when the click finally lands.
 */
const INSERT_ATTRIBUTION = `
  INSERT INTO conversion_attribution (event_id, state, click_event_id, credited_ad_id,
                                      credited_minute, credited_generation_id, ad_id_conflict,
                                      resolved_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Prepared once per store handle, not once per event. Measured at B06: re-preparing this statement
 * per event costs ~3.6x on the seed path (37k events/s vs 133k), which turns D39's ~12 s backfill
 * into ~45 s of boot before the demo shows anything. `WeakMap` so a closed handle is collectable.
 */
const cache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

/** Keyed by the SQL itself, so a second cached statement cannot be given the first one's slot. */
function prepared(db: DatabaseSync, sql: string): StatementSync {
  let bySql = cache.get(db);
  if (bySql === undefined) {
    bySql = new Map();
    cache.set(db, bySql);
  }
  let stmt = bySql.get(sql);
  if (stmt === undefined) {
    stmt = db.prepare(sql);
    bySql.set(sql, stmt);
  }
  return stmt;
}

/**
 * Apply one accepted signal to the projections, returning the buckets it moved.
 *
 * A LIST, not one key (B18). Until the conversion existed, every signal moved exactly one bucket —
 * its own. D27-B is where that stops being true in both directions: an orphan moves none until its
 * click arrives, and B20's promotion moves two. The flush treats a key it is given as a bucket
 * that certainly exists (`stream.ts` logs "apply/flush disagree" otherwise), so "no bucket" has to
 * be expressible rather than approximated with the key of a row nothing wrote.
 *
 * MUST be called inside the caller's transaction —
 * DESIGN §11 makes ingest one synchronous transaction, so a reader can never see a signal whose
 * bucket has not moved.
 *
 * `applied_at` is the caller's clock, not a fresh `Date.now()`: during the seed it is the event's
 * own `received_at`, so `first_written_at` describes the seeded world rather than the boot minute.
 */
export function apply(db: DatabaseSync, signal: AppliedSignal, applied_at: string): BucketKey[] {
  // §5.3: event time, never arrival time. Impressions, clicks and spend land at their OWN minute,
  // so that is the default — and the conversion is the ONE kind for which it is wrong, so the
  // branch below replaces BOTH halves of the key rather than just the minute.
  let bucket: BucketKey = { ad_id: signal.ad_id, minute_start: floorMinute(signal.ts_effective) };

  let impressions = 0;
  let clicks = 0;
  let click_cost_cents = 0;
  let spend_cents = 0;
  let conversions = 0;
  let value_cents = 0;

  switch (signal.kind) {
    case 'impression':
      impressions = 1;
      break;
    case 'click':
      clicks = 1;
      // L78: the CPC charge. Disjoint from `spend_cents` below, which is L79-80's non-click
      // charges — CPM and fees.
      click_cost_cents = signal.cost_cents;
      break;
    case 'spend':
      // I1: a DELTA for one 60 s interval, not a running total. Summing a cumulative series here
      // would grow quadratically with no error anywhere; the emitter's contract is SIMULATOR §10.
      spend_cents = signal.amount_cents;
      break;
    case 'conversion': {
      // Attribution is resolved HERE and not handed in by the caller, and that is what keeps
      // B22/B23 possible: a rebuild pushes raw `signals` back through this function and re-derives
      // the placement over the prefix it is replaying. Resolved at the ingest boundary instead, it
      // would have to exist a second time in the replay — two implementations of the one rule the
      // sweep is meant to be checking.
      const attribution = resolveAttribution(db, {
        event_id: signal.event_id,
        ad_id: signal.ad_id,
        ts_effective: signal.ts_effective,
        attributed_click_id: signal.attributed_click_id,
      }, applied_at);

      prepared(db, INSERT_ATTRIBUTION).run(
        attribution.event_id, attribution.state, attribution.click_event_id,
        attribution.credited_ad_id, attribution.credited_minute,
        attribution.credited_generation_id, attribution.ad_id_conflict, attribution.resolved_at,
      );

      if (attribution.state !== 'resolved') {
        // B19 credits the orphan into the `provisional_*` columns at its own minute. Until it
        // does, an orphan moves NO bucket — and returning a key for a bucket this call did not
        // write would trip the flush's "apply/flush disagree" guard (stream.ts), which exists to
        // catch precisely that disagreement.
        return [];
      }

      conversions = 1;
      value_cents = signal.value_cents;
      // D27-B and I8/G30 together: the CLICK's minute, on the CLICK's ad. A conversion can
      // therefore move a bucket belonging to an ad its own body never names — that is the
      // mechanism that makes CPA(T) and ROAS(T) cohort ratios, not a bug to reconcile.
      bucket = { ad_id: attribution.credited_ad_id, minute_start: attribution.credited_minute };
      break;
    }
  }

  prepared(db, UPSERT_ROLLUP).run(bucket.ad_id, bucket.minute_start, impressions, clicks,
    click_cost_cents, spend_cents, conversions, value_cents, applied_at, signal.ingest_seq);
  return [bucket];
}

// ---------------------------------------------------------------------------------------------
// B13 — applyDecision(). The lever write path. DESIGN.md §7, §11.
//
// The signal path above turns EVENTS into `rollup_minute`. This turns DECISIONS into `ads` and
// `config_generations`. Both live in this file because both write projections and D7 allows
// exactly one writer; they share no code, and that is fine — the rule is about who writes, not
// about how much they have in common.
//
// It also inserts the `decisions` LOG row, which is not a projection. That is deliberate and it
// has to be here: the log row and the projections it produces must commit together, or a crash
// between them leaves either a projection no log can rebuild or a log row silently unapplied.
// §11: "POST /api/decisions folds, opens the generation, writes ads, and returns the new state in
// the same transaction."
// ---------------------------------------------------------------------------------------------


/** The `ads` row: the fold's head, plus the projection's own bookkeeping. */
export type AdState = AdConfig & {
  ad_id: string;
  current_generation_id: string;  // E9
  last_decision_seq: number;      // the fold's position for this ad
};

export type ApplyError = { code: FoldErrorCode | 'decision_id_reused'; message: string };

export type ApplyDecisionResult =
  | { ok: true; replayed: boolean; decision: Decision; ad: AdState }
  | { ok: false; error: ApplyError };

/** What the caller supplies. `decision_seq`, `received_at` and the fold are ours. */
export type DecisionInput = {
  decision_id: string;
  ts: string;
  actor: string;
  ad_id: string;
  rationale: string;
  body: DecisionBody;
};

/** The six columns `config_generations` carries. `name` and `created_at` are not among them. */
const GENERATION_FIELDS = [
  'video_id', 'headline_id', 'audience_id', 'channel', 'daily_budget_cents', 'status',
] as const;

function configChanged(before: FoldState, after: AdConfig): boolean {
  if (before === null) return true;
  return GENERATION_FIELDS.some((f) => before[f] !== after[f]);
}

/**
 * DERIVED, never minted. B22 rebuilds `config_generations` from the log and B24 diffs it row by
 * row against the live table — a random id would make a perfectly correct rebuild report total
 * divergence, and the tempting fix is to drop the column from the diff. `(ad_id, seq_in_ad)` is
 * already UNIQUE, so this is a function of data the rebuild also has.
 */
function generationId(ad_id: string, seq_in_ad: number): string {
  return `g_${ad_id}_${String(seq_in_ad).padStart(3, '0')}`;
}

function readAd(db: DatabaseSync, ad_id: string): AdState | undefined {
  return db.prepare('SELECT * FROM ads WHERE ad_id = ?').get(ad_id) as AdState | undefined;
}

/** The fold's state is the `ads` row minus its bookkeeping — the bookkeeping is not folded. */
function toConfig(ad: AdState): AdConfig {
  const { ad_id: _a, current_generation_id: _g, last_decision_seq: _s, ...config } = ad;
  return config;
}

/**
 * Apply one lever pull. §7's four steps, in one transaction:
 *   assert preconditions -> fold -> close generation n / open n+1 -> write `ads`.
 *
 * Returns the new state, so `POST /api/decisions` never shows an optimistic value that could then
 * be rejected (§11). A refused decision is NOT logged: the log is what config derives from, and a
 * decision that changed nothing would make the fold's own history unreplayable.
 */
export function applyDecision(db: DatabaseSync, input: DecisionInput): ApplyDecisionResult {
  return tx(db, () => {
    // U5: exactly-once, idempotent on `decision_id`. A retried POST must not fold twice — pausing
    // twice is harmless, but `set_budget` twice would fail its own from_cents precondition and
    // report a stale tab to a client that is not stale.
    const prior = db.prepare('SELECT * FROM decisions WHERE decision_id = ?').get(input.decision_id) as
      | { ad_id: string; action: string; payload_json: string; decision_seq: number;
          ts: string; received_at: string; actor: string; rationale: string }
      | undefined;
    if (prior !== undefined) {
      const { action, ...payload } = input.body;
      const same = prior.ad_id === input.ad_id && prior.action === action &&
        prior.payload_json === JSON.stringify(payload);
      if (!same) {
        // The same key carrying a different lever. Silently returning the first one would be a
        // pull the strategist believes happened and did not — this is the one duplicate we refuse.
        return {
          ok: false as const,
          error: { code: 'decision_id_reused' as const,
                   message: `decision_id '${input.decision_id}' already exists with a different body` },
        };
      }
      const ad = readAd(db, input.ad_id);
      if (ad === undefined) throw new Error(`applyDecision: decision ${input.decision_id} has no ads row`);
      const decision: Decision = {
        decision_id: input.decision_id, decision_seq: prior.decision_seq, ts: prior.ts,
        received_at: prior.received_at, actor: prior.actor, ad_id: prior.ad_id,
        rationale: prior.rationale, body: input.body,
      };
      return { ok: true as const, replayed: true, decision, ad };
    }

    const current = readAd(db, input.ad_id);
    const state: FoldState = current === undefined ? null : toConfig(current);

    const error = precondition(state, input.body);
    if (error !== null) return { ok: false as const, error };

    const next = fold(state, { ts: input.ts, body: input.body });

    // Allocated under BEGIN IMMEDIATE's write lock, exactly as `ingest_seq` is: no second writer
    // can be handing out the same number.
    const decision_seq =
      (db.prepare('SELECT COALESCE(MAX(decision_seq), 0) + 1 AS n FROM decisions').get() as { n: number }).n;
    const received_at = new Date().toISOString();
    const { action, ...payload } = input.body;
    db.prepare(`
      INSERT INTO decisions (decision_id, decision_seq, ts, received_at, actor, ad_id, action,
                             rationale, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.decision_id, decision_seq, input.ts, received_at, input.actor, input.ad_id,
           action, input.rationale, JSON.stringify(payload));

    // A new generation only if the config actually changed (§7). A `set_budget` to the value the
    // ad already has is a real, logged decision that opens nothing — "what was live at T" did not
    // move. `pause` always changes it, because status is one of the six columns.
    let generation_id = current?.current_generation_id ?? '';
    if (configChanged(state, next)) {
      const seq_in_ad =
        (db.prepare('SELECT COALESCE(MAX(seq_in_ad), 0) + 1 AS n FROM config_generations WHERE ad_id = ?')
           .get(input.ad_id) as { n: number }).n;
      // Half-open [valid_from, valid_to): the closing edge and the opening edge are the SAME
      // instant, so "config of a_12 at T" has exactly one answer at every T (§2.4, D14).
      db.prepare('UPDATE config_generations SET valid_to = ? WHERE ad_id = ? AND valid_to IS NULL')
        .run(input.ts, input.ad_id);
      generation_id = generationId(input.ad_id, seq_in_ad);
      db.prepare(`
        INSERT INTO config_generations (generation_id, ad_id, seq_in_ad, valid_from, valid_to,
          opened_by_decision, video_id, headline_id, audience_id, channel, daily_budget_cents, status)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(generation_id, input.ad_id, seq_in_ad, input.ts, input.decision_id, next.video_id,
             next.headline_id, next.audience_id, next.channel, next.daily_budget_cents, next.status);
    }

    db.prepare(`
      INSERT INTO ads (ad_id, name, created_at, status, video_id, headline_id, audience_id,
                       channel, daily_budget_cents, launched_at, current_generation_id,
                       last_decision_seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (ad_id) DO UPDATE SET
        name = excluded.name, status = excluded.status, video_id = excluded.video_id,
        headline_id = excluded.headline_id, audience_id = excluded.audience_id,
        channel = excluded.channel, daily_budget_cents = excluded.daily_budget_cents,
        launched_at = excluded.launched_at, current_generation_id = excluded.current_generation_id,
        last_decision_seq = excluded.last_decision_seq
    `).run(input.ad_id, next.name, next.created_at, next.status, next.video_id, next.headline_id,
           next.audience_id, next.channel, next.daily_budget_cents, next.launched_at,
           generation_id, decision_seq);

    return {
      ok: true as const, replayed: false,
      decision: { decision_id: input.decision_id, decision_seq, ts: input.ts, received_at,
                  actor: input.actor, ad_id: input.ad_id, rationale: input.rationale, body: input.body },
      ad: { ...next, ad_id: input.ad_id, current_generation_id: generation_id,
            last_decision_seq: decision_seq },
    };
  });
}
