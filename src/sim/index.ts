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
//
// **ASSUMPTION (unratified), pending B26 and B27:** §3's λ as `SIMULATOR.md` writes it also lists
// `φ_fatigue` and `ν_novelty`. Neither is applied here, because neither is built yet.

import { derivedId } from './rng.ts';
import { ADS, type AdFixture } from './fixtures.ts';
import { lambdaPerSecond, negBinomial } from './rate.ts';
import {
  arrivalProcess,
  fatigue,
  localMidnightAtOrBefore,
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
function eventsForTick(tick: number): Signal[] {
  // §3's λ at this second, then §12's draw. Every other factor defaults to 1.0 inside
  // `lambdaPerSecond` and is named on its own plan item; passing nothing is the honest statement
  // that they are absent, not that they are one.
  const lambda = lambdaPerSecond(AD_ID, AD.channel, tick * 1_000);
  const count = negBinomial(SEED, AD_ID, tick, lambda);

  const events: Signal[] = [];
  for (let i = 0; i < count; i++) {
    // Spread evenly inside the second rather than drawn for it: §14's list of named streams is
    // closed, and inventing one for sub-second jitter would make that list a guess. Nothing reads
    // sub-second placement yet — D28 buckets by the minute.
    const ms = tick * 1_000 + Math.floor(((i + 0.5) * 1_000) / count);
    events.push({
      event_id: derivedId(SEED, 'eid', AD_ID, tick, i),
      // Always the second that has ALREADY closed, so `ts` is in the past and I10's skew clamp
      // never fires. A simulator running its clock ahead would have every event clamped to
      // `received_at` and collapsed into the current minute.
      ts: new Date(ms).toISOString(),
      ad_id: AD_ID,
      event: 'impression',
    });
  }
  return events;
}

/** The last whole second NOT yet generated. Boot starts it in the past; see CATCHUP_S. */
let nextTick = Math.floor(Date.now() / 1_000) - CATCHUP_S;
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
  arrivalProcess(dry);
  console.log(`\n[dry-run] ${((Date.now() - started) / 1_000).toFixed(1)}s · nothing was emitted\n`);
  process.exit(0);
}

console.log(
  `[sim] ${AD_ID} on ${AD.channel} at ${BASE_IMPR_PER_DAY[AD_ID]}/day nominal → ${INGEST_URL}` +
    ` · seed '${SEED}' · §3 λ with §4 diurnal + day-of-week, NegBinomial(λ, α=8)` +
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
