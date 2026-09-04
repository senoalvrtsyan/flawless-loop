// B38a — the roll (D65), under D43's criterion: *"tests only where a wrong answer is invisible"*.
//
// Every failure below leaves a screen that looks entirely normal. A frame that keeps its `to` and
// walks its `from` silently narrows the window a minute at a time; one that walks `from` the wrong
// way silently widens it; an eviction that uses `<=` drops the minute it is meant to keep; and a
// roll that forgets the anchor makes the "anchored at" label — the one thing on screen that says
// how far the frame has walked — read zero forever. None of those error, and none of them can be
// seen by looking at a chart.
//
// The no-op case is tested for a second reason: `rollWindow` returning a NEW store every tick
// re-renders the whole page four times a minute for nothing, and that is a performance defect that
// presents as "the chart flickers", not as a failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRows, createStore, minutesRolled, rollWindow } from './store.ts';
import type { BucketRow } from '../server/snapshot.ts';

const T = (h: number, m: number): string => new Date(Date.UTC(2026, 8, 1, h, m)).toISOString();
const ms = (h: number, m: number, s = 0): number => Date.UTC(2026, 8, 1, h, m, s);

const bucket = (minute: string, impressions: number, ad_id = 'a_12'): BucketRow =>
  ({
    ad_id,
    minute_start: minute,
    impressions,
    clicks: 0,
    click_cost_cents: 0,
    spend_cents: 0,
    conversions: 0,
    value_cents: 0,
    provisional_conversions: 0,
    provisional_value_cents: 0,
    first_written_at: minute,
    restated_at: null,
    restatement_count: 0,
    max_ingest_seq: 1,
    state: 'live',
  }) as BucketRow;

/** A one-hour anchor, exactly as B07 would have snapped it. */
const anchored = () =>
  createStore({ from: T(11, 0), to: T(12, 0) }, [bucket(T(11, 0), 5), bucket(T(11, 59), 7)]);

test('inside the minute the frame does not move, and the store is the SAME object', () => {
  const store = anchored();
  const rolled = rollWindow(store, ms(11, 59, 30));
  assert.equal(rolled, store, 'a tick that changes nothing must not re-render the page');
  assert.equal(minutesRolled(store), 0, 'the anchor is where the frame started');
});

test('a closed minute walks BOTH bounds and keeps the width', () => {
  const store = anchored();
  const rolled = rollWindow(store, ms(12, 0, 1));
  assert.equal(rolled.window.to, T(12, 1), 'to is ceilToMinute(now)');
  assert.equal(rolled.window.from, T(11, 1), 'from moved with it — the width is the anchor’s');
  assert.equal(
    Date.parse(rolled.window.to) - Date.parse(rolled.window.from),
    Date.parse(store.anchor.to) - Date.parse(store.anchor.from),
    'a frame that narrows or widens as it walks is the invisible failure',
  );
});

test('the anchor survives the roll and is what the label reads from', () => {
  const store = anchored();
  const rolled = rollWindow(rollWindow(store, ms(12, 0, 1)), ms(12, 5, 30));
  assert.deepEqual(rolled.anchor, { from: T(11, 0), to: T(12, 0) }, 'the anchor is never rewritten');
  assert.equal(minutesRolled(rolled), 6, 'six minutes past the anchor’s own end');
});

test('rows that fall off the back are evicted, and the boundary minute is KEPT', () => {
  const store = createStore({ from: T(11, 0), to: T(12, 0) }, [
    bucket(T(11, 0), 5),
    bucket(T(11, 1), 6),
    bucket(T(11, 30), 7),
  ]);
  // 30 seconds into the new minute: to = 12:01, so from = 11:01 — the lower bound lands exactly
  // on a bucket we hold, which is the case an eviction written with `<=` gets wrong.
  const rolled = rollWindow(store, ms(12, 0, 30));
  assert.deepEqual(rolled.window, { from: T(11, 1), to: T(12, 1) });
  const minutes = [...rolled.rows.values()].map((r) => r.minute_start).sort();
  assert.deepEqual(minutes, [T(11, 1), T(11, 30)], 'half-open [from, to): from is INCLUSIVE');
});

test('the roll keeps the frame FED: a bucket at a newly-entered minute is now accepted', () => {
  const store = anchored();
  const fresh = [bucket(T(12, 0), 3)];
  assert.equal(
    applyRows(store, fresh),
    store,
    'before the roll, 12:00 is outside [11:00, 12:00) and is dropped — the measured D65 defect',
  );
  const rolled = rollWindow(store, ms(12, 0, 2));
  const fed = applyRows(rolled, fresh);
  assert.notEqual(fed, rolled, 'after the roll the same row lands');
  // Two, not three: the same roll that admitted 12:00 aged 11:00 out of the back. That is the
  // point — the frame is a fixed width walking forward, not a window that grows.
  assert.equal(fed.rows.size, 2);
  assert.ok(fed.rows.has('a_12\n' + T(12, 0)), 'the newly-entered minute is in the store');
});

test('a frame wider than the data still rolls — the 7d window is the same one predicate', () => {
  const week = createStore({ from: T(0, 0), to: T(12, 0) }, [bucket(T(0, 0), 1)]);
  const rolled = rollWindow(week, ms(12, 30, 0));
  assert.equal(rolled.window.from, T(0, 30));
  assert.equal(rolled.rows.size, 0, 'the only row aged out; nothing is retained outside the frame');
});
