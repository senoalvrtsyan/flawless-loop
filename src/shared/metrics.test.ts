// B38 — the ratio arithmetic, under D43's criterion: *"tests only where a wrong answer is
// invisible"*. Every case below is a number that would appear on screen, look entirely ordinary,
// and be wrong:
//
//   - a CPA that quietly includes provisional conversions reads BETTER than the truth, and both
//     columns are called conversions, so the bug is a plus sign (`BUILD_PLAN.md` §14 names B38);
//   - a ROAS over `spend_cents` alone ignores every click charge — the brief's L79-80 says total
//     spend is the sum of two disjoint columns, and dropping one inflates the return;
//   - a ratio that returns 0 for 0/0 states that an unserved ad has a zero click-through rate;
//   - dividing before aggregating gives a plausible number at every granularity and the right one
//     at none, which is the whole reason D10 stores counts.
//
// The last test is a rule rather than an arithmetic check: it greps the migrations, because a
// stored ratio column would make all of the above true again from a different direction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ZERO_COUNTS,
  addCounts,
  cpaCents,
  ctr,
  derive,
  metricValue,
  roas,
  spendTotalCents,
  type MetricCounts,
} from './metrics.ts';

const counts = (over: Partial<MetricCounts> = {}): MetricCounts => ({ ...ZERO_COUNTS, ...over });

test('CTR is clicks over impressions, and the division comes after the sum', () => {
  assert.equal(ctr(counts({ impressions: 1_000, clicks: 21 })), 0.021);
  // Two buckets: 20/1000 and 1/500. The correct answer is 21/1500, not the mean of 2% and 0.2%.
  const a = counts({ impressions: 1_000, clicks: 20 });
  const b = counts({ impressions: 500, clicks: 1 });
  const summed = ctr(addCounts(a, b));
  assert.equal(summed, 21 / 1500);
  const meanOfRatios = ((ctr(a) ?? 0) + (ctr(b) ?? 0)) / 2;
  assert.notEqual(summed, meanOfRatios, 'averaging ratios is the plausible wrong answer');
});

test('total spend is BOTH columns — L79-80, and dropping one is invisible', () => {
  const c = counts({ click_cost_cents: 6_200, spend_cents: 1_300 });
  assert.equal(spendTotalCents(c), 7_500);
  assert.equal(roas(counts({ ...c, value_cents: 30_000 })), 4);
  // The tempting wrong form: value / spend_cents alone would read 23.08× on the same data.
  assert.notEqual(30_000 / c.spend_cents, 4);
});

test('CPA excludes provisional conversions — the §14 trap, and it flatters the number', () => {
  const c = counts({
    click_cost_cents: 8_000,
    spend_cents: 2_000,
    conversions: 5,
    provisional_conversions: 5,
  });
  assert.equal(cpaCents(c), 2_000, '$20.00 against five SETTLED conversions');
  // Summed, the same row reads $10.00 — twice as good, and nothing about it looks wrong.
  assert.equal(spendTotalCents(c) / (c.conversions + c.provisional_conversions), 1_000);
});

test('ROAS excludes provisional value for the same reason', () => {
  const c = counts({ spend_cents: 10_000, value_cents: 20_000, provisional_value_cents: 20_000 });
  assert.equal(roas(c), 2);
});

test('an empty denominator is UNKNOWN, never zero', () => {
  assert.equal(ctr(ZERO_COUNTS), null, 'no impressions is not a 0% click-through rate');
  assert.equal(cpaCents(counts({ spend_cents: 5_000 })), null, 'spend with no conversions has no CPA');
  assert.equal(roas(counts({ value_cents: 5_000 })), null, 'value with no spend has no ROAS');
  // And a real zero is still a zero: clicks of 0 over impressions of 1,000 IS 0%.
  assert.equal(ctr(counts({ impressions: 1_000 })), 0);
});

test('derive() carries the counts through untouched and adds only the three ratios', () => {
  const c = counts({ impressions: 500, clicks: 10, click_cost_cents: 620, spend_cents: 130 });
  const set = derive(c, 7);
  assert.equal(set.impressions, 500);
  assert.equal(set.buckets, 7);
  assert.equal(set.spend_total_cents, 750);
  assert.equal(set.ctr, 0.02);
  assert.equal(set.cpa_cents, null);
  for (const key of Object.keys(c) as (keyof MetricCounts)[]) assert.equal(set[key], c[key]);
});

test('metricValue is the only place a metric NAME becomes a number', () => {
  const c = counts({ impressions: 1_000, clicks: 25, click_cost_cents: 900, spend_cents: 100 });
  assert.equal(metricValue('impressions', c), 1_000);
  assert.equal(metricValue('clicks', c), 25);
  assert.equal(metricValue('spend', c), 1_000, 'spend is the read-time sum, not one column');
  assert.equal(metricValue('ctr', c), 0.025);
  assert.equal(metricValue('cpa', c), null);
  assert.equal(metricValue('roas', c), 0);
});

test('NO MIGRATION DECLARES A RATIO COLUMN — D10, checked rather than asserted in prose', () => {
  const dir = join(import.meta.dirname, '..', '..', 'migrations');
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const line of sql.split('\n')) {
      // Column DEFINITIONS only: `REAL`/`NUMERIC` affinity, or a name that is a ratio. Comments
      // and prose mentioning CTR are fine — `002_projections.sql` explains why none of these exist.
      const definition = line.trim().split('--')[0] ?? '';
      if (/\b(REAL|NUMERIC|FLOAT|DOUBLE)\b/i.test(definition)) offenders.push(`${file}: ${definition.trim()}`);
      if (/^\s*(ctr|cpa|roas|cvr|rate|ratio)\b/i.test(definition)) offenders.push(`${file}: ${definition.trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a stored ratio is wrong at every other granularity and makes restatement rewrite it (§4.3)',
  );
});
