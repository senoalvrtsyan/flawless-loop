# BUILD_PLAN.md

**Phase 4 output.** The tracking document for the whole implementation. Written 2026-09-03.

**Still no code.** This document is the plan; nothing exists on disk outside `docs/`. Phase 5
begins on Seno's explicit instruction, and **five decisions block chunk B01** — see §2.

**Reading order.** `CLAUDE.md` → `docs/STATUS.md` → this file → the one design section a chunk cites.
Scope of record is `docs/SCOPE.md` (P1–P17). Architecture is `docs/DESIGN.md`. Mock data is
`docs/SIMULATOR.md`. Ratified rationale is `docs/DECISIONS.md`; the one-page version is
`docs/CHEATSHEET.md`.

---

## 1 — How this document works

**Ids.** Build chunks are `B01`–`B62`, numbered in **build order**. `SCOPE.md`'s `P1`–`P17` are
*scope* items, not chunks; several chunks close one P item and a few chunks advance several. §11 is
the coverage table that maps every P item to the chunks that close it, so nothing in scope is
orphaned.

**Commit convention.** `CLAUDE.md` §5 asks for a message referencing the plan item. It reads
`feat(signal): SSE transport — B09, closes P9`. (`CLAUDE.md`'s illustrative `P5.3` predates this
document; `B##` is the plan item id, `P##` the scope item it advances.)

**Per chunk, per `CLAUDE.md` §5:** announce, build, report, wait. On "ok": commit, tick the box
here, stop. No chunk proceeds without approval.

**Flags column.** `HR1`–`HR8` are the hard requirements in `CLAUDE.md` §6, in that order:

| | |
|---|---|
| **HR1** | State survives a refresh and an app restart |
| **HR2** | Events, not snapshots — nothing on screen is hard-coded |
| **HR3** | At least one decision closable in-product; the world responds |
| **HR4** | At least one stream misbehaviour handled end to end |
| **HR5** | Traceability — any number walks back to raw events, and they agree |
| **HR6** | Configs, signals and levers stay distinct; config changes only via levers |
| **HR7** | The mock data is a design artifact |
| **HR8** | The persistence boundary is deliberate and defensible |

A flagged chunk is **load-bearing** for that requirement. Every requirement is carried by more than
one chunk, so a flagged chunk *can* appear on the cut line (§12) — but only where a chunk **above**
the line still carries the same flag, and the cut row names which. **No requirement is left with
zero chunks above the line**, at any point down the cut list. That invariant is the cut line's
whole claim; check it before cutting anything not on the list.

**Spec column** cites the section that specifies the chunk — `D§` = `DESIGN.md`, `S§` =
`SIMULATOR.md`, `Sc§` = `SCOPE.md`. If a chunk turns out not to be specified there, that is
`CLAUDE.md` §5's stop condition: reopen the design doc, do not improvise.

---

## 2 — Blocking decisions before B01

**Three of the five are ratified; two remain open.** Full option analysis in
`docs/OPEN_QUESTIONS.md` § Wave 7; the ratified entries are in `docs/DECISIONS.md` § Wave 7.

| # | Question | Blocks | Status |
|---|---|---|---|
| **D41** | Repo layout and build toolchain — how does React get built and served | **B01** — nothing starts | **ACCEPTED — A**, 2026-09-04. Single package, three entry points; Vite for the client only |
| **D42** | HTTP server: `node:http` or a framework | **B04** | **ACCEPTED — A**, 2026-09-04. `node:http` + a ~40-line router |
| **D43** | Test runner, and what gets an automated test at all | **B12** (the fold) | **ACCEPTED — A**, 2026-09-04. `node:test`, no runner dependency; tests on the fold, attribution, restatement and the lag math only |
| **D44** | Chart rendering: library or hand-rolled SVG | **B37** — stage 4 | **DEFERRED**, 2026-09-04 (**F4**). Recommendation on the table: uPlot, wrapped behind the descriptor-bearing component |
| **D45** | Styling approach | **B36** | **DEFERRED**, 2026-09-04 (**F4**). Recommendation on the table: plain CSS, one stylesheet, no framework |

**No decision blocks any chunk from B01 to B35.** D44 and D45 are **deferred, not open** (**F4**):
they are deliberately not being asked yet, because they are answered better at B36 — with the data
volumes and the settlement-state legibility problem concrete — than they would be now.

**Two obligations come with the deferral, and both bite silently if dropped:**

1. **The chunk before B36 re-raises both.** A deferral nobody re-opens is a forgotten decision.
2. **Nothing between here and B36 may settle either by drift** — no chart or styling library
   installed, nothing hand-rolled that pre-empts the choice. A stage-0–3 chunk needing any styling
   uses unstyled HTML and says so.

---

## 3 — Stage 0 · Foundation

Three chunks. The store exists and executes; nothing reads or writes it yet.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [x] | **B01** | Repo scaffold: strict TS, Node 24 floor pinned, empty entry points, `dev`/`typecheck` scripts | `package.json`, `.nvmrc`, `tsconfig.json`, `.gitignore` | `node -v` ≥ 24; `npm run typecheck` clean; `engines` and `.nvmrc` both say 24 | D§2 (D8) | — |
| [x] | **B02** | DB module: open, the four pragmas, the ~10-line transaction wrapper; migration runner; `001_logs.sql` — `components`, `audiences`, `signal_deliveries`, `signals`, `decisions` | `src/server/db.ts`, `src/server/migrate.ts`, `migrations/001_logs.sql` | `npm run db:migrate` on an empty file; `PRAGMA journal_mode` returns `wal`; `.schema` matches D§2.1–2.3; insert a `ts` of 2099 and read `ts_effective` back clamped | D§2, 2.1–2.3 | **HR1 HR6 HR8** |
| [x] | **B03** | `002_projections.sql` — `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`, `projection_meta`, `sim_scenarios` | `migrations/002_projections.sql` | `.schema`; hand-run the `ON CONFLICT DO UPDATE` upsert against `rollup_minute` twice and see one row | D§2.4 | **HR6** |

