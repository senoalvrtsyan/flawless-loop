// `<Metric>` — B52, and **D34 layer two on the client side**.
//
// The rule, from D34: *raw numbers reach the client only in response to a trace descriptor.* This
// component is the render gate that makes it structural. Its props REQUIRE a `TraceDescriptor`,
// whose `sig` is a `Signature` — a branded string produced by exactly one function, `sign()` in
// `src/server/descriptor.ts`, which does not exist in the browser bundle.
//
// **What that buys, concretely.** Write the tempting thing:
//
//   const spent = tail.events.reduce((n, e) => n + Number(e.amount.slice(1)), 0);
//   <Metric metric="spend" value={spent} descriptor={???} />
//
// …and there is nothing to put in `???`. A hand-built object fails on `sig: string` not being
// assignable to `Signature`; a cast (`as Signature`) compiles and is the one line a reviewer greps
// for — which is D34's own standard for the difference between a mechanism and a convention. And
// even a cast does not survive the click: `POST /api/trace` verifies the HMAC (B53), so a forged
// descriptor reads `invalid_signature` on screen rather than returning a number.
//
// Two layers, not three, are in this file. The third is D31's runtime backstop — the drill-down's
// on-screen PASS/FAIL, which is B53 — and it is what catches a number that is wrong for a reason
// the type system cannot see.
//
// **The named exception is NOT rendered here** (D34, Seno's words): stream-health figures are real
// numbers describing the TRANSPORT, and they live in `Tail.tsx` under a heading that says so. They
// never come through this component, which is the structural half of "never share a surface with a
// performance metric in a way that could be read as one".

import type { TraceDescriptor, TraceMetric } from '../shared/wire.ts';
import { UNKNOWN, formatMetric, glossFor } from './metrics.ts';

export type MetricProps = {
  /**
   * Which metric this is — `TraceMetric`, the same closed union the descriptor names, so a figure
   * and the query under it cannot be about two different things. `formatMetric` gives each one its
   * unit; there is no `default` branch, so an added metric is a compile error rather than a blank.
   */
  metric: TraceMetric;
  /** The server's value, verbatim. `null` is *unknown* and renders as an em dash, never as zero. */
  value: number | null;
  /** **The gate.** No descriptor, no render — and no way for the client to make one. */
  descriptor: TraceDescriptor;
  label: string;
  /** The one-line caveat under the figure (`METRIC_NOTES` — the cohort lag, D27/§4.5). */
  note?: string | undefined;
  /**
   * Open the drill-down for this descriptor (B53). Optional: a figure with no handler still
   * renders, it simply is not clickable — which is the honest state before B53 wires it, and the
   * state of any figure a surface deliberately does not offer a walk-back for.
   */
  onDrill?: ((descriptor: TraceDescriptor) => void) | undefined;
};

/**
 * One headline figure, with its provenance attached.
 *
 * The descriptor is not displayed — it is carried. What IS displayed, once `onDrill` is wired, is
 * that the number can be opened: the affordance is the claim, and B53 is where the claim is checked
 * in front of the reviewer.
 */
export function Metric({ metric, value, descriptor, label, note, onDrill }: MetricProps) {
  const text = value === null ? UNKNOWN : formatMetric(metric, value);
  return (
    <div className="metric">
      {/* **What the abbreviation stands for, on hover** — `glossFor` gives the expansion, the
          division underneath it, and (for CTR/CPA/ROAS) the cohort caveat on a second line. The
          dotted underline is the affordance: a label with no gloss would look identical without
          it, and a tooltip nobody knows is there is not a label. */}
      <span className="metric__label metric__label--gloss" title={glossFor(metric)}>
        {label}
      </span>
      {onDrill === undefined ? (
        <strong className="metric__value">{text}</strong>
      ) : (
        <button
          type="button"
          className="metric__value metric__value--drill"
          onClick={() => onDrill(descriptor)}
          // The window and the log position are what the walk-back will be run at, so the hover
          // says them: a reviewer who clicks should already know which question is about to be
          // re-asked, rather than discovering it in the panel.
          title={`walk this number back — ${descriptor.metric} over ${descriptor.from} → ${descriptor.to}, as of ingest_seq ${descriptor.as_of_ingest_seq}`}
        >
          {text}
        </button>
      )}
      {note === undefined ? null : <span className="metric__note">{note}</span>}
    </div>
  );
}

/**
 * The same gate for a table cell — B38's per-ad rows, which are as much a performance number as the
 * headline is and must not reach the screen by a second, ungated route.
 *
 * A separate component rather than a `variant` prop because the markup is genuinely different (a
 * `<td>`, no label, no note) and because one component that renders two different elements is how
 * the gate quietly acquires an escape hatch.
 */
export function MetricCell({ metric, value, descriptor, onDrill }: Omit<MetricProps, 'label' | 'note'>) {
  const text = value === null ? UNKNOWN : formatMetric(metric, value);
  return (
    <td>
      {onDrill === undefined ? (
        text
      ) : (
        <button type="button" className="metric__cell" onClick={() => onDrill(descriptor)}>
          {text}
        </button>
      )}
    </td>
  );
}
