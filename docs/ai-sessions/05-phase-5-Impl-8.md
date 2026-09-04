# Phase 5 · Implementation session 8 — B34a, B35, B35a, the B36 gate, B36, B37

**Date:** 2026-09-04 · **Model:** Opus 5 (1M context) · **Chunks:** 37 → 42 of 67
**Commits:** `831c098` `495b848` `e989336` `58a30fc` `c6b313f` `6055298` `137081e` `bbed0c4` `2f33d59`

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript. The three decisions this session produced (D63, D64,
and the D49 amendment) plus the two it un-deferred (D44, D45) are in `docs/DECISIONS.md` with their
full option analysis; what is preserved here is *how they came up*.

The headline: **stage 3 closed, the B36 gate cleared, and stage 4 started — and the session's two
most valuable moments were both cases of a claim being tested rather than trusted.** One was a
latent defect from B22 that only a seeded store could expose; the other was Seno correcting the
rationale of a recommendation he was accepting.

---

## Prompt 1 — session opening (resume from cold)

> Read CLAUDE.md and docs/STATUS.md. Then read only what the next chunk cites —
> src/server/verify.ts, src/server/attribute.ts and the prefix comment in
> src/server/replay.ts. Do not read anything else to "get oriented".
>
> Phase 5, stage 3. B34 is committed and ticked: 37 of 65 chunks. Tree is clean,
> tsc clean, 76/76 tests pass. Stage 3 has ONE chunk left, B35.
>
> THE WORLD NOW HAS A PAST. `npm run seed` writes seven days — ~1.6M events, ~5m20s.
> […]
> NEXT IS NOT B35. `/api/verify` returns 409 on a correct store and that has to be
> fixed first, because B35's T0 seam check leans on verify being trustworthy.
> […]
> That fix is not a numbered chunk yet. Propose it as B34a with a scope line and
> wait for me before writing it — a plan edit is my call.

### B34a — and an argument about evidence

The fix itself was small: `resolveAttribution()` read the whole `signals` table with no upper bound
on `ingest_seq`, so `/api/verify`'s rebuild resolved every conversion against clicks that had not
yet arrived. Latent in **B22** since it shipped, unobservable until B34 seeded a store that held a
promoted orphan.

Two things worth recording.

**First, the proposal disagreed with the prompt.** Seno's caveat said the bound *must* be optional
and default to unbounded, "or the live path changes behaviour". The proposal argued option **A** —
always bound, at `signal.ingest_seq`, no parameter and no default — on the ground that `apply()`
runs inside the transaction that allocated that seq, so the bound excludes nothing live. Seno took
A. The entry records why: an optional bound puts two behaviours inside the one function D55 exists
to make single, and "the rebuild is the write path" is the only arrangement in which *"and they
agree"* says anything.

**Second, the proposal's evidence claim was wrong and had to be retracted.** It said verify
returning 200 afterwards *would be* the measurement that the bound was a live no-op. It is not: the
store that returns 200 was written by the post-fix writer, so it can only show the bounded writer
agrees with the bounded rebuild. The real evidence is the 76 pre-existing tests passing unmodified —
`conversion.test.ts` and `restate.test.ts` assert exact `resolved_at` values through the live path.
The retraction is in the B34a report and in the commit.

**The defect was reproduced before and after on the same store**, which is what makes the fix a
measurement rather than a hope: a 1-day scratch seed (360,740 signals, 49 conversions promoted by a
later-arriving click) went **409 → 200**, with the pre-fix divergence naming
`conversion_attribution.resolved_at`, live `20:02:45.642` against rebuilt `20:02:07.905`.

---

## Prompt 2 — B35

> approved as B34a, go with A

then, after the report:

> ok, commit and tick it and then move to B35

### What B35 found

The plan row described B35 as the `T0` handover seam plus "progress printing during the seed". The
progress printing was already done at B34. What was **not** done, and what no chunk owned, was that
**the live emitter emitted no conversions at all**. B29 built the lag and emits nothing by design;
B31a built `pending_backfill_clicks` and nothing consumed it; B34 dropped every conversion arriving
after `T0` on the promise the emitter would re-derive it. The seam had nothing to arrive through.

