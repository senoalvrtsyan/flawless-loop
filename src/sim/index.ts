// The simulator. A separate OS process (D32) whose only channel into the store is
// `POST /api/ingest` — it never opens the database, and it never assigns `received_at` or
// `ingest_seq` (D12). DESIGN §11's top box, minus everything stage 3 adds.
//
// **As of B31b the emitter learns the world instead of assuming it.** It polls
// `GET /api/sim/world` once per tick (§16) and emits for every ad the FOLD says is `live`, with
// that ad's current config, φ recomputed from the signal log and ν aged from the pair's first
// exposure. A pause stops emission within one tick — HR3's *"the world responds"* — so pause
// latency is a number we state (≤ 1 tick, ≤ 1 s) rather than a behaviour we hope for.
//
// It holds no durable state of its own (D40-A, DESIGN §3.3). A cold start with no successful poll
// emits NOTHING, because an emitter that has not seen the world does not know which ads are live;
// falling back to `fixtures.ts` would deliver a config the fold may have changed.
//
// What is real as of B25 is the RATE. §3's λ now carries §4's per-channel shape of the day and its
// day-of-week weight, and the count is `NegBinomial(λ, α = 8)` rather than a constant. **As of B32
// λ's factor list is complete**: §9's ρ_pacing is the last one, and nothing is passed as 1.0 by
// absence any more (φ and ν are not on that list and never will be — D56 puts both in `p_ctr`).
// Clicks, cost and spend are B27; the conversion schedule B29; the injected misbehaviours B33; the
// 7-day backfill and the T0 seam B34 and B35.

import { derivedId } from './rng.ts';
import { lambdaPerSecond, negBinomial } from './rate.ts';
import { demand, demandFactor } from './noise.ts';
import {
  WORLD_URL,
  currentWorld,
  liveAds,
  fetchPendingClicks,
  pendingHandover,
  pollWorld,
  takeFromHandover,
  type LiveAd,
  type PendingClick,
} from './world.ts';
import {
  clicksForTick,
  converts,
  cpmAccrualCents,
  isSpendBoundary,
  orderValueCents,
  spendCents,
} from './emit.ts';
import { scheduleFor } from './lag.ts';
import { temperatureOf } from './fixtures.ts';
import { pacing } from './pacing.ts';
import { FAULT_NAMES, emptyCounts, injectFaults, type Held } from './faults.ts';
import {
  absorb,
  applyToWorld,
  duplicateStorm,
  lambdaMultiplier,
  lateCascade,
  orphanBurst,
  stalledUntil,
} from './scenarios.ts';
import { SPEND_TICK_S } from './params.ts';
import {
  arrivalProcess,
  clickAndCostPath,
  conversionLag,
  demandNoise,
  fatigue,
  localMidnightAtOrBefore,
  faultSection,
  noveltySection,
  pacingSection,
  type DryRunOptions,
} from './dry-run.ts';
import type { AdConfig, IngestResult, Signal } from '../shared/types.ts';

/**
 * The seed used for `--dry-run` ONLY.
 *
 * **The live emitter has no seed of its own — D60.** It reads `run.seed` out of every world poll,
 * so it cannot continue a seeded history under a seed that history was not generated with. That
 * failure is silent: fatigue accrued by one world and extended by another leaves every number on
 * screen plausible and the world internally incoherent.
 *
 * A dry run has no store to read, so it keeps the env override. `SIM_SEED` is therefore a
 * SEEDING-time knob (`seed-world.ts` writes what it is given) and a dry-run knob, and never an
 * emission-time one — forking a world means seeding a new store, which is the honest shape.
 */
const DRY_RUN_SEED = process.env.SIM_SEED ?? 'flawless-loop';

/**
 * The seed for THIS world, from the poll. `null` until the first successful one, which is also
 * exactly when nothing may be emitted.
 */
let SEED = '';

/** §15.1: 1 s, one batched POST per tick, 1× wall clock. */
const TICK_MS = 1_000;

