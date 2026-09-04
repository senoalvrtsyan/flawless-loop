// The chart — B37, and the ONLY file in this repo that imports uPlot (D44's §5 sign-off).
//
// ** `import uPlot` APPEARS HERE AND NOWHERE ELSE. ** That is a rule rather than a style
// preference, for two reasons written into D44:
//
//   1. **D34's quarantine.** Every performance number renders through a component holding a
//      server-issued `TraceDescriptor` (B51/B52). A second import site is what would let some other
//      component draw a number the descriptor path never touched.
//   2. **D44's flip condition.** If uPlot's imperative lifecycle costs more than half a chunk to
//      reconcile with React's, the fallback is hand-rolled SVG *behind this same props interface*.
//      One import site is what makes that port mechanical instead of a rewrite.
//
// What it draws: **one series per selected ad, from server-sent bucket rows and nothing else.** No
// raw events reach the client (D30-A, rejected).
//
// **B39 makes the metric a choice and the granularity the GATE's** (D20/D67). The plan — which rung,
// which ads, which points suppressed — is computed in `gate.ts` and arrives as a prop; this file
// consumes it. The per-point division is `series.ts`'s `metricColumn`, after `pointCounts` has
// summed the counts (D10, and D46's re-bucketing allowance). A gated point is `null`, so
// `spanGaps: false` is what makes suppression visible instead of interpolated.

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { BucketRow } from '../server/snapshot.ts';
import { metricColumn, pointCounts } from './series.ts';
import { clears, type ChartPlan } from './gate.ts';
import { HALF_LIFE_MS, ewma, formatCents, formatCtr, formatRoas } from './metrics.ts';
import type { MetricKey } from '../shared/metrics.ts';

/** The palette, in order. Twelve ads, twelve hues; index 12+ wraps and the legend disambiguates. */
const SERIES_COLOURS = [
  '#1b4fd8', '#c2410c', '#157347', '#7c3aed', '#b91c1c', '#0891b2',
  '#a16207', '#be185d', '#4d7c0f', '#4338ca', '#0f766e', '#9a3412',
];

const HEIGHT = 320;

export type ChartProps = {
  rows: readonly BucketRow[];
  /** The window on screen — the client's current frame under D65, not the anchor. */
  window: { from: string; to: string };
  /**
   * **The gate's plan** (B39): the rung, the ads that cleared it, and the bar to suppress against.
   * The component draws what the plan says and decides nothing itself.
   */
  plan: ChartPlan;
  /**
   * **B40 — EWMA at D20's 15-minute half-life, or the raw series.** Off by default: the raw view is
   * the one B53's drill-down asserts against, so it is the one a reviewer should be looking at
   * unless they asked otherwise.
   */
  smooth: boolean;
};

/** Axis and legend formatting per metric — the y values are raw numbers in the metric's own unit. */
function formatValue(metric: MetricKey, value: number | null): string {
  if (value === null) return '—';
  switch (metric) {
    case 'ctr':
      return formatCtr(value);
    case 'roas':
      return formatRoas(value);
    case 'spend':
    case 'cpa':
      return formatCents(value);
    default:
      return value.toLocaleString('en-US');
  }
}

/** uPlot options. Rebuilt whenever the SERIES SET changes — uPlot cannot add a series in place. */
function options(labels: readonly string[], width: number, metric: MetricKey): uPlot.Options {
  return {
    width,
    height: HEIGHT,
    // Local time on the axis, UTC in every value we store and send. The axis is the one place a
    // reviewer reads a clock, and they read it in their own.
    scales: { x: { time: true } },
    axes: [
      { stroke: '#5b6470' },
      // The y axis speaks the metric's unit: percent for CTR, dollars for spend and CPA, a
      // multiple for ROAS. A CPA axis reading "412" instead of "$4.12" is the kind of wrong that
      // looks right.
      { stroke: '#5b6470', values: (_u, ticks) => ticks.map((t) => formatValue(metric, t)) },
    ],
    legend: { show: true, live: true },
    series: [
      { label: 'time' },
      ...labels.map((label, i) => ({
        label,
        value: (_u: uPlot, v: number | null) => formatValue(metric, v),
        stroke: SERIES_COLOURS[i % SERIES_COLOURS.length],
        width: 1.5,
        // A gap is drawn as a gap: `spanGaps: false` is uPlot's default and is stated here because
        // the null/zero distinction above is only meaningful if nulls are not bridged.
        spanGaps: false,
      })),
    ],
  };
}

