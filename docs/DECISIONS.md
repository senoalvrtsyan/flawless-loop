# DECISIONS.md

Ratified decisions only. A decision reaches this file when Seno has answered it; until then it
lives in `docs/OPEN_QUESTIONS.md` as an open question. Recommendations are not decisions.

Each entry carries, per `CLAUDE.md` §3: id, date, the question, the options as they were
presented, what was chosen, the rationale **in Seno's words**, consequences, what it forecloses,
and a one-line "how I'd defend this in review".

## Legend — the id prefixes and code letters

Two separate alphabets. **Ids** name a thing; **codes** classify a gap. They collide on `D`.

**Id prefixes**

| Prefix | Means | Lives in | Range |
|---|---|---|---|
| `D`*n* | **Decision** — a `CLAUDE.md` §3 design decision put to Seno | here once ratified; `OPEN_QUESTIONS.md` §B until then | D1–D50 (D44, D45 deferred) |
| `T`*n* | **Triage** — a disposition pass over a set of findings, not one design choice | here | T1 |
| `F`*n* | **Follow-up** — an instruction from a ratification pass carrying its own lasting disposition | here | F1–F4 |
| `G`*nn* | **Gap** — an audit finding against the brief's contracts | `BRIEF_GAPS.md` | G01–G52 |
| `P`*n* | **Plan item** — one reviewable build chunk | `SCOPE.md` §2; `BUILD_PLAN.md` from Phase 4 | P1–P17 |
| `L`*nnn* | **Line number in `docs/BRIEF.md`** — so a quote is checkable, never recalled | citations throughout | — |

**Gap codes**, as they appear in a `BRIEF_GAPS.md` heading (`### G04 — <title> · US · B · FIX`) —
category · severity · triage. That file's legend is the authoritative definition list; the examples
below are here because this is the file that gets read cold.

**Category** — *where the defect comes from.* The brief conflicts with the field's own name (US),
with itself (IC), with what it can enforce (UI), with its own promises (PA), or with reality (RW).

| Code | Means | Example |
|---|---|---|
| MI | missing identifier — something you must point at has no id | **G17** `attributed_click_id` references a `click_id` field that exists nowhere in the contract |
| MF | missing field — the data is not in the type at all | **G16** `Signal` has no arrival timestamp, so lateness is inexpressible |
| US | undefined semantics — *semantics = meaning.* The field exists and is named, and two competent people still implement it two incompatible ways | **G04** `daily_budget_cents`: daily per *which clock*? No timezone exists in the model, and `Audience.geo` is a country code — Berlin midnight and UTC midnight are both honestly "daily" |
| IC | internal contradiction — two parts of the brief disagree with each other; nothing is missing, the pieces don't fit | **G08** the prose calls channel two dimensions ("which platform, which surface"), the type collapses both into one opaque string — while `audience`, no more structured, gets its own entity |
| UI | unenforceable invariant — *invariant = a rule that must hold at all times.* Nothing in the model can guarantee it, usually because the rule and the model cannot both be true | **G02** L42 says a live ad's config changes only through levers, but no lever produces a launch — so obey the rule and `launched_at` stays null forever; set it and you've broken the rule |
| PA | product ask not expressible with the given contracts — a promised user-facing capability the types cannot represent | **G06** L111 promises a library of "videos, images, copy"; `Component.kind` declares four kinds and `Ad` has slots for two, so a strategist can create an image and attach it to nothing |
| RW | real-world case the contract cannot represent — the model is self-consistent, reality is not shaped like it | **G15** retargeting is *defined by what it retargets*; the model gives a label with no referent, so nothing links a retargeting audience to the conversions that populated it |

**Severity** — **B** blocking (work cannot start on the affected surface) · **D** needs a decision
(a defensible alternative exists; §3 applies) · **C** cosmetic (note it, pick a default, move on).

**Triage** — carried on blocking findings only. The audit's job is to *find* problems; triage is the
separate pass that decides what we **do** about each one, and prices it. Without it, 52 findings
quietly become 52 build tasks. Exactly one bucket per blocking finding:

| Code | Means | Example |
|---|---|---|
| FIX | extend the contract and build it | **G16** arrival timestamps — irreversible if skipped, since an already-ingested event can never be given an arrival time afterwards. Two columns now, or the data is gone permanently |
| SPECIFY | design it fully in the README; do not build it | **G10** component versioning — nothing *edits* components while the Workbench is sketched, so there is no editing and therefore no versioning at runtime. L111 asks us to "pick one and defend it", which prose satisfies |
| NAME | state it as a known limit we tolerate | **G05** money is USD-only while `Audience.geo` varies — we say so rather than building currency, and name what it costs |

`T1` is that pass over the 12 blocking findings. As tagged today the register stands at **FIX 7 · SPECIFY 5 · NAME 0** — T1 was decided as FIX 6 · SPECIFY 6, and **D26 consequence 3 moved G04 (budget pacing) from SPECIFY to FIX**, reversing T1's own trim #2. FIX was costed at 8
build chunks before any of it was built. NAME is empty there by construction — a blocking finding is
by definition one we cannot merely tolerate — so the NAME set is drawn from the non-blocking
register instead.

**The `D` collision.** `D` is three unrelated things: a decision id (`D8`), the severity "needs a
decision" (`· D ·` in a gap heading), and an option letter within a decision (`D26 — option A`).
So *"traceability at D24 level D"* means **decision D24, option D** — its deepest traceability
level — and not a severity.

---

| # | Title | Status | Date |
|---|---|---|---|
| D1 | Which surfaces are built for real | **ACCEPTED — A** | 2026-09-03 |
| T1 | Triage of the blocking findings | **ACCEPTED** | 2026-09-03 |
| D26 | Which slice ships (Phase 1 scope depth) | **ACCEPTED — A, amended** | 2026-09-03 |
| D2 | Ad: frozen bundle or recipe | **ACCEPTED — B** | 2026-09-03 |
| D5 | Where the fold starts | **ACCEPTED — C, amended** | 2026-09-03 |
| D7 | Store the fold, the log, or both | **ACCEPTED — C** | 2026-09-03 |
| D8 | Persistence boundary and store | **ACCEPTED — A, `node:sqlite`** | 2026-09-03 |
| D9 | Aggregation granularity | **ACCEPTED — C** | 2026-09-03 |
| D10 | Where ratios are computed | **ACCEPTED — B** | 2026-09-03 |
| D11 | Compaction | **ACCEPTED — A, C specified** | 2026-09-03 |
| D12 | `received_at` + `ingest_seq` | **ACCEPTED — C** | 2026-09-03 |
| D13 | Lateness horizon and restatement | **ACCEPTED — A, amended** | 2026-09-03 |
| D14 | Which generation credits a late conversion | **ACCEPTED — B** | 2026-09-03 |
| F1 | Disposition of `Ad.status: "archived"` | **DECIDED — keep in the type** | 2026-09-03 |
| F2 | Demo-mode horizon shortening is a build item | **ACCEPTED** | 2026-09-03 |
| D27 | Which time bucket a conversion's value lands in | **ACCEPTED — B, amended** | 2026-09-03 |
| D28 | What the minute rollup is keyed by | **ACCEPTED — A** | 2026-09-03 |
| D29 | When the rollup counts are maintained | **ACCEPTED — A** | 2026-09-03 |
| D30 | The snapshot + stream wire contract | **ACCEPTED — C** | 2026-09-03 |
| D31 | The traceability anchor | **ACCEPTED — B** | 2026-09-03 |
| D32 | Simulator topology / where ingest sits | **ACCEPTED — B** | 2026-09-03 |
| D3, D4, D15, D16, D18, D19, D21, D23, D25 | — | **ACCEPTED** (Phase-2 ratification block) | 2026-09-03 |
| D22 | Day boundary and budget enforcement | **ACCEPTED — C + X, `America/New_York`** | 2026-09-03 |
| D20 | Separating signal from noise | **ACCEPTED — B**, constants amended, coarsening capped | 2026-09-03 |
| D33 | Maturity indicator basis | **ACCEPTED — B, global + sample size shown** | 2026-09-03 |
| D34 | Raw-tail quarantine mechanism | **ACCEPTED — C, exception named** | 2026-09-03 |
| D6, D24 | — | resolved by D26 | 2026-09-03 |
| D35 | What creative fatigue accrues to | **ACCEPTED — C**, headline weight kept | 2026-09-03 |
| D36 | Conversion lag distribution | **ACCEPTED — C**, two lags kept separate | 2026-09-03 |
| D37 | Noise and overdispersion | **ACCEPTED — C**, all six components | 2026-09-03 |
| D38 | Backfill arrival semantics | **ACCEPTED — E + B**, amended | 2026-09-03 |
| D39 | Volume calibration | **ACCEPTED — B**, progress print required | 2026-09-03 |
| D40 | Simulator state and config sync | **ACCEPTED — A + X**, scenario table approved | 2026-09-03 |
| D17 | Simulator architecture | **ACCEPTED** — closed by the Phase 3 proposal block | 2026-09-03 |
| F3 | Scenario control is a plan item (P17) | **ACCEPTED** | 2026-09-03 |
| D35p | D35 parameter ratification (`served_fraction`, version reset `r`) | **ACCEPTED** | 2026-09-03 |
| D41 | Repo layout and build toolchain | **ACCEPTED — A** (single package, Vite for the client only) | 2026-09-04 |
| D42 | HTTP server: `node:http` or a framework | **ACCEPTED — A** (`node:http` + a ~40-line router) | 2026-09-04 |
| D43 | Test runner, and what gets a test at all | **ACCEPTED — A** (`node:test`, four pure functions) | 2026-09-04 |
| D44, D45 | Chart rendering · styling | **DEFERRED to stage 4** (B36/B37) — see F4 | 2026-09-04 |
| D46 | Where window aggregation lives — who computes a displayed total | **ACCEPTED — D**, Seno's own option (an amendment to the three offered) | 2026-09-04 |
| D47 | The `resnapshot` threshold, and how the cursor reaches the server | **ACCEPTED — 2,000 rows**, plus Seno's `max(header, query)` amendment | 2026-09-04 |
| F4 | D44/D45 are deferred, not open | **DECIDED** | 2026-09-04 |
| U8, U9 | Store path `data/loop.sqlite` · `ExperimentalWarning` left visible | **ACCEPTED** — ratified at B02 | 2026-09-04 |
| D48 | Approval granularity: chunk-gated or group-gated | **ACCEPTED — B** (group-gated, chunk-committed, five solo) — **amends `CLAUDE.md` §5** | 2026-09-04 |
| D49 | Take §12's cut line now, or hold it | **ACCEPTED — C** (hold to the B36 gate; nothing cut) | 2026-09-04 |
| D50 | Where the demo script sits in the order | **ACCEPTED — B** (B61 runs as `docs/DEMO.md` from B36) | 2026-09-04 |
| D51 | `create_ad`'s `created_at` — client-supplied or derived from the decision's `ts` | **ACCEPTED — B** (derived) | 2026-09-04 |
| D52 | `daily_budget_cents` for the twelve seeded ads | **ACCEPTED — B** (hand-set, grounded in the expected-spend arithmetic; two ads near their cap) | 2026-09-04 |
| D53 | Does B15 backdate the seeded decisions, and thereby fix `T0`? | **ACCEPTED — B** (backdate; `T0` = seeder boot) | 2026-09-04 |

---

## DECISION #1 — Which surfaces are built for real

**Status:** ACCEPTED — option A · **Date:** 2026-09-03 · **Tag:** [LOAD-BEARING]

### Question

The brief (L129) asks for one or two of three surfaces built for real and the rest sketched,
with one constraint: whatever we pick *"must include a live signal path"* (L131). Signal can be
scoped down but not out. Which second surface joins Signal, and what does "sketched" mean for
the third?

### Options as presented

**A) Signal + Decision loop.** Workbench sketched. Fixed seeded set of ads; live stream,
metrics, action console, decision log, scoring. Closes the loop with the most depth; both
surfaces share one substrate, so effort compounds. Gives up component-level performance as a
demoed capability.

**B) Signal + Workbench.** Decision loop sketched. Full component library, ad builder,
versioning, reverse join, variant model. Strongest data-model story; the loop barely closes,
and its closure is the deliverable's stated minimum.

**C) Signal only, built very deep.** Both others sketched. Maximum engineering depth; fails
*"feel like a product, not wireframes"* (L151).

### Chosen

**A**, with the sketch specified as: an annotated mockup **plus one read-only component screen
showing the reverse join over live data.**

### Rationale — Seno's words

> "Signal + Decision loop built for real; Workbench sketched — annotated mockup plus one
> read-only component screen showing the reverse join over live data. Reasoning: the loop is the
> deliverable's stated minimum and I want it to be the spine of the build, not a bolt-on, and
> both surfaces sit on the same two logs so the fold, the restatement path and the traceability
> machinery each get built once. What I'm giving up: component-level performance as a demoed
> capability, and variant comparison in the UI. I'll answer the versioning question in prose and
> defend it there."

### Consequences

1. **The Workbench sketch is heavier than "sketched" usually implies.** The read-only component
   screen is a *working read path* over the live reverse join, not a drawing. It rides on the
   `ads` projection (plan item P4), so the marginal cost is one screen — but it is scope, and it
   is recorded here rather than absorbed silently.
2. **That screen is current-state only.** *"Used in N live ads"* is answerable. *"Used in N ads
   at time T"* and *"used in N ads ever"* are not — G38's second and third query forms stay
   unbuilt.
3. **`config_generations` gets built regardless** (plan item P5), because click-time attribution
   for late conversions needs it. So component-level performance is **one join away from
   existing**, not absent: the README can show the real query against real data rather than
   describe a hypothesis. This makes the stated give-up smaller than it sounds and should be said
   out loud in the design notes.
4. **The blocking-finding triage is now unconditional.** It was written assuming D1-A. Buckets
   are firm: **FIX 6 · SPECIFY 6 · NAME 0**, FIX costing **8 plan items**. See the triage section
   of `docs/BRIEF_GAPS.md`.
5. **Three findings are held in SPECIFY by this decision**, and would move to FIX under D1-B:
   G10 (component versioning — answered in prose, no lineage fields ship), G18 (event→component
   linkage), G28 (variant grouping — no `variant_group_id`, no comparison view).
6. **D4 is downgraded.** With the Workbench sketched, "is the unit managed the ad or the
   component" is largely a README paragraph rather than an IA build.

### What it forecloses

- Component-level performance as a **demoed** capability — stated explicitly by Seno as an
  accepted cost. The substrate survives (consequence 3); the surface does not.
- Variant comparison in the UI, and with it the visible half of the *"compounding what each ad
  teaches into the next one"* premise (L34).
- Component versioning as a **built** flow. It is answered and defended in prose only, which is
  what L111 asks for (*"Pick one and defend it"*) but not what a working copy-on-write editor
  would show.
- Reversal is **expensive**: adding a real Workbench later means an ad builder, a versioning UI,
  and the temporal reverse-join read path.

### How I'd defend this in review

The deliverable's one non-negotiable is a closed loop — signal, action, world responds — so the
loop should be the spine of the build rather than a bolt-on, and Signal and the Decision loop are
two views over the same two logs, so the fold, the restatement path and the traceability
machinery each get built once instead of twice.

---

## TRIAGE #1 — What we do about each blocking finding

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Tag:** [LOAD-BEARING] · **Depends on:** D1

### Question

Each of the 12 blocking findings in `docs/BRIEF_GAPS.md` needs exactly one disposition: **FIX**
(extend the contract and build it), **SPECIFY** (design it fully in the README, don't build it),
or **NAME** (state it as a known limit we tolerate). What is the FIX bucket's build cost, and is
it affordable?

### Provenance

Commissioned by Seno, classified by me, accepted with the instruction:

> "Add the FIX/SPECIFY/NAME tag to each blocking finding. Don't rewrite the existing
> recommendations — the register keeps the full option analysis; the choice lives in
> DECISIONS.md."

So `BRIEF_GAPS.md` carries a tag per blocking finding and keeps its pre-choice option analysis
unedited; this entry carries the choice, the cost, and what each trim gave up.

### Classification

| Gap | Short form | Bucket | Reason |
|---|---|---|---|
| G16 | No arrival timestamp | **FIX** | Irreversible if skipped — events ingested without it can never be given one. Every late-conversion mechanism depends on it. |
| G42 | Nothing defines when a period closes | **FIX** | The one mandatory misbehaviour, handled end to end. Needs horizon + settlement + restatement. |
| G17 | `attributed_click_id` dangles; no `click_id` | **FIX** | One field. Without it, conversion→click resolution is guesswork and click-time attribution cannot be built. |
| G19 | `spend` delta vs cumulative undefined | **FIX** | Cannot emit or ingest spend without pinning it. Near-zero marginal cost. Residue → NAME: the CPM/fee discriminator. |
| G33 | The fold has no origin | **FIX** | `create_ad` + `launch`. Without them the log is not self-contained and "recomputable from the event log" answers "not the config". |
| G01 | No config-generation identifier | **FIX** | Prerequisite for click-time attribution and for the traceability anchor. No substitute. |
| G04 | "Daily" has no day boundary | **FIX** | The timezone constant is required for *any* bucketing to be well-defined. Residue → SPECIFY: budget enforcement/pacing. |
| G18 | Events carry no component/config link | **SPECIFY** | The surface it serves — component-level performance — is the sketched Workbench (D1). Generations are built anyway, so the README shows the real query against real data. |
| G50 | `Ad.status` has dead states | **SPECIFY** | Its blocking half (draft→live unreachable) is resolved by G33's `launch`. Only `archive` remains, and nothing graded exercises it. |
| G34 | Two of five named levers missing | **SPECIFY** | Residue after G33/G50 is `clone_ad` and relaunch. The loop already closes via pause / set_budget / swap. |
| G10 | Component has no version/lineage | **SPECIFY** | Nothing edits components while the Workbench is sketched, so no editing → no versioning at runtime. L111 asks us to *pick one and defend it*, which is what SPECIFY delivers. |
| G28 | No variant/experiment entity | **SPECIFY** | `variant_group_id` is a free field; the comparison view is a surface. Deferred entirely. |

**Counts: FIX 6 · SPECIFY 6 · NAME 0.**

NAME is empty here by construction — a blocking finding is one we cannot merely tolerate. NAME
is where the non-blocking register lives (G43 retractions, G15 audience overlap, G21 gap
detection, G46 transient funnel violations, G05 USD-only, G29 no portfolio entity), and that set
becomes the README's tolerated-misbehaviours section per L123.

### FIX build cost

Plan items sized to `CLAUDE.md` §5 (one reviewable concern, ≤ ~150 lines of diff). These
pre-stage `docs/BUILD_PLAN.md`; they are not that document.

| # | Plan item | Closes |
|---|---|---|
| P1 | Ingest boundary: envelope extension (`received_at`, `ingest_seq`), dedupe on `event_id`, persist all deliveries, non-negative integer validation | G16 |
| P2 | Signal types + simulator emitter: `click_id`, spend as fixed-interval deltas | G17, G19 |
| P3 | Decision variants `create_ad` + `launch`, with compare-and-swap validation | G33 |
| P4 | Config fold + rebuildable `ads` projection from the log | G33 |
| P5 | `config_generations` table, maintained on every config-changing decision | G01 |
| P6 | Minute-bucket rollups + settlement state from the lateness horizon (incl. account timezone constant) | G42, G04 |
| P7 | Restatement path: a late arrival recomputes affected buckets and marks them restated | G42 |
| P8 | Click-time attribution for conversions + orphan parking / provisional counting | G01, G42 |

**Total: 8 plan items.** Pre-trim the list was 10.

### Consequences — the three trims, and what each cost

FIX started at 9 findings and ~9 contract extensions (`received_at`, `ingest_seq`, `click_id`,
spend `reason`, `create_ad`, `launch`, `archive`, `config_generations`, `config_generation_id`
on events). Three trims brought it to 6:

1. **G18 — event→generation stamping at ingest → SPECIFY.** *Saved 1 item.* Drops the
   `config_generation_id` column and the ingest resolution step; component-level metrics become
   a read-time join over `config_generations` by `(ad_id, ts)`. Cost: those metrics get slower
   and stay unbuilt — acceptable, because D1 sketches the surface consuming them. The substrate
   survives.
2. **G04 — budget enforcement/pacing → SPECIFY.** *Saved 1 item.* The timezone constant stays in
   P6, since bucketing is undefined without it. **The debatable one:** without pacing,
   `set_budget` changes a number without visibly changing the world, so "the world responds"
   rests entirely on `pause`. That meets the deliverable's minimum (L151 asks for *at least one*
   closable decision) but gives up a second, more interesting demonstration. **Reinstate first
   if budget frees up.**
