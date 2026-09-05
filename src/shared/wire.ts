// The raw tail's wire types — **B44, and D34's first layer is the whole point of this file.**
//
// D34 chose option C: *"numerics absent from the tail frame, plus descriptor-gated rendering"*,
// three layers, two of them compile-time. This is layer one, in Seno's words as recorded there:
//
//   *"Money on a `TailFrame` is a pre-rendered display string (`amount: "$0.42"`), never an
//   integer. Summing the tail requires parsing strings — visible in a diff, which is the point."*
//
// **Why a brand and not a bare `string`.** A bare `string` still concatenates: `0 + e.amount`
// typechecks in TypeScript and yields `"0$0.42"`, which is a bug that reaches the screen. `Display`
// is a branded string, so arithmetic on it is a **compile error** and getting a number out of it
// requires an explicit, greppable cast. That is the difference between a convention and a
// mechanism, which is exactly the ground Seno rejected option A on.
//
// The governing rule, from D34: *raw numbers reach the client only in response to a trace
// descriptor.* Two payload types exist — `TailFrame` (display, unsolicited, pushed; this file) and
// `TraceEvidence` (summable, returned only by descriptor replay; B52/B53).
//
// **The stated exception, also D34's, also in Seno's words:** *"I'd rather you name the
// stream-health exception than pretend to an absolute that doesn't hold — that's the right call.
// Just make sure the label makes it obvious those numbers describe the transport and not the ads."*
// So `StreamHealth` carries real numbers. They describe the transport, they are rendered in their
// own treatment under a heading that says so, and the rule in the README reads *"no PERFORMANCE
// number is derived from the tail"* rather than an absolute the design does not hold.

import type { MetricKey } from './metrics.ts';
import type { Disposition, SignalSource } from './types.ts';

/**
 * A pre-rendered display string. **Cannot be added, summed or averaged** — `tsc` refuses.
 *
 * The `unique symbol` field exists only in the type; nothing is attached at runtime, so a
 * `TailFrame` is ordinary JSON on the wire.
 */
export type Display = string & { readonly __display: unique symbol };

/**
 * Brand a string for display. **Server-side only**, and deliberately not exported to the client
 * bundle's benefit: the client has no reason to mint one, and if it ever does, that line is the
 * thing a reviewer greps for.
 */
export function display(value: string): Display {
  return value as Display;
}

/**
 * One delivery, as the tail shows it. **Every quantity is a `Display`.**
 *
 * `ad_id`, `kind` and `disposition` stay plain strings: they are identifiers and enumerations, not
 * numbers, and nothing can be summed out of them.
 */
export type TailEvent = {
  event_id: string;
  ad_id: string;
  kind: string;
  disposition: Disposition;
  source: SignalSource;
  /** The event's own time and our arrival stamp, as strings, for reading — not for arithmetic. */
  ts: Display;
  received_at: Display;
  /** `received_at − ts`, pre-rendered: `"2 d 4 h"`. The tail is where lateness is FELT. */
  late: Display | null;
  /** Money, pre-rendered with its unit: `"$0.42"`. Never an integer (D34 layer 1). */
  amount: Display | null;
  /** A conversion's claimed click, or `null`. An id, so it is safe as a plain string. */
  attributed_click_id: string | null;
  /** Why a delivery was refused, when it was. Free text from `ingest()`. */
  reason: string | null;
};

/**
 * Stream telemetry — **the named D34 exception**. These are numbers, and they describe the
 * TRANSPORT: how fast events are arriving, how stale the newest one is, what the boundary did with
 * them. None of them is a performance metric and none may be rendered beside one.
 *
 * All of it is derived from the tail's own ring buffer, which is what D34 says ("derived from the
 * tail"), so it is bounded by the ring and resets when the process restarts. That is honest for
 * transport figures and it is stated on the surface: the label says "in the last N deliveries".
 */
export type StreamHealth = {
  /** How many deliveries the figures below were computed over. The ring's occupancy. */
  window_events: number;
  /** Deliveries per second across the ring's own time span. `null` until there are two. */
  events_per_second: number | null;
  /** Age of the newest delivery, in seconds — the "is the feed alive" number. */
  last_event_age_s: number | null;
  /** Dispositions within the ring. §11's counters, and B33's injected faults show up here. */
  accepted: number;
  duplicate_identical: number;
  duplicate_conflicting: number;
  rejected_invalid: number;
  /** Bucket rows the flush had to hold back for the next tick because a frame was full (B44a). */
  rows_spilled: number;
  /** Frames a subscriber's socket could not take immediately. Buffered, never dropped. */
  frames_backpressured: number;
  /** Unresolved conversions right now — D16's orphans, the one store-backed figure here. */
  orphans_unresolved: number;
};

export type TailFrame = {
  events: TailEvent[];
  /**
   * Deliveries the cap left out of THIS frame. The tail is a sample, and saying how big a sample
   * is the difference between a feed and a lie: at 400 events a second nobody reads them all, and
   * a tail that quietly showed 20 of 400 would imply the other 380 did not happen.
   */
  omitted: number;
  health: StreamHealth;
};

