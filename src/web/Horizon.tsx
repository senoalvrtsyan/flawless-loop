// The horizon control — B49 / P16. `DESIGN.md` §5.7, **F2**.
//
// **Why this is a build item and not a toggle**, in F2's own arithmetic: with a 72 h horizon and
// seven days of backfill, backfilled buckets are already settled and live buckets never reach
// settlement inside a demo. So P7's restatement path would be built, correct, and **invisible**.
// This control is what makes it visible on camera, and shortening the horizon is a **settlement
// re-evaluation across a range**, which is why it reports what it swept rather than just switching.
//
// **It writes nothing.** The horizon is a read parameter carried on the query (`?horizon_h=`); the
// stored `restated_at` still records what was true at the account horizon, because that column is
// `apply()`'s (D7) and a sweep that rewrote it would make `/api/verify` diverge on a correct store.
// So "restated under this horizon" is derived and labelled as derived — the sweep result says how
// many, and the entry is honest that the stored flag disagrees.
//
// **The one asymmetry the caption has to own.** The SSE flush tick serves N subscribers from one
// read (§11), so it stamps `state` at the ACCOUNT horizon and cannot stamp it per-subscriber. When
// the swept horizon is not the default, `App.tsx` re-derives every row's state with the same
// `bucketState` the server uses — not a second copy of the rule, the same function, which is why
// `settlement.ts` is kept free of `node:sqlite`.

// Type-only, therefore erased at build time — `sweep.ts` imports `db.ts` and must never reach the
// bundle. The CHOICES are a value, so they come from `shared/`; see the note on the constant.
import type { SweepResult } from '../server/sweep.ts';
import { HORIZON_CHOICES_H } from '../shared/config.ts';

/** Hours, rendered the way the rest of the surface renders a duration. */
function hours(h: number): string {
  return h >= 24 && h % 24 === 0 ? `${h / 24}d` : `${h}h`;
}

export type HorizonProps = {
  /** The horizon the surface is currently answered at, in hours. */
  horizonH: number;
  /** D13's, and the one the write side stamps with. */
  defaultH: number;
  onChange: (hours: number) => void;
  /** The last sweep's result, or `null` before one has run / while it is running. */
  result: SweepResult | null;
  pending: boolean;
};

export function Horizon({ horizonH, defaultH, onChange, result, pending }: HorizonProps) {
  return (
    <>
      <div className="controls">
        <div className="controls__group">
          <span className="controls__label">Lateness horizon</span>
          {HORIZON_CHOICES_H.map((h) => (
            <button key={h} type="button" aria-pressed={horizonH === h} onClick={() => onChange(h)}>
              {hours(h)}
              {h === defaultH ? ' (D13)' : ''}
            </button>
          ))}
          {pending ? <span className="controls__label">sweeping…</span> : null}
        </div>
      </div>

      {horizonH === defaultH ? (
        <p className="gate">
          answering at D13&rsquo;s <strong>{hours(defaultH)}</strong> — the account horizon, and the
          one the write side stamps <code>restated_at</code> against. <strong>F2:</strong> at this
          horizon a bucket that settles during a demo does not exist, so the only restatements you
          can see are the ones the seeded week already carries. Shorten it to cause one live.
        </p>
      ) : (
        <p className="gate gate--dropped">
          <strong>
            answering at {hours(horizonH)}, not the account&rsquo;s {hours(defaultH)}
          </strong>{' '}
          — every settlement mark, the dashed rule, the maturity line and the restatement timeline
          on this page are re-derived at {hours(horizonH)}. <strong>Nothing was written.</strong>{' '}
          <code>restated_at</code> in the store still records what was true at {hours(defaultH)}, so
          a bucket can read <em>restated</em> here and carry no stored flag — that is a derivation,
          not a disagreement, and <code>/api/verify</code> still returns 200.
        </p>
      )}

      {result === null ? null : (
        <p className="gate">
          swept <strong>{hours(result.from_horizon_h)} → {hours(result.to_horizon_h)}</strong> in{' '}
          {result.duration_ms} ms · <strong>{result.flipped}</strong> bucket
          {result.flipped === 1 ? '' : 's'} changed settlement state, of which{' '}
          <strong>{result.newly_restated}</strong> had already moved by the time{' '}
          {hours(result.to_horizon_h)} says they were settled ·{' '}
          {/* The proof this was a range scan and not a table walk — the plan row's own check. */}
          read <strong>{result.scanned.toLocaleString('en-US')}</strong> of{' '}
          {result.total_buckets.toLocaleString('en-US')} buckets, the band{' '}
          <code>{result.affected_range.from}</code> → <code>{result.affected_range.to}</code> on{' '}
          <code>ix_rollup_time</code>
        </p>
      )}

      {result !== null && result.sample.length > 0 ? (
        <ul className="boundaries">
          {result.sample.slice(0, 6).map((flip) => (
            <li key={`${flip.ad_id}${flip.minute_start}`} className="boundaries__item boundaries__item--sweep">
              <code>{flip.ad_id}</code> <code>{flip.minute_start}</code> · {flip.was} →{' '}
              <strong>{flip.now}</strong>
              {flip.restated_under_new_horizon ? (
                <span className="boundaries__meta">
                  {' '}
                  · <strong>restated under this horizon</strong> — its newest arrival landed{' '}
                  {flip.latest_arrival_at}, after {hours(result.to_horizon_h)} had passed
                </span>
              ) : (
                <span className="boundaries__meta">
                  {' '}
                  · nothing arrived after it settled
                  {flip.latest_arrival_at === null ? ' (no conversions credited to it)' : ''}
                </span>
              )}
            </li>
          ))}
          {result.sample.length > 6 ? (
            <li className="boundaries__meta">
              …and {result.flipped - 6} more; the sample is capped at {result.sample.length} so this
              response stays inspectable rather than becoming a dump
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}
