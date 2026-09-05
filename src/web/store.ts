// The client's bucket store. DESIGN §3's boundary table, column 1: "a render cache of bucket rows
// for the visible window" — and nothing durable. No localStorage, no IndexedDB. Closing the tab
// loses only the viewport.
//
// The merge rule is the whole file: rows are ABSOLUTE (D30), keyed by `(ad_id, minute_start)`, so
// applying one is an assignment, never an addition. That is what makes a redelivery after a
// reconnect free — and B10a subscribes before replaying precisely because duplicates cost nothing
// here while gaps would.
//
// **B38a adds the roll (D65).** The window used to be fixed at fetch time, and measured, that made
// the surface live for at most the tail of one minute: `to = ceilToMinute(now)`, so once that minute
// closed every arriving bucket was outside the window and `applyRows` dropped it — correctly, by
// the rule below, which is what made the question a design question rather than a bug. The frame
// now walks forward and the stream fills it. Snapping is `shared/time.ts`'s, not this file's
// (D65's amendment): a fifth copy of `floorMinute` is exactly what B20a collapsed four copies to
// prevent.

import { MINUTE_MS, ceilToMinute } from '../shared/time.ts';
import type { BucketRow } from '../server/snapshot.ts';

/** `(ad_id, minute_start)` — D28's rollup key, and the merge key on this side too. */
export function bucketKey(row: { ad_id: string; minute_start: string }): string {
  return `${row.ad_id}\n${row.minute_start}`;
}

export type Window = { from: string; to: string };

export type BucketStore = {
  /** The window in view NOW — the anchor, walked forward by `rollWindow` (D65). */
  window: Window;
  /**
   * The window the SERVER resolved and echoed at step 1 (snapped by B07), kept verbatim.
   *
   * On screen as "anchored at" — **D65's amendment**, and the reason is that B10b's original
   * property was that the client displayed the server's window byte for byte. A rolling frame
   * cannot keep that property, so it keeps the anchor visible instead of implicit: a reviewer can
   * see how far the frame has walked, and a refresh visibly re-anchors.
   */
  anchor: Window;
  rows: ReadonlyMap<string, BucketRow>;
};

export function createStore(window: Window, rows: readonly BucketRow[]): BucketStore {
  return { window, anchor: window, rows: new Map(rows.map((r) => [bucketKey(r), r])) };
}

/**
 * Walk the frame forward to `now`, keeping the anchor's WIDTH, and evict what fell off the back.
 *
 * Returns the same store when nothing moved, so a 5-second tick costs one comparison for 55 of
 * every 60 seconds and React re-renders only on the minute.
 *
 * **Why this is correct rather than lossy, and it is the whole argument for D65-C:** the frame only
 * ever moves forward, so a minute that ENTERS the window was in the future when the snapshot was
 * taken — every event in it therefore arrives on the stream as an absolute row (B10a replays
 * unwindowed), and there is no set of events the client can have missed. Minutes only LEAVE.
 *
 * The width comes from the anchor, not from the viewport control, because the server snapped the
 * anchor and the client must not re-derive a bound the server already resolved.
 */
export function rollWindow(store: BucketStore, nowMs: number): BucketStore {
  const to = ceilToMinute(nowMs);
  if (to <= store.window.to) return store;

  const widthMs = Date.parse(store.anchor.to) - Date.parse(store.anchor.from);
  // Whole minutes by construction: `to` is minute-aligned and the width is a whole number of
  // minutes, because both anchor bounds were snapped by B07.
  const from = new Date(Date.parse(to) - widthMs).toISOString();
  const window = { from, to };

  const rows = new Map<string, BucketRow>();
  for (const [key, row] of store.rows) if (inWindow(window, row)) rows.set(key, row);
  return { window, anchor: store.anchor, rows };
}

/** How far the frame has walked from its anchor, in whole minutes. Zero at step 1. */
export function minutesRolled(store: BucketStore): number {
  return Math.round((Date.parse(store.window.to) - Date.parse(store.anchor.to)) / MINUTE_MS);
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
  return { window: store.window, anchor: store.anchor, rows };
}

/**
 * The most recent bucket in view — by `minute_start`, then `ad_id` to break a tie between two ads
 * in the same minute. Selection, not aggregation: it picks one server-computed row and computes
 * nothing (D46).
 */
export function latestBucket(
  store: BucketStore,
  /**
   * **The ads currently charted, or `null` for all — B70.** The caption this feeds says *"newest
   * bucket **in view**"*, and the store holds every ad the stream sends regardless of what is
   * selected. Unscoped, selecting `a_01` alone could report `a_12`'s bucket — a true statement
   * about the store and a false one about the view, on a line whose whole job is to say what the
   * screen is showing. Liveness of the *stream* is not lost by scoping this: it is the raw tail's
   * telemetry block, where D34 put it.
   */
  ads: ReadonlySet<string> | null = null,
): BucketRow | null {
  let best: BucketRow | null = null;
  for (const row of store.rows.values()) {
    if (ads !== null && !ads.has(row.ad_id)) continue;
    if (best === null) best = row;
    else if (row.minute_start > best.minute_start) best = row;
    else if (row.minute_start === best.minute_start && row.ad_id > best.ad_id) best = row;
  }
  return best;
}
