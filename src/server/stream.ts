// The live push. DESIGN §5.5 and §11's FLUSH TICK box.
//
// D30, and it is the whole design of this file: what goes down the wire is the bucket's CURRENT
// ABSOLUTE ROW, never a delta. A delta redelivered after a reconnect double-counts and the
// reviewer *will* refresh; an absolute row is idempotent, so redelivery costs nothing. It is also
// why a restatement needs no frame type of its own — it is the same row for an older minute,
// carrying `restated_at` and a bumped `restatement_count` (§5.5). "The number grew" and "the number
// changed" are one mechanism, which is why there is no reconciliation code here to get wrong.
//
// B09 is the happy path only: connect, then live frames. `Last-Event-ID` resume and the
// `resnapshot` frame are B10 — Seno's split, so that the reconnect story is verified in one chunk
// rather than half-built in two.

import type { ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { openSse, type SseConnection } from './http.ts';
import { bucketReader, type BucketRow } from './snapshot.ts';
import type { BucketKey } from './apply.ts';

/**
 * 250 ms — the fast end of §5.5's 250–500 ms range, chosen because the flush is also the render
 * rate limiter (§11 backpressure point 3) and a live number that updates four times a second reads
 * as live. Not in `src/shared/config.ts` because that module does not exist until B21.
 */
const FLUSH_MS = 250;

/**
 * 15 s. An SSE connection that sends nothing can be dropped by an intermediary — and in dev there
 * IS one, Vite's `/api` proxy — so the tick sends a comment when it has no rows. A comment is not
 * an event: it resets idle timers without moving `Last-Event-ID`.
 */
const KEEPALIVE_MS = 15_000;

/** What a flush puts on the wire. One frame per tick, carrying every bucket that moved. */
export type BucketsFrame = { rows: BucketRow[]; as_of_ingest_seq: number };

export type Stream = {
  /** Take over a response as a subscriber. */
  subscribe: (res: ServerResponse) => void;
  /** Called by the ingest route AFTER its transaction commits, with the buckets it moved. */
  markDirty: (keys: readonly BucketKey[]) => void;
  /** Close every subscriber and stop the tick. Without this, `server.close()` never returns. */
  shutdown: () => void;
  /** For `/api/health` and for tests: how many subscribers are attached. */
  size: () => number;
};

export function createStream(db: DatabaseSync): Stream {
  const readBucket = bucketReader(db);
  const subscribers = new Set<SseConnection>();

  /**
   * The dirty set, coalesced by construction: a `Map` keyed by `ad_id\nminute_start` collapses a
   * burst of 400 impressions in one minute to a single row, which is §11 backpressure point 3.
   *
   * **In memory, and deliberately not a query.** A store-side `WHERE max_ingest_seq > cursor`
   * would have to scan all of `rollup_minute` every tick, because the one case that matters most —
   * a late conversion restating a settled bucket (P7/HR4) — touches an arbitrarily OLD minute, so
   * the scan could not be bounded by time without missing exactly that. §11 specifies an in-memory
   * dirty set for this reason. B10's resume path is where the store query belongs: once per
   * connect, not four times a second.
   */
  const dirty = new Map<string, BucketKey>();
  let lastKeepalive = Date.now();

  const highWater = db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS seq FROM signals');
  const currentSeq = (): number => (highWater.get() as { seq: number }).seq;

  function markDirty(keys: readonly BucketKey[]): void {
    for (const key of keys) dirty.set(`${key.ad_id}\n${key.minute_start}`, key);
  }

  function flush(): void {
    if (subscribers.size === 0) {
      // Nobody listening: drop the set rather than accumulate it.
      //
      // What makes the drop safe is **§3.1 step 3** — on connect the server replays every bucket
      // with `ingest_seq > cursor` FROM THE STORE (B10a). It is NOT step 1: the snapshot is taken
      // before the subscribe, so it cannot cover an event landing in the gap between the two.
      // Measured: an event posted with no subscriber attached is never pushed once one connects —
      // only the snapshot has it. So the store query is the thing that closes the gap, and
      // dropping here is only safe for as long as B10a exists.
      dirty.clear();
      return;
    }

    if (dirty.size === 0) {
      if (Date.now() - lastKeepalive >= KEEPALIVE_MS) {
        for (const conn of subscribers) conn.comment('keepalive');
        lastKeepalive = Date.now();
      }
      return;
    }

    const keys = [...dirty.values()];
    dirty.clear();

    // Read the rows AFTER clearing: anything ingested from here on re-dirties its bucket and is
    // caught by the next tick. Clearing after the read would lose a bucket touched in between.
    const rows: BucketRow[] = [];
    for (const key of keys) {
      const row = readBucket(key);
      // `undefined` cannot happen — apply() wrote the row in the committed transaction that
      // produced this key — so it is a bug signal, not a case to paper over silently.
      if (row === undefined) {
        console.error(`[stream] no row for ${key.ad_id} ${key.minute_start} — apply/flush disagree`);
        continue;
      }
      rows.push(row);
    }
    if (rows.length === 0) return;

    // ONE frame per flush, carrying every row. Not one frame per row: N frames would all have to
    // share this flush's high-water `id:`, and a connection dropping mid-flush would leave the
    // client holding that id while missing rows — B10's resume would then ask for
    // `ingest_seq > id` and never resend them. Silent, and stale until the bucket moves again.
    const frame: BucketsFrame = { rows, as_of_ingest_seq: currentSeq() };
    for (const conn of subscribers) {
      // `false` means the socket buffer is full (§11 backpressure point 2). Rows are coalesced but
      // NEVER dropped, so nothing is discarded here; Node keeps buffering. The hard buffer cap
      // that closes a hopeless connection, and the "N events not shown" tail treatment, are B44's.
      if (!conn.send('buckets', frame, frame.as_of_ingest_seq)) {
        console.warn('[stream] subscriber socket is full — buffering, not dropping');
      }
    }
    lastKeepalive = Date.now();
  }

  const timer = setInterval(flush, FLUSH_MS);

  return {
    subscribe(res) {
      const conn = openSse(res);
      subscribers.add(conn);
      // The cursor a client would resume from if it dropped right now. B09 does not READ
      // `Last-Event-ID` — B10 does — so this frame is what makes `curl -N` immediately
      // informative, and it is an addition to §3.1's frame list rather than something it specifies.
      conn.send('ready', { as_of_ingest_seq: currentSeq(), flush_ms: FLUSH_MS });
      res.on('close', () => {
        subscribers.delete(conn);
        conn.close();
      });
    },
    markDirty,
    shutdown() {
      clearInterval(timer);
      for (const conn of subscribers) conn.close();
      subscribers.clear();
    },
    size: () => subscribers.size,
  };
}
