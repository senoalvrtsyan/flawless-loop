// Seeder part 2: seven days of history, generated in-process and written through the real
// `ingest()`. SIMULATOR.md §15.2, §15.3. B34.
//
// **This is the chunk that makes the world old.** Before it, φ ≈ 1.0 and ν sits at its peak on
// every ad — correct for a store where nothing has been burned, and the reason §7.2's fatigue
// table has never been the live check. After it, the twelve ads have delivered for one to seven
// days against real audiences, and every derived number on the Signal surface has a past.
//
// Four properties, each of which would be wrong in a way that reads plausible if dropped:
//
//   1. **The model runs FORWARD, accumulating its own state.** φ comes from `F` built up by the
//      impressions this generator has already emitted, ν from the pair's first exposure inside this
//      run, ρ from spend so far on that account-local day. Freezing any of them at a constant would
//      produce seven days of history with no history in it.
//   2. **`received_at = ts + reporting lag`** (§15.3(a), D38-E). If the week were ingested in one
//      burst with `received_at ≈ boot`, D33's maturity CDF would be a picture of the seed loop
//      rather than of the world, and `DESIGN.md` §4.5 relies on exactly that population.
//   3. **Sorted by `received_at` before writing** (§15.3(b)), so `ingest_seq` is monotone in arrival
//      and `as_of_ingest_seq` can reconstruct a past screen. One sort of ~1.6M rows.
//   4. **Anything arriving after `T0` is NOT seeded.** It is dropped here and re-derived by the
//      live emitter at its real arrival moment — which is what makes *"the conversions that were in
//      flight when you started the app"* a real population rather than a manufactured one. §14's
//      keyed RNG is what makes that free: the emitter derives the same schedule from the same
//      `click_id` without a stored queue.
//
// It must NOT call `stream.markDirty()`. Measured at B09: one batch spanning 20,000 minutes
// produced a 6.20 MiB frame and a 142 ms event-loop stall, and this writes far more than that.
// Nothing here imports `stream.ts`, which is the enforcement.

import type { DatabaseSync } from 'node:sqlite';
import { ingest } from '../server/ingest.ts';
import { derivedId } from './rng.ts';
import { lambdaPerSecond, negBinomial } from './rate.ts';
import { demand, demandFactor } from './noise.ts';
import { pacing } from './pacing.ts';
import { clicksForTick, converts, cpmAccrualCents, isSpendBoundary, orderValueCents, spendCents } from './emit.ts';
import { componentOf, novelty, noveltyKey, pairKey, phiAd, slotFrequency } from './fatigue.ts';
import { scheduleFor, reportingLagMs } from './lag.ts';
import { injectFaults, emptyCounts, type FaultCounts } from './faults.ts';
import { SPEND_TICK_S } from './params.ts';
import { AUDIENCES } from './fixtures.ts';
import { localDayStartMs } from '../shared/time.ts';
import type { AdConfig, Signal } from '../shared/types.ts';

/**
 * §6's temperature for an audience — what §11.1's `p_fast` is keyed by.
 *
 * From `fixtures.ts` rather than from the `ads` projection, because temperature is a property of
 * the AUDIENCE and audiences are static reference data (U3), not something a lever can move.
 */
const temperatureOf = (audienceId: string): string => {
  const audience = AUDIENCES.find((a) => a.audience_id === audienceId);
  if (audience === undefined) throw new Error(`no audience ${audienceId} — SIMULATOR §2.2`);
  return audience.temperature;
};

/** One generated delivery and the instant the platform told us about it. */
type Delivery = { signal: Signal; receivedAt: number };

/** The ad rows the backfill needs, read from the `ads` projection the fold already produced. */
export type HistoryAd = AdConfig & { launched_at: string; daily_budget_cents: number };

export type SeedHistoryResult = {
  ticks: number;
  generated: number;
  seeded: number;
  handedOver: number;
  accepted: number;
  duplicateIdentical: number;
  duplicateConflicting: number;
  rejectedInvalid: number;
  faults: FaultCounts;
  generateMs: number;
  sortMs: number;
  ingestMs: number;
};