/**
 * How far back boot re-emits — **60 s, ratified as D61** (2026-09-04). Every whole second in
 * `[now - CATCHUP_S, now)` is generated on start, which is what makes the plan item's restart check work: the ticks the previous process
 * already sent are re-derived byte-for-byte and land as `duplicate_identical` (§14, §16), and the
 * seconds it never reached are not lost. A gap there would be indistinguishable from the 0.2%
 * emitter-side loss §13 injects on purpose, which is the one failure the app cannot see (§6).
 *
 * One `rollup_minute` bucket (D28), so a restart re-emits at most the minute you are watching, and
 * §15.3(b) bounds the start below at `T0`. The alternative — a server-derived resume position
 * carried in the world poll, removing re-emission entirely — was put to Seno and **refused on
 * purpose**: the re-emission IS the demonstration that derived ids make restart safety free (B11
 * measured 14 `duplicate_identical`, 0 conflicting). Optimising it away would remove the evidence
 * for the property §14 exists to claim.
 */
const CATCHUP_S = 60;

/** Where ingest lives. Same default as the server's own `PORT`, so moving one moves both. */
const INGEST_URL =
  process.env.SIM_INGEST_URL ?? `http://localhost:${process.env.PORT ?? 8787}/api/ingest`;

/** Held batches are bounded. Past this the emitter says out loud that it dropped events. */
const MAX_PENDING = 10_000;

/**
 * The impressions for one whole second, identified by its unix second — an ABSOLUTE tick index,
 * not a count since boot. That is what makes the body re-derivable: a per-process counter would
 * re-derive the same `event_id` with a different `ts` on restart, which is
 * `duplicate_conflicting` — a platform correction (§5.1 step 4) — rather than a duplicate.
 */
function impressionsForTick(live: LiveAd, tick: number, lambdaScale = 1): number {
  const ad = live.config;
  // §3's λ at this second, then §12's draw. **φ and ν are not passed and never will be** — D56
  // puts both in `p_ctr` only, because fatigue changes what an impression is worth rather than how
  // many arrive. §12's two demand factors are passed (B30), and §9's ρ is passed here (B32), which
  // completes §3's factor list: nothing defaults to 1.0 by absence any more.
  //
  // **ρ is the one factor that is NOT a pure function of `t`** — it reads `spend_so_far_today` off
  // the world poll, so a tick re-derived later computes a different λ than its own emission did.
  // That is inherent to §9 (a pacer that reacts to realised spend cannot be memoryless in time) and
  // it is what **D58** decided the shape of: `ts` no longer depends on the count, so the
  // divergence can only add or drop an event at the tail, never rewrite one already sent.
  return negBinomial(
    SEED,
    ad.ad_id,
    tick,
    // **B50: `traffic_burst` scales the Poisson MEAN**, not the drawn count and not the event list.
    // Scaling the mean is the only form that stays inside §12's model — the burst is more demand,
    // so its events are ordinary events with ordinary ids. Duplicating the drawn list would mint
    // the same `event_id` twice and land as `duplicate_identical`, demonstrating the dedupe path
    // instead of the ingest backpressure §17 asks a reviewer to watch. 1.0 when nothing is bursting.
    lambdaPerSecond(ad.ad_id, ad.channel, tick * 1_000, {
      demand: demandFactor(ad.channel, ad.ad_id, tick * 1_000),
      rho: pacing(ad.channel, tick * 1_000, live.spend_so_far_today_cents, live.daily_budget_cents)
        .rho,
    }) * lambdaScale,
  );
}

/**
 * Sub-second placement — **a pure function of `(tick, i)` alone, per D58.**
 *
 * It used to spread evenly across the tick's second, dividing by the number of events in it. That
 * made every event's `ts` a function of the COUNT, so a count that came out differently on a
 * re-emission rewrote the body of events whose `event_id` was unchanged: `duplicate_conflicting`,
 * which §5.1 step 4 surfaces as a platform correction. Harmless while λ was a pure function of `t`;
 * B32's ρ is not, because it reads realised spend. Measured before the decision was put: 1.66% of
 * a catch-up's impressions would have landed conflicting at the drift `a_12` sees in §9's terminal
 * taper, against the 0.05% §13 injects on purpose.
 *
 * Indexing by millisecond instead means a count change can only APPEND at the tail or omit there —
 * never rewrite an event already sent. Nothing reads sub-second placement (D28 buckets by the
 * minute), so the even spread was the cheaper of the two properties to give up. The clamp at 999
 * keeps the event inside its own second; λ peaks near 1.5/s across the portfolio, so it is a
 * tripwire rather than a live branch.
 */
const spreadMs = (tick: number, i: number): number => tick * 1_000 + Math.min(i, 999);

