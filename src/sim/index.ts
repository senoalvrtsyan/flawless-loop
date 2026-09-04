// The simulator. A separate OS process (D32) whose only channel into the store is
// `POST /api/ingest` — it never opens the database, and it never assigns `received_at` or
// `ingest_seq` (D12). DESIGN §11's top box, minus everything stage 3 adds.
//
// Still ONE hard-coded ad, impressions only, a 1 s tick at 1× wall clock (§15.1), one batched POST
// per tick: the emitter cannot learn the portfolio or any ad's status until `GET /api/sim/world`
// (B31), so `a_12` is the whole world here.
//
// What is real as of B25 is the RATE. §3's λ now carries §4's per-channel shape of the day and its
// day-of-week weight, and the count is `NegBinomial(λ, α = 8)` rather than a constant. The factors
// that are still absent are passed as 1.0 by name rather than left out, each on its own plan item:
// fatigue (B26), novelty (B28), pacing (B32), the two AR(1) demand factors (B30). Clicks, cost and
// spend are B27; the conversion schedule B29; the injected misbehaviours B33; the 7-day backfill
// and the T0 seam B34 and B35.

import { derivedId } from './rng.ts';
import { ADS, type AdFixture } from './fixtures.ts';
import { lambdaPerSecond, negBinomial } from './rate.ts';
import { adFatigue, adNovelty, nominalAccrual, noveltyAgesAtT0 } from './fatigue.ts';
import { clicksForTick, cpmAccrualCents, isSpendBoundary, spendCents } from './emit.ts';
import { SPEND_TICK_S } from './params.ts';
import {
  arrivalProcess,
  clickAndCostPath,
  conversionLag,
  fatigue,
  localMidnightAtOrBefore,
  noveltySection,
  type DryRunOptions,
} from './dry-run.ts';
import { BASE_IMPR_PER_DAY } from './params.ts';
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

/** `a_12` — SIMULATOR §2.3, and the brief's own pause target. Its channel comes from the fixture
 * and its `base_impr_per_day` from §21, so neither is restated here. */
const AD_ID = 'a_12';
const AD = ((id: string): AdFixture => {
  const found = ADS.find((a) => a.ad_id === id);
  if (found === undefined) throw new Error(`${id} is not in the seeded portfolio — SIMULATOR §2.3`);
  return found;
})(AD_ID);

/**
 * §7's `φ_ad` for `a_12`, held constant for the life of the process — and per **D56** it enters
 * `p_ctr` only, never λ.
 *
 * ASSUMPTION (unratified): the accrual is the NOMINAL one at `T0` (`fatigue.ts`), because the
 * emitter has no `F` of its own until `GET /api/sim/world` recomputes it from the signal log (B31)
 * and no `T0` until the seeder exists (B34). It blocks nothing and it costs little: `a_12` accrues
 * 20,000/day into a 96,000 pool, so φ drifts about 1.5% per day and a demo lasts minutes. B31
 * replaces this constant with a polled figure; until then a live run's fatigue is frozen, not wrong.
 */
const PHI_AD = adFatigue(AD_ID, nominalAccrual()).phi_ad;

/**
 * §8's ν for `a_12`, frozen at `T0` — and here the freeze is FORCED, not chosen. ν feeds `p_ctr`,
 * `p_ctr` decides the tick's click count, and a click's `event_id` is derived: a ν that moved with
 * wall-clock time would re-derive the same `event_id` with a different click population after a
 * restart, which is `duplicate_conflicting` rather than `duplicate_identical`. The cost is 0.0023
 * of ν over ten minutes at §8's 18 h constant, and `a_12` is seven days old so it is ~1.00 anyway.
 */
const NU = adNovelty(AD_ID, noveltyAgesAtT0());

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
function impressionsForTick(tick: number): number {
  // §3's λ at this second, then §12's draw. Every remaining factor defaults to 1.0 inside
  // `lambdaPerSecond` and is named on its own plan item; passing nothing is the honest statement
  // that they are absent, not that they are one. **φ and ν are not among them and never will be**
  // — D56 puts both in `p_ctr` only, because fatigue changes what an impression is worth rather
  // than how many arrive.
  //
  // A pure function of `(ad, tick)`, which is what lets the 60-second `spend` delta below
  // re-derive an interval's impressions instead of accumulating them.
  return negBinomial(SEED, AD_ID, tick, lambdaPerSecond(AD_ID, AD.channel, tick * 1_000));
}

