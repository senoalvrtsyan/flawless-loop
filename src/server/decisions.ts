// The lever endpoints. DESIGN.md §7, §11. B14.
//
//   POST /api/decisions   pull a lever; returns the NEW state, from inside the same transaction
//   GET  /api/decisions   read the log
//
// This module parses and shapes. It writes nothing: `applyDecision()` in apply.ts owns the
// transaction, because `ads` and `config_generations` are projections and D7 gives them one
// writer. A handler that reached for an INSERT here would break the property B24's sweep exists
// to prove, and it would not show up as a test failure.
//
// `ts` and `actor` are SERVER-assigned, so the wire cannot set either: U7's "Decision.ts is
// request time; backdating rejected" becomes unrepresentable rather than validated, and U2's
// single actor is a constant rather than a claim about a login we do not have.

import type { DatabaseSync } from 'node:sqlite';
import { applyDecision, type AdState, type ApplyDecisionResult, type DecisionInput } from './apply.ts';
import { ACTOR, type Channel, type Decision, type DecisionBody } from '../shared/decisions.ts';

type Parsed = { ok: true; input: DecisionInput } | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

/** U6: money is a non-negative integer of cents. `1.5` and `1e3` are not integers of cents. */
function cents(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/**
 * The wire body is the envelope plus a FLAT `DecisionBody` — `{decision_id, ad_id, rationale,
 * action, ...variant}`. Flat because that is how it reads in a `curl` line and how it is stored
 * (`action` column + `payload_json`); the nesting would exist only to mirror a TypeScript union.
 */
function parse(raw: unknown, now: string): Parsed {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not_an_object' };
  const e = raw as Record<string, unknown>;

  const decision_id = str(e['decision_id']);
  const ad_id = str(e['ad_id']);
  // Brief L95: a rationale is required. Enforced here AND by the schema's CHECK — the endpoint
  // gives the reason, the CHECK makes it impossible to bypass via another writer.
  const rationale = str(e['rationale']);
  if (decision_id === null) return { ok: false, error: 'decision_id_missing_or_not_a_string' };
  if (ad_id === null) return { ok: false, error: 'ad_id_missing_or_not_a_string' };
  if (rationale === null) return { ok: false, error: 'rationale_missing_or_empty' };
  for (const field of ['ts', 'actor', 'decision_seq']) {
    if (e[field] !== undefined) return { ok: false, error: `${field}_is_server_assigned` };
  }

  const body = parseBody(e);
  if (typeof body === 'string') return { ok: false, error: body };
  return { ok: true, input: { decision_id, ad_id, rationale, ts: now, actor: ACTOR, body } };
}

/** Returns the variant, or a reason string. Exhaustive over the six actions the schema allows. */
function parseBody(e: Record<string, unknown>): DecisionBody | string {
  switch (e['action']) {
    case 'create_ad': {
      const i = e['initial'];
      if (i === null || typeof i !== 'object' || Array.isArray(i)) return 'initial_missing';
      const init = i as Record<string, unknown>;
      const name = str(init['name']);
      const video_id = str(init['video_id']);
      const headline_id = str(init['headline_id']);
      const audience_id = str(init['audience_id']);
      const channel = str(init['channel']);
      const daily_budget_cents = cents(init['daily_budget_cents']);
      if (name === null) return 'initial.name_missing';
      if (video_id === null) return 'initial.video_id_missing';
      if (headline_id === null) return 'initial.headline_id_missing';
      if (audience_id === null) return 'initial.audience_id_missing';
      if (channel === null) return 'initial.channel_missing';
      if (daily_budget_cents === null) return 'initial.daily_budget_cents_not_a_non_negative_integer';
      if (init['created_at'] !== undefined) return 'initial.created_at_is_derived_from_ts';
      if (init['status'] !== undefined || init['launched_at'] !== undefined) {
        // Both are the fold's to decide. Accepting them would let a client mint a live ad without
        // a `launch` decision — config changing by something other than a lever (HR6).
        return 'initial.status_and_launched_at_are_the_folds';
      }
      // The one cast in this file, and it is deliberate: `channel`'s enum lives in the schema's
      // CHECK (§2.1 — U3 makes channels static reference data), so a bad value is refused by
      // SQLite with the column name in the message. A second copy of the four values in
      // TypeScript would be a second thing to keep in step with the DDL, for no extra safety.
      return {
        action: 'create_ad',
        initial: { name, video_id, headline_id, audience_id, channel: channel as Channel,
                   daily_budget_cents },
      };
    }
    case 'launch':
      return { action: 'launch' };
    case 'pause':
      return { action: 'pause' };
    case 'resume':
      return { action: 'resume' };
    case 'set_budget': {
      const from_cents = cents(e['from_cents']);
      const to_cents = cents(e['to_cents']);
      if (from_cents === null) return 'from_cents_not_a_non_negative_integer';
      if (to_cents === null) return 'to_cents_not_a_non_negative_integer';
      return { action: 'set_budget', from_cents, to_cents };
    }
    case 'swap_component': {
      const slot = e['slot'];
      const from_id = str(e['from_id']);
      const to_id = str(e['to_id']);
      if (slot !== 'video' && slot !== 'headline') return 'slot_must_be_video_or_headline';
      if (from_id === null) return 'from_id_missing';
      if (to_id === null) return 'to_id_missing';
      return { action: 'swap_component', slot, from_id, to_id };
    }
    default:
      return `unknown_action:${String(e['action'])}`;
  }
}

/**
 * Fully typed, including the success body. `sendJson` takes `unknown`, so a response shape is
 * invisible to `tsc` unless it is annotated somewhere — the B09 finding, where changing a return
 * type silently changed what the emitter received and typechecked clean.
 */
export type PostResult =
  | { status: 200; body: { decision: Decision; ad: AdState; replayed: boolean } }
  | { status: 400 | 409; body: { error: string; message?: string } };

/** Parse, apply, shape. The transaction is applyDecision's; this function has no store access. */
export function postDecision(db: DatabaseSync, raw: unknown, now = new Date().toISOString()): PostResult {
  const parsed = parse(raw, now);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  const result: ApplyDecisionResult = applyDecision(db, parsed.input);
  if (!result.ok) {
    // 409 for every fold refusal, including `ad_unknown`. They are one thing said four ways —
    // "the world is not in the state your lever assumed" — and the machine-readable `error` code
    // is what a caller should branch on, not the status.
    return { status: 409, body: { error: result.error.code, message: result.error.message } };
  }
  return { status: 200, body: { decision: result.decision, ad: result.ad, replayed: result.replayed } };
}

type DecisionRow = {
  decision_id: string; decision_seq: number; ts: string; received_at: string;
  actor: string; ad_id: string; action: string; rationale: string; payload_json: string;
};

/**
 * The log, in FOLD ORDER (`decision_seq` ascending) — the order that reproduces the config, which
 * is the only order this endpoint can be wrong about. B47's console reverses it for display.
 *
 * Unbounded on purpose, and this is a stated limit rather than an oversight: decisions are human
 * lever pulls, ~24 from the seeder plus whatever the demo adds. If that ever stops being true the
 * fix is a cursor, not a silent `LIMIT`, because a truncated log folds to the wrong config.
 */
export function listDecisions(db: DatabaseSync, ad_id: string | null): Decision[] {
  const rows = (ad_id === null
    ? db.prepare('SELECT * FROM decisions ORDER BY decision_seq').all()
    : db.prepare('SELECT * FROM decisions WHERE ad_id = ? ORDER BY decision_seq').all(ad_id)
  ) as DecisionRow[];

  return rows.map((r) => ({
    decision_id: r.decision_id, decision_seq: r.decision_seq, ts: r.ts, received_at: r.received_at,
    actor: r.actor, ad_id: r.ad_id, rationale: r.rationale,
    // `action` + `payload_json` is how §2.3 stores the variant; re-joining them here is the same
    // split `applyDecision` made on the way in.
    body: { action: r.action, ...(JSON.parse(r.payload_json) as object) } as DecisionBody,
  }));
}
