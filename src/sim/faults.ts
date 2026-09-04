// §13's injected misbehaviours. B33.
//
// **Cross-referenced against `DESIGN.md` §6 by §13 itself: every injected fault has a named handler
// and every handler has something that triggers it.** That is the point of the section — a
// misbehaviour table nothing exercises is a claim, and this file is what turns it into data.
//
// Everything here is a **keyed draw** (§14), addressed by `(stream, event_id, part)`. Two
// consequences that are worth more than they cost:
//
//   * A re-emitted event makes the SAME fault decision, so a restart's catch-up re-derives its own
//     duplicates and drops rather than inventing new ones on top.
//   * Injection is addressed per event, so pausing one ad does not reshuffle another ad's faults.
//
// §14's list of stream names is closed, and §13 has ten injected faults against five fault streams
// (`dup`, `reorder`, `orphan`, `skew`, `loss`), so the pairs share a stream and disambiguate with a
// part — exactly as `rate.ts` does inside `impr`. Two of the ten have no obvious stream of their
// own and the reading is recorded here rather than left implicit: **dual click-id rides `dup`**
// (it is one click delivered twice under different ids) and **malformed rides `loss`** (both are
// emitter-side corruption of a delivery that had a well-formed event behind it).
//
// **What this file does NOT do is decide what a fault means to the app.** Every handler was built
// in stage 2: `duplicate_identical` and `duplicate_conflicting` at B05, the `click_id` collision at
// B16, the I10 clamp at B02, `ingest_seq` ordering at B05, and D16's provisional-orphan path at
// B18/B19. B33 supplies the triggers and nothing else.

import { derivedId, draw } from './rng.ts';
import { FAULTS } from './params.ts';
import type { Signal } from '../shared/types.ts';

/** One event held back, and the tick at or after which it may be sent. */
export type Held = { atTick: number; signal: Signal };

/** What one tick's batch turned into. */
export type Injected = {
  /** Sent now, in this tick's POST. */
  now: Signal[];
  /** Sent at or after `atTick` — duplicates, reordered events and withheld clicks. */
  held: Held[];
};

/** Per-fault tallies, so the injected rate can be measured against §13 rather than trusted. */
export type FaultCounts = Record<FaultName, number>;

export type FaultName =
  | 'dup_identical'
  | 'dup_conflicting'
  | 'reorder_short'
  | 'reorder_long'
  | 'orphan_released'
  | 'orphan_never'
  | 'malformed'
  | 'skew'
  | 'dual_click_id'
  | 'loss';

export const FAULT_NAMES: readonly FaultName[] = [
  'dup_identical',
  'dup_conflicting',
  'reorder_short',
  'reorder_long',
  'orphan_released',
  'orphan_never',
  'malformed',
  'skew',
  'dual_click_id',
  'loss',
];

export const emptyCounts = (): FaultCounts =>
  Object.fromEntries(FAULT_NAMES.map((n) => [n, 0])) as FaultCounts;

/** A uniform on `[0,1)` for one event and one fault, keyed so a re-emission repeats the decision. */
const faultDraw = (seed: string, stream: string, part: string, eventId: string): number =>
  draw(seed, stream, eventId, part);

/** Uniform on `[lo, hi)`, from one keyed draw. */
const between = (seed: string, stream: string, part: string, eventId: string, lo: number, hi: number): number =>
  lo + faultDraw(seed, stream, part, eventId) * (hi - lo);

/**
 * The money field an event carries, if any. §13's conflicting-duplicate row says *"`value_cents`
 * perturbed"* because it was written assuming conversions were live; the row's own title is
 * *"conflicting payload"*, so the perturbation is applied to whichever money field the event has.
 * Read that way the injector is live from B33; read literally it would sit inert until conversions
 * are emitted, which is not what §13's 0.05% rate is describing.
 */
