# DEMO_SCRIPT.md — the fifteen-minute walkthrough

**This is a subset.** [`docs/DEMO.md`](DEMO.md) is the full script — eight beats, 20–25 minutes, and
it is the one that was **followed cold in a real browser** at `B61`, which is where its four ⚑
corrections came from. Where the two disagree, **`DEMO.md` is the one that was tested and it wins**
(**D72**). This file exists because fifteen minutes is a different talk from twenty-five: it drops
three sections rather than compressing eight, and it says which three.

**Dropped, and why.** *The decision score* (`B50a`) — the fastest possible on-camera score is the
window plus the horizon, about **sixteen minutes** at the 15-minute floor, so it cannot be earned
inside this run; describe it, do not attempt it. *The component screen* (`B56`) — it is a read-only
surface and beat 4 already draws the swap's generation boundary on the chart. *Three of the five
scenarios* — `orphan_burst`, `stall` and `duplicate_storm` are in `DEMO.md` and are the first things
to add back if you get a long slot.

**Numbers below are what the cold run produced.** Yours will differ — the world keeps running. Quote
your own, or quote these and say they were measured at `B61`.

---

## 0 — Before anyone is watching

```
node -v                 # 24+ — node:sqlite is unflagged there (D8)
npm i
npm start               # migrate · seed IF empty · server :8787 · simulator · Vite :5173
```

**Seed once, well in advance.** The first run takes **~5m20s** and writes ~750 MB; a second
`npm start` never reseeds and comes up in about a second (`12 ads already exist — not seeding`).

**Use a seven-day store.** A 1-day store cannot produce the restatement moment — it takes seven days
for a handed-over conversion to land in an already-*settled* bucket.

Run these **before**, not on camera, and quote the numbers:

```
curl -s localhost:8787/api/health
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/api/verify   # 200 — takes ~11.5 s
npm run agree                                                       # OK  — takes ~4.0 s
```

**One server per store**, and check the ports are free before restarting. Open
**http://localhost:5173**.

**Four things that look like faults and are not** — the full list is in `DEMO.md`:
a drill-down takes **1.5 s for one ad and 7 s for twelve** (it re-derives from raw over the whole
log prefix, so narrow to one ad before clicking) · a window containing `now` correctly answers
**`NOT_COMPARABLE`**, so click an older minute slice for the `MATCH` · the restart's duplicate line
needs a restart **inside 60 s** (D61) · never call a generation marker misplaced on camera, they
have measured correct every time.

---

## The fifteen minutes

| | Beat | Time | The moment |
|---|---|---|---|
| 1 | The world has a past | 0:00–1:30 | Seven days on screen, and none of it is fixture data |
| 2 | Read a signal — and the fatigue collapse | 1:30–4:00 | `a_01` has died over a week; then **cause it live** |
| 3 | The gate refuses to draw a ratio | 4:00–5:00 | The chart declines to answer, and says why |
| 4 | Pull a lever, the world responds | 5:00–7:30 | Pause `a_12`; its events stop within a second |
| — | **Invite the refresh** | 7:30–8:00 | **Hand them the keyboard** |
| 5 | A late conversion restates a settled bucket | 8:00–10:30 | `late_cascade` — the flagship path, on demand |
| 6 | Walk a number back to its events | 10:30–13:30 | Number → raw events → verdict → one event end to end |
| 8 | Kill everything and restart | 13:30–15:00 | The strong version of the refresh test |

---

### Beat 1 — the world has a past · 0:00–1:30

**Say:** *"Twelve ads that have been running for a week. Nothing here is fixture data — every row is
the fold over a decision log, and every point on that chart is a sum over 1.59 million stored
events."*

1. The app opens on a populated portfolio, not an empty chart. Window `7d`.
2. Point at the ad table: status, budget, both component slots — **all of it from the `ads`
   projection**, which exists only because `applyDecision()` replayed 24 decisions.
3. **Say:** *"If I deleted that table and replayed the log, I would get it back byte for byte.
   That's what `/api/verify` checks, and it returned 200 before we started."*

### Beat 2 — read a signal, then cause one · 1:30–4:00

4. **Select `a_01`, window `7d`, metric `CTR`.** It falls from **~4.5% to ~0.5%** across the week —
   a **9.6× collapse** — while its impressions *rise*.

   **Say:** *"Nothing about this ad changed. Its audience ran out of people. Fatigue accrues to the
   `(video lineage × audience)` pair, so this is the component's history, not the ad's."*

