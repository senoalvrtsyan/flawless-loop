// fold() — config as a fold over the decision log. DESIGN.md §7, D7.
//
// TWO PURE FUNCTIONS AND NOTHING ELSE. Neither opens the store, neither reads a clock, neither
// writes a projection: `ads` and `config_generations` are projections and apply.ts is their only
// writer (D7). The fold decides WHAT the config becomes; applyDecision persists it.
//
// §7's apply pseudocode is two lines before the fold —
//     assert preconditions (from_cents / from_id vs current)   -- I13, compare-and-swap
//     state' = fold(state, decision)
// — so they are two exported functions here, called in that order by applyDecision (B13), rather
// than one function that both judges and folds. That keeps `fold` total over input it has already
// been told is legal, which is what makes its switch readable as a transition table.
//
// D43: this file is one of the four functions that get an automated test, because a wrong fold is
// invisible — the screen shows A config, and only the log knows it is the wrong one.

import type { AdConfig, DecisionAction, DecisionBody } from '../shared/decisions.ts';

/** The fold's state for one ad. `null` = this ad does not exist yet; only `create_ad` accepts it. */
export type FoldState = AdConfig | null;

/** Why a decision cannot be applied. `code` is the wire's; `message` is for a human. */
export type FoldError = { code: FoldErrorCode; message: string };

export type FoldErrorCode =
  | 'ad_exists'            // create_ad against an ad_id the log already created
  | 'ad_unknown'           // any other action against an ad_id the log has never created
  | 'illegal_transition'   // the action is not admitted by the ad's current status
  | 'stale_precondition';  // I13: from_cents / from_id disagree with the current fold

/** The parts of a decision the fold reads. The envelope's other fields are the projection's. */
export type FoldDecision = { ts: string; body: DecisionBody };

/**
 * The transition table. Which actions each status admits, and nothing about values.
 *
 * `draft` admits only `launch` because DRAFT EDITS ARE NOT IN THE LOG (D5): config is free while
 * nothing references it, and once live, only levers touch it. A `set_budget` on a draft ad is
 * therefore not a lever pull that was rejected — it is a lever pull that should never have been
 * minted, and saying so is more useful than silently folding it.
 */
function admits(status: AdConfig['status'], action: DecisionAction): boolean {
  switch (status) {
    case 'draft':
      return action === 'launch';
    case 'live':
      return action === 'pause' || action === 'set_budget' || action === 'swap_component';
    case 'paused':
      return action === 'resume' || action === 'set_budget' || action === 'swap_component';
    case 'archived':
      // F1: no lever produces this state; see SCOPE.md §4 cut #3. `archive` sits third on the cut
      // line, so the member is kept and named rather than narrowed out of a type quoted from the
      // brief (L49) — a reader can then tell a scope cut from a modelling claim. It is written to
      // explain itself rather than to throw: an unreachable branch that throws reads as a bug
      // guard, and this is not a bug. Reinstating `archive` is one variant plus one transition.
      return false;
  }
}

/**
 * §7's first line: the compare-and-swap, plus the two existence rules and the transition table.
 *
 * Pure. Returns `null` when the decision may be applied, a `FoldError` when it may not — never
 * throws, because "this lever cannot be pulled right now" is an ordinary answer (a 409 at B14),
 * not an exception.
 *
 * Value VALIDITY is not checked here: `to_cents` being a non-negative integer is the wire parser's
 * job (B14) with the `daily_budget_cents >= 0` CHECK as the backstop. This function answers only
 * "does this decision describe the config we actually have".
 */
export function precondition(state: FoldState, body: DecisionBody): FoldError | null {
  if (body.action === 'create_ad') {
    return state === null
      ? null
      : { code: 'ad_exists', message: 'this ad has already been created by an earlier decision' };
  }
  if (state === null) {
    return {
      code: 'ad_unknown',
      message: `no create_ad decision exists for this ad, so '${body.action}' has no config to act on`,
    };
  }
  if (!admits(state.status, body.action)) {
    return {
      code: 'illegal_transition',
      message: `an ad in '${state.status}' does not admit '${body.action}'`,
    };
  }

  // I13 / G24. A staleness guard under U2's single actor — a stale tab, a double-submit, a retried
  // POST — and NOT a concurrency feature; there is no second writer and nothing may claim one.
  switch (body.action) {
    case 'set_budget':
      return body.from_cents === state.daily_budget_cents
        ? null
        : {
            code: 'stale_precondition',
            message: `set_budget expected from_cents ${body.from_cents}, current is ${state.daily_budget_cents}`,
          };
    case 'swap_component': {
      const current = body.slot === 'video' ? state.video_id : state.headline_id;
      return body.from_id === current
        ? null
        : {
            code: 'stale_precondition',
            message: `swap_component expected ${body.slot} '${body.from_id}', current is '${current}'`,
          };
    }
    default:
      return null;
  }
}

/**
 * `fold: (state, decision) -> state`. DESIGN §7.
 *
 * Exhaustive over the six actions; TypeScript's strict switch is what keeps it that way when a
 * seventh is added. Returns a NEW object every time — the caller's state is never mutated, so
 * replaying the log twice over the same starting value cannot produce two different answers.
 *
 * Preconditions are the caller's responsibility. Calling this on a decision `precondition()`
 * rejected is a programming error, and the two `existing()` guards below say so by throwing:
 * unlike `archived`, that branch really is a bug guard.
 */
export function fold(state: FoldState, decision: FoldDecision): AdConfig {
  const { body, ts } = decision;

  const existing = (): AdConfig => {
    if (state === null) {
      throw new Error(`fold: '${body.action}' on a non-existent ad — precondition() was not run`);
    }
    return state;
  };

  switch (body.action) {
    case 'create_ad':
      // Generation 1, in `draft`. `created_at` is the decision's own ts (see AdInitial's note):
      // one event, one timestamp, and the log holds it.
      return { ...body.initial, created_at: ts, status: 'draft', launched_at: null };

    case 'launch':
      // G02: the ONLY writer of `launched_at`. `resume` deliberately does not touch it — an ad
      // that was paused and resumed was still launched when it was launched.
      return { ...existing(), status: 'live', launched_at: ts };

    case 'pause':
      return { ...existing(), status: 'paused' };

    case 'resume':
      return { ...existing(), status: 'live' };

    case 'set_budget':
      return { ...existing(), daily_budget_cents: body.to_cents };

    case 'swap_component':
      return body.slot === 'video'
        ? { ...existing(), video_id: body.to_id }
        : { ...existing(), headline_id: body.to_id };
  }
}
