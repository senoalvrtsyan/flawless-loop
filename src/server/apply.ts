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
import { resolveAttribution, settledAt } from './attribute.ts';
// B20a: one implementation of the timestamp invariant. Re-exported because `attribute.ts`,
// `seed-world.ts` and the tests import `floorMinute` from here — a move, not a re-plumbing.
import { floorMinute } from '../shared/time.ts';

export { floorMinute };
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
  | { kind: 'click'; click_id: string; cost_cents: number }
  | { kind: 'spend'; amount_cents: number }
  | { kind: 'conversion'; attributed_click_id: string; value_cents: number }
);

/** The bucket a signal moved. Returned so B09 can collect the dirty set without reaching in here. */
export type BucketKey = { ad_id: string; minute_start: string };

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
                             spend_cents, conversions, value_cents,
                             provisional_conversions, provisional_value_cents,
                             first_written_at, max_ingest_seq)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (ad_id, minute_start) DO UPDATE SET
    impressions      = impressions      + excluded.impressions,
    clicks           = clicks           + excluded.clicks,
    click_cost_cents = click_cost_cents + excluded.click_cost_cents,
    spend_cents      = spend_cents      + excluded.spend_cents,
    conversions      = conversions      + excluded.conversions,
    value_cents      = value_cents      + excluded.value_cents,
    provisional_conversions = provisional_conversions + excluded.provisional_conversions,
    provisional_value_cents = provisional_value_cents + excluded.provisional_value_cents,
    max_ingest_seq   = MAX(max_ingest_seq, excluded.max_ingest_seq),
    -- P7/§5.4. Only reachable on DO UPDATE, and that is the definition, not an accident of the
    -- statement: "restated" means it was settled AND IT MOVED ANYWAY. A bucket being materialised
    -- for the first time was not settled, it was absent — nothing on screen changed, because
    -- there was nothing on screen. Were this in the INSERT branch too, a late orphan creating a
    -- week-old bucket would arrive already stamped, restated_at equal to first_written_at.
    restated_at       = CASE WHEN ? = 1 THEN ? ELSE restated_at END,
    restatement_count = restatement_count + ?
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
 * A promotion REPLACES what we believed about a conversion. Every column the resolver decides is
 * rewritten — `credited_ad_id` to the click's (I8/G30) and `credited_generation_id` to the
 * generation live at the click (D14), not just the state — because a half-updated row would leave
 * the orphan's own claim standing next to a `resolved` state and read as agreement.
 */
const UPDATE_ATTRIBUTION = `
  UPDATE conversion_attribution
     SET state = ?, click_event_id = ?, credited_ad_id = ?, credited_minute = ?,
         credited_generation_id = ?, ad_id_conflict = ?, resolved_at = ?
   WHERE event_id = ?
`;

/**
 * Every conversion still waiting on this `click_id` — §5.2's *"a click arrives later"*.
 *
 * `kind = 'conversion'` and `state <> 'resolved'` are both spelled LITERALLY: the first is
 * `ix_signals_attr`'s predicate, the second `ix_attr_unresolved`'s, and SQLite's implication
 * prover is syntactic (the B03 finding). Written any other way this is two full scans of the two
 * largest tables in the store, on every click.
 */