3. **G50 — `archive` variant → SPECIFY.** *Saved ~0.5 item, folded into P3's slack.* `launch` is
   the transition that matters.

### What it forecloses

- **8 is the floor without giving up a graded criterion.** Reaching 6 would mean cutting P7
  (restatement) or P8 (click-time attribution + orphans); either breaks hard requirement #4 —
  one stream misbehaviour handled end to end. Late conversions would be *detected* but not
  *handled*, which is the gap between the brief's flagship requirement and a paragraph about it.
  The lever for further reduction is D1's sketch boundary, not this list.
- The six SPECIFY findings are answered in prose only. They are defensible as design, not
  demonstrable as behaviour.
- G19's residue (CPM vs fee discriminator) and G04's residue (budget pacing) are the two places
  where a partially-fixed finding could quietly read as fully fixed. Both are stated as residues
  here so the README does not overclaim.

### How I'd defend this in review

Every blocking finding got a disposition rather than a promise, the FIX bucket was costed at 8
reviewable chunks before any of it was built, and the three things cut are each cut for a stated
reason with the loss named — including the one I'd take back first if time allowed.

---

## DECISION #26 — Which slice ships (Phase 1 scope depth)

**Status:** ACCEPTED — option A, amended · **Date:** 2026-09-03 · **Tag:** [LOAD-BEARING]
**Depends on:** D1, T1 · **Resolves:** the residue of D6; fixes D24 at level D

### Question

D1 fixed which surfaces are real. It did not fix **depth** — how much of the event-correctness
and decision-loop machinery actually ships. About 55% of the build budget is a spine common to
every candidate; the question is how the remaining ~45% is spent, and which graded criterion is
left thin if time runs out.

### Options as presented

**A) Integrity-first.** The 45% goes to P5 generations, P7 restatement, P8 click-time attribution
+ orphans, and traceability at D24 level D. Strongest on Data & events; thinnest on "feels like a
product".

**B) Loop-first.** The 45% goes to budget pacing, decision scoring, and a `Recommendation` /
human-in-the-loop approval flow. Drops P5 and P8, so a late conversion is credited to the ad, not
to the generation live at its click. Same cost as A, spent on UI and a second entity.

**C) Component-truth.** Re-opens D1 toward its option B: a real Workbench read surface with the
temporal reverse join, Decision loop thin. Most expensive; requires rewriting D1, T1 and the
P1–P8 costing first.

Full option analysis, with pros/cons/forecloses/reversal cost and the effort split per line item,
is retained in `docs/OPEN_QUESTIONS.md` § DECISION #26.

### Chosen

**A, amended three ways:**

1. **Budget pacing reinstated**, funded from the data-health panel — not from traceability.
2. **The `trace <event_id>` endpoint is kept**, because it *is* the "life of one event"
   deliverable (L155), not a nice-to-have. Traceability therefore ships at **D24 level D** in
   full: drill-down + trace endpoint + rollup-vs-raw agreement test.
3. **No swap.** The human-in-the-loop approval flow does **not** displace click-time attribution;
   it is cut.

### Rationale — Seno's words

> "A with pacing, funded from the data-health polish, keep the trace endpoint (it's the 'life of
> one event' deliverable).
>
> No swap. Click-time attribution is req #4; the approval flow proves nothing about the event
> path. Cut list with the reason stated.
>
> Say plainly it re-affirms D1."

### Consequences

1. **It re-affirms D1 rather than changing course.** Stated plainly here and in `SCOPE.md`. The
   value D26 adds over D1 is depth: scoring, pacing, clone/variant and the approval flow are now
   on an explicit, ordered cut list with reasons, instead of being ambient.
2. **All eight FIX plan items ship.** P1–P8 are in scope in full; nothing in the FIX bucket was
   traded away to fund the amendment.
3. **G04's budget-pacing residue moves SPECIFY → FIX**, reversing trim #2 of TRIAGE #1 — which
   is exactly the item T1 named as "reinstate first if budget frees up". `set_budget` now visibly
   changes the world, so *"the world responds"* (L151) no longer rests entirely on `pause`.
4. **The pacing arithmetic balances at ~4%, not 6%.** Pacing was priced standalone; the simulator
   needs a diurnal rate curve regardless, so budget-as-pacing is a multiplier on an existing curve
   rather than new machinery. What is actually spent is the data-health **panel** as a designed
   surface; the counters are still computed and rendered plainly.
5. **Traceability is the protected line.** Funding pacing out of the panel rather than the trace
   endpoint records a priority: the two hard requirements #5 (traceability, demonstrable) and the
   "life of one event" deliverable outrank presentation of data-health.
6. **Nine cuts, ordered cheapest-to-reinstate-first**, in `docs/SCOPE.md` §4. Decision scoring
   sits at the top because it reads rollups that already exist.

### What it forecloses

- **Decision scoring in-product.** The log records what was tried and why, not whether it worked.
  Cheapest add-back; sits first on the cut line.
- **The human-in-the-loop demo** — system proposes with evidence, human approves. This is the most
  product-like moment available in the brief and the slice does not have it. Cut on the stated
  ground that it proves nothing about the event path, which is what Signal is graded on.
- **`clone_ad`, `archive`, relaunch, variant comparison** — the *"compounding what each ad teaches
  into the next one"* premise (L34) stays described rather than mechanised.
- **Component versioning as a built flow** and component-level performance as a demoed capability
  — already accepted under D1, unchanged here.
- Reversal is **cheap in one direction only**: everything cut is additive on top of this spine, so
  the slice can grow. It cannot shrink without giving up a graded criterion (see T1).

### How I'd defend this in review

The 45% of budget that was mine to allocate went to the two things the brief says it looks
hardest at — late-arriving conversions handled end to end, and every number on screen walkable
back to the raw events that produced it — plus the one lever that makes the world visibly respond;
everything else is on a written cut list ordered by what I'd reinstate first, with the reason for
each cut stated rather than implied.

---

# RATIFICATION PASS — D2, D5, D7–D14

**Date:** 2026-09-03. Ten decisions ratified in one batch, before `DESIGN.md`, because
`docs/SCOPE.md` was costed against these recommendations rather than against decisions. Each
entry below carries its own chosen option, consequences, what it forecloses, and a defence line;
the **full option analysis for every one of them is retained in `docs/OPEN_QUESTIONS.md` §B** and
is not duplicated here.

**Rationale — Seno's words (covering the batch):**

> "All ten ratified. D5 with archived — decide: leave it in the type as an unreachable state and
> name it in the README, or drop it and note the divergence. Your call, but pick one explicitly.
> D11 as 'no compaction, policy written up' — agreed, and better than C. D13 on settlement
> grounds, and put demo-mode horizon shortening in BUILD_PLAN as an item; with 72h and 7d
> backfill it's the only way a restatement happens on camera, so it's not optional. D8
> node:sqlite — approved, and the pragma check was the right way to answer that."

Three of the ten were flagged as moved before ratification (D5 qualified, D11 changed, D13
qualified); the other seven were ratified as written.

### Wording of record

Which of Seno's words ratified which decision. Verbatim; no sentence is paraphrased into an
entry's prose without appearing here first.

| # | Seno's words |
|---|---|
| D2 | *"All ten ratified."* |
| D5 | *"D5 with archived — decide: leave it in the type as an unreachable state and name it in the README, or drop it and note the divergence. Your call, but pick one explicitly."* |
| D7 | *"All ten ratified."* |
| D8 | *"D8 node:sqlite — approved, and the pragma check was the right way to answer that."* |
| D9 | *"All ten ratified."* |
| D10 | *"All ten ratified."* |
| D11 | *"D11 as 'no compaction, policy written up' — agreed, and better than C."* |
| D12 | *"All ten ratified."* |
| D13 | *"D13 on settlement grounds, and put demo-mode horizon shortening in BUILD_PLAN as an item; with 72h and 7d backfill it's the only way a restatement happens on camera, so it's not optional."* |
| D14 | *"All ten ratified."* |

Also recorded from earlier in the same pass, on the driver question:

> "Also note D8 needs the §5 dependency sign-off; tell me node:sqlite vs better-sqlite3 and why."

and, on this pass's scope:

> "Run the ratification pass now, before DESIGN.md — one message, the six presumed decisions with
> their recommendations restated in one line each, and flag any where the recommendation has
> changed since you wrote it. I'll ratify or amend in a batch."

**Count correction, for the record.** That instruction said *six*; `STATUS.md` had said nine in
prose while its own table spanned ten. The true set presumed by `SCOPE.md` was **ten** — D2, D5,
D7, D8, D9, D10, D11, D12, D13, D14 — and ten is what was presented and ratified. The
discrepancy was mine, in `STATUS.md`, and is fixed there.

---

## DECISION #2 — Is an ad a frozen bundle or a recipe over components

**Status:** ACCEPTED — option B · **Tag:** [LOAD-BEARING]

**Question.** L111 asks it directly. Options: A pure recipe (fold on every read) · **B recipe +
materialised `config_generations`** · C frozen bundle (snapshot payloads at launch).

**Chosen.** B. The authoring model is a recipe — that is what makes reuse and "used in twelve
ads" possible — and the historical model must be frozen, which is what makes a Tuesday conversion
attributable to Tuesday's creative. Generations give both.

**Consequences.** `config_generations` (P5) is a projection of the decision log, so it is
rebuildable and cheap to be wrong about — drop and re-fold. "Config as of T" becomes an indexed
lookup rather than a fold, which is what D14's click-time attribution needs.

**Forecloses.** Nothing significant; it is derived. C is the option rejected firmly — it looks
safest and quietly kills the component-reuse premise.

**Defence.** The brief poses this as a binary and the binary is false: generations give a live
recipe plus an immutable, addressable record of every recipe the ad has ever had.

---

## DECISION #5 — Where the fold starts

**Status:** ACCEPTED — option C, amended · **Tag:** [LOAD-BEARING]

**Question.** L125 claims current config is derivable by folding the log, but nothing creates an
ad, so the fold has no origin (G33) and half the lifecycle is unreachable (G50). Options: A seed
ads out-of-band · B add `create_ad` · **C add `create_ad` + `launch`**.

**Chosen.** C. Config is free while `draft` — nothing references it and no events exist — and
**once live, only levers touch it**. That is a sharper and more defensible rule than the brief's
own L42, and it makes "the initial state" a real, dated, attributable event.

