// The snapshot read path. DESIGN.md §3.1: the cold start, and — because "a refresh is step 1–4
// again" — every refresh too. One request, one read transaction, consistent by construction.
//
// This file is READ-ONLY by construction: it holds SELECTs and nothing else. Projections have
// exactly one writer (D7, apply.ts), and the read side never repairs what it finds.
//
// D10 is visible here as an absence: the rows carry additive counts and no ratios. CTR/CPA/ROAS
// are derived from these counts at B38, in this file, from the numbers below — never stored, and
// never recomputed on the client from raw events (D30/D34).

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
// B20a: the read side's half of the timestamp invariant — it CANONICALISES where the write
// side rejects, and both halves now live in one file so the asymmetry is legible instead of
// looking like two modules disagreeing.
import { HAS_EXPLICIT_OFFSET, ceilToMinute, floorToMinute } from '../shared/time.ts';
import { bucketState, type SettlementState } from './settlement.ts';
import type { BucketKey } from './apply.ts';

/**
 * One `rollup_minute` row, 1:1 with the table (DESIGN §2.4). The mapping is deliberately
 * identity: the plan's verification for this chunk is "diff the JSON against `sqlite3` output by
 * hand", and any renaming or reshaping here would make that diff a translation exercise.
 *
 * These are D30's ABSOLUTE rows. The same shape goes down the SSE stream at B09, which is what
 * makes a frame replayed after a reconnect idempotent instead of double-counting.
 */
export type BucketRow = {
  ad_id: string;
  minute_start: string;
  impressions: number;
  clicks: number;
  click_cost_cents: number;
  spend_cents: number;
  conversions: number;
  value_cents: number;
  provisional_conversions: number;
  provisional_value_cents: number;
  first_written_at: string;
  restated_at: string | null;
  restatement_count: number;
  max_ingest_seq: number; // the per-bucket as-of stamp (D31)
  /**
   * **Derived at read, never stored** (B21) — `live` / `settled` / `restated`, §5.4's vocabulary.
   *
   * Not a column: whether a bucket has aged past the horizon is a question about the read clock,
   * and a stored answer would change without an event and make `/api/verify` diverge on a correct
   * store. It rides on the row rather than being computed on the client so that the snapshot and
   * the SSE frame cannot disagree about the same bucket, and so that D30 holds — the client
   * renders what the server computed.
   */
  state: SettlementState;
};

/** The resolved window. `ads: null` means the whole portfolio (DESIGN §2.4's second access path). */
export type SnapshotQuery = { from: string; to: string; ads: string[] | null };

/**
 * One row of the portfolio list — **B36**, and `DESIGN.md` §3.1's `ads[]`.
 *
 * The fold's head (D7), never a fixture: `fixtures.ts` still says what `a_12`'s budget was at
 * seeding, and a `set_budget` decision has since made that wrong. Everything here comes from the
 * `ads` projection, which exists only because `applyDecision()` ran.
 *
 * `current_generation_id` and `last_decision_seq` are carried because the shell is the only place
 * that can show that config is versioned WITHOUT a chart: an ad on generation 4 has had three
 * levers pulled on it, and that is HR6 visible on the first screen rather than at B48.
 */
export type AdRow = {
  ad_id: string;
  name: string;
  status: 'draft' | 'live' | 'paused' | 'archived';
  channel: string;
  audience_id: string;
  daily_budget_cents: number;
  launched_at: string | null;
  current_generation_id: string;
  last_decision_seq: number;
};

