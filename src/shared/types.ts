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
