// The simulator's parameters. SIMULATOR.md §21 — "every constant, in one place, so it can be
// inspected as evidence" — transcribed, not derived.
//
// NOTHING here is a choice. Every number is quoted from a ratified table, and the section it comes
// from is named beside it, because §21's whole purpose is to be checked against by hand. If a
// constant this file needs is absent from the spec, that is a gap to raise (CLAUDE.md §8), never a
// number to pick.
//
// The file grows by chunk rather than landing whole: B25 takes the arrival process's constants,
// and the fatigue pool (B26) and the channel/temperature matrices (B27) append their own columns.
// What is here is what something already reads.

import type { Channel } from '../shared/decisions.ts';

/**
 * §4.1's per-channel shape of the day. Two Gaussians on a floor of 0.30 — a midday peak at 13:00
 * (σ 3.2 h) and an evening one at 20:30 (σ 2.0 h) — with `w1`/`w2` deciding which one the platform
 * leans on. `Z` normalises each curve to mean 1.0 so `base_impr_per_day` means what it says.
 *
 * The channel changing the SHAPE and not just the level is the point (§4.1): TikTok's 4.8×
 * peak-to-trough is what makes D20's granularity ladder step during the day instead of sitting on
 * one rung.
 */
export const DIURNAL: Readonly<Record<Channel, { w1: number; w2: number; Z: number }>> = {
  meta_feed: { w1: 0.85, w2: 0.45, Z: 0.6719 },
  meta_reels: { w1: 0.45, w2: 0.85, Z: 0.6164 },
  tiktok_feed: { w1: 0.35, w2: 1.05, Z: 0.6220 },
  snap_stories: { w1: 0.30, w2: 1.00, Z: 0.5956 },
};

/** §4.1's two Gaussians, as `(centre hour, 2σ²)`. `2·3.2² = 20.48` and `2·2.0² = 8.0`, per §21. */
export const DIURNAL_PEAKS = [
  { at: 13.0, twoSigmaSq: 20.48 },
  { at: 20.5, twoSigmaSq: 8.0 },
] as const;

/** §4.1's floor: the 0.30 an ad delivers at 03:00 regardless of either peak. */
export const DIURNAL_FLOOR = 0.30;

/**
 * §4.2's volume curve, indexed by `Date.getUTCDay()` — 0 = Sunday. Weekends are quieter.
 *
 * §4.2's other two curves (CVR ×0.90, order value ×1.05 on Sat/Sun) are deliberately NOT here:
 * they are the second phenomenon, they belong to the conversion path, and they land with it (B27).
 * Collapsing them into this row is the mistake §4.2 exists to warn against.
 */
export const DOW_VOLUME: readonly number[] = [
  0.93, // Sun
  0.96, // Mon
  1.00, // Tue
  1.02, // Wed
  1.03, // Thu
  0.98, // Fri
  0.88, // Sat
];

/**
 * §12's overdispersion parameter: `NegBinomial(λ, α = 8)` gives `Var/mean = 1 + λ/α`, so variance
 * grows WITH volume — the empirical signature of served traffic, and the reason D20's gate has
 * something to protect against (§3).
 */
export const NEGBINOMIAL_ALPHA = 8;

/**
 * §2.3's `Impr/day` column — the `base_impr_per_day(ad)` of §3's λ.
 *
 * It is a parameter of the emitter and NOT a fact about the ad: there is no such column in `ads`,
 * no lever sets it, and the fold cannot produce it. Same reasoning that kept `served_fraction` out
 * of `fixtures.ts` (§2.2) — a fixture is a decision payload, this is a model constant.
 */
export const BASE_IMPR_PER_DAY: Readonly<Record<string, number>> = {
  a_01: 75_000,
  a_02: 45_000,
  a_03: 22_000,
  a_04: 18_000,
  a_05: 26_000,
  a_06: 14_000,
  a_07: 6_000,
  a_08: 65_000,
  a_09: 5_000,
  a_10: 16_000,
  a_11: 18_000,
  a_12: 20_000,
};

/**
 * §6's `served_fraction` — the correction the arithmetic forced, **RATIFIED** 2026-09-03.
 *
 * Keyed by AUDIENCE, not by temperature, even though §21 prints it in the temperature table: that
 * table carries two `cold` rows distinguished only by "(lookalike)", and §6's own definition is
 * `pool(A) = est_size(A) × served_fraction(A)` — a function of the audience. Keying it by
 * temperature would need a second key to tell the two cold rows apart, which is the audience again.
 *
 * It is the fraction of a targeted audience the platform ACTUALLY serves us at our bid, not the
 * fraction the targeting allows. §6 keeps the story: modelling it as reachable-audience put `a_02`
 * at φ 0.94 after seven days — a 6% CTR decline, which is not a fatigue curve. Delivery
 * concentrates on the responsive slice, which is why frequency climbs faster than audience size
 * suggests and why retargeting burns out first.
 */
