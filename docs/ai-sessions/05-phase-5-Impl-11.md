# Phase 5 · Implementation session 11 — the traceability spine, the Workbench screen, and D71

**Date:** 2026-09-05 · **Model:** Opus 5 (1M context) · **Chunks:** 58 → 63 of 69
**Commits:** `4d82533` `e64320b` `272c612` `aff7ed9` `6a8ae2c` `0ade88d` `aa1bebb` `6198b73`
`7aa40d1` `9cba30f`

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript. Curated at B62 from this session's terminal export,
which is preserved verbatim in git history at `6573384`.

The headline: **stage 6 closed in one batch of six, and hard requirement #5 stopped being a claim.**
Every performance number on the page now carries a signed descriptor naming the query that produced
it, clicking one re-derives it from raw events through a different function and puts the verdict on
screen, and `trace <event_id>` renders one event's whole life table by table. The session's most
valuable moment was a control that, when actually used, showed the surface built to prove agreement
**crying wolf on a correct store**.

---

## Prompt 1 — session opening (resume from cold), and "stage 6 in 1 batch"

> Read CLAUDE.md and docs/STATUS.md. Then read only what stage 6 cites — DESIGN.md
> §10 (all four subsections) and §11, D34 / D43 / D46 / D55 in docs/DECISIONS.md,
> and src/web/series.ts + src/server/snapshot.ts + src/shared/wire.ts. […]
>
> Phase 5. STAGES 0-5 ARE CLOSED: 57 of 69 chunks. […]
> THE SIGNAL SURFACE AND THE DECISION LOOP ARE BUILT — do not rebuild any of them.

Six chunks in one batch, at Seno's instruction — **one past D48's five-chunk cap**, and inside the
same stage. Six commits, one per chunk. **The stop clause did not fire**: no decision was needed, no
chunk revealed the design wrong, nothing wanted a dependency. `node:crypto` is a built-in — the same
family as D8's `node:sqlite` — so it was *named* in the announcement rather than asked as a §3
decision.

### B51 — the descriptor · `4d82533`

Every metric the server sends carries §10.1's `TraceDescriptor`: metric, ads, window, grain,
placement rule, log position, HMAC. Eight per totals row, thirteen rows — **104 signatures per read,
with no measurable cost.** `Signature` is a branded string with exactly one producer, and that
producer is server-side.

**`JSON.stringify` must never be the signed bytes.** Object serialisation follows insertion order,
so two descriptors with identical fields built by two different code paths hash differently and one
of them fails to verify — *intermittently*, depending on which path built it, with nothing erroring
at the point of the mistake.

B51 also found `BRIEF_GAPS` **§H4**: `DESIGN.md` §10.1's metric union says `spend_cents` where the
code signs `spend`. Registered rather than fixed as a drive-by; the document was corrected at B60,
the chunk that next opened §10.

### B52 — the quarantine becomes a compile error · `e64320b`

Every performance number on the page renders through `<Metric>`, whose props **require** a
descriptor. A tail-summed number has no third argument that typechecks; a cast compiles and is the
line a reviewer greps for, which is D34's own standard rather than a new one.

`formatMetric` widened from `MetricKey` to `TraceMetric` for a specific reason: `conversions` has no
chart control but *is* a performance number, and a hand-formatted cell beside the table would have
been the ungated second route the whole mechanism exists to prevent.

### B53 — the drill-down, and it disagrees when it should · `272c612`

`POST /api/trace` verifies the HMAC, reads the number back from `rollup_minute`, recomputes it from
raw `signals` with `replay()`, and puts the verdict on screen. `a_03` over six hours: **MATCH**,
10.20× both sides, all eight counts identical, 10,481 raw rows.

Three findings, all from measuring:

**Comparing only the displayed metric lets a real divergence through.** A ratio can agree while its
terms do not — 2/4 and 3/6 are both 0.5. Adding 7 impressions to one rollup row by hand reads
**MISMATCH on the counts with ROAS unmoved**. So the counts are compared *exactly*; only the ratio
gets a tolerance, and it needs one, because IEEE-754 addition is not associative and the two paths
sum in different orders.

**An evidence list in log order shows none of the interesting rows.** The first 400 of `a_03`'s
10,481 contributors over six hours were **all impressions** — not one conversion made the cap, so a
ROAS sat above a list containing nothing that had earned any revenue. Every number correct, the
evidence worthless. Conversions fill the sample first now.

**`replay()` inside `trace()` deadlocks the transaction, not the store.** `readTx` does not nest, so
calling `replay()` from inside a read transaction throws loudly — which is the *good* case. The bad
case is the fix that reads as tidier: dropping `trace()`'s own transaction so `replay()` can keep
its. Then the rollup read and the raw re-derivation see two instants, and a conversion landing
between them reads as a divergence. `replayIn()` exists for exactly this.

### B54 — the rewind, and the defect it exposed · `aff7ed9`

`a_01`'s 20:01 minute reads 0 conversions at ingest_seq 1587167, 3 at 1587170, 6 at 1587173 — and
the difference between the last two is **exactly three named `event_id`s** whose `value_cents` sum
to 13,752 = 47,701 − 33,949.

