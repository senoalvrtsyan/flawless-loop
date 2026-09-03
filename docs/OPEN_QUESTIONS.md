# OPEN_QUESTIONS.md

Phase 0 output. Companion to `docs/BRIEF_GAPS.md` — that document is the register of what is
broken; this one is the list of what needs deciding. `G##` references point into it.

Nothing here is decided. A decision becomes real only when it is appended to
`docs/DECISIONS.md` as ACCEPTED, in Seno's words.

---

# §A — Questions for whoever wrote the brief

Seven. These are the ones that genuinely cannot be resolved unilaterally, because the answer is
a fact about the intended system rather than a preference. Everything else is in §B.

| # | Question | Why it can't be answered here |
|---|---|---|
| A1 | Is an arrival/ingest timestamp available from the platform, or are we expected to stamp one at our ingest boundary? | `ts` is defined as *"event time, not arrival time"* (L73) and no arrival field exists. Late-conversion handling — the brief's own flagship requirement — is unimplementable without one, and arrival time is unrecoverable if not captured at ingest. (G16) |
| A2 | Is `attributed_click_id` the click's `event_id`, or a platform `click_id` that was dropped from the `click` variant? | No `click_id` exists anywhere. The naming asymmetry suggests a missing field rather than a deliberate reuse of the dedupe key, and the two readings behave differently when the same click is delivered twice. (G17) |
| A3 | Are `spend` events deltas or cumulative readings, and at what cadence are they emitted? | *"total spend = sum of both"* (L80) implies delta; *"spend ticks"* (L117) implies periodic. Getting it backwards over- or under-states spend catastrophically, and the two choices imply different correctness proofs under at-least-once delivery. (G19) |
| A4 | What creates an ad, and what launches it? Is a create/launch lever intended, or is initial config seeded outside the decision log? | *"current config is derivable: the initial state folded over the decision log"* (L125) is false as written — no action produces the initial state. Either the lever set is incomplete or L42's "config changes only through levers" has an unstated exception. (G33, G50) |
| A5 | `Component.kind` declares `image` and `body_copy`; `Ad` and `swap_component.slot` have no slots for either. Extend `Ad`, or are those kinds forward-looking? | The Workbench prose names images as part of the library it is built around (L111), and the model cannot put one in an ad. (G06) |
| A6 | Should `system:` decisions be proposals a human approves, or do they auto-apply? | Background defines human-in-the-loop as one of eight core concepts (L28), `Decision` supports system actors, and there is no proposed/approved state — so the review step the Background promises cannot occur. (G36) |
| A7 | Which timezone closes a "daily" budget? | `daily_budget_cents` is a windowed quantity and no timezone exists in the model. It determines budget reset, simulator pacing, the diurnal rhythm you say you will inspect (L133), and which day a late conversion's spend lands in. (G04) |

**Not asked, deliberately:** everything the brief explicitly delegates (*"Extend them if your
slice needs it … and call any extension out in your notes"*, L40) — those are §B decisions, not
questions. Asking them back would be refusing the invitation.

---

# §B — Decisions for Seno

25 decisions in four waves, ordered by what blocks what. `[LOAD-BEARING]` = expensive to
reverse, or other decisions depend on it. `[CHEAP]` = changeable later without rework.

**Attention budget:** 14 are load-bearing. Wave 1 (D1–D6) and D12 are the ones I would spend
real time on; the rest mostly fall out once those are set.

---

## Wave 1 — Scope and identity

Blocks every subsequent wave. These define what we are building and what an ad *is*.

---

### DECISION #1 — Which surfaces are built for real [LOAD-BEARING]

> **ANSWERED 2026-09-03 — option A.** Recorded in `docs/DECISIONS.md` with rationale,
> consequences and what it forecloses. The sketch is specified as an annotated mockup **plus one
> read-only component screen showing the reverse join over live data**. Retained below as
> presented, for the record.

**Blocking:** everything. Phase 1 (`SCOPE.md`) cannot start.

**Context**
L129: *"build one or two of the three surfaces for real, and sketch the rest."* L131: whatever
we pick *"must include a live signal path"* — Signal cannot be scoped out, only scoped down.
Signal is also where *"we look hardest at your engineering"* (L115). So the real choice is which
**second** surface joins Signal, and what "sketched" means for the third.

**Options**

**A) Signal + Decision loop.** Workbench sketched.
- How it works: a fixed seeded set of ~8–12 ads with pre-assigned components. Live stream,
  metrics, action console, decision log, scoring. Workbench is annotated mockups plus a
  read-only component library screen.
- Pros: closes the loop the brief demands (L151) with the most depth — signal → decision →
  world responds → scored outcome. Both surfaces share one substrate (the event log and the
  decision log), so effort compounds. Directly serves the two heaviest grading criteria
  (Data & events, Execution).
- Cons: the "one video in twelve ads" question — the most conceptually interesting thing in the
  brief — is answered in prose rather than in product.
- Forecloses: component-level performance as a *demoed* capability; variant comparison in UI.
- Reversal cost: **high**. Adding a real Workbench later means an ad builder, component
  versioning UI, and the reverse-join read path.

**B) Signal + Workbench.** Decision loop sketched.
- How it works: full component library, ad builder, versioning, reverse join, variant model,
  live stream and metrics. Decision loop reduced to a single working `pause` (satisfying L151's
  minimum) plus a decision log view.
- Pros: tackles the richest data-model question (many-to-many with a live read path, versioning);
  strongest Workbench story.
- Cons: the loop barely closes. "Strategist sees a signal, takes an action, the world responds"
  is the deliverable's stated minimum and would be its thinnest part. Also the largest UI build
  of the three options.
- Forecloses: decision scoring, human-in-the-loop, the action console as a product.
- Reversal cost: **high**.

**C) Signal only, built very deep.** Both others sketched.
- How it works: everything goes into the event pipeline — lateness, restatement, watermarks,
  as-of views, traceability walk-through, rollups, compaction.
- Pros: maximum engineering depth on the surface that is graded hardest.
- Cons: violates *"feel like a product, not wireframes"* (L151) and probably fails
  "at least one decision closable in-product" unless a pause button is bolted on anyway.
- Forecloses: the product framing entirely; reads as a data pipeline with a chart.
- Reversal cost: low (it is a subset of A), but the submission would already have been judged.

**Recommendation**
A. The brief's hard deliverable is a closed loop — *"the strategist sees a signal, takes an
action, and the world … responds"* (L151) — and A is the only option where that loop is the
spine of the build rather than a bolt-on. It also concentrates effort: Signal and the Decision
loop are two views over the same two logs, so the persistence boundary, the fold, the
traceability machinery and the restatement path are each built once and serve both. Under time
pressure that shared substrate is worth more than a second UI surface. The Workbench's central
question is a *modelling* question, and a well-argued README section plus an annotated mockup
answers it nearly as well as a screen would — whereas Signal and the Decision loop are
*behaviour* questions, which only a working build can answer. B inverts that trade.

