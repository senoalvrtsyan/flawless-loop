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
 * The horizons `B49`'s control offers, in hours. `72` is `HORIZON_MS` and is the first entry.
 *
 * **It lives HERE and not in `sweep.ts`, and the reason is a real defect this file's neighbour
 * caught:** `Horizon.tsx` imports this list as a VALUE, and `sweep.ts` imports `readTx` from
 * `db.ts`, which imports `node:sqlite`, `node:fs` and `node:path`. `tsc` was perfectly happy — a
 * runtime import across that boundary is not a type error — and the failure appeared only at
 * `vite build`, as `"resolve" is not exported by "__vite-browser-external"`. A constant both sides
 * of the wire need belongs in `shared/`, which is what this file is for.
 */
export const HORIZON_CHOICES_H = [72, 24, 6, 2] as const;

/**
 * `SIMULATOR.md` §11.1's hard cutoff on the purchase lag: **7 days**, beyond which no conversion is
 * emitted at all.
 *
 * It lives here rather than only in the simulator's parameters because **both sides need it**.
 * `GET /api/sim/world` answers §16's *"backfilled clicks still inside the 7-day lag window"*, so
 * the server bounds that query by it, and `src/sim/lag.ts` truncates by it. Two copies of a
 * boundary that decides which rows are handed over would diverge silently — the same argument that
 * put the account-local clock in `time.ts`.
 *
 * Distinct from `HORIZON_MS`, and the two must not be conflated: this bounds what the MODEL emits,
 * the horizon bounds when a bucket is treated as settled. §11.2's whole point is that p95 sits
 * inside the horizon while the tail crosses it.
 */
export const CONVERSION_LAG_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * **D71 — the scoring window choices, in hours.** `?window_h=` on `GET /api/scores`.
 *
 * D70's **6 h is first because it is the ratified default and the documented figure**; the rest
 * descend to a quarter hour, which is short enough that a lever pulled during a demo produces a
 * score inside it. The caption names which one a score was answered at — Seno's condition on D71,
 * because a score at 15 minutes and a score at 6 hours are different claims.
 *
 * Here rather than in `scoring.ts` for the reason G14 measured at B49: a client importing a VALUE
 * from `src/server/` drags `node:sqlite` into the bundle, and `tsc` has nothing to say about it —
 * it fails only at `vite build`.
 */
export const WINDOW_CHOICES_H = [6, 2, 1, 0.25] as const;

/** **D70's ratified `w`, in hours** — the default and the figure the README and the caption quote. */
export const SCORING_WINDOW_H = 6;

/**
 * **The fatigue flag's smoothing half-life** (`SIMULATOR.md` §19, **D20**).
 *
 * It lived in `src/web/metrics.ts` while the chart had a raw/EWMA toggle and the two shared one
 * constant on purpose, so *"the EWMA CTR"* meant one thing. **D74 deleted the toggle**, so the
 * client no longer smooths anything and a server module importing a display constant out of the
 * browser bundle would be the only thing keeping that file's smoother alive. It moves here, beside
 * the horizon and the scoring window, because it is now what it always really was: a parameter of
 * the heuristic, not of the chart.
 */
export const HALF_LIFE_MS = 15 * 60_000;
