// The client's metric layer — **formatting and re-bucketing, never an independent number** (B38).
//
// **D46 in one sentence:** the server computes and signs totals and ratios; the client may
// re-bucket to display granularity under the server's own descriptor, and what it renders carries
// that descriptor unmodified. So this file is allowed to turn 0.0214 into "2.14%" and to ask the
// server for a fresher answer — it is not allowed to originate a headline figure. The division
// itself lives in `src/shared/metrics.ts`, which the server calls for window totals and the chart
// calls per plotted point (B39), so `clicks / impressions` has exactly one implementation.
//
// **D66 is the fetch below.** A rolling window (D65) makes any snapshot-time total describe a
// window that has since moved, so the client re-asks over `?include=totals` — 20 ms and ~2 KB
// against 449 ms and 24 MB for a full snapshot, measured on the seeded week. What comes back
// carries `as_of_ingest_seq` and the resolved window, so the screen can say which question was
// answered and at which log position rather than implying it is current.

import type { MetricTotals, TotalsResponse } from '../server/snapshot.ts';
import type { RestatementEntry } from '../server/restatements.ts';
import type { SweepResult } from '../server/sweep.ts';
import type { DecisionScore } from '../server/scoring.ts';
import type { FatigueReport } from '../server/fatigue-flag.ts';
import type { MetricKey } from '../shared/metrics.ts';

export const METRIC_LABELS: Record<MetricKey, string> = {
  impressions: 'Impressions',
  clicks: 'Clicks',
  spend: 'Spend',
  ctr: 'CTR',
  cpa: 'CPA',
  roas: 'ROAS',
};

/**
 * **The three that lag, and the surface has to say so** (`DESIGN.md` §4.5, D27). CTR's numerator
 * and denominator both land at their own `ts`; CPA's and ROAS's conversion terms are backdated to
 * their click's minute, so a young window reads them wrong in a knowable direction and the note
 * belongs next to the number, not in the README only.
 */
export const METRIC_NOTES: Partial<Record<MetricKey, string>> = {
  ctr: 'live — both terms land at their own time',
  cpa: 'lags by cohort — conversions are backdated to their click’s minute',
  roas: 'lags by cohort — conversions are backdated to their click’s minute',
};

/** Thousands-separated integers. Counts are counts; nothing here rounds a count. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Cents to dollars. **Cents are the stored unit everywhere** (the brief's own `*_cents` fields), so
 * this is the only place the decimal point appears and no arithmetic upstream is ever done in
 * floats-of-dollars.
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `null` is *unknown*, and it renders as an em dash — never as zero (see `shared/metrics.ts`). */
export const UNKNOWN = '—';

export function formatCtr(value: number | null): string {
  return value === null ? UNKNOWN : `${(value * 100).toFixed(2)}%`;
}

export function formatRoas(value: number | null): string {
  return value === null ? UNKNOWN : `${value.toFixed(2)}×`;
}

/** One value for one metric, formatted in that metric's own unit. */
export function formatMetric(metric: MetricKey, value: number | null): string {
  if (value === null) return UNKNOWN;
  switch (metric) {
    case 'impressions':
    case 'clicks':
      return formatCount(value);
    case 'spend':
    case 'cpa':
      return formatCents(value);
    case 'ctr':
      return formatCtr(value);
    case 'roas':
      return formatRoas(value);
  }
}

/** The combined row — the selection as a whole. Found by `ad_id === null`, never by position. */
export function combined(totals: readonly MetricTotals[]): MetricTotals | null {
  return totals.find((t) => t.ad_id === null) ?? null;
}

/** The per-ad rows, in the order the server sent them (`ad_id` ascending). */
export function perAd(totals: readonly MetricTotals[]): MetricTotals[] {
  return totals.filter((t) => t.ad_id !== null);
}

/**
 * Re-ask the server for the totals of the window currently on screen — **D66's read**.
 *
 * The window passed in is the client's CURRENT frame (D65), not the anchor, because the totals must
 * answer the question the screen is asking. `?ads=` is omitted entirely for "all", matching the
 * snapshot path: B07 refuses `ads=` as given-but-empty rather than reading it as everything.
 */
