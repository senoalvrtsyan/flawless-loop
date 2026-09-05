# DEMO.md — the walkthrough

**Created at B36 under D50, and written incrementally: every stage-4, -5 and -6 group appended its
own steps as it landed and said so in its report.** B61 is the final ordered pass over this file —
it re-orders, prunes and rehearses, but it does not write the content cold, because a script
assembled at the end from memory is a script that describes an app nobody checked.

**Status: COMPLETE and FOLLOWED COLD at B61** (2026-09-05), in a real browser against a real store,
start to finish. Eight beats. Every step below has been executed rather than written down — the
corrections that pass produced are marked **⚑ found by following this script**, and there are four
of them. Budget **20–25 minutes** for beats 1–8 at a walking pace, plus whatever the audience asks.

---

## 0 — Before the demo

```
node -v                 # 24+ required — node:sqlite is unflagged there (D8)
npm i
npm start               # migrate · seed IF the store is empty · server :8787 · simulator · Vite :5173
```

`npm start` prints the URL when the port is actually listening, and prints a heartbeat every 15 s
while it seeds. Open **http://localhost:5173**.

**The individual steps still exist** — `npm run db:migrate`, `npm run seed`, `npm run dev` — and are
what to reach for if something goes wrong. `npm start` is those three with an emptiness check in
front of the seed, so **a second `npm start` never reseeds**: it comes up in about a second and says
`12 ads already exist — not seeding`.

**Seed once, well before the demo.** `SIM_BACKFILL_DAYS=5` is the wired lever if time is short; both
depths exceed the 72 h settlement horizon, so nothing about settlement changes. A **7-day** store is
what makes a handed-over conversion land in an already-*settled* bucket, which is the restatement
moment — a 1-day store cannot produce one.

**Sanity, before anyone is watching:**

```
curl -s localhost:8787/api/health
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/api/verify   # 200 — takes ~11.5 s
npm run agree                                                       # OK  — takes ~4.0 s
```

**⚑ found by following this script:** both of those are seconds, not instants, and both are clean
**while the emitter is running** — measured on the seven-day store at 1.59M events. Do not run them
in front of an audience expecting a prompt back; run them before, and quote the numbers.

---

## The spine

Eight beats, in the order the brief cares about. Beats are filled in as their chunks land.

| # | Beat | Chunk | Written? |
|---|---|---|---|
| 1 | **The world has a past** — the app opens onto seven days, not an empty chart | B36 | ✅ below |
| 2 | Read a signal off the chart | B37, **B38** | ✅ below — ratios landed at B38 |
| 3 | The gate refuses to draw a ratio it cannot support | **B39**, B40 | ✅ below |
| 4 | **Pull a lever, the world responds** — pause `a_12`, its events stop | **B46, B47, B48, B50a** | ✅ below — and the score, with its four limits |
| 5 | **A late conversion restates a settled bucket** | **B41, B42, B43, B49, B50** | ✅ below — and now causable on demand |
| 6 | **Walk a number back to its events** | **B51, B52, B53, B54, B55** | ✅ below — the verdict, the rewind, and one event end to end |
| 7 | Configs are versioned; the swap is visible | **B48**, **B56** | ✅ — the boundary and the swap are in beat 4; **B56's component screen closes it, below beat 6** |
| 8 | **Kill everything and restart — the world is still there** | **B61** | ✅ below — and the catch-up's duplicates are the point, not a wart |

---

## Beat 1 — the world has a past (B36)

**Say:** *"This is a portfolio of twelve ads that have been running for a week. Nothing here is
fixture data — every row is the fold over a decision log."*

1. **The portfolio, left.** Twelve ads, each with its status, its channel, its daily budget and its
   generation number. Point at the **generation number**: an ad on `gen 2` has had one lever pulled
   on it since it was created. That column is `ads.current_generation_id`, and `ads` is a projection
   — there is no code path in this repo that inserts an ad directly.
2. **Change the window** — `15m` → `24h` → `7d`. Each click re-runs the whole cold-start path
   (`DESIGN.md` §3.1: snapshot, cursor, subscribe), which is deliberately the same path a refresh
   takes. There is no separate resume path to get wrong.
3. **Select one ad**, then a second. `?ads=` filters the *buckets*; the portfolio list stays whole,
   because hiding the ads you are not looking at would make selecting them impossible.
