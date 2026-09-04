// The fatigue flag's surface — B45, `SIMULATOR.md` §19.
//
// **The four limits are rendered next to the flag, not only in the README.** §19 requires that, and
// it is the reason this heuristic is defensible at all: *"a well-chosen heuristic, honestly
// presented with its limits, beats an opaque model"* (L147). They are not a tooltip and not a
// footnote; they are on the surface, under the list, always.
//
// The flag is computed on the server (`src/server/fatigue-flag.ts`) because the PEAK is a property
// of the pair's whole life and the pair itself comes from §8's temporal reverse join — the header
// there has the argument. This file renders and attributes.
//
// **It is a display flag, not a recommendation** (§19, D26 cut #6). Nothing here offers a lever;
// the strategist reads it and decides. No `system:fatigue_rule` decision exists in the log.

import type { FatigueReport, PairFatigue } from '../server/fatigue-flag.ts';

const pct = (value: number | null): string => (value === null ? '—' : `${(value * 100).toFixed(2)}%`);
const drop = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** §19's four limits, verbatim in substance, stated where the flag is read. */
const LIMITS = [
  'It cannot separate fatigue from an audience-quality shift or a platform delivery change. A sustained channel-level dip and a genuine burnout look the same for the first few hours — by construction, because they do in reality.',
  'It lags by roughly the EWMA half-life: a collapse is flagged 15–30 minutes after it starts.',
  'It fires late on low-volume ads precisely because the gate suppresses their points. An ad could burn out completely and never accumulate three qualifying points — so the ads most likely to be fatigued are the ones we are slowest to flag. That is the honest failure mode, and the rows below say “no reading” rather than “healthy”.',
  'It measures the PAIR, not the ad. An ad whose video is fresh and whose headline is burned shows a partial signal, and the row attributes it to the slot.',
];

function Row({ pair, ads }: { pair: PairFatigue; ads: string[] }) {
  return (
    <li className={`fatigue__row${pair.flagged ? ' fatigue__row--flagged' : ''}`}>
      <span className="fatigue__mark">{pair.flagged ? '▲' : '·'}</span>
      <code className="fatigue__pair">
        {pair.lineage} × {pair.audience_id}
      </code>
      <span className="fatigue__slot">{pair.slot}</span>
      <span className="fatigue__numbers">
        {pair.flagged ? (
          <>
            <strong>{drop(pair.drop)} below peak</strong> — CTR {pct(pair.current)} against a peak
            of {pct(pair.peak)}
            {pair.peak_at === null ? null : <> set {pair.peak_at.slice(0, 16).replace('T', ' ')}Z</>}
          </>
        ) : (
          <>
            {pair.current === null ? 'no reading' : `${pct(pair.current)} now, peak ${pct(pair.peak)}`}
            {pair.reason === null ? null : <> — {pair.reason}</>}
          </>
        )}
      </span>
      <span className="fatigue__points">
        {pair.points_current}/{pair.points_peak} qualifying points
      </span>
      <span className="fatigue__ads">{ads.length > 0 ? `used by ${ads.join(', ')}` : 'unused now'}</span>
    </li>
  );
}

export function FatigueFlag({ report }: { report: FatigueReport | null }) {
  if (report === null) return <p className="fatigue__empty">Fatigue not read yet.</p>;

  // Which ads currently use each pair — the attribution §19's fourth limit demands. From the
  // fold's head, so a swapped-out component stops being attributed to the ad that swapped it.
  const usedBy = new Map<string, string[]>();
  for (const ad of report.ads) {
    for (const [slot, lineage] of [
      ['video', ad.video_lineage],
      ['headline', ad.headline_lineage],
    ] as const) {
      const key = `${slot}|${lineage}|${ad.audience_id}`;
      usedBy.set(key, [...(usedBy.get(key) ?? []), ad.ad_id]);
    }
  }

  const flagged = report.pairs.filter((p) => p.flagged);

  return (
    <>
      <p className="fatigue__summary">
        <strong>{flagged.length}</strong> of {report.pairs.length} component pairs are fatiguing —
        CTR at least 25% below the pair’s own peak, measured as an EWMA over the trailing 6 h and
        counting only points that clear the 500-impression gate.{' '}
        <em>A display flag, not a recommendation: nothing here pulls a lever.</em>
      </p>
      <ol className="fatigue">
        {report.pairs.map((pair) => (
          <Row
            key={`${pair.slot}|${pair.lineage}|${pair.audience_id}`}
            pair={pair}
            ads={usedBy.get(`${pair.slot}|${pair.lineage}|${pair.audience_id}`) ?? []}
          />
        ))}
      </ol>
      <div className="fatigue__limits">
        <strong>What this heuristic cannot tell you</strong>
        <ol>
          {LIMITS.map((limit) => (
            <li key={limit.slice(0, 24)}>{limit}</li>
          ))}
        </ol>
      </div>
    </>
  );
}