export async function fetchTotals(
  window: { from: string; to: string },
  ads: ReadonlySet<string> | null,
  signal: AbortSignal,
  /** **B49** — the horizon this read is answered at, in hours. Absent means D13's 72 h. */
  horizonH?: number,
): Promise<TotalsResponse> {
  const url =
    `/api/snapshot?include=totals&from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}` +
    (horizonH === undefined ? '' : `&horizon_h=${horizonH}`) +
    (ads === null ? '' : `&ads=${encodeURIComponent([...ads].join(','))}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`totals: ${res.status} ${res.statusText}`);
  return (await res.json()) as TotalsResponse;
}

/**
 * **D20's smoothing — EWMA, 15-minute half-life** (B40). The constant is ratified, not chosen here.
 */
export const HALF_LIFE_MS = 15 * 60_000;

/**
 * Exponentially-weighted moving average over an irregular grid, in TIME rather than in points.
 *
 * The weight carried from the previous value is `2^(-Δt / halfLife)`, so the same 15 minutes mean
 * the same thing at every rung the gate can pick (D20's ladder makes the step size a variable, and
 * a per-POINT α would silently mean 15 minutes at the minute rung and 15 hours at the hour rung).
 *
 * Two consequences worth knowing before reading the chart, both arithmetic rather than opinion:
 *
 *   - at the **hour** rung the carried weight is `2^-4 = 0.0625`, so smoothing is nearly inert —
 *     which is where CPA and ROAS are usually drawn. At the **15-minute** rung it is 0.5, which is
 *     where CTR is usually drawn. So the toggle visibly does something on CTR and almost nothing on
 *     CPA, and that is the constant behaving correctly, not a broken control;
 *   - **a gap decays rather than bridges.** A `null` point emits `null` and does not advance the
 *     state, so the next real point is weighted by the true elapsed time. A long suppressed stretch
 *     therefore effectively restarts the average, instead of carrying an hour-old level across it.
 *
 * **It smooths the PLOTTED series** — the ratio after the division, not the counts before it. That
 * is the reading of D20's "smoothed series", and it is the one the surface labels, because a
 * smoothed value cannot be reconciled against raw events: B53's drill-down asserts against the RAW
 * toggle, which is why raw is the default.
 */
export function ewma(
  xSeconds: readonly number[],
  y: readonly (number | null)[],
  halfLifeMs: number = HALF_LIFE_MS,
): (number | null)[] {
  const out = new Array<number | null>(y.length).fill(null);
  let level: number | null = null;
  let atSeconds = 0;

  for (let i = 0; i < y.length; i++) {
    const value = y[i];
    const at = xSeconds[i];
    if (value === null || value === undefined || at === undefined) continue;
    if (level === null) {
      level = value;
    } else {
      const alpha = 1 - Math.pow(2, -((at - atSeconds) * 1_000) / halfLifeMs);
      level = alpha * value + (1 - alpha) * level;
    }
    atSeconds = at;
    out[i] = level;
  }
  return out;
}

/**
 * **B43 — the restatement timeline for a window** (`GET /api/restatements`).
 *
 * Same `?from&to&ads` as the snapshot, so the timeline and the chart cannot end up describing
 * different portfolios. Read-only, and every figure in the response was derived on the server.
 */
export async function fetchRestatements(
  window: { from: string; to: string },
  ads: ReadonlySet<string> | null,
  signal: AbortSignal,
  /**
   * **B49** — the horizon the timeline is derived at. It MUST be the same one the chart is drawn
   * at: a timeline answered at 72 h beside settlement marks drawn at 2 h is the disagreement P16
   * exists to avoid, and it would look like a bug in the restatement path rather than in the wiring.
   */
  horizonH?: number,
): Promise<{ entries: RestatementEntry[] }> {
  const url =
    `/api/restatements?from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}` +
    (horizonH === undefined ? '' : `&horizon_h=${horizonH}`) +
    (ads === null ? '' : `&ads=${encodeURIComponent([...ads].join(','))}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`restatements: ${res.status} ${res.statusText}`);
  return (await res.json()) as { entries: RestatementEntry[] };
}

/**
 * **B45 — the fatigue flag** (`GET /api/fatigue`). No window parameter, deliberately: the peak is a
 * property of the pair's whole life, so a windowed answer would change with the viewport.
 */
export async function fetchFatigue(signal: AbortSignal): Promise<FatigueReport> {
  const res = await fetch('/api/fatigue', { signal });
  if (!res.ok) throw new Error(`fatigue: ${res.status} ${res.statusText}`);
  return (await res.json()) as FatigueReport;
}


/**
 * **B49 / P16 — the settlement sweep.** Reports what changes between two horizons and what it
 * scanned to find out. Read-only on the server; this is the call the control makes before it
 * re-anchors the page at the new horizon.
 */
export async function fetchSweep(
  fromHorizonH: number,
  toHorizonH: number,
  signal: AbortSignal,
): Promise<SweepResult> {
  const res = await fetch(
    `/api/settlement/sweep?from_horizon_h=${fromHorizonH}&to_horizon_h=${toHorizonH}`,
    { signal },
  );
  if (!res.ok) throw new Error(`sweep: ${res.status} ${res.statusText}`);
  return (await res.json()) as SweepResult;
}


/**
 * **B50a / P18 — decision scoring.** Keyed by `decision_id` for the log to look up.
 *
 * Takes the horizon because the WITHHOLDING rule is the horizon's (D19/D13): the same swept value
 * the chart and the timeline are answered at, or the log would say "scoring in 68 h" beside a chart
 * already drawn as settled.
 */
export async function fetchScores(
  signal: AbortSignal,
  horizonH?: number,
): Promise<Map<string, DecisionScore>> {
  const res = await fetch(`/api/scores${horizonH === undefined ? '' : `?horizon_h=${horizonH}`}`, { signal });
  if (!res.ok) throw new Error(`scores: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { scores: DecisionScore[] };
  return new Map(body.scores.map((s) => [s.decision_id, s]));
}