**What I need from you**
Signal + Decision loop for real with Workbench sketched — yes, or do you want the Workbench
built instead?

**Answer:** yes — option A. See `docs/DECISIONS.md` § DECISION #1.

---

### DECISION #2 — Is an ad a frozen bundle or a recipe over components [LOAD-BEARING]

**Blocking:** D3, D4, D14, and the shape of every stored fact.

**Context**
L111 asks this directly: *"What *is* an ad in this system — a frozen bundle, or a recipe over
components?"* The given `Ad` type has already half-answered it: it holds `video_id` and
`headline_id`, i.e. references, i.e. a recipe. But `swap_component` (L99) implies the recipe is
mutable over time, so "the ad's creative" is only well-defined *as of a timestamp* — and nothing
names that (G01, G18).

**Options**

**A) Pure recipe.** `Ad` holds current component ids; history lives in the decision log.
- Pros: matches the given contract exactly; a component edit propagates naturally; smallest
  storage.
- Cons: "what was live at time T" requires folding the log on every query; a component mutated
  in place silently rewrites history.
- Forecloses: cheap historical attribution; makes late-conversion crediting (D14) a fold.
- Reversal cost: medium.

**B) Recipe + materialised config generations.** `Ad` holds current ids; every config change
also closes the current generation and opens a new one — `{ config_generation_id, ad_id,
video_id, headline_id, audience_id, channel, daily_budget_cents, valid_from, valid_to }`.
- Pros: "config as of T" is an indexed lookup, not a fold. Events resolve to a generation at
  ingest, so component-level metrics are a join rather than a replay. Gives the traceability
  view a stable id to link to. Makes late-conversion attribution an explicit choice (D14).
- Cons: a derived table that must be kept consistent with the log; a second thing to get right.
- Forecloses: nothing significant — it is a projection, rebuildable from the log.
- Reversal cost: **low** (it is derived; drop and rebuild).

**C) Frozen bundle.** Each ad snapshots component payloads at launch; edits never propagate.
- Pros: perfect historical fidelity with zero joins; an ad is genuinely immutable evidence.
- Cons: destroys the many-to-many reuse story the Workbench is built on — "used in twelve ads"
  becomes a payload-equality search. Enormous duplication.
- Forecloses: the entire component-reuse premise.
- Reversal cost: **very high**.

**Recommendation**
B. The brief poses this as a binary and the binary is a false one: the *authoring* model is a
recipe (that is what makes reuse and "used in twelve ads" possible) and the *historical* model
must be frozen (that is what makes a Tuesday conversion attributable to Tuesday's creative).
Generations give both — a live recipe plus an immutable, addressable record of every recipe the
ad has ever had. It is also the cheapest of the three to be wrong about, because a generation
table is a projection of the decision log: if the shape is wrong, drop it and re-fold. That
combination — resolves the brief's own question, and is reversible — is exactly what I want
load-bearing under a time-boxed build. C is the option to reject firmly; it is the one that
looks safest and quietly kills the Workbench.

**What I need from you**
Do you accept "recipe for authoring, frozen generations for history", or do you want the pure
recipe with folds on read?

---

### DECISION #3 — Component versioning [LOAD-BEARING]

**Blocking:** D4, the Workbench build, and whether component history is trustworthy.

**Context**
L111 demands this explicitly: *"editing a component forces a versioning decision: mutate in
place (twelve live ads silently change), copy-on-write, or immutable once live. Pick one and
defend it."* The `Component` type has no `version`, `parent_id` or status field, so two of the
three named options are not expressible without an extension (G10, G12).

**Options**

**A) Mutate in place.**
- How it works: editing a component updates `payload`. Every ad referencing it changes.
- Pros: trivial; one row per creative.
- Cons: **retroactively falsifies history** — last week's metrics are now attributed to text
  that did not exist last week. The brief flags this ("twelve live ads silently change") as the
  hazard, and it directly breaks the traceability claim (L143).
- Forecloses: any honest historical analysis.
- Reversal cost: **very high** — the lost history is unrecoverable.

**B) Copy-on-write.**
- How it works: editing a live component creates a new `component_id` in the same lineage
  (`lineage_id`, `version`, `parent_id`). Existing ads keep pointing at the old version; the
  strategist chooses which ads to move via `swap_component`.
- Pros: history intact; the swap is an explicit, logged decision with a rationale — which is
  exactly the model the brief wants ("config changes only via levers"). Lineage gives the
  library a natural grouping ("Hook video, 3 versions").
- Cons: library grows; the UI must group versions or it looks cluttered. "Used in twelve ads"
  needs a stated answer: per version, or per lineage? (Recommend: show both — lineage total,
  version breakdown.)
- Forecloses: nothing.
- Reversal cost: low.

**C) Immutable once live.**
- How it works: components are freely editable while no live ad references them; on first
  live reference they freeze, and further changes require an explicit new component.
- Pros: strongest guarantee; drafts stay ergonomic.
- Cons: needs component status (G12), which needs a reverse join over ad status *and* the
  decision log to compute "has ever been live". Functionally it is B with a friction step.
- Forecloses: nothing.
- Reversal cost: low.

**Recommendation**
B, with lineage fields. Copy-on-write is the only option that keeps every number on screen
traceable to events that were actually produced by the creative in question — which is the
grading criterion (L143), not a nicety. It is strictly better than C because it gets the same
guarantee without needing a computed liveness predicate, and it turns the propagation decision
into a `swap_component` decision with a rationale, which is precisely the levers-only model the
brief asks for. A is disqualified: it is the one choice that makes the app's own history lie,
and it cannot be undone after the fact.

**What I need from you**
Copy-on-write with `lineage_id` / `version` / `parent_id` added to `Component` — approved?

---

### DECISION #4 — What the strategist actually manages [CHEAP]

**Blocking:** Workbench information architecture only. Cheap because it is navigation, not
storage — assuming D2/D3 give us both read paths.

**Context**
L111: *"when components are shared across many ads, what is the unit the strategist actually
manages — the ad, or the component?"* This is an IA question wearing a data-model costume: with
generations (D2) and lineages (D3) both queries are cheap, so this decides what the app is
*about*, not what it can compute.

**Options**

**A) Ad-primary.** The portfolio is a list of ads; components are an inventory you pick from.
- Pros: matches the mental model of "a portfolio of experiments" (L34) and of the Signal
  surface. One list to scan for decisions.
- Cons: buries the reuse insight — you never see that one video is dragging nine ads down.
- Forecloses: nothing structurally.

