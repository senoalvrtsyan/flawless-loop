// The client shell. B08 fetched the snapshot and rendered one number; B10b makes it LIVE —
// snapshot, then subscribe from its cursor, then merge absolute rows as they arrive (§3.1 1-4).
//
// **The number is a bucket's own `impressions`, taken verbatim from the server. It is not a sum.**
// Not because client arithmetic is forbidden — **D46** permits it — but because of what a total
// would have to be attached to: §10.1's `TraceDescriptor` rides on values the SERVER sends, so a
// total invented in this file would carry no descriptor, and B52's `<Metric>` is structurally
// unable to render an undescribed number (D34's quarantine). B07 puts no total on the wire; B38
// adds server-computed, signed totals and ratios, and from then on the client may re-bucket them
// to display granularity **under the same server-issued descriptor**. Until then a row is the only
// honest number to show.
//
// (§10.2's "the walk-back would compare the client to itself" is NOT the argument here. It is
// about the rejected **D30-A** — the client aggregating RAW events. Reading it as a ban on all
// client arithmetic is the misreading D46 exists to settle.)
//
// **B36 gives it a shell and a stylesheet** (D45 option A: one plain `app.css`, semantic custom
// properties, one theme). The viewport — window, granularity, selected ads — lives HERE and nowhere
// durable: `DESIGN.md` §3's persistence boundary puts it in column 1, so closing the browser loses
// exactly which ads were selected and nothing else. No `localStorage`, deliberately.

import { useCallback, useEffect, useRef, useState } from 'react';
// Type-only, therefore erased at build time — no server module, and no `node:sqlite`, reaches the
// bundle. The wire types' permanent home is `src/shared/wire.ts`, which B44/B51 create; importing
// them across the boundary until then beats moving an approved file in a chunk about the client.
import type { AdRow, Snapshot, TotalsResponse } from '../server/snapshot.ts';
import {
  applyRows,
  createStore,
  latestBucket,
  minutesRolled,
  rollWindow,
  type BucketStore,
} from './store.ts';
import { subscribe } from './stream.ts';
import { planChart, rungLabel } from './gate.ts';
import { METRIC_LABELS } from './metrics.ts';
import { isRatio, type MetricKey } from '../shared/metrics.ts';
import {
  METRIC_NOTES,
  combined,
  fetchTotals,
  formatCents,
  formatCount,
  formatCtr,
  formatRoas,
  perAd,
} from './metrics.ts';
import { Portfolio } from './Portfolio.tsx';
import { Chart } from './Chart.tsx';
import './app.css';

/** The window choices. Minutes, because that is the bucket unit the store speaks (D28). */
const WINDOWS = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1_440 },
  { label: '7d', minutes: 10_080 },
] as const;

/**
 * Display granularity — **viewport state only until B37, and it changes nothing on screen yet.**
 *
 * It is here rather than at B37 because `DESIGN.md` §3 puts granularity in the client's column and
 * B36 is the chunk that builds the viewport. What it must NOT become is a client that re-buckets
 * whatever it likes: **D46** allows re-bucketing only at the granularity the server's own
 * `TraceDescriptor` names, and those arrive at B51. So this control picks a REQUEST, and B37/B38
 * are where the request means something. D20's ladder can still override it — the chart refuses to
 * draw a ratio below its sample-size gate and coarsens, capped at the hour, showing which it chose.
 */
const GRANULARITIES = [
  { label: 'minute', seconds: 60 },
  { label: 'hour', seconds: 3_600 },
] as const;

/**
 * The window to ask for: `minutes` back, ending now.
 *
 * `toISOString()` always carries `Z`, which is what B07's boundary requires — it rejects a bound
 * with no explicit offset, because JS would parse it as local time and give a different answer on
 * a different machine. The bounds are NOT rounded here: the server snaps `from` down and `to` up
 * to whole minutes and echoes what it used, so the client displays the server's window, never its
 * own idea of it.
 */
function windowEndingNow(minutes: number): { from: string; to: string } {
  const now = Date.now();
  return {
    from: new Date(now - minutes * 60_000).toISOString(),
    to: new Date(now).toISOString(),
  };
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; store: BucketStore; cursor: number; ads: AdRow[] };

