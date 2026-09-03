# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-03 · Phase 4 CLOSED

---

## Where we are

**Phase 4 (Build plan) — CLOSED.** Approved by Seno 2026-09-03 (*"Close out this phase and
commit"*). `docs/BUILD_PLAN.md` is the output of record: 62 chunks (`B01`–`B62`) in build order,
seven stages, a demo checkpoint per stage, a scope coverage table and an ordered cut line.

**Phases 0–4 are all closed.** Design is complete and the build is ordered. Scope, architecture and data model, and the simulator are all ratified;
nothing in any design document is provisional.

**No code exists.** Nothing outside `docs/` has been created. Three throwaway verification runs
(D8's pragma check, the DDL check, Phase 3's seed/sweep benchmark) happened in the scratchpad, never
in the repo — see "What was verified".

**Phase 5 has not started, and cannot start yet.** Five decisions are open and three of them block
the first line of code — see "What is open". Closing Phase 4 approved the *plan*; it did not
authorise code.

**One caveat on `DESIGN.md`.** It was approved at the Phase 2 close and has since been **corrected
in one place and extended in two** by Phase 3 — read it *with* the "What Phase 3 changed in
DESIGN.md" section below, not instead of it.

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–**E15**, I1–**I18**) — the assembly source for the README's extensions section. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–**7** · §C 7 assumptions. Resolved ones carry a banner pointing at `DECISIONS.md`. **Wave 7 (D41–D45) is live and unanswered.** |
| `docs/DECISIONS.md` | Ratified decisions only — **D1–D40, T1, F1–F3**. **Use the index table at the top as the lookup:** most have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in a per-pass "wording of record" table. |
| `docs/CHEATSHEET.md` | **One-page revise-from sheet.** Three tables. Refreshed at every phase close. |
| `docs/SCOPE.md` | Phase 1 output. What's real (**P1–P17**), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary · aggregation · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |
| `docs/SIMULATOR.md` | **Phase 3 output.** The seeded world · the rate equation · diurnal, channel, temperature · fatigue · novelty · pacing · the lag mixture · noise · injected misbehaviours · determinism · backfill and the seed path · state sync · scenario control · calibration, measured · the parameter appendix. |
| `docs/BUILD_PLAN.md` | **Phase 4 output.** 62 chunks `B01`–`B62` in build order; per chunk: goal, files, manual verification, spec citation, hard-requirement flags, checkbox. §2 blocking decisions · §11 scope coverage · §12 cut line · §13 schedule risk · §14 standing rules. |
| `docs/ai-sessions/` | The **AI process artifact** the brief asks for (L153): one terminal capture per phase, `00`–`03`, exported by Seno at each close. Plus `PHASE_PROMPTS.md` — the copy-paste prompt for every gate. **`04-phase-4-build-plan.md` is owed at this close.** |

## The build plan in one paragraph

Stage 0 (B01–B03) is the schema. **Stage 1 (B04–B11) is the walking skeleton and the whole point of
the ordering**: one simulated event, persisted, aggregated, transported over SSE, on screen,
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
one-line-each version is `docs/CHEATSHEET.md` table 1.

- **D1–D14, T1, D26, F1, F2** — scope, model and storage.
- **D27–D34, D20, D22** — the Phase 2 design decisions and their residues.
- **D35–D40, D17, F3, D35p** — Phase 3: fatigue accrual · the lag mixture · the noise model ·
  backfill arrival semantics · volume calibration · simulator state and config sync · D17 closed ·
  scenario control as P17 · the two fatigue parameters (`served_fraction`, version reset `r`).
- **D3, D4, D15, D16, D18, D19, D21, D22, D23, D25** — the carried-over block.
- **8 cheap defaults and U1–U7** — ratified as blocks.

**The three that most shape the build**, if you only reload three: **D27** (a conversion counts in
its *click's* minute — this is why CPA/ROAS lag and CTR does not), **D7** (nothing writes a
projection except the replay/apply function), **D30/D34** (the server owns all arithmetic; the raw
tail is structurally incapable of producing a number).

**The one that most shapes the mock data:** **D35** — fatigue accrues to the
`(component lineage × audience)` pair, so a video burned out on one audience arrives pre-fatigued in
a new ad on that audience, and fresh on a different one.

**Phase 4 ratified nothing.** It is an ordering document, not a design one; every chunk cites a
section that already existed.

## What is open

