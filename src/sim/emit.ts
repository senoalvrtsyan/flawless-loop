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
  DOW_CVR,
  DOW_ORDER_VALUE,
  NOISE,
  SPEND_TICK_S,
  TEMPERATURE,
} from './params.ts';
import { localWeekday } from './rate.ts';
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
 * **What κ does at a 1-second tick: nothing measurable.** The urn's overdispersion enters through
 * `(n−1)/(κ+1)`, so at `n = 1` it is exactly zero and at `n = 2` it is 0.5%. Per-tick `N` across
 * the seeded portfolio is 0–3, so §10's `κ = 200` is very nearly a no-op as written, and §12's
 * *"the rate is uncertain, not just the count"* is not delivered at this granularity — the rate
 * would have to persist across a window for that. §10 is implemented as written; the dispersion
 * behaviour is **B30**'s chunk and its verify ("variance/mean grows with λ") is where this belongs.
 * Recorded in `BUILD_PLAN.md` §14 because it is invisible: nothing errors, κ simply does nothing.
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
export function clicksForTick(
  seed: string,
  ad: AdFixture,
  tick: number,
  impressions: number,
  phiAd: number,
  nu = 1,
): ClickDraw[] {
  const count = betaBinomial(
    seed,
    'ctr',
    [ad.ad_id, tick],
    impressions,
    pCtr(ad, phiAd, nu),
    NOISE.clickKappa,
  );

  const channel = CHANNEL[ad.channel];
  const cpcMult = temperatureOf(ad.audience_id).cpcMult;
  const clicks: ClickDraw[] = [];
  for (let i = 0; i < count; i++) {
    const onCpcShare = draw(seed, 'cpc', ad.ad_id, tick, 'share', i) < channel.cpcShare;
    const cost = onCpcShare
      ? Math.max(
          1,
          Math.round(
            logNormal(seed, 'cpc', [ad.ad_id, tick, i], channel.cpcBaseCents * cpcMult, NOISE.cpcSigma),
          ),
        )
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