export type Snapshot = {
  /** The window as the server RESOLVED it — snapped to whole minutes, echoed so a caller
   *  can see which buckets were actually asked for rather than inferring it. */
  query: SnapshotQuery;
  /**
   * The whole portfolio — **every** ad, not only the selected ones (B36).
   *
   * Deliberately unfiltered by `query.ads`: `?ads=` selects what is CHARTED, and a portfolio list
   * that hid the ads you are not currently looking at would make selecting them impossible. It is
   * twelve rows, so the cost of always sending it is nothing next to a second round trip.
   */
  ads: AdRow[];
  /** Ordered by `(ad_id, minute_start)`, both request paths, so hand-diffs are reproducible. */
  buckets: BucketRow[];
  /**
   * The log position these buckets reflect — `MAX(signals.ingest_seq)`, read INSIDE the same read
   * transaction. The client hands it back as `Last-Event-ID` (§3.1 step 2, D18), so it is the one
   * number here that must not be off by one in either direction: read it before the buckets and
   * it is stale (the client re-receives frames it already has, harmless because absolute rows are
   * idempotent); read it AFTER the transaction and it is ahead of the data, and the client
   * silently never learns about the events in between.
   */
  as_of_ingest_seq: number;
};

export type ParsedQuery = { ok: true; query: SnapshotQuery } | { ok: false; error: string };

/**
 * Resolve `?from&to&ads`. Two rules, both there because the alternative is a wrong answer that
 * announces nothing.
 *
 * **1. An explicit UTC offset is required.** `?from=2026-09-03T12:00:00` is parsed by JS as LOCAL
 * time — on this machine (`Asia/Yerevan`) it resolves to `08:00:00.000Z`, returns zero buckets,
 * and would resolve to a different instant on a reviewer's laptop. Accepted: `Z`, `±HH:MM`,
 * `±HHMM`. Rejected: hour-only offsets (`+02`, which V8 parses as `NaN` anyway) and the date-only
 * form (`2026-09-03`) — JS reads date-only as UTC but date-and-time-without-offset as local, and
 * that inconsistency IS the trap, so there is one rule instead: say which zone you mean.
 *
 * **2. Bounds are snapped to the minute** — `from` down, `to` up — and the snapped values are
 * echoed in `query`. `rollup_minute` is minute-grained (D9), so a bound sitting INSIDE a minute
 * resolves to whole buckets in opposite directions at the two ends: `[12:00:00Z, 12:00:30Z)`
 * returned the whole 12:00 bucket, impression at 12:00:50 included (over-counting at `to`), while
 * `[12:00:20Z, 13:00:00Z)` dropped that same impression (under-counting at `from`) — measured, and
 * silent both ways. Snapped, the buckets returned are exactly the buckets whose contents lie
 * inside the window: the property B53's drill-down re-sums raw events against, which unaligned
 * would report FAIL for a reason that is not corruption.
 *
 * Down/up rather than down/down so the window never loses data and never collapses —
 * `floor(from) < ceil(to)` for every `from < to`, so there is no zero-width case to reject — and
 * so a live window ending at `now` mid-minute keeps its in-progress bucket instead of hiding the
 * newest number for up to 59 seconds.
 *
 * The snapped output is canonical millisecond ISO by construction, which also disarms the read
 * side of B05's lexicographic trap: `minute_start` is TEXT, `'…T12:00:00Z' > '…T12:00:00.000Z'`
 * because `'Z'` (0x5A) sorts after `'.'` (0x2E), so an unsnapped bound would have compared byte
 * order instead of time order and skipped the minute it names.
 *
 * Half-open `[from, to)` on the bucket's own `minute_start`, the same convention as
 * `config_generations.[valid_from, valid_to)`, so two adjacent windows tile without overlap.
 */