export const SERVED_FRACTION: Readonly<Record<string, number>> = {
  cold_us: 0.04,
  cold_us_lookalike: 0.06,
  warm_us: 0.25,
  rt_us: 0.70,
};

/**
 * §7's fatigue constants — **D35**, option C, with both parameters ratified 2026-09-03.
 *
 * `floor` is 0.25 and not 0: a burned-out creative still gets clicked occasionally, and a floor of
 * zero would make a fatigued ad emit no clicks at all, so its CTR would be undefined rather than
 * bad (§7.1).
 *
 * `headlineExponent` is 0.5 and not 0, in Seno's ratified words: *"Copy does wear out, just slower
 * than video, and zeroing it would mean the headline swap lever changes nothing observable."*
 *
 * `recoveryHalfLifeMs` — see `rest()` in `fatigue.ts` for why this is a half-life rather than the
 * time constant §7.1's formula reads as.
 */
export const FATIGUE = {
  /** §7.1's `k` in `φ(f) = floor + span · exp(−k·f)`. */
  k: 0.35,
  floor: 0.25,
  span: 0.75,
  /** §7.1's slot composition: `φ_video^1.0 × φ_headline^0.5`. */
  videoExponent: 1.0,
  headlineExponent: 0.5,
  /** §21's `τ_rec` — 5 days, idle only. */
  recoveryHalfLifeMs: 5 * 86_400_000,
  /** §7.3's `r`: `f_effective(new version) = f × (1 − r)`. A recut recovers a third of the pool. */
  versionReset: 0.35,
} as const;

/**
 * §5's channel matrix. TikTok earns clicks and does not convert them; Meta feed converts; Snap is
 * cheap and weak on both.
 *
 * `cpcShare` is §5's pricing mix, and it is what makes the brief's **two cost paths** both real.
 * L79-80 keeps them disjoint — *"`spend` — non-click charges (CPM, fees); disjoint from click costs
 * — total spend = sum of both"* — so the mix decides where an ad's cost arrives from: on the CPC
 * share a click carries `cost_cents`, on the CPM share cost accrues per impression and is emitted
 * as a `spend` delta while those impressions' clicks carry `cost_cents = 0`. A 20/80 channel
 * therefore exercises the `spend` path almost exclusively and a 70/30 channel the click path, both
 * in one demo, and *total spend* stays a read-time sum of the two (D10) rather than a third column.
 *
 * Money is in **cents**, integer at the boundary: `cpmBaseCents` is the charge per 1,000
 * impressions, `cpcBaseCents` the charge per click before the temperature multiplier.
 */
export const CHANNEL: Readonly<
  Record<Channel, { ctrMult: number; cvrMult: number; cpcShare: number; cpmBaseCents: number; cpcBaseCents: number }>
> = {
  meta_feed: { ctrMult: 1.00, cvrMult: 1.00, cpcShare: 0.70, cpmBaseCents: 650, cpcBaseCents: 62 },
  meta_reels: { ctrMult: 0.85, cvrMult: 0.90, cpcShare: 0.50, cpmBaseCents: 520, cpcBaseCents: 48 },
  tiktok_feed: { ctrMult: 1.20, cvrMult: 0.75, cpcShare: 0.30, cpmBaseCents: 410, cpcBaseCents: 35 },
  snap_stories: { ctrMult: 0.70, cvrMult: 0.65, cpcShare: 0.20, cpmBaseCents: 340, cpcBaseCents: 30 },
};

/**
 * §6's temperature matrix. Retargeting costs more per click and is worth it; cold is cheap and
 * converts badly; order value rises with intent.
 *
 * §6 is explicit that there is **no decay-rate column**: the fatigue constant `k` is global and the
 * *pool* does the work (§7), so retargeting burns out roughly 50× faster than cold as a consequence
 * of the model rather than as a parameter anyone can dispute.
 *
 * `p_fast` — §11's lag mixture weight, which is also keyed by temperature — is deliberately absent
 * until B29 reads it. This file holds what something reads.
 */
export const TEMPERATURE: Readonly<
  Record<string, { ctr: number; cvr: number; cpcMult: number; orderValueMedianCents: number }>
> = {
  cold: { ctr: 0.011, cvr: 0.018, cpcMult: 0.85, orderValueMedianCents: 4_200 },
  warm: { ctr: 0.024, cvr: 0.055, cpcMult: 1.00, orderValueMedianCents: 5_800 },
  retargeting: { ctr: 0.042, cvr: 0.150, cpcMult: 1.35, orderValueMedianCents: 7_600 },
};

/**
 * §4.2's OTHER two day-of-week curves, indexed like `DOW_VOLUME`. Weekends are quieter *and*
 * browsier: fewer people convert, and those who do spend slightly more.
 *
 * These are separate from `DOW_VOLUME` because §4.2 insists they are two phenomena — collapsing
 * them into one volume curve would lose the second effect, which is the one that shows up in ROAS
 * rather than in impressions.
 */