**B) Component-primary.** The library is home; each component shows its live footprint and
blended performance; ads are instances.
- Pros: directly answers the brief's most interesting question in the UI. Makes creative
  fatigue (a component-level phenomenon, G37) legible.
- Cons: decisions are taken on *ads* (every lever has `ad_id`), so a component-primary UI must
  fan out to N ads for any action — a lever that does not exist (G34) and an action model the
  contract does not support.
- Forecloses: nothing structurally, but it fights the Decision contract.

**C) Dual, with the ad as the decision unit and the component as the analysis unit.**
- Pros: ads are where levers apply (matching `Decision.ad_id`); components are where patterns
  are read. Each view links to the other.
- Cons: two navigation trees; more UI.

**Recommendation**
C, with A as the default landing view. The contract settles this more than the prose does: every
lever carries `ad_id`, so the ad is unavoidably the unit of *action*. But the fatigue and reuse
insights are only visible at the component level, so that is the unit of *analysis*. Saying this
explicitly — "you decide on ads, you learn about components" — is a better answer to the brief's
question than picking one, and it costs nothing beyond a second view. If the Workbench ends up
sketched (D1), this becomes a README paragraph and one mockup.

**What I need from you**
Ad as the decision unit, component as the analysis unit — agreed, or do you want a single
primary?

---

### DECISION #5 — Where the fold starts [LOAD-BEARING]

**Blocking:** D6, D7, D14, and whether the log is self-contained.

**Context**
L125 claims *"current config is derivable: the initial state folded over the decision log"* — but
no action creates an ad, so the fold has no origin (G33), and `draft`/`archived` are unreachable
states (G50). Either the lever set is incomplete or L42 ("config changes only through levers")
has an unstated exception. This is the finding I would raise first with the author (A4).

**Options**

**A) Seed ads into a table out-of-band.** The log holds only post-creation changes.
- How it works: initial configs are fixtures; the log starts at the first `set_budget`/swap.
- Pros: zero extension; fastest to build.
- Cons: L42 is false — there is a config write path that is not a lever. "What is recomputable
  from the event log" (L119), an explicit grading criterion, answers "not the initial config".
  Component history before the first swap is unrecoverable.
- Forecloses: event-sourcing purity; honest "rebuild the world from the log" demos.
- Reversal cost: medium.

**B) Add `create_ad` carrying the full initial config.** One per ad, always first.
- Pros: the log becomes self-contained and L125 becomes literally true. Rebuild-from-log is
  demonstrable.
- Cons: heterogeneous with the other actions (carries a whole config, not a delta); `draft`
  still has no exit.
- Reversal cost: low.

**C) Add `create_ad` **and** `launch` (draft → live).**
- How it works: `create_ad` opens a draft; the draft is freely editable (no events exist yet,
  nothing depends on it); `launch` commits it, sets `launched_at`, and from that moment only
  levers touch config.
- Pros: closes the lifecycle with D6's `archive`; makes `launched_at` a real event rather than a
  field with no writer (G02); and yields a **sharper rule than the brief's own**: config is free
  while draft, lever-only once live. Gives the demo its most product-like moment.
- Cons: two extensions; draft edits are then *not* in the log (acceptable — nothing references
  them), which must be stated.
- Reversal cost: low.

**Recommendation**
C. It resolves the brief's own contradiction rather than working around it, and the restated
rule — *"a **live** ad's config changes only through levers; a draft is just editing"* — is more
precise than L42 and easier to defend in review than either "we ignored the inconsistency" or
"everything including draft edits is an event". It also makes launch a dated, attributable act
with a rationale, which is the moment the bet is placed and therefore the moment the whole
premise (L34) turns on. The cost is two action variants.

**What I need from you**
Add `create_ad` + `launch` as decisions, with draft edits explicitly outside the log — approved?

---

### DECISION #6 — How far to extend the lever set [LOAD-BEARING]

**Blocking:** the Decision loop build, D19, and whether the loop actually closes.

**Context**
L125 names five capabilities: *"pause, reallocate budget, swap a component, spin up a variant,
kill and relaunch."* Three exist. Missing: variant creation (no action, and no variant grouping
— G28) and kill/relaunch (`archived` unreachable — G50). Since audience and channel have no
levers (G09), a variant action is also the *only* way to test a new audience.

**Options**

**A) Build the three that exist; document the rest as cut.**
- Pros: no extension; satisfies L151's minimum (pause alone closes a loop).
- Cons: the "compounding what each ad teaches into the next one" premise (L34) has no mechanism
  in the product. Two named asks visibly unimplemented.
- Forecloses: variant comparison; the full lifecycle.
- Reversal cost: low.

**B) Add `archive` only.** Four actions; lifecycle closed with D5C.
- Pros: cheap; every declared state reachable; "kill" works.
- Cons: no "relaunch", no variant.
- Reversal cost: low.

**C) Add `archive` + `clone_ad`.** `clone_ad` produces a new draft, optionally in the same
`variant_group_id`, with a stated varying slot.
- Pros: closes the loop the premise describes — read a signal, form a hypothesis, launch the
  challenger, compare siblings. Combined with D5C, every state is reachable and every config
  write is a lever.
- Cons: pulls `variant_group_id` onto `Ad` (G28) and adds a comparison view.
- Reversal cost: low-medium (the field is trivial; the view is not).

**D) C + a `Recommendation` entity for human-in-the-loop approval** (G36).
- Pros: `system:fatigue_rule` proposes with evidence, the human approves, events stop. The most
  compelling single demo in the whole brief, and it makes Background's human-in-the-loop real.
- Cons: a second entity plus an approval flow.
- Reversal cost: medium.

**Recommendation**
C if the Decision loop is a built surface, and I would argue hard for D as a stretch. C is the
minimum at which the brief's own premise — the loop *compounds* — is expressible rather than
merely described. D is where the product gets genuinely interesting: an automated rule that
proposes rather than acts, with its triggering evidence attached (see D24), is both the
Background's stated model and the single clearest demonstration that configs, signals and levers
are properly separated. If time is short, cut D before cutting C, and cut the comparison *view*
before cutting `variant_group_id` — the field is free, the view is not.

**What I need from you**
`archive` + `clone_ad` — in or out? And is the `Recommendation` / approval flow worth a stretch
slot?

---

## Wave 2 — Storage and derivation

---

### DECISION #7 — Store the fold, the log, or both [LOAD-BEARING]

**Blocking:** D8, D14, every read path.

**Context**
L125: *"Decide whether you store the fold, the log, or both — and which one the UI reads."*
Given D5 (log has an origin) and D2 (generations), this becomes: which is authoritative, and
what is a rebuildable projection.

**Options**

