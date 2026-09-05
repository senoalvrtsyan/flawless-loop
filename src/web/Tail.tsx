// The raw event tail and the stream-health block — B44, `DESIGN.md` §11, **D34**.
//
// **Nothing in the tail is a number.** Every quantity arrives as a branded `Display` string, so
// `tsc` rejects arithmetic on it: `events.reduce((n, e) => n + e.amount, 0)` does not compile, and
// getting a number out requires an explicit cast that shows up in a diff. That is D34's layer one,
// and it is the reason this component can sit on the same page as the performance numbers without
// becoming a second, undescribed source of one.
//
// **The telemetry block is D34's NAMED EXCEPTION**, in Seno's words: *"I'd rather you name the
// stream-health exception than pretend to an absolute that doesn't hold — just make sure the label
// makes it obvious those numbers describe the transport and not the ads."* So:
//
//   - it has its own heading that says **transport**, and its own monospace treatment;
//   - it never shares a row, a card or a border with a performance metric;
//   - every figure is labelled with what it is measured over ("in the last N deliveries"), because
//     it comes from the tail's ring buffer and resets when the server restarts.
//
// The rule in the README therefore reads *"no PERFORMANCE number is derived from the tail"*, not an
// absolute the design does not hold.

import type { StreamHealth, TailEvent, TailFrame } from '../shared/wire.ts';

/** Dispositions get a glyph as well as a colour — the same non-colour-channel rule as D45. */
const GLYPH: Record<string, string> = {
  accepted: '✓',
  duplicate_identical: '=',
  duplicate_conflicting: '≠',
  rejected_invalid: '✗',
};

function Health({ health }: { health: StreamHealth }) {
  return (
    <div className="telemetry telemetry--block">
      {/* **D34 requires a heading naming this as transport**, so the first clause is not optional.
          D75 cut the three sentences that restated it. */}
      <div className="telemetry__heading">
        Stream health — <strong>transport, not performance</strong>. None of these is an ad metric.
      </div>
      <div className="telemetry__grid">
        <span>
          {health.events_per_second === null ? '—' : health.events_per_second}/s events
        </span>
        <span>
          last event{' '}
          {health.last_event_age_s === null ? '—' : `${health.last_event_age_s}s ago`}
        </span>
        <span>{health.accepted} accepted</span>
        <span>{health.duplicate_identical} dup identical</span>
        <span>{health.duplicate_conflicting} dup conflicting</span>
        <span>{health.rejected_invalid} rejected</span>
        <span>{health.rows_spilled} rows spilled</span>
        <span>{health.frames_backpressured} frames backpressured</span>
        <span>{health.orphans_unresolved} orphans unresolved</span>
      </div>
      {/* **D75.** The bound and the reset are facts that change how the figures read, so they stay.
          Why `orphans unresolved` is counted the way it is belongs to README §"Late-arriving
          conversions". */}
      <div className="telemetry__scope">
        last {health.window_events} deliveries this server process has seen · the ring resets on
        restart
      </div>
    </div>
  );
}

function Row({ event }: { event: TailEvent }) {
  return (
    <li className={`tail__row tail__row--${event.disposition}`}>
      <span className="tail__glyph">{GLYPH[event.disposition] ?? '?'}</span>
      <code className="tail__kind">{event.kind}</code>
      <code className="tail__ad">{event.ad_id}</code>
      {/* Strings, all of them. There is nothing here to add up. */}
      <span className="tail__amount">{event.amount ?? ''}</span>
      <span className="tail__ts">{event.ts}</span>
      <span className="tail__late">{event.late === null ? '' : `+${event.late} late`}</span>
      {event.attributed_click_id === null ? null : (
        <code className="tail__click">→ {event.attributed_click_id}</code>
      )}
      {event.reason === null ? null : <span className="tail__reason">{event.reason}</span>}
      <code className="tail__id">{event.event_id}</code>
    </li>
  );
}

export function Tail({ frame }: { frame: TailFrame | null }) {
  if (frame === null) {
    return (
      <p className="tail__empty">
        No deliveries yet on this connection. The tail is fed at the ingest boundary, so it fills as
        the simulator emits — <code>npm run sim</code> if it is not running.
      </p>
    );
  }

  return (
    <>
      <Health health={frame.health} />
      {/* The sample rate, stated. A tail showing 25 of 400 deliveries without saying so would
          imply the other 375 did not happen (§11: the tail is sampled, capped per tick). */}
      <p className="tail__scope">
        newest {frame.events.length} of {frame.events.length + frame.omitted} deliveries in the
        ring · every value below is a pre-rendered string, so nothing on this surface can be summed
        into a metric (D34)
      </p>
      <ol className="tail">
        {frame.events.map((event) => (
          <Row key={event.event_id} event={event} />
        ))}
      </ol>
    </>
  );
}
