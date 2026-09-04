// B22 — /api/verify, and the tripwire D55 made a condition of choosing option A.
//
// The first test here is not about behaviour at all: it is the automated guard on an invisible
// invariant. The rebuild lands in `temp` only because every projection write is UNQUALIFIED, and
// SQLite resolves an unqualified name to `temp` before `main`. One `main.rollup_minute` written by
// a future chunk — which typechecks, reads as good practice, and passes every other test — turns
// the verifier into something that overwrites the store it was asked to check. So it fails the
// build instead. Seno's condition, in his words: "an invisible invariant with an automated guard
// is a different risk from a bare one."

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { ingest } from './ingest.ts';
import { applyDecision } from './apply.ts';
import { verify } from './verify.ts';
import { ACTOR } from '../shared/decisions.ts';

const PROJECTIONS = ['ads', 'config_generations', 'conversion_attribution', 'rollup_minute'];
const SRC = new URL('..', import.meta.url).pathname;

/** Every `.ts` under `src/`, so a new file is covered the day it is added. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

test('D55 TRIPWIRE: no projection SQL is schema-qualified outside verify.ts', () => {
  // `verify.ts` is the one file that MUST qualify — it compares `main` against `temp` explicitly —
  // and its own test file quotes the pattern, so both are exempt by name rather than by pattern.
  const exempt = ['verify.ts', 'verify.test.ts'];
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (exempt.some((name) => file.endsWith(`/${name}`))) continue;
    const text = readFileSync(file, 'utf8');
    for (const projection of PROJECTIONS) {
      for (const schema of ['main', 'temp']) {
        if (text.includes(`${schema}.${projection}`)) {
          offenders.push(`${file.slice(SRC.length)} -> ${schema}.${projection}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    'a schema-qualified projection escapes verify.ts\'s temp shadow and writes the LIVE store (D55)');
});

/** A world with two ads, a click, its late conversion, and a lever pulled after the fact. */
function world(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-verify-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  const T = (m: number): string => new Date(Date.UTC(2026, 8, 1, 12, m)).toISOString();
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_04', 'video', 'demo', T(0), 'vl_04', 1, null);
  db.prepare('INSERT INTO components VALUES (?,?,?,?,?,?,?)')
    .run('v_05', 'video', 'recut', T(0), 'vl_04', 2, 'v_04');
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
  // A swap and a pause, so the generation chain has real history to reproduce.
  applyDecision(db, { decision_id: 'd_swap', ts: T(20), actor: ACTOR, ad_id: 'a_12',
    rationale: 'fatigue',
    body: { action: 'swap_component', slot: 'video', from_id: 'v_04', to_id: 'v_05' } });
  applyDecision(db, { decision_id: 'd_pause', ts: T(30), actor: ACTOR, ad_id: 'a_05',
    rationale: 'cpa drift', body: { action: 'pause' } });

  ingest(db, [
    { event_id: 'i1', ts: T(2), ad_id: 'a_12', event: 'impression' },
    { event_id: 'i2', ts: T(2), ad_id: 'a_12', event: 'impression' },
    { event_id: 's1', ts: T(3), ad_id: 'a_12', event: 'spend', amount_cents: 900 },
    { event_id: 'k1', ts: T(5), ad_id: 'a_12', event: 'click', click_id: 'ck1', cost_cents: 62 },
    { event_id: 'cv1', ts: T(40), ad_id: 'a_12', event: 'conversion', attributed_click_id: 'ck1', value_cents: 4_500 },
    // An orphan, so `provisional_*` and an unresolved attribution row are in the diff too.
    { event_id: 'cv2', ts: T(41), ad_id: 'a_05', event: 'conversion', attributed_click_id: 'nope', value_cents: 700 },
  ], 'live', (i) => T(45 + i));
  return db;
}

test('a store built by the write path verifies clean, by hash', (t) => {
  const db = world(t);
  const result = verify(db);
  assert.equal(result.ok, true, JSON.stringify(result.divergence));
  assert.equal(result.divergence, undefined);
  // The fast path (§7): every projection agreed on its hash, so no row walk happened.
  for (const [name, state] of Object.entries(result.checked)) {
    assert.equal(state.hash_matched, true, name);
  }
  assert.ok((result.checked['rollup_minute']?.rows ?? 0) > 0, 'nothing was actually compared');
  assert.equal(result.log_position.ingest_seq, 6);
  assert.equal(result.log_position.decision_seq, 6);
});

