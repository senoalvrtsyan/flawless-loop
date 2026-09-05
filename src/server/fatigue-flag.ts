// The fatigue flag — B45, and `SIMULATOR.md` §19's one new heuristic, quoted whole:
//
//   *"Flag a `(lineage × audience)` pair as fatiguing when its EWMA CTR over the trailing 6 h has
//   fallen >= 25% below that pair's PEAK trailing-6h EWMA CTR, counting only points that clear
//   D20's impression gate, with >= 3 qualifying points in each window."*
//
// **Why this is on the server when `BUILD_PLAN.md` says `src/web/fatigue-flag.ts`.** Two reasons,
// both structural rather than stylistic:
//
//   1. **The peak needs the pair's whole life, not the viewport.** A 15-minute window on screen
//      cannot see a peak set four days ago, so the client would have to fetch seven days of buckets
//      per pair — 24 MB, measured — to compute one boolean.
//   2. **The pair is not on the client.** `(lineage × audience)` requires the temporal reverse join
//      (`DESIGN.md` §8): buckets → the generation live at that minute → its `video_id` → that
//      component's lineage. `AdRow` carries no slots, and widening it would put the join's *result*
//      on the wire without the join.
//
// What the client keeps is the rendering and §19's four limits, which is where they belong.
//
// **The granularity is 15 minutes and the half-life is D20's 15 minutes**, and those two are not
// free choices: §19 states its own lag — *"a collapse is flagged ~15–30 minutes after it starts"* —
// which is only true if the points are fine enough for 15–30 minutes of data to move the average.
// At the hour rung a 15-minute half-life carries 0.0625 of the previous point and the flag would
// fire within one point or not at all; at 15 minutes it carries 0.5, which is the stated behaviour.
//
// **It is a DISPLAY FLAG, not a recommendation** (§19, and D26 cut #6): no `system:fatigue_rule`
// decision is ever appended, nothing pulls a lever, and this module writes nothing.

import type { DatabaseSync } from 'node:sqlite';
import { readTx } from './db.ts';
import { BARS } from '../web/gate.ts';
import { ctr, type MetricCounts } from '../shared/metrics.ts';
import { HALF_LIFE_MS } from '../shared/config.ts';

/** §19: >= 25% below the pair's peak. */
export const DROP = 0.25;
/** §19: >= 3 qualifying points in each window. */
export const MIN_POINTS = 3;
/** §19: the trailing SIX HOURS. */
export const WINDOW_MS = 6 * 3_600_000;
/** The point grid. See the header: §19's own stated lag is what pins this to 15 minutes. */
export const STEP_MS = 15 * 60_000;

/**
 * 15-minute points per `(lineage × audience)` pair, via §8's temporal reverse join.
 *
 * The bucketing is done in SQL on the ISO string because `minute_start` is canonical and
 * fixed-width by construction (B05 rejects anything else), so `substr` is exact rather than a
 * guess. Measured on the seeded week: **49 ms, 4,264 points across all pairs.**
 *
 * `slot` distinguishes the video pair from the headline pair, because §19 measures the PAIR and
 * "the surface has to attribute it to the slot" — an ad whose video is fresh and whose headline is
 * burned shows a partial signal, and collapsing the two would hide which half is dying.
 */
const SELECT_POINTS = (slot: 'video_id' | 'headline_id'): string => `
  SELECT c.lineage_id AS lineage, g.audience_id AS audience_id,
         substr(r.minute_start, 1, 14)
           || printf('%02d', (CAST(substr(r.minute_start, 15, 2) AS INTEGER) / 15) * 15)
           || ':00.000Z' AS point,
         SUM(r.impressions) AS impressions, SUM(r.clicks) AS clicks
    FROM rollup_minute r
    JOIN config_generations g ON g.ad_id = r.ad_id
     AND r.minute_start >= g.valid_from
     AND (g.valid_to IS NULL OR r.minute_start < g.valid_to)
    JOIN components c ON c.component_id = g.${slot}
   GROUP BY 1, 2, 3
   ORDER BY 1, 2, 3
`;

/** Which ad currently uses which pair, from the fold's head — for joining a flag to a row. */
const SELECT_AD_PAIRS = `
  SELECT a.ad_id AS ad_id, a.audience_id AS audience_id,
         v.lineage_id AS video_lineage, h.lineage_id AS headline_lineage
    FROM ads a
    JOIN config_generations g ON g.generation_id = a.current_generation_id
    JOIN components v ON v.component_id = g.video_id
    JOIN components h ON h.component_id = g.headline_id
   ORDER BY a.ad_id
`;

export type FatigueSlot = 'video' | 'headline';

export type PairFatigue = {
  slot: FatigueSlot;
  lineage: string;
  audience_id: string;
  /** The trailing-6h EWMA CTR at the newest qualifying point, or `null` if the window is too thin. */
  current: number | null;
  /** The highest trailing-6h EWMA CTR this pair ever reached, over its whole life. */
  peak: number | null;
  /** When that peak was, so the surface can say "against its peak on Sunday evening". */
  peak_at: string | null;
  /** `1 − current / peak`, the figure §19's 25% applies to. `null` when either side is missing. */
  drop: number | null;
  flagged: boolean;
  /** Qualifying points — those clearing D20's impression bar — in each window. */
  points_current: number;
  points_peak: number;
  /** Why it is not flagged, when it is not. §19's honest failure mode, said out loud. */
  reason: string | null;
};