**Why the schema lands whole and early.** It is ratified, and it was executed on this machine
during Phase 2 (`STATUS.md` § "What was verified") — `STRICT`, the generated `ts_effective` column,
the partial unique index and the `WITHOUT ROWID` upsert all pass. Writing it in pieces would mean
five passes over two files for no reviewable gain. The split into two migrations is the §1 split:
authoritative logs in one, derived projections in the other.

**Demo checkpoint 0 — nothing to show.** This is the only stage with no checkpoint, which is why it
is three chunks and not six.

---

## 4 — Stage 1 · The walking skeleton

**The thinnest possible end-to-end path, and the riskiest thing in the build.** One simulated event,
persisted, aggregated, transported, on screen, surviving a refresh and a restart — before any
breadth. Everything after this stage is width on a spine that is already proven.

Impressions only. One ad, hard-coded in the simulator, not in the store — the ad in the *store*
appears in B15 from the decision log, and never before.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B04** | HTTP server, `GET /api/health`, and a dev runner that starts server and simulator as two processes | `src/server/http.ts`, `src/server/index.ts`, `scripts/dev.mjs` | `npm run dev`; `curl /api/health` returns the log position | D§11 | — |
| [ ] | **B05** | `POST /api/ingest` for `impression` only: stamp `received_at` + `ingest_seq`, validate, write `signal_deliveries` **always**, dedupe on `event_id`, insert `signals` — one transaction | `src/server/ingest.ts`, `src/shared/types.ts` | POST one event, then the same `event_id` again: dispositions read `accepted` then `duplicate_identical`; `signals` has one row, `signal_deliveries` two; POST a negative amount → `rejected_invalid` with the raw body kept | D§5.1 | **HR2 HR8** |
| [ ] | **B06** | `apply()` — the single writer. Rollup upsert for impressions, in B05's transaction. Establishes the rule the rest of the build obeys | `src/server/apply.ts` | POST three impressions spanning two minutes → `rollup_minute` has exactly two rows with the right counts and `max_ingest_seq`; grep proves no other file writes a projection | D§4.3, §1 | **HR2 HR6** |
| [ ] | **B07** | `GET /api/snapshot?from&to&ads` — one read transaction, returns buckets + `as_of_ingest_seq` | `src/server/snapshot.ts` | `curl` after B06 and diff the JSON against `sqlite3` output by hand | D§3.1 | **HR2** |
| [ ] | **B08** | Client shell: fetch the snapshot, render one number. No chart, no styling | `src/web/main.tsx`, `src/web/App.tsx`, `index.html` | Number appears in the browser; **refresh → same number**; stop the server, restart it, refresh → still there | D§3, §3.1 | **HR1 HR8** |
| [ ] | **B09** | SSE `GET /api/stream`: dirty-set collection, 250–500 ms flush tick, **absolute** bucket rows, `id:` = high-water `ingest_seq` | `src/server/stream.ts` | `curl -N /api/stream` in one terminal, POST in another; one absolute row per touched bucket per tick, never a delta | D§5.5, §11 | **HR2** |
| [ ] | **B10** | Client subscribes, merges absolute rows by `(ad_id, minute)`, resumes on `Last-Event-ID` | `src/web/stream.ts`, `src/web/store.ts` | Number ticks up live; kill the server mid-stream and restart → the client reconnects and the number is **not** double-counted | D§3.1, §5.5 | **HR1 HR2** |
| [ ] | **B11** | Simulator as a separate process: 1 s tick, keyed RNG (`splitmix64`, named streams), a constant impression rate for one ad, batched POST | `src/sim/index.ts`, `src/sim/rng.ts` | `npm run sim`; the browser number climbs at the expected rate; kill and restart the simulator → the re-emitted events dedupe as `duplicate_identical` because ids are derived, not remembered | D§11; S§14, §15.1 | **HR2 HR7** |

> ### ▶ Demo checkpoint 1 — *"the world is real"*
>
> A separate OS process is emitting events over HTTP. Every one is a row in SQLite with a
> server-assigned arrival time. The number on screen is a server-computed aggregate that moves live,
> **survives a browser refresh, survives killing and restarting the server, and survives killing and
> restarting the simulator.** Show a stranger: the browser, then `sqlite3` proving the number is the
> sum of rows, then `kill -9` on both processes.
>
> **This is the checkpoint that retires the build's largest risk.** Everything after it is breadth.

---

## 5 — Stage 2 · The write path in full