**A) Log only.** Fold on every read.
- Pros: one source of truth; impossible to diverge; rebuild-from-log is trivially demonstrable.
- Cons: every ad-list render folds N logs. Fine at prototype scale, poor as a stated design.
- Forecloses: nothing.

**B) Fold only.** Mutate an `ads` table; log is an audit trail nobody reads.
- Pros: fastest reads; conventional.
- Cons: the log becomes decorative, and the brief's most interesting property — config is
  derivable — is claimed but never exercised, so a reviewer cannot check it.
- Forecloses: rebuild-from-log; time-travel; honest generations.
- Reversal cost: **high**.

**C) Both, log authoritative.** The log is the source of truth; the `ads` table and the
`config_generations` table are projections, rebuilt by replaying the log. UI reads projections.
- Pros: fast reads, single source of truth, and a **rebuild button is a demoable proof** —
  drop the projections, replay, watch identical numbers come back. That is a direct, checkable
  answer to *"can you trace any number back to the raw events — and do they agree"* (L143).
- Cons: two write paths to keep in step; must be disciplined that nothing writes projections
  except the replay/apply function.
- Reversal cost: low (projections are disposable by construction).

**Recommendation**
C, and I would build the rebuild-from-log path early rather than as a nicety — it is the
cheapest available proof that the model is what we claim, and it doubles as the recovery
mechanism if a projection bug ships. B is the option to reject: it is the conventional choice
and it quietly discards the one property the brief asks us to demonstrate.

**What I need from you**
Log authoritative + rebuildable projections, UI reads projections — approved?

---

### DECISION #8 — Persistence boundary and store [LOAD-BEARING]

**Blocking:** D9, D10, D17, and the "survives a restart" hard requirement.

**Context**
L119: *"Any store earns full credit (Postgres, SQLite, a JSON file, IndexedDB); what we're
grading is that you placed the persistence boundary deliberately and can defend where it sits —
what lives in the client, what lives in the store, and what is recomputable from the event log."*
L151: a refresh must not lose the world, *"ideally across an app restart too"*. The engine
matters less than the boundary; both need deciding, and a new dependency needs ratification
(`CLAUDE.md` §5).

**Options**

**A) SQLite on the server** (`better-sqlite3` or `node:sqlite`); client holds only view state.
- Pros: survives restart trivially; real indexes and real queries over the event log, which the
  aggregation decisions (D9–D11) need; single file, one-command run; synchronous API keeps the
  ingest path simple. Boundary is crisp: server owns all facts, client owns nothing durable.
- Cons: a native or platform dependency; needs a decision under §5.
- Forecloses: nothing.
- Reversal cost: low-medium.

**B) JSON file / append-only NDJSON log on the server.**
- Pros: zero dependencies; the log is literally a file you can `tail`, which is genuinely nice
  for the traceability demo.
- Cons: no indexes — every aggregate is a full scan, so D9 collapses to "rollups in memory" and
  compaction becomes hand-rolled. Concurrent-write and partial-write handling is on us.
- Reversal cost: medium.

**C) IndexedDB in the browser.**
- Pros: no server; survives refresh.
- Cons: the world is per-browser-profile; a reviewer opening a second tab or another machine
  sees a different world. The simulator would have to run in the client, making the "world" an
  artifact of the viewer — which undermines the premise that events arrive *from outside*.
- Forecloses: server-side simulation; multi-client; honest ingest boundary.
- Reversal cost: **high**.

**D) Postgres via Docker.**
- Pros: most production-like.
- Cons: violates *"a repo we can run in one command"* (L151) in spirit; heaviest setup.

**Recommendation**
A. SQLite is the only option that is simultaneously one-command-runnable, restart-durable, and
*queryable* — and queryability is what lets D9–D11 be real decisions rather than "we kept
everything in a Map". The boundary I would state: **server owns every fact** (event log,
decision log, projections); **client owns nothing durable** — it holds a live view built from a
snapshot plus a stream, and a refresh rebuilds it from the server. That is the cleanest thing to
defend, and it makes the mid-demo refresh (L157) a non-event. C is the trap: it passes the
refresh test and fails the premise.

**What I need from you**
SQLite on the server, client stateless — approved, and which driver (`node:sqlite` built-in vs
`better-sqlite3`)?

---

### DECISION #9 — Aggregation granularity [LOAD-BEARING]

**Blocking:** D10, D11, chart read paths.

**Context**
L121: *"Do you keep raw events forever, or roll them into minute- and hour-buckets?"* Volume
depends on D17 (backfill depth, tick cadence) and G19 (spend cadence). Order of magnitude: 10
ads × ~7 simulated days × a few events/second-equivalent is comfortably in the low millions if
we are careless, low hundreds of thousands if we are not.

**Options**

**A) Raw only, aggregate on read.**
- Pros: nothing is lost; every number is trivially traceable; late events need no special
  handling because nothing is precomputed.
- Cons: chart queries scan; slows visibly as history grows.
- Forecloses: nothing.

**B) Rollups only** (minute buckets, hour buckets), raw discarded after a window.
- Pros: fast, bounded.
- Cons: **destroys traceability** — the grading criterion (L143) is that any number walks back
  to raw events, and discarded raw events cannot be walked back to. Also makes late-conversion
  restatement lossy.
- Forecloses: the traceability demo. Disqualifying.

**C) Hybrid: raw retained, rollups maintained incrementally as a projection.**
- How it works: raw events are the source of truth and are never discarded within the
  prototype's horizon; minute-bucket rollups are a rebuildable projection, updated on ingest and
  **corrected** when a late event lands in a closed bucket (D13).
- Pros: fast charts and full traceability. Rollups being a projection means "drill into this
  bucket" is a query over raw events that must agree with the bucket — which is exactly the
  check the brief wants to see, and it is now a *test we can run*, not a claim.
- Cons: two representations; the correction path must be right.
- Reversal cost: low (rollups are disposable).

**Recommendation**
C, with minute as the base bucket and hours derived from minutes. The reason it is right for a
time-boxed slice specifically: the rollup-vs-raw agreement check *is* the deliverable
(*"can you trace any number on screen back to the raw events beneath it — and do they agree"*),
so building both and comparing them is not overhead — it is the feature. B is the option to
reject outright.

**What I need from you**
Raw + minute rollups as a rebuildable projection — approved? Minute the right base bucket?

---

### DECISION #10 — Where CTR, CPA and ROAS are computed [LOAD-BEARING]

**Blocking:** D11, chart read paths.

**Context**
L121: *"Are CTR, CPA, and ROAS computed at write time, derived at read time, or cached somewhere
in between?"* Note these are all **ratios**, which do not aggregate: you cannot sum CTRs across
buckets. Only their numerators and denominators aggregate.

