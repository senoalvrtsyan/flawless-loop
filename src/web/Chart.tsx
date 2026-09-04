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
import type { Boundary } from './generations.ts';
import { clears, type ChartPlan } from './gate.ts';
import { HALF_LIFE_MS, ewma, formatCents, formatCtr, formatRoas } from './metrics.ts';
import type { MetricKey } from '../shared/metrics.ts';

/** The palette, in order. Twelve ads, twelve hues; index 12+ wraps and the legend disambiguates. */
const SERIES_COLOURS = [
  '#1b4fd8', '#c2410c', '#157347', '#7c3aed', '#b91c1c', '#0891b2',
  '#a16207', '#be185d', '#4d7c0f', '#4338ca', '#0f766e', '#9a3412',
];

const HEIGHT = 320;

/**
 * **B42 — settlement, drawn so it survives a greyscale screenshot** (D45's requirement, which B42
 * is the chunk that gets checked on).
 *
 * Colour is the second channel here, never the only one:
 *
 *   - the **settlement horizon** (`now − 72 h`, D13) is a DASHED vertical rule with a text label,
 *     so "left of this line is settled, right of it is still live" is readable with no colour at
 *     all. It is one rule rather than per-point shading because settlement is a property of age,
 *     and a contiguous band drawn per point would say the same thing twelve times;
 *   - a **restated** point gets a hollow SQUARE marker plus a full-height hairline at its x — a
 *     shape and a position, not a hue.
 *
 * **Persistent, not transient** (`DESIGN.md` §5.6's first clause): the marks are drawn from
 * `restated_at` on the row, so they are still there on the next repaint, after a refresh, and days
 * later. A flash would be worse than nothing — the reviewer is looking somewhere else.
 */
const HORIZON_STROKE = '#5b6470';
const RESTATED_STROKE = '#c2410c';
const MARKER = 9;

/**
 * **B48 — a generation boundary, drawn so it cannot be confused with the other two rules.**
 *
 * Three vertical rules now share this canvas, and D45's non-colour requirement is what keeps them
 * apart at a glance and in greyscale:
 *
 *   | rule | dash | label | what it means |
 *   |---|---|---|---|
 *   | settlement horizon | `6 4` long dash | `settled ◂ / ▸ live` mid-height | age |
 *   | restated point | `2 2` fine dot + square marker | none | this number moved |
 *   | **generation boundary** | **solid, with a ▼ at the top** | **`a_03 g4` at the top** | **config changed here** |
 *
 * Solid-and-labelled is the right treatment for this one because it is the only rule of the three
 * that marks a HUMAN act: a lever was pulled at this instant, and everything to the right of it is
 * a different ad configuration than everything to the left. The step in the series at that x is
 * explained by this rule and, per §4.2, by nothing else.
 */
const BOUNDARY_STROKE = '#7c3aed';

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
  /**
   * **B48** — the config changes that fall inside `window`, for the charted ads, already diffed
   * (`generations.ts`). The component draws them and derives nothing: which boundaries are in view
   * and what each one changed are both decisions with a wrong answer that draws a normal chart, so
   * they are tested there rather than computed here.
   */
  boundaries: readonly Boundary[];
  /**
   * **B49** — the horizon the dashed settlement rule is drawn at, in ms. A prop rather than the
   * `HORIZON_MS` constant it used to read, because P16 sweeps it: a rule frozen at 72 h beside
   * settlement marks derived at 2 h would be the same disagreement on one canvas.
   */
  horizonMs: number;
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

/**
 * Where the restated marks go: `[seriesIndex, pointIndex]` pairs, read through a ref so the draw
 * hook always sees the current set without the plot being rebuilt when it changes.
 */
type Marks = {
  restated: readonly (readonly boolean[])[];
  boundaries: readonly Boundary[];
  horizonMs: number;
};

