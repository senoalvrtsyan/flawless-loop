# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-04 · **Phase 5 in progress · stage 1 half-built · 6 / 62 chunks**

---

## Where we are

**Phases 0–4 are closed.** Design is complete and the build is ordered. Nothing in any design
document is provisional.

**Phase 5 (implementation) is running.** Seno gave the go-ahead 2026-09-04. **Stage 0 (B01–B03) is
closed** — the store. **Stage 1 (B04–B11) is half-built**: B04–B06 are in, so the write half of the
walking skeleton works end to end. An event POSTed to `/api/ingest` is stamped, validated, deduped,
persisted and rolled up into `rollup_minute` in one transaction, and survives a restart. Six commits,
one per chunk, each approved before it landed.

**Next is B07** — `GET /api/snapshot?from&to&ads`, the first read path. Then B08 puts a number on
screen (the first client code in the repo), B09/B10 make it live over SSE, and B11 replaces `curl`
with the simulator process. `BUILD_PLAN.md` §4 calls stage 1 *"the riskiest thing in the build"*:
everything after it is width on a proven spine.

**No decision blocks anything from here to B35.** For the first time since Phase 0 the path is
clear. D44/D45 are *deferred* (**F4**) and come back at the stage 3 → 4 seam; see "What is open".

**One caveat on `DESIGN.md`.** It was approved at the Phase 2 close and has since been **corrected
in one place and extended in two** by Phase 3 — read it *with* the "What Phase 3 changed in
`DESIGN.md`" section below, not instead of it.

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–**E15**, I1–**I19**) — the assembly source for the README's extensions section. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–**7** · §C assumptions **U1–U9**. Resolved and deferred ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified only — **D1–D43, T1, F1–F4, U8–U9**. **Use the index table at the top as the lookup:** most have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in per-pass "wording of record" tables. |
| `docs/CHEATSHEET.md` | **One-page revise-from sheet.** Three tables. Refreshed at every **phase** close — **stale as of D41–D43/F4/U8–U9**, see "What is owed". |
| `docs/SCOPE.md` | Phase 1 output. What's real (**P1–P17**), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary · aggregation · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |
| `docs/SIMULATOR.md` | **Phase 3 output.** The seeded world · the rate equation · diurnal, channel, temperature · fatigue · novelty · pacing · the lag mixture · noise · injected misbehaviours · determinism · backfill and the seed path · state sync · scenario control · calibration, measured · the parameter appendix. |
| `docs/BUILD_PLAN.md` | **Phase 4 output and the Phase 5 tracker.** 62 chunks `B01`–`B62`; per chunk: goal, files, manual verification, spec citation, hard-requirement flags, checkbox. §2 decisions · §7 the D44/D45 gate before B36 · §11 scope coverage · §12 cut line · §13 schedule risk · **§14 the traps**. |
| `docs/ai-sessions/` | The **AI process artifact** the brief asks for (L153): one terminal capture per phase, `00`–`04`, exported by Seno. Plus `PHASE_PROMPTS.md`. **All five are committed; nothing owed here.** |
| **`package.json`, `tsconfig.json`, `.nvmrc`, `.gitignore`** | B01. Single package, three entry points, strict TS, Node 24 floor. |
| **`src/server/db.ts`** | B02. `openDb()` (four pragmas, throws if not WAL), `tx()`, `DB_PATH`. |
| **`src/server/migrate.ts`** | B02. Migration runner + CLI. `PRAGMA user_version`, no bookkeeping table. |
| **`migrations/001_logs.sql`** | B02. `components`, `audiences`, `signal_deliveries`, `signals`, `decisions`. |
| **`migrations/002_projections.sql`** | B03. `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`, `projection_meta`, `sim_scenarios`. |
| **`src/server/http.ts`** | B04. `createRouter()` (method+pathname match, 404, handler error → 500), `sendJson()`, `readBody()`, `openSse()`. D42: no framework. |
| **`src/server/index.ts`** | B04/B05. One `DatabaseSync` for the process; refuses to boot on an unmigrated store; `GET /api/health` (log position), `POST /api/ingest`; clean close on SIGINT/SIGTERM. Port **8787**, `PORT` overrides. |
| **`scripts/dev.mjs`** | B04. Server + simulator as two OS processes (D32). A crash in either tears the other down; a **clean** exit does not — which is what lets the empty B11 simulator placeholder return immediately. |
| **`src/shared/types.ts`** | B05. The brief's `Signal` (L76) **verbatim**, `event` discriminator and all; `Disposition`, `SignalSource`, `IngestResult`. |
| **`src/server/ingest.ts`** | B05. `ingest(db, raw, source, now)` — DESIGN §5.1 in one transaction. **Also the seeder's entry point** (SIMULATOR §15.2): one writer of `ingest_seq`. |
| **`src/server/apply.ts`** | B06. **The single projection writer (D7).** `apply()`, `floorMinute()`, D29's upsert. Impressions only; B16/B18 widen it. |
| **`src/{sim,web}/…`** | B01 placeholders, still empty: `src/sim/index.ts` (B11), `src/web/main.tsx` (B08). |

## How to run what exists

