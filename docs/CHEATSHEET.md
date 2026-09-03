# CHEATSHEET.md — one page, revise-from. Updated at every phase close.
**As of:** 2026-09-03 · end of Phase 1 · full entries: `DECISIONS.md`, `BRIEF_GAPS.md`, `SCOPE.md` §4

## 1 — Ratified decisions

| # | Chose | Why (one sentence) | Forecloses |
|---|---|---|---|
| **D1** surfaces | Signal + Decision loop real; Workbench sketched = annotated mockup + one read-only component screen (P15, "used in N live ads" reverse join) | The loop is the brief's stated minimum, and both real surfaces sit on the same two logs so fold + restatement + traceability get built once | Component-level perf as a *demoed* capability; variant comparison UI; versioning as a built flow. Expensive to reverse |
| **T1** triage | Each of the 12 blocking findings tagged FIX (build) / SPECIFY (design in README) / NAME (state as tolerated) → now **FIX 7 · SPECIFY 5 · NAME 0** | Turns the blocking set into costed plan items instead of ambient risk | 8 FIX items is the floor; the 5 SPECIFY findings are defensible as design, not demonstrable as behaviour |
| **D26** depth | Option A amended: all FIX ships; budget pacing reinstated as **P11** (budget multiplies the simulator's diurnal event rate), funded from the data-health panel; traceability at **level D** in full (drill-down + **P13** `trace <event_id>` endpoint + **P14** rollup-vs-raw agreement test); approval flow cut, no swap | Re-affirms D1 and adds depth: everything dropped is now on an ordered cut line with a reason, and req #5 traceability was protected | Decision scoring in-product; the human-in-the-loop demo; clone/archive/relaunch/variant compare — "compounding" stays described, not mechanised |
| **D2** ad model | Recipe over components for authoring **+ materialised `config_generations`** (dated, frozen config versions) for history | Reuse needs a recipe, Tuesday's conversion needs Tuesday's frozen creative — generations give both | Nothing significant; it is derived and re-foldable |
| **D5** fold origin | Fold starts at `create_ad` + `launch`; draft edits sit outside the log — config free while `draft`, levers only once `live` | Sharper than the brief's own rule and it makes "the initial state" a real, dated, attributable event | Nothing in the keep-it direction; draft edit history is not auditable (accepted) |
| **D7** storage shape | Decision log authoritative; `ads` + `config_generations` + rollups are **projections**; **nothing writes a projection except the replay/apply function** | Only arrangement where "drop the projections, replay, get identical numbers" is a runnable check (P14) | Nothing — projections are disposable by construction |
| **D8** persistence | SQLite server-side via **`node:sqlite`** (§5 sign-off of *no new dependency*); server owns every fact, client owns nothing durable; **Node 24+** pinned in `engines`/`.nvmrc` | Survives refresh *and* restart with zero deps; the flip condition to `better-sqlite3` is written down, not left to judgement | Client-owned state (rejected on principle: passes refresh, fails restart) |
| **D9** granularity | Retain raw events **+** minute-bucket rollups as a rebuildable projection; hours derived from minutes | "Drill into this bucket" must agree with raw — that is the brief's own check, now a test | Nothing; discarding raw was rejected outright (kills traceability, makes restatement lossy) |
| **D10** metrics | Rollups store **additive counts only**; CTR/CPA/ROAS derived at read time | Ratios don't aggregate but their numerators and denominators do — correct at every granularity by construction | Nothing; storing ratios is a correctness bug in a performance costume |
| **D11** compaction | None built; the policy and what it would foreclose are written up instead | Inside a 7-day horizon there is nothing to compact, so it would never fire on camera | Nothing — no information destroyed, which *is* the answer to the brief's question. Retention unbounded in principle, stated |
| **D12** envelope | Extend events with `received_at` + `ingest_seq`, **server-assigned at ingest, never emitter-assigned** | Adding them costs two columns; omitting them loses the arrival data permanently | Nothing; emitter-assigned was a trap — the mandatory mid-demo refresh would destroy the evidence |
| **D13** lateness | Fixed **72h** horizon, configurable and displayed, + as-of stamp on every number; past-horizon arrivals stored and counted separately, never dropped | Ratified on settlement grounds: P6/P7 need a boundary to mark buckets live / settled / restated | Genuinely-late events sit outside headline numbers — mitigated by counting and showing them |
| **D14** attribution | Conversions credited to the config generation live at the **attributed click's** `ts` | Only rule under which "did the swap help?" is answerable | Ad-time credit (post-swap creative wins a predecessor's windfall) and receipt-time credit (attribution becomes a function of our server latency) |
| **F1** `archived` | Keep `Ad.status: "archived"` in the type, reachable by no lever, named in the README | Unreachable in *our lever set*, not in the domain — an unreachable state is the shadow of a scope cut, not a modelling claim; keeps cut #3 a one-variant change | Nothing; narrowing a quoted contract needs the same README line for less fidelity |
| **F2** demo horizon | **P16** (shortening the horizon re-evaluates which buckets are settled) is a build item and **not optional** | At 72h with 7d backfill, backfill is settled and live data isn't — no restatement is observable in a demo otherwise | Nothing; it is a settlement re-evaluation path, not a config toggle |

## 2 — The four root-cause gaps

| Root | One line | Answered by |
|---|---|---|
| **G16** no arrival timestamp | Events carry emission `ts` only, so lateness, out-of-order and restatement are all unmeasurable | D12 · P1 (ingest boundary) |
| **G33** the fold has no origin | "Config = initial state folded over the log" names no event that creates the initial state, so nothing is recomputable | D5 · P3 (`create_ad` + `launch`) |
| **G01/G18** no config generation, no component link on events | Nothing names "the config of `a_12` as of Sunday", so a late conversion can't be credited to the creative that earned it | D2, D14 · P5, P8 |
| **G34/G50** lever set doesn't close the lifecycle | `Ad.status` has states no lever can reach, so the "compounding" premise has no mechanism | D5 (launch), F1 (`archived` named) |

## 3 — Cut line, cheapest to reinstate first

| # | Cut | Reason |
|---|---|---|
| 1 | Decision scoring (before/after windows) | Reads rollups that already exist — cheapest add-back, least costly to defer |
| 2 | Data-health panel as a *designed* surface | Counters still computed and rendered plainly; the polish is what funds P11 pacing |
| 3 | `archive` lever | One decision variant to a terminal state nothing graded exercises |
| 4 | `variant_group_id` + sibling comparison view | The field is free, the view is not, and the sketched Workbench has no surface for it |
| 5 | `clone_ad` | Needs variant grouping above plus a builder flow the sketch doesn't have |
| 6 | Human-in-the-loop approval flow | Most product-like moment in the brief, but proves nothing about the event path Signal is graded on |
| 7 | Component versioning as a built flow | Copy-on-write is a position to defend in prose, not one that needs an editor to be right |
| 8 | Compaction of raw events | Nothing to compact in a 7-day demo horizon; policy stated instead |
| 9 | Multi-currency, campaign/portfolio entity, conversion kinds, retraction event | Each buys realism at the cost of a graded criterion; each named as deliberate, not silent |
