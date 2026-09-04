// B13's test, named by its BUILD_PLAN row: a stale `from_cents` is rejected; a good one opens
// generation n+1 with `valid_to` set on n.
//
// Against a REAL store, not a fake: the half of applyDecision that can be wrong is the SQL — the
// half-open generation window, the id derivation the B22 rebuild has to reproduce, and the
// single-transaction property. A mock would agree with whatever it was written to agree with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { applyDecision, type DecisionInput } from './apply.ts';
import { ACTOR, type DecisionBody } from '../shared/decisions.ts';

const T = (n: number): string => new Date(Date.UTC(2026, 8, 4, 12, n)).toISOString();

/** A migrated store in a temp dir, with the reference data the `ads` foreign keys need. */
function store(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-test-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  const components = [
    { id: 'vl_04_v1', kind: 'video', lineage: 'vl_04' },
    { id: 'vl_04_v2', kind: 'video', lineage: 'vl_04' },
    { id: 'hl_01_v1', kind: 'headline', lineage: 'hl_01' },
  ];
  for (const c of components) {
    db.prepare('INSERT INTO components (component_id, kind, payload, created_at, lineage_id) VALUES (?,?,?,?,?)')
      .run(c.id, c.kind, 'x', T(0), c.lineage);
  }
  db.prepare('INSERT INTO audiences (audience_id, geo, temperature, est_size) VALUES (?,?,?,?)')
    .run('aud_25_34_it', 'IT', 'cold', 1_000_000);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}

let n = 0;
function pull(db: DatabaseSync, body: DecisionBody, at = T(n)) {
  n += 1;
  const input: DecisionInput = {
    decision_id: `d_${n}`, ts: at, actor: ACTOR, ad_id: 'a_12',
    rationale: 'test fixture', body,
  };
  return applyDecision(db, input);
}

const INITIAL = {
  name: 'Autumn video', video_id: 'vl_04_v1', headline_id: 'hl_01_v1',
  audience_id: 'aud_25_34_it', channel: 'meta_feed', daily_budget_cents: 50_000,
} as const;

const CREATE: DecisionBody = { action: 'create_ad', initial: INITIAL };

function generations(db: DatabaseSync): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM config_generations ORDER BY seq_in_ad')
    .all() as Array<Record<string, unknown>>;
}

test('create_ad opens generation 1 in draft; launch closes it and opens 2', (t) => {
  const db = store(t);
  n = 0;
  assert.equal(pull(db, CREATE).ok, true);
  const afterLaunch = pull(db, { action: 'launch' });
  assert.equal(afterLaunch.ok, true);

  const gens = generations(db);
  assert.equal(gens.length, 2);
  assert.deepEqual(
    [gens[0]?.['generation_id'], gens[1]?.['generation_id']],
    ['g_a_12_001', 'g_a_12_002'],
    'generation ids must be DERIVED from (ad_id, seq_in_ad) or B22 rebuilds them differently',
  );
  // The half-open window: generation 1 closes at the exact instant generation 2 opens, so
  // "config of a_12 at T" has one answer at every T.
  assert.equal(gens[0]?.['valid_to'], T(1));
  assert.equal(gens[1]?.['valid_from'], T(1));
  assert.equal(gens[1]?.['valid_to'], null);
  assert.equal(gens[0]?.['status'], 'draft');
  assert.equal(gens[1]?.['status'], 'live');
  assert.equal(gens[1]?.['opened_by_decision'], 'd_2');
});

test('the ads row is the fold head, and launch writes launched_at', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const ad = db.prepare('SELECT * FROM ads').get() as Record<string, unknown>;
  assert.equal(ad['status'], 'live');
  assert.equal(ad['launched_at'], T(1));
  assert.equal(ad['created_at'], T(0));
  assert.equal(ad['current_generation_id'], 'g_a_12_002');
  assert.equal(ad['last_decision_seq'], 2);
});

test('a STALE from_cents is rejected and NOTHING is written', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const before = generations(db).length;

  const stale = pull(db, { action: 'set_budget', from_cents: 49_999, to_cents: 10_000 });
  assert.equal(stale.ok, false);
  assert.equal(stale.ok === false ? stale.error.code : null, 'stale_precondition');

  // A refused lever leaves no trace in the log: config derives from the log, so a decision that
  // changed nothing would make the fold's own history unreplayable.
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM decisions').get() as { c: number }).c, 2);
  assert.equal(generations(db).length, before);
  assert.equal(
    (db.prepare('SELECT daily_budget_cents AS b FROM ads').get() as { b: number }).b, 50_000);
});

test('a CURRENT from_cents opens generation n+1 and closes n', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const ok = pull(db, { action: 'set_budget', from_cents: 50_000, to_cents: 10_000 });
  assert.equal(ok.ok, true);

  const gens = generations(db);
  assert.equal(gens.length, 3);
  assert.equal(gens[1]?.['valid_to'], T(2), 'generation 2 was not closed at the decision ts');
  assert.equal(gens[2]?.['daily_budget_cents'], 10_000);
  assert.equal(gens[2]?.['valid_to'], null);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS c FROM config_generations WHERE valid_to IS NULL').get() as { c: number }).c,
    1, 'exactly one generation may be open at a time');
});

test('a decision that changes no config value opens no generation', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const before = generations(db);
  const same = pull(db, { action: 'set_budget', from_cents: 50_000, to_cents: 50_000 });

  assert.equal(same.ok, true);
  assert.deepEqual(generations(db), before, 'a no-op budget change opened a generation');
  // It is still a real, logged lever pull, and the fold position moves.
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM decisions').get() as { c: number }).c, 3);
  assert.equal(
    (db.prepare('SELECT last_decision_seq AS s FROM ads').get() as { s: number }).s, 3);
});

test('U5: the same decision_id replayed folds once, not twice', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const body: DecisionBody = { action: 'set_budget', from_cents: 50_000, to_cents: 10_000 };
  const input: DecisionInput = {
    decision_id: 'd_retry', ts: T(2), actor: ACTOR, ad_id: 'a_12', rationale: 'r', body,
  };

  const first = applyDecision(db, input);
  const second = applyDecision(db, input);
  assert.equal(first.ok && first.replayed, false);
  assert.equal(second.ok && second.replayed, true);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM decisions').get() as { c: number }).c, 3);
  assert.equal(generations(db).length, 3);
  // A second fold would have hit its own from_cents precondition and reported a stale tab to a
  // client that is not stale — which is the failure U5 exists to prevent.
  assert.equal(second.ok === true ? second.ad.daily_budget_cents : null, 10_000);
});

test('the same decision_id carrying a DIFFERENT body is refused, not silently ignored', (t) => {
  const db = store(t);
  n = 0;
  pull(db, CREATE);
  pull(db, { action: 'launch' });
  const base = { decision_id: 'd_x', ts: T(2), actor: ACTOR, ad_id: 'a_12', rationale: 'r' };
  applyDecision(db, { ...base, body: { action: 'pause' } });
  const reused = applyDecision(db, {
    ...base, body: { action: 'set_budget', from_cents: 50_000, to_cents: 1 },
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.ok === false ? reused.error.code : null, 'decision_id_reused');
});

test('an unknown component id is refused by the foreign key, not stored', (t) => {
  const db = store(t);
  n = 0;
  assert.throws(
    () => pull(db, { action: 'create_ad', initial: { ...INITIAL, video_id: 'nope' } }),
    /FOREIGN KEY/,
  );
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM decisions').get() as { c: number }).c, 0,
    'the log row must roll back with the projection write');
});
