// B18 — the conversion, end to end: ingest -> apply -> the CLICK's bucket.
//
// B17's own row deferred its `curl` verification here, and D43's criterion is what puts this in
// `node --test` rather than in a terminal: every wrong answer below is a plausible number. A
// conversion credited to its own minute makes CPA(T) wrong in two buckets and right in total; one
// credited to the ad its body names instead of the ad its click happened on moves revenue between
// two live ads. Neither raises anything, and B24's sweep re-derives from the same function, so it
// agrees with the mistake.

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
import { ACTOR } from '../shared/decisions.ts';

const T = (m: number): string => new Date(Date.UTC(2026, 8, 4, 12, m)).toISOString();

type Row = { conversions: number; value_cents: number; max_ingest_seq: number };

/** Two live ads, and one click on each: `c_12` at 12:02 on a_12, `c_05` at 12:03 on a_05. */
function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-conv-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'Product demo, 30s', T(0), 'vl_04', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('h_04', 'headline', 'copy', T(0), 'hl_04', 1, null);
  db.prepare('INSERT INTO audiences VALUES (?,?,?,?)').run('cold_us', 'US', 'cold', 2_400_000);

  for (const ad_id of ['a_12', 'a_05']) {
    applyDecision(db, {
      decision_id: `d_create_${ad_id}`, ts: T(0), actor: ACTOR, ad_id, rationale: 'seed',
      body: { action: 'create_ad', initial: { name: ad_id, video_id: 'v_04', headline_id: 'h_04',
        audience_id: 'cold_us', channel: 'meta_feed', daily_budget_cents: 50_000 } },
    });
    applyDecision(db, {
      decision_id: `d_launch_${ad_id}`, ts: T(1), actor: ACTOR, ad_id, rationale: 'seed',
      body: { action: 'launch' },
    });
  }
  ingest(db, [
    { event_id: 'e_c12', ts: T(2), ad_id: 'a_12', event: 'click', click_id: 'c_12', cost_cents: 62 },
    { event_id: 'e_c05', ts: T(3), ad_id: 'a_05', event: 'click', click_id: 'c_05', cost_cents: 71 },
  ], 'backfill', (i) => T(4 + i));
  return db;
}

const bucket = (db: DatabaseSync, ad_id: string, minute: string): Row | undefined =>
  db.prepare('SELECT conversions, value_cents, max_ingest_seq FROM rollup_minute WHERE ad_id = ? AND minute_start = ?')
    .get(ad_id, minute) as Row | undefined;

test('D27-B: the conversion lands in its CLICK\'s minute, and not in its own', (t) => {
  const db = world(t);
  // Clicked at 12:02, bought at 12:40 — 38 minutes of human hesitation, one cohort.
  const { result } = ingest(db, [{ event_id: 'e_conv', ts: T(40), ad_id: 'a_12',
    event: 'conversion', attributed_click_id: 'c_12', value_cents: 4_500 }], 'live', () => T(41));
  assert.equal(result.accepted, 1);

  assert.equal(bucket(db, 'a_12', T(2))?.conversions, 1, 'the click\'s minute did not take it');
  assert.equal(bucket(db, 'a_12', T(2))?.value_cents, 4_500);
  assert.equal(bucket(db, 'a_12', T(40)), undefined, 'a bucket was created at the CONVERSION\'s minute');
});

test('the resume contract: the credited bucket\'s max_ingest_seq rises to the conversion', (t) => {
  const db = world(t);
  const before = bucket(db, 'a_12', T(2))?.max_ingest_seq ?? 0;
  const { result } = ingest(db, [{ event_id: 'e_conv', ts: T(40), ad_id: 'a_12',
    event: 'conversion', attributed_click_id: 'c_12', value_cents: 4_500 }], 'live', () => T(41));
  // Without this, a bucket days old moves and every resuming client is told nothing — and B24
  // cannot catch it, because the counts are right (BUILD_PLAN §14).
  assert.equal(bucket(db, 'a_12', T(2))?.max_ingest_seq, result.ingest_seq);
  assert.ok(result.ingest_seq > before);
});

