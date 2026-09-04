// B20 — restatement. DESIGN.md §5.4, SIMULATOR.md §15.3(c), D38.
//
// §13 calls this the hardest chunk and it is single-gated for the reason every assertion below
// shows: the counts come out right in almost every wrong implementation. A missing `restated_at`
// leaves a bucket that silently moved after we said it was closed; a doubled `restatement_count`
// is one number on screen being wrong by one; settlement clocked at wall-clock `now` instead of
// the event's `received_at` stamps tens of thousands of spurious restatements on the seeded week
// and none of it raises anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { ingest } from './ingest.ts';
import { applyDecision } from './apply.ts';
import { settledAt } from './attribute.ts';
import { ACTOR } from '../shared/decisions.ts';

/** Sep 1, the day the clicks happen. `NOW` is Sep 5 — four days later, well past the 72 h horizon. */
const D1 = (m: number): string => new Date(Date.UTC(2026, 8, 1, 12, m)).toISOString();
const NOW = new Date(Date.UTC(2026, 8, 5, 12, 0)).toISOString();
const ORIGIN = new Date(Date.UTC(2026, 8, 1, 11, 0)).toISOString();

type Row = {
  conversions: number; value_cents: number;
  provisional_conversions: number; provisional_value_cents: number;
  restated_at: string | null; restatement_count: number; max_ingest_seq: number;
};

/** Two live ads and NO clicks — every click in these tests is the one that arrives late. */
function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-restate-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'Product demo, 30s', ORIGIN, 'vl_04', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('h_04', 'headline', 'copy', ORIGIN, 'hl_04', 1, null);
  db.prepare('INSERT INTO audiences VALUES (?,?,?,?)').run('cold_us', 'US', 'cold', 2_400_000);

  for (const ad_id of ['a_12', 'a_05']) {
    applyDecision(db, {
      decision_id: `d_create_${ad_id}`, ts: ORIGIN, actor: ACTOR, ad_id, rationale: 'seed',
      body: { action: 'create_ad', initial: { name: ad_id, video_id: 'v_04', headline_id: 'h_04',
        audience_id: 'cold_us', channel: 'meta_feed', daily_budget_cents: 50_000 } },
    });
    applyDecision(db, {
      decision_id: `d_launch_${ad_id}`, ts: ORIGIN, actor: ACTOR, ad_id, rationale: 'seed',
      body: { action: 'launch' },
    });
  }
  return db;
}

const bucket = (db: DatabaseSync, ad_id: string, minute: string): Row | undefined =>
  db.prepare(`SELECT conversions, value_cents, provisional_conversions, provisional_value_cents,
                     restated_at, restatement_count, max_ingest_seq
                FROM rollup_minute WHERE ad_id = ? AND minute_start = ?`)
    .get(ad_id, minute) as Row | undefined;

