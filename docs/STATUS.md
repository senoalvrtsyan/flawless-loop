# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-03

---

## Where we are

**Phase 1 (Scope) — CLOSED.** Closed on Seno's instruction to close it out, not on a separate
"approved, continue". `docs/SCOPE.md` is the scope of record.

**No code exists.** Nothing outside `docs/` has been created. Phase 2 has not started;
`docs/DESIGN.md` does not exist.

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register. 52 findings (G01–G52), six passes. 12 blocking, each tagged FIX/SPECIFY/NAME. Options and recommendations are pre-choice analysis, left unedited. **Owes an extensions section** — see "What is owed". |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B 26 decisions in `CLAUDE.md` §3 format, in four waves · §C 7 unratified assumptions. Answered/resolved ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified decisions only. D1, T1, D26, then D2/D5/D7–D14 under "RATIFICATION PASS", then F1/F2 under "FOLLOW-UPS". Each entry carries Seno's verbatim wording; the pass also has a per-decision "Wording of record" table. |
| `docs/SCOPE.md` | **Phase 1 output.** One page: what's real (P1–P16), what's sketched and in what form, what's cut with a one-sentence reason each, ordered cheapest-to-reinstate-first. §2–§4 is the block that goes into the README verbatim. |

## What is ratified

Full entries with rationale, consequences and what each forecloses are in `docs/DECISIONS.md`.
Summarised here only to the depth a cold resume needs.

**Scope**
- **D1 — surfaces.** Signal + Decision loop for real; Workbench sketched as an annotated mockup
  plus one read-only component screen showing the reverse join over live data.
- **T1 — triage of the 12 blocking findings.** FIX / SPECIFY / NAME per finding.
- **D26 — slice depth (A, amended).** All FIX items ship. Budget pacing reinstated as P11, funded
  from the data-health panel, not from traceability. Traceability at D24 level D in full. The
  human-in-the-loop approval flow is cut and does **not** displace click-time attribution.
  Re-affirms D1; its contribution is depth plus an ordered cut line. Buckets now
  **FIX 7 · SPECIFY 5 · NAME 0**.
- Resolved by D26: **D6** (lever set = `create_ad`, `launch`, `pause`, `resume`, `set_budget`,
  `swap_component`) and **D24** (level D, in full).

**Model and storage** — ratified 2026-09-03 as one batch of ten
- **D2** recipe for authoring + materialised `config_generations` for history.
- **D5** the fold originates at `create_ad` + `launch`; draft edits sit outside the log.
- **D7** log authoritative; `ads` and `config_generations` are projections; **nothing writes a
  projection except the replay/apply function**; the UI reads projections.
- **D8** SQLite server-side via **`node:sqlite`** (not `better-sqlite3`); server owns every fact,
  client owns nothing durable. Constitutes the §5 sign-off — of *no new dependency*. Node 24+ is
  the floor, pinned in `engines`/`.nvmrc`. The flip condition to `better-sqlite3` is written down
  in `DECISIONS.md` so it is not a later judgement call.
- **D9** raw retained + minute-bucket rollups as a rebuildable projection, hours from minutes.
- **D10** rollups store only additive counts; every ratio derived at read time.
- **D11** no compaction built; the policy and what it would foreclose are written up instead.
- **D12** `received_at` + `ingest_seq`, server-assigned at ingest, never emitter-assigned.
- **D13** fixed 72h lateness horizon, configurable and displayed, ratified on settlement grounds.
- **D14** conversions credited to the config generation live at the **attributed click's** `ts`.

**Follow-ups**
- **F1** `Ad.status: "archived"` stays in the type, reachable by no lever, named in the README.
  My call, delegated by Seno, taken explicitly; chosen over dropping the enum member so that
  reinstating cut #3 stays a one-variant change.
- **F2** demo-mode horizon shortening is **P16 and not optional** — at the default 72h with 7d
  backfill, no restatement is observable inside a demo. It is a settlement re-evaluation path with
  a control on it, not a config toggle.

## What is open

**12 decisions**, all in `docs/OPEN_QUESTIONS.md` §B with full options and a recommendation.
Nothing there is settled. By wave:

| Wave | Open | Note |
|---|---|---|
| **1 — Scope & identity** (D1–D6) | D3, D4 | D3 component versioning: answered in prose per D1, position still needs ratifying. D4 downgraded by D1 to a README paragraph. |
| **2 — Storage & derivation** (D7–D12) | *none* | Fully ratified. |
| **3 — Event correctness** (D13–D16, D22, D25) | D15, D16, D22, D25 | **D22 is the blocker**: pacing is settled via P11 but the account timezone is unpicked, and P6's bucketing is undefined without it. D15 presumed by P1, D16 by P8. D25 corrections — ratify as "cut, stated". |
| **4 — Simulator, transport, presentation** (D17–D21, D23, D24) | D17, D18, D19, D20, D21, D23 | **D17 is the whole of `SIMULATOR.md`** and blocks Phase 3. D18 presumed by P9. D21 presumed by D7's two-store arrangement. D19 cut by D26, D23 downgraded by D1 — ratify both as "cut, stated". |

**7 unratified assumptions (U1–U7)**, `OPEN_QUESTIONS.md` §C. Two have already passed their gate:

| # | Assumption | Gate | State |
|---|---|---|---|
| U1 | USD only, no currency field, no FX | before `DESIGN.md` is finalised | **due now** |
| U3 | Audiences and channels are static reference data; no lever changes an ad's audience or channel | before D6 is answered — D6 is now resolved | **overdue** |
| U6 | Money is non-negative integers, enforced at ingest | before the ingest boundary is built | due at P1 |
| U5 | Decisions are exactly-once, idempotent on `decision_id` | before the lever write path is built | due at P3 |
| U7 | `Decision.ts` is request time, effects immediate, backdating rejected | before the fold is built | due at P4 |
| U4 | One conversion kind; `value_cents` is gross revenue | before the ROAS metric is built | due at P9 |
| U2 | Single user; `actor` is a hard-coded `human:` string | before the Decision loop is built | due at P10 |

## What is owed

Documentation debt with a named owner and gate, so it is not rediscovered late.

- **`BRIEF_GAPS.md` has no extensions section.** Seven ratified extensions to the given contract
  are currently recorded only as *findings*, which is not the same thing: `received_at`,
  `ingest_seq` (D12), `click_id`, spend-as-fixed-interval-deltas (P2), `create_ad`, `launch` (D5),
  `config_generations` (D2). `CLAUDE.md` §8 and brief L40 both require each to be called out as an
  extension. **Gate: before `DESIGN.md`** — the README's extensions section assembles from it.
- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it.

## Next action

1. **Second ratification pass, before `DESIGN.md`:** D22's account timezone (blocks P6), then
   D15, D16, D18, D21, and assumptions U1, U3, U5, U6, U7.
2. **Write the `BRIEF_GAPS.md` extensions section** (see "What is owed").
3. **Then Phase 2: `docs/DESIGN.md`.**
4. **D17 before Phase 3** — it is the whole of `SIMULATOR.md`. D3, D4, D19, D20, D23, D25 can ride
   along with either pass; most are "cut, stated" confirmations.

## Standing reminders

Rules live in `CLAUDE.md`; these are the two that bite hardest right now.

- **No code until Seno says "start Phase 5".** Not a scaffold, not a `package.json`, not a type
  sketch on disk. Type definitions inside a design document are fine.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the
  file. If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
