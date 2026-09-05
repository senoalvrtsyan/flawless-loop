// `trace <event_id>` — B55 / P13. **`DESIGN.md` §10.4, and the brief's L155 deliverable.**
//
// The brief asks for *"the life of one event — emission → stored fact → aggregate → pixel"*. §10.4
// wrote it as a worked example in Phase 2. This is the same eight steps as a screen you can paste
// an id into, which is the difference between a document that claims the model holds together and
// a control that shows it on any event in the store.
//
// **Every step is a row from a table, and that is deliberate.** A trace that *derived* an event's
// history would be a second implementation of the write path — plausible, unfalsifiable, and wrong
// in exactly the cases that matter. Each panel below names the table it came from, so a reviewer
// can go and run the same `SELECT`.
//
// Step 6 (TRANSPORT) is the one step with no table, and the surface says so rather than inventing
// one: which SSE frame carried a bucket is a property of a connection that has closed. What is
// true and knowable is the bucket's `max_ingest_seq`, and a client resuming below it gets the row
// again — which is the property that made the resume idempotent in the first place (D30).

import { useCallback, useState } from 'react';
import type { EventTrace as EventTraceData } from '../server/trace.ts';
import type { TraceDescriptor } from '../shared/wire.ts';
import { formatCents } from './metrics.ts';

export async function fetchEventTrace(event_id: string, signal: AbortSignal): Promise<EventTraceData> {
  const res = await fetch(`/api/trace/event?event_id=${encodeURIComponent(event_id)}`, { signal });
  const body: unknown = await res.json();
  if (!res.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : res.statusText;
    throw new Error(detail);
  }
  return body as EventTraceData;
}

function duration(ms: number): string {
  if (ms < 0) return `${Math.round(-ms / 1_000)} s EARLY (clock skew — clamped, I10)`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  return `${(ms / 86_400_000).toFixed(1)} d`;
}

/** One numbered step. The number is §10.4's, so the screen and the design document are one map. */
function Step({ n, title, source, children }: {
  n: number; title: string; source: string; children: React.ReactNode;
}) {
  return (
    <li className="trace__step">
      <span className="trace__n">{n}</span>
      <div className="trace__body">
        <strong>{title}</strong> <span className="boundaries__meta">— <code>{source}</code></span>
        <div className="trace__detail">{children}</div>
      </div>
    </li>
  );
}

export type EventTraceProps = {
  /** Hand the last step's descriptor to the drill-down, so the trace ends in a check. */
  onDrill: (descriptor: TraceDescriptor) => void;
};

