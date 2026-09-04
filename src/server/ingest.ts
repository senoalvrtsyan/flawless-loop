// The ingest boundary. DESIGN.md §5.1, step by step, inside ONE transaction.
//
// Every delivery is written to `signal_deliveries` — accepted, duplicate or reject alike. Nothing
// is silently dropped, which is the property that makes the misbehaviour surfaces (§6) possible
// at all. `signals` gets at most one row per `event_id`; first accepted delivery wins (D15/I7).
//
// This function is the ONLY writer of `ingest_seq`. The HTTP handler calls it with source='live';
// the backfill seeder (B34) calls it in-process with source='backfill' (SIMULATOR §15.2). That
// single-writer property is what D32 was ratified on.

import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { tx } from './db.ts';
import { apply, type BucketKey } from './apply.ts';
import type { Disposition, IngestResult, SignalKind, SignalSource } from '../shared/types.ts';

/** Kinds this build ingests — all four of the brief's, complete as of B18. */
const SUPPORTED: readonly SignalKind[] = ['impression', 'click', 'spend', 'conversion'];

/**
 * The variant fields, and which kind owns each. DESIGN §2.2's four CHECK constraints say the same
 * thing in SQL; this says it at the boundary so the reject reason names the field.
 *
 * Driven off one table rather than per-kind `if`s because the failure being prevented is a field
 * belonging to ANOTHER kind arriving unnoticed — `cost_cents` on a spend event is money that would
 * be silently dropped by an insert that never mentions the column.
 */
const OWN_FIELDS: Record<SignalKind, readonly string[]> = {
  impression: [],
  click: ['click_id', 'cost_cents'],
  spend: ['amount_cents'],
  conversion: ['attributed_click_id', 'value_cents'],
};

const ALL_VARIANT_FIELDS = ['click_id', 'cost_cents', 'amount_cents', 'attributed_click_id',
  'value_cents'] as const;

/**
 * U6: money is a NON-NEGATIVE INTEGER of cents. Checked in JavaScript, never left to `STRICT` —
 * B02 measured that binding a JS number into a TEXT column stores `'12.0'`, and a REAL bound into
 * an INTEGER column converts where lossless. `1.5` and `1e400` are not integers of cents.
 */
function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A delivery whose body has no usable `event_id` still gets a row, keyed as
 * `(no event_id):<payload_hash>`. The hash suffix is load-bearing: a bare sentinel would collect
 * every unrelated malformed delivery under ONE key, and B55's `trace <event_id>` would then show
 * a false arrival history — a dozen unrelated bodies presented as redeliveries of one event.
 */
const NO_EVENT_ID_PREFIX = '(no event_id):';

/**
 * Canonical ISO-8601 UTC, millisecond precision — exactly `new Date().toISOString()`.
 *
 * Enforced rather than normalised, because `ts_effective` is `MIN(ts, received_at)` over TEXT and
 * SQLite's MIN on TEXT is LEXICOGRAPHIC: MIN('…09:00:00.500Z', '…09:00:00Z') returns the .500Z
 * value, which is the LATER instant. Mixed precision would silently invert I10's clamp. Same-shape
 * strings make lexicographic order chronological order, so the whole problem disappears — and
 * `signals.ts` stays "as emitted, never altered".
 *
 * EXPORTED for its D43 test (B12) and for no other caller. Loosened — a `Z`-less or second-
 * precision `ts` let through — the event is ACCEPTED, `ts_effective` silently takes the later
 * instant, and B24's sweep re-derives from that same column and agrees with itself. Our own
 * emitter only ever sends the canonical form, so neither the sweep nor hand verification can see
 * it: the definition of a wrong answer that is invisible.
 */
export function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Stable-key JSON, for the duplicate-vs-conflict test. Hashing the raw bytes would call a
 * key-reordered redelivery a CONFLICT, which would then be surfaced as a platform correction
 * (§5.1 step 4) — a false alarm on the one channel we keep precisely because it is rare.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalise((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalise(value))).digest('hex');
}