The build is one `conversionFor()` serving both populations — the live clicks the process emitted
and the backfilled clicks `T0` handed over — because §15.3(b)'s promise is that a click's whole
future is re-derivable from its `click_id`, and two implementations of that promise is precisely how
the two sides of the seam come to disagree with every number still plausible. A handed-over click
carries `{click_id, ad_id, ts}` and nothing else, so the tick and the click's index are **decoded
from the `ts`** — which is what lets it mint the same `event_id` the generator would have.

**The stop clause fired for the sixth time, mid-build.** `dueBackfillConversions()` needed to know
which ads to look up, and that is the question of whether a paused ad's already-earned conversion
still arrives. `SIMULATOR.md` §3's pause convention is a rule about **λ**, and a conversion is not
drawn from λ. It was implemented as a labelled `ASSUMPTION (unratified)` and put to Seno as a
decision rather than absorbed.

Measured: five conversions arrived live, every one on a `source='backfill'` click and every one
crediting a minute before `T0`, the oldest **19.5 hours late**. A restart's catch-up re-emitted 412
events as **400 `duplicate_identical` / 0 `duplicate_conflicting`**.

---

## Prompt 3 — D63

> A — record D63 then commit B35

**D63: it arrives.** The reasoning of record is that *"the lever stops new delivery, and money
already earned still settles"* is the more defensible sentence for a slice judged on event
modelling — and it is the one that lets `a_12` carry **HR3 and HR4 at once** instead of forcing them
onto different ads. Option B's appeal was demo legibility, which is a narration problem.

The consequence is written into the code and into `DEMO.md`: §1's *"a paused ad's arrival count
reads zero"* self-check is **per kind**, never per ad, or it reports a false failure on exactly the
pause demo.

---

## Prompt 4 — the B36 gate, and a finding from outside the session

> put D44 and D45 in front of me. and drop cheatsheet.

then:

> D44 — A (uPlot), with the §5 dependency sign-off: exact pinned version, single import site in the
> descriptor-bearing wrapper, and D8's flip condition written into the entry. Lead the rationale
> with the 4 Hz setData cost and B53's cursor callback, not the point count — 7 days × 12 series is
> ~2,016 points at the descriptor's hour granularity, and the volume argument only bites in the
> single-ad minute-granularity case where B's downsampling collides with D30.
>
> D45 — A (one plain stylesheet, semantic custom properties). Two constraints in the entry:
> settlement state carries a non-colour channel as well as colour, and there is one theme only.
> D49 — hold intact, re-decide at the stage-4 → 5 seam, and frame that seam as "do we reinstate cut
> #1 (decision scoring)" rather than hold/spend.
> Item 4 — yes, docs/DEMO.md per D50, as proposed.
> One addition, ahead of the B36 group: F1 from the B31a review is now live post-B34 and I want it
> closed before stage 4 renders anything. pending_backfill_clicks is unbounded in the 1 Hz poll —
> measured 1.96 MiB and ~62 ms per call against a representative seeded store, 99.8% of the
> payload, ~7% of the event loop that also owns ingest and the 250 ms flush, and D62 means the
> emitter discards ~25 of every 26 rows. §15.3(b) makes it a boot-time handover, not a per-tick
> fact; split it onto its own endpoint or behind ?include=pending. Take it out of the stage-4 slack.

**This is the most instructive prompt in the session, for three separate reasons.**

**1. Seno accepted a recommendation and rejected its argument.** The presented case for uPlot led
with point count. He corrected it: at the descriptor's hour granularity a 7-day window over twelve
series is ~2,016 points, which any library draws. The costs that actually decide it are the **4 Hz
`setData`** — the 250 ms flush tick means a redraw four times a second for as long as the demo is
open — and **B53's cursor callback**, which is the one API D34's descriptor cannot do without. The
D44 entry leads with those and marks the point-count argument as the wrong reason, in place.

