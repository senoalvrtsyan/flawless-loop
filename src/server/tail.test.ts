// B44 — the tail ring, the health counters, and **D34's compile-time tripwire**.
//
// The tripwires are the important part and they are not runtime assertions. The last test holds two
// `@ts-expect-error` lines, and they carry different halves of D34 — which is worth being precise
// about, because the first one would pass even with the brand removed:
//
//   1. **summing** a tail frame does not compile because the amount is a STRING at all. That is
//      D34 layer 1's own wording — *"summing the tail requires parsing strings"*;
//   2. **minting** a `Display` from a plain string does not compile, and THAT is what the brand
//      carries. Unbrand the type and this line starts compiling, the directive goes unused, and
//      `npm run typecheck` fails with `TS2578`. Verified by doing exactly that at B44.
//
// So the guarantee is enforced by the build rather than by review, which is the ground Seno rejected
// D34's option A ("convention plus review") on.
//
// The runtime assertions cover the parts that fail silently: a ring that grows without bound, an
// `omitted` count that lies about the sample rate, and — the one that matters most for §13 — a tail
// built from the STORE rather than from the posted body, which would show only accepted events and
// make every injected fault invisible on the one surface built to show them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from './db.ts';
import { migrate } from './migrate.ts';
import { RING, TAIL_PER_FRAME, createTail } from './tail.ts';
import type { DeliveryOutcome } from '../shared/types.ts';
import type { Display } from '../shared/wire.ts';

const AT = '2026-09-01T12:00:00.000Z';

function store(t: { after: (fn: () => void) => void }): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), 'loop-tail-'));
  const db = openDb(join(dir, 'test.sqlite'));
  migrate(db);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

const outcome = (event_id: string, over: Partial<DeliveryOutcome> = {}): DeliveryOutcome => ({
  event_id,
  disposition: 'accepted',
  ...over,
});

test('a rejected delivery IS in the tail — it never became a signals row', (t) => {
  const db = store(t);
  const tail = createTail();
  tail.record({
    source: 'live',
    received_at: AT,
    events: [
      { event_id: 'e1', ts: AT, ad_id: 'a_12', event: 'impression' },
      { event_id: 'e2', ts: AT, ad_id: 'a_12', event: 'click', click_id: 'c1', cost_cents: 62 },
      { event_id: 'e3', ts: 'not-a-date', ad_id: 'a_12', event: 'impression' },
    ],
    outcomes: [
      outcome('e1'),
      outcome('e2', { disposition: 'duplicate_identical' }),
      outcome('e3', { disposition: 'rejected_invalid', reason: 'ts_not_canonical_iso' }),
    ],
  });

  const frame = tail.frame(db);
  assert.ok(frame !== null);
  assert.equal(frame.events.length, 3, 'all three deliveries, whatever the boundary did with them');
  // Newest first.
  assert.deepEqual(frame.events.map((e) => e.event_id), ['e3', 'e2', 'e1']);
  const rejected = frame.events[0];
  assert.equal(rejected?.disposition, 'rejected_invalid');
  assert.equal(rejected?.reason, 'ts_not_canonical_iso', 'the reason is the whole point of the row');
  assert.equal(frame.health.accepted, 1);
  assert.equal(frame.health.duplicate_identical, 1);
  assert.equal(frame.health.rejected_invalid, 1);
});

test('money is a pre-rendered STRING, whichever field owns it', (t) => {
  const db = store(t);
  const tail = createTail();
  tail.record({
    source: 'live',
    received_at: AT,
    events: [
      { event_id: 'k1', ts: AT, ad_id: 'a_12', event: 'click', click_id: 'c1', cost_cents: 62 },
      { event_id: 's1', ts: AT, ad_id: 'a_12', event: 'spend', amount_cents: 130 },
      { event_id: 'v1', ts: AT, ad_id: 'a_12', event: 'conversion', attributed_click_id: 'c1', value_cents: 4_500 },
      { event_id: 'i1', ts: AT, ad_id: 'a_12', event: 'impression' },
    ],
    outcomes: [outcome('k1'), outcome('s1'), outcome('v1'), outcome('i1')],
  });

  const frame = tail.frame(db);
  const byId = new Map(frame?.events.map((e) => [e.event_id, e]));
  assert.equal(byId.get('k1')?.amount, '$0.62');
  assert.equal(byId.get('s1')?.amount, '$1.30');
  assert.equal(byId.get('v1')?.amount, '$45.00');
  assert.equal(byId.get('i1')?.amount, null, 'an impression owns no money field');
  assert.equal(byId.get('v1')?.attributed_click_id, 'c1', 'an id stays an id');
  for (const event of frame?.events ?? []) {
    if (event.amount !== null) assert.equal(typeof event.amount, 'string');
  }
});