```
npm i                 # Node 24+ required; node -v
npm run db:migrate    # creates data/loop.sqlite, applies both migrations
npm run dev           # server on :8787 + the (still empty) simulator process
npm run typecheck     # tsc --noEmit, must be clean
npm test              # node --test — no test files yet (D43), exits 0
sqlite3 data/loop.sqlite ".schema"

curl -s localhost:8787/api/health        # status, schema_version, log_position, uptime
TS=$(node -e "console.log(new Date(Date.now()-3600e3).toISOString())")   # PAST — see the clamp note
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"e1","ts":"'$TS'","ad_id":"a_12","event":"impression"}]'
sqlite3 data/loop.sqlite "SELECT * FROM rollup_minute; SELECT event_id,disposition FROM signal_deliveries;"
```

**Hand-verifying bucketing needs `ts` in the PAST.** A future `ts` is clamped to `received_at` by
I10, so future-dated test events all collapse into the current minute — correct behaviour, and it
cost one confused verification run at B06.

`data/` is gitignored. **Deleting it is the supported reset**; `npm run db:migrate` rebuilds from
empty. `node:sqlite` prints an `ExperimentalWarning` on every run — that is **deliberate** (**U9**).

## The build plan in one paragraph

Stage 0 (B01–B03, **done**) is the schema. **Stage 1 (B04–B11, B04–B06 done) is the walking skeleton and the whole
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

**Nothing blocks any chunk from B07 to B35.**

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

## Build progress

| | |
|---|---|
| **Current stage** | **Stage 1 — the walking skeleton (B04–B11)**, write half done |
| **Last completed chunk** | **B06** — `apply()`, the single projection writer, commit `811c007`. |
| **Next chunk** | **B07** — `GET /api/snapshot?from&to&ads`: one read transaction, returns buckets + `as_of_ingest_seq`. File `src/server/snapshot.ts`. Spec `DESIGN.md` §3.1. Verify by `curl` and diffing the JSON against `sqlite3` by hand. |
| **In flight** | nothing |
| **Chunks ticked** | **6 / 62** (B01–B06) |
| **Cut line status** | nothing cut |
| **Plan edits made during Phase 5** | **B16 split** (2026-09-04, Seno's call): B16 was to widen `SUPPORTED` to all three remaining kinds while B18 extended `apply()` — so B16 would have shipped a server that 500s on its own verify step. B16 now takes **click + spend, ingest *and* `apply()`**; **conversion ingest moved to B18**, with placement, because `ingest()` calls `apply()` for every accepted signal and a no-op branch would be the exact divergence `default: throw` prevents. **B17's `curl` verification is therefore B18's**; B17 is exercised on a fixture. |

**The convention.** A chunk is done when: it is announced, built, reported, and Seno says ok. Then
commit referencing it, tick the box in `docs/BUILD_PLAN.md`, update this table, and **stop and take
the next instruction**. Never chain two chunks on one approval. Seno independently re-runs the
verification on every chunk — expect that and make the steps reproducible.

## Traps that will not fail loudly

`BUILD_PLAN.md` §14 is authoritative; carried here so a cold resume sees them without opening the
plan. **Each produces wrong or slow output with no error.** The last two were found during Phase 5,
against the real store, and are not in any design document.

- **Nothing writes a projection except `apply()`** (D7). `ads`, `config_generations`,
  `conversion_attribution`, `rollup_minute`. A chunk that writes one directly breaks the single
  property the design exists to demonstrate and **will not show up as a test failure**.
  `sim_scenarios` is **not** a projection and is the one table in `002_projections.sql` that
  `apply()` does not own.
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

- **`docs/CHEATSHEET.md` is one pass behind.** It does not yet carry D41–D43, F4 or U8–U9. §9 scopes
  its refresh to **phase** closes, and stage 0 is not a phase — so this is correct, not neglected.
  It gets refreshed at the Phase 5 close, or sooner if Seno wants to revise from it.
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
- **B12 owes the fifth D43 test target**, `isCanonicalIso`, with the argument already written onto
  B12's row: loosened, the event is accepted, `ts_effective` silently takes the later instant, and
  B24's sweep re-derives from that same column and agrees with itself.
- **B33 owes a fault split.** Malformed (0.1%) and dual click-id (0.05%) both read `rejected_invalid`
  and no reason is stored (deliberate, B05) — split them by re-running `validate()` over the retained
  bodies, which is only correct once `SUPPORTED` covers all four kinds.
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

**Environment note.** `sqlite3` CLI **3.45.1** is installed; `node:sqlite` embeds **3.51.2**. Both
read the same file without complaint, but if a `.schema` or a query plan ever looks wrong, that
version gap is the first thing to check.

## Next action

**Announce B07, build it, report, wait.** Nothing needs deciding first.

B07 is the first **read** path: `GET /api/snapshot?from&to&ads`, one read transaction, buckets plus
`as_of_ingest_seq`. Read `DESIGN.md` §3.1 before writing it — it fixes what the client gets on a
cold start and why the rows are absolute. Two things already built that it must use: `rollup_minute`
holds **counts only** (D10 — ratios are derived at read time, never stored), and `max_ingest_seq` per
bucket is the as-of stamp (D31). §2.4's access paths were verified at B03: the hot read goes through
the `WITHOUT ROWID` primary key, the portfolio window through `ix_rollup_time`.

For reference, the remaining gates in `CLAUDE.md` §4 order:

1. **Phase 5 — implementation**, chunk by chunk under `CLAUDE.md` §5. **In progress, 3/62.**
2. **Phase 6 — packaging:** README, demo script, the "life of one event" trace, the AI artifact.
   These are `BUILD_PLAN.md` stage 7 (B57–B62) rather than a separate effort.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **Announce, build, report, wait.** Never chain two chunks on one approval. Commit only on "ok".
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
