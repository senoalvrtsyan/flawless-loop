// `GET /api/sim/world` — the simulator's one window onto the world. B31a.
//
// **Decision D40, options A + X.** The simulator holds no durable state of its own, which
// `DESIGN.md` §3.3 promised and this endpoint is what makes true. Polled once per tick, it returns
// everything the emitter needs to decide what to emit next, in ONE read transaction.
//
// READ-ONLY by construction, like `snapshot.ts`: SELECTs and nothing else. Projections have exactly
// one writer (D7, `apply.ts`), and the read side never repairs what it finds.
//
// **Why RECOMPUTE rather than derive** (§16, and this is the whole argument for the endpoint's
// existence): deriving fatigue from `seed + clock` would reconstruct what the model *would* have
// produced, which equals the store only if nothing was rejected, lost or truncated. §13 deliberately
// injects 0.2% emitter-side loss and 0.1% malformed payloads, so the two **will** diverge —
// silently, in the one number the artifact is judged on. Reading it back cannot diverge, because
// this is the same projection the app itself reads.
//
// **It is not a simulator-only query.** Cumulative delivery per `(lineage, audience)` is the
// temporal reverse join `DESIGN.md` §8 already documents for component-level performance, so the
// endpoint serves a query the Workbench wants anyway.

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { ACCOUNT_TZ, CONVERSION_LAG_CUTOFF_MS } from '../shared/config.ts';
import { localDayStartMs } from '../shared/time.ts';
import type { SimWorld, WorldAd, WorldDelivery } from '../shared/types.ts';

/**
 * §7's accrual, recomputed: impressions per `(lineage, audience)`, over every ad that used the pair,
 * for BOTH slots.
 *
 * This is `DESIGN.md` §8's documented temporal reverse join, not a second query invented here — the
 * same `rollup_minute` ⋈ `config_generations` shape, on the same half-open
 * `[valid_from, valid_to)` interval. Both slots are unioned and then summed, because §7.1 accrues
 * to the video lineage *and* the headline lineage; the `SUM` over the union is what makes a lineage
 * used in both slots correct rather than double-counted into two rows.
 *
 * **Grouped per `(lineage, VERSION, audience)`, because two different rules need two different
 * groupings and one query can serve both.** §7.1's `F` is version-AGNOSTIC — §7.3: a recut inherits
 * its lineage's frequency — so the emitter sums these rows across versions. §8's novelty is
 * version-SPECIFIC — a version bump gets a fresh window — so it reads one row's
 * `first_impression_at`. Grouping by lineage alone would have made `a_05`'s recut inherit `a_01`'s
 * novelty window and silently contradict B28.
 *
 * **Reading `rollup_minute` rather than `signals` is deliberate and is what §16 actually asks for.**
 * §16's requirement is that the emitter's fatigue "cannot silently disagree with the fatigue the app
 * infers" — and the app reads this projection. Going to raw `signals` would be a *third*
 * computation of the same quantity, agreeing with the log but able to disagree with the screen.
 * `npm run agree` and `/api/verify` are what keep the projection honest against the log.
 *
 * Unqualified table names, per **D55**: `/api/verify` rebuilds through the real `apply()` into
 * `TEMP` tables that shadow these names, and one `main.`-qualified projection read here would make
 * the verifier check the wrong tables. `verify.test.ts` greps for exactly that and fails the build.
 */
const DELIVERIES_SQL = `
  SELECT lineage_id, version, audience_id, SUM(impressions) AS impressions,
         MIN(minute_start) AS first_impression_at
    FROM (
      SELECT c.lineage_id AS lineage_id, c.version AS version, g.audience_id AS audience_id,
             r.impressions AS impressions, r.minute_start AS minute_start
        FROM rollup_minute r
        JOIN config_generations g
          ON g.ad_id = r.ad_id
         AND r.minute_start >= g.valid_from
         AND (g.valid_to IS NULL OR r.minute_start < g.valid_to)
        JOIN components c ON c.component_id = g.video_id
      UNION ALL
      SELECT c.lineage_id AS lineage_id, c.version AS version, g.audience_id AS audience_id,
             r.impressions AS impressions, r.minute_start AS minute_start
        FROM rollup_minute r
        JOIN config_generations g
          ON g.ad_id = r.ad_id
         AND r.minute_start >= g.valid_from
         AND (g.valid_to IS NULL OR r.minute_start < g.valid_to)
        JOIN components c ON c.component_id = g.headline_id
    )
   GROUP BY lineage_id, version, audience_id
   HAVING SUM(impressions) > 0
   ORDER BY lineage_id, version, audience_id
`;

/**
 * §9's pacing term: spend so far on the **account-local** day (D22/I2), per ad.
 *
 * `click_cost_cents + spend_cents` is the read-time sum D10 insists on — the brief's two cost paths
 * are disjoint (L79-80) and *total spend* is never a third stored column. Minute buckets are UTC and
 * stay UTC; only the day boundary is local, which is why the bound is passed in rather than computed
 * in SQL.
 */
const SPEND_SQL = `
  SELECT ad_id, SUM(click_cost_cents + spend_cents) AS cents
    FROM rollup_minute
   WHERE minute_start >= ?
   GROUP BY ad_id
`;

