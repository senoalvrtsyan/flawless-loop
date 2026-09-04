// B48 — which generation boundaries fall on the chart, and what each one changed.
//
// **Pure, and in its own file for D43's reason.** A boundary drawn at the wrong instant, or one
// silently omitted, produces a completely normal chart: the CTR still steps where it steps, and the
// only thing missing is the annotation that explains WHY. That is the invisible-when-wrong shape,
// so the arithmetic lives here with tests and `Chart.tsx` only draws what it is handed.
//
// **What a boundary is.** `config_generations` is a half-open chain `[valid_from, valid_to)` per ad
// (§2.3), opened by exactly one decision. A boundary is a generation's `valid_from` — the instant
// the config became this one. Generation 1 is excluded: it is opened by `create_ad`, so its
// `valid_from` marks the ad coming into existence rather than a config CHANGING, and drawing a rule
// there would claim a step in a series that has no points to its left.
//
// **The change is DERIVED by diffing adjacent generations, never stored.** Nothing in the schema
// says "this generation changed the video", and nothing should: the pair of rows already says it,
// and a stored summary is a second copy of a fact that can go stale (D7's shape, applied to a
// label). `opened_by_decision` is carried through so the caller can join the boundary back to the
// rationale a human typed — which is the half that makes it an explanation rather than a mark.

import type { GenerationRow } from '../server/snapshot.ts';

/** One drawable boundary: where, whose, and what changed at it. */
export type Boundary = {
  ad_id: string;
  generation_id: string;
  /** The generation's number within its ad — `seq_in_ad`, which is what `gen 4` means elsewhere. */
  seq_in_ad: number;
  /** `valid_from`, ISO. The instant the rule is drawn at. */
  at: string;
  /** Milliseconds since epoch — the chart's x axis unit, resolved once rather than per frame. */
  atMs: number;
  opened_by_decision: string;
  /**
   * What moved, one clause per field, e.g. `video v_04 → v_07` or `budget $500 → $800/day`.
   *
   * **Empty when nothing config-visible moved**, which is a real case and not a bug: `DESIGN.md` §7
   * opens a generation on `pause` and `resume` because *"what was live at T includes whether it was
   * running"*, and `status` is the field that moved. So the caller gets `[]` only if two adjacent
   * generations are identical across every field, which the fold cannot currently produce — and if
   * it ever does, an unlabelled boundary is the honest render.
   */
  changes: string[];
};

/** Cents to the same plain dollar figure `Portfolio.tsx` uses. USD-only, per D§2 (G05). */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Diff two adjacent generations of the same ad, in the order a strategist would read them.
 *
 * `audience_id` and `channel` are compared even though no lever changes them (U3 makes channels
 * static reference data): the comparison costs nothing and it means a boundary can never appear
 * with an empty label because the one field that actually moved was not in this list.
 */
export function describeChange(prev: GenerationRow, next: GenerationRow): string[] {
  const changes: string[] = [];
  if (prev.status !== next.status) changes.push(`status ${prev.status} → ${next.status}`);
  if (prev.video_id !== next.video_id) changes.push(`video ${prev.video_id} → ${next.video_id}`);
  if (prev.headline_id !== next.headline_id) {
    changes.push(`headline ${prev.headline_id} → ${next.headline_id}`);
  }
  if (prev.daily_budget_cents !== next.daily_budget_cents) {
    changes.push(`budget ${dollars(prev.daily_budget_cents)} → ${dollars(next.daily_budget_cents)}/day`);
  }
  if (prev.audience_id !== next.audience_id) {
    changes.push(`audience ${prev.audience_id} → ${next.audience_id}`);
  }
  if (prev.channel !== next.channel) changes.push(`channel ${prev.channel} → ${next.channel}`);
  return changes;
}

/**
 * The boundaries to draw: charted ads only, inside the window, generation 2 and up.
 *
 * **Half-open `[from, to)` on `valid_from`, the same convention the buckets use** — so a boundary
 * exactly on the window's closing minute belongs to the NEXT window and is drawn once, not twice.
 * Getting this wrong draws a rule at the very edge of two adjacent views, which reads as two
 * separate config changes a minute apart.
 *
 * **The previous generation is found by `seq_in_ad - 1`, not by array position.** The rows arrive
 * ordered by `(ad_id, seq_in_ad)`, so position would usually work — and would silently diff across
 * an ad boundary the first time an ad's chain started at something other than 1, labelling `a_02`'s
 * first change with `a_01`'s config.
 */
export function boundariesIn(
  generations: readonly GenerationRow[],
  window: { from: string; to: string },
  chartedIds: ReadonlySet<string>,
): Boundary[] {
  const byAdSeq = new Map<string, GenerationRow>();
  for (const g of generations) byAdSeq.set(`${g.ad_id}\n${g.seq_in_ad}`, g);

  const out: Boundary[] = [];
  for (const g of generations) {
    if (g.seq_in_ad <= 1) continue;
    if (!chartedIds.has(g.ad_id)) continue;
    if (g.valid_from < window.from || g.valid_from >= window.to) continue;
    const prev = byAdSeq.get(`${g.ad_id}\n${g.seq_in_ad - 1}`);
    out.push({
      ad_id: g.ad_id,
      generation_id: g.generation_id,
      seq_in_ad: g.seq_in_ad,
      at: g.valid_from,
      atMs: Date.parse(g.valid_from),
      opened_by_decision: g.opened_by_decision,
      // A missing predecessor is a broken chain, not a missing label — say so rather than
      // rendering an unexplained rule that looks like a change we chose not to describe.
      changes: prev === undefined ? ['chain broken: no previous generation'] : describeChange(prev, g),
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs || (a.ad_id < b.ad_id ? -1 : 1));
}
