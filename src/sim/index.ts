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
// day-of-week weight, and the count is `NegBinomial(λ, α = 8)` rather than a constant. The factors
// that are still absent are passed as 1.0 by name rather than left out, each on its own plan item:
// fatigue (B26), novelty (B28), pacing (B32), the two AR(1) demand factors (B30). Clicks, cost and
// spend are B27; the conversion schedule B29; the injected misbehaviours B33; the 7-day backfill
// and the T0 seam B34 and B35.

import { derivedId } from './rng.ts';
import { lambdaPerSecond, negBinomial } from './rate.ts';
import { demand, demandFactor } from './noise.ts';
import { WORLD_URL, currentWorld, liveAds, pollWorld, type LiveAd } from './world.ts';
import type { AdConfig } from '../shared/types.ts';
import { clicksForTick, cpmAccrualCents, isSpendBoundary, spendCents } from './emit.ts';
import { SPEND_TICK_S } from './params.ts';
import {
  arrivalProcess,
  clickAndCostPath,
  conversionLag,
  demandNoise,
  fatigue,
  localMidnightAtOrBefore,
  noveltySection,
  type DryRunOptions,
} from './dry-run.ts';
import type { IngestResult, Signal } from '../shared/types.ts';

/**
 * The world seed. No design document fixes a VALUE — §14 only fixes the formula — so this is the
 * `(seed + decision log + scenario log) → world` claim's first term, held as a constant so it is
 * stable across restarts, and overridable for a forked run.
 *
 * ASSUMPTION (unratified): a code constant rather than a row in the store. Blocks nothing now;
 * needs sign-off at B34, where the seed path makes it load-bearing for reproducibility.
 */
const SEED = process.env.SIM_SEED ?? 'flawless-loop';

/** §15.1: 1 s, one batched POST per tick, 1× wall clock. */
const TICK_MS = 1_000;

/**
 * How far back boot re-emits. Every whole second in `[now - CATCHUP_S, now)` is generated on
 * start, which is what makes the plan item's restart check work: the ticks the previous process
 * already sent are re-derived byte-for-byte and land as `duplicate_identical` (§14, §16), and the
 * seconds it never reached are not lost. A gap there would be indistinguishable from the 0.2%
 * emitter-side loss §13 injects on purpose, which is the one failure the app cannot see (§6).
 *
 * ASSUMPTION (unratified): 60 s. One `rollup_minute` bucket (D28), so a restart re-emits at most
 * the minute you are watching. Needs sign-off before B34 — §15.3(b) makes the start
 * `max(now - CATCHUP_S, T0)` once the seeder owns everything up to T0 — and before B29, where
 * `GET /api/sim/world` could carry a server-derived resume position instead.
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
function impressionsForTick(ad: AdConfig, tick: number): number {
  // §3's λ at this second, then §12's draw. Every remaining factor defaults to 1.0 inside
  // `lambdaPerSecond` and is named on its own plan item; passing nothing is the honest statement
  // that they are absent, not that they are one. **φ and ν are not among them and never will be**
  // — D56 puts both in `p_ctr` only, because fatigue changes what an impression is worth rather
  // than how many arrive.
  //
  // §12's two demand factors ARE passed (B30) — they are the only one of §3's remaining factors
  // that is. They stay a pure function of `t` for exactly the reason below.
  //
  // A pure function of `(ad, tick)`, which is what lets the 60-second `spend` delta below
  // re-derive an interval's impressions instead of accumulating them.
  return negBinomial(
    SEED,
    ad.ad_id,
    tick,
    lambdaPerSecond(ad.ad_id, ad.channel, tick * 1_000, {
      demand: demandFactor(ad.channel, ad.ad_id, tick * 1_000),
    }),
  );
}

/** Sub-second placement: spread evenly inside the tick's second rather than drawn for it. §14's
 * list of named streams is closed, and inventing one for jitter would make that list a guess.
 * Nothing reads sub-second placement yet — D28 buckets by the minute. */
const spreadMs = (tick: number, i: number, of: number): number =>
  tick * 1_000 + Math.floor(((i + 0.5) * 1_000) / Math.max(of, 1));

