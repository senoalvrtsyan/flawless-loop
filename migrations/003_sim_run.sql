-- 003_sim_run.sql — the world seed, so §14's reproducibility claim rests on the store.
--
-- SIMULATOR.md §14's honest claim is:
--
--     (seed + decision log + scenario log)  ->  world
--
-- Two of those three were already persisted: the decision log by D7, the scenario log by D40. The
-- seed was a code constant in `src/sim/index.ts`, carrying an `ASSUMPTION (unratified)` label since
-- B11. **D60 (2026-09-04, option B)** puts it here.
--
-- `sim_run` is NOT a projection. Nothing rebuilds it, `apply()` does not own it, and `/api/verify`
-- does not shadow it — the same standing as `sim_scenarios` in 002, and for the same reason: it is
-- simulator INPUT, not something derived from the logs. It is written exactly once, by the seeder,
-- at T0, and read by `GET /api/sim/world`.
--
-- Why a table rather than an env var the emitter also reads: the failure it prevents is SILENT. An
-- emitter continuing a seeded history under a different seed produces a world that is internally
-- incoherent — fatigue accrued by one world, extended by another — while every number on screen
-- stays plausible. Serving the seed from the store means the emitter cannot hold a different
-- opinion, because it holds none.

------------------------------------------------------------------------------------------
-- sim_run — one row, `id = 1`, written by the seeder and never updated.
------------------------------------------------------------------------------------------

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