4. **Refresh the browser.** Everything comes back except which ads were selected — that is the only
   thing the client owns (`DESIGN.md` §3's persistence boundary, column 1). Say so out loud: *"the
   client owns nothing durable, on purpose."*

**Prove it rather than assert it**, in a terminal beside the browser:

```
sqlite3 data/loop.sqlite "SELECT ad_id, status, daily_budget_cents FROM ads ORDER BY ad_id;"
sqlite3 data/loop.sqlite "SELECT COUNT(*) FROM decisions;"     # the ads' whole provenance
```

**If asked "could you have hard-coded that?":** pause an ad with `curl` (beat 4's lever, available
from B14 on the server whether or not the console is built) and refresh — the list changes, and the
only thing that changed on disk is one row in `decisions`.

---

## Beat 2 — read a signal off the chart (B37, B38)

**Say:** *"Every point on this chart is a sum of events that are still in the store. Pick one and I
will show you the events under it."*

1. **Select two or three ads.** One line each, in the portfolio's own order, so a colour means the
   same ad in the list and on the chart.
2. **Switch minute → hour.** Hours are summed from minutes — `DESIGN.md` §4.1's "base grain is the
   minute; hours derive from minutes" — and nothing is divided, because D10 puts the division after
   the aggregation.
3. **Pick a point and read its value off the legend.** Then, in a terminal:

```
sqlite3 data/loop.sqlite "
  SELECT SUM(impressions) FROM rollup_minute
   WHERE ad_id='a_03' AND minute_start >= '<hour>' AND minute_start < '<hour+1h>';"
```

   …and then the same hour from **raw events**, which never touch the projection:

```
sqlite3 data/loop.sqlite "
  SELECT COUNT(*) FROM signals
   WHERE ad_id='a_03' AND kind='impression'
     AND ts_effective >= '<hour>' AND ts_effective < '<hour+1h>';"
```

   All three agree. Measured at B37 on six consecutive hours of `a_03`: 794 / 916 / 804 / 1136 /
   1660 / 1129, identical across chart, rollup and raw. **B53 makes this a click instead of a
   terminal**, and turns it from a demonstration into a check the app performs on itself.

4. **A line that falls to zero is an ad delivering nothing; a line that has not started is an ad
   that did not exist yet.** The chart distinguishes them: zero inside the ad's life, nothing at
   all before `launched_at`.

### The headline, and where its numbers come from (B38)

**Say:** *"Six numbers, and the server computed all six. The client formats them and is structurally
incapable of inventing one."*

5. **Read the headline row** — impressions, clicks, spend, CTR, CPA, ROAS, with the per-ad table
   under it. **Spend says its own two parts** (`$X clicks + $Y CPM/fees`): the brief keeps click
   costs and non-click charges disjoint and says total spend is their sum (L79-80), so it is a
   read-time sum and never a stored third column.
6. **Point at the note under CPA and ROAS**: *"lags by cohort"*. CTR's two terms both land at their
   own time; a conversion is backdated to its click's minute (D27-B), so CPA and ROAS are only
   readable once a cohort matures. That sentence is on the screen because a cockpit that does not
   say it invites exactly the wrong decision.
7. **Point at the provisional line.** Orphan conversions — a conversion whose click has not arrived
   — are counted **apart** and excluded from CPA and ROAS. Both columns are called conversions and
   sit side by side in the same row, so adding them is the natural mistake; it would put
   unattributed revenue into ROAS and every number would still look plausible.
8. **Prove the totals rather than trusting them.** Sum the buckets the same screen is drawn from,
   then check the same window against **raw events**:

```
F=2026-09-03T17:00:00.000Z; T=2026-09-03T23:00:00.000Z
curl -s "localhost:8787/api/snapshot?include=totals&from=$F&to=$T&ads=a_08" | python3 -m json.tool
sqlite3 data/loop.sqlite "
  SELECT COUNT(*) buckets, SUM(impressions), SUM(clicks), SUM(click_cost_cents)+SUM(spend_cents),
         SUM(conversions), SUM(value_cents)
    FROM rollup_minute WHERE ad_id='a_08' AND minute_start >= '$F' AND minute_start < '$T';"
sqlite3 data/loop.sqlite "
  SELECT SUM(kind='impression'), SUM(kind='click'),
         COALESCE(SUM(cost_cents),0)+COALESCE(SUM(amount_cents),0)
    FROM signals WHERE ad_id='a_08' AND ts_effective >= '$F' AND ts_effective < '$T';"
```

   Measured at B38, all three agree exactly: **360 buckets · 18,056 impressions · 680 clicks ·
   $285.30 spend · 77 conversions · $6,341.12 value**, and CTR hand-computed as 680 / 18,056 =
   3.7661% is what the server sent to fifteen decimal places. **The conversions agree through the
   attribution join** — 77 either way — which is D27-B: a conversion counts in its *click's* minute,
   so the raw route has to join back through `attributed_click_id` to ask the same question.
9. **`?include=totals` is the cheap read** the screen uses every five seconds: **752 bytes in
   2.2 ms**, against 24 MB and 449 ms for the whole 7-day snapshot. It carries the resolved window
   and `as_of_ingest_seq`, so the headline says which question it answered and at which log
   position — never just a number.
10. **The window walks forward** (D65). Watch the telemetry line: `window … → …` advances a minute at
    a time while `anchored at …` stays where the snapshot put it, and `(+Nm)` counts the distance.
    Before B38a the frame was frozen at fetch time and the surface was live for at most the tail of
    one minute — measured, and it is the reason the roll exists. **Refresh and the anchor resets.**

---

## Beat 3 — the gate refuses to draw a ratio it cannot support (B39, B40)

**Say:** *"This is the honest part. The chart will not draw a ratio it does not have the evidence
for, it tells you which resolution it chose, and it names the ads it gave up on."*

The bars are **D20**'s: ≥ 500 impressions per point for CTR, ≥ **10 conversions** per point for CPA
and ROAS. The ladder is minute → 5 min → 15 min → hour and then it **stops** — past the hour the
counts are shown instead of an ever-wider bucket. **D67** fixes what "its points clear" means: the
bar is tested per point, a rung is admissible at **more than 50% of the window's non-empty points**,
and the gated count is always on screen.

1. **Select `a_08` alone, window `6h`, metric `CTR`, granularity `minute`.** The caption reads
   **drawn at 15 min — the gate coarsened from minute to clear its bar**. Nobody chose 15 minutes;
   the data did.
2. **Switch metric to `CPA`.** On an evening window it reads **drawn at hour** with a gated count.
   Measured on the seeded week, `a_08` over `2026-09-04 00:00–04:00Z` (20:00–00:00 local): **CPA
   drawn at the hour, 3 points plotted, 1 gated**.
3. **Now the same ad over `2026-09-04 05:00–11:00Z`** (01:00–07:00 local, the overnight trough).
   **CPA falls to counts** — *"0 of 6 points clear at best — under 10 conversions"* — and CTR
   coarsens from 15 min to the hour. **Both branches of D20 fire on the same ad, four hours apart.**
   That is the demo moment `SIMULATOR.md` §18.3 was parameterised to produce, and it is reproduced
   from **realised** counts, not from the expectations that table was computed with.
4. **Select the whole portfolio, metric `CPA`.** One ad is drawn (`a_08`) and **eleven are named**
   with their reason. Say it out loud: *"a portfolio where every chart drew every ratio would make
   this mechanism invisible."*
5. **Metric `CTR`, whole portfolio, 24h.** Nine ads drawn at the hour, **43 of 216 points gated**,
   and `a_07` / `a_09` named as counts-only. `a_09` clears nothing at any rung — 214 impressions an
   hour against a bar of 500 — and the surface says why rather than drawing a line through noise.
6. **Toggle `raw` → `EWMA 15m`** (B40). The series smooths and the caption warns that smoothed
   points **will not reconcile against raw events** — switch back to raw before walking one back,
   which is what B53's drill-down asserts against. Note the honest limitation while it is on screen:
   at D20's ratified 15-minute half-life the carried weight is 0.5 at the 15-min rung and **0.0625
   at the hour**, so smoothing visibly acts on CTR and barely acts on CPA. That is the constant
   behaving correctly, not a broken control.

**The distinction to keep saying:** the gate says *too little data to be a ratio*; the maturity
indicator (B41) says *the data is still arriving*. A young cohort trips both, for different reasons,
and the surface has to say which.

### The fatigue flag, and the four things it cannot tell you (B45)

**Say:** *"One heuristic, and its limits are on the screen next to it — that is the whole claim.
A well-chosen heuristic honestly presented beats an opaque model, and this is what honest looks
like."*

7. **Read the fatigue list.** Ten of nineteen component pairs are flagged, because the seeded week
   burned them: `vl_04 × rt_us` sits at a CTR of 0.46% against its own peak of 6.23% — **93% below
   peak** — and that pair is `a_01`'s and `a_05`'s video. The rule is §19's, verbatim: a 25% fall in
   the trailing-6h EWMA CTR against the pair's **lifetime** peak, counting only points that clear
   the 500-impression gate, with at least three qualifying points in each window.
8. **Point at `a_09`.** Not flagged — and the row says *why*: fewer than three points clear 500
   impressions in any six-hour window, so **the gate suppresses this pair**. Say it out loud: *"the
   ads most likely to be burned out are the ones we are slowest to flag. That is in the design
   document as a known limit, and it is on the screen rather than in a footnote."*
9. **Point at `a_12` or `a_07`.** One slot flagged, the other with no reading — §19's fourth limit:
   the flag measures the **pair**, not the ad, so an ad whose headline is burned and whose video is
   fresh shows a partial signal and the row attributes it to the slot.
10. **Read the limits block.** Four of them, as prominent as the list itself. The first is the one
    that matters most: it cannot separate fatigue from an audience-quality shift or a platform
    delivery change — because §12's two AR(1) processes make them look the same for the first few
    hours, by construction, *because they do in reality*.
11. **Say what it is not.** A display flag, never a recommendation. There is no
    `system:fatigue_rule` actor and no automatic lever — D26 cut #6 — so every entry in the decision
    log was pulled by a human with a rationale attached.

### The raw tail, and why nothing on it can become a metric (B44)

**Say:** *"The bottom of the page is the feed itself. It is the one place raw events reach the
browser, and it is structurally incapable of producing a number on the chart."*

12. **Watch the tail scroll.** One frame per 250 ms flush tick, capped at 25 rows, and the line
    above it says what it is a sample of — *"newest 25 of 500 deliveries in the ring"*. A tail that
    quietly showed 25 of 500 without saying so would imply the other 475 did not happen.
13. **Find a non-accepted row.** They arrive at about 1% because §13 injects them: a
    `rejected_invalid` carrying `ad_id_missing_or_not_a_string`, or a `duplicate_identical` from the
    emitter's own catch-up. **That row never became a `signals` row** — the tail is built from the
    posted body, which is the only reason a rejected delivery is visible anywhere.
14. **Point at an amount: `"$0.62"`.** It is a *string* on the wire, not an integer, and that is
    D34's first layer. Then say what enforces it: `src/server/tail.test.ts` holds two
    `@ts-expect-error` lines, so **summing a tail frame does not compile**, and minting a tail value
    from a plain string does not compile either. Verified by removing the brand and watching
    `npm run typecheck` fail.
15. **Point at the stream-health block and read its heading.** *"Transport, not performance."* Those
    are numbers, they are D34's **named exception**, and they describe the feed: events/sec, last
    event age, dispositions, rows spilled, frames backpressured, orphans unresolved. The scope line
    says they are measured over the last N deliveries this process has seen and reset on restart —
    correct for transport figures, and said rather than implied.

---

## Beat 4 — pull a lever, the world responds (B46, B47, B48)

**Say:** *"Everything so far has been reading. This is the half that writes — and it writes exactly
one table. `ads` is not edited by this form; it is re-derived from the row this form appends."*

This is `CLAUDE.md` §6's third hard requirement in one gesture: *"the strategist sees a signal,
takes an action, the world responds. Pausing `a_12` stops its events."*

### The lever, and the world responding (B46)

1. **Window `1h`, granularity `minute`, metric `Impressions`, select `a_12` only.** It is delivering;
   the series climbs. Leave the chart on screen — the point is what happens to *this* line.
2. **Scroll to "Decision loop — pull a lever".** The header line above the form is the current fold:
   status, budget, both component slots, the generation id, and *"after decision #N"*. Every one of
   those came from the `ads` projection, which exists only because `applyDecision()` ran.
3. **Lever `Pause`, ad `a_12`, rationale** — required, and the form refuses an empty one before the
   endpoint does, before the schema `CHECK` does. Type something a strategist would actually write:
   *"CTR collapsed against its peak — stop spending while I look."* **Apply.**
4. **The banner:** `✔ applied · decision #25 … a_12 is now paused … generation g_a_12_003`. That
   state was read from **inside the transaction that wrote the log row**, so it is not an optimistic
   value that could still be rejected.
5. **Watch the chart.** Within one simulator tick — a second — `a_12`'s impressions stop arriving
   and its line goes flat. Nothing in the client did that: the emitter polls `/api/sim/world`, sees
   `status: 'paused'`, and stops drawing from λ for that ad. **The loop closed through the store.**

**Say:** *"Note what did NOT happen. No code path went from that button to the `ads` table. The
button appended one row to `decisions`; `applyDecision` folded it and wrote the projection. That is
the one property this whole design is built to demonstrate, and `/api/verify` is how we check it."*

**⚑ found by following this script:** after a lever lands, the console **re-selects the lever that
is now legal** — pause an ad and the selection moves to `Resume`. That is the right affordance and
it is a trap for a demo: if you Apply twice without looking, the second Apply is a *different*
lever, and the banner will cheerfully tell you the ad is live again. **Read the Apply button's own
label** — it says `Apply Pause to a_12` — rather than the button you clicked a moment ago.

6. **THE REFRESH TEST — do this here, in front of them, and do not announce it as a test.** Hit
   ⌘R / F5. The portfolio, the chart, the seven days of history, the decision log and the lever you
   just pulled all come back, and the number keeps climbing from where it is now rather than from
   zero. Measured: impressions `3,211 → 3,218` across the reload, same newest bucket, same 33
   decisions.

   **Say:** *"Nothing is in this browser. There is no `localStorage`, no IndexedDB, no service
   worker — the only thing a refresh loses is which ads were selected. Cold start and a refresh are
   the same four steps: snapshot, subscribe from its cursor, replay absolute rows, then live. There
   is no separate resume path to get wrong, which is exactly why D30 chose absolute rows over
   deltas — a delta replayed after a reconnect double-counts."*

### The guard, which is the interesting refusal (B46)

7. **Lever `Set budget` on `a_12`.** The form shows a field labelled **`from_cents` (precondition)**,
   pre-filled with the current value. **Change it to anything else** and Apply.
8. **`✖ refused (409) · stale_precondition — set_budget expected from_cents 1, current is 9000`.**
   The server's message, verbatim, with the current value in it.

   **Say:** *"That is a compare-and-swap. `from_cents` is not an annotation — it is an assertion
   about the world the human formed their intent in. We have one actor, so this is a staleness guard
   for a stale tab or a double-submit, not a concurrency feature, and the README says so rather than
   implying a multi-actor story we cannot demonstrate. And we do not retry it. The 409 hands back
   the current value, so a helpful client could re-send and succeed — which would assert an intent
   nobody expressed."*
9. **Nothing was written.** A refused lever consumes no `decision_seq`, opens no generation and
   leaves no log row. Check it: `curl -s localhost:8787/api/health` — `decision_seq` is unmoved.
10. **Try `Resume` on a live ad.** `409 illegal_transition — an ad in 'live' does not admit 'resume'`.
   The hint beside the buttons said that would happen; the button submitted anyway, because the
   transition table lives in `fold.ts` and a copy of it in the form is a second thing to keep in
   step. The form is not the authority and does not pretend to be.

### The log, which is the authority (B47)

11. **"Decision log — what produced this config".** Newest first — `#25 … a_12 pause — stop delivery
    | opened g_a_12_003 | "CTR collapsed against its peak…"`. Actor, rationale, `decision_seq`, and
    the generation each decision opened.
12. **Run it against the store**, in a terminal beside the browser:
    ```
    sqlite3 data/loop.sqlite 'SELECT decision_seq, ad_id, action, rationale FROM decisions ORDER BY decision_seq DESC LIMIT 5'
    ```
    The same rows. The surface reverses fold order for reading and does nothing else to them.
13. **Then `curl -s -o /dev/null -w "%{http_code}\n" localhost:8787/api/verify`** → `200`. It
    rebuilt `ads`, `config_generations`, `conversion_attribution` and `rollup_minute` from the two
    logs into shadow tables and diffed all four. **Measured after the three levers above: all four
    hash-matched at `decision_seq` 27, in 11.7 s.**

    **Say:** *"That is the payoff of one writer. The log is authoritative and everything else is a
    projection, so a divergence would be a bug in one function — and the rebuild is also the repair."*

### The swap, and the boundary it draws (B48)

14. **Lever `Swap component`, slot `video`, on `a_12`.** The picker offers the real library, grouped
    by lineage: **`v_05 · Unboxing hook, recut · vl_04 v2`** sits directly under `v_04 · vl_04 v1`,
    its parent. That two-version lineage is in the seed on purpose (D3). Rationale: *"fatigue flag on
    vl_04 — try the recut before writing the ad off."* Apply.
15. **A solid vertical rule with a ▼ appears on the chart**, labelled `a_12 g4`, at the instant of
    the swap — the third kind of rule on this canvas, and told apart from the settlement horizon
    (long-dashed) and a restatement hairline (fine-dotted) by dash pattern and glyph before colour
    is consulted at all.
16. **Below the chart, the same boundary in words:**
    `▼ a_12 gen 4 at 2026-09-04T19:33:17Z · video v_04 → v_05 · decision #26 by human:nk: "fatigue
    flag on vl_04 — try the recut before writing the ad off"`

    **Say:** *"Nothing stores 'this generation changed the video'. The pair of `config_generations`
    rows already says it, and a stored summary is a second copy of a fact that can go stale. The step
    in the series at that line is explained by the generation, and by nothing else."*

### Did it work? — the score, and its four limits (B50a / P18)

**Say:** *"The obvious next question is whether any of that helped. There is a column for it, and
the interesting thing about that column is how often it refuses to answer."*

17. **The last column of the decision log: `score (±6 h, D70)`** — and note the header names the
    window, because after D71 it is a control and `(D70)` appears only while it is at the ratified
    value. On the seeded week every row reads
    **`no before-window`** — the twelve `create_ad`s because the ad did not exist, and the twelve
    `launch`es because the ad was in `draft` and a draft ad delivers nothing. **Say so plainly:**
    *"P18 is built and it has nothing to score here, because the seeded week contains no mid-week
    lever pulls. That is a gap between built and demonstrable, and it is the same gap the horizon
    control exists to close for restatements."*
18. **Pull a lever now** (beat 4, step 3) and the row reads **`scoring in N h · awaiting conversion
    settlement`**.

    **Say:** *"That is not an apology, it is the clearest thing on this screen. Without the guard the
    comparison is systematically biased in one direction: the before-window has had six more hours
    to accumulate late conversions than the after-window, so **every** decision would look worse
    than it was — with every number plausible and nothing erroring. So we withhold, and we say how
    long."*
19. **Shorten the horizon** (the control above the chart) **and watch the withheld entries release.**
    Measured on the seeded week: at 72 h, six entries read `scoring in 2 h`; swept to 2 h, **all six
    release**. That pairing is D19's own recommendation — *"pair with a shortened horizon in demo
    mode so a score can be produced live."*

18a. **Then shorten the scoring window — `Scoring window (±)`, beside the log — and say why there
    are two knobs.** *"The horizon decides **when** a score is allowed to be shown: both windows have
    to be past settlement. The window decides **what it is measured over**. Shortening only one of
    them still gives you nothing, which is exactly the trap D71 was raised for: `w` was fixed at six
    hours, so a lever I pull on camera could not be scored for six hours no matter what the horizon
    said."*

    **The caption changes with it, and that is the ratification's own condition:** at 6 h it says
    *"D70's ratified window, and the figure the README quotes"*; below it, the caption and the
    column header both switch to the shortened width and the surface says plainly that **a shorter
    window is a different claim, not a sharper one** — less delivery on both sides, so the
    comparison is noisier and the contamination flag describes *this* window rather than the
    ratified one. **Nothing is written**: like the horizon, `w` is a read parameter.

    **The honest limit, said out loud:** *"The floor is fifteen minutes, so the fastest score I can
    produce is window plus horizon — about sixteen minutes. If you want one live, I pull the lever
    at the start of the session and we come back to it."*

    **Measured end to end**, server + emitter, `set_budget` on `a_03` at 04:09:59 — at 04:25 the row
    reads **`▼ worse · CTR 2.76% → 1.63% (−41.1%)`** over 145 impressions before and 123 after, and
    at D70's ±6 h the *same* row at the *same* instant still reads `scoring in 6 h`. The horizon was
    one minute in both columns, so **only the window released it** — which is exactly what the
    two-knob caption is there to make legible.
20. **Where a score does appear**, it reads e.g. `▲ better · CPA $5.00 → $2.50 (−50.0%)`.

    **Say:** *"One metric, never both — CPA where both windows carry conversions, CTR otherwise —
    so nobody can pick whichever moved the way they hoped. And note the direction: CPA improving
    means it went **down**. Reading a negative delta as 'worse' would flip the verdict on half the
    log and read perfectly normally, which is why it is a tested property and not a convention."*
21. **The `⚠ contaminated by #26` flag.** A second lever inside either window.

    **Say:** *"We do not correct for it. The alternative was to pin the windows to the ad's own
    generation boundaries, which is never contaminated by construction — but gives you two windows
    of wildly different lengths that need normalising against a `valid_to` that moves. A
    contamination the reader can see beats a correction they cannot audit, and the brief asks only
    for a stated before-window versus after-window heuristic."*

**One refusal worth reading out**, because the sentence was wrong until D71's verification caught
it: where a lever stops delivery, the entry reads *"the after-window has no CTR to compare — the
before-window has 3,001 impressions, so this is the lever or the end of the data, not
under-delivery."* The earlier wording said *"neither window has enough delivery"*, which invited a
reader to diagnose a delivery problem that did not exist.

**What this beat still does not show.** Whether the swap worked *causally*. Six hours of the world
moved too, and the score is a comparison, not an attribution. That limit is printed under the table
rather than left for the reviewer to raise.

---

## Beat 5 — a late conversion restates a settled bucket (B41, B42, B43)

**Say:** *"This is the one the brief singles out. A conversion for last Saturday arrived on
Wednesday, after we had closed the books on that minute — and the app says so, at Saturday, not at
now."*

**It is true on frame one.** No waiting, no scenario trigger: under the seeded arrival model 2–5% of
conversions arrive past the 72 h horizon, so the store carries **ten** restated buckets from the
moment it is seeded — eight of them inside a rolling seven-day window.

1. **Window `7d`, select `a_01` and `a_03`, metric `Impressions`.** Look at the chart: a **dashed
   vertical rule** labelled `settled ◂ ▸ live` sits 72 hours back — everything left of it has passed
   the settlement horizon. Then the **hollow squares with hairlines**: eight of them, days back.
   Those are buckets whose numbers moved *after* they had settled.
2. **Read the caption.** *"settlement: 8 restated buckets in view, marked with a square and a
   hairline · N settled · N live · the dashed vertical rule is the 72 h horizon."* Say it out loud:
   *"persistent, not a flash — the reviewer is allowed to be looking somewhere else."*
3. **Scroll to the timeline.** Eight entries, **ordered by the bucket's own time**, newest period
   first. The one to point at is `a_01` at **18:33 Sat 29 Aug**:

   > ROAS **11.89× → 56.87×** · +1 conversion · **$191.17** · arrived **5 d 12 h late**
   > spend $3.36 in this minute · CPA $3.36 → $1.68 · learned at `2026-09-04T07:14:01.180Z`

   **That is the only one of the eight with a real before-and-after** — it already had one
   conversion, and the late arrival made it two. The other seven went from zero, which is why this
   is the entry to demo.
4. **Two clocks, and the entry shows both.** The bucket's minute (`18:33 Sat`) is *what moved*;
   `learned at` is *when we found out*. Sorted by the second, every entry would read "recently" and
   the timeline would say nothing about which period changed. §5.6 clause 2 is that sentence.
5. **Prove it from the store.** The entry names its own `event_id`s:

```
sqlite3 -header -column data/loop.sqlite "
  SELECT a.credited_minute, a.credited_ad_id, s.event_id, s.received_at, s.value_cents, s.source
    FROM conversion_attribution a JOIN signals s ON s.event_id = a.event_id
   WHERE a.state='resolved' AND a.credited_ad_id='a_01'
     AND a.credited_minute='2026-08-29T18:33:00.000Z';"
sqlite3 -header -column data/loop.sqlite "
  SELECT conversions, value_cents, restated_at, restatement_count FROM rollup_minute
   WHERE ad_id='a_01' AND minute_start='2026-08-29T18:33:00.000Z';"
```

   Two conversions credited to that minute, one of them received **five days later**; the bucket
   carries `restated_at` and `restatement_count 1`. Subtract the late one and you have the `before`
   figures on screen — **nothing stores them**, which is D10 and D7 in the same breath.
6. **Say what is NOT covered, before anyone asks.** A late *click* promoting an orphan decrements
   the provisional bucket the conversion was parked in; if that bucket had already settled it is
   restated by a subtraction. This store contains none, and rather than ship a derivation no data
   exercises, an entry whose arrivals do not account for its `restatement_count` renders as
   **UNEXPLAINED**. That is the honest shape of partial coverage.

### The maturity indicator, which is the other half of the same story (B41)

**Say:** *"Restatement is the surprise. Maturity is the part we can see coming — and they are
different messages, so they are different sentences."*

7. **Read the maturity line** under the headline: *"newest minute in view 0% mature · oldest 100% ·
   measured over 805 settled conversions (805 seeded, 0 live) · half arrive within 21 min, 95%
   within 42 h."* On a 7-day window the newest minute genuinely is 0% — its conversions have not
   arrived yet — and that is the number a strategist needs before acting on a fresh CPA.
8. **Point at the sample size and the seeded share.** §15.4's disclosure, and it is a real limit:
   inside the seeded window `received_at` is *designed*, not observed, so a figure resting on 805
   seeded arrivals rests on our own arrival model. `0 live` will grow as the emitter runs.
9. **Point at the exclusion note.** Cohorts credited after `now − 72 h` are excluded as incomplete.
   *"Measured over all of them, the curve would read earlier at every quantile and the screen would
   claim more maturity than it has — flatteringly, and with nothing to catch it."*
10. **Keep the two apart.** The gate says *too little data to be a ratio*. Maturity says *the data
    is still arriving*. `a_08` overnight trips both, for different reasons, and each has its own
    sentence on the screen.

```
curl -s "localhost:8787/api/restatements?from=$(node -e "console.log(new Date(Date.now()-7*86400e3).toISOString())")&to=$(node -e "console.log(new Date().toISOString())")" | python3 -m json.tool | head -40
sqlite3 data/loop.sqlite "SELECT COUNT(*) FROM rollup_minute WHERE restated_at IS NOT NULL;"   # 10
```

---

### Causing it on demand — the horizon control (B49 / P16)

**Say:** *"Everything above was true before I opened the app. But a reviewer is entitled to ask me
to make one happen. There are two ways, and they are different ways on purpose."*

**The first is to change what 'settled' means.**

11. **Above the chart, the lateness horizon: `72h (D13)` · `24h` · `6h` · `2h`. Press `2h`.**
12. **Read the sweep line.** *"swept 72h → 2h in 83 ms · **40,881** buckets changed settlement
    state, of which **172** had already moved by the time 2h says they were settled · read
    **40,881** of 71,584 buckets, the band … on `ix_rollup_time`."*

    **Say:** *"That is F2's whole argument, on screen. At 72 hours with seven days of backfill, the
    old buckets are already settled and the new ones never reach settlement inside a demo — so the
    restatement path would be built, correct, and invisible. Shortening the horizon re-evaluates
    settlement across the affected range, which is why this is a sweep with a control on it and not
    a toggle. Note what it read: the band, not the table."*
13. **The list underneath shows the restated ones first**, each with the arrival that did it.
14. **The caption in the shortened state is the important one:** *"answering at 2h, not the
    account's 72h … **Nothing was written.** `restated_at` in the store still records what was true
    at 72h."*

    **Say:** *"The horizon is a read parameter, and that is forced rather than preferred.
    `restated_at` is stamped at ingest against the horizon in force then; `/api/verify` rebuilds by
    replaying against the horizon in force now. Persist the horizon and verify reports a divergence
    on a completely correct store. So the write side keeps 72 hours and the read side takes a
    parameter."*
15. **Press `72h (D13)` to go back**, then run `curl -s -o /dev/null -w "%{http_code}"
    localhost:8787/api/verify` → **200**. Nothing the sweep did needed undoing.

### Causing it on demand — the scenario control (B50 / P17)

**Say:** *"The second way is to make the world do something. This is the simulator, not the
advertiser — different table, different endpoint, and it appears in no decision log."*

16. **"Scenario control — cause the interesting thing".** Note the **dashed** border: it is a
    sibling of the action console and deliberately not the same thing.
17. **`late_cascade`, on `a_01`. Fire.** The banner says the trigger was **written** and is awaiting
    the simulator's next poll — *"Nothing has happened yet."*

    **Say:** *"The trigger is a row before it is an effect. Section 14's determinism claim is seed
    plus decision log plus `sim_scenarios` gives you the world — a claim whose third input lived in
    memory would be false. Watch the `picked up` column fill in; that is the handover between two
    processes that share no memory."*
18. **Within a second or two, the restatement timeline grows.** Measured on the seeded store:
    **12 → 17 restated buckets**, entries **seven days back**, one of them `conv 0 → 6`, ROAS
    `0.00 → 119.25`, **168.0 hours late**, and every entry `explained`.

    **Say:** *"Those are real clicks from the log, days old, that we have now made convert. An
    invented `click_id` would produce an orphan that parks at its own minute and restates nothing —
    the flagship path replaced by the orphan path wearing its clothes."*
19. **Fire `orphan_burst`.** Six conversions land whose clicks are withheld 90 seconds. Watch the
    provisional count rise, then — 90 seconds later — the clicks arrive and the conversions are
    **promoted**. Measured: orphans **8 → 14 → 8**, with `credited_minute` moving **19:59 → 19:57**.

    **Say:** *"Two buckets moved for one promotion: the minute it was parked in lost it, and the
    click's own minute gained it. That is D16's path, and it is the direction the restatement
    timeline reports as **UNEXPLAINED** if it ever lands on a settled bucket — which is exactly what
    we want it to do rather than guess."*
20. **Fire `stall{30}`** and watch the liveness display. Measured: **`ingest_seq` did not move for
    12 seconds**, then emission resumed on its own.

    **Say:** *"We can say the stream is quiet. We cannot say why — there is no emitter sequence
    number, so a lost event and an event that never existed are indistinguishable. That is G21, and
    it is the one failure this app cannot see. It is named in the README rather than discovered."*
21. **Close with `curl -s -o /dev/null -w "%{http_code}" localhost:8787/api/verify` → 200, and
    `npm run agree` → OK.** Both were run after all five scenarios above.

    **Say:** *"Five scenarios, a horizon sweep, and three lever pulls later, every projection still
    rebuilds from the logs and every bucket's counts still agree with the raw events."*

**Try to break it, out loud:** press `traffic_burst` with a multiplier of 1000 via curl. It comes
back **400** — *"multiplier must be a number in [1, 20]"*. Arguments are **refused, never clamped**:
a silently clamped multiplier puts a figure on screen nobody asked for, and the reviewer then reads
the resulting backpressure as the model's rather than as the clamp's.

---

## Beat 6 — walk a number back to its events (B51, B52, B53, B54, B55)

**This is hard requirement #5 and the brief's own question**: *"can you trace any number on screen
back to the raw events beneath it — and do they agree?"* The answer has to be **demonstrated**, not
claimed, so every step below is a click.

### The quarantine, before any click (B51, B52)

22. **Say it before showing it:** *"Every performance number on this page renders through one
    component, and that component will not compile without a server-issued descriptor. The
    descriptor is the **query**, not the answer — which metric, which ads, which window, at which
    grain, at which log position — and it is HMAC-signed, so the browser cannot mint one."*

    **Then say what that buys:** *"If I wanted to put a number on screen by summing the raw event
    tail, there is no third argument to `<Metric>` that typechecks. Money on a tail frame is a
    branded display string — `\"$0.42\"` — and arithmetic on it is a compile error. Three layers,
    two of them at compile time, and the third is the thing I am about to click."*

    The one exception is named on the surface: the stream-health figures under the tail are real
    numbers and they describe the **transport**, not the ads.

### The click, and the verdict (B53 / P12)

23. **Select ONE ad in the left rail and a window that has ENDED, then click the ROAS figure in the
    headline.** The panel opens under it with the query in full, then: **displayed** from
    `rollup_minute`, **recomputed** from raw `signals` with attribution re-derived from zero, and
    the verdict.

    **⚑ found by following this script — do not skip the sentence above.** Click ROAS on the default
    view (all twelve ads, a window ending *now*) and the verdict reads **`NOT_COMPARABLE`**, not
    `MATCH`. That is correct, and the panel explains it: the descriptor was signed at the snapshot's
    `as_of_ingest_seq`, and by the time the recomputation finishes, more events have landed in the
    window, so `rollup_minute` reflects a later log position than the recomputation answers. With
    twelve ads emitting, seven events land inside a seven-second read and pressing *now* will simply
    race again. **One ad, or a window in the past, and it reads `MATCH`** — both measured. Say it
    out loud if it happens; it is the honest answer and it is the same mechanism as step 26.

    **And it is not instant.** Measured: **0.6–1.4 s** for one ad over six hours, **6.5 s** for all
    twelve, **7–10 s** in the browser on a live 24 h window. The panel shows *replaying the log…*
    while it works. `replay()` must read every click and every conversion in the prefix regardless
    of window, because a conversion's own `ts` can sit far outside the window it belongs to.

    Measured on the seeded week, `a_03` over six hours: **MATCH · displayed 10.20× · recomputed
    10.20×**, over 360 buckets and **10,481 raw rows**. Both count sets are shown side by side —
    9,980 impressions, 129 clicks, 6,933¢ + 1,952¢ spend, 12 conversions, 90,593¢ value — from two
    routes that share no code.

    **Say:** *"The display path reads the rollup, built incrementally at ingest. The check path
    reads raw events and recomputes from nothing. If the client did the arithmetic, this would be
    comparing the client to itself and would prove nothing."*

24. **Point at the evidence list, and at one column in it.** All twelve conversions appear, and each
    has a `ts` and a **credited minute** that are not the same. Pick the one at **14:58:48 credited
    to 14:43** and say: *"That is D27-B. A conversion lands in its **click's** minute, not its own —
    which is why this list looks wrong for about two seconds and then looks right."*

    **Then say why the list is ordered as it is** — it is a measured finding, not a preference:
    *"In log order the first 400 of 10,481 contributors were all impressions. Not one conversion
    made the cap, so a ROAS sat above a list containing nothing that earned any revenue. Every
    number was correct and the evidence was useless. Conversions fill the sample first."*

25. **Break it on purpose.** On a scratch copy, add 7 impressions to one `rollup_minute` row by hand
    and click the same number again:

    ```
    VERDICT MISMATCH | displayed impr 1523 | recomputed impr 1516 | roas 5.5559 both sides
    ```

    **Say:** *"The ratio is unmoved and the counts are not. That is why both are compared and why
    the counts are compared exactly — a ratio can agree while its terms do not. Undo the edit and
    the same click reads MATCH."*

### The rewind, which is what makes restatement provable (B54 / §10.3)

26. **Type an earlier `ingest_seq` into the drill-down and press rewind.** Take `a_01`'s minute
    `2026-08-28T20:01` — the one the `late_cascade` restated six times:

    | as_of | conversions | value | ROAS | verdict |
    |---|---|---|---|---|
    | 1587167 | 0 | $0.00 | 0.00× | NOT COMPARABLE |
    | 1587170 | 3 | $339.49 | 84.87× | NOT COMPARABLE |
    | 1587173 | 6 | $477.01 | 119.25× | **MATCH** |

    The panel names **exactly three `event_id`s** as the difference between the middle row and the
    last, each with its own lateness — and their `value_cents` sum to **13,752**, which is exactly
    47,701 − 33,949.

    **Say:** *"That turns 'a conversion landed late and rewrote Tuesday' from a claim into a diff.
    And notice the verdict withholds itself on the first two rows rather than saying MISMATCH: the
    rollup has no `as_of` — it is the fold of everything applied to it — so an earlier prefix is not
    a check on it. It becomes comparable at exactly 1587173, the bucket's own `max_ingest_seq`."*

    **This one is worth flagging as a finding**: the withheld verdict exists because running the
    rewind showed the surface crying wolf on a correct store. It was found by using the feature, not
    by reading the code.

### One event, end to end (B55 / P13)

27. **Copy an `event_id` out of the raw tail — or out of the evidence list above — and paste it into
    the trace box.** Eight steps come back, each naming the table it came from. On the late cascade's
    `cc176d2ff5046ee2`:

    - **1 EMIT** — the payload as it arrived, with the caveat stated: a re-serialisation of the
      parsed element, not the received bytes.
    - **2 ARRIVE** — `received_at 2026-09-04T19:58:45.571Z`, disposition `accepted`.
    - **3 STORE** — `ingest_seq 1587173`, conversion on `a_01`, ts `2026-08-28T20:01:44Z`,
      **168.0 h between emission and arrival**.
    - **4 ATTRIBUTE** — resolved to click `31a412e21db104d8`, credited to minute **20:01** under
      generation `g_a_01_002`.
    - **5 ROLL UP** — that bucket: 6 conversions, $477.01, **RESTATED 6×**.
    - **6 TRANSPORT** — *"not stored, deliberately"*, with the reason on screen.
    - **7 PIXEL** — which point moved, and that the timeline gains an entry **at that minute**.
    - **8 PROVE** — a button that opens the drill-down on that one minute.

    **Say:** *"That is the brief's 'life of one event' deliverable, and it is a control rather than
    a paragraph. Step 6 is the only step with no table behind it, and the screen says so — which SSE
    frame carried a bucket is a property of a connection that has closed, and a table recording it
    would be a projection with a second writer."*

28. **Paste three awkward ids** to show the trace is not a happy path:

    - a **duplicate**: two deliveries, `accepted` then `duplicate_identical`, one canonical row.
    - a **rejected** delivery: one delivery, **no** `signals` row — *"that is an answer, not an
      error; the boundary records every delivery it is offered."*
    - an **orphan**: `orphan_provisional`, no click, held at its **own** minute and excluded from
      CPA and ROAS until it resolves.
    - and, if you want the fourth: a **clock-skewed** event, where `ts` is *after* `received_at` and
      the screen reads **"30 s EARLY (clock skew — clamped, I10)"** with `ts_effective` pulled back.

29. **Close the beat with `npm run agree`** — the same claim swept over every bucket in the store
    rather than the one you clicked.

    **Say:** *"The drill-down is this check on one number, in front of you. `agree` is it on all of
    them."*

### And the Workbench screen, which closes beat 7 (B56 / P15)

30. **Scroll to the component library.** Fourteen lineages; one of them has two versions:

    > **Product demo, 30s — recut, tighter open** · video · `vl_04` — **2 versions, live in 3 ads**
    > · `a_01 a_12 a_05`
    > &nbsp;&nbsp;&nbsp;&nbsp;`v1` `v_04` — Product demo, 30s · live in **2** · `a_01 a_12`
    > &nbsp;&nbsp;&nbsp;&nbsp;`v2` `v_05` — recut, tighter open · cut from `v_04` · live in **1** · `a_05`

31. **Pause `a_01` in the console above and scroll back.** `vl_04` reads **live in 2 ads, 1 paused**,
    and `v1` splits into live=1 paused=1. Resume and it returns to 3.

    **Say:** *"Nothing recomputed a cache and there is no reverse index. `ads.status` is written only
    by the fold, so this count is exactly as current as the last lever — that is §8's 'kept current
    as ads launch and die' falling out of the write path rather than needing machinery."*

    **And say what it does not answer:** *"This is 'used in N ads **right now**'. 'At time T' and
    'ever' are one join away over `config_generations`, which exists for D14's sake regardless. They
    are a scope cut and the README carries the real query — not a modelling gap."*

---

## Beat 8 — kill everything and restart, and the world is still there (B61)

This is the strong version of the refresh test in beat 4, and it is the hard requirement the brief
puts first: *"losing the world on reload is the one prototype shortcut we won't accept."* It takes
about forty seconds and it is worth every one of them.

32. **Say what you are about to do before you do it.** *"I am going to kill the server, the
    simulator and the web server — everything except the file on disk — and start them again."*

33. **Note the log position first**, so the claim is a number rather than an impression:

    ```
    curl -s localhost:8787/api/health
    # {"status":"ok", … "log_position":{"ingest_seq":1592849,"decision_seq":33} … }
    ```

34. **Ctrl-C the `npm start` terminal.** One `[dev] SIGINT — stopping 3 processes`, then the ports
    are released. Confirm it, because "it looked stopped" is not stopped:

    ```
    ss -ltn | grep -E ':8787|:5173'    # nothing
    ```

35. **`npm start` again.** It comes up in about a second — `12 ads already exist — not seeding` —
    and the simulator logs its own recovery:

    ```
    [start] 12 ads already exist — not seeding (delete data/ to reset, U8)
    [sim] handover: 13,494 backfilled click(s) awaiting a conversion — fetched once, not polled
    [sim] world seed 'flawless-loop' · T0 2026-09-04T16:03:18.970Z
    [sim] sent 150 · accepted 44 · dup 104/1 · rejected 1 · ingest_seq 1592893
    ```

36. **Point at that fourth line, because it is the beat.** The emitter re-derived **150 events** for
    the seconds it was dead, and **104 of them were already in the store** and landed as
    `duplicate_identical` — moving no number anywhere. Only the **44** it had genuinely never sent
    were accepted.

    **Say:** *"It holds no queue and no cursor. Every `event_id` is derived from `(seed, absolute
    unix second, index)`, so a restarted emitter regenerates exactly the same events for the same
    seconds and the ingest boundary recognises them. Restart safety is not a feature we built — it
    is what keyed ids give you for free, and the duplicate counter is the proof it is really
    happening rather than being skipped."*

    **And say what it is not:** *"One conversion the live half had in flight is lost across this —
    a live click's schedule is known only to the process that emitted it. The backfilled half, which
    is most of what you have been watching convert, is re-derivable from the store and comes back.
    That is a stated limit in the README, not a surprise."*

37. **Reload the browser.** Twelve ads, seven days of history, all **33 decisions** including the
    ones you pulled ten minutes ago, the paused ad still paused, and the newest bucket climbing
    again. Measured: `33 of 33 decisions`, `5.8/s events`, live bucket at the current minute.

    **Say:** *"The SQLite file is the world. The server opens it and serves; the simulator asks it
    what is live and starts emitting again. Everything you did survived, because everything you did
    was one row appended to a log."*

38. **Close on `/api/verify`.** `200`, four projections rebuilt from the logs from zero and
    hash-matched, after a restart and after every lever in this demo.

    **Say:** *"That is the whole claim in one call: the two logs are the world, and everything else
    on that screen is a projection that can be dropped and rebuilt to the byte."*

---

## Notes for whoever runs this

- **The simulator is a separate process** and holds no durable state (D40-A). Killing it stops
  emission; restarting it resumes without loss, and the re-emitted seconds land as
  `duplicate_identical`, which the ingest counters show.
- **⚑ Run `npm start` twice before the demo**, on the store you are going to demo. The first run
  seeds (five and a half minutes); the second proves it will not reseed, and warms nothing that
  matters but your confidence.
- **⚑ The restatement panel is empty on a short window and says so.** *"No settled bucket in this
  window has moved. Widen the window to seven days."* That is not a failure — the seeded week's ten
  restatements are days back. Widen to `7d` before you point at it, or fire `late_cascade` first.
- **⚑ One server per store.** If a previous run is still holding the port, the new one exits on
  `EADDRINUSE` and the runner tears the rest down — loudly, which is the good case. The bad case is
  a *stale* server that kept the port while you thought you restarted: trace descriptors are signed
  with a per-process key, so the page will read `invalid_signature` on its next click and look
  broken for a reason nobody can find. `ss -ltn | grep :8787` between beat 8's steps 34 and 35 is
  four seconds well spent.
- **A conversion can land on a paused ad** and that is correct, not a bug — **D63**. Pause stops new
  delivery; a purchase already earned by an earlier click still settles. Say it before it happens
  rather than explaining it after.