/**
 * The CPM accrual of the interval currently open, per ad.
 *
 * In-process and deliberately NOT durable — D40-A's "no durable state of its own" is about state
 * that would have to survive a restart, and this does not: `FIRST_TICK` is aligned down to a spend
 * boundary, so a restart's catch-up regenerates every interval it will bill from that interval's
 * own first tick. An ad paused mid-interval loses the partial accrual it had built, which is a
 * cent or two and errs towards under-billing a paused ad — the only direction that cannot
 * fabricate a signal for an ad the fold says is not live (§13's stated non-injection).
 */
const accruals = new Map<string, { start: number; cents: number }>();

function accrue(adId: string, tick: number, cents: number): void {
  const start = Math.floor(tick / SPEND_TICK_S) * SPEND_TICK_S;
  const open = accruals.get(adId);
  if (open === undefined || open.start !== start) accruals.set(adId, { start, cents });
  else open.cents += cents;
}

/** A conversion that has been decided but not yet told to us — §11's reporting lag, in flight. */
type Scheduled = { receivedAt: number; signal: Signal };

/**
 * §11's in-flight conversions, live half. In-process and NOT durable, exactly like `held` above and
 * for the same reason: a process that dies loses them, and D40-A forbids the emitter a store.
 *
 * The backfilled half needs no queue at all — `GET /api/sim/world` hands back every backfilled
 * click still inside the cutoff whose conversion has not arrived, and this process re-derives the
 * schedule from `click_id` each tick (§15.3(b)). So the two populations differ in where the PENDING
 * SET comes from and in nothing else. The restart limit that leaves is real and bounded: a live
 * click emitted before a restart loses its conversion, because `PENDING_CLICKS_SQL` is restricted
 * to `source = 'backfill'` (B31a, deliberately — "a live click's schedule is known to the process
 * that emitted it"). Most of what a demo SEES converting is the backfilled population, which is
 * the reason §15.3(b) exists.
 */
let scheduled: Scheduled[] = [];


/**
 * The conversion a click earns, or `null` if it does not convert or the purchase falls past §11's
 * 7-day cutoff — in which case the conversion is simply lost, which is the truncation §11.2 prints.
 *
 * ONE function for both populations, and that is the seam. §15.3(b) promises a click's whole future
 * is re-derivable from its `click_id`, so the backfill generator that DROPPED an after-`T0`
 * conversion and this emitter must answer identically for the same click. Two implementations of
 * that promise is precisely how the two sides of `T0` come to disagree, with every number still
 * plausible.
 *
 * `clickTsMs` is all the caller needs to supply, including for a handed-over click, which arrives
 * as `{click_id, ad_id, ts}` and nothing else: `spreadMs` is `tick * 1000 + min(i, 999)`, so the
 * tick is the whole second and the click's index within it is the sub-second remainder. Recovering
 * both here is what lets a handed-over click produce the SAME `event_id` the generator would have.
 * Per §10 a tick carries 0-3 clicks, so the clamp cannot bind and the decode is exact.
 */
function conversionFor(ad: AdConfig, clickId: string, clickTsMs: number): Scheduled | null {
  const tick = Math.floor(clickTsMs / 1_000);
  const index = clickTsMs - tick * 1_000;
  // D62: one Bernoulli per click, keyed by `click_id` alone. Drawn at the TICK's instant, not the
  // click's, because that is what the backfill generator passes — `atMs`, not `clickTsMs`.
  if (!converts(SEED, clickId, ad, tick * 1_000)) return null;
  const schedule = scheduleFor(SEED, clickId, clickTsMs, temperatureOf(ad.audience_id));
  if (schedule === null) return null;
  return {
    receivedAt: schedule.received_at,
    signal: {
      event_id: derivedId(SEED, 'eid', ad.ad_id, tick, 'v', index),
      // D27-B's whole point: the purchase's own instant, which may be days before now. The bucket
      // this rewrites is the CLICK's, and whether that bucket had settled is decided by
      // `received_at` — which is when we POST it, not when it happened.
      ts: new Date(schedule.ts).toISOString(),
      ad_id: ad.ad_id,
      event: 'conversion',
      attributed_click_id: clickId,
      value_cents: orderValueCents(SEED, ad, schedule.ts, [clickId]),
    },
  };
}