export const DOW_CVR: readonly number[] = [0.90, 1.00, 1.00, 1.00, 1.00, 1.00, 0.90];
export const DOW_ORDER_VALUE: readonly number[] = [1.05, 1.00, 1.00, 1.00, 1.00, 1.00, 1.05];

/**
 * §12's remaining stochastic parameters — the ones attached to the click and cost path.
 *
 * `clickKappa` and `conversionKappa` are BetaBinomial concentrations: the *rate* is uncertain, not
 * just the count, and the conversion rate is thinner (60 vs 200) so cohort ratios are the noisy
 * ones. `cpcSigma`'s `m_channel^0.6` coupling is the point of the CPC row — competition raises
 * price and volume pressure together — and lands with `m_channel` at B30.
 */
export const NOISE = {
  clickKappa: 200,
  conversionKappa: 60,
  orderValueSigma: 0.6,
  cpcSigma: 0.35,
  /** §12: CPC is multiplied by `m_channel^0.6`. B30 supplies `m_channel`; the exponent lives here. */
  cpcDemandExponent: 0.6,
} as const;

/** §21 / **I1**: `spend` is emitted as a delta per 60-second interval per live ad. */
export const SPEND_TICK_S = 60;

/**
 * §8's novelty. `ν(age_hours) = 1 + 0.25 · exp(−age_hours / 18)` — +25% CTR in the first minutes,
 * ~4% left after two days.
 *
 * A **CTR effect only, not a delivery boost**, which §8 states as a deliberate simplification:
 * platforms do also favour new creative during the learning phase, and that would be a volume term.
 * D56 makes the same point structurally — ν never enters λ.
 */
export const NOVELTY = { peak: 0.25, timeConstantHours: 18 } as const;

/**
 * §11's conversion lag — **D36**, a two-component mixture plus a separate reporting lag.
 *
 * The two lags are kept apart because collapsing them would corrupt our own telemetry (**I18**,
 * ratified): `received_at − ts` has to describe US, not the buyer. Purchase lag is what drives
 * restatement; reporting lag is what `received_at − ts` measures.
 *
 * `p_fast` is a property of audience temperature (§6, §11.1) rather than a fitted knob, so the
 * mixture weight carries domain meaning: an intent-heavy cohort matures faster.
 */
export const P_FAST: Readonly<Record<string, number>> = {
  cold: 0.30,
  warm: 0.45,
  retargeting: 0.65,
};

export const LAG = {
  /** Fast component: `Exponential(mean 12 min)`. */
  fastMeanMs: 12 * 60_000,
  /** Slow component: `LogNormal(median 14 h, σ = 1.1)`. */
  slowMedianMs: 14 * 3_600_000,
  slowSigma: 1.1,
  /** §11.1: truncated hard at 7 days — nothing is emitted beyond it. */
  cutoffMs: 7 * 86_400_000,
  /** Reporting lag: `LogNormal(median 90 s, σ = 0.9)`. */
  reportMedianMs: 90_000,
  reportSigma: 0.9,
  /** Plus, with probability 0.02, a batch straggler `Uniform(2 h, 9 h)`. */
  stragglerProbability: 0.02,
  stragglerMinMs: 2 * 3_600_000,
  stragglerMaxMs: 9 * 3_600_000,
} as const;

/**
 * §12's two autocorrelated demand factors. `m_channel` moves every ad on a channel TOGETHER —
 * platform-wide traffic and auction pressure — while `m_ad` is idiosyncratic creative rotation.
 *
 * Ratified in Seno's words, and the reason there are two: *"channel-level moves ads together,
 * ad-level is idiosyncratic, and the fact that you can't immediately tell which one you're looking
 * at is a real property of the domain — it's also the honest basis for the fatigue flag's 'can't
 * separate this from a platform delivery change' limit."*
 *
 * `stepMs` is NOT in §12, which fixes `τ` and the stationary sd but leaves the sampling interval
 * free. See `noise.ts` for why it has to exist and why it is 60 s.
 *
 * **RATIFIED 2026-09-04 (D57): `stepMs = 60_000`.** In Seno's words: *"τ/Δ of 45 and 20 resolves
 * the autocorrelation fully and nothing observable is finer than D28's minute bucket."*
 *
 * D57 also settled the drift that makes `E[m] = 1` — see `noise.ts`.
 */
export const DEMAND = {
  stepMs: 60_000,
  channel: { tauMs: 45 * 60_000, sd: 0.18 },
  ad: { tauMs: 20 * 60_000, sd: 0.25 },
  /**
   * How many steps of innovation history the memory-free sum keeps, in time constants. At five τ
   * the truncated sum holds 1 − exp(−10) of the stationary variance; the innovation sd is rescaled
   * so what remains is exact regardless, and the dry run measures the realised autocorrelation.
   */
  memoryTaus: 5,
} as const;