function perturbMoney(signal: Signal, factor: number): Signal {
  switch (signal.event) {
    case 'conversion':
      return { ...signal, value_cents: Math.max(1, Math.round(signal.value_cents * factor)) };
    case 'click':
      return { ...signal, cost_cents: Math.max(1, Math.round(signal.cost_cents * factor)) };
    case 'spend':
      return { ...signal, amount_cents: Math.max(1, Math.round(signal.amount_cents * factor)) };
    case 'impression':
      // An impression carries no money, and §13's row is titled "conflicting PAYLOAD" — so the
      // conflict is on `ts`, one second off. Same `event_id`, different body: `duplicate_conflicting`
      // exactly as a money perturbation would be, and it keeps §13's 0.05% a per-EVENT rate rather
      // than silently becoming a per-money-event one.
      return { ...signal, ts: new Date(Date.parse(signal.ts) + 1_000).toISOString() };
  }
}

/**
 * §13's malformed payload: *"negative money or a missing variant field"*.
 *
 * Both shapes are produced, chosen by the same draw that selected the event, so the two reject
 * reasons B16 named (`cost_cents_not_a_non_negative_integer`, `click_id_missing_or_not_a_string`)
 * are both exercised. An impression has neither money nor a variant field to break, so it is
 * corrupted by removing `ad_id` — still `rejected_invalid`, still with the raw body retained.
 *
 * The cast is the point of the function: this returns something that is deliberately NOT a valid
 * `Signal`, which is why it is typed as the wire type `unknown` rather than as `Signal`.
 */
function malform(signal: Signal, dropField: boolean): unknown {
  if (dropField) {
    const rest = { ...signal } as Record<string, unknown>;
    delete rest[signal.event === 'click' ? 'click_id' : 'ad_id'];
    return rest;
  }
  switch (signal.event) {
    case 'click':
      return { ...signal, cost_cents: -signal.cost_cents - 1 };
    case 'spend':
      return { ...signal, amount_cents: -signal.amount_cents - 1 };
    case 'conversion':
      return { ...signal, value_cents: -signal.value_cents - 1 };
    case 'impression':
      return { ...signal, ad_id: 12 };
  }
}

/**
 * Apply §13's injectors to one tick's batch.
 *
 * **Order is fixed and it matters**, because the faults are not independent: an event lost on the
 * wire cannot also arrive duplicated, and an event held back is held back with whatever corruption
 * it already carries. The order below reads down §13's table from "never arrives" to "arrives more
 * than once", so each stage sees a smaller population than the one above it — which is also why
 * the measured rates in the dry run are conditional and it says so.
 *
 * `counts` is mutated rather than returned fresh so a whole window can be tallied without
 * allocating per tick; the dry run owns it and the emitter keeps one for its lifetime.
 */
