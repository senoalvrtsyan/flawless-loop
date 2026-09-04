// B40 — the smoother, under D43's criterion. Invisible when wrong in a particular direction: a
// chart drawn from a mis-weighted EWMA is SMOOTHER than the truth and therefore reads as a cleaner
// signal, which is the way round that misleads a strategist into acting.
//
// Two cases carry the weight. The half-life must mean fifteen MINUTES rather than fifteen POINTS —
// D20's ladder makes the step size a variable, so a per-point α silently means fifteen minutes at
// the minute rung and fifteen hours at the hour rung. And a gap must DECAY rather than bridge, or a
// suppressed stretch carries an hour-old level across itself and the gate's suppression is undone
// by the smoother the moment both are switched on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ewma } from './metrics.ts';

test('EWMA’s first point is the series itself, and it converges toward a level', () => {
  const x = [0, 900, 1_800, 2_700]; // 15-minute steps, in SECONDS
  const y = [1, 0, 0, 0];
  const out = ewma(x, y);
  assert.equal(out[0], 1, 'nothing to average with yet');
  // At exactly one half-life the carried weight is 0.5, so 1 -> 0 halves each step.
  assert.equal(out[1], 0.5);
  assert.equal(out[2], 0.25);
  assert.equal(out[3], 0.125);
});

test('the half-life is TIME, so the rung the gate picked changes the weight, not the meaning', () => {
  // One hour apart: the carried weight is 2^-4 = 0.0625, which is why smoothing is nearly inert at
  // the hour rung — where CPA and ROAS are usually drawn.
  const hourly = ewma([0, 3_600], [1, 0]);
  assert.ok(Math.abs((hourly[1] ?? 0) - 0.0625) < 1e-12);
  // One minute apart: 2^(-1/15) = 0.9548 carried, so a minute-rung series barely moves per point.
  const minutely = ewma([0, 60], [1, 0]);
  assert.ok(Math.abs((minutely[1] ?? 0) - Math.pow(2, -1 / 15)) < 1e-12);
});

test('a gap DECAYS rather than bridges, and emits null where the series had none', () => {
  const x = [0, 900, 1_800, 2_700];
  const y = [1, null, null, 0];
  const out = ewma(x, y);
  assert.equal(out[1], null, 'a suppressed or pre-launch point stays absent');
  assert.equal(out[2], null);
  // 45 minutes elapsed = three half-lives, so only 1/8 of the old level is carried: 1 -> 0.125.
  assert.ok(Math.abs((out[3] ?? 1) - 0.125) < 1e-12, 'weighted by ELAPSED time, not by point index');
});

test('smoothing never invents a point where the gate suppressed one', () => {
  const out = ewma([0, 900, 1_800], [null, null, null]);
  assert.deepEqual(out, [null, null, null]);
});