The whole server-side model, verified by `curl` and `sqlite3`. No new UI in this stage — the
skeleton from stage 1 keeps working throughout and the numbers get richer.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B12** | `DecisionBody` types and `fold()` — one pure function, exhaustive over the six actions, including the unreachable `archived` branch written to explain itself | `src/shared/decisions.ts`, `src/server/fold.ts` | `node --test`: a fixture sequence folds to the expected config; the `archived` branch is present, unreachable and commented per F1 | D§7, §2.3 | **HR6** |
| [ ] | **B13** | `applyDecision()`: compare-and-swap preconditions on `from_cents`/`from_id`, write `ads`, close and open `config_generations` — one transaction | `src/server/apply.ts` | Unit test: a stale `from_cents` is rejected; a good one opens generation *n+1* with `valid_to` set on *n* | D§7, §2.4 | **HR6** |
| [ ] | **B14** | `POST /api/decisions` (returns the new state in the same txn) and `GET /api/decisions` | `src/server/decisions.ts` | `curl` `create_ad` then `launch` → an `ads` row appears with `launched_at`; grep proves **no code path inserts `ads` directly** | D§7, §11 | **HR2 HR6** |
| [ ] | **B15** | Seeder part 1: `components` and `audiences` fixtures, then 12 `create_ad` + 12 `launch` decisions through `applyDecision` | `src/sim/seed-world.ts`, `src/sim/fixtures.ts` | `npm run seed` on an empty DB → 24 rows in `decisions`, 12 in `ads`, 12 generations; `vl_04` has two versions with `parent_id` set | D§3.2; S§2 | **HR1 HR2 HR6** |
| [ ] | **B16** | The other three signal kinds through ingest: `click` (`click_id`, `cost_cents`), `spend` (60 s delta), `conversion` (`attributed_click_id`, `value_cents`) | `src/server/ingest.ts`, `src/shared/types.ts` | `curl` each kind; a second click claiming an existing `click_id` is rejected by the partial unique index and **counted**, not silently deduped | D§2.2, §5.1 | **HR2** |
| [ ] | **B17** | Attribution: resolve `attributed_click_id` against `signals.click_id`; `credited_ad_id` from **the click**; `ad_id_conflict`; `credited_generation_id` = generation live at the click's `ts` | `src/server/attribute.ts` | click at T, conversion later → `conversion_attribution` is `resolved` with the generation covering T; send a conversion whose own `ad_id` disagrees → `ad_id_conflict = 1`, nothing silently reconciled | D§5.2 | **HR2** |
| [ ] | **B18** | Cohort placement (D27-B): a conversion counts in **its click's minute**; rollup upsert extended to all four kinds, click cost and spend kept disjoint | `src/server/apply.ts` | Click at 14:02, conversion at 16:40 → the **14:02** bucket carries the conversion; total spend is the read-time sum of two columns, never a third stored one | D§5.3, §4.5 | **HR2** |
| [ ] | **B19** | Orphans: `orphan_provisional` at its own minute into the `provisional_*` columns; `orphan_expired` past the horizon | `src/server/attribute.ts`, `src/server/apply.ts` | Conversion before its click → `provisional_conversions` moves and the settled counts do **not**; an orphan older than 72 h reads `orphan_expired`, still counted, never deleted | D§5.2 | **HR4** |
| [ ] | **B20** | **Restatement.** `applyConversion(ev, prev)`: decrement the old bucket, credit the new; `settled_at(B, ev.received_at)` — *never* wall-clock `now`; `restated_at` + `restatement_count`; orphan promotion via `ix_signals_attr` | `src/server/apply.ts` | Send the withheld click → the orphan promotes, **two** buckets change, the provisional one is decremented; send a conversion into a >72 h bucket → `restated_at` set, count bumped | D§5.4; S§15.3(c) | **HR4** |
| [ ] | **B21** | Settlement state on the read side: `live` / `settled` / `restated` per bucket, in the snapshot and the SSE row; the 72 h horizon and the `America/New_York` constant in one config module | `src/server/settlement.ts`, `src/shared/config.ts` | Snapshot rows carry a state; a 7-day-old bucket reads `settled`, a 10-minute-old one `live` | D§5.4, §5.7 | **HR4** |
| [ ] | **B22** | `GET /api/verify`: rebuild every projection from the logs into temp tables, diff row by row, return the first divergence or a clean bill with the log position; `content_hash` fast path | `src/server/verify.ts` | Runs clean; hand-`UPDATE` one `rollup_minute` row and see it caught with the offending key | D§7 | **HR5 HR6** |
| [ ] | **B23** | `replay(descriptor)` — pure function over a log prefix. Reads **raw `signals` only**, restricted to `ingest_seq <= as_of`, re-deriving attribution over that prefix. No HTTP yet | `src/server/replay.ts` | Unit test on a hand-built fixture; assert it never opens `rollup_minute` | D§10.2 | **HR5** |
| [ ] | **B24** | **P14 agreement sweep** as `npm run agree`: one ordered whole-log pass, rebuild, diff every bucket, print mismatches | `scripts/agree.ts` | Runs clean on the curl-built dataset in milliseconds; corrupt a bucket → caught. **Must be a single pass, not `replay()` per bucket** — per-bucket is O(buckets × N) and takes hours | D§10.2; S§18.4 | **HR5** |

**Why the agreement sweep lands here and not in stage 6.** It is the independent check on every
chunk that follows. Built now, it guards the simulator (stage 3) and the whole read side (stage 4);
built at the end, it discovers disagreement after everything is written on top of it.

> ### ▶ Demo checkpoint 2 — *"the model is right"*
>
> Twelve ads exist **only** because decisions were appended to a log and folded. All four signal
> kinds ingest. A conversion is credited to the creative that earned it and lands in its click's
> minute. A late click promotes an orphan and moves the number in two buckets at once. A conversion
> arriving into a settled bucket stamps it restated. `GET /api/verify` drops every projection,
> rebuilds it from the logs, and proves the numbers are identical. `npm run agree` re-derives every
> bucket from raw events and finds zero mismatches.
>
> Entirely `curl` and `sqlite3` — no UI beyond stage 1's single number. That is deliberate: the
> claims above are about the model, and the model should be demonstrable without a screen.

