// §9's budget pacing: throttle, never cliff. B32.
//
// Budget is a **pacing multiplier, not a cap** (I3, P11) — no fifth ad state, no
// `budget_exhausted`. Two terms, both pure functions of their inputs:
//
//   e(t) = ∫ d_c dt from the account-local day start to t  /  ∫ d_c dt over the whole day
//   a(t) = spend_so_far_today / daily_budget_cents
//
//   ρ_catchup  = clamp(1 + 3.0 · (e − a), 0.05, 1.6)     -- behind pace: speed up; ahead: throttle
//   ρ_terminal = clamp((1.05 − a) / 0.15,  0, 1)          -- the taper into the cap
//   ρ_pacing   = ρ_catchup × ρ_terminal
//
// **`e` is the expected shape of the day, not elapsed clock time**, and that is the whole point of
// the section: paced linearly, every ad front-loads its budget into the morning and goes dark
// before prime time. So `e` integrates the ad's own channel curve, which means two ads on the same
// budget and the same spend are at different points on the pacing curve if they buy different
// channels. That is §4.1's shape doing a second job.
//
// `w_dow` deliberately does NOT appear here. It is constant across a day and `e` is a ratio over
// that day, so it cancels exactly; the same is true of §12's demand factors in expectation. What
// is left is the shape alone.

import { localHour } from '../shared/time.ts';
import { diurnal } from './rate.ts';
import { PACING } from './params.ts';
import type { Channel } from '../shared/decisions.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/**
 * Resolution of the cumulative `d_c` table: one point per minute of the local day.
 *
 * Not a §21 constant and not a modelling choice — it is the discretisation of an integral §9 writes
 * in closed form but whose antiderivative needs `erf`, which the platform does not have. At one
 * minute the trapezoid error on this curve is ~1e-9 relative, far below anything the model can
 * express, and D28's minute is the finest granularity anything downstream buckets at anyway.
 */
const STEPS_PER_DAY = 24 * 60;

const cumulativeCache = new Map<Channel, Float64Array>();

/**
 * `∫ d_c` from hour 0, tabulated. Built once per channel and reused — `e` is evaluated for every
 * live ad on every tick, so this must not be a 1,440-term sum each time.
 */
function cumulative(channel: Channel): Float64Array {
  const cached = cumulativeCache.get(channel);
  if (cached !== undefined) return cached;

  const table = new Float64Array(STEPS_PER_DAY + 1);
  const step = 24 / STEPS_PER_DAY;
  let prev = diurnal(channel, 0);
  for (let i = 1; i <= STEPS_PER_DAY; i++) {
    const here = diurnal(channel, i * step);
    table[i] = (table[i - 1] ?? 0) + ((prev + here) / 2) * step;
    prev = here;
  }
  cumulativeCache.set(channel, table);
  return table;
}

/**
 * §9's `e(t)` — the fraction of the day's expected traffic that has already happened, on the
 * **account-local** day (D22/I2), for this ad's channel.
 *
 * Runs 0 at local midnight to exactly 1 at the next one, monotonically. `Z` cancels in the ratio,
 * so this is the same number whether `diurnal` normalises or not; it is left in so there is one
 * implementation of `d_c` rather than two.
 */
export function expectedElapsed(channel: Channel, atMs: number): number {
  const table = cumulative(channel);
  const total = table[STEPS_PER_DAY] ?? 1;
  const x = (localHour(atMs) / 24) * STEPS_PER_DAY;
  const i = Math.min(Math.floor(x), STEPS_PER_DAY - 1);
  const lo = table[i] ?? 0;
  const hi = table[i + 1] ?? 0;
  return (lo + (hi - lo) * (x - i)) / total;
}

/** Both terms and both inputs, so a rate can be explained rather than just applied. */
export type Pacing = {
  /** Expected traffic elapsed on the account-local day, `[0, 1]`. */
  e: number;
  /** Budget consumed. Unbounded above — an ad can be over its cap, which is the point of §9. */
  a: number;
  catchup: number;
  terminal: number;
  /** `catchup × terminal`, the factor λ carries. */
  rho: number;
};

/**
 * §9's `ρ_pacing`, from the world poll's own two numbers.
 *
 * `set_budget` moves `a` instantly because the budget is the denominator, so **raising the budget
 * raises the rate within one tick** — D26 consequence 3, and the second closable decision the loop
 * needed. Nothing here is smoothed or delayed for exactly that reason.
 *
 * A zero or negative budget cannot come from the fold, but it must not produce `NaN` if it ever
 * does: `a` goes to infinity, both terms clamp, and ρ is 0 — an ad with no budget delivers
 * nothing, which is the answer §9 would give in the limit anyway.
 */
export function pacing(
  channel: Channel,
  atMs: number,
  spendSoFarTodayCents: number,
  dailyBudgetCents: number,
): Pacing {
  const e = expectedElapsed(channel, atMs);
  const a = dailyBudgetCents > 0 ? spendSoFarTodayCents / dailyBudgetCents : Infinity;
  const catchup = clamp(1 + PACING.catchupGain * (e - a), PACING.catchupMin, PACING.catchupMax);
  const terminal = clamp((PACING.overspendTolerance - a) / PACING.terminalBand, 0, 1);
  return { e, a, catchup, terminal, rho: catchup * terminal };
}