/** uPlot options. Rebuilt whenever the SERIES SET changes — uPlot cannot add a series in place. */
function options(
  labels: readonly string[],
  width: number,
  metric: MetricKey,
  marks: { current: Marks },
): uPlot.Options {
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
    hooks: {
      // AFTER the series are drawn, so the marks sit on top of the lines rather than under them.
      draw: [
        (u) => {
          const ctx = u.ctx;
          const left = u.bbox.left;
          const top = u.bbox.top;
          const height = u.bbox.height;
          ctx.save();

          // 1. The settlement horizon. Drawn only when it falls inside the window — outside it the
          //    label would point off-canvas and say nothing true about what is on screen.
          const horizonSeconds = (Date.now() - marks.current.horizonMs) / 1_000;
          const [min, max] = u.scales.x?.min !== undefined && u.scales.x?.max !== undefined
            ? [u.scales.x.min, u.scales.x.max]
            : [0, 0];
          if (horizonSeconds > min && horizonSeconds < max) {
            const x = left + u.valToPos(horizonSeconds, 'x');
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = HORIZON_STROKE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = HORIZON_STROKE;
            ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('settled ◂', x - 4, top + 11);
            ctx.textAlign = 'left';
            ctx.fillText('▸ live', x + 4, top + 11);
          }

          // 2. The restated points. Shape and position carry the meaning; the colour is a third
          //    channel on top of both, which is what makes the greyscale check pass.
          ctx.strokeStyle = RESTATED_STROKE;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          const drawn = new Set<number>();
          marks.current.restated.forEach((column, s) => {
            const values = u.data[s + 1];
            column.forEach((isRestated, i) => {
              if (!isRestated) return;
              const xValue = u.data[0]?.[i];
              if (xValue === undefined) return;
              const x = left + u.valToPos(xValue, 'x');
              // The hairline, once per x even if three ads restated the same minute.
              if (!drawn.has(i)) {
                drawn.add(i);
                ctx.beginPath();
                ctx.moveTo(x, top);
                ctx.lineTo(x, top + height);
                ctx.stroke();
              }
              // The marker, only where that ad actually has a value at that point — a square
              // floating in space would claim a restatement of a number that is not drawn.
              const yValue = values?.[i];
              if (yValue === null || yValue === undefined) return;
              const y = top + u.valToPos(yValue as number, 'y');
              ctx.setLineDash([]);
              ctx.strokeRect(x - MARKER / 2, y - MARKER / 2, MARKER, MARKER);
              ctx.setLineDash([2, 2]);
            });
          });

          // 3. **The generation boundaries** (B48). Drawn LAST, so a config change is legible on
          //    top of both the settlement rule and the restatement hairlines — it is the only one
          //    of the three that a human caused, and it is the one the reader is looking for when
          //    a series steps.
          ctx.setLineDash([]);
          ctx.strokeStyle = BOUNDARY_STROKE;
          ctx.fillStyle = BOUNDARY_STROKE;
          ctx.lineWidth = 1;
          ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'left';
          // Stack the labels when two boundaries land close together, so a swap and a budget
          // change a minute apart read as two events rather than as one smudge.
          let lastLabelX = Number.NEGATIVE_INFINITY;
          let row = 0;
          for (const boundary of marks.current.boundaries) {
            const seconds = boundary.atMs / 1_000;
            if (seconds <= min || seconds >= max) continue;
            const x = left + u.valToPos(seconds, 'x');
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            // The ▼ is the non-colour channel: a solid rule alone could be mistaken for a series
            // at a metric with one flat value, and a triangle at the top cannot.
            ctx.beginPath();
            ctx.moveTo(x - 4, top);
            ctx.lineTo(x + 4, top);
            ctx.lineTo(x, top + 5);
            ctx.closePath();
            ctx.fill();
            row = x - lastLabelX < 60 ? row + 1 : 0;
            lastLabelX = x;
            ctx.fillText(`${boundary.ad_id} g${boundary.seq_in_ad}`, x + 3, top + 14 + row * 11);
          }
          ctx.restore();
        },
      ],
    },
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

export function Chart({ rows, window, plan, smooth, boundaries, horizonMs }: ChartProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const plot = useRef<uPlot | null>(null);
  const { data, labels, restated } = useMemo(() => {
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
      restated: points.restated,
    };
  }, [rows, window, plan, smooth]);

  // Read by the construction effect below, which must NOT re-run when only the labels change — a
  // rename is not a new series set. The ref is how that effect reads a current value without taking
  // a dependency on it.
  const labelsRef = useRef<string[]>(labels);
  labelsRef.current = labels;
  const marksRef = useRef<Marks>({ restated: [], boundaries: [], horizonMs });
  marksRef.current = { restated, boundaries, horizonMs };
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
    const instance = new uPlot(
      options(labelsRef.current, width, metricRef.current, marksRef),
      data,
      element,
    );
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
    // `setData` triggers a redraw, which re-runs the draw hook above, which reads `marksRef` — so
    // the marks follow the data without the plot being rebuilt.
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
