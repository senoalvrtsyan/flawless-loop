// The decision log's types. DESIGN.md §2.3, §7.
//
// A decision is a LEVER PULL, and levers are the only thing that changes config (HR6). Nothing
// here describes a signal or a metric: `Signal` lives in types.ts and the two never mix, which is
// the model-level half of "configs, signals and levers stay distinct".
//
// `DecisionBody` is transcribed from DESIGN.md §2.3 with one deviation, marked below.

/** `ads.status`. `archived` is reachable by no lever — F1, and see fold.ts's transition table. */
export type AdStatus = 'draft' | 'live' | 'paused' | 'archived';

/** U3: channels are static reference data. No lever changes them; `create_ad` picks one. */
export type Channel = 'meta_feed' | 'meta_reels' | 'tiktok_feed' | 'snap_stories';

/** The two swappable slots. DESIGN §2.3. */
export type ComponentSlot = 'video' | 'headline';

/**
 * The config the fold produces: the `ads` row (§2.4) minus its identity and its bookkeeping.
 *
 * `ad_id` is the envelope's, not the body's. `current_generation_id` (E9) and `last_decision_seq`
 * are the PROJECTION's record of where the fold got to — they are written by applyDecision, not
 * decided by fold, so a fold test cannot accidentally assert on them.
 */
export type AdConfig = {
  name: string;                 // E8 (G03)
  created_at: string;           // E7 (G03) — derived from the create_ad decision's ts, see below
  status: AdStatus;
  video_id: string;
  headline_id: string;
  audience_id: string;
  channel: Channel;
  daily_budget_cents: number;
  launched_at: string | null;   // G02: written by `launch` and by nothing else
};

/**
 * `create_ad`'s payload. DESIGN §2.3 types it `Omit<AdConfig, "status" | "launched_at">`; this
 * omits `created_at` as well.
 *
 * ASSUMPTION (unratified) — needs sign-off before B15, which mints 12 of these. The literal
 * `Omit` leaves `created_at` client-supplied, which contradicts the Appendix's "nothing that is
 * derived is written by hand" and U7's "Decision.ts is request time": two timestamps for one
 * event, free to disagree, with the log holding the authoritative one. Deriving it from the
 * decision's `ts` makes them the same fact. Reversal is one field.
 */
export type AdInitial = Omit<AdConfig, 'status' | 'launched_at' | 'created_at'>;

/**
 * The six actions. DESIGN §2.3 verbatim, plus the `AdInitial` deviation above.
 *
 * `from_cents` / `from_id` are a PRECONDITION, not an annotation (I13, G24). Under U2 there is one
 * actor and no second writer, so this is a staleness guard — a stale tab, a double-submit, a
 * retried POST — and NOT a concurrency feature. Nothing may present it as one.
 */
export type DecisionBody =
  | { action: 'create_ad'; initial: AdInitial }                                        // E4
  | { action: 'launch' }                                                               // E5
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'set_budget'; from_cents: number; to_cents: number }
  | { action: 'swap_component'; slot: ComponentSlot; from_id: string; to_id: string };

export type DecisionAction = DecisionBody['action'];

/** One row of the decision log, with `payload_json` parsed back into its variant. */
export type Decision = {
  decision_id: string;    // U5: client-generated idempotency key
  decision_seq: number;   // E6: the fold order
  ts: string;             // U7: request time. Server-stamped, so backdating is unrepresentable
  received_at: string;
  actor: string;
  ad_id: string;
  rationale: string;      // brief L95: required, non-empty
  body: DecisionBody;
};

/** U2: one user, hard-coded. There is no auth and the README says so rather than implying one. */
export const ACTOR = 'human:nk';