---

## 6 — Stage 3 · The simulator

`SIMULATOR.md` is the spec and it is complete to the parameter. Each chunk here is one factor of the
rate equation or one behaviour, and each is verified against a table already in that document — so
"does it match" is a comparison, not a judgement.

Every chunk in this stage adds a `--dry-run` mode output rather than a screen. Emission stays live
throughout; the stage-1 number keeps moving.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B25** | Rate equation core: per-channel diurnal shape, day-of-week, `NegBinomial(λ, α=8)` draw | `src/sim/rate.ts`, `src/sim/params.ts` | `npm run sim -- --dry-run --hours 24` prints hourly totals; the two peaks and the per-channel shapes match S§21's constants | S§3, §4 | **HR7** |
| [ ] | **B26** | Fatigue: `F(lineage, audience)` accrual, `φ(f) = 0.25 + 0.75·exp(−0.35f)`, `video^1.0 × headline^0.5`, 5-day idle recovery, version partial reset `r = 0.35` | `src/sim/fatigue.ts` | Dry-run prints φ per pair after the seeded volumes; **reproduce S§7.2's table** — `vl_01 × cold_us` at 0.43 and `vl_01 × warm_us` at 0.91 at the same instant | S§7 | **HR7** |
| [ ] | **B27** | Channel and temperature matrices → clicks (`BetaBinomial`), CPC, order value; `spend` emitted as a 60 s delta per live ad | `src/sim/emit.ts`, `src/sim/params.ts` | Dry-run CTR and CVR per ad match S§21's matrices within noise; spend ticks arrive one per minute per live ad | S§5, §6, §10 | **HR7** |
| [ ] | **B28** | Novelty `ν(age) = 1 + 0.25·exp(−age/18)`, applied to CTR only, on the pair's first exposure | `src/sim/fatigue.ts` | Dry-run: `a_07` at ν ≈ 1.06, `a_01` at 1.00 — the two ends of a creative's life at one moment | S§8 | **HR7** |
| [ ] | **B29** | Conversion lag: fast/slow mixture by `p_fast`, separate reporting lag, 7-day hard cutoff, schedule re-derived from the keyed RNG rather than stored | `src/sim/lag.ts` | Dry-run prints median / p95 / past-72 h share per temperature and **matches S§11.2**: rt 0.3 h / 1.87 d / 2.3%, cold 7.5 h / 2.85 d / 4.6% | S§11 | **HR4 HR7** |
| [ ] | **B30** | Noise: two log-AR(1) demand factors (channel τ45m, ad τ20m), `BetaBinomial` rates, CPC coupled to channel demand | `src/sim/noise.ts` | Dry-run: variance/mean grows with λ; the channel factor moves every ad on that channel together; autocorrelation at the stated τ | S§12 | **HR7** |
| [ ] | **B31** | `GET /api/sim/world` + the emitter's 1 Hz poll: ads and status, `last_decision_seq`, `F` per pair **recomputed from the signal log**, `spend_so_far_today`, pending backfilled clicks, pending scenarios | `src/server/sim-world.ts`, `src/sim/world.ts` | `curl` a `pause` decision → **emission for that ad stops within one second**; the endpoint's `F` matches B26's internal state because both come from the log | D§11; S§16 | **HR3** |
| [ ] | **B32** | Budget pacing: `ρ_catchup × ρ_terminal`, day boundary at `America/New_York`, +5% overspend tolerance | `src/sim/pacing.ts` | `curl` a `set_budget` doubling → **event rate visibly rises inside a second**; drive `a` to 0.95 and watch the taper rather than a cliff; no discontinuity at the local midnight rollover | S§9 | **HR3 HR7** |
| [ ] | **B33** | Injected misbehaviours: duplicate identical and conflicting, short and long reorder, orphan withheld and orphan never, malformed, clock skew, dual click-id, 0.2% silent emitter loss | `src/sim/faults.ts` | Run 5 minutes, then count `signal_deliveries` by disposition and compare against S§13's rates; every injected fault has a handler already built in stage 2 | S§13 | **HR4 HR7** |
| [ ] | **B34** | Backfill generation: 7 days in-process through `ingest()`, `received_at = ts + reporting lag`, **sorted by `received_at`** before writing, server-assigned `source = 'backfill'` | `src/sim/seed-history.ts` | `npm run seed` on an empty DB → ~1.6M events; `ingest_seq` is monotone in `received_at`; a handful of buckets carry `restated_at` **from frame one** | S§15.2, §15.3 | **HR1 HR2 HR7** |
| [ ] | **B35** | The `T0` handover seam: anything whose `received_at` falls after the seed boundary is **not** seeded but handed to the live emitter; progress printing during the seed | `src/sim/seed-history.ts`, `src/sim/index.ts` | Boot on an empty DB: the seed prints progress and finishes in ~12 s, then conversions from before `T0` keep arriving live for minutes afterwards — a real in-flight population, not a manufactured one | S§15.3(b) | **HR4 HR7** |