/**
 * §13's faults are injected into the seeded week too, and the mapping is worth stating because
 * §13 was written about a live transport and this is a constructed arrival order.
 *
 * A transport fault becomes an adjustment to **`received_at`**, never to emission: a duplicate is a
 * second delivery arriving later, a reordered event is one whose arrival is pushed past its
 * neighbours, a withheld click is one whose arrival lands after its own conversion's. Because the
 * whole seed is then sorted by `received_at`, §15.3(b)'s monotonicity survives and `ts` order still
 * disagrees with arrival order exactly where §13 says it should.
 *
 * **Without this the seeded week would be clean and the live week dirty**, with a visible seam at
 * `T0` — and §13's two orphan rows, which B33 could build but not exercise, would never fire at
 * all. `DESIGN.md`'s promise that a handful of buckets carry `restated_at` from frame one is a
 * promise about this population.
 */
const INJECT_FAULTS_INTO_BACKFILL = true;

/** Accumulated as the week runs forward. Nothing here is read from the store. */
type WorldState = {
  /** §7.1's `F`, cumulative impressions per `(lineage, audience)`. */
  fByPair: Map<string, number>;
  /** §8's window, per `(lineage, version, audience)`. */
  firstExposureMs: Map<string, number>;
  /** §9's `a` numerator, per ad, reset at each account-local midnight. */
  spentTodayCents: Map<string, number>;
  /** The open CPM interval per ad — B32's accumulator, same rule as the live emitter's. */
  accrual: Map<string, { start: number; cents: number }>;
  dayStartMs: number;
};

function phiFor(ad: AdConfig, state: WorldState): number {
  const video = componentOf(ad.video_id);
  const headline = componentOf(ad.headline_id);
  const F = (lineageId: string): number =>
    state.fByPair.get(pairKey(lineageId, ad.audience_id)) ?? 0;
  return phiAd(
    slotFrequency(video.version, ad.audience_id, F(video.lineage_id)),
    slotFrequency(headline.version, ad.audience_id, F(headline.lineage_id)),
  );
}

function nuFor(ad: AdConfig, state: WorldState, atMs: number): number {
  const video = componentOf(ad.video_id);
  const key = noveltyKey(video.lineage_id, video.version, ad.audience_id);
  const first = state.firstExposureMs.get(key);
  if (first === undefined) return novelty(0);
  return novelty(Math.max(0, (atMs - first) / 3_600_000));
}

/**
 * Generate the week. Pure: it touches no database and returns everything it made.
 *
 * `t0Ms` is the seed boundary — the seeder's boot instant under D53, and `sim_run.t0` under D60.
 */