// ---------------------------------------------------------------------------------------------
// **B51 — `TraceDescriptor`, `DESIGN.md` §10.1.** The second half of D34's layer two.
//
// The file above is layer one: the numbers are NOT IN the tail frame. This is the other side of
// the same rule — *raw numbers reach the client only in response to a trace descriptor* — and the
// mechanism is the same one, a brand:
//
//   - `Display` (above) is a string arithmetic cannot touch, so tail money cannot become a total;
//   - `Signature` (below) is a string the CLIENT cannot mint, so a client-invented number cannot
//     become a descriptor and therefore cannot reach `<Metric>` (B52).
//
// `signDescriptor()` in `src/server/descriptor.ts` is the only function that produces a
// `Signature`, and it is server-side. In the browser bundle there is nothing to call: a bare
// string does not satisfy the brand, so `<Metric value={sumTheTail()} descriptor={???}/>` has no
// third argument that typechecks. That is what `BUILD_PLAN.md` B52 means by *"try to render a
// number without a descriptor and watch `tsc` reject it"*.
//
// **The descriptor is the QUERY, not the answer** (§10.1, and D46 turns on the phrase). It names
// what was asked — metric, ads, window, grain, placement rule, log position — and never the value.
// That is what makes the walk-back a proof: the server re-answers the same question from raw
// events (`replay()`, B23) and the two are compared on screen.

/**
 * The metrics a descriptor can name.
 *
 * **A divergence from `DESIGN.md` §10.1, and it is named rather than quietly reconciled** (see
 * `BRIEF_GAPS.md` §H3): §10.1 writes the union as `"spend_cents" | "value_cents" | …` while the
 * code has said `spend` since B38, where `MetricKey` was introduced and the surface's six controls
 * were built from it. Two names for one metric across a signed payload is the kind of thing that
 * is discovered when a descriptor fails to verify, so the code's name wins and the document is
 * corrected. `conversions` and `value_cents` are §10.1's, and they have no `MetricKey` because no
 * control charts them — they are drillable from the headline's provisional/settled line.
 */
export type TraceMetric = MetricKey | 'conversions' | 'value_cents';

/**
 * An HMAC over a descriptor's fields — **branded, so the client cannot produce one**.
 *
 * Like `Display`, the `unique symbol` exists only in the type; on the wire it is a hex string.
 * Getting one requires either the server's `signDescriptor()` or an explicit cast, and the cast is
 * the line a reviewer greps for.
 */
export type Signature = string & { readonly __signature: unique symbol };

/**
 * What a number on screen is an answer to — `DESIGN.md` §10.1, field for field.
 *
 * `granularity_s` is the grain the value may be **narrowed to**, and D46 consequence 3 is the rule
 * it enforces: *"the client may re-bucket to display granularity, and what it renders carries the
 * server's descriptor unmodified … it must re-bucket to the descriptor's own `granularity_s`."*
 * `POST /api/trace` refuses a narrowing that is not a whole number of grains from `from` (B53), so
 * that rule is checked rather than trusted.
 */
export type TraceDescriptor = {
  metric: TraceMetric;
  /** Sorted, so the same selection always produces the same bytes and the same signature. */
  ad_ids: string[];
  /** Minute-aligned UTC, half-open `[from, to)` — the window `parseSnapshotQuery` resolved. */
  from: string;
  to: string;
  /** Which rung of D20's ladder this query may be answered at. */
  granularity_s: number;
  /** D27 — inspectable at the point of use, so "which minute does a conversion land in" is on the wire. */
  placement_rule: 'cohort_click_time';
  /** A `generation_id`, or `null` for all. Unused by any current surface; on the wire because §10.1 puts it there. */
  generation_scope: string | null;
  /** The log prefix this number reflects. **This is what makes a restatement provable** (§10.3). */
  as_of_ingest_seq: number;
  sig: Signature;
};

/**
 * One raw event, **summable on purpose** — D34's second payload type, the counterpart of
 * `TailEvent` above.
 *
 * It differs from a tail frame in exactly the way D34 requires: `cents` is an integer, not a
 * `Display`. It is returned ONLY by `POST /api/trace`, in response to a signed descriptor, and it
 * is summable precisely so the reviewer can add it up and compare against the figure on screen.
 */
export type TraceEvidence = {
  event_id: string;
  /** The event's own time — the canonical `ts_effective` (I10's clamp already applied). */
  ts: string;
  /** When the boundary stamped it. `received_at - ts` is the lateness the drill-down prints. */
  received_at: string;
  ad_id: string;
  kind: string;
  /** Money, in cents, or `null` for an event that carries none. Summable — that is the point. */
  cents: number | null;
  /**
   * **The minute this event was COUNTED IN**, which for a conversion is its click's minute
   * (D27-B) and is therefore not derivable from `ts`. Without it the evidence list looks wrong:
   * a conversion timestamped Thursday contributing to Tuesday reads as a bug rather than as
   * attribution.
   */
  credited_minute: string;
  /** `ingest_seq` — the position in the log, and the `as_of` a reviewer can rewind to (B54). */
  ingest_seq: number;
};