/** Returns null if the element is a well-formed, supported, U6-clean event; a reason if not. */
function validate(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return 'not_an_object';
  const e = raw as Record<string, unknown>;

  // "not a string" is called out separately from "absent": the B02 finding is that STRICT accepts
  // the JS number 12 into a TEXT column and stores '12.0', so a numeric id is a real failure mode
  // and the reject reason should say which one it was.
  if (!isNonEmptyString(e['event_id'])) return 'event_id_missing_or_not_a_string';
  if (!isNonEmptyString(e['ad_id'])) return 'ad_id_missing_or_not_a_string';
  // "ad_id known" (§5.1 step 2) is NOT checked here: `ads` is a projection of the decision log and
  // is empty until B15. The check lands with the ad, not before it.
  if (!isCanonicalIso(e['ts'])) return 'ts_not_canonical_iso';

  const kind = e['event'];
  if (typeof kind !== 'string') return 'event_missing';
  if (!SUPPORTED.includes(kind as SignalKind)) return `unsupported_kind:${kind}`;

  const own = OWN_FIELDS[kind as SignalKind];
  // A field belonging to another kind is a reject, not a field to ignore: it is money or an id
  // that the insert for THIS kind never mentions, so tolerating it would drop it in silence.
  for (const field of ALL_VARIANT_FIELDS) {
    if (!own.includes(field) && e[field] !== undefined) return `${kind}_has_${field}`;
  }
  // E3: `click_id` is distinct from `event_id` — the conversion references the click by it, so a
  // click that arrives without one can never be attributed against.
  if (kind === 'click') {
    if (!isNonEmptyString(e['click_id'])) return 'click_id_missing_or_not_a_string';
    if (!isCents(e['cost_cents'])) return 'cost_cents_not_a_non_negative_integer';
  }
  // I1: spend is a DELTA for one fixed 60 s interval, not a running total. Nothing at this
  // boundary can tell the two apart — the emitter's contract is stated in SIMULATOR §10 and the
  // rollup's `spend_cents` is a sum, so a cumulative emitter would double-count with no error.
  if (kind === 'spend' && !isCents(e['amount_cents'])) {
    return 'amount_cents_not_a_non_negative_integer';
  }
  // The conversion names the CLICK it belongs to, by `click_id` and never by `event_id` (E3). A
  // conversion with no `attributed_click_id` could not be an orphan either — an orphan is a
  // conversion whose click we have not seen YET, and this one names no click to wait for.
  if (kind === 'conversion') {
    if (!isNonEmptyString(e['attributed_click_id'])) {
      return 'attributed_click_id_missing_or_not_a_string';
    }
    // U4: gross value. Zero is legal — a conversion can be worth nothing and still be a
    // conversion, and the count is what CPA divides by.
    if (!isCents(e['value_cents'])) return 'value_cents_not_a_non_negative_integer';
  }
  return null;
}

/**
 * Ingest one batch. Returns the per-delivery outcomes and the new high-water `ingest_seq`.
 *
 * `now` takes the element's INDEX because SIMULATOR §15.3(a) needs a distinct `received_at` per
 * event during the seed. A no-argument thunk could only do that from a stateful closure, which
 * would silently depend on `now()` being called exactly once per element in array order — true
 * today, written down nowhere, and wrong the moment someone moves the call inside the accepted
 * branch. The index removes the invariant rather than documenting it. The HTTP path ignores it.
 */
/**
 * What one ingest call produced: the wire result, plus the buckets it moved.
 *
 * `dirty` is separate from `IngestResult` on purpose — `IngestResult` IS the HTTP response body,
 * and the bucket set is internal plumbing for the SSE flush (B09), not something the emitter is
 * told. It is returned rather than pushed through a callback so that publishing happens in the
 * CALLER, after `tx()` has committed: a frame announcing a bucket from a transaction that then
 * rolls back would advertise a row the store never had.
 */
export type IngestOutcome = { result: IngestResult; dirty: BucketKey[] };

