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
