// B23 — replay over a log prefix. DESIGN §10.2, §10.3.
//
// Two things are being asserted here and the second matters as much as the first: that the
// recomputation AGREES with the incrementally-maintained rollup, and that it reaches the answer
// WITHOUT looking at it. A replay that peeks at `rollup_minute` agrees with it by construction and
// proves nothing — so the last test in this file counts the tables the function opens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { ingest } from './ingest.ts';
import { applyDecision } from './apply.ts';
import { replay } from './replay.ts';
import { ACTOR } from '../shared/decisions.ts';

const T = (m: number): string => new Date(Date.UTC(2026, 8, 1, 12, m)).toISOString();
const WINDOW = { from: T(0), to: T(59) };

function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-replay-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'demo', T(0), 'vl_04', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('h_04', 'headline', 'copy', T(0), 'hl_04', 1, null);
  db.prepare('INSERT INTO audiences VALUES (?,?,?,?)').run('cold_us', 'US', 'cold', 2_400_000);
  for (const ad_id of ['a_12', 'a_05']) {
    applyDecision(db, { decision_id: `d_c_${ad_id}`, ts: T(0), actor: ACTOR, ad_id,
      rationale: 'seed',
      body: { action: 'create_ad', initial: { name: ad_id, video_id: 'v_04', headline_id: 'h_04',
        audience_id: 'cold_us', channel: 'meta_feed', daily_budget_cents: 50_000 } } });
    applyDecision(db, { decision_id: `d_l_${ad_id}`, ts: T(1), actor: ACTOR, ad_id,
      rationale: 'seed', body: { action: 'launch' } });
  }
  return db;
}

/** The incrementally-maintained answer, for the same window — the other route to the number. */
function fromRollup(db: DatabaseSync, ad_id: string): Record<string, number> {
  return db.prepare(`
    SELECT COALESCE(SUM(impressions), 0) AS impressions, COALESCE(SUM(clicks), 0) AS clicks,
           COALESCE(SUM(click_cost_cents), 0) AS click_cost_cents,
           COALESCE(SUM(spend_cents), 0) AS spend_cents,
           COALESCE(SUM(conversions), 0) AS conversions,
           COALESCE(SUM(value_cents), 0) AS value_cents,
           COALESCE(SUM(provisional_conversions), 0) AS provisional_conversions,
           COALESCE(SUM(provisional_value_cents), 0) AS provisional_value_cents
      FROM rollup_minute WHERE ad_id = ? AND minute_start >= ? AND minute_start < ?
  `).get(ad_id, WINDOW.from, WINDOW.to) as unknown as Record<string, number>;
}

