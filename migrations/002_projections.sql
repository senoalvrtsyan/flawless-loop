-- 002_projections.sql — the derived side of the store.
--
-- Everything here is REBUILDABLE from 001_logs.sql. If a projection and the logs disagree, the
-- logs win and the projection is rebuilt (D7). That is the single property this design exists to
-- demonstrate, so it comes with a rule that outranks convenience:
--
--   ** NOTHING WRITES A PROJECTION EXCEPT THE REPLAY/APPLY FUNCTION. **  (D7, CLAUDE.md §5)
--
--   ads · config_generations · conversion_attribution · rollup_minute · projection_meta
--
--   A chunk that writes one of those directly breaks the property and WILL NOT show up as a test
--   failure. See BUILD_PLAN.md §14.
--
-- `sim_scenarios` is the exception at the bottom of this file and is NOT a projection — it is
-- simulator input, and it is written by the scenario endpoint. It lives here because DESIGN.md
-- §2.4 puts it here, not because it obeys the rule above.
--
-- Transcribed from DESIGN.md §2.4.

------------------------------------------------------------------------------------------
-- Current config: the fold's head (D7)
------------------------------------------------------------------------------------------

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

-- `archived` is reachable by no lever (F1). The fold carries one branch for it that can never
-- fire, written to explain itself -- "no lever produces this state; see SCOPE.md §4 cut #3" --
-- not as a thrown error, because an unreachable branch that throws reads as a bug guard and this
-- is a scope cut.

------------------------------------------------------------------------------------------
-- Config history: "the config of a_12 on Sunday" — E13 (D2, P5)
--
-- A half-open interval [valid_from, valid_to). "Config of a_12 at T" is an indexed lookup,
-- which is what D14's click-time attribution needs on every late conversion.
------------------------------------------------------------------------------------------

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

------------------------------------------------------------------------------------------
-- How we currently read each conversion
--
-- `credited_minute` is STORED, not computed, for one reason: when a late click resolves an
-- orphan, the apply function must DECREMENT the bucket the conversion was previously counted
-- in. Without the previous placement recorded, that bucket cannot be found.
------------------------------------------------------------------------------------------

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

------------------------------------------------------------------------------------------
-- The minute rollup — D9, D10, D28, D29
--
-- ONLY ADDITIVE COUNTS. NO RATIOS (D10). Ratios do not aggregate; their numerators and
-- denominators do. Storing a ratio is a correctness bug in a performance costume, and the
-- restatement path then only ever has to fix integers.
--
-- click_cost_cents and spend_cents are kept apart because the brief keeps them apart: spend
-- events are "non-click charges (CPM, fees); disjoint from click costs -- total spend = sum of
-- both" (L79-80). Total spend is a read-time sum, never a stored third column that could
-- disagree with its parts.
--
-- WITHOUT ROWID means the row IS the index entry -- one B-tree seek per series, no indirection,
-- for the dominant query (one contiguous PK range scan per ad per window). ix_rollup_time serves
-- the two queries that go the other way: the cross-ad portfolio window, and the settlement sweep
-- that re-evaluates which buckets are settled when the horizon changes (P16).
------------------------------------------------------------------------------------------

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

------------------------------------------------------------------------------------------
-- Rebuild bookkeeping, and the divergence check
------------------------------------------------------------------------------------------

CREATE TABLE projection_meta (
  name          TEXT PRIMARY KEY,                     -- 'ads' | 'config_generations' | ...
  rebuilt_at    TEXT NOT NULL,
  source_seq    INTEGER NOT NULL,                     -- log position this projection reflects
  content_hash  TEXT NOT NULL                         -- for /verify (§7)
) STRICT;

------------------------------------------------------------------------------------------
-- NOT A PROJECTION. Simulator input — D40 / F3 (P17): the third replay input.
--
-- Neither a fact about the world nor derived from one. Persisted because the reproducibility
-- claim names it: determinism is (seed + decision log + sim_scenarios) -> world (D40), and a
-- claim whose third input lives in memory is false. SIMULATOR.md §17.
--
-- Consequently this is the one table in this file that apply() does not own.
------------------------------------------------------------------------------------------

CREATE TABLE sim_scenarios (
  scenario_id  TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,                         -- when it was triggered
  name         TEXT NOT NULL,                         -- 'fatigue_collapse' | 'late_cascade' | ...
  args_json    TEXT NOT NULL,
  consumed_at  TEXT                                   -- NULL until the simulator picks it up
) STRICT;
