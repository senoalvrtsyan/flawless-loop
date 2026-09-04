// B45 — §19's fatigue flag, under D43's criterion, and this one is worth the tests because a
// heuristic that is wrong is not *visibly* wrong: it just flags the wrong creative, and a
// strategist swaps something that was working.
//
// The four ways it fails silently:
//
//   - **gating on the wrong count.** §19 says "counting only points that clear D20's impression
//     gate". Count every point and a quiet night's noise-driven CTR becomes the peak, so every ad
//     reads as fatiguing the next morning;
//   - **a peak measured over the window instead of over the pair's LIFE.** A trailing-6h peak makes
//     the drop nearly always zero, because the current value is one of the candidates for the peak
//     it is compared against;
//   - **fewer than three qualifying points accepted.** Two points make a "trend" out of nothing,
//     and it is the low-volume ads — the ones §19 says we are slowest to flag — that hit this;
//   - **"no reading" rendered as "healthy".** Silence about a pair the gate suppressed is the exact
//     failure §19's third limit names, and the flag must say which of the two it means.

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
import { DROP, MIN_POINTS, fatigueReport } from './fatigue-flag.ts';
import { BARS } from '../web/gate.ts';
import { ACTOR } from '../shared/decisions.ts';

const MINUTE = 60_000;
const ORIGIN = new Date(Date.UTC(2026, 8, 1, 0, 0)).toISOString();

function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-fatigue-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  // One lineage per slot, one audience — the pair under test is `vl_burn × cold_us`.
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_burn', 'video', 'demo', ORIGIN, 'vl_burn', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('h_burn', 'headline', 'copy', ORIGIN, 'hl_burn', 1, null);
  db.prepare('INSERT INTO audiences VALUES (?,?,?,?)').run('cold_us', 'US', 'cold', 2_400_000);
  applyDecision(db, {
    decision_id: 'd_create', ts: ORIGIN, actor: ACTOR, ad_id: 'a_burn', rationale: 'seed',
    body: { action: 'create_ad', initial: { name: 'burner', video_id: 'v_burn',
      headline_id: 'h_burn', audience_id: 'cold_us', channel: 'meta_feed',
      daily_budget_cents: 50_000 } },
  });
  applyDecision(db, {
    decision_id: 'd_launch', ts: ORIGIN, actor: ACTOR, ad_id: 'a_burn', rationale: 'seed',
    body: { action: 'launch' },
  });
  return db;
}

/**
 * Write one 15-minute point: `impressions` and `clicks`, all inside that quarter hour.
 *
 * Written through `ingest()` rather than into `rollup_minute`, because D7 says only `apply()`
 * writes a projection and a test that breaks that rule is testing a store no code path produces.
 * One impression event carries one impression, so the counts here are deliberately small multiples
 * of the bar rather than realistic volumes.
 */
function point(db: DatabaseSync, quarterIndex: number, impressions: number, clicks: number): void {
  const base = Date.UTC(2026, 8, 1, 6, 0) + quarterIndex * 15 * MINUTE;
  const events: unknown[] = [];
  for (let i = 0; i < impressions; i++) {
    events.push({
      event_id: `i_${quarterIndex}_${i}`,
      ts: new Date(base + (i % 15) * MINUTE).toISOString(),
      ad_id: 'a_burn',
      event: 'impression',
    });
  }
  for (let i = 0; i < clicks; i++) {
    events.push({
      event_id: `k_${quarterIndex}_${i}`,
      ts: new Date(base + (i % 15) * MINUTE).toISOString(),
      ad_id: 'a_burn',
      event: 'click',
      click_id: `ck_${quarterIndex}_${i}`,
      cost_cents: 62,
    });
  }
  const at = new Date(base + 20 * MINUTE).toISOString();
  ingest(db, events, 'backfill', () => at);
}

const videoPair = (db: DatabaseSync) =>
  fatigueReport(db).pairs.find((p) => p.slot === 'video' && p.lineage === 'vl_burn');

