// The decision log — B47. The authoritative artefact, on screen.
//
// **This is the table `ads` is derived FROM, not a report about it.** D7 makes `decisions` the one
// authoritative log and `ads` / `config_generations` / the rollups projections of it, so every row
// here is a cause and every generation named beside it is that cause's effect. `sqlite3 loop.sqlite
// 'SELECT * FROM decisions ORDER BY decision_seq'` returns exactly these rows, in exactly the
// reverse of this order, which is the plan row's own verification.
//
// **Order.** `GET /api/decisions` and the snapshot both serve FOLD order (`decision_seq` ascending)
// because that is the order that reproduces the config and the only order the endpoint can be wrong
// about. This surface reverses it — newest first — because a human reads a log backwards. The
// reversal is here, in the display, and nowhere near the fold.
//
// **The generation each decision opened** comes from `config_generations.opened_by_decision`, which
// is the FK the schema already carries (§2.3). It is not always present and the column says so
// rather than rendering a blank: `DESIGN.md` §7 opens a generation *"only if config changed"*, so a
// decision with no generation beside it is a decision the fold accepted and that moved nothing —
// visible here, and invisible anywhere else.

import { useState } from 'react';
import type { GenerationRow } from '../server/snapshot.ts';
import type { Decision } from '../shared/decisions.ts';
import type { DecisionScore } from '../server/scoring.ts';
import { describeBody } from './decisions.ts';

/**
 * **B50a / P18 — one score cell**, next to the entry it describes. Brief L125: *"a stated
 * before-window vs. after-window heuristic next to each log entry is enough."*
 *
 * Three states and no fourth, because the interesting one is the middle:
 *
 *   - **scored** — the metric, both values, the signed change, and whether that is an improvement
 *     (CPA improves when it FALLS, CTR when it rises — the direction is per metric);
 *   - **withheld** — and it says WHY. `scoring in Nh` is not an apology: it is the clearest signal
 *     on the surface that the lateness bias was understood rather than merely handled, because a
 *     comparison taken before both windows settle makes every decision look worse than it was;
 *   - **contaminated** — D70. A second lever inside either window is flagged and named, never
 *     silently averaged in and never used to suppress the number.
 */
function Score({ score }: { score: DecisionScore | undefined }) {
  if (score === undefined) return <span className="log__none">—</span>;

  const flag =
    score.contaminated_by.length === 0 ? null : (
      <span className="log__contaminated" title="D70: another lever was pulled on this ad inside the ±6 h window, so this comparison is not clean">
        {' '}⚠ contaminated by #{score.contaminated_by.join(', #')}
      </span>
    );

  if (score.score === null) {
    const w = score.withheld;
    return (
      <span className="log__none">
        {w === null
          ? '—'
          : w.reason === 'settling'
            ? `scoring in ${w.hours_remaining} h`
            : w.reason === 'no_before_window'
              ? 'no before-window'
              : 'too little evidence'}
        {w !== null && w.reason === 'settling' ? (
          <span className="log__hint"> · awaiting conversion settlement</span>
        ) : null}
        {flag}
      </span>
    );
  }

  const { metric, before, after, delta_pct, improved } = score.score;
  const fmt = (v: number): string =>
    metric === 'cpa' ? `$${(v / 100).toFixed(2)}` : `${(v * 100).toFixed(2)}%`;
  return (
    <span>
      <span className={improved ? 'score score--better' : 'score score--worse'}>
        {improved ? '▲ better' : '▼ worse'}
      </span>{' '}
      <span className="log__none">{metric.toUpperCase()}</span> {fmt(before)} → {fmt(after)} (
      {delta_pct >= 0 ? '+' : ''}
      {delta_pct.toFixed(1)}%){flag}
    </span>
  );
}

export type DecisionLogProps = {
  decisions: readonly Decision[];
  generations: readonly GenerationRow[];
  /** **B50a** — by `decision_id`. Absent while the first read is in flight. */
  scores: ReadonlyMap<string, DecisionScore>;
  /** `null` = the whole portfolio is charted, which is the snapshot's own convention for `?ads=`. */
  selected: ReadonlySet<string> | null;
};

