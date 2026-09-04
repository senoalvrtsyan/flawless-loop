// Seeder part 1: the static reference data, and the portfolio's origin in the decision log.
// SIMULATOR.md §2, §15; DESIGN.md §3.2. B15.
//
// The seeder is DESIGN §3.2's privileged fixture writer: it writes `components` and `audiences`
// directly (static reference data, U3 — neither is a projection, so D7 does not cover them), and
// it creates every ad the only way an ad can be created — by appending `create_ad` and `launch`
// decisions and letting the fold run. There is no INSERT into `ads` anywhere in this file, and
// there must never be one: `ads` is a projection and `applyDecision()` is its only writer.
//
// This is the FIRST caller of applyDecision() outside a test, and the first place D53's backdating
// happens.

import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openDb, tx, DB_PATH } from '../server/db.ts';
import { applyDecision } from '../server/apply.ts';
import { ACTOR } from '../shared/decisions.ts';
import { ADS, AUDIENCES, COMPONENTS } from './fixtures.ts';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export type SeedResult = { t0: string; decisions: number; ads: number; generations: number };

/**
 * Seed the world. `t0` is **T0** — the seed boundary (§15.3(b)), which under **D53** is simply the
 * seeder's boot instant. It is passed in rather than read from the clock so the caller owns the
 * time, the way `ingest()`'s `now` and `apply()`'s `applied_at` are owned by their callers.
 *
 * **T0 needs no column.** It is recoverable from the log: the seven-day ads' `launch.ts` plus seven
 * days. B34 owes only the question of whether to make that explicit.
 *
 * Refuses a non-empty world rather than merging into one. A second run with the same fixtures would
 * be *harmless* — `decision_id` is derived, so U5 would replay every decision — but it would also
 * silently re-date nothing and leave a store whose `T0` no longer matches its own launches. The
 * supported reset is deleting `data/` (U8).
 */
export function seedWorld(db: DatabaseSync, t0: Date): SeedResult {
  const existing = (db.prepare('SELECT COUNT(*) AS c FROM ads').get() as { c: number }).c;
  if (existing > 0) {
    throw new Error(
      `${DB_PATH}: ${existing} ads already exist — the seeder builds a world, it does not merge ` +
      `into one. Delete data/ and re-run \`npm run db:migrate\` to reset (U8).`,
    );
  }

  // Reference data in one transaction: a half-written component library would leave the ad
  // decisions below failing on a foreign key, which is a confusing way to learn the disk is full.
  tx(db, () => {
    const component = db.prepare(`
      INSERT INTO components (component_id, kind, payload, created_at, lineage_id, version, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const audience = db.prepare(`
      INSERT INTO audiences (audience_id, geo, temperature, est_size) VALUES (?, ?, ?, ?)
    `);
    // Every component predates every ad — a component created after the ad that uses it would be
    // a fact the Workbench's version history could not explain.
    const createdAt = new Date(t0.getTime() - 8 * DAY_MS).toISOString();
    for (const c of COMPONENTS) {
      component.run(c.component_id, c.kind, c.payload, createdAt, c.lineage_id, c.version, c.parent_id);
    }
    for (const a of AUDIENCES) {
      audience.run(a.audience_id, a.geo, a.temperature, a.est_size);
    }
  });

  // D53: backdated to T0 − live_days, so `config_generations` covers the whole backfilled week and
  // D14's credited_generation_id is a real answer on seeded data rather than NULL for every row.
  // U7 is untouched: it constrains `POST /api/decisions`, where `ts` is server-assigned. The
  // seeder is in-process and passes `ts` itself — D51's stated consequence, D53's ratified one.
  //
  // Ads are seeded in ascending launch order so `decision_seq` runs in the same order as the world
  // it describes. Nothing requires it, and a reader who found them interleaved would waste an hour
  // deciding whether it mattered.
  const ordered = [...ADS].sort((x, y) => y.live_days - x.live_days);
  let decisions = 0;

  for (const ad of ordered) {
    const launchTs = new Date(t0.getTime() - ad.live_days * DAY_MS).toISOString();
    // One minute of `draft` before going live. Real history, not padding: it is the interval in
    // which the config existed and served nothing, and D5 is what makes that interval free.
    const createTs = new Date(t0.getTime() - ad.live_days * DAY_MS - MINUTE_MS).toISOString();

    for (const [decision_id, ts, body] of [
      [`d_create_${ad.ad_id}`, createTs, {
        action: 'create_ad' as const,
        initial: {
          name: ad.name, video_id: ad.video_id, headline_id: ad.headline_id,
          audience_id: ad.audience_id, channel: ad.channel,
          daily_budget_cents: ad.daily_budget_cents,
        },
      }],
      [`d_launch_${ad.ad_id}`, launchTs, { action: 'launch' as const }],
    ] as const) {
      const result = applyDecision(db, {
        decision_id, ts, actor: ACTOR, ad_id: ad.ad_id,
        // Brief L95 requires a rationale on every decision, and the seeded ones are no exception:
        // "the world started this way" is the honest one, and it is what the decision log will
        // show a reviewer who scrolls to the bottom.
        rationale: `seeded world: ${ad.name} launched ${ad.live_days}d before T0`,
        body,
      });
      if (!result.ok) {
        throw new Error(`seed: ${decision_id} was refused — ${result.error.code}: ${result.error.message}`);
      }
      decisions += 1;
    }
  }

  return {
    t0: t0.toISOString(),
    decisions,
    ads: (db.prepare('SELECT COUNT(*) AS c FROM ads').get() as { c: number }).c,
    generations: (db.prepare('SELECT COUNT(*) AS c FROM config_generations').get() as { c: number }).c,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version === 0) {
    throw new Error(`${DB_PATH}: store is not migrated — run \`npm run db:migrate\` first`);
  }
  const result = seedWorld(db, new Date());
  console.log(`[seed] store ${DB_PATH}`);
  console.log(`[seed] T0 = ${result.t0}`);
  console.log(`[seed] ${result.decisions} decisions -> ${result.ads} ads, ${result.generations} generations`);
  db.close();
}
