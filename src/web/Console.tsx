// The action console — B46. The strategist's four levers, and the only way config changes (HR6).
//
// `POST /api/decisions` is the whole of this file's write path. It does not touch `ads`, it does
// not touch `config_generations`, and it could not: those are projections with one writer (D7,
// `applyDecision`). What comes back is the NEW state, read from inside the same transaction that
// wrote the log row — so the console never shows an optimistic value that could then be rejected,
// and there is no reconciliation step to get wrong.
//
// **Three deliberate refusals, each of which would have made this file friendlier and less true:**
//
//  1. **It does not mirror the fold's transition table.** `fold.ts`'s `admits()` says a `live` ad
//     takes `pause` and a `paused` one takes `resume`; copying that here would put the rule in two
//     places, and the copy would be the one that goes stale. So all four levers are always offered
//     and the SERVER judges — a `resume` on a live ad comes back 409 `illegal_transition` with the
//     reason, which is the honest answer and the one a reviewer can check against `DECISIONS.md`.
//
//  2. **It does not retry a rejection.** The plan row says "compare-and-swap rejection surfaced
//     honestly rather than retried", and the temptation is real: on `stale_precondition` the 409's
//     message contains the current value, so a client could re-send with it and succeed. That would
//     defeat I13 exactly — the guard exists because the human's intent was formed against a value
//     that has since changed, and re-sending asserts an intent nobody expressed.
//
//  3. **The precondition is a VISIBLE, EDITABLE field**, not a hidden one. `from_cents` / `from_id`
//     are on the wire (§2.3) and they are the mechanism the whole lever path is built around; a
//     console that filled them in silently would make I13 undemonstrable in one browser tab. Typing
//     a wrong value here is how a reviewer sees the guard fire, and it is the plan row's own check.
//
// The idempotency key (U5) is client-generated and held across a NETWORK failure, which is the case
// it exists for: a POST that timed out may or may not have been applied, and re-sending the same
// `decision_id` is answered `replayed: true` rather than folded twice. It is regenerated after any
// server ANSWER — a 200 or a 409 — because the next submission is then a different decision.

import { useCallback, useRef, useState } from 'react';
import type { AdRow } from '../server/snapshot.ts';
import type { ComponentRow } from '../server/components.ts';
import type { AdStatus, ComponentSlot, Decision } from '../shared/decisions.ts';

/** The four levers this console offers. `create_ad` and `launch` are the seeder's (D5/E4/E5). */
type Lever = 'pause' | 'resume' | 'set_budget' | 'swap_component';

const LEVER_LABELS: Record<Lever, string> = {
  pause: 'Pause',
  resume: 'Resume',
  set_budget: 'Set budget',
  swap_component: 'Swap component',
};

/** What the server said. A 409 is an ANSWER, not a failure — see refusal 2 above. */
type Outcome =
  | { kind: 'applied'; decision: Decision; ad: AdRow; replayed: boolean }
  | { kind: 'refused'; status: number; error: string; message: string | null }
  | { kind: 'unreachable'; message: string };

export async function fetchComponents(signal: AbortSignal): Promise<ComponentRow[]> {
  const res = await fetch('/api/components', { signal });
  if (!res.ok) throw new Error(`components: ${res.status} ${res.statusText}`);
  return ((await res.json()) as { components: ComponentRow[] }).components;
}

export type ConsoleProps = {
  ads: readonly AdRow[];
  components: readonly ComponentRow[];
  /**
   * Called after the server has ANSWERED with a 200. The App re-runs §3.1 from step 1 rather than
   * patching its own state: a lever changes `ads`, `config_generations` and the log at once, and
   * re-reading is the same path a refresh takes. There is no second "adjust what we have" path to
   * disagree with the first.
   */
  onApplied: () => void;
};

export function Console({ ads, components, onApplied }: ConsoleProps) {
  const [adId, setAdId] = useState<string>(ads[0]?.ad_id ?? '');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const ad = ads.find((a) => a.ad_id === adId) ?? ads[0] ?? null;

  if (ad === null) return <p>No ads in the portfolio — nothing to pull a lever on.</p>;

  return (
    <section className="console">
      <div className="console__row">
        <label className="console__field">
          <span className="console__label">Ad</span>
          <select value={ad.ad_id} onChange={(e) => setAdId(e.target.value)}>
            {ads.map((a) => (
              <option key={a.ad_id} value={a.ad_id}>
                {a.ad_id} · {a.name} · {a.status}
              </option>
            ))}
          </select>
        </label>
        <span className="console__current">
          now: <strong>{ad.status}</strong> · {dollars(ad.daily_budget_cents)}/day · video{' '}
          <code>{ad.video_id}</code> · headline <code>{ad.headline_id}</code> · gen{' '}
          {ad.current_generation_id} · after decision #{ad.last_decision_seq}
        </span>
      </div>

      {/*
        Keyed by the ad AND its fold position, so the form remounts — and therefore re-primes every
        precondition from the current config — whenever either changes. That is what makes "the
        console cannot be stale against itself" a structural property rather than a `useEffect` that
        has to remember every field it should reset.
      */}
      <LeverForm
        key={`${ad.ad_id}:${ad.last_decision_seq}`}
        ad={ad}
        components={components}
        onOutcome={(o) => {
          setOutcome(o);
          if (o.kind === 'applied') onApplied();
        }}
      />

      {outcome === null ? null : <OutcomeBanner outcome={outcome} />}
    </section>
  );
}

