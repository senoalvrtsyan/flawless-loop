// B50a. Six properties. The first two are the whole reason D19 refused a naive comparison.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCORING_WINDOW_MS, scoreDecisions } from './scoring.ts';
import { HORIZON_MS } from '../shared/config.ts';

const H = (h: number): number => h * 3_600_000;
/** The decision's instant, and a `now` far enough past it that both windows have settled. */
const TS = Date.UTC(2026, 8, 1, 12, 0);
const LATER = new Date(TS + SCORING_WINDOW_MS + HORIZON_MS + 60_000).toISOString();

function store(t: { after: (fn: () => void) => void }): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE decisions (
      decision_id TEXT PRIMARY KEY, decision_seq INTEGER NOT NULL, ts TEXT NOT NULL,
      ad_id TEXT NOT NULL, action TEXT NOT NULL) STRICT;
    CREATE TABLE rollup_minute (
      ad_id TEXT NOT NULL, minute_start TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
      click_cost_cents INTEGER NOT NULL DEFAULT 0, spend_cents INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0, value_cents INTEGER NOT NULL DEFAULT 0,
      provisional_conversions INTEGER NOT NULL DEFAULT 0,
      provisional_value_cents INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ad_id, minute_start)) STRICT;
  `);
  return db;
}

const decide = (db: DatabaseSync, seq: number, atMs: number, action = 'set_budget', ad = 'a_12'): void => {
  db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?, ?)')
    .run(`d${seq}`, seq, new Date(atMs).toISOString(), ad, action);
};

/** One minute of delivery `offsetMin` minutes from the decision. */
const bucket = (
  db: DatabaseSync, offsetMin: number,
  c: { impressions?: number; clicks?: number; conversions?: number; click_cost_cents?: number },
  ad = 'a_12',
): void => {
  db.prepare(`INSERT INTO rollup_minute
    (ad_id, minute_start, impressions, clicks, conversions, click_cost_cents)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    ad, new Date(TS + offsetMin * 60_000).toISOString(),
    c.impressions ?? 0, c.clicks ?? 0, c.conversions ?? 0, c.click_cost_cents ?? 0);
};

test('a score is WITHHELD until both windows are past the lateness horizon — D19/D13', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  bucket(db, -10, { impressions: 1000, clicks: 20, conversions: 2, click_cost_cents: 1000 });
  bucket(db, 10, { impressions: 1000, clicks: 40, conversions: 4, click_cost_cents: 1000 });

  // One minute after the after-window closes: nowhere near settled.
  const early = scoreDecisions(db, new Date(TS + SCORING_WINDOW_MS + 60_000).toISOString());
  assert.equal(early[0]?.score, null);
  assert.equal(early[0]?.withheld?.reason, 'settling');
  // The bias this prevents is one-directional: the before-window has had longer to accumulate
  // late conversions, so an unguarded comparison makes EVERY decision look worse than it was.
  assert.ok((early[0]?.withheld as { hours_remaining: number }).hours_remaining > 0);

  const late = scoreDecisions(db, LATER);
  assert.notEqual(late[0]?.score, null);
});

test('the settled test uses the window’s END, not the decision’s ts', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  bucket(db, -10, { impressions: 1000, clicks: 20 });
  bucket(db, 10, { impressions: 1000, clicks: 40 });
  // Horizon has passed since the DECISION, but the after-window has not closed + horizon yet.
  // Testing `ts` instead of `after_to` would call this ready six hours early, with the
  // after-window still filling — a score computed over half its own evidence.
  const at = new Date(TS + HORIZON_MS + 60_000).toISOString();
  assert.equal(scoreDecisions(db, at)[0]?.withheld?.reason, 'settling');
});

test('CPA improves when it FALLS and CTR when it rises — direction is per metric', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  // Before: 2 conversions for $10.00 → CPA $5.00. After: 4 for $10.00 → CPA $2.50.
  bucket(db, -10, { impressions: 1000, clicks: 20, conversions: 2, click_cost_cents: 1000 });
  bucket(db, 10, { impressions: 1000, clicks: 20, conversions: 4, click_cost_cents: 1000 });
  const score = scoreDecisions(db, LATER)[0]?.score;
  assert.equal(score?.metric, 'cpa');
  assert.equal(score?.before, 500);
  assert.equal(score?.after, 250);
  assert.equal(Math.round(score?.delta_pct ?? 0), -50);
  // CPA halved, so `improved` is TRUE despite delta_pct being negative. Reading `delta_pct > 0`
  // as "improved" flips the verdict on every CPA-scored decision and reads perfectly normally.
  assert.equal(score?.improved, true);
});

test('CTR is used when either window has no conversions to make a CPA from', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  bucket(db, -10, { impressions: 1000, clicks: 20 });
  bucket(db, 10, { impressions: 1000, clicks: 40 });
  const score = scoreDecisions(db, LATER)[0]?.score;
  assert.equal(score?.metric, 'ctr');
  assert.equal(Math.round(score?.delta_pct ?? 0), 100, 'CTR doubled');
  assert.equal(score?.improved, true);
});

