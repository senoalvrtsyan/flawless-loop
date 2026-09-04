// D43 names attribution as one of the four functions that get an automated test, and the reason
// is visible here: every wrong answer below still produces a plausible number on screen. A
// conversion credited to the wrong minute makes CPA(T) wrong for two buckets and right in total;
// a conversion credited to the conversion's own ad instead of the click's moves revenue between
// two live ads. Neither raises anything, and B24's sweep re-derives from the same function.
//
// B17 has no caller — conversions enter ingest at B18 — so the fixture is hand-built.

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
import { generationAt, resolveAttribution, type ConversionFacts } from './attribute.ts';
import { ACTOR } from '../shared/decisions.ts';

const T = (m: number): string => new Date(Date.UTC(2026, 8, 4, 12, m)).toISOString();

/** A store with two live ads, each with a real generation chain, and one click on each. */
function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-attr-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'Product demo, 30s', T(0), 'vl_04', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_05', 'video', 'recut', T(0), 'vl_04', 2, 'v_04');
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
  // A swap on a_12 at 12:20 — so a click before it and a click after it fall in DIFFERENT
  // generations, which is the whole point of D14.
  applyDecision(db, {
    decision_id: 'd_swap', ts: T(20), actor: ACTOR, ad_id: 'a_12', rationale: 'fatigue',
    body: { action: 'swap_component', slot: 'video', from_id: 'v_04', to_id: 'v_05' },
  });

  // Clicks through the REAL ingest path, so `ts_effective` is the store's own generated value.
  ingest(db, [
    { event_id: 'e_click_early', ts: T(10), ad_id: 'a_12', event: 'click', click_id: 'c_early', cost_cents: 62 },
    { event_id: 'e_click_late', ts: T(30), ad_id: 'a_12', event: 'click', click_id: 'c_late', cost_cents: 55 },
    { event_id: 'e_click_other', ts: T(30), ad_id: 'a_05', event: 'click', click_id: 'c_other', cost_cents: 71 },
  ], 'backfill', (i) => T(40 + i));
  return db;
}

const conversion = (over: Partial<ConversionFacts> = {}): ConversionFacts => ({
  event_id: 'e_conv', ad_id: 'a_12', ts_effective: T(58), attributed_click_id: 'c_early', ...over,
});

test('D27-B: a resolved conversion is credited to its CLICK\'s minute, not its own', (t) => {
  const a = resolveAttribution(world(t), conversion(), T(59));
  assert.equal(a.state, 'resolved');
  assert.equal(a.click_event_id, 'e_click_early');
  assert.equal(a.credited_minute, T(10), 'credited at the conversion\'s own minute — CPA(T) is now two unrelated populations');
  assert.equal(a.resolved_at, T(59));
});

test('D14: the generation is the one covering the CLICK, across a swap', (t) => {
  const db = world(t);
  const early = resolveAttribution(db, conversion({ attributed_click_id: 'c_early' }), T(59));
  const late = resolveAttribution(db, conversion({ attributed_click_id: 'c_late' }), T(59));
  // a_12: gen 1 draft [12:00,12:01) · gen 2 live [12:01,12:20) · gen 3 live+v_05 [12:20,∞)
  assert.equal(early.credited_generation_id, 'g_a_12_002');
  assert.equal(late.credited_generation_id, 'g_a_12_003');
  assert.notEqual(early.credited_generation_id, late.credited_generation_id);
});

test('I8/G30: the click is authoritative, and a disagreement is COUNTED not reconciled', (t) => {
  // The conversion claims a_05; its click happened on a_12. Revenue follows the click.
  const a = resolveAttribution(world(t), conversion({ ad_id: 'a_05' }), T(59));
  assert.equal(a.credited_ad_id, 'a_12');
  assert.equal(a.ad_id_conflict, 1);
  assert.equal(a.state, 'resolved', 'a conflict is a flag, never a rejection');
});

test('no conflict is flagged when the two agree', (t) => {
  assert.equal(resolveAttribution(world(t), conversion(), T(59)).ad_id_conflict, 0);
});

test('D16: an unmatched conversion is an orphan held at its OWN minute, never dropped', (t) => {
  const a = resolveAttribution(world(t), conversion({ attributed_click_id: 'c_nope' }), T(59));
  assert.equal(a.state, 'orphan_provisional');
  assert.equal(a.click_event_id, null);
  assert.equal(a.credited_minute, T(58));
  assert.equal(a.credited_ad_id, 'a_12', 'the conversion\'s own claim, until a click overrides it');
  assert.equal(a.credited_generation_id, null);
  assert.equal(a.resolved_at, null, 'an orphan is not resolved, so it carries no resolution time');
});

test('a click on another ad is not borrowed: click_id is the only key', (t) => {
  const a = resolveAttribution(world(t), conversion({ attributed_click_id: 'c_other' }), T(59));
  assert.equal(a.credited_ad_id, 'a_05');
  assert.equal(a.ad_id_conflict, 1);
  assert.equal(a.credited_generation_id, 'g_a_05_002');
});

test('generationAt: half-open windows, and no generation before the ad existed', (t) => {
  const db = world(t);
  assert.equal(generationAt(db, 'a_12', T(0)), 'g_a_12_001', 'valid_from is INCLUSIVE');
  assert.equal(generationAt(db, 'a_12', T(1)), 'g_a_12_002', 'valid_to is EXCLUSIVE');
  assert.equal(generationAt(db, 'a_12', T(19)), 'g_a_12_002');
  assert.equal(generationAt(db, 'a_12', T(20)), 'g_a_12_003');
  // The failure D53 chose against: an event older than the create_ad decision has no config.
  assert.equal(generationAt(db, 'a_12', new Date(Date.UTC(2026, 8, 1)).toISOString()), null);
  assert.equal(generationAt(db, 'a_99', T(10)), null);
});

test('D7: this module writes nothing — the projection is untouched', (t) => {
  const db = world(t);
  resolveAttribution(db, conversion(), T(59));
  resolveAttribution(db, conversion({ attributed_click_id: 'c_nope' }), T(59));
  const rows = (db.prepare('SELECT COUNT(*) AS c FROM conversion_attribution').get() as { c: number }).c;
  assert.equal(rows, 0, 'attribute.ts wrote a projection — apply() is its only writer (D7)');
});