> ### ▶ Demo checkpoint 3 — *"the data is a design artifact"*
>
> Boot on an empty database. Twelve ads with seven days of history appear in about twelve seconds,
> every figure derived from ~1.6M persisted events. The stream runs live at 1× wall clock.
> `curl` a pause on `a_12` and its events stop within a second; double its budget and the rate rises
> within a tick. Then open `sqlite3` and show the evidence: the same video burned on one audience
> (φ 0.43) and fresh on another (φ 0.91) at the same instant; a diurnal curve whose shape differs by
> channel; a conversion-lag distribution whose p95 sits inside the horizon and whose tail crosses it.
>
> Still no chart. Everything above is `curl`, `sqlite3` and the dry-run printouts.

---

## 7 — Stage 4 · The Signal surface

The deep surface, per D1. Read-only — no levers yet.

> ### ⛔ Gate before B36 — D44 and D45 come back here
>
> **Deferred at B01 by F4, not answered.** B36 is the first chunk that cannot start without D45
> (styling) and B37 the first that cannot start without D44 (chart rendering). **B35 does not hand
> over to B36 until both are put to Seno and answered** — recommendations and full analysis are in
> `docs/OPEN_QUESTIONS.md` § Wave 7 and need only be re-presented, not rewritten.
>
> Until then, nothing in B01–B35 installs a chart or styling library or hand-rolls anything that
> pre-empts either choice; a chunk needing styling before B36 uses unstyled HTML and says so.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B36** | App shell: portfolio list from `ads`, window / granularity / ad-selection controls, one stylesheet | `src/web/App.tsx`, `src/web/Portfolio.tsx`, `src/web/app.css` | Twelve ads listed with status and budget, all from the fold; selection and window changes refetch the snapshot | D§3 | — |
| [ ] | **B37** | Chart: one series per selected ad over the window, drawn from bucket rows only | `src/web/Chart.tsx` | Pick one point, read its value, and match it against a `sqlite3` sum over `rollup_minute` | D§4.1, §11 | **HR2** |
| [ ] | **B38** | Ratios derived at read from additive counts — CTR, CPA, ROAS. Nothing stored, nothing computed on the client from raw | `src/web/metrics.ts`, `src/server/snapshot.ts` | Hand-compute CTR for one bucket from its two counts and compare; grep proves no ratio column exists | D§4.3 | **HR2** |
| [ ] | **B39** | D20's gate and adaptive ladder: minute → 5 min → 15 min → hour, **stop**, then show counts with the reason stated | `src/web/gate.ts`, `src/web/Chart.tsx` | `a_08` draws hourly CPA at the daily peak and falls to counts overnight; `a_09` never clears any bar and says why — **both branches of D20 fire on camera** | D§4.5; S§18.3 | — |
| [ ] | **B40** | EWMA smoothing, 15-minute half-life, with a raw toggle | `src/web/metrics.ts` | Toggle and watch the same series smooth and unsmooth; the raw view is the one the drill-down asserts against | D§4.5 | — |
| [ ] | **B41** | Maturity indicator: empirical attribution-lag CDF over settled cohorts, global, always shown with its sample size **and the seeded share** | `src/server/maturity.ts`, `src/web/Maturity.tsx` | Label reads e.g. "68% mature · measured over 1,432 settled conversions (1,180 seeded)"; both counts match a `sqlite3` count | D§4.5; S§15.4 | — |
| [ ] | **B42** | Settlement treatment on the chart: `live` / `settled` / `restated`, persistent rather than transient | `src/web/Chart.tsx` | The frame-one restated buckets from B34 are marked days back on the chart, and stay marked | D§5.6 | **HR4** |
| [ ] | **B43** | Restatement entries on a timeline **at the bucket's own time**, with the delta and the lateness | `src/web/Timeline.tsx` | An entry reads "14:02 Tue — ROAS 1.8 → 2.4 · +3 conversions · $412 · arrived 2 d 4 h late" and sits at Tuesday, not at now | D§5.6 | **HR4** |
| [ ] | **B44** | Raw event tail with the `TailFrame` quarantine types, plus the stream-health telemetry block (events/sec, last-event age, frames dropped, deduped, conflicts, orphans) in its own distinct treatment | `src/web/Tail.tsx`, `src/shared/wire.ts` | The tail scrolls; **write a line that sums a `TailFrame` and watch `tsc` reject it**; telemetry never shares a surface with a performance metric | D§11 (D34) | **HR2** |
| [ ] | **B45** | The fatigue flag: −25% vs the pair's peak trailing-6 h EWMA CTR, ≥3 gated points per window, with its four limits stated on the surface | `src/web/fatigue-flag.ts` | `a_01` is flagged; `a_09` is not, and the surface says it is because the gate suppresses its points — the honest failure mode, visible | S§19 | **HR7** |

> ### ▶ Demo checkpoint 4 — *"the cockpit"*
>
> The Signal surface, live over seven days of history. Ratios derived rather than stored. A gate that
> visibly binds and unbinds through the day, and a chart that says "not enough conversions yet — here
> are the counts" rather than quietly widening. A maturity indicator that discloses how much of each
> cohort has arrived and how many of those were seeded. Restated buckets marked days back, with
> timeline entries at their own time. A raw event tail that is structurally incapable of producing a
> performance number.

---