**Five decisions, `docs/OPEN_QUESTIONS.md` § Wave 7.** Raised at the Phase 4 close because
`BUILD_PLAN.md` B01 runs into them on its first line.

| # | Question | Blocks | Recommendation put forward |
|---|---|---|---|
| **D41** | Repo layout and build toolchain | **B01** — nothing starts | Single package, three entry points; Vite for the client only |
| **D42** | HTTP server: `node:http` or a framework | **B04** | `node:http` with a ~40-line router |
| **D43** | Test runner, and what gets a test at all | **B12** | `node:test`, on the fold, attribution, restatement and the lag math only |
| **D44** | Chart rendering | **B37** (stage 4) | uPlot behind a descriptor-bearing wrapper |
| **D45** | Styling | **B36** (stage 4) | One plain stylesheet, semantic custom properties |

**D41–D43 must be answered before the first commit. D44 and D45 block nothing before stage 4** and
can be deferred without stalling anything — if they are deferred, `BUILD_PLAN.md` §2 gets a note
saying so.

**One gate outstanding.** Phase 4 is closed; the **Phase 5 go-ahead is not given**. It is not
automatic — Seno says when the next phase starts. D41–D43 must be answered before B01 regardless.

## Build progress

**Empty — Phase 5 has not started.** Fill this in every 3–4 chunks, per `CLAUDE.md` §9. It plus
`BUILD_PLAN.md` is what a cold resume runs on.

| | |
|---|---|
| **Current stage** | — (stage 0 begins at B01, blocked on D41) |
| **Last completed chunk** | — |
| **Next chunk** | **B01** — repo scaffold. Blocked on D41. |
| **In flight** | nothing |
| **Chunks ticked** | 0 / 62 |
| **Cut line status** | nothing cut |

**The convention.** A chunk is done when: it is announced, built, reported, and Seno says ok. Then
commit referencing it (`feat(ingest): dedupe on event_id — B05, closes P1`), tick the box in
`docs/BUILD_PLAN.md`, update this table, and **stop and take the next instruction**. Never chain two
chunks on one approval.

## Traps that will not fail loudly

Carried from `BUILD_PLAN.md` §14 so a cold resume sees them without opening the plan. Each of these
produces wrong output with no error.

- **Nothing writes a projection except `apply()`** (D7). `ads`, `config_generations`,
  `conversion_attribution`, `rollup_minute`. A chunk that writes one directly breaks the single
  property the design exists to demonstrate and **will not show up as a test failure**.
- **B24's agreement sweep must be a single whole-log pass**, not `replay()` called per bucket. The
  obvious implementation is O(buckets × N): 4 seconds becomes hours.
- **Settlement is evaluated at the arriving event's `received_at`, never at wall-clock `now`**
  (D38, correcting `DESIGN.md` §5.4). The wall-clock form stamps `restated_at` on tens of thousands
  of backfilled events and P7 looks broken on frame one.
- **Ingest never rejects on ad status** (I11). A conversion attributed to a pre-pause click arrives
  after the pause and is the event we care most about.
- **Ratios are never stored** (D10). Rollups carry additive counts only.

## What Phase 3 changed in `DESIGN.md`

Recorded here because `DESIGN.md` was approved before these landed. Full list: `SIMULATOR.md` §22.

- **One correction.** §5.4: settlement is evaluated at the arriving event's `received_at`, **not** at
  wall-clock `now`.
- **Two schema additions.** `signals.source` (`'backfill'`/`'live'`, server-assigned — E15 / D38) and
  the `sim_scenarios` table (D40 — simulator input, not a projection and not a signal).
- **Two endpoints.** `GET /api/sim/world` (1 Hz poll: config, fatigue state, spend-so-far, pending
  scenarios) and `POST /api/sim/scenario`.
- **One stated limit, in §10.3.** Within the seeded window `received_at` is designed rather than
  observed, so `as_of` reconstructs what the screen *would* have shown under the seeded arrival
  model. Live arrivals carry no such caveat; the `source` column distinguishes them.

## What is owed

- **`docs/ai-sessions/04-phase-4-build-plan.md`** — the Phase 4 session capture. **Owed and not
  yet exported.** Seno exports it, as he did 00–03; the other four are tracked and this one is the
  only gap in the AI process artifact.