/**
 * §15.3(b)'s seam, made to arrive: the backfilled clicks whose conversions have come due — while we
 * were running, or while nothing was running at all.
 *
 * **B35a: the handover is a list we hold and DRAIN, not a fact we re-poll.** It is fixed at `T0`
 * and only shrinks, so `world.ts` fetches it once and this removes what it emits. Re-asking the
 * server every second cost 1.96 MiB and ~62 ms a call for an answer that changes only because of
 * what we ourselves just sent.
 *
 * A click is dropped from the handover the moment its conversion is GENERATED, not when the POST
 * succeeds — a failed batch is held and coalesced by `post()`, so the event is not lost, and
 * re-generating it would only produce the same `event_id` twice.
 */
function dueBackfillConversions(
  clicks: readonly PendingClick[],
  ads: ReadonlyMap<string, AdConfig>,
  nowMs: number,
): { due: Signal[]; taken: Set<string> } {
  const due: Signal[] = [];
  const taken = new Set<string>();
  for (const click of clicks) {
    const ad = ads.get(click.ad_id);
    if (ad === undefined) continue; // an ad the fold no longer carries: nothing to attribute to
    const conversion = conversionFor(ad, click.click_id, Date.parse(click.ts));
    if (conversion === null) {
      // D62 says this click never converts, or §11's cutoff dropped it. Either way it will never
      // come due, and keeping it in the list means re-deciding that every tick forever — which is
      // ~25 of every 26 rows.
      taken.add(click.click_id);
      continue;
    }
    if (conversion.receivedAt > nowMs) continue;
    due.push(conversion.signal);
    taken.add(click.click_id);
  }
  return { due, taken };
}

function eventsForAd(live: LiveAd, tick: number, lambdaScale = 1): Signal[] {
  const ad = live.config;
  const count = impressionsForTick(live, tick, lambdaScale);
  const events: Signal[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      event_id: derivedId(SEED, 'eid', ad.ad_id, tick, i),
      // Always the second that has ALREADY closed, so `ts` is in the past and I10's skew clamp
      // never fires. A simulator running its clock ahead would have every event clamped to
      // `received_at` and collapsed into the current minute.
      ts: new Date(spreadMs(tick, i)).toISOString(),
      ad_id: ad.ad_id,
      event: 'impression',
    });
  }

  // §10's clicks. `phi_ad` and `nu` come from the POLL now, not from a constant frozen at `T0`.
  //
  // Those two are the only inputs here a restart can see differently, and the divergence is
  // bounded rather than hoped about: over a ≤2 minute catch-up, `F` moves by that window's own
  // impressions against a pool of tens of thousands, so φ shifts ~0.003% and the per-minute Beta
  // rate with it. A replayed click flips only if its uniform lies inside that band — about 3e-7 per
  // impression, so ~1e-4 across a whole catch-up. A click's BODY is unaffected either way, because
  // `cost_cents` and the CPC/CPM share are keyed by `(ad, tick, i)` and not by φ: the failure mode
  // is one extra or one missing click, never a `duplicate_conflicting`.
  const clicks = clicksForTick(SEED, ad, tick, count, {
    phiAd: live.phi_ad,
    nu: live.nu,
    mChannel: demand('channel', ad.channel, tick * 1_000),
  });
  for (const click of clicks) {
    const clickTsMs = spreadMs(tick, click.index);
    events.push({
      event_id: derivedId(SEED, 'eid', ad.ad_id, tick, 'c', click.index),
      ts: new Date(clickTsMs).toISOString(),
      ad_id: ad.ad_id,
      event: 'click',
      click_id: click.click_id,
      cost_cents: click.cost_cents,
    });
    // §11: the click's future is decided now and delivered later. A catch-up re-derives the same
    // click and schedules the same conversion, so the duplicate lands as `duplicate_identical`.
    const conversion = conversionFor(ad, click.click_id, clickTsMs);
    if (conversion !== null) scheduled.push(conversion);
  }

  // §10 / I1's `spend`: one delta per 60 s per live ad, carrying the CPM accrual of the interval
  // that has just closed. Unix seconds divisible by 60 are minute boundaries and D28 buckets by
  // the UTC minute, so `[tick − 60, tick)` is exactly one bucket and the delta lands in it.
  //
  // **The interval's accrual is ACCUMULATED as its ticks are emitted, not re-derived at the
  // boundary** — changed at B32, and forced by ρ rather than chosen. B27 re-derived all 60 seconds
  // of impressions at the boundary, which was exact only while λ was a pure function of `t`. ρ
  // reads realised spend and moves within the minute, so a re-derivation at the boundary bills a
  // different impression count than the bucket actually holds: measured at 6.3% of spend events
  // off by a cent at the drift `a_12` sees in the taper, and it billed a full minute of CPM for an
  // ad that was paused for most of it, because `impressionsForTick` does not know about status.
  // Accumulating bills exactly what was emitted, which is what HR5 asks of the money column.
  //
  // The B27 guard it replaces is now structural rather than a condition. `FIRST_TICK` is aligned
  // down to a boundary, so an interval is only ever entered at its start; an accrual whose `start`
  // is not `tick − 60` is one this process did not generate in full, and it is dropped rather than
  // billed. The failure that guard was written for — a bucket with a `spend` row and zero
  // `impression` rows — cannot be expressed here at all.
  const closed = accruals.get(ad.ad_id);
  if (isSpendBoundary(tick)) {
    accruals.delete(ad.ad_id);
    if (closed !== undefined && closed.start === tick - SPEND_TICK_S) {
      const cents = spendCents(closed.cents);
      if (cents > 0) {
        events.push({
          event_id: derivedId(SEED, 'eid', ad.ad_id, tick, 's'),
          ts: new Date((tick - 1) * 1_000).toISOString(),
          ad_id: ad.ad_id,
          event: 'spend',
          amount_cents: cents,
        });
      }
    }
  }
  accrue(ad.ad_id, tick, cpmAccrualCents(ad, count));

  return events;
}

