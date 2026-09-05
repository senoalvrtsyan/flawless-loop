// The component library, read-only. B46 — and it exists because the console cannot offer a
// `swap_component` without candidates to swap TO.
//
// **This is a read of static reference data, not a projection.** `components` is seeded (D3: one
// lineage carries two versions specifically so the reverse join has a real answer) and no lever
// writes it — component versioning as a built flow is `SCOPE.md` §4 cut #7, defended in prose. So
// there is no fold here and nothing to rebuild; `GET /api/components` is a `SELECT` and the whole
// table is twelve-ish rows.
//
// **Why an endpoint of its own rather than a member of the snapshot envelope.** `DESIGN.md` §3.1
// fixes that envelope as `{ ads[], generations[], decisions[], buckets[], … }` and components are
// not in it. They also do not change — re-sending them on every window roll and every selection
// change would be sending a constant four times a minute. B56's Workbench screen (P15) reads the
// same endpoint, joined against `ads` for "used in N live ads"; that join is §8's and is not here.

import type { DatabaseSync } from 'node:sqlite';

/** One row of `components` (§2.1). Copy-on-write lineage: `lineage_id` + `version` + `parent_id`. */
export type ComponentRow = {
  component_id: string;
  kind: string;
  payload: string;
  created_at: string;
  lineage_id: string;
  version: number;
  parent_id: string | null;
};

/**
 * Ordered by `(kind, lineage_id, version)` — the order the console groups them in, so a recut sits
 * directly under the version it was cut from and the two are visibly one lineage rather than two
 * unrelated ids. `ORDER BY component_id` would interleave the lineages and hide exactly that.
 */
const SELECT_COMPONENTS = `
  SELECT component_id, kind, payload, created_at, lineage_id, version, parent_id
    FROM components ORDER BY kind, lineage_id, version
`;

export function listComponents(db: DatabaseSync): ComponentRow[] {
  return db.prepare(SELECT_COMPONENTS).all() as unknown as ComponentRow[];
}

// ---------------------------------------------------------------------------------------------
// **B56 / P15 — the reverse join.** `DESIGN.md` §8, and D1's one read-only Workbench screen.
//
// §8's question is *"used in N ads right now"*, and its answer is a scan of `ads`, not an index:
//
//   "Computed on read by scanning `ads`, not maintained as an index. At 8–12 ads the scan is free,
//    and a maintained reverse index would be a second thing to keep in step with the fold — a
//    projection whose only justification would be a scale we do not have."
//
// **"Kept current as ads launch and die" falls out of the write path**, which is the whole reason
// this screen is worth building: `ads.status` is written only by `applyDecision()` (D7), so the
// count is exactly as current as the last lever. Pause an ad and the number drops — not because
// anything recomputed a cache, but because the fold moved and this is a read of the fold.
//
// **Per lineage AND per version**, both, because §8 says both and names why: the seed carries one
// lineage with two versions (D3) specifically so the headline is a real answer rather than a
// paragraph. The lineage total is the headline; the versions sit under it.
//
// The three queries G38 hides behind one phrase are §8's table, and only the first is built:
// "at time T" and "ever" are one join from working (`config_generations` exists for D14 anyway),
// and the README shows the real query rather than describing a hypothesis. That is a scope cut,
// stated, not a modelling gap.

/** One component version, with the ads using it right now. */
export type ComponentUsage = ComponentRow & {
  /** Ads whose CURRENT config names this component, by status. */
  live_ads: number;
  paused_ads: number;
  draft_ads: number;
  /** The ad ids, so "3 live ads" is checkable by eye rather than only countable. */
  ad_ids: string[];
  /** Which slot it fills — a component's `kind` is not the same as the slot it is bound to. */
  slot: 'video' | 'headline' | null;
};

/** A lineage: the copy-on-write chain, headline first (§8's "Hook video — 3 versions, live in 7 ads"). */
export type LineageUsage = {
  lineage_id: string;
  kind: string;
  /** The newest version's payload — what a reader calls the thing. */
  name: string;
  versions: ComponentUsage[];
  /** Summed over versions. **Ads, not ad-slots**: an ad using two versions of one lineage counts once. */
  live_ads: number;
  paused_ads: number;
  ad_ids: string[];
};