export function parseSnapshotQuery(params: URLSearchParams): ParsedQuery {
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  if (rawFrom === null || rawTo === null) {
    return { ok: false, error: 'from and to are both required (ISO-8601 instants, e.g. 2026-09-03T12:00:00Z)' };
  }

  for (const [name, raw] of [
    ['from', rawFrom],
    ['to', rawTo],
  ] as const) {
    if (!HAS_EXPLICIT_OFFSET.test(raw)) {
      return {
        ok: false,
        error: `${name}: '${raw}' needs an explicit UTC offset — 'Z', '+HH:MM' or '-HH:MM' (e.g. 2026-09-03T12:00:00Z). Without one JS parses it as local time, which is a different instant on a different machine.`,
      };
    }
  }

  // The regex fixes the SHAPE; `25:00:00Z` matches it and is still not a time.
  const fromMs = new Date(rawFrom).getTime();
  const toMs = new Date(rawTo).getTime();
  if (Number.isNaN(fromMs)) return { ok: false, error: `from: '${rawFrom}' is not a date` };
  if (Number.isNaN(toMs)) return { ok: false, error: `to: '${rawTo}' is not a date` };
  if (fromMs >= toMs) {
    // An inverted or empty window is a caller bug. Returning `[]` would answer it with a
    // plausible-looking empty chart instead.
    return { ok: false, error: `from must be strictly before to (got ${rawFrom} .. ${rawTo})` };
  }

  const rawAds = params.get('ads');
  let ads: string[] | null = null;
  if (rawAds !== null) {
    // Sorted and deduped: sorting is what makes the per-ad loop below emit rows already in
    // `(ad_id, minute_start)` order, matching the portfolio path's ORDER BY exactly.
    ads = [...new Set(rawAds.split(',').map((s) => s.trim()))].filter((s) => s.length > 0).sort();
    if (ads.length === 0) return { ok: false, error: 'ads was given but empty' };
  }

  return { ok: true, query: { from: floorToMinute(fromMs), to: ceilToMinute(toMs), ads } };
}

/**
 * The stored row, before its state is derived. `BucketRow` minus the one field that is not a
 * column — named so that a reader can see the SELECT below returns exactly the columns and nothing
 * more, and so that forgetting `withState()` is a type error rather than a missing badge.
 */
type StoredBucket = Omit<BucketRow, 'state'>;

/**
 * Stamp the settlement state onto rows as they leave the store — **the single place it happens**,
 * so the snapshot, the SSE flush tick and the resume replay cannot label the same bucket three
 * ways. `at` is the read moment for all three.
 */
function withState(rows: StoredBucket[], at: string): BucketRow[] {
  return rows.map((row) => ({ ...row, state: bucketState(row, at) }));
}

const BUCKET_COLUMNS = `
  ad_id, minute_start, impressions, clicks, click_cost_cents, spend_cents,
  conversions, value_cents, provisional_conversions, provisional_value_cents,
  first_written_at, restated_at, restatement_count, max_ingest_seq`;

/**
 * The hot read (DESIGN §2.4, verified at B03): one contiguous range scan of the `WITHOUT ROWID`
 * primary key per ad. Run once per requested ad rather than as one `ad_id IN (…)` — an `IN` list
 * needs a placeholder count baked into the SQL, so it cannot be a single prepared statement, and
 * the per-ad form is the access path §2.4 actually specifies.
 */
const SELECT_ONE_AD = `SELECT ${BUCKET_COLUMNS} FROM rollup_minute
  WHERE ad_id = ? AND minute_start >= ? AND minute_start < ? ORDER BY minute_start`;

/** The portfolio window (DESIGN §2.4's second access path): `ix_rollup_time` over all ads. */
const SELECT_ALL_ADS = `SELECT ${BUCKET_COLUMNS} FROM rollup_minute
  WHERE minute_start >= ? AND minute_start < ? ORDER BY ad_id, minute_start`;

/** `MAX(signals.ingest_seq)`, the same high-water mark `/api/health` reports (D12/E2). */
/**
 * The portfolio, ordered by `ad_id` so the list is stable across refreshes — a list that reordered
 * itself as statuses changed would move the row under the reviewer's cursor mid-demo.
 */
const SELECT_PORTFOLIO = `
  SELECT ad_id, name, status, channel, audience_id, daily_budget_cents, launched_at,
         current_generation_id, last_decision_seq
    FROM ads ORDER BY ad_id
`;

const SELECT_LOG_POSITION = `SELECT COALESCE(MAX(ingest_seq), 0) AS seq FROM signals`;

/**
 * Read one bucket's CURRENT absolute row. The SSE flush tick's reader (B09).
 *
 * Lives here rather than in `stream.ts` so `BUCKET_COLUMNS` has one reader and the stream cannot
 * drift into sending a differently-shaped row than the snapshot does — the client merges the two
 * by `(ad_id, minute_start)` (B10), so a column present in one and absent from the other would
 * show up as a field that intermittently goes undefined, not as an error.
 *
 * Returns a factory so the statement is prepared once per connection-set, not once per bucket per
 * tick. D28's `WITHOUT ROWID` primary key makes each read one B-tree seek (verified at B03).
 */
