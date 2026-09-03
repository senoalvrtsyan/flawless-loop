# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-03

---

## Where we are

**Phase 3 (Simulator / mock data design) — CLOSED.** Approved by Seno 2026-09-03
(*"approved, close this phase"*). `docs/SIMULATOR.md` is the output of record. All six decisions
(D35–D40) plus both carried parameters are ratified; nothing in it is provisional.

**Phases 0–3 are all closed.** Design is complete: scope, architecture and data model, and the
simulator. **Phase 4 (`docs/BUILD_PLAN.md`) has not been started** — see "Next action".

**One caveat on `DESIGN.md`.** It was approved at the Phase 2 close and has since been **corrected
in one place and extended in two** by Phase 3 — so read it *with* the "What Phase 3 changed in
DESIGN.md" section below, not instead of it.

**No code exists.** Nothing outside `docs/` has been created. Three throwaway verification runs
(D8's pragma check, the DDL check, and Phase 3's seed/sweep benchmark) happened in the scratchpad,
never in the repo — see "What was verified".

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–**E15**, I1–**I18**) — the assembly source for the README's extensions section. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–**6** · §C 7 assumptions. Resolved ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified decisions only — **D1–D40, T1, F1–F3**. **Use the index table at the top as the lookup:** most have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in a per-pass "wording of record" table. |
| `docs/CHEATSHEET.md` | **One-page revise-from sheet.** Three tables. Refreshed at every phase close. |
| `docs/SCOPE.md` | Phase 1 output. What's real (**P1–P17**), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary · aggregation · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |
| `docs/ai-sessions/` | The **AI process artifact** the brief asks for (L153): one terminal capture per phase, `00`–`03`, exported by Seno at each close. Plus `PHASE_PROMPTS.md` — the copy-paste prompt for every gate, including the ones not yet run. |
| `docs/SIMULATOR.md` | **Phase 3 output.** Inherited constraints · the seeded world and the twelve-ad portfolio · the rate equation · diurnal and day-of-week · channel and temperature matrices · fatigue · novelty · pacing · the lag mixture · the noise model · injected misbehaviours · determinism · backfill and the seed path · state sync · scenario control · **calibration, measured** · the read side · what it does not model · the parameter appendix · what it changes elsewhere. |

## What is ratified

Full entries with rationale, consequences and what each forecloses are in `docs/DECISIONS.md`; the
one-line-each version is `docs/CHEATSHEET.md` table 1. **Every decision in the register is now
ratified. D17 was the last open one and is closed.**

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

## What is open

**Nothing.** No decisions and no parameters. D17 was the last open decision and is closed; the two
parameters that `SIMULATOR.md` carried as `ASSUMPTION (unratified)` — `served_fraction` and the
version partial-reset `r` = 0.35 — were ratified 2026-09-03 (`DECISIONS.md` § D35 — PARAMETER
RATIFICATION). Nothing in any design document is now unratified.

**No gate outstanding.** Phase 3 is closed. The next phase begins on Seno's instruction, not
automatically — he said explicitly he would say what comes next.

## What Phase 3 changed in `DESIGN.md`

Recorded here because `DESIGN.md` was approved before these landed. Full list: `SIMULATOR.md` §22.

- **One correction.** §5.4: settlement is evaluated at the arriving event's `received_at`, **not** at
  wall-clock `now`. Without this, seeding stamps `restated_at` on every backfilled event landing in a
  bucket older than 72 h — tens of thousands of spurious restatements, with P7 looking broken on
  frame one.
- **Two schema additions.** `signals.source` (`'backfill' | 'live'`, server-assigned — E15 / D38) and
  the `sim_scenarios` table (D40 — simulator input, not a projection and not a signal).
- **Two endpoints.** `GET /api/sim/world` (1 Hz poll: config, fatigue state, spend-so-far, pending
  scenarios) and `POST /api/sim/scenario`.
- **One stated limit, in §10.3.** Within the seeded window `received_at` is designed rather than
  observed, so `as_of` reconstructs what the screen *would* have shown under the seeded arrival
  model. Live arrivals carry no such caveat; the `source` column is what distinguishes them.

## What is owed

- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it. **P17 landed
  inside it** at this phase close.
- **`BRIEF_GAPS.md` § Extensions is the README's assembly source.** Any new extension in Phase 5
  gets a row there first.
- **Nothing.** The Phase 3 session capture is discharged — `docs/ai-sessions/03-phase-3-simulator.md`
  was exported by Seno at the close, as 00–02 were. All four are tracked.

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

## Next action

**Wait for Seno's instruction.** He closed Phase 3 with *"i'll manually tell whats next"*, so do not
start the next phase on your own initiative — including Phase 4, even though it is the obvious
successor.

For reference, the remaining gates in `CLAUDE.md` §4 order:

1. **Phase 4 — `docs/BUILD_PLAN.md`.** Turns P1–P17 into ordered chunks of ≤ ~150 lines of diff.
   The prompt for it is `docs/ai-sessions/PHASE_PROMPTS.md` § P4. Still **no code** at this phase.
2. **Phase 5 — implementation**, chunk by chunk under `CLAUDE.md` §5: announce, build, report, wait;
   commit on approval referencing the plan item; never proceed without "ok".
3. **Phase 6 — packaging:** README, demo script, the "life of one event" trace, the AI artifact.

**Committed at close.** Phase 3 landed on `master` as one commit — `docs/SIMULATOR.md`, the six
decisions, the `DESIGN.md` correction and extensions, P17, the refreshed `STATUS.md`/`CHEATSHEET.md`,
and the session capture. Nothing outside `docs/` exists to commit.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **No code until Seno says "start Phase 5."** Not a scaffold, not a `package.json`, not a type
  sketch on disk. Type definitions inside a design document are fine. Throwaway verification in the
  scratchpad is fine and has precedent — D8's pragma check, and Phase 3's seed/sweep benchmark — but
  it never lands in the repo.
- **P14's sweep must be a single whole-log pass, not `replay()` per bucket.** Per-bucket is
  O(buckets × N) and takes hours instead of seconds. D7 already specifies it correctly; the trap is
  that the obvious implementation is the quadratic one.
- **Refresh `docs/CHEATSHEET.md` whenever you update this file at a phase close** (`CLAUDE.md` §9).
  The two files must not overlap: cheatsheet = decisions and their defences; status = where we are.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the file.
  If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