**2. A cross-check found a reference collision.** "Cut #1" is `SCOPE.md` §4's list (decision
scoring), **not** `BUILD_PLAN.md` §12's (generation boundary markers). The two lists run in opposite
directions — §12 spending *narrows* the deliverable, `SCOPE.md` §4 spending *widens* it — so the D49
amendment records both side by side and names which one the seam question means. Separately, "F1
from the B31a review" has no register in this repo and `DECISIONS.md` already has an F1, so the
finding was recorded as **B35a** rather than under a colliding id. Both were surfaced rather than
guessed at.

**3. The finding was real and the fix was larger than the fix.** `?include=pending`, typed
`[] | null` so *not requested* and *none pending* cannot be confused — collapsing them would let an
emitter that forgot to ask deliver no handed-over conversions at all, silently. Measured on the
1-day scratch store: poll payload **571,432 → 5,716 bytes**, `simWorld()` **33.2 → 17.3 ms**. The
part that was not anticipated: because the emitter now *drains* a held list instead of re-polling
one, D62's Bernoulli rejects the never-converting clicks **once** rather than every tick, and the
per-tick list drops from **7,161 rows to 149** on the first tick.

**`CHEATSHEET.md` was dropped** in the same pass. It had fallen fifteen decisions behind, and a
stale revise-from sheet in a repo that is going to be read is worse than none. `DECISIONS.md`'s
index table is the replacement and cannot go stale, because it is written in the pass that ratifies.

---

## Prompts 5–7 — stage 4 begins

> ok, commit it and start B36

> ok, don't split it — commit and start B37

> ok, keep the zero-fill — commit […]

**B36 found the plan row one file short.** `DESIGN.md` §3.1 specifies the snapshot returning
`{ ads[], … }` — *"one request, one read transaction, consistent by construction"* — and no chunk
had added it, while B36's file list was client-only. A portfolio read separately could show an ad as
`live` beside buckets taken from after it was paused. The row was extended and the reason recorded.

B36 ran **208 insertions against §5's ~150 target** and said so before committing rather than after;
Seno declined the split.

**B37 caught a bug by reading rather than running.** The chart's series-identity key was
`labels.join(' ')` / `split(' ')`, and ad names contain spaces — `Product demo · retargeting` would
have become four unnamed series. It is now the ad **ids**, because identity is which ads, not what
they are called. It is in `BUILD_PLAN.md` §14 with three more.

**B37's arithmetic was split out of the component on D43's criterion**, not on a style preference:
*"tests only where a wrong answer is invisible"*, and a mis-summed hour draws a completely normal
chart. Eight tests on `toColumns()`.

**The plan's own verification was run three ways**, and the third is the one that matters: `a_03`'s
six consecutive hours read 794 / 916 / 804 / 1136 / 1660 / 1129 through the chart, identically from
`SUM(impressions)` over `rollup_minute`, and identically again from `COUNT(*)` over **raw
`signals`** — a route that never touches the projection. That is HR2 and HR5 in one measurement
rather than the display path being checked against itself.

**D64** came from flagging rather than deciding: a sparse `rollup_minute` makes an absent minute
ambiguous, and the two readings draw differently at exactly the moment the pause lever is meant to
be seen working. Zero inside the ad's life, `null` before `launched_at`.

---

## What this session is evidence of

1. **A defect can be latent for twelve chunks and still be found by data rather than by review.**
   B34a's bug shipped at B22, passed every test, and became observable only when a store first
   contained a promoted orphan. What found it was seeding a week of history and then *checking a
   claim the store made about itself*.
2. **Retracting an argument you made two messages ago.** The B34a proposal's evidence claim was
   wrong; the report said so in a sentence and named the evidence that actually held, rather than
   quietly substituting it.
3. **Accepting a decision while correcting its reasoning.** D44's entry leads with the 4 Hz redraw
   and the cursor callback, and records that the point-count argument — the one that looks most
   obvious — was the wrong reason to reach for canvas.
4. **The stop clause fired a sixth time and was right again.** D63 was a one-line difference in
   which map to read, and it decides what the pause demo looks like.
5. **A performance finding that got better under inspection.** B35a was asked for as a payload cut;
   the drain that came with it removed ~7,000 keyed draws per tick that nobody had counted.