export function generateHistory(
  seed: string,
  t0Ms: number,
  days: number,
  ads: readonly HistoryAd[],
): { deliveries: Delivery[]; generated: number; handedOver: number; ticks: number; faults: FaultCounts } {
  const startSec = Math.floor((t0Ms - days * 86_400_000) / 1000);
  const endSec = Math.floor(t0Ms / 1000);
  const launchedSec = new Map(ads.map((a) => [a.ad_id, Math.floor(Date.parse(a.launched_at) / 1000)]));

  const state: WorldState = {
    fByPair: new Map(),
    firstExposureMs: new Map(),
    spentTodayCents: new Map(),
    accrual: new Map(),
    dayStartMs: localDayStartMs(startSec * 1000),
  };

  const deliveries: Delivery[] = [];
  const faults = emptyCounts();
  let generated = 0;
  let handedOver = 0;

  /** Arrival time for one event. Everything the platform tells us about arrives late (§15.3(a)). */
  const arrival = (s: Signal): number => Date.parse(s.ts) + reportingLagMs(seed, s.event_id);

  const emit = (s: Signal, receivedAt: number): void => {
    generated++;
    // §15.3(b): anything arriving after T0 belongs to the LIVE emitter, not to the seed. Dropping
    // it here is what hands it over — the emitter re-derives it from the same `click_id`.
    if (receivedAt >= t0Ms) {
      handedOver++;
      return;
    }
    deliveries.push({ signal: s, receivedAt });
  };

  for (let tick = startSec; tick < endSec; tick++) {
    const atMs = tick * 1000;

    // §9's day boundary, and the reason D22 chose an account-local one: `a` and `e` reset together.
    const day = localDayStartMs(atMs);
    if (day !== state.dayStartMs) {
      state.dayStartMs = day;
      state.spentTodayCents.clear();
    }

    const tickEvents: Signal[] = [];

    for (const ad of ads) {
      if ((launchedSec.get(ad.ad_id) ?? Infinity) > tick) continue;

      const spent = state.spentTodayCents.get(ad.ad_id) ?? 0;
      const rho = pacing(ad.channel, atMs, spent, ad.daily_budget_cents).rho;
      const count = negBinomial(
        seed,
        ad.ad_id,
        tick,
        lambdaPerSecond(ad.ad_id, ad.channel, atMs, {
          demand: demandFactor(ad.channel, ad.ad_id, atMs),
          rho,
        }),
      );

      for (let i = 0; i < count; i++) {
        tickEvents.push({
          event_id: derivedId(seed, 'eid', ad.ad_id, tick, i),
          ts: new Date(atMs + Math.min(i, 999)).toISOString(),
          ad_id: ad.ad_id,
          event: 'impression',
        });
      }

      // §7.1's accrual and §8's window advance with the impressions, not with the clock — which is
      // what makes a burned pair burned and a fresh one fresh.
      if (count > 0) {
        for (const slot of [componentOf(ad.video_id), componentOf(ad.headline_id)]) {
          const pk = pairKey(slot.lineage_id, ad.audience_id);
          state.fByPair.set(pk, (state.fByPair.get(pk) ?? 0) + count);
          const nk = noveltyKey(slot.lineage_id, slot.version, ad.audience_id);
          if (!state.firstExposureMs.has(nk)) state.firstExposureMs.set(nk, atMs);
        }
      }

      const clicks = clicksForTick(seed, ad, tick, count, {
        phiAd: phiFor(ad, state),
        nu: nuFor(ad, state, atMs),
        mChannel: demand('channel', ad.channel, atMs),
      });
      for (const click of clicks) {
        tickEvents.push({
          event_id: derivedId(seed, 'eid', ad.ad_id, tick, 'c', click.index),
          ts: new Date(atMs + Math.min(click.index, 999)).toISOString(),
          ad_id: ad.ad_id,
          event: 'click',
          click_id: click.click_id,
          cost_cents: click.cost_cents,
        });
        state.spentTodayCents.set(ad.ad_id, (state.spentTodayCents.get(ad.ad_id) ?? 0) + click.cost_cents);

        // D62: one Bernoulli per click, keyed by `click_id` alone — so this generator and the live
        // emitter answer the same question the same way for the same click, which is what makes
        // B35's seam checkable. §11's schedule is keyed the same way.
        if (!converts(seed, click.click_id, ad, atMs)) continue;
        const clickTsMs = atMs + Math.min(click.index, 999);
        const schedule = scheduleFor(seed, click.click_id, clickTsMs, temperatureOf(ad.audience_id));
        if (schedule === null) continue; // past §11's 7-day cutoff: the conversion is simply lost
        emit(
          {
            event_id: derivedId(seed, 'eid', ad.ad_id, tick, 'v', click.index),
            ts: new Date(schedule.ts).toISOString(),
            ad_id: ad.ad_id,
            event: 'conversion',
            attributed_click_id: click.click_id,
            value_cents: orderValueCents(seed, ad, schedule.ts, [click.click_id]),
          },
          schedule.received_at,
        );
      }

      // B32's CPM accumulator, identical rule to the live emitter's: flush the closed interval
      // before this tick accrues into the next one.
      const open = state.accrual.get(ad.ad_id);
      if (isSpendBoundary(tick)) {
        state.accrual.delete(ad.ad_id);
        if (open !== undefined && open.start === tick - SPEND_TICK_S) {
          const cents = spendCents(open.cents);
          if (cents > 0) {
            tickEvents.push({
              event_id: derivedId(seed, 'eid', ad.ad_id, tick, 's'),
              ts: new Date((tick - 1) * 1000).toISOString(),
              ad_id: ad.ad_id,
              event: 'spend',
              amount_cents: cents,
            });
            state.spentTodayCents.set(ad.ad_id, (state.spentTodayCents.get(ad.ad_id) ?? 0) + cents);
          }
        }
      }
      const start = Math.floor(tick / SPEND_TICK_S) * SPEND_TICK_S;
      const acc = state.accrual.get(ad.ad_id);
      const add = cpmAccrualCents(ad, count);
      if (acc === undefined || acc.start !== start) state.accrual.set(ad.ad_id, { start, cents: add });
      else acc.cents += add;
    }

    // §13, through the same injector the live emitter uses. A held delivery becomes a LATER
    // `received_at` rather than a later tick — see the note on INJECT_FAULTS_INTO_BACKFILL.
    if (INJECT_FAULTS_INTO_BACKFILL) {
      const injected = injectFaults(seed, tick, tickEvents, faults);
      for (const s of injected.now) emit(s, arrival(s));
      for (const h of injected.held) emit(h.signal, arrival(h.signal) + (h.atTick - tick) * 1000);
    } else {
      for (const s of tickEvents) emit(s, arrival(s));
    }
  }

  return { deliveries, generated, handedOver, ticks: endSec - startSec, faults };
}

