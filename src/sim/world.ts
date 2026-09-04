// The emitter's half of §16: poll `GET /api/sim/world` once per tick, and turn what comes back into
// the three things emission needs — who is live, what each ad's φ is, and what each ad's ν is. B31b.
//
// **This is what makes `DESIGN.md` §3.3's "the simulator holds no durable state" true rather than
// aspirational.** Before this chunk the emitter knew one hard-coded ad, ignored status, and carried
// φ and ν frozen at `T0` because it had no way to learn them. All three of those end here.
//
// The config comes from the FOLD, never from `fixtures.ts`. A `swap_component` changes `ads`, and
// the fixture does not know about it — so emitting from the fixture would deliver the old creative
// while the app showed the new one, which is the exact disagreement §16 exists to prevent.

import { componentOf, novelty, noveltyKey, pairKey, phiAd, slotFrequency } from './fatigue.ts';
import type { AdConfig, SimWorld, WorldAd } from '../shared/types.ts';

/** Where the world lives. Same default as ingest, so moving one moves both. */
export const WORLD_URL =
  process.env.SIM_WORLD_URL ?? `http://localhost:${process.env.PORT ?? 8787}/api/sim/world`;

/**
 * The last world we successfully read, and nothing else.
 *
 * Holding the last good copy makes a poll failure a **stall rather than a stop**: the emitter keeps
 * delivering the world as it last knew it, which is the honest behaviour for a platform that has
 * lost contact with its own reporting. It is also why a cold start with no successful poll emits
 * NOTHING — an emitter that has never seen the world does not know which ads are live, and
 * inventing that from fixtures is the disagreement described above.
 */
let latest: SimWorld | null = null;
let consecutiveFailures = 0;

export function currentWorld(): SimWorld | null {
  return latest;
}

/**
 * One poll. Returns true if the world was refreshed.
 *
 * Failures are logged once per outage rather than once per second: at 1 Hz a dead server would
 * otherwise bury the emitter's own output, which is the pattern B11's ingest path established.
 */
export async function pollWorld(): Promise<boolean> {
  try {
    const res = await fetch(WORLD_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // ANNOTATED on purpose, exactly as `IngestResult` is on the ingest response: the wire shape is
    // invisible to `tsc` across a `fetch`, and this is the one place a change to `SimWorld` can be
    // made to fail at compile time instead of at a demo.
    const world: SimWorld = (await res.json()) as SimWorld;
    if (consecutiveFailures > 0) {
      console.log(`[sim] world readable again after ${consecutiveFailures} failed poll(s)`);
      consecutiveFailures = 0;
    }
    latest = world;
    return true;
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures === 1) {
      console.error(
        `[sim] GET ${WORLD_URL} failed: ${err instanceof Error ? err.message : err}` +
          (latest === null
            ? ' — nothing will be emitted until it succeeds'
            : ' — holding the last world'),
      );
    }
    return false;
  }
}

/** What emission needs for one ad, all of it derived from the poll. */
export type LiveAd = {
  config: AdConfig;
  /** §7's `φ_ad`, from `F` recomputed off the log — not from the nominal accrual. */
  phi_ad: number;
  /** §8's ν, from the pair's **first exposure** in the log — not from `live_days`. */
  nu: number;
  daily_budget_cents: number;
  spend_so_far_today_cents: number;
};

/**
 * The world's deliveries, reduced to the two things emission asks of them.
 *
 * `F` is summed ACROSS versions and keyed by `pairKey(lineage, audience)`, because §7.1's accrual
 * is version-agnostic — §7.3: *"a re-edit is not new to someone who has seen the original four
 * times."* First exposure is kept PER version under `noveltyKey`, because §8's window is not:
 * a bump gets a fresh one. Both keys are `fatigue.ts`'s own, so the live path and the dry run
 * cannot disagree about what a pair is.
 */
type Delivered = {
  fByPair: Map<string, number>;
  firstExposureMs: Map<string, number>;
};

function reduceDeliveries(world: SimWorld): Delivered {
  const fByPair = new Map<string, number>();
  const firstExposureMs = new Map<string, number>();
  for (const d of world.deliveries) {
    const pair = pairKey(d.lineage_id, d.audience_id);
    fByPair.set(pair, (fByPair.get(pair) ?? 0) + d.impressions);
    firstExposureMs.set(
      noveltyKey(d.lineage_id, d.version, d.audience_id),
      Date.parse(d.first_impression_at),
    );
  }
  return { fByPair, firstExposureMs };
}

/**
 * §7.1's `φ_ad` from the log's `F`. Both slots, through the same `slotFrequency` and `phiAd` the
 * dry run uses — one implementation of the rule, two sources of input.
 *
 * A pair absent from `deliveries` has delivered nothing, so `F = 0` and φ = 1.0. On a store with no
 * seeded history that is every pair, and it is correct: nothing has been burned yet. After B34's
 * seven days of backfill these become the real figures and §7.2's table is the check.
 */
function worldPhiAd(ad: WorldAd, delivered: Delivered): number {
  const video = componentOf(ad.video_id);
  const headline = componentOf(ad.headline_id);
  const F = (lineageId: string): number =>
    delivered.fByPair.get(pairKey(lineageId, ad.audience_id)) ?? 0;
  return phiAd(
    slotFrequency(video.version, ad.audience_id, F(video.lineage_id)),
    slotFrequency(headline.version, ad.audience_id, F(headline.lineage_id)),
  );
}

/**
 * §8's ν, aged from the video pair's **first exposure in the log**.
 *
 * The video slot only, and keyed by `(lineage, version, audience)` — `BRIEF_GAPS.md` §H3 for why
 * both of those are readings of §8 rather than choices. A pair with no exposure yet is at age 0 and
 * therefore at ν's peak, which is what a genuinely new creative has.
 */
function worldNu(ad: WorldAd, delivered: Delivered, atMs: number): number {
  const video = componentOf(ad.video_id);
  const firstMs = delivered.firstExposureMs.get(
    noveltyKey(video.lineage_id, video.version, ad.audience_id),
  );
  if (firstMs === undefined) return novelty(0);
  return novelty(Math.max(0, (atMs - firstMs) / 3_600_000));
}

/**
 * The ads that should be emitting, with their current φ and ν.
 *
 * **Status is the gate, and §3 says whose job it is:** *"A paused ad emits nothing: `λ = 0` while
 * `status ≠ 'live'`. That is §1's stated convention, not a property ingest enforces."* So it is
 * enforced here, at the only place that knows — and `rate.ts` stays a pure function of time.
 *
 * `draft` and `archived` are excluded by the same test rather than by name: the question is whether
 * an ad is live, not which of the other three states it is in.
 */
export function liveAds(world: SimWorld, atMs: number): LiveAd[] {
  const delivered = reduceDeliveries(world);
  const out: LiveAd[] = [];

  for (const ad of world.ads) {
    if (ad.status !== 'live') continue;
    out.push({
      config: ad,
      phi_ad: worldPhiAd(ad, delivered),
      nu: worldNu(ad, delivered, atMs),
      daily_budget_cents: ad.daily_budget_cents,
      spend_so_far_today_cents: ad.spend_so_far_today_cents,
    });
  }
  return out;
}
