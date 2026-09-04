# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-04 · **Phase 5 in progress · stage 3 running · B31a CLOSED · 33 / 65 chunks**

---

## Where we are

**Phases 0–4 are closed.** Design is complete and the build is ordered. Nothing in any design
document is provisional.

**Phase 5 (implementation) is running.** Seno gave the go-ahead 2026-09-04. **Stage 0 (B01–B03) is
closed** — the store. **Stage 1 (B04–B11) is closed as of B11** — **the walking skeleton runs end
to end with no `curl` in it.** Today, from `npm run dev` and nothing else:

a **separate simulator process** (D32) emits impressions for `a_12` on a 1 s tick at 1× wall clock,
ids and bodies **derived** from a keyed RNG · `POST /api/ingest` stamps, validates, dedupes,
persists and rolls up each event in one transaction · `GET /api/snapshot` returns a bucket row for
a minute-aligned window plus a cursor, in one read transaction · `GET /api/stream` pushes the
**current absolute row** of every touched bucket on a 250 ms tick, and replays from a cursor on
connect · a React page on **:5173** renders one server-computed number that **climbs on its own
without a refresh**, survives a refresh, and survives a restart of all three processes.

**Stage 2 (B12–B24) is running.** Its first gate, **G1 = B12 + B13 + B14, is closed** — the first
group approved as a group under D48. **Config is now real**: a lever pulled over HTTP folds the
decision log, opens a config generation and writes the `ads` projection in one transaction, and the
whole `ads` row is a function of the log. On top of the walking skeleton, today:

`POST /api/decisions` takes one of six actions, refuses a stale `from_cents`/`from_id` (I13), refuses
a lever the ad's status does not admit, and returns the new state from *inside* the write
transaction · `GET /api/decisions` returns the log in fold order · `config_generations` carries a
half-open `[valid_from, valid_to)` chain with exactly one open generation per ad and no gap between
consecutive ones · `npm test` exists and runs **31 tests** (D43's three owed targets, plus B13's
eight against a real store).

**G2 = B15 + B16 + B17 is closed too.** **The world exists and three of the four signal kinds are
real.** `npm run seed` builds SIMULATOR §2's world — 16 components, 4 audiences, and **12 ads that
exist only as a fold over 24 backdated decisions** — and `ingest()` now accepts impressions, clicks
and spend, each landing additively in its own `rollup_minute` column. Attribution resolves a
conversion to its click, its click's minute (D27-B) and the generation live at that click (D14),
though nothing calls it yet.

**G3 = B18 + B19 is closed.** **The fourth signal kind is real, and the late conversion lands where
the design says it lands.** `ingest()` now accepts all four of the brief's kinds. A conversion is
credited at **its click's minute, on its click's ad** (D27-B, I8/G30) — verified end to end against
a seeded store: a click at 07:18 and a conversion at 09:47 produce **one** rollup row, at 07:18,
with `max_ingest_seq` raised to the conversion's seq. An unattributable conversion is credited
**provisionally at its own minute**, in the `provisional_*` columns, never in the settled ones
(D16). **D54:** `orphan_expired` is derived at read by `attributionStateAt()` and never stored —
`orphanTally()` gives the same store two different answers three days apart with no write between
them. `npm test` runs **50 tests**.

**G4 = B20 alone is closed — restatement works, which is the flagship path.** A withheld click
released four days late **promotes** its parked conversion: the provisional bucket is decremented
and **stamped `restated_at` with a `restatement_count` of 1**, the click's bucket takes the settled
credit, both carry the click's `ingest_seq`, and the attribution row is rewritten in full to the
click's ad and the generation live at the click. `writeRollup()` is now the single place
`rollup_minute` is written, and `apply()` **coalesces deltas by bucket** so a bucket is written once
per event — §5.4 bumps the counter per *bucket*, not per write. Settlement is clocked at the
delivery's `received_at` (D38), so the seeded week opens with no spurious restatements. `npm test`
runs **58 tests**.

**G5 = B20a + B21 + B22 + B23 is closed — the store can now be checked against its own logs.**
The timestamp invariant lives in **one** file (`src/shared/time.ts`), and B20a changed no behaviour
— the 58 tests that predated it pass unchanged. Every read row carries a settlement state,
`live` / `settled` / `restated`, derived at read by one function so the snapshot, the flush tick and
the resume cannot disagree. **`GET /api/verify`** rebuilds all four projections from the logs
through the real `apply()` into `TEMP` shadows (**D55**) and diffs them: the seeded world plus a
handful of events verifies clean in **5 ms**, and a hand-`UPDATE`d bucket comes back **409** naming
the ad, the minute, the column and both values. **`replay()`** recomputes a bucket range from raw
`signals` alone, over a log prefix, and agrees with the maintained rollup. `npm test` runs
**76 tests**.

**STAGE 2 IS CLOSED. G6 = B24 closed it, and with it the traceability claim is now checkable two
independent ways.** `npm run agree` recomputes every bucket from raw `signals` **without** `apply()`
and diffs the maintained rollups — measured at **0.88–1.71 s** over 357,540 events and 56,160
buckets, 0 mismatches, and it names its own limits on every run. `/api/verify` (3.6 s on the same
store) replays through the real `apply()` and diffs all four projections. **Neither subsumes the
other**: the sweep catches the code being wrong, verify catches the store having drifted from the
code. Two of the sweep's blind spots are recorded in §14 rather than papered over.

**The whole server-side model is now real.** Four signal kinds, six levers, config as a fold, click-
time attribution, orphans, restatement, settlement, and both checks — all verified by `curl` and
`sqlite3`, with no UI beyond stage 1's single climbing number.

**Stage 3 (B25–B35) is next: the simulator.** `SIMULATOR.md` is the spec and is complete to the
parameter, so each chunk is a comparison against a table already in that document rather than a
judgement. Every chunk adds `--dry-run` output rather than a screen, and emission stays live
throughout — the stage-1 number keeps moving.

**No decision blocks anything from B18 to B35.** D44/D45 are *deferred* (**F4**) and come back at
the stage 3 → 4 seam; see "What is open", which also carries the two unratified B11 assumptions.

