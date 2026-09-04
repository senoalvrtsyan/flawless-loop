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
import { BASE_IMPR_PER_DAY, FATIGUE, NOVELTY, SERVED_FRACTION } from './params.ts';

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

/**
 * One slot's effective frequency: `F / pool`, with §7.3's version reset applied.
 *
 * Extracted at B31b so there is **one implementation of the rule and two sources of input**. The
 * dry run feeds it the nominal accrual and the fixture's components; the live emitter feeds it `F`
 * recomputed from the signal log and the config the fold currently holds (which a
 * `swap_component` changes and the fixture does not know about). Those are two different
 * questions — what the model *would* deliver, and what it *did* — and they must not become two
 * different arithmetics.
 */
export function slotFrequency(
  version: number,
  audienceId: string,
  impressions: number,
): number {
  return versionAdjusted(impressions / pool(audienceId), version);
}

/** One ad's fatigue, given an accrual. Both slots, with §7.3's version reset on each. */
export function adFatigue(adId: string, accrual: Map<string, number>): AdFatigue {
  const ad = ADS.find((a) => a.ad_id === adId);
  if (ad === undefined) throw new Error(`${adId} is not in the seeded portfolio — §2.3`);

  const slot = (componentId: string): { f: number; phi: number } => {
    const component = COMPONENT.get(componentId);
    if (component === undefined) throw new Error(`no component ${componentId} — §2.1`);
    const F = accrual.get(pairKey(component.lineage_id, ad.audience_id)) ?? 0;
    const f = slotFrequency(component.version, ad.audience_id, F);
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

// ---------------------------------------------------------------------------------------------
// §8 — Novelty at launch. B28.
//
// It lives beside fatigue because it is the same quantity's other end: φ is what a creative loses
// to repetition and ν is what it starts with, both keyed to the pair rather than to the ad, and
// both landing on CTR alone. `a_07` carries ν 1.07 and φ 0.98; `a_01` carries ν 1.00 and φ 0.25 —
// the two ends of a creative's life on screen at the same moment (§8).

/**
 * §8's `ν(age_hours) = 1 + 0.25 · exp(−age_hours / 18)`.
 *
 * A CTR effect only, never a delivery boost. §8 states that as a deliberate simplification —
 * platforms do favour new creative during the learning phase, which would be a *volume* term — and
 * **D56** makes it structural: ν cannot enter λ, only `p_ctr`.
 */
export function novelty(ageHours: number): number {
  if (ageHours < 0) return 1 + NOVELTY.peak;
  return 1 + NOVELTY.peak * Math.exp(-ageHours / NOVELTY.timeConstantHours);
}

/**
 * Keyed by `(lineage, VERSION, audience)`, not by the ad and not by lineage alone.
 *
 * §8: novelty applies to the pair's **first exposure**, *"so a version bump gets a fresh novelty
 * window as well as §7.3's partial reset; a reused pair does not."* That last clause is the claim
 * worth having — `a_04` launching onto the `vl_01 × cold_us` pool `a_02` has already burned gets
 * no novelty at all — and it is why §3's looser `ν_novelty(age_ad, version)` notation cannot be
 * taken literally. The version is in the key because a recut is new to the platform's learning
 * phase even though §7.3 says it is not new to the audience.
 */
/**
 * A component's lineage and version. Reference data is static and seeded once (U3), so the fixture
 * is the right source even on the live path — `GET /api/sim/world` deliberately does not ship the
 * component table. A `swap_component` to a component outside `§2.1`'s library would throw here,
 * which is correct: the lever's `to_id` is validated against `components` at B13.
 */
export function componentOf(componentId: string): { lineage_id: string; version: number } {
  const component = COMPONENT.get(componentId);
  if (component === undefined) throw new Error(`no component ${componentId} — §2.1`);
  return component;
}

export function noveltyKey(lineageId: string, version: number, audienceId: string): string {
  return `${lineageId}\u0000v${version}\u0000${audienceId}`;
}

/**
 * Each novelty key's age in hours at `T0`, from §2.3's staggered launches: the pair's first
 * exposure is the EARLIEST launch among the ads that use it, so the oldest `live_days` wins.
 *
 * Frozen at `T0` for the same reason `nominalAccrual()` is (see above) — and here the freeze is
 * forced rather than chosen. ν feeds `p_ctr`, `p_ctr` decides click counts, and a click's
 * `event_id` is derived: if ν moved with wall-clock time, a restart would re-derive the same
 * `event_id` with a different click count and the re-emission would land as
 * `duplicate_conflicting` instead of `duplicate_identical`. The cost is small — ν decays 0.0023
 * over ten minutes at the 18 h constant — and B31 is where a polled world can carry a real age.
 */
export function noveltyAgesAtT0(): Map<string, number> {
  const ages = new Map<string, number>();
  for (const ad of ADS) {
    const video = COMPONENT.get(ad.video_id);
    if (video === undefined) throw new Error(`no component ${ad.video_id} — §2.1`);
    const key = noveltyKey(video.lineage_id, video.version, ad.audience_id);
    const ageHours = ad.live_days * 24;
    ages.set(key, Math.max(ages.get(key) ?? 0, ageHours));
  }
  return ages;
}

/**
 * One ad's ν. **The VIDEO slot only** — and that is a reading of §8, not an omission.
 *
 * §7.1 states a slot composition for φ (`video^1.0 × headline^0.5`); §8 states none at all, and
 * refers to *"the `(lineage, audience)` pair"* in the singular. Its worked example settles which:
 * `a_07` is quoted at **ν ≈ 1.06**, which is its video pair's age of one day. Composing over both
 * slots would give 1.075, because `hl_06 × warm_us` was first exposed two days ago by `a_11`.
 * Recorded in `BRIEF_GAPS.md` §H3 as an underspecification the doc's own arithmetic resolves.
 */
export function adNovelty(adId: string, ages: Map<string, number>): number {
  const ad = ADS.find((a) => a.ad_id === adId);
  if (ad === undefined) throw new Error(`${adId} is not in the seeded portfolio — §2.3`);
  const video = COMPONENT.get(ad.video_id);
  if (video === undefined) throw new Error(`no component ${ad.video_id} — §2.1`);
  const ageHours = ages.get(noveltyKey(video.lineage_id, video.version, ad.audience_id));
  if (ageHours === undefined) throw new Error(`no novelty age for ${adId} — §8`);
  return novelty(ageHours);
}
