// `POST /api/sim/scenario` — B50 / P17. `SIMULATOR.md` §17.
//
//   *"I need to be able to cause the interesting thing to happen live rather than wait for it."*
//
// **Why the trigger is a ROW and not a message.** §14's reproducibility claim is
// `(seed + decision log + sim_scenarios) -> world` (D40), and a claim whose third input lives in
// memory is false. So a trigger is persisted before it has any effect, and the moment replays.
// `002_projections.sql` says it in the DDL's own comment: this is the one table in that file
// `apply()` does not own.
//
// **No second control channel** (§17). This endpoint writes the row; the simulator learns about it
// on its existing `GET /api/sim/world` poll, which it is already making once a second. Nothing here
// talks to the simulator, and nothing in the simulator opens the store (D32).
//
// **This is NOT a lever and must never be mistaken for one.** A scenario changes what the WORLD
// does; a decision changes what the ADVERTISER does. They are different tables, different
// endpoints and different vocabulary, which is `CLAUDE.md` §6's "configs, signals and levers stay
// distinct" applied to the one control that sits outside all three. A scenario writes no
// `decision_seq`, opens no generation, and appears in no decision log.

import type { DatabaseSync } from 'node:sqlite';

/** The seven, exactly as `SIMULATOR.md` §17 tabulates them. */
export const SCENARIO_NAMES = [
  'fatigue_collapse',
  'late_cascade',
  'budget_squeeze',
  'orphan_burst',
  'duplicate_storm',
  'stall',
  'traffic_burst',
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

/**
 * What each scenario needs, and the bounds each argument is refused outside.
 *
 * Bounds are **refused, not clamped** — the same rule the horizon parameter follows (B49). A
 * `traffic_burst` silently clamped from ×1000 to ×20 puts a multiplier on screen nobody asked for,
 * and the reviewer then reads the ingest backpressure as the model's rather than as the clamp's.
 */
type Spec = {
  /** `ad_id` is required by this scenario (the portfolio-wide ones do not take one). */
  ad: boolean;
  /** Numeric arg name, its bounds, and its default. `null` = this scenario takes no number. */
  number: { name: string; min: number; max: number; fallback: number } | null;
  /** A second numeric arg, for `late_cascade`'s `min_age_h`. */
  extra: { name: string; min: number; max: number; fallback: number } | null;
};

const SPECS: Record<ScenarioName, Spec> = {
  // §17: "Multiplies the pair's accumulated F". ×4 is the table's own figure.
  fatigue_collapse: { ad: true, number: { name: 'multiplier', min: 1, max: 50, fallback: 4 }, extra: null },
  // §17: "Emits n conversions attributed to clicks >= 96 h old". The flagship path.
  late_cascade: {
    ad: true,
    number: { name: 'n', min: 1, max: 200, fallback: 12 },
    extra: { name: 'min_age_h', min: 1, max: 168, fallback: 96 },
  },
  // §17: "Jumps spend_so_far to 92% of budget" — into §9's terminal taper band.
  budget_squeeze: { ad: true, number: { name: 'fraction', min: 0.5, max: 1, fallback: 0.92 }, extra: null },
  orphan_burst: { ad: false, number: { name: 'n', min: 1, max: 200, fallback: 8 }, extra: null },
  duplicate_storm: { ad: false, number: { name: 'n', min: 1, max: 500, fallback: 40 }, extra: null },
  stall: { ad: false, number: { name: 'seconds', min: 1, max: 300, fallback: 30 }, extra: null },
  traffic_burst: { ad: false, number: { name: 'multiplier', min: 1, max: 20, fallback: 6 }, extra: null },
};

export type ScenarioRow = {
  scenario_id: string;
  ts: string;
  name: ScenarioName;
  args: Record<string, number | string>;
};

export type ScenarioResult =
  | { status: 200; body: { scenario: ScenarioRow; pending: number } }
  | { status: 400; body: { error: string; message?: string } };

function isName(v: unknown): v is ScenarioName {
  return typeof v === 'string' && (SCENARIO_NAMES as readonly string[]).includes(v);
}

/** Parse one bounded number, or a reason. Absent means the spec's default, which is §17's figure. */
function bounded(
  raw: unknown,
  spec: { name: string; min: number; max: number; fallback: number },
): number | string {
  if (raw === undefined) return spec.fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
    return `${spec.name} must be a number in [${spec.min}, ${spec.max}] (got ${String(raw)})`;
  }
  return n;
}

export function postScenario(
  db: DatabaseSync,
  raw: unknown,
  now: string = new Date().toISOString(),
): ScenarioResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'not_an_object' } };
  }
  const body = raw as Record<string, unknown>;
  const name = body['name'];
  if (!isName(name)) {
    return {
      status: 400,
      body: {
        error: 'unknown_scenario',
        message: `name must be one of: ${SCENARIO_NAMES.join(', ')}`,
      },
    };
  }

  const spec = SPECS[name];
  const args: Record<string, number | string> = {};

  if (spec.ad) {
    const adId = body['ad_id'];
    if (typeof adId !== 'string' || adId.trim() === '') {
      return { status: 400, body: { error: 'ad_id_required', message: `${name} acts on one ad` } };
    }
    // **Deliberately not checked against `ads`.** A scenario is simulator input, not a lever: the
    // emitter resolves the ad from the world it polls, and an unknown id there is a scenario that
    // finds nothing to act on rather than a corrupt row. Validating here would mean this endpoint
    // reading a projection to gate a table that is not one.
    args['ad_id'] = adId;
  }
  for (const s of [spec.number, spec.extra]) {
    if (s === null) continue;
    const value = bounded(body[s.name], s);
    if (typeof value === 'string') return { status: 400, body: { error: 'bad_argument', message: value } };
    args[s.name] = value;
  }

  // The id is the SERVER's, unlike a decision's client-generated `decision_id` (U5). A scenario has
  // no idempotency requirement to satisfy — firing `late_cascade` twice is two cascades, and a
  // reviewer pressing the button twice means it — so there is nothing for a client key to protect.
  const scenario_id = `sc_${Date.parse(now).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row: ScenarioRow = { scenario_id, ts: now, name, args };

  db.prepare('INSERT INTO sim_scenarios (scenario_id, ts, name, args_json, consumed_at) VALUES (?, ?, ?, ?, NULL)')
    .run(scenario_id, now, name, JSON.stringify(args));

  const pending = (
    db.prepare('SELECT COUNT(*) AS n FROM sim_scenarios WHERE consumed_at IS NULL').get() as { n: number }
  ).n;
  return { status: 200, body: { scenario: row, pending } };
}

/** The triggers so far, newest first — the replayable record §14 says this table exists for. */
export function listScenarios(db: DatabaseSync, limit = 50): (ScenarioRow & { consumed_at: string | null })[] {
  const rows = db
    .prepare('SELECT scenario_id, ts, name, args_json, consumed_at FROM sim_scenarios ORDER BY ts DESC LIMIT ?')
    .all(limit) as unknown as {
    scenario_id: string; ts: string; name: ScenarioName; args_json: string; consumed_at: string | null;
  }[];
  return rows.map((r) => ({
    scenario_id: r.scenario_id,
    ts: r.ts,
    name: r.name,
    args: JSON.parse(r.args_json) as Record<string, number | string>,
    consumed_at: r.consumed_at,
  }));
}
