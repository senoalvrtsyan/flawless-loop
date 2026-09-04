// The portfolio list — B36. Twelve ads, all of them from the FOLD.
//
// Nothing here reads `fixtures.ts`, and the difference is visible on screen: `fixtures.ts` still
// says what `a_12`'s budget was at seeding, and a `set_budget` decision has since made that wrong.
// These rows come from `ads`, which exists only because `applyDecision()` ran — so a lever pulled
// in one browser tab shows up in another on its next snapshot, with no code path between them
// except the decision log (D7).
//
// `gen` is the ad's generation number, taken from `current_generation_id` (`g_<ad_id>_<nnn>`, B13).
// It is here because it makes HR6 — "configs change only via levers" — visible on the FIRST screen
// rather than at B48's chart annotations: an ad on generation 4 has had three levers pulled on it.

import type { AdRow } from '../server/snapshot.ts';

/** Status glyph AND colour, never colour alone — D45's non-colour channel rule. */
const GLYPH: Record<AdRow['status'], string> = {
  live: '●',
  paused: '❙❙',
  draft: '○',
  archived: '▪',
};

/**
 * `g_a_12_004` → `4`. Falls back to the whole id if it is ever not that shape, rather than
 * rendering `NaN` — a generation label is worth less than knowing the id is unexpected.
 */
function generationNumber(generationId: string): string {
  const tail = generationId.slice(generationId.lastIndexOf('_') + 1);
  return /^\d+$/.test(tail) ? String(Number(tail)) : generationId;
}

/** Cents to a plain dollar figure. No currency machinery: D§2 is USD-only and says so (G05). */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export type PortfolioProps = {
  ads: readonly AdRow[];
  /** `null` means "all ads" — the snapshot's own convention for an absent `?ads=`. */
  selected: ReadonlySet<string> | null;
  onToggle: (ad_id: string) => void;
};

export function Portfolio({ ads, selected, onToggle }: PortfolioProps) {
  return (
    <nav className="shell__side" aria-label="Portfolio">
      <h2>Portfolio · {ads.length} ads</h2>
      <ul className="portfolio">
        {ads.map((ad) => {
          const on = selected === null || selected.has(ad.ad_id);
          return (
            <li key={ad.ad_id}>
              <button
                type="button"
                className="portfolio__item"
                // `aria-pressed` is the selected state for a screen reader AND the CSS hook, so
                // the two cannot drift apart into a button that looks selected and reads as not.
                aria-pressed={on}
                onClick={() => onToggle(ad.ad_id)}
              >
                <span className="portfolio__line">
                  <span className="portfolio__name">{ad.name}</span>
                  <span className={`status status--${ad.status}`}>
                    {GLYPH[ad.status]} {ad.status}
                  </span>
                </span>
                <span className="portfolio__line portfolio__meta">
                  <span>
                    <code>{ad.ad_id}</code> · {ad.channel}
                  </span>
                  <span>
                    {dollars(ad.daily_budget_cents)}/day · gen{' '}
                    {generationNumber(ad.current_generation_id)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