**One caveat on `DESIGN.md`.** It was approved at the Phase 2 close and has since been **corrected
in one place and extended in two** by Phase 3 — read it *with* the "What Phase 3 changed in
`DESIGN.md`" section below, not instead of it.

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–**E15**, I1–**I20**) — the assembly source for the README's extensions section. **And §H (new, B25/B26): contradictions in our OWN design docs** — H1 the recovery half-life, H2 `spend`'s missing fee parameter. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–**9** · §C assumptions **U1–U9**. Resolved and deferred ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified only — **D1–D56, T1, F1–F4, U8–U9** (D44/D45 deferred). **Use the index table at the top as the lookup:** most have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in per-pass "wording of record" tables. |
| `docs/CHEATSHEET.md` | **One-page revise-from sheet.** Three tables. Refreshed at every **phase** close — **stale: its header still says "11 / 64 chunks", and D41–D43, F4, U8–U9 and D48–D56 are all missing.** Nine decisions behind, and its one-page hard limit will bind when they are added. See "What is owed". |
| `docs/SCOPE.md` | Phase 1 output. What's real (**P1–P17**), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary · aggregation · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |
| `docs/SIMULATOR.md` | **Phase 3 output.** The seeded world · the rate equation · diurnal, channel, temperature · fatigue · novelty · pacing · the lag mixture · noise · injected misbehaviours · determinism · backfill and the seed path · state sync · scenario control · calibration, measured · the parameter appendix. |
| `docs/BUILD_PLAN.md` | **Phase 4 output and the Phase 5 tracker.** 64 chunks — `B01`–`B62` **plus `B20a`**, with **B10 split into `B10a`/`B10b`**; per chunk: goal, files, manual verification, spec citation, hard-requirement flags, checkbox. §2 decisions · **§5 stage 2's six D48 gates** · §7 the B36 gate (now **four** items) · §11 scope coverage · §12 cut line (**held intact**, D49) · §13 schedule risk · **§14 the traps** (24) · **"The gate-margin check B34 owes"**. |
| `docs/ai-sessions/` | The **AI process artifact** the brief asks for (L153): one terminal capture per phase, `00`–`04`, exported by Seno. Plus `PHASE_PROMPTS.md`. **All five are committed; nothing owed here.** |
| **`package.json`, `tsconfig.json`, `.nvmrc`, `.gitignore`** | B01. Single package, three entry points, strict TS, Node 24 floor. |
| **`src/server/db.ts`** | B02/B07. `openDb()` (four pragmas, throws if not WAL), `tx()` (BEGIN IMMEDIATE), **`readTx()`** (BEGIN DEFERRED — B07: a read must not take the write lock, and under WAL it needs no lock to get a stable snapshot), `DB_PATH`. |
| **`src/server/migrate.ts`** | B02. Migration runner + CLI. `PRAGMA user_version`, no bookkeeping table. |
| **`migrations/001_logs.sql`** | B02. `components`, `audiences`, `signal_deliveries`, `signals`, `decisions`. |
| **`migrations/002_projections.sql`** | B03. `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`, `projection_meta`, `sim_scenarios`. |
| **`src/server/http.ts`** | B04/B09. `createRouter()` (method+pathname match, 404, handler error → 500), `sendJson()`, `readBody()`, `openSse()` — plus **`comment()`** (B09: a keepalive that dispatches no event and does not move `Last-Event-ID`). D42: no framework. |
| **`src/server/index.ts`** | B04/B05/B14. One `DatabaseSync` for the process; refuses to boot on an unmigrated store; `GET /api/health` (log position), `POST /api/ingest`, **`POST` and `GET /api/decisions`**; clean close on SIGINT/SIGTERM. Port **8787**, `PORT` overrides. |
| **`scripts/dev.mjs`** | B04/B08. **Three** OS processes: server, simulator (D32), and Vite on :5173. A crash in any tears the rest down; a **clean** exit does not. **Unchanged by B11** — the simulator now runs forever instead of returning immediately, so that tolerance is no longer exercised, but it is what keeps `npm run dev` alive if the emitter is ever stopped alone. |
| **`src/shared/types.ts`** | B05. The brief's `Signal` (L76) **verbatim**, `event` discriminator and all; `Disposition`, `SignalSource`, `IngestResult`. |
| **`src/server/ingest.ts`** | B05/B09/B16. `ingest(db, raw, source, now)` — DESIGN §5.1 in one transaction. Returns **`IngestOutcome`** = `{ result, dirty }` (B09: the buckets it moved, for the SSE flush; the caller publishes *after* commit). **Also the seeder's entry point** (SIMULATOR §15.2): one writer of `ingest_seq`. **`isCanonicalIso` is exported** for its D43 test (B12) and for no other caller. **B16 widened `SUPPORTED` to impression + click + spend**, added the `OWN_FIELDS` ownership table and the `click_id` collision test — whose position in the ladder is a §14 trap. **B18 completed `SUPPORTED` with `conversion`** and validates its two fields. |
| **`src/server/stream.ts`** | B09/B10a. **273 lines — B44 splits it** (§14/B44 row). `createStream(db)` — the process-wide dirty set (coalesced by `Map`), the **250 ms** flush tick, `subscribe`/`markDirty`/`shutdown`/`size`. **One frame per tick** carrying every touched bucket as an absolute row; `id:` = high-water `ingest_seq`. Plus B10a: `readCursor()` = `max(?cursor, Last-Event-ID)` validated as `/^\d+$/` on the RAW string, the store replay (`bucketsSinceReader`, `LIMIT 2001`), and the three `resnapshot` conditions. **Subscribes before replaying** — duplicates are free, gaps are not. |
| **`src/server/snapshot.ts`** | B07/B09/B10a. `GET /api/snapshot` — `parseSnapshotQuery()` (explicit offset required, bounds snapped to the minute, echoed) and `snapshot()`. Also **`bucketReader()`** (the flush's single-bucket read) and **`bucketsSinceReader()`** (the resume read) — both here so the snapshot, the flush and the resume cannot drift into three row shapes. Read-only by construction: SELECTs and nothing else. B21 adds settlement state, B38 the ratios, B51 the descriptors. |
| **`index.html`, `vite.config.ts`** | B08. Vite dev-serves `src/web` alone on **:5173** and proxies `/api` to :8787 (D41-A). Client fetches relative paths, so no CORS and one configuration. Unstyled: D45 deferred. |
| **`src/web/main.tsx`, `src/web/App.tsx`** | B08/B10b. Snapshot for the last hour, then subscribe from its cursor; renders **one bucket's `impressions` verbatim** plus the server's window, the cursor and a link state. No sum — see **D46**. Nothing durable client-side (§3). A `resnapshot` bumps a generation counter that re-runs the whole effect, so §3.1's "return to step 1" is literally a re-mount. |
| **`src/web/store.ts`** | B10b. The render cache. `createStore` / `applyRows` / `inWindow` / `latestBucket` / `bucketKey`. **The merge is an ASSIGNMENT keyed by `(ad_id, minute_start)`, never an addition** — absolute rows (D30) — and **out-of-window rows are dropped**, because the replay is unwindowed while the snapshot is windowed. |
| **`src/web/stream.ts`** | B10b. `subscribe(cursor, handlers)` → `EventSource('/api/stream?cursor=N')`. **`?cursor=` is mandatory (D47)**: `EventSource` cannot set a header, so without it every refresh drops the snapshot-to-subscribe gap. |
| **`src/server/apply.ts`** | B06/B13/B16. **The single projection writer (D7).** `apply()`, `floorMinute()`, D29's upsert — **one generalised statement binding four deltas**, covering impression, click and spend; `AppliedSignal` is a **discriminated union** on `kind`, so a caller that forgets the money is a compile error. **B18/B19 added the conversion** — the one kind that does not land at its own minute: `apply()` resolves attribution (so a rebuild re-derives placement through this same function), writes the `conversion_attribution` row, and credits either `conversions`/`value_cents` at the CLICK's minute or `provisional_*` at the orphan's own. It **returns `BucketKey[]`** — a click's promotions move two buckets each, and `stream.ts` treats every key as a row that certainly exists. **B20 added restatement:** `writeRollup()` (the one writer of `rollup_minute`, owning the counts, the `max_ingest_seq` raise and the settlement test), `promoteOrphans()`, and delta **coalescing by bucket** so `restatement_count` bumps once per bucket per event. Plus **`applyDecision()`** (B13): §7's four steps in one transaction — precondition, fold, close generation *n* / open *n+1*, write `ads`. It also inserts the `decisions` **log** row, deliberately, so the log and the projections it produces commit together. |
| **`src/shared/decisions.ts`** | B12. `AdConfig`, `AdInitial`, `DecisionBody` (§2.3's six actions), `Decision`, `ACTOR`. The lever half of "configs, signals and levers stay distinct" — no signal type appears here. `AdInitial` omits `created_at` per **D51**. |
| **`src/server/fold.ts`** | B12. **Two pure functions, no store, no clock.** `precondition()` = §7's compare-and-swap + the existence rules + the transition table (F1's unreachable `archived` branch lives in it, explaining itself). `fold()` = the six actions, returning a new object every time. |
| **`src/server/decisions.ts`** | B14. `postDecision()` and `listDecisions()` — parse and shape only; **writes nothing**. `ts` and `actor` are server-assigned, so U7's backdating and U2's actor are unrepresentable on the wire rather than validated. |
| **`src/server/attribute.ts`** | B17. `resolveAttribution()` and `generationAt()`. **Reads and computes only** — `conversion_attribution` is a projection and B18 persists the row this returns. Covers D14, D16, D27-B and I8/G30. Called by `apply()` from B18 on. **B19/B20 added the derived half:** `HORIZON_MS` (72 h, D13), **`settledAt()`** (§5.4's test, clocked at the arriving event's `received_at` — D38) which `attributionStateAt()` calls so the arithmetic exists once, and `orphanTally()`. **B21 moved `HORIZON_MS` to `shared/config.ts` and `settledAt()` to `settlement.ts`; `attributionStateAt()` calls the survivor.** **D54: `orphan_expired` is computed at read, never stored** — the column holds two states. |
| **`src/sim/fixtures.ts`** | B15. SIMULATOR §2 transcribed: `COMPONENTS` (16, `vl_04` at two versions), `AUDIENCES` (4, all US), `ADS` (12, with `live_days` and D52's budgets — the expected-spend derivation is written above the table). `served_fraction` is deliberately **not** here: it is an emitter parameter, not an `audiences` column. |
| **`src/sim/seed-world.ts`** | B15. `seedWorld(db, t0)` + `npm run seed`. Writes `components` and `audiences` directly (static reference data, not projections) and creates every ad **only** through `applyDecision()`. **D53:** decisions backdated to `T0 − live_days`. Refuses a non-empty world. |
| **`src/shared/time.ts`** | B20a. **The timestamp invariant, once.** `isCanonicalIso` (a round-trip, not a regex — a regex admits `2026-02-30`), `HAS_EXPLICIT_OFFSET`, `floorMinute`, `floorToMinute` / `ceilToMinute`, `toCanonicalIso`, `MINUTE_MS`. Collapsed four copies. **The write side REJECTS, the read side CANONICALISES** — deliberate, and stated here so it stops looking like two modules disagreeing. `ingest.ts` and `apply.ts` re-export their old names, so B20a moved code without re-plumbing importers. |
| **`src/shared/config.ts`** | B21. `HORIZON_MS` (72 h, D13) and `ACCOUNT_TZ` (`America/New_York`, D22/I2 — the budget day boundary and the diurnal curve, and nothing else; buckets stay UTC). |
| **`src/server/settlement.ts`** | B21. `settledAt(minute_start, at)` — §5.4's test, clocked at the arriving event's `received_at` (D38) when `apply()` asks and at the read moment when the read side does — plus `bucketState()` → `live` / `settled` / `restated`. Derived, read-side; nothing here writes. The horizon is a **parameter**, which is what makes P16/B49 a sweep rather than a hunt. |
| **`src/server/verify.ts`** | B22. `GET /api/verify`. Rebuilds all four projections from the logs through the **real** `apply()` / `applyDecision()` into `TEMP` tables that **shadow the projection names** (**D55**), hash-compares each, and walks rows only where a hash disagrees (§7's fast path). 200 clean / 409 divergent, so a script need not read the body. Temp DDL derived from `sqlite_master`, `REFERENCES` stripped (a temp FK resolves inside `temp`), `CHECK`s kept. `decisions` **is** shadowed (B13 writes the log row in the same transaction); `signals` is **not**. **The only file allowed to schema-qualify a projection** — §14, with a build-failing tripwire. |
| **`scripts/agree.ts`** | B24. **`npm run agree` — P14.** One ordered whole-log pass: index every click, walk `signals` in `ingest_seq` order accumulating **all** buckets at once, diff `rollup_minute`. Two linear scans, `O(2N)` — **never `replay()` per bucket**, which is `O(buckets × N)` and ~13 h at this size. Exits 1 on any mismatch, naming ad, minute, column and both values. **It states its own limits on every run** (§14): the four arrival-order columns are not diffed, and `ads` / `config_generations` / `conversion_attribution` are not read at all. |
| **`src/server/replay.ts`** | B23. `replay(descriptor)` — pure over a log prefix, **raw `signals` only, never `rollup_minute`** (§10.2: the display path and the check path must differ, or the walk-back compares the code to itself). The prefix bounds attribution as well as counting. Returns the counts **and** `contributing_event_ids`, which is the evidence half. No HTTP — the drill-down is B52/B53. |
| **`src/server/*.test.ts`** | B12/B13/B17–B23. `npm test` = `node --test`, **76 tests**: `fold.test.ts` (12), `ingest.test.ts` (`isCanonicalIso`, 4), `stream.test.ts` (`readCursor`, 7), `apply-decision.test.ts` (8), `attribute.test.ts` (8), `conversion.test.ts` (11 — B18/B19, ingest→apply end to end), `restate.test.ts` (8 — B20, promotion and the D38 clock), `settlement.test.ts` (5 — B21), **`verify.test.ts` (7 — B22, including D55's build-failing tripwire)**, **`replay.test.ts` (6 — B23, including its own no-projection guard)**. D43's criterion governs what goes here, not a list. |
| **`src/sim/index.ts`** | B11. The emitter: `a_12` only, impressions only, a **constant** 20,000/day (§2.3), 1 s tick at 1× wall clock, one batched POST per tick, `ts` = the second that has **closed** so I10 never clamps. The tick index is the **absolute unix second** — that, not the id alone, is what makes a restart's re-emission `duplicate_identical`. A failed POST is held and coalesced into the next tick. Env: `SIM_SEED`, `SIM_INGEST_URL`. Never opens the store (D32). |
| **`src/sim/rng.ts`** | B11. `SIMULATOR.md` §14's formula: `splitmix64(fnv1a64(seed ∥ stream ∥ parts))`, key parts NUL-joined so two entities cannot share one stream. `draw()` → `u ∈ [0,1)`; `derivedId()` → the same 64 bits as 16 hex chars. Keyed, not sequential, so a lever cannot reshuffle another ad's draws. **~2 µs a draw** — see the note in "Next action". |
| **`src/sim/params.ts`** | B25/B26/B27. **§21's parameter appendix, transcribed** — diurnal weights and `Z`, `w_dow`, `α = 8`, `base_impr_per_day`, `served_fraction`, the `FATIGUE` constants, §5's channel matrix, §6's temperature matrix, the `NOISE` concentrations, `SPEND_TICK_S`. Nothing here is a choice and each number names its section. `p_fast` is the one §6 column still absent — B29 reads it. |
| **`src/sim/rate.ts`** | B25. `d_c(h)` (account-local hour via `Intl`, offset cached per UTC hour), `w_dow`, `lambdaPerSecond()` and `negBinomial()` as a Gamma–Poisson mixture. `RateFactors` carries `phi` **declared and never passed** (D56), plus `nu`/`rho`/`demand` for B28/B32/B30. |
| **`src/sim/fatigue.ts`** | B26/B28. `pool()`, `phi()`, `phiAd()`, `rest()` (2^(−Δt/5 d)), `versionAdjusted()` (`r = 0.35`), `nominalAccrual()`, `adFatigue()` — plus §8's novelty: `novelty()`, `noveltyKey()` (**keyed `(lineage, VERSION, audience)`**), `noveltyAgesAtT0()`, `adNovelty()` (**the video slot only** — `BRIEF_GAPS` §H3). Accrual is keyed by **(lineage × audience)**, both slots of every ad. `nominalAccrual()` is the projection §7.2 was calibrated with, **not** the measurement — B31 recomputes `F` from the signal log. |
| **`src/sim/emit.ts`** | B27/B30. `betaBinomial()` (Pólya urn), `logNormal()`, `pCtr()` (**where φ and ν enter — D56**), `pCvr()`, `orderValueCents()`, `clicksForTick()` (takes a `ClickFactors` object: `phiAd`, `nu`, `mChannel`), `cpmAccrualCents()`, `spendCents()`, `isSpendBoundary()`. |
| **`src/sim/lag.ts`** | B29. `purchaseLagMs()` (fast/slow mixture by `p_fast`, `null` past the 7-day cutoff — the truncation IS a dropped conversion), `reportingLagMs()` (the straggler is additive), `scheduleFor()`. **Keyed by `click_id` and nothing else**, per §15.3(b), which is what lets B31 hand over a bare list of pending click ids. **Emits nothing** — see "What is owed". |
| **`src/sim/noise.ts`** | B30. `demand()`, `demandFactor()`, `demandConstants()`, `stepIndex()`. §12's two log-AR(1) factors as a **truncated innovation sum, never an accumulator** — see the traps. Innovation sd rescaled so the stationary variance is exact at any truncation; Box–Muller pairs shared across adjacent steps so `K` innovations cost `K` draws. |
| **`src/sim/dry-run.ts`** | B25/B26/B27. **Stage 3's whole verification surface**, three sections from ONE simulation pass. Emits nothing. `arrivalProcess()` returns the per-ad tallies `clickAndCostPath()` prints; `fatigue()` diffs itself against §7.2 and prints **MATCH/DIFFERS** per row. |

## How to run what exists

```
npm i                 # Node 24+ required; node -v
npm run db:migrate    # creates data/loop.sqlite, applies both migrations
npm run seed          # B15: the 12-ad world, as 24 backdated decisions. ONCE, on an empty store
npm run dev           # THREE processes: server :8787, Vite client :5173, simulator (B11, real)
npm run sim           # the simulator alone, against an already-running server
npm run sim -- --dry-run --hours 24     # B25-B30: emits NOTHING, prints the model vs SIMULATOR.md
                                        # ~50 s. ONE simulation pass feeds all six sections
npm run sim -- --dry-run --hours 1      # ~12 s; everything but the hour-by-hour diurnal shape.
                                        # ~11 s of that is FIXED: B29's 80k lag draws and B30's
                                        # AR(1) ensemble, neither of which scales with --hours
                                        # --from <iso> anchors the window; default is local midnight
npm run typecheck     # tsc --noEmit, must be clean
npm test              # node --test — 76 tests (D43's targets plus the write path)

open http://localhost:5173        # the number, live. Ctrl-C the runner and it comes back.

curl -s localhost:8787/api/health                       # log position + stream_subscribers
T=$(node -e "console.log(new Date(Date.now()-30e3).toISOString())")     # PAST — see the clamp note
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"e1","ts":"'$T'","ad_id":"a_12","event":"impression"}]'
#   -> the browser number moves within ~250 ms, no refresh

F=$(node -e "console.log(new Date(Date.now()-3600e3).toISOString())"); TO=$(node -e "console.log(new Date().toISOString())")
curl -s "localhost:8787/api/snapshot?from=$F&to=$TO"    # buckets + as_of_ingest_seq
curl -sN "localhost:8787/api/stream?cursor=0"           # ready frame, then absolute rows per tick
curl -sN -H 'Last-Event-ID: 999999' localhost:8787/api/stream    # resnapshot cursor_ahead_of_log

curl -s localhost:8787/api/verify                       # B22: 200 clean / 409 with the offending key
npm run agree                                           # B24: exits 1 on a mismatch, 0 clean
#   -> hand-UPDATE any rollup_minute row and BOTH catch it, for different reasons:
#      verify rebuilds through apply() (a drifted STORE); agree recomputes without it (wrong CODE)
# B18/B19 — a click, then its late conversion. The conversion lands in the CLICK's minute.
CK=$(node -e "console.log(new Date(Date.now()-9000e3).toISOString())")   # 2.5 h ago
CV=$(node -e "console.log(new Date(Date.now()-60e3).toISOString())")
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"k1","ts":"'$CK'","ad_id":"a_12","event":"click","click_id":"ck1","cost_cents":62}]'
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"v1","ts":"'$CV'","ad_id":"a_12","event":"conversion","attributed_click_id":"ck1","value_cents":4500}]'
#   -> one rollup row moves, at the CLICK's minute; none is created at the conversion's
#   -> attributed_click_id that matches nothing => provisional_conversions at its OWN minute

sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impressions,max_ingest_seq FROM rollup_minute ORDER BY max_ingest_seq;"
sqlite3 data/loop.sqlite "SELECT disposition, COUNT(*) FROM signal_deliveries GROUP BY 1;"
#   -> restart the sim within 60s: duplicate_identical rises, impressions do NOT
```

**The seeded world, from B15.** On a scratch store so `data/` stays as the simulator left it:

```
export DB_PATH=/tmp/g2.sqlite PORT=8791
rm -f "$DB_PATH"* && node src/server/migrate.ts && node src/sim/seed-world.ts
#   -> T0 = <boot instant>;  24 decisions -> 12 ads, 24 generations
sqlite3 "$DB_PATH" "SELECT (SELECT COUNT(*) FROM decisions),(SELECT COUNT(*) FROM ads),
  (SELECT COUNT(*) FROM config_generations),(SELECT COUNT(*) FROM config_generations WHERE valid_to IS NULL);"
#   -> 24|12|24|12      TWENTY-FOUR generations, TWELVE open — see the note below
sqlite3 -header -column "$DB_PATH" "SELECT ad_id,status,launched_at,daily_budget_cents FROM ads ORDER BY launched_at;"
node src/sim/seed-world.ts        # refuses: "12 ads already exist"
```

**Twenty-four generations, not twelve.** `BUILD_PLAN.md`'s B15 row says "12 generations" and means
the count of **open** ones. Every ad gets generation 1 in `draft` at `create_ad` and generation 2
`live` at `launch`, because status is one of the six columns `config_generations` carries and §7
opens a generation whenever a config value changes. Verified, reported at the G2 gate, not a bug.

**The lever.** Against the same seeded store:

```
node src/server/index.ts &
post() { curl -s -w " [%{http_code}]\n" -X POST -H 'content-type: application/json' localhost:8791/api/decisions -d "$1"; }
post '{"decision_id":"d_live_1","ad_id":"a_12","rationale":"budget was binding all evening","action":"set_budget","from_cents":9000,"to_cents":15000}'
post '{"decision_id":"d_live_2","ad_id":"a_12","rationale":"stale tab","action":"set_budget","from_cents":9000,"to_cents":99}'   # 409 stale_precondition
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"pause"}'
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"pause"}'    # 200 "replayed":true, same seq (U5)
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"resume"}'   # 409 decision_id_reused
post '{"decision_id":"d_live_4","ad_id":"a_12","rationale":"x","action":"resume","ts":"2020-01-01T00:00:00.000Z"}'  # 400 ts_is_server_assigned
post '{"decision_id":"d_live_5","ad_id":"a_99","rationale":"x","action":"pause"}'               # 409 ad_unknown

curl -s localhost:8791/api/decisions            # the whole log, in fold order
curl -s "localhost:8791/api/decisions?ad_id=a_12"
sqlite3 -header -column "$DB_PATH" "SELECT generation_id,seq_in_ad,valid_from,valid_to,daily_budget_cents,status FROM config_generations WHERE ad_id='a_12' ORDER BY seq_in_ad;"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM config_generations a JOIN config_generations b ON a.ad_id=b.ad_id AND a.seq_in_ad+1=b.seq_in_ad WHERE a.valid_to <> b.valid_from;"   # 0: no gap, no overlap
```

**A refused lever consumes no `decision_seq` and writes nothing** — not a log row, not a
generation. Config derives from the log, so a decision that changed nothing would make the fold's
own history unreplayable.

**Click and spend, from B16.** Against the same running server:

```
T=$(node -e "console.log(new Date(Date.now()-90e3).toISOString())")
curl -s -X POST -H 'content-type: application/json' localhost:8791/api/ingest -d '[
 {"event_id":"e_i1","ts":"'$T'","ad_id":"a_12","event":"impression"},
 {"event_id":"e_c1","ts":"'$T'","ad_id":"a_12","event":"click","click_id":"c_001","cost_cents":62},
 {"event_id":"e_s1","ts":"'$T'","ad_id":"a_12","event":"spend","amount_cents":130}]'
# a SECOND click claiming c_001 with a NEW event_id -> rejected_invalid / click_id_already_claimed
# a REDELIVERY of e_c1 (same click_id)              -> duplicate_identical, NOT a reject
sqlite3 -header -column "$DB_PATH" "SELECT ad_id,minute_start,impressions,clicks,click_cost_cents,spend_cents FROM rollup_minute;"
sqlite3 -header -column "$DB_PATH" "SELECT strftime('%Y-%m-%dT%H:%M:00.000Z',ts_effective) m,
  SUM(kind='impression'), SUM(kind='click'), COALESCE(SUM(cost_cents),0), COALESCE(SUM(amount_cents),0)
  FROM signals GROUP BY m;"        # byte-identical to the rollup row above — P14 in miniature
```

**Attribution, from B17 — it has no HTTP surface.** Conversions do not enter `ingest()` until B18,
so `npm test`'s eight `attribute.test.ts` assertions are the verification. The one worth running by
hand is D53's payoff, because it is the thing that would have been silently wrong:

```
node --experimental-strip-types -e "
import { openDb } from './src/server/db.ts';
import { ingest } from './src/server/ingest.ts';
import { resolveAttribution, generationAt } from './src/server/attribute.ts';
const db = openDb();
const ts = new Date(Date.now() - 5*86400000).toISOString();
ingest(db, [{event_id:'e_bc', ts, ad_id:'a_12', event:'click', click_id:'c_back', cost_cents:62}], 'backfill', () => ts);
console.log('generation covering a click 5d ago:', generationAt(db, 'a_12', ts));
console.log(resolveAttribution(db, {event_id:'e_cv', ad_id:'a_12', ts_effective:new Date().toISOString(),
  attributed_click_id:'c_back'}, new Date().toISOString()));
db.close();"
#   -> g_a_12_002, and credited_minute is FIVE DAYS AGO — the conversion arrived today.
#      Under D53 option A that generation would have been null for the whole seeded week.
```

**The simulator's knobs** (B11, all env vars, all with defaults): `SIM_SEED` (`'flawless-loop'`),
`SIM_INGEST_URL` (defaults to `http://localhost:${PORT ?? 8787}/api/ingest`, so moving `PORT` moves
both processes). It emits **`a_12` only**, impressions only, at a **constant 0.2315/s**
(20,000/day, `SIMULATOR.md` §2.3) — ~14 a minute. **On boot it re-emits the last 60 s**, which is
what makes the restart check above work and why a fresh store is never empty.

**A pause does not stop emission yet.** `GET /api/sim/world` is **B29**; until then the emitter has
no way to learn an ad's status and emits regardless. That is correct for a build with no `ads`
projection, and it is the one part of HR3 that stage 1 does not yet demonstrate.

**In dev, `StrictMode` runs every effect twice**, so ONE browser tab produces two
`GET /api/snapshot` calls and `stream_subscribers: 2`. Harmless — absolute rows, identical frames —
but it reads as a bug if you are not expecting it.

**Driving the client without a browser.** `src/web/store.ts` and `src/web/stream.ts` are JSX-free,
and `node --experimental-eventsource --experimental-strip-types` gives a real `EventSource`, so the
shipped client modules can be exercised against the running server headlessly. That is how B10b was
verified; the harness only has to shim `EventSource` to absolutise the relative URL, because Node
has no page origin.

**Hand-verifying bucketing needs `ts` in the PAST.** A future `ts` is clamped to `received_at` by
I10, so future-dated test events all collapse into the current minute — correct behaviour, and it
cost one confused verification run at B06.

`data/` is gitignored. **Deleting it is the supported reset**; `npm run db:migrate` rebuilds from
empty. `node:sqlite` prints an `ExperimentalWarning` on every run — that is **deliberate** (**U9**).

## The build plan in one paragraph

Stage 0 (B01–B03, **done**) is the schema. **Stage 1 (B04–B11, done) is the walking skeleton and the whole
point of the ordering**: one simulated event, persisted, aggregated, transported over SSE, on screen,
surviving a refresh *and* a restart of both processes — impressions only, one hard-coded ad, before
any breadth. Stage 2 (B12–B24) is the full write path — fold, generations, all four signal kinds,
attribution, cohort placement, orphans, restatement — verified entirely by `curl` and `sqlite3`, and
it ends with the P14 agreement sweep so that everything after it is guarded. Stage 3 (B25–B35) is
the simulator against `SIMULATOR.md`'s measured tables, ending with the 7-day backfill and the `T0`
handover seam. Stage 4 (B36–B45) is the Signal surface, stage 5 (B46–B50) the decision loop plus the
horizon and scenario controls, stage 6 (B51–B56) the traceability surfaces and the Workbench
screen, stage 7 (B57–B62) packaging.

## What is ratified

Full entries with rationale, consequences and what each forecloses are in `docs/DECISIONS.md`; the
one-line-each version is `docs/CHEATSHEET.md` table 1 (currently one pass behind).

- **D1–D14, T1, D26, F1, F2** — scope, model and storage.
- **D27–D34, D20, D22** — the Phase 2 design decisions and their residues.
- **D35–D40, D17, F3, D35p** — Phase 3: fatigue accrual · the lag mixture · the noise model ·
  backfill arrival semantics · volume calibration · simulator state and config sync · D17 closed ·
  scenario control as P17 · the two fatigue parameters (`served_fraction`, version reset `r`).
- **D3, D4, D15, D16, D18, D19, D21, D22, D23, D25** — the carried-over block.
- **D41–D43, F4 (2026-09-04, Phase 5 toolchain)** — single package + Vite client-only · `node:http`
  + hand-rolled router · `node:test` on the functions whose wrongness is invisible · D44/D45
  deferred, not open.
- **D46 (2026-09-04, at B08)** — window aggregation: the server computes **and signs** totals and
  ratios; **SSE keeps per-minute absolute rows unchanged**; the client may re-bucket to display
  granularity only under the **same server-issued descriptor**. Seno's own option, an amendment to
  the three offered. It also corrected a misreading of mine that is worth not repeating: **§10.2's
  "compare the client to itself" is about the rejected D30-A (the client aggregating RAW events)**,
  not a ban on all client arithmetic — what forbids an undescribed total is **§10.1**, because
  B52's `<Metric>` cannot render a value with no descriptor.
- **D47 (2026-09-04, at B10a)** — the resume contract: cursor is **`max(?cursor=N,
  Last-Event-ID)`**, replay is a store query with `LIMIT 2001`, and `resnapshot` fires past **2,000
  rows**, above the log's high-water mark, or on a non-numeric cursor. The threshold is on rows
  because seq distance mispredicts the cost by orders of magnitude in both directions.
- **D48–D50 (2026-09-04, at the B11 close — PROCESS, not design)** — the gate is the **group**, not
  the chunk: 3–5 related chunks per approval, never crossing a stage boundary, one report with a
  **per-chunk** verification block, still **one commit and one tick per chunk**; **B20, B24, B34,
  B35, B36, B37 stay single-gated**. §12's cut line is **held intact**, to be re-decided at the B36
  gate. **B61 becomes a running `docs/DEMO.md`** from the B36 group onward. **D48 amends
  `CLAUDE.md` §5** — read §5 as it now stands, not as remembered.
- **D51 (2026-09-04, at the G1 close)** — `create_ad`'s `created_at` is **derived from the
  decision's `ts`**, not client-supplied: §2.3's literal `Omit` would have put two timestamps on one
  event. The endpoint rejects `initial.created_at` outright rather than ignoring it. Consequence to
  remember at **B15**: the seeder cannot backdate an ad's creation except through the decision `ts`
  it writes.
- **D52–D53 (2026-09-04, at the G2 announcement — surfaced BEFORE any code, because both are
  written into the append-only decision log by B15).** **D52:** `daily_budget_cents` is hand-set
  per ad, grounded in an expected-spend derivation recorded above the fixture table, with **`a_08`
  and `a_12` deliberately near their cap** so §9's pacing is visible on frame one instead of only
  present in the code. **D53:** B15 **backdates** the seeded `create_ad` / `launch` decisions to
  `T0 − live_days`, fixing `T0` as the seeder's boot instant — under the alternative every
  backfilled click would sit before any generation and D14 would be `NULL` for the whole seeded
  window, discovered at B37 and costing a reseed. Wording of record: *"52 - B and 53 - B"*.
- **U1–U7**, and **U8–U9** (2026-09-04) — store path `data/loop.sqlite`; `ExperimentalWarning` left
  visible.
- **8 cheap defaults** — ratified as a block.

**The three that most shape the build**, if you only reload three: **D27** (a conversion counts in
its *click's* minute — this is why CPA/ROAS lag and CTR does not), **D7** (nothing writes a
projection except the replay/apply function), **D30/D34** (the server owns all arithmetic; the raw
tail is structurally incapable of producing a number).

**The one that most shapes the mock data:** **D35** — fatigue accrues to the
`(component lineage × audience)` pair, so a video burned out on one audience arrives pre-fatigued in
a new ad on that audience, and fresh on a different one.

**D43 is sharper than its option text.** Seno ratified it as *"tests only where a wrong answer is
invisible; the agreement sweep is the real safety net."* The test surface is governed by that
**criterion**, not by the four-function list — a chunk proposing a fifth target must argue its
wrongness cannot be seen by hand or by the B24 sweep.

## What is open

**Nothing blocks any chunk from B12 to B35.**

| # | Question | Blocks | Status |
|---|---|---|---|
| **D44** | Chart rendering — library or hand-rolled SVG | **B37** | **DEFERRED** (F4). Recommendation on the table: uPlot behind a descriptor-bearing wrapper |
| **D45** | Styling approach | **B36** | **DEFERRED** (F4). Recommendation on the table: one plain stylesheet, semantic custom properties |

**Deferred is not open.** They are deliberately not being asked yet, because they are answered better
at B36 — with the data volumes and the settlement-state legibility problem concrete — than now. Two
obligations come with that, both of which bite silently if dropped, and both are written into
`BUILD_PLAN.md` §7 as a gate before B36:

1. **The chunk before B36 re-raises both.** A deferral nobody re-opens is a forgotten decision.
2. **Nothing between here and B36 may settle either by drift** — no chart or styling library
   installed, nothing hand-rolled that pre-empts the choice. A chunk needing styling before B36 uses
   unstyled HTML and says so.

**D57 is RATIFIED** (2026-09-04) and settled three things §12 left unstated: `E[m] = 1` via a
`−sd²/2` log drift, **Δ = 60 s** for the AR(1) grid, and the click rate drawn **once per minute** so
`κ = 200` stops being inert. Seno's deciding reason is in `DECISIONS.md` and is not the one that
raised it: D52's pacing baselines were set against `base_impr_per_day`, so a permanent +4.86% is
absorbed as `ρ` throttling on `a_08` and `a_12` — and `a_08` is the ad D56 had already cut from 53%
to 20% of hourly-CPA headroom.

**Two unratified assumptions**, both labelled in code, both blocking nothing now. Neither is a
`DECISIONS.md` entry yet, and neither should be settled by drift:

| What | Current value | Needs sign-off before |
|---|---|---|
| The world **seed** — §14 fixes the *formula*, no document fixes a **value**, and it is the first term of `(seed + decision log + scenario log) → world` | `SIM_SEED ?? 'flawless-loop'`, a code constant | **B34**, where the seed path makes it load-bearing for reproducibility. The live alternative is a row in the store, so a forked run is recorded rather than remembered |
| The emitter's **boot catch-up window** — forced to exist by B11's own restart property and §16's *"it re-reads and resumes"*, but its **length** is written nowhere | `CATCHUP_S = 60`, one `rollup_minute` bucket (D28), **aligned down to a 60 s spend boundary at B27** | **B34**, where §15.3(b)'s `T0` seam makes the start `max(now − CATCHUP_S, T0)`, and **B31**, where `GET /api/sim/world` could carry a server-derived resume position and remove the duplicates entirely |


## Build progress

| | |
|---|---|
| **Current stage** | **Stage 3 · the simulator (B25–B35) is RUNNING.** Stage 2 closed with B24. |
| **Last completed chunk** | **B31a** — the shared account-local clock and `GET /api/sim/world`. Before it, **B30** `f7390d6` — §12's two log-AR(1) demand factors, the `E[m] = 1` drift and the per-minute click rate. G8's others: B29 `76d9e3e`, B28 `47e0d41`, with **D57 first** (`fdd2e1e`) because B30 was built on the answer. G7 was B25–B27 (`52d7b29`, `ee9adb1`, `1ce29a7`) behind **D56** (`ea3557e`). |
| **Next gate** | **B31b — the emitter's 1 Hz poll and emission gating.** **HR3 IS NOT SATISFIED UNTIL THIS LANDS** — B31a's endpoint changes no emission. Mandatory for the demo, in Seno's words: *"without the world poll a paused ad keeps emitting and HR3's 'the world responds' fails on camera."* It also ends the frozen-φ/ν assumption. |
| **Gate after that** | **B32 + B33** (budget pacing, injected misbehaviours). **B34 and B35 stay single-gated.** |
| **Stage 3's gates so far** | ~~**G7** B25+B26+B27~~ · ~~**G8** B28+B29+B30~~ — *"the remaining stochastic structure"*. Both closed. |
| **G7, for the record** | B25+B26+B27, *"the rate equation becomes real"*. It **stopped mid-build at B26** under D48, because B27 could not write `p_ctr` until **D56** was answered; re-announced and finished after the answer. **That is D48's stop clause working as designed** — the first time it fired. |
| **Stage 2's six gates** | ~~**G1** B12–B14~~ · ~~**G2** B15–B17~~ · ~~**G3** B18+B19~~ · ~~**G4** B20~~ · ~~**G5** B20a+B21–B23~~ · ~~**G6** B24~~ — **all six closed.** |
| **In flight** | nothing |
| **Chunks ticked** | **33 / 65** (B01–B09, B10a, B10b, B11–B20, B20a, B21–B30, B31a) — 64 because **B20a** was added and **B10 was split into B10a/B10b**, see below |
| **Cut line status** | nothing cut |
| **Plan edits, cont.** | **B31 split into B31a/B31b** (2026-09-04, Seno's call): B31 was ~240 diff lines across four files, and B09 at ~230 is what prompted the B10 split. Its verify column already named two separable checks. B31a is the shared account-local clock + `GET /api/sim/world`; B31b is the poll and emission gating. **65 chunks now.** |
| **Plan edits made during Phase 5** | **B16 split** (2026-09-04, Seno's call): B16 was to widen `SUPPORTED` to all three remaining kinds while B18 extended `apply()` — so B16 would have shipped a server that 500s on its own verify step. B16 now takes **click + spend, ingest *and* `apply()`**; **conversion ingest moved to B18**, with placement, because `ingest()` calls `apply()` for every accepted signal and a no-op branch would be the exact divergence `default: throw` prevents. **B17's `curl` verification is therefore B18's**; B17 is exercised on a fixture. |
| **Plan edits, cont.** | **B10 split into B10a/B10b** (2026-09-04, Seno's call, after B09): B10a is the **server-side** resume (`Last-Event-ID`, store replay, `resnapshot`), B10b the **client** (subscribe, merge, reconnect). B09 ran ~230 diff lines against the ~150 target and B10 whole would have been worse. |
| **Plan edits, cont.** | **B20a added** (2026-09-04, Seno's call, after B07): `src/shared/time.ts` — one implementation of the timestamp invariant (`isCanonicalIso` / `toCanonicalIso` / `floorMinute`), inserted immediately **before B21** because B21's horizon sweep would otherwise be the *fourth* copy of that rule (ingest's round-trip B05, `apply()`'s regex B06, snapshot's inline snap B07). Lettered, not renumbered: `B21`–`B62` are cited by id across four documents. |

**The convention, as amended by D48.** A **group** is done when: it is announced, built, reported
**once with a per-chunk verification block**, and Seno says ok. Then commit **per chunk**, tick each
box in `docs/BUILD_PLAN.md`, update this table, and **stop and take the next instruction**. Never
chain two **groups** on one approval, and never widen a group past 5 chunks or across a stage
boundary. **B20, B24, B34, B35, B36, B37 are single-gated.** A group **stops mid-build** if a chunk
needs a decision (§3), reveals the design is wrong, or wants a new dependency.

**What did NOT change, and it is the reason the trade is only latency:** chunk size (~150 lines, one
concern), per-chunk commits, and **per-chunk verification**. Seno independently re-runs the
verification — that is what caught the B07 window bounds and the B10a cursor coercion, both silent —
so a group report must make every chunk's steps separately reproducible, ideally as one
copy-pasteable block. Reversible at any time: **"solo from here"** restores the per-chunk gate.

## Traps that will not fail loudly

`BUILD_PLAN.md` §14 is authoritative; carried here so a cold resume sees them without opening the
plan. **Each produces wrong or slow output with no error.** Twenty-six now — the Phase 5 ones were
found against the real store and are in no design document.

**The two newest (B30), both about §12's AR(1) factors:**

- **A stateful AR(1) would break re-emission and nothing would say so.** `m` multiplies λ, λ decides
  a tick's impression count, and `event_id` is derived from tick and index — so a running `m`
  re-derives differently after a restart and turns every re-emitted second into
  `duplicate_conflicting` instead of `duplicate_identical`. `m` must stay a pure function of `t`;
  `noise.ts` unrolls the recursion into an innovation sum for exactly this reason.
- **The naive sample ACF understates by 20% here, so a correct process reads as broken.**
  Subtracting a SAMPLE mean gave 0.287 at lag τ against a true 0.368 — four standard errors out —
  because at `τ/Δ` of 20–45 a few-hundred-step window holds only ~12–25 effective observations.
  `log m` has a true mean of **exactly 0**, so no mean may be subtracted. The dry run now prints the
  **closed-form** ACF of the truncated sum as the primary check, so sampling noise can never be
  mistaken for a defect again.

**The two newest (B27), both found by reading the store rather than the code:**

- **A derived `spend` delta must cover an interval the emitter EMITTED, not merely one it can
  re-derive.** Needs BOTH boot alignment to a 60 s boundary AND the `tick − 60 >= FIRST_TICK`
  guard; with only the first, the first tick generated is itself a boundary and closes the interval
  entirely before boot — a bucket with a `spend` row and **zero** `impression` rows. Nothing errors;
  HR5 just stops being true for one minute of every run, in the money column.
- **`BetaBinomial`'s κ = 200 does nothing at a 1-second tick.** Overdispersion enters through
  `(N − 1)/(κ + 1)`, exactly zero at `N = 1`, and per-tick `N` is 0–3. §10 is implemented as
  written and κ is transcribed correctly — the parameter simply has no effect, so §12's *"the rate
  is uncertain, not just the count"* is undelivered. **B30 owns it**; the risk is that B30 reads κ
  as done and never tests the dispersion.

- **Nothing writes a projection except `apply()`** (D7). `ads`, `config_generations`,
  `conversion_attribution`, `rollup_minute`. A chunk that writes one directly breaks the single
  property the design exists to demonstrate and **will not show up as a test failure**.
  `sim_scenarios` is **not** a projection and is the one table in `002_projections.sql` that
  `apply()` does not own.
- **The `click_id` collision test must sit AFTER the `event_id` dedupe** (found at B16). §13
  injects a 0.05% dual-click-id fault, caught in `ingest()` because `ux_signals_click_id` would
  otherwise refuse the insert and take the whole batch down with it. But a redelivery of ONE click
  carries its own `click_id` too: tested first, every honest retry reads as that fault, B11's
  measured 14 `duplicate_identical` / 0 conflicting becomes 14 rejects, and §13's 0.05% rate
  measures near 100%. A collision is only a collision **between two different `event_id`s**.
- **Every projection id must be a FUNCTION of data the rebuild also has** (found at B13).
  `config_generations.generation_id` is `g_${ad_id}_${seq_in_ad}` padded to three digits. A
  `randomUUID()` there typechecks, reads as normal practice and passes every hand check — and then
  **B22's rebuild produces the same generations with different ids, so B24's row-by-row diff reports
  total divergence on a correct store**, whose tempting fix is to drop the id from the diff. Note
  `DESIGN.md` §10.4 writes it `g_a12_004` in prose; the code keeps `ad_id` verbatim (`g_a_12_004`)
  because stripping the underscore can collide.
- **A client that re-buckets must aggregate at the descriptor's own `granularity_s` and forward the
  descriptor byte-for-byte** (D46, bites at B38/B51/B52/B53). Re-bucketing to a granularity the
  descriptor does not name makes the drill-down replay a *different question* — and it can **pass by
  coincidence**. The HMAC catches a client-minted descriptor; nothing catches this. **B53's
  drill-down is the check that makes D46 safe**, so it is not optional.
- **`sendJson(body: unknown)` hides every response shape from `tsc`** (found at B09). Changing
  `ingest()`'s return to `{ result, dirty }` typechecked clean while silently changing the emitter's
  response body. The mechanism, not just the rule: **annotate at the call site** —
  `const responseBody: IngestResult = result;`.
- **An SSE subscriber makes `server.close()` hang** unless connections are closed first (found at
  B09; regresses B04's verified shutdown). Measured: close callback had not fired after 1000 ms;
  with `stream.shutdown()` first, 14 ms (23 ms with four subscribers). Presents as "Ctrl-C hangs
  sometimes", only with a tab open.
- **The SSE resume is a store query, never a replay of buffered frames** (Seno's constraint at B09,
  built in **B10a**). `max_ingest_seq > cursor`, a full scan — fine once per connect, impossible
  per tick. The flush drops its dirty set when nobody is subscribed, and **§3.1 step 3** is what
  makes that safe, *not* the snapshot: the snapshot precedes the subscribe, so it cannot cover the
  gap. Built from memory instead, the bucket it loses is a **late conversion restating an old minute
  that never moves again** — wrong on screen, forever, no error.
- **`max_ingest_seq` is the resume contract** (B10a). A projection write that changes a bucket
  without raising it is invisible to every resuming client — **B18's restatement touching only
  `restated_at`** is the concrete case — and **B24's sweep will not catch it** because the counts
  are right. Every future `apply()` path must raise it.
- **Validate a cursor's INPUT, not the parsed result** (B10a, found by Seno). `Number('1e3')` is
  1000, so `?cursor=1e3` replayed as `?cursor=1000` and silently skipped 1,000 buckets;
  `Number.isInteger` inspects the output and passes `0x3`, `+2`, `2.0`, `' '`. And a **present-but-
  empty** cursor read as *absent* → go live with no replay, which is the exact gap B10a exists to
  close. `/^\d+$/` on the raw string; absent is the only path to "go live".
- **The emitter's tick index must be an ABSOLUTE unix second, never a counter since boot** (B11).
  Derived ids are what let the simulator hold no durable state (§14, DESIGN §3.3) — but the **body**
  has to be derivable too. A per-process counter re-derives the same `event_id` on restart with a
  **different `ts`**, and a matching id with a differing body is `duplicate_conflicting`, which
  §5.1 step 4 surfaces as a **platform correction** — a fabricated misbehaviour on the one channel
  we keep precisely because it is rare. Measured with the absolute form: 14 `duplicate_identical`,
  **0 conflicting**. Same family: **a failed ingest POST must be held and retried, never
  swallowed** — a dropped batch is indistinguishable from the 0.2% emitter-side loss §13 injects on
  purpose, which is the one failure the app cannot see (DESIGN §6).
- **B24's agreement sweep must be a single whole-log pass**, not `replay()` called per bucket. The
  obvious implementation is O(buckets × N): 4 seconds becomes hours.
- **Settlement is evaluated at the arriving event's `received_at`, never at wall-clock `now`**
  (D38, correcting `DESIGN.md` §5.4). The wall-clock form stamps `restated_at` on tens of thousands
  of backfilled events and P7 looks broken on frame one.
- **Ingest never rejects on ad status** (I11). A conversion attributed to a pre-pause click arrives
  after the pause and is the event we care most about.
- **Ratios are never stored** (D10). Rollups carry additive counts only.
- **Replay must pass each event's own `received_at` as `apply()`'s `applied_at`** (added at B06,
  bites at B22/B23). A rebuild clock writes a different `first_written_at` into every bucket and
  `/api/verify` reports total divergence on a correct store — whose tempting fix is to drop the
  column from the diff.
- **Migrations are append-only from B06 on.** `migrate()` has no content hash, so editing an applied
  file does not re-run and is not detected: a fresh store and an existing one diverge silently.
- **`STRICT` does not type-check the way the name suggests** (found at B02). Binding the JS number
  `12` into `signals.ad_id` (`TEXT`) is *accepted* and stored as **`'12.0'`** — STRICT converts
  across affinity where lossless, and `node:sqlite` binds a JS number as REAL. **B05's U6 validation
  must check JavaScript types itself and must not lean on `STRICT`.**
- **`MIN(ts, received_at)` is a lexicographic TEXT compare** (found at B05). Mixed ISO precision
  inverts I10's clamp silently: `MIN('…09:00:00.500Z','…09:00:00Z')` returns the **later** instant.
  **Ingest rejects any `ts` that is not exactly `new Date(ts).toISOString()`** — same-shape strings
  make byte order chronological order, and `ts` stays unaltered.
- **A window bound must be canonical ISO, carry an explicit offset, AND be minute-aligned** (found
  at B07, the read-side half of the bullet above). Three silent failures, all measured: no offset →
  JS parses it as **local** time (`…T12:00:00` became `08:00:00.000Z` on this UTC+4 machine, zero
  buckets, a different answer on another laptop); unsnapped canonical → `'…12:00:00Z' >
  '…12:00:00.000Z'` skips the minute it names (1 of 3 buckets returned); a bound *inside* a minute →
  the same event is **over-counted at `to`** and **under-counted at `from`**. Snapshot snaps `from`
  down and `to` up and echoes the resolved window. **B53's drill-down asserts raw == buckets over
  `[from, to)`**, so unaligned it reports FAIL for a reason that is not corruption. The read side
  canonicalises where the write side rejects — a bound is a query, `signals.ts` is a fact.
- **`npm run agree` does not read `ads`, `config_generations` or `conversion_attribution` at all**
  (B24, found by Seno). It re-derives attribution from raw and diffs only `rollup_minute`'s counts,
  so a corrupted `credited_generation_id` (D14) or `credited_ad_id` (I8/G30) **sweeps clean**.
  `/api/verify` catches both — measured, `live a_99, rebuilt a_12`, 5 ms. The gap is covered; the
  danger is the sentence *"every stored bucket agrees with the raw event log"* being read as a
  guarantee about attribution. **The banner states its own limits on every run, and must keep to.**
- **The sweep cannot see an INVENTED all-zero bucket, and that is accepted** (B24). A promotion
  decrements a provisional bucket to all zeros and the row stays, so an absent recomputed bucket is
  compared against zero rather than reported missing. It is the price of the promotion leftover and
  cannot be distinguished from one without replaying arrival order. `/api/verify` catches it.
- **No projection SQL may be SCHEMA-QUALIFIED** (D55, B22). `/api/verify` rebuilds through the real
  `apply()` into `TEMP` tables that shadow the projection names, which works only because every
  projection write is unqualified. **One `main.rollup_minute` turns the verifier into a corrupter**
  — it typechecks and passes every other test. **Guarded:** `verify.test.ts` greps every `.ts` under
  `src/` and fails the build. `verify.ts` is the sole exemption, by name.
- **The shadow set is ALL-OR-NOTHING** (D55, B22). Shadow three projections and the fourth is
  rebuilt into the live store, silently repairing what it was asked to check.
- **A `TEMP` shadow that outlives a verify redirects every later unqualified read** in the process
  to an empty table. Dropped in a `finally` *and* before the verify starts, so a previous crash
  cannot poison the connection. Presents as "the app suddenly shows zeros".
- **One event can write the same bucket more than once, and `restatement_count` must bump ONCE PER
  BUCKET** (found at B20). A click whose promoted conversion lands in the click's own minute touches
  that bucket twice; two conversions promoted by one click land in the same minute. Per-write, the
  counter is wrong by one and **every count is still right**, so B24's sweep agrees with it.
  `apply()` coalesces deltas by bucket. Same coalescing, second silent case: **a bucket the event
  itself materialises is not a restatement** — it was absent, not settled — so the restatement
  clause lives only in `ON CONFLICT DO UPDATE`.
- **`conversions` and `provisional_conversions` must never be summed** (found at B19; bites at
  **B38**). Side by side in the same row, both counting conversions — so adding them is the natural
  thing to write, and it puts unattributed revenue into ROAS and CPA. They are disjoint by
  construction so the settled and provisional figures can be shown apart. Every number stays
  plausible and B24's sweep agrees with itself.
- **There is no stored `orphan_expired` to filter on** (D54, B19). Expiry is derived at read, so
  `WHERE state = 'orphan_provisional'` means *"unresolved, including the ones we gave up on"* — a
  health count written that way reports zero expired orphans forever, and it also full-scans (the
  row below). `state <> 'resolved'` in SQL, then `attributionStateAt(row, at)` in JS.
- **A partial index is only used if the query spells its predicate literally** (found at B03).
  `WHERE state = 'orphan_provisional'` and `WHERE state IN (...)` both **full-scan**
  `conversion_attribution`; only `WHERE state <> 'resolved'` reaches `ix_attr_unresolved`. **Every
  orphan query carries `state <> 'resolved'` as a term.**

## What Phase 3 changed in `DESIGN.md`

Recorded here because `DESIGN.md` was approved before these landed. Full list: `SIMULATOR.md` §22.

- **One correction.** §5.4: settlement is evaluated at the arriving event's `received_at`, **not** at
  wall-clock `now`.
- **Two schema additions.** `signals.source` (`'backfill'`/`'live'`, server-assigned — E15 / D38) and
  the `sim_scenarios` table (D40 — simulator input, not a projection and not a signal). **Both are
  built and in the store as of B02/B03.**
- **Two endpoints.** `GET /api/sim/world` (1 Hz poll: config, fatigue state, spend-so-far, pending
  scenarios) and `POST /api/sim/scenario`.
- **One stated limit, in §10.3.** Within the seeded window `received_at` is designed rather than
  observed, so `as_of` reconstructs what the screen *would* have shown under the seeded arrival
  model. Live arrivals carry no such caveat; the `source` column distinguishes them.

## What is owed

- **`docs/CHEATSHEET.md` is one pass behind.** It does not yet carry D41–D43, F4, U8–U9, D46, D47
  or **D48–D50**. §9 scopes its refresh to **phase** closes, and a stage is not a phase — so this is
  correct, not neglected. It gets refreshed at the Phase 5 close, or sooner if Seno wants to revise
  from it. **D48–D50 are process, not design**, so they belong in table 1 only if a decision's
  defence is wanted for them; the demo is defended from the design decisions.
- **`docs/DEMO.md` does not exist yet and is owed from the B36 group onward** (D50). Every stage-4
  and stage-5 group appends its walkthrough steps as it lands **and says so in its report** — a
  running document nobody reports on is a running document that quietly stops. B61 is then the final
  ordered pass, not a write-from-nothing chunk.
- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it, and that is a
  README change.
- **`BRIEF_GAPS.md` § Extensions is the README's assembly source.** Any new extension in Phase 5
  gets a row there first.
- **The Phase 5 SQLite findings are not in `BRIEF_GAPS.md`** and should not be — they are driver and
  engine behaviours, not defects in the brief. **I19 is** in the register (B05): a delivery with no
  usable `event_id`, keyed `(no event_id):<payload_hash>`.
- **B34 owes the D39 revisit.** The seed is ~28 s and ~716 MB through the real write path, not ~12 s
  and ~315 MB. Nothing regressed — §18.4 measured the store, not the write path — and the full
  accounting plus **five levers with their costs** (the fifth costs B55's trace a body on seeded
  events, an HR5 cost) is in `BUILD_PLAN.md` § "The seed budget, re-measured at B06". `SIMULATOR.md`
  §18.4 carries a pointer to it.
- **B33 owes a fault split.** Malformed (0.1%) and dual click-id (0.05%) both read `rejected_invalid`
  and no reason is stored (deliberate, B05) — split them by re-running `validate()` over the retained
  bodies. Its precondition is now met: **B18 completed `SUPPORTED`**, so a click no longer reads as
  a fault.
- **`projection_meta` is still unwritten, deliberately.** §7's sentence is *"`content_hash` makes
  the common case a hash compare rather than a full diff"* — that is the live-vs-rebuilt hash
  compare, which B22 built. Using the table to skip the **rebuild** across calls would make
  `verify.ts` a second writer of a projection (002's header lists `projection_meta` among them), and
  that needs a decision rather than a quiet extension. Nothing reads the table today.
- **`ad_id` known (§5.1 step 2) is still NOT validated at ingest.** `ingest.ts` says so in a
  comment — "the check lands with the ad, not before it" — and B15 has now landed the ads, but **no
  `BUILD_PLAN` row asks for the check** and adding it would make an unseeded store reject every
  simulator event. It needs a row (B33's fault split is the natural neighbour) or a decision to
  drop it. Note I11's boundary: never reject on ad *status*, which is a different thing.
- **`resolveAttribution()` uses `ts_effective` where §5.2 writes "the click's `ts`".** They differ
  only for the 0.2% clock-skew events §13 injects, and every other placement in the build uses
  `ts_effective`. Reported at the G2 gate and left as built; one line in §5.2 would settle it.
- **B35's calibration must expect `a_08` and `a_12` BELOW §2.3's stated impressions/day** (D52).
  Both are budget-constrained on purpose so §9's pacing is visible; §18.3's ladder placement for
  `a_08` was computed at its unthrottled rate, so a naive check reports a false failure.
- **`served_fraction` is owed to the emitter chunk, not to `fixtures.ts`.** §2.2 tabulates it with
  the audiences, but it is not an `audiences` column and it parameterises §7's fatigue accrual —
  it belongs wherever the fatigue model lands (B25+).
- **D52's budgets are an extension and owe a `BRIEF_GAPS.md` § Extensions row.** So do the ad
  `name`s (E8 is registered; the twelve values are ours).
- **`DESIGN.md` §2.3's `DecisionBody` sketch is now one field wider than the code** (D51):
  `create_ad`'s `initial` no longer carries `created_at`. The code is right; the divergence is
  annotated in `src/shared/decisions.ts` at the point it happens. Worth a one-line correction in
  §2.3 whenever that file is next opened — **not** a drive-by now.
- **`src/server/index.ts`'s snapshot handler comments predict `ads[]` and `generations[]` in the
  envelope "with the fold (B12)"** — B12 shipped and they are not there, because **no `BUILD_PLAN`
  row asks for them**. The Signal surface reads config from `GET /api/decisions` and the `ads`
  projection today. Either B36/B38 owes a row that widens the snapshot envelope, or that comment is
  wrong; decide it at the B36 gate rather than by drift.
- **Two rules shipped at B14 under the group approval, with no `DECISIONS.md` entry of their own.**
  Recorded here so a later reader does not mistake them for ratified design: (a) a reused
  `decision_id` carrying a **different** body is refused `409 decision_id_reused` rather than
  silently returning the first decision — U5 says idempotent, not "swallow a different lever";
  (b) **every** fold refusal is a `409`, including `ad_unknown`, on the grounds that the
  machine-readable `error` code is what a caller branches on. Both are cheap to reverse.
- **B11's two assumptions owe a decision** — the seed's home and the catch-up window's length. Both
  are in "What is open" with the chunk each must be answered before (**B34**, **B29**). They are
  labelled in `src/sim/index.ts` so the code and this file cannot drift apart on them.
- **`src/sim/rng.ts` is deliberately NOT in D43's test surface**, and the reason is on the record so
  a later chunk does not add it by reflex: its wrongness is **not** invisible. A biased `draw()`
  shows up as a rate that misses `SIMULATOR.md` §21's measured tables, which is what **B35's**
  calibration check reads, and it was measured directly at B11 (1M keys). If a chunk wants a test
  here anyway, it owes the D43 argument.
- **B44 also owes the `stream.ts` split** — 273 lines holding two concerns (the flush loop, and
  resume/cursor parsing). Agreed with Seno to land it with B44's caps, not as a drive-by.
- **B34 owes a flush guard, measured by Seno at B09**: the **seeder must not call
  `stream.markDirty()`**. One batch spanning 20,000 minutes produced a **6.20 MiB** frame and a
  **142 ms** event-loop stall after `ingest()` returned; at 56,160 seeded buckets that is ~17 MiB /
  ~400 ms.
- **B44 owes two items from B09.** (a) **Cap rows per frame and spill to the next tick** — the flush
  has no cap, and B44's socket-buffer cap does *not* cover it, because the frame is built before any
  socket is written to. (b) `[stream] subscriber socket is full` fires for clients reading normally
  (`res.write` returns `false` for any frame over the socket high-water mark) — log once per
  connection, or make it a counter.
- **B59 owes a named limit**: `payload_json` is a re-serialisation of the parsed element, not the
  received bytes — `JSON.parse` has already collapsed duplicate keys and rewritten `1e2` and `\u0041`.
  The DDL comment and `DESIGN.md` §2.2 both promised "exactly as received" and were corrected at B05.

## What was verified, not assumed

Phase 0–4 rows ran in the scratchpad. **Phase 5 rows ran against the committed repo** and are
reproducible with the commands in "How to run what exists".

| Claim | Result |
|---|---|
| `node:sqlite` loads unflagged; `PRAGMA journal_mode=WAL` returns `wal`; busy_timeout and manual transactions behave | Node v24.14.0 — passes (D8) |
| The §2 DDL executes: `STRICT` tables, the `ts_effective` generated column with `MIN()`, the partial `UNIQUE` index on `click_id`, `STRICT, WITHOUT ROWID` + `ON CONFLICT DO UPDATE` | SQLite 3.51.2 — all pass (DESIGN §2) |
| **Seed rate** — 1.06M events through insert → attribution → rollup upsert, WAL + `synchronous=NORMAL`, txns of 5,000 | **7.9 s (133,601/s)** → ~12 s at the final portfolio size (D39, SIMULATOR §18.4) |
| **P14 agreement sweep** — one ordered pass over raw, rebuild, diff every bucket | **2.72 s** over 56,160 buckets, **0 mismatches** → ~4.2 s at final size. **No bounded mode needed** (D39) |
| Hot read on D28's `WITHOUT ROWID` PK, 60-minute single-ad window | 0.08 ms |
| Store size | 203 MB + 5 MB WAL → ~315 MB at final size |
| **B02** — both migrations from empty; four pragmas; the I10 clamp (a `ts` of 2099 clamps `ts_effective` while `ts` stays intact); all six `CHECK`s and the partial unique `click_id` index reject; `tx()` rolls back; a forced mid-file failure leaves `user_version` unchanged and the partial table gone | **passes** (Seno re-ran independently) |
| **B03** — the D29 upsert twice → one row, counts summed, `first_written_at` held at the first write, `max_ingest_seq` advanced; FKs reject an unknown component; the `channel` enum rejects a bad value | **passes** (Seno re-ran independently) |
| **B03** — §2.4's access paths: hot read `SEARCH … USING PRIMARY KEY`; portfolio window `USING INDEX ix_rollup_time` | **passes** |
| **B04** — health reports real high-water marks (seeded store: `ingest_seq` 7, `decision_seq` 3); unmigrated store gives the migrate instruction; `EADDRINUSE` exits 1 and the runner tears down; Ctrl-C leaves no process, no bound port, no `-wal` | **passes** |
| **B05** — accepted → duplicate_identical → (keys reordered) duplicate_identical → (different `ad_id`) duplicate_conflicting; four reject classes with the raw body kept; `ad_id: 12` rejected, nothing stored as `'12.0'`; in-batch duplicate; I10 clamp; **forced throw on element 3 of 3 rolls the whole batch back**; restart preserves `ingest_seq` | **passes** |
| **B05** — `now(index)` gives a distinct `received_at` per seeded event; two distinct malformed bodies get two distinct `(no event_id):<hash>` keys, one sent twice gets one | **passes** |
| **B06** — 3 impressions over a minute boundary → 2 buckets + a third for another ad; rollup sum == raw signal count; duplicate moves nothing; a late event bumps the closed bucket with `first_written_at` held and `max_ingest_seq` advanced; **D7 grep: one file, one statement, one importer** | **passes** |
| **B06** — full-scale seed through the real path: **1.625M events in 27.5 s (59,002/s), 716 MB**; `apply()` alone 490k/s; `dbstat` says `signal_deliveries` + index is 53% of the store | **measured** — see `BUILD_PLAN.md` § "The seed budget, re-measured at B06" |
| **B07** — API JSON byte-identical to `sqlite3` for the same window; rollup impressions == raw `COUNT(*)`; per-ad plan `SEARCH … USING PRIMARY KEY`, portfolio `USING INDEX ix_rollup_time` + `USE TEMP B-TREE FOR ORDER BY`; server restart → same snapshot and same `as_of`; a write commits after a read tx; `grep` finds no write statement in `snapshot.ts` | **passes** |
| **B07** — the bound traps: `…T12:00:00` (no offset) resolved to `08:00:00.000Z` here; an unsnapped `…12:00:00Z` returned **1 of 3** buckets; `[12:00:00Z,12:00:30Z)` over-counted and `[12:00:20Z,13:00:00Z)` under-counted the same 12:00:50 impression. After snapping, raw == buckets on all three windows | **measured, then fixed** |
| **B07** — `Z`, `+HH:MM`, `+HHMM`, `-HH:MM` all resolve to the same instant; V8 returns `NaN` for hour-only `+02`; date-only and space-separated forms rejected | **passes** |
| **B09** — 3 events in one batch → **one** frame, **2** rows, `a_12` coalesced to `impressions:2`; repeated POSTs gave **3 → 4 → 5** (absolute, never a repeated delta); ids monotonic; a **duplicate produced no frame**; 20 s idle gave 0 bucket frames, 2 keepalive comments, **0** `id:` lines; two subscribers, one **through Vite's proxy**, identical frames | **passes** |
| **B09** — shutdown with a subscriber attached: port released in **14 ms**. Isolated repro of the counterfactual: with the response left open, `server.close()`'s callback had **not fired after 1000 ms** | **measured** |
| **B09** — Seno's independent run: coalescing across batches in one tick · duplicate/rejected/mixed batches · the **old-minute restatement frame** · `ready` and keepalive carry no `id:` · subscriber accounting · D7 · shutdown **23 ms with 4 subscribers** | **passes** |
| **B10a** — `?cursor=14` replays exactly seqs 15/16/17 (matches `sqlite3`); `max()` correct both directions; no cursor and caught-up send `ready` only; `Last-Event-ID: 500` → `cursor_ahead_of_log`; **2000 dirty buckets replay (638,934 B) and 2001 → `too_many_rows`**; resume works through Vite's proxy; shutdown 16 ms mid-replay; D7 grep clean | **passes** |
| **B10a** — the cursor-coercion hazards Seno found, after the `/^\d+$/` fix: `1e3`, `0x3`, `+2`, `2.0`, `%20`, `''` and an empty `Last-Event-ID` all → `cursor_not_a_number`; `007` → 7, same 6 rows as `?cursor=7` | **passes** |
| **B10a** — Seno's independent re-run: `?cursor=2` → seqs 3,4,5 · `max()` both ways · the 2000/2001 boundary (638,952 B then `too_many_rows`) · `cursor_ahead_of_log` · duplicated-header and `Infinity` rejections · resnapshot-then-live-frame · D7 · typecheck | **passes** |
| **B10b** — the SHIPPED client modules driven headlessly (10 assertions): double-apply is idempotent · merge assigns, never accumulates · a restatement is the same key reassigned · **out-of-window rows dropped** · half-open window · `ready` frame · a live POST moves the number with no refetch · the target bucket climbs by exactly the 2 events posted · no spurious resnapshot · `cursor_ahead_of_log` drives a client resnapshot | **passes** |
| **B10b** — **D47's gap, both directions**: an event ingested with no subscriber attached is **replayed** on subscribe with `?cursor=`, and is **not delivered at all** without it | **passes** |
| **B11** — boot catch-up emits **14 events for 60 s** against 13.9 expected; rollup impressions == raw `COUNT(*)` on **every** bucket (14/14, 20/20, 12/12); `COUNT(DISTINCT event_id)` in deliveries == `signals` rows (46 == 46) after 39 duplicate deliveries | **passes** |
| **B11** — **restart within 60 s**: 18 re-derived events → **14 `duplicate_identical`, 0 `duplicate_conflicting`**, and the 4 seconds the killed process never reached accepted. Impressions did **not** move on the duplicates | **passes** |
| **B11** — live path with no `curl` anywhere: SSE absolute rows **10 → 11 → 12**, one frame per sim tick; the duplicate-heavy boot batch produced no bucket movement | **passes** |
| **B11** — **server down 6 s, then up**: 21 → 23 events held and coalesced, **all sent on recovery**, `ingest reachable again` logged once, the sim process never exited (a crash here would take `npm run dev` down with it) | **passes** |
| **B11** — the keyed RNG over **1M keys**: mean **0.499982**, all ten deciles within 0.6%, `P(u < 0.231481)` = **0.231249**; `derivedId` gave **400,000/400,000 distinct** ids over `(tick, i)`. This is why the 20-impression minute above is variance (1.87σ on a Bernoulli), not a rate bug | **measured** |
| **B11** — D32/D7: `grep` finds no `node:sqlite`, `openDb`, `INSERT` or `UPDATE` anywhere in `src/sim` — the emitter reaches the store only over HTTP | **passes** |
| **B12** — `npm test` exists and runs: 12 fold assertions (the six actions to an expected config · `launch` the only writer of `launched_at` · `draft` admits only `launch` · **F1's `archived` branch exercised, refusing everything without throwing** · `from_id` checked against the *named* slot · fold does not mutate its input) | **passes** |
| **B12** — `isCanonicalIso` refuses nine same-instant strings of a different SHAPE (no-ms, 1-digit, µs, `+00:00`, `+02:00`, lowercase, space-separated, expanded year) and the offset-less form that JS reads as LOCAL | **passes** |
| **B12** — `readCursor` refuses `1e3`, `0x3`, `+2`, `2.0`, `' 2'`, `Infinity`, `-1`, a fullwidth digit and a **present-but-empty** cursor; `007` → 7; `max()` correct both directions; a duplicated header is invalid | **passes** |
| **B13** — against a real migrated store: a **stale `from_cents` is rejected and NOTHING is written** (no log row, no generation, `ads` unmoved) · a current one opens generation *n+1* with `valid_to` set on *n* · a no-op budget change opens **no** generation but still logs · U5 replay folds once · a reused id with a different body is refused · an unknown component id rolls the log row back with the projection write | **passes** |
| **B14** — `create_ad` → `launch` → stale `set_budget` (409) → good `set_budget` → `swap_component` → `pause`: five generations `g_a_12_001…005`, each `valid_to` **byte-identical** to the next `valid_from`, exactly one open, `ads.current_generation_id = g_a_12_005`, `last_decision_seq = 5`. The rejected decision consumed **no** `decision_seq` | **passes** |
| **B14** — the refusals: `ts` on the wire → 400 `ts_is_server_assigned` · a blank rationale → 400 (brief L95) · `pause` on a paused ad → 409 `illegal_transition` · an ad with no `create_ad` → 409 `ad_unknown` · the same `decision_id` verbatim → 200 `replayed:true`, same seq | **passes** |
| **B14** — HR1: server killed and restarted on the same store → all five decisions return, and a `resume` continues from `paused` with `launched_at` unchanged. D7 grep: 4 projection writes, **all in `apply.ts`**. `npm run dev` still boots all three processes; an impression still ingests | **passes** |
| **B15** — `npm run seed` on an empty store: **24 decisions → 12 ads → 24 generations, 12 open**; 16 components, 4 audiences; `v_05` carries `parent_id = v_04`; launches staggered 2026-08-28 → 09-03 exactly as §2.3's `live_days` says; a second run is refused | **passes** |
| **B15** — `grep` proves the seeder writes only `components` and `audiences` directly; every ad reaches `ads` through `applyDecision()`. The whole seeded world survives a server restart and a live `set_budget` continues the fold from the seeded head (`g_a_12_002` → `g_a_12_003`, seq 25) | **passes** |
| **B16** — impression + click + spend in one batch → one bucket reading `1 / 1 / 62 / 130`, **byte-identical to the raw re-sum** over `signals`. A second click claiming a live `click_id` with a NEW `event_id` → `rejected_invalid` / `click_id_already_claimed`, **counted**. A redelivery of the first click → `duplicate_identical`, not a reject | **passes** |
| **B16** — the reject reasons name the field: `spend_has_cost_cents`, `cost_cents_not_a_non_negative_integer`, `click_id_missing_or_not_a_string`, `amount_cents_not_a_non_negative_integer` (for `1.5`), `unsupported_kind:conversion` | **passes** |
| **B17** — 8 assertions: D27-B credits the **click's** minute · D14 gives different generations either side of a swap (`g_a_12_002` / `g_a_12_003`) · I8/G30 credits the click's ad and flags `ad_id_conflict = 1` while staying `resolved` · D16 holds an orphan at its own minute with `resolved_at` null · `generationAt` boundaries are half-open and `null` before the ad existed · **`conversion_attribution` is still empty afterwards (D7)** | **passes** |
| **B17/D53** — the payoff, on the seeded world: a click backdated 5 days resolves to `g_a_12_002`, and a conversion arriving today credits a bucket dated five days ago. Under D53 option A that generation would have been `null` for the entire seeded week | **measured** |

**Environment note.** `sqlite3` CLI **3.45.1** is installed; `node:sqlite` embeds **3.51.2**. Both
read the same file without complaint, but if a `.schema` or a query plan ever looks wrong, that
version gap is the first thing to check.

## Next action

**Next is B31 — `GET /api/sim/world` and the emitter's 1 Hz poll.** Announce it, build it, report,
wait. Nothing needs deciding first. **It is mandatory for the demo**, in Seno's words: *"without the
world poll a paused ad keeps emitting and HR3's 'the world responds' fails on camera."*

**What G8 established, so a cold resume does not re-derive it:**

- **ν is keyed `(lineage, VERSION, audience)` and reads the VIDEO slot only.** §8 states no slot
  composition where §7.1 states one, and §8's own worked example (`a_07` ≈ 1.06) is the video pair
  alone — both slots composed would give 1.075. `BRIEF_GAPS` §H3 carries the reading. The claim it
  buys: `a_04` is four days old as an ad but launched onto a pair `a_02` had burned for seven, so it
  gets **no novelty at all**, which the dry run shows as `ad age h` 96 beside `pair age h` 168.
- **φ and ν are both frozen at `T0` in the live emitter, and the freeze is FORCED.** Both feed
  `p_ctr`, `p_ctr` decides a tick's click count, and a click's `event_id` is derived — so a value
  that moved with wall-clock time would make every re-emitted click `duplicate_conflicting`. B31 is
  where a polled world can carry real ages.
- **B29 emits nothing, by design.** §15.3(b) puts the pending-click set in the store and makes only
  the *lag* re-derivable from `click_id` alone, so live conversion emission belongs to **B31**
  (pending set) and **B34** (backfill). An in-process queue would break restart identity for
  anything older than the catch-up window, and `a_12` alone converts about once every 11 hours, so
  it would also be invisible.
- **§11.2 reproduces, with the truncation visible.** Medians 0.29/3.28/7.23 h against 0.3/3.3/7.5;
  past-72 h 2.40/3.79/4.67% against 2.3/3.6/4.6%. p95 reads ~5% low on every row **because draws
  past 7 days are dropped**, so the sample's p95 is the untruncated distribution's ~94th percentile;
  §11.2's figures are untruncated. The dry run prints the dropped share and says this.
- **§12's AR(1) is verified two ways.** Stationary sd exact (0.1828 vs 0.18; 0.2484 vs 0.25), and
  the **closed-form** ACF of the implemented truncated sum matches `exp(−lag/τ)` to within 3.3e-4 at
  every lag out to 2τ — so truncation at 5τ is invisible where it matters. The measured column is
  corroboration only and prints its own `n_eff`.
- **§12's κ = 200 was inert and is now real — D57.** The click rate is drawn **once per minute**,
  `p ~ Beta(p̄·κ, (1−p̄)·κ)`, and held across the minute's ticks, so a minute's clicks are exactly
  `BetaBinomial(N_minute, p̄, κ)` while each click still lands in its impression's second. It needed
  a Marsaglia–Tsang Gamma (~55 lines, reported as more than "a few"). **`SIMULATOR.md` §10 and §12
  are amended.** Verified by A/B on identical impressions and uniforms — the variance ratio against
  a fixed `p̄` tracks `1 + (N̄−1)/(κ+1)`.
- **`κ = 60` for conversions is still inert and stays so, as a stated limit** owed to the README: a
  conversion draw is over one tick's clicks, 0–1, and still 0–1 over a minute. Only an hour-wide
  window would give it an effect, which is a further decision.
- **`E[m] = 1` by construction (D57)**, via a `−sd²/2` drift in log space. The autocorrelation, `ρ`
  and the stationary sd are untouched. Uncorrected the two factors ran **+4.86%** on every ad's
  volume, which D52's pacing would have absorbed as `ρ` throttling on `a_08` and `a_12`.

**What G7 established, so a cold resume does not re-derive it:**

- **λ has FOUR factors, not six — D56.** `base/86400 × d_c × w_dow × ρ_pacing × m_channel × m_ad`.
  **φ and ν are CTR multipliers only** and enter `p_ctr` in `src/sim/emit.ts`. `SIMULATOR.md` §3
  once listed both on λ; that contradicted §7.1, §10 and §18.3's own arithmetic, and keeping both
  would have charged fatigue twice as `φ²` on clicks. §3 is corrected in place with the reason.
- **§18.2, §18.3 and §2.3 were quoting the VIDEO pair's φ as "the ad's φ".** Corrected to `φ_ad`;
  every conv/h moved, **no rung assignment did**. `a_08`'s peak went 15.3 → 12.0 against a bar of
  10, and **B34 owes the margin check** — `BUILD_PLAN.md` "The gate-margin check B34 owes".
- **Four doc corrections landed**: §3's λ, §7.1's recovery as `2^(−Δt/5 d)` (the formula read as a
  3.47-day half-life against four statements of five days), and §4.1's two printed-table nits
  (trough at 00:00 not 02:00; TikTok's swing 4.50× not 4.8×). `BRIEF_GAPS.md` **§H** is a new
  section for contradictions in our OWN design docs — **H1** the half-life, **H2** `spend` carrying
  no fee parameter (§10 says "CPM accrual plus fees", §21 has no fee, D52's baseline has no fee
  term, so **CPM only** and the omission is a stated limit).
- **`--dry-run` is stage 3's verification surface** and all three sections print from ONE simulation
  pass: `npm run sim -- --dry-run --hours 24` (~27 s) or `--hours 1` (~1 s) for everything but the
  hour-by-hour shape. §7.2's six pair rows print **MATCH/DIFFERS** against the spec — that is the
  comparison D43 asks for, and **Seno declined a `node:test` copy of it** (2026-09-04): *"a
  node:test copy would test the same arithmetic twice and cost budget four days out."* **Do not add
  simulator-math tests.**
- **The live emitter now emits impressions, clicks and a 60 s CPM `spend` delta for `a_12`**, still
  one ad and still regardless of status until B31. `PHI_AD` is frozen at the nominal `T0` accrual —
  an `ASSUMPTION (unratified)` in `index.ts`, replaced by B31's polled `F`.

**Stage 3's remaining chunks are B28–B35.**

**Announce a group, build it, report once with a per-chunk block, wait.** Nothing needs deciding
first. **`BUILD_PLAN.md` §5's gate table covered stage 2 only — stage 3 has no gate table**, so
group under D48's own rule: **3–5 related chunks, never across a stage boundary**, and say in the
announcement which chunks the group is. **B34 and B35 are single-gated** and must not be grouped.

**A natural next group is B28 + B29 + B30** — novelty, the conversion lag, and the noise that makes
the counts overdispersed. B28 attaches to `fatigue.ts` and is small; B30 inherits §14's κ gap.

| Chunk | Scope, from the plan row and no wider | Files |
|---|---|---|
| **B28** | Novelty `ν(age) = 1 + 0.25·exp(−age/18)`, CTR only, on the pair's first exposure. Passed as `emit.ts`'s `nu` parameter, which already exists and defaults to 1.0 | `src/sim/fatigue.ts` |
| **B29** | Conversion lag: fast/slow mixture by `p_fast` (**the only §6 column `params.ts` has not transcribed yet**), separate reporting lag, 7-day cutoff, schedule re-derived from the keyed RNG. B27's dry run already keys the `cvr` stream by `(ad, tick)` — re-derive from that same key | `src/sim/lag.ts` |
| **B30** | Noise: two log-AR(1) demand factors (channel τ45m, ad τ20m), `BetaBinomial` rates, CPC coupled to `m_channel^0.6` (`NOISE.cpcDemandExponent` is already there, unused). **Owns §14's κ gap** | `src/sim/noise.ts` |

What is already true and constrains the whole stage:

- **`SIMULATOR.md` is the spec and it is complete to the parameter.** Every chunk's verification is
  a comparison against a table already in that document — §21 is the parameter appendix — so *"does
  it match"* is arithmetic, not judgement. **Read the table before writing the chunk.** Do not
  invent a constant; if one is missing, that is a gap to raise, not a number to choose.
- **Every chunk adds `--dry-run` output, not a screen.** `npm run sim -- --dry-run --hours 24` and
  its siblings are the verification surface for this stage. No UI work until stage 4.
- **Emission stays live throughout.** The stage-1 number must keep moving after every chunk; a
  simulator that only works in dry-run is half a chunk.
- **The emitter never opens the store (D32).** It learns the world over HTTP, and `GET
  /api/sim/world` is **B31** — until then the emitter still emits for `a_12` only and **still emits
  regardless of status**, so HR3's *"pausing `a_12` stops its events"* is real in the store from
  B14 but not in the world until B31.
- **The keyed RNG (B11, `src/sim/rng.ts`) is how determinism is kept without stored state** —
  `splitmix64(fnv1a64(seed ∥ stream ∥ parts))`, keyed and never sequential, so a lever cannot
  reshuffle another ad's draws. B29's conversion schedule is **re-derived** from it rather than
  queued anywhere.
- **B33's fault split now has its precondition** — `SUPPORTED` covers all four kinds since B18.
- **The keyed-draw budget is real**: `draw()` costs ~2 µs (BigInt + `TextEncoder`), and a 24-hour
  12-ad dry run makes ~10 M of them, hence ~27 s. Fine live (12 ticks/s ≈ 0.3 ms) and fine for a
  dry run; **do not "optimise" `rng.ts`**, which is B11's file and whose formula is §14's.
- **B34 owes the D39 seed-budget revisit** (see "What is owed"): ~28 s and ~716 MB through the real
  write path, not §18.4's ~12 s / ~315 MB, with five costed levers in `BUILD_PLAN.md`'s
  "The seed budget, re-measured at B06".
- **B34 must NOT call `stream.markDirty()`** — measured at B09: one batch across 20,000 minutes gave
  a 6.20 MiB frame and a 142 ms event-loop stall.

For reference, the remaining gates in `CLAUDE.md` §4 order:

1. **Phase 5 — implementation**, chunk by chunk under `CLAUDE.md` §5 as amended by D48.
   **In progress, 26/64** — stages 0, 1 and 2 closed.
2. **Phase 6 — packaging:** README, demo script, the "life of one event" trace, the AI artifact.
   These are `BUILD_PLAN.md` stage 7 (B57–B62) rather than a separate effort.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **Announce, build, report, wait — per GROUP** (D48). Never chain two groups on one approval;
  never widen a group past 5 chunks or across a stage boundary. Commit only on "ok", and commit
  **per chunk**. **B20, B24, B34, B35, B36, B37 are single-gated.**
- **Small chunks, one concern, ≤ ~150 lines.** If a chunk is growing, stop and split it. Every chunk
  leaves the app runnable.
- **No drive-by refactors, no new dependencies without a decision.**
- **If a chunk reveals the design was wrong, stop coding and reopen the design doc.** Do not silently
  patch around it.
- **Report findings, do not fix past them.** The two §14 traps above were both found by testing a
  claim rather than trusting it. Keep doing that; it is the cheapest thing in the build.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the file.
  If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
