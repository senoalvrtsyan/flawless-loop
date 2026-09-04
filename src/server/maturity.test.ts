// B41 — D33's maturity indicator, under D43's criterion.
//
// This is a number whose wrongness is not only invisible but FLATTERING, which is the worst
// combination on a surface meant to be honest:
//
//   - measured over every resolved conversion rather than over settled cohorts only, the curve is
//     biased short by survivorship — recent cohorts have contributed their fast conversions and not
//     yet their slow ones — so every quantile reads earlier than the truth and the screen claims
//     more maturity than it has. Nothing errors; the label just lies in the comforting direction;
//   - the lag measured from the conversion's own `ts` instead of its CLICK's `ts` answers a
//     different question (how long the shopper took, not how long we waited) and reads far shorter;
//   - a CDF read with `>` instead of `>=`, or interpolated between quantiles, moves the headline
//     percentage by a few points with no way to tell from the screen.
//
// The fixture is built to make the bias measurable: two cohorts, one settled and one young, with
// deliberately different lag distributions.

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
import { MIN_SAMPLE, maturityCurve, maturityFor, shareAt } from './maturity.ts';
import { ACTOR } from '../shared/decisions.ts';

const HOUR = 3_600_000;
const ORIGIN = new Date(Date.UTC(2026, 8, 1, 0, 0)).toISOString();
/** "Now". The 72 h horizon therefore settles everything credited before Sep 7. */
const NOW = new Date(Date.UTC(2026, 8, 10, 0, 0)).toISOString();
const iso = (ms: number): string => new Date(ms).toISOString();

function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-maturity-'));
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
  applyDecision(db, {
    decision_id: 'd_create', ts: ORIGIN, actor: ACTOR, ad_id: 'a_12', rationale: 'seed',
    body: { action: 'create_ad', initial: { name: 'a_12', video_id: 'v_04', headline_id: 'h_04',
      audience_id: 'cold_us', channel: 'meta_feed', daily_budget_cents: 50_000 } },
  });
  applyDecision(db, {
    decision_id: 'd_launch', ts: ORIGIN, actor: ACTOR, ad_id: 'a_12', rationale: 'seed',
    body: { action: 'launch' },
  });
  return db;
}

/** A click at `clickTs`, and its conversion arriving `lagHours` after the CLICK. */
function pair(db: DatabaseSync, n: number, clickTs: string, lagHours: number): void {
  ingest(db, [{ event_id: `k${n}`, ts: clickTs, ad_id: 'a_12', event: 'click',
    click_id: `ck${n}`, cost_cents: 62 }], 'backfill', () => clickTs);
  const received = iso(Date.parse(clickTs) + lagHours * HOUR);
  ingest(db, [{ event_id: `cv${n}`, ts: received, ad_id: 'a_12', event: 'conversion',
    attributed_click_id: `ck${n}`, value_cents: 5_000 }], 'backfill', () => received);
}

test('the curve is measured over SETTLED cohorts only — the survivorship bias, priced', (t) => {
  const db = world(t);
  // A settled cohort (Sep 1, six days before the horizon): thirty conversions, ten each at 1, 20
  // and 40 hours — so a third of the distribution has arrived by the first hour.
  const settled = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
  for (let n = 0; n < 30; n++) pair(db, n, settled, n < 10 ? 1 : n < 20 ? 20 : 40);
  // A YOUNG cohort (Sep 9, inside the horizon): thirty pairs, and only their FAST conversions have
  // arrived — which is exactly the shape that biases an all-conversions curve short.
  const young = new Date(Date.UTC(2026, 8, 9, 6, 0)).toISOString();
  for (let n = 100; n < 130; n++) pair(db, n, young, 1);

  const curve = maturityCurve(db, NOW);
  assert.equal(curve.sample_size, 30, 'the young cohort is excluded — it is not finished arriving');
  assert.equal(curve.fallback, false, 'thirty settled conversions is a real curve');
  assert.equal(curve.settled_before, '2026-09-07T00:00:00.000Z', 'now minus the 72 h horizon');
  // A third of the settled cohort had arrived within the hour, and the curve is sampled at 5%
  // steps, so the reported share is the largest step at or below 1/3 — 0.30, never rounded up.
  assert.equal(shareAt(curve, 1 * HOUR), 0.3);
  // Include the young cohort and the same evaluation reads 40 of 60 — twice as mature, entirely
  // wrong, and no more suspicious-looking on screen than the truth.
  assert.ok(shareAt(curve, 1 * HOUR) < 40 / 60);
});

