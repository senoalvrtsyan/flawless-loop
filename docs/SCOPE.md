# SCOPE.md

Phase 1 output. **Status:** the scope of record, per `docs/DECISIONS.md` § D1, § T1, § D26.
**Date:** 2026-09-03. Plan items P1–P8 are T1's costing of the FIX bucket; P9–P15 pre-stage
`docs/BUILD_PLAN.md` (Phase 4) and are not that document.

**This re-affirms D1 rather than changing course.** D1 chose the surfaces; D26 chose the depth.
Nothing about which surfaces are real has moved. What D26 adds is an explicit, ordered cut line.

---

## 1. The slice in one sentence

A strategist's cockpit over ~8–12 seeded live ads, where every performance number on screen is
derived from a persisted event stream, late-arriving conversions are credited to the creative
that earned them and visibly restate the numbers they land in, and two levers — `pause` and
`set_budget` — change what the world does next.

---

<!-- README-VERBATIM-BEGIN — sections 2, 3 and 4 go into the README unchanged -->

## 2. What's real

**Surfaces:** Signal, built deep. Decision loop, working but plain.

| # | Item | Closes |
|---|---|---|
| P1 | Ingest boundary: `received_at` + `ingest_seq` envelope extension, dedupe on `event_id`, all deliveries persisted, non-negative-integer validation | G16 |
| P2 | Signal types + simulator emitter: `click_id` distinct from `event_id`, spend as fixed-interval deltas | G17, G19 |
| P3 | `create_ad` + `launch` decision variants, with compare-and-swap validation | G33 |
| P4 | Config fold + rebuildable `ads` projection from the decision log | G33 |
| P5 | `config_generations`, maintained on every config-changing decision | G01 |
| P6 | Minute-bucket rollups + settlement state from the lateness horizon, incl. the account-timezone constant | G42, G04 |
| P7 | Restatement path: a late arrival recomputes affected buckets and marks them restated | G42 |
| P8 | Click-time attribution for conversions + orphan parking / provisional counting | G01, G42 |
| P9 | SSE transport with `Last-Event-ID` resume; live Signal screen; ratios derived at read from additive counts | — |
| P10 | Action console (`pause`, `set_budget`, `swap_component`) + decision log | — |
| P11 | Budget as a pacing parameter on the simulator's diurnal rate curve | G04, G47 |
| P12 | Traceability drill-down: any number opens the exact contributing raw events, re-summed client-side and asserted against the displayed figure | — |
| P13 | `trace <event_id>` endpoint — the "life of one event" made executable: emission → stored fact → buckets updated → metrics changed → screen elements affected | — |
| P14 | Rollup-vs-raw agreement test across every bucket, runnable on demand | — |
| P15 | Read-only component screen: the reverse join over live data (D1's specified sketch) | — |
| P16 | Demo-mode lateness horizon: shortening the horizon re-evaluates which buckets are settled | D13 |
| P17 | Scenario control: `POST /api/sim/scenario` + the seven triggers, delivered over the simulator's existing world poll and persisted so they stay part of the replayable record | F3, D40 |
| P18 | Decision scoring: a symmetric 6 h before/after window either side of each decision, one primary metric, **withheld until both windows are past the lateness horizon**, with any second lever inside either window flagged as contaminated on the entry | G42, D19, D68, D70 |

**P17 is not optional either, and for the same reason as P16.** Every interesting property of an
event pipeline is rare by construction — a fatigue collapse, a conversion cascade arriving four days
late, a budget cap being approached — so a cockpit that can only *wait* for one cannot be
demonstrated. The seven triggers are: `fatigue_collapse`, `late_cascade`, `budget_squeeze`,
`orphan_burst`, `duplicate_storm`, `stall`, `traffic_burst`. They also make `DESIGN.md` §6's
misbehaviour table fully exercisable: burst, gap and stall were the three rows with a named handler
and nothing to trigger them. **P16 and P17 are not substitutes:** P16 changes which buckets are
*settled*, P17 delivers new *late events*. The first exercises the horizon, the second the
restatement path.

**P16 is not optional.** With a 72h horizon and 7d of backfill, backfilled data is settled and
live data is not, so shortening the horizon is the only way a restatement happens on camera. Its
cost is not the control but the recompute — it is a settlement re-evaluation path, not a config
toggle.

Because triggers are persisted (`sim_scenarios`), reproducibility is **seed + decision log +
scenario log**, which is the claim `DECISIONS.md` § D40 makes and the only one that is true once a
human can intervene.

**All eight FIX items ship in full.** Nothing in the mandatory bucket was traded to fund P11.
Traceability ships at D24 level D — drill-down, trace endpoint, and agreement test — because
hard requirement #5 and the "life of one event" deliverable are the same thing, and that line was
protected in preference to presentation of data-health.

**Guaranteed by construction:** state survives a page refresh and an app restart, including the
simulator process being killed and restarted mid-demo; every performance number is derived from
the signal stream and every config value from the decision log folded over its origin; configs,
signals and levers are three distinct types in distinct stores.

## 3. What's sketched, and in what form

| Sketched | Form |
|---|---|
| Workbench — component library, ad builder, variant model | Annotated mockup, **plus** P15: one read-only component screen showing "used in N live ads" as a working reverse join over live data. Current-state only — "used in N ads at time T" and "ever" are not answerable. |
| Component versioning (mutate / copy-on-write / immutable once live) | README prose: copy-on-write with `lineage_id` / `version` / `parent_id`, picked and defended, per L111. No editor ships, so nothing exercises it at runtime. |
| Component-level performance across swaps | README section showing the **real query** against real data — `config_generations` exists (P5), so this is one join from working rather than hypothetical. |
| The five remaining SPECIFY findings (G10, G18, G28, G34, G50) | README design notes, per T1. |
| `Ad.status: "archived"` | Kept in the type, named in the README as a state **reachable by no lever**, because that is a scope cut (cut #3) rather than a claim about the domain. The fold carries one branch for it that can never fire, written to say so. Per D5. |
| Tolerated stream misbehaviours (G43 retractions, G15 audience overlap, G21 gap detection, G46 transient funnel violations, G05 USD-only, G29 no portfolio entity) | README's named-limits section, per L123 — which we tolerate, which would break us. |

## 4. What's cut

Ordered **cheapest to reinstate first**. If budget frees up, take from the top.

**#1 has been taken back, and the numbering below is deliberately NOT closed up.** Decision scoring
was #1 for the reason the list is ordered by — *"it reads rollups that already exist"* — and **D68**
reinstated it as `B50a`, conditional on stage 5 landing without the build's stop clause firing. It
did, so scoring is built and now sits in §2 as **P18**. The row stays, struck through, because these
numbers are cited from the code (`SCOPE.md §4 cut #3` is in `fold.ts`, `cut #7` in `components.ts`)
and renumbering would silently repoint every one of them at a different cut. **The next surplus
buys #2**, the data-health panel, which is a genuinely more expensive thing than #1 was.

| # | Cut | Why — one sentence |
|---|---|---|
| ~~1~~ | ~~Decision scoring (before/after windows, withheld until settled)~~ — **REINSTATED by D68; built as `B50a`; see §2 P18** | It read rollups that already existed, which is why it was the cheapest thing to add back — and why it was the one the surplus bought. |
| 2 | Data-health panel as a designed surface | Its counters are still computed and rendered plainly; only the designed panel is cut, and it is what funds budget pacing. |
| 3 | `archive` lever | One decision variant reaching a terminal state that nothing in the graded criteria exercises. |
| 4 | `variant_group_id` + sibling comparison view | The field is free but the view is not, and with the Workbench sketched there is no surface for it to live on. |
| 5 | `clone_ad` | It needs the variant grouping above plus a builder flow that the sketched Workbench does not have. |
| 6 | Human-in-the-loop approval flow (`Recommendation` entity, `system:fatigue_rule`, approval UI) | It is the most product-like moment in the brief, and it proves nothing about the event path that Signal is graded on. |
| 7 | Component versioning as a built flow | Copy-on-write is a decision to defend in prose, not a decision that needs an editor to be right. |
| 8 | Compaction of raw events | Nothing needs compacting inside a seven-day demo horizon, so the policy and what it would foreclose are stated instead of implemented. |
| 9 | Multi-currency, campaign/portfolio entity, conversion kinds, retraction/void event | Each buys realism at the cost of a graded criterion elsewhere, and each is named as a deliberate omission rather than left silent. |

<!-- README-VERBATIM-END -->

---

## 5. What this changes in the register

- **G04's budget-pacing residue moves SPECIFY → FIX** (P11), reversing trim #2 of T1 — the item
  T1 itself named as "reinstate first". `set_budget` now visibly changes the event rate, so
  *"the world responds"* no longer rests entirely on `pause`.
- **G47** (spend ≤ budget enforced nowhere) is answered by P11 as pacing, not as a hard cap; no
  fifth ad state is invented, and overspend tolerance becomes a stated simulator parameter.
- Buckets are now **FIX 7 · SPECIFY 5 · NAME 0**.
- **G50** (`Ad.status` has dead states) is now half-answered in build and half in prose: `draft →
  live` is reachable via P3's `launch`; `archived` stays in the type, unreachable and named. Per
  D5, chosen over dropping the enum member so that reinstating cut #3 stays a one-variant change
  rather than a type change through the fold, the projection and persisted rows.
- **P16** was added after `SCOPE.md` was first written, on D13's ratification.
- **P17** was added at the Phase 3 close, on F3's ratification — scenario control, taken as new scope
  rather than absorbed into the simulator silently. P16 and P17 are the only items added since;
  nothing has been removed.
- **Phase 3 also produced two changes to `DESIGN.md`'s schema** (the `source` envelope field, E15 /
  D38; and the `sim_scenarios` table, D40) and **one correction to it** — settlement is evaluated at
  the arriving event's `received_at`, not at wall-clock `now`, without which seeding would stamp tens
  of thousands of spurious restatements. Neither is a scope change; both are recorded in
  `SIMULATOR.md` §22.

## 6. Cost note

**P17** rides machinery that already exists: D40's `GET /api/sim/world` poll is the delivery channel,
so the marginal cost is one endpoint, one table and seven small emitter branches — call it ~3%,
funded from the measured slack in the seed path (the seed was budgeted at 40–60 s and measures ~12 s,
and P14's sweep at 4.2 s needs no bounded mode, so the contingency reserved for both is unspent).
Nothing on the cut line was reinstated to pay for it and nothing in §2 was traded away.

P11 was priced at 6% standalone in D26's option A. Its marginal cost is ~4%, because the
simulator needs a diurnal rate curve regardless and budget-as-pacing is a multiplier on that
curve rather than new machinery. It is funded from cut #2, which is ~4%. The arithmetic balances;
traceability was not touched.

## 7. What this scope cannot absorb

The slice can **grow** — every cut in §4 is additive on top of this spine. It cannot **shrink**
without giving up a graded criterion: dropping P7 or P8 would leave late conversions detected but
not handled, which is the gap between hard requirement #4 and a paragraph about it. The lever for
further reduction is D1's sketch boundary, not the P1–P8 list.