export function injectFaults(
  seed: string,
  tick: number,
  batch: readonly Signal[],
  counts: FaultCounts,
): Injected {
  const now: Signal[] = [];
  const held: Held[] = [];

  for (const original of batch) {
    const id = original.event_id;

    // 1. Emitter-side loss. §13: "dropped silently … the one failure we cannot see is actually
    //    present in the data rather than hypothetical" (G21). Nothing downstream ever learns.
    if (faultDraw(seed, 'loss', 'drop', id) < FAULTS.loss) {
      counts.loss++;
      continue;
    }

    // 2. Malformed. Emitted as-is and rejected at ingest with the raw body retained (B05).
    if (faultDraw(seed, 'loss', 'malformed', id) < FAULTS.malformed) {
      counts.malformed++;
      // `Signal` is the wire type of a WELL-FORMED event; a malformed one is exactly what this
      // injector exists to send, so the cast is deliberate and is the only one in the file.
      now.push(malform(original, faultDraw(seed, 'loss', 'shape', id) < 0.5) as Signal);
      continue;
    }

    let signal = original;

    // 3. Clock skew. §13: +5–90 s, future-dated. I10's generated column clamps `ts_effective` to
    //    `received_at` and keeps BOTH values, so this is visible in the store rather than lost.
    if (faultDraw(seed, 'skew', 'hit', id) < FAULTS.skew) {
      counts.skew++;
      const aheadMs = between(seed, 'skew', 'ms', id, FAULTS.skewMinS, FAULTS.skewMaxS) * 1_000;
      signal = { ...signal, ts: new Date(Date.parse(signal.ts) + aheadMs).toISOString() };
    }

    // 4. Orphan faults, clicks only. Both are about a click that does not accompany its
    //    conversion — §13 measures them as a share OF CLICKS, not of all events.
    //
    //    **Neither is observable as an orphan until conversions are emitted** (B34): with no
    //    conversion, a withheld click is just a late click and a dropped one is just loss. The
    //    mechanism is right either way, because §11's lag schedule is keyed by `click_id` alone
    //    (§15.3(b)) and does not care when the click was delivered — so the same code produces
    //    real provisional-then-promoted orphans the moment B34's conversions exist.
    if (signal.event === 'click') {
      if (faultDraw(seed, 'orphan', 'never', id) < FAULTS.orphanNever) {
        counts.orphan_never++;
        continue;
      }
      if (faultDraw(seed, 'orphan', 'released', id) < FAULTS.orphanReleased) {
        counts.orphan_released++;
        held.push({ atTick: tick + FAULTS.orphanHoldS, signal });
        continue;
      }
    }

    // 5. Duplicate delivery. The copy is scheduled, not sent twice now: §13 says "re-sent 1–20 s
    //    later", and a duplicate inside one batch is B05's in-batch case rather than a redelivery.
    const dup = faultDraw(seed, 'dup', 'hit', id);
    if (dup < FAULTS.dupConflicting) {
      counts.dup_conflicting++;
      const factor = between(seed, 'dup', 'factor', id, 1.05, 1.4);
      held.push({
        atTick: tick + Math.round(between(seed, 'dup', 'delay', id, 1, FAULTS.dupMaxDelayS)),
        signal: perturbMoney(signal, factor),
      });
    } else if (dup < FAULTS.dupConflicting + FAULTS.dupIdentical) {
      counts.dup_identical++;
      held.push({
        atTick: tick + Math.round(between(seed, 'dup', 'delay', id, 1, FAULTS.dupMaxDelayS)),
        signal,
      });
    }

    // 6. Same click under two `event_id`s. §13/E3: the partial unique index on `click_id` detects
    //    it, and B16 moved that test AFTER the `event_id` dedupe so an honest retry is not read as
    //    this fault. The second delivery carries a DERIVED id, not a random one, so a restart
    //    re-derives the same pair rather than manufacturing a third claimant.
    if (signal.event === 'click' && faultDraw(seed, 'dup', 'dual', id) < FAULTS.dualClickId) {
      counts.dual_click_id++;
      held.push({
        atTick: tick + 1,
        // A DERIVED id, like every other id in the model (§14) — not a marked one. A `~dual`
        // suffix would be re-derivable too, but it would also be visibly synthetic in the store,
        // and B16's collision test is about two ids that look equally ordinary.
        signal: { ...signal, event_id: derivedId(seed, 'eid', signal.ad_id, tick, 'dual', id) },
      });
    }

    // 7. Out-of-order delivery. §13 holds one batch (~1 s) at 3% and 30–120 s at 0.3%. D12: order
    //    comes from `ingest_seq`, which the server assigns on arrival, so a held event genuinely
    //    lands out of order rather than merely claiming to.
    const reorder = faultDraw(seed, 'reorder', 'hit', id);
    if (reorder < FAULTS.reorderLong) {
      counts.reorder_long++;
      held.push({
        atTick: tick + Math.round(between(seed, 'reorder', 'delay', id, FAULTS.reorderLongMinS, FAULTS.reorderLongMaxS)),
        signal,
      });
      continue;
    }
    if (reorder < FAULTS.reorderLong + FAULTS.reorderShort) {
      counts.reorder_short++;
      held.push({ atTick: tick + 1, signal });
      continue;
    }

    now.push(signal);
  }

  return { now, held };
}