**Running it showed the verdict reading MISMATCH on a correct store.** The recomputation answers a
log *prefix*; `rollup_minute` is the fold of everything applied to it and has no `as_of`. So the one
screen built to prove agreement would have cried wolf every time a reviewer used its other control —
and the number it printed would have been *correct*, which is what makes that failure convincing.
`NOT_COMPARABLE` now covers it, tested exactly against `MAX(max_ingest_seq)`: at exactly 1587173 the
verdict returns to MATCH, so the boundary is right rather than merely conservative.

**This was found by using the feature, not by reading the code.** It is the single strongest
argument in the build for clicking a thing you have already tested.

### B55 — one event, end to end · `6a8ae2c`

§10.4's eight steps as a screen you paste an id into, each step naming its table. Verified on five
shapes: a 168 h late cascade conversion (credited to its click's minute under `g_a_01_002`, bucket
restated 6×), a duplicate (two deliveries, one canonical row), a rejected delivery (no `signals` row,
and the trace says so), an orphan (held at its own minute, excluded from CPA/ROAS), and a
clock-skewed event rendering as *"30 s EARLY (clamped, I10)"*. Step 6 is the only step with no table
behind it, and the screen says why rather than inventing one.

### B56 — the Workbench screen · `0ade88d`

§8's reverse join, computed by scanning `ads`. On the seeded store: *"Product demo, 30s — recut,
tighter open · 2 versions, live in 3 ads"*, v1 in `a_01` and `a_12`, v2 in `a_05` — §8's own example,
from the store rather than from the document. **Pause `a_01` and it reads live 2 / paused 1**, v1
splitting into live=1 paused=1; resume and it returns. `/api/verify` 200 after both.

### One implementation reading, flagged rather than inherited

**`POST /api/trace` narrows and rewinds by RE-SIGNING, never by mutating.** The client never holds a
descriptor the server did not issue, which is D34's whole mechanism, and it means the response's
descriptor is itself clickable without a second protocol. The alternative — signing a descriptor per
chart point — is 1,440 signatures per series and was rejected on cost, not on principle.

### A third finding, about the environment rather than the code

**A stale server kept the port while a "new" one failed to bind**, so old descriptors kept verifying
and the per-process key looked broken-in-the-safe-direction. Confirmed properly afterwards: a
descriptor issued before a restart reads `invalid_signature`, with the cause and the fix in the
message. This became a named limit in the README and a step in the demo script.

## Prompt 2 — D71, ratified before any code

> D71 — B. Add ?window_h= beside ?horizon_h=, D70's 6 h staying the default and
> the documented figure, with the caption naming the window each score was
> answered at. The precedent and the argument are already ratified for the
> horizon, and it's the only option that makes a lever pulled on camera scoreable.

Recorded first, in its own commit (`6198b73`), then built (`7aa40d1`). It is an amendment to `B50a`,
not a new plan row, so the chunk count stayed 63 / 69.

**Verifying D71 against the real store exposed a defect in B50a's own wording.** `no_evidence` said
*"neither window has enough delivery for a CTR"* where `pause a_12` has **3,001 impressions before
and 0 after** — inviting a reader to diagnose under-delivery *before* the lever, when the
before-window had a perfectly good CTR. It now names which window is missing.

Two traps the tests found, both worth preserving because both pass silently in the wrong shape:
**a test whose "lift" is in the wrong metric compares two zeros** (the first D71 test lifted clicks,
but with conversions on both sides the metric is CPA), and **comparing two windows' `delta_pct` by
sign is the per-metric direction bug in a new costume** (CPA improves when it falls, so a bigger
improvement is a bigger *negative* delta).

## Prompt 3 — "stcuk again ?"

> stcuk again ?

It was not stuck; it was deliberately waiting. D71's one claim that cannot be proved with a unit
test is *"a lever pulled on camera becomes scoreable"*, and at the 15-minute floor that claim takes
sixteen minutes of wall clock to demonstrate. A background run had been started with the docs being
written meanwhile.

**The demonstration, `9cba30f`** — server and emitter on a scratch store, two `set_budget` levers on
`a_03`:

| decision | at ±15 min, 1 min horizon | at D70's ±6 h |
|---|---|---|
| `d71_live_score` (03:53:10) | released at 04:09 — `no_evidence`, *"the before-window has no CTR to compare"* | `settling`, ready in **6 h** |
| `d71_live_score_2` (04:09:59) | **SCORED at 04:25** — `▼ worse · CTR 2.76% → 1.63% (−41.1%)` | `settling`, ready in **6 h** |

**Sixteen minutes from lever to number, against six hours.** Both rows read `settling` at the
ratified window at the same instant, and the horizon was already one minute in **both** columns — so
**only the window released it.** That is the contrast the two-knob caption exists to make legible,
and it is the reason D71 is a demonstration rather than a parameter.

---

## What this session is evidence of

**Use the control you just built.** B54's `NOT_COMPARABLE` exists because someone typed a number
into the rewind box and read the answer. Every test passed before and after; the defect was that the
screen would have accused a correct store of disagreeing with itself, in front of the one audience
the screen exists for.

**A claim about wall-clock time has to be paid in wall-clock time.** D71's whole justification is
that a lever pulled on camera can be scored inside a demo. That cannot be unit-tested, so the
session spent sixteen real minutes proving it, with the docs written in the gap. The alternative —
asserting it from the arithmetic — would have been the thing this build has spent seventy-one
decisions avoiding.