5. **Add `a_12` to the selection.** Same video lineage, different audience — it declines **1.5×**
   over the same week. **Say:** *"One video, two audiences, two completely different trajectories.
   That's the case for making the component the unit of analysis and the ad the unit of action."*

6. **The fatigue flag.** Point at it on `a_01` and read its limits off the screen — they are printed
   next to it, not buried in a README. Especially: *"it cannot separate this from a platform
   delivery change, and it fires **last** on the low-volume ads most likely to be burned."*

7. **Cause it live.** Scenario console — note the **dashed** border, it is deliberately not the
   action console. **`fatigue_collapse` on `a_03`, ×4. Fire.**

   **Say:** *"That is the simulator, not the advertiser. Different table, different endpoint, and it
   appears in no decision log — because it is not a decision."*

8. **Within a minute `a_03`'s CTR halves and the flag fires.** The other ads sharing that lineage
   move too, which is the point: the multiplier hit the *pair's* accumulated frequency.

### Beat 3 — the gate refuses · 4:00–5:00

9. **Select a low-volume ad (`a_09`) and switch the metric to `ROAS`, granularity `minute`.**
10. **The ratio is not drawn.** The chart shows **counts** with the reason stated, and names the rung
    it climbed to and the ads it dropped from each point.

    **Say:** *"The bar is ≥ 10 conversions per plotted point. It coarsens minute → 5 → 15 → hour, and
    then it **stops** rather than widening into one bar covering the window. A chart that says 'not
    enough data yet, here are the counts' is honest; one that has quietly become a single bar looks
    like an answer."*
11. **Point at the maturity indicator** and read its caption — *"68% mature · measured over 1,432
    settled conversions"*. **Say:** *"That's a histogram of our own data, not a forecast, and it
    always carries the sample size it rests on. Two different mechanisms: the gate says 'too little
    data to be a ratio'; this says 'the data is still arriving'."*

### Beat 4 — pull a lever, the world responds · 5:00–7:30

12. **Window `1h`, granularity `minute`, metric `Impressions`, `a_12` only.** It is delivering.
    **Leave the chart on screen.**
13. **Decision loop → lever `Pause`, ad `a_12`, rationale.** The form refuses an empty rationale
    before the endpoint does and before the schema `CHECK` does. Type what a strategist would write:
    *"CTR collapsed against its peak — stop spending while I look."* **Apply.**
14. **Banner:** `✔ applied · decision #25 … a_12 is now paused … generation g_a_12_003`. That state
    was read **inside the transaction that wrote the log row**, so it is not optimistic.
15. **Watch the chart. Within one second `a_12`'s line goes flat.**

    **Say:** *"Note what did **not** happen. No code path went from that button to the `ads` table.
    The button appended one row to `decisions`; the fold wrote the projection; the emitter polls the
    world at 1 Hz, sees `paused`, and stops drawing from λ. **The loop closed through the store.**"*
16. **Show the guard.** Try `set_budget` with a stale `from_cents` — it is **refused**, not
    reconciled. **Say:** *"With one actor that's a staleness guard, not a concurrency feature — a
    stale tab or a double-submit. I'm not going to claim a multi-actor story I can't demonstrate."*
17. **The decision log**, with the rationale on every row. **Say:** *"This is the authority. The
    config table is a projection of it."*

### The refresh — invite it · 7:30–8:00

18. **Hand them the keyboard.** *"The brief says to expect a mid-demo refresh. Please — now, and as
    hard as you like."*

    Everything comes back: the ads, seven days of history, the decision log, `a_12` still paused. The
    only thing lost is which ads were selected.

    **Say:** *"Nothing durable lives in the browser. No `localStorage`, no IndexedDB. Cold start and
    refresh are the same code path — one snapshot read, then the stream resumes from the last
    `ingest_seq` the client saw, replaying **absolute** bucket rows rather than deltas, so a
    redelivery after a reconnect is idempotent by construction."*

### Beat 5 — a late conversion restates a settled bucket · 8:00–10:30

**This is the flagship path.** Two ways to reach it; use the second on camera.

19. **First, show one that happened on its own.** The restatement timeline already has entries. The
    most extreme in this store: a conversion credited to a minute **six days** earlier — its click
    landed 30 August, the purchase happened 5 September, it reached us four hours after that.
    **147.4 hours after the click that earned it**, into a bucket that had been settled for three
    days.

