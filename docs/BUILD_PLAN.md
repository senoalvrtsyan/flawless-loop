# BUILD_PLAN.md

**Phase 4 output.** The tracking document for the whole implementation. Written 2026-09-03.

**Still no code.** This document is the plan; nothing exists on disk outside `docs/`. Phase 5
begins on Seno's explicit instruction, and **five decisions block chunk B01** — see §2.

**Reading order.** `CLAUDE.md` → `docs/STATUS.md` → this file → the one design section a chunk cites.
Scope of record is `docs/SCOPE.md` (P1–P17). Architecture is `docs/DESIGN.md`. Mock data is
`docs/SIMULATOR.md`. Ratified rationale is `docs/DECISIONS.md`; its index table at
the top is the one-line-each view (`CHEATSHEET.md` was dropped, 2026-09-04).

---

## 1 — How this document works

**Ids.** Build chunks are `B01`–`B62`, numbered in **build order**. `SCOPE.md`'s `P1`–`P17` are
*scope* items, not chunks; several chunks close one P item and a few chunks advance several. §11 is
the coverage table that maps every P item to the chunks that close it, so nothing in scope is
orphaned.

**Commit convention.** `CLAUDE.md` §5 asks for a message referencing the plan item. It reads
`feat(signal): SSE transport — B09, closes P9`. (`CLAUDE.md`'s illustrative `P5.3` predates this
document; `B##` is the plan item id, `P##` the scope item it advances.)

**Per GROUP, per `CLAUDE.md` §5 as amended by D48** (2026-09-04): announce the group, build it,
report once with a **per-chunk** verification block, wait. On "ok": commit **per chunk**, tick each
box here, stop. A group is **3–5 related chunks and never crosses a stage boundary**. **B20, B24,
B34, B35, B36 and B37 stay single-gated** (§13 named them). No group proceeds without approval, and
a group stops mid-build for a decision, a wrong design or a new dependency.

**Plan edit, 2026-09-04 (G11):** **B38a added** — lettered, not renumbered, as `B20a` and `B31a/b`
were. **D65** (the rolling viewport) was ratified at the G11 announcement and no numbered chunk owned
the work it created; folding it into B38 would have put two concerns in one chunk. `B39`–`B62` keep
their ids, which are cited across four documents.

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
| [x] | **B04** | HTTP server, `GET /api/health`, and a dev runner that starts server and simulator as two processes | `src/server/http.ts`, `src/server/index.ts`, `scripts/dev.mjs` | `npm run dev`; `curl /api/health` returns the log position | D§11 | — |
| [x] | **B05** | `POST /api/ingest` for `impression` only: stamp `received_at` + `ingest_seq`, validate, write `signal_deliveries` **always**, dedupe on `event_id`, insert `signals` — one transaction | `src/server/ingest.ts`, `src/shared/types.ts` | POST one event, then the same `event_id` again: dispositions read `accepted` then `duplicate_identical`; `signals` has one row, `signal_deliveries` two; POST a negative amount → `rejected_invalid` with the raw body kept | D§5.1 | **HR2 HR8** |
| [x] | **B06** | `apply()` — the single writer. Rollup upsert for impressions, in B05's transaction. Establishes the rule the rest of the build obeys | `src/server/apply.ts` | POST three impressions spanning two minutes → `rollup_minute` has exactly two rows with the right counts and `max_ingest_seq`; grep proves no other file writes a projection | D§4.3, §1 | **HR2 HR6** |
| [x] | **B07** | `GET /api/snapshot?from&to&ads` — one read transaction, returns buckets + `as_of_ingest_seq` | `src/server/snapshot.ts` | `curl` after B06 and diff the JSON against `sqlite3` output by hand | D§3.1 | **HR2** |
| [x] | **B08** | Client shell: fetch the snapshot, render one number. No chart, no styling | `src/web/main.tsx`, `src/web/App.tsx`, `index.html` | Number appears in the browser; **refresh → same number**; stop the server, restart it, refresh → still there | D§3, §3.1 | **HR1 HR8** |
| [x] | **B09** | SSE `GET /api/stream`: dirty-set collection, 250–500 ms flush tick, **absolute** bucket rows, `id:` = high-water `ingest_seq` | `src/server/stream.ts` | `curl -N /api/stream` in one terminal, POST in another; one absolute row per touched bucket per tick, never a delta | D§5.5, §11 | **HR2** |
| [x] | **B10a** | **Server-side resume.** Read `Last-Event-ID`, replay from the store, `resnapshot` frame when the cursor is too old. **Constraint (Seno, at B09): resume is a store query over `rollup_minute` (`max_ingest_seq > cursor`), not a replay of buffered frames** — there is no index on `max_ingest_seq`, so it is a full scan, which is fine once per connect and is exactly why it cannot be per-tick | `src/server/stream.ts` | `curl -N -H 'Last-Event-ID: <n>' localhost:8787/api/stream`, check the replayed rows against `sqlite3`; a cursor the server cannot serve cheaply gets `resnapshot` | D§3.1, §5.5 | **HR1 HR2** |
| [x] | **B10b** | **Client subscribes**, merges absolute rows by `(ad_id, minute_start)`, reconnects. **D47: the `EventSource` URL MUST carry `?cursor=<as_of_ingest_seq>`** from the snapshot just taken — `EventSource` cannot set a header, so without the query param every refresh silently drops the snapshot-to-subscribe gap. **The replay is UNWINDOWED while the snapshot is windowed — drop out-of-window rows rather than merge them** | `src/web/stream.ts`, `src/web/store.ts` | Number ticks up live; kill the server mid-stream and restart → the client reconnects and the number is **not** double-counted | D§3.1, §5.5 | **HR1 HR2** |
| [x] | **B11** | Simulator as a separate process: 1 s tick, keyed RNG (`splitmix64`, named streams), a constant impression rate for one ad, batched POST | `src/sim/index.ts`, `src/sim/rng.ts` | `npm run sim`; the browser number climbs at the expected rate; kill and restart the simulator → the re-emitted events dedupe as `duplicate_identical` because ids are derived, not remembered | D§11; S§14, §15.1 | **HR2 HR7** |

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

**The five gates for this stage** (D48). Fourteen chunks, five approvals:

| Gate | Chunks | The one concern |
|---|---|---|
| **G1** | B12 + B13 + B14 | Config becomes real: the fold, the compare-and-swap, the endpoint |
| **G2** | B15 + B16 + B17 | The portfolio exists, and click + spend + attribution land |
| **G3** | B18 + B19 | Conversions: cohort placement and orphans |
| **G4** | **B20 alone** | Restatement — §13's hardest chunk, and single-gated for that reason |
| **G5** | B20a + B21 + B22 + B23 | The timestamp module, settlement on the read side, verify, replay |
| **G6** | **B24 alone** | The P14 agreement sweep — the gate that guards everything after it |

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [x] | **B12** | `DecisionBody` types and `fold()` — one pure function, exhaustive over the six actions, including the unreachable `archived` branch written to explain itself | `src/shared/decisions.ts`, `src/server/fold.ts` | `node --test`: a fixture sequence folds to the expected config; the `archived` branch is present, unreachable and commented per F1. **Also lands the fifth D43 target: `isCanonicalIso` (B05)** — loosened, the event is accepted, `ts_effective` silently takes the later instant, and B24's sweep re-derives from that same column and agrees with itself; our own emitter only ever sends the canonical form, so neither the sweep nor hand verification can see it. ~5 lines | D§7, §2.3 | **HR6** |
| [x] | **B13** | `applyDecision()`: compare-and-swap preconditions on `from_cents`/`from_id`, write `ads`, close and open `config_generations` — one transaction | `src/server/apply.ts` | Unit test: a stale `from_cents` is rejected; a good one opens generation *n+1* with `valid_to` set on *n* | D§7, §2.4 | **HR6** |
| [x] | **B14** | `POST /api/decisions` (returns the new state in the same txn) and `GET /api/decisions` | `src/server/decisions.ts` | `curl` `create_ad` then `launch` → an `ads` row appears with `launched_at`; grep proves **no code path inserts `ads` directly** | D§7, §11 | **HR2 HR6** |
| [x] | **B15** | Seeder part 1: `components` and `audiences` fixtures, then 12 `create_ad` + 12 `launch` decisions through `applyDecision` | `src/sim/seed-world.ts`, `src/sim/fixtures.ts` | `npm run seed` on an empty DB → 24 rows in `decisions`, 12 in `ads`, 12 generations; `vl_04` has two versions with `parent_id` set | D§3.2; S§2 | **HR1 HR2 HR6** |
| [x] | **B16** | `click` (`click_id`, `cost_cents`) and `spend` (60 s delta) through ingest **and** their additive counts in `apply()` — `clicks`, `click_cost_cents`, `spend_cents`, kept disjoint. Neither kind needs attribution, so both close end to end here | `src/server/ingest.ts`, `src/server/apply.ts`, `src/shared/types.ts` | `curl` a click and a spend; both land in `rollup_minute` at their own minute; a second click claiming an existing `click_id` is rejected by the partial unique index and **counted**, not silently deduped | D§2.2, §5.1, §5.3 | **HR2** |
| [x] | **B17** | Attribution: resolve `attributed_click_id` against `signals.click_id`; `credited_ad_id` from **the click**; `ad_id_conflict`; `credited_generation_id` = generation live at the click's `ts`. A module with no caller yet — **conversions do not enter ingest until B18**, so this chunk is exercised against a hand-built fixture and its `curl` verification is B18's | `src/server/attribute.ts` | Fixture: click at T, conversion later → `conversion_attribution` is `resolved` with the generation covering T; a conversion whose own `ad_id` disagrees → `ad_id_conflict = 1`, nothing silently reconciled. The end-to-end `curl` is at B18 | D§5.2 | **HR2** |
| [x] | **B18** | `conversion` through ingest **and** cohort placement (D27-B) together: a conversion counts in **its click's minute**. They cannot be split — `ingest()` calls `apply()` for every accepted signal, so a conversion that ingests before `apply()` handles it would need a silent no-op branch, which is the divergence the `default: throw` exists to prevent. D27-B needs B17's attribution to know which minute | `src/server/ingest.ts`, `src/server/apply.ts` | Click at 14:02, conversion at 16:40 → the **14:02** bucket carries the conversion; total spend is the read-time sum of two columns, never a third stored one | D§5.3, §4.5 | **HR2** |
| [x] | **B19** | Orphans: `orphan_provisional` at its own minute into the `provisional_*` columns; `orphan_expired` past the horizon | `src/server/attribute.ts`, `src/server/apply.ts` | Conversion before its click → `provisional_conversions` moves and the settled counts do **not**; an orphan older than 72 h reads `orphan_expired`, still counted, never deleted | D§5.2 | **HR4** |
| [x] | **B20** | **Restatement.** `applyConversion(ev, prev)`: decrement the old bucket, credit the new; `settled_at(B, ev.received_at)` — *never* wall-clock `now`; `restated_at` + `restatement_count`; orphan promotion via `ix_signals_attr` | `src/server/apply.ts` | Send the withheld click → the orphan promotes, **two** buckets change, the provisional one is decremented; send a conversion into a >72 h bucket → `restated_at` set, count bumped | D§5.4; S§15.3(c) | **HR4** |
| [x] | **B20a** | `src/shared/time.ts` — **one** implementation of the timestamp invariant: `isCanonicalIso` / `toCanonicalIso` (explicit-offset check included) / `floorMinute`, and the callers switched to it. No behaviour change | `src/shared/time.ts`, `src/server/ingest.ts`, `src/server/apply.ts`, `src/server/snapshot.ts` | Every §14 timestamp case re-run against the shared module: B05's four reject classes, B06's bucketing, B07's snapping and offset rejections — all unchanged. `grep -n "toISOString()\s*===\|\\.\\d{3}Z\|60_000" src/` finds the invariant in one file | §14 | — |
| [x] | **B21** | Settlement state on the read side: `live` / `settled` / `restated` per bucket, in the snapshot and the SSE row; the 72 h horizon and the `America/New_York` constant in one config module | `src/server/settlement.ts`, `src/shared/config.ts` | Snapshot rows carry a state; a 7-day-old bucket reads `settled`, a 10-minute-old one `live` | D§5.4, §5.7 | **HR4** |
| [x] | **B22** | `GET /api/verify`: rebuild every projection from the logs into temp tables, diff row by row, return the first divergence or a clean bill with the log position; `content_hash` fast path | `src/server/verify.ts` | Runs clean; hand-`UPDATE` one `rollup_minute` row and see it caught with the offending key | D§7 | **HR5 HR6** |
| [x] | **B23** | `replay(descriptor)` — pure function over a log prefix. Reads **raw `signals` only**, restricted to `ingest_seq <= as_of`, re-deriving attribution over that prefix. No HTTP yet | `src/server/replay.ts` | Unit test on a hand-built fixture; assert it never opens `rollup_minute` | D§10.2 | **HR5** |
| [x] | **B24** | **P14 agreement sweep** as `npm run agree`: one ordered whole-log pass, rebuild, diff every bucket, print mismatches | `scripts/agree.ts` | Runs clean on the curl-built dataset in milliseconds; corrupt a bucket → caught. **Must be a single pass, not `replay()` per bucket** — per-bucket is O(buckets × N) and takes hours | D§10.2; S§18.4 | **HR5** |