**Amendment — the `archived` state.** D26 cut the `archive` lever (cut #3), so `archived` is
reachable by no lever. Seno delegated the call:

> "D5 with archived — decide: leave it in the type as an unreachable state and name it in the
> README, or drop it and note the divergence. Your call, but pick one explicitly."

I chose to **keep it in the type and name it in the README** rather than drop it from the enum.
Full disposition in § FOLLOW-UP F1. Reasoning: it is unreachable in our *lever set*,
not in the *domain* — a scope cut, which belongs on the cut line and in the notes, not encoded
into the domain type. Narrowing a declared enum is a change to the given contract requiring a
defence for no gain, and it would turn reinstating cut #3 from one decision variant into a type
change rippling through the fold, the `ads` projection and persisted rows.

**Consequences.** Draft edits are **not** in the log — acceptable because nothing references them,
and stated rather than implied. The fold's transition table carries one branch for `archived` that
can never fire; it is written as self-documenting ("no lever produces this state — see SCOPE §4
cut #3"), not as a thrown error. `launched_at` becomes a projection with exactly one writer (G02).

**Forecloses.** Nothing, in the keep-it direction — which is the point of choosing it.

**Defence.** Every config write on a live ad is a lever, every state that carries events is
reachable, and the one state that isn't is a scope cut named in the notes rather than a hole in
the model.

---

## DECISION #7 — Store the fold, the log, or both

**Status:** ACCEPTED — option C · **Tag:** [LOAD-BEARING]

**Question.** L125 asks it directly. Options: A log only, fold on read · B fold only, log
decorative · **C both, log authoritative, projections rebuildable**.

**Chosen.** C. The decision log is the source of truth; `ads` and `config_generations` are
projections rebuilt by replaying it; the UI reads projections.

**Consequences.** Nothing may write a projection except the replay/apply function — this is the
one discipline the design depends on. The rebuild path doubles as recovery if a projection bug
ships, and P14's agreement test makes "drop the projections, replay, watch identical numbers come
back" a runnable check rather than a claim.

**Forecloses.** Nothing — projections are disposable by construction.

**Defence.** It is the only arrangement where the brief's most interesting stated property, that
config is derivable, is exercised rather than merely asserted.

---

## DECISION #8 — Persistence boundary and store

**Status:** ACCEPTED — option A, driver `node:sqlite` · **Tag:** [LOAD-BEARING]
**Also constitutes:** the `CLAUDE.md` §5 dependency sign-off — of **no new dependency**.

**Question.** Where does the persistence boundary sit, and on what. Options: **A SQLite on the
server** · B JSON/NDJSON file · C IndexedDB in the browser · D Postgres via Docker. Then:
`node:sqlite` vs `better-sqlite3`.

**Chosen.** A with `node:sqlite`. **The boundary: the server owns every fact** — event log,
decision log, projections. **The client owns nothing durable** — it holds a live view built from
a snapshot plus a stream, and a refresh rebuilds it from the server.

**Rationale — Seno's words:**

> "D8 node:sqlite — approved, and the pragma check was the right way to answer that."

**Evidence for the driver.** Verified on this machine rather than recalled: Node v24.14.0;
`node:sqlite` loads unflagged, exporting `DatabaseSync, StatementSync, Session, constants,
backup`; `PRAGMA journal_mode = WAL` returns `wal`; `busy_timeout` sets; manual
`BEGIN`/`COMMIT`/`ROLLBACK` behave correctly. It prints one `ExperimentalWarning` on boot.
`better-sqlite3` adds a `.transaction()` helper and pragma sugar at the cost of a native addon
whose install can fail on a reviewer's machine when no prebuild matches their Node ABI.

**Consequences.** Prerequisite becomes "Node 24+", pinned in `engines` and `.nvmrc` and stated in
the README. The transaction wrapper is ~10 lines we write. **Flip condition, fixed now so it is
not a later judgement call:** if a `node:sqlite` sharp edge costs more than half a chunk, swap to
`better-sqlite3` — both APIs are synchronous `prepare`/`get`/`all`/`run` behind one store module,
so the port is mechanical.

**Forecloses.** C is the option rejected on principle: it passes the refresh test and fails the
premise, because the world becomes an artifact of the viewer's browser profile and the simulator
would have to run in the client.

**Defence.** The one install failure we cannot debug is on the reviewer's machine, and a built-in
removes it entirely; what the native addon buys over it is a transaction wrapper we can write in
ten lines, which is not worth a dependency when "run it in one command" is a stated deliverable.

---

## DECISION #9 — Aggregation granularity

**Status:** ACCEPTED — option C · **Tag:** [LOAD-BEARING]

**Question.** L121: raw forever, or rolled into buckets? Options: A raw only · B rollups only,
raw discarded · **C hybrid: raw retained, rollups as a rebuildable projection**.

**Chosen.** C, minute as the base bucket, hours derived from minutes.

**Consequences.** "Drill into this bucket" is a query over raw events that must agree with the
bucket — which is exactly the check the brief asks for, and now a test we run (P14) rather than a
claim we make. Late arrivals correct rollups through P7's restatement path.

**Forecloses.** Nothing. B was rejected outright: discarding raw events destroys the traceability
criterion (L143) and makes restatement lossy.

**Defence.** The rollup-versus-raw agreement check is not overhead on top of the deliverable — it
*is* the deliverable, so building both representations and comparing them is the feature.

---

## DECISION #10 — Where CTR, CPA and ROAS are computed

**Status:** ACCEPTED — option B · **Tag:** [LOAD-BEARING]

**Question.** L121: write time, read time, or cached between? Options: A write time · **B read
time from stored counts** · C cached read-through.

**Chosen.** B, as a flat rule: **rollups store only additive counts** — impressions, clicks,
`spend_cents`, conversions, `value_cents` — **and every ratio is derived at read time.**

**Consequences.** Correct at every granularity by construction, because ratios do not aggregate
but their numerators and denominators do. The restatement path only ever has to fix integers.

**Forecloses.** Nothing. A was effectively disqualified: re-aggregating stored ratios across
buckets is arithmetically wrong, which is a correctness bug wearing a performance costume.

**Defence.** Store counts, derive ratios — one rule, and it makes "CTR over any window" right
without a special case anywhere.

---

## DECISION #11 — Compaction, and what it forecloses

**Status:** ACCEPTED — option A, with C specified · **Tag:** [LOAD-BEARING]

**Question.** L121 asks what we compact away and what becomes unanswerable. Options: **A no
compaction** · B compact raw past the horizon · C compact impressions, retain clicks and
conversions forever.

**Chosen.** A — no compaction is built. C is written up in the README as the policy we would
adopt, with what it forecloses stated precisely.

**Changed since first recommended.** The original recommendation was C. D26's cut #8 removed
compaction from the build, and Seno ratified the change with *"agreed, and better than C."*

**Consequences.** Inside a seven-day horizon there is nothing to compact, so implementing C would
have meant building a mechanism that never fires during the demo. The brief asks what you compact
away **and what becomes unanswerable** — a question answerable in full in prose. Retention is
therefore unbounded in principle, which is stated rather than hidden.

**Forecloses.** Nothing, in the sense that no information is destroyed — which is itself the
answer to the question the brief asks.

**Defence.** The honest answer for a days-long demo is that nothing needed compacting, paired
with the exact policy we would adopt and the exact questions it would cost us — rather than
shipping a code path that never executes in front of the reviewer.

---

## DECISION #12 — Extend the event envelope with `received_at` and `ingest_seq`

**Status:** ACCEPTED — option C · **Tag:** [LOAD-BEARING] · **Contract extension**

**Question.** `ts` is defined as event time, not arrival time (L73), and no arrival field exists
(G16). Options: A `received_at` only · B `ingest_seq` only · **C both** · D approximate
client-side.

**Chosen.** C. Both are **server-assigned at our ingest boundary, never emitter-assigned.**
`received_at` is what the UI shows and what lateness (`received_at − ts`) is computed from;
`ingest_seq` is the total order for replay, the SSE reconnect cursor via `Last-Event-ID`, and the
tie-break for colliding timestamps (G22).

**Consequences.** This is the highest-priority extension in the project and gets its own entry in
the README's extensions section per L40. The asymmetry that makes it urgent: adding the fields
costs two columns; omitting them costs the data **permanently**, since events already ingested
cannot be given an arrival time afterwards.

**Forecloses.** Nothing. D was a trap — it makes the mandatory mid-demo refresh (L157) destroy the
evidence.

**Defence.** Everything the brief says it cares most about in Signal is a statement about arrival
time, and the given contract has no way to express arrival, so we added the two fields that do
and kept the emitter out of assigning them.

---

## DECISION #13 — Lateness horizon and restatement policy

**Status:** ACCEPTED — option A, amended · **Tag:** [LOAD-BEARING]

**Question.** Nothing in the brief defines when a period is closed (G42). Options: **A fixed
horizon** · B dynamic watermark · C never close.

**Chosen.** A at **72h**, configurable and displayed, plus C's as-of stamp on every displayed
number. Arrivals past the horizon are stored and counted separately, never dropped.

**Qualified since first recommended.** The horizon was justified on two grounds: UI settlement
states, and guarding decision scoring against lateness bias. D26 cut scoring (cut #1), so only the
first ground remains — and it carries the horizon alone, since P6/P7 need a settlement boundary to
mark buckets restated. Separately, "past-horizon arrivals counted but excluded" was a data-health
display and D26 cut the panel (cut #2); per D26 consequence 4 the counters still compute and
render plainly. Ratified by Seno explicitly *"on settlement grounds"*.

**Amendment — demo mode is not optional.** Seno's words:

> "put demo-mode horizon shortening in BUILD_PLAN as an item; with 72h and 7d backfill it's the
> only way a restatement happens on camera, so it's not optional."

Recorded as **P16** in `docs/SCOPE.md` §2. Its real cost is not the control but the recompute:
shortening the horizon must re-evaluate which buckets are settled, so P16 is a settlement
re-evaluation path, not a config toggle.

**Consequences.** The UI gains three honest states — live, settled, restated. With 7d backfill and
a 72h horizon, backfilled data is settled and live data is not, which is why P16 exists.

**Forecloses.** Genuinely-late events past the horizon are excluded from headline numbers —
mitigated by counting and displaying them, because an honest exclusion is a feature and a silent
one is the bug the brief warns about.

**Defence.** A fixed, stated, adjustable horizon is exactly the *"well-chosen heuristic, honestly
presented with its limits"* the brief prefers, and shortening it live is how the reviewer watches
a number restate rather than being told that it would.

---

## DECISION #14 — Which config generation credits a late conversion

**Status:** ACCEPTED — option B · **Tag:** [LOAD-BEARING]

**Question.** A conversion arrives Thursday for a Tuesday click on an ad whose video was swapped
Wednesday. Options: A credit the generation live at the conversion's `ts` · **B credit the
generation live at the attributed click's `ts`** · C credit at `received_at`.

**Chosen.** B, stated once and applied everywhere: **conversions are credited to the config
generation that was live at the time of the attributed click.**

**Consequences.** Requires resolving the click, hence orphan parking and provisional counting
(P8, D16). A conversion can land in a settled bucket, forcing restatement — which is the
machinery P7 builds anyway, so the marginal cost is low and the design is coherent rather than
incremental.

**Forecloses.** A was the tempting shortcut that silently rewards the wrong creative — a post-swap
creative collecting a windfall from its predecessor, which is precisely backwards for evaluating
the swap. C makes attribution a function of our own server's latency.

**Defence.** It is the only rule under which "did the swap help?" is answerable, and D26 protected
it explicitly on the ground that click-time attribution is hard requirement #4 and the approval
flow proves nothing about the event path.

---

# FOLLOW-UPS — F1, F2

Two items from the ratification pass that were instructions rather than ratifications. Recorded
as their own entries because each has a disposition that outlives the pass.

---

## FOLLOW-UP F1 — Disposition of `Ad.status: "archived"`

**Status:** DECIDED — keep in the type · **Date:** 2026-09-03 · **Decided by:** me, delegated
**Relates to:** D5, D26 cut #3, G50

**The instruction — Seno's words:**

> "D5 with archived — decide: leave it in the type as an unreachable state and name it in the
> README, or drop it and note the divergence. Your call, but pick one explicitly."

**Options.** A) keep `archived` in the enum, unreachable, named in the README ·
B) drop it from the enum and record the narrowing as a divergence from the given contract.

**Chosen. A — keep it, name it.**

**Why.** `archived` is unreachable in *our lever set*, not in the *domain*. That distinction is
the whole argument: an unreachable state here is the visible shadow of a scope cut, and scope cuts
belong on the cut line and in the notes, not encoded into a domain type where a later reader
cannot tell a deliberate omission from a modelling claim. Three supporting reasons:

1. **Narrowing the given contract needs a defence and buys nothing.** `Ad.status` is quoted from
   the brief (L49). Dropping a declared member is a *change* to the contract, which §8 obliges us
   to call out — the same README line either way, for strictly less fidelity.
2. **It keeps cut #3 cheap.** `archive` sits at #3 on the cut line, i.e. expected to be
   reinstated. With the member present, reinstatement is one decision variant plus one transition.
   With it dropped, it is a type change rippling through the fold, the `ads` projection, and rows
   already persisted in SQLite.
3. **Enum narrowing is worse after persistence exists.** `status` is written into the projection
   and stored; a narrowed enum makes old rows unrepresentable in the type that reads them.

**Cost, stated plainly.** The fold's transition table carries one branch that can never fire.
Under TypeScript strict an exhaustive `switch` must handle it. It is written to explain itself —
*"no lever produces this state; see `SCOPE.md` §4 cut #3"* — rather than as a thrown error, because
an unreachable branch that throws reads as a bug guard and this is not a bug.

**What it forecloses.** Nothing. Both directions stay open: reinstating `archive` is one variant,
and dropping the member later is the same edit it is today.

**How I'd defend this in review.** The type still matches the brief's, and the one state we can't
reach is named as a scope cut with the lever that would reach it sitting third on a written cut
line — which is a more honest artifact than a quietly shortened enum.

---

## FOLLOW-UP F2 — Demo-mode horizon shortening is a build item, not a toggle

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Relates to:** D13, P16

**The instruction — Seno's words:**

> "D13 on settlement grounds, and put demo-mode horizon shortening in BUILD_PLAN as an item; with
> 72h and 7d backfill it's the only way a restatement happens on camera, so it's not optional."

**Recorded as.** **P16** in `docs/SCOPE.md` §2, marked not-optional, with the reason stated inline
so it cannot be mistaken for polish. It will carry into `docs/BUILD_PLAN.md` as its own item when
Phase 4 writes that file; `SCOPE.md`'s P-list is the pre-staging vehicle for it, as it is for
P1–P8 per T1.

**Consequences.** The arithmetic behind "not optional" is worth keeping written down: with a 72h
horizon and 7d of accelerated backfill, backfilled buckets are already settled and live buckets
never reach settlement inside a demo, so **no restatement is observable at the default horizon**.
P7 would be built, correct, and invisible.

The cost is the recompute, not the control. Shortening the horizon must re-evaluate which buckets
are settled — buckets that were live become settled, and a late arrival into one of those must
then mark it restated. So P16 is a settlement re-evaluation path with a control on it, and it is
sized as such rather than as a config field.

**What it forecloses.** Nothing. It also incidentally makes the horizon's effect *testable* —
sweep the horizon, assert which buckets change state — which is a cheap addition to P14's
agreement test.

**How I'd defend this in review.** The lateness horizon is only an honest heuristic if a reviewer
can watch it bite, so the control that makes a restatement happen on camera is part of the
feature rather than a demo affordance bolted on afterwards.

---

# PHASE 2 DESIGN PASS — D27–D32, and the Phase-2 ratification block

**Date:** 2026-09-03. Presented before `docs/DESIGN.md` was written, on Seno's instruction:

> "Phase 2: design. Produce docs/DESIGN.md. Work through it as a sequence of DECISIONs and stop
> for my answers before writing the doc — don't write the doc around your own preferences and
> then ask me to rubber-stamp it."

Six new decisions (D27–D32) plus ratification of nine carried-over decisions, eight cheap
defaults and seven assumptions. **Full option analysis for D27–D32 is retained in
`docs/OPEN_QUESTIONS.md` § Wave 5** and is not duplicated here; for the carried-over nine it is in
`docs/OPEN_QUESTIONS.md` §B, waves 1–4.

Three residues remain open out of this pass — **D33** (maturity indicator basis), **D34** (raw-tail
quarantine mechanism), and an amendment to **D20** (the sample-size gate) — see § Residues.

### Wording of record

| # | Seno's words |
|---|---|
| D27 | *"go with B. But settlement being on/off doesn't explain why the current window looks half-empty, so add a maturity indicator per bucket, something like what fraction of the conversion window has elapsed. And put it in DESIGN.md that CTR is live while CPA and ROAS lag by cohort — that's a real product consequence, not a footnote."* |
| D28 | *"A. Worth noting it composes with D27-B: the click's minute already carries the click's generation, so the only precision we lose is on a straddled minute."* |
| D29 | *"D29 — A."* |
| D30 | *"C. But how is 'the raw tail is never summed' actually enforced? Convention will erode. I want it structural."* |
| D31 | *"D31 — B, yes."* |
| D32 | *"B, but not for the SCOPE.md reason. That promise was written on a recommendation I hadn't ratified yet, so citing it is circular. The reason is that received_at means nothing if the emitter and consumer share a tick."* |
| D22 | *"America/New_York. The audiences are US, so a UTC day rolls the budget mid-peak and we'd spend the demo explaining a pacing artifact. State the DST path as untested."* |
| D20 | *"the gate has to scale with the window or be a rate. 500 impressions would suppress everything in a one-minute view. Constants are otherwise fine."* |
| D3, D4, D15, D16, D18, D19, D21, D23, D25 | *"Part 2 as written. D3, yes to the seeded lineage columns."* |
| Cheap defaults 1–8 | *"Part 3 all fine."* |
| U1–U7 | *"Part 4 as a block — but U2 means D24's compare-and-swap concurrency is hypothetical, so don't present it as a live feature"* |

---

## DECISION #27 — Which time bucket a conversion's value lands in

**Status:** ACCEPTED — option B, amended · **Tag:** [LOAD-BEARING] · **Depends on:** D13, D14
**Residue:** D33

**Question.** D14 settled which config generation credits a late conversion; it did not settle
which minute bucket the conversion's count and value are added to. Options: A recognition-time
(the conversion's own `ts`) · **B cohort-time (the attributed click's `ts`)** · C both, dual
columns. Full analysis: `OPEN_QUESTIONS.md` § Wave 5 · D27.

**Chosen.** B. A bucket is *"activity at time T, and everything it eventually earned"*. Conversion
count and `value_cents` are credited to the minute containing the attributed click's `ts`.

**Amendment — the maturity indicator.** Seno's words:

> "settlement being on/off doesn't explain why the current window looks half-empty, so add a
> maturity indicator per bucket, something like what fraction of the conversion window has
> elapsed."

D13's live/settled/restated states are a *binary* claim about finality. Under B a young bucket is
not merely "unsettled", it is **predictably incomplete by a knowable amount**, and the UI owes the
strategist that amount rather than a badge. The indicator's basis is D33.

**Amendment — the lag is a product consequence, not a footnote.** Seno's words:

> "put it in DESIGN.md that CTR is live while CPA and ROAS lag by cohort — that's a real product
> consequence, not a footnote."

`DESIGN.md` states it as a first-class property: **CTR is readable in near-real-time because both
its numerator and denominator land at their own `ts`; CPA and ROAS lag by the click-to-conversion
distribution because their numerator is credited backwards.** The two metric families are
therefore not interchangeable for a real-time decision, and the surface must say so.

**Consequences.**
1. The restatement path must be **generic** — "a fact changed, recompute affected buckets" —
   because an orphan (D16) has no click and so no legitimate bucket: it is counted provisionally
   at its own `ts` and *moved* on resolution, which is a two-bucket restatement. This retires the
   last argument for special-casing lateness, and makes D25's `conversion_void` extension nearly
   free as predicted.
2. `conversions ≤ clicks` (G46) holds *within a settled bucket*, so the funnel invariant becomes
   checkable rather than permanently violable.
3. "Revenue booked today" stops being a rollup read. It remains answerable by a raw scan (D9), and
   is not built.
4. The restatement demo reaches back days rather than hours, which is what makes P16's horizon
   shortening land on camera.

**Forecloses.** Recognition-time as a *pre-aggregated* view. Not as a view at all — raw is retained
forever — but nothing in the slice reads it.

**Defence.** Under recognition-time, ROAS(T) divides revenue recognised in T by spend in T, whose
populations are unrelated — a ratio that measures nothing; cohort placement is the only rule under
which the brief's own sentence about conversions *"retroactively changing periods you thought were
closed"* describes what our system actually does.

---

## DECISION #28 — What the minute rollup is keyed by

**Status:** ACCEPTED — option A · **Tag:** [LOAD-BEARING] · **Depends on:** D7, D9, D27

**Question.** D9 fixed minute as the base bucket and D10 fixed additive counts; neither fixed the
key. Options: **A `(ad_id, minute_start)`** · B `(ad_id, config_generation_id, minute_start)` ·
C A plus a second generation-keyed rollup. Full analysis: `OPEN_QUESTIONS.md` § Wave 5 · D28.

**Chosen.** A. Per-generation numbers come from joining buckets to `config_generations` validity
intervals by time; exact numbers come from raw.

**Composition with D27 — Seno's words:**

> "Worth noting it composes with D27-B: the click's minute already carries the click's generation,
> so the only precision we lose is on a straddled minute."

Recorded because it is the argument that makes A safe rather than merely cheap. Under D27-B a
conversion sits in its click's minute, and D14 credits it to the generation live at the click's
`ts` — which is the generation covering that minute. So the bucket→generation join by time is
*already* D14-compliant; it is not an approximation of the attribution rule, only of the minute in
which a generation boundary falls.

**Consequences.** The hot read — Signal, last N minutes × 8–12 ads — is one index range scan on
the rollup's primary key. Restatement touches one row per affected bucket. A swap at 14:03:27
assigns the whole of minute 14:03 to one generation; that is one minute of one ad per swap, stated
in the README rather than silently absorbed.

**Forecloses.** Exact per-generation totals *from rollups alone*. Not from raw.

**Defence.** It looks like the expensive schema decision and is not, because D7 makes rollups
disposable — re-keying is a re-fold, not a migration — so the small key buys the fastest read path
for the surface built deep and gives up precision only on the surface that is sketched, where the
exact answer is one raw scan away.

---

## DECISION #29 — When the rollup counts are maintained

**Status:** ACCEPTED — option A · **Depends on:** D9, D10

**Question.** L121's write-time / read-time / cached question, for the *counts* — D10 already
answered it for the ratios. Options: **A ingest-time incremental** · B lazy materialisation with
invalidation · C periodic batch sweep. Full analysis: `OPEN_QUESTIONS.md` § Wave 5 · D29.

**Chosen.** A. Each accepted event, in the same transaction as its canonical insert, applies
`INSERT … ON CONFLICT DO UPDATE` to its bucket.

**Consequences.** A late arrival is the *identical* code path — it updates an older bucket and sets
`restated_at` — so P7 is a flag and a fan-out, not a second mechanism. Reads are lookups, so the
"pause and watch it stop" moment is immediate. Cheap to reverse: rollups are rebuildable (D7) and
the maintenance strategy does not touch the schema.

**Forecloses.** Nothing. C was rejected on demo grounds — a sweep interval is a visible lag between
"event arrived" and "number moved", and it makes P14's agreement test racy against its own writer.

**Defence.** The simple option is also the one that makes normal ingest and restatement the same
code, which is the only reason P7 is small enough to ship inside this slice.

---

## DECISION #30 — What crosses the wire: the snapshot + stream contract

**Status:** ACCEPTED — option C · **Tag:** [LOAD-BEARING] · **Depends on:** D8, D12, D18
**Residue:** D34

**Question.** D18 fixes the transport, not the payload; cold start and how the UI learns a number
changed are both this. Options: A raw events only, client aggregates · B server-computed bucket
rows only · **C B plus a bounded raw tail**. Full analysis: `OPEN_QUESTIONS.md` § Wave 5 · D30.

**Chosen.** C. **Absolute bucket rows are the only source of any displayed performance number.** A
capped raw tail rides a second frame type and drives the live event feed only.

**Consequences.**
1. **Cold start, refresh and reconnect are one path.** Empty client → `GET /snapshot` returns the
   window's buckets plus the current `ingest_seq` → SSE resumes from that cursor. The mandatory
   mid-demo refresh (L157) is therefore uneventful by construction, not by care.
2. **Frames are absolute, not deltas.** A delta replayed after a reconnect double-counts; an
   absolute row is idempotent. This is what makes resume safe rather than merely usual.
3. **Restatement needs no new channel** — it is an absolute row for an older minute carrying
   `restated_at`, so "the UI learns the number changed" is the same mechanism as "the UI learns
   the number grew".
4. **Backpressure has a stated answer.** Bucket rows coalesce per `(ad_id, minute)` on a
   ~250–500 ms flush tick and are never dropped; the raw tail is capped per tick and drops with a
   visible "N events not shown" counter rather than growing an unbounded queue.

**Forecloses.** Client-side aggregation of displayed numbers, deliberately. Option A was rejected
because the moment the client owns the arithmetic, *"trace the number back and check they agree"*
compares the client to itself.

**Open residue — Seno's words:**

> "how is 'the raw tail is never summed' actually enforced? Convention will erode. I want it
> structural."

Correct, and the quarantine is load-bearing: it is the single rule that keeps the single-
implementation guarantee true. Mechanism is **D34**, unanswered.

**Defence.** One implementation of the arithmetic, on the server, with the wire carrying idempotent
absolute rows — so a refresh, a reconnect and a restatement are the same code path, and the live
event ticker that makes the surface feel like a stream is structurally incapable of contributing
to a number.

---

## DECISION #31 — The traceability anchor

**Status:** ACCEPTED — option B · **Tag:** [LOAD-BEARING] · **Depends on:** D24 (level D), D26

**Question.** D26 fixed traceability at level D — drill-down (P12), `trace <event_id>` (P13),
agreement test (P14) — without fixing how a number on screen names the events behind it. Options:
A client-constructed query · **B server-issued trace descriptor** · C named query registry. Full
analysis: `OPEN_QUESTIONS.md` § Wave 5 · D31.

**Chosen.** B. Every metric value the server sends carries `{metric, ad_id, from, to,
placement_rule, generation_scope, as_of_ingest_seq}`. Clicking it posts the descriptor back; the
server replays **from raw** under exactly that descriptor and returns the recomputed figure plus
the contributing `event_id`s. The UI renders both and asserts equality visibly.

**Consequences.**
1. **P12, P13 and P14 become one mechanism.** The drill-down is a descriptor replay; `trace
   <event_id>` is that function run backwards; the agreement test is that function swept over every
   bucket. Three plan items, one function.
2. `as_of_ingest_seq` is what makes restatement *demonstrable*: re-run the same descriptor later,
   get a different figure, and attribute the difference to named late events.
3. The descriptor carries `placement_rule`, so D27-B is inspectable at the point of use rather than
   being a fact about the README.
4. It also supplies the compile-time hook D34 needs — a number with no descriptor has nothing to
   render through.

**Forecloses.** Nothing.

**Defence.** A debug log proves the number to me; an assertion rendered beside the number proves it
to the reviewer, live, on a figure they chose — and it costs only the descriptor plumbing, because
the replay function underneath it is the one the agreement test needed anyway.

---

## DECISION #32 — Simulator topology, and where the ingest boundary sits

**Status:** ACCEPTED — option B · **Tag:** [LOAD-BEARING] · **Depends on:** D12 · **Slice of:** D17

**Question.** A narrow slice of D17 pulled forward, because P1's ingest boundary is designed in
`DESIGN.md` and D12 requires `received_at` / `ingest_seq` to be assigned at our ingest boundary and
never by the emitter. The rest of D17 remains open for Phase 3. Options: A in-process ·
**B separate process → HTTP `POST /ingest`** · C separate process, shared SQLite file. Full
analysis: `OPEN_QUESTIONS.md` § Wave 5 · D32.

**Chosen.** B, launched alongside the server by a small zero-dependency spawner so *"run in one
command"* (L151) still holds.

**Rationale — Seno's words, and a correction to mine:**

> "B, but not for the SCOPE.md reason. That promise was written on a recommendation I hadn't
> ratified yet, so citing it is circular. The reason is that received_at means nothing if the
> emitter and consumer share a tick."

The recommendation as presented cited `SCOPE.md` §2's guarantee that the simulator process can be
killed and restarted mid-demo. That was circular: the guarantee was written into `SCOPE.md` on the
strength of an unratified recommendation, so it could not then be evidence for ratifying it. The
ratified ground is narrower and better: **`received_at` is only a measurement if the emitter and
the consumer are separated by something that can be slow, drop, batch or stall.** In-process, it is
a same-tick constant wearing the name of an observation, and every lateness figure derived from it
inherits that.

**Provenance note.** `SCOPE.md` §2's promise is now valid, ratified after the fact by this entry
rather than before it. Recorded because `SCOPE.md` §2 is README-verbatim, and a forward-committed
promise in that block is worth being able to spot.

**Consequences.** The ingest boundary is an HTTP endpoint with exactly one owner of validation,
dedupe, `received_at` and `ingest_seq`. Killing the simulator stalls the stream visibly (G21's
liveness display) and restarting it backfills, which exercises the late path without special
casing. Backpressure is real and observable at the endpoint rather than hypothetical.

**Forecloses.** Nothing. Both directions are a small change behind one `ingest()` function; C is
rejected outright because two writers destroy the single owner of `ingest_seq`.

**Defence.** Arrival time is the field the entire late-conversion story is built on, and it is only
an honest measurement if the emitter and the consumer are genuinely separated — so the boundary is
a process boundary, and killing the emitter mid-demo is a thing the reviewer can watch.

---

# PHASE-2 RATIFICATION BLOCK

Nine carried-over decisions, eight cheap defaults and seven assumptions, ratified 2026-09-03 in the
same pass. Full option analysis for the nine is in `docs/OPEN_QUESTIONS.md` §B, waves 1–4.

**Seno's words:** *"Part 2 as written. D3, yes to the seeded lineage columns."* · *"Part 3 all
fine."* · *"Part 4 as a block — but U2 means D24's compare-and-swap concurrency is hypothetical, so
don't present it as a live feature"*

## The nine

| # | Status | Chosen | Note carried into `DESIGN.md` |
|---|---|---|---|
| **D3** | ACCEPTED — B, extended | Copy-on-write with `lineage_id` / `version` / `parent_id` | Prose-only per D1 — no editor ships. **The three columns ship anyway, seeded so one component has two versions**, so the component screen's "per version or per lineage?" answer is concrete rather than hypothetical. |
| **D4** | ACCEPTED — C | Ad = unit of action, component = unit of analysis | README paragraph per D1. |
| **D15** | ACCEPTED — C | First-write-wins for aggregates; **every delivery persisted**; conflicts surfaced | Feeds the DDL and the misbehaviour table. |
| **D16** | ACCEPTED — C, restated under D27 | Provisional counting, visible re-attribution, orphan health counter | **Restated by D27-B**: provisional placement is the conversion's own minute, and resolution *moves* it to the click's minute — a two-bucket restatement. |
| **D18** | ACCEPTED — A | SSE with `Last-Event-ID` = `ingest_seq` | D30 builds the payload contract on it. |
| **D19** | ACCEPTED — cut | Decision scoring cut by D26 | Cut #1, stated. |
| **D21** | ACCEPTED — A | Two stores, shared envelope `{id, ts, received_at, ingest_seq}`, merged at read | This is the answer to `DESIGN.md` §1 — configs, signals and levers distinct in storage. |
| **D23** | ACCEPTED — B | Two slots kept; `image` / `body_copy` are library-only | Follows D1. Gets a `BRIEF_GAPS` entry. |
| **D25** | ACCEPTED — A, B specified | Retractions out of scope; `conversion_void` specified in the README | D27's orphan consequence already forces the generic restatement path, so B's "nearly free" claim is now demonstrated rather than asserted. |

**D20** was ratified only in part — constants accepted, gate mechanism sent back. See § Residues.

**D22 — ACCEPTED: account timezone `America/New_York`, budget as a pacing parameter.** This
unblocks P6. Seno's words:

> "America/New_York. The audiences are US, so a UTC day rolls the budget mid-peak and we'd spend
> the demo explaining a pacing artifact. State the DST path as untested."

Buckets are stored in UTC; only the day boundary is account-local, computed with built-in `Intl`
(no dependency). **Consequence:** with US audiences, a UTC midnight rollover falls in the middle of
the US afternoon peak, so the budget would reset mid-peak and the pacing curve would show a
discontinuity that is an artifact of our clock choice rather than a property of the domain — the
demo would be spent explaining it. Choosing a non-zero offset also keeps G04 visible as a *choice*;
UTC hides that one was ever made. **Stated limit:** no DST transition falls inside a September
seven-day window, so the DST path is correct by construction and **untested in the demo window** —
written up as a named limit, not left implicit.

## The eight cheap defaults

Ratified as a block; each is low-cost to reverse and written into `DESIGN.md` as a stated default.

1. **Reverse join (G38)** — current-state only (fixed by D1), computed by scanning the `ads`
   projection on read. At 8–12 ads a maintained index is dress-up.
2. **Delivery storage** — `signal_deliveries` (every delivery, PK `delivery_seq`) + `signals`
   (canonical, PK `event_id`, first write wins). Two tables, not one with a flag.
3. **Orphan storage** — `attribution_state` + nullable `resolved_click_event_id` on the canonical
   conversion row; no separate pending table.
4. **Clock skew (G44)** — clamp future-dated `ts` to `received_at`, count it, never reject.
5. **Events for a non-live ad (G48)** — never reject on ad status; count arrivals that should not
   exist as a self-check, since under our own simulator they should be zero.
6. **Funnel violations (G46)** — show unclamped with an "unsettled" marker and the orphan count
   beside it; never clamp.
7. **Divergence detection (D7's "both")** — a `/verify` endpoint rebuilding projections into temp
   tables and diffing, run at boot in dev. P14 extended from rollups to the fold.
8. **`Ad.created_at` and `Ad.name` (G03)** — both added; a stable name matters precisely because
   components swap underneath it.

## The seven assumptions

**U1–U7 ratified as a block** (`OPEN_QUESTIONS.md` §C). U1 was gated on `DESIGN.md` finalising and
is now answered; the rest are answered ahead of their build gates.

| # | Ratified as |
|---|---|
| U1 | USD only; no currency field, no FX |
| U2 | Single user; `actor` is a hard-coded `human:` string |
| U3 | Audiences and channels are static reference data; no lever changes them |
| U4 | One conversion kind; `value_cents` is gross revenue |
| U5 | Decisions exactly-once, idempotent on `decision_id` |
| U6 | Money fields non-negative integers, enforced at ingest |
| U7 | `Decision.ts` is request time; effects immediate; backdating rejected |

**U2's consequence for compare-and-swap — Seno's words:**

> "U2 means D24's compare-and-swap concurrency is hypothetical, so don't present it as a live
> feature"

The compare-and-swap in question is **G24's** — the `from_cents` / `from_id` precondition on
`set_budget` and `swap_component`. It ships, because it is one comparison and it catches the
failure that *can* happen under U2: a stale browser tab, a double-submit, or a retried POST
applying a lever against config it no longer describes. What does **not** ship, and must not be
claimed, is the multi-actor story — two strategists racing, or a human racing
`system:fatigue_rule`. With a single hard-coded actor and no `Recommendation` entity (D26 cut #6),
there is no second writer, so concurrency control is **a staleness guard, not a concurrency
feature**, and `DESIGN.md` and the README say exactly that.

---

# RESIDUES OF THE PHASE 2 PASS — D33, D34, D20 amendment

Three items opened by Seno's answers and not yet closed. `docs/DESIGN.md` is blocked on all three.

| # | What is open | Opened by |
|---|---|---|
| **D33** | The basis for D27's per-bucket maturity indicator: elapsed fraction of the horizon, an empirical attribution-lag CDF, or a fixed stated curve | D27 amendment |
| **D34** | The structural mechanism enforcing that raw-tail frames can never contribute to a displayed number | D30 |
| **D20** | The sample-size gate must scale with the window or be a rate; the fixed 500-impression form fails a one-minute view. Constants otherwise accepted | D20 partial ratification |

---

# RESIDUE CLOSE — D33, D34, D20 amendment

**Date:** 2026-09-03. The three items opened by Seno's answers to the Phase 2 pass, now closed.
`docs/DESIGN.md` is unblocked. Full option analysis for D33 and D34 is in
`docs/OPEN_QUESTIONS.md` § Wave 5.

### Wording of record

| # | Seno's words |
|---|---|
| D33 | *"B is fine, the elapsed-fraction argument convinced me. Keep the CDF global though, don't segment by ad or channel at this volume, and show the sample size it was measured from so it's obviously a histogram and not a forecast. C as the cold-start fallback in the README, agreed."* |
| D34 | *"C, approved. And I'd rather you name the stream-health exception than pretend to an absolute that doesn't hold — that's the right call. Just make sure the label makes it obvious those numbers describe the transport and not the ads."* |
| D20 | *"B, and yes the conversions correction is right, CPA's denominator is conversions so gating on clicks was measuring the wrong thing. One thing to watch: a young cohort will never clear 10 conversions, so adaptive granularity could coarsen forever chasing a bar it can't reach. Cap the coarsening (hour, say) and past that just show the counts instead of an ever-wider bucket. Otherwise the chart quietly turns into one point."* |

---

## DECISION #33 — Basis for the per-bucket maturity indicator

**Status:** ACCEPTED — option B, qualified · **Depends on:** D13, D27 · **Residue of:** D27

**Question.** D27's maturity indicator needs a basis. Options: A elapsed fraction of the 72h
horizon · **B empirical attribution-lag CDF from settled cohorts** · C a fixed stated curve. Full
analysis: `OPEN_QUESTIONS.md` § Wave 5 · D33.

**Chosen.** B. Over settled buckets, collect `received_at − click.ts` for every resolved
conversion — the **observational** lag, how long until we knew, not how long until the human
bought — and evaluate that empirical CDF at the bucket's age.

**Qualifications — all three from Seno, all three load-bearing:**

1. **The CDF is global.** Not segmented by ad, channel, audience or generation. At 8–12 ads the
   per-segment sample would be thin enough that the indicator would itself become noisy — which is
   the failure mode the indicator exists to protect against. Stated as a limit: a channel with a
   genuinely different lag profile is misrepresented by the global curve, and we say so rather than
   segmenting into noise.
2. **The sample size it was measured from is displayed alongside it.** *"so it's obviously a
   histogram and not a forecast."* This is the line that keeps the feature inside the brief's
   disclaimer of statistical sophistication (L147): a number labelled "68% mature, measured over
   1,432 settled conversions" is visibly a count of things that happened. Without the sample size
   it reads as a prediction and invites exactly the scrutiny the brief says it does not want.
3. **C is the README's stated cold-start fallback** — what we would use before any cohort has
   settled. With 7d of backfill it never fires in the demo, which is itself worth stating.

**Consequences.** One cached query over settled cohorts, recomputed periodically. The indicator is
derived from the event stream like every other number, so it needs no constant anyone can dispute.
It is displayed with its sample size and never without.

**Forecloses.** Per-segment maturity, deliberately — and named as a limit rather than left as an
absence.

**Defence.** A young cohort is not merely "unsettled", it is incomplete by a knowable amount, and
the honest way to say so is to measure the lag we have actually observed and show the reader how
many observations that is — which makes it a histogram of our own data rather than a forecast about
someone else's.

---

## DECISION #34 — Structural enforcement of the raw-tail quarantine

**Status:** ACCEPTED — option C, exception named · **Tag:** [LOAD-BEARING]
**Depends on:** D30, D31 · **Residue of:** D30

**Question.** D30-C's single-implementation guarantee depends on raw-tail frames never contributing
to a displayed number, and Seno rejected convention as the mechanism. Options: A convention plus
review · B branded numerics · **C numerics absent from the tail frame, plus descriptor-gated
rendering**. Full analysis: `OPEN_QUESTIONS.md` § Wave 5 · D34.

**Chosen.** C. Three layers, two of them compile-time:

1. **The data is not there.** Money on a `TailFrame` is a pre-rendered display string
   (`amount: "$0.42"`), never an integer. Summing the tail requires parsing strings — visible in a
   diff, which is the point.
2. **The render path is gated.** Every performance number renders through D31's
   descriptor-taking component. Tail frames carry no descriptor and cannot be given one, because
   descriptors are server-issued and signed (`node:crypto`, built-in). Under TypeScript strict
   there is nothing to pass, so it fails to compile.
3. **The runtime backstop is already built.** D31's recompute-and-assert would fail visibly, on
   screen, for any number that reached the display by another route.

**The governing rule, stated once:** *raw numbers reach the client only in response to a trace
descriptor.* There are two raw-event payload types — `TailFrame` (display, unsolicited, pushed) and
`TraceEvidence` (summable, returned only by descriptor replay, and summed precisely so it can be
asserted against the displayed figure).

**The stated exception — Seno's words:**

> "I'd rather you name the stream-health exception than pretend to an absolute that doesn't hold —
> that's the right call. Just make sure the label makes it obvious those numbers describe the
> transport and not the ads."

Stream-health figures — events/sec, last-event age, frames dropped, deliveries deduped — are
derived from the tail and are numbers on screen. They describe the **transport**, not the ads. They
are rendered in a visually distinct treatment, grouped under a heading that names them as stream
telemetry, and never share a surface with a performance metric in a way that could be read as one.
The rule in `DESIGN.md` and the README reads *"no **performance** number is derived from the
tail"*, not an absolute the design does not hold.

**Consequences.** The descriptor signature earns its keep twice: it makes "server-issued" a
structural fact rather than a naming convention, and it is what stops a client from minting a
descriptor for tail-derived data. The tail loses client-side locale formatting.

**Forecloses.** A future "sum the last N events" view would have to go through the descriptor path —
which is the correct path anyway.

**Defence.** The guarantee the whole read model rests on is that one implementation of the
arithmetic exists, so the rule protecting it is enforced by the type system and by the absence of
the data, not by a comment — and the one place the rule genuinely does not hold is labelled as
transport telemetry rather than quietly excepted.

---

## DECISION #20 — Separating signal from noise

**Status:** ACCEPTED — B (adaptive granularity), constants amended, coarsening capped
**Depends on:** D9, D27, D33

**Question.** L155 asks how we separate signal from noise. Options as originally presented: A
sample-size gate · **B gate plus smoothed series** · C confidence intervals (the option the brief
tells us not to take). Ratified as B; the *gate mechanism* was sent back on the ground that a fixed
500-impression bar suppresses everything in a one-minute view. Full original analysis:
`OPEN_QUESTIONS.md` §B · D20.

**Chosen — the mechanism.** A **fixed statistical bar with adaptive point granularity**. The bar
stays a property of the sample, because that is what makes a ratio meaningless — a CTR over 30
impressions is noise whether those 30 arrived in a minute or an hour, and a rate-based gate would
threshold on how busy an ad is rather than on how much evidence a point carries, which is backwards
since the low-rate ad is precisely the noisy case. The *granularity* adapts instead: the chart picks
the smallest bucket size at which its points clear the bar, and displays which one it picked. D9
already derives coarser buckets from minutes, so this is the same fold, not new machinery.

**Chosen — the constants.**

| Ratio | Gate | Basis |
|---|---|---|
| CTR | ≥ 500 impressions per plotted point | relative standard error ≈ 30% at p ≈ 2% |
| CPA, ROAS | ≥ 10 **conversions** per plotted point | RSE of a count of 10 ≈ 32% — comparable |

Smoothing: EWMA, 15-minute half-life, with a toggle to the raw series.

**Correction carried into the constants — Seno's words:**

> "yes the conversions correction is right, CPA's denominator is conversions so gating on clicks was
> measuring the wrong thing."

The originally proposed CPA/ROAS gate of "≥ 25 clicks" thresholded the wrong quantity: CPA is spend
÷ conversions, so conversions is the noisy denominator. Corrected before build.

**Amendment — the coarsening cap. Seno's words:**

> "a young cohort will never clear 10 conversions, so adaptive granularity could coarsen forever
> chasing a bar it can't reach. Cap the coarsening (hour, say) and past that just show the counts
> instead of an ever-wider bucket. Otherwise the chart quietly turns into one point."

This is a genuine failure of the mechanism as designed and it composes badly with D27-B
specifically: under cohort placement a *young* cohort has few conversions **because it is young**,
not because it is low-volume, so the adaptive search has no granularity at which the bar is
reachable and would widen until the chart is a single point — degrading silently, which is the one
failure mode the whole gate exists to prevent.

**Resolved as:** granularity escalates minute → 5 min → 15 min → hour and **stops**. If the hourly
point still does not clear the bar, the ratio is not drawn at all and the **counts** are shown in
its place, with the reason stated on the surface. A chart that says "not enough conversions yet —
here are the counts" is honest; a chart that has quietly become one wide bar is not.

**Consequences.** Two mechanisms with two distinct meanings now sit side by side and must stay
visibly distinct: the **gate** says *too little data to be a ratio*; the **maturity indicator**
(D33) says *the data is still arriving*. A young cohort trips both, for different reasons, and the
surface says which.

**Forecloses.** Sub-minute ratios (nothing needs them) and confidence intervals (C, which the brief
disclaims).

**Defence.** The bar is a statement about evidence and stays fixed so the constant is defensible;
the resolution is what bends; and when neither can satisfy the other the chart stops drawing a
ratio and shows the counts instead, rather than degrading into a single wide bucket that looks like
an answer.

---

# PHASE 3 SIMULATOR PASS — D35–D40, D17 closed, F3

**Date:** 2026-09-03. Presented before `docs/SIMULATOR.md` was written, on the Phase 3 prompt's
instruction: *"Present the fatigue model, the lag distribution, and the noise model as DECISIONs with
alternatives. The rest you can propose and I'll ratify."*

Six decisions. Three were named by the prompt (D35, D36, D37). Three were surfaced during the read
and **confirmed as decision-shaped by Seno rather than chosen by me** — asked as a plan-mode
question, answered *"Backfill vs D33's CDF, Volume calibration, Simulator state + config sync"*.
D17's residue was **not** selected for full treatment and is therefore closed below against the
proposal block, not as its own entry.

**Full option analysis for all six is retained in `docs/OPEN_QUESTIONS.md` § Wave 6** and is not
duplicated here.

### Wording of record

Verbatim. No sentence is paraphrased into an entry's prose without appearing here first.

| # | Seno's words |
|---|---|
| D35 | *"C, approved, and keep headline at 0.5. Copy does wear out, just slower than video, and zeroing it would mean the headline swap lever changes nothing observable."* |
| D36 | *"approved, and keep the two lags separate. If you collapse them then received_at − ts becomes the purchase lag, which would make our own transport look like it's hours behind. That field has to describe us, not the buyer."* |
| D37 | *"all six rows. I did think about collapsing the two AR(1) processes but I think both earn their place: channel-level moves ads together, ad-level is idiosyncratic, and the fact that you can't immediately tell which one you're looking at is a real property of the domain — it's also the honest basis for the fatigue flag's 'can't separate this from a platform delivery change' limit. If implementation drags, collapse to one and say so."* |
| D38 | *"E+B. One thing to work through: backfilled rows get received_at in the past but their ingest_seq is assigned in a burst at boot, so for that window seq order and arrival order don't agree. I don't think it breaks SSE resume, but it does mean as_of_ingest_seq can't reconstruct 'what the screen showed on Tuesday' for the seeded period. Check §10.3 and state the limit rather than letting it look like it works."* |
| D39 | *"B, and 40–60s is acceptable since it's once. But print progress, or a reviewer will think it hung on the one command that's supposed to just work. Also tell me how long P14's sweep takes over 1.05M events — if that's minutes it needs a bounded mode."* |
| D40 | *"A+X, keyed RNG, and yes to the scenario table. Reproducibility as seed + decision log + scenario log is the better claim and I'd rather make the true one."* |
| F3 | *"scenario control is new scope, take it as a plan item. Same argument as P16 — if the interesting thing can't be caused on demand it can't be shown. It goes in SCOPE.md §2 and therefore the README."* |

---

## DECISION #35 — What creative fatigue accrues to

**Status:** ACCEPTED — option C · **Tag:** [LOAD-BEARING] · **Depends on:** D3, D4 · **Answers:** G37

**Question.** Fatigue is named in the Background (L24), promised as inspectable (L133) and present in
no contract (G37) — so the accrual key is the modelling claim. Options: A per ad · B per component
lineage, global · **C per (component lineage × audience)** · D per (lineage × audience × channel).

**Chosen.** C, **frequency-driven with recovery**: `f = F(lineage, audience) / served pool`,
`φ(f) = 0.25 + 0.75·exp(−0.35f)`, idle recovery on a 5-day half-life, slots composing as
`φ_video^1.0 × φ_headline^0.5`.

**Rationale — Seno's words.**

> "C, approved, and keep headline at 0.5. Copy does wear out, just slower than video, and zeroing it
> would mean the headline swap lever changes nothing observable."

**Consequences.**
1. **Three brief questions become facts about the data rather than README sentences.** `vl_01` sits
   at φ 0.43 on `cold_us` and φ 0.91 on `warm_us` simultaneously; sharing a pool between `a_02` and
   `a_04` measurably accelerates burnout; a swap resets one slot only. `SIMULATOR.md` §7.2.
2. **A is disqualified rather than merely worse.** It decays while paused — the audience tiring of an
   ad it is not being shown — and it makes `swap_component` change nothing observable.
3. **`set_budget` becomes a fatigue lever.** Frequency-driven decay means doubling the budget burns
   the creative twice as fast. A real strategic tension, obtained free.
4. **It forced D40.** The accrual key is state spanning ads and restarts, which is why the simulator
   needs a recompute endpoint rather than a local file.
5. **D3 gains an observable consequence.** D3's own entry says copy-on-write ships as prose because
   *"nothing exercises this at runtime."* Under C something does: `vl_04` v2 (`a_05`) inherits v1's
   frequency on the same audience and arrives pre-fatigued. See the D3 amendment note below.
6. **Two parameters moved after the pass** and were ratified separately — `served_fraction` (§6,
   replacing a reachable-fraction column whose value made cold fatigue invisible) and the version
   partial-reset `r` = 0.35 (§7.3). See § D35 — PARAMETER RATIFICATION. The accrual key, the decay
   form and `k` are unchanged.

**Forecloses.** Nothing — A and B are C with a coarser key, and D was rejected because putting
channel in the key would make a burned video *not* pre-fatigued in a new ad on the same audience,
which is the property being demonstrated.

**Defence.** It is the only accrual key under which the swap lever, the component-reuse premise and
D4's ad-versus-component answer are all observable in the data at once — and retargeting's faster
burnout, the budget-versus-burnout tension and the pre-fatigued-on-launch property all fall out of
one formula instead of three parameters.

---

## DECISION #36 — The click→conversion lag distribution

**Status:** ACCEPTED — option C, two lags kept separate · **Tag:** [LOAD-BEARING]
**Depends on:** D13, D27, D33

**Question.** The distribution is what makes D13's horizon, D27-B's cohort placement and P16's
horizon shortening visible or invisible. Options: A exponential · B lognormal · **C fast/slow
mixture** · D Weibull.

**Chosen.** C, with `p_fast` a property of **audience temperature** (retargeting .65 / warm .45 /
cold .30): fast `Exp(mean 12 min)`, slow `LogNormal(median 14 h, σ 1.1)`, hard cutoff 7 days. Plus a
**separate reporting lag** `LogNormal(median 90 s, σ 0.9)` with a 2% straggler component.

**Rationale — Seno's words.**

> "approved, and keep the two lags separate. If you collapse them then received_at − ts becomes the
> purchase lag, which would make our own transport look like it's hours behind. That field has to
> describe us, not the buyer."

**Consequences.**
1. **Quantiles per temperature:** retargeting median 0.3 h / p95 1.87 d / 2.3% past horizon · warm
   3.3 h / 2.49 d / 3.6% · cold 7.5 h / 2.85 d / 4.6%. p95 inside the horizon so headline numbers
   mean something; the tail crosses it so **P7 fires on real data, not only on a scenario trigger**.
2. **D27's stated product consequence is now quantified.** "CTR is live, CPA and ROAS lag by cohort"
   has numbers: a retargeting cohort matures in an hour, a cold one in most of a day.
3. **Two lags, two jobs.** Purchase lag decides whether a bucket was settled when the event landed,
   so it drives restatement; reporting lag is what `received_at − ts` measures. A is disqualified
   because one parameter cannot produce both a usable median and a crossing tail.

**Forecloses.** Nothing; C degrades to B at `p_fast = 0`.

**Defence.** The mixture earns its third parameter by making lag a consequence of audience
temperature rather than a fitted knob — and keeping the reporting lag separate is what stops the
entire lateness figure from landing in a field that is supposed to describe our own transport.

---

## DECISION #37 — The noise model and where overdispersion comes from

**Status:** ACCEPTED — option C, all six components · **Tag:** [LOAD-BEARING] · **Depends on:** D20

**Question.** L133 says the noise will be inspected and the Phase 3 prompt forbids jitter on a smooth
curve. Options: A Poisson only · B negative binomial · **C B plus autocorrelated latent demand** ·
D additive uniform jitter (named and rejected).

**Chosen.** C. Six components: channel demand log-AR(1) (τ 45 min, sd 0.18) · ad demand log-AR(1)
(τ 20 min, sd 0.25) · `NegBinomial(α = 8)` impressions · `BetaBinomial(κ 200)` clicks ·
`BetaBinomial(κ 60)` conversions · `LogNormal(σ 0.35) × m_channel^0.6` CPC.

**Rationale — Seno's words.**

> "all six rows. I did think about collapsing the two AR(1) processes but I think both earn their
> place: channel-level moves ads together, ad-level is idiosyncratic, and the fact that you can't
> immediately tell which one you're looking at is a real property of the domain — it's also the
> honest basis for the fatigue flag's 'can't separate this from a platform delivery change' limit.
> If implementation drags, collapse to one and say so."

**Consequences.**
1. **Every source of variance is named and attached to the quantity it perturbs** — auction
   competition, audience composition drift, platform creative rotation. A says arrivals are Poisson
   (visibly not what delivery looks like); D says variance is decoration.
2. **It is what makes D20's mechanisms necessary rather than decorative.** Under A the gate and the
   EWMA would defend against a problem our own data does not have.
3. **Because bursts persist, EWMA has a real lag-versus-variance tradeoff** — which is what lets
   `SIMULATOR.md` §19 state the smoothing's limits honestly instead of hypothetically.
4. **It is the stated basis for the fatigue flag's central limit.** The channel-level factor is
   *why* a sustained platform dip and a genuine burnout are indistinguishable for the first hours —
   by construction, because they are in reality.
5. **Recorded fallback:** if implementation drags, collapse to one AR(1) process and say so.

**Forecloses.** Nothing; setting the AR(1) standard deviations to zero degrades C to B, then to A.

**Defence.** The brief's test is whether the data reveals a model of the domain, and overdispersion is
where that shows — so every stochastic component has a stated source rather than a magnitude, and
the two processes we cannot tell apart are the honest basis for a limit we state on the surface.

---

## DECISION #38 — Backfill arrival semantics vs D33's observational lag

**Status:** ACCEPTED — options E + B, amended · **Tag:** [LOAD-BEARING]
**Depends on:** D12, D13, D33 · **Corrects:** `DESIGN.md` §5.4 · **Refines:** F2

**Question.** A conflict inside the ratified set, not a new question. D33 measures
`received_at − click.ts` — the *observational* lag. D12 makes `received_at` server-assigned and never
emitter-assigned. D17 backfills 7 days in one burst at boot. All three cannot hold: every backfilled
conversion would carry `received_at ≈ boot`, so the maturity CDF would be a picture of the seed loop,
and `DESIGN.md` §4.5 relies on precisely that population. Options: A emitter supplies `received_at` ·
B `source` marker, exclude backfill from lag stats · C amend D33 to purchase lag · D split and
convolve · **E the seeder stamps historical arrival times, reframing the actor**.

**Chosen.** **E + B.** The seeder — already a privileged fixture writer per `DESIGN.md` §3.2 —
stamps `received_at = ts + reporting lag` on historical rows; the envelope carries a server-assigned
`source: 'backfill' | 'live'`; the CDF spans both populations and its label discloses the seeded
share.

**Rationale — Seno's words, carrying an amendment.**

> "E+B. One thing to work through: backfilled rows get received_at in the past but their ingest_seq
> is assigned in a burst at boot, so for that window seq order and arrival order don't agree. I don't
> think it breaks SSE resume, but it does mean as_of_ingest_seq can't reconstruct 'what the screen
> showed on Tuesday' for the seeded period. Check §10.3 and state the limit rather than letting it
> look like it works."

**The amendment, worked through — it turned out to be fixable, plus one bug.**

1. **Fixed, not merely stated.** The seed is **sorted by `received_at` before writing**, so
   `ingest_seq` is monotone in arrival time within the seeded window. One sort of ~1.6M rows.
2. **The seam is fixed too.** Any event whose computed `received_at` falls after the seed boundary
   `T0` is **not seeded** — it is handed to the live emitter and delivered at its real arrival
   moment. So monotonicity holds across the handover, and *"the conversions that were in flight when
   you started the app"* becomes a real population instead of a manufactured one. D40's keyed RNG is
   what makes this free: the emitter re-derives each backfilled click's schedule from
   `hash(seed, 'conv_lag', click_id)` rather than needing a stored queue.
3. **A correctness bug in `DESIGN.md` §5.4, found by working the amendment through.** §5.4 evaluated
   settlement as `now − (minute_start + 60s) > horizon` with `now` = wall clock. During seeding `now`
   is boot time, so **every** backfilled event landing in a bucket older than 72 h would be stamped
   `restated_at` — the demo would have opened with tens of thousands of spurious restatements and P7
   would have looked broken on frame one. The correct rule is *"was this bucket settled **when this
   event arrived**"*, i.e. evaluated at `ev.received_at`. For live events `received_at ≈ now`, so
   nothing changes. **`DESIGN.md` §5.4 is corrected.**

**Consequences.**
1. **The residual limit, stated in `DESIGN.md` §10.3 and the README:** within the seeded window
   `received_at` is *designed*, not observed, so `as_of_ingest_seq` reconstructs what the screen
   *would have shown under the seeded arrival model* — not what anyone saw, since nobody was
   watching. Live arrivals carry no such caveat. Smaller and truer than the limit anticipated.
2. **`source` is a new envelope extension** (E15) and earns its column beyond the CDF: "is this
   number resting on seeded or observed data" applies to more than one figure. D33's sample-size
   label discloses the split.
3. **F2 is refined.** F2's arithmetic said no restatement is observable at the default horizon. With
   2–5% of conversions past-horizon under seeded arrival times, a handful of backfilled buckets
   legitimately carry `restated_at` **from frame one**. P16 remains the only way to cause one *live*;
   `scenario: late_cascade` the only way to cause one *on demand*. See the F2 amendment note below.

**Forecloses.** Nothing. A was rejected because it breaks D12 head-on and every lateness figure in
the app would inherit that; C was available and declined, keeping D33 exactly as ratified.

**Defence.** The one option that required no ratified decision to be amended, produced a measurable
maturity curve from the first frame, and cost one sentence of disclosure — and working the seq-order
objection through is what turned up a settlement bug that would have made the flagship path look
broken on boot.

---

## DECISION #39 — Volume calibration

**Status:** ACCEPTED — option B · **Depends on:** D20, D35, D36 · **Amended:** progress print required

**Question.** D20's gate, read backwards, is a volume requirement — and volume is rows to generate,
ingest, roll up and sweep inside "run in one command". Options: A uniform small volumes · **B
asymmetric portfolio calibrated against the gates** · C inflate everything.

**Chosen.** B, with **staggered launch dates**: twelve ads, one fresh retargeting pair on the gate
boundary, one high-volume cold ad clearing CTR at 15-minute granularity, the rest honestly showing
counts. ~1.63M backfilled events; 5-day fallback stated.

**Rationale — Seno's words.**

> "B, and 40–60s is acceptable since it's once. But print progress, or a reviewer will think it hung
> on the one command that's supposed to just work. Also tell me how long P14's sweep takes over
> 1.05M events — if that's minutes it needs a bounded mode."

**Answered by measurement, not estimate.** Verified in the scratchpad, never in the repo — the method
D8 was settled by. Node v24.14.0, SQLite 3.51.2 via `node:sqlite`, WAL + `synchronous = NORMAL`,
transactions of 5,000, through insert → attribution → rollup upsert:

| Claim | Measured |
|---|---|
| Seed 1.06M events through the full write path | **7.9 s** (133,601/s) — so the 40–60s allowance was pessimistic; ~12 s at the final portfolio size |
| **P14 full agreement sweep** | **2.72 s** over 56,160 buckets, **0 mismatches** — ~4.2 s at final size |
| Hot read, 60-minute single-ad window (D28's `WITHOUT ROWID` PK) | 0.08 ms |
| Store | 203 MB + 5 MB WAL — ~315 MB at final size |

**So P14 needs no bounded mode.** But the sweep **must be a single whole-log pass**, not `replay()`
per bucket: per-bucket is O(buckets × N) and takes hours. That is already what D7 specifies ("the
rebuild path calls it with the whole log from zero"); it is written down because the obvious
implementation is the quadratic one.

**Consequences.**
1. **Progress printing is a requirement, not polish** — twelve seconds of silence on the
   one-command deliverable reads as a hang.
2. **Calibration surfaced a wrong parameter.** At the originally ratified reachable-fraction of 0.55,
   cold fatigue was invisible (φ 0.94 after seven days — a rounding error, not a curve). Replaced by
   `served_fraction` — the slice the platform actually serves at our bid — which is both the correct
   domain quantity and the reason retargeting burns out first. Carried as an assumption, then
   **ratified separately** — see § D35 — PARAMETER RATIFICATION.
3. **Fatigue pushes ads off the gate**, which is the interesting interaction: `a_01` at φ 0.25 yields
   8.5 conversions/hour at peak and is *below* D20's bar, so the metric a strategist would judge it
   by stopped being measurable as the ad died. The drawable ad therefore had to be a fresh pair on a
   small pool (`a_08`, one day old, 15.3 conv/h at peak, 4.0 at trough).
4. **Both branches of D20 fire on camera and the ladder steps during the day** — which a portfolio
   where every bar cleared would have hidden.

**Forecloses.** Nothing; volumes are constants in one table.

**Defence.** D20 was already ratified, so the only open question was whether the data lets it be seen
working — and the calibration arithmetic is also what caught a parameter that would have made the
fatigue curves, the one thing the brief says it will look at, invisible.

---

## DECISION #40 — Simulator state, config sync, and the limit of determinism

**Status:** ACCEPTED — options A + X · **Tag:** [LOAD-BEARING] · **Depends on:** D32, D35
**Closes:** the D17 residue on determinism

**Question.** `DESIGN.md` §3.3 declares the simulator stateless and §11 says it honours pause — both
recorded as constraints on D17, not solved problems. D35's accrual and D9's pacing are stateful, and
D32 ruled out shared DB access, so nothing tells the emitter a lever was pulled. Options for state:
**A recompute from a server endpoint** · B pure function of seed and clock · C local sidecar file.
For levers: **X poll `GET /api/sim/world` per tick** · Y subscribe to SSE · Z read the DB.

**Chosen.** A + X, with a **keyed (counter-based) RNG** and the determinism limit stated.

**Rationale — Seno's words.**

> "A+X, keyed RNG, and yes to the scenario table. Reproducibility as seed + decision log + scenario
> log is the better claim and I'd rather make the true one."

**Consequences.**
1. **`GET /api/sim/world`** returns, in one read transaction: the twelve `ads` rows,
   `last_decision_seq`, `F(lineage, audience)`, `spend_so_far_today` per ad, backfilled clicks still
   inside the lag window, and pending scenario triggers. Cold start, restart, lever propagation and
   scenario delivery are **one code path**.
2. **B was the trap.** Deriving fatigue from seed and clock reconstructs what the model *would* have
   produced, which equals the store only if nothing was rejected or lost — and we inject 0.2%
   emitter-side loss and 0.1% malformed payloads deliberately. The divergence would have been silent
   and in the one number the artifact is judged on.
3. **Not a simulator-only query.** Cumulative delivery per (lineage, audience) is the temporal
   reverse join `DESIGN.md` §8 already documents for component-level performance.
4. **Pause latency is a stated number:** ≤ 1 tick, ≤ 1 s.
5. **Keyed RNG earns its keep three times.** Intervening on one ad does not reshuffle the others;
   event ids are derived so a re-emission after restart is a tolerated `duplicate_identical` and the
   emitter needs no memory of what it sent; and D38's pending-conversion queue becomes derivable
   rather than stored.
6. **One new table, `sim_scenarios`** — approved explicitly. Without persisted triggers the
   reproducibility claim is false. Added to `DESIGN.md` §2.

**The limit, ratified as the claim we make.** A seed does not reproduce the world — levers fork it.
The claim is **`(seed + decision log + scenario log) → world`**, and all three are persisted, so
replaying a specific interesting moment is genuinely possible. Stronger than seed-only determinism,
and unlike seed-only determinism it is true.

**Forecloses.** Nothing.

**Defence.** The emitter's fatigue state and the app's inferred fatigue cannot silently disagree,
because both are computed from the same log — and the reproducibility claim names all three of its
inputs rather than the one that sounds impressive.

---

## DECISION #17 — Simulator architecture · CLOSED

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Closed by:** D32 (topology) + D35–D40 + the Phase 3
proposal block

D17 was the last open decision in the register. It is closed in three parts rather than as one entry,
which is why it has no options table of its own here:

| Sub-question | Settled by | Answer |
|---|---|---|
| 17a process placement | **D32** | Separate process, HTTP batch `POST /api/ingest` |
| 17b clock | proposal block | **Live at 1× wall clock** — the only rate at which the envelope means anything, since an accelerated `ts` would outrun the wall clock and fire I10's clamp on nearly every event. Backfill accelerated, in-process at first boot through the same `ingest()` |
| 17c determinism | **D40** | Seeded, **keyed** rather than sequential; reproducibility = seed + decision log + scenario log |
| 17d backfill depth | proposal block | **7 days**, 5-day fallback stated. Both exceed the 72 h horizon |
| tick cadence | proposal block | 1 second, one batched POST per tick |
| the emitter's domain model | **D35, D36, D37, D39** | `SIMULATOR.md` §3–§13 |

**Ratified as a block** with the rest of the proposal block; Seno's plan-mode answer explicitly
declined to give the residue its own §3 entry. Nothing in D17 was decided by `SIMULATOR.md`.

---

## FOLLOW-UP F3 — Scenario control is a plan item

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Relates to:** D40, P16, F2

**The instruction — Seno's words:**

> "scenario control is new scope, take it as a plan item. Same argument as P16 — if the interesting
> thing can't be caused on demand it can't be shown. It goes in SCOPE.md §2 and therefore the README."

**Recorded as.** **P17** in `docs/SCOPE.md` §2, inside the README-verbatim block. Seven scenarios,
listed in `SIMULATOR.md` §17, delivered over D40's existing `GET /api/sim/world` poll so there is no
second control channel and every trigger is part of the replayable record.

**Consequences.** P17 and P16 overlap in purpose and differ in mechanism, and the distinction is worth
keeping written down: **P16 changes which buckets are *settled*** (a settlement re-evaluation sweep);
**P17 delivers new *late events*** (a restatement of buckets that were already settled). The first
exercises the horizon, the second the restatement path. Both are needed and neither substitutes for
the other.

**What it forecloses.** Nothing. It also makes the misbehaviour table in `DESIGN.md` §6 fully
exercisable: burst, gap and stall were the three rows with a handler and no trigger.

**How I'd defend this in review.** Every interesting property of an event pipeline is rare by
construction, so a cockpit that can only wait for one cannot be demonstrated — the trigger surface is
part of the feature, and it rides a channel that already existed.

---

# AMENDMENTS TO EARLIER ENTRIES — from the Phase 3 pass

Recorded here rather than edited silently into the entries above.

| Entry | Amendment | Source |
|---|---|---|
| **D33** | Unchanged as ratified. Its CDF is now measurable from frame one because D38-E gives backfilled conversions modelled arrival times; the sample-size label additionally **discloses the seeded share** — *"1,432 settled conversions (1,180 seeded)"* | D38 |
| **F2** | Refined, not reversed. F2 said no restatement is observable at the default horizon. Under D38-E a handful of backfilled buckets legitimately carry `restated_at` from boot, so **historical restatements are visible immediately**; P16 remains the only way to cause one *live*, P17 the only way to cause one *on demand* | D38, F3 |
| **D3** | Gains an observable consequence. D3's entry states copy-on-write ships as prose because *"nothing exercises this at runtime."* Under D35-C, `vl_04` v2 inherits v1's frequency on the same audience and arrives pre-fatigued (φ 0.25), so the versioning decision is visible in the data even with no editor. The prose claim is unchanged; the evidence for it is stronger | D35 |
| **D20** | Unchanged. `SIMULATOR.md` §18.3 is evidence its constants are satisfiable: both branches of the gate fire in the seeded data and the ladder steps across the day | D39 |
| **`DESIGN.md` §5.4** | **Corrected.** Settlement is evaluated at `ev.received_at`, not wall-clock `now` | D38 |

---

## D35 — PARAMETER RATIFICATION

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Relates to:** D35, D39 · **Not a new decision**

Two parameters were carried in `docs/SIMULATOR.md` as `ASSUMPTION (unratified)` because both were
mine rather than Seno's, and one of them silently replaced a value from the D35 pass. Both are now
ratified. **Neither changes D35** — the accrual key is still `(component lineage × audience)`, the
decay is still frequency-driven, and `k` is still 0.35. Only parameters moved.

**Wording of record.** One sentence ratifies both, so the mapping is recorded explicitly rather than
restated in each entry's prose (`CLAUDE.md` §3):

| Parameter | Seno's words |
|---|---|
| `served_fraction` | *"Both approved"* |
| version partial reset `r` | *"Both approved"* |

### 1 — `served_fraction` replaces `reachable_fraction`

| Temperature | Was (D35 pass) | **Ratified** | Served pool |
|---|---|---|---|
| `cold` | 0.55 | **0.04** | `cold_us` 96,000 · `cold_us_lookalike` 54,000 (0.06) |
| `warm` | 0.70 | **0.25** | `warm_us` 95,000 |
| `retargeting` | 0.85 | **0.70** | `rt_us` 32,200 |

**Why it changed.** At 0.55, `a_02` on `cold_us` reaches **φ 0.94 after seven days** — a 6% CTR
decline. That is not a fatigue curve, and L133 says the fatigue curves will be looked at. The error
was modelling the frequency denominator as *"people the targeting allows"* when the quantity that
governs frequency is *"people the platform actually serves us at our bid"*. Delivery concentrates
hard on the responsive slice, which is why frequency in real campaigns climbs far faster than
audience size suggests — and why retargeting, where the pool is *intentionally* exhausted, burns out
first. Found by doing the calibration arithmetic (D39), not by reasoning about the model.

**Consequences.** The seeded data now carries real curves: `vl_04 × rt_us` at φ 0.25 (floored),
`vl_01 × cold_us` at 0.43 shared between two ads versus 0.49 for one alone, `vl_01 × warm_us` at
0.91 fresh. Retargeting burns out ~50× faster than cold **as a consequence of the pool** rather than
of a per-temperature decay parameter, which is why the temperature matrix still has no `k` column.

**Forecloses.** Nothing. It is one column in `SIMULATOR.md` §21 and a re-seed to change.

### 2 — Version partial reset `r` = 0.35

A version bump scales the pair's inherited frequency by `(1 − r)`: a recut recovers about a third of
the pool's freshness. Fatigue accrues to the **lineage**, so `vl_04` v2 inherits v1's exposure —
which is the domain truth, since a re-edit is not new to someone who has seen the original four
times — but it is not *nothing* either, and `r` is the size of "not nothing".

**Consequence worth restating:** this is what gives **D3** an observable consequence. D3's own entry
says copy-on-write ships as prose because *"nothing exercises this at runtime."* With `r` = 0.35,
`a_05` (`vl_04` v2 on `rt_us`) arrives at φ 0.25 rather than 1.00, so the versioning position is
visible in the data even though no editor ships.

**Forecloses.** Nothing. At `r` = 0 a new version is a pure re-edit; at `r` = 1 it is a new
creative. Both extremes are defensible and both are one constant away.

**How I'd defend this in review.** The fatigue denominator is the parameter the whole curve hangs
on, and the first value I chose made the phenomenon the brief says it will inspect invisible — so
the arithmetic that caught it is in the document beside the corrected value, rather than the
corrected value appearing as though it had always been right.

---

# WAVE 7 — PHASE 5 TOOLCHAIN (D41–D43)

**Ratified 2026-09-04**, immediately before the first line of code. Three of the five Wave 7
questions; **D44 (chart rendering) and D45 (styling) remain open** and block nothing before stage 4
(`BUILD_PLAN.md` B36/B37).

**Wording of record.** Each was answered in two steps: the option selected, then Seno's reason for
it in one sentence, given 2026-09-04 in a single message that also disposed of D44/D45 (**F4**). The
sentences are reproduced verbatim in each entry and are the rationale of record; my supporting
analysis is kept beneath, separately labelled, because it is not his.

| # | Selected | Seno's words |
|---|---|---|
| **D41** | A — single package, Vite client-only | *"one package, Vite client-only, three packages is workspace overhead for a one-person one-command project."* |
| **D42** | A — `node:http` + router | *"ten routes and no auth, a framework earns nothing and SSE is simpler on raw node:http."* |
| **D43** | A — `node:test`, four functions | *"tests only where a wrong answer is invisible; the agreement sweep is the real safety net."* |
| **D44, D45** | **DEFERRED to stage 4** | *"Mark D44/D45 deferred, not open."* — see **F4** |

Full option analysis, with pros, cons, what each forecloses and reversal cost, stays in
`docs/OPEN_QUESTIONS.md` § Wave 7 — the §3 compression allowance. The options are given below as one
line each.

---

## DECISION #41 — Repo layout and build toolchain

**Status:** ACCEPTED — option A · **Date:** 2026-09-04 · **Blocked:** B01, and therefore everything

### Question

`CLAUDE.md` §1 fixes the stack (Node + TypeScript strict + React, `node:sqlite`, Node 24 floor) but
does not say how React reaches a browser. `DESIGN.md` §11 and **D32** require three runnable things:
a server, a separate-process simulator, and a client bundle. Nothing ratified constrains the bundler
or the package layout.

### Options as presented

**A) Single `package.json`, three entry points, Vite for the client only.** One dependency tree;
`src/shared` imported by relative path; Vite dev-serves and builds `src/web` alone, proxying `/api`.
One new dev dependency. Reversal cost low.
**B) No bundler — `tsc` to ESM, native modules, import map for React.** Zero dev dependencies beyond
TypeScript; no HMR, no dev server, manual proxy, React vendored by hand. Reversal cost low.
**C) npm workspaces, four packages.** Process boundary visible in the tree; build ordering and four
manifests for a solo build. Reversal cost medium.

### Chosen

**A.** Single package, three entry points, Vite for `src/web` only.

### Rationale — Seno's words

> "one package, Vite client-only, three packages is workspace overhead for a one-person
> one-command project."

**Note what this rationale rests on and what it does not.** It rejects **C** on overhead grounds and
takes A's client-only Vite; it does not engage the D8-purity argument that motivated **B**. The
implication — that a dev-time tool absent from the running system does not violate D8 — is carried by
the supporting analysis below, not by Seno's sentence, and consequence 2 is where it gets paid for.

### Supporting analysis as presented *(mine, not his)*

> The honest form of D8's argument is *no new **runtime** dependency*, and Vite is not one: it emits
> static files and is absent from the running system, so the property D8 protects (the app is Node +
> SQLite and nothing else) is untouched. What B actually costs is ten chunks of stage-4 UI work
> without hot reload, on the one part of the build where `DESIGN.md` specifies behaviour precisely
> and appearance not at all — meaning iteration count is the dominant cost there. C is the right
> structure for a team and the wrong one for a slice this size.

### Consequences

1. **B01 is now writable**: one `package.json`, one `tsconfig.json`, `.nvmrc`, `.gitignore`.
2. **The D8 claim acquires a qualifier that must be stated, not hidden.** The README says *no
   runtime dependencies*; Vite, TypeScript and React are visible in `devDependencies` and React is
   a runtime dependency of the client bundle. The claim is about the **server**, and it is written
   that way or it is dishonest.
3. **B57's one-command run stays a script** (`scripts/start.mjs`) spawning two processes and serving
   a built bundle — not a build system.
4. `src/shared` is a directory, not a package. Server, simulator and client all import it by
   relative path.

### What it forecloses

**Nothing.** Vite is dev-time. Swapping or removing the bundler touches `scripts/`, `index.html` and
one config file.

### How I'd defend this in review

D8 protects a property of the *running system*, and a tool that has exited before the system starts
cannot violate it — so the cost of B was ten UI chunks without hot reload in exchange for a purity
the deployed artifact already has.

---

## DECISION #42 — HTTP server: `node:http` or a framework

**Status:** ACCEPTED — option A · **Date:** 2026-09-04 · **Blocks:** B04

### Question

Ten routes, no auth, no sessions, no middleware chain, one client, and a synchronous store.
`DESIGN.md` §11 requires the ingest and decision paths to be synchronous end to end inside one
SQLite transaction. Framework or not?

### Options as presented

**A) `node:http` + a ~40-line router.** No dependency; SSE flush control and backpressure directly
visible on the raw socket; we write ~60–80 lines of body parsing, 404s and error handling.
**B) Express.** Reviewer familiarity, one-line body parsing and static serving; a dependency tree,
and an SSE story needing care around compression and buffering.
**C) Fastify.** Boundary schema validation; async-first over a synchronous store, and its validation
is the wrong shape for ours. All three: reversal cost low.

