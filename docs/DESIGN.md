# DESIGN.md

**Phase 2 output.** Architecture and data model. Written 2026-09-03, after the Phase 2 decision
pass — every choice below traces to a ratified entry in `docs/DECISIONS.md`; nothing here is
decided by this document.

**Reading order.** `CLAUDE.md` → `docs/STATUS.md` → this file. Scope is `docs/SCOPE.md`; the audit
register and the full extensions list are `docs/BRIEF_GAPS.md`; option analysis behind each
decision is `docs/OPEN_QUESTIONS.md`.

**Still no code.** Types below are design artifacts. Nothing exists on disk outside `docs/`.

---

## 1 — The three-way split

The brief grades whether *"configs, signals, and levers [are] kept distinct in your model"* (L143)
and asserts that *"a live ad's config changes only through levers"* (L42). Per **D21** the split is
physical, not conventional: three kinds of thing, in separate tables, with separate write rules.

| Kind | Tables | Mutability | Who may write | Authority |
|---|---|---|---|---|
| **Levers** | `decisions` | **Append-only** | the lever endpoint | **Authoritative** |
| **Signals** | `signal_deliveries`, `signals` | **Append-only** | the ingest endpoint | **Authoritative** |
| **Configs** | `ads`, `config_generations` | **Derived** | *only* the apply/replay function | Rebuildable projection |
| Interpretation of signals | `conversion_attribution`, `rollup_minute` | **Derived** | *only* the apply/replay function | Rebuildable projection |
| Reference data | `components`, `audiences` | **Static** | the seeder, once | Fixture |

Four categories, not three, and the fourth is the interesting one. **Nothing that arrives is ever
edited, and nothing that is derived is ever written by hand.** A signal row records what a delivery
said; every *interpretation* of it — which bucket it belongs to, which click it attributes to,
which generation earned it — lives in a projection that can be dropped and rebuilt. This is why
`conversion_attribution` is a separate table rather than three nullable columns on `signals`: a
late click changes the interpretation of a conversion, and if that interpretation lived on the log
row we would be mutating the log.

### The rule that carries the design

> **Nothing writes a projection except the replay/apply function.** (`CLAUDE.md` §5, per **D7**.)

There is exactly one function that turns facts into projections. The live path calls it with one
new fact; the rebuild path calls it with the whole log from zero. Because they are the same
function, *"drop every projection, replay, get identical numbers"* is a runnable check (P14) rather
than an assertion — and a chunk that updates a projection directly breaks the one property this
design exists to demonstrate, without failing a test.

### In code

```ts
// Three envelopes with the same shape (D21) so the timeline merge is mechanical,
// and three disjoint payload unions so nothing can be mistaken for anything else.

type Envelope = { ts: string; received_at: string; seq: number };

type Signal   = Envelope & { event_id: string; ad_id: string } & SignalBody;   // arrives
type Decision = Envelope & { decision_id: string; ad_id: string;
                             actor: `human:${string}` | `system:${string}`;
                             rationale: string } & DecisionBody;               // is issued
type AdConfig = { /* §2 */ };                                                  // is derived
```

`Signal.seq` is `ingest_seq`; `Decision.seq` is `decision_seq`. They are **separate sequences over
separate stores** — the shared *shape* is what makes the unified timeline a sort, and the separate
*sequences* are what keeps the stores independent. The timeline merges on `ts` with
`(source, seq)` as tie-break; it is a read-model concern and no table knows about it.

**Why not one physical log with a `kind` discriminator** (D21 option B): it is slightly cheaper and
it invites exactly the question we do not want to spend the demo answering. The brief grades the
distinction; making it physical answers the question before it is asked.

**Where the brief is wrong here, and what we did.** L125 says a lever *"shows up in the stream"*,
but `Decision` is not a member of the `Signal` union (G35). We take the second reading — a lever's
*effect* shows up in the stream, because pausing stops the impressions — and merge the two only in
the read model. No synthetic signal is emitted for a decision; that would be duplicated state that
can diverge.

---

## 2 — Storage model

**Store: SQLite on the server via built-in `node:sqlite`** (**D8**). Node 24+ pinned in `engines`
and `.nvmrc`. No new dependency; the ~10-line transaction wrapper is ours. Flip condition to
`better-sqlite3` is written into D8 so it is not a later judgement call.

```sql
PRAGMA journal_mode = WAL;      -- verified on this machine: returns 'wal'
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous  = NORMAL;   -- WAL + NORMAL: durable across process kill, not across power loss
```

**Verified on this machine, not recalled** — same method D8 was settled by. Node v24.14.0, SQLite
3.51.2 via `node:sqlite`: the `STRICT` tables below create; the `ts_effective` generated column
accepts `MIN()` and does clamp (a `ts` of 2099 stored against a `received_at` of now yields
`ts_effective = received_at`, with the emitted `ts` intact); the partial `UNIQUE` index on
`click_id` rejects a second click claiming an existing id; and `STRICT, WITHOUT ROWID` accepts the
`ON CONFLICT … DO UPDATE` upsert the rollup path depends on. Nothing in §2 rests on an untested
claim about the driver.

`synchronous = NORMAL` is the deliberate line: it survives *"the simulator process being killed and
restarted mid-demo"* and an app restart, which is what hard requirement #1 asks for. It does not
survive a host power cut, which nothing in the brief asks for.

### 2.1 Reference data — static, seeded once

```sql
CREATE TABLE components (
  component_id TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('video','image','headline','body_copy')),
  payload      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  lineage_id   TEXT NOT NULL,                                    -- E10 (D3)
  version      INTEGER NOT NULL DEFAULT 1,                       -- E11 (D3)
  parent_id    TEXT REFERENCES components(component_id)          -- E12 (D3)
) STRICT;
CREATE INDEX ix_components_lineage ON components(lineage_id, version);

CREATE TABLE audiences (
  audience_id TEXT PRIMARY KEY,
  geo         TEXT NOT NULL,                                     -- ISO 3166-1 alpha-2
  temperature TEXT NOT NULL CHECK (temperature IN ('cold','warm','retargeting')),
  est_size    INTEGER NOT NULL
) STRICT;
```

`channel` is the brief's inline enum and gets no table (G08 noted, not fixed). Audiences and
channels are static reference data and **no lever changes an ad's audience or channel** (U3).

### 2.2 The signal log — append-only, authoritative

Two tables, because **D15** keeps every delivery while letting exactly one win.

```sql
-- Every delivery, including duplicates and rejects. Never read on the hot path.
CREATE TABLE signal_deliveries (
  delivery_seq INTEGER PRIMARY KEY,        -- rowid alias; monotonic arrival order of deliveries
  event_id     TEXT NOT NULL,
  received_at  TEXT NOT NULL,              -- E1: server clock, at this boundary (D12)
  payload_json TEXT NOT NULL,              -- exactly as received, before any normalisation
  payload_hash TEXT NOT NULL,              -- to classify a redelivery as identical or conflicting
  disposition  TEXT NOT NULL CHECK (disposition IN
                 ('accepted','duplicate_identical','duplicate_conflicting','rejected_invalid'))
) STRICT;
CREATE INDEX ix_deliveries_event ON signal_deliveries(event_id);
```

