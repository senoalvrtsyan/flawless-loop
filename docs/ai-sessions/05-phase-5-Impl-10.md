# Phase 5 · Implementation session 10 — the decision loop, D68–D70, and the cut line coming back

**Date:** 2026-09-04 → 05 · **Model:** Opus 5 (1M context) · **Chunks:** 52 → 57 of 69
**Commits:** `80158a2` `6bea121` `c08606e` `6f36400` `a61982b` `9ecf8bd` `64baeda` `0416786`

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript. Curated at B62 from this session's terminal export,
which is preserved verbatim in git history.

The headline: **stage 5 closed, and the surplus it produced bought back the first item on the cut
line.** The loop now closes in-product — a strategist sees a signal, pulls a lever, and the world
responds — and the two controls that make the *interesting* things demonstrable (the horizon sweep,
the scenario console) landed with it. The session's most useful finding is that a feature can be
built, correct, tested, and have **nothing to show** on the data it ships with.

---

## Prompt 1 — session opening (resume from cold)

> Read CLAUDE.md and docs/STATUS.md. Then read only what the next chunk cites —
> DESIGN.md §7 (the fold) and §2.3, D26 and D51 in docs/DECISIONS.md, and
> src/server/decisions.ts + src/server/fold.ts. Do not read anything else to
> "get oriented".
>
> Phase 5. STAGE 4 IS CLOSED: 51 of 68 chunks. Tree is clean, tsc clean, 139/139
> tests pass. […] THE SIGNAL SURFACE IS BUILT — do not rebuild any of it.

### D68 was recorded before anything was built on it — `80158a2`

The stage-4 → 5 seam owed one named question from D49: *"do we reinstate `SCOPE.md` §4 cut #1,
decision scoring?"* It was answered **conditionally**, which is the shape worth recording: scoring
is reinstated as `B50a` **if stage 5 lands without `CLAUDE.md` §5's stop clause firing**. A
condition on a *process* observation rather than on a schedule estimate, so it could not be argued
into being met.

D68 also recorded a sub-question it deliberately did not answer — *is `w` a symmetric before/after
window, or is it pinned to the decision's own generation boundaries?* — and named it as blocking
`B50a`. That is §3 working: the decision that was ready got ratified, and the one that was not got
written down as unanswered rather than assumed.

### G13 — B46, B47, B48 — `6bea121`

The action console, the decision log, and generation boundaries on the chart.

**The compare-and-swap precondition is a visible, editable field**, and that is the only arrangement
in which the guard is demonstrable. `from_cents` pre-filled with the current value looks like a
formality until you change it and get `409 stale_precondition — set_budget expected from_cents 1,
current is 9000`, with the current value handed back in the message.

**The form is not the authority and does not pretend to be.** It warns that `pause` on a paused ad
will be refused — and submits it anyway, because the transition table lives in `fold.ts` and a copy
of it in the form is a second thing to keep in step. The refusal comes from the fold.

`c08606e` recorded a `BRIEF_GAPS` entry (G06) for something B46 made visible rather than something
B46 changed: the component picker offers the real library, and the library declares four `kind`s
against `Ad`'s two slots.

## Prompt 2 — close the stage

> B49,B50 next. Close the stage 5

Both were single-gated in `BUILD_PLAN.md` §13 and both landed in one commit, `6f36400`, reported per
chunk.

**B49 / P16 — the horizon is a READ parameter, and that was forced rather than chosen.**
`restated_at` is stamped at ingest against the horizon in force *then*; `/api/verify` replays
against the horizon in force *now*. A persisted setting would therefore make verify diverge on a
correct store — the same failure D54 avoided for `orphan_expired`. So the write side keeps
`HORIZON_MS`, `?horizon_h=` moves the read side, and the sweep writes nothing. Measured on a copy of
the seeded week: **72 h → 2 h flips 40,881 buckets, 172 of them restated under the new horizon, in
83 ms**, reading the band on `ix_rollup_time` rather than the table. A no-op sweep reads **zero**
rows.

One asymmetry it forced and handled rather than tolerated: the SSE flush tick serves N subscribers
from one read, so it cannot stamp settlement at whatever horizon a given tab is sweeping. The client
re-derives every row with the **same `bucketState` the server uses** — which is why `settlement.ts`
is deliberately free of `node:sqlite`.