**Options**

**A) Write time.** Store the ratio on each rollup row.
- Pros: read is a select.
- Cons: mathematically wrong to re-aggregate — a chart over 60 stored minute-CTRs cannot produce
  the hour CTR without going back to counts. Also every late event forces a recompute.
- Forecloses: correct multi-bucket aggregation. Effectively disqualifying.

**B) Read time from stored counts.** Rollups store `impressions`, `clicks`, `spend_cents`,
`conversions`, `value_cents`; ratios computed in the query/read model over the summed counts.
- Pros: correct at every granularity by construction; late events only correct counts, and every
  ratio follows automatically. One rule: **store counts, derive ratios.**
- Cons: a division per rendered point (free).
- Reversal cost: low.

**C) Cached read-through.** B plus a memo for hot ranges.
- Pros: marginal speed.
- Cons: a cache invalidation problem in exchange for microseconds, and late events invalidate
  unpredictably.

**Recommendation**
B, stated as a flat rule: **rollups store only additive counts; every ratio is derived at read
time.** This is the single cheapest correctness decision in the document — it makes
"CTR over any window" right by construction, and it means the late-conversion restatement path
only ever has to fix integers. C is premature at this scale; A is a correctness bug wearing a
performance costume.

**What I need from you**
Additive counts stored, ratios always derived — approved?

---

### DECISION #11 — Compaction, and what it forecloses [LOAD-BEARING]

**Blocking:** the README's honest-limits section; retention behaviour under long runs.

**Context**
L121: *"What do you compact away — and what question becomes unanswerable once you have? Say
what you chose and what it forecloses."* The brief wants the *consequence* named, not just the
policy.

**Options**

**A) No compaction.** Retain everything for the prototype's horizon.
- Pros: nothing becomes unanswerable; simplest; honest for a demo whose horizon is days.
- Cons: unbounded in principle; not a "real" answer to the question asked.
- Forecloses: nothing — which is itself the answer.

**B) Compact raw events older than the lateness horizon (D13) into minute rollups; keep rollups
forever.**
- Pros: bounded; the horizon is already the point past which events cannot legitimately change
  anything, so the loss is principled rather than arbitrary.
- Cons: **forecloses**, specifically: (i) per-event drill-down beyond the horizon — the
  traceability walk-through only works on recent data; (ii) re-deriving component-level
  attribution under a *different* rule later (D14), since the raw click→conversion links are
  gone; (iii) recomputing at finer-than-minute granularity; (iv) auditing duplicates and
  lateness distributions historically.
- Reversal cost: **irreversible for compacted data** — this is the one decision in the document
  that destroys information.

**C) Compact raw to minute rollups but retain conversions and clicks forever** (they are rare
compared to impressions).
- Pros: bounded, since impressions dominate volume by orders of magnitude; keeps the
  attribution graph — the thing D14 and the traceability demo actually need — fully intact.
- Cons: drill-down beyond the horizon shows conversions and clicks but only bucketed
  impressions, which must be stated in the UI rather than silently implied.
- Reversal cost: irreversible for impressions only.

**Recommendation**
C, and say so precisely in the README: *"Impressions older than the lateness horizon are
compacted into minute buckets; clicks and conversions are retained in full forever. What this
forecloses: sub-minute impression analysis and per-impression drill-down beyond the horizon.
What it deliberately preserves: the entire click→conversion attribution graph, so any revenue
number remains walkable to its raw facts at any age."* That sentence is the answer the brief is
fishing for, and C is the policy that makes it a *good* answer — it gives up exactly the data
whose loss costs nothing and keeps exactly the data the traceability claim rests on. A is
defensible for a days-long demo but dodges the question. B is the naive version of C and quietly
breaks the drill-down that matters most.

**What I need from you**
Compact impressions past the horizon, retain clicks and conversions forever — approved, or do
you prefer no compaction with the reasoning written up instead?

---

### DECISION #12 — Extend the event envelope with `received_at` and `ingest_seq` [LOAD-BEARING]

**Blocking:** D13, D14, D15, D16, D18, D19, D21, and the flagship late-conversion requirement.

**Context**
The brief defines `ts` as *"event time, not arrival time"* (L73) and provides no arrival field
(G16). Without one, lateness, watermarks, restatement detection, as-of views, reconnect cursors
and the decision-scoring guard are all unimplementable. Arrival time is **not recoverable later**
— if it is not stamped at ingest it is gone permanently. This is the extension I am most
confident about and the one with the shortest window to make.

**Options**

**A) Add `received_at` only** (ISO 8601 UTC, stamped by our ingest boundary, never the emitter).
- Pros: lateness = `received_at − ts` becomes computable and displayable; skew observable (G44).
- Cons: timestamps collide and are not monotonic under bursts, so it is a poor ordering key and
  a poor cursor.

**B) Add `ingest_seq` only** (monotonic integer assigned at ingest).
- Pros: total order, perfect reconnect cursor, deterministic replay.
- Cons: cannot express "3 hours late" to a human.

**C) Both.**
- Pros: `received_at` for human-facing lateness and horizons; `ingest_seq` for ordering, cursors,
  tie-breaks (G22) and as-of replay. Together they make every downstream decision in Wave 3
  implementable.
- Cons: two fields on every event; a documented departure from the given contract.
- Reversal cost: **effectively irreversible if skipped** — data ingested without them cannot be
  retrofitted.

**D) Neither; approximate arrival client-side.**
- Cons: destroyed by the mandatory refresh (L151/L157). A trap.

**Recommendation**
C, and I would treat this as the highest-priority extension in the project. Everything the brief
says it cares most about in Signal — *"conversions … quietly rewrite numbers you thought were
final"* — is a statement about arrival, and the contract cannot express arrival. Note the
asymmetry that makes this urgent: adding these fields costs two columns; omitting them costs the
data permanently, since events already ingested cannot be given an arrival time after the fact.
Under time pressure the right move on an irreversible, cheap, high-value extension is to take it
immediately. This gets a `BRIEF_GAPS` extension entry and a README callout per L40.

**What I need from you**
Add `received_at` + `ingest_seq` to the stored event envelope (server-assigned, never emitter-
assigned) — approved?

---

## Wave 3 — Event correctness

---

### DECISION #13 — Lateness horizon and restatement policy [LOAD-BEARING]

**Blocking:** D14, D19, D11, and every "is this number final" affordance in the UI.

**Context**
L83 and L123 both describe periods being *"thought"* closed and *"quietly"* rewritten; nothing
defines when a period *is* closed (G42). The design goal is to make the rewrite **loud**.
Requires D12.

**Options**

