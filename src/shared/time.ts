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

import { ACCOUNT_TZ } from './config.ts';

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

// ---------------------------------------------------------------------------------------------
// The ACCOUNT-LOCAL clock. Moved here at B31a; landed at B25 inside `src/sim/rate.ts`.
//
// **This is a MOVE. No behaviour changes.** `d_c(h)` and `w_dow` must read exactly as they did.
//
// It moved for the reason this file exists at all. `GET /api/sim/world` owes
// `spend_so_far_today` on the **account-local** day (D22/I2, SIMULATOR §9), and the only `Intl`
// offset logic in the repo was the simulator's — so the server would have been the SECOND copy of
// a rule whose first four copies are what created this module (see the header). B20a's own note
// says B21 "would otherwise be the fourth copy"; this is the same argument one file later.
//
// `ACCOUNT_TZ` is used for exactly one thing, per `config.ts`: the day boundary at which
// `daily_budget_cents` resets and the simulator's diurnal curve turns over. Minute buckets are UTC
// and stay UTC.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const OFFSET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: ACCOUNT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * `America/New_York`'s offset from UTC at an instant, in ms — negative, since New York is behind.
 *
 * Cached per UTC hour. The offset can only change at a DST boundary, which falls on an hour, so
 * the cache is exact rather than approximate; and it has to exist, because a 24-hour dry-run calls
 * this ~1 M times and `Intl` formatting is two orders of magnitude more expensive than the
 * arithmetic around it.
 */
const offsetCache = new Map<number, number>();

function tzOffsetMs(ms: number): number {
  const bucket = Math.floor(ms / HOUR_MS);
  const hit = offsetCache.get(bucket);
  if (hit !== undefined) return hit;

  const parts = new Map(OFFSET_PARTS.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.get('year')),
    Number(parts.get('month')) - 1,
    Number(parts.get('day')),
    Number(parts.get('hour')),
    Number(parts.get('minute')),
    Number(parts.get('second')),
  );
  // Truncated to the second by `Intl`, so re-add what the instant carries below a second.
  const offset = asUtc - (ms - (((ms % 1000) + 1000) % 1000));
  offsetCache.set(bucket, offset);
  return offset;
}

/** Account-local wall-clock ms — the instant an `America/New_York` clock would read as UTC. */
export function localMs(ms: number): number {
  return ms + tzOffsetMs(ms);
}

/** Fractional hour of the account-local day, `[0, 24)`. §4.1's `h`. */
export function localHour(ms: number): number {
  const local = localMs(ms);
  return (((local % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS;
}

/** Account-local day of week, `0` = Sunday — the index `SIMULATOR.md` §4.2's `w_dow` is written against. */
export function localWeekday(ms: number): number {
  return new Date(localMs(ms)).getUTCDay();
}

/**
 * The UTC instant at which the account-local day containing `ms` began.
 *
 * What `spend_so_far_today` sums from, and what `daily_budget_cents` resets at. Derived by
 * subtracting the local fractional hour, which is exact to the millisecond — so this is one
 * subtraction rather than a second date-formatting round trip.
 *
 * **Stated limit, inherited from `config.ts`:** no DST transition falls inside a September 7-day
 * window, so the DST path is correct by construction and untested in the demo window. On a spring
 * transition the local day is 23 h and this still returns its true start, because the offset is
 * read at `ms` rather than assumed.
 */
export function localDayStartMs(ms: number): number {
  return ms - localHour(ms) * HOUR_MS;
}
