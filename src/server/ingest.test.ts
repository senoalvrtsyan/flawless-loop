// D43, target 2 of 3: `isCanonicalIso`. Owed from B05, landed here with the test surface.
//
// This file covers ONE exported function on purpose. The rest of `ingest()` is verified by hand
// against the real store (STATUS.md's B05 row) because its wrongness is loud — a rejected event
// shows up as a disposition you can count. `isCanonicalIso` is the opposite: loosen it and the
// event is ACCEPTED, `ts_effective` silently takes the later instant (SQLite's MIN over TEXT is
// lexicographic), and B24's agreement sweep re-derives from that same column and agrees with
// itself. Our own emitter only ever sends the canonical form, so nothing downstream can see it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCanonicalIso } from './ingest.ts';

test('the canonical form — exactly `new Date().toISOString()` — is accepted', () => {
  assert.equal(isCanonicalIso('2026-09-04T12:03:45.678Z'), true);
  assert.equal(isCanonicalIso('2026-09-04T12:03:45.000Z'), true);
  assert.equal(isCanonicalIso(new Date().toISOString()), true);
  // Years before 1970 and the leap day round-trip through V8 unchanged.
  assert.equal(isCanonicalIso('1969-12-31T23:59:59.999Z'), true);
  assert.equal(isCanonicalIso('2024-02-29T00:00:00.000Z'), true);
});

test('THE TRAP: same-instant strings of a different SHAPE are refused', () => {
  // Every one of these parses to a valid instant. Accepting any of them puts two shapes into
  // `signals.ts`, and `MIN(ts, received_at)` then compares them BYTE-wise:
  //   MIN('2026-09-04T12:03:45.500Z', '2026-09-04T12:03:45Z') = the .500Z value = the LATER one.
  // I10's clamp inverts, and nothing anywhere reports an error.
  for (const value of [
    '2026-09-04T12:03:45Z',          // no milliseconds
    '2026-09-04T12:03:45.6Z',        // one digit
    '2026-09-04T12:03:45.67Z',       // two digits
    '2026-09-04T12:03:45.678000Z',   // microseconds
    '2026-09-04T12:03:45.678+00:00', // the same instant, spelled with an offset
    '2026-09-04T14:03:45.678+02:00', // ditto, in another zone
    '2026-09-04t12:03:45.678z',      // lowercase designators
    '2026-09-04 12:03:45.678Z',      // space instead of T
    '+002026-09-04T12:03:45.678Z',   // expanded year
  ]) {
    assert.equal(isCanonicalIso(value), false, value);
  }
});

test('a bound with NO offset is refused — it would be read as LOCAL time', () => {
  // The B07 finding, on the write side: `new Date('2026-09-04T12:00:00')` is parsed in the host's
  // zone, so the same string means a different instant on another laptop.
  assert.equal(isCanonicalIso('2026-09-04T12:03:45.678'), false);
  assert.equal(isCanonicalIso('2026-09-04'), false);
});

test('unparseable and non-string values are refused without throwing', () => {
  for (const value of ['', 'yesterday', '2026-13-04T12:03:45.678Z', '2026-02-30T00:00:00.000Z']) {
    assert.equal(isCanonicalIso(value), false, value);
  }
  for (const value of [null, undefined, 12, NaN, {}, [], new Date()]) {
    assert.equal(isCanonicalIso(value), false, String(value));
  }
});
