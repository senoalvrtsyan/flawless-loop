// The client's subscription. DESIGN §3.1 steps 2-4.
//
// Step 1 is the snapshot; this is 2-4, and "a refresh is step 1-4 again" — there is no separate
// resume path on this side, which is the point of D30's absolute rows.

import type { BucketRow } from '../server/snapshot.ts';

/** The frames B09/B10a send. `resnapshot` means: go back to step 1 (D47). */
export type StreamHandlers = {
  onReady: (as_of_ingest_seq: number) => void;
  onBuckets: (rows: readonly BucketRow[], as_of_ingest_seq: number) => void;
  onResnapshot: (reason: string) => void;
  onError: () => void;
};

/**
 * Subscribe from `cursor`.
 *
 * **`?cursor=` is not optional and not a convenience** (D47). `EventSource` cannot set a request
 * header — its constructor takes `withCredentials` and nothing else — so `Last-Event-ID` exists
 * only on the browser's OWN reconnect, never on this first connect. Without the query param the
 * server would see no cursor, skip the replay, and silently drop every event that landed between
 * the snapshot and this line. The server takes `max(header, query)`, so on a later browser-driven
 * reconnect the fresher header wins and this stale value costs nothing.
 *
 * The cursor is stringified with `String(n)`: the server validates `/^\d+$/` on the raw text, so a
 * template that ever interpolated `undefined` or `''` gets a `resnapshot` rather than being read as
 * "no cursor, go live" — B10a made present-but-empty invalid for exactly this reason.
 */
export function subscribe(cursor: number, handlers: StreamHandlers): () => void {
  const source = new EventSource(`/api/stream?cursor=${encodeURIComponent(String(cursor))}`);

  source.addEventListener('ready', (ev) => {
    const data = JSON.parse((ev as MessageEvent<string>).data) as { as_of_ingest_seq: number };
    handlers.onReady(data.as_of_ingest_seq);
  });

  source.addEventListener('buckets', (ev) => {
    const data = JSON.parse((ev as MessageEvent<string>).data) as {
      rows: BucketRow[];
      as_of_ingest_seq: number;
    };
    handlers.onBuckets(data.rows, data.as_of_ingest_seq);
  });

  source.addEventListener('resnapshot', (ev) => {
    const data = JSON.parse((ev as MessageEvent<string>).data) as { reason: string };
    // Do NOT close here: the server keeps the subscription, and its live frames stay correct for us
    // in the meantime — absolute rows, so what arrives can be incomplete but never wrong. The
    // caller re-snapshots and resubscribes with a fresh cursor.
    handlers.onResnapshot(data.reason);
  });

  // `EventSource` reconnects on its own, with `Last-Event-ID` set, so an error is informational
  // rather than something to repair. Reported so the UI can say the stream is down instead of
  // showing a frozen number that looks live.
  source.addEventListener('error', () => handlers.onError());

  return () => source.close();
}
