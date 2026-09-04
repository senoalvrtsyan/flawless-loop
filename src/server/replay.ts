// replay(descriptor) — recompute a number from the raw event log, from zero.
// DESIGN.md §10.2, §10.3 · B23.
//
// ** THIS READS `signals` AND NOTHING ELSE. IT MUST NEVER OPEN `rollup_minute`. **
//
// That is the whole point and it is worth being blunt about, because reading the rollup here would
// be faster, would pass every test that checks the number, and would quietly destroy the claim the
// traceability surfaces make. §10.2:
//
//   "The display reads `rollup_minute`, built incrementally at ingest (D29). The check reads raw
//    and recomputes from zero. They are two independent routes to the same number, which is the
//    only arrangement in which 'and they agree' means anything."
//
// So B22 and this file check different things and both are needed. `/api/verify` replays the log
// through the real `apply()` and diffs the projections — it catches a store that has drifted from
// the code. This recomputes the answer WITHOUT `apply()`, by summing raw events under the
// attribution rules — so it catches the code itself being wrong. A bug inside `apply()` is
// invisible to /api/verify and visible here.
//
// It is a PURE function of a log prefix: same store, same descriptor, same answer, forever —
// which is what makes `as_of_ingest_seq` able to reconstruct a past screen (§10.3).

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { floorMinute } from '../shared/time.ts';

/**
 * What to recompute. The bucket coordinates plus the log position to compute it AT.
 *
 * `as_of_ingest_seq` is not an optimisation and not paging: it is what makes a restatement
 * provable. The same descriptor at two log positions returns two different, both-correct answers,
 * and the difference is exactly the events that arrived in between (§10.3).
 */
export type ReplayDescriptor = {
  ad_id: string;
  /** Half-open `[from, to)` over `minute_start`, the same convention as the snapshot. */
  from: string;
  to: string;
  as_of_ingest_seq: number;
};

/** The additive counts a bucket range holds — `rollup_minute`'s columns, recomputed. */
export type ReplayCounts = {
  impressions: number;
  clicks: number;
  click_cost_cents: number;
  spend_cents: number;
  conversions: number;
  value_cents: number;
  provisional_conversions: number;
  provisional_value_cents: number;
};

export type ReplayResult = {
  descriptor: ReplayDescriptor;
  counts: ReplayCounts;
  /**
   * Every event that contributed, in `ingest_seq` order — the evidence half of §10.2. A number
   * with no list of the events under it is a claim; with the list it is a walk-back.
   *
   * A conversion appears here under the bucket its CLICK earned it (D27-B), so the ids in this
   * list are not simply "the events whose `ts` falls in the window" — which is the point.
   */
  contributing_event_ids: string[];
};

/** One raw signal, exactly as the log holds it. No projection column appears here. */
type RawSignal = {
  event_id: string;
  ingest_seq: number;
  ts_effective: string;
  ad_id: string;
  kind: 'impression' | 'click' | 'spend' | 'conversion';
  click_id: string | null;
  cost_cents: number | null;
  amount_cents: number | null;
  attributed_click_id: string | null;
  value_cents: number | null;
};

const zero = (): ReplayCounts => ({
  impressions: 0, clicks: 0, click_cost_cents: 0, spend_cents: 0,
  conversions: 0, value_cents: 0, provisional_conversions: 0, provisional_value_cents: 0,
});

/**
 * Recompute one bucket range from raw events.
 *
 * The prefix is taken with `ingest_seq <= as_of` on BOTH reads — the events being counted and the
 * clicks used to attribute them. Attributing against the whole log while counting a prefix would
 * resolve conversions using clicks that had not arrived yet, and the answer would be *more* right
 * than the screen ever was: the check would then report a divergence on a store that had faithfully
 * shown what it knew at the time.
 *
 * Read inside one `readTx` so a concurrent ingest cannot land between the two reads. Under WAL a
 * reader needs no lock to get a stable snapshot (B07).
 */