```sql
-- The canonical fact. One row per event_id, first accepted delivery wins (D15 / I7).
CREATE TABLE signals (
  event_id     TEXT PRIMARY KEY,                      -- ** the dedupe key ** (brief L73)
  ingest_seq   INTEGER NOT NULL UNIQUE,               -- E2: total replay order + SSE cursor (D12)
  received_at  TEXT NOT NULL,                         -- E1
  ts           TEXT NOT NULL,                         -- event time, as emitted, never altered
  ts_effective TEXT NOT NULL
    GENERATED ALWAYS AS (MIN(ts, received_at)) STORED,-- I10: clock-skew clamp (G44)
  ad_id        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('impression','click','spend','conversion')),
  source       TEXT NOT NULL CHECK (source IN ('backfill','live')),  -- E15: server-assigned (D38)

  click_id            TEXT,        -- E3 (G17): click only, distinct from event_id
  cost_cents          INTEGER,     -- click only: the CPC charge (L78)
  amount_cents        INTEGER,     -- spend only: a DELTA for one fixed interval (I1 / G19)
  attributed_click_id TEXT,        -- conversion only -> signals.click_id
  value_cents         INTEGER,     -- conversion only: gross (U4)

  CHECK (kind <> 'click'      OR (click_id IS NOT NULL AND cost_cents >= 0)),
  CHECK (kind <> 'spend'      OR amount_cents >= 0),
  CHECK (kind <> 'conversion' OR (attributed_click_id IS NOT NULL AND value_cents >= 0)),
  CHECK (kind <> 'impression' OR COALESCE(cost_cents, amount_cents, value_cents) IS NULL)
) STRICT;

CREATE UNIQUE INDEX ux_signals_click_id ON signals(click_id)            WHERE kind = 'click';
CREATE INDEX        ix_signals_attr     ON signals(attributed_click_id) WHERE kind = 'conversion';
CREATE INDEX        ix_signals_ad_time  ON signals(ad_id, ts_effective);
```

Notes that are decisions, not style:

- **`ts` is never altered.** The skew clamp (I10) is a *generated* column, so the clamped value
  cannot drift from the rule that produced it and the emitted value is still there to show.
- **`source` is assigned by the server, from which path the batch arrived on** — never by the
  emitter (**D38-B**). It separates the seeded population from the observed one, which D33's
  maturity label discloses (*"1,432 settled conversions (1,180 seeded)"*) and which any figure
  resting on history can be checked against.
- **`ux_signals_click_id` is unique and partial.** A second click claiming an existing `click_id`
  is a detectable error rather than a silent double-count — which is the whole reason E3 exists.
- **`ix_signals_attr`** is what makes the reverse direction cheap: when a click finally arrives,
  find the orphaned conversions waiting for it (§5).
- **`ix_signals_ad_time`** is the traceability path — the raw re-sum behind every displayed number.
- No index on `ingest_seq`; `UNIQUE` already builds one.

### 2.3 The decision log — append-only, authoritative

```sql
CREATE TABLE decisions (
  decision_id  TEXT PRIMARY KEY,                      -- U5: client-generated idempotency key
  decision_seq INTEGER NOT NULL UNIQUE,               -- E6: the fold order
  ts           TEXT NOT NULL,                         -- U7: request time; backdating rejected
  received_at  TEXT NOT NULL,
  actor        TEXT NOT NULL,                         -- U2: hard-coded 'human:nk'
  ad_id        TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN
                 ('create_ad','launch','pause','resume','set_budget','swap_component')),
  rationale    TEXT NOT NULL CHECK (length(trim(rationale)) > 0),   -- brief L95: required
  payload_json TEXT NOT NULL                          -- the action's variant fields
) STRICT;
CREATE INDEX ix_decisions_ad_seq ON decisions(ad_id, decision_seq);
```

`create_ad` and `launch` are extensions E4/E5 (**D5**) — without them the fold has no origin and
L125's *"current config is derivable"* is false as written (G33).

```ts
type DecisionBody =
  | { action: "create_ad"; initial: Omit<AdConfig, "status" | "launched_at"> }   // E4
  | { action: "launch" }                                                          // E5
  | { action: "pause" } | { action: "resume" }
  | { action: "set_budget";     from_cents: number; to_cents: number }
  | { action: "swap_component"; slot: "video" | "headline"; from_id: string; to_id: string };
```

**`from_cents` / `from_id` are a precondition, not an annotation** (I13, G24). The lever rejects the
decision if they disagree with the current fold. With one actor (U2) this is a **staleness guard** —
a stale tab, a double-submit, a retried POST — and **not** a concurrency feature; there is no second
writer and the README says so rather than implying a multi-actor story we cannot demonstrate.

### 2.4 Projections — derived, rebuildable, one writer

```sql
CREATE TABLE ads (                                    -- current config: the fold's head (D7)
  ad_id                 TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,                -- E8 (G03)
  created_at            TEXT NOT NULL,                -- E7 (G03)
  status                TEXT NOT NULL CHECK (status IN ('draft','live','paused','archived')),
  video_id              TEXT NOT NULL REFERENCES components(component_id),
  headline_id           TEXT NOT NULL REFERENCES components(component_id),
  audience_id           TEXT NOT NULL REFERENCES audiences(audience_id),
  channel               TEXT NOT NULL CHECK (channel IN
                          ('meta_feed','meta_reels','tiktok_feed','snap_stories')),
  daily_budget_cents    INTEGER NOT NULL CHECK (daily_budget_cents >= 0),
  launched_at           TEXT,                         -- G02: written only by the fold
  current_generation_id TEXT NOT NULL,                -- E9
  last_decision_seq     INTEGER NOT NULL              -- the fold's position for this ad
) STRICT;
CREATE INDEX ix_ads_status ON ads(status);
```

`archived` is reachable by no lever (**F1**). The fold carries one branch for it that can never
fire, written to explain itself — *"no lever produces this state; see `SCOPE.md` §4 cut #3"* — not
as a thrown error, because an unreachable branch that throws reads as a bug guard and this is a
scope cut.

```sql
CREATE TABLE config_generations (                     -- E13 (D2, P5): "the config of a_12 on Sunday"
  generation_id       TEXT PRIMARY KEY,
  ad_id               TEXT NOT NULL,
  seq_in_ad           INTEGER NOT NULL,
  valid_from          TEXT NOT NULL,                  -- the opening decision's ts
  valid_to            TEXT,                           -- NULL = currently live
  opened_by_decision  TEXT NOT NULL REFERENCES decisions(decision_id),
  video_id            TEXT NOT NULL,
  headline_id         TEXT NOT NULL,
  audience_id         TEXT NOT NULL,
  channel             TEXT NOT NULL,
  daily_budget_cents  INTEGER NOT NULL,
  status              TEXT NOT NULL,
  UNIQUE (ad_id, seq_in_ad)
) STRICT;
CREATE INDEX ix_gen_ad_window ON config_generations(ad_id, valid_from);
```

A **half-open interval** `[valid_from, valid_to)`. "Config of `a_12` at `T`" is an indexed lookup,
which is what **D14**'s click-time attribution needs on every late conversion.

```sql
CREATE TABLE conversion_attribution (                 -- how we currently read each conversion
  event_id               TEXT PRIMARY KEY REFERENCES signals(event_id),
  state                  TEXT NOT NULL CHECK (state IN
                           ('resolved','orphan_provisional','orphan_expired')),
  click_event_id         TEXT,                        -- the resolved click, once known
  credited_ad_id         TEXT NOT NULL,               -- the click's ad_id once resolved (I8)
  credited_minute        TEXT NOT NULL,               -- ** D27-B: the click's minute **
  credited_generation_id TEXT,                        -- D14: generation live at the click's ts
  ad_id_conflict         INTEGER NOT NULL DEFAULT 0,  -- G30: conversion.ad_id <> click.ad_id
  resolved_at            TEXT
) STRICT;
CREATE INDEX ix_attr_unresolved ON conversion_attribution(state) WHERE state <> 'resolved';
```

`credited_minute` is stored, not computed, for one reason: when a late click resolves an orphan, the
apply function must **decrement the bucket the conversion was previously counted in**. Without the
previous placement recorded, that bucket cannot be found.

