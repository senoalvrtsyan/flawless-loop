// The resume half of the live push — **B44 (c), split out of `stream.ts`**.
//
// `stream.ts` held two concerns and 285 lines: the flush loop that pushes rows, and everything
// about a client ARRIVING — parsing the cursor it claims, deciding whether a replay is cheap enough,
// and choosing `resnapshot` when it is not. `BUILD_PLAN.md` §14 named the split as owed from B10a,
// and B44 is where it lands because B44's caps are changes to the flush loop and nothing else.
//
// **Nothing here moved in behaviour.** The cursor rule (D47), the `LIMIT 2001` replay and the three
// `resnapshot` conditions are B10a's, unchanged; `stream.ts` re-exports `readCursor` so the seven
// tests that import it from there still do (the same courtesy B20a paid its importers).

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { bucketsSinceReader, type BucketRow } from './snapshot.ts';

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
 * unlike the snapshot, the replay is unbounded in time.
 */
export const RESNAPSHOT_ROWS = 2_000;

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


/**
 * What to do with an arriving client's cursor, decided in ONE read transaction.
 *
 * The transaction is the point: a cursor read outside it can land ahead of the rows it is stamped
 * on, and the client then never learns about the gap (B07's reason, restated here because the
 * bug is silent).
 */
export type ReplayDecision =
  | { kind: 'live' }
  | { kind: 'resnapshot'; reason: ResnapshotReason; detail: Record<string, number | string | undefined> }
  | { kind: 'rows'; rows: BucketRow[]; as_of_ingest_seq: number };

export function decideReplay(
  db: DatabaseSync,
  claimed: ReturnType<typeof readCursor>,
  currentSeq: () => number,
  readSince: ReturnType<typeof bucketsSinceReader>,
): ReplayDecision {
  if (claimed === null) return { kind: 'live' }; // no cursor at all: nothing to replay

  if ('invalid' in claimed) {
    // Not `400`: an `EventSource` would retry the same bad URL forever. D47.
    return { kind: 'resnapshot', reason: 'cursor_not_a_number', detail: { cursor: claimed.invalid } };
  }

  const replay = readTx(db, () => {
    const seq = currentSeq();
    if (claimed.cursor > seq) return { ahead: seq } as const;
    // limit = threshold + 1, so a full result IS the "too many" signal and the count costs no
    // extra pass (D47).
    return { rows: readSince(claimed.cursor, RESNAPSHOT_ROWS + 1), seq } as const;
  });

  if ('ahead' in replay) {
    // The silent one, and it is reachable by the SUPPORTED reset (U8): `rm -rf data/`, re-migrate,
    // and the browser reconnects with a cursor from the old store. Every bucket then has
    // `max_ingest_seq` below it, the replay is empty, and the client sits on stale numbers forever
    // believing it is current. D47 makes it a resnapshot instead.
    return {
      kind: 'resnapshot',
      reason: 'cursor_ahead_of_log',
      detail: { cursor: claimed.cursor, log_position: replay.ahead },
    };
  }
  if (replay.rows.length > RESNAPSHOT_ROWS) {
    return {
      kind: 'resnapshot',
      reason: 'too_many_rows',
      detail: { cursor: claimed.cursor, exceeded: RESNAPSHOT_ROWS },
    };
  }
  if (replay.rows.length === 0) return { kind: 'live' }; // caught up already
  return { kind: 'rows', rows: replay.rows, as_of_ingest_seq: replay.seq };
}