/**
 * One tick's events across the whole portfolio.
 *
 * Every ad is generated against the SAME world snapshot, taken once per tick, so a lever landing
 * mid-tick takes effect on the next one rather than partway through this one. `live` is empty until
 * the first successful poll, and then nothing is emitted at all — see `world.ts`.
 */
function eventsForTick(tick: number, live: readonly LiveAd[], lambdaScale = 1): Signal[] {
  const events: Signal[] = [];
  for (const ad of live) events.push(...eventsForAd(ad, tick, lambdaScale));
  return events;
}

/**
 * The last whole second NOT yet generated. Boot starts it in the past; see CATCHUP_S — and
 * **aligned down to a spend interval**, which is what makes the 60 s `spend` delta exact.
 *
 * Found at B27 by reading the buckets rather than the code: unaligned, the first interval a process
 * closes is only partly its own, because `eventsForTick` RE-DERIVES all 60 seconds of an interval's
 * impressions while only emitting the ones from `nextTick` on. A cold start therefore billed a
 * whole minute of CPM against a partial minute of impressions — a bucket showing `spend 2` behind
 * 3 impressions, which is HR5's "any number walks back to the events" failing on the first minute
 * of every run.
 *
 * Aligning fixes it by construction rather than by a guard. Every interval this process closes is
 * one it generated in full, so spend and impressions agree in the same bucket. The cost is that
 * catch-up covers 60–119 s instead of exactly 60; re-emitted ticks are byte-identical (§14), so
 * the extra ones land as `duplicate_identical` and are counted, not lost. The alternative — skip
 * any interval that starts before boot — silently drops one spend delta when a process dies
 * mid-interval, and a dropped ingest is the one loss the app has no way to see.
 */
const FIRST_TICK =
  Math.floor((Math.floor(Date.now() / 1_000) - CATCHUP_S) / SPEND_TICK_S) * SPEND_TICK_S;
let nextTick = FIRST_TICK;
let pending: Signal[] = [];
/**
 * The last batch this process successfully POSTed — `duplicate_storm`'s source (B50).
 *
 * The events it replays must be ones the STORE has seen, or the "duplicate" lands as a first
 * delivery and the dedupe counters do not move: the scenario would demonstrate ingest rather than
 * §5.1's dedupe. In-process and not durable, like everything else on this side of D40-A.
 */
let lastBatch: readonly Signal[] = [];

/**
 * §13's held deliveries: duplicates waiting out their 1–20 s, reordered events, and withheld
 * clicks. In-process and not durable, for the same reason the spend accrual is not — a process
 * that dies loses them, and a lost delivery is indistinguishable from the 0.2% emitter loss §13
 * injects on purpose. The catch-up then re-derives the event, makes the SAME keyed fault decision,
 * and schedules the copy again.
 */
let held: Held[] = [];
const faultCounts = emptyCounts();
let linkUp = true;
let busy = false;

