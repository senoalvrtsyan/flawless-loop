# CHEATSHEET.md — one page, revise-from. Updated at every phase close.
**As of:** 2026-09-03 · end of Phase 2 · full entries: `DECISIONS.md`, `BRIEF_GAPS.md`, `SCOPE.md` §4, `DESIGN.md`

## 1 — Ratified decisions

| # | Chose | Why (one sentence) | Forecloses |
|---|---|---|---|
| **D1** surfaces | Signal + Decision loop real; Workbench sketched = mockup + one read-only component screen ("used in N live ads", live reverse join) | The loop is the brief's stated minimum, and both real surfaces sit on the same two logs so fold + restatement + traceability get built once | Component perf as a *demoed* capability; variant compare UI; versioning as a built flow. Expensive to reverse |
| **T1** triage | Each of 12 blocking findings tagged FIX / SPECIFY / NAME → **FIX 7 · SPECIFY 5 · NAME 0** | Turns blocking findings into costed plan items instead of ambient risk | 8 FIX items is the floor; the 5 SPECIFY findings are defensible as design, not demonstrable as behaviour |
| **D26** depth | All FIX ships; budget pacing reinstated (P11) funded from the data-health panel; traceability at level D in full; approval flow cut, no swap | Everything dropped is on an ordered cut line with a reason, and req #5 traceability was protected | Decision scoring in-product; the human-in-the-loop demo; clone/archive/relaunch — "compounding" stays described |
| **D2** ad model | Recipe over components **+ materialised `config_generations`** | Reuse needs a recipe; Tuesday's conversion needs Tuesday's frozen creative | Nothing significant — it is derived and re-foldable |
| **D5** fold origin | Fold starts at `create_ad` + `launch`; draft edits sit outside the log | Sharper than the brief's own L42 rule, and it makes "the initial state" a real, dated, attributable event | Draft edit history is not auditable (accepted) |
| **D7** storage shape | Log authoritative; `ads`, `config_generations`, rollups are **projections**; **only the replay/apply fn writes one** | The only arrangement where "drop projections, replay, get identical numbers" is a runnable check | Nothing — projections are disposable by construction |
| **D8** persistence | SQLite server-side via **`node:sqlite`** (§5 sign-off of *no new dependency*); Node 24+ pinned | Survives refresh *and* restart with zero deps; flip condition to `better-sqlite3` written down | Client-owned state — passes refresh, fails restart |
| **D9** granularity | Raw retained **+** minute rollups as a rebuildable projection; hours from minutes | "Drill in and check against raw" is the brief's own test, now a runnable one (P14) | Nothing; discarding raw kills traceability and makes restatement lossy |
| **D10** metrics | Rollups store **additive counts only**; every ratio derived at read | Ratios don't aggregate but numerators and denominators do | Nothing; storing ratios is a correctness bug in a performance costume |
| **D11** compaction | None built; policy + what it forecloses written up | Inside a 7-day horizon nothing needs compacting, so it would never fire on camera | Nothing — no information destroyed, which *is* the answer |
| **D12** envelope | `received_at` + `ingest_seq`, **server-assigned at ingest** | Adding them costs two columns; omitting them loses the data permanently | Nothing; emitter-assigned was the trap |
| **D13** lateness | Fixed **72h** horizon, displayed and adjustable; past-horizon arrivals stored + counted, never dropped | P6/P7 need a settlement boundary to mark buckets live / settled / restated | Late events sit outside headline numbers — mitigated by counting and showing them |
| **D14** attribution | Conversion credited to the generation live at the **attributed click's `ts`** | The only rule under which "did the swap help?" is answerable | Ad-time credit (post-swap creative wins a predecessor's windfall); receipt-time credit |
| **D27** bucket placement | Conversion counts land in the **attributed click's minute** (cohort), not its own | Only placement where CPA/ROAS numerator and denominator describe the same population — and the only one where the brief's own "periods you thought were closed" sentence parses | Recognition-time as a pre-aggregated view (still a raw scan away). **Expensive to reverse** |
| **D28** rollup key | `(ad_id, minute_start)`; per-generation numbers by time-join | Looks expensive and isn't — D7 makes re-keying a re-fold, not a migration | Exact per-generation totals from rollups alone; a straddled minute goes wholly to one generation |
| **D29** rollup writes | Incremental upsert **at ingest, same transaction** | Makes normal ingest and restatement literally the same code path | Nothing; a batch sweep would lag the pause demo and race P14 |
| **D30** wire | **Absolute** server-computed bucket rows are the only source of displayed numbers + a capped raw tail; snapshot-then-stream | One implementation of the arithmetic; absolute rows are idempotent, so refresh/reconnect/restatement are one path | Client-side aggregation — deliberately, since it would compare the client to itself |
| **D31** traceability | Signed **server-issued trace descriptor** on every number; replay from raw; on-screen pass/fail | Turns the graded criterion into an assertion the reviewer watches; P12+P13+P14 collapse into one function | Nothing |
| **D32** topology | Simulator is a **separate process** posting batches to `POST /api/ingest` | `received_at` measures nothing if emitter and consumer share a tick | Nothing; both directions are a small change behind one `ingest()` |
| **D33** maturity | Empirical attribution-lag CDF from settled cohorts; **global**, shown with its sample size | Elapsed-fraction understates maturity badly; a labelled histogram is not a forecast | Per-segment maturity — named as a limit, at 12 ads it would be noise |
| **D34** quarantine | Tail frames carry **no summable numerics**; numbers render only via a descriptor-bearing component | Compile-time, not convention — the escape hatch is parsing strings | A "sum the last N events" view would have to use the descriptor path |
| **D20** noise | Fixed statistical bar, adaptive granularity **capped at hour**, then show counts. CTR ≥500 impr · CPA/ROAS ≥10 **conversions** · EWMA 15 min | The bar is about evidence so it stays fixed; the resolution bends; an unreachable bar must not widen the chart to one bar | Sub-minute ratios; confidence intervals (the brief disclaims them) |
| **D22** day boundary | Account timezone **`America/New_York`**; budget = pacing, not a cap | US audiences + a UTC day rolls the budget mid-peak, and we'd spend the demo explaining our own artifact | DST path correct by construction, **untested** in a September window |
| **D3** versioning | **Copy-on-write** (`lineage_id`/`version`/`parent_id`), columns seeded, no editor | Mutate-in-place is the one choice that makes our own history lie, and it can't be undone | Nothing; the write path is defended in prose, not exercised |
| **D4 · D15 · D16 · D18 · D19 · D21 · D23 · D25** | Ad=action / component=analysis · first-write-wins + all deliveries kept · orphans provisional then moved · SSE + `Last-Event-ID` · scoring cut · **two stores, shared envelope** · two slots kept · retractions out of scope, `conversion_void` specified | The cheap block: each is one line of policy that the doc needs and none of them branches the design | Retractions **break** us — named, not hidden |
| **F1 · F2 · U1–U7 · 8 defaults** | `archived` kept-but-unreachable · P16 horizon-shortening not optional · USD, single actor, static audiences, gross value, idempotent decisions, non-negative money, request-time decisions · reverse join by scan, clamp skew, never reject on ad status, `/verify`, `Ad.created_at`+`name` | Scope cuts belong on the cut line, not encoded into domain types; and with one actor, compare-and-swap is a **staleness guard, not a concurrency feature** | Multi-actor concurrency as a claimable feature |