### Chosen

**A.** `node:http` with a hand-rolled router.

### Rationale — Seno's words

> "ten routes and no auth, a framework earns nothing and SSE is simpler on raw node:http."

### Supporting analysis as presented *(mine, not his)*

> Ten routes, one client, no auth: the framework is doing almost nothing here, and the two places it
> would do something — SSE flush control and validation-with-retention — are both places where it
> gets in the way rather than helps. C's validation is the clearest case: our ingest boundary must
> *keep* what it rejects (`DESIGN.md` §5.1), which is the opposite of what schema validation is for.
> And under A, "no new dependency" stays a claim about the whole server rather than one about
> persistence with an asterisk.

### Consequences

1. **The server's runtime dependency count is zero** — `node:http` + `node:sqlite` + nothing. This is
   the claim D41 consequence 2 says must be scoped to the server; here is why it survives at all.
2. **B04 owns the router**: one `switch` on method and pathname, a JSON body reader, an SSE helper.
   It is a chunk, and it is small.
3. **Validation is ours**, which is required rather than incidental: `DESIGN.md` §5.1 writes rejects
   to `signal_deliveries` with the raw body retained. A framework's 400-and-discard would have to be
   worked around.
4. Handlers are `(req, res)`, so B remains a drop-in if the router ever becomes a burden.

