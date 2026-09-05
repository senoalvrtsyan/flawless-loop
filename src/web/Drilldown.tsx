// The drill-down — B53 / P12, and **B54's `as_of` rewind**. `DESIGN.md` §10.2 and §10.3.
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
// **The client does no arithmetic here.** Both figures are the server's, and the verdict is the
// server's. A browser-side comparison would be the client checking a number it had been handed
// against another number it had been handed, which proves nothing about either.

import { useCallback, useEffect, useState } from 'react';
import type { TraceDescriptor, TraceEvidence } from '../shared/wire.ts';
import type { TraceResult } from '../server/trace.ts';
import { formatCents, formatMetric } from './metrics.ts';

/** `POST /api/trace`. `from`/`to` narrow; `as_of_ingest_seq` rewinds (B54). Both re-sign server-side. */
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
  /**
   * **B54** — the log position to answer at, as typed. Held as a string rather than a number so an
   * empty box is distinguishable from zero; `null` means "the descriptor's own", which is what the
   * screen was showing.
   */
  const [asOf, setAsOf] = useState<string>('');
  /** The answer at the descriptor's own `as_of`, kept so B54 can diff against it. */
  const [baseline, setBaseline] = useState<TraceResult | null>(null);

  const run = useCallback(
    (d: TraceDescriptor, options: { from?: string; to?: string; as_of_ingest_seq?: number }, isBaseline: boolean) => {
      const controller = new AbortController();
      setPending(true);
      setError(null);
      fetchTrace(d, options, controller.signal)
        .then((r) => {
          setResult(r);
          if (isBaseline) setBaseline(r);
        })
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

  // A new descriptor is a new question: reset the rewind box and the baseline with it, or the
  // "as of N, was M" line would be comparing two different windows.
  useEffect(() => {
    if (descriptor === null) return;
    setAsOf('');
    setBaseline(null);
    return run(descriptor, {}, true);
  }, [descriptor, run]);

  if (descriptor === null) return null;

  const metric = descriptor.metric;
  const changed = diffAgainstBaseline(result, baseline);

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
          <p
            className={`drill__verdict drill__verdict--${
              result.verdict === 'MATCH' ? 'pass' : result.verdict === 'MISMATCH' ? 'fail' : 'na'
            }`}
          >
            <strong>{result.verdict}</strong> · displayed{' '}
            <strong>{formatMetric(metric, result.displayed)}</strong> from{' '}
            <code>rollup_minute</code> ({result.displayed_counts.buckets} buckets) · recomputed{' '}
            <strong>{formatMetric(metric, result.recomputed)}</strong> from{' '}
            <strong>{result.evidence.length + result.evidence_omitted}</strong> raw{' '}
            <code>signals</code> rows, attribution re-derived from zero
            {/* **The rewind's own honesty, and it was found by running it** (B54): the rollup has
                no `as_of` — it is the fold of everything applied to it — so a recomputation over an
                earlier prefix is not a check on it. Rewound, this surface shows the DIFFERENCE and
                withholds the verdict, rather than reporting MISMATCH on a correct store. */}
            {result.verdict === 'NOT_COMPARABLE' ? (
              <>
                {' '}— the recomputation is over the log up to ingest_seq{' '}
                <strong>{result.descriptor.as_of_ingest_seq}</strong>, while these buckets reflect
                the log up to <strong>{result.rollup_as_of}</strong>. A projection has no{' '}
                <code>as_of</code>, so there is nothing here to agree or disagree with. Press{' '}
                <em>now</em> for the check; the figures above are what the screen{' '}
                <em>would have shown</em> at that position.
              </>
            ) : null}
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

          {/* **B54 — §10.3.** The same descriptor at an earlier log position. The server re-signs
              it, so the rewound answer is as much a server-issued question as the original. */}
          <div className="controls drill__asof">
            <div className="controls__group">
              <span className="controls__label">as_of ingest_seq</span>
              <input
                type="number"
                min={0}
                value={asOf}
                placeholder={String(descriptor.as_of_ingest_seq)}
                onChange={(e) => setAsOf(e.target.value)}
              />
              <button
                type="button"
                disabled={pending || asOf.trim() === ''}
                onClick={() => run(descriptor, { as_of_ingest_seq: Number(asOf) }, false)}
              >
                rewind
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setAsOf('');
                  run(descriptor, {}, true);
                }}
              >
                now
              </button>
              <span className="drill__hint">
                the log prefix this number reflects. Rewind past a late arrival and the figure
                becomes what it was before that arrival landed — the difference is named below.
              </span>
            </div>
          </div>

          {changed === null ? null : changed.length === 0 ? (
            <p className="drill__query">
              nothing arrived between ingest_seq {result.descriptor.as_of_ingest_seq} and{' '}
              {baseline?.descriptor.as_of_ingest_seq} that this number depends on — the figure is
              unchanged, which is itself the answer
            </p>
          ) : (
            <>
              <p className="drill__query">
                <strong>{changed.length}</strong> event
                {changed.length === 1 ? '' : 's'} account for the difference between{' '}
                <strong>{formatMetric(metric, result.displayed)}</strong> at ingest_seq{' '}
                {result.descriptor.as_of_ingest_seq} and{' '}
                <strong>{formatMetric(metric, baseline?.displayed ?? null)}</strong> at{' '}
                {baseline?.descriptor.as_of_ingest_seq} — each with its own lateness
              </p>
              <ul className="boundaries">
                {changed.slice(0, 12).map((e) => (
                  <li key={e.event_id} className="boundaries__item boundaries__item--sweep">
                    <code>{e.event_id}</code> · {e.kind} · ts <code>{e.ts}</code> · arrived{' '}
                    <code>{e.received_at}</code> · <strong>{lateness(e)} late</strong> · credited to{' '}
                    <code>{e.credited_minute}</code> · seq {e.ingest_seq}
                  </li>
                ))}
              </ul>
            </>
          )}

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
                      onClick={() => run(descriptor, { from: slice.from, to: slice.to }, false)}
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

/**
 * The events the baseline answer had and this one does not, or the reverse — **B54's "the
 * difference is exactly these `event_id`s"**.
 *
 * `null` when there is nothing to compare (no rewind has been run). Computed from the two evidence
 * lists rather than asked of the server, and that is legitimate: both lists are the server's own
 * answers, and this is set arithmetic on identifiers, not a performance number. Nothing here
 * produces a figure, which is why it is not a D34 violation.
 *
 * **The cap is honest about itself.** If either list was truncated the diff can only be partial,
 * and the caller says so through `evidence_omitted`; a diff of two capped lists that pretended to
 * be complete would be the one number on this surface nobody could check.
 */
function diffAgainstBaseline(
  result: TraceResult | null,
  baseline: TraceResult | null,
): TraceEvidence[] | null {
  if (result === null || baseline === null) return null;
  if (result.descriptor.as_of_ingest_seq === baseline.descriptor.as_of_ingest_seq) return null;
  const here = new Set(result.evidence.map((e) => e.event_id));
  const there = new Set(baseline.evidence.map((e) => e.event_id));
  return [
    ...baseline.evidence.filter((e) => !here.has(e.event_id)),
    ...result.evidence.filter((e) => !there.has(e.event_id)),
  ];
}