export function DecisionLog({ decisions, generations, scores, selected }: DecisionLogProps) {
  // Global by default. The plan row asks for "per-ad and global"; the per-ad view reuses the
  // portfolio selection rather than adding a second, independently-wrong idea of which ad is in
  // focus — so clicking an ad on the left filters the chart, the totals AND the log together.
  const [scope, setScope] = useState<'all' | 'selection'>('all');

  const byDecision = new Map(generations.map((g) => [g.opened_by_decision, g]));
  const filtered =
    scope === 'all' || selected === null
      ? decisions
      : decisions.filter((d) => selected.has(d.ad_id));
  // Newest first — see the header note. `slice()` because the prop is the snapshot's array and
  // `reverse()` mutates in place; reversing it under React would reorder the source of truth.
  const rows = filtered.slice().reverse();

  return (
    <>
      <div className="controls">
        <div className="controls__group">
          <span className="controls__label">Log</span>
          <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
            all ads
          </button>
          <button
            type="button"
            aria-pressed={scope === 'selection'}
            onClick={() => setScope('selection')}
          >
            selection{selected === null ? ' (all selected)' : ` (${selected.size})`}
          </button>
        </div>
        <div className="controls__group">
          <span className="controls__label">
            {rows.length} of {decisions.length} decisions · fold order reversed for reading
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="timeline__empty">
          No decisions for this selection. Every ad has at least a <code>create_ad</code> and a{' '}
          <code>launch</code> (D5/E4/E5) — an empty list here means the selection is empty.
        </p>
      ) : (
        <table className="log">
          <thead>
            <tr>
              <th>#</th>
              <th>when</th>
              <th>actor</th>
              <th>ad</th>
              <th>action</th>
              <th>what changed</th>
              <th>rationale</th>
              <th>opened</th>
              <th>score (±6 h, D70)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const generation = byDecision.get(d.decision_id);
              return (
                <tr key={d.decision_id}>
                  <td className="log__seq">{d.decision_seq}</td>
                  <td className="log__ts">{d.ts.replace('T', ' ').replace('.000Z', 'Z')}</td>
                  <td>
                    <code>{d.actor}</code>
                  </td>
                  <td>
                    <code>{d.ad_id}</code>
                  </td>
                  <td>
                    <span className={`log__action log__action--${d.body.action}`}>{d.body.action}</span>
                  </td>
                  <td>{describeBody(d.body)}</td>
                  <td className="log__rationale">{d.rationale}</td>
                  <td>
                    {generation === undefined ? (
                      // Not a gap in the data: §7 opens a generation only if config changed.
                      <span className="log__none" title="this decision opened no generation — §7 opens one only if config changed">
                        —
                      </span>
                    ) : (
                      <>
                        <code>{generation.generation_id}</code>
                        <span className="log__none">
                          {' '}
                          {generation.valid_to === null ? '· live now' : `· until ${generation.valid_to}`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="log__score">
                    <Score score={scores.get(d.decision_id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* **B50a.** The heuristic, stated — brief L125 asks for exactly this and L147 warns off
          anything more. The limits are as prominent as the number, the same posture §19's fatigue
          flag takes, because a heuristic whose caveats are smaller than its verdict is dishonest. */}
      <p className="gate">
        <strong>Scoring, and its four limits.</strong> Each entry compares a{' '}
        <strong>symmetric 6-hour window</strong> either side of the decision (<strong>D70</strong>),
        on one metric — CPA where both windows carry conversions, CTR otherwise. (1) It is{' '}
        <strong>withheld until both windows are past the lateness horizon</strong>: the before-window
        has had longer to accumulate late conversions, so an unguarded comparison makes{' '}
        <em>every</em> decision look worse than it was.{' '}
        <strong>Shorten the horizon above to release a score live.</strong> (2) A second lever inside
        either window is <strong>flagged as contaminated</strong>, not corrected for — a visible
        contamination beats two unequal windows needing normalisation. (3) It is a{' '}
        <strong>comparison, not a causal claim</strong>: the world moves on its own, and six hours of
        it moved here too. (4) One metric, chosen by the rule above and never both, so the reader
        cannot pick whichever moved the way they hoped.
      </p>

      <p className="gate">
        Every row above is a row of <code>decisions</code>, and the config on the left is the fold of
        exactly these rows and nothing else —{' '}
        <code>sqlite3 data/loop.sqlite &apos;SELECT * FROM decisions ORDER BY decision_seq&apos;</code>{' '}
        returns them in the reverse of this order. <code>GET /api/verify</code> is the machine
        version of the same claim: it rebuilds <code>ads</code> and <code>config_generations</code>{' '}
        from this log into shadow tables and diffs them against the live ones.
      </p>
    </>
  );
}