/**
 * §15.3(b)'s pending clicks: backfilled clicks still inside the 7-day lag window whose conversion
 * has not arrived, so the emitter can re-derive each one's schedule from
 * `hash(seed, 'conv_lag', click_id)` instead of needing a stored queue.
 *
 * "Has not arrived" is asked of the LOG — no conversion signal carries this `click_id` — rather
 * than of `conversion_attribution`, whose rows exist only once a conversion has been ingested. The
 * absence we want is the absence of the event, not the absence of its attribution.
 *
 * Restricted to `source = 'backfill'` (E15) because that is the population the `T0` seam creates —
 * a live click's schedule is known to the process that emitted it. **It returns nothing until B34
 * seeds**, which is correct rather than a stub: the query is the real one and starts producing rows
 * the moment there is history.
 *
 * **B34 owes one thing this cannot supply.** The lag is re-derivable from a bare `click_id`, but
 * *whether* a click converts at all is §10's `BetaBinomial` over the tick's clicks, which needs the
 * tick and the index — neither of which a handed-over `click_id` carries. So the handover contract
 * is one function short, and B34 has to settle how `converted?` is keyed. Named here because this is
 * where the contract becomes visible.
 */
const PENDING_CLICKS_SQL = `
  SELECT s.ad_id AS ad_id, s.ts_effective AS ts, s.click_id AS click_id
    FROM signals s
   WHERE s.kind = 'click'
     AND s.source = 'backfill'
     AND s.click_id IS NOT NULL
     AND s.ts_effective >= ?
     AND NOT EXISTS (
       SELECT 1 FROM signals cv
        WHERE cv.kind = 'conversion' AND cv.attributed_click_id = s.click_id
     )
   ORDER BY s.ts_effective
`;

/**
 * The whole world, in one read transaction.
 *
 * One transaction and not four, because the emitter acts on all of it at once: an `ads` row read
 * before a lever and an `F` read after it would have the emitter delivering a paused ad's fatigue,
 * or pacing against a budget that no longer exists. `readTx` is BEGIN DEFERRED — under WAL a reader
 * needs no lock to get a stable snapshot (B07), so this cannot block the ingest writer.
 */
export function simWorld(
  db: DatabaseSync,
  nowMs = Date.now(),
  /**
   * B35a: the pending set is served ONLY on request. §15.3(b) makes it a boot-time handover — the
   * set is fixed at `T0` and only shrinks — so putting it in the 1 Hz poll was paying 1.96 MiB and
   * ~62 ms a second for a fact that changes once. Default `false`, so the hot path is small unless
   * a caller opts in, rather than small only if every caller remembers to opt out.
   */
  includePending = false,
): SimWorld {
  return readTx(db, () => {
    const dayStartMs = localDayStartMs(nowMs);
    const dayStart = new Date(dayStartMs).toISOString();

    const spendByAd = new Map<string, number>();
    for (const row of db.prepare(SPEND_SQL).all(dayStart) as { ad_id: string; cents: number }[]) {
      spendByAd.set(row.ad_id, row.cents);
    }

    const ads = (
      db
        .prepare(
          `SELECT ad_id, status, video_id, headline_id, audience_id, channel,
                  daily_budget_cents, current_generation_id, last_decision_seq
             FROM ads ORDER BY ad_id`,
        )
        .all() as Omit<WorldAd, 'spend_so_far_today_cents'>[]
    ).map((ad) => ({ ...ad, spend_so_far_today_cents: spendByAd.get(ad.ad_id) ?? 0 }));

    const deliveries = db.prepare(DELIVERIES_SQL).all() as WorldDelivery[];

    // §16's window is the 7-day LAG CUTOFF, not the 72 h settlement horizon: a click older than
    // the cutoff can no longer produce a conversion at all (§11.1), so it is not pending.
    const pending = !includePending
      ? null
      : (db.prepare(PENDING_CLICKS_SQL).all(
          new Date(nowMs - CONVERSION_LAG_CUTOFF_MS).toISOString(),
        ) as { ad_id: string; ts: string; click_id: string }[]);

    const scenarios = db
      .prepare(
        `SELECT scenario_id, name, args_json, ts FROM sim_scenarios
          WHERE consumed_at IS NULL ORDER BY ts`,
      )
      .all() as { scenario_id: string; name: string; args_json: string; ts: string }[];

    // D60: §14's first term, served so the emitter does not hold one. Read inside the same
    // transaction as everything else, so a poll cannot see the seed of one world and the ads of
    // another. `sim_run` is not a projection, so this read is unremarkable — but the SQL stays
    // UNQUALIFIED like every other statement outside `verify.ts` (D55).
    const run =
      (db
        .prepare('SELECT seed, t0, backfill_days FROM sim_run WHERE id = 1')
        .get() as { seed: string; t0: string; backfill_days: number } | undefined) ?? null;

    return {
      run,
      // Across ads, not per ad: the emitter wants one number to compare against its last poll, and
      // `ads.last_decision_seq` is per-ad (the fold's position for that ad). MAX is what "has
      // anything changed" needs; the per-ad values are in the rows for anyone who needs more.
      last_decision_seq: ads.reduce((max, ad) => Math.max(max, ad.last_decision_seq), 0),
      account_day: { tz: ACCOUNT_TZ, starts_at: dayStart },
      ads,
      deliveries,
      pending_backfill_clicks: pending === null ? null : pending.map((c) => ({
        click_id: c.click_id,
        ad_id: c.ad_id,
        ts: c.ts,
      })),
      pending_scenarios: scenarios,
    };
  });
}