test('I8/G30: the click\'s ad is credited, the conversion\'s claim is only flagged', (t) => {
  const db = world(t);
  // The body says a_12; the click `c_05` happened on a_05. Revenue follows the click.
  ingest(db, [{ event_id: 'e_conv', ts: T(40), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'c_05', value_cents: 900 }], 'live', () => T(41));

  assert.equal(bucket(db, 'a_05', T(3))?.conversions, 1);
  assert.equal(bucket(db, 'a_12', T(2))?.conversions, 0, 'revenue was credited to the ad the body named');
  const attr = db.prepare('SELECT * FROM conversion_attribution WHERE event_id = ?').get('e_conv') as
    { state: string; credited_ad_id: string; ad_id_conflict: number; credited_generation_id: string };
  assert.equal(attr.state, 'resolved');
  assert.equal(attr.credited_ad_id, 'a_05');
  assert.equal(attr.ad_id_conflict, 1, 'the disagreement was silently reconciled');
  assert.equal(attr.credited_generation_id, 'g_a_05_002', 'D14: the generation live at the CLICK');
});

test('D16: an orphan is recorded, not dropped — and moves no settled count', (t) => {
  const db = world(t);
  const { result } = ingest(db, [{ event_id: 'e_orphan', ts: T(40), ad_id: 'a_12',
    event: 'conversion', attributed_click_id: 'c_nobody', value_cents: 7_700 }], 'live', () => T(41));
  assert.equal(result.accepted, 1, 'an unattributable conversion is still a fact about the stream');

  const attr = db.prepare('SELECT state, credited_minute, resolved_at FROM conversion_attribution WHERE event_id = ?')
    .get('e_orphan') as { state: string; credited_minute: string; resolved_at: string | null };
  assert.equal(attr.state, 'orphan_provisional');
  assert.equal(attr.credited_minute, T(40), 'an orphan has no click-minute, so it holds its own');
  assert.equal(attr.resolved_at, null);
  // Settled counts stay put whatever B19 later does with the `provisional_*` columns.
  const settled = db.prepare('SELECT COALESCE(SUM(conversions), 0) AS n, COALESCE(SUM(value_cents), 0) AS v FROM rollup_minute')
    .get() as { n: number; v: number };
  assert.equal(settled.n, 0, 'an orphan was counted as an attributed conversion');
  assert.equal(settled.v, 0, 'an orphan\'s value entered the settled total');
});

test('validation: the conversion\'s two fields, and no other kind\'s', (t) => {
  const db = world(t);
  const reasons = ingest(db, [
    { event_id: 'e_1', ts: T(40), ad_id: 'a_12', event: 'conversion', value_cents: 10 },
    { event_id: 'e_2', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c_12' },
    { event_id: 'e_3', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c_12', value_cents: -1 },
    { event_id: 'e_4', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c_12', value_cents: 10, cost_cents: 5 },
    { event_id: 'e_5', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c_12', value_cents: 0 },
  ], 'live', () => T(41)).result;
  assert.equal(reasons.rejected_invalid, 4);
  assert.deepEqual(reasons.outcomes.map((o) => o.reason ?? 'ok'), [
    'attributed_click_id_missing_or_not_a_string',
    'value_cents_not_a_non_negative_integer',
    'value_cents_not_a_non_negative_integer',
    'conversion_has_cost_cents',
    'ok',
  ]);
  assert.equal(bucket(db, 'a_12', T(2))?.conversions, 1, 'U4: a zero-value conversion still counts');
});

test('D10: the rollup carries additive counts and no stored total', (t) => {
  const columns = (world(t).prepare('SELECT name FROM pragma_table_info(?)').all('rollup_minute') as
    { name: string }[]).map((c) => c.name);
  assert.deepEqual(columns, [
    'ad_id', 'minute_start', 'impressions', 'clicks', 'click_cost_cents', 'spend_cents',
    'conversions', 'value_cents', 'provisional_conversions', 'provisional_value_cents',
    'first_written_at', 'restated_at', 'restatement_count', 'max_ingest_seq',
  ], 'total spend is click_cost_cents + spend_cents at READ time — a stored third can disagree with its parts');
});