### What it forecloses

**Nothing.** Handler signatures are framework-shaped either way.

### How I'd defend this in review

The one feature a framework would have bought us — validation at the boundary — is a feature we
specifically cannot use, because `DESIGN.md` §5.1 requires the boundary to *persist* what it rejects.

---

## DECISION #43 — Test runner, and what gets an automated test at all

**Status:** ACCEPTED — option A · **Date:** 2026-09-04 · **Blocks:** B12

### Question

`CLAUDE.md` §10 defines done as *"verifiable by hand in the browser or terminal, with steps given"*,
and the brief asks for no tests. But four things are pure functions whose arithmetic is wrong in ways
a screen does not reveal: `fold()`, attribution, the restatement decrement/credit, and the lag
mixture. `GET /api/verify` and the P14 sweep are in-product checks over real data — not unit tests,
and not substitutes for them.

### Options as presented

**A) `node:test` + `node:assert`, on those four pure functions only.** Built in, zero dependency;
no component testing, so the UI stays hand-verified as §10 asks.
**B) Vitest, client included.** One runner both sides, shares Vite's config; a dependency, a config
file, and it invites UI tests that `CLAUDE.md` §7 deprioritises.
**C) No automated tests at all.** Fastest per chunk; the four functions get no coverage until B24,
and the sweep says *that* buckets disagree, not *which* branch is wrong. All three: reversal cost low.