/** Sub-second placement: spread evenly inside the tick's second rather than drawn for it. §14's
 * list of named streams is closed, and inventing one for jitter would make that list a guess.
 * Nothing reads sub-second placement yet — D28 buckets by the minute. */
const spreadMs = (tick: number, i: number, of: number): number =>
  tick * 1_000 + Math.floor(((i + 0.5) * 1_000) / Math.max(of, 1));

function eventsForTick(tick: number): Signal[] {
  const count = impressionsForTick(tick);
  const events: Signal[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      event_id: derivedId(SEED, 'eid', AD_ID, tick, i),
      // Always the second that has ALREADY closed, so `ts` is in the past and I10's skew clamp
      // never fires. A simulator running its clock ahead would have every event clamped to
      // `received_at` and collapsed into the current minute.
      ts: new Date(spreadMs(tick, i, count)).toISOString(),
      ad_id: AD_ID,
      event: 'impression',
    });
  }

  // §10's clicks. The `event_id` carries a `'c'` part so a click and an impression at the same
  // (tick, index) cannot collide — parts are NUL-joined, so no other part sequence can produce it.
  const clicks = clicksForTick(SEED, AD, tick, count, { phiAd: PHI_AD, nu: NU });
  for (const click of clicks) {
    events.push({
      event_id: derivedId(SEED, 'eid', AD_ID, tick, 'c', click.index),
      ts: new Date(spreadMs(tick, click.index, clicks.length)).toISOString(),
      ad_id: AD_ID,
      event: 'click',
      click_id: click.click_id,
      cost_cents: click.cost_cents,
    });
  }

  // §10 / I1's `spend`: one delta per 60 s per live ad, carrying the CPM accrual of the interval
  // that has just closed. Unix seconds divisible by 60 are minute boundaries and D28 buckets by
  // the UTC minute, so `[tick − 60, tick)` is exactly one bucket and the delta lands in it.
  //
  // The interval's impressions are RE-DERIVED here rather than accumulated as the ticks went by.
  // That costs 60 keyed draws a minute and buys the restart property: a re-emitted spend event is
  // byte-identical, so it lands as `duplicate_identical` rather than as a correction.
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
    for (let t = tick - SPEND_TICK_S; t < tick; t++) accrued += cpmAccrualCents(AD, impressionsForTick(t));
    const cents = spendCents(accrued);
    if (cents > 0) {
      events.push({
        event_id: derivedId(SEED, 'eid', AD_ID, tick, 's'),
        ts: new Date((tick - 1) * 1_000).toISOString(),
        ad_id: AD_ID,
        event: 'spend',
        amount_cents: cents,
      });
    }
  }

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
    const now = Math.floor(Date.now() / 1_000);
    for (; nextTick < now; nextTick++) pending.push(...eventsForTick(nextTick));
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
  clickAndCostPath(dry, arrivalProcess(dry));
  console.log(`\n[dry-run] ${((Date.now() - started) / 1_000).toFixed(1)}s · nothing was emitted\n`);
  process.exit(0);
}

console.log(
  `[sim] ${AD_ID} on ${AD.channel} at ${BASE_IMPR_PER_DAY[AD_ID]}/day nominal → ${INGEST_URL}` +
    ` · seed '${SEED}' · §3 λ with §4 diurnal + day-of-week, NegBinomial(λ, α=8)` +
    ` · §10 clicks at p_ctr with φ_ad ${PHI_AD.toFixed(4)} · ν ${NU.toFixed(4)} (D56),` +
    ` CPM spend every ${SPEND_TICK_S}s` +
    ` · replaying the last ${CATCHUP_S}s`,
);

const timer = setInterval(() => void tick(), TICK_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[sim] ${signal} — stopping with ${pending.length} events unsent`);
    clearInterval(timer);
    process.exit(0);
  });
}
