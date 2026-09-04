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
import { apply } from './apply.ts';
import type { Disposition, IngestResult, SignalKind, SignalSource } from '../shared/types.ts';

/** Kinds this build ingests. B12 widens it; until then the rest are rejected, not ignored. */
const SUPPORTED: readonly SignalKind[] = ['impression'];

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
 */
function isCanonicalIso(value: unknown): value is string {
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

  // Impression carries no money fields at all (the schema's fourth CHECK says the same thing).
  for (const field of ['cost_cents', 'amount_cents', 'value_cents']) {
    if (e[field] !== undefined) return `impression_has_${field}`;
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
export function ingest(
  db: DatabaseSync,
  raw: readonly unknown[],
  source: SignalSource,
  now: (index: number) => string = () => new Date().toISOString(),
): IngestResult {
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
    INSERT INTO signals (event_id, ingest_seq, received_at, ts, ad_id, kind, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING ts_effective
  `);
  const highWater = db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS seq FROM signals');

  return tx(db, () => {
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
      const reason = validate(element);

      let disposition: Disposition;
      if (reason !== null) {
        disposition = 'rejected_invalid';
      } else if ((findSignal.get(eventId) as { event_id: string } | undefined) !== undefined) {
        // Seen before. Same payload is a benign at-least-once redelivery; a different payload is
        // the only channel a platform correction could reach us through (G43), so it is kept and
        // counted — but the first write still wins (D15/I7).
        const prior = findDelivery.get(eventId) as { payload_hash: string } | undefined;
        disposition = prior?.payload_hash === hash ? 'duplicate_identical' : 'duplicate_conflicting';
      } else {
        disposition = 'accepted';
      }

      insertDelivery.run(eventId, receivedAt, body, hash, disposition);

      if (disposition === 'accepted') {
        const e = element as Record<string, unknown>;
        seq += 1;
        const kind = e['event'] as SignalKind;
        const stored = insertSignal.get(
          eventId, seq, receivedAt, e['ts'] as string, e['ad_id'] as string, kind, source,
        ) as { ts_effective: string };

        // Same transaction, immediately: D29's incremental upsert. A reader can never observe a
        // signal whose bucket has not moved (DESIGN §11), and a late arrival is just an event
        // whose bucket happens to be old — restatement stops being a subsystem (§4.3).
        apply(db, {
          event_id: eventId, ingest_seq: seq, ts_effective: stored.ts_effective,
          ad_id: e['ad_id'] as string, kind,
        }, receivedAt);
      }

      result[disposition] += 1;
      result.outcomes.push(reason === null ? { event_id: eventId, disposition }
                                           : { event_id: eventId, disposition, reason });
    }

    result.ingest_seq = seq;
    return result;
  });
}