```sql
CREATE TABLE rollup_minute (                          -- D9, D10, D28, D29
  ad_id                   TEXT    NOT NULL,
  minute_start            TEXT    NOT NULL,           -- ISO 8601 UTC, seconds and ms zeroed
  impressions             INTEGER NOT NULL DEFAULT 0,
  clicks                  INTEGER NOT NULL DEFAULT 0,
  click_cost_cents        INTEGER NOT NULL DEFAULT 0, -- CPC charges  (L78)
  spend_cents             INTEGER NOT NULL DEFAULT 0, -- non-click charges, disjoint (L79-80)
  conversions             INTEGER NOT NULL DEFAULT 0, -- credited at the CLICK's minute (D27-B)
  value_cents             INTEGER NOT NULL DEFAULT 0,
  provisional_conversions INTEGER NOT NULL DEFAULT 0, -- orphans, held at their own ts (D16)
  provisional_value_cents INTEGER NOT NULL DEFAULT 0,
  first_written_at        TEXT    NOT NULL,
  restated_at             TEXT,                       -- D13/P7: set when a settled bucket moves
  restatement_count       INTEGER NOT NULL DEFAULT 0,
  max_ingest_seq          INTEGER NOT NULL,           -- the as-of stamp (D31)
  PRIMARY KEY (ad_id, minute_start)
) STRICT, WITHOUT ROWID;
CREATE INDEX ix_rollup_time ON rollup_minute(minute_start);
```

**Only additive counts. No ratios.** (**D10**.) Ratios do not aggregate; their numerators and
denominators do. Storing a ratio is a correctness bug in a performance costume, and the restatement
path then only ever has to fix integers.

`click_cost_cents` and `spend_cents` are kept apart because the brief keeps them apart: spend events
are *"non-click charges (CPM, fees); disjoint from click costs — total spend = sum of both"* (L79-80).
Total spend is a read-time sum, never a stored third column that could disagree with its parts.

**The hot read path and its index.** The Signal screen draws one series per ad over a window, so the
dominant query is *N contiguous range scans on the primary key*:

```sql
SELECT * FROM rollup_minute
 WHERE ad_id = ?1 AND minute_start >= ?2 AND minute_start < ?3
 ORDER BY minute_start;                                    -- PK (ad_id, minute_start), WITHOUT ROWID
```

`WITHOUT ROWID` means the row *is* the index entry — one B-tree seek per series, no indirection.
`ix_rollup_time` serves the two queries that go the other way: the cross-ad portfolio window, and
the settlement sweep that re-evaluates which buckets are settled when the horizon changes (P16).

```sql
CREATE TABLE projection_meta (                        -- rebuild bookkeeping, and the divergence check
  name          TEXT PRIMARY KEY,                     -- 'ads' | 'config_generations' | ...
  rebuilt_at    TEXT NOT NULL,
  source_seq    INTEGER NOT NULL,                     -- log position this projection reflects
  content_hash  TEXT NOT NULL                         -- for /verify (§7)
) STRICT;
```

```sql
CREATE TABLE sim_scenarios (                          -- D40 / F3 (P17): the third replay input
  scenario_id  TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,                         -- when it was triggered
  name         TEXT NOT NULL,                         -- 'fatigue_collapse' | 'late_cascade' | ...
  args_json    TEXT NOT NULL,
  consumed_at  TEXT                                   -- NULL until the simulator picks it up
) STRICT;
```

Not a projection and not a signal: it is **simulator input**, persisted because the reproducibility
claim names it. Determinism is `(seed + decision log + sim_scenarios) → world` (**D40**), and a
claim whose third input lives in memory is false. `SIMULATOR.md` §17.

### 2.5 What is a table, what is a log, what is derived — the one-line answer

**Logs:** `decisions`, `signals` (+ `signal_deliveries` as its raw arrival record).
**Tables (static):** `components`, `audiences`.
**Simulator input:** `sim_scenarios` — neither a fact about the world nor derived from one.
**Derived:** `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`,
`projection_meta`.
**Cached:** nothing. There is no cache tier — see §4.3 for why that is a decision and not an
omission.

---

## 3 — The persistence boundary

**Per D8: the server owns every fact. The client owns nothing durable.**

| Lives in the client | Lives in the store | Recomputable from the logs |
|---|---|---|
| Viewport: window, selected ads, granularity, chart toggles | `signals`, `signal_deliveries`, `decisions` | `ads`, `config_generations` |
| The SSE cursor (last `ingest_seq` seen) | `components`, `audiences` (seed fixtures) | `conversion_attribution`, `rollup_minute` |
| A render cache of bucket rows for the visible window | | the maturity CDF (D33), every ratio (D10) |
| A capped ring buffer of tail frames (D34) | | |

Nothing in column 1 is persisted — no `localStorage`, no IndexedDB, no service worker. If the
browser is closed the only thing lost is which ads were selected.

**Why the boundary sits there.** D8 rejected client-side persistence *on principle*: it passes the
refresh test and fails the premise. The world would become an artifact of one browser profile, the
simulator would have to run in the client, and *"state survives an app restart"* would mean "as long
as you use the same laptop". The reviewer's mid-demo refresh (L157) is the weak version of the test;
the strong version is killing the process, and only a server-side store passes it.

**Why the third column exists at all.** It is the brief's own question — *"what is recomputable from
the event log"* — and the answer is deliberately maximal: **everything except what arrived**. Two
logs and a fixture set are the entire irreducible state. That is what makes `/verify` (§7) and the
agreement test (P14) meaningful rather than decorative.

### 3.1 Cold start: empty client, populated store

1. `GET /api/snapshot?from=…&to=…&ads=…` → `{ ads[], generations[], decisions[], buckets[],
   stream_health, as_of_ingest_seq }`. One request, one read transaction, consistent by
   construction.
2. Client opens `EventSource('/api/stream')` with `Last-Event-ID: <as_of_ingest_seq>` (**D18**).
3. Server replays: for every bucket touched by a signal with `ingest_seq > cursor`, send the
   **current absolute row** (**D30**). Not the events; not deltas.
4. Steady state: the same absolute rows on a 250–500 ms flush tick, plus capped tail frames.

**A refresh is step 1–4 again.** There is no separate resume path, no reconciliation, no replay
window to get wrong. This is the reason D30 chose absolute rows over deltas: a delta replayed after
a reconnect double-counts, an absolute row is idempotent, and the reviewer *will* refresh.

If the cursor is older than the server can serve cheaply, the server responds with a
`resnapshot` frame and the client returns to step 1. Stated rather than left to a timeout.

### 3.2 Cold start: empty store

The seeder writes `components` and `audiences`, then appends `create_ad` and `launch` decisions
(E4/E5) to the decision log — **not** rows to `ads`. The `ads` projection appears only because the
fold runs. There is no code path that inserts an ad directly, which is what makes "the log is
authoritative" true rather than aspirational.

### 3.3 App restart, and killing the simulator

The SQLite file is the world. On restart the server opens it, verifies projections against the log
(§7), and serves. **The simulator holds no durable state of its own** — it resumes from
`SELECT MAX(ts) FROM signals`, which means killing it mid-demo and restarting it produces a burst of
catch-up events that exercise the late path without anything being special-cased for the demo.
D17 (Phase 3) owns the emitter's internals; this property is a design constraint on it, recorded
here.

---

## 4 — Aggregation strategy

The brief asks three questions (L121): raw or rolled up; write-time, read-time or cached; and what
gets compacted away. Answered by **D9**, **D10**, **D29** and **D11**.

### 4.1 Retention granularity — D9

