# Phase 5 · Implementation session 9 — D65–D67, and the whole of stage 4's Signal surface

**Date:** 2026-09-04 · **Model:** Opus 5 (1M context) · **Chunks:** 43 → 51 of 68
**Commits:** `96e727d` `baf18c2` `912042d` `265b8cf`

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript. Curated at B62 from this session's terminal export,
which is preserved verbatim in git history at `65c45bb`.

The headline: **stage 4 closed in one session — nine chunks, four commits — and the session's two
most valuable moments were both a claim about the app being measured before it was written down.**
One of them produced a decision (D65) that would otherwise have been an unnoticed defect; the other
made Seno widen the review gate mid-stage, which is the process change the rest of the build ran on.

---

## Prompt 1 — session opening (resume from cold)

> Read CLAUDE.md and docs/STATUS.md. Then read only what the next chunk cites —
> DESIGN.md §4.3, D10 and D46 in docs/DECISIONS.md, and src/server/snapshot.ts.
> Do not read anything else to "get oriented".
>
> Phase 5, stage 4. B37 is committed and ticked: 42 of 67 chunks. Tree is clean,
> tsc clean, 86/86 tests pass. […]
> The world has a past (npm run seed writes 7 days, ~1.6M events, ~5m20s), the T0
> seam delivers in-flight conversions live, /api/verify is trustworthy again, and
> the app on :5173 has a portfolio, viewport controls and a working chart. Do not
> rebuild any of that.

### The announcement stopped before the first line — for the third distinct reason

`CLAUDE.md` §5's stop clause has three triggers: a chunk needs a decision, a chunk reveals the
design is wrong, or a chunk wants a dependency. This was none of them exactly. **The announcement
itself surfaced three decisions**, before any code, because writing down what B38 was going to do
required stating what the window *was* — and stating it made it obviously wrong.

**D65 came out of measuring a claim about the app before writing it down.** The plan said the client
renders "the last hour". Checking what that actually meant on a running server found that the window
was resolved **once**, at snapshot time, and never moved: the surface was live for at most one
minute and then showed a window receding into the past while the SSE stream kept delivering rows
outside it, which `store.ts` correctly dropped. Nothing errored. The chart simply stopped growing.

Three options were priced with real numbers rather than argued:

| | Option | Cost, measured |
|---|---|---|
| A | Re-snapshot on a timer | **24 MB** per re-snapshot at 7 days × 12 ads |
| B | Client rolls the window; the unwindowed stream feeds it | free — the rows already arrive |
| C | Server pushes a window advisory | one more frame type, same result as B |

**D66** asked the matching question for the *totals*: if the window moves, who re-divides? Measured:
a `SUM` over the window's buckets is **20 ms**, so the server can answer it on demand and the client
never needs to hold the numerator and denominator of anything. **D67** asked what D20's bar means
per *point* rather than per series, and the deciding measurement was that **no ad's mean hourly
conversions clear 10 anywhere in the seeded week** — so a rung rule stated as "the series clears the
bar" would have drawn nothing, ever, and looked like a bug.

## Prompt 2 — three ratifications, and a store decision folded into them

> #65 C (keep the "anchored at" label, and snap with shared/time.ts's existing
> helpers), #66 C on ?include=totals (carrying as_of_ingest_seq and the resolved
> window), #67 B at >50% of non-empty points with (i) (gated count and reason
> always on screen, dropped ads named) — and yes, copy /tmp/b34.sqlite to
> data/loop.sqlite rather than reseeding, verifying it once afterwards; G11
> approved as announced.

The store copy is worth recording because it is the moment `data/loop.sqlite` became the seven-day
store the rest of the build was verified against. It verified clean immediately afterwards — **and
that was the first time B34a's attribution-prefix fix had been proven on the full seven-day store**,
which had returned 409 before it.

D65's answer is Seno's own option, not one of the three offered: keep the server's resolved window
visible as *"anchored at"* rather than hiding the roll. The reason is the one this build keeps
arriving at — a surface that quietly does the right thing teaches a reviewer nothing, and a surface
that says what it did can be checked.

### B38a, B38, B39, B40 — `baf18c2`

The rolling viewport, ratios at read, D20's gate, and EWMA. Two things worth preserving:

**`B38a` was added as a lettered chunk rather than folded into B38.** D65 created a concern nobody
owned, and putting the rolling viewport inside the ratio chunk would have put two concerns in one
diff. Lettered, not renumbered, because `B39`–`B62` are cited by id across four documents.

**The ratio arithmetic is one implementation with two callers** — the server divides window totals,
the chart divides per point. `metrics.test.ts` includes a grep proving no migration declares a ratio
column, which is the kind of test D43's criterion actually asks for: the wrongness is invisible.

## Prompt 3 — one commit for the group

> ok — commit entire work done all toghether with 1 commit.

## Prompt 4 — the gate widens, mid-stage

> Approved — carry on through the end of stage 4, B41 → B45, in one or two
> batches rather than gates of 3–5. The diffs are small enough that per-group
> review isn't earning its latency; announce the batch in a line, build it,
> report once with a per-chunk verification block at the end.

Run as **3 + 2**, which is still inside D48's five-chunk cap, so nothing needed amending. This is
the second time Seno moved the gate outward on measured evidence rather than on preference — D48
did it after measuring the round-trip cost against the building cost, and this did it after seeing
that a stage of UI chunks was producing small, independent diffs.

### B41, B42, B43 — `912042d`

The maturity indicator, settlement marks on the chart, and the restatement timeline.

**The maturity CDF has one thing about it that is invisible when wrong**, and it is the reason
`maturity.ts` is in the test surface at all: the curve must be measured over **settled cohorts
only**. Measuring over everything biases every quantile short, because a young cohort's conversions
have not arrived yet and the sample reads as though they never will. The line on screen says so —
*"cohorts credited after <t> were excluded as incomplete"* — with the sample size beside it.

Before building B43, all ten of the seeded week's restated buckets were checked to be explained by
exactly one rule, and one of them was confirmed to have a real before/after split. That check is
what made B43's `explained: false` field meaningful rather than decorative.

### B44, B45 — `265b8cf`

The raw tail and the fatigue flag.

**The raw tail is structurally incapable of producing a number**, and that is enforced by the type
system rather than by discipline: amounts and lateness arrive as `Display`, a branded string, so
arithmetic on a tail value does not compile and minting one from a plain string does not either.
Two `@ts-expect-error` tripwires in `tail.test.ts` fail the build if the brand is ever removed.

`B44` also carried the `stream.ts` split that B09 had owed — 273 lines holding two concerns — agreed
with Seno to land with B44's caps rather than as a drive-by.

**The fatigue flag says why a pair is *not* flagged**, which is the more useful half. Its fourth
stated limit is the one that matters: it fires late on low-volume ads *precisely because* the gate
suppresses their points, so the ads most likely to be fatigued are the ones we are slowest to flag.
That is written on the surface, not just in the README.

---

## What this session is evidence of

**A claim about your own app is a measurement you have not taken yet.** D65 exists because
"the client renders the last hour" was written down, then checked, and was false in a way that
produced no error anywhere. D66 and D67 exist because the same check was applied to the two claims
next to it. Three decisions came out of one habit, and none of them would have come out of reading
the code.

**The gate is a cost to be measured, not a principle to be defended.** Seno widened it twice, both
times against evidence about diff size and round-trip latency, and both times kept the parts that
were actually load-bearing — chunk size, per-chunk commits, per-chunk verification. What was removed
was the waiting, which is the only part that was not buying anything.