function eventsForAd(live: LiveAd, tick: number): Signal[] {
  const ad = live.config;
  const count = impressionsForTick(ad, tick);
  const events: Signal[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      event_id: derivedId(SEED, 'eid', ad.ad_id, tick, i),
      // Always the second that has ALREADY closed, so `ts` is in the past and I10's skew clamp
      // never fires. A simulator running its clock ahead would have every event clamped to
      // `received_at` and collapsed into the current minute.
      ts: new Date(spreadMs(tick, i, count)).toISOString(),
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
    events.push({
      event_id: derivedId(SEED, 'eid', ad.ad_id, tick, 'c', click.index),
      ts: new Date(spreadMs(tick, click.index, clicks.length)).toISOString(),
      ad_id: ad.ad_id,
      event: 'click',
      click_id: click.click_id,
      cost_cents: click.cost_cents,
    });
  }

  // §10 / I1's `spend`: one delta per 60 s per live ad, carrying the CPM accrual of the interval
  // that has just closed. Unix seconds divisible by 60 are minute boundaries and D28 buckets by
  // the UTC minute, so `[tick − 60, tick)` is exactly one bucket and the delta lands in it.
  //
  // The interval's impressions are RE-DERIVED rather than accumulated as the ticks went by. That
  // costs 60 keyed draws a minute and buys the restart property: a re-emitted spend event is
  // byte-identical, so it lands as `duplicate_identical` rather than as a correction. It stays
  // exact under B31b because λ carries no φ (D56) — the one place that decision pays off twice.
  //
  // The interval must be one this process actually EMITTED, not merely one it can re-derive. Boot
  // aligns `FIRST_TICK` down to a boundary, so the first tick generated is itself a boundary — and
  // the interval it closes lies entirely BEFORE boot. Emitting it billed a full minute of CPM
  // against zero impressions: found by reading the store, where a bucket held a `spend` row and no
  // `impression` rows at all. Alignment is what makes this guard lossless: the first interval it
  // skips is one no process ever emitted, and every later one starts on a tick this process
  // generated, so a restart re-emits the boundary byte-identically instead of dropping it.
  if (isSpendBoundary(tick) && tick - SPEND_TICK_S >= FIRST_TICK) {
    let accrued = 0;
    for (let t = tick - SPEND_TICK_S; t < tick; t++) {
      accrued += cpmAccrualCents(ad, impressionsForTick(ad, t));
    }
    const cents = spendCents(accrued);
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

  return events;
}

/**
 * One tick's events across the whole portfolio.
 *
 * Every ad is generated against the SAME world snapshot, taken once per tick, so a lever landing
 * mid-tick takes effect on the next one rather than partway through this one. `live` is empty until
 * the first successful poll, and then nothing is emitted at all — see `world.ts`.
 */
function eventsForTick(tick: number, live: readonly LiveAd[]): Signal[] {
  const events: Signal[] = [];
  for (const ad of live) events.push(...eventsForAd(ad, tick));
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
        ` · rejected ${result.rejected_invalid} · ingest_seq ${result.ingest_seq}`,
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

    const live = liveAds(world, Date.now());
    for (; nextTick < now; nextTick++) pending.push(...eventsForTick(nextTick, live));
    if (pending.length === 0) return;

    const batch = pending;
    pending = [];
    if (await post(batch)) {
      if (!linkUp) console.log('[sim] ingest reachable again');
      linkUp = true;
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
  return { seed: SEED, hours, fromMs };
}

const dry = dryRunOptions(process.argv.slice(2));
if (dry !== null) {
  const started = Date.now();
  fatigue();
  noveltySection();
  conversionLag(dry);
  demandNoise(dry);
  clickAndCostPath(dry, arrivalProcess(dry));
  console.log(`\n[dry-run] ${((Date.now() - started) / 1_000).toFixed(1)}s · nothing was emitted\n`);
  process.exit(0);
}

console.log(
  `[sim] polling ${WORLD_URL} at ${1_000 / TICK_MS} Hz → posting to ${INGEST_URL}` +
    ` · seed '${SEED}' · §3 λ with §4 diurnal + day-of-week and §12 demand, NegBinomial(λ, α=8)` +
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