20. **Then cause one. Scenario console → `late_cascade` on `a_01`. Fire.**

    The banner says the trigger was **written** and is awaiting the simulator's next poll —
    *"nothing has happened yet"*.

    **Say:** *"The trigger is a row before it is an effect. Determinism here is seed plus decision
    log plus scenario log; a claim whose third input lived in memory would be false. Watch the
    `picked up` column fill in — that's the handover between two processes that share no memory."*

21. **Within a second or two the timeline grows.** Measured at `B61`: **12 → 17 restated buckets**,
    entries **seven days back**, one of them `conv 0 → 6`, ROAS `0.00 → 119.25`, **168.0 hours
    late**, every entry marked `explained`.

    **Say:** *"Those are real clicks from the log, days old, that we've now made convert. A conversion
    with an invented `click_id` would produce an orphan that parks at its own minute and restates
    nothing — the flagship path replaced by the orphan path wearing its clothes."*

22. **Point at what makes it a restatement rather than an update:** the bucket was **settled** — past
    the 72 h horizon, a period we had asserted was final — and it moved anyway, so it carries
    `restated_at` and a bumped count, and the timeline entry sits at **the bucket's own time**, not
    at now.

    **Say:** *"A conversion lands in **its click's minute**, not its own. That's what makes CPA and
    ROAS real cohort ratios — and it's what makes a period you thought was closed move."*

### Beat 6 — walk a number back to its events · 10:30–13:30

**This is the criterion: *can you trace any number on screen back to the raw events beneath it — and
do they agree?***

23. **Click a ROAS point on the chart.** The drill-down opens: the bucket's stored counts, the raw
    events underneath, and **a verdict** from re-summing them.

    **Say:** *"That verdict is a re-sum from the raw `signals` table — a **different** table from the
    one the chart read. If it read the rollup it would be comparing the display path to itself."*
24. **The `as_of` rewind.** Set it to just before the late arrival. The **previous** figure, the
    **new** figure, and the exact `event_id`s accounting for the difference are on screen together.

    **Say:** *"This is what makes restatement provable rather than asserted."*
25. **`trace <event_id>` — one event, end to end.** Use the conversion from beat 5. Eight steps:
    emission → the delivery row → the canonical fact → the attribution → the bucket it moved →
    the metrics that changed → the pixel → and the same number one `ingest_seq` earlier.

    **Say:** *"Emission, stored fact, aggregate, pixel — with every id resolving. The README walks
    this exact event, `c4804d05ed499439`, in full."*

### Beat 8 — kill everything and restart · 13:30–15:00

**The strong version of the refresh test**, and the hard requirement the brief puts first.

26. **Say it before you do it:** *"I'm going to kill the server, the simulator and the web server —
    everything except the file on disk — and start them again."*
27. **Note the log position first**, so the claim is a number: `curl -s localhost:8787/api/health` →
    `"ingest_seq":1592849`.
28. **Ctrl-C.** Confirm the ports are actually released — `ss -ltn | grep -E ':8787|:5173'` →
    nothing. *"It looked stopped" is not stopped.*
29. **`npm start`.** Up in about a second, and the simulator logs its own recovery:

    ```
    [sim] handover: 13,494 backfilled click(s) awaiting a conversion — fetched once, not polled
    [sim] sent 150 · accepted 44 · dup 104/1 · rejected 1 · ingest_seq 1592893
    ```
30. **Point at that last line, because it is the beat.** The emitter re-derived **150 events** for
    the seconds it was dead. **104 were already in the store** and landed as `duplicate_identical`,
    moving no number anywhere. Only the **44** it had genuinely never sent were accepted.

    **Say:** *"It holds no queue and no cursor. Every `event_id` is derived from the seed and the
    absolute clock, so a restart re-deriving what it already sent is **free** — the duplicates are
    the demonstration, not a wart. That's the same dedupe path the misbehaviour table describes,
    firing on our own recovery."*
31. **Close on the chart:** seven days of history, `a_12` still paused, the decision log intact, the
    restatements from beat 5 still marked.

---

## The ten hardest questions, and the answers

Sourced from `DECISIONS.md`; the id on each is where the full entry lives.

