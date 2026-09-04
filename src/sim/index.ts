// The simulator. A separate OS process (D32) whose only channel into the store is
// `POST /api/ingest` — it never opens the database, and it never assigns `received_at` or
// `ingest_seq` (D12). DESIGN §11's top box, minus everything stage 3 adds.
//
// B11's scope is stage 1's event source and nothing wider: ONE hard-coded ad, impressions only, a
// CONSTANT rate, a 1 s tick at 1× wall clock (§15.1), one batched POST per tick. Everything that
// makes the rate interesting is deliberately absent and named on its own plan item — SIMULATOR §3's
// six factors and the NegBinomial draw (B25-B27), clicks/conversions/spend (B28-B31), the
// `GET /api/sim/world` poll and levers (B29), scenarios (B32), the injected misbehaviours (B33),
// the 7-day backfill and the T0 seam (B34).

import { draw, derivedId } from './rng.ts';
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

/** `a_12`, `meta_feed`, 20,000 impressions/day — SIMULATOR §2.3. The brief's own pause target. */
const AD_ID = 'a_12';
const IMPR_PER_DAY = 20_000;

/**
 * The constant rate: §3's λ with all six factors held at 1.0 and no stochastic draw. 0.2315/s, so
 * ~13.9 impressions a minute — the number on screen climbs a few times a minute, which is the
 * "climbs at the expected rate" the plan item asks to be able to eyeball. B25 replaces this
 * line, not the loop around it.
 */
const RATE_PER_S = IMPR_PER_DAY / 86_400;

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
  const whole = Math.floor(RATE_PER_S);
  const fraction = RATE_PER_S - whole;
  const count = whole + (draw(SEED, 'impr', AD_ID, tick) < fraction ? 1 : 0);

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

console.log(
  `[sim] ${AD_ID} at ${RATE_PER_S.toFixed(4)} impr/s (${IMPR_PER_DAY}/day) → ${INGEST_URL}` +
    ` · seed '${SEED}' · replaying the last ${CATCHUP_S}s`,
);

const timer = setInterval(() => void tick(), TICK_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[sim] ${signal} — stopping with ${pending.length} events unsent`);
    clearInterval(timer);
    process.exit(0);
  });
}
