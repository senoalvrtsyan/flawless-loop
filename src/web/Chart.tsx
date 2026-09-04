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
// raw events reach the client (D30-A, rejected), and no ratio is computed here — B38 adds ratios,
// server-computed, because D10 puts the division after the aggregation.

import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { AdRow, BucketRow } from '../server/snapshot.ts';
import { toColumns } from './series.ts';

/** The palette, in order. Twelve ads, twelve hues; index 12+ wraps and the legend disambiguates. */
const SERIES_COLOURS = [
  '#1b4fd8', '#c2410c', '#157347', '#7c3aed', '#b91c1c', '#0891b2',
  '#a16207', '#be185d', '#4d7c0f', '#4338ca', '#0f766e', '#9a3412',
];

const HEIGHT = 320;

export type ChartProps = {
  rows: readonly BucketRow[];
  /** The window the SERVER resolved, echoed back — never the client's own idea of it. */
  window: { from: string; to: string };
  /** The ads to draw, already resolved from "all" to a concrete list, in display order. */
  ads: readonly AdRow[];
  /** Display granularity in seconds — 60 (minute) or 3600 (hour). */
  granularitySeconds: number;
};

/** uPlot options. Rebuilt whenever the SERIES SET changes — uPlot cannot add a series in place. */
function options(labels: readonly string[], width: number): uPlot.Options {
  return {
    width,
    height: HEIGHT,
    // Local time on the axis, UTC in every value we store and send. The axis is the one place a
    // reviewer reads a clock, and they read it in their own.
    scales: { x: { time: true } },
    axes: [{ stroke: '#5b6470' }, { stroke: '#5b6470' }],
    legend: { show: true, live: true },
    series: [
      { label: 'time' },
      ...labels.map((label, i) => ({
        label,
        stroke: SERIES_COLOURS[i % SERIES_COLOURS.length],
        width: 1.5,
        // A gap is drawn as a gap: `spanGaps: false` is uPlot's default and is stated here because
        // the null/zero distinction above is only meaningful if nulls are not bridged.
        spanGaps: false,
      })),
    ],
  };
}

export function Chart({ rows, window, ads, granularitySeconds }: ChartProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const plot = useRef<uPlot | null>(null);
  const { data, labels } = useMemo(() => {
    const columns = toColumns(rows, window, ads, granularitySeconds);
    // uPlot's `AlignedData` is a positional tuple, so the assertion is over SHAPE, not over values:
    // `series.ts` returns the same arrays this line reorders into one array-of-arrays.
    return {
      data: [columns.x, ...columns.series] as unknown as uPlot.AlignedData,
      labels: columns.labels,
    };
  }, [rows, window, ads, granularitySeconds]);

  // Read by the construction effect below, which must NOT re-run when only the labels change — a
  // rename is not a new series set. The ref is how that effect reads a current value without taking
  // a dependency on it.
  const labelsRef = useRef<string[]>(labels);
  labelsRef.current = labels;

  // The series SET decides the instance's identity: uPlot builds its series from options at
  // construction, so selecting another ad is a rebuild, not a `setData`. The key is the AD IDS —
  // identity is which ads, not what they are called — and joining names instead would shred
  // "Product demo · retargeting" into four labels the first time it was split back apart.
  const shape = ads.map((ad) => ad.ad_id).join(' ');

  useEffect(() => {
    const element = host.current;
    if (element === null || shape === '') return;
    const width = element.clientWidth || 800;
    const instance = new uPlot(options(labelsRef.current, width), data, element);
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

  if (ads.length === 0) return <p>Select an ad to chart.</p>;
  return <div className="chart" ref={host} />;
}