test('lateness is pre-rendered and absent below a second', (t) => {
  const db = store(t);
  const tail = createTail();
  const twoDaysBefore = new Date(Date.parse(AT) - (2 * 86_400 + 4 * 3_600) * 1_000).toISOString();
  tail.record({
    source: 'backfill',
    received_at: AT,
    events: [
      { event_id: 'late', ts: twoDaysBefore, ad_id: 'a_01', event: 'conversion', attributed_click_id: 'c9', value_cents: 100 },
      { event_id: 'now', ts: AT, ad_id: 'a_01', event: 'impression' },
    ],
    outcomes: [outcome('late'), outcome('now')],
  });

  const byId = new Map(tail.frame(db)?.events.map((e) => [e.event_id, e]));
  assert.equal(byId.get('late')?.late, '2 d 4 h');
  assert.equal(byId.get('now')?.late, null, 'an on-time event shows nothing, not "0 s late"');
  assert.equal(byId.get('late')?.source, 'backfill', 'the seeded/live split is on every row');
});

test('the ring is BOUNDED and the frame says what it is a sample of', (t) => {
  const db = store(t);
  const tail = createTail();
  for (let batch = 0; batch < 30; batch++) {
    tail.record({
      source: 'live',
      received_at: AT,
      events: Array.from({ length: 40 }, (_, i) => ({
        event_id: `e${batch}_${i}`, ts: AT, ad_id: 'a_12', event: 'impression',
      })),
      outcomes: Array.from({ length: 40 }, (_, i) => outcome(`e${batch}_${i}`)),
    });
  }
  assert.equal(tail.size(), RING, '1,200 deliveries recorded, 500 retained');

  const frame = tail.frame(db);
  assert.ok(frame !== null);
  assert.equal(frame.events.length, TAIL_PER_FRAME, 'capped per frame (§11)');
  assert.equal(frame.omitted, RING - TAIL_PER_FRAME, 'and it SAYS how many it left out');
  assert.equal(frame.health.window_events, RING);
  // The newest are the ones shown: the last batch's last event is first.
  assert.equal(frame.events[0]?.event_id, 'e29_39');
});

test('the flush’s own counters ride the health block', (t) => {
  const db = store(t);
  const tail = createTail();
  tail.record({ source: 'live', received_at: AT, events: [{ event_id: 'e1', ts: AT, ad_id: 'a', event: 'impression' }], outcomes: [outcome('e1')] });
  tail.noteSpill(120);
  tail.noteSpill(80);
  tail.noteBackpressure();
  const health = tail.frame(db)?.health;
  assert.equal(health?.rows_spilled, 200, 'B44(a): rows held back for the next tick, cumulative');
  assert.equal(health?.frames_backpressured, 1, 'B44(b): counted every time, warned once');
  assert.equal(health?.orphans_unresolved, 0, 'the one store-backed figure');
});

test('an empty ring produces NO frame rather than an empty one', (t) => {
  const db = store(t);
  assert.equal(createTail().frame(db), null, 'a tick with nothing to say sends nothing');
});

test('D34 LAYER 1: a Display cannot be summed — enforced by tsc, not by review', (t) => {
  const db = store(t);
  const tail = createTail();
  tail.record({
    source: 'live',
    received_at: AT,
    events: [{ event_id: 'k1', ts: AT, ad_id: 'a_12', event: 'click', click_id: 'c1', cost_cents: 62 }],
    outcomes: [outcome('k1')],
  });
  const frame = tail.frame(db);
  assert.ok(frame !== null);

  // ** TRIPWIRE ONE — summing. ** The line D34 exists to make impossible: adding up the money on a
  // tail frame to produce a performance number. It does not compile, and `@ts-expect-error` asserts
  // that. This one is carried by the amount being a STRING at all rather than by the brand —
  // which is D34 layer 1's own wording ("summing the tail requires parsing strings").
  //
  // @ts-expect-error D34: tail amounts are display strings; summing them must not typecheck.
  const spend: number = frame.events.reduce((total, event) => total + (event.amount ?? 0), 0);

  // ** TRIPWIRE TWO — minting, and THIS is the one the brand carries. ** A plain string cannot
  // become a `Display`, so nothing outside `display()` can fabricate a tail value. Unbrand the type
  // and this line starts compiling, the directive goes unused, and `npm run typecheck` FAILS —
  // verified by doing exactly that at B44.
  //
  // @ts-expect-error D34: only `display()` mints a Display; a client cannot fabricate one.
  const forged: Display = '$1,000,000.00';
  assert.equal(String(forged), '$1,000,000.00', 'it is a string at runtime — the guard is the type');

  // Getting a number out at all takes an explicit cast, which is exactly the diff a reviewer sees.
  const parsed = Number(String(frame.events[0]?.amount ?? '').replace('$', ''));
  assert.equal(parsed, 0.62, 'possible, deliberately ugly, and visible in a diff');
  assert.equal(typeof spend, 'string', 'what the forbidden line would actually have produced');
});