- **`docs/CHEATSHEET.md`** was refreshed at this close to the extent it could be: Phase 4 ratified
  nothing, so tables 1 and 2 are unchanged, and table 3 stays the **scope** cut line. The
  chunk-level cut line lives in `BUILD_PLAN.md` §12 and is a different granularity — **do not merge
  them.** The cheatsheet gets its next real update when D41–D45 are ratified.
- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it, and that is a
  README change.
- **`BRIEF_GAPS.md` § Extensions is the README's assembly source.** Any new extension in Phase 5
  gets a row there first.

## What was verified, not assumed

Run in the scratchpad, never in the repo. Each is cited in the doc that depends on it.

| Claim | Result |
|---|---|
| `node:sqlite` loads unflagged; `PRAGMA journal_mode=WAL` returns `wal`; busy_timeout and manual transactions behave | Node v24.14.0 — passes (D8) |
| The §2 DDL executes: `STRICT` tables, the `ts_effective` generated column with `MIN()`, the partial `UNIQUE` index on `click_id`, `STRICT, WITHOUT ROWID` + `ON CONFLICT DO UPDATE` | SQLite 3.51.2 — all pass; the clamp does clamp and the duplicate `click_id` is rejected (DESIGN §2) |
| **Seed rate** — 1.06M events through insert → attribution → rollup upsert, WAL + `synchronous=NORMAL`, txns of 5,000 | **7.9 s (133,601/s)** → ~12 s at the final portfolio size (D39, SIMULATOR §18.4) |
| **P14 agreement sweep** — one ordered pass over raw, rebuild, diff every bucket | **2.72 s** over 56,160 buckets, **0 mismatches** → ~4.2 s at final size. **No bounded mode needed** (D39) |
| Hot read on D28's `WITHOUT ROWID` PK, 60-minute single-ad window | 0.08 ms |
| Store size | 203 MB + 5 MB WAL → ~315 MB at final size |

**What this means for the build:** the driver risk is retired. B02/B03 are transcription of DDL that
has already executed on this machine, and B24's sweep is known to be fast enough to run in front of
a reviewer.

## Next action

**Wait for Seno.** Two things are wanted from him, in this order:

1. **Answer Wave 7 — D41–D43 at minimum** (`docs/OPEN_QUESTIONS.md` § Wave 7). D41 blocks B01 and
   therefore everything. D44/D45 can be deferred to stage 4 without stalling anything.
2. **Say "start Phase 5."** Closing Phase 4 did not authorise code, and neither does answering the
   decisions.

**Do not start Phase 5 on your own initiative**, and do not write a `package.json` "to get going" —
`CLAUDE.md` §4 is explicit that a scaffold is code.

For reference, the remaining gates in `CLAUDE.md` §4 order:

1. **Phase 5 — implementation**, chunk by chunk under `CLAUDE.md` §5: announce, build, report, wait;
   commit on approval referencing the plan item; never proceed without "ok".
2. **Phase 6 — packaging:** README, demo script, the "life of one event" trace, the AI artifact.
   These are `BUILD_PLAN.md` stage 7 (B57–B62) rather than a separate effort.

**Committed at close.** Phase 4 landed on `master` as one commit, as Phases 0–3 did:
`docs/BUILD_PLAN.md` (new), `docs/OPEN_QUESTIONS.md` (Wave 7 — D41–D45), this file,
`docs/CHEATSHEET.md`, and a one-line correction to `docs/DECISIONS.md`'s triage-count sentence
(T1 was decided FIX 6 · SPECIFY 6; D26 consequence 3 moved G04 to FIX, so the register reads
FIX 7 · SPECIFY 5 — the sentence now says both rather than only the original). Nothing outside
`docs/` exists to commit.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **No code until Seno says "start Phase 5."** Not a scaffold, not a `package.json`, not a type
  sketch on disk. Type definitions inside a design document are fine. Throwaway verification in the
  scratchpad is fine and has precedent — but it never lands in the repo.
- **Small chunks, one concern, ≤ ~150 lines.** If a chunk is growing, stop and split it. Every chunk
  leaves the app runnable.
- **No drive-by refactors, no new dependencies without a decision.**
- **If a chunk reveals the design was wrong, stop coding and reopen the design doc.** Do not silently
  patch around it.
- **Refresh `docs/CHEATSHEET.md` whenever you update this file at a phase close** (`CLAUDE.md` §9).
  The two files must not overlap: cheatsheet = decisions and their defences; status = where we are.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the file.
  If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
