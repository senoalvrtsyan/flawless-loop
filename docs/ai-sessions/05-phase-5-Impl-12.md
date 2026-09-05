# Phase 5 · Implementation session 12 — stage 7, packaging, and the first time anyone clicked it

**Date:** 2026-09-05 · **Model:** Opus 5 (1M context) · **Chunks:** 64 → 69 of 69
**Commits:** `ef8d8c8` `7f4ce34` `c2bfd83` `1f5842f` `a6f13f8` and this one

Written as a process artifact per the brief (L153). It records the **prompts, the decisions and the
turning points** — not a keystroke transcript. This is the last implementation session: the plan is
complete.

The headline: **stage 7 closed in one batch of six — one command to run it, a README in three
parts, the demo script's final ordered pass, and this capture.** The session produced no new
decisions. It produced five corrections, and **every one of them came from doing the thing rather
than describing it**: four from following the demo script in a real browser, and one from running
`npm start` on an empty store and watching four minutes of silence.

---

## Prompt 1 — session opening (resume from cold), and "stage 7 in 1 batch"

> Read CLAUDE.md and docs/STATUS.md. Then read only what stage 7 cites — BUILD_PLAN.md §10
> (B57–B62) and §14's trap list, SCOPE.md §2–§4 (README-verbatim), DESIGN.md §1, §3, §4,
> §6 and §12, and BRIEF_GAPS.md's Extensions section. […]
>
> THE WHOLE APP IS BUILT — do not rebuild any of it. […]
> data/loop.sqlite IS THE SEVEN-DAY STORE. DO NOT RESEED — 5m20s and 750 MB. Read it.
> Use a scratch DB_PATH for anything that writes. […]
>
> THE BROWSER. Everything in stages 4, 5 and 6 was verified headlessly against the real
> store through the shipped client modules. NOBODY HAS CLICKED ANY OF IT.
>
> stage 7 in 1 batch

Six chunks, none single-gated. The stop clause did not fire — no chunk needed a decision, none
revealed the design wrong, none wanted a dependency.

### B57 — one command · `ef8d8c8`

`npm start`: migrate, seed **if and only if** the store is empty, hand off to `dev.mjs`, print the
URL when the port is actually listening.

Two properties, and the second is the one that was found rather than designed:

**It never reseeds a non-empty store.** The test is `SELECT COUNT(*) FROM ads`, which is *the same
test `seedWorld()` refuses on*, so the two cannot drift into disagreeing about what "empty" means.

**It prints progress, because four minutes of silence reads as a hang.** The seed measures 5m20s and
its 249-second *generate* phase writes nothing to stdout at all — the existing progress bar covers
only the 70-second write. Running it end to end on an empty scratch store made that obvious in a way
the code did not: three heartbeats fired during the silent phase, and without them the reviewer's
next move is Ctrl-C. So stdout is piped rather than inherited and a heartbeat fires after 15 s of
quiet.

`start.mjs` does preflight only and spawns `dev.mjs` rather than re-implementing the three-process
supervisor, so there is one supervisor rather than two that can disagree about what a clean exit
means. That surfaced one cosmetic defect immediately: under `npm start` the runner is a *child*, so
a terminal Ctrl-C reaches it twice and one shutdown printed as two. Guarded.

### B58, B59, B60 — the README, one drafting pass, three commits

Treated as one drafting pass because the three parts must not contradict each other, then committed
separately.

**B58 · `7f4ce34`** — the three-way split, the persistence boundary, the aggregation strategy, and
`SCOPE.md` §2–§4 **verbatim** between markers. The verbatim block is now checked by a test
(`src/shared/docs.test.ts`) rather than diffed once: a drifted block is invisible when wrong, which
is exactly D43's criterion, and the failure names the first line that differs. Confirmed to trip on
one injected word.

**B59 · `c2bfd83`** — `DESIGN.md` §6's misbehaviour table verbatim, the named limits, and the
extensions register **assembled from** `BRIEF_GAPS.md` rather than rewritten.

The named limits were the real work. They were scattered across nine documents — D69's at-most-once
triggers, B51's per-process descriptor key, B53's 400/200 caps, D71's sixteen-minute floor, B35's
in-flight conversion, B05's `payload_json` re-serialisation, plus everything `SCOPE.md` §3 sends to
"the README's named-limits section". Gathered into 28 rows in four groups: what the model cannot
represent, what is deliberately not built, limits of the numbers on screen, and operational limits.

**B60 · `1f5842f`** — the life of one event, with real ids **captured from the running app**, not
hand-written. `c4804d05ed499439` is a live conversion that arrived 147.4 h after the minute it
belongs to and reopened a bucket 3.14 days past settling. Every id in the trace resolves: the click
`3c82297378ead37e`, its `click_id` `1d377b1cf2b164c9`, `delivery_seq` 1601622, `ingest_seq` 1586705,
generation `g_a_01_002`.

