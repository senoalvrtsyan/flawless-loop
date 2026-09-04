// B50. The endpoint's job is to refuse what the emitter cannot act on, and to persist what it can.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCENARIO_NAMES, listScenarios, postScenario } from './sim-scenario.ts';

function store(t: { after: (fn: () => void) => void }): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE sim_scenarios (
    scenario_id TEXT PRIMARY KEY, ts TEXT NOT NULL, name TEXT NOT NULL,
    args_json TEXT NOT NULL, consumed_at TEXT) STRICT;`);
  return db;
}

test('all seven of §17 are accepted, and nothing else is', (t) => {
  const db = store(t);
  assert.equal(SCENARIO_NAMES.length, 7);
  for (const name of SCENARIO_NAMES) {
    const ad = ['fatigue_collapse', 'late_cascade', 'budget_squeeze'].includes(name)
      ? { ad_id: 'a_12' }
      : {};
    assert.equal(postScenario(db, { name, ...ad }).status, 200, name);
  }
  assert.equal(postScenario(db, { name: 'drop_the_database' }).status, 400);
  assert.equal(listScenarios(db).length, 7);
});

test('§17 defaults are applied when an argument is absent, and they are the table’s figures', (t) => {
  const db = store(t);
  const result = postScenario(db, { name: 'late_cascade', ad_id: 'a_12' });
  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  // §17: "late_cascade{ad_id, n, min_age_h = 96}". The 96 is the table's, not a guess.
  assert.equal(result.body.scenario.args['min_age_h'], 96);
  assert.equal(result.body.scenario.args['ad_id'], 'a_12');
});

test('an out-of-range argument is REFUSED, never clamped', (t) => {
  const db = store(t);
  // A clamp would put a multiplier on screen nobody asked for, and the reviewer would then read
  // the resulting backpressure as the model's rather than as the clamp's.
  const result = postScenario(db, { name: 'traffic_burst', multiplier: 1000 });
  assert.equal(result.status, 400);
  if (result.status !== 400) return;
  assert.equal(result.body.error, 'bad_argument');
  assert.match(result.body.message ?? '', /\[1, 20\]/);
  assert.equal(listScenarios(db).length, 0, 'a refused trigger writes no row');
});

test('the three per-ad scenarios require an ad_id; the portfolio ones do not take one', (t) => {
  const db = store(t);
  assert.equal(postScenario(db, { name: 'fatigue_collapse' }).status, 400);
  assert.equal(postScenario(db, { name: 'budget_squeeze' }).status, 400);
  assert.equal(postScenario(db, { name: 'stall' }).status, 200);
  assert.equal(postScenario(db, { name: 'orphan_burst' }).status, 200);
});

test('a trigger is a persisted row, unconsumed until the simulator is served it', (t) => {
  const db = store(t);
  postScenario(db, { name: 'stall', seconds: 45 });
  const [row] = listScenarios(db);
  // §14's determinism claim is (seed + decision log + sim_scenarios) -> world. A trigger that
  // lived only in memory would make that claim false, which is why the table exists at all.
  assert.equal(row?.name, 'stall');
  assert.equal(row?.args['seconds'], 45);
  assert.equal(row?.consumed_at, null);
});