**B50 / P17 — the world can be provoked.** Three of the seven triggers were fired end to end against
a live server and emitter: `late_cascade` moved restated buckets 12 → 17 with timeline entries seven
days back (`conv 0 → 6`, ROAS `0.00 → 119.25`, **168.0 h late**, every entry `explained`);
`orphan_burst` parked six orphans and then promoted all six, moving `credited_minute` 19:59 → 19:57,
which is the two-bucket restatement caused on demand; `stall{20}` held `ingest_seq` still for 12 s
and resumed on its own. `/api/verify` returned 200 and `npm run agree` returned OK after all of it.

**Three seams and no fourth**, written into `scenarios.ts`: a transform of `LiveAd[]`, a λ
multiplier, and direct injection. `traffic_burst` scales the Poisson **mean** rather than the drawn
list, because scaling the list mints duplicate `event_id`s and would demonstrate dedupe instead of
backpressure. `stall` is none of the three: it suppresses the batch and does not buffer.

## Prompt 3 — two ratifications in one sentence

> Take (a) at-most-once as ratified — the emitter's scenario_id idempotence makes
> (b) purely additive if a dropped poll ever bites on camera, so record it with
> that flip condition and move on; and for D68 use the symmetric 6-hour
> before/after window with any second lever inside it flagged as contaminated on
> the log entry, since a stated-and-visible contamination beats two unequal
> windows needing normalisation against a moving valid_to — the brief only asks
> for "a stated before-window vs after-window heuristic".

Two decisions (**D69**, **D70**) out of one sentence, recorded in `9ecf8bd` with the mapping stated
explicitly rather than the rationale restated in each — which is what `CLAUDE.md` §3 asks for when
one sentence ratifies several things.

D69 is worth reading as a template for how a known failure mode gets accepted: at-most-once delivery
means a dropped poll response loses a trigger silently, and that is accepted **because the escape
hatch was priced in the same breath** — the emitter is idempotent by `scenario_id`, so moving to an
emitter ack later is purely additive.

**D70 made `B50a` a scope change**, which made it a README change, which is the coupling
`CLAUDE.md` §10 exists for. There was no README yet, so the whole obligation was `SCOPE.md`: cut #1
moved out of §4 and into §2 as **P18**. The numbering was **not** closed up, because four code
comments cite `SCOPE.md §4 cut #N` and renumbering would silently repoint every one of them at a
different cut. The row stays, struck through.

### B50a — built, correct, and with nothing to show — `64baeda`

**This is the finding that matters, and it is the same shape as F2.** Seven tests pass over
controlled fixtures, including both bias traps. Against the real store:

| horizon | outcome |
|---|---|
| 72 h (D13) | 12 `no_before_window` · 6 `no_evidence` · **6 withheld, "scoring in 2 h"** · 12 of 24 contaminated |
| swept to 2 h | 12 `no_before_window` · 12 `no_evidence` · **0 withheld** — the sweep released all six |

**Zero decisions score, and the reason is structural**: the seeded week's 24 decisions are 12
`create_ad` and 12 `launch`, and both have an empty before-window *by definition* — before `launch`
the ad is `draft`, and a draft ad delivers nothing. The horizon sweep releasing the six withheld
entries is D19's pairing working, and it is the one half of this that is demonstrable on seeded data.

**Two narrowings were flagged rather than inherited**, so they would be ratified or corrected rather
than discovered later: `create_ad` was excluded from the contaminating set (including it marked 24
of 24 entries contaminated, which is a flag nobody reads), and the metric rule — CPA where both
windows carry conversions, CTR otherwise — is D19's *recommendation*, never ratified, and the entry
on screen says so.

And the session closed by naming the next decision rather than taking it: **the 6 h window is fixed,
so a lever pulled during a demo cannot be scored for six hours no matter what the horizon is.** That
is verbatim the situation F2 named for the horizon, and F2's answer was to make shortening it a
build item. It became D71 in the following session.

---

## What this session is evidence of

**"It works" and "it demonstrates anything" are different claims, and only the second one matters
here.** `B50a` passes every test it has and shows nothing on the data it ships with, for a reason
that is a property of the seeded world rather than a bug. Finding that out required running it
against the real store instead of the fixtures — and the honest response was to write the finding
into `STATUS.md` and the README's limits, not to tune the seed until the feature looked good.

**A condition on a process observation is a decision that cannot be argued into being met.** D68
reinstated scoring *if the stop clause did not fire*. It did not, so scoring was due, and nobody had
to relitigate whether there was time.
