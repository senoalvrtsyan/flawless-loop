# DEMO.md — the walkthrough

**Created at B36 under D50, and written incrementally: every stage-4 and stage-5 group appends its
own steps as it lands and says so in its report.** B61 is the final ordered pass over this file —
it re-orders, prunes and rehearses, but it does not write the content cold, because a script
assembled at the end from memory is a script that describes an app nobody checked.

**Status: stage 4 in progress. This is not yet a runnable script end to end.**

---

## 0 — Before the demo

```
node -v                 # 24+ required — node:sqlite is unflagged there (D8)
npm i
npm run db:migrate
npm run seed            # ~5m20s, ~750 MB, writes SEVEN DAYS of history (D39/B34)
npm run dev             # server :8787 · simulator · Vite :5173
```

Open **http://localhost:5173**.

**Seed once, well before the demo.** `SIM_BACKFILL_DAYS=5` is the wired lever if time is short; both
depths exceed the 72 h settlement horizon, so nothing about settlement changes. A **7-day** store is
what makes a handed-over conversion land in an already-*settled* bucket, which is the restatement
moment — a 1-day store cannot produce one.

**Sanity, before anyone is watching:**

```
curl -s localhost:8787/api/health
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/api/verify   # 200
npm run agree                                                       # OK
```

---

## The spine

Eight beats, in the order the brief cares about. Beats are filled in as their chunks land.

| # | Beat | Chunk | Written? |
|---|---|---|---|
| 1 | **The world has a past** — the app opens onto seven days, not an empty chart | B36 | ✅ below |
| 2 | Read a signal off the chart | B37, **B38** | ✅ below — ratios landed at B38 |
| 3 | The gate refuses to draw a ratio it cannot support | **B39**, B40 | ✅ below |
| 4 | **Pull a lever, the world responds** — pause `a_12`, its events stop | B46, B47 | — |
| 5 | **A late conversion restates a settled bucket** | **B41, B42, B43**, B49 | ✅ below |
| 6 | **Walk a number back to its events** | B52, B53 | — |
| 7 | Configs are versioned; the swap is visible | B48, B56 | — |
| 8 | Kill everything and restart — the world is still there | B60 | — |

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

## Notes for whoever runs this

- **The simulator is a separate process** and holds no durable state (D40-A). Killing it stops
  emission; restarting it resumes without loss, and the re-emitted seconds land as
  `duplicate_identical`, which the ingest counters show.
- **A conversion can land on a paused ad** and that is correct, not a bug — **D63**. Pause stops new
  delivery; a purchase already earned by an earlier click still settles. Say it before it happens
  rather than explaining it after.
