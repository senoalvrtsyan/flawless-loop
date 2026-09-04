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

import { useCallback, useEffect, useState } from 'react';
// Type-only, therefore erased at build time — no server module, and no `node:sqlite`, reaches the
// bundle. The wire types' permanent home is `src/shared/wire.ts`, which B44/B51 create; importing
// them across the boundary until then beats moving an approved file in a chunk about the client.
import type { AdRow, Snapshot } from '../server/snapshot.ts';
import { applyRows, createStore, latestBucket, type BucketStore } from './store.ts';
import { subscribe } from './stream.ts';
import { Portfolio } from './Portfolio.tsx';
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
  /** `null` is "all ads" — the same convention as an absent `?ads=`, so no translation is needed. */
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);

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
            <span className="controls__label">Charting</span>
            <span>{selected === null ? `all ${ads.length}` : `${selected.size} of ${ads.length}`}</span>
          </div>
        </div>

        {latest === null ? (
          <p>
            No buckets in this window for this selection. Widen the window, or select an ad that is
            live — a paused ad stops producing impressions within one simulator tick.
          </p>
        ) : (
          <>
            {/* Still ONE number, taken verbatim from the server: B37 is the chart. The reason it is
                not a total is unchanged and is written at the top of this file. */}
            <p>
              <strong>{latest.impressions}</strong> impressions
            </p>
            <p className="portfolio__meta">
              ad <code>{latest.ad_id}</code> · minute <code>{latest.minute_start}</code> · as of
              ingest_seq <code>{latest.max_ingest_seq}</code>
              {latest.restated_at !== null ? <> · <strong>restated</strong></> : null}
            </p>
          </>
        )}

        {/* §11's stream telemetry, quarantined by treatment (D45) so it can never be misread as a
            performance metric. B44 gives it its three counters; this is the same treatment. */}
        <p className="telemetry">
          window {store.window.from} → {store.window.to} · {store.rows.size} bucket rows · cursor{' '}
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