test('D70: a second lever inside either window contaminates the entry, and names it', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  decide(db, 2, TS + H(1.5));           // inside the after-window
  decide(db, 3, TS - H(2));             // inside the before-window
  decide(db, 4, TS + H(9));             // outside both
  decide(db, 5, TS + H(1), 'pause', 'a_01'); // a different ad — not contamination
  bucket(db, -10, { impressions: 1000, clicks: 20 });
  bucket(db, 10, { impressions: 1000, clicks: 40 });

  const first = scoreDecisions(db, LATER).find((s) => s.decision_seq === 1);
  assert.deepEqual(first?.contaminated_by, [2, 3]);
  // The score is still PRODUCED — D70's whole point is that a visible contamination beats an
  // unequal window. Suppressing it here would be the generation-pinned answer wearing a label.
  assert.notEqual(first?.score, null);

  const fourth = scoreDecisions(db, LATER).find((s) => s.decision_seq === 4);
  assert.deepEqual(fourth?.contaminated_by, [], 'nothing inside its own ±6 h');
});

test('create_ad never contaminates — a draft ad emits nothing, so it moved no counts', (t) => {
  const db = store(t);
  decide(db, 1, TS - 60_000, 'create_ad');
  decide(db, 2, TS, 'launch');
  bucket(db, 10, { impressions: 1000, clicks: 40 });
  // This narrows D70's "any second lever" by exactly one action, and the justification is that
  // §3 gives a draft ad λ = 0: including it flagged 24 of 24 seeded entries, and a flag that
  // fires on everything is a flag nobody reads.
  const launch = scoreDecisions(db, LATER).find((s) => s.decision_seq === 2);
  assert.deepEqual(launch?.contaminated_by, []);
});

test('create_ad is not scored against an empty before-window, and says why', (t) => {
  const db = store(t);
  decide(db, 1, TS, 'create_ad');
  bucket(db, 10, { impressions: 1000, clicks: 40 });
  const entry = scoreDecisions(db, LATER)[0];
  assert.equal(entry?.score, null);
  // Not "0 → 40 clicks, infinite improvement": the ad did not exist, so the window is empty by
  // definition rather than by a lack of delivery, and the two are different statements.
  assert.equal(entry?.withheld?.reason, 'no_before_window');
});

// **D71 — `w` is a read parameter.** Two properties, and D43's criterion is why they are tested
// rather than eyeballed: a score computed over the wrong window renders a perfectly ordinary
// sentence. There is no visible failure.

test('D71: a shortened window measures different minutes, and the score moves with it', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  // Six hours of flat delivery either side, and ONE hour immediately after the decision that
  // converts twice as well for the same spend. A ±6 h window dilutes that hour across six; a ±1 h
  // window sees only it. The lift is in CONVERSIONS, not clicks, because with conversions on both
  // sides the metric is CPA — a clicks-only lift moves CTR, which is not the metric being scored,
  // and the test would pass trivially with a delta of zero on both windows. (It did, first run.)
  const flat = { impressions: 1_000, clicks: 10, conversions: 1, click_cost_cents: 1_000 };
  const lifted = { impressions: 1_000, clicks: 10, conversions: 2, click_cost_cents: 1_000 };
  for (let m = -360; m < 0; m++) bucket(db, m, flat);
  for (let m = 0; m < 60; m++) bucket(db, m, lifted);
  for (let m = 60; m < 360; m++) bucket(db, m, flat);

  const at = new Date(TS + H(6) + HORIZON_MS + 60_000).toISOString();
  const wide = scoreDecisions(db, at, HORIZON_MS, SCORING_WINDOW_MS)[0];
  const narrow = scoreDecisions(db, at, HORIZON_MS, H(1))[0];

  assert.ok(wide?.score !== null && wide?.score !== undefined, 'the 6 h window scores');
  assert.ok(narrow?.score !== null && narrow?.score !== undefined, 'the 1 h window scores');
  // Same metric, same direction, different magnitude — the narrow window sees only the good hour.
  // Compared on MAGNITUDE, not sign: CPA improves when it falls, so "bigger lift" is a bigger
  // NEGATIVE delta, and asserting `narrow > wide` would be the per-metric direction bug §14 names.
  assert.equal(wide.score.metric, 'cpa');
  assert.equal(narrow.score.metric, 'cpa');
  assert.equal(wide.score.improved, true);
  assert.equal(narrow.score.improved, true);
  assert.ok(
    Math.abs(narrow.score.delta_pct) > Math.abs(wide.score.delta_pct),
    `the narrow window should see the full lift: narrow ${narrow.score.delta_pct} vs wide ${wide.score.delta_pct}`,
  );
  // And the bounds themselves moved, which is what makes the number different.
  assert.notEqual(wide.window.after_to, narrow.window.after_to);
  assert.equal(
    Date.parse(narrow.window.after_to) - Date.parse(narrow.window.after_from),
    H(1),
    'the after-window is exactly the requested width',
  );
});

test('D71: withholding follows the window, not only the horizon', (t) => {
  const db = store(t);
  decide(db, 1, TS);
  for (let m = -60; m < 60; m++) {
    bucket(db, m, { impressions: 1_000, clicks: 10, conversions: 1, click_cost_cents: 1_000 });
  }

  // A moment at which the ±15 min window has settled but the ratified ±6 h one has not. This is
  // the whole point of D71: the horizon alone cannot release a score whose window is still open.
  const at = new Date(TS + H(0.25) + HORIZON_MS + 60_000).toISOString();
  assert.equal(scoreDecisions(db, at, HORIZON_MS, SCORING_WINDOW_MS)[0]?.withheld?.reason, 'settling');
  assert.equal(scoreDecisions(db, at, HORIZON_MS, H(0.25))[0]?.withheld, null);
});