/** Why the stream is not currently feeding us, if it is not. */
type Link = 'connecting' | 'live' | 'down';

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [link, setLink] = useState<Link>('connecting');
  const [windowMinutes, setWindowMinutes] = useState<number>(60);
  const [granularity, setGranularity] = useState<number>(60);
  /**
   * Which metric the CHART draws. The headline shows all six at once; the chart shows one, because
   * a ratio and a count share no y axis and D20's gate is a per-metric question.
   */
  const [metric, setMetric] = useState<MetricKey>('impressions');
  /**
   * **B40 — smoothing, off by default.** D20 ratified EWMA at a 15-minute half-life *with a raw
   * toggle*; raw is the default because it is the series B53's drill-down asserts against, so the
   * number a reviewer is most likely to try to walk back is the one that will reconcile.
   */
  const [smooth, setSmooth] = useState(false);
  /** `null` is "all ads" — the same convention as an absent `?ads=`, so no translation is needed. */
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  /**
   * **B38 / D66 — the server's totals, as a whole response**, window and log position included.
   *
   * Held as the response rather than as three numbers on purpose: a total whose window and `as_of`
   * have been discarded is the undescribed figure D34's quarantine refuses, and B51 signs exactly
   * this envelope.
   */
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  /** Whether the last totals refresh landed. A silently stale headline is the failure to avoid. */
  const [totalsFresh, setTotalsFresh] = useState(true);

  /**
   * Toggling from "all" selects that ad ALONE rather than deselecting it out of twelve.
   *
   * The alternative reads as a bug the first time it is tried: clicking one ad in an all-selected
   * list to say "just this one" would leave the other eleven charted. Emptying the set returns to
   * all, because a chart of nothing is never what the click meant.
   */
  const toggle = useCallback((ad_id: string) => {
    setSelected((prev) => {
      if (prev === null) return new Set([ad_id]);
      const next = new Set(prev);
      if (next.has(ad_id)) next.delete(ad_id);
      else next.add(ad_id);
      return next.size === 0 ? null : next;
    });
  }, []);
  /** Bumped to force step 1 again — a `resnapshot`, per §3.1's "the client returns to step 1". */
  const [generation, setGeneration] = useState(0);

  const resnapshot = useCallback((reason: string) => {
    console.warn(`[stream] server asked for a resnapshot: ${reason}`);
    setGeneration((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | null = null;
    const { from, to } = windowEndingNow(windowMinutes);
    // `?ads=` is omitted entirely for "all", never sent empty: B07 rejects `ads=` as given-but-empty
    // rather than silently reading it as all, which is the correct strictness and the reason this
    // builds the parameter conditionally instead of joining a possibly-empty set.
    const url =
      `/api/snapshot?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
      (selected === null ? '' : `&ads=${encodeURIComponent([...selected].join(','))}`);

    setLink('connecting');

    // Step 1: the snapshot. Step 2 only starts once it has landed, because its
    // `as_of_ingest_seq` IS the cursor — subscribing first would mean subscribing from a cursor we
    // do not have yet.
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          const detail =
            typeof body === 'object' && body !== null && 'message' in body
              ? String((body as { message: unknown }).message)
              : res.statusText;
          throw new Error(`${res.status} — ${detail}`);
        }
        const snapshot = body as Snapshot;
        setState({
          phase: 'ready',
          // The window is the one the SERVER resolved and echoed (snapped to whole minutes), not
          // the one we asked for. The store drops rows outside it, so using our own bounds here
          // would disagree with the server's on the boundary minute.
          store: createStore(snapshot.query, snapshot.buckets),
          cursor: snapshot.as_of_ingest_seq,
          // The WHOLE portfolio, not the selection — a list that hid the ads you are not looking
          // at would make selecting them impossible.
          ads: snapshot.ads,
        });
        // Step 1 already carries them, so the headline is populated before the first refresh tick.
        setTotals({
          query: snapshot.query,
          totals: snapshot.totals,
          as_of_ingest_seq: snapshot.as_of_ingest_seq,
        });
        setTotalsFresh(true);

        // Steps 2-4. The cursor closes the snapshot-to-subscribe gap: anything ingested between
        // the read transaction above and this line is replayed by B10a.
        unsubscribe = subscribe(snapshot.as_of_ingest_seq, {
          onReady: () => setLink('live'),
          onBuckets: (rows, as_of) => {
            setLink('live');
            setState((prev) =>
              prev.phase === 'ready'
                ? { ...prev, store: applyRows(prev.store, rows), cursor: as_of }
                : prev,
            );
          },
          onResnapshot: resnapshot,
          onError: () => setLink('down'),
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      controller.abort();
      unsubscribe?.();
    };
    // Window and selection are dependencies, so changing either re-runs §3.1 from step 1: new
    // snapshot, new cursor, new subscription. That is deliberately the SAME path as a refresh and
    // a `resnapshot` — D30's absolute rows are what make one path enough, and a second "adjust the
    // existing store" path is where a stale row would survive a window change.
  }, [generation, resnapshot, windowMinutes, selected]);

  /**
   * **B38a / D65 — walk the frame forward.** Without this the surface is live for at most the tail
   * of one minute: `to` is `ceilToMinute(now)` at fetch time, so once that minute closes every
   * arriving bucket is outside the window and `store.ts` drops it. Measured before D65 was asked.
   *
   * A 5-second tick, not a minute-aligned timer: `rollWindow` returns the SAME store unless the
   * minute actually changed, so this costs one string comparison for 55 of every 60 seconds and
   * re-renders on the minute. An aligned timer would have to survive tab throttling and clock
   * drift to earn the difference.
   *
   * It does NOT re-snapshot. Step 1 stays the only path that talks to `/api/snapshot` for buckets,
   * so the resume contract (D47) and the anchor are both untouched by the roll.
   */
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.phase !== 'ready') return prev;
        const store = rollWindow(prev.store, Date.now());
        return store === prev.store ? prev : { ...prev, store };
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  /**
   * The frame currently on screen, for the totals refresh to ask about. A ref rather than a
   * dependency so a moving cursor does not tear down and rebuild the interval four times a second
   * (`Chart.tsx`'s `labelsRef` is the same pattern for the same reason).
   */
  const viewRef = useRef<{ from: string; to: string } | null>(null);
  viewRef.current = state.phase === 'ready' ? state.store.window : null;

  /**
   * **B38 / D66 — re-ask the server for the totals of the window on screen.**
   *
   * A 5-second THROTTLE, not a debounce: the stream moves the cursor up to four times a second, and
   * a trailing debounce keyed on the cursor would therefore never fire at all. So this asks on a
   * fixed tick and the headline lags the chart by at most 5 s — visibly, because both carry
   * `as_of_ingest_seq` and the two are printed side by side.
   *
   * A failed refresh is NOT swallowed: `totalsFresh` goes false and the surface says the headline
   * is stale. A quietly frozen number that still looks current is the exact failure D66 chose the
   * server-computed option to avoid.
   */
  useEffect(() => {
    const controller = new AbortController();
    const id = setInterval(() => {
      const view = viewRef.current;
      if (view === null) return;
      fetchTotals(view, selected, controller.signal)
        .then((response) => {
          setTotals(response);
          setTotalsFresh(true);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          console.warn('[totals] refresh failed', err);
          setTotalsFresh(false);
        });
    }, 5_000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [selected]);

  if (state.phase === 'loading') return <p>Loading snapshot…</p>;
  if (state.phase === 'error') {
    return (
      <div>
        <h1>Cannot read the snapshot</h1>
        <p>{state.message}</p>
        <p>Is the API up? <code>curl -s localhost:8787/api/health</code></p>
      </div>
    );
  }

  const { store, cursor, ads } = state;
  const latest = latestBucket(store);
  // "All" resolved to a concrete list, in the portfolio's own order, so the chart's series order
  // and the list's row order are the same thing and a colour means one ad in both.
  const charted = selected === null ? ads : ads.filter((ad) => selected.has(ad.ad_id));
  // The selection's combined row, found by `ad_id === null` — a position lookup would silently
  // return an ad's totals the first time the server's ordering changed.
  const total = totals === null ? null : combined(totals.totals);
  /**
   * **B39 — the gate decides the granularity, the ads and the suppression** (D20/D67), from the
   * same rows the chart draws. Computed here rather than inside `Chart.tsx` because the surface has
   * to say what it decided, and the sentence belongs next to the chart, not inside the canvas.
   */
  const plan = planChart([...store.rows.values()], store.window, charted, metric, granularity);

  return (
    <div className="shell">
      <Portfolio ads={ads} selected={selected} onToggle={toggle} />

      <main className="shell__main">
        <h1>Signal</h1>

        <div className="controls">
          <div className="controls__group">
            <span className="controls__label">Window</span>
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                type="button"
                aria-pressed={windowMinutes === w.minutes}
                onClick={() => setWindowMinutes(w.minutes)}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Granularity</span>
            {GRANULARITIES.map((g) => (
              <button
                key={g.label}
                type="button"
                aria-pressed={granularity === g.seconds}
                onClick={() => setGranularity(g.seconds)}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Metric</span>
            {(['impressions', 'clicks', 'spend', 'ctr', 'cpa', 'roas'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
                // The three that lag are marked in the control itself, not only beside the number.
                title={isRatio(key) ? METRIC_NOTES[key] : undefined}
              >
                {METRIC_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="controls__group">
            <span className="controls__label">Series</span>
            <button type="button" aria-pressed={!smooth} onClick={() => setSmooth(false)}>
              raw
            </button>
            <button type="button" aria-pressed={smooth} onClick={() => setSmooth(true)}>
              EWMA 15m
            </button>
          </div>

          <div className="controls__group">
            <span className="controls__label">Charting</span>
            <span>{selected === null ? `all ${ads.length}` : `${selected.size} of ${ads.length}`}</span>
          </div>
        </div>

        {/* B37/B39. One series per selected ad, drawn from the SAME bucket rows the headline is
            summed from — so a reviewer comparing the two is comparing one source to itself, and
            B53's drill-down is what compares either of them to raw events. */}
        <Chart rows={[...store.rows.values()]} window={store.window} plan={plan} smooth={smooth} />

        {/* **D20 requires the chart to say which rung it picked, and D67 requires the gated count
            and its reason to be on screen.** Both live here. A chart that had quietly coarsened, or
            quietly dropped two thirds of its points, would look exactly like a chart that had not. */}
        <p className="gate">
          drawn at <strong>{rungLabel(plan.granularity_s)}</strong>
          {plan.coarsened ? (
            <> — the gate coarsened from {rungLabel(granularity)} to clear its bar</>
          ) : null}
          {smooth ? (
            <>
              {' '}·{' '}
              <strong>
                EWMA, 15-minute half-life — smoothed, so these points will NOT reconcile against raw
                events; switch to raw before walking one back
              </strong>
            </>
          ) : null}
          {plan.bar === null ? (
            <> · counts are their own evidence, so no bar applies</>
          ) : (
            <>
              {' '}· bar {plan.bar.min} {plan.bar.basis} per point ·{' '}
              <strong>
                {plan.gated} of {plan.gated + plan.plotted} points gated
              </strong>{' '}
              ({plan.bar.reason})
            </>
          )}
        </p>
        {plan.dropped.length > 0 ? (
          <p className="gate gate--dropped">
            shown as counts, not as {METRIC_LABELS[metric]} — no rung up to the hour clears the bar:{' '}
            {plan.dropped.map((d, i) => (
              <span key={d.ad_id}>
                {i > 0 ? ' · ' : ''}
                <code>{d.ad_id}</code> ({d.reason})
              </span>
            ))}
          </p>
        ) : null}

        {/* B38 — the headline. EVERY figure here was computed by the server: counts summed in
            SQL, the three ratios divided after (D10), and the whole envelope re-asked over
            `?include=totals` every 5 s (D66). Nothing in this block does arithmetic. */}
        {totals === null || total === null ? (
          <p>Totals not read yet.</p>
        ) : (
          <>
            <div className="metrics">
              <div className="metric">
                <span className="metric__label">Impressions</span>
                <strong className="metric__value">{formatCount(total.impressions)}</strong>
              </div>
              <div className="metric">
                <span className="metric__label">Clicks</span>
                <strong className="metric__value">{formatCount(total.clicks)}</strong>
              </div>
              <div className="metric">
                <span className="metric__label">Spend</span>
                <strong className="metric__value">{formatCents(total.spend_total_cents)}</strong>
                {/* L79-80: click costs and non-click charges are disjoint and total spend is their
                    sum — computed at read, never stored as a third column. */}
                <span className="metric__note">
                  {formatCents(total.click_cost_cents)} clicks + {formatCents(total.spend_cents)} CPM/fees
                </span>
              </div>
              <div className="metric">
                <span className="metric__label">CTR</span>
                <strong className="metric__value">{formatCtr(total.ctr)}</strong>
                <span className="metric__note">{METRIC_NOTES.ctr}</span>
              </div>
              <div className="metric">
                <span className="metric__label">CPA</span>
                <strong className="metric__value">
                  {total.cpa_cents === null ? '—' : formatCents(total.cpa_cents)}
                </strong>
                <span className="metric__note">{METRIC_NOTES.cpa}</span>
              </div>
              <div className="metric">
                <span className="metric__label">ROAS</span>
                <strong className="metric__value">{formatRoas(total.roas)}</strong>
                <span className="metric__note">{METRIC_NOTES.roas}</span>
              </div>
            </div>

            {/* **Held apart, never added in** (§14, and it bites exactly here): a provisional
                conversion is an orphan whose click has not arrived, so its ad is a guess and its
                placement is temporary. Summing the two columns would put unattributed revenue into
                ROAS and unattributed cost into CPA, and every number would stay plausible. */}
            <p className="portfolio__meta">
              {formatCount(total.conversions)} settled conversions ·{' '}
              {formatCents(total.value_cents)} value
              {total.provisional_conversions > 0 ? (
                <>
                  {' '}· <strong>{formatCount(total.provisional_conversions)} provisional</strong>{' '}
                  ({formatCents(total.provisional_value_cents)}), orphans held at their own minute
                  and <em>excluded</em> from CPA and ROAS
                </>
              ) : null}
            </p>

            {/* Per ad, so the portfolio is comparable rather than only aggregated. Same envelope,
                same read transaction — these rows sum to the headline above by construction. */}
            <table className="totals">
              <thead>
                <tr>
                  <th>Ad</th><th>Impr</th><th>Clicks</th><th>Spend</th>
                  <th>CTR</th><th>CPA</th><th>ROAS</th><th>Conv</th>
                </tr>
              </thead>
              <tbody>
                {perAd(totals.totals).map((row) => (
                  <tr key={row.ad_id}>
                    <td><code>{row.ad_id}</code></td>
                    <td>{formatCount(row.impressions)}</td>
                    <td>{formatCount(row.clicks)}</td>
                    <td>{formatCents(row.spend_total_cents)}</td>
                    <td>{formatCtr(row.ctr)}</td>
                    <td>{row.cpa_cents === null ? '—' : formatCents(row.cpa_cents)}</td>
                    <td>{formatRoas(row.roas)}</td>
                    <td>{formatCount(row.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="telemetry">
              totals over {totals.query.from} → {totals.query.to} · {total.buckets} buckets · as of
              ingest_seq {totals.as_of_ingest_seq}
              {totalsFresh ? null : <> · <strong>STALE — the last refresh failed</strong></>}
            </p>
          </>
        )}

        {latest === null ? (
          <p>
            No buckets in this window for this selection. Widen the window, or select an ad that is
            live — a paused ad stops producing impressions within one simulator tick.
          </p>
        ) : (
          <p className="portfolio__meta">
            newest bucket in view: ad <code>{latest.ad_id}</code> · minute{' '}
            <code>{latest.minute_start}</code> · {latest.impressions} impressions · as of
            ingest_seq <code>{latest.max_ingest_seq}</code>
            {latest.restated_at !== null ? <> · <strong>restated</strong></> : null}
          </p>
        )}

        {/* §11's stream telemetry, quarantined by treatment (D45) so it can never be misread as a
            performance metric. B44 gives it its three counters; this is the same treatment. */}
        {/* D65's amendment: the client's frame AND the anchor the server resolved, side by side,
            so how far the frame has walked is visible rather than inferable. A refresh re-anchors,
            which is the fastest way to see that the two are different facts. */}
        <p className="telemetry">
          window {store.window.from} → {store.window.to} · anchored at {store.anchor.from} →{' '}
          {store.anchor.to} (+{minutesRolled(store)}m) · {store.rows.size} bucket rows · cursor{' '}
          {cursor} · stream {link}
        </p>

        {/* A hand-verification aid, not the traceability surface — that is B52/B55. */}
        <details>
          <summary>Rows in the store</summary>
          <pre>{JSON.stringify([...store.rows.values()], null, 2)}</pre>
        </details>
      </main>
    </div>
  );
}