**Why B20a exists, and why it is lettered rather than numbered.** Added 2026-09-04, Seno's call,
after B07. The timestamp invariant of §14 — canonical ISO, explicit offset, minute-aligned — had
acquired **three** implementations linked only by a §14 note: ingest's `toISOString()` round-trip
(B05), `apply()`'s regex (B06), and snapshot's inline canonicalise-and-snap (B07). B21's horizon
sweep would be the fourth, and a fourth reading of one rule is how the rule stops holding. It sits
immediately before B21 so that sweep is written against the shared module and not against a copy.
It is `B20a`, not a renumber, because `B21`–`B62` are cited by id across four documents and §11's
coverage table; a renumber would invalidate every one of those references to save a letter.

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
| [x] | **B25** | Rate equation core: per-channel diurnal shape, day-of-week, `NegBinomial(λ, α=8)` draw | `src/sim/rate.ts`, `src/sim/params.ts` | `npm run sim -- --dry-run --hours 24` prints hourly totals; the two peaks and the per-channel shapes match S§21's constants | S§3, §4 | **HR7** |
| [x] | **B26** | Fatigue: `F(lineage, audience)` accrual, `φ(f) = 0.25 + 0.75·exp(−0.35f)`, `video^1.0 × headline^0.5`, 5-day idle recovery, version partial reset `r = 0.35` | `src/sim/fatigue.ts` | Dry-run prints φ per pair after the seeded volumes; **reproduce S§7.2's table** — `vl_01 × cold_us` at 0.43 and `vl_01 × warm_us` at 0.91 at the same instant | S§7 | **HR7** |
| [x] | **B27** | Channel and temperature matrices → clicks (`BetaBinomial`), CPC, order value; `spend` emitted as a 60 s delta per live ad | `src/sim/emit.ts`, `src/sim/params.ts` | Dry-run CTR and CVR per ad match S§21's matrices within noise; spend ticks arrive one per minute per live ad | S§5, §6, §10 | **HR7** |
| [x] | **B28** | Novelty `ν(age) = 1 + 0.25·exp(−age/18)`, applied to CTR only, on the pair's first exposure | `src/sim/fatigue.ts` | Dry-run: `a_07` at ν ≈ 1.06, `a_01` at 1.00 — the two ends of a creative's life at one moment | S§8 | **HR7** |
| [x] | **B29** | Conversion lag: fast/slow mixture by `p_fast`, separate reporting lag, 7-day hard cutoff, schedule re-derived from the keyed RNG rather than stored | `src/sim/lag.ts` | Dry-run prints median / p95 / past-72 h share per temperature and **matches S§11.2**: rt 0.3 h / 1.87 d / 2.3%, cold 7.5 h / 2.85 d / 4.6% | S§11 | **HR4 HR7** |
| [x] | **B30** | Noise: two log-AR(1) demand factors (channel τ45m, ad τ20m), `BetaBinomial` rates, CPC coupled to channel demand | `src/sim/noise.ts` | Dry-run: variance/mean grows with λ; the channel factor moves every ad on that channel together; autocorrelation at the stated τ | S§12 | **HR7** |
| [x] | **B31a** | **The account-local clock moved to `src/shared/time.ts`** (forced: `spend_so_far_today` needs the `America/New_York` day boundary on the SERVER, and the only `Intl` offset logic was the simulator's — B20a's argument, one file later) **+ `GET /api/sim/world`**: ads and status, `last_decision_seq`, `F` per pair **recomputed from the log**, `spend_so_far_today`, pending backfilled clicks, pending scenarios | `src/shared/time.ts`, `src/shared/config.ts`, `src/server/sim-world.ts` | `curl` it against a seeded store: 12 ads from the fold, `spend_so_far_today` equals `sum(click_cost_cents + spend_cents)`, `F` per pair equals the rollup, and **a mid-run `swap_component` splits the video pair while leaving the headline pair whole** — 126 + 18 = 144, the temporal join and §7.2's third claim in one check | D§8, §11; S§16 | **HR3** |
| [x] | **B31b** | The emitter's **1 Hz poll** and emission gating: status decides whether an ad emits at all, `F` from the poll replaces the frozen nominal accrual, ν and `spend_so_far_today` likewise | `src/sim/world.ts`, `src/sim/index.ts` | `curl` a `pause` decision → **emission for that ad stops within one second**; φ and ν stop being frozen at `T0` | D§11; S§16 | **HR3** |
| [x] | **B32** | Budget pacing: `ρ_catchup × ρ_terminal`, day boundary at `America/New_York`, +5% overspend tolerance | `src/sim/pacing.ts` | `curl` a `set_budget` doubling → **event rate visibly rises inside a second**; drive `a` to 0.95 and watch the taper rather than a cliff; no discontinuity at the local midnight rollover | S§9 | **HR3 HR7** |
| [x] | **B33** | Injected misbehaviours: duplicate identical and conflicting, short and long reorder, orphan withheld and orphan never, malformed, clock skew, dual click-id, 0.2% silent emitter loss | `src/sim/faults.ts` | Run 5 minutes, then count `signal_deliveries` by disposition and compare against S§13's rates; every injected fault has a handler already built in stage 2. **Malformed (0.1%) and dual click-id (0.05%) both land as `rejected_invalid`** and no reason is stored (B05, deliberate): split them by re-running `validate()` over the retained `payload_json` — which is only correct once `SUPPORTED` covers all four kinds (B12+), or every click reads as a fault | S§13 | **HR4 HR7** |
| [x] | **B34** | Backfill generation: 7 days in-process through `ingest()`, `received_at = ts + reporting lag`, **sorted by `received_at`** before writing, server-assigned `source = 'backfill'`. **Owed from B09: the seeder must NOT call `stream.markDirty()`** — measured, one batch across 20,000 minutes gave a **6.20 MiB** frame and a **142 ms** event-loop stall; ~17 MiB / ~400 ms at 56,160 seeded buckets | `src/sim/seed-history.ts` | `npm run seed` on an empty DB → ~1.6M events; `ingest_seq` is monotone in `received_at`; a handful of buckets carry `restated_at` **from frame one** | S§15.2, §15.3 | **HR1 HR2 HR7** |
| [x] | **B34a** | **Attribution reads a log PREFIX, not the whole log.** `resolveAttribution()` takes a REQUIRED `as_of_ingest_seq` and bounds its click lookup with `ingest_seq <= ?`; `apply()` supplies `signal.ingest_seq` at both call sites — the conversion branch, and `promoteOrphans()`, where the prefix is the CLICK's seq because the parked conversion's own prefix is precisely the one its click does not exist in. Fixes §14's first B34 trap: unbounded, the rebuild resolved every conversion against clicks that had not yet arrived, could not produce an orphan at all, and reported divergence on a correct store. `replay.ts` (B23) states the rule for the other check path and is the spec. **The tempting wrong fix — dropping `resolved_at` from `DIFFED` — is not taken.** `verify.ts` is untouched: `apply()` already held the prefix | `src/server/attribute.ts`, `src/server/apply.ts`, `src/server/attribute.test.ts`, `src/server/verify.test.ts` | On a store holding a PROMOTED orphan, `GET /api/verify` goes 409 → **200** — measured on a 1-day scratch seed (360,740 signals, 49 conversions promoted by a later-arriving click): pre-fix `conversion_attribution.resolved_at` diverges, post-fix every hash matches. `npm run agree` still OK. Two new tests, both of which fail without the bound | D§7, §10.2; D55 | **HR4 HR5** |
| [x] | **B35** | **The `T0` handover seam, and the live emitter's conversions.** Before this chunk the emitter emitted NO conversions at all — B29 built the lag and emits nothing by design, B31a built `pending_backfill_clicks` and nothing consumed it, and B34 dropped every conversion arriving after `T0` on the promise the emitter would re-derive it. One `conversionFor()` serves both populations, which IS the seam: the tick and the click's index are decoded from the click's own `ts` (`spreadMs` = `tick*1000 + min(i,999)`), so a handed-over click — which arrives as `{click_id, ad_id, ts}` and nothing else — mints the same `event_id` the generator that dropped it would have. Live clicks schedule in-process (non-durable, like `held`); backfilled clicks need no queue because the world's pending set IS the queue. **D63**: a paused ad's already-earned conversion still arrives, so the lookup is `world.ads`, not `live`. `temperatureOf()` moved to `fixtures.ts` — both sides of the seam need the same answer. Seed progress printing was already delivered at B34 | `src/sim/index.ts`, `src/sim/fixtures.ts`, `src/sim/seed-history.ts` | Measured on a 1-day scratch seed (`T0` 16:32:34, **7,166 backfilled clicks handed over**): five conversions arrived live, **every one on a `source='backfill'` click and every one crediting a minute before `T0`** — oldest `2026-09-03T21:13`, **19.5 h late**. Restart identity holds: the catch-up re-emitted 412 events as **400 `duplicate_identical` / 0 `duplicate_conflicting`**. `/api/verify` **200** and `npm run agree` **OK** afterwards (362,084 events, 17,086 buckets) | S§15.3(b) | **HR4 HR7** |
| [x] | **B35a** | **The world poll's pending set leaves the 1 Hz path.** `pending_backfill_clicks` was sent on every poll — 99% of the payload, for a list §15.3(b) makes a **boot-time handover**: fixed at `T0`, only shrinking, and shrinking only because of what the emitter itself just sent. Now served **only** behind `?include=pending`, with the wire type `[] | null` so that **`null` (not requested) and `[]` (none pending) cannot be confused** — collapsing them would let an emitter that forgot to ask deliver no handed-over conversions at all, silently. The emitter fetches once, keyed by the world's seed, holds the list and **drains** it: a click whose D62 Bernoulli says it never converts is dropped on first sight rather than re-decided every tick | `src/server/sim-world.ts`, `src/server/index.ts`, `src/shared/types.ts`, `src/sim/world.ts`, `src/sim/index.ts` | Measured on the 1-day scratch store (7,161 pending): the 1 Hz poll goes **571,432 → 5,716 bytes** (a 100× cut, 99.0% of it was the pending set) and `simWorld()` goes **33.2 → 17.3 ms**. Live: the handover is fetched **once** (`[sim] handover: 7,161 backfilled click(s) … fetched once, not polled`), the held list drops to **149** on the first tick and stays there, a handed-over conversion still arrives crediting `2026-09-03T21:13`, and `/api/verify` is **200** | S§15.3(b), §16 | **HR4** |

### The seed budget, re-measured at B06 — the D39 revisit B34 owes

**Nothing regressed. `SIMULATOR.md` §18.4 measured the store, not the write path** — it answered a
narrower question than the one B34 asks, and both its numbers are right for that question.

Measured 2026-09-04 against the real `ingest()` → `apply()` path, 1,625,000 events, batches of 5,000:
**27.5 s** (59,002/s, drifting 60k → 57k as the tables grow) and **716 MB**.

**Time, fully accounted.** Per event, 16.9 µs. The four line items §18.4's benchmark never ran:

| | µs/event | In §18.4's benchmark? |
|---|---|---|
| `signals` insert + `RETURNING ts_effective` | 6.0 | yes |
| `apply()` rollup upsert | 2.0 | yes |
| `signal_deliveries` insert | 2.7 | **no** |
| canonicalise + `JSON.stringify` + sha256 | 1.8 | **no** |
| `signals` PK dedupe probe | 0.9 | **no** |
| `JSON.parse`, allocation, per-batch overhead | 3.5 | **no** |

Subtract the four and 16.9 µs becomes **8.0 µs = 125k/s**, against D39's ratified 133.6k/s. The
figures agree; they are measurements of two different paths.

**Store, same cause.** By `dbstat` over a 300k-event store: `signal_deliveries` plus its index is
**233 B/event — 53% of the file**. Everything §18.4 measured — `signals`, `rollup_minute` and their
indexes — is **205 B/event → ~332 MB at 1.625M**, against the ratified ~315 MB.

**Five levers for B34, with costs attached.** This is a D39 revisit, not a B34 implementation
detail — the first four are free of evidence loss, the fifth is not:

1. **Accept ~28 s** with the progress printing §18.4 consequence 2 already requires (B35).
2. **Pull the 5-day fallback** §15.2 names: ~1.16M events, ~20 s. Already cut-line row 10.
3. **Drop `RETURNING`**, computing `ts_effective` in JS as `ts < received_at ? ts : received_at` —
   identical *because* B05 guarantees canonical form. ~1.7 µs/event ≈ 2.8 s. Costs the property
   that the projection reads the store's own generated value rather than a second implementation
   of it.
4. **Create `signals`' three indexes after the seed** rather than during it. The largest lever and
   the most invasive; it changes what `migrate()` owns.
5. **Skip `payload_json` for accepted `backfill` deliveries.** The least evidential 216 B/event in
   the store — for a seeded event it is a re-serialisation of an object the seeder itself built one
   millisecond earlier, not a record of anything a foreign system sent. Keeps every count,
   disposition and hash. **Costs B55's `trace` a body on seeded events, which is an HR5 cost and a
   real one** — the walk-back would show the delivery row and its disposition but not the payload,
   on exactly the six days of history a reviewer is most likely to click into.

