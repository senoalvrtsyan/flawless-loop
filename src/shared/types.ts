import type { AdStatus, Channel } from './decisions.ts';

// Wire types shared by the server, the simulator and the client.
//
// `Signal` is the brief's contract (L76) reproduced verbatim, including its `event` discriminator.
// Our STORE calls that column `kind` (DESIGN §2.2) — the rename lives at the ingest boundary and
// nowhere else, so a reviewer can paste the brief's type into the simulator and it type-checks.
//
// The envelope fields the brief does not have — `received_at` (E1), `ingest_seq` (E2),
// `source` (E15) — are absent here ON PURPOSE: the emitter never sends them (D12).

/** The brief's `Signal`, L76. Not extended, not narrowed. */
export type Signal = { event_id: string; ts: string; ad_id: string } & (
  | { event: 'impression' }
  | { event: 'click'; click_id: string; cost_cents: number } // click_id is E3 (G17)
  | { event: 'spend'; amount_cents: number }
  | { event: 'conversion'; attributed_click_id: string; value_cents: number }
);

export type SignalKind = Signal['event'];

/** `signal_deliveries.disposition`. The four values the schema's CHECK allows. */
export type Disposition =
  | 'accepted'
  | 'duplicate_identical'
  | 'duplicate_conflicting'
  | 'rejected_invalid';

/** `signals.source` — E15/D38, server-assigned: live POST vs the in-process backfill seeder. */
export type SignalSource = 'backfill' | 'live';

/** What one delivery did. `reason` is response-only; the store keeps the raw body instead. */
export type DeliveryOutcome = {
  event_id: string;
  disposition: Disposition;
  reason?: string;
};

export type IngestResult = {
  received: number;
  accepted: number;
  duplicate_identical: number;
  duplicate_conflicting: number;
  rejected_invalid: number;
  /** High-water `ingest_seq` after the batch — the SSE cursor (D12/E2). */
  ingest_seq: number;
  outcomes: DeliveryOutcome[];
};

// ---------------------------------------------------------------------------------------------
// `GET /api/sim/world` — the emitter's one window onto the world (D40-A, SIMULATOR §16).
//
// Here rather than in `src/server/sim-world.ts` for the reason this file already states about
// `IngestResult`: the wire shape is invisible to `tsc` on both sides of a `fetch`, so a shared
// declaration is the only place a change to it can be made to fail at compile time rather than at
// a demo. Landed in the server module at B31a and moved here at B31b, when the emitter became the
// second reader.

/** One ad as the emitter needs it: the fold's current config, plus status. */
export type WorldAd = {
  ad_id: string;
  status: AdStatus;
  video_id: string;
  headline_id: string;
  audience_id: string;
  channel: Channel;
  daily_budget_cents: number;
  current_generation_id: string;
  last_decision_seq: number;
  /** Read-time sum of the two disjoint cost paths (D10, L79-80) over the account-local day. */
  spend_so_far_today_cents: number;
};

/**
 * Cumulative delivery per `(lineage, version, audience)`, both slots, recomputed from the log.
 *
 * One row shape serving two rules, because they need two groupings: §7.1's `F` is
 * version-agnostic (a recut inherits its lineage's frequency, §7.3) so the reader SUMS across
 * versions, while §8's novelty is version-specific (a bump gets a fresh window) so the reader
 * takes one row's `first_impression_at`.
 *
 * `first_impression_at` is the **first exposure**, which is what §8 measures novelty from: a pair
 * whose ad has launched but delivered nothing has not been exposed.
 */
export type WorldDelivery = {
  lineage_id: string;
  version: number;
  audience_id: string;
  impressions: number;
  first_impression_at: string;
};

export type SimWorld = {
  /** The fold's high-water mark across every ad. A change here means a lever moved (§16). */
  last_decision_seq: number;
  /** The local day the spend figures are summed over, so the emitter never computes it twice. */
  account_day: { tz: string; starts_at: string };
  /**
   * §14's first term and the seed boundary, from `sim_run` — **D60**. The emitter holds NO seed of
   * its own: it uses this one, so it cannot continue a seeded history under a seed that history
   * was not generated with. `null` on a store that has been migrated but never seeded, which is
   * exactly when the emitter must not emit.
   */
  run: { seed: string; t0: string; backfill_days: number } | null;
  ads: WorldAd[];
  /** Named for what it is: delivery per (lineage, version, audience). See `WorldDelivery`. */
  deliveries: WorldDelivery[];
  /** §15.3(b)'s pending-conversion re-derivation. Empty until B34 seeds. */
  pending_backfill_clicks: { click_id: string; ad_id: string; ts: string }[];
  /** §17's scenario triggers, so there is no second control channel. */
  pending_scenarios: { scenario_id: string; name: string; args_json: string; ts: string }[];
};

/**
 * The five config fields every emission function needs. `WorldAd` and `fixtures.ts`'s `AdFixture`
 * both satisfy it structurally, which is what lets the dry run read fixtures while the live
 * emitter reads the fold — **the live path must never read the fixture's slots**, because a
 * `swap_component` changes the fold and leaves the fixture stale.
 */
export type AdConfig = {
  ad_id: string;
  channel: Channel;
  audience_id: string;
  video_id: string;
  headline_id: string;
};
