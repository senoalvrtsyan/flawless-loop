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