| Option | Cost | Behaviour under a late event | What it forecloses | |
|---|---|---|---|---|
| **A — Raw only, aggregate on every read** | Zero write cost; every chart is a full scan over the window. At 7 days × 12 ads that is millions of rows per repaint | Perfect: there is nothing to correct, the next read simply sees more rows | Nothing, in principle — but the live surface becomes unusable, and "the number moved" is invisible because nothing was ever fixed to move | |
| **B — Rollups only, raw discarded after folding** | Cheapest storage and reads | **Lossy.** A late conversion can be added to a bucket, but there is no way to check the bucket against anything | **Traceability (L143) — the graded criterion.** Also drill-down, the agreement test, and any re-bucketing decision ever | rejected outright |
| **C — Hybrid: raw retained forever + minute rollups as a rebuildable projection** | One extra upsert per event; storage is ~2× the raw log | Late event updates the affected bucket(s) and stamps `restated_at`; raw is untouched and remains the check | Nothing. Hours derive from minutes; sub-minute ratios are unavailable and nothing needs them | **chosen** |

**Why C, in one line:** *"drill into this bucket and check it against the raw events"* is not
overhead on top of the deliverable — it **is** the deliverable, so building both representations and
comparing them is the feature (P14).

**Base grain is the minute; hours derive from minutes.** Minute is fine enough that a swap or a
pause is visible in the series, and coarse enough that a 7-day window is ~10k rows per ad.

### 4.2 Rollup key — D28

`(ad_id, minute_start)`. Per-generation numbers come from joining buckets to
`config_generations` by time. Under **D27-B** a conversion already sits in its click's minute and
**D14** credits it to the generation live at the click's `ts` — the generation covering that minute
— so the time-join is not an approximation of the *attribution rule*, only of the minute in which a
generation boundary falls. A swap at 14:03:27 assigns all of minute 14:03 to one generation: one
minute, one ad, per swap. Stated in the README; exact answers remain one raw scan away.

Keying by generation as well (D28-B) was rejected as unnecessary *because D7 makes it cheap to be
wrong about* — re-keying is a re-fold, not a migration.

### 4.3 Where the numbers are computed — D10 and D29

Two different questions that L121 runs together. **Counts** and **ratios** get different answers.

**Ratios — D10: always at read time, never stored.**

| Option | Cost | Behaviour under a late event | What it forecloses | |
|---|---|---|---|---|
| Write time: store CTR/CPA/ROAS per bucket | Cheapest read | Every stored ratio in every affected bucket must be recomputed and rewritten | **Correctness at other granularities**: re-aggregating stored ratios across buckets is arithmetically wrong | disqualified |
| **Read time from stored counts** | A division per displayed point | Nothing to do — the counts moved, so the ratio moves with them | Nothing | **chosen** |
| Cached read-through | Fastest repeat reads | A second invalidation mechanism to keep in step with restatement | Nothing, but it buys nothing at this scale | rejected |

*Store counts, derive ratios* — one rule, and "CTR over any window" is right without a special case
anywhere.

**Counts — D29: maintained incrementally at ingest.**

| Option | Cost | Behaviour under a late event | What it forecloses | |
|---|---|---|---|---|
| **A — Ingest-time incremental upsert, same transaction** | One indexed upsert per event per affected bucket | **Identical code path.** The late event updates an older bucket and stamps `restated_at`; there is no second mechanism | Nothing | **chosen** |
| B — Lazy materialisation, cached, invalidated on late touch | Zero until read | Invalidation must find every cached window overlapping the bucket — the restatement problem, solved a second way | Nothing, but doubles the surface where restatement can be got wrong | rejected |
| C — Periodic batch sweep every N seconds | Amortised, decoupled from ingest latency | Same as A but N seconds later | **The live feel** — a visible lag between "event arrived" and "number moved", and it makes P14 race its own writer | rejected |

The decisive argument for A is not performance. It is that **restatement stops being a feature** —
a late arrival is just an event whose bucket happens to be old, and P7 is a flag and a fan-out
rather than a subsystem.

### 4.4 Compaction — D11

**None is built.** Inside a 7-day horizon there is nothing to compact, so implementing it would mean
shipping a code path that never executes in front of the reviewer. Retention is unbounded in
principle, which is stated rather than hidden.

The policy we *would* adopt is written up instead: past the horizon, compact impressions to
per-minute counts and retain clicks and conversions in full. What that forecloses, precisely: any
question about an *individual* impression past the horizon — its `event_id`, its exact `ts`, its
delivery history — which means the traceability walk-back stops working on old data while the
numbers themselves stay correct. That is the honest answer to the brief's question, and it is a
better one than a mechanism that never fires.

### 4.5 The consequence the strategist actually feels — D27

Not a footnote. **CTR is live; CPA and ROAS lag by cohort.**

| Metric | Numerator lands | Denominator lands | Readable |
|---|---|---|---|
| CTR | click, at its own `ts` | impression, at its own `ts` | **in near-real-time** |
| CPA | spend, at its own `ts` | conversion, **backdated to its click's minute** | after the cohort matures |
| ROAS | conversion value, **backdated to its click's minute** | spend, at its own `ts` | after the cohort matures |

The two families are **not interchangeable for a real-time decision**, and the surface says so. A
strategist watching a newly-swapped creative can act on CTR within minutes and must not act on its
ROAS for hours. This is a property of attribution, not of our implementation — but a cockpit that
does not say it out loud invites exactly the wrong decision, so it is stated on the surface next to
the numbers and in the README.

Two distinct mechanisms carry that message, and they must stay visibly distinct:

- **The gate (D20)** — *too little data to be a ratio.* Fixed statistical bar, adaptive
  granularity: minute → 5 min → 15 min → hour, and **stop**. If the hourly point still fails the
  bar, the ratio is not drawn and the **counts** are shown in its place with the reason stated. A
  chart that says "not enough conversions yet — here are the counts" is honest; one that has quietly
  widened into a single bar is not.
  - CTR: ≥ 500 impressions per plotted point (relative standard error ≈ 30% at p ≈ 2%)
  - CPA, ROAS: ≥ 10 **conversions** per plotted point (RSE of a count of 10 ≈ 32%)
  - Smoothing: EWMA, 15-minute half-life, with a raw toggle
- **The maturity indicator (D33)** — *the data is still arriving.* Per bucket, from the empirical
  attribution-lag CDF measured over settled cohorts: collect `received_at − click.ts` for resolved
  conversions, evaluate at the bucket's age. **Global, not segmented** — at 12 ads a per-channel
  curve would itself be noise. **Always displayed with the sample size it was measured from**
  ("68% mature · measured over 1,432 settled conversions") so it reads as a histogram of our own
  data, not a forecast. The fixed curve (50% @ 1h, 80% @ 6h, 95% @ 24h) is the README's stated
  cold-start fallback and never fires with 7d of backfill.

A young cohort trips both, for different reasons, and the surface says which.

---

## 5 — Late-arriving conversions, end to end

The flagship path. **D12, D13, D14, D15, D16, D27, D29, D30, D33** all land here.

### 5.1 Arrival → dedupe

The simulator POSTs a batch to `/api/ingest` (**D32**). For each event, inside **one transaction**:

1. **Stamp.** `received_at = server now`; `ingest_seq = next()`. **Never emitter-assigned** (D12) —
   an emitter that assigns its own arrival time is describing our latency, not measuring it.
2. **Validate.** Money non-negative integers (U6), `ts` parseable, `ad_id` known, variant fields
   present. Failures are written to `signal_deliveries` with `disposition='rejected_invalid'` and
   counted. **Nothing is silently dropped.**
3. **Clamp.** `ts_effective = MIN(ts, received_at)` (I10). A future-dated `ts` is a clock problem,
   and clamping is honest — the event certainly did not happen after we received it — where
   rejection loses data over someone else's clock.
