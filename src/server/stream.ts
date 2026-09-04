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

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { openSse, type SseConnection } from './http.ts';
import { bucketReader, bucketsSinceReader, type BucketRow } from './snapshot.ts';
import { decideReplay, readCursor, RESNAPSHOT_ROWS, type ResnapshotReason } from './resume.ts';
import type { Tail } from './tail.ts';
import type { BucketKey } from './apply.ts';

// B44 (c): the resume half lives in `resume.ts` now. Re-exported so every existing importer —
// `stream.test.ts`'s seven `readCursor` assertions among them — keeps working unchanged.
export { readCursor, RESNAPSHOT_ROWS };
export type { ResnapshotReason };

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

/**
 * **B44 (a) — rows per BUCKET frame, with the remainder spilled to the next tick.**
 *
 * Owed from B09, which had no cap at all and said so: the frame is built in full before any socket
 * is written to, so B44's socket-buffer cap does not cover it. The unbounded case is real and it is
 * not the busy one — a `late_cascade` scenario (§17) or a horizon shortening (P16/B49) dirties
 * thousands of OLD buckets at once, and a single frame carrying them all is a multi-megabyte write
 * that stalls every subscriber's socket in the same tick.
 *
 * 400 rows is ~130 KB at B09's measured 325 B a row, and at a 250 ms tick that drains 1,600 rows a
 * second — faster than any sustained arrival rate this world produces, so the spill is a smoothing
 * mechanism rather than a queue that grows. **Spilled keys go back into the dirty set**, which is
 * coalesced by construction, so a bucket touched again while it waits is still sent once.
 */
const ROWS_PER_FRAME = 400;


/** What a flush puts on the wire. One frame per tick, carrying every bucket that moved. */
export type BucketsFrame = { rows: BucketRow[]; as_of_ingest_seq: number };

export type Stream = {
  /** Take over a response as a subscriber, replaying from the client's cursor if it sent one. */
  subscribe: (req: IncomingMessage, res: ServerResponse, url: URL) => void;
  /** Called by the ingest route AFTER its transaction commits, with the buckets it moved. */
  markDirty: (keys: readonly BucketKey[]) => void;
  /** Close every subscriber and stop the tick. Without this, `server.close()` never returns. */
  shutdown: () => void;
  /** For `/api/health` and for tests: how many subscribers are attached. */
  size: () => number;
};

/**
 * `createStream(db, tail)` — the tail is optional so a test can drive the flush without one, and
 * so `stream.ts` has no opinion about where deliveries are recorded. When present, every flush tick
 * also pushes a `tail` frame (§11: *"sample the raw tail, capped per tick"*).
 */
export function createStream(db: DatabaseSync, tail?: Tail): Stream {
  const readBucket = bucketReader(db);
  const readSince = bucketsSinceReader(db);
  const subscribers = new Set<SseConnection>();

  /**
   * Tell one client to go back to §3.1 step 1. It stays subscribed: it will re-snapshot and
   * reconnect, and until it does, live frames are still correct for it — absolute rows, so nothing
   * it receives in the meantime can be wrong, only incomplete.
   */
  function resnapshot(conn: SseConnection, reason: ResnapshotReason, detail: object): void {
    console.warn(`[stream] resnapshot: ${reason}`, detail);
    conn.send('resnapshot', { reason, ...detail });
  }

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
  /** Connections already warned about a full socket — B44 (b), one line per connection. */
  const warned = new WeakSet<SseConnection>();

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

    // B44 (a): take at most a frame's worth and LEAVE the rest dirty. Taken before the clear, so
    // the remainder survives the tick rather than being dropped — which is the difference between
    // a cap and a data loss.
    const all = [...dirty.values()];
    const keys = all.slice(0, ROWS_PER_FRAME);
    dirty.clear();
    if (all.length > keys.length) {
      const spilled = all.slice(keys.length);
      for (const key of spilled) dirty.set(`${key.ad_id}\n${key.minute_start}`, key);
      tail?.noteSpill(spilled.length);
    }

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
      // NEVER dropped, so nothing is discarded here; Node keeps buffering.
      //
      // **B44 (b): warned ONCE per connection, and counted every time.** `res.write` returns
      // `false` for any frame over the socket high-water mark, which a client that is reading
      // perfectly normally will hit — so the per-tick warning it used to print was four lines a
      // second of noise about nothing, and noise on this channel is how a real stall goes unnoticed.
      // The counter is the honest signal and it is on the telemetry block.
      if (!conn.send('buckets', frame, frame.as_of_ingest_seq)) {
        tail?.noteBackpressure();
        if (!warned.has(conn)) {
          warned.add(conn);
          console.warn('[stream] a subscriber socket filled — buffering, not dropping (once per connection)');
        }
      }
    }
    // B44: the tail rides the same tick. A frame of its own, so a client that does not want it can
    // ignore the event type, and so it can never be mistaken for a bucket row.
    if (tail !== undefined) {
      const tailFrame = tail.frame(db);
      // No `id:` — the tail is a SAMPLE, not a log position (D34). Giving it one would let a
      // reconnect ask to resume the tail, which is a promise this design does not make.
      if (tailFrame !== null) for (const conn of subscribers) conn.send('tail', tailFrame);
    }
    lastKeepalive = Date.now();
  }

  const timer = setInterval(flush, FLUSH_MS);

  return {
    subscribe(req, res, url) {
      const claimed = readCursor(req.headers['last-event-id'], url.searchParams.get('cursor'));

      const conn = openSse(res);
      // SUBSCRIBE FIRST, replay second. Reversed, an event landing between the replay and the
      // subscribe is lost — the flush hands it to whatever subscribers exist and clears the set.
      // This way the worst case is a row arriving twice, which costs nothing: absolute rows are
      // idempotent, and that is the entire reason D30 chose them over deltas.
      subscribers.add(conn);
      res.on('close', () => {
        subscribers.delete(conn);
        conn.close();
      });

      // The cursor this client would resume from if it dropped right now, plus what the server made
      // of the cursor it presented. An addition to §3.1's frame list, not something it specifies.
      conn.send('ready', {
        as_of_ingest_seq: currentSeq(),
        flush_ms: FLUSH_MS,
        resumed_from: claimed !== null && 'cursor' in claimed ? claimed.cursor : null,
      });

      // B44 (c): the whole decision now lives in `resume.ts` — one read transaction, three
      // `resnapshot` conditions, D47 unchanged. This block is the transport half of it.
      const decision = decideReplay(db, claimed, currentSeq, readSince);
      if (decision.kind === 'live') return;
      if (decision.kind === 'resnapshot') {
        resnapshot(conn, decision.reason, decision.detail);
        return;
      }
      const frame: BucketsFrame = {
        rows: decision.rows,
        as_of_ingest_seq: decision.as_of_ingest_seq,
      };
      conn.send('buckets', frame, frame.as_of_ingest_seq);
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