test('a pair whose CTR collapses is FLAGGED, and the drop is against its lifetime peak', (t) => {
  const db = world(t);
  // Six early points at 4% CTR (the peak), then six late ones at 1% — a burnout.
  for (let q = 0; q < 6; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.04));
  for (let q = 6; q < 12; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.01));

  const pair = videoPair(db);
  assert.ok(pair !== undefined);
  assert.equal(pair.flagged, true);
  assert.ok(pair.peak !== null && pair.peak > 0.03, `peak was the early plateau, got ${pair.peak}`);
  assert.ok(pair.current !== null && pair.current < 0.02, 'and the current reading is the late one');
  assert.ok((pair.drop ?? 0) >= DROP, `${pair.drop} must clear the ${DROP} bar`);
  assert.equal(pair.reason, null, 'a flagged pair needs no excuse');
  assert.ok(pair.points_current >= MIN_POINTS && pair.points_peak >= MIN_POINTS);
});

test('the PEAK is the pair’s whole life, not the trailing window', (t) => {
  const db = world(t);
  // The peak is set in the first hour and then never approached again. A window-local peak would
  // compare the last six hours against themselves and report no drop at all.
  for (let q = 0; q < 4; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.06));
  for (let q = 4; q < 40; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.02));

  const pair = videoPair(db);
  assert.ok(pair !== undefined);
  assert.ok(pair.peak !== null && pair.peak > 0.05, 'the peak survives nine hours of decline');
  assert.equal(pair.flagged, true);
  // The peak's own timestamp is in the first hour, which is what lets the surface say when.
  assert.ok(pair.peak_at !== null && pair.peak_at < '2026-09-01T08:00:00.000Z', pair.peak_at ?? '');
});

test('only points that CLEAR THE GATE count — a thin point cannot set the peak', (t) => {
  const db = world(t);
  // One thin point with a wild 20% CTR over 100 impressions: below D20's 500-impression bar, so it
  // is not evidence. Then a steady 2% plateau that clears the bar.
  point(db, 0, 100, 20);
  for (let q = 1; q < 8; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.02));

  const pair = videoPair(db);
  assert.ok(pair !== undefined);
  assert.ok(pair.peak !== null && pair.peak < 0.05, `the 20% point was ignored, peak ${pair.peak}`);
  assert.equal(pair.flagged, false, 'a flat 2% pair is not fatiguing');
  assert.match(pair.reason ?? '', /under the 25% bar/);
});

test('fewer than three qualifying points is NO READING, and it says why', (t) => {
  const db = world(t);
  // Two qualifying points only — §19 requires three in each window.
  point(db, 0, BARS.ctr.min, 20);
  point(db, 1, BARS.ctr.min, 4);

  const pair = videoPair(db);
  assert.ok(pair !== undefined);
  assert.equal(pair.current, null);
  assert.equal(pair.peak, null);
  assert.equal(pair.flagged, false);
  // Not "healthy" — the honest failure mode, and §19's third limit named on the row itself.
  assert.match(pair.reason ?? '', /fewer than 3 points clear 500 impressions/);
  assert.match(pair.reason ?? '', /the gate suppresses this pair/);
});

test('every point below the gate means no reading at all — §19’s slowest case', (t) => {
  const db = world(t);
  for (let q = 0; q < 12; q++) point(db, q, 100, 3); // 100 impressions a quarter hour: never clears
  const pair = videoPair(db);
  assert.ok(pair !== undefined);
  assert.equal(pair.points_current, 0);
  assert.equal(pair.flagged, false);
  assert.match(pair.reason ?? '', /the gate suppresses this pair/);
});

test('both slots are reported, and the ad→pair map comes from the fold’s head', (t) => {
  const db = world(t);
  for (let q = 0; q < 8; q++) point(db, q, BARS.ctr.min, Math.round(BARS.ctr.min * 0.02));

  const report = fatigueReport(db);
  assert.deepEqual(
    report.pairs.map((p) => `${p.slot}:${p.lineage}`).sort(),
    ['headline:hl_burn', 'video:vl_burn'],
    '§19 measures the pair, and the surface has to attribute it to the slot',
  );
  // Spread before comparing: `node:sqlite` returns rows with a null prototype, so a
  // `deepStrictEqual` against an object literal fails on the prototype while every field matches.
  assert.deepEqual(report.ads.map((ad) => ({ ...ad })), [
    { ad_id: 'a_burn', audience_id: 'cold_us', video_lineage: 'vl_burn', headline_lineage: 'hl_burn' },
  ]);
});