## 8 — Stage 5 · The decision loop, and causing the interesting thing

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B46** | Action console: `pause` / `resume` / `set_budget` / `swap_component`, rationale required, compare-and-swap rejection surfaced honestly rather than retried | `src/web/Console.tsx` | **Pause `a_12` in the browser → its events stop within a second and its series flattens.** Raise a budget → the rate rises. Submit with a stale `from_cents` → rejected with the current value shown | D§7, §11; S§9 | **HR3 HR6** |
| [ ] | **B47** | Decision log surface: per-ad and global, with actor, rationale, `decision_seq`, and the generation each opened | `src/web/DecisionLog.tsx` | Every row matches `sqlite3 decisions`; the config on screen is the fold of exactly these rows | D§7 | **HR6** |
| [ ] | **B48** | Generation boundaries drawn on the chart from `config_generations` | `src/web/Chart.tsx` | Swap `a_03`'s video → a boundary appears and the CTR steps at it; the discontinuity is explained by the generation and by nothing else | D§4.2, §8 | **HR6** |
| [ ] | **B49** | **P16** — horizon control: shortening the horizon re-evaluates settlement across the affected range and restates what moves | `src/server/settlement.ts`, `src/web/Horizon.tsx` | Drop the horizon from 72 h to 2 h → buckets flip from `live` to `settled`, and any that had moved since are marked restated. Uses `ix_rollup_time`, not a full scan | D§5.7 (F2) | **HR4** |
| [ ] | **B50** | **P17** — scenario control: the seven triggers via `POST /api/sim/scenario`, persisted to `sim_scenarios`, delivered on the existing world poll | `src/server/sim-scenario.ts`, `src/sim/scenarios.ts`, `src/web/Scenarios.tsx` | Fire `late_cascade` → settled buckets restate on screen within seconds. Fire `orphan_burst` → a two-bucket restatement. Fire `stall` → the liveness display says so. The trigger is a row, so the moment replays | S§17 | **HR4** |

> ### ▶ Demo checkpoint 5 — *"the loop closes"*
>
> The strategist reads a signal, pulls a lever with a written rationale, and the world responds inside
> a second — the brief's own example, `a_12`, stops emitting. The config on screen is the fold of an
> append-only decision log and changes no other way. And every interesting failure can be **caused on
> demand** rather than waited for: a late cascade rewrites days-old settled buckets while a reviewer
> watches.

---

## 9 — Stage 6 · Traceability, and the Workbench sketch

The engine (`replay`, the sweep) is already built and green from B23/B24. This stage is the three
surfaces on top of it, plus D1's one read-only Workbench screen.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B51** | `TraceDescriptor` issuance: every metric the server sends carries a signed descriptor — the query, not the answer. HMAC via `node:crypto` | `src/server/descriptor.ts`, `src/shared/wire.ts` | Every number in the snapshot payload has one; tamper with a descriptor and the trace endpoint rejects it | D§10.1 | **HR5** |
| [ ] | **B52** | The `<Metric>` component: rendering a performance number **requires** a server-issued descriptor, so tail data cannot produce one | `src/web/Metric.tsx` | Try to render a number without a descriptor and watch `tsc` reject it — the quarantine is compile-time, not convention | D§11 (D34) | **HR5** |
| [ ] | **B53** | **P12** — drill-down: click any number → `POST /api/trace` → the contributing raw events, the recomputed figure, and an explicit on-screen **pass/fail** against the displayed one | `src/server/trace.ts`, `src/web/Drilldown.tsx` | Click a bucket's ROAS → the event list, the re-sum, and MATCH. Corrupt one rollup row by hand and watch the same click read FAIL | D§10.2 | **HR5** |
| [ ] | **B54** | `as_of` control on the drill-down: re-run the same descriptor at an earlier log position | `src/web/Drilldown.tsx` | Set `as_of` to just before a late arrival → the previous figure; the difference is exactly the named `event_id`s, each with its lateness | D§10.3 | **HR4 HR5** |
| [ ] | **B55** | **P13** — `trace <event_id>`: one event → its deliveries → its canonical row → its attribution → the buckets it moved → the metrics that changed → the screen elements affected. **This is the "life of one event" deliverable, executable** | `src/server/trace.ts`, `src/web/EventTrace.tsx` | Paste any `event_id` from the tail and read all eight steps of D§10.4 as selectable rows | D§10.4 | **HR5** |
| [ ] | **B56** | **P15** — Workbench component screen: the reverse join, per lineage as the headline and per version beneath | `src/web/Components.tsx`, `src/server/components.ts` | "Product demo — 2 versions, live in 3 ads" with the breakdown; pause an ad and the count drops, because `ads.status` is written only by the fold | D§8 | **HR6** |

> ### ▶ Demo checkpoint 6 — *"and they agree"*
>
> Click any number on screen. It opens the raw events beneath it, re-summed by an independent path
> that reads only the log, with a pass/fail on screen. Rewind `as_of` and watch the number become
> what it was before a late conversion landed — with the exact events accounting for the difference.
> Paste an `event_id` and walk it from emission to pixel. Then run `npm run agree` and watch every
> bucket in the store re-derived from raw in about four seconds, with zero mismatches.

---

