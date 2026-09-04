// §12's two autocorrelated demand factors — **D37**. B30.
//
//   m_channel(t)  log-AR(1), τ = 45 min, stationary sd 0.18   platform traffic and auction pressure
//   m_ad(t)       log-AR(1), τ = 20 min, stationary sd 0.25   platform-side creative rotation
//
// Ratified in Seno's words, and the reason there are two rather than one: *"channel-level moves ads
// together, ad-level is idiosyncratic, and the fact that you can't immediately tell which one
// you're looking at is a real property of the domain — it's also the honest basis for the fatigue
// flag's 'can't separate this from a platform delivery change' limit."*
//
// What the autocorrelation buys on the READ side (§12) is the reason it is worth this much code:
// because bursts *persist*, EWMA smoothing has a real lag-versus-variance tradeoff instead of a
// free lunch, which is what lets §19 state its limits honestly rather than hypothetically.
//
// §12 also warns off the alternative it is easy to reach for: uniform jitter on a smooth curve is
// detectable in one glance, because the mean is a visible spline and the residuals have no volume
// dependence, no persistence and no source.

import { draw } from './rng.ts';
import { DEMAND } from './params.ts';

/**
 * **Why this is an innovation SUM and not an accumulator.**
 *
 * AR(1) is defined recursively — `log m(t) = ρ · log m(t−Δ) + ε` — so the obvious implementation
 * keeps a running value. That would be wrong here, and not subtly: `m` multiplies λ, λ decides how
 * many impressions a tick emits, and an impression's `event_id` is DERIVED from its tick and index
 * (§14). A stateful `m` re-derives differently after a restart, so the same `event_id` would come
 * back carrying a different tick population — `duplicate_conflicting`, a platform correction, on
 * every re-emitted second. B11's entire catch-up design rests on re-emission being byte-identical.
 *
 * So `m` has to be a pure function of `t`, and the recursion unrolls into the sum it is equivalent
 * to: `log m(t) = Σ_{k≥0} ρ^k · ε_{t−k}`, with each `ε` a keyed draw addressed by its own step
 * index. Truncating the sum is what makes it finite.
 *
 * **Why Δ = 60 s.** §12 fixes `τ` and the stationary sd but says nothing about the sampling
 * interval, and the cost of the sum is `O(τ/Δ)`: at Δ = 1 s the truncation needs ~12,400 terms per
 * tick per entity, which is ~25 ms of hashing for one second of one ad. At Δ = 60 s it is 225 and
 * 100 terms, evaluated once a minute and cached. 60 s is also **D28's bucket**, so "demand varies
 * minute to minute" lines up with the granularity the store aggregates at and the UI shows, rather
 * than being a number chosen to be affordable.
 *
 * **ASSUMPTION (unratified):** Δ = 60 s. Blocks nothing; needs sign-off before **B34**, where the
 * seed bakes seven days of these factors into ~1.6M events.
 */
type DemandKind = 'channel' | 'ad';

const SPEC: Record<DemandKind, { stream: string; tauMs: number; sd: number }> = {
  channel: { stream: 'm_channel', tauMs: DEMAND.channel.tauMs, sd: DEMAND.channel.sd },
  ad: { stream: 'm_ad', tauMs: DEMAND.ad.tauMs, sd: DEMAND.ad.sd },
};

/**
 * Per-kind constants, derived once. `ρ = exp(−Δ/τ)` is §12's own formula.
 *
 * `epsilonSd` is the innovation sd, and it **corrects for the truncation exactly**. A sum cut at
 * `K` terms carries `Σ_{k<K} ρ^{2k}` of variance per unit innovation variance, so `sd / sqrt(that)`
 * puts the stationary sd at exactly `sd` for ANY `K` — it tends to §12's `sd · sqrt(1 − ρ²)` as
 * `K → ∞`. Getting this right matters more than picking a large `K`: it means truncation can only
 * affect the far tail of the autocorrelation, never the width of the distribution, and the width is
 * what every downstream number is sensitive to.
 */
const DERIVED: Record<
  DemandKind,
  { rho: number; epsilonSd: number; terms: number; drift: number }
> = (() => {
  const out = {} as Record<
    DemandKind,
    { rho: number; epsilonSd: number; terms: number; drift: number }
  >;
  for (const kind of ['channel', 'ad'] as const) {
    const { tauMs, sd } = SPEC[kind];
    const rho = Math.exp(-DEMAND.stepMs / tauMs);
    const terms = Math.ceil((DEMAND.memoryTaus * tauMs) / DEMAND.stepMs);
    // Σ_{k<K} ρ^{2k} — the variance the truncated sum carries per unit innovation variance.
    const retained = (1 - rho ** (2 * terms)) / (1 - rho ** 2);
    const epsilonSd = sd / Math.sqrt(retained);
    // **D57**: the drift that makes `E[m] = 1` exactly. See `demand()`.
    out[kind] = { rho, epsilonSd, terms, drift: sd ** 2 / 2 };
  }
  return out;
})();