### Chosen

**A.** `node:test`, confined to `fold()`, attribution, restatement and the lag mixture.

### Rationale — Seno's words

> "tests only where a wrong answer is invisible; the agreement sweep is the real safety net."

**This is a sharper rule than option A's own wording, and it governs.** A named four functions;
Seno named the *criterion* that picked them — **a wrong answer that is invisible**. So the test
surface is defined by that test, not by a list, and consequence 2 below is restated in those terms:
a fifth test target is admissible exactly when its wrongness cannot be seen, and inadmissible
otherwise. The second clause also fixes the standing of the automated tests: the B24 agreement sweep
is the safety net, and unit tests are the bisection tool under it — not the other way round.

### Supporting analysis as presented *(mine, not his)*

> The argument is not coverage, it is bisection. `BUILD_PLAN.md` §13 names B20 (restatement) as the
> hardest chunk and notes its bugs are invisible until B24's sweep; a fixture test that folds five
> decisions or promotes one orphan turns "some bucket disagrees somewhere in 1.6M events" into a
> named failing branch. Confining tests to those four functions keeps the cost near zero and keeps
> the UI on the hand-verification path `CLAUDE.md` §10 already specifies. C's in-product checks stay
> — they are the reviewer-facing evidence; unit tests are the developer-facing bisection tool, and
> they are not substitutes.

