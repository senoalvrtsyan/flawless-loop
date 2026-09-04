// The seven triggers, on the emitter's side — B50 / P17. `SIMULATOR.md` §17.
//
// **In-process and deliberately not durable**, exactly like `held`, `scheduled` and `accruals` in
// `index.ts`: D40-A gives the emitter no store of its own, and a scenario's *effect* is a running
// state, not a fact. The TRIGGER is durable — it is a `sim_scenarios` row, which is what makes
// §14's `(seed + decision log + sim_scenarios) -> world` true — and a restart mid-`stall` simply
// stops stalling. That is the honest behaviour and it is stated rather than worked around.
//
// **Idempotent by `scenario_id`.** The server marks a trigger consumed when it serves it, so each
// arrives once; this set is what makes that a choice rather than a requirement. If the delivery
// semantics ever move to an ack (see `sim-world.ts`'s ASSUMPTION), a re-delivery costs nothing.
//
// **Three seams, and no fourth.** A scenario reaches emission through exactly one of:
//
//   1. **a transform of `LiveAd[]`** — `fatigue_collapse` scales φ, `budget_squeeze` moves realised
//      spend into §9's taper band. Both change what the MODEL is told about the world, so the
//      resulting events are ordinary model output and `--dry-run`'s sections still describe them.
//   2. **a λ multiplier** — `traffic_burst`, applied to the Poisson mean rather than by duplicating
//      events, because duplicating would mint the same `event_id` twice and land as
//      `duplicate_identical`: ingest backpressure is the thing to demonstrate, not the dedupe path.
//   3. **direct injection** — `late_cascade`, `orphan_burst`, `duplicate_storm` put Signals into the
//      tick's batch. These are the ones that do NOT go through λ, and they say so.
//
// `stall` is none of the three: it suppresses the batch.

import type { Signal } from '../shared/types.ts';
import type { LiveAd, PendingClick } from './world.ts';
import { derivedId } from './rng.ts';

/** One trigger as the world poll delivers it. */
export type Trigger = { scenario_id: string; name: string; args_json: string; ts: string };

type Args = Record<string, number | string | undefined>;

/** A trigger with its arguments parsed, plus when this process first saw it. */
type Active = { id: string; name: string; args: Args; seenAtMs: number };

/** Triggers seen, newest last. Bounded — a demo fires a handful, not thousands. */
let active: Active[] = [];
const seen = new Set<string>();

/** How long a windowed effect lasts. §17 gives `traffic_burst` 60 s; φ and spend hold for a while. */
const BURST_MS = 60_000;
const OVERRIDE_MS = 10 * 60_000;

/**
 * Record triggers the world poll just delivered. Returns the ones that are NEW to this process,
 * so the caller can act on them once — a re-delivery is dropped here rather than fired twice.
 */
export function absorb(triggers: readonly Trigger[], nowMs: number): Active[] {
  const fresh: Active[] = [];
  for (const t of triggers) {
    if (seen.has(t.scenario_id)) continue;
    seen.add(t.scenario_id);
    let args: Args = {};
    try {
      args = JSON.parse(t.args_json) as Args;
    } catch {
      // A trigger we cannot parse is reported and skipped, never guessed at: the endpoint validated
      // it on the way in, so this can only mean the row was written by something else.
      console.error(`[sim] scenario ${t.scenario_id} (${t.name}): args_json is not JSON — skipped`);
      continue;
    }
    const entry: Active = { id: t.scenario_id, name: t.name, args, seenAtMs: nowMs };
    active.push(entry);
    fresh.push(entry);
    console.log(`[sim] scenario ${t.name} ${t.args_json}`);
  }
  // Expire anything past the longest window, so a long-running process does not accumulate.
  active = active.filter((a) => nowMs - a.seenAtMs <= OVERRIDE_MS);
  return fresh;
}

