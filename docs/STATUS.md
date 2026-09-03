# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-03

---

## Where we are

**Phase 0 (Ingest & interrogate) — complete, awaiting sign-off.** No code exists. Nothing outside
`docs/` has been created. Phase 1 has not started; `docs/SCOPE.md` does not exist.

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register. 52 findings (G01–G52) across six passes. 12 blocking, each carrying a FIX/SPECIFY/NAME triage tag in its heading. Options and recommendations are the pre-choice analysis and are left unedited. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B 25 decisions in `CLAUDE.md` §3 format, four waves, ordered by blocking · §C 7 unratified assumptions (U1–U7). |
| `docs/DECISIONS.md` | Ratified decisions only. Currently D1 and TRIAGE #1. |

## What is ratified

**D1 — Which surfaces are built for real: option A.** Signal + Decision loop built for real;
Workbench sketched as an annotated mockup **plus one read-only component screen showing the
reverse join over live data** (a working read path, not a drawing — it rides on plan item P4).
Given up: component-level performance as a demoed capability, and variant comparison in the UI.
Component versioning is answered in prose and defended there. Full entry, with consequences and
what it forecloses, in `docs/DECISIONS.md`.

**TRIAGE #1 — disposition of the 12 blocking findings.** FIX 6 · SPECIFY 6 · NAME 0. The FIX
bucket costs **8 plan items** (P1–P8, listed in `DECISIONS.md`). Three trims were taken to get
there; the one to reinstate first if budget frees up is **G04's budget pacing**, because without
it `set_budget` changes a number without visibly changing the world.

## What is open

**24 decisions, D2–D25.** All still in `docs/OPEN_QUESTIONS.md` §B with full options and a
recommendation. Nothing below is settled.

**Next up — the rest of Wave 1 (D2–D6):**

| # | Title | Tag | Note |
|---|---|---|---|
| D2 | Ad as frozen bundle or recipe over components | LOAD-BEARING | Blocks D3, D14 |
| D3 | Component versioning: mutate / COW / immutable once live | LOAD-BEARING | Answered in prose per D1, but the position still needs ratifying |
| D4 | Unit the strategist manages: ad or component | CHEAP | Downgraded by D1 — now largely a README paragraph |
| D5 | Origin of the fold: `create_ad` + `launch`, or seeded config | LOAD-BEARING | Blocks D7, D14 |
| D6 | Lever set extension: launch, archive, clone/variant, approve | LOAD-BEARING | **Blocks `SCOPE.md`** — see below |

Then Wave 2 (D7–D12, storage and derivation), Wave 3 (D13–D16, D22, D25, event correctness),
Wave 4 (D17–D21, D23, D24, simulator/transport/presentation). D12 (`received_at` + `ingest_seq`)
is the highest-risk item in the whole set — it is cheap to do and **permanently unrecoverable if
skipped**, since events already ingested cannot be given an arrival time afterwards.

**7 unratified assumptions (U1–U7)** in `OPEN_QUESTIONS.md` §C, each with the gate it must clear
before. None block current work.

## Next action

1. Get Phase 0 signed off ("approved, continue").
2. **Answer D2–D6 in one pass.** D6 specifically blocks Phase 1: whether the Decision loop ships
   three levers, four (`archive`), five (`clone_ad`), or a `Recommendation` approval flow is the
   largest single determinant of what the built surface is, and writing `SCOPE.md` around it
   unanswered means rewriting it.
3. Record each answer in `docs/DECISIONS.md` in the `CLAUDE.md` §3 shape — rationale quoted in
   Seno's words, not paraphrased — and mark it answered in `OPEN_QUESTIONS.md`.
4. Then Phase 1: `docs/SCOPE.md`.

## Standing reminders

- **No code until Seno says "start Phase 5".** Not a scaffold, not a `package.json`, not a type
  sketch on disk. Type definitions inside a design document are fine.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the
  file. If it is not written down, ask.
- No decision gets made quietly. Anything with a defensible alternative goes to Seno in the §3
  format, batched 3–6 at a time.
- Every schema extension gets a `BRIEF_GAPS.md` entry, per L40.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