### Consequences

1. **B01 adds a `test` script** (`node --test`) and no dependency.
2. **The test surface is governed by a criterion, not a list** — *"only where a wrong answer is
   invisible"*. Four functions meet it today. A chunk proposing a fifth must argue that its
   wrongness cannot be seen by hand or by the sweep; if it can be seen, it is hand-verified per
   `CLAUDE.md` §10 and gets no test. The criterion is cited in the chunk, not assumed.
3. **`/api/verify` and the P14 sweep are unaffected** — they were never tests, and they remain the
   reviewer-facing evidence.
4. The UI is hand-verified, per chunk, per `BUILD_PLAN.md`'s verification column.

### What it forecloses

**Nothing.** Adding Vitest later is additive, and no test written under A would need rewriting.

### How I'd defend this in review

Unit tests here are a debugging tool aimed at the four functions whose bugs a screen cannot show, not
a coverage exercise — and the in-product agreement sweep over 1.6M real events is the evidence a
reviewer should actually be shown.

---

## F4 — D44 and D45 are DEFERRED, not open

**Status:** DECIDED — deferred to stage 4 · **Date:** 2026-09-04 · **Relates to:** D44, D45 ·
**Not a new decision**

### Instruction

> "Mark D44/D45 deferred, not open."

### What the distinction means, and why it is worth an entry

**Open** and **deferred** read the same in a table and behave differently on a cold resume. An
*open* decision is an unanswered question that something is waiting on — `STATUS.md` § "What is
open" lists it, and the next action is to chase it. A *deferred* one is a question **deliberately
not being asked yet**, because the chunk that needs it is thirty-five chunks away and answering it
now would be answering it with less information than we will have then.

`BUILD_PLAN.md` §2 asked for exactly this disposition at the Phase 4 close — *"if you would rather
decide them later, say so and `BUILD_PLAN.md` §2 gets a note that they are deferred rather than
open"* — and this is that instruction.

### Consequences

1. **`STATUS.md` § "What is open" carries no blocking decisions.** For the first time since Phase 0
   the build is unblocked end to end as far as B35.
2. **D44 becomes live at B37, D45 at B36.** Whichever chunk arrives first raises both together, since
   they land in the same two files. **The chunk before B36 must re-raise them** — a deferral that
   nobody re-opens is just a forgotten decision.
3. **The recommendations stay on the table** (uPlot behind a descriptor-bearing wrapper; one plain
   stylesheet with semantic custom properties), and the analysis stays in `OPEN_QUESTIONS.md`
   § Wave 7. Deferring is not a lean toward either.
4. **Neither may be settled by drift.** No chunk before B36 may install a chart or styling library,
   or hand-roll something that pre-empts the choice. If a stage-0–3 chunk needs any styling at all,
   it uses unstyled HTML and says so.

### What it forecloses

**Nothing** — that is the point of deferring rather than deciding.

### How I'd defend this in review

Both questions are answered better at B36 than at B01, because by then the data volumes and the
settlement-state legibility problem are concrete rather than predicted — and neither blocks a single
chunk in between, so deferring costs nothing and buys information.

---

## U8, U9 — RATIFIED AT B02

**Status:** ACCEPTED · **Date:** 2026-09-04 · **Not new decisions** — two Phase 5 assumptions,
raised in the B02 report and disposed of in one sentence.

**Wording of record.**

> "Both nodded. Record them, don't re-raise them."

**"Don't re-raise them" is itself the disposition and is why this entry exists.** Both were labelled
`ASSUMPTION (unratified)` and would otherwise be re-surfaced by the chunk that depends on them —
B57 for U8. They are now settled, and a later chunk that wants to change either is opening a new
decision, not answering an old one.

| # | Assumption | Was owed before | Status |
|---|---|---|---|
| **U8** | The store lives at `data/loop.sqlite`, overridable with `DB_PATH`. No design document specifies a path. | B57 (the one-command run) | **RATIFIED** |
| **U9** | `node:sqlite`'s `ExperimentalWarning` is **not** suppressed. It prints on every run, including the demo. | any packaging chunk that touches process flags | **RATIFIED** |

### U8 — the store path

`src/server/db.ts` exports `DB_PATH`; server, simulator and migration runner all import it, so
there is one definition and they cannot disagree. Covered by `.gitignore` (`*.sqlite` and its WAL
and SHM sidecars). **Consequence:** deleting `data/` is the supported reset, and `npm run db:migrate`
rebuilds from empty — which is also how a reviewer starts clean.

**Forecloses.** Nothing. One constant, one env var.

### U9 — the experimental warning stays visible

**Why it is not noise.** D8 chose `node:sqlite` over `better-sqlite3` on a *no new dependency*
argument, and its flip condition is written into D8 rather than left as a later judgement call. The
warning is the standing evidence that the trade-off was made with open eyes; suppressing it would
make the demo quieter and the defence weaker, and a reviewer who spots a hidden `--disable-warning`
flag learns something worse than a reviewer who reads the warning.

**Consequence:** B57's `npm start` output carries the warning, and the README says why in one line
rather than leaving it to look like an oversight.

**Forecloses.** Nothing — one flag, reversible at any time. But per the wording of record it is not
re-raised: a chunk wanting it quiet must argue the case anew.

**How I'd defend this in review.** The store's location and the driver's experimental status are
both things a reviewer will notice within a minute of cloning; each is written down with its reason
rather than discovered.

---

# Wave 8 — Phase 5 read side (D46)

Raised at **B08**, 2026-09-04, and answered the same day. One decision, and the chosen option is
**Seno's own** — an amendment to the three I offered, which is recorded as such rather than folded
into my recommendation.

**Wording of record.** Quoted in full below, because unlike the Wave 7 sentences this rationale
*is* the analysis: it corrects two arguments of mine and adds the constraint none of my options
met. Full option table in `docs/OPEN_QUESTIONS.md` § Wave 8 — the §3 compression allowance.

---

## DECISION #46 — Where window aggregation lives: who computes a displayed total

**Status:** ACCEPTED — **option D, authored by Seno** · **Date:** 2026-09-04 ·
**Blocked:** nothing when asked · **Blocks:** B38 · **Shapes:** B09, B10, B36, B51, B52, B53

### Question

`DESIGN.md` §10.1's `TraceDescriptor` is a window aggregate (`metric` + `ad_ids` + `from`/`to` +
`granularity_s`) issued by the server with the value. `BUILD_PLAN.md` B38 nonetheless puts
`src/web/metrics.ts` on the client. B07 sends per-bucket counts and no total, so B08 had no
headline number it could legitimately render. Who computes a displayed window total — and its
ratios?

### Options as presented (one line each; full analysis in `OPEN_QUESTIONS.md` § Wave 8)

- **A)** Server computes every displayed aggregate; snapshot grows signed totals/series;
  `web/metrics.ts` becomes formatting only. Forecloses nothing; reversal cost low now, high later.
- **B)** Client aggregates from server bucket counts; only buckets are drillable. **Forecloses HR5
  on every headline number the strategist reads.**
- **C)** Hybrid — server computes window totals and ratios; client re-buckets for coarser chart
  granularity, labelled not drillable.
- **D)** *Added by Seno.* C with one change: the client's re-bucketing carries the **same
  server-issued descriptor**.

**My recommendation was A. Two of its supporting arguments were wrong** — see the rationale.

### Chosen

**D.** Server computes and signs totals and ratios in the snapshot. **SSE keeps per-minute absolute
rows, unchanged.** The client may re-bucket to display granularity, and what it renders carries the
server's descriptor unmodified.

### Rationale — Seno's words

> "#46 — option D, an amendment to your three. Two corrections: §10.2's "compare the client to
> itself" is about the rejected D30-A (client aggregates raw), so B doesn't fail on that argument;
> it fails on §10.1 — the descriptor rides on values the server sends, so a client-computed total
> has no descriptor and B52's <Metric> can't render it. And none of A/B/C answers the live path,
> which is B09/B10 — next up. Under strict A the post-SSE total either gets recomputed on the
> client anyway, or SSE carries display-granularity rows and breaks D30 consequence 2's idempotent
> resume.
>
> D(essentially C with one change): the descriptor is the query, not the answer (§10.1's words,
> granularity_s included). Server computes and signs totals and ratios in the snapshot; SSE keeps
> per-minute absolute rows unchanged; the client's re-bucketing to display granularity carries the
> same server-issued descriptor, so the quarantine holds and B53 checks it against raw — a client
> aggregation bug reads as FAIL in the drill-down. Stays inside D10: counts aggregate, the division
> comes after. Trade vs A: A makes client arithmetic bugs impossible, D makes them caught on click.
> Worth it to avoid paying in B09."

### The two corrections, kept separate

Both are corrections to **my** analysis and both change what this decision defends:

1. **§10.2 is not a ban on client arithmetic.** It is about **D30-A**, the client aggregating
   **raw** events. The rule that actually binds is **§10.1**: a descriptor rides on server-sent
   values, so a client-invented total is unrenderable by **B52's `<Metric>`** (D34's quarantine).
   Cited wrongly, the argument would have collapsed the first time a reviewer opened §10.2.
2. **The live path was missing from all three options.** Under strict A, B09/B10 force a choice
   between recomputing the total on the client anyway and pushing display-granularity rows down
   the stream — and the second breaks **D30 consequence 2**'s idempotent resume. A decision that
   fails two chunks after it is taken was not a decision.

### Consequences

1. **B38 widens `snapshot()`** with server-computed totals and ratios per requested metric —
   counts summed in SQL, the division after (D10 unchanged). `src/web/metrics.ts` survives, but as
   **re-bucketing and formatting under a server descriptor**, never as an independent number.
2. **B09/B10 are unaffected.** The stream carries per-minute absolute rows exactly as D30 specifies,
   so the idempotent resume stands and there is no display-granularity variant on the wire.
3. **B51 signs the descriptor for every server-sent metric**, and the client passes it through
   **byte-for-byte**. It must re-bucket to the descriptor's own `granularity_s` — re-bucketing to a
   different one while forwarding the descriptor asks the drill-down a question the number does not
   answer. Written into `BUILD_PLAN.md` §14.
4. **B53's drill-down becomes the check on client aggregation**, not just on server arithmetic: it
   replays the descriptor against raw and compares to the displayed figure, so a client re-bucketing
   bug surfaces as an explicit **FAIL** in front of the reviewer.
5. **B52's `<Metric>`** still refuses to render anything without a descriptor. That is what makes
   consequence 3 enforceable rather than conventional.

### What it forecloses

**Nothing identified** — which is the honest answer and also why the reversal cost is low. What it
*spends* is stated in Seno's own trade: strict A would make a client arithmetic bug **impossible**,
where D makes it **caught on click**. If a client re-bucketing bug ever ships and is not clicked, D
is the option that let it through, and the mitigation is B53 being demonstrated rather than merely
built.

### How I'd defend this in review

The descriptor is the query, not the answer — so the client is allowed to aggregate as long as it
aggregates *the server's question*, which the drill-down then re-answers from raw events and checks
against what is on screen; that keeps the stream's absolute per-minute rows, and their idempotent
resume, intact.

---

## DECISION #47 — The `resnapshot` threshold, and how the cursor reaches the server

**Status:** ACCEPTED — **2,000 rows**, with Seno's amendment to the cursor channel ·
**Date:** 2026-09-04 · **Blocked:** B10a · **Shapes:** B10b

### Question

`DESIGN.md` §3.1 promises that a cursor "older than the server can serve cheaply" gets a
`resnapshot` frame, *"stated rather than left to a timeout"*. What is the number — and what shape
should it even have, given the replay (`max_ingest_seq > cursor`) is unbounded in ads and time
while the snapshot it falls back to is window-scoped?

### Options as presented (full analysis in `OPEN_QUESTIONS.md` § Wave 8)

- **Shape.** Seq distance and cursor age both **rejected**: they mispredict the cost by orders of
  magnitude in both directions (100,000 impressions in a minute dirty *one* bucket; 20,000 late
  conversions over 20,000 minutes dirty *20,000*, at identical seq distance). Retention floor
  **cannot fire** — D11 builds no compaction. **Chosen: row count**, measured with `LIMIT N+1` on
  the query already being run, which also bails earliest in the expensive case.
- **Value.** **2,000 rows** (0.65 MiB, 14 ms) — chosen — against **5,000** (1.6 MiB, 35 ms), which
  would keep a genuine `late_cascade` replayable. Anchored on the 720-row cost of the client's own
  fallback: 12 ads × a 60-minute window.

### Chosen

**2,000 rows**, plus two non-cost conditions (`cursor > high-water` → resnapshot; non-numeric
cursor → resnapshot, not `400`) — and **the cursor arrives as `max(?cursor=N, Last-Event-ID)`**.

### Rationale — Seno's words

> "2,000 — but first fix "absent → go live": EventSource can't set the header on first connect
> (measured), so accept ?cursor=N too and use max(header, query), or every refresh silently drops
> the snapshot-to-subscribe gap."

### The correction this makes to my proposal

I had *absent `Last-Event-ID` → no replay, just go live*, reasoning that the client had only just
snapshotted. That defeats the mechanism. **`EventSource` cannot set a request header** — its
constructor takes `withCredentials` and nothing else — so the header exists **only on the browser's
own reconnect**, never on the first connect after a snapshot. Under my version, every refresh would
silently drop the **snapshot-to-subscribe gap**: events landing between §3.1 step 1 and step 2 are
flushed to whatever subscribers exist and gone, so those buckets read stale until they happen to
move again. The failure is invisible and it is on the most common path in the app.

**Why `max` and not `min`.** Both cursors are *true* statements of "I hold everything up to X" — the
query cursor because the snapshot returned it, the header because the browser only replays an id it
actually dispatched. The max is therefore the **tightest true lower bound** and loses nothing. `min`
would be merely redundant on a short reconnect, but on a long-lived session the rows dirtied since
the original snapshot could exceed 2,000 and force a resnapshot for no reason at all.

### Consequences

1. **B10a** reads `max(?cursor=N, Last-Event-ID)`, replays with `LIMIT 2001`, and sends
   `resnapshot` on 2,001 rows, on a cursor above the high-water seq, or on a non-numeric cursor.
2. **B10b's `EventSource` URL must carry `?cursor=<as_of_ingest_seq>`** from the snapshot it just
   took. Written onto B10b's row — without it the gap returns, and nothing fails loudly.
3. The threshold is a constant in `stream.ts` until **B21** creates `src/shared/config.ts`, which is
   where it belongs alongside the horizon.
4. **Subscribe before replaying** (my note, kept): reversed, an event landing between the replay and
   the subscribe is lost, whereas subscribing first can only duplicate a row — and duplication is
   free, because absolute rows are idempotent (D30).

