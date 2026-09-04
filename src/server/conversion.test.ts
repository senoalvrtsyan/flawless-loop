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
import { HORIZON_MS, attributionStateAt, orphanTally } from './attribute.ts';
import { ACTOR } from '../shared/decisions.ts';

const T = (m: number): string => new Date(Date.UTC(2026, 8, 4, 12, m)).toISOString();

type Row = { conversions: number; value_cents: number; max_ingest_seq: number;
             provisional_conversions: number; provisional_value_cents: number };

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
  db.prepare(`SELECT conversions, value_cents, provisional_conversions, provisional_value_cents,
                     max_ingest_seq FROM rollup_minute WHERE ad_id = ? AND minute_start = ?`)
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
  // The settled counts stay put; B19's `provisional_*` credit sits alongside them, never in them.
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

// -----------------------------------------------------------------------------------------
// B19 — the orphan: provisional at its own minute, and expiry derived at read (D54).
// -----------------------------------------------------------------------------------------

/** `at`, moved by whole hours. Expiry is measured from the bucket's close, not from its start. */
const hoursAfter = (iso: string, h: number): string =>
  new Date(Date.parse(iso) + h * 3_600_000).toISOString();

test('D16: the orphan is credited PROVISIONALLY, at its own minute', (t) => {
  const db = world(t);
  ingest(db, [{ event_id: 'e_orphan', ts: T(40), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'c_nobody', value_cents: 7_700 }], 'live', () => T(41));

  const own = bucket(db, 'a_12', T(40));
  assert.equal(own?.provisional_conversions, 1);
  assert.equal(own?.provisional_value_cents, 7_700);
  assert.equal(own?.conversions, 0, 'an orphan entered the settled count');
  assert.equal(own?.value_cents, 0, 'an orphan\'s revenue entered the settled total');
  assert.equal(bucket(db, 'a_12', T(2))?.provisional_conversions, 0,
    'the click\'s bucket took an orphan that names no click');
});

test('the orphan\'s bucket is dirty, and its max_ingest_seq rises', (t) => {
  const db = world(t);
  const { result, dirty } = ingest(db, [{ event_id: 'e_orphan', ts: T(40), ad_id: 'a_12',
    event: 'conversion', attributed_click_id: 'c_nobody', value_cents: 7_700 }], 'live', () => T(41));
  // A key handed to the flush must name a row that exists — stream.ts logs "apply/flush disagree"
  // otherwise — and the resume contract needs the seq raised or no resuming client is told.
  assert.deepEqual(dirty.map((k) => [k.ad_id, k.minute_start]), [['a_12', T(40)]]);
  assert.equal(bucket(db, 'a_12', T(40))?.max_ingest_seq, result.ingest_seq);
});

test('D54: expiry is DERIVED — the horizon runs from the bucket\'s close', () => {
  const row = { state: 'orphan_provisional' as const, credited_minute: T(40) };
  // The bucket closes at T(41); the horizon runs 72 h from there.
  const close = hoursAfter(T(41), 0);
  assert.equal(attributionStateAt(row, hoursAfter(close, 71)), 'orphan_provisional');
  assert.equal(attributionStateAt(row, hoursAfter(close, 72)), 'orphan_provisional',
    'the boundary is STRICTLY past the horizon, matching §5.4\'s settled_at');
  assert.equal(attributionStateAt(row, hoursAfter(close, 73)), 'orphan_expired');
  assert.equal(HORIZON_MS, 72 * 3_600_000);
  // A resolved conversion never expires, whatever the clock says.
  assert.equal(attributionStateAt({ state: 'resolved', credited_minute: T(40) },
    hoursAfter(close, 1_000)), 'resolved');
});

test('D54: nothing WRITES orphan_expired — the column holds two states', (t) => {
  const db = world(t);
  ingest(db, [{ event_id: 'e_orphan', ts: T(40), ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'c_nobody', value_cents: 7_700 }], 'live', () => T(41));
  // Read it a decade later: the STORED state has not moved, because no clock touches a projection.
  const stored = db.prepare('SELECT state FROM conversion_attribution WHERE event_id = ?')
    .get('e_orphan') as { state: string };
  assert.equal(stored.state, 'orphan_provisional');
  const anyExpired = db.prepare(`SELECT COUNT(*) AS c FROM conversion_attribution
                                  WHERE state = 'orphan_expired'`).get() as { c: number };
  assert.equal(anyExpired.c, 0, 'a clock reached a projection — B22 will diverge on a correct store');
});

test('§5.2\'s data-health figure: the orphan tally, split by derived state', (t) => {
  const db = world(t);
  ingest(db, [
    // Two orphans ten minutes apart, and one conversion that resolves against a real click.
    { event_id: 'e_old', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'x1', value_cents: 89_000 },
    { event_id: 'e_new', ts: T(50), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'x2', value_cents: 1_200 },
    { event_id: 'e_ok', ts: T(50), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c_12', value_cents: 500 },
  ], 'live', (i) => T(51 + i));

  // A clock five minutes past e_old's horizon and five minutes short of e_new's: the two states
  // are separated by the read instant alone, with nothing in the store distinguishing them.
  const at = hoursAfter(T(41), 72);
  const tally = orphanTally(db, new Date(Date.parse(at) + 5 * 60_000).toISOString());
  assert.equal(tally.orphan_expired.conversions, 1);
  assert.equal(tally.orphan_expired.value_cents, 89_000, '"1 conversion, $890, no matching click"');
  assert.equal(tally.orphan_provisional.conversions, 1);
  assert.equal(tally.orphan_provisional.value_cents, 1_200);

  // Read an hour earlier and NEITHER has expired — same rows, same store, different answer.
  const earlier = orphanTally(db, hoursAfter(T(41), 71));
  assert.equal(earlier.orphan_expired.conversions, 0);
  assert.equal(earlier.orphan_provisional.conversions, 2);

  // Never deleted, and the resolved one is not in the tally at either instant.
  const total = db.prepare('SELECT COUNT(*) AS c FROM conversion_attribution').get() as { c: number };
  assert.equal(total.c, 3);
});
