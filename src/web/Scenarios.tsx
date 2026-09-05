// The scenario control — B50 / P17. `SIMULATOR.md` §17.
//
//   *"I need to be able to cause the interesting thing to happen live rather than wait for it."*
//
// **This is not a lever and the surface must never let it look like one.** A decision changes what
// the ADVERTISER does and is the only thing that changes config (HR6); a scenario changes what the
// WORLD does. They are different tables, different endpoints and different vocabulary. So this sits
// under its own heading, in its own treatment, worded as *causing* rather than *deciding*, and a
// scenario appears in no decision log — which is exactly `CLAUDE.md` §6's "configs, signals and
// levers stay distinct" applied to the one control that is none of the three.
//
// **The trigger is a row before it is an effect** (§14, D40): `(seed + decision log +
// sim_scenarios) -> world`, so the moment replays. The list below is that record, and the
// `consumed` column is how a reviewer sees the poll pick it up — the app's own view of a handover
// between two processes that share no memory.

import { useState } from 'react';
import type { AdRow } from '../server/snapshot.ts';
import type { ScenarioName, ScenarioRow } from '../server/sim-scenario.ts';

/** What each trigger does, in the words §17's table uses, plus what a reviewer should watch. */
const BLURB: Record<ScenarioName, { does: string; watch: string; ad: boolean }> = {
  late_cascade: {
    does: 'emits n conversions attributed to real clicks ≥ 96 h old',
    watch: 'THE FLAGSHIP PATH — settled buckets restate, days back on the chart, with a timeline entry at the bucket’s own time',
    ad: true,
  },
  orphan_burst: {
    does: 'conversions whose clicks are withheld 90 s, then released',
    watch: 'provisional → promoted: a TWO-bucket restatement (D16)',
    ad: false,
  },
  fatigue_collapse: {
    does: 'multiplies the pair’s accumulated F',
    watch: 'CTR halves within a minute; the fatigue flag fires; the other ads sharing that lineage move too',
    ad: true,
  },
  budget_squeeze: {
    does: 'jumps spend_so_far to 92% of budget',
    watch: '§9’s terminal taper: delivery slides, never cliffs',
    ad: true,
  },
  duplicate_storm: {
    does: 'replays the last batch, byte-identical',
    watch: 'the dedupe counters move and the aggregate does NOT — duplicate_identical, not conflicting',
    ad: false,
  },
  stall: {
    does: 'emission stops for n seconds',
    watch: 'the liveness display says so. We can say the stream is quiet, never why (G21)',
    ad: false,
  },
  traffic_burst: {
    does: 'multiplies λ for 60 s',
    watch: 'ingest backpressure, coalesced bucket rows, dropped tail frames with a visible counter',
    ad: false,
  },
};

/**
 * The order the control offers them: the two that demonstrate HR4 first.
 *
 * Typed as `ScenarioName[]` and derived from `BLURB`'s keys by the type system rather than by a
 * second literal list — `BLURB` is `Record<ScenarioName, …>`, so an eighth scenario added to §17 is
 * a type error in `BLURB` and this array cannot silently omit it.
 */
const ORDER: readonly ScenarioName[] = [
  'late_cascade',
  'orphan_burst',
  'fatigue_collapse',
  'budget_squeeze',
  'duplicate_storm',
  'stall',
  'traffic_burst',
];

export async function fetchScenarios(
  signal: AbortSignal,
): Promise<(ScenarioRow & { consumed_at: string | null })[]> {
  const res = await fetch('/api/sim/scenario', { signal });
  if (!res.ok) throw new Error(`scenarios: ${res.status} ${res.statusText}`);
  return ((await res.json()) as { scenarios: (ScenarioRow & { consumed_at: string | null })[] })
    .scenarios;
}

type Outcome =
  | { kind: 'fired'; scenario: ScenarioRow; pending: number }
  | { kind: 'refused'; error: string; message: string | null };

export type ScenariosProps = {
  ads: readonly AdRow[];
  log: readonly (ScenarioRow & { consumed_at: string | null })[];
  onFired: () => void;
};