**A) Fixed horizon** (e.g. 72h). A bucket is settled once `now − bucket_end > horizon`; arrivals
beyond it are stored and counted separately but do not alter settled aggregates.
- Pros: explainable in one sentence — exactly the *"well-chosen heuristic, honestly presented
  with its limits"* the brief prefers (L147). Gives decision scoring a hard guard: do not score
  until both windows are settled. Gives the UI three honest states: live / settled / restated.
- Cons: arbitrary constant; genuinely-late events past the horizon are excluded from headline
  numbers (mitigated by counting and displaying them separately).

**B) Dynamic watermark** from observed lateness (p99 of `received_at − ts`).
- Pros: adaptive.
- Cons: harder to explain and to defend; the horizon moves, so "settled" is not stable — a
  bucket can un-settle, which is worse than the problem it solves.

**C) Never close.** Everything permanently restatable, every number carries an as-of stamp.
- Pros: never wrong.
- Cons: nothing is ever final, so decision scoring has no basis and compaction (D11) has no
  trigger.

**Recommendation**
A, at 72h, plus the as-of stamp from C on every displayed number. The horizon should be a
**configurable constant surfaced in the UI**, not buried — a reviewer should be able to see it,
and ideally shorten it during the demo to make restatements happen on camera. Late arrivals
beyond the horizon must be counted and shown ("14 conversions, $2,300, arrived past the horizon
and are excluded from settled totals") rather than dropped: an honest exclusion is a feature, a
silent one is the bug the brief is warning about.

**What I need from you**
Fixed 72h horizon, configurable and displayed, with past-horizon arrivals counted-but-excluded —
approved?

---

### DECISION #14 — Which config generation credits a late conversion [LOAD-BEARING]

**Blocking:** component-level metrics; the honesty of every post-swap number.

**Context**
A conversion arriving Thursday for a Tuesday click, on an ad whose video was swapped Wednesday.
Which creative gets the revenue? Requires D2's generations (G01, G18) and interacts with G30
(the conversion's own `ad_id` may disagree with its click's).

**Options**

**A) Credit the generation live at the conversion's `ts`.**
- Pros: simplest — one timestamp, one lookup.
- Cons: **wrong**. It credits Wednesday's new video for a conversion caused by Tuesday's. Post-
  swap creatives get a windfall from their predecessor, which is precisely backwards for
  evaluating a swap.

**B) Credit the generation live at the **click's** `ts`.**
- Pros: correct causally — the click is what the creative earned; the conversion is its delayed
  consequence. Makes "did the swap help?" answerable.
- Cons: requires resolving the click (parking orphans, D16); a conversion can land in a settled
  bucket, forcing restatement (D13) — which is the machinery we are building anyway.

**C) Credit the generation live at the conversion's `received_at`.**
- Pros: never restates; every number is stable once written.
- Cons: attribution becomes a function of *our infrastructure's* latency. Disqualifying.

**Recommendation**
B, unambiguously, with the rule stated once and applied everywhere: **conversions are credited
to the config generation that was live at the time of the attributed click.** It is the only
choice that makes a swap's effect measurable, which is the entire point of the Decision loop's
scoring, and it forces exactly the restatement path the brief asks us to build. The cost —
retroactive corrections into closed buckets — is a cost we are choosing to pay everywhere else
too (D9, D11, D13), so it is coherent rather than incremental. A is the tempting shortcut and it
silently rewards the wrong creative; C makes attribution depend on our server's speed.

**What I need from you**
Credit at click-time generation, with the restatement it implies — approved?

---

### DECISION #15 — Duplicate conflict resolution [CHEAP]

**Blocking:** ingest correctness. Cheap: a one-line policy plus a counter.

**Context**
L73 says dedupe on `event_id` and does not say what to do when two deliveries share an id but
disagree on payload (G40) — which is also the only channel through which a platform correction
could arrive, since there is no correction event (G43).

**Options**
**A) First-write-wins**, count conflicts. Idempotent; discards corrections.
**B) Last-write-wins by `received_at`**, retain superseded versions. Accepts corrections; needs
the restatement path (which D13 builds anyway).
**C) First-write-wins for aggregates, but persist every delivery** so conflicts are visible and
the choice is reversible.

**Recommendation**
C. Storing all deliveries costs nothing at this volume and turns the policy into something
*demonstrable*: the traceability view can show "delivered 3×, 2 identical, 1 conflicting; we used
the first, here is the one we ignored." That is a much stronger answer to *"name which
misbehaviours your design tolerates"* (L123) than a policy sentence, and it leaves the door open
to switching to B later without data loss.

**What I need from you**
First-write-wins for aggregates, all deliveries persisted and conflicts surfaced — approved?

---

### DECISION #16 — Orphaned conversions [CHEAP]

**Blocking:** ingest; interacts with D14.

**Context**
Unordered delivery (L73) means a conversion can arrive before its click, or its click may never
arrive. No policy exists (G41), and G30 adds that the conversion's own `ad_id` may disagree with
the click's.

**Options**
**A) Drop orphans.** Undercounts revenue silently. Rejected.
**B) Park in a pending table**, resolve when the click arrives, then count. Never wrong; but
revenue is invisible until resolution, and unresolvable orphans vanish.
**C) Count provisionally against the conversion's own `ad_id`**, re-attribute (and restate) once
the click resolves.

**Recommendation**
C, consistent with D14. Never lose revenue silently; make the correction visible. Orphans still
unresolved past the lateness horizon should be surfaced as a data-health figure — "6
conversions, $890, no matching click" — rather than deleted. An unresolvable conversion is a
true fact about the stream and the cockpit should say so.

**What I need from you**
Provisional counting with visible re-attribution, and an orphan health counter — approved?

---

### DECISION #25 — Corrections and retractions [CHEAP]

**Blocking:** nothing. Determines the honesty of the README's tolerated-misbehaviours section.

**Context**
Real platforms reverse conversions (chargebacks, fraud, returns) and credit back spend. The
contract is append-only with no negation (G43), and negative `value_cents` cannot un-count a
conversion (G49). The brief names late attribution as *"the most interesting"* misbehaviour and
asks us to *"name in your notes which others your design tolerates and which would break it"*
(L123) — so this needs a stated position, not necessarily an implementation.

**Options**
**A) Out of scope**, named explicitly as a misbehaviour we do not handle.
**B) Add `{ event: "conversion_void"; voids_event_id }`** — append-only, decrements both count
and value, reuses the D13 restatement path.
**C) Permit negative money with a convention.** Corrupts the conversion count. Rejected.

**Recommendation**
A for the slice, with B specified in the README as the one-event extension that would handle it —
and with the observation that **B is nearly free once D13's restatement machinery exists**. That
observation is worth stating because it argues for building the restatement path *generically*
(a fact changed, recompute affected buckets) rather than special-casing lateness. Worth noting in
the README that retractions are arguably more common in the wild than late attribution, and the
brief does not mention them.