export function EventTrace({ onDrill }: EventTraceProps) {
  const [input, setInput] = useState('');
  const [data, setData] = useState<EventTraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = useCallback((event_id: string) => {
    if (event_id.trim() === '') return;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    fetchEventTrace(event_id.trim(), controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPending(false));
  }, []);

  return (
    <section className="console trace">
      <div className="console__field console__field--wide">
        <label htmlFor="trace-id">
          event_id — paste one from the raw event tail below, or from any drill-down’s evidence list
        </label>
        <input
          id="trace-id"
          value={input}
          placeholder="1c635f4c96923a89"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(input);
          }}
        />
      </div>
      <button type="button" className="console__submit" disabled={pending} onClick={() => run(input)}>
        {pending ? 'walking…' : 'trace it'}
      </button>

      {error !== null ? <p className="console__outcome console__outcome--refused">{error}</p> : null}

      {data === null ? null : data.deliveries.length === 0 ? (
        <p className="console__outcome console__outcome--refused">
          this store has no delivery with <code>{data.event_id}</code>. That is an answer, not an
          error: the boundary records <em>every</em> delivery it is offered (§5.1), so an id it has
          never seen was never offered to it.
        </p>
      ) : (
        <ol className="trace__steps">
          <Step n={1} title="EMIT — the payload as it arrived" source="signal_deliveries.payload_json">
            {/* The one honest caveat, and B59 owes it to the README too: this is the parsed element
                re-serialised, not the received bytes. `JSON.parse` has already collapsed duplicate
                keys and rewritten `1e2`. */}
            <pre className="trace__payload">{data.deliveries[0]?.payload_json}</pre>
            <span className="boundaries__meta">
              a re-serialisation of the parsed element, not the received bytes — `JSON.parse` has
              already collapsed duplicate keys and rewritten numeric literals
            </span>
          </Step>

          <Step n={2} title="ARRIVE — every delivery, and what the boundary did with each" source="signal_deliveries">
            <table className="log">
              <thead>
                <tr><th>seq</th><th>received_at</th><th>disposition</th><th>payload_hash</th></tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => (
                  <tr key={d.delivery_seq}>
                    <td className="log__seq">{d.delivery_seq}</td>
                    <td className="log__ts">{d.received_at}</td>
                    <td>{d.disposition}</td>
                    <td className="log__ts">{d.payload_hash.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.deliveries.length > 1 ? (
              <span className="boundaries__meta">
                <strong>delivered {data.deliveries.length} times</strong> — D15 dedupes on{' '}
                <code>event_id</code>, so only the first became a fact. The others are recorded
                because a redelivery is something that happened.
              </span>
            ) : null}
          </Step>

          {data.canonical === null ? (
            <Step n={3} title="STORE — nothing was stored" source="signals">
              no <code>signals</code> row: every delivery above was refused or deduped, so this id
              never became a canonical fact and moved no bucket. The deliveries are still on the
              record, which is the point of keeping them apart.
            </Step>
          ) : (
            <>
              <Step n={3} title="STORE — the canonical fact" source="signals">
                <code>ingest_seq {data.canonical.ingest_seq}</code> · {data.canonical.kind} on{' '}
                <code>{data.canonical.ad_id}</code> · source {data.canonical.source} · ts{' '}
                <code>{data.canonical.ts}</code>
                {data.canonical.clamped ? (
                  <>
                    {' '}· <strong>CLAMPED (I10)</strong>: the event claimed{' '}
                    <code>{data.canonical.ts}</code>, which is after it arrived, so{' '}
                    <code>ts_effective</code> is <code>{data.canonical.ts_effective}</code>
                  </>
                ) : null}
                {data.late_ms === null ? null : (
                  <>
                    {' '}· <strong>{duration(data.late_ms)}</strong> between emission and arrival
                  </>
                )}
              </Step>

              {data.attribution === null ? (
                <Step n={4} title="ATTRIBUTE — not applicable" source="conversion_attribution">
                  only conversions are attributed. An {data.canonical.kind} lands at its own minute
                  on its own ad, so there is nothing to resolve.
                </Step>
              ) : (
                <Step n={4} title="ATTRIBUTE — the click decides the ad and the minute" source="conversion_attribution">
                  state <strong>{data.attribution.state}</strong>
                  {data.attribution.click === null ? (
                    <>
                      {' '}— <strong>no click</strong>, so this is an orphan (D16) held provisionally
                      at its own minute against its own claimed ad, and excluded from CPA and ROAS
                      until it resolves
                    </>
                  ) : (
                    <>
                      {' '}· click <code>{data.attribution.click.event_id}</code> at{' '}
                      <code>{data.attribution.click.ts_effective}</code> on{' '}
                      <code>{data.attribution.click.ad_id}</code>
                      {data.attribution.ad_id_conflict ? (
                        <>
                          {' '}· <strong>AD CONFLICT (G30)</strong>: the conversion named{' '}
                          <code>{data.canonical.ad_id}</code>, the click says{' '}
                          <code>{data.attribution.click.ad_id}</code>, and the CLICK wins (I8)
                        </>
                      ) : null}
                    </>
                  )}
                  {' '}· credited to <code>{data.attribution.credited_minute}</code>
                  {data.attribution.credited_generation_id === null ? null : (
                    <> under generation <code>{data.attribution.credited_generation_id}</code> (D14)</>
                  )}
                  <div className="boundaries__meta">
                    <strong>D27-B:</strong> the conversion sits in its CLICK’s minute, not its own.
                    That is why the bucket below can be days earlier than the timestamp above.
                  </div>
                </Step>
              )}

              {data.bucket === null ? (
                <Step n={5} title="ROLL UP — no bucket" source="rollup_minute">
                  no row for that minute. On a correct store this cannot happen for an accepted
                  signal, so seeing it here is itself the finding.
                </Step>
              ) : (
                <>
                  <Step n={5} title="ROLL UP — the bucket it moved" source="rollup_minute">
                    <code>{data.bucket.ad_id}</code> <code>{data.bucket.minute_start}</code> ·{' '}
                    {data.bucket.impressions} impressions · {data.bucket.clicks} clicks ·{' '}
                    {data.bucket.conversions} conversions · {formatCents(data.bucket.value_cents)}{' '}
                    value
                    {data.bucket.provisional_conversions > 0 ? (
                      <> · {data.bucket.provisional_conversions} provisional</>
                    ) : null}
                    {data.bucket.restated_at !== null ? (
                      <>
                        {' '}· <strong>RESTATED</strong> {data.bucket.restatement_count}×, most
                        recently at <code>{data.bucket.restated_at}</code> — this bucket had already
                        settled when something arrived for it (P7)
                      </>
                    ) : null}
                  </Step>

                  <Step n={6} title="TRANSPORT — the frame it rode" source="not stored, deliberately">
                    which SSE frame carried this bucket is a property of a connection that has since
                    closed, and a table recording it would be a projection with a second writer
                    (D7). What is knowable: the bucket went out as an ABSOLUTE row on the next flush
                    with SSE id <code>{data.bucket.max_ingest_seq}</code>, and any client resuming
                    from a cursor below that receives it again — which is exactly why the resume is
                    idempotent (D30).
                  </Step>

                  <Step n={7} title="PIXEL — what changed on screen" source="derived from step 5">
                    the point at <code>{data.bucket.minute_start}</code> for{' '}
                    <code>{data.bucket.ad_id}</code> carries this event.
                    {data.bucket.restated_at !== null ? (
                      <>
                        {' '}It is drawn with the restated treatment, and the restatement timeline
                        gains an entry <strong>at that minute</strong> — not at the moment we found
                        out, which is the whole of §5.6.
                      </>
                    ) : null}
                  </Step>

                  {data.descriptor === null ? null : (
                    <Step n={8} title="PROVE — re-check it from raw events" source="POST /api/trace">
                      <button
                        type="button"
                        className="console__submit"
                        onClick={() => {
                          if (data.descriptor !== null) onDrill(data.descriptor);
                        }}
                      >
                        walk this bucket back
                      </button>{' '}
                      <span className="boundaries__meta">
                        opens the drill-down on <code>{data.descriptor.metric}</code> for that one
                        minute, at ingest_seq {data.descriptor.as_of_ingest_seq} — the same
                        recomputation from raw <code>signals</code>, with this event in the evidence
                        list. Rewind <code>as_of</code> past{' '}
                        {data.canonical === null ? 'it' : data.canonical.ingest_seq} and the figure
                        becomes what it was before this event landed.
                      </span>
                    </Step>
                  )}
                </>
              )}
            </>
          )}
        </ol>
      )}
    </section>
  );
}
