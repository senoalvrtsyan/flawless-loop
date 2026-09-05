// The drill-down — B53 / P12. `DESIGN.md` §10.2.
//
// This is D31's runtime backstop and the third of D34's three layers. The first two are compile
// time (`Display` in `wire.ts`, `<Metric>`'s required descriptor); this one is the check that runs
// in front of the reviewer, on real data, on click.
//
// **What is on screen and why each part is there:**
//
//   displayed   — the number that was on the page, read back from `rollup_minute` (the display
//                 path, built incrementally at ingest, D29)
//   recomputed  — the same query answered by `replay()`, which reads raw `signals` and re-derives
//                 attribution from zero over the same log prefix
//   verdict     — the comparison. §10.2: *"two independent routes to the same number, which is the
//                 only arrangement in which 'and they agree' means anything"*
//   evidence    — the events themselves, each with its lateness and, crucially, the minute it was
//                 CREDITED to, which for a conversion is its click's minute (D27-B) and is
//                 therefore not the minute its timestamp is in
//   slices      — the window at the descriptor's own grain: the next click down, and the only
//                 narrowings the server will accept (D46)
//
// **`as_of` is B54's**, and the endpoint already takes it — §10.3's rewind is the control, not the
// mechanism, and it lands next.
//
// **The client does no arithmetic here.** Both figures are the server's, and the verdict is the
// server's. A browser-side comparison would be the client checking a number it had been handed
// against another number it had been handed, which proves nothing about either.

import { useCallback, useEffect, useState } from 'react';
import type { TraceDescriptor, TraceEvidence } from '../shared/wire.ts';
import type { TraceResult } from '../server/trace.ts';
import { formatCents, formatMetric } from './metrics.ts';

/** `POST /api/trace`. `from`/`to` narrow the window; the server re-signs what it hands back. */
export async function fetchTrace(
  descriptor: TraceDescriptor,
  options: { from?: string; to?: string; as_of_ingest_seq?: number },
  signal: AbortSignal,
): Promise<TraceResult> {
  const res = await fetch('/api/trace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ descriptor, ...options }),
    signal,
  });
  const body: unknown = await res.json();
  if (!res.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : res.statusText;
    throw new Error(detail);
  }
  return body as TraceResult;
}