**1 — "You put a conversion in its click's minute. Doesn't that mean today's number can change for
weeks, and isn't that worse than just counting it when it arrives?"**
Yes, and that is the point: a bucket is *"activity at time T and everything it eventually earned"*,
which is the only placement under which CPA(T) and ROAS(T) are cohort ratios rather than two
unrelated populations divided by each other (**D27-B**). The cost — that closed periods move — is
made visible rather than hidden, through settlement states and persistent restatement marks, and
recognition-time remains one raw scan away because raw is never discarded.

**2 — "Your restatement path only fires because your simulator makes it fire."**
It fires on emergent data: the lag mixture puts **2–5% of every cohort past the 72 h horizon** by
construction, and **14 buckets in this store carry `restated_at`** with no scenario ever triggered
(**D36**, **D13**). The scenario control exists because *"if the interesting thing can't be caused on
demand it can't be shown"* (**F3**), not because it is the only way it happens.

**3 — "Why is there no cache, and won't read-time ratios fall over?"**
Ratios are never stored because re-aggregating stored ratios across buckets is arithmetically wrong
— a correctness bug in a performance costume (**D10**). A cache would be a *second* invalidation
mechanism that has to stay in step with restatement, doubling the surface where the hard thing can
be got wrong, and it buys nothing at 12 ads and 72k buckets (**D29-B**, rejected).

**4 — "You wrote your own migration and transaction wrapper instead of using a library."**
`node:sqlite` is built into Node 24, so the alternative was a dependency, and D8 records the exact
condition under which we would switch to `better-sqlite3` so it is not a later judgement call. The
wrapper is ~10 lines; the schema was verified against the real driver — the generated column, the
partial unique index, the upsert — before any of it was designed on top of (**D8**).

**5 — "Your fatigue flag is just a threshold on a moving average."**
Correct, and deliberately: the brief says *"a well-chosen heuristic, honestly presented with its
limits, beats an opaque model"* (L147). Its five limits are printed on the surface next to it, and
the sharpest one is stated rather than hidden — **it fires last on exactly the low-volume ads most
likely to be burned**, because the statistical gate suppresses their points (**D20**, `SIMULATOR.md`
§19).

**6 — "How do you know the numbers on screen are right?"**
Two independent checks that fail for different reasons. `/api/verify` rebuilds every projection from
the logs into `TEMP` shadows *through the real `apply()`* and diffs them — it catches a **drifted
store** (**D55**). `npm run agree` re-derives every rollup from raw *without* `apply()` — it catches
**wrong code**. The drill-down does the same comparison per bucket, on click, against `signals`
rather than `rollup_minute`, so it can never compare the display path to itself (**D30**).

**7 — "What breaks this design?"**
Named, not discovered. **Emitter-side event loss breaks it silently** — there is no emitter sequence
number, so a lost event is indistinguishable from one that never existed (**G21**), and we inject it
at 0.2% so the failure is *present in the data* rather than hypothetical. **Retractions and refunds
are unrepresentable** — the contract is append-only with no negation (**D25**). Both are in the
README's misbehaviour table as *breaks*, alongside what degrades and what is tolerated.

**8 — "You've only built one and a half of the three surfaces."**
Deliberately, and the trade is written down (**D1**, **D26**). The brief says *"Signal is where we
look hardest at your engineering"* and *"build one or two of the three for real"*. What it cost is
listed rather than glossed: no variant comparison, no component-level performance as a demoed
capability, no versioning editor — and the cut line is **ordered cheapest-first** so the next thing
to build is already named (`SCOPE.md` §4, and it is #2, the data-health panel).

**9 — "Your simulator is where all the interesting behaviour lives. Isn't that circular?"**
The simulator can only make the world *do* things; it cannot make the app *say* things. It runs in a
separate process, never opens the store, and reaches it only through the same `POST /api/ingest`
every event goes through (**D32**). It is also where the design was most often proved wrong — D59
found the whole portfolio pinned to a pacing clamp and delivering 1.19–1.47× its stated baseline,
which no amount of plausible-looking output would have revealed.

**10 — "Which of these decisions would you now take differently?"**
`ρ_catchup`'s ceiling, and I did — **D59** amended a ratified constant mid-build once measurement
contradicted it, because pacing was boosting delivery the model had no inventory for. The one I would
change about *process* rather than design: measuring the seeded distributions against their designed
shapes as a build step rather than at packaging time, which is when the lag CDF's flat median and the
tail's censoring at `T0` actually surfaced.