**What I need from you**
Out of scope with B specified — or is the void event worth building as a second handled
misbehaviour?

---

### DECISION #22 — Day boundary and budget enforcement [LOAD-BEARING]

**Blocking:** D17 (simulator pacing), and the diurnal rhythm the brief says it will inspect.

**Context**
`daily_budget_cents` is a windowed quantity with no timezone (G04) and no enforcement (G47).
Both halves need answering: when does the day roll over, and what does the budget *do*?

**Options — day boundary**
**A) UTC everywhere.** One clock; rhythms are explicitly UTC-shaped.
**B) Derived from `Audience.geo`.** Realistic; needs a tz map; cross-audience comparison gets
awkward.
**C) Single account-level timezone.** One knob, defensible ("platforms bill on account time").

**Options — enforcement**
**X) Pacing parameter.** Budget shapes the impression rate; daily spend lands near it. No new
state; mild overspend normal; `set_budget` visibly changes the event rate.
**Y) Hard cap.** Emission stops at the budget, requiring a `budget_exhausted` state distinct
from `paused` — a fifth ad state the contract does not have.
**Z) Display only.** The lever changes nothing observable, which breaks *"the world responds"*
(L151).

**Recommendation**
C + X. One account timezone is a single defensible knob, and pacing is both how real delivery
behaves and the choice that makes `set_budget` *feel* connected — raise the budget, watch the
tick rate rise within a minute. That visible causality is what the deliverable requires of at
least one lever, and it gives us a second closable decision beyond pause for free. Y invents a
fifth state; Z fails the brief.

**What I need from you**
Account-level timezone (which one — UTC or America/New_York?), and budget as a pacing parameter
rather than a hard cap — approved?

---

## Wave 4 — Simulator, transport, presentation

---

### DECISION #17 — Simulator architecture [LOAD-BEARING]

**Blocking:** Phase 3 (`SIMULATOR.md`) entirely.

**Context**
L133: *"Your mock data is itself a design artifact. The shape of the performance data you invent
— its noise, its daily rhythms, its fatigue curves — reveals your model of the domain. We will
look at it."* Four sub-questions, bundled because they interact.

**17a — Process placement**
**A) In-process with the server** (a timer emitting into the ingest function).
- Pros: one command to run; trivial lifecycle; the ingest boundary is still a real function.
- Cons: the "stream comes from outside" story is weaker; a bug can blur emitter and consumer.
**B) Separate process** posting to an ingest endpoint.
- Pros: a genuine boundary; can be killed and restarted mid-demo to show the world persisting
  without it; the ingest API is exercised for real.
- Cons: two processes to orchestrate in "one command".

**17b — Clock**
**A) Wall-clock.** Realistic pacing; a week of history takes a week.
**B) Accelerated** (e.g. 1 simulated hour per real second) with backfill at seed.
**C) Wall-clock live + accelerated backfill at seed.**

**17c — Determinism**
**A) Seeded PRNG**, so a given seed replays an identical world.
**B) Unseeded.**

**17d — Backfill depth at seed:** none / 24h / 7d / 14d.

**Recommendation**
**B / C / A / 7d.** Taking them in turn: a separate process because killing it mid-demo and
showing the accumulated world still intact is the most direct possible answer to *"state survives
a refresh, ideally an app restart"* (L151) — and because it forces the ingest boundary to be a
real API rather than a function call, which is where `received_at` and dedupe live. Wall-clock
live with accelerated backfill because the cockpit must feel live in the room, but a demo needs
history behind it on second one — nobody can watch a fatigue curve form in real time. A seeded
PRNG because deterministic replay makes bugs reproducible and lets me assert on exact numbers in
the traceability check, which is the difference between claiming agreement and testing it. 7d of
backfill because fatigue curves and daily rhythms both need multiple day-cycles to be legible,
and 24h shows neither.

The domain model to encode (worth its own section in `SIMULATOR.md`): diurnal impression curve;
CTR decaying per (component lineage, audience) pair rather than per ad, so a swap visibly resets
it (G37); conversion lag drawn from a long-tailed distribution rather than a constant; spend
pacing against the daily budget (D22); duplicate and out-of-order injection at a configurable
rate; and noise that is multiplicative, not additive, so low-volume ads are appropriately noisy —
which is what makes D20's minimum-sample-size rule earn its place.

**What I need from you**
Separate process, wall-clock live + 7d accelerated backfill, seeded — approved? And is a
"one command" that spawns two processes acceptable to you?

---

### DECISION #18 — Event transport to the browser [CHEAP]

**Blocking:** the Signal read path. Cheap: swappable behind one client module.

**Context**
Server → browser only; the browser never pushes events (levers go over plain HTTP POST). Needs
a reconnect cursor, which D12's `ingest_seq` provides.

**Options**
**A) SSE.** One-directional, native `EventSource`, auto-reconnect built in, `Last-Event-ID`
maps exactly onto `ingest_seq`, plain HTTP.
**B) WebSocket.** Bidirectional, needs a library or manual reconnect/heartbeat logic.
**C) Polling.** Simplest; adds latency and makes "real time" a lie at any comfortable interval.

**Recommendation**
A. The traffic is strictly one-directional, and SSE's `Last-Event-ID` is a reconnect cursor we
otherwise have to build by hand — it lines up with `ingest_seq` so precisely that resume-after-
disconnect is nearly free. WebSocket buys bidirectionality we do not need and costs reconnect
logic we would have to write. Behind a small client interface, this is a two-hour swap if it
disappoints.

**What I need from you**
SSE with `Last-Event-ID` resume — approved?

---

### DECISION #19 — Decision scoring heuristic [CHEAP]

**Blocking:** the Decision loop's log view.

**Context**
L125: *"If you score outcomes, a stated before-window vs. after-window heuristic next to each log
entry is enough."* The subtlety the brief does not mention: without a lateness guard the
comparison is **systematically biased** — the before-window has had longer to accumulate late
conversions than the after-window, so any decision looks worse than it was (G42).

**Options**
**A) Symmetric windows** (e.g. 6h before / 6h after the decision), one primary metric, computed
as soon as the after-window elapses.
- Cons: biased, per above.
**B) A, but withheld until both windows are past the lateness horizon (D13)**, showing "scoring
in 41h" until then.
- Pros: unbiased and *visibly* so; the "pending" state is itself a good demonstration that we
  understand the problem.
- Cons: a demo has to fast-forward or shorten the horizon to show a score.
**C) Full pre/post statistical test.** Explicitly discouraged (L147).