const seq = (db: DatabaseSync): number =>
  (db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS n FROM signals').get() as { n: number }).n;

test('P14 in miniature: the recomputation agrees with the maintained rollup', (t) => {
  const db = world(t);
  ingest(db, [
    { event_id: 'i1', ts: T(2), ad_id: 'a_12', event: 'impression' },
    { event_id: 'i2', ts: T(2), ad_id: 'a_12', event: 'impression' },
    { event_id: 'i3', ts: T(9), ad_id: 'a_12', event: 'impression' },
    { event_id: 's1', ts: T(3), ad_id: 'a_12', event: 'spend', amount_cents: 900 },
    { event_id: 'k1', ts: T(5), ad_id: 'a_12', event: 'click', click_id: 'ck1', cost_cents: 62 },
    { event_id: 'k2', ts: T(6), ad_id: 'a_05', event: 'click', click_id: 'ck2', cost_cents: 71 },
    // Late conversion: lands in ck1's minute, T(5), not its own T(40).
    { event_id: 'cv1', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck1', value_cents: 4_500 },
    // Its body claims a_12 but ck2 happened on a_05 — the click wins (I8/G30).
    { event_id: 'cv2', ts: T(41), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck2', value_cents: 300 },
    // An orphan, held provisionally at its own minute on its own claimed ad.
    { event_id: 'cv3', ts: T(42), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'nope', value_cents: 700 },
    { event_id: 'i4', ts: T(9), ad_id: 'a_05', event: 'impression' },
  ], 'live', (i) => T(45 + i));

  for (const ad_id of ['a_12', 'a_05']) {
    const result = replay(db, { ad_id, ...WINDOW, as_of_ingest_seq: seq(db) });
    assert.deepEqual({ ...result.counts }, { ...fromRollup(db, ad_id) }, ad_id);
  }

  // And the numbers are the ones the design says, not merely two things that match.
  const a12 = replay(db, { ad_id: 'a_12', ...WINDOW, as_of_ingest_seq: seq(db) });
  assert.equal(a12.counts.impressions, 3);
  assert.equal(a12.counts.conversions, 1, 'cv2 was credited to a_12 on its body\'s word');
  assert.equal(a12.counts.value_cents, 4_500);
  assert.equal(a12.counts.provisional_conversions, 1);
  assert.equal(a12.counts.provisional_value_cents, 700);
  const a05 = replay(db, { ad_id: 'a_05', ...WINDOW, as_of_ingest_seq: seq(db) });
  assert.equal(a05.counts.conversions, 1, 'cv2 belongs to a_05 — its click happened there');
  assert.equal(a05.counts.value_cents, 300);
});

test('the contributing events are named, in log order, including the backdated conversion', (t) => {
  const db = world(t);
  ingest(db, [
    { event_id: 'i1', ts: T(2), ad_id: 'a_12', event: 'impression' },
    { event_id: 'k1', ts: T(5), ad_id: 'a_12', event: 'click', click_id: 'ck1', cost_cents: 62 },
    { event_id: 'cv1', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck1', value_cents: 4_500 },
  ], 'live', (i) => T(45 + i));

  // The window STOPS at T(10) — so the conversion's own ts is far outside it, and it is still in
  // the list, because its click's minute is inside. That is D27-B, visible as evidence.
  const result = replay(db, { ad_id: 'a_12', from: T(0), to: T(10), as_of_ingest_seq: seq(db) });
  assert.deepEqual(result.contributing_event_ids, ['i1', 'k1', 'cv1']);
  assert.equal(result.counts.conversions, 1);
});

test('§10.3: the same descriptor at two log positions gives two correct answers', (t) => {
  const db = world(t);
  // The conversion arrives first and orphans; its click follows and promotes it.
  ingest(db, [{ event_id: 'cv1', ts: T(9), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 4_500 }], 'live', () => T(45));
  const before = seq(db);
  ingest(db, [{ event_id: 'k1', ts: T(5), ad_id: 'a_12', event: 'click', click_id: 'ck1',
    cost_cents: 62 }], 'live', () => T(46));
  const after = seq(db);

  const then = replay(db, { ad_id: 'a_12', ...WINDOW, as_of_ingest_seq: before });
  assert.equal(then.counts.provisional_conversions, 1, 'the past screen showed it as provisional');
  assert.equal(then.counts.conversions, 0);

  const now = replay(db, { ad_id: 'a_12', ...WINDOW, as_of_ingest_seq: after });
  assert.equal(now.counts.provisional_conversions, 0, 'the promotion is not visible');
  assert.equal(now.counts.conversions, 1);
  assert.equal(now.counts.value_cents, 4_500);
  // And the later replay agrees with the maintained rollup, which the earlier one no longer can —
  // the restatement expressed as the difference between two replays of one unchanged log.
  assert.deepEqual({ ...now.counts }, { ...fromRollup(db, 'a_12') });
  assert.notDeepEqual({ ...then.counts }, { ...fromRollup(db, 'a_12') });
});

test('the prefix bounds attribution too, not just counting', (t) => {
  const db = world(t);
  ingest(db, [{ event_id: 'k1', ts: T(5), ad_id: 'a_12', event: 'click', click_id: 'ck1',
    cost_cents: 62 }], 'live', () => T(45));
  const beforeConversion = seq(db);
  ingest(db, [{ event_id: 'cv1', ts: T(40), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 4_500 }], 'live', () => T(46));

  // At the earlier position the click exists and the conversion does not.
  const early = replay(db, { ad_id: 'a_12', ...WINDOW, as_of_ingest_seq: beforeConversion });
  assert.equal(early.counts.clicks, 1);
  assert.equal(early.counts.conversions, 0, 'a conversion beyond the prefix was counted');
  assert.deepEqual(early.contributing_event_ids, ['k1']);
});

test('the window is half-open on the CREDITED minute', (t) => {
  const db = world(t);
  ingest(db, [
    { event_id: 'i1', ts: T(10), ad_id: 'a_12', event: 'impression' },
    { event_id: 'i2', ts: T(20), ad_id: 'a_12', event: 'impression' },
  ], 'live', (i) => T(45 + i));
  const at = seq(db);
  assert.equal(replay(db, { ad_id: 'a_12', from: T(10), to: T(20), as_of_ingest_seq: at })
    .counts.impressions, 1, 'from is inclusive and to is exclusive');
  assert.equal(replay(db, { ad_id: 'a_12', from: T(10), to: T(21), as_of_ingest_seq: at })
    .counts.impressions, 2);
});

test('replay reads the raw log and NEVER rollup_minute — §10.2', () => {
  // Asserted against the source, not by observing behaviour: a replay that read the rollup would
  // agree with it by construction, so no behavioural test can distinguish the two. This is the
  // same reasoning as B22's D55 tripwire.
  const source = readFileSync(new URL('./replay.ts', import.meta.url), 'utf8');
  // Comments are stripped rather than line-filtered: the projections are NAMED in the commentary
  // that explains why they are not read, so a prefix filter both misses a single-line `/** */`
  // and would flag prose. What is being asserted is the SQL, so only SQL is scanned.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const referenced = ['rollup_minute', 'conversion_attribution', 'ads', 'config_generations']
    .filter((p) => new RegExp(`(FROM|JOIN|INTO|UPDATE)\\s+(main\\.|temp\\.)?${p}\\b`, 'i').test(code));
  assert.deepEqual(referenced, [],
    'replay.ts queries a projection — it must recompute from raw `signals` only (§10.2)');
  assert.match(code, /FROM signals/, 'replay.ts should read signals');
});