export function Chart({ rows, window, plan, smooth }: ChartProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const plot = useRef<uPlot | null>(null);
  const { data, labels } = useMemo(() => {
    // Re-bucketed at the PLAN's granularity, never the viewport's — that is the whole of the D46
    // trap in `BUILD_PLAN.md` §14, and at B51 the plan's granularity becomes the descriptor's.
    const points = pointCounts(rows, window, plan.drawn, plan.granularity_s);
    const bar = plan.bar;
    const columns = points.series.map((column) => {
      // The suppression: a point whose own denominator is under the bar draws nothing (D20/D67).
      const raw = metricColumn(column, plan.metric, bar === null ? () => false : (counts) => !clears(counts, bar));
      // Smoothing comes AFTER the gate, never before it: a suppressed point must not re-enter the
      // series through its neighbour's average, which is exactly what smoothing first would do.
      return smooth ? ewma(points.x, raw, HALF_LIFE_MS) : raw;
    });
    // uPlot's `AlignedData` is a positional tuple, so the assertion is over SHAPE, not over values:
    // `series.ts` returns the same arrays this line reorders into one array-of-arrays.
    return {
      data: [points.x, ...columns] as unknown as uPlot.AlignedData,
      labels: points.labels,
    };
  }, [rows, window, plan, smooth]);

  // Read by the construction effect below, which must NOT re-run when only the labels change — a
  // rename is not a new series set. The ref is how that effect reads a current value without taking
  // a dependency on it.
  const labelsRef = useRef<string[]>(labels);
  labelsRef.current = labels;
  const metricRef = useRef<MetricKey>(plan.metric);
  metricRef.current = plan.metric;

  // The series SET decides the instance's identity: uPlot builds its series from options at
  // construction, so selecting another ad is a rebuild, not a `setData`. The key is the AD IDS —
  // identity is which ads, not what they are called — and joining names instead would shred
  // "Product demo · retargeting" into four labels the first time it was split back apart.
  const shape = `${plan.metric} ${plan.drawn.map((ad) => ad.ad_id).join(' ')}`;

  useEffect(() => {
    const element = host.current;
    if (element === null || shape === '') return;
    const width = element.clientWidth || 800;
    const instance = new uPlot(options(labelsRef.current, width, metricRef.current), data, element);
    plot.current = instance;

    const onResize = () => instance.setSize({ width: element.clientWidth || 800, height: HEIGHT });
    globalThis.addEventListener('resize', onResize);
    return () => {
      globalThis.removeEventListener('resize', onResize);
      plot.current = null;
      instance.destroy();
    };
    // `data` is deliberately NOT a dependency: it is the instance's INITIAL data and is updated by
    // the effect below. Listing it here would destroy and rebuild the canvas four times a second,
    // which is the one cost D44 chose this library to avoid.
  }, [shape]);

  // The steady-state path, and the one D44 was chosen for: at a 250 ms flush tick this runs up to
  // four times a second for as long as the demo is open. An array swap, not a reconciliation.
  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  if (plan.drawn.length === 0) {
    return (
      <p>
        Nothing to draw at this metric. {plan.dropped.length > 0 ? 'Every selected ad is below the bar — see below.' : 'Select an ad to chart.'}
      </p>
    );
  }
  return <div className="chart" ref={host} />;
}
