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
import { readTx } from './db.ts';
import { bucketReader, bucketsSinceReader, type BucketRow } from './snapshot.ts';
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

/**
 * D47. Past this many rows the server sends `resnapshot` instead of replaying.
 *
 * The threshold is on ROW COUNT because that is what costs — 325 B and 7.1 µs per row, measured at
 * B09. Seq distance and cursor age both mispredict by orders of magnitude in either direction:
 * 100,000 impressions inside one minute dirty ONE bucket, while 20,000 late conversions spread over
 * 20,000 minutes dirty 20,000, at identical seq distance.
 *
 * 2,000 rows is 0.65 MiB and 14 ms, pinned to the cost of the fallback it chooses against: the
 * client re-snapshots its VISIBLE WINDOW, which portfolio-wide is 12 ads × 60 minutes = 720 rows.
 * Above roughly one portfolio-hour, replaying transfers more than re-snapshotting would — and
 * unlike the snapshot, the replay is unbounded in time. Moves to `src/shared/config.ts` at B21.
 */
const RESNAPSHOT_ROWS = 2_000;

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

/** Why a connect is being answered with `resnapshot` rather than a replay. D47. */
export type ResnapshotReason = 'cursor_ahead_of_log' | 'cursor_not_a_number' | 'too_many_rows';

/**
 * The cursor the client is claiming, as `max(?cursor=N, Last-Event-ID)` — **D47**.
 *
 * It arrives two ways because `EventSource` **cannot set a request header**: its constructor takes
 * `withCredentials` and nothing else. So `Last-Event-ID` exists only on the browser's own
 * reconnect, never on the first connect after a snapshot — and treating an absent header as "go
 * live" would silently drop the snapshot-to-subscribe gap on **every refresh** (events landing
 * between §3.1 step 1 and step 2 are flushed to other subscribers and gone, leaving those buckets
 * stale until they next move). `?cursor=N` is the client's own channel for the cursor the snapshot
 * gave it.
 *
 * `max` and not `min`: both are TRUE statements of "I hold everything up to X" — the query param
 * because the snapshot returned it, the header because the browser only replays an id it actually
 * dispatched — so the max is the tightest true lower bound and loses nothing. `min` would replay
 * redundantly, and on a long session the extra rows could trip RESNAPSHOT_ROWS for no reason.
 *
 * `null` means no cursor at all: nothing to replay, go straight live.
 */
export function readCursor(
  header: string | string[] | undefined,
  param: string | null,
): { cursor: number } | { invalid: string } | null {
  const raw: string[] = [];
  // `Array.isArray` cannot happen for `last-event-id` (Node joins duplicates into one string), but
  // present-and-unusable must never fall through to the absent branch — see below.
  if (Array.isArray(header)) return { invalid: header.join(',') };
  if (typeof header === 'string') raw.push(header);
  if (param !== null) raw.push(param);
  if (raw.length === 0) return null;

  let cursor = -1;
  for (const value of raw) {
    // **Validate the INPUT, not the result.** Two bugs, one cause — both found by Seno at B10a:
    //
    //  1. `Number()` reintroduces exactly the hazard `parseInt()` was rejected for. On a store at
    //     log position 2001, `?cursor=1e3` yields 1000 and replays 1001 rows — byte-identical to a
    //     legitimate `?cursor=1000`, silently skipping buckets 1–1000. `0x3`, `+2`, `2.0` and a
    //     space all pass too, because `Number.isInteger` inspects the OUTPUT.
    //  2. A present-but-empty cursor (`?cursor=`, or `last-event-id: ''`) read as ABSENT, so it
    //     went live with no replay — the precise gap this chunk exists to close, and one
    //     `?cursor=${''}` away in B10b. Present-and-empty is invalid, not absent.
    //
    // Decimal digits only, tested against the raw string. Absent stays the ONLY path to "go live".
    if (!/^\d+$/.test(value)) return { invalid: value };
    const n = Number(value);
    if (n > cursor) cursor = n;
  }
  return { cursor };
}

export function createStream(db: DatabaseSync): Stream {
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

      if (claimed === null) return; // no cursor at all: nothing to replay, go live

      if ('invalid' in claimed) {
        // Not `400`: an `EventSource` would retry the same bad URL forever. D47.
        resnapshot(conn, 'cursor_not_a_number', { cursor: claimed.invalid });
        return;
      }

      // One read transaction for the rows AND the high-water mark, for B07's reason: a cursor read
      // outside it can land ahead of the rows it is stamped on, and the client then never learns
      // about the gap.
      const replay = readTx(db, () => {
        const seq = currentSeq();
        if (claimed.cursor > seq) return { ahead: seq } as const;
        // limit = threshold + 1, so a full result IS the "too many" signal and the count costs no
        // extra pass (D47).
        return { rows: readSince(claimed.cursor, RESNAPSHOT_ROWS + 1), seq } as const;
      });

      if ('ahead' in replay) {
        // The silent one, and it is reachable by the SUPPORTED reset (U8): `rm -rf data/`,
        // re-migrate, and the browser reconnects with a cursor from the old store. Every bucket
        // then has `max_ingest_seq` below it, the replay is empty, and the client sits on stale
        // numbers forever believing it is current. D47 makes it a resnapshot instead.
        resnapshot(conn, 'cursor_ahead_of_log', {
          cursor: claimed.cursor,
          log_position: replay.ahead,
        });
        return;
      }

      if (replay.rows.length > RESNAPSHOT_ROWS) {
        resnapshot(conn, 'too_many_rows', {
          cursor: claimed.cursor,
          exceeded: RESNAPSHOT_ROWS,
        });
        return;
      }
      if (replay.rows.length === 0) return; // caught up already

      const frame: BucketsFrame = { rows: replay.rows, as_of_ingest_seq: replay.seq };
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
