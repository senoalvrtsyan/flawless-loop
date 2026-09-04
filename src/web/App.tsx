// The client shell (B08): fetch the snapshot, put ONE number on screen.
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

import { useEffect, useState } from 'react';
// Type-only, therefore erased at build time — no server module, and no `node:sqlite`, reaches the
// bundle. The wire types' permanent home is `src/shared/wire.ts`, which B44/B51 create; importing
// them across the boundary until then beats moving an approved file in a chunk about the client.
import type { BucketRow, Snapshot } from '../server/snapshot.ts';

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

/**
 * The most recent bucket in the response — by `minute_start`, then `ad_id` to break a tie between
 * two ads in the same minute. Selection, not aggregation: it picks one server-computed row and
 * changes no number.
 *
 * (The rows arrive ordered by `(ad_id, minute_start)`, so the latest minute is NOT simply the last
 * element. Assuming it was would put a stale number on screen with nothing to indicate it.)
 */
function latestBucket(buckets: readonly BucketRow[]): BucketRow | null {
  return buckets.reduce<BucketRow | null>((best, row) => {
    if (best === null) return row;
    if (row.minute_start > best.minute_start) return row;
    if (row.minute_start === best.minute_start && row.ad_id > best.ad_id) return row;
    return best;
  }, null);
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; snapshot: Snapshot };

export function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = lastHour();
    const url = `/api/snapshot?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok) {
          // The server's 400s say what to fix; surfacing the message beats "failed to fetch".
          const detail =
            typeof body === 'object' && body !== null && 'message' in body
              ? String((body as { message: unknown }).message)
              : res.statusText;
          throw new Error(`${res.status} — ${detail}`);
        }
        setState({ phase: 'ready', snapshot: body as Snapshot });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    return () => controller.abort();
  }, []);

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

  const { snapshot } = state;
  const latest = latestBucket(snapshot.buckets);

  return (
    <div>
      <h1>Signal — impressions in one minute</h1>

      {latest === null ? (
        <p>
          No buckets in this window. Nothing is emitting yet (the simulator arrives at B11), so
          POST an impression with a <code>ts</code> inside the window and refresh.
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
          </p>
        </>
      )}

      <hr />

      <p>
        Window the server used: <code>{snapshot.query.from}</code> to{' '}
        <code>{snapshot.query.to}</code> · {snapshot.buckets.length} bucket rows · log position{' '}
        <code>{snapshot.as_of_ingest_seq}</code>
      </p>

      {/* A hand-verification aid, not the traceability surface — that is B52/B55. It exists so the
          number above can be compared against the response and `sqlite3` without opening devtools. */}
      <details>
        <summary>Raw snapshot response</summary>
        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </div>
  );
}
