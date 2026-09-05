# DECISION_DIGEST.md — D1–D73, and what each one forecloses

**One row per ratified decision, carrying the thing `DECISIONS.md`'s index table does not: what it
forecloses.** The brief asks for choices to be explainable, and the half of a choice that is easy to
skip is the half that says what it cost — so this file exists to make that column readable in one
pass. Every row links to the full entry, which carries the options as presented, the rationale in
Seno's words, the consequences and a one-line defence.

**Full entries:** [`DECISIONS.md`](DECISIONS.md). **Nothing here is a summary of a decision** — it
is the decision's *foreclosure* line, compressed. Where the compression would change the meaning,
the original wording is kept.

**"Forecloses: nothing" is not filler.** Forty-eight of the seventy-seven rows below open with it,
and that is the load-bearing observation in this file: the design keeps its expensive choices few
and everything else reversible, and the only way to *show* that rather than assert it is to be able
to point at which rows are which. The twenty-two that **do** foreclose something are marked **▲**
and gathered in [§4](#4--the-twenty-two-that-actually-cost-something).

| | |
|---|---|
| Rows | **77** — D1–D73, plus T1 (a triage pass), F1–F4 (four follow-ups) and D35p (a parameter ratification) |
| Forecloses *nothing* | **48** |
| Forecloses *something* | **22**, marked **▲** |
| Ratified as a block, foreclosure in the block's note | **10**, marked **§** — see the note after §3 |
| Neither (a closure record) | D17 |
| No row | **D6** and **D24** — both resolved by D26 before they were separately answered |

---

## 1 — Scope and the shape of the model

| # | Decision | Chosen | What it forecloses |
|---|---|---|---|
| **D1** ▲ | Which surfaces are built for real | A — Signal deep, decision loop working, Workbench sketched | **Component-level performance as a demoed capability, variant comparison in the UI, and component versioning as a built flow.** With them goes the visible half of the brief's *"compounding what each ad teaches into the next one"* (L34). **Reversal is expensive** — a real Workbench means an ad builder, a versioning UI and the temporal reverse-join read path. |
| **T1** ▲ | Triage of the 12 blocking findings | FIX 7 · SPECIFY 5 · NAME 0 | **8 FIX chunks is the floor without giving up a graded criterion.** Reaching 6 would mean cutting P7 or P8, either of which breaks hard requirement #4. The six SPECIFY findings are answered in prose only: defensible as design, not demonstrable as behaviour. |
| **D26** ▲ | Which slice ships (scope depth) | A, amended | **Decision scoring** (later reinstated by D68), **the human-in-the-loop approval demo**, **`clone_ad` / `archive` / relaunch / variant comparison.** Reversal is cheap in one direction only: everything cut is additive on top of this spine, so the slice can grow and cannot shrink. |
| **D2** | Ad: frozen bundle or recipe over components | B — recipe + materialised generations | Nothing significant; generations are derived. C (frozen bundle) is the option rejected firmly — it looks safest and quietly kills the component-reuse premise. |
| **D4** § | Ad = unit of action, component = unit of analysis | C | Nothing built; it is the framing the reverse join and the fatigue model both rest on. |
| **D5** | Where the fold starts | C — add `create_ad` **and** `launch` | Nothing, in the keep-it direction — which is the point of choosing it. |
| **D3** § | Component versioning model | B, extended — copy-on-write with `lineage_id` / `version` / `parent_id` | The **built** flow, per D1; the three columns ship and are seeded anyway, so the answer is concrete rather than hypothetical. |
| **F1** | Disposition of `Ad.status: "archived"` | Keep it in the type, unreachable, named | **Nothing.** Both directions stay open: reinstating `archive` is one decision variant, dropping the member later is the same edit it is today. |

---

## 2 — Storage, aggregation, attribution and the wire

| # | Decision | Chosen | What it forecloses |
|---|---|---|---|
| **D7** | Store the fold, the log, or both | C — both, log authoritative | Nothing — projections are disposable by construction. |
| **D8** ▲ | Persistence boundary and store | A — SQLite on the server via `node:sqlite` | **Client-side persistence, on principle.** C passes the refresh test and fails the premise: the world becomes an artifact of the viewer's browser profile and the simulator would have to run in the client. |
| **D9** | Aggregation granularity | C — hybrid, raw retained + minute rollups | Nothing. B was rejected outright: discarding raw destroys the traceability criterion (L143) and makes restatement lossy. |
| **D10** | Where CTR, CPA and ROAS are computed | B — read time from stored counts | Nothing. A was effectively disqualified: re-aggregating stored ratios across buckets is arithmetically wrong — a correctness bug wearing a performance costume. |
| **D11** | Compaction | A — none built, C specified | Nothing, in the sense that no information is destroyed — which is itself the answer to the question the brief asks. |
| **D12** | Extend the envelope with `received_at` + `ingest_seq` | C | Nothing. D was a trap: it makes the mandatory mid-demo refresh (L157) destroy the evidence. |
| **D13** ▲ | Lateness horizon and restatement policy | A, amended — 72 h, displayed, adjustable | **Genuinely-late events past the horizon are excluded from headline numbers.** Mitigated by counting and displaying them, because an honest exclusion is a feature and a silent one is the bug the brief warns about. |
| **D14** ▲ | Which generation credits a late conversion | B — the generation live at the **click's** `ts` | A was the tempting shortcut that **silently rewards the wrong creative** — a post-swap creative collecting a windfall from its predecessor, precisely backwards for evaluating the swap. C would make attribution a function of our own server's latency. |
| **D27** ▲ | Which time bucket a conversion's value lands in | B — the click's minute (cohort placement) | **Recognition-time as a pre-aggregated view.** Not as a view at all — raw is retained forever — but nothing in the slice reads it. |
| **D28** ▲ | What the minute rollup is keyed by | A — `(ad_id, minute_start)` | **Exact per-generation totals *from rollups alone*.** Not from raw: a swap at 14:03:27 assigns all of minute 14:03 to one generation, and the exact answer is one raw scan away. |
| **D29** | When the rollup counts are maintained | A — incremental upsert, same transaction | Nothing. C was rejected on demo grounds: a sweep interval is a visible lag between "event arrived" and "number moved", and it makes P14's agreement test race its own writer. |
| **D30** ▲ | The snapshot + stream wire contract | C — absolute per-minute rows | **Client-side aggregation of displayed numbers, deliberately.** The moment the client owns the arithmetic, *"trace the number back and check they agree"* compares the client to itself. |
| **D31** | The traceability anchor | B — `max_ingest_seq` per bucket | Nothing. |
| **D15** § | Duplicate handling | C — first-write-wins, every delivery persisted, conflicts surfaced | Nothing; it is what makes `signal_deliveries` the raw arrival record and feeds the misbehaviour table. |
| **D16** § | Orphaned conversions | C, restated under D27 — provisional counting, visible re-attribution | Nothing; D27-B turned provisional placement into a two-bucket restatement, which is a strengthening rather than a cost. |
| **D18** § | Transport | A — SSE with `Last-Event-ID` = `ingest_seq` | Nothing; D30 builds the payload contract on it. |
| **D21** § | Configs / signals / levers in storage | A — two stores, shared envelope, merged at read | Nothing; this is the answer to `DESIGN.md` §1 and to the brief's own grading criterion. |
| **D25** § ▲ | Retractions | A, B specified — out of scope, `conversion_void` written up | **Refunds, voids and corrections are unrepresentable**, and named as *breaking* rather than tolerated. D27-B forced the restatement path to be generic, so reinstating it is one event type and one apply branch. |
| **D46** | Where window aggregation lives | D — Seno's own option, an amendment to the three offered | **Nothing identified** — which is why the reversal cost is low. What it *spends*: strict A would make a client arithmetic bug impossible, where D makes it **caught on click**. |
| **D47** | The `resnapshot` threshold and cursor | 2,000 rows, plus `max(header, query)` | Nothing structural. If compaction is ever built, the retention floor becomes a *third* resnapshot condition rather than a replacement. |
| **D66** | Where headline window totals come from | C — server-computed, re-asked over `?include=totals` | Nothing identified. The read is additive and opt-in; deleting the debounce leaves option A. |
| **D65** | Does the live viewport advance its leading edge | C — client rolls the window, stream fills it | Nothing identified. The predicate is one comparison and the roll is one timer. |
| **D64** | What a missing bucket draws | A — zero inside the ad's life, `null` before `launched_at` | Nothing. One branch in one function, with the reason in `BUILD_PLAN.md` §14 so a later chunk cannot flip it and call it a tidy-up. |
| **D54** ▲ | What writes `orphan_expired`, and against which clock | A — derived at read; the store holds one unresolved state | **Per-row expiry provenance** — there is no *"declared dead at T"* stamp. Recoverable, and additively so: a stored state can be introduced without unpicking a derived one. |
| **D55** | How `/api/verify`'s rebuild is isolated | A — `TEMP` tables shadowing the real names | Running two verifies concurrently on one connection, and running one across an `await`. Neither is reachable in this build. |
| **D51** | `create_ad`'s `created_at` | B — derived from the decision's `ts` | Nothing structurally. What it *does* foreclose is a **disagreement** between `decisions.ts` and `ads.created_at`, which is the point. |
| **D53** | Does B15 backdate the seeded decisions | B — backdate; `T0` = seeder boot | Nothing that B34 needs. It fixes the *stamping*, not the derivation. |
| **D60** | Where the world seed lives | B — a one-row table, served in `GET /api/sim/world` | **Changing the seed of a running world without reseeding.** That is the point: under A it was possible and untracked. |

---

## 3 — Read side, simulator and the build

| # | Decision | Chosen | What it forecloses |
|---|---|---|---|
| **D20** ▲ | Separating signal from noise | B — fixed bar, adaptive granularity, then stop | **Sub-minute ratios** (nothing needs them) and **confidence intervals** (option C, which the brief disclaims). |
| **D33** ▲ | Basis for the maturity indicator | B — global empirical CDF + sample size shown | **Per-segment maturity, deliberately** — and named as a limit rather than left as an absence. At 12 ads a per-channel curve would itself be noise. |
| **D34** | Raw-tail quarantine mechanism | C, exception named | A future *"sum the last N events"* view would have to go through the descriptor path — which is the correct path anyway. |
| **D67** | How D20's bar is tested across a selection | B at >50% of non-empty points, with (i) | Nothing new — sub-minute ratios and confidence intervals were already foreclosed by D20. `> 50%` is one comparison with a measurable effect, which is the opposite of a foreclosure. |
| **D22** § ▲ | Day boundary and budget enforcement | C + X — `America/New_York` | **The DST path is untested**, stated as a named limit: no DST transition falls inside a September seven-day window, so it is correct by construction and never exercised. |
| **D35** | What creative fatigue accrues to | C — the `(lineage × audience)` pair | Nothing — A and B are C with a coarser key. D was rejected because putting channel in the key would make a burned video *not* pre-fatigued in a new ad on the same audience, which is the property being demonstrated. |
| **D35p** | `served_fraction`, and version reset `r` = 0.35 | Ratified | Nothing. At `r` = 0 a new version is a pure re-edit; at `r` = 1 it is a new creative. Both extremes are one constant away. |
| **D36** | The click→conversion lag distribution | C — two-component mixture, two lags kept apart | Nothing; C degrades to B at `p_fast = 0`. |
| **D37** | Noise and overdispersion | C — all six components | Nothing; setting the AR(1) standard deviations to zero degrades C to B, then to A. |
| **D38** | Backfill arrival semantics | E + B, amended | Nothing. A was rejected because it breaks D12 head-on and every lateness figure would inherit that; C was available and declined, keeping D33 exactly as ratified. |
| **D39** | Volume calibration | B, progress print required | Nothing; volumes are constants in one table. |
| **D40** | Simulator state, config sync, determinism | A + X | Nothing. |
| **D17** | Simulator architecture | Closed in three parts by D32, D35–D40 and the proposal block | Not a foreclosure entry — it is a closure record. Its four sub-questions are answered under the decisions named. |
| **D32** | Simulator topology / where ingest sits | B — separate process, HTTP batch | Nothing. Both directions are a small change behind one `ingest()`; C is rejected outright because two writers destroy the single owner of `ingest_seq`. |
| **D56** ▲ | Where fatigue and novelty enter: λ or `p_ctr` | A — `p_ctr` only | **Modelling platform-side throttling of tired creative** — a poor performer losing *delivery*, not just clicks. Representable here only through `ρ_pacing`, which is a budget mechanism. Named as a limit in `SIMULATOR.md` §20. |
| **D57** ▲ | Demand noise: mean-preserving, at what interval, does κ do anything | A / Δ = 60 s / A | **Modelling a platform whose demand shocks are genuinely mean-inflating.** The honest framing: `base_impr_per_day` is now a *mean* rather than a typical day, and anyone wanting the other reading has to say which of §2.3, §18.3 and D52 they will restate. |
| **D58** ▲ | `ρ_pacing` is path-dependent; §14's restart identity is not | B — sub-second placement made independent of the count | **Even sub-second placement**, and any future claim about intra-second ordering. Also the *strong* determinism story: a restart's catch-up is byte-identical for every event both runs produce, but the two runs may not produce the same **set**. |
| **D59** ▲ | `ρ_catchup` boosts delivery the model has no inventory for | B — ceiling 1.6 → 1.0: throttles, never boosts | **Any demo of an ad *accelerating* to hit its budget.** Reinstating it means taking option C first, because the boost is only honest once budgets are set against spend the model can actually reach. |
| **D61** ▲ | The emitter's boot catch-up window | A — 60 s; the re-emission is the demonstration | **Removing restart duplicates later** without also removing a demo the README points at. |
| **D62** ▲ | The handover contract is one function short | A — conversion is a per-click Bernoulli keyed by `click_id` | **Modelling correlated conversion behaviour within a single tick's clicks.** Reinstating it needs a draw over the tick's population, which is exactly what breaks the handover. |
| **D63** ▲ | Does a paused ad's already-earned conversion still arrive | A — it arrives; pause is a λ rule | **An unambiguous *"after the pause, nothing with `a_12` on it appears"* claim.** Any future read-gate or alert assuming it will be wrong, and the demo narration built on it would have to change with the one-line reverse. |
| **D19** § | Decision scoring | Cut by D26; **reinstated by D68**; window settled by D70 | Nothing now that it is built as `B50a`. |
| **D68** | Do we reinstate cut #1, decision scoring | B — one chunk at the end of stage 5, conditional | Nothing while unbuilt. Once landed it spends the cut line's cheapest remaining insurance, so the next surplus has to buy #2, the data-health panel. |
| **D70** | The scoring window `w`: symmetric or generation-pinned | A — symmetric 6 h, contamination flagged | The pinned variant as *the* answer, but not as an addition: contamination is already detected and generations already joined, so a second column is additive if a reviewer asks. |
| **D71** | Making a score producible live | B — `?window_h=` beside `?horizon_h=` | **Nothing.** Same shape as B49, reverts by deleting a parameter. What it *spends* is one more control on a surface that already carries one. |
| **D23** § | Component slots | B — two slots kept; `image` / `body_copy` library-only | Follows D1: a strategist can create an image and attach it to nothing. Recorded as a `BRIEF_GAPS` entry rather than fixed. |
| **D69** | Who marks a scenario trigger consumed | A — serve-and-mark, at-most-once, flip condition stated | Nothing. The one decision in the file whose reversal was priced before it was taken. |
| **D52** | `daily_budget_cents` for the twelve seeded ads | B — hand-set, two ads near their cap | Nothing. A budget is one `set_budget` away at any time, which is the point of the lever. |
| **D41** | Repo layout and build toolchain | A — single package, Vite for the client only | Nothing. Vite is dev-time; removing the bundler touches `scripts/`, `index.html` and one config file. |
| **D42** | HTTP server | A — `node:http` + a ~40-line router | Nothing. Handler signatures are framework-shaped either way. |
| **D43** | Test runner, and what gets a test at all | A — `node:test`, four pure functions | Nothing. Adding Vitest later is additive and no test written under A would need rewriting. |
| **D44** ▲ | Chart rendering | A — uPlot 1.6.32, pinned exact, behind one wrapper | **Declarative annotation composition** (B's one real advantage): generation boundaries and restatement markers cannot be written as JSX children and must be drawn. |
| **D45** | Styling | A — one plain stylesheet, semantic custom properties | Nothing structurally. Moving to CSS Modules later is per-component and mechanical; the semantic variables survive either way. |
| **D48** | Approval granularity | B — group-gated, chunk-committed, five solo | **Nothing, and that is the argument for it.** Reversible mid-stage; option C would have foreclosed per-chunk history permanently. |
| **D49** | Take the cut line now, or hold it | C — hold; re-decided at the B36 gate, held again | Nothing. Every row stays as droppable as it was; the decision is only *when* to look. |
| **D50** | Where the demo script sits in the order | B — B61 runs `docs/DEMO.md` from B36 | Nothing. B61 still exists and still owns the final ordered pass. |
| **F2** | Demo-mode horizon shortening is a build item | Accepted as P16 | **Nothing.** It incidentally makes the horizon's effect testable — sweep it, assert which buckets change state. |
| **F3** | Scenario control is a plan item | Accepted as P17 | Nothing. One column in `SIMULATOR.md` §21 and a re-seed to change. |
| **F4** | D44/D45 are deferred, not open | Decided | **Nothing** — that is the point of deferring rather than deciding. |
| **D72** | `DEMO_SCRIPT.md` against the tested `DEMO.md` | B — a 15-minute subset alongside it | Nothing. Two files that can drift is the cost, and D72 names which one wins when they do. |
| **D73** | How much of phase 6 goes *in* the README | B — front door + three appendices | Nothing structurally. Each appendix is generated from the shipped artifact, so the duplication is a checkable diff rather than a second opinion. |

**§ — ratified as a block.** D3, D4, D15, D16, D18, D19, D21, D22, D23 and D25 were answered
together in the Phase-2 ratification pass (*"Part 2 as written… Part 3 all fine… Part 4 as a
block"*), so their foreclosure is recorded in that block's note column rather than as a per-entry
section. **D6 and D24 have no row**: both were resolved by D26 before they were separately answered.
Full option analysis for all of them is in [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) §B, waves 1–4.

---

<a id="4--the-twenty-two-that-actually-cost-something"></a>

## 4 — The twenty-two that actually cost something

Every row above marked **▲**, grouped where several decisions foreclose the same thing, because this
is the answer to *"what did you give up?"*

| # | What is now unavailable | Reversal |
|---|---|---|
| **D1 / D26 / T1** | A demoed Workbench: component-level performance, variant comparison, a versioning editor, the human-in-the-loop approval flow | **Expensive** — an ad builder, a versioning UI and the temporal reverse-join read path |
| **D8** | The world surviving in the browser rather than on the server | By design; reversing it fails the premise, not just the test |
| **D13** | Past-horizon events counted in headline numbers | One constant; they are already stored, attributed and displayed separately |
| **D14 / D27 / D28** | Recognition-time as a pre-aggregated view, and exact per-generation totals from rollups alone | Both answerable from raw at any time; neither is destroyed |
| **D20 / D33** | Sub-minute ratios, confidence intervals, per-segment maturity | Cheap; each is a stated limit rather than a missing mechanism |
| **D22** | A tested DST transition | Untestable inside a September window; named rather than claimed |
| **D30** | Client-side aggregation of displayed numbers | Deliberate: it is what makes the traceability check mean anything |
| **D54** | Per-row expiry provenance — a *"declared dead at T"* stamp | Additive; a stored state can be introduced without unpicking a derived one |
| **D56 / D59** | Fatigue costing an ad its *reach*; an ad *accelerating* to hit budget | Both need a supply-side model λ does not have |
| **D58 / D62** | Sub-second ordering claims; correlated conversions within a tick | Both traded for the handover contract that makes a restart re-derivable |
| **D63** | *"After the pause, nothing with `a_12` on it appears"* | One line, but the demo narration built on it changes too |
| **D25** | Refunds, voids and corrections — unrepresentable, and named as *breaking* rather than tolerated | Cheap, and demonstrably so: D27-B forced the restatement path to be generic, so `conversion_void` is one event type and one apply branch |
| **D44** | Declarative annotation composition — generation boundaries and restatement markers must be drawn, not written as JSX children | A library change, priced in D44's flip condition |
| **D57** | A platform whose demand shocks are genuinely mean-inflating | Restating which of §2.3, §18.3 and D52 you are willing to move |

**What is not on this list is the point of it.** Forty-eight decisions foreclose nothing at all,
because the design keeps its expensive choices few: the log is authoritative and every projection is
disposable (**D7**), raw is retained forever (**D9**), ratios are never stored (**D10**), and nothing
is ever compacted away (**D11**). Most of what remains is a constant, a parameter or one branch.
