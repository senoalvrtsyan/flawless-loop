// §10's consequences: impressions are the only primary arrival, and clicks, cost, conversions and
// spend all follow from them. B27.
//
//   p_ctr       = ctr_base(temperature) × ctr_mult(channel) × φ_ad × ν      -- §10
//   clicks      ~ BetaBinomial(N, p_ctr, κ = 200)
//   p_cvr       = cvr(temperature) × cvr_mult(channel) × dow_cvr
//   order value ~ LogNormal(median = order_value(temperature) × dow_aov, σ = 0.6)
//
// **φ and ν enter here and nowhere else — D56.** §3's λ once listed both, which would have charged
// fatigue twice, as φ² on clicks; the impression rate carries the day's shape, the budget and
// demand, and fatigue changes what an impression is worth rather than how many arrive.
//
// Two things §10 states that are easy to get backwards, so they are stated here too. **Fatigue and
// novelty touch CTR only, never CVR** — someone tired of an ad clicks less, and the ones who still
// click want the product just as much; the alternative is defensible and we did not take it.
// And **conversions are not emitted at click time**: they are scheduled (§11), which is B29. What
// this file computes about a conversion is its probability and its value, for the dry run.

import { draw, derivedId } from './rng.ts';
import { AUDIENCES } from './fixtures.ts';
import {
  CHANNEL,
  DEMAND,
  DOW_CVR,
  DOW_ORDER_VALUE,
  NOISE,
  SPEND_TICK_S,
  TEMPERATURE,
} from './params.ts';
import { localWeekday } from '../shared/time.ts';
import type { AdFixture } from './fixtures.ts';

const TEMPERATURE_OF = new Map(AUDIENCES.map((a) => [a.audience_id, a.temperature]));

/** The audience's temperature row, or a loud failure — never a default. */
function temperatureOf(audienceId: string): { ctr: number; cvr: number; cpcMult: number; orderValueMedianCents: number } {
  const temperature = TEMPERATURE_OF.get(audienceId);
  const row = temperature === undefined ? undefined : TEMPERATURE[temperature];
  if (row === undefined) throw new Error(`no temperature row for ${audienceId} — SIMULATOR §2.2, §6`);
  return row;
}

/**
 * `BetaBinomial(n, p, κ)` by its Pólya-urn representation: `a = pκ`, `b = (1−p)κ`, and each trial
 * succeeds with probability `(a + successes) / (a + b + trials so far)`.
 *
 * Exact, and it needs `n` uniforms and no Gamma or normal sampler — the alternative,
 * `Beta(a,b)` via two Marsaglia–Tsang Gammas, needs a rejection loop and a normal deviate for a
 * result that is identical in distribution. It also makes the κ → ∞ limit visibly Binomial, which
 * is the sanity check a reader will want.
 *
 * **Now used for CONVERSIONS only.** The click path moved to a per-minute rate at D57 (see
 * `clicksForTick`), because the urn's overdispersion enters through `(n−1)/(κ+1)` — exactly zero at
 * `n = 1` — and per-tick counts are 0–3, so κ did nothing at all.
 *
 * **κ = 60 is still inert for conversions, and moving it would not help.** A conversion draw is
 * over one tick's CLICKS, which is 0 or 1 for every seeded ad; but even lifted to the minute the
 * count stays 0–1, so persisting the rate across a minute changes nothing measurable. It would take
 * an hour-wide window to give κ = 60 any effect, and that is a further modelling decision about
 * where cohort-rate uncertainty lives, not a fix. Stated as a limit in `BUILD_PLAN.md` §14.
 */
export function betaBinomial(
  seed: string,
  stream: string,
  parts: readonly (string | number)[],
  n: number,
  p: number,
  kappa: number,
): number {
  if (n <= 0) return 0;
  const a = p * kappa;
  const b = (1 - p) * kappa;
  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (draw(seed, stream, ...parts, i) < (a + successes) / (a + b + i)) successes++;
  }
  return successes;
}

/**
 * A standard normal deviate by Box–Muller, from two keyed uniforms. `u1` is clamped off zero
 * because `log(0)` is `-Infinity`; one draw in 2^53 lands there and the clamp keeps the result
 * finite rather than `NaN`.
 */
