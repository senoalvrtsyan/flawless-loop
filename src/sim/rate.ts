// §3's arrival process: the rate equation, and the one stochastic draw that turns a rate into a
// count. B25.
//
// λ(ad, t) = base_impr_per_day / 86400
//          × d_channel(h_local)   -- §4.1, HERE
//          × w_dow(weekday)       -- §4.2, HERE
//          × φ_fatigue            -- §7,  B26
//          × ν_novelty            -- §8,  B28
//          × ρ_pacing             -- §9,  B32
//          × m_channel × m_ad     -- §12, B30
// N ~ NegBinomial(mean = λ, α = 8)  -- §12, HERE
//
// The factors this chunk does not own are PARAMETERS of `lambdaPerSecond`, defaulting to 1.0,
// rather than absences. A later chunk supplies one by passing it, not by editing this equation —
// which is what keeps §3's "six multiplicative factors" a single readable line here instead of a
// history of edits.

import { ACCOUNT_TZ } from '../shared/config.ts';
import { draw } from './rng.ts';
import {
  BASE_IMPR_PER_DAY,
  DIURNAL,
  DIURNAL_FLOOR,
  DIURNAL_PEAKS,
  DOW_VOLUME,
  NEGBINOMIAL_ALPHA,
} from './params.ts';
import type { Channel } from '../shared/decisions.ts';

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

/** Account-local day of week, `0` = Sunday — the index `DOW_VOLUME` is written against. */
export function localWeekday(ms: number): number {
  return new Date(localMs(ms)).getUTCDay();
}

/**
 * §4.1's `d_c(h)`. Two Gaussians on a floor, divided by the channel's `Z`.
 *
 * `Z` normalises the mean over the 24 INTEGER hours to 1.0 (verified: 0.9999–1.0001 for all four
 * channels). Sampled continuously, as a 1 s tick does, the mean lands 0.4–0.9% above 1.0 because
 * the curve is convex where it is sampled between the hours. That residual is §21's constant
 * speaking, not a bug to correct — moving `Z` would be a decision.
 */
export function diurnal(channel: Channel, hour: number): number {
  const { w1, w2, Z } = DIURNAL[channel];
  const [midday, evening] = DIURNAL_PEAKS;
  return (
    (DIURNAL_FLOOR +
      w1 * Math.exp(-((hour - midday.at) ** 2) / midday.twoSigmaSq) +
      w2 * Math.exp(-((hour - evening.at) ** 2) / evening.twoSigmaSq)) /
    Z
  );
}

/** §4.2's `w_dow`, at an instant. */
export function dowVolume(ms: number): number {
  return DOW_VOLUME[localWeekday(ms)] ?? 1;
}

export type RateFactors = {
  /**
   * §7's `φ_ad`. **Nothing passes this, on purpose.** §3's λ lists `φ_fatigue` as a factor on
   * impressions, but §7.1 calls φ "the CTR multiplier", §10 puts it in `p_ctr`, and §18.3's
   * impressions column is `base/24 × d_c` with no φ in it at all. Passing it here as well as into
   * `p_ctr` would charge fatigue twice. The field stays so that the contradiction is visible at
   * the point it matters rather than resolved by omission — DECISION #56.
   */
  phi?: number;
  /** §8's `ν` — B28. */
  nu?: number;
  /** §9's `ρ_catchup × ρ_terminal` — B32. */
  rho?: number;
  /** §12's `m_channel × m_ad` — B30. */
  demand?: number;
};

/**
 * §3's λ, in impressions per second, at an instant.
 *
 * A paused ad is NOT handled here. §3: "`λ = 0` while `status ≠ 'live'` … that is §1's stated
 * convention, not a property ingest enforces" — status lives in the world the emitter polls
 * (B31), so the caller owns it and this function stays a pure function of time.
 */
export function lambdaPerSecond(
  adId: string,
  channel: Channel,
  atMs: number,
  factors: RateFactors = {},
): number {
  const base = BASE_IMPR_PER_DAY[adId];
  if (base === undefined) throw new Error(`no base_impr_per_day for ${adId} — SIMULATOR §2.3`);
  const { phi = 1, nu = 1, rho = 1, demand = 1 } = factors;
  return (base / 86_400) * diurnal(channel, localHour(atMs)) * dowVolume(atMs) * phi * nu * rho * demand;
}

/**
 * §12's `NegBinomial(mean = λ, α = 8)`, as a Gamma–Poisson mixture: draw the tick's own rate from
 * `Gamma(α, λ/α)`, then a Poisson count at that rate. That is the mixture the negative binomial
 * IS, and it is the form that says what the overdispersion is a picture of — the rate we were
 * served at this second is itself uncertain, and more so the busier we are.
 *
 * α = 8 is an integer, so `Gamma(8, θ) = −θ · Σ ln u` over 8 uniforms exactly — no rejection
 * sampling, no library, and the draw count per tick is fixed rather than data-dependent.
 *
 * Every uniform is KEYED, per §14: addressed by `(stream, ad, tick, part)` and never pulled off a
 * sequence, so pausing one ad cannot shift another ad's draws. All of them sit inside the named
 * `impr` stream — §14's list of stream names is closed, so the extra parts disambiguate within it
 * rather than inventing a stream.
 *
 * Poisson by Knuth: `E[iterations] = g + 1`, which is fine because λ per second tops out near 1.5
 * across the seeded portfolio (`a_01` at peak). It would be the wrong algorithm at λ in the
 * hundreds; nothing in §2.3 goes there, and this comment is the tripwire if something ever does.
 */
export function negBinomial(seed: string, adId: string, tick: number, mean: number): number {
  if (mean <= 0) return 0;

  let logProduct = 0;
  for (let i = 0; i < NEGBINOMIAL_ALPHA; i++) {
    // `draw` is in [0, 1) and `log(0)` is -Infinity. One draw in 2^53 lands there; clamping it to
    // the smallest representable draw keeps the count finite instead of NaN.
    logProduct += Math.log(Math.max(draw(seed, 'impr', adId, tick, 'g', i), 2 ** -53));
  }
  const g = (-mean / NEGBINOMIAL_ALPHA) * logProduct;

  const limit = Math.exp(-g);
  let k = 0;
  let p = 1;
  for (;;) {
    p *= draw(seed, 'impr', adId, tick, 'p', k);
    if (p <= limit) return k;
    k++;
  }
}
