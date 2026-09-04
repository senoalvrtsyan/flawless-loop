// The client's bucket store. DESIGN §3's boundary table, column 1: "a render cache of bucket rows
// for the visible window" — and nothing durable. No localStorage, no IndexedDB. Closing the tab
// loses only the viewport.
//
// The merge rule is the whole file: rows are ABSOLUTE (D30), keyed by `(ad_id, minute_start)`, so
// applying one is an assignment, never an addition. That is what makes a redelivery after a
// reconnect free — and B10a subscribes before replaying precisely because duplicates cost nothing
// here while gaps would.

import type { BucketRow } from '../server/snapshot.ts';

/** `(ad_id, minute_start)` — D28's rollup key, and the merge key on this side too. */
export function bucketKey(row: { ad_id: string; minute_start: string }): string {
  return `${row.ad_id}\n${row.minute_start}`;
}

export type Window = { from: string; to: string };

export type BucketStore = {
  /** The window these rows belong to, as the SERVER resolved it (snapped, echoed by B07). */
  window: Window;
  rows: ReadonlyMap<string, BucketRow>;
};

export function createStore(window: Window, rows: readonly BucketRow[]): BucketStore {
  return { window, rows: new Map(rows.map((r) => [bucketKey(r), r])) };
}

/**
 * Is this bucket inside the store's window?
 *
 * **B10b's rule, and it is not symmetric with the snapshot.** `GET /api/snapshot` is windowed;
 * the SSE replay is **not** — B10a replays every bucket with `max_ingest_seq > cursor`, across all
 * ads and all of time, because that is what a resuming client needs in general. So a live or
 * replayed row can be for a minute this screen is not showing, and merging it in would silently
 * widen the window: a "last hour" view would start accumulating buckets from days ago as late
 * conversions restate them, and the row count on screen would stop matching the window label.
 *
 * Half-open `[from, to)` on `minute_start`, the same convention the server snapped to, so the two
 * sides agree on the boundary minute rather than disagreeing by one bucket.
 */
export function inWindow(window: Window, row: BucketRow): boolean {
  return row.minute_start >= window.from && row.minute_start < window.to;
}

/**
 * Apply a frame of absolute rows. Returns a new store (or the same one, unchanged, if the frame
 * moved nothing in view — so React can skip a render).
 *
 * Assignment, not accumulation: `set` overwrites whatever was there. A restatement arrives as the
 * same key with different counts and a `restated_at`, which is why §5.5 needs no separate frame
 * type and this function needs no special case.
 */
export function applyRows(store: BucketStore, incoming: readonly BucketRow[]): BucketStore {
  const relevant = incoming.filter((row) => inWindow(store.window, row));
  if (relevant.length === 0) return store;

  const rows = new Map(store.rows);
  for (const row of relevant) rows.set(bucketKey(row), row);
  return { window: store.window, rows };
}

/**
 * The most recent bucket in view — by `minute_start`, then `ad_id` to break a tie between two ads
 * in the same minute. Selection, not aggregation: it picks one server-computed row and computes
 * nothing (D46).
 */
export function latestBucket(store: BucketStore): BucketRow | null {
  let best: BucketRow | null = null;
  for (const row of store.rows.values()) {
    if (best === null) best = row;
    else if (row.minute_start > best.minute_start) best = row;
    else if (row.minute_start === best.minute_start && row.ad_id > best.ad_id) best = row;
  }
  return best;
}
