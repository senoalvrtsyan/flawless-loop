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
// Unstyled on purpose (D45 deferred until B36, BUILD_PLAN §2). It is meant to look unfinished.

import { useCallback, useEffect, useState } from 'react';
// Type-only, therefore erased at build time — no server module, and no `node:sqlite`, reaches the
// bundle. The wire types' permanent home is `src/shared/wire.ts`, which B44/B51 create; importing
// them across the boundary until then beats moving an approved file in a chunk about the client.
import type { Snapshot } from '../server/snapshot.ts';
import { applyRows, createStore, latestBucket, type BucketStore } from './store.ts';
import { subscribe } from './stream.ts';

const WINDOW_MINUTES = 60;

/**
 * The window to ask for: the last hour, ending now.
 *
 * `toISOString()` always carries `Z`, which is what B07's boundary requires — it rejects a bound
 * with no explicit offset, because JS would parse it as local time and give a different answer on
 * a different machine. The bounds are NOT rounded here: the server snaps `from` down and `to` up
 * to whole minutes and echoes what it used, so the client displays the server's window, never its
 * own idea of it.
 */
function lastHour(): { from: string; to: string } {
  const now = Date.now();
  return {
    from: new Date(now - WINDOW_MINUTES * 60_000).toISOString(),
    to: new Date(now).toISOString(),
  };
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; store: BucketStore; cursor: number };

/** Why the stream is not currently feeding us, if it is not. */
type Link = 'connecting' | 'live' | 'down';

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [link, setLink] = useState<Link>('connecting');
  /** Bumped to force step 1 again — a `resnapshot`, per §3.1's "the client returns to step 1". */
  const [generation, setGeneration] = useState(0);

  const resnapshot = useCallback((reason: string) => {
    console.warn(`[stream] server asked for a resnapshot: ${reason}`);
    setGeneration((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | null = null;
    const { from, to } = lastHour();
    const url = `/api/snapshot?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

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
  }, [generation, resnapshot]);

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

  const { store, cursor } = state;
  const latest = latestBucket(store);

  return (
    <div>
      <h1>Signal — impressions in one minute</h1>

      {latest === null ? (
        <p>
          No buckets in this window. Nothing is emitting yet (the simulator arrives at B11), so
          POST an impression with a <code>ts</code> inside the window and watch this update without
          a refresh.
        </p>
      ) : (
        <>
          {/* The one number. `impressions` as the server sent it — no arithmetic on this value. */}
          <p>
            <strong>{latest.impressions}</strong> impressions
          </p>
          <p>
            ad <code>{latest.ad_id}</code> · minute <code>{latest.minute_start}</code> · as of
            ingest_seq <code>{latest.max_ingest_seq}</code>
            {latest.restated_at !== null ? <> · <strong>restated</strong></> : null}
          </p>
        </>
      )}

      <hr />

      <p>
        Window the server used: <code>{store.window.from}</code> to <code>{store.window.to}</code> ·{' '}
        {store.rows.size} bucket rows · cursor <code>{cursor}</code> · stream{' '}
        <strong>{link}</strong>
      </p>

      {/* A hand-verification aid, not the traceability surface — that is B52/B55. */}
      <details>
        <summary>Rows in the store</summary>
        <pre>{JSON.stringify([...store.rows.values()], null, 2)}</pre>
      </details>
    </div>
  );
}