### B31 split into B31a / B31b — 2026-09-04, Seno's call

B31 as written was ~240 diff lines across four files. **B09 ran ~230 and that is what prompted the
B10 split**, so the same rule applied here — and B31's verify column already named two separable
checks: the endpoint's `F` against the log, and the live pause behaviour. **B31a** is the shared
account-local clock plus `GET /api/sim/world`; **B31b** is the 1 Hz poll and emission gating.
Lettered, not renumbered, for the same reason B10a/B10b and B20a were: `B32`–`B62` are cited by id
across four documents. **Total chunks: 65.**

Every other reference to "B31" in this plan and in `SIMULATOR.md` means the pair unless it names a
letter. **HR3 is not satisfied until B31b** — the endpoint alone changes no emission.

### The gate-margin check B34 owes — carried from D56

**Not a fix, a check at calibration** (Seno's condition at D56). `a_08` is the ad that makes D20's
*hourly* CPA/ROAS branch fire on camera, and D56's correction moved its peak from **15.3 to 12.0
conversions/hour against a bar of 10** — a 20% margin where the earlier figure gave 53%. The rung
assignment itself did not move (checked at peak and trough for all six of §18.3's ads), but the
headroom did.

**What to confirm at B34:** whether the ladder picks a rung from the **realised** hour's conversion
count or from its **expectation**. If realised, `α = 8`'s overdispersion will put some hours under
the bar and *"hourly CPA is drawable for `a_08`"* becomes a coin flip on the demo — silently, since
a suppressed ratio is exactly what D20 is supposed to do and looks identical to working correctly.
The figures in §18.3 are expectations, and ν is omitted from them (B28 revisits that), so the
realised distribution is what has to be measured rather than argued.

> ### ▶ Demo checkpoint 3 — *"the data is a design artifact"*
>
> Boot on an empty database. Twelve ads with seven days of history appear in about half a minute
> (~28 s measured at B06 — see the D39 revisit above; lever 2 or 4 brings it down),
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

> ### ✅ Gate before B36 — CLEARED 2026-09-04
>
> **D44 — ACCEPTED A: uPlot `1.6.32`**, pinned exact, imported in `src/web/Chart.tsx` and nowhere
> else, with a flip condition to hand-rolled SVG fixed in the entry. Installed at **B37**, not B36.
> **D45 — ACCEPTED A: one plain stylesheet** (`src/web/app.css`) with semantic custom properties,
> plus two requirements — **settlement state carries a non-colour channel as well as colour** (B42
> checks it against a greyscale screenshot) and **one theme only**, no `prefers-color-scheme`.
> **(3) D49 re-decided — the cut line is HELD INTACT again**, nothing cut, and the next asking moves
> to the stage-4 → 5 seam reframed as *"do we reinstate `SCOPE.md` §4 cut #1, decision scoring?"* —
> note that is `SCOPE.md`'s list, not §12's, and the two number their items differently.
> **(4) The B36 group creates `docs/DEMO.md`** and every stage-4/5 group from here appends its
> walkthrough steps to it and says so in its report (**D50**).
>
> Full entries: `docs/DECISIONS.md` § THE B36 GATE PASS.

| ☐ | # | Goal | Files | Verify by hand | Spec | Flags |
|---|---|---|---|---|---|---|
| [x] | **B36** | App shell: portfolio list from `ads`, window / granularity / ad-selection controls, one stylesheet. **The plan row was one file short** — `DESIGN.md` §3.1 puts `ads[]` on the SNAPSHOT (*"one request, one read transaction, consistent by construction"*) and no chunk added it, so `snapshot.ts` gains `AdRow[]`, read in the same transaction as the buckets and deliberately NOT filtered by `?ads=`. **D45 landed**: `app.css`, semantic custom properties, one theme; the settlement tokens are declared here with their non-colour channel (dash patterns) for B42, and ad status carries a glyph as well as a colour. **Granularity is viewport state only until B37** and changes nothing yet — D46 forbids re-bucketing except at a descriptor's own granularity, and descriptors arrive at B51. **D50: `docs/DEMO.md` created** | `src/server/snapshot.ts`, `src/web/App.tsx`, `src/web/Portfolio.tsx`, `src/web/app.css`, `docs/DEMO.md` | Twelve ads listed with status, budget and generation, all from the fold — verified on the seeded store: `ads: 12`, `a_01 … live … 250000 … g_a_01_002`. `?ads=a_12` returns **2 buckets for `a_12` only and all 12 portfolio rows**. Window and selection changes re-run §3.1 from step 1. `npx vite build` clean (2.43 kB CSS bundled) | D§3, §3.1 | — |
| [x] | **B37** | Chart: one series per selected ad over the window, drawn from bucket rows only. **D44 installed: `uplot@1.6.32`, pinned exact**, imported in `src/web/Chart.tsx` and nowhere else. The arithmetic is **split into `src/web/series.ts`** so it can be tested — D43's criterion, *"tests only where a wrong answer is invisible"*, and a mis-summed hour draws a completely normal chart. Hours derive from minutes by SUMMING COUNTS (D§4.1), no division (D10). **D64: a missing bucket is 0 inside the ad's life and `null` before `launched_at`** — a bucket exists iff an event landed in it, so an absent minute is a delivered zero, but before launch zero would be a fabricated point. **D46 lands on `toColumns()` at B51**: the aggregation must then bind to the descriptor's own `granularity_s`, and the comment there is the hook | `src/web/Chart.tsx`, `src/web/series.ts`, `src/web/series.test.ts`, `src/web/App.tsx`, `src/web/app.css`, `package.json` | **The plan's own check, run three ways and all three agree exactly.** `a_03`, six hour points from the live snapshot through `toColumns()`: 794 / 916 / 804 / 1136 / 1660 / 1129 — identical to `SUM(impressions)` over `rollup_minute` per hour, and identical again to `COUNT(*)` over **raw `signals`**, which never touches the projection. Eight new tests (86 total); `npx vite build` clean | D§4.1, §11 | **HR2** |
| [x] | **B38a** | **Added 2026-09-04 at the G11 announcement** — the rolling viewport **D65** ratified, which no numbered chunk owned. `store.ts` walks `[from, to)` forward a minute at a time, evicts what falls off the back and keeps the server's window as `anchor`; `App.tsx` ticks it every 5 s and shows `anchored at … (+Nm)`. Snapping is `shared/time.ts`'s, per D65's amendment. **The defect it fixes was measured, not read**: `to = ceilToMinute(now)` at fetch time, so once that minute closed every arriving bucket was outside the window and `applyRows` dropped it — the surface was live for at most the tail of one minute, which is why B10b and B37 never saw it | `src/web/store.ts`, `src/web/store.test.ts`, `src/web/App.tsx` | 75 s with the emitter running: the frame rolled `18:23–18:29` → `18:24–18:30` (+1m), **12 rows at or past the anchor's end are now in the store** where they were previously dropped forever, and 9 out-of-frame rows are still refused. Six new tests | D§3.1; D65 | **HR1** |
| [x] | **B38** | Ratios derived at read from additive counts — CTR, CPA, ROAS. Nothing stored, nothing computed on the client from raw. **The plan row was one file short**: the same division is needed by the server (window totals, D46) and by the chart (per point, B39), so the arithmetic is `src/shared/metrics.ts` — one implementation, two callers, the same rule as `shared/time.ts` (B20a) and `fatigue.ts`'s φ (B31b). `snapshot()` grows `totals` (per ad plus a combined `ad_id: null` row) summed in SQL with the division after; **D66's `?include=totals`** serves them without buckets, carrying the resolved window and `as_of_ingest_seq`. `src/web/metrics.ts` is formatting and the refresh fetch, never an independent number. **`provisional_*` is held apart and named on screen** — §14's trap, and B38 is where it bites | `src/shared/metrics.ts`, `src/shared/metrics.test.ts`, `src/web/metrics.ts`, `src/server/snapshot.ts`, `src/server/index.ts`, `src/web/App.tsx`, `src/web/app.css` | **Three routes agree exactly** on `a_08` over `[17:00, 23:00)`: server totals == the snapshot's own 360 bucket rows summed == `COUNT`/`SUM` over raw `signals` — 18,056 impressions · 680 clicks · 23,845 + 4,685 = 28,530¢ · 77 conversions · 634,112¢. CTR by hand `680/18056 = 0.037661` matches to 1e-15; conversions agree **through the attribution join** (D27-B). `?include=totals` 3,924 B vs 1,461,970 B for the same window; `include=everything` → 400. **No ratio column exists** — checked by `pragma_table_info` and by a test that greps every migration. Eight new tests | D§4.3; D10, D46, D66 | **HR2** |
| [x] | **B39** | D20's gate and adaptive ladder: minute → 5 min → 15 min → hour, **stop**, then show counts with the reason stated. **D67 fixes what D20 left unstated**: the bar is tested per point, a rung is admissible at **> 50% of the window's non-empty points**, the gated count and its reason are always on screen, and dropped ads are named. `series.ts` was rebuilt on `pointCounts` (count sets per point) with `toColumns` kept as a projection of it — the chunk's own need, not a drive-by, and **B37's eight tests are the guard**. `Chart.tsx` takes the plan and decides nothing | `src/web/gate.ts`, `src/web/gate.test.ts`, `src/web/series.ts`, `src/web/Chart.tsx`, `src/web/App.tsx`, `src/web/app.css` | **Both branches fire on the same ad four hours apart**, measured on the seeded week: `a_08` at 00–04Z (20:00–00:00 local) draws **CPA at the hour**, 3 plotted 1 gated, while at 05–11Z (01:00–07:00 local) **CPA falls to counts** — *"0 of 6 points clear at best — under 10 conversions"* — and CTR coarsens 15 min → hour. Portfolio CPA at peak: one ad drawn, **eleven named**. CTR over 24h: nine drawn at the hour, **43 of 216 points gated**, `a_07`/`a_09` counts-only. Per-ad rungs reproduce §18.3 from REALISED counts. Ten new tests | D§4.5; S§18.3; D20, D67 | — |
| [x] | **B40** | EWMA smoothing, 15-minute half-life, with a raw toggle. **Decayed in TIME, not per point** — D20's ladder makes the step size a variable, so a per-point α would mean 15 minutes at the minute rung and 15 hours at the hour rung. Applied **after** the gate, so a suppressed point cannot re-enter through its neighbour's average, and a gap decays rather than bridges. **Raw is the default**, because it is the series B53 asserts against, and the caption says so while smoothing is on | `src/web/metrics.ts`, `src/web/metrics.test.ts`, `src/web/Chart.tsx`, `src/web/App.tsx` | `a_08` CTR at 15 min, raw `3.97 4.90 2.83 4.41 …` vs EWMA `3.97 4.43 3.63 4.02 …`, **4 nulls preserved in both**. Stated limitation, arithmetic not opinion: the carried weight is 0.5 at the 15-min rung and **0.0625 at the hour**, so the toggle visibly acts on CTR and barely acts on CPA. Four new tests | D§4.5; D20 | — |
| [x] | **B41** | Maturity indicator: empirical attribution-lag CDF over settled cohorts, global, always shown with its sample size **and the seeded share**. **Settled cohorts only is the load-bearing word**: measured over every resolved conversion the curve is biased short by survivorship — recent cohorts have contributed their fast conversions and not their slow ones — so every quantile reads early and the screen claims more maturity than it has, flatteringly and silently. The lag is `received_at − click.ts` (§4.5's own words), not from the conversion's own `ts`. Evaluated for the window's **newest and oldest minute** and nothing in between, because a single window figure needs a cohort weighting no document specifies. Rides with the totals (`?include=totals`) because it qualifies them. D33's fixed curve is the cold-start fallback and **announces itself** | `src/server/maturity.ts`, `src/server/maturity.test.ts`, `src/web/Maturity.tsx`, `src/server/snapshot.ts`, `src/web/App.tsx`, `src/web/app.css` | On the seeded week: **805 settled conversions, 805 seeded, 0 live** — matching `sqlite3` exactly on all three; median lag **0.36 h**, p95 **42.7–42.9 h** (the p95 differs by one ECDF element from the SQL convention, which is the 5%-step grid, not an error); newest minute in view **0% mature**, oldest **100%**. Six new tests, including the survivorship bias priced at 0.30 against 0.67 | D§4.5; S§15.4; D33 | — |
| [x] | **B42** | Settlement treatment on the chart: `live` / `settled` / `restated`, persistent rather than transient. **Two channels, neither of them only colour** (D45's requirement, and this is the chunk it is checked on): the 72 h horizon is a **dashed vertical rule** labelled `settled ◂ ▸ live`, and a restated point gets a **hollow square plus a full-height hairline** — a shape and a position. Drawn in a uPlot `draw` hook from `restated_at` on the row, so the marks survive every repaint, a refresh and a week. `series.ts` carries a per-point `restated` flag on the SAME index arithmetic as the counts, because a marker one point left of its bucket is the invisible failure that file exists to have one implementation of | `src/web/Chart.tsx`, `src/web/series.ts`, `src/web/App.tsx`, `src/web/app.css` | On the seeded week, 7-day window, `a_01,a_03`: **8 restated rows → 8 flagged points at BOTH granularities**, each on the right minute and the right hour (`22:06` → `22:00`), and every one carrying server-derived `state=restated`. The caption states the counts — restated / settled / live — so the marks are named rather than decorative | D§5.6; D45 | **HR4** |
| [x] | **B43** | Restatement entries on a timeline **at the bucket's own time**, with the delta and the lateness. **Nothing stores the delta and nothing should** (D10/D7): `before` is derived by subtracting the late arrivals from the current counts. **How a restatement is identified was measured, not assumed** — all ten on the seeded week are explained by one rule, a conversion credited to the bucket whose `received_at` is past the bucket's own minute plus the horizon. The horizon is a **parameter**, so P16/B49's sweep changes what counts as late. **The direction not covered is reported rather than hidden**: a late click promoting an orphan *decrements* a settled provisional bucket, the seeded week contains zero of those, and any entry whose arrivals do not account for its `restatement_count` renders as **UNEXPLAINED** | `src/server/restatements.ts`, `src/server/restatements.test.ts`, `src/web/Timeline.tsx`, `src/web/metrics.ts`, `src/server/index.ts`, `src/web/App.tsx`, `src/web/app.css` | `GET /api/restatements` over the seeded week: **8 entries in 25 ms**, all `explained`, ordered by the BUCKET's minute. `a_01` at `2026-08-29T18:33Z` is the one with a real before-and-after — **ROAS 11.89 → 56.87, conversions 1 → 2, +$191.17, 132.7 h late** — and the other seven went 0 → 1. Six new tests, including a horizon sweep flipping `explained` to false | D§5.6 | **HR4** |
| [x] | **B44** | Raw event tail with the `TailFrame` quarantine types, plus the stream-health telemetry block, **and the three items owed from B09**. `src/shared/wire.ts` brands display strings as `Display`, so **two tripwires** hold D34 layer 1 at compile time: summing a frame does not typecheck (carried by the amount being a string at all), and **minting** a `Display` from a plain string does not typecheck (carried by the brand) — both asserted with `@ts-expect-error`, and **verified by unbranding the type and watching `npm run typecheck` fail with `TS2578`**. The tail is built from the POSTED BODY, not the store, so a `rejected_invalid` delivery — which never became a `signals` row — is visible on the one surface built to show it. Telemetry is D34's **named exception** and gets its own heading, treatment and scope line. **(a)** the flush caps a frame at 400 rows and **spills the remainder back into the dirty set**; **(b)** the socket-full warning is once per connection with a counter on the telemetry block; **(c)** `stream.ts` split into `stream.ts` + **`resume.ts`**, with `readCursor` re-exported so no importer moved | `src/shared/wire.ts`, `src/server/tail.ts`, `src/server/tail.test.ts`, `src/server/resume.ts`, `src/server/stream.ts`, `src/server/index.ts`, `src/web/Tail.tsx`, `src/web/stream.ts`, `src/web/App.tsx`, `src/web/app.css` | **Live over SSE, 40 s with the emitter running:** 192 distinct deliveries across frames, money arriving as **strings** (`"$0.62"`, `"$0.04"` — `typeof string`), a `rejected_invalid` row carrying `ad_id_missing_or_not_a_string` (§13's malformed injector, on screen), a `duplicate_identical` row, and health reading 5.4 events/s over a 500-delivery window with 8 orphans unresolved. **The cap and spill, measured on a scratch store:** 500 buckets dirtied in one transaction arrive as **400 + 100**, all 500 distinct, largest frame 400, `rows_spilled: 100`, and the socket-full warning printed **exactly once** for a connection that backpressured twice. Seven new tests | D§11 (D34) | **HR2** |
| [x] | **B45** | The fatigue flag: −25% vs the pair's peak trailing-6h EWMA CTR, ≥3 gated points per window, with its four limits stated on the surface. **Server-side, not `src/web/fatigue-flag.ts` as the row said**, for two structural reasons: the PEAK is a property of the pair's whole life (a 15-minute viewport cannot see a peak set four days ago, and fetching seven days per pair is 24 MB, measured), and `(lineage × audience)` needs **§8's temporal reverse join** — buckets → the generation live at that minute → its `video_id` → that component's lineage — which `AdRow` cannot carry without putting the join's result on the wire without the join. The bar is read from `BARS.ctr` rather than re-declared, and the EWMA half-life is D20's, because **§19 states its own lag** ("flagged 15–30 minutes after it starts") which is only true at a 15-minute grid. **A display flag, never a recommendation** (D26 cut #6): this module writes nothing | `src/server/fatigue-flag.ts`, `src/server/fatigue-flag.test.ts`, `src/web/FatigueFlag.tsx`, `src/server/index.ts`, `src/web/metrics.ts`, `src/web/App.tsx`, `src/web/app.css` | **The plan row's check, met exactly on the seeded week** (19 pairs, 114 ms): `a_01` is **FLAGGED at 93% below peak** on both slots (`vl_04 × rt_us`, CTR 0.46% against a peak of 6.23%), and **`a_09` is not flagged — because the gate suppresses its points**, which the row says in those words. Ten of twelve ads carry a flag, which is the seeded week's own design (φ spans 0.126–0.938 after seven days). **§19's fourth limit fires on real data too**: `a_07`, `a_11` and `a_12` each show one slot flagged and the other gated or under the bar — a partial signal, attributed to the slot. Six new tests | S§19 | **HR7** |

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
| [x] | **B46** | Action console: `pause` / `resume` / `set_budget` / `swap_component`, rationale required, compare-and-swap rejection surfaced honestly rather than retried | `src/web/Console.tsx`, `src/web/decisions.ts` *(the pure display half, split out for B47)*, `src/server/components.ts`, `src/server/components.test.ts`, `src/server/index.ts`, `src/server/snapshot.ts`, `src/web/App.tsx`, `src/web/app.css` | **Measured on a copy of the seeded store, through the real endpoint.** `pause a_12` → 200, `decision_seq` 24 → 25, `g_a_12_003` opened, status `paused`. **The same `decision_id` again → `replayed: true`, still seq 25** — U5's key is held across a network failure and regenerated after any server answer. **Three refusals wrote nothing**: `resume` on a live ad → 409 `illegal_transition` *"an ad in 'live' does not admit 'resume'"*, a stale `from_cents` → 409 `stale_precondition` *"expected from_cents 1, current is 9000"*, an all-whitespace rationale → 400 — and `decision_seq` was **still 24** after all three. `swap_component` `v_04 → v_05` (D3's two-version lineage) → seq 26, `set_budget` `$350 → $700` → seq 27. **The console does not mirror `fold.ts`'s transition table and does not retry a rejection**, both stated in the file | D§7, §11; S§9 | **HR3 HR6** |
| [x] | **B47** | Decision log surface: per-ad and global, with actor, rationale, `decision_seq`, and the generation each opened | `src/web/DecisionLog.tsx`, `src/web/decisions.ts`, `src/server/snapshot.ts`, `src/web/App.tsx`, `src/web/app.css` | `DESIGN.md` §3.1's envelope is complete: `decisions[]` and `generations[]` now ride the snapshot **in the same read transaction as `ads[]` and the buckets**, which is what stops a chart annotated with a generation from describing a different instant than the log explaining it. Measured: 27 decisions, 27 generations, **27 of 27 joined through `opened_by_decision` with zero orphans**. Fold order is served and REVERSED for display, in the display and nowhere near the fold. A decision that opened no generation renders `—` with the reason (§7 opens one *only if config changed*), not a blank | D§7 | **HR6** |
| [x] | **B48** | Generation boundaries drawn on the chart from `config_generations` | `src/web/generations.ts`, `src/web/generations.test.ts`, `src/web/Chart.tsx`, `src/web/App.tsx`, `src/web/app.css` | Three boundaries drawn in the 1 h window after the three levers above, each explained by its own decision: `a_12` gen 3 *status live → paused*, `a_12` gen 4 *video v_04 → v_05*, `a_03` gen 3 *budget $350 → $700/day*. **The change is DERIVED by diffing adjacent generations and stored nowhere.** Generation 1 is not a boundary (it is the ad coming into existence); the window is half-open on `valid_from` so a boundary is drawn in exactly one view; the previous generation is found by `seq_in_ad - 1`, **not by array position**, or `a_02`'s first change is labelled with `a_01`'s config. Five tests. Third vertical rule on the canvas, told apart from the other two by dash pattern and a ▼ glyph before colour (D45) | D§4.2, §8 | **HR6** |
| [x] | **B49** | **P16** — horizon control: shortening the horizon re-evaluates settlement across the affected range and restates what moves | `src/server/sweep.ts`, `src/server/sweep.test.ts`, `src/server/settlement.ts`, `src/server/snapshot.ts`, `src/server/maturity.ts`, `src/server/restatements.ts`, `src/shared/config.ts`, `src/web/Horizon.tsx`, `src/web/App.tsx`, `src/web/Chart.tsx`, `src/web/metrics.ts`, `src/web/app.css` | **Measured on a copy of the seeded week.** 72 h → 2 h: **40,881 buckets flip `live` → `settled` and 172 of them are restated under the new horizon**, in **83 ms**, reading **40,881 of 71,584 buckets** — the band `ix_rollup_time` covers, not the table. 72 h → 24 h flips 26,515 with 24 restated (58 ms); 72 h → 6 h flips 39,251 with 125 (82 ms); 72 h → 72 h reads **zero rows**. **The horizon is a READ parameter and that is forced, not chosen**: `restated_at` is stamped at ingest against the horizon in force then, so a persisted horizon would make `/api/verify` diverge on a correct store. **The sweep writes nothing.** The SSE flush tick still stamps at the account horizon — one read serves N subscribers — so the client re-derives state with the SAME `bucketState`, which is why `settlement.ts` is kept free of `node:sqlite` | D§5.7 (F2) | **HR4** |
| [x] | **B50** | **P17** — scenario control: the seven triggers via `POST /api/sim/scenario`, persisted to `sim_scenarios`, delivered on the existing world poll | `src/server/sim-scenario.ts`, `src/server/sim-scenario.test.ts`, `src/server/sim-world.ts`, `src/server/index.ts`, `src/sim/scenarios.ts`, `src/sim/index.ts`, `src/sim/world.ts`, `src/web/Scenarios.tsx`, `src/web/App.tsx`, `src/web/app.css` | **All seven accepted and persisted; three fired end to end against a live emitter.** `late_cascade{a_01, n:12, min_age_h:96}` → **12 → 17 restated buckets**, timeline entries **7 days back** with real before-and-after (`conv 0 → 6`, ROAS `0.00 → 119.25`, 168.0 h late, all `explained`). `orphan_burst{n:6}` → orphans **8 → 14**, all parked at their own minute, then **all six promoted** back to 8 with `credited_minute` moving **19:59 → 19:57** — the two-bucket restatement, on demand. `stall{20}` → **ingest_seq unmoved for 12 s**, then emission resumed. Arguments are **refused, never clamped** (`multiplier: 1000` → 400). **`/api/verify` 200 with all four projections hash-matched, and `npm run agree` OK, after all of it.** Three seams and no fourth: a `LiveAd[]` transform (φ, realised spend), a λ multiplier (`traffic_burst` scales the Poisson MEAN, or the replay mints duplicate ids), and direct injection | S§17 | **HR4** |
| [x] | **B50a** | **P18 — decision scoring** (`SCOPE.md` §4 cut #1, reinstated by **D68**; window by **D70**). A symmetric 6 h before/after window either side of each decision, ONE metric (CPA where both windows carry conversions, CTR otherwise — D19's recommendation, **not separately ratified**), **withheld until both windows are past the lateness horizon** (D19/D13), with any second lever inside either window **flagged as contaminated and named**, never corrected for. Writes nothing and stores nothing: a score is a function of the log, the rollups, the horizon and the read clock, and three of those four move | `src/server/scoring.ts`, `src/server/scoring.test.ts`, `src/server/index.ts`, `src/web/DecisionLog.tsx`, `src/web/metrics.ts`, `src/web/App.tsx`, `src/web/app.css`, `docs/SCOPE.md` | **Seven tests over controlled fixtures**, including the two traps: the settled test uses the WINDOW'S END, not `decision.ts` (testing `ts` calls a score ready 6 h early, with the after-window still filling), and `improved` is per metric (CPA improves when it FALLS). **Measured against the real store, and the honest result is that nothing scores**: the seeded week's 24 decisions are 12 `create_ad` + 12 `launch`, and both have a structurally empty before-window (before `launch` the ad is `draft`, and §3 gives a draft ad λ = 0) — so **12 `no_before_window`, 12 withheld**. Sweeping the horizon to 2 h **released all 6 that were `settling`**, which is D19's pairing working. On a store carrying three real levers, `pause a_12` reads **3,001 impressions before / 0 after** and correctly reports *too little evidence* rather than an infinite decline. **P18 is built and correct and has nothing on the seeded data to show — see D71** | D§7; brief L125, L147 | **HR6** |

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
| [x] | **B51** | `TraceDescriptor` issuance: every metric the server sends carries a signed descriptor — the query, not the answer. HMAC via `node:crypto` | `src/server/descriptor.ts`, `src/shared/wire.ts` | Every number in the snapshot payload has one; tamper with a descriptor and the trace endpoint rejects it | D§10.1 | **HR5** |
| [x] | **B52** | The `<Metric>` component: rendering a performance number **requires** a server-issued descriptor, so tail data cannot produce one | `src/web/Metric.tsx` | Try to render a number without a descriptor and watch `tsc` reject it — the quarantine is compile-time, not convention | D§11 (D34) | **HR5** |
| [x] | **B53** | **P12** — drill-down: click any number → `POST /api/trace` → the contributing raw events, the recomputed figure, and an explicit on-screen **pass/fail** against the displayed one | `src/server/trace.ts`, `src/web/Drilldown.tsx` | Click a bucket's ROAS → the event list, the re-sum, and MATCH. Corrupt one rollup row by hand and watch the same click read FAIL | D§10.2 | **HR5** |
| [x] | **B54** | `as_of` control on the drill-down: re-run the same descriptor at an earlier log position | `src/web/Drilldown.tsx` | Set `as_of` to just before a late arrival → the previous figure; the difference is exactly the named `event_id`s, each with its lateness | D§10.3 | **HR4 HR5** |
| [x] | **B55** | **P13** — `trace <event_id>`: one event → its deliveries → its canonical row → its attribution → the buckets it moved → the metrics that changed → the screen elements affected. **This is the "life of one event" deliverable, executable** | `src/server/trace.ts`, `src/web/EventTrace.tsx` | Paste any `event_id` from the tail and read all eight steps of D§10.4 as selectable rows | D§10.4 | **HR5** |
| [x] | **B56** | **P15** — Workbench component screen: the reverse join, per lineage as the headline and per version beneath | `src/web/Components.tsx`, `src/server/components.ts` | "Product demo — 2 versions, live in 3 ads" with the breakdown; pause an ad and the count drops, because `ads.status` is written only by the fold | D§8 | **HR6** |

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
| [x] | **B57** | **One-command run:** `npm start` → migrate, seed if the store is empty, start server and simulator, print the URL | `scripts/start.mjs`, `package.json` | On a clean clone with Node 24: `npm i && npm start` and nothing else. ~5m20s of seeding **with progress** (B34's re-measurement, not S§18.4's ~12 s — that measured the store, not the model), then a working cockpit | S§18.4 | **HR1** |
| [x] | **B58** | README part 1 — design notes: the three-way split, the persistence boundary and what is recomputable, the aggregation strategy, plus `SCOPE.md` §2–§4 **verbatim** | `README.md` | The `SCOPE.md` block matches byte for byte between the `README-VERBATIM` markers | D§1, §3, §4; Sc§2–4 | **HR8** |
| [ ] | **B59** | README part 2 — the misbehaviour table verbatim, the named limits (retractions, emitter loss, gap detection, USD-only, audience overlap, **`payload_json` is a re-serialisation, not the received bytes** — B05), and the extensions register E1–E15 / I1–I19 assembled from `BRIEF_GAPS.md` | `README.md` | Every row in D§6 present; every extension has a justification row; retractions named as **breaking**, not hidden | D§6, §12 | **HR4** |
| [ ] | **B60** | README part 3 — the **life of one event** with real ids captured from a real run, the component-performance query run against real data with its output, and the copy-on-write defence with its honest scope note | `README.md` | Every id in the trace resolves in the running app; the SQL runs and returns the printed rows | D§9, §10.4, §8 | **HR5** |
| [ ] | **B61** | Demo script: the **final ordered pass** over `docs/DEMO.md`, including the **refresh test and the restart test** as written steps a stranger can follow. **D50: the document is written incrementally from the B36 group onward** — every stage-4/5 group appends its steps as it lands and says so in its report — so this chunk is a tidy-up, not a write-from-nothing | `docs/DEMO.md` | Follow it cold, start to finish, on a clean clone, and time it | — | **HR1** |
| [ ] | **B62** | AI process artifact: export sessions 04–06 to `docs/ai-sessions/`; final `STATUS.md` refresh. **No cheatsheet** — `CHEATSHEET.md` was dropped 2026-09-04 | `docs/ai-sessions/`, `docs/STATUS.md` | Six captures, one per phase; `STATUS.md` alone plus `CLAUDE.md` resumes the repo cold | `CLAUDE.md` §9 | — |

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

**What was actually done, 2026-09-04 (D48/D49).** The rate was measured — 12 chunks in one day,
52 left — and the response was **not** to cut: the round-trip, not the building, was the serial
cost, so the gate moved from the chunk to the group (**D48**) and the cut line below was held
**intact** as insurance to be re-decided at the B36 gate (**D49**). The list below therefore
remains unspent, and step 4 is unchanged.

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

**The newest (D71 — the scoring window as a read parameter):**

- **The horizon alone cannot release a score whose window is still open.** They are two knobs and
  they fail independently: shorten the horizon and a decision whose after-window has not finished
  is still `settling`; shorten the window and a decision inside a long horizon is still withheld.
  A surface that offered one and implied it did both would look broken for a reason nobody could
  find. Both are printed in the caption.
- **The contamination flag must follow the WINDOW, not the ratified 6 h.** A second lever inside a
  15-minute window is a different set from one inside six hours, and carrying the 6 h answer at a
  shortened window claims contamination from evidence the score never saw. Recomputed per read.
- **The caption and the column header must name the window the SERVER answered at, not the control's
  current value.** They differ for one tick after every change — which is precisely the tick a
  reader is looking at. Hence the whole `/api/scores` envelope is held in state, not just the map.
- **`no_evidence` must say WHICH window is missing**, and the version that did not was wrong on the
  real store: `pause a_12` reads **3,001 impressions before and 0 after**, and the sentence said
  *"neither window has enough delivery for a CTR"* — inviting a reader to diagnose under-delivery
  before the lever, when the before-window had a perfectly good CTR. Same distinction §14 already
  draws for `no_before_window`; found at D71's verification, not by reading. **Fixed.**
- **A test whose "lift" is in the wrong metric passes with a delta of zero on both windows.** The
  first D71 test lifted CLICKS, but with conversions on both sides the metric is CPA — so both
  windows reported 0.0% change and the test compared two zeros. The lift has to be in the term the
  chosen metric divides by.
- **Comparing two windows' `delta_pct` by SIGN is the per-metric direction bug in a new costume.**
  CPA improves when it falls, so a bigger improvement is a bigger *negative* delta; `narrow > wide`
  is the wrong assertion and it fails on exactly the case the test exists for. Compare magnitudes.
- **The window's lower bound is 15 minutes and that is a stated limit, not a knob left short.**
  Below one minute both bounds floor to the same minute (D28's grain) and every score compares a
  window against itself. Even at the floor, the fastest possible on-camera score is window + horizon
  — about sixteen minutes. The demo has to start the clock early; it cannot score a lever in a beat.

**The newest (G16 — B51–B56, stage 6):**

- **A rewound `as_of` compared against the rollup reports MISMATCH on a correct store.** The
  recomputation answers a log PREFIX; `rollup_minute` is the fold of everything applied to it and
  has no `as_of`. So the one screen built to prove agreement cries wolf every time a reviewer uses
  its other control — and the number it prints is *correct*, which is what makes it convincing.
  The verdict is withheld (`NOT_COMPARABLE`) below `MAX(max_ingest_seq)` over the range, which is an
  exact test rather than a heuristic: at exactly that seq the verdict returns to MATCH.
- **Comparing only the displayed metric lets a real divergence through.** A ratio can agree while
  its terms do not — 2/4 and 3/6 are both 0.5 — so a corruption that moves numerator and denominator
  together is invisible to a ratio check. Measured: adding 7 impressions to one rollup row reads
  MISMATCH on the counts with ROAS unmoved. The counts are compared **exactly**; only the ratio
  gets a tolerance, and it needs one (IEEE-754 addition is not associative and the two paths sum in
  different orders, so `===` would report MISMATCH on a correct store).
- **An evidence list in log order shows none of the interesting rows.** Measured: the first 400 of
  `a_03`'s 10,481 contributors over six hours were **all impressions** — not one conversion made the
  cap, so a ROAS sat above a list containing nothing that earned any revenue. Every number correct,
  the evidence worthless. Identical in shape to G14's newest-first sweep sample. Conversions fill
  the sample first.
- **`replay()` inside `trace()` deadlocks the transaction, not the store.** `readTx` does not nest
  (`db.ts` says so; SQLite has no nested transactions), so calling `replay()` from inside a read
  transaction throws *"cannot start a transaction within a transaction"* — loudly, which is the good
  case. The bad case is the fix that reads as tidier: dropping `trace()`'s own transaction so
  `replay()` can keep its. Then the rollup read and the raw re-derivation see two instants, and a
  conversion landing between them reads as a **divergence**. `replayIn()` exists for this.
- **`JSON.stringify` must never be the signed bytes.** Object serialisation follows insertion order,
  so two descriptors with identical fields built by two different code paths hash differently and
  one of them fails to verify — intermittently, depending on which path built it. Nothing errors at
  the boundary; the drill-down simply refuses a legitimate number, which reads as a traceability bug
  rather than a serialisation one. `canonical()` is an explicit field list, and the separator must
  be a character that cannot occur in any field (a `|` lets `ads=["a_1|x"]` and `ads=["a_1","x"]`
  collide).
- **`timingSafeEqual` THROWS on unequal lengths.** A one-character `sig` is then a 500 in the server
  log instead of a rejection on screen, and a reviewer chases the wrong thing. Compare lengths first.
- **A descriptor's shape must be checked before its signature.** `canonical()` reads nine fields; on
  a body missing one it builds a string containing `undefined`, computes a perfectly valid HMAC of
  nonsense, and reports `invalid_signature` for what is actually a malformed request. Same screen,
  wrong diagnosis.
- **D46's grain binding cannot be an argument to `pointCounts()`.** The gate calls it once per
  ladder rung to DECIDE a rung, so three of four calls are hypothetical and no descriptor exists for
  them. The rule is enforced at the trace boundary instead (`narrows()`), which is also the only
  place it can fail loudly: a client drawing at the hour while holding a minute descriptor gets a
  **400 with the reason**, where an unchecked narrowing returns a real number that fails against the
  displayed figure for a reason that is not corruption.
- **A lineage's ad count is a SET, not a sum of its versions.** An ad using v1 in one slot and v2 in
  another is one ad using that lineage; adding the per-version counts reports two. The per-version
  numbers are ad-*slots* and are summed on purpose, which is exactly what makes the mistake easy.
- **A component used by no ad must still appear.** `JOIN` instead of `LEFT JOIN` turns a component
  *library* into a list of what is currently in use — the opposite of what a library is for — and
  nothing looks wrong, because every row shown is correct.
- **Descriptors do not survive a server restart, and that is deliberate**, but it must be *said*:
  the key is per process, so a page left open across a restart gets `invalid_signature` on its next
  click. Verified. The message names the cause and the fix (refresh); without it the failure reads
  as tampering.
- **Verifying against a server you did not restart proves nothing.** A stale process kept the port
  and silently answered while a "new" one failed to bind — the old descriptors kept verifying and
  the per-process key looked broken-in-the-safe-direction. Confirm the port is free before
  concluding anything about a restart.

**The newest (G15 — B50a):**

- **The lateness bias runs in ONE direction, which is the worst shape a wrong number can have.** The
  before-window has had longer to accumulate late conversions than the after-window, so an unguarded
  before/after comparison makes **every** decision look worse than it was. Nothing errors and every
  figure is plausible. This is what the withholding rule exists for, and removing it as a
  "simplification" reintroduces it invisibly.
- **The settled test must use the after-window's END, not `decision.ts`.** Testing the decision's own
  timestamp calls a score ready **six hours early**, with the after-window still filling — so the
  score is computed over half its own evidence and reads perfectly normally.
- **`improved` is per metric: CPA improves when it FALLS, CTR when it rises.** Reading
  `delta_pct > 0` as "improved" flips the verdict on every CPA-scored decision, and the row still
  renders an ordinary sentence.
- **A contamination flag that fires on everything is a flag nobody reads.** Including `create_ad` in
  the contaminating set marked **24 of 24** seeded entries contaminated, because the seed creates
  and launches each ad a minute apart. It is excluded — and that is not conservatism, it is
  correctness: a `create_ad` leaves the ad in `draft` and §3 gives a draft ad λ = 0, so it *cannot*
  have moved a count in anyone's window.
- **"Structurally empty" and "too little evidence" are different statements.** A `launch`'s
  before-window is empty because the ad was `draft`, not because it under-delivered; reporting the
  first as the second invites a reader to diagnose a delivery problem that does not exist.
- **A score must not be stored.** It is a function of (the decision log, the rollups, the horizon,
  the read clock) and three of those four move — a `score` column would be a projection that changes
  with no event, which is what `settlement.ts` refuses for the same reason (D7, D54).

**The newest (G14 — B49, B50):**

- **`tsc` clean is not "the client builds."** `Horizon.tsx` imported `HORIZON_CHOICES_H` as a VALUE
  from `sweep.ts`, which imports `db.ts`, which imports `node:sqlite`, `node:fs` and `node:path`.
  TypeScript has nothing to say about a runtime import crossing that boundary; it failed only at
  `vite build`, as `"resolve" is not exported by "__vite-browser-external"`. **Run the bundle, not
  only the typechecker**, whenever a client file imports from `src/server/`. The constant now lives
  in `shared/`, and `settlement.ts` is deliberately kept free of store imports so `bucketState` can
  run in the browser.
- **A persisted lateness horizon would break `/api/verify` on a correct store.** `restated_at` is
  stamped at ingest against the horizon in force *then*; the rebuild replays against the horizon in
  force *now*. Change it in between and verify reports divergence with nothing wrong. This is why
  the horizon is a read parameter — it is forced, not preferred, and the tempting "make it a
  setting" refactor reintroduces it silently.
- **The sweep must not write `restated_at`.** "Mark what moved" reads like an instruction to stamp
  the column. It is `apply()`'s (D7), and a swept value would be both wrong at the account horizon
  and undoable only by a rebuild.
- **The SSE flush tick cannot stamp settlement per subscriber** — one read serves N tabs (§11) — so
  streamed rows carry the ACCOUNT horizon while snapshot rows carry the swept one. The client
  re-derives with the same `bucketState`; a second copy of the rule in the browser is the silent
  version of this, and so is leaving the two mixed in one store.
- **A sweep sample ordered newest-first shows none of the interesting rows.** Measured: 72 h → 2 h
  flips 40,889 buckets of which 172 are restated, and a single capped list contained **zero** of
  them — the caption said "172 had already moved" above six examples that had not. Restated rows
  fill the sample first.
- **`late_cascade` must NOT draw from `pendingHandover()`.** That list is the boot-time handover
  after D62's Bernoulli has discarded every click that will never convert: **77 held against 15,082
  the server reports pending**. Asking for 10 and getting 1 was the measured result, and it makes
  the flagship trigger look broken while every number stays correct. A cascade re-asks for the full
  set — a ~2 MiB fetch that B35a rightly took off the 1 Hz path, and this is not on it.
- **A cascade must cite a REAL click.** An invented `attributed_click_id` produces an orphan that
  parks at its own minute and restates nothing — the flagship path replaced by the orphan path
  wearing its clothes, with a plausible-looking screen.
- **`traffic_burst` scales the Poisson MEAN, never the drawn event list.** Duplicating the list
  mints the same `event_id` twice, so it lands as `duplicate_identical` and demonstrates the dedupe
  path instead of the ingest backpressure §17 asks a reviewer to watch.
- **`duplicate_storm` must replay what was POSTed, not what was generated.** A replay of events the
  store never saw lands as a first delivery and the dedupe counters do not move.
- **Marking a scenario consumed inside `readTx` takes a write lock on the 1 Hz path.** `readTx` is
  `BEGIN DEFERRED` and upgrades on the first UPDATE — on the connection ingest is using. The stall
  would read as backpressure rather than as a lock. The mark happens after the transaction.
- **A `stall` must not buffer.** Queuing the suppressed seconds delivers a burst on release, which
  demonstrates backpressure rather than a gap. `nextTick` is advanced and the seconds are simply
  not emitted — §6's "degrades: detected, not repaired".

**The newest (G13 — B46, B47, B48):**

- **A test fixture that agrees with the code and disagrees with the STORE passes, and proves
  nothing.** The first `components.test.ts` asserted that the only two component kinds are `video`
  and `headline` — true of the fixture, false of the seeded store, which holds sixteen components
  across **four** kinds (`body_copy`, `headline`, `image`, `video`). The console filters by slot
  name, so the code was right; the test was checking the wrong claim and would have gone on passing
  while the picker silently emptied. Found by curling `/api/components` against the real store,
  which is the only way it could have been found.
- **A generation boundary's `prev` must be found by `seq_in_ad - 1`, never by array position.** The
  rows arrive ordered by `(ad_id, seq_in_ad)`, so position works right up until an ad's chain does
  not start at 1 — and then `a_02`'s first change is labelled with `a_01`'s config. The label is a
  sentence either way and the chart is normal either way.
- **Generation 1 is not a boundary.** It is opened by `create_ad`, so a rule there claims a step in
  a series with no points to its left. Drawing it looks like diligence.
- **The boundary window must be half-open on `valid_from`**, like the buckets. Closed on both ends
  draws the same config change at the right edge of one view and the left edge of the next, which
  reads as two lever pulls a minute apart.
- **A console that mirrors `fold.ts`'s transition table has put the rule in two places**, and the
  copy is the one that goes stale. All four levers are always submittable and the 409 is the
  answer; the on-screen hint says what the server will say and disables nothing.
- **Retrying a `stale_precondition` is the one "helpful" fix that defeats I13.** The 409's message
  carries the current value, so a client could re-send with it and succeed — asserting an intent
  nobody expressed, against a world that changed after the human formed the intent.
- **The idempotency key must be held across a NETWORK failure and released after any server
  answer.** Regenerating it on a timeout folds the decision twice if the first POST landed;
  reusing it after a 409 sends the next, different decision under a spent key.
- **A lever must not patch client state from the POST's response.** It changes `ads`,
  `config_generations` and the log in one transaction; applying just the returned `ad` leaves the
  chart's boundaries and the log a step behind, and the three disagree until an unrelated fetch.
  Re-run §3.1 from step 1 — the same path a refresh takes.

**The newest (G12 — B41–B45):**

- **A maturity curve measured over ALL resolved conversions is biased short, flatteringly.** Recent
  cohorts have contributed their fast conversions and not yet their slow ones, so every quantile
  reads early and the screen claims more completeness than it has. `maturity.ts` restricts the
  sample to cohorts credited before `now − horizon`; measured, the difference on a fixture is 0.30
  against 0.67 at the same evaluation point. Nothing errors either way.
- **The maturity lag is `received_at − click.ts`, not `received_at − conversion.ts`.** The second
  answers a different question — how long the shopper took, not how long we waited — and reads far
  shorter. On events whose `ts` IS their arrival, it reads zero and the curve claims the data is
  complete the instant it is emitted.
- **A restatement's `before` figure is derived, never stored** — and a derivation that subtracts
  *every* credited conversion instead of only the LATE ones reports a bucket that went 1 → 2 as
  though it went 0 → 2. Both readings render a perfectly ordinary sentence. `restatements.ts` also
  reports **UNEXPLAINED** when the arrivals it finds do not account for the bucket's
  `restatement_count`, which is how the uncovered direction (a promotion decrementing a settled
  provisional bucket) announces itself instead of being silently mis-attributed.
- **`Display`'s brand carries MINTING, not summing** (found at B44 by testing the tripwire). Summing
  a tail frame fails to typecheck because the amount is a string at all — that guard survives
  unbranding. What the brand stops is a plain string BECOMING a `Display`, i.e. a client fabricating
  a tail value. Both are asserted with `@ts-expect-error`; only the second fails when the brand is
  removed, and the file says which is which.
- **The tail must be built from the POSTED BODY, not from the store.** A `rejected_invalid` delivery
  never became a `signals` row, so a store-backed tail shows only accepted events and §13's whole
  injected-fault channel is invisible on the one surface built to show it.
- **A frame cap without a spill is data loss.** B44 (a) takes at most 400 keys and puts the rest
  BACK into the dirty set before clearing it; taken after the clear, the remainder is gone and the
  buckets stay stale until they next move. Measured: 500 buckets arrive as 400 + 100, all distinct.
- **The fatigue peak must be the pair's LIFE, not the trailing window.** A window-local peak compares
  the last six hours against themselves, so the drop is nearly always zero and nothing is ever
  flagged. And gating on every point instead of on D20's bar lets a quiet night's noise set the
  peak, so everything reads as fatiguing the next morning.
- **"No reading" is not "healthy".** A pair with fewer than three gate-clearing points has no
  fatigue verdict, and §19's third limit is precisely that the ads most likely to be burned are the
  ones we are slowest to flag. The row says which of the two it means.
- **A SQL alias that disagrees with its TypeScript type is invisible** (found at B45): the ad-pair
  query aliased `audience_id AS audience` while the type declared `audience_id`, so the field arrived
  `undefined` on the wire with a clean typecheck. Same family as §14's `sendJson` entry — a wire
  shape `tsc` cannot see.

**The newest (G11 — B38a, B38, B39, B40):**

- **"Empty" is not "the bar's own count is zero", and the difference decides the rung.** Read it the
  wrong way — the way this file's first version of `tally()` did — and a sparse conversion series
  clears **trivially at the minute rung**: six clearing points out of three hundred and sixty, 100%
  clearing, and the chart is then drawn at the minute with 98% of its points absent. That is the
  chart-of-holes outcome **D67** rejected option C for. A point is EMPTY only when every count in it
  is zero; a minute with 4,000 impressions and no conversions is a **gated** point and must count
  against the rung. Caught by `gate.test.ts`, not by looking at a chart.
- **`CLEARING_SHARE = 0.5` looks like a tidy-up and is not** (**D67**). Requiring *every* point makes
  CPA undrawable on any window containing a quiet hour, so D20's hourly branch never fires; requiring
  *any* point picks 5-minute CTR for `a_01` where §18.3 says 15 minutes. Both alternatives draw a
  perfectly normal-looking chart. Measured figures are in D67.
- **The client's window is no longer the server's** (**D65**). B10b's property was that the client
  displayed the server's echoed window byte for byte; a rolling frame cannot keep it, and the
  mitigation is the **`anchored at …` label**, not a comment. Delete the label and the screen stops
  being able to say how far it has walked from the read that anchored it. The roll must also snap
  with `shared/time.ts` — a fifth copy of `floorMinute` is what B20a collapsed four copies to avoid.
- **A smoothed point cannot be reconciled against raw events** (**B40**). EWMA is off by default and
  the caption warns while it is on, because B53's drill-down asserts against the **raw** series; a
  reviewer who walks back a smoothed point will see a mismatch that is not corruption. Making
  smoothing the default is the silent version of this.
- **Ratios are `null`, never 0, when the denominator is empty.** `0/0` rendered as `0.00%` states
  that an unserved ad has a zero click-through rate, and the gate's *too little evidence* message is
  a different claim from *no evidence at all*.

**The newest (B37), about the chart:**

- **The series-identity key must be AD IDS, not labels.** uPlot builds its series at construction,
  so the effect that rebuilds the plot keys on "which ads". Keyed on joined NAMES — which was the
  first version of this file — `Product demo · retargeting` splits into four labels the moment it is
  read back apart, and the chart draws four unnamed series where one belonged. Found by reading it,
  not by running it.
- **`data` must NOT be a dependency of the construction effect.** It is the instance's *initial*
  data; `setData` in a second effect is the update path. Listing it destroys and rebuilds the canvas
  **four times a second** at the 250 ms flush tick — nothing errors, the chart just becomes the one
  thing D44 chose this library to avoid.
- **A missing bucket is a delivered ZERO, not a gap — but only inside the ad's life (D64).** A bucket
  exists iff an event landed in it. Flip it to `null` everywhere and a paused ad's line simply
  stops rather than falling to zero, which reads as missing data instead of as the lever working;
  fill zero before `launched_at` and the chart shows an ad delivering nothing before it existed,
  which is a fabricated point. Both look fine.
- **D46 lands on `toColumns()` at B51**, not before. Once a `TraceDescriptor` exists, this
  aggregation must use the descriptor's `granularity_s` and not the viewport's, or the drill-down
  replays a different question from the one the number answers — and it can pass by coincidence.

**The newest (B35a), about the handover's shape:**

- **`pending_backfill_clicks` is `[] | null` and the two must never be collapsed.** `null` means
  *not requested*; `[]` means *requested, none pending*. An emitter that reads "not fetched yet" as
  "nothing to deliver" emits no handed-over conversions at all — no error, no missing row, every
  number on screen still plausible, and the entire in-flight population simply absent. The typed
  `null` is the guard; a `?? []` anywhere on the client side removes it.
- **The held handover must be keyed by the world's SEED.** A store seeded — or reseeded — under a
  running emitter would otherwise leave it draining a list belonging to a world that no longer
  exists, deriving conversions for `click_id`s the store has never heard of.
- **Dropping the never-converting clicks on first sight is what makes the drain cheap**, and it is
  invisible if lost: D62's Bernoulli rejects ~25 of every 26 rows, so a version that keeps them
  re-decides ~7,000 draws every tick forever instead of ~150. Nothing errors; the emitter just
  quietly costs 50× more per tick than it needs to.

**The newest (B35), all three about the `T0` seam, where a disagreement is invisible by construction:**

- **The conversion draw must be taken at the TICK's instant, not the click's `ts`.** The backfill
  generator calls `converts(seed, click_id, ad, atMs)` with `atMs = tick * 1000`; the live emitter
  must pass the same. Passing `clickTsMs` instead shifts `pCvr`'s day-of-week/temperature lookup by
  up to 999 ms — almost always the same answer, and *occasionally not*. A different set of clicks
  then converts on either side of `T0`, every individual number stays plausible, and the only
  symptom is a conversion that the seed expected and the emitter never sent, or vice versa. Nothing
  errors and no test fails.
- **The seam decodes the tick and the click index out of the click's `ts`**, because a handed-over
  click carries `{click_id, ad_id, ts}` and nothing else. That decode is only correct while
  `spreadMs` stays `tick * 1000 + min(i, 999)`. **Change the sub-second placement and every
  handed-over conversion silently mints a DIFFERENT `event_id`** — it still ingests, still
  attributes, still shows a plausible number, and is simply not the event the generator planned to
  hand over. D58 already moved this formula once. If it moves again, the seam moves with it.
- **§1's "a paused ad's arrival count reads zero" self-check is PER KIND, not per ad** (D63). A
  paused ad still receives conversions from clicks it earned while live. Written per-ad, the check
  reports a false failure the first time a pause demo runs on a store with history — which is
  exactly the demo, on exactly `a_12`.

- **Attribution must read a log PREFIX, not the whole table — FIXED at B34a, and the hazard stays
  here** (found at B34; latent in **B22** since it shipped). `verify.ts` replays
  `FROM main.signals ORDER BY ingest_seq`, but `apply()` called `resolveAttribution(db, …)`, which
  read the **whole** `signals` table with no prefix bound — so every conversion in the rebuild
  resolved against clicks that had not yet arrived, the rebuild **could not produce an orphan at
  all**, and `/api/verify` reported divergence on a correct store. Unobservable until a store
  contained one, which is B34. Measured on a 1-day scratch seed: pre-fix
  `conversion_attribution.resolved_at` live `20:02:45.642` (the promoting click's arrival) against
  rebuilt `20:02:07.905` (the conversion's own); post-fix every hash matches. **`replay.ts` (B23)
  bounds the prefix on BOTH reads and says why** — that comment was the spec.
  **What stays dangerous:** `resolveAttribution()`'s `as_of_ingest_seq` has NO default, on purpose.
  A future caller that reaches for one — or that hands down the parked conversion's seq instead of
  the promoting CLICK's inside `promoteOrphans()` — restores the defect exactly, and the tempting
  wrong fix then is to drop `resolved_at` from `DIFFED`. Both new tests in `verify.test.ts` /
  `attribute.test.ts` fail if it comes back.
- **The out-of-order check must use a window function, not a self-join** (B33 → B34).
  `JOIN signals a, signals b ON a.ingest_seq < b.ingest_seq AND a.ts > b.ts` is quadratic: fine on
  2,700 rows, and it never returns on 1.58M. Use
  `LAG(received_at) OVER (ORDER BY ingest_seq)`.
- **The backfill's state must run FORWARD, and freezing any of it fails silently** (B34). φ from `F`
  accumulated by the impressions already generated, ν from each pair's first exposure inside the
  run, ρ from spend so far on that account-local day. Freeze any one and the seed writes seven days
  of history with no history in it — every number plausible, §7.2's table meaningless, and the
  fatigue story the artifact is built on simply absent.
- **The seed's cost is GENERATION, not the write** (B34, and the D39 revisit). Measured 249 s
  generate against 70 s write, 5:20 wall, 703 MB peak RSS, 746 MB store. §18.4's ~12 s / ~315 MB
  measured the store, and B06's 27.5 s measured the write path; neither measured the model. The
  stated lever is `SIM_BACKFILL_DAYS=5` (§15.2's fallback), already wired.

- **`ρ_pacing` is the one λ factor that is NOT a pure function of `t`** (B32). It reads
  `spend_so_far_today` off the world poll, so a tick re-derived during a catch-up computes a
  different λ than its own emission did. **D58** decided the shape of the consequence: `ts` no
  longer depends on the event count, so a divergence can only append or omit at the tail, never
  rewrite an event already sent. Measured before the decision: at §9's terminal-taper drift, 1.66%
  of a catch-up's impressions would have landed `duplicate_conflicting` — 33× the 0.05% §13 injects
  on purpose, on the one channel we keep precisely because it is rare. **Anything that reintroduces
  a count-dependent field into an event body reopens this**, silently.
- **A derived `spend` delta must be ACCUMULATED, not re-derived, once ρ is live** (B32, replacing
  B27's mechanism). Re-deriving the interval's 60 ticks at the boundary uses the CURRENT ρ for
  ticks emitted under a different one, so the delta bills a different impression count than the
  bucket holds — measured 6.3% of spend events off by a cent at `a_12`'s drift — and it bills a
  full minute of CPM for an ad that was paused for most of it, because `impressionsForTick` does
  not know about status. Neither errors; both are HR5 failing quietly in the money column.
- **A pacing term that reads realised spend can pin against its own clamp and nothing says so**
  (B32, the finding behind **D59**). §9's `ρ_catchup` ceiling of 1.6 ran the whole seeded portfolio
  at **1.19–1.47× §2.3's stated `Impr/day`** for a whole simulated day, because D52's budgets were
  derived at `φ = ν = 1` while a fatigued world spends far less, leaving every ad 20+ points behind
  pace permanently. `a_08` — placed near its cap so the taper would be visible — spent **0.1%** of
  ticks in it. Every individual number was correct; only the comparison against §2.3's own column
  caught it. **The check is per-ad delivered volume against the stated table, and the dry run now
  prints that column on every run.**
- **§13's rates are per event, but two of them are per CLICK** (B33). `orphan_released` (0.4%) and
  `orphan_never` (0.6%) are stated as a share of clicks; measured against all events they read ~20×
  low and look like a transcription slip in the wrong direction.
- **`orphan_released` and `orphan_never` are built but not OBSERVABLE until B34.** Both are defined
  against a conversion and nothing emits a live conversion yet, so a withheld click currently reads
  as a late click and a dropped one as loss. The dry run's MATCH is on the trigger rate, not the
  outcome, and it says so on every run — **B34 must confirm the outcome**, not re-confirm the rate.

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
- **The agreement sweep cannot see an INVENTED all-zero bucket, and that is accepted** (B24). A
  promotion (B20) decrements a provisional bucket to all zeros and **the row stays** — nothing
  deletes a bucket — so the store legitimately holds rows the from-zero recomputation never
  creates. `agree` therefore compares an absent recomputed bucket against zero rather than
  reporting it missing, which is the price of the promotion leftover and cannot be told apart from
  it without replaying arrival order. **`/api/verify` catches it** — its rebuild produces no such
  row. Verified both ways at B24.
- **`npm run agree` does not read `ads`, `config_generations` or `conversion_attribution` at all**
  (B24, found by Seno). It re-derives attribution from raw and compares only `rollup_minute`'s
  counts, so a corrupted `credited_generation_id` (**D14**'s claim) or `credited_ad_id`
  (**I8/G30**'s) **sweeps clean**. `/api/verify` catches both — measured: `live a_99, rebuilt a_12`
  in 5 ms. The risk is not the gap, which is covered; it is the sentence *"every stored bucket
  agrees with the raw event log"* reading as a guarantee about attribution. **The banner names its
  own limits on every run**, and must keep doing so.
- **No projection SQL may be SCHEMA-QUALIFIED** (D55, B22). `/api/verify` rebuilds through the real
  `apply()` into `TEMP` tables that shadow the projection names, and that works only because every
  projection write is unqualified — SQLite resolves an unqualified name to `temp` before `main`.
  **One `main.rollup_minute` written by a future chunk turns the verifier into a corrupter**: it
  typechecks, reads as good practice, and passes every other test. **Guarded:**
  `verify.test.ts` greps every `.ts` under `src/` and fails the build; confirmed to trip on one
  injected occurrence. `verify.ts` is the sole exemption, by name.
- **Grouping `F` by lineage alone loses the version, and silently contradicts §8** (B31b, caught
  mid-build). §7.1's accrual is version-AGNOSTIC — §7.3: a recut inherits its lineage's frequency —
  but §8's novelty window is version-SPECIFIC: *"a version bump gets a fresh novelty window … a
  reused pair does not."* One `GET /api/sim/world` query serves both, so it groups per
  `(lineage, version, audience)` and the emitter does the two aggregations itself: **sum** across
  versions for `F`, **one row's** `first_impression_at` for ν. Grouped by lineage only, `a_05`'s
  recut would inherit `a_01`'s first exposure and arrive with ν = 1.00 instead of a fresh window —
  which is exactly the claim B28 was built to demonstrate, failing with no error and no visible
  symptom beyond a slightly lower CTR on one ad.
- **Making φ and ν live puts a bound on re-emission identity — know the bound before "fixing" it**
  (B31b). φ and ν now come from the poll, and both feed `p_ctr`, so a replayed tick could in
  principle draw a different click count. Measured rather than feared: over a ≤2 minute catch-up
  `F` moves by that window's own impressions against a pool of tens of thousands, so φ shifts
  ~0.003% and a replayed click flips only if its uniform lands inside that band — ~3e-7 per
  impression, ~1e-4 per catch-up. **A click's BODY cannot diverge**, because `cost_cents` and the
  CPC/CPM share are keyed by `(ad, tick, i)` and not by φ, so the worst case is one extra or one
  missing click and never a `duplicate_conflicting`. **Impressions are exactly identical**, because
  D56 kept φ out of λ. Anyone re-introducing φ into λ breaks that and the symptom is a wave of
  `duplicate_conflicting` on every restart.
- **A stateful AR(1) would break re-emission, and nothing would say so** (B30). §12 defines
  `m_channel` and `m_ad` recursively — `log m(t) = ρ · log m(t−Δ) + ε` — so the obvious
  implementation keeps a running value. But `m` multiplies λ, λ decides a tick's impression count,
  and an impression's `event_id` is derived from its tick and index: a stateful `m` re-derives
  differently after a restart, so the same `event_id` comes back attached to a different tick
  population. Every re-emitted second becomes `duplicate_conflicting` — a *platform correction* —
  instead of the `duplicate_identical` §14 promises, and B11's whole catch-up design rests on the
  latter. **`m` must stay a pure function of `t`**, which is why `noise.ts` unrolls the recursion
  into its innovation sum. The failure is silent: the numbers stay plausible and only the
  disposition counts move.
- **The sample autocorrelation understates badly here, and a correct process reads as broken**
  (B30). Estimating the ACF of `log m` by subtracting a SAMPLE mean gave 0.287 at lag τ against a
  true 0.368 — 20% low, four standard errors out — because at `τ/Δ` of 20–45 a few-hundred-step
  window holds only ~12–25 effective observations, so the sample mean is noisy enough to drag every
  lag down. `log m` has a true mean of **exactly 0** by construction, so the estimator must not
  subtract one. Recorded because the first measurement looked like a model defect and was not:
  whoever verifies §12 next will reach for the naive estimator too. The dry run also prints the
  **closed-form** ACF of the truncated sum as the primary check (`ρ^h · Σ_{k<K−h} ρ^{2k} /
  Σ_{k<K} ρ^{2k}`, exact arithmetic) so sampling noise can never be mistaken for a defect again.
- **A derived `spend` delta must cover an interval the emitter EMITTED, not merely one it can
  re-derive** (B27, found twice by reading the store rather than the code). The 60 s CPM delta is a
  pure function of its interval's ticks — deliberately, so a re-emission after a restart is
  byte-identical instead of `duplicate_conflicting` — but the emitter only *sends* ticks from boot
  onward. Unaligned boot billed a full minute against a partial one (`spend 2` behind 3
  impressions); aligning boot down to a 60 s boundary then made the FIRST tick a boundary, which
  closed the interval entirely before boot (`spend 2` behind **zero** impressions, in a bucket with
  no `impression` rows at all). **Both fixes are needed together**: alignment, so every later
  interval starts on a generated tick, and the `tick − 60 >= FIRST_TICK` guard, so the one interval
  no process ever emitted is skipped. Alignment is what makes the guard lossless. Nothing errors in
  either failure mode — HR5's "every number walks back to its events" simply stops being true for
  one minute of every run, in the money column.
- **`BetaBinomial`'s κ did nothing at a 1-second tick — FIXED for clicks at D57, still true for
  conversions** (found B27, resolved B30). The urn's overdispersion enters through `(N − 1)/(κ + 1)`,
  **exactly zero at N = 1**, and per-tick counts are 0–3. So §10's `κ = 200` had no effect at all
  and §12's *"the rate is uncertain, not just the count"* was true of the document and not of the
  data. Nothing errored; the parameter was simply inert.
  **Clicks:** the rate is now drawn once per minute — `p ~ Beta(p_ctr·κ, (1−p_ctr)·κ)` — and held
  across the minute's ticks, so a minute's clicks are exactly `BetaBinomial(N_minute, p_ctr, κ)` at
  the granularity D28 buckets and D20 gates on. Verified by A/B on identical impressions and
  uniforms: the variance ratio against a fixed `p_ctr` tracks `1 + (N̄−1)/(κ+1)` (`a_08` 1.32
  measured vs 1.23 predicted, `a_07` 0.99 vs 1.01).
  **Conversions keep `κ = 60` and it remains inert.** A conversion draw is over one tick's CLICKS,
  which is 0–1, and stays 0–1 over a minute — so lifting it to the same grid would change nothing
  measurable. It would take an hour-wide window to give it any effect, which is a further decision
  about where cohort-rate uncertainty lives rather than a fix. **Stated limit, for the README.**
- **The shadow set is ALL-OR-NOTHING** (D55, B22). Shadow three projections and the fourth is
  rebuilt straight into the live store, silently repairing what it was asked to check. `SHADOWED`
  also carries `decisions` — `applyDecision()` writes the log row in the same transaction (B13) —
  and deliberately **not** `signals`, which attribution must read for real.
- **A `TEMP` shadow that outlives a verify redirects every later unqualified read in the process**
  to an empty table. The verify drops its temps in a `finally` **and** before it starts, so a
  previous crash cannot poison the connection. Presents as "the app suddenly shows zeros".
- **One event can write the same bucket more than once, and `restatement_count` must bump ONCE
  PER BUCKET** (found at B20). §5.4 says *"for each touched bucket B"* — but a click whose promoted
  conversion lands in the click's own minute touches that bucket twice, and two conversions promoted
  by one click land in the same minute. Written as each movement is computed, the counter is wrong
  by one and **every count is still correct**, so B24's sweep re-derives the same numbers and
  agrees. `apply()` coalesces deltas by bucket into one write per bucket per event. The same
  coalescing settles a question statement order would otherwise decide: **a bucket the event itself
  materialises is not a restatement** — it was not settled, it was absent — so the restatement
  clause lives only in `ON CONFLICT DO UPDATE`, or a late orphan creating a week-old bucket arrives
  already stamped with `restated_at` equal to `first_written_at`.
- **`conversions` and `provisional_conversions` must never be summed** (found at B19; bites at
  **B38**). They sit side by side in the same `rollup_minute` row and both count conversions, so
  adding them is the natural thing to write — and it puts UNATTRIBUTED revenue into ROAS and CPA.
  The two are disjoint by construction (`apply()` credits one or the other, never both) precisely
  so that a settled figure and a provisional one can be shown apart. Nothing raises: every number
  stays plausible, and B24's sweep re-derives the same split and agrees with itself. The settled
  ratio uses `conversions` / `value_cents` alone; the provisional pair is a separate, labelled
  figure or it is not shown.
- **There is no stored `orphan_expired` to filter on** (D54, B19). Expiry is derived at read, so
  `WHERE state = 'orphan_provisional'` now means *"unresolved, including the ones we have given up
  on"* — a data-health count written that way silently reports zero expired orphans forever. It is
  also the phrasing the row below shows full-scanning. `state <> 'resolved'` as the SQL term, then
  `attributionStateAt(row, at)` in JS, is the only form that is both correct and indexed.
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
- **`ts_effective`'s `MIN(ts, received_at)` is a LEXICOGRAPHIC comparison, and mixed ISO precision
  silently inverts it.** Found at B05 against `node:sqlite`. SQLite's `MIN()` over TEXT compares
  bytes, so `MIN('2026-09-04T09:00:00.500Z', '2026-09-04T09:00:00Z')` returns **`.500Z`** — the
  *later* instant — because `'.'` (0x2E) sorts before `'Z'` (0x5A). An offset form is worse:
  `MIN('…T09:00:00+00:00', '…T08:00:00.000Z')` is chronologically correct only by accident. I10's
  clamp would then be wrong for a subset of events, with no error anywhere, and every `ts_effective`
  range query would silently mis-bucket them. **The boundary rejects any `ts` that is not exactly
  `new Date(ts).toISOString()`** — same shape everywhere makes lexicographic order chronological
  order, and `signals.ts` still stays "as emitted, never altered". Normalising instead of rejecting
  would break that guarantee; this is why B05 validates the *format*, not just the parseability.

- **Every timestamp reaching a SQL comparison must be canonical ISO — and a window bound must
  additionally be minute-aligned.** The read-side half of the bullet above, found at B07 against
  the real store. Three ways a bound goes wrong, all silent:

  | Bound as given | What happens |
  |---|---|
  | `?from=2026-09-03T12:00:00Z` (canonical, unaligned is fine here) | correct |
  | `?from=2026-09-03T12:00:00` (no offset) | JS parses it as **local** time — `08:00:00.000Z` on a UTC+4 machine, zero buckets, and a **different answer on another laptop** |
  | `?from=2026-09-03T12:00:00Z` compared unsnapped against `minute_start` | `'…T12:00:00Z' > '…T12:00:00.000Z'` (`'Z'` 0x5A after `'.'` 0x2E): the minute it names is **skipped** — measured, 1 of 3 buckets returned |
  | `[12:00:00Z, 12:00:30Z)` / `[12:00:20Z, 13:00:00Z)` | the same 12:00:50 impression is **over-counted at `to`** and **under-counted at `from`** |

  So: **window bounds must be minute-aligned, because a bound inside a minute resolves to whole
  buckets in opposite directions at the two ends.** `from` snaps down, `to` snaps up, and the
  snapped window is echoed in the response — down/up so the window never loses data, never
  collapses to zero width, and a live window ending mid-minute keeps its in-progress bucket. The
  property this protects is the one **B53**'s drill-down asserts: raw events re-summed over
  `[from, to)` equal the buckets' counts. Unaligned, that drill-down prints **FAIL** for a reason
  that is not corruption, and the tempting fix is to loosen the assertion.

  Note the read side **canonicalises** where the write side **rejects** (B05): `signals.ts` is a
  received fact that must be stored as emitted, whereas a window bound is a query, so normalising
  it loses nothing. An explicit offset is still required rather than assumed — see **B20a**, which
  gives this invariant one implementation instead of four.

- **Replay passes each event's OWN `received_at` as `apply()`'s `applied_at`** — never a rebuild
  clock. `apply()` takes the parameter, so the mechanism is already there; what is not written down
  is that B22/B23 must use it. A rebuild stamped with `Date.now()` writes a different
  `first_written_at` into **every** bucket, and `/api/verify` then reports total divergence on a
  store that is in fact correct. The tempting fix at that moment is to drop the column from the
  diff, which would silently retire the one field that makes a restatement legible against the
  bucket's first materialisation.

- **Migrations are append-only from B06 onward.** `migrate()` tracks `PRAGMA user_version` and keeps
  no content hash, so an edit to an already-applied file does not re-run and is not detected: a
  fresh store and an existing store diverge with no error at any layer. (B05 edited a *comment* in
  `001_logs.sql`, which is harmless and is the last such edit — comments inside `CREATE TABLE` live
  in `sqlite_master`, so even that much makes `.schema` differ between a fresh store and an old
  one.) Schema changes get a new numbered file.

- **A client that re-buckets must aggregate at the descriptor's own `granularity_s`, and forward
  the descriptor byte-for-byte** (D46, ratified at B08; bites at B38/B51/B52/B53). D46 permits the
  client to re-bucket server-computed counts to display granularity, on the condition that what it
  renders carries the **server-issued** descriptor unchanged — the descriptor being *the query, not
  the answer*. Two ways that goes silently wrong: re-bucketing to a granularity the descriptor does
  not name (the drill-down then replays a different question, and may *pass* by coincidence when
  the totals happen to match), or minting/editing a descriptor client-side to match the chart. The
  HMAC catches the second and nothing catches the first, so it is a rule. The check that makes D46
  safe is **B53's drill-down**, which is therefore not optional: it is where a client aggregation
  bug becomes a visible **FAIL** instead of a plausible number.

- **`sendJson(body: unknown)` makes every response shape invisible to `tsc`.** Found at B09:
  changing `ingest()`'s return to `{ result, dirty }` typechecked **clean** while silently changing
  what `POST /api/ingest` returns to the emitter. The rule is cheap to forget, so it is also a
  mechanism — **annotate the value at the call site** (`const responseBody: IngestResult = result;`)
  and the next such change is a compile error instead of a rule. Every route that returns a typed
  body does this.

- **An SSE subscriber makes `server.close()` hang forever unless the connections are closed first.**
  Found at B09, and it is a regression of B04's *verified* clean shutdown, not a new feature's
  problem. `server.close()` waits for open connections and a subscriber never ends on its own:
  measured in isolation, the close callback had **still not fired after 1000 ms**. With
  `stream.shutdown()` closing subscribers first, the real server released the port in **14 ms**
  (23 ms with four subscribers attached, Seno's independent run). It would have presented as
  "Ctrl-C hangs sometimes" — only ever with a browser tab open.

- **The SSE resume must be a store query, never a replay of buffered frames** (Seno's constraint at
  B09, built in **B10a**). `rollup_minute` where `max_ingest_seq > cursor` — a full scan, since
  there is no index on that column, which is fine **once per connect** and is exactly why it cannot
  be the per-tick mechanism. The flush's in-memory dirty set is dropped when no subscriber is
  attached, and what makes that safe is this query (**§3.1 step 3**), *not* the snapshot: the
  snapshot is taken **before** the subscribe, so it cannot cover an event landing in the gap —
  measured, an event posted with no subscriber attached is never pushed once one connects. If
  resume is ever built from memory instead, the bucket it loses is **a late conversion restating an
  old minute that never moves again**: wrong on screen, forever, with no error anywhere.

- **`max_ingest_seq` is now the RESUME CONTRACT, not just an as-of stamp** (B10a). Any projection
  write that changes a bucket **without raising it** is invisible to every resuming client — the
  concrete case is **B18's restatement touching only `restated_at`** — and **B24's sweep will not
  catch it**, because the rollup's counts are correct. `apply()` raises it via `MAX(...)` on every
  path today; every future path must too.

- **The emitter's tick index must be an ABSOLUTE unix second, never a counter since boot** (found
  at B11). Derived ids are what let the simulator hold no durable state (`SIMULATOR.md` §14,
  `DESIGN.md` §3.3), but the property only holds if the **whole body** is derivable: a per-process
  counter re-derives the same `event_id` after a restart with a **different `ts`**, and a matching
  id carrying a differing body is `duplicate_conflicting`, not `duplicate_identical`. §5.1 step 4
  surfaces that as a **platform correction** — so the emitter would manufacture a misbehaviour on
  the one channel we keep precisely because it is rare, and it would look like the feature working.
  Measured with the absolute form across three restarts: 39 `duplicate_identical`, **0
  conflicting**. Same family, same chunk: **a failed ingest POST is held and coalesced into the
  next tick, never swallowed** (DESIGN §11 backpressure point 1) — a batch dropped on the floor is
  indistinguishable from the 0.2% emitter-side loss §13 injects on purpose, which is the one
  failure the app has no way to see (§6).

- **The `click_id` collision test must sit AFTER the `event_id` dedupe** (found at B16). §13
  injects a 0.05% "dual click-id" fault — two different events claiming one `click_id` — and it has
  to be caught in `ingest()`, because `ux_signals_click_id` would otherwise refuse the insert and
  take the whole batch down with it. But a redelivery of ONE click carries its own `click_id` too:
  tested before the `event_id` dedupe, every honest retry reads as a dual-click-id fault. B11's
  measured restart property — 14 `duplicate_identical`, 0 conflicting — would have become 14
  `rejected_invalid`, and §13's 0.05% injected rate would have measured near 100%. A collision is
  only a collision **between two different `event_id`s**. Same shape as the trap above it: the
  ordering is what is load-bearing, and neither order raises an error.

- **Every projection id must be a FUNCTION of data the rebuild also has** (found at B13). The
  concrete case is `config_generations.generation_id`, minted as `g_${ad_id}_${seq_in_ad}` padded
  to three digits. A `randomUUID()` there typechecks, reads as normal practice, and passes every
  hand check — and then **B22's rebuild produces the same generations with different ids, so B24's
  row-by-row diff reports total divergence on a perfectly correct store**. The tempting fix at that
  point is to drop the id column from the diff, which quietly removes the check that the rebuild
  reproduces the *same* generations rather than merely the same number of them. Same rule for every
  id a projection invents from here: `(ad_id, seq_in_ad)` is already `UNIQUE`, so the derivation is
  free. `DESIGN.md` §10.4 writes the id `g_a12_004` in prose; the code keeps `ad_id` verbatim
  (`g_a_12_004`) because stripping the underscore can collide (`a_12` and `a1_2`).

- **The gate is the GROUP, not the chunk** (**D48**, at the B11 close). 3–5 related chunks per
  gate, never crossing a stage boundary; one report with a **per-chunk** verification block; one
  "ok"; still **one commit and one tick per chunk**. **Single-gated regardless: B20, B24, B34,
  B35, B36, B37** — §13 named them. A group stops mid-build for a decision, a wrong design or a
  new dependency. Verification is **not** batched: that is what keeps the trade to latency only.

- **No new dependency without a decision** (§3), and no drive-by refactors (§5).
- **Every chunk leaves the app runnable.** If a chunk cannot, it is two chunks.
- **If a chunk reveals the design is wrong, stop coding and reopen the design doc.** Do not patch
  around it.
- Ticking a box here is part of the commit, not an afterthought; `DECISIONS.md`, `BRIEF_GAPS.md` and
  `SCOPE.md` get updated in the same chunk if it touched them, and a `SCOPE.md` §2–§4 change is a
  README change.
