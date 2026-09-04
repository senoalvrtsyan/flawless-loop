// GET /api/verify — rebuild every projection from the logs and diff it against the live one.
// DESIGN.md §7 · D7 · D55. B22.
//
// This is the payoff of "nothing writes a projection except apply()": with one writer, a divergence
// means a bug in one function, and the rebuild is also the repair.
//
// ** D55: THE REBUILD RUNS THE REAL apply() / applyDecision(), AGAINST TEMP TABLES THAT SHADOW **
// ** THE PROJECTION NAMES. ** SQLite resolves an unqualified name to `temp` before `main`, and it
// re-prepares statements when the schema changes — measured at B22, including through apply.ts's
// WeakMap statement cache. So the rebuild is the write path rather than a second implementation of
// it, which is the only arrangement in which "and they agree" says anything about apply().
//
// Two invariants hold this up, and both are BUILD_PLAN §14 traps:
//
//   1. NO PROJECTION SQL MAY BE SCHEMA-QUALIFIED outside this file. One `main.rollup_minute`
//      written by a future chunk turns this verifier into a corrupter. `verify.test.ts` greps for
//      it and fails the build.
//   2. THE SHADOW SET IS ALL-OR-NOTHING. Shadow three projections and the fourth is rebuilt
//      straight into the live store.
//
// And one runtime property, stated because it is not visible in the code: this must be ONE
// synchronous block that always drops its temps. `node:sqlite` is synchronous and the flush tick is
// a timer, so nothing can observe the shadow mid-verify — but that is a property of the runtime,
// not of this file. Do not introduce an `await` here.

import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { tx } from './db.ts';
import { apply, applyDecision, type AppliedSignal } from './apply.ts';
import type { DecisionBody } from '../shared/decisions.ts';
import type { SignalKind } from '../shared/types.ts';

/**
 * The four projections, plus `decisions`.
 *
 * `decisions` is shadowed because `applyDecision()` writes the log row in the same transaction as
 * the projections it produces (B13, deliberately) — replayed against the real table it would
 * duplicate the log. The real log is read into memory first, so shadowing it costs nothing.
 *
 * **`signals` is deliberately NOT here.** Attribution and orphan promotion must read the real
 * event log, and the cross-schema join (`main.signals` to `temp.conversion_attribution`) is
 * exactly what limits a promotion to conversions already replayed.
 */
const SHADOWED = ['ads', 'config_generations', 'conversion_attribution', 'rollup_minute',
  'decisions'] as const;

/** The projections actually diffed, with the column order the diff and the hash both use. */
const DIFFED = {
  ads: 'ad_id, name, created_at, status, video_id, headline_id, audience_id, channel, daily_budget_cents, launched_at, current_generation_id, last_decision_seq',
  config_generations: 'generation_id, ad_id, seq_in_ad, valid_from, valid_to, opened_by_decision, video_id, headline_id, audience_id, channel, daily_budget_cents, status',
  conversion_attribution: 'event_id, state, click_event_id, credited_ad_id, credited_minute, credited_generation_id, ad_id_conflict, resolved_at',
  rollup_minute: 'ad_id, minute_start, impressions, clicks, click_cost_cents, spend_cents, conversions, value_cents, provisional_conversions, provisional_value_cents, first_written_at, restated_at, restatement_count, max_ingest_seq',
} as const;

export type ProjectionName = keyof typeof DIFFED;

/** The key columns, so a divergence can name the offending row rather than its ordinal. */
const KEYS: Record<ProjectionName, readonly string[]> = {
  ads: ['ad_id'],
  config_generations: ['generation_id'],
  conversion_attribution: ['event_id'],
  rollup_minute: ['ad_id', 'minute_start'],
};

export type Divergence = {
  projection: ProjectionName;
  key: Record<string, unknown>;
  /** `missing_in_rebuild` and `missing_in_live` are the row-set failures; otherwise a column name. */
  column: string;
  live: unknown;
  rebuilt: unknown;
};

export type VerifyResult = {
  ok: boolean;
  /** Read inside the same transaction as the rebuild, so it describes exactly what was checked. */
  log_position: { ingest_seq: number; decision_seq: number };
  /** Per projection: rows compared, and whether the hash matched — §7's fast path. */
  checked: Record<string, { rows: number; hash_matched: boolean }>;
  /** The FIRST divergence, per §7. Absent on a clean bill. */
  divergence?: Divergence;
  duration_ms: number;
};

/**
 * Temp DDL derived from `sqlite_master`, so the migrations stay the single source of truth for what
 * a projection IS — a hand-written copy here would drift and the diff would then be against the
 * wrong shape.
 *
 * `REFERENCES` clauses are stripped, and they have to be: a temp table's foreign keys resolve
 * inside the TEMP schema, so `temp.ads` would demand a `temp.audiences` and
 * `temp.conversion_attribution` a `temp.signals` — and `signals` is the one table that must stay on
 * `main`. **`CHECK` constraints are kept**, because those are content assertions: a rebuild that
 * produces a status outside the enum should fail loudly rather than be diffed politely.
 */
