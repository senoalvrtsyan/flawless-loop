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