test('the lag is measured from the CLICK, not from the conversion’s own ts', (t) => {
  const db = world(t);
  const settled = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
  // 30 conversions at a 10-hour lag, so the sample clears MIN_SAMPLE and no fallback fires.
  for (let n = 0; n < MIN_SAMPLE; n++) pair(db, n, settled, 10);

  const curve = maturityCurve(db, NOW);
  assert.equal(curve.sample_size, MIN_SAMPLE);
  assert.equal(curve.fallback, false);
  // Every lag is 10 h. So 9 h 59 m of age is 0% mature and 10 h is 100%.
  assert.equal(shareAt(curve, 10 * HOUR - 60_000), 0);
  assert.equal(shareAt(curve, 10 * HOUR), 1);
  // Measured from the conversion's own `ts` every lag would be ZERO (these arrive at their own ts),
  // and the curve would claim the data is complete the instant it is emitted.
  assert.ok(curve.quantiles.every((q) => q.lag_ms === 10 * HOUR));
});

test('the seeded share is disclosed — §15.4, because seeded arrival times are DESIGNED', (t) => {
  const db = world(t);
  const settled = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
  pair(db, 1, settled, 5);
  // One live pair, ingested with source 'live'.
  ingest(db, [{ event_id: 'k9', ts: settled, ad_id: 'a_12', event: 'click',
    click_id: 'ck9', cost_cents: 62 }], 'live', () => settled);
  const received = iso(Date.parse(settled) + 5 * HOUR);
  ingest(db, [{ event_id: 'cv9', ts: received, ad_id: 'a_12', event: 'conversion',
    attributed_click_id: 'ck9', value_cents: 5_000 }], 'live', () => received);

  const curve = maturityCurve(db, NOW);
  assert.equal(curve.sample_size, 2);
  assert.equal(curve.seeded, 1);
  assert.equal(curve.live, 1);
  assert.equal(curve.seeded + curve.live, curve.sample_size, 'the split must account for all of it');
});

test('an empty store falls back to D33’s fixed curve and SAYS so', (t) => {
  const db = world(t);
  const curve = maturityCurve(db, NOW);
  assert.equal(curve.sample_size, 0);
  assert.equal(curve.fallback, true, 'a percentage drawn from nothing must announce itself');
  assert.deepEqual(
    curve.quantiles.map((q) => q.share),
    [0.5, 0.8, 0.95],
    'D33’s cold-start curve, verbatim: 50% @ 1 h, 80% @ 6 h, 95% @ 24 h',
  );
  assert.equal(shareAt(curve, 6 * HOUR), 0.8);
});

test('the CDF is a STEP function and never claims 100% past its last observation', (t) => {
  const db = world(t);
  const settled = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
  for (let n = 0; n < MIN_SAMPLE; n++) pair(db, n, settled, n < 15 ? 2 : 30);

  const curve = maturityCurve(db, NOW);
  assert.equal(shareAt(curve, 0), 0, 'no age, no maturity');
  assert.equal(shareAt(curve, 2 * HOUR), 0.5, 'half arrived by two hours');
  assert.equal(shareAt(curve, 10 * HOUR), 0.5, 'and nothing more until the slow half lands');
  assert.equal(shareAt(curve, 30 * HOUR), 1);
  // A year later it is still 1 and not more — the ECDF's own maximum, not an extrapolation.
  assert.equal(shareAt(curve, 365 * 24 * HOUR), 1);
});

test('maturityFor evaluates the window’s own newest and oldest minute', (t) => {
  const db = world(t);
  const settled = new Date(Date.UTC(2026, 8, 1, 6, 0)).toISOString();
  for (let n = 0; n < MIN_SAMPLE; n++) pair(db, n, settled, 10);

  const window = { from: iso(Date.parse(NOW) - 24 * HOUR), to: NOW };
  const m = maturityFor(db, window, NOW);
  assert.equal(m.newest_minute, iso(Date.parse(NOW) - 60_000), 'to is EXCLUSIVE: one minute back');
  assert.equal(m.newest_share, 0, 'a minute old, against a 10-hour lag: nothing has arrived');
  assert.equal(m.oldest_minute, window.from);
  assert.equal(m.oldest_share, 1, 'a day old: complete');
});