function shadowDdl(db: DatabaseSync, name: string): string {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', name) as { sql: string } | undefined;
  if (row === undefined) throw new Error(`verify: no table '${name}' to shadow — store unmigrated?`);
  return row.sql
    .replace(/^CREATE TABLE/, 'CREATE TEMP TABLE')
    .replace(/\s+REFERENCES\s+\w+\s*\([^)]*\)/g, '');
}

/** A stable digest of a whole projection, in the column and row order `DIFFED` fixes. */
function hashProjection(db: DatabaseSync, schema: string, name: ProjectionName): string {
  const rows = db.prepare(
    `SELECT ${DIFFED[name]} FROM ${schema}.${name} ORDER BY ${KEYS[name].join(', ')}`,
  ).all() as Record<string, unknown>[];
  const hash = createHash('sha256');
  for (const row of rows) hash.update(JSON.stringify(Object.values(row)));
  return `${rows.length}:${hash.digest('hex')}`;
}

/**
 * Walk two projections in key order and return the FIRST difference (§7).
 *
 * Only reached when the hashes disagree, so it is the slow path by construction and can afford to
 * be obvious. It names the column, both values and the key: *"some bucket disagrees somewhere"* is
 * not a usable answer at ten thousand buckets.
 */
function firstDivergence(db: DatabaseSync, name: ProjectionName): Divergence | null {
  const order = KEYS[name].join(', ');
  const live = db.prepare(`SELECT ${DIFFED[name]} FROM main.${name} ORDER BY ${order}`)
    .all() as Record<string, unknown>[];
  const rebuilt = db.prepare(`SELECT ${DIFFED[name]} FROM temp.${name} ORDER BY ${order}`)
    .all() as Record<string, unknown>[];

  const keyOf = (row: Record<string, unknown>): string =>
    KEYS[name].map((k) => String(row[k])).join(' ');
  const pick = (row: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(KEYS[name].map((k) => [k, row[k]]));
  const rebuiltByKey = new Map(rebuilt.map((row) => [keyOf(row), row]));

  for (const liveRow of live) {
    const key = keyOf(liveRow);
    const rebuiltRow = rebuiltByKey.get(key);
    if (rebuiltRow === undefined) {
      // The live store holds a row the logs do not produce. The most serious shape of divergence,
      // because it is the one a writer other than apply() would leave behind.
      return { projection: name, key: pick(liveRow), column: 'missing_in_rebuild',
        live: 'present', rebuilt: null };
    }
    for (const column of Object.keys(liveRow)) {
      if (liveRow[column] !== rebuiltRow[column]) {
        return { projection: name, key: pick(liveRow), column,
          live: liveRow[column], rebuilt: rebuiltRow[column] };
      }
    }
    rebuiltByKey.delete(key);
  }
  const leftover = rebuiltByKey.values().next();
  return leftover.done === true ? null
    : { projection: name, key: pick(leftover.value), column: 'missing_in_live',
        live: null, rebuilt: 'present' };
}

/** One `signals` row, as the rebuild reads it back out of the log. */
type LoggedSignal = {
  event_id: string; ingest_seq: number; received_at: string; ts_effective: string; ad_id: string;
  kind: SignalKind; click_id: string | null; cost_cents: number | null;
  amount_cents: number | null; attributed_click_id: string | null; value_cents: number | null;
};

/**
 * Narrow a logged row back into `apply()`'s discriminated union.
 *
 * The `null` assertions are the schema's four variant CHECKs restated in TypeScript: a click
 * without a `click_id` cannot exist in `signals`. Throwing beats coercing — a `?? 0` here would
 * rebuild a free click and the diff would then report the LIVE row as wrong.
 */
function toApplied(row: LoggedSignal): AppliedSignal {
  const base = { event_id: row.event_id, ingest_seq: row.ingest_seq,
    ts_effective: row.ts_effective, ad_id: row.ad_id };
  switch (row.kind) {
    case 'impression':
      return { ...base, kind: 'impression' };
    case 'click':
      if (row.click_id === null || row.cost_cents === null) {
        throw new Error(`verify: click ${row.event_id} has no click_id/cost_cents`);
      }
      return { ...base, kind: 'click', click_id: row.click_id, cost_cents: row.cost_cents };
    case 'spend':
      if (row.amount_cents === null) throw new Error(`verify: spend ${row.event_id} has no amount`);
      return { ...base, kind: 'spend', amount_cents: row.amount_cents };
    case 'conversion':
      if (row.attributed_click_id === null || row.value_cents === null) {
        throw new Error(`verify: conversion ${row.event_id} has no click/value`);
      }
      return { ...base, kind: 'conversion', attributed_click_id: row.attributed_click_id,
        value_cents: row.value_cents };
  }
}

/**
 * Replay both logs into the shadow. **Decisions first, then signals**, and the order is correct
 * rather than convenient: `ads` and `config_generations` derive only from decisions, `rollup_minute`
 * only from signals, and a generation's window is fixed by its decision's own `ts` rather than by
 * when it was applied — so `credited_generation_id` comes out identical either way. It is also the
 * only order in which attribution can see the generations it needs.
 */
function rebuild(db: DatabaseSync, decisions: readonly StoredDecision[]): void {
  for (const row of decisions) {
    const result = applyDecision(db, {
      decision_id: row.decision_id, ts: row.ts, actor: row.actor, ad_id: row.ad_id,
      rationale: row.rationale,
      body: { action: row.action, ...JSON.parse(row.payload_json) } as DecisionBody,
    });
    if (!result.ok) {
      // The log is authoritative (D7): a logged decision that will not re-apply is a divergence
      // between the log and the fold, not a bad request to be skipped quietly.
      throw new Error(`verify: logged decision ${row.decision_id} failed to replay — ` +
        `${result.error.code}: ${result.error.message}`);
    }
  }

  // `ingest_seq` order is total replay order (E2/D12). apply()'s `applied_at` is each event's OWN
  // `received_at` — the §14 trap added at B06: a rebuild clock would write a different
  // `first_written_at` into every bucket and report total divergence on a correct store.
  const signals = db.prepare(`
    SELECT event_id, ingest_seq, received_at, ts_effective, ad_id, kind, click_id, cost_cents,
           amount_cents, attributed_click_id, value_cents
      FROM main.signals ORDER BY ingest_seq
  `).all() as unknown as LoggedSignal[];
  for (const row of signals) apply(db, toApplied(row), row.received_at);
}

type StoredDecision = {
  decision_id: string; ts: string; actor: string; ad_id: string; rationale: string;
  action: DecisionBody['action']; payload_json: string;
};

/**
 * Rebuild every projection from the logs and diff. Returns the first divergence, or a clean bill
 * with the log position it was checked at.
 *
 * `applyDecision()` opens its own transaction, so the whole rebuild cannot sit inside one `tx()` —
 * `BEGIN IMMEDIATE` does not nest. The temps are therefore created and dropped outside, and the
 * consistency that matters is supplied by the runtime being synchronous: nothing else can write
 * between the log read and the diff.
 */
export function verify(db: DatabaseSync): VerifyResult {
  const started = Date.now();
  // Dropped in `finally`, and dropped FIRST as well: a previous verify that died between the
  // create and the drop would otherwise leave every unqualified read in the process pointed at an
  // empty shadow — the failure this whole file is arranged to make impossible.
  dropShadow(db);
  try {
    const logPosition = tx(db, () => ({
      ingest_seq: (db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS n FROM main.signals')
        .get() as { n: number }).n,
      decision_seq: (db.prepare('SELECT COALESCE(MAX(decision_seq), 0) AS n FROM main.decisions')
        .get() as { n: number }).n,
    }));

    // Read the decision log BEFORE shadowing it, or the replay reads back its own writes.
    const decisions = db.prepare(`
      SELECT decision_id, ts, actor, ad_id, rationale, action, payload_json
        FROM main.decisions ORDER BY decision_seq
    `).all() as unknown as StoredDecision[];

    const live = Object.fromEntries(
      (Object.keys(DIFFED) as ProjectionName[]).map((n) => [n, hashProjection(db, 'main', n)]),
    ) as Record<ProjectionName, string>;

    for (const name of SHADOWED) db.exec(shadowDdl(db, name));
    rebuild(db, decisions);

    const checked: VerifyResult['checked'] = {};
    let divergence: Divergence | undefined;
    for (const name of Object.keys(DIFFED) as ProjectionName[]) {
      const rebuilt = hashProjection(db, 'temp', name);
      const matched = rebuilt === live[name];
      checked[name] = { rows: Number(live[name].split(':')[0]), hash_matched: matched };
      // §7's fast path: the common case is a hash compare, never a row walk.
      if (!matched && divergence === undefined) {
        divergence = firstDivergence(db, name) ?? {
          projection: name, key: {}, column: 'hash_only',
          live: live[name], rebuilt,
        };
      }
    }

    return {
      ok: divergence === undefined,
      log_position: logPosition,
      checked,
      ...(divergence === undefined ? {} : { divergence }),
      duration_ms: Date.now() - started,
    };
  } finally {
    dropShadow(db);
  }
}

/** Drop every shadow, unconditionally. Order does not matter — no temp references another. */
function dropShadow(db: DatabaseSync): void {
  for (const name of SHADOWED) db.exec(`DROP TABLE IF EXISTS temp.${name}`);
}