/** An orphan conversion at 12:05 on Sep 1, parked four days before its click shows up. */
const orphan = (db: DatabaseSync, over: Record<string, unknown> = {}): void => {
  ingest(db, [{ event_id: 'cv1', ts: D1(5), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck_late', value_cents: 5_000, ...over }], 'live', () => D1(6));
};

/** The withheld click, at 12:02 on Sep 1, delivered on Sep 5. */
const lateClick = (db: DatabaseSync, over: Record<string, unknown> = {}) =>
  ingest(db, [{ event_id: 'k1', ts: D1(2), ad_id: 'a_12', event: 'click',
    click_id: 'ck_late', cost_cents: 62, ...over }], 'live', () => NOW);

test('the orphan promotes: TWO buckets change, and the provisional one is decremented', (t) => {
  const db = world(t);
  orphan(db);
  assert.equal(bucket(db, 'a_12', D1(5))?.provisional_conversions, 1, 'parked before its click');

  const { dirty } = lateClick(db);

  const from = bucket(db, 'a_12', D1(5));
  const to = bucket(db, 'a_12', D1(2));
  assert.equal(from?.provisional_conversions, 0, 'the provisional credit was left behind');
  assert.equal(from?.provisional_value_cents, 0);
  assert.equal(to?.conversions, 1, 'the click\'s minute did not take the promoted conversion');
  assert.equal(to?.value_cents, 5_000);
  assert.equal(to?.provisional_conversions, 0, 'it arrived as provisional rather than settled');

  // Both buckets are announced, or a resuming client keeps whichever half it already had.
  assert.deepEqual(new Set(dirty.map((k) => k.minute_start)), new Set([D1(2), D1(5)]));
});

test('the promotion rewrites the attribution row in full, not just its state', (t) => {
  const db = world(t);
  // The conversion claims a_05; the click that resolves it happened on a_12 (I8/G30).
  orphan(db, { ad_id: 'a_05' });
  const before = db.prepare('SELECT * FROM conversion_attribution WHERE event_id = ?').get('cv1') as
    { state: string; credited_ad_id: string; credited_generation_id: string | null };
  assert.equal(before.state, 'orphan_provisional');
  assert.equal(before.credited_ad_id, 'a_05', 'the orphan holds its own claim until a click lands');
  assert.equal(before.credited_generation_id, null);

  lateClick(db);

  const after = db.prepare('SELECT * FROM conversion_attribution WHERE event_id = ?').get('cv1') as
    { state: string; click_event_id: string; credited_ad_id: string; credited_minute: string;
      credited_generation_id: string; ad_id_conflict: number; resolved_at: string };
  assert.equal(after.state, 'resolved');
  assert.equal(after.click_event_id, 'k1');
  assert.equal(after.credited_ad_id, 'a_12', 'the click is authoritative once it exists');
  assert.equal(after.credited_minute, D1(2));
  assert.equal(after.credited_generation_id, 'g_a_12_002', 'D14: the generation live at the click');
  assert.equal(after.ad_id_conflict, 1, 'the disagreement is surfaced, not reconciled away');
  assert.equal(after.resolved_at, NOW);
});

test('P7: a bucket that had settled and moved anyway is stamped, and counted once', (t) => {
  const db = world(t);
  orphan(db);
  lateClick(db);

  const from = bucket(db, 'a_12', D1(5));
  assert.equal(from?.restated_at, NOW, 'a settled bucket moved and said nothing');
  assert.equal(from?.restatement_count, 1);

  // The click's own minute was MATERIALISED by this same event. It was not settled — it was
  // absent — so nothing was restated, whichever order the two writes to it happened in.
  const to = bucket(db, 'a_12', D1(2));
  assert.equal(to?.restated_at, null, 'a bucket this event created was marked restated');
  assert.equal(to?.restatement_count, 0);
});

test('restatement_count bumps ONCE per bucket, not once per write', (t) => {
  const db = world(t);
  // Two orphans, both waiting on the same click, both landing in the same minute when promoted.
  ingest(db, [
    { event_id: 'cv1', ts: D1(5), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck_late', value_cents: 5_000 },
    { event_id: 'cv2', ts: D1(5), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck_late', value_cents: 1_000 },
  ], 'live', () => D1(6));
  // And a third already sitting in the click's own minute, so the click touches that bucket twice.
  ingest(db, [{ event_id: 'cv3', ts: D1(2), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck_late', value_cents: 700 }], 'live', () => D1(3));

  lateClick(db);

  const from = bucket(db, 'a_12', D1(5));
  assert.equal(from?.provisional_conversions, 0);
  assert.equal(from?.restatement_count, 1, 'two conversions left one bucket and it counted twice');

  const to = bucket(db, 'a_12', D1(2));
  assert.equal(to?.conversions, 3, 'all three promoted into the click\'s minute');
  assert.equal(to?.value_cents, 6_700);
  assert.equal(to?.provisional_conversions, 0, 'cv3 was promoted out of provisional in place');
  // cv3's own bucket IS the click's bucket: created by cv3, then moved twice by the click.
  assert.equal(to?.restatement_count, 1, 'one event, one bucket, one restatement');
});

test('every touched bucket raises max_ingest_seq — the resume contract', (t) => {
  const db = world(t);
  orphan(db);
  const { result } = lateClick(db);
  // The decremented bucket's COUNTS changed but nothing about it references the click, so this is
  // the case §14 names: get it wrong and B24 cannot catch it, because the counts are right.
  assert.equal(bucket(db, 'a_12', D1(5))?.max_ingest_seq, result.ingest_seq);
  assert.equal(bucket(db, 'a_12', D1(2))?.max_ingest_seq, result.ingest_seq);
});

test('a late conversion into an already-settled bucket restates it', (t) => {
  const db = world(t);
  // The click arrives on time on Sep 1 and its bucket is written then.
  ingest(db, [{ event_id: 'k1', ts: D1(2), ad_id: 'a_12', event: 'click', click_id: 'ck1',
    cost_cents: 62 }], 'live', () => D1(2));
  assert.equal(bucket(db, 'a_12', D1(2))?.restated_at, null);

  // Its conversion turns up four days later — the brief's own sentence, L83.
  ingest(db, [{ event_id: 'cv1', ts: NOW, ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 4_500 }], 'live', () => NOW);

  const b = bucket(db, 'a_12', D1(2));
  assert.equal(b?.conversions, 1);
  assert.equal(b?.restated_at, NOW, 'a period we called closed changed and did not say so');
  assert.equal(b?.restatement_count, 1);
});

test('D38: settlement is clocked at received_at, NOT wall-clock now', (t) => {
  const db = world(t);
  // The seed path: a four-day-old click and its conversion, both DELIVERED four days ago. Nothing
  // here was ever settled at the moment it arrived, so nothing is a restatement — with wall-clock
  // `now` every one of these would be stamped and the demo would open on a fabricated history.
  ingest(db, [{ event_id: 'k1', ts: D1(2), ad_id: 'a_12', event: 'click', click_id: 'ck1',
    cost_cents: 62 }], 'backfill', () => D1(2));
  ingest(db, [{ event_id: 'cv1', ts: D1(9), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 4_500 }], 'backfill', () => D1(10));

  const b = bucket(db, 'a_12', D1(2));
  assert.equal(b?.conversions, 1, 'the conversion still lands in its click\'s minute');
  assert.equal(b?.restated_at, null, 'a backfilled event was stamped against the boot clock');
  assert.equal(b?.restatement_count, 0);
  // And the arithmetic itself, at the boundary.
  assert.equal(settledAt(D1(2), D1(10)), false);
  assert.equal(settledAt(D1(2), NOW), true, 'four days later the same bucket is settled');
});

test('a reorder inside ONE batch resolves too — orphan, then promotion, one transaction', (t) => {
  const db = world(t);
  // §13's short reorder, at its tightest: the conversion is element 0 and its click element 1.
  // ingest() walks the batch in order, so the conversion parks as an orphan and the click promotes
  // it before the transaction commits — a reader never sees the intermediate state.
  const { result } = ingest(db, [
    { event_id: 'cv1', ts: D1(9), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck1', value_cents: 4_500 },
    { event_id: 'k1', ts: D1(2), ad_id: 'a_12', event: 'click', click_id: 'ck1', cost_cents: 62 },
  ], 'live', () => NOW);
  assert.equal(result.accepted, 2);

  const own = bucket(db, 'a_12', D1(9));
  assert.equal(own?.provisional_conversions, 0, 'the provisional credit was never taken back');
  const clicks = bucket(db, 'a_12', D1(2));
  assert.equal(clicks?.conversions, 1);
  assert.equal(clicks?.value_cents, 4_500);
  assert.equal((db.prepare('SELECT state FROM conversion_attribution WHERE event_id = ?')
    .get('cv1') as { state: string }).state, 'resolved');
});
