# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-03

---

## Where we are

**Phase 2 (Architecture & data model) — DOC WRITTEN, AWAITING APPROVAL.**
`docs/DESIGN.md` exists and covers all twelve sections Seno specified. The phase closes on an
explicit *"approved, continue"* — it has not been given yet.

**No code exists.** Nothing outside `docs/` has been created. Two throwaway verifications were run
in the scratchpad (never in the repo): D8's `node:sqlite` pragma check, and a DDL check confirming
the §2 schema executes — see "What was verified".

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–E14, I1–I17) — the assembly source for the README's extensions section. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–5 · §C 7 assumptions. Resolved ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified decisions only — D1–D34, T1, F1, F2. **Use the index table at the top as the lookup:** twenty have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are ratified as rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in a per-pass "wording of record" table. |
| `docs/CHEATSHEET.md` | **One-page revise-from sheet.** Three tables. Refreshed at every phase close. |
| `docs/SCOPE.md` | Phase 1 output. What's real (P1–P16), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary and cold start · aggregation with pros/cons tables · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |

## What is ratified

Full entries with rationale, consequences and what each forecloses are in `docs/DECISIONS.md`; the
one-line-each version is `docs/CHEATSHEET.md` table 1. **Everything is now ratified except D17.**

- **D1–D14, T1, D26, F1, F2** — scope, model and storage. Unchanged since Phase 1.
- **D27–D32** — the Phase 2 design decisions: cohort bucket placement · rollup key `(ad_id,
  minute_start)` · ingest-time incremental rollups · absolute-bucket-row wire + snapshot/stream ·
  server-issued trace descriptors · separate simulator process.
- **D33, D34, D20** — the residues: empirical maturity CDF (global, sample size shown) ·
  structural raw-tail quarantine · adaptive granularity capped at hour.
- **D3, D4, D15, D16, D18, D19, D21, D22, D23, D25** — the carried-over block.
- **8 cheap defaults and U1–U7** — ratified as blocks.

**The three that most shape the build**, if you only reload three: **D27** (a conversion counts in
its *click's* minute — this is why CPA/ROAS lag and CTR does not), **D7** (nothing writes a
projection except the replay/apply function), **D30/D34** (the server owns all arithmetic; the raw
tail is structurally incapable of producing a number).

## What is open

**One decision: D17 — simulator architecture.** It is the whole of `SIMULATOR.md` and blocks
Phase 3. `OPEN_QUESTIONS.md` §B wave 4 has the options. **D32 already fixed its topology slice**
(separate process, HTTP batch POST to `/api/ingest`); what remains is the emitter's internals —
the diurnal curve, fatigue, noise, the click→conversion lag distribution, seeded determinism, and
the backfill/live handover.

Constraints on D17 already fixed elsewhere, so it does not get to re-decide them:
- Budget is a **pacing multiplier** on the rate curve, not a cap (I3, P11); overspend tolerance is
  a stated simulator parameter.
- Day boundary is **`America/New_York`** (D22).
- Spend is a **delta per fixed interval** (I1); clicks carry a `click_id` distinct from `event_id`
  (E3).
- The simulator is **stateless** — it resumes from `SELECT MAX(ts) FROM signals` (DESIGN §3.3).
- It must honour pause by ceasing emission — a simulator convention, not a contract property, and
  named as such (G48).
- The lag distribution it generates is what D33's maturity CDF will measure, so it needs to be a
  defensible shape, not uniform.

## What is owed

- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it.
- **`BRIEF_GAPS.md` § Extensions is the README's assembly source.** Any new extension in Phase 5
  gets a row there first.
- **Nothing else.** The extensions-section debt recorded at Phase 1 close is discharged.

## What was verified, not assumed

Run in the scratchpad, never in the repo. Both are cited in the docs that depend on them.

| Claim | Result |
|---|---|
| `node:sqlite` loads unflagged; `PRAGMA journal_mode=WAL` returns `wal`; busy_timeout and manual transactions behave | Node v24.14.0 — passes (D8) |
| The §2 DDL executes: `STRICT` tables, the `ts_effective` generated column with `MIN()`, the partial `UNIQUE` index on `click_id`, `STRICT, WITHOUT ROWID` + `ON CONFLICT DO UPDATE` | SQLite 3.51.2 — all pass; the clamp does clamp and the duplicate `click_id` is rejected (DESIGN §2) |

## Next action

1. **Seno approves `docs/DESIGN.md`** (or sends parts back). Phase 2 does not close without it.
2. **Then D17**, as a `CLAUDE.md` §3 decision — it is the whole of Phase 3.
3. **Then Phase 3: `docs/SIMULATOR.md`.**
4. Then Phase 4 (`BUILD_PLAN.md`, which turns P1–P16 into ordered chunks), then Phase 5.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **No code until Seno says "start Phase 5."** Not a scaffold, not a `package.json`, not a type
  sketch on disk. Type definitions inside a design document are fine. Throwaway verification in
  the scratchpad is fine and has precedent — D8's pragma check — but it never lands in the repo.
- **Refresh `docs/CHEATSHEET.md` whenever you update this file at a phase close** (`CLAUDE.md` §9).
  The two files must not overlap: cheatsheet = decisions and their defences; status = where we are.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the
  file. If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
