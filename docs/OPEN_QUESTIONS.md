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

> **ANSWERED 2026-09-03 — option B** (recipe + materialised `config_generations`). Ratified as
> written in the D2/D5/D7–D14 batch. See `docs/DECISIONS.md`. Retained below for the record.

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

> **ANSWERED 2026-09-03 — option C, amended.** `create_ad` + `launch`; draft edits outside the
> log. `archived` is **kept in the type** as a state reachable by no lever and named in the
> README, rather than dropped from the enum. See `docs/DECISIONS.md`.

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

> **RESOLVED 2026-09-03 by D26 — option A.** The lever set is `create_ad`, `launch`, `pause`,
> `resume`, `set_budget`, `swap_component`. `archive` (cut #3), `clone_ad` (cut #5) and the
> `Recommendation` / approval flow (cut #6) are on `docs/SCOPE.md` §4's cut line with reasons.
> Retained below as presented, for the record.

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

> **ANSWERED 2026-09-03 — option C.** Log authoritative; `ads` and `config_generations` are
> rebuildable projections; the UI reads projections. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option A, driver `node:sqlite`.** Server owns every fact; client owns
> nothing durable. Constitutes the `CLAUDE.md` §5 sign-off — of *no new dependency*. Verified on
> the machine: Node v24.14.0, loads unflagged, WAL and manual transactions confirmed. Flip
> condition to `better-sqlite3` recorded in `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option C.** Raw retained, minute-bucket rollups as a rebuildable
> projection, hours derived from minutes. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option B.** Rollups store only additive counts; every ratio is derived
> at read time. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option A, with C specified.** No compaction is built; C is written up
> in the README as the policy we would adopt and what it would foreclose. **The recommendation
> below changed** — it was C, and D26's cut #8 moved it to A. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option C.** Both fields, server-assigned at the ingest boundary, never
> emitter-assigned. Contract extension — gets a `BRIEF_GAPS.md` entry and a README callout per
> L40. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option A, amended.** Fixed 72h horizon, configurable and displayed,
> ratified **on settlement grounds** (the scoring justification lost its consumer when D26 cut
> #1 removed scoring). Demo-mode horizon shortening is **not optional** and is recorded as P16 in
> `docs/SCOPE.md` §2. See `docs/DECISIONS.md`.

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

> **ANSWERED 2026-09-03 — option B.** Conversions are credited to the config generation live at
> the time of the **attributed click**. See `docs/DECISIONS.md`.

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

> **RESOLVED — see `docs/DECISIONS.md` § DECISION #17 · CLOSED.** Closed in three parts: 17a by
> **D32** (separate process, HTTP batch POST), 17c by **D40** (seeded *keyed* RNG; reproducibility is
> seed + decision log + scenario log), and 17b/17d by the Phase 3 proposal block (live at **1× wall
> clock** — an accelerated `ts` would outrun the wall clock and fire I10's clamp on nearly every
> event; backfill **7 days**, 5-day fallback; 1-second tick). The emitter's domain model is D35–D39
> and `docs/SIMULATOR.md`.

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

> **RESOLVED 2026-09-03 by D26 — option D, in full.** Drill-down (P12), `trace <event_id>`
> endpoint (P13) and the rollup-vs-raw agreement test (P14) all ship. The trace endpoint was
> explicitly protected when pacing needed funding, on the ground that it *is* the "life of one
> event" deliverable (L155). Retained below as presented, for the record.

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

### DECISION #26 — Which slice ships (Phase 1 scope depth) [LOAD-BEARING]

> **ANSWERED 2026-09-03 — option A, amended.** Pacing reinstated and funded from the data-health
> panel; trace endpoint kept; the approval flow does **not** displace click-time attribution.
> Recorded in `docs/DECISIONS.md`. Also resolves the residue of D6 and fixes D24 at level D.
> Retained below as presented, for the record.

**Blocking:** `docs/SCOPE.md`.

**Context**
D1 fixed *which surfaces*; it did not fix *depth*. TRIAGE #1 costed the mandatory event work at 8
plan items (P1–P8). Roughly 55% of the build budget is a spine common to every candidate — server
+ SQLite + separate simulator process + SSE (~15%), P1/P2 ingest boundary (~10%), P3/P4 fold and
`ads` projection (~10%), P6 minute rollups (~8%), Signal screen + action console + decision log +
persistence across refresh and restart (~12%). The slices differ in how the remaining ~45% is
spent, and in which graded criterion goes thin if time runs out.

**Options**

**A) Integrity-first** — the 45% goes to event correctness and traceability: P5 generations (8%),
P7 restatement (10%), P8 click-time attribution + orphans (10%), drill-down (8%), trace endpoint
+ agreement test (5%), settlement states + data-health (4%).
- Proves: the brief's hardest ask — *"the stream will misbehave"* — as mechanism, not prose;
  traceability executable rather than claimed.
- Leaves unproven: that the loop compounds. No scoring; `set_budget` changes a number without
  changing the world; human-in-the-loop is prose only.
- Forecloses: scoring, approval flow, variant comparison as demoed capability.
- Reversal cost: **low** — everything cut is additive on this spine.
- Biggest risk: reads as a data pipeline with a chart, which is the criterion (L151, *"feel like
  a product"*) it is thinnest on. Second: P7+P8 is the highest defect-density code in the project
  and also the thing being claimed loudest.

**B) Loop-first** — the 45% goes to the Decision loop as a product: P7 restatement (10%), budget
pacing (6%), scoring withheld until settled (8%), `system:fatigue_rule` proposing with evidence +
`Recommendation` entity + approval UI (14%), drill-down only (7%). Drops P5 and P8.
- Proves: the premise's strongest reading — a portfolio operator with a human in the loop exactly
  as Background L28 defines it; two levers visibly move the world.
- Leaves unproven: which creative earned a late conversion; rollup-vs-raw agreement as a runnable
  check; orphan re-attribution.
- Forecloses: contradicts D1 consequence 3 — generations no longer get built, so component-level
  metrics are not "one join away"; retrofitting means re-resolving ingested events.
- Reversal cost: medium-high for generations.
- Biggest risk: scope creep — the approval flow is a second entity plus a UI plus a rule engine,
  and its 14% is the least reliable number on the page. Not cheaper than A; the same budget spent
  on UI instead of correctness.

**C) Component-truth** — re-opens D1 toward its option B: P5 (8%), P7 (8%), component library +
live reverse join + component-level performance across swaps (15%), `variant_group_id` +
comparison view (8%), drill-down (6%). Decision loop thin.
- Proves: *"one video in twelve ads"* in product rather than prose, including across swaps.
- Leaves unproven: the loop — the deliverable's one non-negotiable would be the thinnest part.
- Forecloses: requires rewriting D1, TRIAGE #1 and the P1–P8 costing before `SCOPE.md` can be
  written; that rewrite is real cost.
- Reversal cost: **high** — largest UI surface of the three.
- Biggest risk: the most expensive slice, not an equal-cost reallocation; highest chance of
  arriving unfinished, and what arrives unfinished is the stated minimum.

**Recommendation**
A, with budget pacing reinstated. A's 45% is back-end work that is deterministic, seedable and
assertable — it can be finished and *proved* finished — where B's 45% is UI and a second entity,
the category that overruns invisibly. So the comparison is not substance versus finishability: A
carries the most engineering substance and has the more reliable estimate. What A costs is demo
charisma, and pacing buys most of that back, because it gives a second lever where the world
visibly responds instead of resting the whole claim on `pause`. Stated plainly: this largely
re-affirms D1 rather than changing course; its value over D1 is fixing depth, putting scoring,
pacing, clone/variant and the approval flow on the cut list explicitly and with reasons.

**What I need from you**
A (with pacing reinstated), B, or C — and if A, is giving up the human-in-the-loop approval demo
acceptable, or should it displace click-time attribution?

**Answer:** A, amended. See `docs/DECISIONS.md` § DECISION #26.

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
| U8 | The store lives at `data/loop.sqlite`, overridable with `DB_PATH` (no design doc specifies a path). | **RATIFIED 2026-09-04 at B02** — `DECISIONS.md` § U8, U9 |
| U9 | `node:sqlite`'s `ExperimentalWarning` is not suppressed; it prints on every run, demo included. | **RATIFIED 2026-09-04 at B02** — `DECISIONS.md` § U8, U9 |

---

**Next gate:** none of this proceeds until answers land. Answered decisions are appended to
`docs/DECISIONS.md` in your words, with what each forecloses and a one-line "how I'd defend this
in review". Phase 1 (`docs/SCOPE.md`) starts after D1.

---

## Wave 5 — Phase 2 design (D27–D32)

Presented 2026-09-03 as the Phase 2 design pass, before `docs/DESIGN.md` was written, on Seno's
instruction: *"Work through it as a sequence of DECISIONs and stop for my answers before writing
the doc — don't write the doc around your own preferences and then ask me to rubber-stamp it."*
All six are answered; full analysis retained here, compressed entries in `docs/DECISIONS.md`.

---

### DECISION #27 — Which time bucket a conversion's value lands in [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option B (cohort/click-time), amended with a per-bucket maturity
> indicator. See `docs/DECISIONS.md` § D27.** Residue: the maturity indicator's basis is D33.

**Blocking:** the rollup schema, the restatement path (P7), what "a closed period moved" means,
and every ROAS/CPA number on screen.

**Context**
D14 settled *which config generation* credits a late conversion — the one live at the attributed
click's `ts`. It did not settle which minute bucket the conversion's count and `value_cents` are
added to; the two are separable. Brief L83: a conversion *"may land hours or days after its
click, retroactively changing periods you thought were closed."* Impressions, clicks and spend
ticks bucket at their own `ts`. A conversion has two candidate times: its own, and its click's.

**Options**

**A) Recognition-time — bucket at the conversion's own `ts`.**
- How it works: `conversions += 1`, `value_cents += v` in the minute of the conversion's `ts`.
- Pros: one rule for all four event types; "revenue booked today" is a rollup read; the current
  window never looks empty.
- Cons: ROAS(T) = revenue recognised in T ÷ spend in T — numerator and denominator describe
  different populations, so the ratio measures nothing. "Did the swap help?" is unanswerable from
  rollups. The restatement it produces reaches back only by the *reporting* delay (hours), not
  the click-to-conversion delay (days), so L83's sentence does not parse: the period rewritten is
  a recent one, not one you thought was closed.
- Forecloses: cohort analysis, per-generation ROAS, and the dramatic restatement demo.
- Reversal cost: **high** — schema change plus a re-fold plus new restatement semantics.

**B) Cohort-time — bucket at the attributed click's `ts`.**
- How it works: on resolution the conversion is credited to the minute containing the click's
  `ts`. A bucket becomes "activity at time T, and everything it eventually earned."
- Pros: numerator and denominator match, so CPA(T) and ROAS(T) are real cohort ratios. Same
  anchor as D14, so one sentence explains both generation credit and bucket placement. A
  conversion arriving now rewrites a bucket from three days ago — exactly L83's scenario and the
  best available restatement demo. `conversions ≤ clicks` holds within a settled bucket.
- Cons: the current window shows ~0 conversions and near-zero ROAS; honest, but needs explaining
  beyond D13's live/settled badge. An orphan (D16) has no click and therefore no bucket.
  "Revenue booked today" stops being a rollup read.
- Forecloses: recognition-time as a *pre-aggregated* view — not as a view at all, since raw is
  retained forever (D9).
- Reversal cost: **high**, same as A.

**C) Dual — store both placements side by side.**
- How it works: the rollup carries `conv_by_click_minute` and `conv_by_conv_minute` as separate
  count/value column pairs.
- Pros: both questions answerable; a cohort/recognised toggle is a good product moment.
- Cons: two sets of counts to restate on every late arrival, so the restatement surface doubles
  and P14 must check both; real risk of the UI showing the wrong one unlabelled.
- Forecloses: nothing.
- Reversal cost: **low** — additive, and re-foldable from retained raw.

**Recommendation**
B. For a slice graded on late conversions handled end to end and on numbers being traceable,
cohort placement is the only placement under which the restatement the reviewer watches is the
restatement the brief describes, and the only one under which the ratio it moves was
arithmetically meaningful. C is the tempting hedge but doubles the restatement surface — the most
delicate path in the build — to answer a question the slice is not graded on and that raw events
answer on demand.

**Flagged before the answer:** under B an orphan has no legitimate bucket, so it must be counted
provisionally at its own `ts` and *moved* on resolution — a two-bucket restatement. The
restatement path therefore has to be generic ("a fact changed, recompute affected buckets")
rather than lateness-specific.

---

### DECISION #28 — What the minute rollup is keyed by [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option A. See `docs/DECISIONS.md` § D28.**

**Blocking:** the rollup DDL, the hot-path index, and whether per-generation numbers are exact.

**Context**
D9 fixed minute as the base bucket; D10 fixed additive counts only. Neither fixed the key. T1
trimmed G18 (stamping `config_generation_id` onto events at ingest) to SPECIFY on the ground that
component-level metrics become a read-time join over `config_generations` by `(ad_id, ts)`. This
decides where that join lands.

**Options**

**A) `(ad_id, minute_start)`.**
- How it works: one row per ad-minute; per-generation numbers come from joining buckets to
  `config_generations` validity intervals by time.
- Pros: smallest table; the hot read (Signal, last N minutes × 8–12 ads) is one index range scan;
  restatement touches one row.
- Cons: a swap at 14:03:27 splits minute 14:03 across two generations and the join must assign
  the whole minute to one — one minute of one ad per swap, an approximation that must be stated.
- Forecloses: exact per-generation totals from rollups alone. Not from raw.
- Reversal cost: **low by construction** — rollups are a rebuildable projection (D7), so re-keying
  is a schema change plus a re-fold, not a migration.

**B) `(ad_id, config_generation_id, minute_start)`.**
- How it works: ingest resolves each event's generation; a straddled minute produces two rows.
- Pros: exact per-generation totals by summation; the swap boundary is representable.
- Cons: partially reinstates work T1 explicitly trimmed — every ingested event needs a generation
  lookup, and a late event must resolve against the generation valid at its `ts`, not at
  `received_at`. Row count multiplies; the hot read stops being a plain range scan.
- Forecloses: nothing.
- Reversal cost: low, same re-fold argument.

**C) A, plus a second generation-keyed rollup for the component screen.**
- Two tables, two restatement paths, two things P14 must check. Not recommended.

**Recommendation**
A. It looks like the expensive decision and is not, which is the defence: D7 makes rollups
disposable, so the small key is not a bet. What makes A right now is that the surface consuming
exact per-generation numbers is the *sketched* Workbench (D1), the component screen is read-only
over ~12 ads, and exactness there is a raw-event scan away.

---

### DECISION #29 — When the rollup counts are maintained [CHEAP]

> **RESOLVED 2026-09-03 — option A. See `docs/DECISIONS.md` § D29.**

**Blocking:** the ingest write path (P1, P6), read latency, and whether restatement is separate code.

**Context**
D9 says rollups exist as a rebuildable projection but not when they are written. This is the
write-time/read-time/cached half of L121, for the *counts*; D10 already answered it for the
*ratios* (read time, always).

**Options**
**A) Ingest-time incremental.** Each accepted event, in the same transaction as its canonical
insert, does `INSERT … ON CONFLICT DO UPDATE` on its bucket. Reads are lookups; a late event is
the identical code path, updating an older bucket and setting `restated_at`. Cons: every write
touches ≥1 rollup row. Reversal: free.
**B) Lazy materialisation with invalidation.** Buckets computed on first read and cached,
invalidated on a late touch. Cons: cache invalidation is the restatement problem solved a second
way. Reversal: free.
**C) Periodic batch sweep.** A tick every N seconds folds new raw rows into buckets. Cons: a
visible lag between "event arrived" and "number moved" — the thing the pause demo needs to be
instant — and it makes P14 racy. Reversal: free.

**Recommendation**
A. Cheap to reverse, so default to simple — and here simple also collapses normal ingest and
restatement into one code path, which is what makes P7 small and P14 meaningful.

---

### DECISION #30 — What crosses the wire: the snapshot + stream contract [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option C. See `docs/DECISIONS.md` § D30.** Residue: structural
> enforcement of the raw-tail quarantine is D34.

**Blocking:** the Signal read path (P9), cold start, reconnect, restatement delivery, backpressure.

**Context**
D18 fixes the transport (SSE, `Last-Event-ID` = `ingest_seq`), not the payload. Cold start with an
empty client and a populated store, and how the UI learns a number changed, are both this
decision. Volume: 8–12 ads at diurnal peak is plausibly a few hundred events/sec.

**Options**

**A) Raw events only; the client aggregates.**
- Pros: the purest reading of L117.
- Cons: the client re-implements bucketing, so two implementations of the arithmetic exist and
  the one on screen is the client's. A disagreement would be invisible — a direct hit on the
  criterion the build is organised around. High frame volume; a long disconnect replays everything.
- Forecloses: a single authoritative implementation of the numbers.
- Reversal cost: low mechanically; the damage is to the central claim.

**B) Server-computed bucket rows only.**
- How it works: frames are absolute bucket rows `{ad_id, minute_start, impressions, clicks,
  spend_cents, conversions, value_cents, settlement, restated_at, as_of_ingest_seq}`. Restatement
  is another row for an older minute. Cold start: `GET /snapshot` returns the window's buckets
  plus the current `ingest_seq`; SSE resumes from that cursor.
- Pros: one implementation of the arithmetic. **Absolute rows are idempotent** — a delta replayed
  after reconnect double-counts, an absolute row does not, which matters because the reviewer will
  refresh mid-demo (L157). Low, coalescible volume.
- Cons: no live raw ticker; drill-down becomes a request (which P12 specifies anyway).
- Reversal cost: low.

**C) B, plus a bounded raw tail on a second frame type.**
- How it works: bucket rows drive every displayed number; a capped tail of recent raw events
  (last N, dropped under burst with a visible "N not shown") drives a live event feed and nothing
  else. Never summed for display.
- Pros: keeps B's single-implementation guarantee while giving Signal events visibly ticking.
  Backpressure gets an explicit answer: the tail drops and says so; bucket rows coalesce per
  `(ad_id, minute)` on a ~250–500 ms flush tick and never drop.
- Cons: two frame types; the quarantine needs enforcing.
- Reversal cost: low.

**Recommendation**
C. B is the correctness core and A is disqualified by it — the moment the client owns the
arithmetic, "trace it back and check they agree" compares the client to itself. The raw tail is
added back deliberately and quarantined: a display of events, never a source of numbers.

---

### DECISION #31 — The traceability anchor [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option B. See `docs/DECISIONS.md` § D31.**

**Blocking:** P12, P13, P14 — and whether traceability is a product feature or a debug affordance.

**Context**
D26 fixed traceability at D24 level D. It did not fix the mechanism by which a number on screen
names the events behind it. Hard requirement #5: *"any number on screen can be walked back to the
raw events underneath it, and the two must agree"* — demonstrated, not claimed.

**Options**

**A) The client builds the drill-down query from its own UI state.**
- Pros: zero server work.
- Cons: nothing binds the drill-down query to the query that produced the displayed number. If
  display and drill-down disagree about, say, conversion placement (D27), they quietly differ —
  and the headline claim is unproven at the moment it is being made.
- Forecloses: the assertion. Reversal cost: low.

**B) A server-issued trace descriptor on every number.**
- How it works: every metric value carries `{metric, ad_id, from, to, placement_rule,
  generation_scope, as_of_ingest_seq}`. Clicking posts it back; the server replays **from raw**
  under exactly that descriptor and returns the recomputed figure plus contributing `event_id`s.
  The UI shows both and asserts equality visibly. P13 is the same function run backwards; P14 is
  the same function swept over every bucket.
- Pros: turns the grading criterion into an on-screen assertion. Three plan items collapse into
  one mechanism. `as_of_ingest_seq` makes "the number moved" demonstrable — re-run the descriptor
  later, get a different figure, attributable to named late events.
- Cons: a small descriptor on every metric payload; one replay function.
- Forecloses: nothing. Reversal cost: low mechanically, but the demo value is lost if deferred.

**C) A named server-side query registry.** Binding by convention rather than construction;
degrades to A the first time someone adds a chart.

**Recommendation**
B. A debug log proves the number to me; an assertion rendered next to the number proves it to the
reviewer, live, on a figure they picked. The descriptor→raw replay function is the one P14 needs
regardless, so building it as a product surface costs the plumbing and nothing else.

---

### DECISION #32 — Simulator topology, and where the ingest boundary sits [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option B, on rationale different from the one recommended. See
> `docs/DECISIONS.md` § D32.**

**Blocking:** the §11 flow diagram, P1's shape, and the honesty of `received_at`.

**Context**
A narrow slice of D17, pulled forward because P1's ingest boundary is designed in `DESIGN.md` and
D12 requires `received_at` / `ingest_seq` to be assigned *at our ingest boundary, never by the
emitter*. The rest of D17 stays for Phase 3.

**Options**
**A) In-process.** A timer inside the server calling `ingest()` directly. One process, no
transport, trivial backpressure. Cons: the boundary is a function call, so `received_at` measures
nothing external; killing the simulator means killing the server. Reversal: low.
**B) Separate process → HTTP `POST /ingest` in batches.** Pros: a real boundary with one owner of
validation, dedupe, `received_at` and `ingest_seq`; killing it mid-demo stalls the stream visibly
and restarting backfills late; backpressure is real and demonstrable. Cons: two processes, kept to
one command by a small zero-dependency spawner. Reversal: low.
**C) Separate process writing to the same SQLite file.** Two writers, WAL contention, and
`ingest_seq` loses its single owner. Rejected.

**Recommendation**
B. (The recommendation as presented also cited `SCOPE.md` §2's promise that the simulator is
independently killable. Seno rejected that citation as circular — see `DECISIONS.md` § D32.)

---

### DECISION #33 — Basis for the per-bucket maturity indicator [CHEAP]

> **RESOLVED 2026-09-03 — option B, global and sample-size-labelled. See `docs/DECISIONS.md` § D33.**

**Blocking:** `DESIGN.md` §5 and the Signal bucket rendering. Residue of D27.

**Context**
D27-B makes a young bucket predictably incomplete rather than merely unsettled. D13's
live/settled/restated states are a binary claim about finality and do not carry the magnitude.

**Options**
**A) Elapsed fraction of the horizon** — `clamp((now − bucket_end) / 72h)`. Zero machinery,
trivially explainable; systematically understates maturity across the whole range anyone looks at,
because attribution lag is heavily front-loaded and the 72h horizon exists to catch a thin tail.
Reports ~8% at six hours where the truth may be ~80%. Reversal: low.
**B) Empirical attribution-lag CDF from our own settled cohorts** — collect
`received_at − click.ts` for resolved conversions in settled buckets (the *observational* lag: how
long until we knew, not how long until the human bought); `maturity(bucket) = CDF(now −
bucket_end)`. Derived from the event stream, needs no disputable constant, correct in shape by
construction, one cached query. It is a histogram, not a model. Needs settled cohorts to exist —
always true with 7d backfill. Reversal: low.
**C) A fixed stated curve** (50% @ 1h, 80% @ 6h, 95% @ 24h, 100% @ 72h) — honest and explainable,
but circular in a demo, since it asserts a curve about a distribution our own simulator generates.
Reversal: low.

**Recommendation**
B, with C named in the README as the cold-start fallback. Cheap to reverse either way, but A is the
simple option and is actively misleading, which disqualifies it on the same honesty grounds D13 was
ratified on.

---

### DECISION #34 — Structural enforcement of the raw-tail quarantine [LOAD-BEARING]

> **RESOLVED 2026-09-03 — option C, with the stream-health exception named. See
> `docs/DECISIONS.md` § D34.**

**Blocking:** `DESIGN.md` §11 and the single-implementation guarantee D30-C rests on.

**Context**
D30-C's correctness argument is that exactly one implementation of the arithmetic exists. "Don't
sum the tail" as a comment does not survive contact with a codebase. The reframing that makes it
enforceable: **raw numbers reach the client only in response to a trace descriptor.** Two raw-event
payload types exist, not one — `TailFrame` (display, unsolicited, pushed) and `TraceEvidence`
(summable, returned only by D31's descriptor replay, and summed precisely so it can be asserted
against the displayed figure).

**Options**
**A) Convention plus code review.** Recorded to say why not: it is the thing that erodes.
**B) Branded numerics.** `type TailCents = number & { readonly __tail: unique symbol }`, not
assignable to the metric arithmetic types. Compile-time and keeps the numbers available; one cast
removes it, and the cast is easy to write and easy to miss. Reversal: low.
**C) Numerics absent from the tail frame.** Money on a `TailFrame` is a pre-rendered display string
(`amount: "$0.42"`), never an integer; and every performance number renders through D31's
descriptor-taking component, which tail data cannot satisfy because it carries no descriptor — so
TypeScript strict rejects it at compile time, with D31's on-screen recompute-and-assert as the
runtime backstop. Summing the tail would require parsing strings, which is ugly enough to be
visible in a diff. Loses client-side locale formatting on the tail. Reversal: low, and deliberately
unpleasant, which is the mechanism.

**Recommendation**
C. It reuses D31 rather than adding a mechanism: the descriptor requirement already exists, and
making it the only door through which summable raw numbers enter the client turns it into the
enforcement point for free.

**Stated exception:** stream-health figures (events/sec, last-event age, frames dropped) *are*
derived from the tail and *are* numbers on screen. They describe the transport, not the ads. The
rule is "no *performance* number is derived from the tail", not an absolute the design does not
hold.

---

## Wave 6 — Phase 3 simulator (D35–D40)

> **ALL RESOLVED — see `docs/DECISIONS.md` § PHASE 3 SIMULATOR PASS.** D35 → C (headline weight kept
> at 0.5) · D36 → C (two lags kept separate) · D37 → C (all six components; collapse-to-one recorded
> as the fallback) · D38 → **E + B, amended** (the seq-order objection turned out to be fixable, and
> working it through found a settlement bug in `DESIGN.md` §5.4) · D39 → B (progress print required;
> seed and sweep both **measured**, not estimated) · D40 → A + X (keyed RNG, `sim_scenarios` table
> approved). The proposal block was ratified as a batch, with scenario control taken as new scope —
> **F3 / P17**. Two parameters remain **unratified** and are flagged inline in `SIMULATOR.md`:
> `served_fraction` (§6) and the version partial reset `r` = 0.35 (§7.3).
>
> This section is kept unedited as the pre-choice option analysis, per `CLAUDE.md` §3.

**Date:** 2026-09-03. Presented before `docs/SIMULATOR.md` is written, on the Phase 3 prompt's
instruction: *"Present the fatigue model, the lag distribution, and the noise model as DECISIONs
with alternatives. The rest you can propose and I'll ratify."*

Six decisions. Three are the ones the prompt names (D35 fatigue, D36 lag, D37 noise). Three more
were surfaced during the read of `DESIGN.md` and `DECISIONS.md` and confirmed as decision-shaped by
Seno rather than chosen by me (D38 backfill arrival semantics, D39 volume calibration, D40 simulator
state and config sync). **D17's residue — clock, backfill depth, seeded RNG — is not a separate
entry here**; per Seno's answer it goes in the propose-and-ratify block at the end of this wave.

Everything in this wave is downstream of decisions already ratified and does not get to re-open
them: **D22** (`America/New_York`), **D32** (separate process, HTTP batch POST), **D12** (envelope
server-assigned, never emitter-assigned), **I1** (spend is a delta per fixed interval), **I3**
(budget is a pacing multiplier, not a cap), **E3** (`click_id` distinct from `event_id`), **G48/I11**
(pause honoured by simulator convention, never by ingest rejection), **D13** (72h horizon),
**D20** (the gate and the granularity ladder), **D33** (the maturity CDF), **G37 option A**
(fatigue is generated as decayed CTR and inferred by the app — the emitter is never authoritative
for something the app is graded on detecting).

---

### DECISION #35 — What creative fatigue accrues to, and its decay function [LOAD-BEARING]

**Blocking:** the centre of `SIMULATOR.md`; the credibility of the whole mock-data artifact.

**Context**
L24 defines fatigue as the core moving-target phenomenon: *"A creative that performed well for two
weeks will often stop working as its audience tires of it."* L133 names *"fatigue curves"* as one of
three things that will be inspected. G37 records that fatigue appears nowhere in the contracts — it
is purely emergent, generated here and inferred by the app. So the accrual key is the single richest
modelling claim in the project, and it is the same question the Workbench asks: is the unit the ad or
the component (**D4**: *"you decide on ads, you learn about components"*).

**Options**

**A) Per ad.** Decay on the ad's own CTR as a function of time since `launched_at`.
- How it works: `φ = φ_floor + (1−φ_floor)·exp(−age_days/τ)`.
- Pros: trivial; one parameter; visible in a week of data.
- Cons: wrong in three ways at once. A swap does not reset it, so `swap_component` — a lever we
  ship — changes nothing observable. Reuse is invisible: the same video in three ads fatigues three
  times independently, at one third the true rate. And it decays while **paused**, which says the
  audience tires of an ad it is not being shown.
- Forecloses: any component-level fatigue story, and with it D4's answer and §8's temporal reverse
  join having anything interesting to show.
- Reversal cost: low in code, total in the data — a demo recorded on A cannot be re-narrated.

**B) Per component lineage, global across audiences.** Accrual keyed by `lineage_id`.
- How it works: cumulative impressions of that lineage anywhere drive one decay curve.
- Pros: reuse becomes visible — a video used in twelve ads burns out twelve times faster; a swap
  genuinely resets the slot. Cheap: one counter per lineage.
- Cons: says a creative is equally tired to an audience that has never seen it. Launching a burned
  video against a fresh audience shows no recovery, which is the opposite of the domain truth.
- Forecloses: the "fresh to a new audience, stale to an old one" property G37 names explicitly.
- Reversal cost: low — it is B with a wider key.

**C) Per (component lineage × audience) pair.** Accrual keyed by `(lineage_id, audience_id)`.
- How it works: **frequency-driven**. `F(L,A)` = cumulative impressions of lineage `L` delivered to
  audience `A`, summed across **every ad** that used the pair. Effective frequency
  `f = F / (est_size × reachable_fraction)`, i.e. average exposures per reachable person. CTR
  multiplier `φ(f) = φ_floor + (1 − φ_floor)·exp(−k·f)`, `φ_floor = 0.25`, `k = 0.35`. Recovery when
  rested: `F ← F·exp(−Δt_idle/τ_rec)`, `τ_rec` = 5-day half-life. Per ad the two slots compose as
  `φ_ad = φ_video^1.0 · φ_headline^0.5` — the video carries most of the burnout, the headline some.
- Pros: every property the domain has. A burned-out video **arrives pre-fatigued** in a brand-new ad
  on the same audience, which is the exact sentence the Phase 3 prompt asks the model to make true,
  and the reason component is the unit of *analysis* while the ad is the unit of *action*. A swap
  resets the swapped slot only, so the CTR discontinuity is explained by `config_generations` and
  nothing else — which is what makes §8's temporal reverse join worth having. Retargeting burns out
  ~50× faster than cold at equal volume **without a separate parameter**, purely because its
  reachable pool is 50× smaller: the frequency denominator does the work. Budget interacts with
  fatigue for free — doubling the budget burns the creative twice as fast, which is a real strategic
  tension the strategist can watch.
- Cons: the accrual key is state the emitter must hold across ads *and* across restarts, which is
  what forces **D40**. Nothing in the app's schema names it, so it is inferable only from the
  event stream — correct per G37-A, but it means the app must earn the inference.
- Forecloses: nothing. A and B are both special cases of C with a coarser key.
- Reversal cost: low in code (the key is one tuple), high in narrative — it is the artifact.

**D) Per (lineage × audience × channel).**
- Pros: strictly more realistic — the same audience on Reels and in Feed are different exposure
  contexts.
- Cons: splits the accrual across up to four keys, so each accrues four times slower and the curve
  is four times less legible in a 7-day window. It also dilutes the one property we are trying to
  demonstrate: with a channel in the key, a burned video is *not* pre-fatigued in a new ad on the
  same audience if the channel differs, and the demo sentence stops being true.
- Reversal cost: low.

**Recommendation**
**C, frequency-driven, with recovery.** It is the only key under which the swap lever, the reuse
premise and D4's ad-versus-component answer are all simultaneously observable in the data rather
than asserted in prose — and it gets retargeting's faster burnout, the budget-versus-burnout
tension, and the pre-fatigued-on-launch property as consequences of one formula instead of three
parameters. Frequency rather than calendar matters specifically because calendar decay fatigues a
paused ad, which is both wrong and would quietly undermine the pause demo; frequency also makes
`set_budget` a fatigue lever, which is a better story than a rate multiplier. For a slice under time
pressure it is the same amount of code as B — one tuple key instead of one string key — and the
whole difference in what the mock data can be read as evidence of.

**What I need from you**
Fatigue accrues to the (component lineage × audience) pair, frequency-driven with a 5-day recovery
half-life, `φ_floor = 0.25`, `k = 0.35`, slots composing as video^1.0 × headline^0.5 — approved? And
is the video/headline weighting right, or should the headline carry none?

---

### DECISION #36 — The click→conversion lag distribution [LOAD-BEARING]

**Blocking:** whether late conversions are demonstrable at all; the shape D33's CDF measures.

**Context**
The brief calls the conversion *"the troublemaker: may land hours or days after its click,
retroactively changing periods you thought were closed"* (L83). D13 fixes the horizon at 72h; D27-B
places a conversion in its click's minute; P16 shortens the horizon so a restatement lands on
camera. All three are machinery whose visible behaviour is a function of this distribution alone.
Two distinct lags exist and the brief conflates them: **purchase lag** (`click.ts → conversion.ts`,
the human decided later) and **reporting lag** (`conversion.ts → received_at`, the platform told us
later). D33 measures their sum.

**Options**

**A) Exponential.** `lag ~ Exp(mean 6h)`.
- Pros: one parameter; memoryless; trivially defensible as a first model.
- Cons: not heavy-tailed. The p99/p50 ratio is fixed at 6.6, so a 3-hour median forces a ~20-hour
  p99 and past-72h arrivals are ~0.001% — the flagship path would essentially never fire on real
  data. Pushing the mean up to produce late arrivals drags the median with it and makes *everything*
  immature, which breaks the live surface instead.
- Forecloses: any independent control of median and tail. The single parameter is the problem.
- Reversal cost: low.

**B) Lognormal.** `lag ~ LogN(μ, σ)`, e.g. median 3h, σ = 1.3.
- Pros: genuinely heavy-tailed; two parameters decouple centre and spread; the standard choice for
  latency and for purchase timing.
- Cons: unimodal, so it cannot represent the real bimodality — the impulse buy minutes after the
  click and the considered purchase three days later are one population under B, and the mass
  between them is overstated.
- Forecloses: making lag a function of audience temperature in a principled way; under B, temperature
  can only shift the whole curve.
- Reversal cost: low.

**C) Two-component mixture — fast exponential + slow lognormal.**
- How it works: with probability `p_fast`, `lag ~ Exp(mean 12 min)`; otherwise
  `lag ~ LogN(median 14h, σ = 1.1)`. **`p_fast` is a property of audience temperature** —
  retargeting 0.65, warm 0.45, cold 0.30 — so the mixture weight carries domain meaning rather than
  being a fitted knob. Truncated at **7 days**; nothing is emitted beyond that.
- Resulting quantiles (warm, `p_fast` = 0.45): **median ≈ 3.5h · p95 ≈ 2.5 days · hard cutoff 7 days
  · ~3.8% of conversions arrive past the 72h horizon.**
- Pros: bimodality is the actual phenomenon, and making `p_fast` a temperature property means a
  retargeting ad's ROAS matures in an hour while a cold ad's takes two days — a *product* statement
  the cockpit can make, not a distribution detail. The three numbers the demo needs fall out at
  once: enough fast mass that the live surface moves, a p95 inside the horizon so headline numbers
  are meaningful, and ~3.8% past-horizon so D13's separate tally is non-zero without dominating.
- Cons: three parameters plus a per-temperature weight; the most machinery of the four.
- Forecloses: nothing.
- Reversal cost: low; it degrades to B by setting `p_fast = 0`.

**D) Weibull with shape k < 1** (decreasing hazard).
- Pros: two parameters, heavy-tailed, and a decreasing hazard is the right qualitative story — the
  longer since the click, the less likely a conversion ever comes.
- Cons: same unimodality objection as B, with less familiarity and no clearer interpretation of its
  parameters in this domain.
- Reversal cost: low.

**Recommendation**
**C**, with a **separate, small reporting lag** applied on top: `LogN(median 90s, σ = 0.9)`, plus a
2% straggler component at `Uniform(2h, 9h)` representing a platform batch. Keeping the two lags
distinct is what makes the model honest under our own definitions — purchase lag is what drives
restatement (it decides which bucket is settled when the event lands), reporting lag is what
`received_at − ts` actually measures, and conflating them would put the entire lateness figure in a
field that is supposed to describe *our* transport. The mixture earns its third parameter by making
lag a consequence of audience temperature, which is the difference between a distribution we chose
and a domain we modelled.

**What I need from you**
Mixture with `p_fast` set by temperature, median ≈ 3.5h, p95 ≈ 2.5 days, hard cutoff 7 days, ~3.8%
past-horizon — approved? And is a separate reporting-lag term worth the extra concept, or should the
two lags be collapsed into one?

---

### DECISION #37 — The noise model and where overdispersion comes from [LOAD-BEARING]

**Blocking:** whether the mock data reads as real; whether D20's gate and EWMA earn their place.

**Context**
The Phase 3 prompt is explicit: *"Don't just add uniform jitter to a smooth curve; that reads as
fake."* The register already anticipated this — D20's own context notes that *"multiplicative
simulator noise (D17) will make [wild ratio swings] vivid"*, and D20's gate exists to protect against
exactly the variance this decision generates. So the question is not how much noise but **what the
noise is a picture of**.

**Options**

**A) Poisson arrivals on the deterministic rate.** `N_t ~ Poisson(λ_t)`.
- Pros: the correct null model for arrivals; zero parameters; variance is not invented.
- Cons: under-dispersed against reality. `Var = mean`, so a 3,000-impression hour varies by ±1.8%
  and every curve looks like the formula that produced it. Worse for the read side: D20's gate and
  the EWMA both become trivially satisfied, so two mechanisms we ship would be defending against a
  problem our own data does not have.
- Forecloses: the gate and the smoothing being demonstrably necessary.
- Reversal cost: low.

**B) Negative binomial — Gamma-mixed Poisson.** `N_t ~ Poisson(λ_t · G)`, `G ~ Gamma(α, 1/α)`,
mean 1, `α = 8`.
- Pros: `Var/mean = 1 + λ/α`, so overdispersion **grows with volume**, which is the empirical
  signature of auction-served traffic. One parameter with a physical reading: `α` is how
  concentrated the latent rate is.
- Cons: the draws are independent across ticks, so the noise is white. Real traffic has *runs* — an
  ad quiet for twenty minutes and then busy — and white noise at minute grain looks like static
  laid over a smooth curve, which is the criticism in a subtler form.
- Forecloses: nothing.
- Reversal cost: low.

**C) B plus an autocorrelated latent demand factor.** Two log-space AR(1) processes multiply the
rate: one per **channel** (`τ` = 45 min, stationary sd 0.18) representing platform-wide traffic and
auction pressure, one per **ad** (`τ` = 20 min, sd 0.25) representing idiosyncratic delivery. Counts
are then negative-binomial around the modulated rate; **clicks are Beta-Binomial**
(`impressions`, `p_ctr`, concentration κ = 200) and **conversions Beta-Binomial**
(`clicks`, `CVR`, κ = 60), so the *rates* are overdispersed too and not just the volumes; **CPC is
lognormal around the channel base with σ = 0.35, scaled by the channel demand factor^0.6**, so
competition raises price and volume pressure together.
- Pros: the noise has a stated **source** in every case — auction competition (channel factor and
  its coupling to CPC), audience composition drift within a targeting segment (Beta-Binomial on the
  rates), platform-side creative rotation (ad factor). Because bursts persist, EWMA smoothing has a
  real lag-versus-variance tradeoff instead of a free lunch, which is what lets us state its limits
  honestly per L147. Correlated bursts across ads on one channel are also what make the ingest
  backpressure path (`DESIGN.md` §11) reachable without a scenario trigger.
- Cons: four processes and five constants — the most complex thing in the simulator after fatigue.
  Autocorrelation makes any statistical assertion in a test wider, so the traceability tests must
  assert on **exact recomputation** rather than on ranges (which is what D31 does anyway).
- Forecloses: nothing.
- Reversal cost: low — set the AR(1) standard deviations to zero and it degrades to B, then to A.

**D) Additive uniform jitter on a smooth curve.** Recorded to say why not: it is the thing the
prompt names, and it is detectable in one glance at a chart — the mean is a visible spline and the
residuals have no structure, no volume dependence and no persistence.

**Recommendation**
**C.** The test the brief is applying is whether the data reveals a model of the domain, and
overdispersion is exactly where that shows: A says arrivals are a Poisson process (defensible, and
visibly not what ad delivery looks like), D says variance is decoration, and only C says *why* the
variance is there — competition, composition drift, rotation — with each source attached to the
quantity it should perturb. It also pays for itself on the read side twice over: it is what makes
D20's gate bind on low-volume ads, and it is what stops the EWMA's limits from being hypothetical.

**What I need from you**
Negative-binomial counts (`α` = 8) modulated by two AR(1) demand factors (channel `τ` 45 min sd
0.18; ad `τ` 20 min sd 0.25), Beta-Binomial click and conversion rates (κ = 200 / 60), CPC lognormal
coupled to channel demand — approved? Any of the four processes you would rather drop?

---

### DECISION #38 — Backfill arrival semantics, and D33's observational lag [LOAD-BEARING]

**Blocking:** whether D33's maturity indicator works at all in the demo. **Amends a ratified
decision**, so it is not mine to settle.

**Context**
**This is a conflict inside the ratified set, not a new question.** D33 measures the maturity curve
as the empirical CDF of `received_at − click.ts` — deliberately the *observational* lag, ratified in
Seno's words as *"how long until we knew, not how long until the human bought"*. `received_at` is
server-assigned at ingest and **never emitter-assigned** (D12, the register's most strongly worded
extension). D17's recommendation backfills 7 days of history at seed, ingested in one burst.

Those three facts cannot all hold. Every backfilled conversion gets `received_at ≈ boot`, so its
measured observational lag is its age — up to 7 days — and the CDF becomes a picture of the seed
loop, spread near-uniformly across the backfill window. `DESIGN.md` §4.5 states the fixed
cold-start curve *"never fires with 7d of backfill"*, which relies on precisely the population that
is corrupted. Left alone, the maturity indicator ships wrong and reads plausible, which is the worst
of the available outcomes.

**Options**

**A) The emitter supplies `received_at` for backfilled events.**
- Pros: one field; the CDF is correct; nothing else changes.
- Cons: breaks D12 head-on, and D12 is the extension the entire late-conversion story rests on. Once
  the emitter can assign arrival times, `received_at` stops being a measurement anywhere and every
  lateness figure inherits that — which is the exact argument D32 was ratified on
  (*"received_at means nothing if the emitter and consumer share a tick"*).
- Forecloses: the honesty of every lateness number in the app.
- Reversal cost: low in code; the credibility loss is not reversible in a review.

**B) Mark backfill and exclude it from lag statistics.** A `source: 'backfill' | 'live'` envelope
field, **server-assigned** at ingest from which path the batch arrived on.
- Pros: keeps D12 and D33 exactly as ratified; the two populations are separable for every purpose,
  not just this one; costs one column.
- Cons: the CDF is then measured over live conversions only, and at demo start there are none — so
  D33's cold-start fallback fires, and `DESIGN.md` §4.5's claim that it never does becomes false.
  For the first hour of a demo the maturity indicator is a stated constant curve rather than a
  measurement, which is the weaker half of D33.
- Forecloses: nothing, but it moves the demo onto the fallback path.
- Reversal cost: low.

**C) Amend D33 to measure emission lag `conversion.ts − click.ts`.**
- Pros: correct for backfilled and live events alike, because both timestamps are simulated;
  measurable from second one; simplest.
- Cons: it measures the *purchase* lag, and D33 chose observational lag on purpose. Maturity would
  then understate how much is still unknown, because it ignores reporting delay entirely — the
  smaller term here, but the one that belongs to us.
- Forecloses: the "how long until we knew" framing Seno ratified.
- Reversal cost: low.

**D) Split the measure and convolve.** Purchase-lag CDF over all conversions (valid for backfill),
reporting-lag CDF over live only, maturity = the convolution.
- Pros: keeps D33's total-observational-lag intent while letting backfill contribute the part it can
  legitimately contribute.
- Cons: the most machinery, and it puts a convolution inside a feature the brief's L147 disclaimer
  says should be a simple honest heuristic.
- Reversal cost: low.

**E) The seeder writes historical arrival times; the emitter never does.** Reframes the actor:
`DESIGN.md` §3.2 already has a privileged **seeder** that writes `components`, `audiences` and the
`create_ad`/`launch` decisions directly. Backfill is a fixture, not an emission — so the seeder
stamps `received_at = ts + a drawn reporting lag` for historical rows, and D12's rule continues to
govern the emitter at the ingest boundary, which is a different actor with a different job.
- Pros: D33 and `DESIGN.md` §4.5 both stay true as written; the CDF is measurable at demo start over
  a realistic population; no amendment to a ratified decision. Combined with B's marker the two
  populations stay separable, so the sample-size label can be honest about provenance —
  *"measured over 1,432 settled conversions (1,180 seeded)"*.
- Cons: the backfill's arrival times are **designed rather than observed**, and that must be said
  plainly in the README or it is the same dishonesty as A wearing better clothes. It also puts a
  second writer of `received_at` in the codebase, which needs the seeder to be visibly a fixture
  path and not a general capability.
- Forecloses: nothing.
- Reversal cost: low.

**Recommendation**
**E combined with B** — the seeder stamps a drawn reporting lag on historical rows, the ingest
envelope carries a server-assigned `source` marker, and the maturity CDF is computed over both
populations while the label discloses how much of it is seeded. It is the only option under which
no ratified decision has to be amended and the indicator is a measurement from the first frame; the
`source` marker is worth its column independently, because "is this number resting on seeded or
observed data" is a question a reviewer will ask about more than the CDF. The cost is one sentence
of disclosure, which is cheaper than any of the alternatives' costs.

**What I need from you**
Seeder-stamped arrival times for backfill plus a server-assigned `source` marker, with the CDF
labelled to disclose the seeded share — approved? Or would you rather amend D33 to purchase lag (C)
and keep exactly one writer of `received_at`?

---

### DECISION #39 — Volume calibration: what scale the portfolio runs at [LOAD-BEARING]

**Blocking:** every parameter value in `SIMULATOR.md`; the seed's row count and boot time.

**Context**
The parameters are not free — **D20 already pinned them.** Its gate is ≥ 500 impressions per plotted
point for CTR and ≥ 10 **conversions** per plotted point for CPA/ROAS, with the granularity ladder
capped at **hour** and counts shown instead past that. Read backwards, that is a volume requirement:

| To draw | Needs per point | At hour granularity that is |
|---|---|---|
| CTR at minute | 500 impressions/min | 720k impressions/day/ad — not a real advertiser |
| CTR at 15 min | 500 impressions/15 min | 48k impressions/day/ad |
| **CTR at hour** | 500 impressions/hour | **12k impressions/day/ad** |
| **CPA/ROAS at hour** | 10 conversions/hour | **12,500 impressions/hour** at CTR 2% × CVR 4% — i.e. **300k/day/ad** |

The second line is the crunch: cohort ratios need three orders of magnitude more traffic than CTR,
unless CTR × CVR is much higher — which is exactly what **retargeting** is. At CTR 4.2% × CVR 15%,
10 conversions/hour needs only ~1,600 impressions/hour, or **40k/day**. So the ad on which per-ad
hourly CPA/ROAS is drawable is a retargeting ad, for a domain reason rather than a demo reason.

Against that, every impression is a row: 7 days × 12 ads at high volume is millions of events to
generate, POST, ingest, roll up and re-sum in P14's agreement test, all inside *"run in one command"*.

**Options**

**A) Uniform realistic-small volumes, ~10–20k impressions/day/ad.**
- How it works: 12 comparable ads; ~450k backfilled events at 7 days.
- Pros: cheapest seed (~20s); most defensible as "what a mid-market advertiser looks like".
- Cons: CTR is drawable at hour only, and CPA/ROAS is **never** drawable per ad — the cohort ratios
  exist solely at portfolio roll-up. The demo's most interesting metric family is a counts display
  for its whole duration.
- Forecloses: showing D27-B's cohort ratios per ad at all.
- Reversal cost: low, but it is a re-seed.

**B) Asymmetric portfolio, calibrated against D20's gates deliberately.**
- How it works: one **retargeting** ad at ~40k impressions/day sits *on* the 10-conversion boundary
  at hour granularity, so the gate visibly binds and unbinds across the diurnal cycle. One
  high-volume **cold** ad at ~45k/day clears CTR at 15-minute granularity. The remaining ten run
  8–25k/day and honestly show counts where the bar is unreachable. **Launch dates are staggered** —
  three ads live the full 7 days, the rest launched 1–4 days ago — which cuts the row count and, more
  importantly, puts ads at different points on their fatigue and novelty curves *at one moment*, so
  the fatigue story is legible in a single screenshot instead of requiring a time-travel narrative.
- Budget: ~960k backfilled impressions + ~19k clicks + ~1.2k conversions + ~68k spend ticks ≈
  **1.05M events**, ~40–60s of seeding. Fallback lever if that misses: **5 days instead of 7**
  (~700k events, ~30s), which still exceeds the 72h horizon so nothing about settlement changes.
- Pros: the gate is *demonstrated* rather than merely built — a reviewer sees one chart drawing a
  ratio, another saying "not enough conversions yet, here are the counts", and the difference
  explained by volume. Both D20 branches fire on camera. Different ad ages make fatigue and novelty
  simultaneously visible.
- Cons: the portfolio is shaped partly by what the read side needs, which must be disclosed rather
  than presented as an independent domain observation. Heaviest seed of the three affordable options.
- Forecloses: nothing.
- Reversal cost: low; the volumes are constants in one table.

**C) Inflate everything so every gate clears everywhere, ~300k/day/ad.**
- How it works: ~15M backfilled events.
- Pros: every chart draws every ratio.
- Cons: minutes of boot time against a stated one-command deliverable, and it **hides the
  mechanism** — D20's gate, its ladder and its counts fallback would all be dead code in front of
  the reviewer. It also implies a $28k/day account, which is a claim about the customer we have no
  reason to make.
- Forecloses: any demonstration of the gate.
- Reversal cost: low in code, expensive in boot time on every restart.

**Recommendation**
**B.** D20 is already ratified, so the only question left is whether the data lets it be seen
working, and a portfolio where every bar clears would make our own noise-handling invisible while a
portfolio where none clears would make the cohort ratios invisible. B is also the version that is
*more* realistic rather than less: real accounts are asymmetric, retargeting really is the
low-volume high-conversion-rate segment, and ads really do have different ages. The one thing to
disclose is that the retargeting ad's volume was chosen to sit on the gate boundary.

**What I need from you**
Asymmetric portfolio with staggered launches, ~1.05M backfilled events at 7 days and a stated
fallback to 5 days — approved? And is a ~40–60s first-boot seed acceptable, or should 7 days come
down now?

---

### DECISION #40 — Simulator state, config sync, and the limit of determinism [LOAD-BEARING]

**Blocking:** D35's accrual key having anywhere to live; the pause demo; reproducibility claims.

**Context**
`DESIGN.md` §3.3 states that *"the simulator holds no durable state of its own — it resumes from
`SELECT MAX(ts) FROM signals`"*, and §11 that it honours pause by ceasing emission. Both are recorded
there as **design constraints on D17**, not as solved problems. Two things make them non-trivial:
D35's fatigue accrual and budget pacing are **stateful** (cumulative frequency per pair, spend so far
today), and D32 rejected shared database access, so no channel currently exists through which the
emitter learns that a lever was pulled.

**Options — how state survives a restart**

**A) Recompute from the server.** A read endpoint returns cumulative impressions per
`(lineage_id, audience_id)` and spend-so-far-today per ad, both derived from the signal log and
`config_generations`.
- Pros: keeps §3.3's claim literally true — the state *is* a projection of the log, so a restart is
  exact rather than approximate. The query is not simulator-specific: cumulative delivery per
  (lineage, audience) is the temporal reverse join §8 already documents for component-level
  performance, so this is an app query the Workbench wants anyway.
- Cons: the server computes something whose only current consumer is the simulator.
- Reversal cost: low.

**B) Pure function of seed and simulated clock.** The simulator replays its own history from `t₀` on
each start, deriving fatigue deterministically.
- Pros: no endpoint; exactly reproducible; cheap (~10k ticks of arithmetic).
- Cons: it reconstructs what the model *would* have produced, which equals what the store contains
  only if nothing was rejected, lost or truncated mid-batch. Since we deliberately inject emitter-side
  loss and malformed payloads, the two **will** disagree, and the fatigue curve the app infers would
  drift from the one the emitter is applying. A silent divergence in the one number the artifact is
  judged on.
- Reversal cost: low.

**C) Local sidecar state file beside the simulator.**
- Pros: simplest to write.
- Cons: contradicts §3.3 directly, and it makes killing the simulator mid-demo dirty — the world now
  lives in two places, and deleting the file silently changes it.
- Reversal cost: low.

**Options — how the emitter learns about levers**

**X) Poll `GET /api/sim/world` once per tick.** Returns the 12 `ads` rows (status, budget, slots,
audience, channel), `last_decision_seq`, the A-state above, and any pending scenario triggers.
- Pros: one endpoint serving cold start, resume and steady state identically; 12 rows a second is
  free; a pause takes effect within one tick (≤ 1s), which is the *"pause `a_12` and its events
  stop"* moment. Scenario triggers ride the same channel, so no second control path is needed.
- Cons: 1 Hz polling is unfashionable and one more endpoint to write.

**Y) The simulator subscribes to the SSE stream.** Reuses D18, but that stream carries bucket rows
and tail frames, not config, so it needs a new frame type and the simulator becomes a client of a
surface built for the browser.

**Z) Read the database directly.** Already rejected by D32; read-only access avoids the two-writer
problem but re-couples the processes the decision separated.

**The limit that has to be stated either way**
A seeded PRNG does **not** make the world reproducible from the seed alone, because levers change
delivery: the moment a human pauses an ad, the world forks. The honest formulation is
`(seed, decision log, scenario log) → world`, and all three are persisted, so replaying a specific
interesting moment is genuinely possible — a stronger claim than seed-only determinism, and a true
one. It also requires the RNG to be **counter-based/keyed** — draws derived from
`hash(seed, stream, ad_id, tick_index)` rather than from a sequential stream — so that intervening on
one ad does not shift every subsequent draw for every other ad. That is what keeps the unaffected
part of the world identical across a forked run.

**Recommendation**
**A + X**, with the keyed RNG and the stated determinism limit. A is the only option under which the
emitter's fatigue state and the app's inferred fatigue cannot silently disagree, and it costs a query
the Workbench section already wants. X gives cold start, resume, lever propagation and scenario
delivery one code path and one endpoint, and it makes the pause latency a number we can state (≤ 1
tick) rather than a behaviour we hope for.

**What I need from you**
`GET /api/sim/world` polled at 1 Hz, fatigue and pacing state recomputed from the log rather than
held locally, keyed RNG, and reproducibility stated as (seed + decision log + scenario log) —
approved? Also: scenario triggers need to persist for that claim to hold, which means **one small
table** added to `DESIGN.md` §2 — confirm you want that rather than scenarios being ephemeral.

---

### Propose-and-ratify block — everything else in `SIMULATOR.md`

Per the Phase 3 prompt (*"The rest you can propose and I'll ratify"*) and Seno's plan-mode answer
that D17's residue belongs here rather than as its own entry. Proposed as a batch; each line is
low-cost to reverse and each becomes a stated parameter in the doc.

**1. D17's residue — clock, backfill, determinism**

| Sub | Proposal | Reason |
|---|---|---|
| 17b clock | **Live emission at 1× real time**; backfill generated as fast as it ingests | An accelerated *live* clock breaks lateness outright: `ts` would advance faster than the wall clock, so I10's skew clamp would fire on nearly every event and `received_at − ts` would measure our acceleration factor. 1× is not a compromise, it is the only rate at which the envelope means anything |
| 17b backfill | Accelerated, in-process at first boot, through the same `ingest()` function | One writer of `ingest_seq` (D32's ownership argument); and per D38-E the seeder is a fixture path, not an emitter |
| 17c determinism | **Seeded, counter-based (keyed) RNG**; default seed stated in the README | Keyed draws mean intervening on one ad does not reshuffle the others — see D40 |
| 17d depth | **7 days**, with 5 days as the stated fallback lever | Fatigue and day-of-week both need multiple day cycles; 24h shows neither. Both exceed the 72h horizon, so settlement behaviour is unchanged either way |
| tick | **1 second**, one batched POST per tick | ~3 events/sec average portfolio-wide, peaking ~8 — quiet enough that a burst is visible, dense enough to read as live |

**2. Arrival process.** Per ad, per tick: `λ = base_ad × diurnal(h_local, channel) × dow(d) ×
φ_fatigue(lineage×audience) × ν_novelty(age) × ρ_pacing(budget, spend) × m_channel(t) × m_ad(t)`,
then a negative-binomial draw (D37). Every factor is a named section with a formula; nothing is a
free constant.

**3. Diurnal, in `America/New_York`** (D22). Two-peak curve rather than one, because social traffic
has a midday and an evening peak:
`d(h) = 0.30 + w₁·exp(−(h−13)²/(2·3.2²)) + w₂·exp(−(h−20.5)²/(2·2.0²))`, normalised to mean 1.0 over
24h. **The peak weights are per channel** — `meta_feed` midday-weighted, `tiktok_feed` and
`snap_stories` evening-weighted — so channel differences modulate the *shape* of the day and not
just its level.

**4. Day of week.** Volume: Mon 0.96 · Tue 1.00 · Wed 1.02 · Thu 1.03 · Fri 0.98 · Sat 0.88 ·
Sun 0.93. Separately, a weekend browse-not-buy effect: CVR ×0.90 and order value ×1.05 on Sat/Sun.
Two effects because they are two phenomena.

**5. Channel matrix.**

| Channel | Volume share | CTR mult | CVR mult | Pricing mix | CPM base | CPC base | Diurnal shape |
|---|---|---|---|---|---|---|---|
| `meta_feed` | high | 1.00 | 1.00 | 70% CPC / 30% CPM | $6.50 | $0.62 | midday-weighted |
| `meta_reels` | medium | 0.85 | 0.90 | 50 / 50 | $5.20 | $0.48 | evening |
| `tiktok_feed` | high | 1.20 | 0.75 | 30% CPC / 70% CPM | $4.10 | $0.35 | late evening |
| `snap_stories` | low | 0.70 | 0.65 | 20% CPC / 80% CPM | $3.40 | $0.30 | evening |

The pricing mix is what makes I1's two cost paths both real: on a CPM-priced channel almost all cost
arrives as `spend` deltas and clicks carry `cost_cents = 0`; on a CPC channel cost arrives on the
click and `spend` carries fees only. That is a direct reading of L79-80's *"disjoint"*.

**6. Audience temperature matrix.**

| Temperature | `est_size` | Reachable frac | CTR base | CVR | CPC mult | Order value (median) | `p_fast` (D36) |
|---|---|---|---|---|---|---|---|
| `cold` | 2,400,000 | 0.55 | 1.1% | 1.8% | 0.85 | $42 | 0.30 |
| `warm` | 380,000 | 0.70 | 2.4% | 5.5% | 1.00 | $58 | 0.45 |
| `retargeting` | 46,000 | 0.85 | 4.2% | 15.0% | 1.35 | $76 | 0.65 |

Decay rate is **not** a column: `k` is global and the reachable pool does the work, so retargeting
burns out ~50× faster than cold at equal volume as a consequence of the model rather than a
parameter (D35).

**7. Novelty at launch — yes, it is real.** `ν(age) = 1 + 0.25·exp(−age_hours/18)`: +25% CTR at
launch, ~18-hour time constant. Modelled as a CTR effect only, not a delivery boost, for parsimony —
and stated as such, since platforms do also favour new creative in the learning phase.

**8. Budget pacing** (I3, P11). Pace against the *expected traffic shape*, not linearly, which is
what real pacers do: let `e` = fraction of the day's expected impressions elapsed and `a` =
`spend_so_far / daily_budget`. Then `ρ = clamp(1 + 3.0·(e − a), 0.05, 1.6)`, with a terminal taper
`ρ ← ρ · clamp((1.05 − a)/0.15, 0, 1)` so delivery slides to zero as spend approaches **105%** of
budget. Overspend tolerance **+5%**, stated. Throttles, never cliffs; `set_budget` visibly moves the
rate within a tick; day rolls at midnight `America/New_York`.

**9. Misbehaviour injection rates.** Cross-referenced to `DESIGN.md` §6 so every injected fault has a
named handler and every handler has something that triggers it.

| Injected | Rate | Handled by |
|---|---|---|
| Duplicate delivery, identical payload | 0.8% of events re-sent 1–20s later | D15 |
| Duplicate delivery, conflicting payload | 0.05% (`value_cents` perturbed) | D15 / I7 |
| Out-of-order, short | 3% held back one batch | D12 |
| Out-of-order, long | 0.3% held 30–120s | D12 |
| Orphan — click withheld then released | 0.4% of clicks delayed past their conversion | D16 promotion |
| Orphan — click never delivered | 0.6% of clicks dropped after their conversion is scheduled | D16 `orphan_expired` |
| Malformed payload | 0.1% (negative money or missing variant field) | `rejected_invalid` |
| Future-dated `ts` | 0.2%, +5–90s | I10 clamp |
| Same click under two `event_id`s | 0.05% | E3 partial unique index |
| Emitter-side loss | 0.2% dropped silently | **G21 — deliberately injected so the one failure we cannot see is actually present in the data rather than hypothetical** |
| Late conversion past 72h | ~3.8% — **emergent from D36, not injected** | D13 / P7 |
| Signals for a non-live ad | **Not injected** — it is I11's self-check and must read zero | I11 / G48 |
| Retraction / void | **Not injected** — unrepresentable by the contract (D25) | named, not built |
| Burst · gap · stall | **Scenario-triggered only** | §11 backpressure, G21 liveness |

**10. Scenario control.** `POST /api/sim/scenario {name, args}` persists a trigger which the
simulator picks up on its next `GET /api/sim/world` poll (D40-X), so there is no second control
channel and the triggers are part of the replayable record.

| Scenario | What it does | What it demonstrates |
|---|---|---|
| `fatigue_collapse{ad_id, ×}` | Multiplies the pair's accumulated frequency ×4 | CTR halves within a minute; the fatigue flag fires |
| `late_cascade{ad_id, n, min_age_h=96}` | Emits `n` conversions attributed to clicks ≥ 96h old | Restatement of settled buckets, on demand — the flagship path |
| `budget_squeeze{ad_id}` | Jumps spend-so-far to 92% of budget | The pacing taper, visible within a tick |
| `orphan_burst{n}` | Conversions whose clicks are withheld 90s, then released | Provisional → promoted: a two-bucket restatement |
| `duplicate_storm{n}` | A batch replayed | Dedupe counters and `duplicate_identical` |
| `stall{seconds}` | Emission stops | Liveness display; "last event 12s ago" |
| `traffic_burst{×}` | Rate multiplier for 60s | Ingest backpressure and tail-frame drops |

**11. Read side — inherited, not re-decided.** D20's gate (≥500 impressions · ≥10 conversions),
ladder (minute → 5 min → 15 min → hour, **stop**, then show counts) and EWMA (15-min half-life, raw
toggle) are ratified; so is D33's CDF with its sample size. `SIMULATOR.md` cites them and does not
re-open them. **One thing is genuinely new — the fatigue flag:**

> Flag a `(lineage × audience)` pair as fatiguing when its EWMA CTR over the last 6h has fallen
> ≥ 25% below the pair's peak trailing-6h EWMA CTR, using only points that clear D20's impression
> gate, with ≥ 3 qualifying points in each window.

Its limits, stated on the surface per L147: it cannot separate fatigue from an audience-quality
shift or a platform delivery change; it lags by roughly the EWMA half-life; it fires **late** on
low-volume ads precisely because the gate suppresses their points; and it is a **display flag, not
a recommendation** — `system:fatigue_rule` and the approval flow are D26 cut #6.

**12. Two consequences that touch other documents**, raised rather than absorbed:

- **`DESIGN.md` §2 gains one table** (the scenario trigger log) and the envelope gains D38's
  `source` marker. Both are Phase-2 schema changes made in Phase 3 and both need a `BRIEF_GAPS.md`
  extension row.
- **Scenario control may be new scope.** Nothing in P1–P16 covers *"cause the interesting thing on
  demand"*, and P16 exists only because restatement is otherwise invisible — which is the same
  argument. If it becomes a plan item it lands in `SCOPE.md` §2, and that block is README-verbatim.
  Flagged as a scope question with its cost, not slipped in.

---

## Wave 7 — Phase 5 toolchain (D41–D45)

**Raised at the Phase 4 close, 2026-09-03.** These are the choices `docs/BUILD_PLAN.md` chunk **B01**
runs into on its first line, and every one of them has a defensible alternative — so per
`CLAUDE.md` §3 they are Seno's, not mine. **No code exists and none will until D41–D43 are answered.**

**D41–D43 were ratified 2026-09-04** and are recorded in `docs/DECISIONS.md` § Wave 7; each carries
a banner below. **D44 and D45 were deferred to stage 4 in the same pass (F4)** — deferred, not open.

**Two tiers, deliberately.** **D41, D42 and D43 block the first commit.** **D44 and D45 block
nothing before stage 4** (chunks B36/B37) and can be answered later without holding the build —
they are batched here only so the whole toolchain is decided in one pass if that is convenient.

**The standing precedent.** **D8** settled persistence on `node:sqlite` and its rationale was a §5
sign-off of *no new dependency*. That precedent shapes three of the five recommendations below, and
where I depart from it (D41, D44) the departure is argued rather than assumed.

---

### DECISION #41 — Repo layout and build toolchain

> **RESOLVED 2026-09-04 — option A** (single package, three entry points, Vite for the client
> only). See `docs/DECISIONS.md` § DECISION #41. The analysis below is retained as the §3 source
> the ratified entry compresses.


**Blocking:** B01, and therefore everything. Nothing can be written to disk until this is answered.

**Context**
`CLAUDE.md` §1 fixes the stack — Node + TypeScript strict + React, `node:sqlite`, Node 24 floor. It
does not say how React reaches a browser. `DESIGN.md` §11 and **D32** require three runnable things:
a server, a **separate-process** simulator, and a client bundle. The brief's deliverables ask for a
one-command run (`BUILD_PLAN.md` B57). Nothing in any ratified decision constrains the bundler or the
package layout.

**Options**

**A) Single `package.json`, three entry points (`src/server`, `src/sim`, `src/web`), Vite for the client only**
- *How it works:* one dependency tree; server and simulator run from `tsc`-emitted or
  `node --experimental-strip-types` output; Vite builds and dev-serves `src/web` only, proxying
  `/api` to the server. `src/shared` is imported by all three by relative path.
- *Pros:* one `npm i`; shared types are a plain import with no build orchestration; the one-command
  run is a 30-line `scripts/start.mjs` spawning two processes and serving a built bundle. Vite's HMR
  is real time saved across ten UI chunks in stage 4.
- *Cons:* one new dev dependency (Vite, and its transitive tree). Client and server dev deps share a
  tree, so `npm ls` is noisier than the D8 aesthetic.
- *Forecloses:* nothing. Vite is a dev-time tool; it produces static files and does not appear in the
  runtime.
- *Reversal cost:* **low.** Swapping the bundler touches `scripts/`, `index.html` and one config file.

**B) No bundler — `tsc` to ESM, native `<script type="module">`, import maps for React**
- *How it works:* `tsc` emits ESM to `dist/web`; `index.html` loads it directly; React comes from an
  import map pointing at a vendored copy.
- *Pros:* zero dev dependencies beyond TypeScript — the purest reading of D8. The build is one
  command anyone can read. Nothing between the source and the browser.
- *Cons:* no JSX transform without configuring `tsc`'s (fine), but also no HMR, no dev server, and a
  manual `/api` proxy or CORS setup. Every UI chunk in stage 4 costs a full reload. Vendoring React
  by hand is a step that will be got wrong once.
- *Forecloses:* nothing technically; it costs iteration speed exactly where `BUILD_PLAN.md` §13 says
  the cut line will bite hardest.
- *Reversal cost:* **low**, and it is the same reversal as A.

**C) npm workspaces — three packages, `shared` as a fourth**
- *How it works:* `packages/{server,sim,web,shared}` with workspace protocol links.
- *Pros:* the process boundary D32 cares about is visible in the directory structure; each package
  declares only what it uses.
- *Cons:* real overhead for a solo build under time pressure — build ordering, four `package.json`
  files, and a `shared` package that must be built before anything imports it. It buys module
  hygiene that a single `src/shared` directory already provides at this size.
- *Forecloses:* nothing.
- *Reversal cost:* **medium** — moving to or from workspaces is a whole-repo file move.

**Recommendation — A.** The honest form of D8's argument is *no new **runtime** dependency*, and
Vite is not one: it emits static files and is absent from the running system, so the property D8
protects (the app is Node + SQLite and nothing else) is untouched. What B actually costs is ten
chunks of stage-4 UI work without hot reload, on the one part of the build where `DESIGN.md`
specifies behaviour precisely and appearance not at all — meaning iteration count is the dominant
cost there. C is the right structure for a team and the wrong one for a slice this size: it adds
build ordering to a repo whose hardest problem is a restatement path, not a module graph. A is also
the only option under which the one-command run stays a script rather than a build system.

**What I need from you**
Single package with Vite for the client only (A), or do you want the zero-dev-dependency build (B)
so the repo can claim a completely unbundled toolchain?

---

### DECISION #42 — HTTP server: `node:http` or a framework

> **RESOLVED 2026-09-04 — option A** (`node:http` with a hand-rolled router). See
> `docs/DECISIONS.md` § DECISION #42.


**Blocking:** B04. Everything from B05 onward is endpoints.

**Context**
The full surface is small and known: `POST /api/ingest`, `GET /api/snapshot`, `GET /api/stream`
(SSE), `POST|GET /api/decisions`, `GET /api/verify`, `POST /api/trace`, `GET /api/sim/world`,
`POST /api/sim/scenario`, `GET /api/health`, plus static files in production. Ten routes, no auth, no
sessions, no middleware chain, one client. `DESIGN.md` §11 requires the ingest and decision paths to
be **synchronous end to end** in one SQLite transaction.

**Options**

**A) `node:http` with a ~40-line router**
- *How it works:* one `switch` on method and pathname, a JSON body reader, an SSE helper.
- *Pros:* no dependency; the D8 argument holds without qualification. SSE is easier without a
  framework's response wrapper in the way — `res.write` on the raw socket, flush control, and
  backpressure (`DESIGN.md` §11's point 2) are all directly visible. Nothing hides the fact that
  `node:sqlite` is synchronous.
- *Cons:* we write and debug body parsing, 404s and error handling ourselves. Roughly 60–80 lines
  that a framework would give us.
- *Forecloses:* nothing.
- *Reversal cost:* **low** — handlers are `(req, res)` either way.

**B) Express**
- *Pros:* familiar; body parsing and static serving are one line each; the reviewer recognises it.
- *Cons:* a dependency and its tree, for ten routes with no middleware needs. Express's SSE story
  needs care around compression and buffering, and getting that subtly wrong makes the live path
  look laggy for reasons unrelated to our design.
- *Forecloses:* nothing.
- *Reversal cost:* **low.**

**C) Fastify**
- *Pros:* schema validation at the boundary, which `BUILD_PLAN.md` B05 needs anyway (U6's
  non-negative-integer rules).
- *Cons:* a larger dependency, an async-first design in a synchronous store, and its validation is
  not the validation we need — ours writes rejects to `signal_deliveries` with the raw body retained
  (`DESIGN.md` §5.1), which a framework's 400-and-discard actively fights.
- *Forecloses:* nothing, but C's main selling point is one we cannot use.
- *Reversal cost:* **low.**

**Recommendation — A.** Ten routes, one client, no auth: the framework is doing almost nothing here,
and the two places it would do something — SSE flush control and validation-with-retention — are
both places where it gets in the way rather than helps. C's validation is the clearest case: our
ingest boundary must *keep* what it rejects, which is the opposite of what schema validation is for.
And under A, "no new dependency" stays a claim about the whole server rather than one about
persistence with an asterisk.

**What I need from you**
`node:http` with a hand-rolled router (A), or do you want Express (B) for reviewer familiarity?

---

### DECISION #43 — Test runner, and what gets an automated test at all

> **RESOLVED 2026-09-04 — option A** (`node:test`, on `fold()`, attribution, restatement and the
> lag mixture only). See `docs/DECISIONS.md` § DECISION #43.


**Blocking:** B12 (the fold) — the first chunk whose verification step is not something you can see
in a browser or a `sqlite3` prompt.

**Context**
`CLAUDE.md` §10 defines done as *"verifiable by hand in the browser or terminal, with steps given"*,
and every chunk in `BUILD_PLAN.md` carries such a step. The brief asks for none. But four things
are pure functions with arithmetic that is wrong in ways a screen does not reveal: `fold()`,
attribution, the restatement decrement/credit, and the lag mixture. `GET /api/verify` and the P14
sweep are in-product checks over real data — they are not unit tests and do not replace them.

**Options**

**A) `node:test` + `node:assert`, tests only on the four pure functions**
- *Pros:* built in, zero dependency, `node --test` is the whole runner. Test files sit next to the
  code. It covers exactly the code where a bug is silent.
- *Cons:* thinner ergonomics than Vitest (no watch-by-default, no snapshotting, plain assertions).
  No component testing, so the UI is hand-verified — which is what `CLAUDE.md` §10 asks for anyway.
- *Forecloses:* nothing. Adding Vitest later is additive.
- *Reversal cost:* **low.**

**B) Vitest, and test the client too**
- *Pros:* one runner for both sides; shares Vite's config under D41-A; jsdom makes the gate ladder
  and the EWMA testable without a browser.
- *Cons:* a dependency and a config file, and it invites testing UI that `CLAUDE.md` §7 explicitly
  deprioritises. Budget spent on component tests is budget not spent on the cut line.
- *Forecloses:* nothing.
- *Reversal cost:* **low.**

**C) No automated tests — everything by hand, plus `/api/verify` and the P14 sweep**
- *Pros:* fastest per chunk; the in-product checks are stronger evidence to a reviewer than unit
  tests, because they run over 1.6M real events in front of them.
- *Cons:* the four pure functions get no coverage until the sweep runs at B24, and a fold bug found
  then is a bug found after twelve chunks were built on it. The sweep tells you *that* the numbers
  disagree, not *which* branch is wrong.
- *Forecloses:* nothing, but it removes the only cheap way to bisect an arithmetic bug.
- *Reversal cost:* **low.**

**Recommendation — A.** The argument is not coverage, it is bisection. `BUILD_PLAN.md` §13 names
B20 (restatement) as the hardest chunk and notes its bugs are invisible until B24's sweep; a fixture
test that folds five decisions or promotes one orphan turns "some bucket disagrees somewhere in
1.6M events" into a named failing branch. Confining tests to those four functions keeps the cost
near zero and keeps the UI on the hand-verification path `CLAUDE.md` §10 already specifies. C's
in-product checks stay — they are the reviewer-facing evidence; unit tests are the developer-facing
bisection tool, and they are not substitutes.

**What I need from you**
`node:test` on the fold, attribution, restatement and the lag math only (A) — or would you rather
ship no automated tests at all (C) and lean entirely on `/api/verify` plus the P14 sweep?

---

### DECISION #44 — Chart rendering

> **RATIFIED 2026-09-04 at the B36 gate — option A (uPlot 1.6.32).** Deferred by F4, re-presented
> at the gate, answered there. The analysis below is what was put to Seno and is kept as the record;
> the ratified entry, the §5 dependency sign-off and the corrected rationale are
> `docs/DECISIONS.md` § DECISION #44.


**Blocking:** B37, in stage 4. **Blocks nothing before that** — stages 0–3 need no chart.

**Context**
`DESIGN.md` §11 and **D34** constrain this more than the visuals do: every performance number
renders through a component that requires a signed, server-issued `TraceDescriptor`, and **D31**
requires clicking a point to open its drill-down. **D20**'s ladder means the *granularity* of a
series changes at render time and the chart must sometimes refuse to draw a ratio and show counts
instead. Twelve series, ~10k minute buckets per ad over 7 days, live updates on a 250–500 ms tick.
`CLAUDE.md` §7: *"Do not gold-plate CSS"*, and visual polish is an explicit non-goal.

**Options**

**A) uPlot**
- *How it works:* a small canvas time-series library; data goes in as typed column arrays, which is
  the shape `rollup_minute` rows already have.
- *Pros:* built for exactly this — many series, many points, live updates, ~45 KB. Click-to-point
  hit testing is a documented hook, so B53's drill-down is a callback. Fast enough that the 7-day
  window needs no downsampling of its own beyond D20's ladder.
- *Cons:* a dependency; imperative API that needs a small React wrapper (~40 lines); its styling
  hooks are thin, though that is aligned with §7.
- *Forecloses:* nothing. The descriptor plumbing lives in our wrapper, not in the library.
- *Reversal cost:* **low-medium** — one component and its wrapper.

**B) Recharts (or any React-declarative chart library)**
- *Pros:* declarative and idiomatic React; annotations (generation boundaries, restatement markers)
  are just child elements, which suits B42/B43/B48.
- *Cons:* SVG per point. Twelve series over a 7-day minute window is well past where it stays
  responsive, so it forces aggressive downsampling — and downsampling on the client is uncomfortably
  close to client-side aggregation, which **D30** rejected. The library also wants to own the tooltip,
  which is where the descriptor has to live.
- *Forecloses:* nothing formally, but it puts pressure on D30's boundary in the one place it matters.
- *Reversal cost:* **medium** — annotations written as children do not port to a canvas library.

**C) Hand-rolled SVG**
- *Pros:* no dependency; total control over the descriptor path and the "refuse to draw, show counts"
  branch; every pixel traceable to our own code.
- *Cons:* axes, ticks, time formatting, hit testing, zoom and the live update path are all ours —
  several chunks of work with no domain content, on the surface `CLAUDE.md` §7 says not to spend on.
- *Forecloses:* nothing.
- *Reversal cost:* **low**, but the cost is already sunk by then.

**Recommendation — A.** The volume settles it: 12 series × ~10k minute buckets is canvas territory,
and B is only workable if we downsample on the client, which is the one thing D30 was ratified to
prevent. C spends stage-4 budget on axis ticks — the exact trade `CLAUDE.md` §7 warns against, and
the cut line in `BUILD_PLAN.md` §12 already shows stage 4 is where budget gets tight. uPlot's
imperative API is a genuine cost, but it is one wrapper component, and that wrapper is where D34's
descriptor requirement wants to live anyway.

**What I need from you**
uPlot behind a descriptor-bearing wrapper (A), or hand-rolled SVG (C) to keep the client
dependency-free?

---

### DECISION #45 — Styling

> **RATIFIED 2026-09-04 at the B36 gate — option A**, plus two constraints Seno added: settlement
> state carries a non-colour channel as well as colour, and there is one theme only. The analysis
> below is kept as the record; the ratified entry is `docs/DECISIONS.md` § DECISION #45.


**Blocking:** B36, in stage 4. **Blocks nothing before that.**

**Context**
`CLAUDE.md` §7 quotes the brief: visual polish is explicitly not what is graded. But the surface has
two real requirements that are about *legibility, not taste*: `DESIGN.md` §5.4's three settlement
states (live / settled / restated) must be visually distinct and **persistent**, and §11's stream
telemetry must render in a treatment that can never be mistaken for a performance metric.

**Options**

**A) One plain CSS file, CSS custom properties for the ~8 semantic colours**
- *Pros:* no dependency, no build step beyond Vite's default. The settlement states and the telemetry
  treatment become four named variables, which is self-documenting where it matters.
- *Cons:* no scoping — class names are a manual discipline. At ~15 components that is manageable.
- *Forecloses:* nothing.
- *Reversal cost:* **low.**

**B) CSS Modules** — Vite supports them with no config.
- *Pros:* scoping for free; still no runtime dependency.
- *Cons:* one file per component and a slightly noisier import; the semantic colours still want a
  shared file, so it is A plus scoping.
- *Forecloses:* nothing. *Reversal cost:* **low.**

**C) Tailwind**
- *Pros:* fast to write; consistent spacing without thinking.
- *Cons:* a dependency and a build step, and the two things that actually matter here (settlement
  states, telemetry quarantine) become long utility strings rather than named semantics — the
  opposite of what those two rules need.
- *Forecloses:* nothing. *Reversal cost:* **low-medium.**

**Recommendation — A.** The only styling decisions that carry meaning are the settlement states and
the telemetry quarantine, and both are better as named custom properties than as either utility
strings or scoped modules. Everything else is legibility, which one stylesheet handles at this size.
B is a reasonable upgrade if component count grows past ~20; C spends a dependency on the axis
`CLAUDE.md` §7 tells us not to.

**What I need from you**
One plain stylesheet with semantic custom properties (A) — or do you want CSS Modules (B) for
scoping from the start?

---

**Batch note.** Answer D41–D43 to unblock B01. D44 and D45 can wait until stage 4 without stalling
anything; if you would rather decide them later, say so and `BUILD_PLAN.md` §2 gets a note that they
are deferred rather than open.

---

## Wave 8 — Phase 5 read side (D46)

**Raised at B08, 2026-09-04, and ratified the same day** — `docs/DECISIONS.md` § Wave 8. Kept here
because `CLAUDE.md` §3's compression allowance requires the full option analysis to survive
somewhere; the entry there points at this section.

### D46 — Where window aggregation lives: who computes a displayed total

**Blocked:** nothing at the time of asking — B08 shows a per-bucket number under any answer. Blocks
**B38** (ratios); shapes **B36** (portfolio list, granularity), **B51** (descriptor issuance),
**B52** (`<Metric>`), **B53** (drill-down), and — the part I missed — **B09/B10** (the live path).

**Context as presented.** `DESIGN.md` §10.1's `TraceDescriptor` is itself a window aggregate:
`metric` + `ad_ids` + `from`/`to` + `granularity_s`. §10.2 adds *"if the client did the arithmetic
(D30-A), the walk-back would compare the client to itself."* Meanwhile `BUILD_PLAN.md` B38's file
list puts `src/web/metrics.ts` on the **client**, which reads as client-side CTR/CPA/ROAS. B07 puts
per-bucket counts on the wire and no total at all, so B08 had nothing to render as a headline
number.

| | Option | How it works | Forecloses | Reversal cost |
|---|---|---|---|---|
| **A** | Server computes every displayed aggregate | Snapshot grows a totals/series block per metric and granularity; B51 signs each. `web/metrics.ts` becomes formatting only | Nothing. Costs one SQL `SUM` per metric in the read transaction that already exists | Low now; high once B38/B51 are built on another answer |
| **B** | Client aggregates from server bucket counts | Drill-down offered on buckets only; totals explicitly not drillable | **HR5 on every headline number the strategist actually reads** | Medium — B38, B51 and B53 all move |
| **C** | Hybrid | Server computes window totals and ratios (drillable); client re-buckets for coarser chart granularity, labelled not drillable | Little, but two aggregation rules are on screen at once | Low |
| **D** | **C with one change — Seno's amendment** | Server computes **and signs** totals and ratios in the snapshot; SSE keeps per-minute absolute rows unchanged; the client's re-bucketing to display granularity **carries the same server-issued descriptor** | Nothing identified | Low |

**My recommendation was A, and two of its supporting arguments were wrong.** Recorded because the
entry in `DECISIONS.md` is the defence and a wrong argument inside it would not survive review:

1. **§10.2 does not forbid client arithmetic.** *"Compare the client to itself"* is about the
   rejected **D30-A** — the client aggregating **raw** events. It says nothing about a client
   aggregating server-computed counts, so **B does not fail on that argument.** B fails on **§10.1**
   instead: the descriptor rides on values the *server* sends, so a client-computed total has no
   descriptor and **B52's `<Metric>` cannot render it.** Same conclusion, different reason — and the
   reason is what a reviewer will test.
2. **None of A/B/C answered the live path**, which is **B09/B10**, the very next chunks. Under
   strict A the post-SSE total is either recomputed on the client anyway — A violated within two
   chunks of being chosen — or SSE has to carry display-granularity rows, which breaks **D30
   consequence 2**'s idempotent resume, the property that makes a reconnect safe.

**Why D resolves it.** The descriptor is *the query, not the answer* (§10.1's own words,
`granularity_s` included), so a client that re-buckets under an unchanged server descriptor is not
making a claim of its own — it is answering the server's question at the server's granularity, and
**B53 checks that answer against raw**. A client aggregation bug therefore reads as **FAIL in the
drill-down** rather than as a plausible number. D34's quarantine holds, because nothing renders
without a descriptor. D10 is untouched: counts aggregate, the division comes after.

**The trade, stated.** A makes client arithmetic bugs *impossible*; D makes them *caught on click*.
D buys the live path for that price.

### D47 — The `resnapshot` threshold, and how the cursor reaches the server

**Raised and ratified 2026-09-04, at B10a's announce.** `docs/DECISIONS.md` § Wave 8.

**Blocked:** B10a. **Context:** `DESIGN.md` §3.1 says a cursor "older than the server can serve
cheaply" gets a `resnapshot` frame, *"stated rather than left to a timeout"* — but "cheaply" is not
a number. The replay is `rollup_minute WHERE max_ingest_seq > cursor`: unbounded in both ads and
time, where the snapshot the client falls back to is **window-scoped**. Past some size the replay
transfers more than the thing it exists to avoid.

**The shape, which rules out the obvious answers.**

| Threshold on | Verdict |
|---|---|
| Seq distance (`current - cursor > K`) | **Rejected.** Mispredicts by orders of magnitude *both ways*: 100,000 impressions in one minute dirty **one** bucket; 20,000 late conversions over 20,000 minutes dirty **20,000** — identical seq distance. It resnapshots when the replay is trivial and replays when it is 6 MiB |
| Wall-clock age of the cursor | **Rejected.** Same defect, less information — it does not know how much happened |
| Log floor / retention | **Cannot fire.** D11 builds no compaction and retention is unbounded, so there is no floor. Becomes a *necessary extra* condition only if compaction is ever added |
| **Row count of the replay** | **Chosen.** The thing that actually costs, and free to measure: `LIMIT N+1` on the query already being run. `N+1` rows back → `resnapshot`. No `COUNT(*)` pass, and with no `ORDER BY` SQLite stops scanning as soon as it has them — so it bails **earliest in exactly the expensive case** |

**The value, anchored on Seno's B09 measurement** — 6.20 MiB / 20,000 rows = **325 B/row**;
142 ms / 20,000 = **7.1 µs/row**.

| Replay size | Frame | Stringify | What it is |
|---|---|---|---|
| ~12 rows | 4 KB | — | a one-second blip |
| **720 rows** | 0.23 MiB | 5 ms | **12 ads × a full hour offline — the reference point** |
| **2,000 rows** | **0.65 MiB** | **14 ms** | **chosen threshold** |
| 5,000 rows | 1.6 MiB | 35 ms | the alternative offered |
| 56,160 rows | ~17 MiB | ~400 ms | a cursor from before the seed |

The crossover is not a comfort level: the client's fallback fetches its **visible window**, which
portfolio-wide at B36 is 12 ads × 60 minutes = **720 rows**. Above that the replay transfers more
than a fresh snapshot *and* is unbounded in time, so the constant sits just above a full-portfolio
hour with enough headroom that a normal reconnect never trips it. **5,000** was offered as the
alternative — it keeps a genuine `late_cascade` (D40) replayable rather than resnapshotted, at
1.6 MiB. Seno chose **2,000**.

**Two conditions that are not about cost**, both ratified with the threshold:

1. **`cursor > current high-water seq` → resnapshot, unconditionally.** The silent one. Delete
   `data/`, re-migrate, restart: the browser reconnects with `Last-Event-ID: 500` against a store at
   seq 3, `max_ingest_seq > 500` matches nothing, and the client sits on **stale numbers forever,
   believing it is current**. No error at any layer — and `rm -rf data/` is the *supported* reset
   (U8), so this is reachable by ordinary use.
2. **A non-numeric cursor → resnapshot**, not `400`. A `400` on an `EventSource` produces an
   infinite retry against the same bad URL; `resnapshot` tells the client to re-snapshot and rebuild
   it.

**Seno's amendment — how the cursor reaches the server at all.** My proposal had *absent
`Last-Event-ID` → no replay, just go live*, on the assumption that the client had just snapshotted.
That is wrong, and it is the whole point of the mechanism: **`EventSource` cannot set a request
header** (its constructor takes only `withCredentials`), so the header exists **only on the
browser's own reconnect**, never on the first connect after a snapshot. Absent-means-live therefore
drops the **snapshot-to-subscribe gap on every refresh** — events landing between §3.1 step 1 and
step 2 are flushed to the other subscribers and gone, leaving buckets stale until they happen to
move again.

So the cursor arrives two ways and the server takes **`max(header, query)`**: `?cursor=N` on the URL
(the client's own, from the snapshot's `as_of_ingest_seq`) and `Last-Event-ID` (the browser's, on
reconnect only). **Why `max` and not `min`:** both are *true* statements of "I hold everything up to
X" — the query cursor because the snapshot returned it, the header because the browser only sends an
id it actually dispatched — so the max is the **tightest true lower bound**. `min` would be
correct-but-redundant on every reconnect, and on a long-lived session the extra rows since the
original snapshot could trip the 2,000 threshold and force a resnapshot for no reason.

---

## Wave 9 — Phase 5 process (D48–D50)

**Raised at the B11 close, 2026-09-04, and ratified the same day** — `docs/DECISIONS.md` § Wave 9.
Kept here because `CLAUDE.md` §3's compression allowance requires the full option analysis to
survive somewhere; the entries there point at this section.

These three are **process** decisions, not design decisions. They are in this file anyway because
D48 amends `CLAUDE.md` §5 — the standing contract — and a change to the contract that lives only in
a chat message is exactly the drift §3 exists to prevent.

### The measurement that prompted them

Twelve chunks landed on 2026-09-04 (every Phase-5 commit carries that date). **52 remain.** At that
rate the build alone consumes the entire runway to a 2026-09-08 demo, with no slack, no time for
Seno to learn the app, and no room for `BUILD_PLAN.md` §13's own warning that **B20 should be
expected to want a follow-up chunk**.

The diagnosis that matters: **the building is not the cost.** Each chunk costs announce → build →
report → Seno reads and independently re-runs → "ok" → commit → tick. The code is minutes; the
**round-trip is the serial bottleneck**, and there were 52 left. Chunk *size* is what makes a diff
reviewable. Chunk *gating* is what makes it slow. They are separable, and only the first is
load-bearing.

### D48 — Approval granularity: chunk-gated or group-gated

**Blocked:** every remaining chunk, and it is an amendment to `CLAUDE.md` §5's *"do not proceed to
the next chunk without ok"*.

**Context.** §5's chunk gate has earned its keep: Seno's independent re-runs found the B10a cursor
coercion (`Number('1e3')` → 1000, and a present-but-empty cursor read as absent) and the three B07
window-bound failures. All were silent. What the gate costs is 52 more serial round-trips.

**A) Keep chunk-gated.** 52 more gates.
*Pros:* earliest possible detection; the artifact stays exactly as designed.
*Cons:* does not fit the runway. Forces cuts later, under deadline pressure, which is the worst
moment to choose them.
*Forecloses:* the learning day.
*Reversal cost:* none — status quo.

**B) Group-gated, chunk-committed.** Build 3–5 related chunks in one pass; report once with a
per-chunk verification block; one "ok" covers the group; still one commit per chunk, with its own
message and its own `BUILD_PLAN.md` tick.
*Pros:* gates fall from 52 to ~13. Commits, diffs, plan items and the AI process artifact are all
unchanged — only the waiting is removed. Each chunk keeps the ~150-line ceiling, so nothing becomes
an unreviewable blob.
*Cons:* a design flaw found at chunk 3 of 5 means two chunks are already built on it. Seno's
independent re-run happens later, so a silent bug lives longer.
*Forecloses:* nothing permanently; it is per-group and reversible mid-stage.
*Reversal cost:* zero — "solo from here" restores option A.

**C) Group-gated and group-committed** (one commit per group).
*Pros:* marginally faster than B.
*Cons:* destroys per-chunk traceability, which is itself a deliverable (the brief's AI process
artifact, L153). Buys minutes, costs evidence.
*Reversal cost:* high — history cannot be un-squashed.

**D) Widen the chunks instead** — fold 52 into ~20 larger ones.
*Pros:* fewer gates too.
*Cons:* breaks §5's line ceiling and its "one reviewable concern". Trades review *quality* for
speed, where B trades only review *latency*.
*Reversal cost:* medium — an oversized chunk has to be split after the fact.

**Recommendation: B, with a written exclusion list**, because the grouping is only safe by virtue of
what stays solo. Groups never cross a stage boundary, and five chunks stay single-gated — the same
five `BUILD_PLAN.md` §13 already names as the places where wrongness is invisible or a decision is
owed: **B20** (restatement, the hardest chunk, bugs invisible until B24), **B24** (the agreement
sweep, the gate guarding everything after it), **B34/B35** (backfill and the `T0` seam — a wrong
seam makes `as_of` silently meaningless rather than broken), and **B36/B37** (they need the D45 and
D44 answers anyway, so they are gates we already owe rather than gates we are adding).

### D49 — Take §12's cut line now, or hold it in reserve

**Blocked:** nothing yet; blocks stage-4 planning.

**Context.** `BUILD_PLAN.md` §13 prescribes the response to a low rate: take §12's cut line
top-down. Rows 1–4 cost presentation only; rows 9–11 are fallbacks D37 and `SIMULATOR.md` §15.2
pre-ratified.

**A) Cut rows 1–4 now** — B48 generation markers, B40 EWMA smoothing, B45 the fatigue flag, most of
B44's telemetry. ~3 chunks and change.
*Cons:* row 3 is the read-side interpretation of HR7 — §12 calls it "a real loss to the
domain-modelling story".

**B) Cut rows 9–11 now instead** — one AR(1) process, 5-day backfill, 6 ads.
*Cons:* row 11 costs three demo moments (cross-ad transfer, copy-on-write, "burned here, fresh
there"). Cheap in time, expensive in evidence.

**C) Cut nothing yet.** Hold the line as the buffer B48/B40/B45 was always meant to be, and decide
at the stage 3 → 4 seam on real velocity.

**Recommendation: C.** D48 buys back more time than the entire top of the cut line does, and unlike
a cut it costs no evidence. The cut line is worth more held than spent: ~6 chunks of insurance
spendable in one minute at the B36 gate, when the real rate is known instead of guessed. Cut now and
the insurance is gone with 49 chunks still to go.

### D50 — Where the demo script sits in the order

**Blocked:** nothing. Changes the plan order.

**Context.** Seno needs to learn the app for the demo. **B61** is *"the ordered walkthrough,
including the refresh test and the restart test, as written steps a stranger can follow"* — and it
is currently second-to-last, so the artifact he would learn from arrives after everything else.

**A) Leave B61 last.** *Cons:* learning time is whatever survives on the final day.

**B) B61 becomes a running document from the B36 gate onward** — each stage-4/5 group appends its
walkthrough steps as it lands; B61 becomes a tidy-up rather than a write-from-nothing chunk.
*Cons:* touches one document across several chunks instead of once, so each group's report owes a
line saying what it appended.

**C) Move B61 to immediately after B50**, before stage 6. *Cons:* the trace surfaces (B51–B55) are
the most demo-worthy part and would not be in it yet, so the script needs a revisit regardless.

**Recommendation: B.** It costs no extra chunk, and the walkthrough then exists in draft from the
first day the UI is real — so learning the app is reading a document that grows under you, not
waiting on a chunk that has to complete first. It also shrinks B62's final refresh, which is the
last thing anyone wants to be writing on demo eve.

---

## Wave 10 — Phase 5 orphan expiry (D54)

**Raised at the G3 announcement, 2026-09-04, and ratified the same day** — `docs/DECISIONS.md`
§ THE G3 PASS. Preserved here in full because the entry there compresses the options to a line
each (`CLAUDE.md` §3).

### D54 — What writes `orphan_expired`, and against which clock

**Blocking:** B19's second half. B18 is unaffected and can be built either way.

**Context.** `DESIGN.md` §5.2 names the state — *"Still unresolved past the horizon →
`state='orphan_expired'`. Retained, counted, and displayed as a data-health figure"* — and
`002_projections.sql`'s CHECK admits it. But no document says what transitions a row into it, or
against which clock. `attribute.ts` (B17) said "the horizon sweep sets it"; no sweep is specified
anywhere. D38 fixed settlement's clock to the arriving event's `received_at` rather than
wall-clock `now`, and nothing said the same for expiry. The horizon constant itself does not exist
until B21. In the whole plan the only consumer is a read-side count: B44's orphan telemetry and
§5.2's *"6 conversions, $890, no matching click"*.

**A) Derive expiry at read; the store holds one unresolved state.** `state` stays
`orphan_provisional` for the row's life. The read side computes expired as
`read_clock − (credited_minute + 60 s) > horizon`. Nothing writes the value; `ix_attr_unresolved`
is unaffected, its predicate being `state <> 'resolved'`.
*Pros:* no clock enters a projection, so B22's rebuild reproduces the `state` column
byte-for-byte for free and B24 cannot report divergence on a correct store; P16's horizon
shortening (B49) rewrites nothing; one unresolved state means one promotion path for B20 instead
of two.
*Cons:* contradicts §5.2's literal wording and leaves a CHECK value the store never holds — a
reviewer greps `orphan_expired`, finds no writer, and needs the §5.2 amendment to make sense of
it. No "declared dead at T" stamp exists.
*Forecloses:* per-row expiry provenance. Recoverable — a stored state is additive.
*Reversal cost:* low.

**B) Sweep inside the ingest transaction, at the arriving event's `received_at`.** Each batch runs
one UPDATE over `ix_attr_unresolved` promoting eligible orphans, clocked exactly as D38 clocks
settlement.
*Pros:* literal to §5.2 and to the CHECK; the state is visible in `sqlite3` with no join;
deterministic under replay, since it uses event clocks.
*Cons:* B22/B23's rebuild must re-run the same sweep at the same log positions to reproduce it, so
one more column can diverge in the gate that guards everything after it; an orphan expires only
when some later event arrives, so the state lags on a quiet stream; B49 must re-sweep attribution
as well as rollups.
*Forecloses:* little. Adds a second unresolved state B20 must handle on promotion.
*Reversal cost:* low–medium.

**C) A wall-clock timer sweep** (flush tick or an interval), using `Date.now()`.
*Pros:* simplest to write; the state is always current.
*Cons:* non-deterministic under rebuild — `/api/verify` reports divergence on a correct store, and
the tempting fix is to drop the column from the diff. This is the exact trap family already
recorded twice in `BUILD_PLAN.md` §14 (`first_written_at`, D38's `restated_at`). During the seed a
boot-time clock expires the whole backfilled week.
*Forecloses:* the traceability claim, in practice.
*Reversal cost:* high — it is found at B22, three gates later.

**Recommendation: A.** The only thing that reads this state is a data-health count, and buying it
costs one derived function instead of a clock inside a projection. For this slice that trade is not
close: B24 is *"the gate that guards everything after it"* and every column whose value depends on
when it was written is a way for a correct store to fail it — we have been bitten twice by exactly
that shape. A also collapses two unresolved states into one before B20, which is §13's hardest
chunk and is single-gated for that reason. B is the more literal reading of §5.2 and I would not
argue against it; it just adds rebuild surface to the two chunks that can least afford it.

---

## Wave 11 — Phase 5 verification isolation (D55)

**Raised mid-G5, 2026-09-04, after B20a/B21 and before B22** — `docs/DECISIONS.md` § THE G5 PASS.
Preserved here in full because the entry there compresses the options to a line each
(`CLAUDE.md` §3).

### D55 — How the `/api/verify` rebuild is isolated from the store it checks

**Blocking:** B22, and B24 is built on the answer. **B23 is not blocked** — it is a pure function
over a log prefix and needs none of this.

**Context.** `DESIGN.md` §7 rebuilds every projection from the logs into temp tables and diffs them
against the live ones. The rebuild has to run the real `apply()` / `applyDecision()`, or verify
compares a second implementation of the fold against the first and proves nothing. Those functions
write unqualified table names, so where the rebuild lands is decided by name resolution — and if it
lands wrong, the verifier overwrites the store it was asked to check.

**Measured first.** A `TEMP` table shadowing `rollup_minute` captures unqualified writes, including
from a statement prepared *before* the temp table existed (SQLite re-prepares on schema change), so
`apply.ts`'s statement cache does not defeat the shadow.

**A) `TEMP` tables shadowing the real names, same connection.** DDL derived from `sqlite_master` so
the migration stays the single source of truth; replay through the real functions; `DROP` in a
`finally`.
*Pros:* the rebuild **is** the write path, which is the only arrangement in which "and they agree"
says anything about `apply()`; no data copy, so it still works against the seeded store; §7 needs
no amendment.
*Cons:* two invisible invariants — no projection SQL may be schema-qualified, and all shadowed
projections must be shadowed together. It must also be one synchronous block that always drops its
temps.
*Forecloses:* concurrent verifies on one connection. *Reversal cost:* moderate — B24 inherits it.

**B) A separate in-memory `DatabaseSync`.** Migrate it, copy `signals` + `decisions` + reference
data, replay, diff across handles.
*Pros:* physically cannot write the live store; isolation is structural, not conventional.
*Cons:* copies the whole log per verify (~1.6M signal rows at seeded size), so verify stops being
"at boot in dev, on demand in the demo". `:memory:` cannot be WAL and `openDb()` refuses non-WAL,
so it needs a carve-out in the file whose four pragmas were a design decision.
*Forecloses:* running verify casually, which is most of its value. *Reversal cost:* moderate.

**C) Differently-named rebuild tables, target threaded through `apply.ts`.**
*Pros:* no shadowing invariant, no copy, explicit target at every call site.
*Cons:* the single-writer file gains a parameter that exists only for the verifier; D7's "one
writer" becomes "one writer, two targets"; statement cache keys multiply.
*Forecloses:* nothing. *Reversal cost:* low, but it touches the most sensitive file in the build.

**Recommendation: A.** The only option where the rebuild is provably the same code as the write
path *and* stays cheap enough to run at boot and on demand at demo scale — and the hazard that
would have ruled it out was measured away rather than assumed. Its two invariants are exactly the
shape of a §14 trap, so both go into §14 with a test that greps for a schema-qualified projection
name and fails the build on one.