4. **Dedupe on `event_id`** (L73). Every delivery is written to `signal_deliveries` regardless.
   - Not seen → `accepted`, insert into `signals`.
   - Seen, same `payload_hash` → `duplicate_identical`. Counted, aggregates untouched.
   - Seen, different hash → `duplicate_conflicting`. **First write still wins** (D15/I7); the
     conflicting delivery is retained and surfaced. This matters because it is the *only* channel
     through which a platform correction could reach us (G43) — so we keep the evidence even though
     we do not act on it.
5. **Never reject on ad status** (I11). A conversion attributed to a click from before a pause
   arrives *after* the pause and is exactly the event we care most about. Rejecting events for
   non-live ads would discard it (G48 — a real trap).

### 5.2 Attribution to a click — D14, D16, G30

For a conversion, resolve `attributed_click_id` against `signals.click_id`
(`ux_signals_click_id`):

- **Click found →** `state='resolved'`. `credited_ad_id` = **the click's** `ad_id` — the click is
  authoritative (I8/G30). If the conversion's own `ad_id` disagrees, set `ad_id_conflict = 1` and
  count it; disagreement is surfaced, never silently resolved.
  `credited_generation_id` = the generation whose `[valid_from, valid_to)` contains the **click's**
  `ts` (**D14**).
- **Click absent →** `state='orphan_provisional'`. Revenue is **never silently lost** (D16). With
  no click there is no click-minute, so it is credited provisionally at *its own* minute, into the
  `provisional_*` columns — held apart from the settled counts so an orphan can never be mistaken
  for an attributed conversion.
- **A click arrives later →** `ix_signals_attr` finds every conversion waiting on it, and each is
  promoted (§5.4).
- **Still unresolved past the horizon →** `state='orphan_expired'`. Retained, counted, and
  displayed as a data-health figure — *"6 conversions, $890, no matching click"*. An unresolvable
  conversion is a true fact about the stream and the cockpit should say so, not delete it.

### 5.3 Which bucket it lands in — D27-B

**Event time, never arrival time.** And for a conversion, event time means **the attributed click's
`ts`**, not its own:

```
bucket(impression) = floor_minute(ts_effective)
bucket(click)      = floor_minute(ts_effective)
bucket(spend)      = floor_minute(ts_effective)
bucket(conversion) = floor_minute(click.ts_effective)     <-- D27-B, cohort placement
bucket(orphan)     = floor_minute(own ts_effective)       <-- provisional only, D16
```

A bucket is therefore **"activity at time T, and everything it eventually earned"**, which is what
makes CPA(T) and ROAS(T) real cohort ratios rather than two unrelated populations divided by each
other. It is also the reading under which the brief's own sentence — conversions *"may land hours or
days after its click, retroactively changing periods you thought were closed"* (L83) — describes
what our system actually does.

Minute buckets are UTC. The **account timezone is `America/New_York`** (**D22/I2**) and is used for
exactly one thing: the day boundary at which `daily_budget_cents` resets and the simulator's diurnal
pacing curve turns over. With US audiences a UTC day would roll the budget in the middle of the
afternoon peak, and the resulting discontinuity would be an artifact of our clock rather than a
property of the domain. Computed with built-in `Intl`, no dependency. **Stated limit:** no DST
transition falls inside a September 7-day window, so the DST path is correct by construction and
**untested in the demo window**.

### 5.4 How affected rollups are restated — P7

Restatement is **generic**: *a fact changed, recompute the affected buckets.* It is not
lateness-specific, and D27-B is what forced that — an orphan promotion moves a conversion between
two buckets, so a lateness-only mechanism would have been wrong on the first orphan.

```
applyConversion(ev, prev?):                    -- prev = its previous attribution, if any
  if prev:  bucket(prev.credited_minute) -= prev contribution        -- decrement the old bucket
  bucket(new credited_minute)            += new contribution         -- credit the new one
  for each touched bucket B:
      B.max_ingest_seq = max(B.max_ingest_seq, ev.ingest_seq)
      if settled_at(B, ev.received_at):                              -- NOT wall-clock now
          B.restated_at = ev.received_at;  B.restatement_count += 1
      mark B dirty
```

`settled_at(B, at)` is `at − (B.minute_start + 60s) > horizon`, horizon = **72h** (**D13**),
displayed and adjustable.

**Evaluated at `ev.received_at`, never at wall-clock `now`** — corrected by **D38**. The question a
restatement flag answers is *"was this bucket settled **when this event arrived**"*, and for a live
event the two are the same because `received_at ≈ now`. They diverge exactly once, and expensively:
during seeding (§3.2, D38-E) `now` is boot time, so the wall-clock form would stamp `restated_at` on
**every** backfilled event landing in a bucket older than 72h — tens of thousands of spurious
restatements, and P7 looking broken on frame one. `SIMULATOR.md` §15.3.

Three honest states, and they are the vocabulary the UI speaks in:

| State | Meaning |
|---|---|
| **live** | inside the horizon; still accruing; expect it to move |
| **settled** | past the horizon; we assert it will not move |
| **restated** | it was settled and it moved anyway — with when, by how much, and by which events |

Arrivals past the horizon are **stored and counted separately, never dropped** (D13). An honest
exclusion is a feature; a silent one is the bug the brief warns about.

All of this happens in the **same transaction** as the insert (D29), so a reader never sees a signal
that its bucket does not yet include.

### 5.5 How the UI learns the number changed — D30

The dirty set is flushed on a 250–500 ms tick as **absolute bucket rows**, coalesced per
`(ad_id, minute)`. A restatement is not a special frame — it is the same row, for an older minute,
carrying `restated_at` and a bumped `restatement_count`. **"The UI learns the number grew" and "the
UI learns the number changed" are one mechanism**, which is why there is no reconciliation code to
get wrong.

Because rows are absolute rather than deltas, a redelivery after a reconnect is idempotent. The SSE
`id:` is the high-water `ingest_seq` in the flush, so `Last-Event-ID` resume is exact (**D18**).

### 5.6 What the strategist sees when a closed period moves

1. The affected point on the chart **changes value and is marked restated** — a distinct treatment
   that persists rather than a transient flash, because the reviewer may be looking elsewhere.
2. A restatement entry appears on the timeline at the *bucket's* time, not at now: *"14:02 Tue —
   ROAS 1.8 → 2.4 · +3 conversions · $412 · arrived 2 days 4 h late."*
3. Clicking it opens the trace (§10) with `as_of` set to just before the arrival, so the previous
   figure, the new figure, and the exact `event_id`s that account for the difference are on screen
   together.
4. The maturity indicator (D33) explains the *expected* part of the movement; `restated_at` marks
   the part that was not expected because the bucket was already settled.

### 5.7 The lateness horizon, and beyond it

**72h**, fixed, displayed, adjustable (**D13**). Beyond it: the event is **stored, attributed and
counted in a separate past-horizon tally, and excluded from headline numbers.** It is never dropped.

**P16 — shortening the horizon is a build item, not a toggle** (**F2**). With 72h and 7 days of
backfill, backfilled buckets are already settled and live buckets never reach settlement inside a
demo, so *no restatement is observable at the default horizon* — P7 would be built, correct and
invisible. Shortening the horizon re-evaluates settlement across the affected range
(`ix_rollup_time`), which is why P16 is a settlement re-evaluation path with a control on it and is
sized as such.

---

## 6 — The other misbehaviours

**Tolerated** = handled correctly, no visible degradation. **Degrades** = we detect it, say so, and
carry on with a stated loss. **Breaks** = we cannot represent it; named rather than discovered.
This table goes into the README verbatim (brief L123).

