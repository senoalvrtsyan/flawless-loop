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
| 2 | Read a signal off the chart | B37, B38 | — |
| 3 | The gate refuses to draw a ratio it cannot support | B40 | — |
| 4 | **Pull a lever, the world responds** — pause `a_12`, its events stop | B46, B47 | — |
| 5 | **A late conversion restates a settled bucket** | B42, B43, B49 | — |
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

## Notes for whoever runs this

- **The simulator is a separate process** and holds no durable state (D40-A). Killing it stops
  emission; restarting it resumes without loss, and the re-emitted seconds land as
  `duplicate_identical`, which the ingest counters show.
- **A conversion can land on a paused ad** and that is correct, not a bug — **D63**. Pause stops new
  delivery; a purchase already earned by an earlier click still settles. Say it before it happens
  rather than explaining it after.