### What it forecloses

Nothing structural. If compaction is ever built (D11 declines to), the retention floor becomes a
**third** resnapshot condition rather than a replacement for this one. Raising 2,000 later is a
one-line change with no migration.

### How I'd defend this in review

The threshold is on the quantity that actually costs — rows, not elapsed sequence — measured with a
`LIMIT` on the query already being issued, and its value is pinned to the cost of the fallback it
chooses between: above roughly one portfolio-hour of rows, replaying transfers more than
re-snapshotting would. And the cursor is taken as the max of two independently-true lower bounds,
because the browser's `EventSource` cannot send a header on the connect that matters most.

---

# Wave 9 — Phase 5 process (D48–D50)

Three **process** decisions, raised at the B11 close and ratified the same day. They are here rather
than only in a chat message because **D48 amends `CLAUDE.md` §5**, and a change to the standing
contract that lives nowhere is the drift §3 exists to prevent.

Full option analysis: `OPEN_QUESTIONS.md` § Wave 9, per §3's compression allowance.

### Wording of record

**One sentence ratified all three.** Recorded as a mapping rather than restated in each entry's
prose, per `CLAUDE.md` §3.

| Decision | Chosen | Seno's words |
|---|---|---|
| **D48** | **B** — group-gated, chunk-committed, five solo exclusions | *"move with your recommendtions"* |
| **D49** | **C** — hold the cut line until the B36 gate | *(same sentence)* |
| **D50** | **B** — B61 becomes a running document from B36 | *(same sentence)* |

The sentence ratified the recommendation of each decision as written above it, and nothing wider.
Where a later chunk needs a rationale in Seno's words, this is the whole of it — the reasoning below
is mine, presented and accepted, not quoted.

---

## DECISION #48 — Approval granularity: chunk-gated or group-gated

**Status:** ACCEPTED — option B · **Date:** 2026-09-04 · **Tag:** [LOAD-BEARING] ·
**Amends:** `CLAUDE.md` §5

### Question

`CLAUDE.md` §5 gates every chunk on an explicit "ok". Twelve chunks landed on 2026-09-04 and **52
remain** against a 2026-09-08 demo. Does the gate stay per chunk?

### The measurement it rests on

The building is not the cost. Each chunk costs announce → build → report → Seno reads and
independently re-runs → "ok" → commit → tick. The code is minutes; the **round-trip is the serial
bottleneck**. Chunk *size* is what makes a diff reviewable; chunk *gating* is what makes it slow.
Only the first is load-bearing, so only the second was changed.

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Keep chunk-gated — 52 more gates | Does not fit the runway; forces cuts later under pressure |
| **B** | **Group-gated, chunk-committed** — 3–5 chunks per gate, one commit per chunk | **CHOSEN** |
| C | Group-gated *and* group-committed | Rejected — destroys the per-chunk traceability that is itself a deliverable (L153) |
| D | Widen chunks to ~20 larger ones | Rejected — trades review *quality* for speed, where B trades only *latency* |

### What was chosen

**Group-gated, chunk-committed**, with a written exclusion list — the grouping is safe only because
of what stays solo, so the two halves are one decision.

1. **A group is 3–5 related chunks and never crosses a stage boundary.** Announce the group, build
   it, report once with a **per-chunk** verification block, one "ok" covers the group.
2. **Commits stay per chunk** — own message referencing the plan item, own `BUILD_PLAN.md` tick.
3. **Five chunks stay single-gated**, being the ones §13 already named as invisible-when-wrong or
   decision-owing: **B20** (restatement — the hardest chunk, bugs invisible until B24), **B24** (the
   P14 agreement sweep — the gate that guards everything after it), **B34** and **B35** (backfill
   and the `T0` seam — a wrong seam makes `as_of` silently meaningless rather than broken), and
   **B36**/**B37** (they need the deferred D45 and D44 answers, so they are gates already owed).
4. **A group stops early, mid-build, if** a chunk needs a decision (§3), reveals the design is wrong
   (§5), or wants a new dependency. The remainder of the group is re-announced after the answer.
5. **Everything else in §5 and §10 is unchanged** — the ~150-line ceiling per chunk, one concern per
   chunk, no drive-by refactors, every chunk leaving the app runnable, D7, the traps discipline.

### Consequences

1. Gates fall from 52 to roughly 13. Stage 2's fourteen chunks become **five**: `B12+B13+B14` ·
   `B15+B16+B17` · `B18+B19` · **`B20` solo** · `B20a+B21+B22+B23` then **`B24` solo**.
2. **Detection moves later, and that is the whole of what was traded.** Seno's re-runs caught real
   silent bugs at B07 and B10a. The mitigation is that verification is *not* batched: every group
   report carries each chunk's own verification commands, so one pass re-runs all of them. Stage 2
   is `curl` + `sqlite3` only, so a group's verification is one copy-pasteable block.
3. `BUILD_PLAN.md` §14 and `STATUS.md`'s "the convention" paragraph both restate the chunk gate and
   are amended with it.
4. The AI process artifact is unaffected: per-chunk commits, per-chunk plan items, one report per
   group instead of per chunk.

### What it forecloses

**Nothing, and that is the argument for it.** It is per-group and reversible mid-stage — "solo from
here" restores option A with no cost. Option C would have foreclosed per-chunk history permanently,
which is why it was rejected despite being marginally faster.

### How I'd defend this in review

The bottleneck was measured before it was changed, and the change was aimed at the part of the loop
that had no defensible value — waiting — while the parts that catch invisible failures were left
intact: chunk size, per-chunk commits, per-chunk verification steps, and single gates on precisely
the five chunks the plan had already flagged as the ones whose bugs do not announce themselves.

---

## DECISION #49 — Take the cut line now, or hold it in reserve

**Status:** ACCEPTED — option C · **Date:** 2026-09-04

### Question

`BUILD_PLAN.md` §13 says the response to a low rate is to take §12's cut line top-down. With 52
chunks left, is it taken now?

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Cut rows 1–4 now (B48 markers, B40 smoothing, B45 fatigue flag, most of B44 telemetry) | Rejected — row 3 is HR7's read-side interpretation, which §12 itself calls a real loss |
| B | Cut rows 9–11 now (one AR(1), 5-day backfill, 6 ads) | Rejected — row 11 costs three demo moments; cheap in time, expensive in evidence |
| **C** | **Cut nothing yet; decide at the stage 3 → 4 seam** | **CHOSEN** |

### What was chosen

**Hold the whole cut line until the B36 gate.** Nothing is cut; `STATUS.md`'s "cut line status"
stays **nothing cut**.

### Consequences

1. D48 is the acceleration; the cut line stays **insurance**, spendable in one minute at B36 when
   the real rate is known rather than guessed.
2. **The B36 gate now carries three obligations, not one**: re-raise D44 and D45 (already required
   by F4 and `BUILD_PLAN.md` §7), and re-decide D49 against measured velocity.
3. Rows 1–4 remain the first to go, in that order, and each still owes a README line per §8.

### What it forecloses

Nothing. Every row stays exactly as droppable as it was; the decision is only *when* to look.

### How I'd defend this in review

Cutting scope is irreversible in evidence and reversible in nothing; cutting latency is reversible
in both directions. We took the reversible saving first and kept ~6 chunks of insurance intact for
the moment we would actually know whether it was needed.

---

## DECISION #50 — Where the demo script sits in the order

**Status:** ACCEPTED — option B · **Date:** 2026-09-04

### Question

**B61** is the ordered walkthrough *"a stranger can follow"* and is second-to-last in the plan. Seno
also has to learn the app before the demo. Does B61 stay where it is?

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Leave B61 last | Rejected — learning time becomes whatever survives on the final day |
| **B** | **B61 becomes a running document from the B36 gate onward** | **CHOSEN** |
| C | Move B61 to immediately after B50 | Rejected — B51–B55 are the most demo-worthy part and would not be in it yet |

### What was chosen

From **B36** on, every stage-4 and stage-5 group **appends its walkthrough steps to `docs/DEMO.md`
as it lands**. B61 becomes a tidy-up and a final ordering pass rather than a write-from-nothing
chunk.

### Consequences

1. **Each group report from B36 onward owes one line** saying what it appended to `docs/DEMO.md`.
   Without that line the document silently stops being maintained, which is the failure mode of
   every running document.
2. The refresh and restart tests (HR1) are written into it the moment the surface exists, not
   reconstructed at the end from memory.
3. B62's final refresh gets smaller — the last thing worth having to write on demo eve.
4. `docs/DEMO.md` is created by the **B36 group**, not now: there is no walkthrough to write until a
   surface exists.

### What it forecloses

Nothing. B61 still exists as a chunk and still owns the final ordered pass.

### How I'd defend this in review

The deliverable that teaches someone the app is worth more written while the app is being built than
recalled afterwards — and it is the one artifact whose accuracy decays if it is written last.

---

## DECISION #51 — `create_ad`'s `created_at`: supplied or derived

**Status:** ACCEPTED — option B · **Date:** 2026-09-04 · **Ratified at:** the G1 gate (B12–B14)
**Relates to:** U7, E7 (G03), `DESIGN.md` §2.3, the §Appendix derivation rule

### Question

`DESIGN.md` §2.3 types `create_ad`'s payload as `Omit<AdConfig, "status" | "launched_at">`, which
leaves `created_at` (E7) as a field the client sends. U7 already makes `Decision.ts` request time,
so the same event would carry two timestamps, free to disagree, with the log holding the
authoritative one and the projection holding the other.

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Follow the literal `Omit` — the client supplies `created_at` | Rejected — two timestamps for one event, and the Appendix says nothing derived is written by hand |
| **B** | **Omit `created_at` too; the fold takes it from the decision's `ts`** | **CHOSEN** |

### Rationale — Seno's words

> "created_at derived: approved"

Ratifying the recommendation as put at the G1 announcement: the Appendix's *"nothing that is
derived is written by hand"* and U7's request-time `ts` together make one timestamp the only
defensible answer, and deriving it means the `ads` row and the log row cannot drift.

### Consequences

1. `AdInitial` is `Omit<AdConfig, 'status' | 'launched_at' | 'created_at'>` in
   `src/shared/decisions.ts`.
2. `POST /api/decisions` **rejects** `initial.created_at` with `400
   initial.created_at_is_derived_from_ts` rather than ignoring it — a silently dropped field is
   how a client comes to believe it set something.
3. **B15's seeder cannot backdate an ad's creation.** Twelve `create_ad` decisions all carry the
   seeder's own `ts`, and `created_at` follows it. If the seeded world needs ads that were created
   at different points in the backfilled week, that is a property of the decision `ts` the seeder
   writes, not a separate field — which is the correct place for it, and B34's `T0` seam is where
   it becomes visible.
4. `DESIGN.md` §2.3's `DecisionBody` sketch is now one field wider than the code. The code is
   right; the sketch is annotated in `src/shared/decisions.ts` at the point of divergence.

### What it forecloses

Nothing structurally — reinstating a client-supplied `created_at` is one field on `AdInitial` and
one removed rejection. What it does foreclose is a *disagreement* between `decisions.ts` and
`ads.created_at`, which is the point.

### How I'd defend this in review

Every other derived value in this build comes from a log; `created_at` was the one field the given
contract would have let a client assert. Deriving it means the whole `ads` row is a function of the
decision log, with no exceptions to explain.

---

# THE G2 PASS — D52, D53

Both were surfaced at the **G2 announcement**, before any code, because both are written into the
authoritative decision log by B15 and the log is append-only.

**Wording of record — Seno's words, one sentence ratifying both:**

> "52 - B and 53 - B"

**The mapping, recorded explicitly rather than restated in each entry** (`CLAUDE.md` §3): *52 - B*
ratifies **D52 option B** — hand-set budgets grounded in the expected-spend arithmetic, with two
ads deliberately placed near their cap. *53 - B* ratifies **D53 option B** — B15 backdates the
seeded `create_ad` / `launch` decisions to `T0 − live_days`, fixing `T0` as the seeder's boot
instant.

---

## DECISION #52 — `daily_budget_cents` for the twelve seeded ads

**Status:** ACCEPTED — option B · **Date:** 2026-09-04 · **Blocks:** B15
**Relates to:** D26 consequence 3, I3/P11, `SIMULATOR.md` §9, §21

### Question

`SIMULATOR.md` §9 makes budget a **pacing multiplier**: delivery is unaffected until 90% of
`daily_budget_cents` and slides to zero at 105%. §2.3 gives each of the twelve ads an
impressions/day figure but **no budget**, and §21's parameter appendix has no per-ad budget table.
It cannot be deferred — it is a `create_ad` payload field, the log is append-only, and a wrong
value can only be corrected by twelve `set_budget` decisions polluting the seeded log.

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Derived by formula: expected daily spend × a headroom % | Rejected — every ad lands at the same point on the pacing curve, so ρ ≈ 1 everywhere and §9 is **inert in the seeded world**; the headroom % is a chosen number wearing a formula's clothes |
| **B** | **Hand-set round numbers, grounded in A's arithmetic, with two ads near their cap** | **CHOSEN** |
| C | One uniform budget for all twelve | Rejected — a_08 (65k impr/day) would throttle hard while a_09 (5k) never approaches its cap: an accident, not a design, and it reads as one |

### What was chosen, and the arithmetic behind it

Expected daily spend is computed per ad from §21 and written into `src/sim/fixtures.ts` beside each
row, so every budget is defensible individually rather than uniformly:

```
clicks/day  = impressions/day x ctr_base(temperature) x ctr_mult(channel)      [phi = nu = 1]
cpm charge  = impressions/day x cpm_share(channel) / 1000 x cpm_base(channel)
cpc charge  = clicks/day x cpc_share(channel) x cpc_base(channel) x cpc_mult(temperature)
baseline    = cpm charge + cpc charge
```

The channel's **CPC/CPM split** is read as *the fraction of impressions bought on each basis*. That
reading is self-checking: applied to impressions it reproduces the stated split **in money** to
within a few points on all four channels (meta_feed 68/32 against a stated 70/30; tiktok_feed 29/71
against 30/70). The alternative reading — the split as a money ratio applied to a single base —
disagrees with the CPM and CPC bases by a factor of ~2.6 and is therefore not what §21 means.

Ten ads are set to a round number **~25% above** their baseline, so pacing is inert for them and
delivery is budget-unconstrained. **Two are set close to or below it:**

- **`a_08`** — §2.3's "gate-boundary ad", the highest-volume ad with no fatigue story of its own.
  Budget **$950/day** against a ~$890 baseline: `a` reaches ~0.94 by day end, so `ρ_terminal` is
  visibly biting in the evening.
- **`a_12`** — the brief's own pause target. Budget **$90/day** against a ~$120 baseline, so it
  throttles in the evening peak and a `set_budget` raise **releases it inside one tick**. That is
  D26 consequence 3's second closable decision, demonstrated on the one ad the brief names.

### Consequences

1. **Two ads' impression volumes will land below §2.3's stated impressions/day**, because pacing
   throttles them. That is the model working, not a calibration miss — but §18.3's ladder placement
   for `a_08` was computed at its unthrottled rate, so **B35's calibration check must expect the
   throttled figure for `a_08` and `a_12`** or it will report a false failure.
2. Budgets are ours, not the brief's. They belong in `BRIEF_GAPS.md` § Extensions as a row.
3. `a_12` being budget-constrained does not weaken the pause demo — a throttled ad still emits.

### What it forecloses

Nothing. A budget is one `set_budget` decision away at any time, which is the point of the lever.

### How I'd defend this in review

A pacing model that never fires in the data you ship is a model you cannot be shown to have built.
Two ads near their cap cost two numbers and turn §9 from code into something visible on frame one.

---

## DECISION #53 — Does B15 backdate the seeded decisions, and thereby fix `T0`?

**Status:** ACCEPTED — option B · **Date:** 2026-09-04 · **Blocks:** B15 · **Couples to:** B34
**Relates to:** U7, D14, D51, `SIMULATOR.md` §2.3, §15.2, §15.3

### Question

`SIMULATOR.md` §2.3 staggers the launches — *"three ads have seven days of history, the rest one to
six"* — and §15.2 backfills seven days of events. But `launched_at` and every `config_generations`
window come from the **decision's `ts`**, and U7 makes `ts` request time. If B15 stamps all
twenty-four decisions at seeder boot, every backfilled click sits **before** any generation's
`valid_from`, so D14's `credited_generation_id` is `NULL` for 100% of the seeded window. The log is
append-only, so B34 cannot repair it afterwards.

### Options as presented

| | Option | Verdict |
|---|---|---|
| A | Stamp everything at seeder boot | Rejected — D14 is dead on the seeded window, §2.3's stagger becomes decorative, and the reversal cost is a full reseed discovered at B37 |
| **B** | **Backdate: `launch.ts = T0 − live_days`, `create_ad.ts` one minute earlier, `T0` = seeder boot** | **CHOSEN** |
| C | B15 creates at boot; B34 reseeds from scratch | Rejected — B15's own output is thrown away, so B15 verifies nothing that survives, and there are two seeders to keep in step |

### Consequences

1. **The seeder is a privileged writer that can backdate, and U7 still holds.** U7 constrains
   `POST /api/decisions`, where `ts` is server-assigned and a wire `ts` is a 400. The seeder calls
   `applyDecision()` **in process**, which takes `ts` as an argument. This is exactly the
   consequence **D51** already recorded. The README must say so plainly rather than leave a reader
   to find a backdated log and infer that the endpoint allows it.
2. **`T0` is defined one chunk earlier than B34**, which now inherits it rather than choosing it.
   `T0` is **recoverable from the log** — the seven-day ads' `launch.ts` plus seven days — so it
   needs no new column, and B34 owes only the decision of whether to make that explicit.
3. `create_ad` one minute before `launch` means every ad carries a one-minute `draft` generation.
   That is real history, not noise: it is the interval during which the config existed and served
   nothing, and D5 says draft edits are not in the log precisely because that interval is free.
4. Attribution across a config change is demonstrable on seeded data from B18 onward.

### What it forecloses

Nothing that B34 needs. It fixes the *stamping*, not the derivation: B34 may still choose how `T0`
is computed or recorded, it simply cannot re-stamp decisions already written.

### How I'd defend this in review

The alternative was not "decide later" — it was "decide later, after three more chunks are built on
top, and pay for it with a reseed". The only cost of deciding now is a definition B34 was going to
have to make anyway.