| Misbehaviour | Disposition | Why, in one line |
|---|---|---|
| Duplicate delivery, identical payload | **Tolerated** | `event_id` is the primary key; the delivery is recorded, the aggregate is untouched (D15) |
| Duplicate delivery, **conflicting** payload | **Tolerated, surfaced** | First write wins for the aggregate; the conflicting delivery is retained, counted and visible in the trace (D15/I7) |
| Out-of-order arrival | **Tolerated** | Bucketing is on event time; `ingest_seq` supplies the replay order the wire does not (D12) |
| **Late-attributing conversion** | **Handled end to end** | The flagship path: cohort placement, generic restatement, settlement states, visible on the surface (§5) |
| Orphaned conversion — click has not arrived | **Handled** | Provisional at its own minute, promoted and moved on resolution (D16, §5.4) |
| Orphaned conversion — click never arrives | **Degrades** | `orphan_expired` past the horizon: counted and displayed, excluded from headline numbers, never deleted |
| Conversion whose `ad_id` contradicts its click's | **Handled** | The click is authoritative; the disagreement is flagged and counted, not silently resolved (I8/G30) |
| Same click delivered under two `event_id`s | **Degrades** | The unique partial index on `click_id` makes it detectable; we count it rather than dedupe on it (E3) |
| Clock skew — future-dated `ts` | **Tolerated** | Clamped to `received_at`, both values retained, counted (I10) |
| Clock skew — slow source clock | **Degrades** | Everything looks late; past-horizon arrivals leave the headline numbers and are counted separately (D13) |
| Burst | **Tolerated** | Batched ingest, coalesced bucket frames, tail frames dropped with a visible counter (§11) |
| Gap / stall | **Degrades — detected, not repaired** | Liveness display ("last event 12 s ago"); we can say the stream is quiet, not why |
| **Emitter-side event loss** | **Breaks — silently** | There is no emitter sequence number, so a lost event is indistinguishable from an event that never existed (G21). The one failure we cannot see, and it is named |
| **Retraction / refund / void** | **Breaks — unrepresentable** | The contract is append-only with no negation; a negative `value_cents` would fix the value and corrupt the count (G43). `conversion_void` is specified in the README and not built (D25) |
| Signals for a non-live ad | **Tolerated** | Never rejected on status; counted as a self-check, since under our own simulator the count should be zero (I11/G48) |
| Funnel violation (conversions > clicks in a live window) | **Tolerated** | Shown unclamped with an unsettled marker and the orphan count beside it — clamping would hide the phenomenon the brief wants demonstrated (G46) |
| Malformed payload | **Tolerated** | Recorded as `rejected_invalid` with the raw body, counted; nothing is dropped without a trace |

**Retractions are arguably more common in the wild than late attribution, and the brief does not
mention them.** Worth saying in the README. The cost of adding them is now demonstrably low: because
D27-B forced the restatement path to be generic, `conversion_void` would be one event type and one
apply branch.

---

## 7 — Config as a fold over the decision log

**We store both. The log is authoritative. The UI reads the projections.** (**D7**.)

```
fold: (state, decision) -> state          -- one pure function, exhaustive over DecisionBody
apply(decision):
   assert preconditions (from_cents / from_id vs current)          -- I13, compare-and-swap
   state' = fold(state, decision)
   close current config_generation (valid_to = decision.ts)
   open  new  config_generation (valid_from = decision.ts)         -- only if config changed
   write ads row from state'
   all of the above in one transaction
```

- `create_ad` opens generation 1 in `draft`. `launch` sets `status='live'` and writes
  `launched_at` — **the only writer** (G02).
- `pause` / `resume` change `status`. They open a new generation, because "what was live at T"
  includes whether it was running.
- `set_budget` / `swap_component` change config and open a new generation.
- `archive` does not exist (F1); the branch is present, unreachable, and self-documenting.

**Draft edits are not in the log** (**D5**). Config is free while `draft` — nothing references it and
no events exist — and once `live`, *only levers touch it*. This is **sharper than the brief's own
rule** at L42 and it is what gives the fold a real, dated, attributable origin. The cost, stated:
draft edit history is not auditable.

### Why both, and how divergence is detected

Storing only the log (D7-A) means folding on every read; storing only the fold (D7-B) makes the log
decorative and the brief's most interesting claim untestable. Storing both creates exactly one
hazard — they can disagree — so the design makes disagreement *detectable on demand* rather than
promising it cannot happen:

**`GET /api/verify`** — rebuilds every projection from the logs into temp tables and diffs them
against the live ones, row by row, returning the first divergence or a clean bill with the log
position it was checked at. It runs at boot in dev, on demand in the demo, and it is P14 extended
from rollups to the whole fold. `projection_meta.content_hash` makes the common case a hash compare
rather than a full diff.

This is the payoff of "nothing writes a projection except the apply function": with one writer, a
divergence means a bug in one function, and the rebuild is also the repair.

---

## 8 — The Workbench read path: the reverse join

D1 sketches the Workbench, with **one read-only screen backed by live data** (P15). The model has to
be defensible even though the surface is thin.

**What is answerable: "used in N ads right now."** Current state only.

```sql
SELECT c.component_id, c.lineage_id, c.version, COUNT(a.ad_id) AS live_ads
  FROM components c
  LEFT JOIN ads a
    ON (a.video_id = c.component_id OR a.headline_id = c.component_id)
   AND a.status = 'live'
 GROUP BY c.component_id;
```

**Computed on read by scanning `ads`, not maintained as an index.** At 8–12 ads the scan is free,
and a maintained reverse index would be a second thing to keep in step with the fold — a projection
whose only justification would be a scale we do not have. Calling a 12-row scan an index would be
dressing up.

**"Kept current as ads launch and die"** falls out of the write path rather than needing machinery:
`ads.status` is written only by the fold, so the count is exactly as current as the last decision.

**Per version or per lineage?** Both, and the screen shows both — the lineage total as the headline
("Hook video — 3 versions, live in 7 ads") with a per-version breakdown beneath. The seed data
includes one lineage with two versions specifically so this is a real answer on screen rather than a
paragraph (D3).

**What is *not* answerable, and why it is a scope cut rather than a modelling failure.** G38 hides
three queries behind one phrase:

| Query | Needs | Status |
|---|---|---|
| used in N ads **right now** | current fold + ad status | **built** (P15) |
| used in N ads **at time T** | `config_generations` + origin | *one join from working* |
| used in N ads **ever** | complete swap history + origin | *one join from working* |

Rows 2 and 3 are unbuilt but not unavailable: `config_generations` exists for D14's sake regardless,
so the README shows the **real query against real data** rather than describing a hypothesis:

```sql
-- "How did video v_07 perform, honestly, across every swap?" — the temporal reverse join
SELECT g.video_id,
       SUM(r.impressions) AS impressions, SUM(r.clicks) AS clicks,
       SUM(r.click_cost_cents + r.spend_cents) AS spend_cents,
       SUM(r.conversions) AS conversions,   SUM(r.value_cents) AS value_cents
  FROM rollup_minute r
  JOIN config_generations g
    ON g.ad_id = r.ad_id
   AND r.minute_start >= g.valid_from
   AND (g.valid_to IS NULL OR r.minute_start < g.valid_to)
 WHERE g.video_id = 'v_07'
 GROUP BY g.video_id;
```

That query is correct because of D27-B: a conversion sits in its click's minute, and the generation
covering that minute is the one D14 credits. The only imprecision is the straddled minute (§4.2).

**What the strategist manages** (**D4**): *you decide on ads, you learn about components.* Every
lever carries `ad_id`, so the ad is unavoidably the unit of **action**; fatigue and reuse are only
legible at the component level, so that is the unit of **analysis**. Saying that explicitly is a
better answer to the brief's question than picking one.

---

## 9 — Component versioning

L111 asks directly: *"mutate in place (twelve live ads silently change), copy-on-write, or immutable
once live. Pick one and defend it."*