const num = (args: Args, key: string, fallback: number): number => {
  const v = args[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};

const adOf = (args: Args): string | null => (typeof args['ad_id'] === 'string' ? args['ad_id'] : null);

/** Is emission suppressed right now? §17's `stall{seconds}` — G21's detected-not-repaired. */
export function stalledUntil(nowMs: number): number | null {
  let until: number | null = null;
  for (const a of active) {
    if (a.name !== 'stall') continue;
    const end = a.seenAtMs + num(a.args, 'seconds', 30) * 1_000;
    if (end > nowMs && (until === null || end > until)) until = end;
  }
  return until;
}

/** §17's `traffic_burst{×}` — a multiplier on λ for 60 s. 1.0 when nothing is bursting. */
export function lambdaMultiplier(nowMs: number): number {
  let m = 1;
  for (const a of active) {
    if (a.name !== 'traffic_burst') continue;
    if (nowMs - a.seenAtMs > BURST_MS) continue;
    m *= num(a.args, 'multiplier', 6);
  }
  return m;
}

/**
 * Seam 1: what the model is told about the world.
 *
 * `fatigue_collapse` multiplies the pair's accumulated `F`, and §7's φ falls as `F` rises — so the
 * scenario scales φ DOWN by the multiplier rather than up. §17's watch-for is *"CTR halves within a
 * minute; the other ads sharing that lineage move too"*, and the second half falls out for free:
 * `phi_ad` was computed from a lineage-level `F` (§7.1 is version-agnostic), so an ad is identified
 * here by `ad_id` while the fatigue it stands for is shared.
 *
 * `budget_squeeze` sets realised spend to a fraction of budget, putting §9's ρ into the terminal
 * taper band — a slide, never a cliff, which is the thing the taper exists to show and the thing
 * B32 could not demonstrate live.
 */
export function applyToWorld(live: readonly LiveAd[], nowMs: number): LiveAd[] {
  if (active.length === 0) return live as LiveAd[];
  return live.map((ad) => {
    let phi = ad.phi_ad;
    let spend = ad.spend_so_far_today_cents;
    for (const a of active) {
      if (nowMs - a.seenAtMs > OVERRIDE_MS) continue;
      if (adOf(a.args) !== ad.config.ad_id) continue;
      if (a.name === 'fatigue_collapse') phi = phi / num(a.args, 'multiplier', 4);
      if (a.name === 'budget_squeeze') {
        spend = Math.round(ad.daily_budget_cents * num(a.args, 'fraction', 0.92));
      }
    }
    return phi === ad.phi_ad && spend === ad.spend_so_far_today_cents
      ? ad
      : { ...ad, phi_ad: phi, spend_so_far_today_cents: spend };
  });
}

/** What an injection produces: events now, and events to withhold until a later tick. */
export type Injection = { now: Signal[]; held: { atTick: number; signal: Signal }[] };

/**
 * Seam 3, `late_cascade{ad_id, n, min_age_h}` — **the flagship path** (§17, HR4).
 *
 * `n` conversions attributed to real clicks at least `min_age_h` old, taken from the boot-time
 * handover the emitter already holds (§15.3(b)) — clicks that genuinely happened, days back, and
 * whose buckets have long since settled. Each conversion carries its CLICK's minute as its `ts`
 * (D27-B), so it rewrites a bucket days back and, because that bucket is settled, restates it.
 *
 * **Real clicks, not invented ones**, and this is the difference between a demo and a lie: a
 * conversion citing an `attributed_click_id` that no click ever carried would be an ORPHAN, land
 * provisionally at its own minute, and restate nothing. It would look like the flagship path and be
 * the orphan path wearing its clothes.
 *
 * Returns the click ids it used so the caller can drop them from the handover — otherwise their
 * natural conversion arrives later too, and the same click converts twice.
 */
export function lateCascade(
  seed: string,
  args: Args,
  handover: readonly PendingClick[],
  nowMs: number,
  valueFor: (adId: string, clickId: string, tsMs: number) => number,
): { events: Signal[]; usedClickIds: string[] } {
  const adId = adOf(args);
  const n = Math.round(num(args, 'n', 12));
  const minAgeMs = num(args, 'min_age_h', 96) * 3_600_000;
  const cutoff = nowMs - minAgeMs;

  const candidates = handover
    .filter((c) => (adId === null || c.ad_id === adId) && Date.parse(c.ts) <= cutoff)
    // Oldest first: the further back the click, the deeper into settled territory the restatement
    // lands, and a restatement two days back is the one worth putting on camera.
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
    .slice(0, n);

  if (candidates.length === 0) {
    console.error(
      `[sim] late_cascade: no pending clicks for ${adId ?? 'any ad'} older than ${minAgeMs / 3_600_000} h — nothing emitted`,
    );
    return { events: [], usedClickIds: [] };
  }
  if (candidates.length < n) {
    // Said out loud rather than silently short: "I asked for 12 and got 3" is a fact about the
    // world's remaining in-flight population, and a quiet shortfall reads as a broken trigger.
    console.error(`[sim] late_cascade: asked for ${n}, only ${candidates.length} clicks qualify`);
  }

  const events: Signal[] = candidates.map((click, i) => ({
    // Distinct from the id `conversionFor` would mint for this click, and distinct per cascade:
    // the natural conversion may still be scheduled, and two events with one `event_id` would land
    // as `duplicate_identical` instead of as a second conversion.
    event_id: derivedId(seed, 'cascade', click.click_id, Math.floor(nowMs / 1_000), i),
    ts: click.ts,
    ad_id: click.ad_id,
    event: 'conversion',
    attributed_click_id: click.click_id,
    value_cents: valueFor(click.ad_id, click.click_id, Date.parse(click.ts)),
  }));
  return { events, usedClickIds: candidates.map((c) => c.click_id) };
}

/**
 * Seam 3, `orphan_burst{n}` — conversions whose clicks are withheld 90 s, then released (§17).
 *
 * D16's path, and §17's watch-for is *"provisional → promoted: a **two-bucket** restatement"*. Both
 * buckets move: the conversion parks provisionally at ITS OWN minute, and when the click lands the
 * promotion credits the CLICK's minute and decrements where it was parked. Two buckets, one
 * promotion — which is the direction `restatements.ts` reports as unexplained if it ever fires on
 * a settled bucket, so this trigger is also how that branch gets exercised.
 *
 * The click is dated 90 seconds in the PAST at release so the two minutes differ; a click and its
 * conversion inside one minute would promote into the same bucket and move nothing visible.
 */
export function orphanBurst(
  seed: string,
  args: Args,
  live: readonly LiveAd[],
  nowMs: number,
  tick: number,
  valueFor: (adId: string, clickId: string, tsMs: number) => number,
): Injection {
  const n = Math.round(num(args, 'n', 8));
  if (live.length === 0) {
    console.error('[sim] orphan_burst: no live ads — nothing emitted');
    return { now: [], held: [] };
  }
  const now: Signal[] = [];
  const held: { atTick: number; signal: Signal }[] = [];
  const HOLD_S = 90;

  for (let i = 0; i < n; i++) {
    const ad = live[i % live.length];
    if (ad === undefined) continue;
    const adId = ad.config.ad_id;
    const clickId = derivedId(seed, 'orphanclick', adId, tick, i);
    // The click's own time: 90 s before now, so its minute is (usually) the previous one.
    const clickTsMs = nowMs - HOLD_S * 1_000;
    now.push({
      event_id: derivedId(seed, 'orphanconv', adId, tick, i),
      ts: new Date(nowMs).toISOString(),
      ad_id: adId,
      event: 'conversion',
      attributed_click_id: clickId,
      value_cents: valueFor(adId, clickId, nowMs),
    });
    held.push({
      atTick: tick + HOLD_S,
      signal: {
        event_id: derivedId(seed, 'orphanclickev', adId, tick, i),
        ts: new Date(clickTsMs).toISOString(),
        ad_id: adId,
        event: 'click',
        click_id: clickId,
        // A click the model did not draw still costs what a click costs; zero would put a free
        // click in the spend column and make CPA disagree with the click count.
        cost_cents: 62,
      },
    });
  }
  return { now, held };
}

/**
 * Seam 3, `duplicate_storm{n}` — replays a batch (§17).
 *
 * The events are re-sent **byte-identical**, which is the whole point: §5.1's dedupe counts them as
 * `duplicate_identical` and the aggregate does not move. Mutating them would produce
 * `duplicate_conflicting`, which is a different phenomenon with a different disposition (D15/I7),
 * and dressing one up as the other on demand would be the dishonest version of this control.
 */
export function duplicateStorm(args: Args, recent: readonly Signal[]): Signal[] {
  const n = Math.round(num(args, 'n', 40));
  if (recent.length === 0) {
    console.error('[sim] duplicate_storm: nothing emitted yet this run — no batch to replay');
    return [];
  }
  return recent.slice(-n);
}
