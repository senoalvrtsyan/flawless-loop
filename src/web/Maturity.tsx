// The maturity label — B41, rendering **D33**'s curve and nothing of its own.
//
// Every figure here was measured and evaluated on the server (`src/server/maturity.ts`); this file
// formats. That is D46's rule, and it matters more than usual for this number: "68% mature" is a
// claim about how complete the data is, so a client-side estimate of it would be an opinion about
// an opinion.
//
// **What it must keep distinct from the gate** (`DESIGN.md` §4.5, `SIMULATOR.md` §19): the gate says
// *too little data to be a ratio*; this says *the data is still arriving*. A young cohort trips
// both, for different reasons, so the two live in separate captions with separate wording and are
// never merged into one "not enough data" message.

import type { Maturity as MaturityData } from '../server/maturity.ts';
import { formatCount } from './metrics.ts';

/** Whole hours and minutes — a lag of 4,140,000 ms means nothing to a reader. */
function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

const pct = (share: number): string => `${Math.round(share * 100)}%`;

export function Maturity({ data }: { data: MaturityData }) {
  // The median and the 95th, named, so the label is a summary of a distribution rather than a
  // single opaque percentage. Read off the server's own quantile table.
  const median = data.quantiles.find((q) => q.share >= 0.5);
  const p95 = data.quantiles.find((q) => q.share >= 0.95);

  return (
    <p className="maturity">
      <span className="maturity__figure">
        newest minute in view <strong>{pct(data.newest_share)} mature</strong>
      </span>
      {' · '}
      <span>
        oldest <strong>{pct(data.oldest_share)}</strong>
      </span>
      {' · '}
      {data.fallback ? (
        <span>
          <strong>no measured curve yet</strong> — D33’s cold-start fallback (50% @ 1 h, 80% @ 6 h,
          95% @ 24 h) is standing in, over only {formatCount(data.sample_size)} settled conversions
        </span>
      ) : (
        <>
          {/* §15.4: the sample size AND the seeded share, always. Inside the seeded window
              `received_at` is designed rather than observed, so a figure resting mostly on seeded
              arrivals is resting on our own arrival model — which is a real limit, not modesty. */}
          <span>
            measured over {formatCount(data.sample_size)} settled conversions (
            {formatCount(data.seeded)} seeded, {formatCount(data.live)} live)
          </span>
          {median !== undefined && p95 !== undefined ? (
            <>
              {' · '}
              <span>
                half arrive within {duration(median.lag_ms)}, 95% within {duration(p95.lag_ms)}
              </span>
            </>
          ) : null}
        </>
      )}
      {/* **D75.** D33 requires the sample size on screen and it is above; WHY incomplete cohorts
          are excluded is README §"Separating signal from noise". Kept as a hover so the caveat is
          still reachable without occupying a line. */}
      <span className="maturity__note" title={`cohorts credited after ${data.settled_before} were excluded as incomplete — measuring over them biases every quantile short`} />
    </p>
  );
}