## 10 — Stage 7 · Packaging

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [ ] | **B57** | **One-command run:** `npm start` → migrate, seed if the store is empty, start server and simulator, print the URL | `scripts/start.mjs`, `package.json` | On a clean clone with Node 24: `npm i && npm start` and nothing else. Twelve seconds of seeding **with progress**, then a working cockpit | S§18.4 | **HR1** |
| [ ] | **B58** | README part 1 — design notes: the three-way split, the persistence boundary and what is recomputable, the aggregation strategy, plus `SCOPE.md` §2–§4 **verbatim** | `README.md` | The `SCOPE.md` block matches byte for byte between the `README-VERBATIM` markers | D§1, §3, §4; Sc§2–4 | **HR8** |
| [ ] | **B59** | README part 2 — the misbehaviour table verbatim, the named limits (retractions, emitter loss, gap detection, USD-only, audience overlap), and the extensions register E1–E15 / I1–I18 assembled from `BRIEF_GAPS.md` | `README.md` | Every row in D§6 present; every extension has a justification row; retractions named as **breaking**, not hidden | D§6, §12 | **HR4** |
| [ ] | **B60** | README part 3 — the **life of one event** with real ids captured from a real run, the component-performance query run against real data with its output, and the copy-on-write defence with its honest scope note | `README.md` | Every id in the trace resolves in the running app; the SQL runs and returns the printed rows | D§9, §10.4, §8 | **HR5** |
| [ ] | **B61** | Demo script: the ordered walkthrough, including the **refresh test and the restart test** as written steps a stranger can follow | `docs/DEMO.md` | Follow it cold, start to finish, on a clean clone, and time it | — | **HR1** |
| [ ] | **B62** | AI process artifact: export sessions 04–06 to `docs/ai-sessions/`; final `STATUS.md` and `CHEATSHEET.md` refresh | `docs/ai-sessions/`, `docs/STATUS.md`, `docs/CHEATSHEET.md` | Six captures, one per phase; the cheatsheet still fits on one screen | `CLAUDE.md` §9 | — |

> ### ▶ Demo checkpoint 7 — *"shippable"*
>
> Clean clone, `npm i && npm start`, and a stranger has the whole thing in one command. The README
> explains every choice and names every limit. The life of one event is written down with real ids
> and can be re-run in the app. The demo script survives being followed by someone who has never seen
> the repo.

---

## 11 — Scope coverage

Every `SCOPE.md` P item, and the chunks that close it. Nothing in scope is orphaned; no chunk is
outside scope.

| P | Item | Closed by |
|---|---|---|
| P1 | Ingest boundary, dedupe, validation | B05, B16, exercised by B33 |
| P2 | Signal types + emitter, `click_id`, spend deltas | B16, B27 |
| P3 | `create_ad` + `launch` with compare-and-swap | B12, B13, B14 |
| P4 | Config fold + rebuildable `ads` | B12, B13, B22 |
| P5 | `config_generations` on every config change | B13, B48 |
| P6 | Minute rollups + settlement state + account timezone | B06, B18, B21 |
| P7 | Restatement path | B20, B42, B43 |
| P8 | Click-time attribution + orphans | B17, B19 |
| P9 | SSE with resume; live Signal screen; ratios at read | B09, B10, B36, B37, B38 |
| P10 | Action console + decision log | B46, B47 |
| P11 | Budget as a pacing parameter | B32 |
| P12 | Traceability drill-down with assertion | B51, B52, B53, B54 |
| P13 | `trace <event_id>` | B55 |
| P14 | Rollup-vs-raw agreement, on demand | B23, B24, B22 |
| P15 | Read-only component screen | B56 |
| P16 | Demo-mode horizon shortening | B49 |
| P17 | Scenario control, seven triggers | B50 |

---

## 12 — The cut line

**Everything above this line is required.** The walking skeleton, the write path, the fold, the
restatement path, the seed, the agreement sweep, the drill-down, the trace endpoint, the one-command
run and the README are each load-bearing for a hard requirement in `CLAUDE.md` §6, and none of them
is droppable.

**Everything below is droppable without failing a hard requirement**, ordered *first to go*. Each
row says what is actually lost, because the point of a cut line is to make the trade visible rather
than to make cutting feel free.

| # | Cut | Chunk | What is lost |
|---|---|---|---|
| 1 | Generation boundary markers on the chart | B48 | The swap's CTR step still happens and `config_generations` still records it; only the visual annotation goes. HR6 rests on the model, not the marker |
| 2 | EWMA smoothing and the raw toggle | B40 | Charts get noisier. D20's gate is what carries the honesty story; smoothing is comfort |
| 3 | The fatigue flag heuristic | B45 | HR7 stays with B25–B35 — the fatigue curves are still in the data and visible in the charts. What goes is the read-side *interpretation* and its four stated limits: a real loss to the domain-modelling story, and the cheapest big one to make |
| 4 | Stream-health telemetry beyond three counters | part of B44 | Keep events/sec, last-event age and dedupe count; drop the rest. `SCOPE.md` cut #2 already removed the *designed* panel — this is the second bite |
| 5 | `swap_component` in the console | part of B46 | `pause` and `set_budget` both close the loop, and `pause a_12` is the brief's own example. Losing swap costs the on-screen demonstration of D14, which the README's temporal reverse join still shows in SQL |
| 6 | The Workbench component screen | B56 | **Reopens D1**, which ratified this screen as part of the real slice. HR6 stays with B12–B14 and B47 — levers remain the only way config changes. Not mine to cut; listed because it is genuinely droppable against `CLAUDE.md` §6 and Seno should know the option exists |
| 7 | Maturity indicator | B41 | The gate still says "too little data"; what goes is "the data is still arriving". These are two different messages and D§4.5 insists they stay distinct — cutting one makes the surface less honest, not just smaller |
| 8 | Restatement timeline entries | B43 | The chart marker (B42) still carries HR4 end to end; the timeline is the richer telling of it |
| 9 | The second AR(1) demand process | part of B30 | Collapse to one and say so — **D37's own recorded fallback**, ratified in advance. Costs the "you cannot tell a platform dip from a burnout" limit its mechanical basis |
| 10 | Backfill 7 days → 5 days | part of B34 | **S§15.2's stated fallback lever.** Saves ~3 s of seed and ~90 MB. Both depths exceed the 72 h horizon, so settlement behaviour is unchanged |
| 11 | Portfolio 12 ads → 6 | part of B15 | Halves seed time and chart clutter. **Costs a demo moment each**: dropping `a_04` kills the cross-ad transfer story, `a_05` kills copy-on-write's observable consequence, `a_11` kills the headline "burned here, fresh there" claim. Cheap in build time, expensive in evidence — which is why it is last |

