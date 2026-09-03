# DECISIONS.md

Ratified decisions only. A decision reaches this file when Seno has answered it; until then it
lives in `docs/OPEN_QUESTIONS.md` as an open question. Recommendations are not decisions.

Each entry carries, per `CLAUDE.md` §3: id, date, the question, the options as they were
presented, what was chosen, the rationale **in Seno's words**, consequences, what it forecloses,
and a one-line "how I'd defend this in review".

Ids match `docs/OPEN_QUESTIONS.md` §B. `G##` references point into `docs/BRIEF_GAPS.md`.

| # | Title | Status | Date |
|---|---|---|---|
| D1 | Which surfaces are built for real | **ACCEPTED — A** | 2026-09-03 |
| T1 | Triage of the blocking findings | **ACCEPTED** | 2026-09-03 |
| D2–D25 | — | open | — |

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