## 2 — The four root-cause gaps

| Root | One line | Answered by |
|---|---|---|
| **G16** no arrival timestamp | Events carry emission `ts` only, so lateness, out-of-order and restatement are all unmeasurable | D12 · P1 |
| **G33** the fold has no origin | "Config = initial state folded over the log" names no event that creates the initial state | D5 · P3 |
| **G01/G18** no config generation, no component link on events | Nothing names "the config of `a_12` on Sunday", so a late conversion can't be credited to the creative that earned it | D2, D14 · P5, P8 |
| **G34/G50** lever set doesn't close the lifecycle | `Ad.status` has states no lever can reach, so "compounding" has no mechanism | D5 (launch), F1 (`archived` named) |

## 3 — Cut line, cheapest to reinstate first

| # | Cut | Reason |
|---|---|---|
| 1 | Decision scoring (before/after windows) | Reads rollups that already exist — cheapest add-back |
| 2 | Data-health panel as a *designed* surface | Counters still computed and rendered plainly; the polish funds P11 pacing |
| 3 | `archive` lever | One variant to a terminal state nothing graded exercises |
| 4 | `variant_group_id` + sibling comparison view | The field is free, the view is not, and the sketched Workbench has no surface for it |
| 5 | `clone_ad` | Needs variant grouping plus a builder flow the sketch doesn't have |
| 6 | Human-in-the-loop approval flow | Most product-like moment in the brief, but proves nothing about the event path Signal is graded on |
| 7 | Component versioning as a built flow | Copy-on-write is a position to defend in prose, not one needing an editor to be right |
| 8 | Compaction of raw events | Nothing to compact in a 7-day horizon; policy stated instead |
| 9 | Multi-currency, portfolio entity, conversion kinds, retraction event | Each buys realism at the cost of a graded criterion; each named as deliberate |