test('the rebuild leaves NO trace in the live store — D55\'s whole point', (t) => {
  const db = world(t);
  const snapshot = (): string => JSON.stringify([
    db.prepare('SELECT * FROM ads ORDER BY ad_id').all(),
    db.prepare('SELECT * FROM config_generations ORDER BY generation_id').all(),
    db.prepare('SELECT * FROM conversion_attribution ORDER BY event_id').all(),
    db.prepare('SELECT * FROM rollup_minute ORDER BY ad_id, minute_start').all(),
    db.prepare('SELECT * FROM decisions ORDER BY decision_seq').all(),
    db.prepare('SELECT * FROM signals ORDER BY ingest_seq').all(),
  ]);
  const before = snapshot();
  verify(db);
  verify(db);
  assert.equal(snapshot(), before, 'the verifier wrote to the store it was checking');
  // And the shadow is gone, so every unqualified read in the process still means `main`.
  // `sqlite_temp_schema` is SQLite's own catalog for the temp schema and is always listed once the
  // schema has existed — it is excluded by name, not by pattern, so a real leftover cannot hide
  // behind a broad filter.
  const temps = (db.prepare("SELECT name FROM pragma_table_list WHERE schema = 'temp'")
    .all() as { name: string }[]).map((r) => r.name).filter((n) => n !== 'sqlite_temp_schema');
  assert.deepEqual(temps, [], 'a shadow table outlived the verify — every later read sees it');
});

test('a tampered rollup is caught, with the offending key and column', (t) => {
  const db = world(t);
  const minute = (db.prepare('SELECT minute_start FROM rollup_minute WHERE impressions = 2')
    .get() as { minute_start: string }).minute_start;
  // The hand-UPDATE the plan asks for: exactly what a second writer would leave behind.
  db.prepare('UPDATE rollup_minute SET impressions = 99 WHERE ad_id = ? AND minute_start = ?')
    .run('a_12', minute);

  const result = verify(db);
  assert.equal(result.ok, false);
  assert.equal(result.checked['rollup_minute']?.hash_matched, false);
  assert.deepEqual(result.divergence?.key, { ad_id: 'a_12', minute_start: minute });
  assert.equal(result.divergence?.column, 'impressions');
  assert.equal(result.divergence?.live, 99);
  assert.equal(result.divergence?.rebuilt, 2);
});

test('a row the logs do not produce is caught as missing_in_rebuild', (t) => {
  const db = world(t);
  // A bucket invented from nothing — the shape of divergence a projection-only writer creates.
  db.prepare(`INSERT INTO rollup_minute (ad_id, minute_start, impressions, first_written_at,
    max_ingest_seq) VALUES (?, ?, ?, ?, ?)`)
    .run('a_12', '2026-08-01T00:00:00.000Z', 7, '2026-08-01T00:00:00.000Z', 1);

  const result = verify(db);
  assert.equal(result.ok, false);
  assert.equal(result.divergence?.column, 'missing_in_rebuild');
  assert.deepEqual(result.divergence?.key,
    { ad_id: 'a_12', minute_start: '2026-08-01T00:00:00.000Z' });
});

test('a tampered ads row is caught too — the fold is verified, not just the rollups', (t) => {
  const db = world(t);
  db.prepare('UPDATE ads SET daily_budget_cents = 999 WHERE ad_id = ?').run('a_12');
  const result = verify(db);
  assert.equal(result.ok, false);
  assert.equal(result.divergence?.projection, 'ads');
  assert.equal(result.divergence?.column, 'daily_budget_cents');
  assert.equal(result.divergence?.rebuilt, 50_000);
});

test('an empty store verifies clean rather than throwing', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-verify-empty-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const result = verify(db);
  assert.equal(result.ok, true);
  assert.equal(result.log_position.ingest_seq, 0);
});