const SELECT_WAITING = `
  SELECT s.event_id AS event_id, s.ad_id AS ad_id, s.ts_effective AS ts_effective,
         s.value_cents AS value_cents,
         a.credited_ad_id AS prev_ad_id, a.credited_minute AS prev_minute
    FROM signals s
    JOIN conversion_attribution a ON a.event_id = s.event_id
   WHERE s.attributed_click_id = ? AND s.kind = 'conversion' AND a.state <> 'resolved'
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
 * One bucket's movement. Every field defaults to zero, and **negative values are legitimate**: a
 * promotion decrements the provisional bucket it leaves. Optional rather than eight positional
 * arguments because the promotion moves two of the eight and a positional call site would be a row
 * of zeros with a `-1` somewhere in it.
 */
type RollupDelta = {
  impressions?: number;
  clicks?: number;
  click_cost_cents?: number;
  spend_cents?: number;
  conversions?: number;
  value_cents?: number;
  provisional_conversions?: number;
  provisional_value_cents?: number;
};

const DELTA_FIELDS = ['impressions', 'clicks', 'click_cost_cents', 'spend_cents', 'conversions',
  'value_cents', 'provisional_conversions', 'provisional_value_cents'] as const;

/** Every bucket one signal moves, and by how much, before any of it is written. */
type Moves = Map<string, { bucket: BucketKey; delta: RollupDelta }>;

/**
 * Accumulate one bucket's movement. **Coalesced, and that is load-bearing** — §5.4 bumps
 * `restatement_count` once *per touched bucket*, not once per write, and one event can write the
 * same bucket more than once: a click whose promoted conversion lands in the click's own minute
 * touches it twice, and two conversions promoted by one click can land in the same minute. Written
 * as it comes, each of those double-counts a number on screen while every count stays correct —
 * so it fails the way §14's traps fail, silently.
 *
 * It also settles an ordering question that would otherwise be decided by accident: a bucket this
 * very event materialises must not then be marked restated by that event's second write to it.
 * One write per bucket per event makes that unrepresentable rather than order-dependent.
 */
function addDelta(moves: Moves, bucket: BucketKey, delta: RollupDelta): void {
  // NUL-joined: `ad_id` is free text, and 'a_1' + '2026…' must not collide with 'a_12' + '026…'.
  const key = `${bucket.ad_id}\u0000${bucket.minute_start}`;
  const seen = moves.get(key);
  if (seen === undefined) {
    moves.set(key, { bucket, delta: { ...delta } });
    return;
  }
  for (const field of DELTA_FIELDS) {
    const value = delta[field];
    if (value !== undefined) seen.delta[field] = (seen.delta[field] ?? 0) + value;
  }
}

/**
 * Move one bucket. **The only place `rollup_minute` is written**, so the three things every path
 * owes cannot be forgotten by one of them: the counts, the `max_ingest_seq` raise, and the
 * settlement test.
 *
 * `at` is the arriving event's `received_at` (D38) — `apply()`'s `applied_at`, which ingest sets
 * per delivery. The settlement test lives HERE rather than at the call sites because a path that
 * moved a bucket without evaluating it would produce a silently un-flagged restatement: right
 * counts, missing flag, nothing raised.
 */
function writeRollup(
  db: DatabaseSync,
  bucket: BucketKey,
  delta: RollupDelta,
  at: string,
  ingest_seq: number,
): void {
  // A bucket past the horizon that MOVES is the whole of P7. `restated_at` is the arriving event's
  // own clock, never `new Date()` — see settledAt().
  const restating = settledAt(bucket.minute_start, at) ? 1 : 0;
  prepared(db, UPSERT_ROLLUP).run(
    bucket.ad_id, bucket.minute_start,
    delta.impressions ?? 0, delta.clicks ?? 0, delta.click_cost_cents ?? 0,
    delta.spend_cents ?? 0, delta.conversions ?? 0, delta.value_cents ?? 0,
    delta.provisional_conversions ?? 0, delta.provisional_value_cents ?? 0,
    at, ingest_seq,
    restating, at, restating,
  );
}

/**
 * §5.2's *"a click arrives later"*: every conversion parked on this click is promoted, and each
 * promotion moves TWO buckets — the provisional one it leaves and the click's bucket it joins.
 *
 * This is why §5.4 insists restatement is GENERIC — *a fact changed, recompute the affected
 * buckets* — rather than lateness-specific. D27-B forced it: a promotion moves a conversion
 * between two buckets regardless of how late anything was, so a lateness-only mechanism would have
 * been wrong on the very first orphan.
 *
 * The click's own `signals` row is already written when this runs (ingest inserts, then applies),
 * so `resolveAttribution()` re-derives each conversion against the real store and cannot disagree
 * with what a rebuild would decide.
 */
function promoteOrphans(
  db: DatabaseSync,
  click: { click_id: string },
  at: string,
  moves: Moves,
): void {
  const waiting = prepared(db, SELECT_WAITING).all(click.click_id) as {
    event_id: string; ad_id: string; ts_effective: string; value_cents: number;
    prev_ad_id: string; prev_minute: string;
  }[];

  for (const row of waiting) {
    const next = resolveAttribution(db, {
      event_id: row.event_id, ad_id: row.ad_id, ts_effective: row.ts_effective,
      attributed_click_id: click.click_id,
    }, at);

    prepared(db, UPDATE_ATTRIBUTION).run(
      next.state, next.click_event_id, next.credited_ad_id, next.credited_minute,
      next.credited_generation_id, next.ad_id_conflict, next.resolved_at, next.event_id,
    );

    // OUT of the provisional bucket it was parked in, INTO the bucket its click earns it. The
    // decrement is why `credited_minute` is stored rather than recomputed (§2.4): without the
    // previous placement on record, the bucket to take it out of cannot be found.
    addDelta(moves, { ad_id: row.prev_ad_id, minute_start: row.prev_minute },
      { provisional_conversions: -1, provisional_value_cents: -row.value_cents });
    addDelta(moves, { ad_id: next.credited_ad_id, minute_start: next.credited_minute },
      { conversions: 1, value_cents: row.value_cents });
  }
}

/**
 * Apply one accepted signal to the projections, returning the buckets it moved.
 *
 * A LIST, not one key, and it is no longer bounded at one: a signal moves its own bucket, and a
 * CLICK additionally moves two per conversion it promotes (the provisional bucket each leaves and
 * the bucket each joins). The flush treats every key it is handed as a row that certainly exists
 * (`stream.ts` logs "apply/flush disagree" otherwise), so how many buckets moved has to be stated
 * by this function rather than assumed by its caller.
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

  const moves: Moves = new Map();

  switch (signal.kind) {
    case 'impression':
      addDelta(moves, bucket, { impressions: 1 });
      break;
    case 'click':
      // L78: the CPC charge. Disjoint from `spend_cents` below, which is L79-80's non-click
      // charges — CPM and fees.
      addDelta(moves, bucket, { clicks: 1, click_cost_cents: signal.cost_cents });
      // §5.2: the click that finally arrives settles every conversion parked on it. Added to the
      // same map as the click's own credit, so a promotion landing in the click's own minute is
      // one movement of one bucket and not two.
      promoteOrphans(db, { click_id: signal.click_id }, applied_at, moves);
      break;
    case 'spend':
      // I1: a DELTA for one 60 s interval, not a running total. Summing a cumulative series here
      // would grow quadratically with no error anywhere; the emitter's contract is SIMULATOR §10.
      addDelta(moves, bucket, { spend_cents: signal.amount_cents });
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

      let creditDelta: RollupDelta;
      if (attribution.state === 'resolved') {
        creditDelta = { conversions: 1, value_cents: signal.value_cents };
      } else {
        // D16/§5.2: with no click there is no click-minute, so the orphan is credited at its OWN
        // minute and into the PROVISIONAL columns — held apart from the settled counts so that an
        // orphan can never be read as an attributed conversion, and so that B20's promotion has a
        // decrement to make rather than a discrepancy to explain.
        creditDelta = { provisional_conversions: 1, provisional_value_cents: signal.value_cents };
      }

      // Taken from the attribution row and not recomputed: this is the placement the store now
      // RECORDS, and it is the value B20 reads back to find the bucket to decrement. Two
      // expressions of one placement is how they come to disagree.
      //
      // D27-B and I8/G30 together, for a resolved conversion: the CLICK's minute, on the CLICK's
      // ad. A conversion can therefore move a bucket belonging to an ad its own body never names —
      // the mechanism that makes CPA(T) and ROAS(T) cohort ratios, not a bug to reconcile.
      bucket = { ad_id: attribution.credited_ad_id, minute_start: attribution.credited_minute };
      addDelta(moves, bucket, creditDelta);
      break;
    }
  }

  // Written only now, one statement per bucket, after every movement this signal causes is known.
  const moved: BucketKey[] = [];
  for (const move of moves.values()) {
    writeRollup(db, move.bucket, move.delta, applied_at, signal.ingest_seq);
    moved.push(move.bucket);
  }
  return moved;
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