**Chosen: copy-on-write** (**D3**). Editing a live component creates a new `component_id` in the same
lineage; existing ads keep pointing at the old version; moving an ad to the new version is a
`swap_component` decision with a rationale.

```ts
interface Component {
  component_id: string;
  kind: "video" | "image" | "headline" | "body_copy";
  payload: string;
  created_at: string;
  lineage_id: string;        // E10 — stable across versions
  version: number;           // E11 — 1-based
  parent_id: string | null;  // E12
}
```

**The defence.**

*Mutate in place is disqualified, not merely worse.* It retroactively falsifies history: last week's
metrics become attributed to text that did not exist last week. That breaks the criterion the whole
build is organised around (L143), and — unlike every other choice here — **it cannot be undone**,
because the overwritten payload is gone. The brief flags the hazard itself ("twelve live ads silently
change") and it is right to.

*Copy-on-write beats immutable-once-live on the same guarantee for less machinery.* Immutability
needs a computed liveness predicate — "has this component ever been referenced by a live ad" — which
is a reverse join over ad status *and* the decision log (G12). Copy-on-write gets the identical
history guarantee with no predicate, and it turns propagation into an explicit, logged
`swap_component` with a rationale, which is precisely the levers-only model the brief asks for at
L42. Immutable-once-live is copy-on-write plus a friction step.

*What it costs.* The library grows, and the UI must group by lineage or it looks cluttered — which is
why the reverse join answers per-lineage and per-version (§8).

**Honest scope note.** No editor ships (D1), so **nothing exercises this at runtime.** The three
fields exist and the seed data contains one two-version lineage, so the read path and the display
question are real; the write path is a position defended in prose, which is what L111 asks for. That
distinction is stated in the README rather than left for a reviewer to discover.

---

## 10 — Traceability as a product feature

Hard requirement #5, and the brief's *"can you trace any number on screen back to the raw events
beneath it — and do they agree"* (L143). Level **D** in full (**D24** via **D26**): drill-down,
trace endpoint, agreement test. The mechanism is **D31**.

### 10.1 Every number carries its own provenance

```ts
type TraceDescriptor = {
  metric: "impressions" | "clicks" | "spend_cents" | "conversions" | "value_cents"
        | "ctr" | "cpa" | "roas";
  ad_ids: string[];
  from: string; to: string;                 // minute-aligned UTC, half-open [from, to)
  granularity_s: number;                    // which rung of D20's ladder produced this point
  placement_rule: "cohort_click_time";      // D27 — inspectable at the point of use
  generation_scope: string | null;          // a generation_id, or null for all
  as_of_ingest_seq: number;                 // the log prefix this number reflects
  sig: string;                              // HMAC, node:crypto — server-issued, unforgeable
};
```

The descriptor rides on every metric value the server sends. It is **the query, not the answer** —
which is what makes the walk-back a proof rather than a second opinion.

### 10.2 One function underneath, three surfaces on top

```
replay(descriptor) -> { value, contributing_event_ids[], counts }
```

`replay` reads **raw `signals`** — never rollups — restricted to `ingest_seq <= as_of_ingest_seq`,
re-deriving attribution over that same prefix. It is a pure function of a log prefix, which is what
makes it a genuine independent check rather than the same code twice.

| Surface | Plan item | What it is |
|---|---|---|
| **Drill-down** | P12 | Click any number → `replay` its descriptor → show the contributing events, the recomputed figure, and **an explicit pass/fail against the displayed figure** |
| **`trace <event_id>`** | P13 | The same function backwards: one event → its deliveries → its canonical row → its attribution → the buckets it moved → the metrics that changed → the screen elements affected. This **is** the "life of one event" deliverable (L155), executable |
| **Agreement test** | P14 | `replay` swept over every bucket, comparing incrementally-maintained rollups against the recomputation. Runnable on demand, in front of the reviewer |

**Why the display path and the check path must differ.** The display reads `rollup_minute`, built
incrementally at ingest (D29). The check reads raw and recomputes from zero. They are two independent
routes to the same number, which is the only arrangement in which "and they agree" means anything. If
the client did the arithmetic (D30-A), the walk-back would compare the client to itself.

### 10.3 `as_of` is what makes restatement provable

Re-run the same descriptor with a later `as_of_ingest_seq` and the figure changes. The difference is
attributable to a named set of `event_id`s, each with its `received_at` and its lateness. That turns
*"a conversion landed late and rewrote Tuesday"* from a claim into a diff the reviewer can read.

**This works because `ingest_seq` is monotone in `received_at`** — for live events by construction,
and for the seeded window because the seeder sorts by `received_at` before writing and hands anything
arriving after the seed boundary to the live emitter instead (**D38**, `SIMULATOR.md` §15.3).

**The one limit, stated rather than left looking like it works.** Within the *seeded* window
`received_at` is **designed, not observed** — the seeder draws it from the reporting-lag distribution
(D38-E). So for backfilled history `as_of` reconstructs *what the screen would have shown under the
seeded arrival model*, not what anyone actually saw, because nobody was watching. For live arrivals
there is no such caveat: those `received_at` values are measurements. The `source` column (§2.2) is
what lets a reviewer tell which regime a given figure sits in.

### 10.4 The life of one event

```
1. EMIT      simulator mints  { event_id: e_88f1, ts: Tue 14:02:31Z, ad_id: a_12,
                                event: "conversion", attributed_click_id: c_5502,
                                value_cents: 4999 }
             and posts it, in a batch, to POST /api/ingest — 2 days 4 h after the click.

2. ARRIVE    ingest stamps received_at = Thu 18:11:07Z, ingest_seq = 918,442.
             -> signal_deliveries (disposition 'accepted').        [the raw arrival record]

3. STORE     not seen before -> INSERT INTO signals.
             ts_effective = ts (not future-dated, no clamp).       [the canonical fact]

4. ATTRIBUTE click c_5502 found: ad a_12, ts Tue 14:02:03Z.
             conversion.ad_id == click.ad_id -> no conflict.
             generation live at Tue 14:02:03Z = g_a12_004 (video v_07, pre-swap).
             -> conversion_attribution { resolved, credited_minute = Tue 14:02,
                                         credited_generation_id = g_a12_004 }   [D14 + D27-B]

5. ROLL UP   rollup_minute (a_12, Tue 14:02): conversions +1, value_cents +4999,
             max_ingest_seq = 918,442.
             That bucket was SETTLED (72 h had passed) -> restated_at = now,
             restatement_count 0 -> 1.                             [same txn as step 3]

6. TRANSPORT next 250 ms flush: one absolute bucket row for (a_12, Tue 14:02),
             SSE id = 918,442.                                     [D30 — not a delta]

7. PIXEL     the Tuesday 14:02 point moves: ROAS 1.8 -> 2.4. It is marked RESTATED.
             The timeline gains an entry AT TUESDAY 14:02, not at now.

8. PROVE     click the point -> replay(descriptor, as_of = 918,442) re-reads raw signals,
             re-derives attribution over that prefix, returns 2.4 and 41 event_ids
             including e_88f1. Displayed vs recomputed: MATCH.
             Set as_of = 918,441 -> returns 1.8. The difference is exactly e_88f1.
```

Every step in that trace is a row a reviewer can select, in a table named above.

---

## 11 — Event flow

```
  ┌────────────────────┐
  │ SIMULATOR          │   separate OS process (D32). Holds NO durable state: it polls
  │ diurnal curve      │   GET /api/sim/world each tick for config, fatigue state,
  │ fatigue, noise     │   spend-so-far and pending scenarios (D40). 1x wall clock, 1s tick.
  │ late conversions   │   Budget is a PACING multiplier on the rate, not a cap (I3/P11).
  │ keyed RNG          │   Honours pause: a paused ad stops emitting — a simulator
  │                    │   convention, not a contract property (G48), stated as such.
  └─────────┬──────────┘
            ^  GET /api/sim/world  (1 Hz)   ·   POST /api/sim/scenario  (P17, on demand)
            │  ── the only channel into the emitter; scenario triggers ride the same poll
            │  HTTP POST /api/ingest — BATCHED (~1 s of simulated time per request)
            v                                          ◄── backpressure point 1
  ┌────────────────────────────────────────────────────────────────────────┐
  │ INGEST BOUNDARY — one SYNCHRONOUS transaction per batch                │
  │   stamp received_at + ingest_seq   (D12 — never emitter-assigned)      │
  │   validate (U6) · clamp ts (I10) · write signal_deliveries (always)    │
  │   dedupe on event_id (D15) · insert signals                            │
  │   resolve attribution (D14/D16) · promote waiting orphans              │
  │   upsert rollup_minute · stamp restated_at if settled  (D29)           │
  │   collect dirty (ad_id, minute) set                                    │
  └─────────┬──────────────────────────────────────────────────────────────┘
            │  in-memory dirty set
            v
  ┌────────────────────────────────────────────────────────────────────────┐
  │ FLUSH TICK — 250–500 ms, BATCHED                                       │
  │   coalesce dirty buckets per (ad_id, minute) -> ABSOLUTE rows          │
  │   sample the raw tail, capped per tick                                 │
  └─────────┬──────────────────────────────────────────────────────────────┘
            │  SSE, id = high-water ingest_seq        ◄── backpressure point 2
            v
  ┌────────────────────────────────────────────────────────────────────────┐
  │ BROWSER                                                                │
  │   bucket rows -> the ONLY source of any performance number             │
  │   tail frames -> the live event feed, display strings only (D34)       │
  │   click a number -> POST /api/trace {descriptor} -> raw re-sum + assert│
  └────────────────────────────────────────────────────────────────────────┘
```

**The simulator's two endpoints** (**D40**, **F3**). `GET /api/sim/world` is a read the Workbench
half-wants anyway — cumulative delivery per `(lineage, audience)` is §8's temporal reverse join — and
it is what keeps §3.3's *"the simulator holds no durable state"* true rather than aspirational: the
emitter's fatigue state is recomputed from the signal log, so it cannot silently disagree with the
fatigue the app infers. `POST /api/sim/scenario` writes a row the same poll picks up, so there is no
second control path and pause latency is a stated number (≤ 1 tick, ≤ 1 s).

**Synchronous:** everything from `POST /api/ingest` to the rollup upsert, in one SQLite transaction.
`node:sqlite` is synchronous by design, so a reader can never see a signal whose bucket has not been
updated. Lever writes are synchronous too: `POST /api/decisions` folds, opens the generation, writes
`ads`, and returns the new state in the same transaction, so the console never shows an optimistic
value that could be rejected.

**Batched:** the ingest POST body; the 250–500 ms SSE flush; the tail sample.

**Where backpressure hits, and what happens.**

1. **The ingest endpoint.** SQLite serialises writes, so this is the true choke point. As the
   simulator outruns it, response latency rises and the simulator's send queue grows; past a
   threshold the endpoint returns `429` with a retry hint and the simulator holds and coalesces. It
   never drops on the floor — a dropped ingest would be indistinguishable from emitter-side loss,
   which is the one failure we already cannot see (§6).
2. **SSE fan-out to a slow client.** When the socket buffer fills: tail frames are dropped first
   (with a visible "N events not shown"), bucket rows are coalesced but **never dropped**, and past a
   hard buffer cap the connection is closed so `EventSource` reconnects and re-snapshots (§3.1).
   Absolute rows are what make that safe.
3. **The browser's render loop.** The flush tick is the rate limiter; coalescing per
   `(ad_id, minute)` means a burst produces one row per bucket, not one per event.

**The quarantine, enforced structurally** (**D34**). Two raw-event payload types, and the rule is
*raw numbers reach the client only in response to a trace descriptor*:

```ts
type TailFrame     = { event_id: string; ts: string; ad_id: string;
                       kind: SignalKind; amount: string /* "$0.42" — display only */ };
type TraceEvidence = { event_id: string; ts: string; ad_id: string;
                       kind: SignalKind; cents: number /* summable, on purpose */ };
```

Three layers, two of them compile-time: the numbers **are not in** `TailFrame`; every performance
number renders through a component that requires a signed, server-issued `TraceDescriptor`, which
tail data cannot produce, so TypeScript strict rejects it; and D31's on-screen assertion is the
runtime backstop. Summing the tail would mean parsing strings — ugly enough to be visible in a diff,
which is the mechanism.

**The one stated exception.** Stream-health figures — events/sec, last-event age, frames dropped,
deliveries deduped, conflicts, orphans — *are* derived from the tail and *are* numbers on screen.
They describe the **transport, not the ads**. They render in a distinct treatment under a heading
that names them as stream telemetry, and never share a surface with a performance metric in a way
that could be read as one. The rule is *"no **performance** number is derived from the tail"*, not an
absolute this design does not hold.

---

## 12 — Extensions to the brief's contracts

Full register with justification per row: **`docs/BRIEF_GAPS.md` § Extensions to the given
contracts**. That section is the assembly source for the README. Summary:

| # | Extension | Type | Finding | Decision |
|---|---|---|---|---|
| E1 | `received_at` | `Signal` field | G16 | D12 |
| E2 | `ingest_seq` | `Signal` field | G16, G21, G22 | D12 |
| E3 | `click_id` on `click` | `Signal` field | G17 | T1/P2 |
| E4 | `create_ad` | `Decision` variant | G33, G50 | D5 |
| E5 | `launch` | `Decision` variant | G02, G33, G50 | D5 |
| E6 | `decision_seq` | `Decision` field | G22, G45 | D21 |
| E7 | `Ad.created_at` | `Ad` field | G03 | Phase-2 defaults |
| E8 | `Ad.name` | `Ad` field | G03 | Phase-2 defaults |
| E9 | `Ad.current_generation_id` | `Ad` field | G01 | D2 |
| E10–E12 | `lineage_id`, `version`, `parent_id` | `Component` fields | G10 | D3 |
| E13 | `ConfigGeneration` | new entity | G01, G18 | D2, D14 |
| E14 | `TraceDescriptor` | new wire type, no persisted state | L143 | D31 |
| E15 | `source: 'backfill' \| 'live'` | `Signal` field | D33 conflict | D38 |

**Nothing is narrowed.** `Ad.status: "archived"` (F1) and `Component.kind: "image" | "body_copy"`
(D23) are kept in their types though no lever reaches one and no slot accepts the others — both are
the visible shadow of a scope cut, and a scope cut belongs on the cut line and in the notes rather
than encoded into a domain type where a later reader cannot tell deliberate omission from modelling
claim.

**Eighteen interpretations** (I1–I18) fix meanings the brief leaves open without changing its shape
— spend as a delta, the account timezone, first-write-wins, click-authoritative attribution, and so
on. They are listed in the same register because an interpretation can be wrong in a way a reviewer
should be able to check, and I17 in particular is a **correction to the brief**, not a reading of it:
L117's *"everything on screen is derived from the stream"* is false in the brief's own terms, and we
restate it as *every performance number derives from the signal stream, every config value from the
decision log folded over its origin, nothing is hard-coded.*

---

## Appendix — the derivation rule, stated once

> Every **performance** number on screen derives from the signal log.
> Every **config** value on screen derives from the decision log, folded over its origin.
> Nothing on screen is hard-coded, and nothing that is derived is written by hand.

Two derivation paths, one rule, and a `/verify` endpoint that checks both.