/** `received_at − ts`, in the words the tail already uses, so lateness reads the same everywhere. */
function lateness(event: TraceEvidence): string {
  const ms = Date.parse(event.received_at) - Date.parse(event.ts);
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

export type DrilldownProps = {
  /** The descriptor that was clicked, or `null` when the panel is closed. */
  descriptor: TraceDescriptor | null;
  onClose: () => void;
};

export function Drilldown({ descriptor, onClose }: DrilldownProps) {
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(
    (d: TraceDescriptor, options: { from?: string; to?: string }) => {
      const controller = new AbortController();
      setPending(true);
      setError(null);
      fetchTrace(d, options, controller.signal)
        .then(setResult)
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResult(null);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setPending(false));
      return () => controller.abort();
    },
    [],
  );

  // A new descriptor is a new question, and the panel re-asks it from scratch.
  useEffect(() => {
    if (descriptor === null) return;
    return run(descriptor, {});
  }, [descriptor, run]);

  if (descriptor === null) return null;

  const metric = descriptor.metric;

  return (
    <section className="drill">
      <header className="drill__head">
        <h3 className="drill__title">
          Walk it back — <code>{metric}</code>
        </h3>
        <button type="button" className="drill__close" onClick={onClose}>close</button>
      </header>

      {/* The QUERY, in full, before any answer. §10.1: the descriptor is the query, not the answer,
          and a reviewer has to be able to read what is about to be re-asked. */}
      <p className="drill__query">
        <code>{descriptor.ad_ids.length === 0 ? '(no ads)' : descriptor.ad_ids.join(', ')}</code> ·{' '}
        <code>{result?.descriptor.from ?? descriptor.from}</code> →{' '}
        <code>{result?.descriptor.to ?? descriptor.to}</code> · grain {descriptor.granularity_s}s ·
        placement <code>{descriptor.placement_rule}</code> · as of ingest_seq{' '}
        <code>{result?.descriptor.as_of_ingest_seq ?? descriptor.as_of_ingest_seq}</code>
      </p>

      {error !== null ? (
        <p className="drill__verdict drill__verdict--fail">{error}</p>
      ) : result === null ? (
        <p className="drill__query">{pending ? 'replaying the log…' : 'no answer yet'}</p>
      ) : (
        <>
          <p className={`drill__verdict drill__verdict--${result.verdict === 'MATCH' ? 'pass' : 'fail'}`}>
            <strong>{result.verdict}</strong> · displayed{' '}
            <strong>{formatMetric(metric, result.displayed)}</strong> from{' '}
            <code>rollup_minute</code> ({result.displayed_counts.buckets} buckets) · recomputed{' '}
            <strong>{formatMetric(metric, result.recomputed)}</strong> from{' '}
            <strong>{result.evidence.length + result.evidence_omitted}</strong> raw{' '}
            <code>signals</code> rows, attribution re-derived from zero
          </p>

          {/* The counts, both sides, always — a ratio can agree while its terms do not (2/4 and 3/6
              are both 0.5), so the integers are the strict comparison and they are shown whether
              or not the verdict is MATCH. */}
          <table className="log drill__counts">
            <thead>
              <tr>
                <th>path</th><th>impr</th><th>clicks</th><th>click ¢</th><th>spend ¢</th>
                <th>conv</th><th>value ¢</th><th>prov conv</th><th>prov ¢</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>rollup (displayed)</td>
                <td>{result.displayed_counts.impressions}</td>
                <td>{result.displayed_counts.clicks}</td>
                <td>{result.displayed_counts.click_cost_cents}</td>
                <td>{result.displayed_counts.spend_cents}</td>
                <td>{result.displayed_counts.conversions}</td>
                <td>{result.displayed_counts.value_cents}</td>
                <td>{result.displayed_counts.provisional_conversions}</td>
                <td>{result.displayed_counts.provisional_value_cents}</td>
              </tr>
              <tr>
                <td>raw re-sum</td>
                <td>{result.recomputed_counts.impressions}</td>
                <td>{result.recomputed_counts.clicks}</td>
                <td>{result.recomputed_counts.click_cost_cents}</td>
                <td>{result.recomputed_counts.spend_cents}</td>
                <td>{result.recomputed_counts.conversions}</td>
                <td>{result.recomputed_counts.value_cents}</td>
                <td>{result.recomputed_counts.provisional_conversions}</td>
                <td>{result.recomputed_counts.provisional_value_cents}</td>
              </tr>
            </tbody>
          </table>


          {result.slices.length === 0 ? null : (
            <>
              <p className="drill__query">
                {/* D46 made visible: these are the only narrowings the server will accept, and they
                    are computed by the same arithmetic that enforces the rule. */}
                <strong>{result.slices.length}</strong> non-empty{' '}
                {descriptor.granularity_s === 60 ? 'minute' : `${descriptor.granularity_s}s`} slice
                {result.slices.length === 1 ? '' : 's'} in this window
                {result.slices_omitted > 0 ? <> · {result.slices_omitted} more not listed</> : null} —
                click one to walk that bucket back on its own
              </p>
              <ul className="drill__slices">
                {result.slices.map((slice) => (
                  <li key={slice.from}>
                    <button
                      type="button"
                      className="metric__cell"
                      onClick={() => run(descriptor, { from: slice.from, to: slice.to })}
                    >
                      <code>{slice.from}</code> {formatMetric(metric, slice.value)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="drill__query">
            the events underneath — <strong>conversions first</strong>, then the rest, each in log
            order. Measured, and the reason the order is not simply the log's: on a six-hour window
            the first 400 contributors of 10,481 were all impressions, so a ROAS sat above a list
            containing nothing that earned any revenue
            {result.evidence_omitted > 0 ? (
              <>
                {' '}· <strong>{result.evidence_omitted} not listed</strong> (the list is capped;
                the re-sum above is over all {result.evidence.length + result.evidence_omitted})
              </>
            ) : null}
          </p>
          <table className="log">
            <thead>
              <tr>
                <th>event_id</th><th>kind</th><th>ts</th><th>arrived</th><th>late</th>
                <th>credited to</th><th>¢</th><th>seq</th>
              </tr>
            </thead>
            <tbody>
              {result.evidence.map((e) => (
                <tr key={e.event_id}>
                  <td className="log__ts"><code>{e.event_id}</code></td>
                  <td>{e.kind}</td>
                  <td className="log__ts">{e.ts}</td>
                  <td className="log__ts">{e.received_at}</td>
                  <td>{lateness(e)}</td>
                  {/* The one column that makes the list readable rather than suspicious: a
                      conversion timestamped Thursday sitting in Tuesday's bucket is D27-B, not a
                      bug, and the column says so without a paragraph. */}
                  <td className="log__ts">{e.credited_minute}</td>
                  <td>{e.cents === null ? '—' : formatCents(e.cents)}</td>
                  <td className="log__seq">{e.ingest_seq}</td>
                </tr>
              ))}
              {result.evidence.length === 0 ? (
                <tr><td colSpan={8} className="log__none">no events contributed to this figure</td></tr>
              ) : null}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