**Recommendation**
B, with the caveat rendered in the UI next to each pending entry ("scoring pending — awaiting
conversion settlement"). The pending state is not a limitation to apologise for; it is the single
clearest signal that the lateness problem was understood rather than merely handled, and it costs
one comparison. Pair with a shortened horizon in demo mode so a score can be produced live. One
metric only — CPA if there is conversion volume, CTR if not — with the choice and its limits
stated beside the number.

**What I need from you**
Symmetric windows, withheld until settled, one metric — approved? Which metric, and what window
size?

---

### DECISION #20 — Separating signal from noise [CHEAP]

**Blocking:** nothing; required by the README (L155).

**Context**
L155 asks *"how you separate signal from noise"*; L147 says a well-chosen heuristic honestly
presented beats an opaque model. Low-volume ads produce wild ratio swings (G46), and multiplicative
simulator noise (D17) will make that vivid.

**Options**
**A) Minimum sample size gate** — suppress or grey out a ratio below N impressions (CTR) or N
clicks (CPA), showing the raw counts instead.
**B) A + smoothing** — trailing window or EWMA on the displayed series, with the raw series still
available.
**C) Confidence intervals** on each ratio. Closest to correct, and closest to the statistical
sophistication the brief disclaims.

**Recommendation**
B. The gate is the honest part — a CTR over 30 impressions is not a number and should not be
drawn as one — and the smoothing is what makes a fatigue trend readable through diurnal noise.
State both constants in the UI and say plainly what they cost: smoothing lags real change, and
the gate hides genuinely new ads. C is the option the brief tells us not to take.

**What I need from you**
Sample-size gate plus a smoothed series with raw available — approved? What minimums?

---

### DECISION #21 — Unified timeline: one log or two [CHEAP]

**Blocking:** the chart annotation path.

**Context**
L125 says a lever *"shows up in the stream"*, but `Decision` is not a member of the `Signal`
union (G35). Meanwhile L143 grades whether *"configs, signals, and levers [are] kept distinct in
your model"*. To draw "budget raised here" on a metrics chart, the two must merge on one axis.

**Options**
**A) Two stores, merged in the read model for display.** Types stay distinct; the merge is a view
concern.
**B) One physical append-only log with a `kind` discriminator**, projected into two logical
streams. One cursor, one order; risks blurring the distinction being graded.
**C) Emit a synthetic `Signal` alongside each decision.** Duplicated state that can diverge.
Rejected.

**Recommendation**
A, with a shared envelope shape (`{ id, ts, received_at, ingest_seq }`) across both so the merge
is mechanical. This satisfies L143 literally — three distinct types in distinct stores — while
making the timeline a sort. B is defensible and slightly cheaper, but it invites exactly the
question we do not want to spend the demo answering.

**What I need from you**
Two stores, shared envelope, merged at read — approved?

---

### DECISION #23 — Image and body_copy slots [CHEAP]

**Blocking:** the Workbench build, if it is built.

**Context**
`Component.kind` declares four kinds; `Ad` has two slots; `swap_component.slot` has two (G06).
Two enum members can be created and used nowhere. Follows D1 — irrelevant if the Workbench is
sketched.

**Options**
**A) Extend `Ad` with nullable `image_id` and `body_copy_id`; extend the slot enum to match.**
Honest to the prose (L111 names images as library content); four slots to build and simulate.
**B) Keep two slots; the two kinds are library-only.** Smallest build; the library visibly shows
inventory that cannot be used.
**C) Drop the two kinds from the enum.** Cleanest model; contradicts the brief's own prose.

**Recommendation**
A if the Workbench is built (nullable, so existing ads stay valid — and the reuse query is
identical for four slots as for two), B if it is sketched. Either way this gets a `BRIEF_GAPS`
entry, because leaving it unremarked reads as not having noticed.

**What I need from you**
Follows D1 — extend to four slots, or keep two and call it out?

---

### DECISION #24 — How we demonstrate traceability [needs a decision]

**Blocking:** nothing structurally, but it is the deliverable most directly tied to the grading
criteria and it shapes what the read model must expose.

**Context**
L143: *"can you trace any number on screen back to the raw events beneath it — and do they
agree?"* L155 requires *"the life of one event: a short trace … following a single conversion
from emission, to stored fact, to aggregate, to pixel."* `CLAUDE.md` §6.5 goes further: *"Build a
way to demonstrate this, not just claim it."*

**Options**

**A) Prose + diagram in the README only.** Satisfies L155's letter; proves nothing.
**B) Click-through drill-down in the UI.** Any number opens a panel listing the exact contributing
raw events, with their `event_id`s, `ts`, `received_at`, lateness, and dedupe status; the panel
re-sums them client-side and asserts agreement with the displayed figure.
**C) B plus a CLI/endpoint `trace <event_id>`** that prints one event's full journey: emission →
stored fact (with dedupe/conflict status) → the buckets it updated → the metrics that changed →
the screen elements affected.
**D) C plus an automated agreement test** — rollups vs raw recomputation across every bucket,
run on demand, reporting any divergence.

**Recommendation**
D, built incrementally: B is a Signal feature and pays for itself during development; C is the
README's "life of one event" made executable rather than narrated; D is a test that turns
*"do they agree"* from a claim into a green check. Together they cost far less than they look
like they cost, because all three read the same projections we already need. This is also the
best answer to the mid-demo refresh (L157): refresh, then re-open the drill-down and show
identical numbers assembled from stored facts.

**What I need from you**
Is the full B+C+D worth the build slot, or should traceability stop at the click-through
drill-down?

---

# §C — Unratified assumptions

Per `CLAUDE.md` §3. Things the recommendations above lean on that have not been ratified. None
block current work; all need sign-off before Phase 2 closes.

| # | Assumption | Blocks nothing yet, needs sign-off before |
|---|---|---|
| U1 | All money is USD; no currency field, no FX (G05). | `DESIGN.md` is finalised |
| U2 | Single user; `actor` is a hard-coded `human:` string with no registry (G27). | the Decision loop is built |
| U3 | Audiences and channels are static reference data; no lever changes an ad's audience or channel (G09). | D6 is answered |
| U4 | One conversion kind; `value_cents` is gross revenue; installs out of scope (G20). | the ROAS metric is built |
| U5 | Decisions are exactly-once and locally originated, idempotent on `decision_id` (G45). | the lever write path is built |
| U6 | Money fields are non-negative integers, enforced at ingest (G49). | the ingest boundary is built |
| U7 | `Decision.ts` is request time; effects are immediate; backdating is rejected (G23). | the fold is built |

---

**Next gate:** none of this proceeds until answers land. Answered decisions are appended to
`docs/DECISIONS.md` in your words, with what each forecloses and a one-line "how I'd defend this
in review". Phase 1 (`docs/SCOPE.md`) starts after D1.