export function bucketReader(db: DatabaseSync): (key: BucketKey) => BucketRow | undefined {
  const stmt = db.prepare(
    `SELECT ${BUCKET_COLUMNS} FROM rollup_minute WHERE ad_id = ? AND minute_start = ?`,
  );
  return (key) => {
    const row = stmt.get(key.ad_id, key.minute_start) as unknown as StoredBucket | undefined;
    // The read clock is taken HERE rather than passed in, so the flush tick and the resume cannot
    // ship a row without a state — `stream.ts` needs no knowledge of settlement to carry it.
    return row === undefined ? undefined : withState([row], new Date().toISOString())[0];
  };
}

/**
 * The SSE resume read — §3.1 step 3, via B10a: every bucket touched by a signal with
 * `ingest_seq > cursor`, as its CURRENT absolute row, capped at `limit` rows.
 *
 * Here rather than in `stream.ts` for the same reason as `bucketReader` above: one place knows how
 * a bucket row is read, so the resume, the flush and the snapshot cannot drift into three shapes.
 *
 * **A store query, never a replay of buffered frames** (BUILD_PLAN §14). `max_ingest_seq` has no
 * index, so this is a full scan of `rollup_minute` — correct **once per connect**, and exactly why
 * it cannot be the per-tick mechanism. **No `ORDER BY` on purpose:** the client merges by
 * `(ad_id, minute_start)` so order is irrelevant, and without one SQLite may stop scanning as soon
 * as it has `limit` rows — bailing earliest in the expensive case, which is the case that ends in
 * `resnapshot` anyway.
 *
 * Caller passes `limit = RESNAPSHOT_ROWS + 1` and treats a full result as "too many" (D47), so the
 * count costs no extra pass.
 */
export function bucketsSinceReader(db: DatabaseSync): (cursor: number, limit: number) => BucketRow[] {
  const stmt = db.prepare(
    `SELECT ${BUCKET_COLUMNS} FROM rollup_minute WHERE max_ingest_seq > ? LIMIT ?`,
  );
  return (cursor, limit) =>
    withState(stmt.all(cursor, limit) as unknown as StoredBucket[], new Date().toISOString());
}

export function snapshot(db: DatabaseSync, query: SnapshotQuery): Snapshot {
  const portfolio = db.prepare(SELECT_PORTFOLIO);
  const perAd = db.prepare(SELECT_ONE_AD);
  const allAds = db.prepare(SELECT_ALL_ADS);
  const logPosition = db.prepare(SELECT_LOG_POSITION);

  return readTx(db, () => {
    // Position first, buckets second: inside one transaction the order cannot matter, and taking
    // it first means the invariant "as_of never exceeds what these rows reflect" holds even if
    // this function is ever called outside `readTx` by mistake.
    const seq = logPosition.get() as { seq: number };

    // The SELECT names exactly BucketRow's fields and every column is STRICT-typed, so the shape
    // is guaranteed by the DDL; `node:sqlite` types rows as records of SQL output values.
    const buckets = (
      query.ads === null
        ? allAds.all(query.from, query.to)
        : query.ads.flatMap((ad) => perAd.all(ad, query.from, query.to))
    ) as unknown as StoredBucket[];

    // One instant for the whole snapshot: two buckets in one response must not be judged against
    // two different clocks, or a window straddling the horizon can come back internally
    // inconsistent — the earlier row `settled` and a later one `live`.
    // In the SAME read transaction as the buckets, which is the whole reason §3.1 makes this one
    // request: a portfolio read separately could show an ad as `live` beside buckets taken from
    // after it was paused, and the screen would be internally inconsistent with nothing to blame.
    const ads = portfolio.all() as unknown as AdRow[];

    return {
      query,
      ads,
      buckets: withState(buckets, new Date().toISOString()),
      as_of_ingest_seq: seq.seq,
    };
  });
}
