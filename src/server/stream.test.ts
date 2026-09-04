// D43, target 3 of 3: `readCursor`. Owed from B10a, where BOTH of its failure modes were silent
// and both were found by Seno re-running the verification rather than by the code.
//
// `readCursor` is exported for this test and for `createStream`. Nothing else calls it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCursor } from './stream.ts';

test('absent is the ONLY path to "go live" with no replay', () => {
  assert.equal(readCursor(undefined, null), null);
});

test('THE TRAP: present-but-empty is invalid, never absent', () => {
  // Read as absent, the client goes live with no replay — the exact snapshot-to-subscribe gap
  // D47 exists to close, and one `?cursor=${''}` away in the client.
  assert.deepEqual(readCursor(undefined, ''), { invalid: '' });
  assert.deepEqual(readCursor('', null), { invalid: '' });
});

test('THE TRAP: the RAW STRING is validated, not the parsed number', () => {
  // `Number('1e3')` is 1000. On a store at log position 2001 that replays 1001 rows, byte-identical
  // to a legitimate `?cursor=1000`, silently skipping buckets 1-1000. Every value below survives
  // `Number.isInteger`, which inspects the OUTPUT.
  for (const value of ['1e3', '0x3', '+2', '2.0', ' 2', '2 ', 'Infinity', '-1', '1_0', '２']) {
    assert.deepEqual(readCursor(undefined, value), { invalid: value }, value);
  }
});

test('decimal digits are accepted, leading zeros and all', () => {
  assert.deepEqual(readCursor(undefined, '0'), { cursor: 0 });
  assert.deepEqual(readCursor(undefined, '14'), { cursor: 14 });
  assert.deepEqual(readCursor(undefined, '007'), { cursor: 7 });
});

test('D47: the cursor is max(?cursor, Last-Event-ID), in both directions', () => {
  // Both are TRUE statements of "I hold everything up to X", so the max is the tightest true lower
  // bound. `min` would replay redundantly and could trip RESNAPSHOT_ROWS for no reason.
  assert.deepEqual(readCursor('10', '20'), { cursor: 20 });
  assert.deepEqual(readCursor('20', '10'), { cursor: 20 });
  assert.deepEqual(readCursor('20', null), { cursor: 20 });
});

test('one bad value invalidates the pair, whichever side it is on', () => {
  assert.deepEqual(readCursor('1e3', '20'), { invalid: '1e3' });
  assert.deepEqual(readCursor('20', '1e3'), { invalid: '1e3' });
});

test('a duplicated Last-Event-ID header is invalid, not silently joined', () => {
  assert.deepEqual(readCursor(['1', '2'], null), { invalid: '1,2' });
});
