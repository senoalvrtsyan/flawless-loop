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
import type { TraceMetric } from '../shared/wire.ts';

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

/**
 * **The same caveat, at label length — D75.** `METRIC_NOTES` is the sentence and it still reaches
 * the reader, through `glossFor()`'s hover text. What sat *under* two of the six headline figures
 * was the same 66-character clause printed twice, which forced the figure row to five columns and
 * stranded ROAS on a line of its own. The distinction the strategist has to hold is three words
 * long; the reason behind it is one hover away and one README section away.
 */
export const METRIC_NOTES_SHORT: Partial<Record<MetricKey, string>> = {
  ctr: 'live',
  cpa: 'lags by cohort',
  roas: 'lags by cohort',
};

/**
 * **What the abbreviations stand for, and the division underneath each one.**
 *
 * The brief's user is an ad strategist, for whom `CTR` needs no expansion — but the brief's
 * *reader* is not, and hard requirement #5 is that any number on screen can be walked back to the
 * events beneath it. An unexpanded acronym is the first place that walk stops: you cannot check
 * `ROAS` against the raw events if you do not know it is a ratio of value to spend.
 *
 * Keyed by `TraceMetric` — the SAME union `<Metric>` takes and the descriptor names — and total,
 * so there is no `default` branch and an added metric is a compile error rather than a blank
 * tooltip. `formula` is the arithmetic `src/shared/metrics.ts` actually performs, not a
 * paraphrase of it: if the two ever disagree, this is the one that is wrong.
 */
export type MetricGloss = { readonly term: string; readonly formula: string };

export const METRIC_GLOSSARY: Record<TraceMetric, MetricGloss> = {
  impressions: { term: 'Impressions', formula: 'times an ad was served' },
  clicks: { term: 'Clicks', formula: 'impressions that were clicked' },
  spend: { term: 'Spend', formula: 'click costs + CPM and fees, which the brief keeps disjoint' },
  conversions: { term: 'Conversions', formula: 'clicks that converted, credited to the click’s minute' },
  value_cents: { term: 'Conversion value', formula: 'gross revenue attributed to those conversions' },
  ctr: { term: 'Click-Through Rate', formula: 'clicks ÷ impressions' },
  cpa: { term: 'Cost Per Acquisition', formula: 'total spend ÷ conversions' },
  roas: { term: 'Return On Ad Spend', formula: 'conversion value ÷ total spend' },
};

/**
 * The hover text for one metric: what it stands for, how it is computed, and — for the three that
 * lag — `METRIC_NOTES`' cohort caveat on its own line. One function so the tooltip on a selector
 * button and the tooltip on a headline figure cannot drift into saying different things.
 */
export function glossFor(metric: TraceMetric): string {
  const { term, formula } = METRIC_GLOSSARY[metric];
  const head = `${term} — ${formula}`;
  const note = (METRIC_NOTES as Partial<Record<TraceMetric, string>>)[metric];
  return note === undefined ? head : `${head}\n${note}`;
}

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

/**
 * One value for one metric, formatted in that metric's own unit.
 *
 * **B51 widens this from `MetricKey` to `TraceMetric`.** `conversions` and `value_cents` are on
 * §10.1's metric union but have no chart control, so before B52 nothing needed to format them.
 * They are performance numbers all the same, and D34's gate is *"every performance number renders
 * through the descriptor-taking component"* — so they have to have a unit here rather than a
 * hand-formatted escape route beside the table.
 *
 * No `default`: the union is closed, so a seventh metric is a compile error here rather than an
 * `undefined` on screen.
 */
export function formatMetric(metric: TraceMetric, value: number | null): string {
  if (value === null) return UNKNOWN;
  switch (metric) {
    case 'impressions':
    case 'clicks':
    case 'conversions':
      return formatCount(value);
    case 'spend':
    case 'cpa':
    case 'value_cents':
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
  /**
   * **B51 / D46** — the grain the chart is actually drawn at, so the descriptors this response
   * carries name the question the screen is asking. It is `plan.granularity_s` (the rung D20's
   * gate PICKED), not the granularity control's value: the gate may coarsen after seeing the data,
   * and a descriptor issued at the control's minute while the chart draws hours describes a
   * different question. `POST /api/trace` refuses the mismatch rather than answering it.
   */
  granularityS?: number,
): Promise<TotalsResponse> {
  const url =
    `/api/snapshot?include=totals&from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}` +
    (horizonH === undefined ? '' : `&horizon_h=${horizonH}`) +
    (granularityS === undefined ? '' : `&granularity_s=${granularityS}`) +
    (ads === null ? '' : `&ads=${encodeURIComponent([...ads].join(','))}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`totals: ${res.status} ${res.statusText}`);
  return (await res.json()) as TotalsResponse;
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
export type ScoresResponse = {
  horizon_h: number;
  /** **D71** — the window these scores were answered at. The caption names it. */
  window_h: number;
  /** D70's ratified 6 h, so the surface can say when it is NOT answering at it. */
  default_window_h: number;
  byDecision: Map<string, DecisionScore>;
};

/**
 * **B50a / P18, and D71's second parameter.**
 *
 * `horizon_h` governs *when* a score may be shown (both windows past settlement); `window_h`
 * governs *what it is measured over*. Two independent knobs, and shortening only one of them still
 * yields nothing — which is why the response echoes both and the caption prints both.
 *
 * The whole envelope is returned, not just the map: D71's ratification is conditional on the
 * caption naming the window each score was answered at, and a bare `Map` would leave the surface
 * printing whatever the control currently says rather than what the SERVER answered. Those differ
 * for one tick after every change, which is exactly when a reader would be misled.
 */
export async function fetchScores(
  signal: AbortSignal,
  horizonH?: number,
  windowH?: number,
): Promise<ScoresResponse> {
  const params = [
    horizonH === undefined ? null : `horizon_h=${horizonH}`,
    windowH === undefined ? null : `window_h=${windowH}`,
  ].filter((p): p is string => p !== null);
  const res = await fetch(`/api/scores${params.length === 0 ? '' : `?${params.join('&')}`}`, { signal });
  if (!res.ok) throw new Error(`scores: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as {
    horizon_h: number; window_h: number; default_window_h: number; scores: DecisionScore[];
  };
  return {
    horizon_h: body.horizon_h,
    window_h: body.window_h,
    default_window_h: body.default_window_h,
    byDecision: new Map(body.scores.map((s) => [s.decision_id, s])),
  };
}