/**
 * §8's join, verbatim in shape but split by status rather than filtered to `live`.
 *
 * §8's SQL has `AND a.status = 'live'` inside the `LEFT JOIN`. Splitting the count by status
 * instead answers the same question and one more: *"nothing is using this"* and *"three paused ads
 * are using this"* are different facts, and a screen that showed both as 0 would make a paused
 * component look retired. `ads` is twelve rows, so the extra columns cost nothing.
 *
 * `LEFT JOIN`, not `JOIN`: a component used by no ad must still appear, with zero. Dropping it
 * would turn the library into a list of what is in use, which is the opposite of what a component
 * library is for.
 */
const SELECT_USAGE = `
  SELECT c.component_id,
         SUM(CASE WHEN a.status = 'live'   THEN 1 ELSE 0 END) AS live_ads,
         SUM(CASE WHEN a.status = 'paused' THEN 1 ELSE 0 END) AS paused_ads,
         SUM(CASE WHEN a.status = 'draft'  THEN 1 ELSE 0 END) AS draft_ads,
         GROUP_CONCAT(a.ad_id) AS ad_ids,
         MAX(CASE WHEN a.video_id    = c.component_id THEN 1 ELSE 0 END) AS is_video,
         MAX(CASE WHEN a.headline_id = c.component_id THEN 1 ELSE 0 END) AS is_headline
    FROM components c
    LEFT JOIN ads a
      ON (a.video_id = c.component_id OR a.headline_id = c.component_id)
   GROUP BY c.component_id
`;

type UsageRow = {
  component_id: string;
  live_ads: number | null;
  paused_ads: number | null;
  draft_ads: number | null;
  ad_ids: string | null;
  is_video: number | null;
  is_headline: number | null;
};

/**
 * The library with its usage, grouped into lineages.
 *
 * One read transaction is not needed and is not taken: this is a single statement plus the
 * component list, and `components` is immutable reference data (no lever writes it). The `ads`
 * scan inside the join is the only moving part, and it is consistent within the statement.
 */
export function componentUsage(db: DatabaseSync): LineageUsage[] {
  const components = listComponents(db);
  const usage = new Map<string, UsageRow>();
  for (const row of db.prepare(SELECT_USAGE).all() as unknown as UsageRow[]) {
    usage.set(row.component_id, row);
  }

  const byLineage = new Map<string, LineageUsage>();
  for (const component of components) {
    const u = usage.get(component.component_id);
    const ad_ids = u?.ad_ids === null || u?.ad_ids === undefined ? [] : u.ad_ids.split(',');
    const version: ComponentUsage = {
      ...component,
      live_ads: u?.live_ads ?? 0,
      paused_ads: u?.paused_ads ?? 0,
      draft_ads: u?.draft_ads ?? 0,
      ad_ids,
      slot: u?.is_video === 1 ? 'video' : u?.is_headline === 1 ? 'headline' : null,
    };
    const lineage = byLineage.get(component.lineage_id);
    if (lineage === undefined) {
      byLineage.set(component.lineage_id, {
        lineage_id: component.lineage_id,
        kind: component.kind,
        name: component.payload,
        versions: [version],
        live_ads: version.live_ads,
        paused_ads: version.paused_ads,
        ad_ids: [...ad_ids],
      });
    } else {
      lineage.versions.push(version);
      // `listComponents` orders by `(kind, lineage_id, version)`, so the last one seen is the
      // newest and its payload is what a reader calls the lineage.
      lineage.name = component.payload;
      lineage.live_ads += version.live_ads;
      lineage.paused_ads += version.paused_ads;
      // **A SET, not a sum**: an ad using v1 in one slot and v2 in another is ONE ad using this
      // lineage, and adding the per-version counts would report two. The counts above are
      // per-version and are summed on purpose (they are ad-slots); this list is the ads.
      for (const id of ad_ids) if (!lineage.ad_ids.includes(id)) lineage.ad_ids.push(id);
    }
  }

  // Lineages in the order their first version appeared — `(kind, lineage_id)` — so the screen
  // groups videos together and headlines together without a second sort.
  return [...byLineage.values()];
}