function normal(seed: string, stream: string, parts: readonly (string | number)[]): number {
  const u1 = Math.max(draw(seed, stream, ...parts, 'n1'), 2 ** -53);
  const u2 = draw(seed, stream, ...parts, 'n2');
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * `Gamma(shape, 1)` by Marsaglia–Tsang, keyed. The rejection loop is addressed by an attempt index
 * rather than pulled off a sequence, so the draw stays a pure function of its key (§14).
 *
 * Shapes below 1 use the standard boost, `Gamma(a) = Gamma(a+1) · u^(1/a)`, which is needed here:
 * the smallest `p_ctr · κ` in the seeded portfolio is `a_04`'s 0.63.
 *
 * Acceptance is ~95% at these shapes, so the loop almost never runs twice; the cap exists so a
 * pathological key cannot spin forever, and it throws rather than returning a quiet fallback.
 */
function gamma(seed: string, stream: string, parts: readonly (string | number)[], shape: number): number {
  if (shape < 1) {
    const boost = draw(seed, stream, ...parts, 'boost');
    return gamma(seed, stream, [...parts, 'shifted'], shape + 1) * Math.max(boost, 2 ** -53) ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 64; attempt++) {
    const z = normal(seed, stream, [...parts, attempt]);
    const v = (1 + c * z) ** 3;
    if (v <= 0) continue;
    const u = Math.max(draw(seed, stream, ...parts, attempt, 'u'), 2 ** -53);
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v;
  }
  throw new Error(`gamma(${shape}) did not converge in 64 attempts — key ${parts.join('/')}`);
}

/**
 * `Beta(a, b)` as `X / (X + Y)` with `X ~ Gamma(a)`, `Y ~ Gamma(b)`. The standard construction, and
 * the only place this file samples a *rate* rather than a count.
 */
export function beta(
  seed: string,
  stream: string,
  parts: readonly (string | number)[],
  a: number,
  b: number,
): number {
  const x = gamma(seed, stream, [...parts, 'a'], a);
  const y = gamma(seed, stream, [...parts, 'b'], b);
  return x / (x + y);
}

/** `LogNormal(median, σ)` — parameterised by its MEDIAN, as §10 and §11 write it, not its mean. */
export function logNormal(
  seed: string,
  stream: string,
  parts: readonly (string | number)[],
  median: number,
  sigma: number,
): number {
  return median * Math.exp(sigma * normal(seed, stream, parts));
}

/** §10's `p_ctr`. `phiAd` is §7's, `nu` is §8's and defaults to 1.0 until B28 supplies it. */
export function pCtr(ad: AdFixture, phiAd: number, nu = 1): number {
  const channel = CHANNEL[ad.channel];
  return temperatureOf(ad.audience_id).ctr * channel.ctrMult * phiAd * nu;
}

/**
 * §10's `p_cvr`. **No φ and no ν** — §10 is explicit that fatigue and novelty touch CTR only.
 * `dow_cvr` is §4.2's second curve: weekends are browsier, so fewer people convert.
 */
export function pCvr(ad: AdFixture, atMs: number): number {
  const channel = CHANNEL[ad.channel];
  return (
    temperatureOf(ad.audience_id).cvr * channel.cvrMult * (DOW_CVR[localWeekday(atMs)] ?? 1)
  );
}

/** §10's order value: `LogNormal(median = order_value(temperature) × dow_aov, σ = 0.6)`, in cents. */
export function orderValueCents(
  seed: string,
  ad: AdFixture,
  atMs: number,
  parts: readonly (string | number)[],
): number {
  const median =
    temperatureOf(ad.audience_id).orderValueMedianCents * (DOW_ORDER_VALUE[localWeekday(atMs)] ?? 1);
  return Math.round(logNormal(seed, 'value', parts, median, NOISE.orderValueSigma));
}

export type ClickDraw = { click_id: string; cost_cents: number; index: number };

/**
 * The clicks one tick's impressions produce, each with the cost it carries.
 *
 * §5's pricing mix decides that cost per click: a click on the **CPC share** carries
 * `cpc_base(channel) × cpc_mult(temperature) × LogNormal(σ = 0.35) × m_channel^0.6`, and a click on
 * the **CPM share** carries **zero**, because those impressions were already charged for by the
 * `spend` path. The share is drawn per click rather than assigned per impression, which keeps
 * §10's `clicks ~ BetaBinomial(N, p_ctr, κ)` literally one draw over all `N`; per-impression
 * assignment would split it into two draws and change the distribution for no gain.
 *
 * `m_channel` is held at 1.0 — **B30** — so the demand coupling that §12 attaches to CPC
 * (*"competition raises price and volume pressure together"*) is absent by name, not by omission.
 */
export type ClickFactors = {
  /** §7's `φ_ad` (B26). */
  phiAd: number;
  /** §8's `ν` (B28). 1.0 means "no novelty left", which is what an old pair genuinely has. */
  nu?: number;
  /** §12's `m_channel` (B30) — CPC only, raised to `cpcDemandExponent`. Never touches `p_ctr`. */
  mChannel?: number;
};

export function clicksForTick(
  seed: string,
  ad: AdFixture,
  tick: number,
  impressions: number,
  factors: ClickFactors,
): ClickDraw[] {
  const { phiAd, nu = 1, mChannel = 1 } = factors;

  // §12's click rate, drawn ONCE PER MINUTE and held across the minute's ticks — D57.
  //
  // §10 writes `clicks ~ BetaBinomial(N, p_ctr, κ)` per tick, and as written κ does nothing:
  // the urn's overdispersion enters through `(N−1)/(κ+1)`, exactly zero at `N = 1`, and per-tick
  // `N` is 0–3. Drawing `p` per minute and taking `Binomial(N_tick, p)` on each of the minute's
  // ticks makes the minute's total exactly `BetaBinomial(N_minute, p_ctr, κ)` — the same
  // distribution §10 names, at the granularity D28 buckets and D20 gates on — while keeping
  // clicks emitted in the same second as their impressions. Ratified in Seno's words: *"draw the
  // click rate on that same schedule … so §12's 'the rate is uncertain, not just the count' is
  // true of the data instead of only of the doc."*
  //
  // The minute is `DEMAND.stepMs` and not a constant of its own, because "that same schedule" is
  // the point: one grid for every per-minute rate modulation in the model.
  const minute = Math.floor((tick * 1000) / DEMAND.stepMs);
  const pMean = pCtr(ad, phiAd, nu);
  const pMinute = beta(
    seed,
    'ctr',
    [ad.ad_id, minute, 'rate'],
    pMean * NOISE.clickKappa,
    (1 - pMean) * NOISE.clickKappa,
  );

  // `Binomial(N_tick, p)` as `N` keyed Bernoulli trials. Summed over the minute's ticks these are
  // `Binomial(N_minute, p)` exactly, because `p` is the same for all of them.
  let count = 0;
  for (let i = 0; i < impressions; i++) {
    if (draw(seed, 'ctr', ad.ad_id, tick, i) < pMinute) count++;
  }

  const channel = CHANNEL[ad.channel];
  const cpcMult = temperatureOf(ad.audience_id).cpcMult;
  const clicks: ClickDraw[] = [];
  for (let i = 0; i < count; i++) {
    const onCpcShare = draw(seed, 'cpc', ad.ad_id, tick, 'share', i) < channel.cpcShare;
    // §12 couples CPC to channel demand at `m_channel^0.6`, and that coupling is the row's point:
    // competition raises price and volume pressure TOGETHER, so a busy hour is also a dear one.
    // The exponent is below 1 because price responds less than volume does.
    const median =
      channel.cpcBaseCents * cpcMult * mChannel ** NOISE.cpcDemandExponent;
    const cost = onCpcShare
      ? Math.max(1, Math.round(logNormal(seed, 'cpc', [ad.ad_id, tick, i], median, NOISE.cpcSigma)))
      : 0;
    clicks.push({
      // E3/G17: a `click_id` distinct from the `event_id`, derived so a conversion can reference it
      // before it is emitted — which is what makes B29's schedule re-derivable rather than queued.
      click_id: derivedId(seed, 'cid', ad.ad_id, tick, i),
      cost_cents: cost,
      index: i,
    });
  }
  return clicks;
}

/**
 * The CPM charge one tick's impressions accrue, in **fractional** cents.
 *
 * `impressions × cpm_share × cpm_base / 1000`. The share is applied to the aggregate rather than
 * drawn per impression, which is what D52's ratified budget baseline does
 * (`fixtures.ts`: `impressions/day × cpm_share / 1000 × cpm_base`) — a pricing mix is a billing
 * split, not a coin flip, and drawing it would put noise on twelve ratified budget figures.
 *
 * **Fractional on purpose.** `a_12` accrues ~2.7 cents a minute; rounding each second would floor
 * ~60 sub-cent values to zero and lose most of the charge with nothing to show it happened. The
 * caller carries the remainder — see `spendDelta`.
 */
export function cpmAccrualCents(ad: AdFixture, impressions: number): number {
  const channel = CHANNEL[ad.channel];
  return (impressions * (1 - channel.cpcShare) * channel.cpmBaseCents) / 1000;
}

/**
 * §21/**I1**'s 60-second `spend` delta, in whole cents. Sixty seconds rather than five minutes so
 * that minute buckets have a spend figure of their own (§10).
 *
 * **Rounded per interval, with no carry, and that is deliberate.** A running remainder would make
 * the delta depend on the emitter's history, so a restart mid-interval would re-derive the same
 * `event_id` with a different `amount_cents` — `duplicate_conflicting`, a platform correction
 * (§5.1 step 4), rather than the `duplicate_identical` §14 promises. Keeping it a pure function of
 * the interval keeps re-emission byte-identical, which is worth more than the sub-cent.
 *
 * Rounding is unbiased here because the accrual is `impressions × a fixed fractional rate`
 * (0.195 cents/impression on `meta_feed`, 0.272 on `snap_stories`), and `impressions` is an integer
 * that moves every minute — so the fractional part is spread across `[0,1)` rather than pinned. The
 * dry run measures the residual against the unrounded sum rather than asserting this.
 *
 * A channel on a 100% CPC mix accrues nothing and gets `0` — the caller emits no event at all
 * rather than a zero-value one. §10's *"spend ticks carry fees only"* on the CPC share is
 * unimplementable: no fee parameter exists anywhere in §21, and D52's ratified baseline computes
 * every seeded budget with no fee term. Named as a limit in `BRIEF_GAPS.md` §H2 rather than filled
 * in with an invented constant.
 */
export function spendCents(accruedCents: number): number {
  return Math.round(accruedCents);
}

/** Whether a tick closes a 60-second spend interval — the tick AFTER the boundary owns the delta. */
export function isSpendBoundary(tick: number): boolean {
  return tick % SPEND_TICK_S === 0;
}