/** Cents to a plain dollar figure — the same rendering `Portfolio.tsx` uses. USD-only (G05). */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function LeverForm({
  ad,
  components,
  onOutcome,
}: {
  ad: AdRow;
  components: readonly ComponentRow[];
  onOutcome: (outcome: Outcome) => void;
}) {
  const [lever, setLever] = useState<Lever>(ad.status === 'live' ? 'pause' : 'resume');
  const [rationale, setRationale] = useState('');
  const [slot, setSlot] = useState<ComponentSlot>('video');
  const [pending, setPending] = useState(false);

  // The preconditions, primed from the CURRENT config and editable — refusal 3 above. Held as
  // strings because that is what an `<input>` holds; the conversion to cents happens once, at
  // submit, where a bad value can be refused before anything is sent.
  const [fromCents, setFromCents] = useState(String(ad.daily_budget_cents));
  const [toDollars, setToDollars] = useState(String(Math.round(ad.daily_budget_cents / 100)));
  const currentSlotId = slot === 'video' ? ad.video_id : ad.headline_id;
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState('');
  // `null` means "follow the slot" — so switching video↔headline re-primes the precondition
  // without a reset effect, and typing into it pins the override.
  const resolvedFromId = fromId ?? currentSlotId;

  const candidates = components.filter((c) => c.kind === slot);

  /** U5's idempotency key. Survives a network failure; replaced after any server answer. */
  const decisionId = useRef(crypto.randomUUID());

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (pending) return;

      // Brief L95: a rationale is required. Checked here so the message names the field, and by
      // the endpoint AND a schema CHECK so this check is a courtesy rather than the guarantee.
      if (rationale.trim() === '') {
        onOutcome({ kind: 'refused', status: 0, error: 'rationale_required', message: 'A rationale is required — the log records why, not only what.' });
        return;
      }

      let body: Record<string, unknown>;
      if (lever === 'set_budget') {
        // U6: money is a non-negative INTEGER of cents. `$412.505` is not one, and rounding it
        // silently would put a number in the log that nobody typed.
        const cents = Math.round(Number(toDollars) * 100);
        const from = Number(fromCents);
        if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isSafeInteger(from) || from < 0) {
          onOutcome({ kind: 'refused', status: 0, error: 'budget_not_an_integer_of_cents', message: null });
          return;
        }
        body = { action: 'set_budget', from_cents: from, to_cents: cents };
      } else if (lever === 'swap_component') {
        if (toId === '') {
          onOutcome({ kind: 'refused', status: 0, error: 'to_id_missing', message: 'Pick the component to swap to.' });
          return;
        }
        body = { action: 'swap_component', slot, from_id: resolvedFromId, to_id: toId };
      } else {
        body = { action: lever };
      }

      setPending(true);
      try {
        const res = await fetch('/api/decisions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // `ts`, `actor` and `decision_seq` are absent on purpose: the endpoint REJECTS all three
          // (U7, U2), so backdating is unrepresentable rather than validated away.
          body: JSON.stringify({ decision_id: decisionId.current, ad_id: ad.ad_id, rationale, ...body }),
        });
        const payload: unknown = await res.json();
        // The server answered, so the key has been spent either way.
        decisionId.current = crypto.randomUUID();
        if (res.ok) {
          const ok = payload as { decision: Decision; ad: AdRow; replayed: boolean };
          onOutcome({ kind: 'applied', decision: ok.decision, ad: ok.ad, replayed: ok.replayed });
          setRationale('');
        } else {
          const bad = payload as { error?: unknown; message?: unknown };
          onOutcome({
            kind: 'refused',
            status: res.status,
            error: typeof bad.error === 'string' ? bad.error : 'unknown_error',
            message: typeof bad.message === 'string' ? bad.message : null,
          });
        }
      } catch (err: unknown) {
        // NO answer, so the key is NOT regenerated: a retry re-sends the same `decision_id` and
        // the server answers `replayed: true` if the first attempt actually landed.
        onOutcome({ kind: 'unreachable', message: err instanceof Error ? err.message : String(err) });
      } finally {
        setPending(false);
      }
    },
    [ad.ad_id, fromCents, lever, onOutcome, pending, rationale, resolvedFromId, slot, toDollars, toId],
  );

  return (
    <form className="console__form" onSubmit={submit}>
      <div className="console__row">
        <span className="console__label">Lever</span>
        {(Object.keys(LEVER_LABELS) as Lever[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={lever === key}
            onClick={() => setLever(key)}
            // No `disabled` here — see refusal 1. The transition table lives in `fold.ts` and the
            // 409 is what says a lever is illegal, with the ad's actual status in the message.
          >
            {LEVER_LABELS[key]}
          </button>
        ))}
        <IllegalHint status={ad.status} lever={lever} />
      </div>

      {lever === 'set_budget' ? (
        <div className="console__row">
          <label className="console__field">
            <span className="console__label">from_cents (precondition)</span>
            <input
              value={fromCents}
              onChange={(e) => setFromCents(e.target.value)}
              inputMode="numeric"
              size={10}
            />
          </label>
          <label className="console__field">
            <span className="console__label">new daily budget ($)</span>
            <input value={toDollars} onChange={(e) => setToDollars(e.target.value)} inputMode="numeric" size={8} />
          </label>
          <span className="console__hint">
            edit <code>from_cents</code> to anything but {ad.daily_budget_cents} and the fold refuses
            it — that is I13, and it is the one guard a single tab can demonstrate
          </span>
        </div>
      ) : null}

      {lever === 'swap_component' ? (
        <div className="console__row">
          <label className="console__field">
            <span className="console__label">slot</span>
            <select
              value={slot}
              onChange={(e) => {
                setSlot(e.target.value === 'headline' ? 'headline' : 'video');
                // Both follow the slot again: the precondition re-primes and the target clears,
                // because a headline id is not a legal `to_id` for the video slot.
                setFromId(null);
                setToId('');
              }}
            >
              <option value="video">video</option>
              <option value="headline">headline</option>
            </select>
          </label>
          <label className="console__field">
            <span className="console__label">from_id (precondition)</span>
            <input value={resolvedFromId} onChange={(e) => setFromId(e.target.value)} size={10} />
          </label>
          <label className="console__field">
            <span className="console__label">to</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— pick a component —</option>
              {candidates.map((c) => (
                <option key={c.component_id} value={c.component_id}>
                  {c.component_id} · {c.payload} · {c.lineage_id} v{c.version}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="console__row">
        <label className="console__field console__field--wide">
          <span className="console__label">rationale (required — brief L95)</span>
          <input
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="why are you pulling this lever?"
          />
        </label>
        <button type="submit" className="console__submit" disabled={pending}>
          {pending ? 'applying…' : `Apply ${LEVER_LABELS[lever]} to ${ad.ad_id}`}
        </button>
      </div>
    </form>
  );
}

/**
 * A HINT, never a `disabled` attribute. It says what the server is going to say, so a reviewer is
 * not surprised — but the button still submits, the 409 still comes back, and the answer still
 * comes from the one place that owns the transition table.
 */
function IllegalHint({ status, lever }: { status: AdStatus; lever: Lever }) {
  const doomed =
    (lever === 'pause' && status !== 'live') ||
    (lever === 'resume' && status !== 'paused') ||
    ((lever === 'set_budget' || lever === 'swap_component') && status !== 'live' && status !== 'paused');
  if (!doomed) return null;
  return (
    <span className="console__hint">
      the fold will refuse this — <code>{status}</code> does not admit <code>{lever}</code>. Submit it
      anyway to see the 409; the rule is <code>fold.ts</code>&rsquo;s, not this form&rsquo;s
    </span>
  );
}

/**
 * What happened, in the server's own words. The 409's `message` is rendered verbatim because it
 * carries the CURRENT value — `set_budget expected from_cents 50000, current is 80000` — which is
 * the whole content of a compare-and-swap rejection and the thing a paraphrase would lose.
 */
function OutcomeBanner({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === 'applied') {
    return (
      <p className="console__outcome console__outcome--applied">
        ✔ applied · decision <code>#{outcome.decision.decision_seq}</code>{' '}
        <code>{outcome.decision.decision_id}</code> at {outcome.decision.ts} by{' '}
        <code>{outcome.decision.actor}</code> · <code>{outcome.ad.ad_id}</code> is now{' '}
        <strong>{outcome.ad.status}</strong>, {dollars(outcome.ad.daily_budget_cents)}/day, video{' '}
        <code>{outcome.ad.video_id}</code>, headline <code>{outcome.ad.headline_id}</code>, generation{' '}
        <code>{outcome.ad.current_generation_id}</code>
        {outcome.replayed ? (
          <>
            {' '}· <strong>replayed</strong> — this <code>decision_id</code> had already been
            applied, so nothing was folded twice (U5)
          </>
        ) : null}
      </p>
    );
  }
  if (outcome.kind === 'unreachable') {
    return (
      <p className="console__outcome console__outcome--refused">
        ✖ no answer from the server: {outcome.message}. The <code>decision_id</code> is{' '}
        <strong>held</strong> — submitting again re-sends the same key, so if the first attempt did
        land it comes back as <code>replayed</code> rather than folding twice.
      </p>
    );
  }
  return (
    <p className="console__outcome console__outcome--refused">
      ✖ refused{outcome.status > 0 ? ` (${outcome.status})` : ''} · <code>{outcome.error}</code>
      {outcome.message === null ? null : <> — {outcome.message}</>}
      <br />
      <span className="console__hint">
        Nothing was written: a refused lever consumes no <code>decision_seq</code>, opens no
        generation and leaves no log row. Nothing is retried automatically — read the current value
        above and decide again.
      </span>
    </p>
  );
}
