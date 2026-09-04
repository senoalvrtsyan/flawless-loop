// The raw event tail and the stream-health counters — B44. `DESIGN.md` §11, D34.
//
// **A bounded ring, fed at the ingest boundary, sampled by the flush tick.** §11 puts "sample the
// raw tail, capped per tick" inside the flush, and the reason it is a *sample* rather than a feed is
// arithmetic: the seeded portfolio delivers a few hundred events a second at peak, and a browser
// that received every one would spend its frame budget on text nobody reads.
//
// **Everything here is display-only** (D34 layer 1): amounts are branded `Display` strings, so
// `tsc` refuses to add them. The tail cannot become a source of a performance number by accident,
// which is the property D30-C's single-implementation guarantee rests on.
//
// **The health figures are derived from the ring**, which is D34's own wording, and that has two
// consequences stated on the surface rather than hidden: they describe the last N deliveries only,
// and they reset when the process restarts. Both are correct for transport telemetry. The one
// exception is `orphans_unresolved`, which is a store read — it is a fact about attribution, not
// about the ring, and D54 forbids trusting a stored expiry flag for it.

import type { DatabaseSync } from 'node:sqlite';
import type { DeliveryOutcome, Disposition, SignalSource } from '../shared/types.ts';
import { display, type StreamHealth, type TailEvent, type TailFrame } from '../shared/wire.ts';

/**
 * How many deliveries the ring holds. The health window, and the tail's own memory.
 *
 * 500 is one to two seconds of peak delivery on the seeded portfolio — long enough that
 * `events_per_second` is measured over a real interval rather than over one batch, short enough
 * that a paused demo does not accumulate megabytes of strings.
 */
export const RING = 500;

/** Rows per `tail` frame. The rest are counted in `omitted`, never silently dropped (§11). */
export const TAIL_PER_FRAME = 25;

/** What the ingest route hands over: the posted body, plus what the boundary made of each event. */
export type Recorded = {
  events: readonly unknown[];
  outcomes: readonly DeliveryOutcome[];
  source: SignalSource;
  /** The SAME `now` the ingest transaction stamped `received_at` with — never a second clock. */
  received_at: string;
};

export type Tail = {
  record: (recorded: Recorded) => void;
  /** One frame's worth, newest first, plus how many were left out and the health block. */
  frame: (db: DatabaseSync) => TailFrame | null;
  /** Counters the flush owns rather than the ring: spilled rows and backpressured frames. */
  noteSpill: (rows: number) => void;
  noteBackpressure: () => void;
  size: () => number;
};

/** `received_at − ts`, pre-rendered. `null` when it rounds to nothing, so "0s late" never shows. */
function lateness(ts: unknown, receivedAt: string): string | null {
  if (typeof ts !== 'string') return null;
  const ms = Date.parse(receivedAt) - Date.parse(ts);
  if (!Number.isFinite(ms) || ms < 1_000) return null;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** Cents to a display string. The ONE place a tail amount is rendered. */
function money(cents: unknown): string | null {
  return typeof cents === 'number' && Number.isFinite(cents)
    ? `$${(cents / 100).toFixed(2)}`
    : null;
}

const field = (event: unknown, name: string): unknown =>
  typeof event === 'object' && event !== null ? (event as Record<string, unknown>)[name] : undefined;

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * One posted event plus its outcome, as the tail shows it.
 *
 * **Built from the RAW POSTED BODY, not from the store.** A rejected delivery never became a
 * `signals` row, and the tail is the only place it is ever visible — which is the point of §5.1's
 * "write `signal_deliveries` always". Reading the store instead would show only the events that
 * were accepted, and the injected-fault channel (§13) would be invisible on the one surface built
 * to show it.
 */
function toTailEvent(event: unknown, outcome: DeliveryOutcome, recorded: Recorded): TailEvent {
  const ts = asString(field(event, 'ts'));
  const kind = asString(field(event, 'event'));
  // A conversion's money is `value_cents`, a click's is `cost_cents`, a spend's is `amount_cents`
  // — the ownership table `ingest.ts` enforces (B16's `OWN_FIELDS`). Whichever is present is the
  // one this event owns, so no branch on `kind` is needed and a malformed event still renders.
  const amount =
    money(field(event, 'value_cents')) ??
    money(field(event, 'cost_cents')) ??
    money(field(event, 'amount_cents'));
  const late = ts === null ? null : lateness(ts, recorded.received_at);

  return {
    event_id: outcome.event_id,
    ad_id: asString(field(event, 'ad_id')) ?? '(none)',
    kind: kind ?? '(none)',
    disposition: outcome.disposition,
    source: recorded.source,
    ts: display(ts ?? '(none)'),
    received_at: display(recorded.received_at),
    late: late === null ? null : display(late),
    amount: amount === null ? null : display(amount),
    attributed_click_id: asString(field(event, 'attributed_click_id')),
    reason: outcome.reason ?? null,
  };
}

const COUNT_ORPHANS = `
  SELECT COUNT(*) AS n FROM conversion_attribution WHERE state <> 'resolved'
`;

export function createTail(): Tail {
  /** Newest last. A plain array with a shift-on-overflow — `RING` is 500, so the copy is free. */
  const ring: { event: TailEvent; at: number }[] = [];
  let spilled = 0;
  let backpressured = 0;
  let orphans: { get: () => unknown } | null = null;

  function health(db: DatabaseSync): StreamHealth {
    const counts: Record<Disposition, number> = {
      accepted: 0,
      duplicate_identical: 0,
      duplicate_conflicting: 0,
      rejected_invalid: 0,
    };
    for (const entry of ring) counts[entry.event.disposition] += 1;

    const first = ring[0];
    const last = ring[ring.length - 1];
    // Over the ring's OWN span, not over a wall-clock window: with a 500-event ring the span is
    // whatever it is, and dividing by a fixed 60 s would report a rate the feed never had.
    const spanS =
      first !== undefined && last !== undefined ? (last.at - first.at) / 1_000 : 0;

    orphans ??= db.prepare(COUNT_ORPHANS);
    const orphanRow = orphans.get() as { n: number };

    return {
      window_events: ring.length,
      events_per_second: spanS > 0 ? Number((ring.length / spanS).toFixed(1)) : null,
      last_event_age_s:
        last === undefined ? null : Number(((Date.now() - last.at) / 1_000).toFixed(1)),
      ...counts,
      rows_spilled: spilled,
      frames_backpressured: backpressured,
      orphans_unresolved: orphanRow.n,
    };
  }

  return {
    record(recorded) {
      const at = Date.parse(recorded.received_at);
      for (const [i, outcome] of recorded.outcomes.entries()) {
        // The outcomes are in the posted order, so index `i` is that event. `?? undefined` rather
        // than a skip: an outcome with no matching body still belongs in the tail, because it
        // still happened.
        ring.push({ event: toTailEvent(recorded.events[i], outcome, recorded), at });
      }
      if (ring.length > RING) ring.splice(0, ring.length - RING);
    },

    frame(db) {
      if (ring.length === 0) return null;
      // Newest first — a tail is read from the top — and capped. `omitted` is what the cap left
      // behind IN THIS FRAME, so a reader can see the sample rate rather than infer it.
      const events = ring
        .slice(-TAIL_PER_FRAME)
        .reverse()
        .map((entry) => entry.event);
      return { events, omitted: Math.max(0, ring.length - events.length), health: health(db) };
    },

    noteSpill(rows) {
      spilled += rows;
    },
    noteBackpressure() {
      backpressured += 1;
    },
    size: () => ring.length,
  };
}
