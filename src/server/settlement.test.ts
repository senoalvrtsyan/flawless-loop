// B21 — the three states, and the boundary between them. DESIGN §5.4, §5.7, D13.
//
// Automated because the failure is a badge that is merely wrong: a bucket that reads `live` two
// weeks after it closed invites the strategist to wait for numbers that will never move, and one
// that reads `settled` while still accruing invites a decision on half a cohort. Both look fine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketState, settledAt } from './settlement.ts';
import { HORIZON_MS, ACCOUNT_TZ } from '../shared/config.ts';

const M = (iso: string): string => new Date(iso).toISOString();
const CLOSED = M('2026-09-01T12:00:00Z');            // a bucket at 12:00 closes at 12:01
const plus = (h: number): string => new Date(Date.parse(CLOSED) + 60_000 + h * 3_600_000).toISOString();

test('the horizon is 72 h and runs from the bucket\'s CLOSE, not its start', () => {
  assert.equal(HORIZON_MS, 72 * 3_600_000);
  assert.equal(settledAt(CLOSED, plus(71)), false);
  assert.equal(settledAt(CLOSED, plus(72)), false, 'live for the WHOLE horizon — strictly greater');
  assert.equal(settledAt(CLOSED, plus(72.001)), true);
  // The 60 s matters: measured from the bucket's start, a bucket would settle a minute early.
  assert.equal(settledAt(CLOSED, new Date(Date.parse(CLOSED) + HORIZON_MS).toISOString()), false);
});

test('a 10-minute-old bucket is live, a 7-day-old one is settled', () => {
  const fresh = { minute_start: CLOSED, restated_at: null };
  assert.equal(bucketState(fresh, plus(0.17)), 'live');
  assert.equal(bucketState(fresh, plus(24 * 7)), 'settled');
});

test('restated outranks the clock, in both directions', () => {
  // It moved after it had settled — that is what the flag records, and age cannot un-record it.
  const moved = { minute_start: CLOSED, restated_at: plus(96) };
  assert.equal(bucketState(moved, plus(96)), 'restated');
  assert.equal(bucketState(moved, plus(24 * 30)), 'restated', 'the badge decayed back to settled');
  // And a bucket that has NOT moved is never restated, however old.
  assert.equal(bucketState({ minute_start: CLOSED, restated_at: null }, plus(24 * 30)), 'settled');
});

test('the horizon is a parameter, which is what makes P16 (B49) a sweep and not a hunt', () => {
  const b = { minute_start: CLOSED, restated_at: null };
  assert.equal(bucketState(b, plus(3), HORIZON_MS), 'live');
  assert.equal(bucketState(b, plus(3), 2 * 3_600_000), 'settled', 'a 2 h horizon settles it');
});

test('the account timezone is a constant, and buckets stay UTC', () => {
  // D22/I2: New York is used for the budget day boundary and the diurnal curve, and for nothing
  // else. If a bucket key were ever localised, byte order would stop being time order.
  assert.equal(ACCOUNT_TZ, 'America/New_York');
  assert.match(CLOSED, /Z$/);
});