async function post(batch: readonly Signal[]): Promise<boolean> {
  try {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const body: unknown = await res.json();
    if (!res.ok) {
      console.error(`[sim] ingest returned ${res.status}: ${JSON.stringify(body)}`);
      return false;
    }
    // ANNOTATED on purpose, for the same reason the server's handler annotates its response: the
    // wire shape is invisible to `tsc` on both sides of a `fetch`, so this is the only place a
    // change to `IngestResult` can be made to fail at compile time rather than at a demo.
    const result: IngestResult = body as IngestResult;
    console.log(
      `[sim] sent ${result.received} · accepted ${result.accepted}` +
        ` · dup ${result.duplicate_identical}/${result.duplicate_conflicting}` +
        ` · rejected ${result.rejected_invalid} · ingest_seq ${result.ingest_seq}` +
        ` · injected ${FAULT_NAMES.filter((n) => faultCounts[n] > 0)
          .map((n) => `${n} ${faultCounts[n]}`)
          .join(' ')}` +
        ` · held ${held.length} · in flight ${scheduled.length}` +
        ` · handover ${pendingHandover(SEED)?.length ?? '-'}`,
    );
    return true;
  } catch (err) {
    console.error(`[sim] POST ${INGEST_URL} failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * One tick: generate every second that has closed since the last one, then send them as one batch.
 *
 * Generating up to `now` rather than advancing by one makes cold start, restart and a stalled
 * timer (a suspended laptop, a long GC) ONE code path — the same consolidation §16 states for
 * lever propagation. A failed send holds its batch and coalesces it into the next tick, which is
 * DESIGN §11's stated backpressure behaviour: the emitter never drops on the floor, because a
 * dropped ingest is the one loss the app has no way to see.
 */
async function tick(): Promise<void> {
  if (busy) return; // a slow POST must not overlap the next one, or ingest sees them out of order
  busy = true;
  try {
    // §16: polled once per tick. The poll comes FIRST so a lever pulled a moment ago is honoured
    // by the seconds this tick is about to generate — that ordering is what makes pause latency
    // "≤ 1 tick" rather than "≤ 2 ticks".
    await pollWorld();
    const world = currentWorld();
    const now = Math.floor(Date.now() / 1_000);

    // An emitter that has never seen the world emits nothing, and it must not silently swallow the
    // ticks either: `nextTick` stays where it is, so once the world arrives the catch-up delivers
    // the seconds that were missed instead of losing them.
    if (world === null) return;

    // D60: the seed comes from the world, not from this process. A store that has been migrated but
    // never seeded has no run identity, and an emitter with no seed cannot derive an `event_id` —
    // so it says so once and emits nothing, the same shape as never having polled at all.
    if (world.run === null) {
      if (SEED !== '') console.error('[sim] world has no sim_run row — nothing will be emitted');
      SEED = '';
      return;
    }
    if (SEED !== world.run.seed) {
      if (SEED !== '') console.error(`[sim] world seed changed '${SEED}' -> '${world.run.seed}'`);
      else console.log(`[sim] world seed '${world.run.seed}' · T0 ${world.run.t0}`);
      SEED = world.run.seed;
    }

    // ── B50 / P17: the scenarios ────────────────────────────────────────────────────────────
    //
    // Absorbed BEFORE `liveAds` is transformed, so a trigger that arrived on this very poll takes
    // effect on the seconds this tick is about to generate — the same ordering argument that puts
    // `pollWorld()` first for levers, and what makes the latency "≤ 1 tick" rather than "≤ 2".
    const nowMsForScenarios = Date.now();
    const fresh = absorb(world.pending_scenarios, nowMsForScenarios);

    // `stall{seconds}`: emission stops. **Nothing is generated and nothing is queued** — a stall
    // that buffered would deliver a burst on release and demonstrate backpressure instead of a
    // gap. `nextTick` is left where it is, so the missed seconds are simply not emitted, which is
    // what a real gap looks like: §6 calls it "degrades — detected, not repaired" and G21 is that
    // we can say the stream is quiet, never why.
    const stallEnd = stalledUntil(nowMsForScenarios);
    if (stallEnd !== null) {
      nextTick = now;
      return;
    }

    // Seam 1: what the model is told about the world (φ, realised spend).
    const live = applyToWorld(liveAds(world, Date.now()), nowMsForScenarios);
    // Seam 2: §12's Poisson mean, scaled for the length of a `traffic_burst`.
    const lambdaScale = lambdaMultiplier(nowMsForScenarios);

    // Seam 3: direct injection. Only for triggers NEW to this process — these fire once, unlike
    // the two seams above, which are running states re-read every tick.
    for (const trigger of fresh) {
      if (trigger.name === 'late_cascade') {
        // **The FULL pending set, re-asked** — not `pendingHandover()`, which D62 has already
        // filtered down to the clicks that will convert naturally (77 of 15,082 on the seeded
        // store). See `fetchPendingClicks`. Awaited inside the tick because a cascade is a
        // once-per-button-press event and the alternative is firing it a tick later than the
        // trigger arrived, which is the latency §17 is trying to remove.
        const candidates = await fetchPendingClicks().catch((err: unknown) => {
          console.error(`[sim] late_cascade: could not re-read the pending set: ${String(err)}`);
          return pendingHandover(SEED) ?? [];
        });
        const { events, usedClickIds } = lateCascade(
          SEED, trigger.args, candidates, nowMsForScenarios,
          (adId, clickId, tsMs) => {
            const ad = world.ads.find((a) => a.ad_id === adId);
            return ad === undefined ? 0 : orderValueCents(SEED, ad, tsMs, [clickId, 'cascade']);
          },
        );
        pending.push(...events);
        // Dropped from the handover, or the click's NATURAL conversion arrives later as well and
        // the same click converts twice — inflating the very number the cascade is demonstrating.
        if (usedClickIds.length > 0) takeFromHandover(SEED, new Set(usedClickIds));
      }
      if (trigger.name === 'orphan_burst') {
        const injection = orphanBurst(
          SEED, trigger.args, live, nowMsForScenarios, nextTick,
          (adId, clickId, tsMs) => {
            const ad = world.ads.find((a) => a.ad_id === adId);
            return ad === undefined ? 0 : orderValueCents(SEED, ad, tsMs, [clickId, 'orphan']);
          },
        );
        pending.push(...injection.now);
        held.push(...injection.held);
      }
      if (trigger.name === 'duplicate_storm') {
        // Byte-identical, from what this process actually sent — see `scenarios.ts`. A replay of
        // events we only generated would be a replay of something the store never saw.
        pending.push(...duplicateStorm(trigger.args, lastBatch));
      }
    }

    for (; nextTick < now; nextTick++) {
      // §13's injectors sit BETWEEN generation and the wire, which is where a delivery fault
      // belongs: the world produced the event, the transport is what mangles it. Nothing upstream
      // of this line knows faults exist, so `--dry-run`'s model sections measure the clean model.
      const injected = injectFaults(SEED, nextTick, eventsForTick(nextTick, live, lambdaScale), faultCounts);
      pending.push(...injected.now);
      held.push(...injected.held);
    }

    // §15.3(b)'s seam. Both halves of the in-flight population join the batch the moment their
    // reporting lag is up: the live clicks this process emitted, and the backfilled clicks the seed
    // dropped because their `received_at` fell after `T0`. A conversion carries its ORIGINAL `ts`,
    // days back if the purchase was days back, so it rewrites its click's bucket (D27-B) and — if
    // that bucket has settled — restates it. This is HR4 arriving on its own.
    const nowMs = Date.now();
    if (scheduled.length > 0) {
      const due = scheduled.filter((c) => c.receivedAt <= nowMs);
      if (due.length > 0) {
        scheduled = scheduled.filter((c) => c.receivedAt > nowMs);
        for (const c of due) pending.push(c.signal);
      }
    }
    // **D63: a conversion from a click that ALREADY HAPPENED arrives even if the ad has since been
    // paused** — so the lookup is `world.ads`, every ad the fold carries, and NOT the `live`
    // subset. §3's pause convention is a rule about λ ("a paused ad emits nothing: λ = 0"), and a
    // conversion is not drawn from λ: it is the settlement of a click already in the log, credited
    // to that click's minute (D27-B). Silencing it would delete revenue the strategist was already
    // charged for, and would take the in-flight population away from `a_12` — the one ad that has
    // to carry both the pause demo (HR3) and late attribution (HR4).
    //
    // Consequence, and the demo script owes it a sentence: a conversion can land on `a_12` seconds
    // after the pause visibly stops its impressions. §1's self-check — "the arrival count for a
    // paused ad should read zero" — is therefore PER KIND (impression, click, spend), never per ad,
    // or it reports a false failure the first time this fires.
    //
    // B35a: `null` here means the handover has not been fetched yet, which is NOT the same as
    // "none pending" — so we wait rather than concluding there is nothing to deliver.
    const handover = pendingHandover(SEED);
    if (handover !== null && handover.length > 0) {
      const { due, taken } = dueBackfillConversions(
        handover, new Map(world.ads.map((a) => [a.ad_id, a])), nowMs);
      pending.push(...due);
      takeFromHandover(SEED, taken);
    }

    // Anything whose hold has expired joins this tick's batch. Released events carry their ORIGINAL
    // `ts`, which is what makes them genuinely out of order rather than merely late-looking: D12
    // gives order to `ingest_seq`, assigned on arrival, so the store sees the inversion.
    if (held.length > 0) {
      const due = held.filter((h) => h.atTick <= nextTick);
      if (due.length > 0) {
        held = held.filter((h) => h.atTick > nextTick);
        for (const h of due) pending.push(h.signal);
      }
      if (held.length > MAX_PENDING) {
        const dropped = held.length - MAX_PENDING;
        held = held.slice(dropped);
        console.error(`[sim] DROPPED ${dropped} held deliveries — hold queue over ${MAX_PENDING}`);
      }
    }
    if (pending.length === 0) return;

    const batch = pending;
    pending = [];
    if (await post(batch)) {
      if (!linkUp) console.log('[sim] ingest reachable again');
      linkUp = true;
      // Captured AFTER the POST succeeded, for the reason in `lastBatch`'s note.
      lastBatch = batch;
      return;
    }
    if (linkUp) console.error(`[sim] holding ${batch.length} events for the next tick`);
    linkUp = false;
    pending = [...batch, ...pending];
    if (pending.length > MAX_PENDING) {
      const dropped = pending.length - MAX_PENDING;
      pending = pending.slice(dropped);
      console.error(`[sim] DROPPED ${dropped} events — held batch over ${MAX_PENDING}`);
    }
  } finally {
    busy = false;
  }
}

/**
 * `--dry-run` prints the model's own numbers and emits nothing — the verification surface every
 * stage-3 plan item's "verify by hand" column names. It exits before the live loop starts.
 *
 * `--hours N` sets the window (default 24) and `--from <iso>` its start, which otherwise is the
 * most recent account-local midnight so that the hour rows line up with §4.1's hourly table.
 */
function dryRunOptions(argv: readonly string[]): DryRunOptions | null {
  if (!argv.includes('--dry-run')) return null;
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const hoursArg = value('--hours');
  const hours = hoursArg === undefined ? 24 : Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0) throw new Error(`--hours ${hoursArg}: not a positive number`);
  const fromArg = value('--from');
  const fromMs = fromArg === undefined ? localMidnightAtOrBefore(Date.now()) : Date.parse(fromArg);
  if (!Number.isFinite(fromMs)) throw new Error(`--from ${fromArg}: not a parseable instant`);
  return { seed: DRY_RUN_SEED, hours, fromMs };
}

const dry = dryRunOptions(process.argv.slice(2));
if (dry !== null) {
  const started = Date.now();
  fatigue();
  noveltySection();
  conversionLag(dry);
  demandNoise(dry);
  const tallies = arrivalProcess(dry);
  pacingSection(dry, tallies);
  faultSection(dry);
  clickAndCostPath(dry, tallies);
  console.log(`\n[dry-run] ${((Date.now() - started) / 1_000).toFixed(1)}s · nothing was emitted\n`);
  process.exit(0);
}

console.log(
  `[sim] polling ${WORLD_URL} at ${1_000 / TICK_MS} Hz → posting to ${INGEST_URL}` +
    ` · seed from the world (D60) · §3 λ with §4 diurnal + day-of-week and §12 demand, NegBinomial(λ, α=8)` +
    ` · §9 ρ_pacing from the poll's spend-so-far · §13's ten injected misbehaviours` +
    ` · §10 clicks at p_ctr with φ and ν FROM THE LOG (D56/D57), CPM spend every ${SPEND_TICK_S}s` +
    ` · replaying from ${new Date(FIRST_TICK * 1_000).toISOString()}` +
    `\n[sim] emitting for every ad the fold says is live — a pause takes effect within one tick`,
);

const timer = setInterval(() => void tick(), TICK_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[sim] ${signal} — stopping with ${pending.length} events unsent`);
    clearInterval(timer);
    process.exit(0);
  });
}
