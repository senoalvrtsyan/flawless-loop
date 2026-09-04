// §7's creative fatigue — **D35 option C**, and the centre of the simulator.
//
// Fatigue accrues to the **(component lineage × audience) pair**, not to the ad. That one choice is
// what makes three of the brief's questions facts about the data rather than sentences in a README:
// the same video is burned on one audience and fresh on another AT THE SAME INSTANT; reuse across
// two ads drains one pool faster than either would alone; and a component swap resets one slot only,
// so the CTR discontinuity is explained by `config_generations` and by nothing else.
//
// Frequency-driven and not calendar-driven, for a reason worth keeping (§7.1): calendar decay says
// an audience tires of an ad it is not being shown, which would quietly burn a PAUSED ad and
// undermine the pause demo. Frequency also makes `set_budget` a fatigue lever for free — double the
// budget and you burn the creative twice as fast.

import { AUDIENCES, COMPONENTS, ADS } from './fixtures.ts';
import { BASE_IMPR_PER_DAY, FATIGUE, SERVED_FRACTION } from './params.ts';

const AUDIENCE_SIZE = new Map(AUDIENCES.map((a) => [a.audience_id, a.est_size]));
const COMPONENT = new Map(COMPONENTS.map((c) => [c.component_id, c]));

/**
 * `(lineage, audience)` as one map key. NUL-joined, as `rng.ts` joins its key parts and for the
 * same reason: no id can contain it, so two different pairs cannot collide into one accrual.
 */
export function pairKey(lineageId: string, audienceId: string): string {
  return `${lineageId}\u0000${audienceId}`;
}

export function readPairKey(key: string): { lineage_id: string; audience_id: string } {
  const [lineage_id = '', audience_id = ''] = key.split('\u0000');
  return { lineage_id, audience_id };
}

/**
 * §6: `pool(A) = est_size(A) × served_fraction(A)` — the people the platform actually serves us,
 * which is the denominator that governs frequency.
 */
export function pool(audienceId: string): number {
  const size = AUDIENCE_SIZE.get(audienceId);
  const fraction = SERVED_FRACTION[audienceId];
  if (size === undefined || fraction === undefined) {
    throw new Error(`no pool for ${audienceId} — SIMULATOR §2.2, §6`);
  }
  return size * fraction;
}

/** §7.1's `φ(f) = 0.25 + 0.75 · exp(−0.35 · f)`. The CTR multiplier, floored, never zero. */
export function phi(f: number): number {
  return FATIGUE.floor + FATIGUE.span * Math.exp(-FATIGUE.k * f);
}

/** §7.1's slot composition: `φ_ad = φ(f_video)^1.0 · φ(f_headline)^0.5`. */
export function phiAd(fVideo: number, fHeadline: number): number {
  return phi(fVideo) ** FATIGUE.videoExponent * phi(fHeadline) ** FATIGUE.headlineExponent;
}

/**
 * §7.1's rest: a creative not being shown recovers, `F ← F · 2^(−Δt_idle / 5 days)`.
 *
 * **The spec says this two ways and they differ by `ln 2`.** §7.1 writes `F ← F · exp(−Δt_idle/τ)`
 * with `τ = 5-day half-life`, which as a formula is a time CONSTANT of 5 days — a half-life of
 * 3.47 d. §21, D35's ratified rationale, `CHEATSHEET.md` and `BRIEF_GAPS.md` all say "5-day
 * half-life". Four statements of the quantity against one notation slip, so the half-life is what
 * is implemented and the discrepancy is raised rather than absorbed — `BRIEF_GAPS.md` §S.
 *
 * Nothing calls this yet: an ad can only be idle if it is paused, and the emitter does not learn
 * status until `GET /api/sim/world` (B31). The dry run prints the curve so it is evidence rather
 * than an untested claim.
 */
export function rest(F: number, idleMs: number): number {
  if (idleMs <= 0) return F;
  return F * 2 ** (-idleMs / FATIGUE.recoveryHalfLifeMs);
}

/**
 * §7.3: a new version is not a new creative. Accrual is keyed by LINEAGE, so v2 inherits v1's
 * frequency — a re-edit is not new to someone who has seen the original four times — but a version
 * bump grants a partial reset, `f × (1 − r)` with `r = 0.35`.
 */
export function versionAdjusted(f: number, version: number): number {
  return version > 1 ? f * (1 - FATIGUE.versionReset) : f;
}

/**
 * §7.1's `F(L, A)`: impressions of lineage `L` delivered to audience `A`, over EVERY ad that used
 * the pair — computed nominally, as `base_impr_per_day × days live`, for both slots of every ad.
 *
 * **This is the projection, not the measurement.** §7.1's `F` is a sum over impressions actually
 * delivered, and `GET /api/sim/world` (B31) recomputes it from the signal log, which is the figure
 * that will drive live emission. What this function reproduces is the arithmetic §7.2's table was
 * calibrated with, so that table can be checked against the model exactly.
 *
 * `extraDays` advances every live ad's history past `T0` at its nominal rate. It exists because the
 * live emitter has no `F` of its own before B31 and no `T0` before B34, and 0 is the honest
 * default: `a_12` accrues 20,000/day into a 96,000 pool, so `f` moves 0.21/day and φ falls about
 * 1.5% per day. Over a demo of minutes, freezing φ at its `T0` value costs less than the rounding
 * in the table it is checked against — while inventing a `T0` here would pre-empt B34.
 */
export function nominalAccrual(extraDays = 0): Map<string, number> {
  const F = new Map<string, number>();
  for (const ad of ADS) {
    const base = BASE_IMPR_PER_DAY[ad.ad_id];
    if (base === undefined) throw new Error(`no base_impr_per_day for ${ad.ad_id} — §2.3`);
    const impressions = base * (ad.live_days + extraDays);
    for (const componentId of [ad.video_id, ad.headline_id]) {
      const component = COMPONENT.get(componentId);
      if (component === undefined) throw new Error(`no component ${componentId} — §2.1`);
      const key = pairKey(component.lineage_id, ad.audience_id);
      F.set(key, (F.get(key) ?? 0) + impressions);
    }
  }
  return F;
}

export type AdFatigue = {
  f_video: number;
  f_headline: number;
  phi_video: number;
  phi_headline: number;
  /** §7.1's `φ_ad` — the multiplier that actually enters §3's λ and §10's `p_ctr`. */
  phi_ad: number;
};

/** One ad's fatigue, given an accrual. Both slots, with §7.3's version reset on each. */
export function adFatigue(adId: string, accrual: Map<string, number>): AdFatigue {
  const ad = ADS.find((a) => a.ad_id === adId);
  if (ad === undefined) throw new Error(`${adId} is not in the seeded portfolio — §2.3`);
  const denominator = pool(ad.audience_id);

  const slot = (componentId: string): { f: number; phi: number } => {
    const component = COMPONENT.get(componentId);
    if (component === undefined) throw new Error(`no component ${componentId} — §2.1`);
    const F = accrual.get(pairKey(component.lineage_id, ad.audience_id)) ?? 0;
    const f = versionAdjusted(F / denominator, component.version);
    return { f, phi: phi(f) };
  };

  const video = slot(ad.video_id);
  const headline = slot(ad.headline_id);
  return {
    f_video: video.f,
    f_headline: headline.f,
    phi_video: video.phi,
    phi_headline: headline.phi,
    phi_ad: phiAd(video.f, headline.f),
  };
}
