// Account-level constants that both sides of the wire have to agree on. B21.
//
// Two values live here, and they are here rather than inlined because each has more than one
// reader and a second copy of either is a number on screen that disagrees with another number on
// screen — with nothing to raise.

/**
 * The lateness horizon — **72 h** (**D13**), fixed, displayed, and adjustable.
 *
 * A bucket is `live` until it has been closed this long, then `settled`. Arrivals past it are
 * stored, attributed and counted in a separate tally, and excluded from headline numbers — never
 * dropped. **P16 (B49) is the control that shortens it**, which re-evaluates settlement across the
 * affected range: with 72 h and 7 days of backfill, backfilled buckets are already settled and
 * live buckets never reach settlement inside a demo, so shortening it is the only way to cause a
 * restatement on camera (F2). That it is one constant read from one place is what makes B49 a
 * settlement sweep rather than a hunt.
 */
export const HORIZON_MS = 72 * 60 * 60 * 1000;

/**
 * The account timezone — **`America/New_York`** (**D22/I2**), used for exactly ONE thing: the day
 * boundary at which `daily_budget_cents` resets and the simulator's diurnal curve turns over.
 *
 * Minute buckets are UTC and stay UTC. With US audiences a UTC day would roll the budget in the
 * middle of the afternoon peak, and the resulting discontinuity would be an artifact of our clock
 * rather than a property of the domain. Computed with built-in `Intl`, no dependency.
 *
 * **Stated limit:** no DST transition falls inside a September 7-day window, so the DST path is
 * correct by construction and untested in the demo window (DESIGN §5.3).
 */
export const ACCOUNT_TZ = 'America/New_York';