**Two things that look cuttable and are not.** `P16` (B49) and `P17` (B50) sit above the line
because **F2 and F3 ratified them as not optional**: the restatement path is correct and *invisible*
without them. On the narrow hard-requirement test alone P17 could be cut — the seed produces
frame-one restatements and P16 causes one live — so this is a ratified scope decision outranking the
arithmetic, not an oversight. Cutting either means reopening a decision, not taking a line off a list.

---

## 13 — Size, and what happens if the rate is wrong

**62 chunks.** At `CLAUDE.md` §5's ~150-line ceiling and a realistic ~100-line average, that is on
the order of 6,000 lines of diff. The distribution is deliberately uneven: stage 0 is three chunks
because it has no checkpoint to earn, and stage 2 is thirteen because it is where the model either is
or is not correct.

**If the rate is lower than assumed**, the order of response is:

1. Take from §12's cut line, top down. Rows 1–4 cost presentation only.
2. Then rows 5–8, which cost stated honesty on the surface — each one needs a README line saying
   what we did not build and why, per `CLAUDE.md` §8.
3. Then rows 9–11, which are the two pre-ratified fallbacks plus the portfolio trim.
4. **Only then** reopen scope with Seno. `SCOPE.md` §7 is explicit that the slice cannot shrink past
   P1–P8 without giving up a graded criterion, and the lever for further reduction is D1's sketch
   boundary — a decision, not an edit to this file.

**Where the schedule risk actually is**, honestly:

- **B20 (restatement)** is the single hardest chunk — decrement-then-credit across two buckets, with
  settlement evaluated at the arriving event's `received_at`. It is also the one whose bugs are
  invisible until B24's sweep runs. Budget it at the 150-line ceiling and expect it to want a
  follow-up chunk.
- **B34/B35 (backfill and the seam)** is the second. The sort, the handover at `T0` and the
  `source` marker are three interacting requirements from one decision, and getting the seam wrong
  makes `as_of` silently meaningless rather than broken.
- **Stage 4** is ten chunks of UI against a design that specifies behaviour precisely and appearance
  not at all. That is the right way round given `CLAUDE.md` §7, but it means the cut line will
  mostly bite here.

---

## 14 — Standing rules for every chunk in this plan

Restated from `CLAUDE.md` §5 and §10 because they are the ones that will bite during Phase 5.

- **Nothing writes a projection except `apply()`.** Not a preference — a rule, and one that will not
  show up as a test failure. `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`.
- **B24's sweep is a single whole-log pass.** The obvious implementation calls `replay()` per bucket
  and is quadratic: seconds become hours.
- **Settlement is evaluated at the arriving event's `received_at`**, never at wall-clock `now`.
  The wall-clock form stamps tens of thousands of spurious restatements during the seed.
- **`STRICT` does not type-check the way the name suggests, and the gap is silent.** Found at B02
  against the real store: binding the JS number `12` into `signals.ad_id` (`TEXT`) is *accepted* and
  stored as the string **`'12.0'`** — STRICT converts across affinity where the conversion is
  lossless, and `node:sqlite` binds a JS number as REAL. So an `ad_id` or `event_id` arriving as a
  JSON number becomes a plausible-looking string that matches nothing, with no error at any layer.
  **B05's validation (U6) must check JavaScript types itself and must not lean on `STRICT`** —
  STRICT catches only the genuinely unconvertible (`'not-an-int'` into an INTEGER column, which it
  does reject).
- **A partial index is only used if the query spells its predicate literally.** Found at B03 against
  20k rows. `ix_attr_unresolved` is `ON conversion_attribution(state) WHERE state <> 'resolved'`.
  SQLite's implication prover is syntactic, not semantic, so:

  | Query form | Plan |
  |---|---|
  | `WHERE state = 'orphan_provisional'` | **SCAN** — full table, index unused |
  | `WHERE state IN ('orphan_provisional','orphan_expired')` | **SCAN** — full table, index unused |
  | `WHERE state <> 'resolved'` | SCAN **USING INDEX ix_attr_unresolved** |
  | `WHERE state <> 'resolved' AND state = 'orphan_provisional'` | **SEARCH** using the index — best |

  The natural phrasing is the first one, and `conversion_attribution` holds **every** conversion at
  final size. It does not error; it just gets slower as the store grows, which reads as "the demo
  feels laggy". **Every orphan query carries `state <> 'resolved'` as a term**, even when a more
  specific equality follows it. Nothing in the DDL changes — `DESIGN.md` §2.4's index is correct;
  this is a rule about how it is queried.
- **No new dependency without a decision** (§3), and no drive-by refactors (§5).
- **Every chunk leaves the app runnable.** If a chunk cannot, it is two chunks.
- **If a chunk reveals the design is wrong, stop coding and reopen the design doc.** Do not patch
  around it.
- Ticking a box here is part of the commit, not an afterthought; `DECISIONS.md`, `BRIEF_GAPS.md` and
  `SCOPE.md` get updated in the same chunk if it touched them, and a `SCOPE.md` §2–§4 change is a
  README change.