export function replay(db: DatabaseSync, descriptor: ReplayDescriptor): ReplayResult {
  const { ad_id, from, to, as_of_ingest_seq } = descriptor;

  return readTx(db, () => {
    // Every event for this ad within the prefix. `ix_signals_ad_time` serves the ordering; the
    // window is NOT applied in SQL, because a conversion's own `ts_effective` may sit far outside
    // the window it belongs to — filtering here would drop exactly the events the design exists to
    // place correctly.
    const own = db.prepare(`
      SELECT event_id, ingest_seq, ts_effective, ad_id, kind, click_id, cost_cents, amount_cents,
             attributed_click_id, value_cents
        FROM signals
       WHERE ingest_seq <= ? AND kind <> 'conversion' AND ad_id = ?
       ORDER BY ingest_seq
    `).all(as_of_ingest_seq, ad_id) as unknown as RawSignal[];

    // Conversions are read WITHOUT an ad filter: I8/G30 makes the click authoritative, so a
    // conversion whose body names another ad still credits THIS one when its click happened here.
    const conversions = db.prepare(`
      SELECT event_id, ingest_seq, ts_effective, ad_id, kind, click_id, cost_cents, amount_cents,
             attributed_click_id, value_cents
        FROM signals
       WHERE ingest_seq <= ? AND kind = 'conversion'
       ORDER BY ingest_seq
    `).all(as_of_ingest_seq) as unknown as RawSignal[];

    // The clicks visible in this prefix, by `click_id` — attribution's whole input, rebuilt from
    // raw rather than read from `conversion_attribution`, which is a projection.
    const clicks = new Map<string, RawSignal>();
    for (const row of db.prepare(`
      SELECT event_id, ingest_seq, ts_effective, ad_id, kind, click_id, cost_cents, amount_cents,
             attributed_click_id, value_cents
        FROM signals
       WHERE ingest_seq <= ? AND kind = 'click'
       ORDER BY ingest_seq
    `).all(as_of_ingest_seq) as unknown as RawSignal[]) {
      if (row.click_id !== null) clicks.set(row.click_id, row);
    }

    const counts = zero();
    const contributing: { ingest_seq: number; event_id: string }[] = [];
    const inWindow = (minute: string): boolean => minute >= from && minute < to;

    for (const row of own) {
      const minute = floorMinute(row.ts_effective);
      if (!inWindow(minute)) continue;
      switch (row.kind) {
        case 'impression':
          counts.impressions += 1;
          break;
        case 'click':
          counts.clicks += 1;
          counts.click_cost_cents += row.cost_cents ?? 0;
          break;
        case 'spend':
          counts.spend_cents += row.amount_cents ?? 0;
          break;
        case 'conversion':
          throw new Error('replay: a conversion reached the own-events loop');
      }
      contributing.push(row);
    }

    for (const row of conversions) {
      const click = row.attributed_click_id === null
        ? undefined
        : clicks.get(row.attributed_click_id);

      if (click === undefined) {
        // Orphan (D16): no click means no click-minute, so it is held provisionally at its OWN
        // minute against its OWN claimed ad — and only then does the ad filter apply.
        if (row.ad_id !== ad_id) continue;
        const minute = floorMinute(row.ts_effective);
        if (!inWindow(minute)) continue;
        counts.provisional_conversions += 1;
        counts.provisional_value_cents += row.value_cents ?? 0;
        contributing.push(row);
        continue;
      }

      // Resolved: the CLICK decides both the ad (I8/G30) and the minute (D27-B).
      if (click.ad_id !== ad_id) continue;
      const minute = floorMinute(click.ts_effective);
      if (!inWindow(minute)) continue;
      counts.conversions += 1;
      counts.value_cents += row.value_cents ?? 0;
      contributing.push(row);
    }

    // Both loops append, so the list is in two runs; §10.2 promises log order, which is also the
    // order a reviewer walking the trace expects to read it in.
    contributing.sort((a, b) => a.ingest_seq - b.ingest_seq);
    return {
      descriptor,
      counts,
      contributing_event_ids: contributing.map((row) => row.event_id),
    };
  });
}
