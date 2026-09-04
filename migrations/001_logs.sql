-- 001_logs.sql — the authoritative, append-only logs.
--
-- DESIGN.md §1 splits the store in two: these tables are WRITTEN BY THE WORLD and are the
-- source of truth. Everything in 002_projections.sql is DERIVED from them and rebuildable.
-- If the two ever disagree, these win and the projection is rebuilt (D7).
--
-- Transcribed from DESIGN.md §2.1-2.3. The DDL below was executed against SQLite 3.51.2
-- during Phase 2 before it was specified; see STATUS.md § "What was verified".

------------------------------------------------------------------------------------------
-- §2.1  Reference data — static, seeded once
------------------------------------------------------------------------------------------

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

-- `channel` is the brief's inline enum and gets no table (G08 noted, not fixed). Audiences and
-- channels are static reference data and no lever changes an ad's audience or channel (U3).

------------------------------------------------------------------------------------------
-- §2.2  The signal log — append-only, authoritative
--
-- Two tables, because D15 keeps every delivery while letting exactly one win.
------------------------------------------------------------------------------------------

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

------------------------------------------------------------------------------------------
-- §2.3  The decision log — append-only, authoritative
------------------------------------------------------------------------------------------

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
