// B43 — the restatement timeline's derivation, under D43's criterion.
//
// The whole entry is arithmetic on top of a bucket, and every way of getting it wrong produces a
// sentence that reads perfectly:
//
//   - a `before` that forgets to subtract equals `after`, so the entry says "ROAS 2.4 → 2.4" and
//     the demo's centrepiece silently claims nothing moved;
//   - subtracting ALL credited conversions rather than only the late ones understates `before`, so a
//     bucket that went from one conversion to two reads as if it went from zero;
//   - lateness measured from the conversion's own `ts` rather than from the BUCKET's minute reads
//     hours instead of days, which is the difference between "arrived late" and "arrived after we
//     had closed the books" — the second is the only one that explains a restatement;
//   - ordering by `restated_at` instead of by the bucket's minute makes every entry read "recently"
//     and destroys the one thing §5.6 asks the timeline to show.
//
// The fixture is `restate.test.ts`'s world: an orphan conversion, then its click four days later,
// which is the exact shape all ten restatements in the seeded week have.

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
import { restatements } from './restatements.ts';
import { ACTOR } from '../shared/decisions.ts';

const HOUR = 3_600_000;
const ORIGIN = new Date(Date.UTC(2026, 8, 1, 11, 0)).toISOString();
/** The click's minute: Sep 1, 12:02. */
const CLICK_TS = new Date(Date.UTC(2026, 8, 1, 12, 2)).toISOString();
const CLICK_MINUTE = new Date(Date.UTC(2026, 8, 1, 12, 2)).toISOString();
/** Sep 5 — four days later, past the 72 h horizon, so the click's bucket is settled when it lands. */
const LATE = new Date(Date.UTC(2026, 8, 5, 12, 0)).toISOString();
const WINDOW = {
  from: new Date(Date.UTC(2026, 8, 1, 0, 0)).toISOString(),
  to: new Date(Date.UTC(2026, 8, 2, 0, 0)).toISOString(),
  ads: null,
};

function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-restatements-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'demo', ORIGIN, 'vl_04', 1, null);
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

/**
 * The bucket at 12:02 as the seeded week's restatements are shaped: a click and a conversion that
 * BOTH arrive on time (so the bucket has a real `before`), plus spend, and then a second conversion
 * on the same click delivered four days late.
 */
function settledThenLate(db: DatabaseSync): void {
  // On time: the click, an impression, its cost, and one conversion.
  ingest(db, [
    { event_id: 'k1', ts: CLICK_TS, ad_id: 'a_12', event: 'click', click_id: 'ck1', cost_cents: 100 },
    { event_id: 'i1', ts: CLICK_TS, ad_id: 'a_12', event: 'impression' },
    { event_id: 's1', ts: CLICK_TS, ad_id: 'a_12', event: 'spend', amount_cents: 900 },
  ], 'live', () => CLICK_TS);
  const soon = new Date(Date.parse(CLICK_TS) + 2 * HOUR).toISOString();
  ingest(db, [{ event_id: 'cv_ontime', ts: soon, ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 2_000 }], 'live', () => soon);
  // And the late one, arriving on Sep 5 — four days after the bucket it lands in.
  ingest(db, [{ event_id: 'cv_late', ts: LATE, ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck1', value_cents: 8_000 }], 'live', () => LATE);
}

test('before and after are BOTH real: the subtraction is only the late arrival', (t) => {
  const db = world(t);
  settledThenLate(db);

  const entries = restatements(db, WINDOW);
  assert.equal(entries.length, 1, 'one restated bucket');
  const entry = entries[0];
  assert.ok(entry !== undefined);
  assert.equal(entry.ad_id, 'a_12');
  assert.equal(entry.minute_start, CLICK_MINUTE, 'the entry sits at the BUCKET’s minute');

  // Total spend is 100 + 900 = 1,000c and does not move; the conversions do.
  assert.equal(entry.after.conversions, 2);
  assert.equal(entry.after.value_cents, 10_000);
  assert.equal(entry.before.conversions, 1, 'the on-time conversion is NOT subtracted');
  assert.equal(entry.before.value_cents, 2_000);
  assert.equal(entry.after.spend_total_cents, 1_000);
  assert.equal(entry.before.spend_total_cents, 1_000, 'spend is the same fact it always was');

  // §5.6's sentence, in numbers: ROAS 2.00 → 10.00, +1 conversion, $80.
  assert.equal(entry.before.roas, 2);
  assert.equal(entry.after.roas, 10);
  assert.equal(entry.after.conversions - entry.before.conversions, 1);
  assert.equal(entry.after.value_cents - entry.before.value_cents, 8_000);
  // And CPA improves as the cohort fills in — the lag D27 predicts, made visible.
  assert.equal(entry.before.cpa_cents, 1_000);
  assert.equal(entry.after.cpa_cents, 500);
});

test('lateness is measured from the BUCKET’s minute, and it is what explains the restatement', (t) => {
  const db = world(t);
  settledThenLate(db);

  const entry = restatements(db, WINDOW)[0];
  assert.ok(entry !== undefined);
  const expected = Date.parse(LATE) - Date.parse(CLICK_MINUTE);
  assert.equal(entry.lateness_ms, expected);
  assert.ok(entry.lateness_ms > 72 * HOUR, 'past the horizon — which is WHY the bucket restated');
  assert.equal(entry.arrivals.length, 1, 'only the late arrival is evidence');
  assert.equal(entry.arrivals[0]?.event_id, 'cv_late');
  assert.equal(entry.explained, true, 'one late arrival accounts for one restatement');
});

test('the on-time conversion’s own bucket is NOT in the timeline', (t) => {
  const db = world(t);
  settledThenLate(db);
  const entries = restatements(db, WINDOW);
  // Everything is credited to the click's minute (D27-B), so there is exactly one bucket with
  // counts and exactly one entry. A derivation that listed every bucket a late event touched
  // would list the same minute twice.
  assert.deepEqual(entries.map((e) => e.minute_start), [CLICK_MINUTE]);
});

test('an ad filter narrows the timeline the same way it narrows the chart', (t) => {
  const db = world(t);
  settledThenLate(db);
  assert.equal(restatements(db, { ...WINDOW, ads: ['a_12'] }).length, 1);
  assert.equal(restatements(db, { ...WINDOW, ads: ['a_05'] }).length, 0, 'a_05 restated nothing');
});

test('a window that excludes the bucket excludes the entry — the window is the bucket’s time', (t) => {
  const db = world(t);
  settledThenLate(db);
  // Sep 5, when the restatement HAPPENED. The entry does not appear here, and that is the point:
  // the timeline is ordered by which period moved, not by when we found out.
  const sep5 = {
    from: new Date(Date.UTC(2026, 8, 5, 0, 0)).toISOString(),
    to: new Date(Date.UTC(2026, 8, 6, 0, 0)).toISOString(),
    ads: null,
  };
  assert.equal(restatements(db, sep5).length, 0);
  assert.equal(restatements(db, WINDOW).length, 1);
});

test('a horizon sweep changes what counts as late — P16/B49 leans on this parameter', (t) => {
  const db = world(t);
  settledThenLate(db);
  // With a ten-day horizon nothing in this store has settled, so the arrival is no longer late and
  // the bucket's restatement can no longer be explained by it. Reported, not hidden.
  const entries = restatements(db, WINDOW, 10 * 24 * HOUR);
  assert.equal(entries.length, 1, 'the bucket still carries restated_at — that was stamped at write');
  assert.equal(entries[0]?.arrivals.length, 0);
  assert.equal(entries[0]?.explained, false, 'an unexplained restatement announces itself');
});
