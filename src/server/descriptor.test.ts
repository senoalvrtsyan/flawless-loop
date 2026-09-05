// B51. **D43's criterion is why this file exists**: *"tests only where a wrong answer is
// invisible."* A signature scheme that accepts a tampered descriptor produces a screen on which
// every number, every event list and every PASS is exactly what it would be if the scheme worked.
// There is no visible failure to hand-verify — so this is the one part of stage 6 that is tested
// rather than eyeballed.
//
// Six properties. The first three are the quarantine; the last three are D46's narrowing rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issue, narrows, sign, verify } from './descriptor.ts';

const WINDOW = { from: '2026-09-03T12:00:00.000Z', to: '2026-09-03T13:00:00.000Z' };

const descriptor = (over: Partial<Parameters<typeof issue>[0]> = {}) =>
  issue({
    metric: 'ctr',
    ad_ids: ['a_03'],
    from: WINDOW.from,
    to: WINDOW.to,
    granularity_s: 60,
    as_of_ingest_seq: 918_442,
    ...over,
  });

test('a descriptor the server issued verifies, and comes back with its fields intact', () => {
  const d = descriptor();
  const back = verify(JSON.parse(JSON.stringify(d)));
  assert.notEqual(back, null);
  assert.equal(back?.metric, 'ctr');
  assert.equal(back?.as_of_ingest_seq, 918_442);
  assert.deepEqual(back?.ad_ids, ['a_03']);
});

test('EVERY field is covered by the signature — change one and it stops verifying', () => {
  const d = descriptor();
  // Each of these is a different question, and each would return a different, plausible number if
  // it were answered. That is the whole risk: a tampered descriptor does not look tampered.
  const tampers: Record<string, unknown>[] = [
    { ...d, metric: 'cpa' },
    { ...d, ad_ids: ['a_12'] },
    { ...d, ad_ids: ['a_03', 'a_12'] },
    { ...d, from: '2026-09-03T11:00:00.000Z' },
    { ...d, to: '2026-09-03T14:00:00.000Z' },
    { ...d, granularity_s: 3_600 },
    { ...d, as_of_ingest_seq: 918_441 },
    { ...d, generation_scope: 'g_a03_002' },
  ];
  for (const t of tampers) {
    assert.equal(verify(t), null, `tampered field slipped through: ${JSON.stringify(t)}`);
  }
});

test('a client cannot mint one, and a malformed body is refused rather than throwing', () => {
  // The shape a browser could plausibly build by hand, with a made-up signature.
  assert.equal(
    verify({
      metric: 'roas', ad_ids: ['a_03'], from: WINDOW.from, to: WINDOW.to, granularity_s: 60,
      placement_rule: 'cohort_click_time', generation_scope: null, as_of_ingest_seq: 1,
      sig: 'deadbeef',
    }),
    null,
  );
  // A one-character sig: `timingSafeEqual` THROWS on unequal lengths, so without the length guard
  // this is a 500 instead of a rejection. Same screen, different HTTP status, and a 500 in the
  // server log is what a reviewer would chase.
  assert.equal(verify({ ...descriptor(), sig: 'x' }), null);
  for (const junk of [null, undefined, 42, 'a string', [], {}, { metric: 'nope' }]) {
    assert.equal(verify(junk), null, `junk body was accepted: ${String(junk)}`);
  }
});

test('the signed bytes do not depend on key order or on ad_id order', () => {
  const a = sign({
    metric: 'ctr', ad_ids: ['a_12', 'a_03'], from: WINDOW.from, to: WINDOW.to,
    granularity_s: 60, placement_rule: 'cohort_click_time', generation_scope: null,
    as_of_ingest_seq: 7,
  });
  // Same fields, opposite insertion order and opposite ad order — `JSON.stringify` would hash
  // these two differently, and one of them would then fail to verify depending on which code path
  // built it. The explicit field list in `canonical()` is what makes them the same descriptor.
  const b = sign({
    as_of_ingest_seq: 7, generation_scope: null, placement_rule: 'cohort_click_time',
    granularity_s: 60, to: WINDOW.to, from: WINDOW.from, ad_ids: ['a_03', 'a_12'], metric: 'ctr',
  });
  assert.equal(a.sig, b.sig);
  assert.deepEqual(a.ad_ids, ['a_03', 'a_12'], 'issuance sorts, so the wire form is canonical too');
});

test('D46: a narrowing at the descriptor’s own grain is legal', () => {
  const d = descriptor({ granularity_s: 60 });
  assert.equal(narrows(d, '2026-09-03T12:00:00.000Z', '2026-09-03T12:01:00.000Z'), null);
  assert.equal(narrows(d, '2026-09-03T12:59:00.000Z', '2026-09-03T13:00:00.000Z'), null);
});

test('D46: a narrowing at a DIFFERENT grain is refused — this is the trap §14 names', () => {
  const hourly = descriptor({ granularity_s: 3_600 });
  // The chart drew at the hour; the drill-down asks for a minute. It would return a real number
  // from real events — the wrong one — and the assertion would compare it against an hourly
  // figure and read FAIL for a reason that is not corruption.
  assert.notEqual(narrows(hourly, '2026-09-03T12:00:00.000Z', '2026-09-03T12:01:00.000Z'), null);
  // The reverse: a minute descriptor asked for an hour.
  const minute = descriptor({ granularity_s: 60 });
  assert.notEqual(narrows(minute, '2026-09-03T12:00:00.000Z', '2026-09-03T13:00:00.000Z'), null);
  // Right width, wrong phase — 12:00:30 is one grain wide but not on a boundary of the window.
  assert.notEqual(narrows(minute, '2026-09-03T12:00:30.000Z', '2026-09-03T12:01:30.000Z'), null);
  // Outside the window entirely.
  assert.notEqual(narrows(minute, '2026-09-03T11:59:00.000Z', '2026-09-03T12:00:00.000Z'), null);
});
