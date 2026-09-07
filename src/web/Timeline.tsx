// The restatement timeline — B43, rendering `DESIGN.md` §5.6's sentence and computing nothing.
//
// *"14:02 Tue — ROAS 1.8 → 2.4 · +3 conversions · $412 · arrived 2 days 4 h late."*
//
// **Every entry sits at the BUCKET's own time, not at now.** That is the whole point of §5.6 clause
// 2: ordered by when the restatement happened, every entry would read "recently" and say nothing
// about which period moved. The `restated_at` stamp is shown too, second, because *when we learned*
// and *what changed* are two different facts and the demo needs both.
//
// The before-and-after figures are derived on the server (`src/server/restatements.ts`) by
// subtracting the late arrivals from the current counts — nothing stores a previous value, and
// nothing should (D10/D7).

import type { RestatementEntry } from '../server/restatements.ts';
import { formatCents, formatCount, formatRoas } from './metrics.ts';

/** "2 d 4 h", "19 h 30 min" — §5.6's own phrasing, not milliseconds. */
function lateness(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * `2026-08-29T18:33:00.000Z` → `18:33 Sat 29 Aug UTC` — the bucket's own time, **in UTC** (**D76**).
 *
 * This read `toLocaleString` with no `timeZone` until a UTC+4 browser exposed it: the same event
 * appeared here as `22:33` and in the decision log two sections up as `18:33Z`. The example in this
 * comment was itself only correct on a UTC+0 machine, which is how long it went unnoticed.
 */
function bucketLabel(minute: string): string {
  const at = new Date(minute);
  return `${at.toLocaleString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} UTC`;
}

export function Timeline({ entries }: { entries: readonly RestatementEntry[] }) {
  if (entries.length === 0) {
    // **D75.** The state and the one action; the arrival-model arithmetic is README §10.
    return (
      <p className="timeline__empty">
        No settled bucket in this window has moved. <strong>Widen the window to 7d</strong> — the
        seeded week carries restatements from frame one.
      </p>
    );
  }

  return (
    <ol className="timeline">
      {entries.map((entry) => {
        const addedConversions = entry.after.conversions - entry.before.conversions;
        const addedValue = entry.after.value_cents - entry.before.value_cents;
        return (
          <li key={`${entry.ad_id}\n${entry.minute_start}`} className="timeline__item">
            <div className="timeline__head">
              {/* The bucket's time first and largest — it is the thing that moved. */}
              <strong>{bucketLabel(entry.minute_start)}</strong> · <code>{entry.ad_id}</code>
            </div>
            <div className="timeline__delta">
              {/* ROAS before → after, exactly §5.6's example. `—` on the left is a bucket that had
                  no attributed revenue at all until the late arrival, which is the common case. */}
              ROAS <strong>{formatRoas(entry.before.roas)}</strong> →{' '}
              <strong>{formatRoas(entry.after.roas)}</strong>
              {' · '}
              {addedConversions >= 0 ? '+' : ''}
              {formatCount(addedConversions)} conversion{addedConversions === 1 ? '' : 's'}
              {' · '}
              {formatCents(addedValue)}
              {' · arrived '}
              <strong>{lateness(entry.lateness_ms)} late</strong>
            </div>
            <div className="timeline__meta">
              {/* The bucket's own spend, because a per-MINUTE ROAS of 212× is arithmetically right
                  and unreadable without it: one conversion's value against one minute's click cost
                  and CPM. §5.6 specifies the ratio per entry; this is what makes it interpretable,
                  and the window totals above are where a ROAS a strategist would act on lives. */}
              spend {formatCents(entry.after.spend_total_cents)} in this minute · CPA{' '}
              {entry.before.cpa_cents === null ? '—' : formatCents(entry.before.cpa_cents)} →{' '}
              {entry.after.cpa_cents === null ? '—' : formatCents(entry.after.cpa_cents)} · learned
              at <code>{entry.restated_at}</code> · restatement_count {entry.restatement_count}
              {/* The evidence, on the surface: B53's drill-down replays these ids, and until it
                  exists they are still the thing a reviewer can grep the store for. */}
              {entry.arrivals.length > 0 ? (
                <>
                  {' · '}
                  {entry.arrivals.map((a) => (
                    <code key={a.event_id} className="timeline__event">
                      {a.event_id}
                      {a.source === 'backfill' ? ' (seeded)' : ' (live)'}
                    </code>
                  ))}
                </>
              ) : null}
              {entry.explained ? null : (
                <>
                  {' · '}
                  <strong>
                    UNEXPLAINED — {entry.restatement_count} restatement(s) recorded,{' '}
                    {entry.arrivals.length} late arrival(s) found
                  </strong>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