export function Scenarios({ ads, log, onFired }: ScenariosProps) {
  const [name, setName] = useState<ScenarioName>('late_cascade');
  const [adId, setAdId] = useState<string>(ads[0]?.ad_id ?? '');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);
  const spec = BLURB[name];

  const fire = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch('/api/sim/scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Arguments are left OFF deliberately: the endpoint fills in §17's own defaults, so the
        // figures on screen are the design document's rather than this form's idea of them.
        body: JSON.stringify(spec.ad ? { name, ad_id: adId } : { name }),
      });
      const payload: unknown = await res.json();
      if (res.ok) {
        const ok = payload as { scenario: ScenarioRow; pending: number };
        setOutcome({ kind: 'fired', scenario: ok.scenario, pending: ok.pending });
        onFired();
      } else {
        const bad = payload as { error?: unknown; message?: unknown };
        setOutcome({
          kind: 'refused',
          error: typeof bad.error === 'string' ? bad.error : 'unknown_error',
          message: typeof bad.message === 'string' ? bad.message : null,
        });
      }
    } catch (err: unknown) {
      setOutcome({ kind: 'refused', error: 'unreachable', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="console console--sim">
      <div className="console__row">
        <span className="console__label">Cause</span>
        {ORDER.map((key) => (
          <button key={key} type="button" aria-pressed={name === key} onClick={() => setName(key)}>
            {key}
          </button>
        ))}
      </div>

      <div className="console__row">
        {spec.ad ? (
          <label className="console__field">
            <span className="console__label">on ad</span>
            <select value={adId} onChange={(e) => setAdId(e.target.value)}>
              {ads.map((a) => (
                <option key={a.ad_id} value={a.ad_id}>
                  {a.ad_id} · {a.name} · {a.status}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="console__hint">portfolio-wide — this one takes no ad</span>
        )}
        <button type="button" className="console__submit" disabled={pending} onClick={() => void fire()}>
          {pending ? 'firing…' : `Fire ${name}`}
        </button>
      </div>

      <p className="console__hint">
        <strong>{spec.does}</strong> · watch: {spec.watch}
      </p>

      {outcome === null ? null : outcome.kind === 'fired' ? (
        <p className="console__outcome console__outcome--applied">
          ✔ trigger written · <code>{outcome.scenario.scenario_id}</code> at {outcome.scenario.ts} ·{' '}
          <code>{JSON.stringify(outcome.scenario.args)}</code> · {outcome.pending} awaiting the
          simulator&rsquo;s next poll (≤ 1 s). <strong>Nothing has happened yet</strong> — the row
          exists, and the world responds when the emitter reads it.
        </p>
      ) : (
        <p className="console__outcome console__outcome--refused">
          ✖ refused · <code>{outcome.error}</code>
          {outcome.message === null ? null : <> — {outcome.message}</>}
          <br />
          <span className="console__hint">
            Arguments are bounds-checked and <strong>refused rather than clamped</strong>: a
            silently clamped multiplier would put a figure on screen nobody asked for.
          </span>
        </p>
      )}

      {log.length === 0 ? null : (
        <table className="log">
          <thead>
            <tr>
              <th>fired</th>
              <th>scenario</th>
              <th>args</th>
              <th>picked up by the simulator</th>
            </tr>
          </thead>
          <tbody>
            {log.slice(0, 8).map((row) => (
              <tr key={row.scenario_id}>
                <td className="log__ts">{row.ts.replace('T', ' ').replace('.000Z', 'Z')}</td>
                <td>
                  <span className="log__action">{row.name}</span>
                </td>
                <td>
                  <code>{JSON.stringify(row.args)}</code>
                </td>
                <td>
                  {row.consumed_at === null ? (
                    <span className="log__none">pending — not yet polled</span>
                  ) : (
                    <span className="log__ts">{row.consumed_at}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* **D75.** The load-bearing sentence is that a scenario is not a lever — that distinction is
          in the model and the surface has to keep it. The determinism argument for why these rows
          are persisted at all is README §"The mock data model". */}
      <p className="gate">
        <strong>A scenario is not a lever</strong> — it changes what the world does, never what the
        advertiser decided, and it appears in no decision log.
      </p>
    </section>
  );
}