/** How many deliveries go into one `ingest()` transaction. D39's measured sweet spot. */
const BATCH = 5_000;

/**
 * Generate the week and write it through the real `ingest()`.
 *
 * `source = 'backfill'` is **server-assigned** (E15/D38) — `ingest()` takes it as an argument
 * rather than reading it off the wire, which is why the seeder can set it and a POST cannot.
 *
 * `now` is the event's own `received_at`, not the clock. That is D38's whole point and it is what
 * makes settlement honest: `settledAt()` asks *"was this bucket settled when this event arrived"*,
 * so a backfilled conversion landing in a bucket older than 72 h is a genuine restatement rather
 * than a spurious one stamped by the seed loop's wall clock.
 */
export function seedHistory(
  db: DatabaseSync,
  seed: string,
  t0Ms: number,
  days: number,
  ads: readonly HistoryAd[],
  onProgress?: (done: number, total: number) => void,
): SeedHistoryResult {
  const genStart = Date.now();
  const { deliveries, generated, handedOver, ticks, faults } = generateHistory(seed, t0Ms, days, ads);
  const generateMs = Date.now() - genStart;

  // §15.3(b)'s one sort. Ties broken by `event_id` so the order is total and a reseed reproduces
  // it — two events can share a millisecond, and `Array.prototype.sort` is stable but the
  // generation order it would preserve is emission order, which is the thing we are replacing.
  const sortStart = Date.now();
  deliveries.sort((a, b) => a.receivedAt - b.receivedAt || (a.signal.event_id < b.signal.event_id ? -1 : 1));
  const sortMs = Date.now() - sortStart;

  const ingestStart = Date.now();
  const totals = { accepted: 0, duplicate_identical: 0, duplicate_conflicting: 0, rejected_invalid: 0 };
  for (let i = 0; i < deliveries.length; i += BATCH) {
    const slice = deliveries.slice(i, i + BATCH);
    // One transaction per batch. `ingest()` is already transactional per call, and `tx()` here
    // would nest — so the batching is the transaction boundary and nothing wraps it.
    const outcome = ingest(
      db,
      slice.map((d) => d.signal),
      'backfill',
      (index) => new Date(slice[index]?.receivedAt ?? t0Ms).toISOString(),
    );
    totals.accepted += outcome.result.accepted;
    totals.duplicate_identical += outcome.result.duplicate_identical;
    totals.duplicate_conflicting += outcome.result.duplicate_conflicting;
    totals.rejected_invalid += outcome.result.rejected_invalid;
    // The dirty set is DELIBERATELY dropped. Nothing here imports `stream.ts`.
    onProgress?.(Math.min(i + BATCH, deliveries.length), deliveries.length);
  }
  const ingestMs = Date.now() - ingestStart;

  return {
    ticks,
    generated,
    seeded: deliveries.length,
    handedOver,
    accepted: totals.accepted,
    duplicateIdentical: totals.duplicate_identical,
    duplicateConflicting: totals.duplicate_conflicting,
    rejectedInvalid: totals.rejected_invalid,
    faults,
    generateMs,
    sortMs,
    ingestMs,
  };
}
