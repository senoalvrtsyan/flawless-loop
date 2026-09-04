// The timestamp invariant, in ONE place. B20a.
//
// Four copies of this existed before this module: ingest's `toISOString()` round-trip (B05),
// `apply()`'s regex (B06), snapshot's inline canonicalise-and-snap (B07), and B19/B20's
// `settledAt` arithmetic. B21's settlement sweep would have been the fifth, which is why B20a
// is inserted immediately before it (`BUILD_PLAN.md` §14, the B07 finding).
//
// **This is a MOVE. No behaviour changes.** Every §14 timestamp case must behave exactly as it did:
// the same four ingest reject classes, the same bucketing, the same snapping, the same
// offset rejections.
//
// THE INVARIANT: every instant that reaches the store is canonical ISO-8601 UTC at millisecond
// precision — exactly what `new Date().toISOString()` renders. Not a style preference. `ts_effective`
// is `MIN(ts, received_at)` evaluated by SQLite over TEXT, and SQLite's `MIN` on TEXT is
// LEXICOGRAPHIC: `MIN('…09:00:00.500Z', '…09:00:00Z')` returns the `.500Z` value, which is the
// LATER instant. Same-shape strings make byte order chronological order, and the whole class of
// problem disappears — which is also what lets `minute_start` be compared and range-scanned as TEXT.
//
// THE ASYMMETRY, and it is deliberate: **the write side REJECTS what is not canonical; the read
// side CANONICALISES.** A window bound is a query — the caller may reasonably write
// `?from=2026-09-03T12:00:00Z` — but `signals.ts` is a fact, recorded as emitted and never altered.
// Do not "unify" the two directions: rejecting a bound would break the API, and normalising a `ts`
// would silently rewrite what a source told us.

const MINUTE_MS = 60_000;

/**
 * Canonical ISO-8601 UTC, millisecond precision — exactly `new Date().toISOString()`.
 *
 * The round-trip is the check, not a regex: a regex admits `2026-02-30T00:00:00.000Z`, which has
 * the right shape and is not a date.
 *
 * Loosened — a `Z`-less or second-precision `ts` let through — the event is ACCEPTED, `ts_effective`
 * silently takes the later instant, and B24's sweep re-derives from that same column and agrees
 * with itself. Our own emitter only ever sends the canonical form, so neither the sweep nor hand
 * verification can see it: the definition of a wrong answer that is invisible.
 */
export function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/**
 * An ISO instant carrying an EXPLICIT UTC offset: `Z`, `±HH:MM`, or `±HHMM`.
 *
 * Without one, JS parses the string as LOCAL time: `2026-09-03T12:00:00` resolved to
 * `08:00:00.000Z` on the machine this was found on (`Asia/Yerevan`), returned zero buckets, and
 * would resolve to a different instant on a reviewer's laptop (the B07 finding). The regex fixes
 * the SHAPE only — `25:00:00Z` matches it and is still not a time, so callers parse afterwards.
 */
export const HAS_EXPLICIT_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Floor a canonical ISO instant to its minute: `2026-09-04T12:03:45.678Z` -> `…T12:03:00.000Z`.
 *
 * String surgery, not a `Date` round-trip, because every timestamp reaching a projection is
 * already canonical — ingest rejects anything else — and `MIN()` of two canonical strings is
 * canonical. Keeping `minute_start` in the same shape is what makes `ix_rollup_time`'s range
 * queries and `ts_effective` comparisons byte-order == time-order.
 *
 * Throws rather than coercing: a non-canonical value arriving here means the ingest boundary was
 * bypassed, and bucketing it anyway would write a projection row nothing can find again.
 */
export function floorMinute(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
    throw new Error(`floorMinute: '${iso}' is not canonical ISO — a non-canonical value reached a
projection, which means the ingest boundary was bypassed`);
  }
  return `${iso.slice(0, 17)}00.000Z`;
}

/**
 * Snap an instant (in ms) DOWN to its minute, as canonical ISO. The read side's half of the rule.
 *
 * A multiple of 60 000 ms always renders `…:00.000Z`, so the output is canonical by construction.
 * Snapping is not cosmetic: `'…12:00:00Z' > '…12:00:00.000Z'` because `'Z'` (0x5A) sorts after
 * `'.'` (0x2E), so an unsnapped canonical bound compares byte order instead of time order and
 * skips the minute it names — and a bound INSIDE a minute over-counts at `to` and under-counts at
 * `from`, the same event landing on both sides.
 */
export const floorToMinute = (ms: number): string =>
  new Date(Math.floor(ms / MINUTE_MS) * MINUTE_MS).toISOString();

/** Snap an instant (in ms) UP to its minute. `[from, to)` is half-open, so `to` rounds outward. */
export const ceilToMinute = (ms: number): string =>
  new Date(Math.ceil(ms / MINUTE_MS) * MINUTE_MS).toISOString();

/**
 * Canonicalise an instant that carries an explicit offset — the read side's counterpart to
 * `isCanonicalIso`'s rejection. Returns `null` if it has no explicit offset or is not a date, so
 * a caller cannot mistake a failure for an epoch instant.
 */
export function toCanonicalIso(value: unknown): string | null {
  if (typeof value !== 'string' || !HAS_EXPLICIT_OFFSET.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** One minute, in ms. Exported so the settlement arithmetic does not re-type `60_000`. */
export { MINUTE_MS };
