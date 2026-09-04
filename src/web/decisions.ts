// The decision log's display helpers — B47. Pure, and split out of `DecisionLog.tsx` for the same
// reason `series.ts` is split out of `Chart.tsx`: a component renders, a module decides what the
// words are, and only the second kind can be imported by a check that is not a browser.
//
// `describeBody` is exhaustive over `DecisionBody`. That exhaustiveness is the point — a seventh
// action added to §2.3 becomes a type error here rather than a row that prints its action name and
// silently drops the payload that says what it did.

import type { DecisionBody } from '../shared/decisions.ts';

/** Cents to a plain dollar figure. USD-only (G05), same rendering as everywhere else. */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * The body, in one clause. Exhaustive over `DecisionBody`, so a seventh action is a type error
 * here rather than a row that renders its action name and silently drops its payload.
 *
 * **The precondition is shown, not hidden** — `set_budget $500 → $800` reads as a change, and it is
 * the `from` half that makes it an assertion about the world the decision was taken in (I13).
 */
export function describeBody(body: DecisionBody): string {
  switch (body.action) {
    case 'create_ad':
      return `${body.initial.name} · ${body.initial.channel} · video ${body.initial.video_id} · headline ${body.initial.headline_id} · ${dollars(body.initial.daily_budget_cents)}/day`;
    case 'launch':
      return 'live';
    case 'pause':
      return 'stop delivery';
    case 'resume':
      return 'resume delivery';
    case 'set_budget':
      return `${dollars(body.from_cents)} → ${dollars(body.to_cents)}/day`;
    case 'swap_component':
      return `${body.slot} ${body.from_id} → ${body.to_id}`;
  }
}
