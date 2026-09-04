// B49. Four properties, and the first two are the ones that draw a normal screen when wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { affectedRange, sweep } from './sweep.ts';
import { HORIZON_MS } from '../shared/config.ts';

const H = (h: number): number => h * 3_600_000;
const AT = '2026-09-05T12:00:00.000Z';

/** A minute `h` hours before `AT`, floored — so its age since close is `h` hours minus a minute. */
const minuteAgo = (h: number): string => new Date(Date.parse(AT) - H(h)).toISOString();

function store(t: { after: (fn: () => void) => void }): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE rollup_minute (
      ad_id TEXT NOT NULL, minute_start TEXT NOT NULL,
      restated_at TEXT, PRIMARY KEY (ad_id, minute_start)
    ) STRICT;
    CREATE TABLE conversion_attribution (
      event_id TEXT PRIMARY KEY, state TEXT NOT NULL,
      credited_ad_id TEXT, credited_minute TEXT
    ) STRICT;
    CREATE TABLE signals (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL) STRICT;
  `);
  return db;
}

const bucket = (db: DatabaseSync, minute: string, ad = 'a_12'): void => {
  db.prepare('INSERT INTO rollup_minute (ad_id, minute_start, restated_at) VALUES (?, ?, NULL)')
    .run(ad, minute);
};

const arrival = (db: DatabaseSync, id: string, minute: string, receivedAt: string, ad = 'a_12'): void => {
  db.prepare('INSERT INTO signals VALUES (?, ?)').run(id, receivedAt);
  db.prepare(
    "INSERT INTO conversion_attribution VALUES (?, 'resolved', ?, ?)",
  ).run(id, ad, minute);
};

test('the affected band is exactly the ages between the two horizons, half-open', () => {
  const range = affectedRange(H(72), H(2), AT);
  // close = AT − 60 s; the band is [close − 72 h, close − 2 h).
  assert.equal(range.from, new Date(Date.parse(AT) - 60_000 - H(72)).toISOString());
  assert.equal(range.to, new Date(Date.parse(AT) - 60_000 - H(2)).toISOString());
  // Lengthening sweeps the SAME band — the flip is symmetric, only its direction changes.
  assert.deepEqual(affectedRange(H(2), H(72), AT), range);
});

test('shortening flips only the band, and does not scan the whole table', (t) => {
  const db = store(t);
  bucket(db, minuteAgo(100)); // already settled at 72 h — outside the band, must not be scanned
  bucket(db, minuteAgo(50));  // live at 72 h, settled at 2 h — flips
  bucket(db, minuteAgo(10));  // live at 72 h, settled at 2 h — flips
  bucket(db, minuteAgo(1));   // live under both — inside neither
  const result = sweep(db, H(72), H(2), AT);

  assert.equal(result.total_buckets, 4);
  // THE point of the chunk: the band is scanned, not the table. Scanning everything would give
  // the same `flipped` count and a completely normal screen.
  assert.equal(result.scanned, 2, 'only the two buckets inside the band were read');
  assert.equal(result.flipped, 2);
  assert.deepEqual(result.sample.map((f) => [f.was, f.now]), [['live', 'settled'], ['live', 'settled']]);
});

test('a bucket whose newest arrival landed after the NEW horizon is restated under it', (t) => {
  const db = store(t);
  const minute = minuteAgo(50);
  bucket(db, minute);
  // The conversion arrived 40 h after the bucket's minute: inside 72 h (so `apply()` stamped no
  // `restated_at`), but far outside 2 h — so at a 2 h horizon this bucket moved after settling.
  arrival(db, 'e1', minute, new Date(Date.parse(minute) + H(40)).toISOString());

  const shortened = sweep(db, H(72), H(2), AT);
  assert.equal(shortened.newly_restated, 1);
  assert.equal(shortened.sample[0]?.restated_under_new_horizon, true);

  // And nothing was written: the sweep is read-only, so the stored column is untouched. A sweep
  // that "helpfully" stamped it would break /api/verify on a correct store (D7).
  const stored = db.prepare('SELECT restated_at FROM rollup_minute').get() as { restated_at: string | null };
  assert.equal(stored.restated_at, null);
});

test('an on-time arrival is not a restatement at any horizon that contains it', (t) => {
  const db = store(t);
  const minute = minuteAgo(50);
  bucket(db, minute);
  // Arrived 30 minutes after its minute — inside 2 h, so still not late even at the short horizon.
  arrival(db, 'e1', minute, new Date(Date.parse(minute) + 30 * 60_000).toISOString());
  const result = sweep(db, H(72), H(2), AT);
  assert.equal(result.flipped, 1, 'it still flips live → settled');
  assert.equal(result.newly_restated, 0, 'but it did not MOVE after settling');
});

test('sweeping to the horizon we are already at flips nothing', (t) => {
  const db = store(t);
  bucket(db, minuteAgo(50));
  const result = sweep(db, HORIZON_MS, HORIZON_MS, AT);
  assert.equal(result.flipped, 0);
  assert.equal(result.scanned, 0, 'an empty band reads no rows at all');
});
