# SCHEMA.md — the as-built schema

**This file is not a design document.** [`DESIGN.md`](DESIGN.md) §2 is the schema we *designed*;
this is the schema that is *in the store*, read straight out of it:

```
sqlite3 "file:data/loop.sqlite?mode=ro" .schema
```

Keeping both is the point. `DESIGN.md` §2 was written in Phase 2 with no code on disk, and the only
honest way to claim the build matches it is to print what shipped and let the two be diffed. That
diff is [§4](#4--where-this-differs-from-designmd-2) below, and it is one table long.

**Read out of `data/loop.sqlite` at `ingest_seq` 1,591,439 · `received_at` 2026-09-05T05:28:37.904Z.**
The store is the seven-day world described in [`SIMULATOR.md`](SIMULATOR.md); it was live and
ingesting when this was taken, so the row counts below are a high-water mark, not a fixed figure.

| | |
|---|---|
| Store | `data/loop.sqlite`, 191,830 pages × 4,096 B = **~750 MB** |
| Journal mode | `wal` — verified, not assumed (`PRAGMA journal_mode`) |
| World seed | `flawless-loop` · `T0` = 2026-09-04T16:03:18.970Z · 7 backfill days |
| Schema version | 3 (`GET /api/health`) |
| Tables | 12 · **Indexes** 10 explicit + 12 implicit (`PRIMARY KEY` / `UNIQUE`) |

---

## 1 — What is a log, what is a table, what is derived, what is cached

The brief asks this directly. Four categories, and the fourth — *interpretation* — is the one that
matters, because it is where every number on screen actually comes from.

| Category | Tables | Rows at the stamp above | Write rule |
|---|---|---|---|
| **Logs — authoritative, append-only** | `signals`, `signal_deliveries`, `decisions` | 1,590,951 · 1,605,911 · 24 | Only the ingest endpoint and the lever endpoint. Never updated, never deleted. |
| **Reference data — static fixtures** | `components`, `audiences` | 16 · 4 | The seeder, once. |
| **Simulator input — neither fact nor derivation** | `sim_scenarios`, `sim_run` | 0 · 1 | The seeder and the scenario endpoint. Persisted because the reproducibility claim `(seed + decision log + sim_scenarios) → world` names them (**D40**), and a claim whose inputs live in memory is false. |
| **Derived — rebuildable projections** | `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`, `projection_meta` | 12 · 24 · 1,389 · 72,018 · 0 | **`src/server/apply.ts` and nothing else** (**D7**). |
| **Cached** | *nothing* | — | There is no cache tier. That is **D10** and **D29**, not an omission — see `DESIGN.md` §4.3. |

Two notes that are decisions rather than trivia:

- **`signal_deliveries` has 14,960 more rows than `signals`.** That is the whole misbehaviour story
  in one subtraction: 12,582 `duplicate_identical`, 1,579 `rejected_invalid` and 799
  `duplicate_conflicting` deliveries were recorded and did not become canonical facts. Nothing is
  dropped without a row (**D15**).
- **`projection_meta` is empty, deliberately.** Using it to skip the `/api/verify` rebuild would make
  `verify.ts` a second writer of a projection, which needs a decision rather than a quiet extension.
  The table exists; nothing writes it; that is stated rather than left to be discovered.

---

## 2 — The indexes, and what each one is for

Ten explicit indexes. None of them is speculative — each serves a query that exists.

| Index | On | Serves |
|---|---|---|
| `ux_signals_click_id` | `signals(click_id) WHERE kind='click'` | **Unique and partial.** Attribution's forward lookup, *and* the detector for "same click delivered under two `event_id`s" — the misbehaviour is caught by the index rather than by a check (**E3**). |
| `ix_signals_attr` | `signals(attributed_click_id) WHERE kind='conversion'` | The reverse direction: when a late click lands, find every orphaned conversion waiting on it (**D16**). |
| `ix_signals_ad_time` | `signals(ad_id, ts_effective)` | **The traceability path** — the raw re-sum behind every displayed number. |
| `ix_rollup_time` | `rollup_minute(minute_start)` | The cross-ad portfolio window, and the settlement sweep when the horizon moves (**P16**). |
| `ix_gen_ad_window` | `config_generations(ad_id, valid_from)` | "Config of `a_12` at `T`" as an indexed lookup rather than a fold — what **D14**'s click-time attribution needs on every late conversion. |
| `ix_attr_unresolved` | `conversion_attribution(state) WHERE state<>'resolved'` | The orphan health counter, over 8 rows instead of 1,389. |
| `ix_decisions_ad_seq` | `decisions(ad_id, decision_seq)` | The per-ad fold. |
| `ix_deliveries_event` | `signal_deliveries(event_id)` | The delivery history in the trace — every attempt at one `event_id`. |
| `ix_components_lineage` | `components(lineage_id, version)` | The version list on the component screen (**D3**). |
| `ix_ads_status` | `ads(status)` | The `live` set the simulator polls at 1 Hz. |

`rollup_minute` is `WITHOUT ROWID`, so the row **is** the index entry: the hot read — one contiguous
range scan per ad over a window — is one B-tree seek with no indirection. There is deliberately no
index on `signals.ingest_seq`; `UNIQUE` already builds one.

---

## 3 — The DDL, verbatim

Read from `sqlite_master`. The comments are in the shipped migration, not added here.

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
CREATE TABLE signal_deliveries (
  delivery_seq INTEGER PRIMARY KEY,        -- rowid alias; monotonic arrival order of deliveries
  event_id     TEXT NOT NULL,
  received_at  TEXT NOT NULL,              -- E1: server clock, at this boundary (D12)
  payload_json TEXT NOT NULL,              -- the element re-serialised, before any semantic
                                           -- normalisation. NOT the received bytes: see B05 note
  payload_hash TEXT NOT NULL,              -- to classify a redelivery as identical or conflicting
  disposition  TEXT NOT NULL CHECK (disposition IN
                 ('accepted','duplicate_identical','duplicate_conflicting','rejected_invalid'))
) STRICT;
CREATE INDEX ix_deliveries_event ON signal_deliveries(event_id);
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
CREATE INDEX ix_signals_attr     ON signals(attributed_click_id) WHERE kind = 'conversion';
CREATE INDEX ix_signals_ad_time  ON signals(ad_id, ts_effective);
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
CREATE TABLE config_generations (
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
CREATE TABLE conversion_attribution (
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
CREATE TABLE rollup_minute (
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
CREATE TABLE projection_meta (
  name          TEXT PRIMARY KEY,                     -- 'ads' | 'config_generations' | ...
  rebuilt_at    TEXT NOT NULL,
  source_seq    INTEGER NOT NULL,                     -- log position this projection reflects
  content_hash  TEXT NOT NULL                         -- for /verify (§7)
) STRICT;
CREATE TABLE sim_scenarios (
  scenario_id  TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,                         -- when it was triggered
  name         TEXT NOT NULL,                         -- 'fatigue_collapse' | 'late_cascade' | ...
  args_json    TEXT NOT NULL,
  consumed_at  TEXT                                   -- NULL until the simulator picks it up
) STRICT;
CREATE TABLE sim_run (
  -- The CHECK is the whole point: this table holds exactly one world.
  id          INTEGER PRIMARY KEY CHECK (id = 1),

  -- §14's first term. The string hashed into every keyed draw.
  seed        TEXT    NOT NULL CHECK (length(seed) > 0),

  -- T0: the seeder's boot instant (D53), which is what `T0 - live_days` backdates against and what
  -- §15.3(b)'s seam is measured from. Stored rather than recomputed because the ads' `launched_at`
  -- values are derived FROM it, so re-deriving it from them would be circular.
  t0          TEXT    NOT NULL,

  -- How many days of history the seeder wrote. §15.2 says 7, with 5 as the stated fallback lever;
  -- recording which one ran means a store can be read without knowing how it was made.
  backfill_days INTEGER NOT NULL CHECK (backfill_days > 0),

  created_at  TEXT    NOT NULL
) STRICT;
```

### The pragmas

Set on every connection, in `src/server/db.ts`:

```sql
PRAGMA journal_mode = WAL;      -- verified: PRAGMA journal_mode returns 'wal' on this store
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous  = NORMAL;
```

`synchronous = NORMAL` is the deliberate line. It survives the simulator process being killed
mid-demo and it survives an app restart — which is what hard requirement #1 asks for. It does not
survive a host power cut, which nothing in the brief asks for, and saying which of those two we
bought is the point of writing it down.

---

<a id="4--where-this-differs-from-designmd-2"></a>

## 4 — Where this differs from `DESIGN.md` §2

The diff is **one table**.

| Difference | Why |
|---|---|
| **`sim_run` exists here and not in `DESIGN.md` §2** | Added by **D60** during Phase 5, at B34. The world seed had been a process argument; D60 moved it into a one-row table so that changing the seed of a running world becomes impossible rather than possible-and-untracked. It carries `seed`, `T0` (**D53**), `backfill_days` and `created_at`, and it is served in `GET /api/sim/world`. |

**Everything else is byte-for-byte what Phase 2 wrote before any code existed** — verified by
parsing the `CREATE TABLE` bodies out of both files and comparing them, not by reading them side by
side. Of the eleven tables `DESIGN.md` §2 declares, six are character-identical
(`ads`, `audiences`, `components`, `decisions`, `signal_deliveries`, `signals`) and five differ by
**one dropped trailing comment on the `CREATE TABLE` line and nothing else**:

| Table | The comment the migration dropped |
|---|---|
| `config_generations` | `-- E13 (D2, P5): "the config of a_12 on Sunday"` |
| `conversion_attribution` | `-- how we currently read each conversion` |
| `projection_meta` | `-- rebuild bookkeeping, and the divergence check` |
| `rollup_minute` | `-- D9, D10, D28, D29` |
| `sim_scenarios` | `-- D40 / F3 (P17): the third replay input` |

No column, no `CHECK`, no `DEFAULT`, no `REFERENCES`, no index and no table qualifier changed. The
generated `ts_effective` column, the partial unique index on `click_id`, and `STRICT` /
`WITHOUT ROWID` all shipped exactly as designed. (`ads` kept its header comment, which is why the
five are an inconsistency in the migration rather than a policy.)

Two things `DESIGN.md` §2 says that this file cannot show, and which are true anyway:

- **`conversion_attribution.state` admits `orphan_expired` and nothing ever writes it.** **D54**
  makes expiry a read-time derivation, because storing it would put a clock inside a projection and
  `/api/verify` would then report divergence on a correct store. The `CHECK` still admits the value.
- **`ads.status` admits `archived` and no lever reaches it.** **F1**, kept in the type on purpose:
  it is unreachable in our *lever set*, not in the *domain*, and `SCOPE.md` §4 cut #3 is the lever
  that would reach it.