export type AdPairs = {
  ad_id: string;
  audience_id: string;
  video_lineage: string;
  headline_lineage: string;
};

export type FatigueReport = { pairs: PairFatigue[]; ads: AdPairs[] };

type PointRow = { lineage: string; audience_id: string; point: string } & Pick<
  MetricCounts,
  'impressions' | 'clicks'
>;

/**
 * The trailing-6h EWMA CTR at each point, over QUALIFYING points only.
 *
 * "Qualifying" is D20's impression bar, read from `BARS.ctr` rather than re-declared — a second copy
 * of 500 here and the flag would count different evidence from the chart that shows it.
 *
 * A window with fewer than `MIN_POINTS` qualifying points yields `null`, not a value from two
 * points: §19 requires three in *each* window, and the whole reason is that this heuristic is
 * slowest exactly where the gate suppresses the most — which is the honest failure mode it states.
 */
function trailingEwma(
  points: readonly { at: number; counts: MetricCounts }[],
): { at: number; value: number | null; qualifying: number }[] {
  const qualifying = points.filter((p) => p.counts.impressions >= BARS.ctr.min);

  return points.map((point) => {
    const window = qualifying.filter((q) => q.at <= point.at && q.at > point.at - WINDOW_MS);
    if (window.length < MIN_POINTS) return { at: point.at, value: null, qualifying: window.length };

    // Time-decayed EWMA over the window's qualifying points. **This is now the only smoother in
    // the codebase** — D74 deleted the chart's raw/EWMA toggle, so there is no second
    // implementation to agree with and the half-life is a parameter of the heuristic (config.ts).
    let level: number | null = null;
    let previousAt = 0;
    for (const q of window) {
      const value = ctr(q.counts);
      if (value === null) continue;
      if (level === null) level = value;
      else {
        const alpha = 1 - Math.pow(2, -(q.at - previousAt) / HALF_LIFE_MS);
        level = alpha * value + (1 - alpha) * level;
      }
      previousAt = q.at;
    }
    return { at: point.at, value: level, qualifying: window.length };
  });
}

export function fatigueReport(db: DatabaseSync): FatigueReport {
  return readTx(db, () => {
    const pairs: PairFatigue[] = [];

    for (const [slot, column] of [
      ['video', 'video_id'],
      ['headline', 'headline_id'],
    ] as const) {
      const rows = db.prepare(SELECT_POINTS(column)).all() as unknown as PointRow[];

      // Group by pair, preserving the SQL's own ordering so the series is chronological.
      const byPair = new Map<string, { lineage: string; audience_id: string; points: PointRow[] }>();
      for (const row of rows) {
        const key = `${row.lineage}\n${row.audience_id}`;
        const entry = byPair.get(key) ?? { lineage: row.lineage, audience_id: row.audience_id, points: [] };
        entry.points.push(row);
        byPair.set(key, entry);
      }

      for (const entry of byPair.values()) {
        const series = trailingEwma(
          entry.points.map((p) => ({
            at: Date.parse(p.point),
            counts: { impressions: p.impressions, clicks: p.clicks } as MetricCounts,
          })),
        );

        // The newest point that HAS a value — not simply the newest point. A pair whose last two
        // hours were all gated has no current reading, and saying so is the point.
        let current: { at: number; value: number; qualifying: number } | null = null;
        for (let i = series.length - 1; i >= 0; i--) {
          const point = series[i];
          if (point?.value != null) {
            current = { at: point.at, value: point.value, qualifying: point.qualifying };
            break;
          }
        }
        let peak: { at: number; value: number; qualifying: number } | null = null;
        for (const point of series) {
          if (point.value != null && (peak === null || point.value > peak.value)) {
            peak = { at: point.at, value: point.value, qualifying: point.qualifying };
          }
        }

        const drop = current !== null && peak !== null && peak.value > 0
          ? 1 - current.value / peak.value
          : null;

        let reason: string | null = null;
        if (current === null || peak === null) {
          reason = `fewer than ${MIN_POINTS} points clear ${BARS.ctr.min} impressions in any 6 h window — the gate suppresses this pair, which is when this heuristic is slowest`;
        } else if (drop !== null && drop < DROP) {
          reason = `${(drop * 100).toFixed(0)}% below peak, under the ${DROP * 100}% bar`;
        }

        pairs.push({
          slot,
          lineage: entry.lineage,
          audience_id: entry.audience_id,
          current: current?.value ?? null,
          peak: peak?.value ?? null,
          peak_at: peak === null ? null : new Date(peak.at).toISOString(),
          drop,
          flagged: drop !== null && drop >= DROP,
          points_current: current?.qualifying ?? 0,
          points_peak: peak?.qualifying ?? 0,
          reason,
        });
      }
    }

    const ads = db.prepare(SELECT_AD_PAIRS).all() as unknown as AdPairs[];
    // Flagged first, then by how far they have fallen — a list a strategist reads top-down.
    pairs.sort((a, b) => Number(b.flagged) - Number(a.flagged) || (b.drop ?? -1) - (a.drop ?? -1));
    return { pairs, ads };
  });
}