export function ingest(
  db: DatabaseSync,
  raw: readonly unknown[],
  source: SignalSource,
  now: (index: number) => string = () => new Date().toISOString(),
): IngestOutcome {
  const insertDelivery = db.prepare(`
    INSERT INTO signal_deliveries (event_id, received_at, payload_json, payload_hash, disposition)
    VALUES (?, ?, ?, ?, ?)
  `);
  const findSignal = db.prepare('SELECT event_id FROM signals WHERE event_id = ?');
  const findDelivery = db.prepare(`
    SELECT payload_hash FROM signal_deliveries
    WHERE event_id = ? AND disposition = 'accepted' LIMIT 1
  `);
  // RETURNING gives back the STORED generated `ts_effective` (the I10 clamp) in the same
  // statement, so the projection is fed the store's own value rather than a JS recomputation of
  // MIN() that could drift from it.
  const insertSignal = db.prepare(`
    INSERT INTO signals (event_id, ingest_seq, received_at, ts, ad_id, kind, source,
                         click_id, cost_cents, amount_cents, attributed_click_id, value_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING ts_effective
  `);
  // §13 injects a 0.05% "dual click-id" fault: two DIFFERENT events claiming one `click_id`.
  // `ux_signals_click_id` would refuse the second insert and, inside one transaction, take the
  // whole batch down with it — so the collision is detected here and recorded as a reject, which
  // is also what makes it COUNTABLE at B33 rather than merely survivable.
  const findClickId = db.prepare(`
    SELECT event_id FROM signals WHERE click_id = ? AND kind = 'click'
  `);
  const highWater = db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS seq FROM signals');

  // Accumulated OUTSIDE `tx()` on purpose (see IngestOutcome above) — safe only because `tx()`
  // has no retry loop. If it ever gains one, this array double-accumulates on the second attempt.
  const dirty: BucketKey[] = [];

  const result = tx(db, () => {
    // Read inside the transaction, under BEGIN IMMEDIATE's write lock: no other writer can be
    // allocating sequence numbers concurrently, so an in-memory counter is safe for the batch.
    let seq = (highWater.get() as { seq: number }).seq;
    const result: IngestResult = {
      received: raw.length,
      accepted: 0,
      duplicate_identical: 0,
      duplicate_conflicting: 0,
      rejected_invalid: 0,
      ingest_seq: seq,
      outcomes: [],
    };

    for (const [index, element] of raw.entries()) {
      // A RE-SERIALISATION of the parsed element, not the received bytes. `JSON.parse` has already
      // collapsed duplicate keys, turned `1e2` into `100` and `\u0041` into `A`. Keeping the true
      // bytes would mean a streaming parser that hands back each element's source span — real work,
      // for evidence no misbehaviour in §6 needs. The limit is named in the README (B59) instead.
      const body = JSON.stringify(element);
      const hash = hashPayload(element);
      const eventId =
        element !== null && typeof element === 'object' && !Array.isArray(element) &&
        isNonEmptyString((element as Record<string, unknown>)['event_id'])
          ? ((element as Record<string, unknown>)['event_id'] as string)
          : NO_EVENT_ID_PREFIX + hash;

      const receivedAt = now(index);
      let reason = validate(element);

      let disposition: Disposition;
      if (reason !== null) {
        disposition = 'rejected_invalid';
      } else if ((findSignal.get(eventId) as { event_id: string } | undefined) !== undefined) {
        // Seen before. Same payload is a benign at-least-once redelivery; a different payload is
        // the only channel a platform correction could reach us through (G43), so it is kept and
        // counted — but the first write still wins (D15/I7).
        const prior = findDelivery.get(eventId) as { payload_hash: string } | undefined;
        disposition = prior?.payload_hash === hash ? 'duplicate_identical' : 'duplicate_conflicting';
      } else if (
        // ORDER MATTERS, and it is not obvious. The `click_id` collision test sits AFTER the
        // `event_id` dedupe on purpose: a redelivery of one click carries its own `click_id` too,
        // so testing it first would call every honest retry a dual-click-id fault — and B11's
        // restart property, measured as 14 `duplicate_identical` / 0 conflicting, would read as
        // 14 rejects instead. A collision is only a collision between two DIFFERENT `event_id`s.
        (element as Record<string, unknown>)['event'] === 'click' &&
        (findClickId.get((element as Record<string, unknown>)['click_id'] as string) as
          { event_id: string } | undefined) !== undefined
      ) {
        disposition = 'rejected_invalid';
        reason = 'click_id_already_claimed';
      } else {
        disposition = 'accepted';
      }

      insertDelivery.run(eventId, receivedAt, body, hash, disposition);

      if (disposition === 'accepted') {
        const e = element as Record<string, unknown>;
        seq += 1;
        const kind = e['event'] as SignalKind;
        // `?? null` and not `?? 0`: an absent money column stays NULL, so the schema's four
        // variant CHECKs keep meaning what they say and a spend row can never carry a zero
        // `cost_cents` that reads as "a click that cost nothing".
        const stored = insertSignal.get(
          eventId, seq, receivedAt, e['ts'] as string, e['ad_id'] as string, kind, source,
          (e['click_id'] as string | undefined) ?? null,
          (e['cost_cents'] as number | undefined) ?? null,
          (e['amount_cents'] as number | undefined) ?? null,
          (e['attributed_click_id'] as string | undefined) ?? null,
          (e['value_cents'] as number | undefined) ?? null,
        ) as { ts_effective: string };

        // Same transaction, immediately: D29's incremental upsert. A reader can never observe a
        // signal whose bucket has not moved (DESIGN §11), and a late arrival is just an event
        // whose bucket happens to be old — restatement stops being a subsystem (§4.3).
        // apply() returns the bucket it moved; B09 collects it here. Coalescing is the flush
        // tick's job (DESIGN §5.5) — one batch can touch the same bucket many times.
        const base = {
          event_id: eventId, ingest_seq: seq, ts_effective: stored.ts_effective,
          ad_id: e['ad_id'] as string,
        };
        // The union is narrowed HERE, where `validate()` has just proved the fields are present,
        // rather than inside apply() with a cast. apply() then cannot be called for a kind whose
        // money it has not been given — a compile error instead of a runtime one.
        // SPREAD, not push: apply() returns the buckets it moved, and a conversion whose click
        // has not arrived moves none (B18). Zero is a real answer here, not an empty edge case.
        dirty.push(...apply(db, kind === 'click'
          ? { ...base, kind, click_id: e['click_id'] as string, cost_cents: e['cost_cents'] as number }
          : kind === 'spend'
            ? { ...base, kind, amount_cents: e['amount_cents'] as number }
            : kind === 'conversion'
              ? { ...base, kind,
                  attributed_click_id: e['attributed_click_id'] as string,
                  value_cents: e['value_cents'] as number }
              : { ...base, kind: 'impression' }, receivedAt));
      }

      result[disposition] += 1;
      result.outcomes.push(reason === null ? { event_id: eventId, disposition }
                                           : { event_id: eventId, disposition, reason });
    }

    result.ingest_seq = seq;
    return result;
  });

  // Rolled back? `tx()` rethrew and we never get here, so `dirty` is only ever handed back for a
  // batch that committed.
  return { result, dirty };
}