Step 8 is the one worth having written down: **rewind `as_of_ingest_seq` by one** and the same minute
recomputes to `conversions 0 · value 0 · ROAS 0`, against `conversions 1 · value 17,989¢ · ROAS
61.187×` at 1586705. The restatement, proved in two calls.

**One claim in the draft was wrong and the arithmetic caught it.** The `v_04`/`v_05` comparison
first read *"roughly the same conversion rate per click at a much better click rate"*. Computed from
the printed rows: `v_04` CTR 1.09% / CVR 12.3%, `v_05` CTR 0.63% / CVR 15.7% — the recut clicks
*worse* and converts *better*. Corrected, and the confound stated with it (different ads, different
audiences, different lifetimes, and D35's fatigue keyed to the pair), because a component-level
number presented without its limits is the thing the brief's non-goals section warns about.

B60 also closed `BRIEF_GAPS` **§H4** — `DESIGN.md` §10.1's metric union said `spend_cents` where the
code signs `spend`. B60 was the chunk that opened §10, so B60 made the correction, and the note says
why the code's name won: `spend` is a *displayed metric*, not a column, and the string is inside the
**signed** bytes.

### B61 — the demo script, followed cold in a browser · `a6f13f8`

**This is the chunk the session existed for.** Everything in stages 4, 5 and 6 had been verified
headlessly through the shipped client modules and the real endpoints. Nobody had clicked any of it.

Driven through Chrome over the DevTools protocol — Node 24 has a built-in `WebSocket`, so no
dependency was needed — against a **scratch copy** of the seven-day store, per the session's own
instruction that anything which writes uses a scratch `DB_PATH`.

What ran: the page loads (7,000 px, no error nodes); the 7d chart with its three vertical rule kinds
and eight ▼ generation markers; the drill-down with its counts table, slice chips and 400-row
evidence list; the `as_of` rewind; the eight-step trace on a real id; the component library's nested
version lists; the fatigue table; the action console; the scenario console; the refresh test; the
restart test.

**The loop closed in a browser for the first time.** Pause `a_12` through the console → `✔ applied ·
decision #33 … a_12 is now paused … generation g_a_12_008` → **0 signals for `a_12` across four
consecutive 15-second windows** while `a_01` and `a_08` kept emitting. Fire `late_cascade` → trigger
written, picked up by the simulator 0.88 s later, **restated buckets 14 → 24**.

**Four corrections came out of following it**, and each is marked in the file:

1. **`/api/verify` and `npm run agree` are 11.5 s and 4.0 s, not instants.** Both clean while the
   emitter runs. Run them before the audience arrives and quote the numbers.
2. **Clicking ROAS on the default view reads `NOT_COMPARABLE`, not `MATCH`.** The descriptor is
   signed at the snapshot's `as_of_ingest_seq`; by the time the recomputation lands, more events
   have arrived in the window, so the rollup reflects a later log position. With twelve ads emitting,
   seven events land inside a seven-second read and pressing *now* races again. **One ad, or a
   window that has ended, reads `MATCH`** — both measured. This is B54's `NOT_COMPARABLE` doing
   exactly its job, and it needed a sentence in the script and a row in the README's limits.
3. **The drill-down is seconds.** 0.6–1.4 s for one ad over six hours, 6.5 s for all twelve, 7–10 s
   in the browser on a live 24 h window. The README had quoted the single-ad number as though it
   covered the case a reviewer will actually click.
4. **The console re-selects the legal lever after one lands.** Pause an ad and the selection moves
   to `Resume` — the right affordance, and a trap: a second Apply without looking applies the *other*
   lever. Read the Apply button's own label.

**Beat 8 is written**: kill everything, restart, and the catch-up re-derives 150 events of which
**104 land as `duplicate_identical`** — which is the point rather than a wart. Restart safety is not
a feature that was built; it is what keyed ids give for free, and the duplicate counter is the proof
it is really happening.

### B62 — this file, and the final `STATUS.md`

Sessions 9, 10 and 11 were raw terminal exports rather than curated captures. All three are now
captures in the convention `-Impl-8.md` set; the raw exports remain in git history at `65c45bb` and
`6573384`.

---

## What this session is evidence of

**Packaging is not transcription.** Five corrections came out of six chunks, and none of them came
from reading code. The seed's silent phase was found by running it; the drill-down's timing and its
verdict on a live window were found by clicking it; the `v_04`/`v_05` claim was found by doing the
division. A README assembled from the design documents would have been internally consistent and
wrong in all five places.

**The last honest thing a build can do is state what it does not do.** The README's largest section
is its limits — 28 of them, including the one failure the model cannot see at all (emitter-side
loss, which has no sequence number to detect it and which we declined to invent one for). The brief
asked for misbehaviours to be *named as tolerated or breaking* rather than discovered. That
instruction turned out to describe the whole document.