/** The constants, exposed so the dry run can print them beside the measured values. */
export function demandConstants(kind: DemandKind): {
  rho: number;
  epsilonSd: number;
  terms: number;
  drift: number;
  tauMs: number;
  sd: number;
} {
  return { ...DERIVED[kind], tauMs: SPEC[kind].tauMs, sd: SPEC[kind].sd };
}

/** The step index an instant falls in. Absolute, like the emitter's tick — never a count since boot. */
export function stepIndex(atMs: number): number {
  return Math.floor(atMs / DEMAND.stepMs);
}

/**
 * Both standard normals of one Box–Muller pair, from two keyed uniforms.
 *
 * The pair index is `step >> 1` and its two outputs serve steps `2p` and `2p+1` — cos and sin of
 * the same draw are independent standard normals, which is the property that makes this sound. The
 * sum below walks consecutive steps, so it consumes both and `K` innovations cost `K` draws rather
 * than `2K`.
 *
 * Returning one value per call and discarding the other is the version to avoid: it looks like this
 * optimisation while delivering none of it, which is how it was first written here.
 */
function innovationPair(
  seed: string,
  stream: string,
  entityId: string,
  pair: number,
): [number, number] {
  const u1 = Math.max(draw(seed, stream, entityId, pair, 'n1'), 2 ** -53);
  const u2 = draw(seed, stream, entityId, pair, 'n2');
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

/**
 * The seed, read lazily on first use rather than captured at import: `index.ts` owns the
 * `SIM_SEED` constant and the dry run imports this module too, so reading it here keeps the two in
 * agreement without either importing the other. Constant for the life of the process either way.
 */
let cachedSeed: string | null = null;
function seed(): string {
  cachedSeed ??= process.env.SIM_SEED ?? 'flawless-loop';
  return cachedSeed;
}

/**
 * `(entity, step)` → `m`. Bounded, because access is monotone in `step` for both callers — a tick
 * reads the current minute, never an old one — so dropping the whole map costs a recomputation and
 * never a wrong value. Unbounded, it would grow by sixteen entries a minute forever.
 */
const CACHE_LIMIT = 4_096;
const cache = new Map<string, number>();

/**
 * `m(t)` for one entity — the multiplicative demand factor, `exp` of the AR(1) in log space.
 *
 * Cached per `(entity, step)`, which is what makes the per-second caller affordable: a tick reads
 * the same value 60 times and the sum runs once.
 *
 * Note the entity is a CHANNEL id for `m_channel` and an AD id for `m_ad` — that asymmetry is the
 * whole point of having two factors, since one key is shared by every ad on the channel and the
 * other is not.
 */
export function demand(kind: DemandKind, entityId: string, atMs: number): number {
  const step = stepIndex(atMs);
  const key = `${kind}\u0000${entityId}\u0000${step}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size >= CACHE_LIMIT) cache.clear();

  const { stream } = SPEC[kind];
  const { rho, epsilonSd, terms, drift } = DERIVED[kind];
  let logM = 0;
  let weight = 1;
  // Walks innovations DOWNWARD from `step`, so each Box–Muller pair is fetched once and both of
  // its values are used. `step` is a unix-minute index, so it never goes negative here.
  let heldPair = -1;
  let even = 0;
  let odd = 0;
  for (let k = 0; k < terms; k++) {
    const index = step - k;
    const pair = index >> 1;
    if (pair !== heldPair) {
      [even, odd] = innovationPair(seed(), stream, entityId, pair);
      heldPair = pair;
    }
    logM += weight * ((index & 1) === 0 ? even : odd);
    weight *= rho;
  }
  // **D57, ratified 2026-09-04: `− drift` is what makes `E[m] = 1` exactly.**
  //
  // `log m` is a zero-mean sum, so without this `E[m] = exp(sd²/2)` — 1.0163 on the channel factor
  // and 1.0317 on the ad factor, **1.0486 together**. §12 fixes the stationary sd and leaves the
  // mean unstated, but §2.3's `Impr/day` column and §18.3's impressions both read
  // `base_impr_per_day` as the mean, and §4.1 normalises `Z` for exactly that reason.
  //
  // The bias was worth correcting rather than documenting because of where it lands. In Seno's
  // words: *"D52's pacing baselines were computed against base_impr_per_day, so a systematic
  // +4.86% doesn't just inflate a column — it runs every ad ~5% hot against budget for seven
  // seeded days and ρ_catchup × ρ_terminal throttles to compensate, landing on a_08 and a_12, the
  // two ads D52 already flagged."*
  //
  // Nothing else moves: the stationary sd, ρ and the autocorrelation are untouched, because this is
  // a constant shift in log space.
  const value = Math.exp(epsilonSd * logM - drift);
  cache.set(key, value);
  return value;
}

/** §3's `m_channel(t) × m_ad(t)`, the pair as λ consumes them. */
export function demandFactor(channel: string, adId: string, atMs: number): number {
  return demand('channel', channel, atMs) * demand('ad', adId, atMs);
}
