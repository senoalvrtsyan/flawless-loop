# Flawless Loop — AdTech: the optimization loop

A strategist's cockpit over twelve seeded live ads. Performance events stream in continuously,
every number on screen is derived from the persisted event stream, late-arriving conversions are
credited to the creative that earned them and visibly restate the numbers they land in, and six
levers change what the world does next.

Built to the brief in [`docs/BRIEF.md`](docs/BRIEF.md). Every design choice is recorded, with its
alternatives and what it forecloses, in [`docs/DECISIONS.md`](docs/DECISIONS.md) — 71 ratified
decisions, referenced from here as **D*n***.

---

## Run it

```
nvm use            # Node 24+ — `node:sqlite` is unflagged there, and that is the floor
npm i
npm start
```

`npm start` migrates the store, **seeds a seven-day world if and only if the store is empty**, and
starts three processes: the API server on **:8787**, the simulator, and Vite serving the client on
**:5173**. It prints the URL when the port is actually listening.

**The first run takes about five and a half minutes**, and prints progress throughout. That is the
seed: it generates ~1.6M events through the real rate model — diurnal curves, fatigue accrual,
pacing, a lag mixture — sorts them by arrival, and writes them through the same `ingest()` the live
emitter uses. Measured at B34: **249 s generate · 0.3 s sort · 70 s write · ~750 MB on disk.** The
cost is the *model*, not the database. `SIM_BACKFILL_DAYS=5` is the wired lever if you want it
shorter; `SIM_SEED=…` forks a different world.

Every subsequent `npm start` skips the seed and comes up in about a second.

| Command | What it does |
|---|---|
| `npm start` | Migrate, seed if empty, run everything, print the URL |
| `npm run dev` | The same three processes, without the migrate/seed preflight |
| `npm test` | `node --test` — 172 tests |
| `npm run agree` | Re-derive every rollup bucket from the raw log and diff it (P14) |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npx vite build` | Bundle the client — the check that no server module leaked into it |

Two endpoints are worth knowing before you click anything: `GET /api/health` (log position) and
`GET /api/verify` (rebuild every projection from the logs and hash-compare). See
[**Check it yourself**](#check-it-yourself).

---

## The three surfaces

The brief names three. We built two deep and sketched the third, deliberately — see
[the scope block](#scope-what-is-real-what-is-sketched-what-is-cut) below.

- **Signal** — the live event stream, metrics, the chart with its statistical gate, the maturity
  indicator, the restatement timeline, the fatigue flag, the raw tail. Built deep; it is the surface
  the brief says cannot be cut.
- **Decision loop** — the action console (six levers, a required rationale, a visible
  compare-and-swap precondition), the decision log, generation boundaries drawn on the chart, and
  decision scoring. Working and plain.
- **Workbench** — one read-only component screen backed by the live reverse join. Sketched, per D1.

Two more surfaces exist that the brief does not name and hard requirement #5 does: the
**traceability drill-down** (click any number, see the raw events under it and the verdict of
re-summing them) and **`trace <event_id>`**, the life of one event as a screen.

---

## Design notes

### The three-way split — configs, signals and levers

The brief grades whether *"configs, signals, and levers [are] kept distinct in your model"* and
asserts that *"a live ad's config changes only through levers"*. Per **D21** the split is
**physical, not conventional**: three kinds of thing, in separate tables, with separate write rules.

| Kind | Tables | Mutability | Who may write | Authority |
|---|---|---|---|---|
| **Levers** | `decisions` | **Append-only** | the lever endpoint | **Authoritative** |
| **Signals** | `signal_deliveries`, `signals` | **Append-only** | the ingest endpoint | **Authoritative** |
| **Configs** | `ads`, `config_generations` | **Derived** | *only* the apply/replay function | Rebuildable projection |
| Interpretation of signals | `conversion_attribution`, `rollup_minute` | **Derived** | *only* the apply/replay function | Rebuildable projection |
| Reference data | `components`, `audiences` | **Static** | the seeder, once | Fixture |

Four categories, not three, and the fourth is the interesting one. **Nothing that arrives is ever
edited, and nothing that is derived is ever written by hand.** A signal row records what a delivery
said; every *interpretation* of it — which bucket it belongs to, which click it attributes to, which
generation earned it — lives in a projection that can be dropped and rebuilt. This is why
`conversion_attribution` is a separate table rather than three nullable columns on `signals`: a late
click changes the interpretation of a conversion, and if that interpretation lived on the log row we
would be mutating the log.

> **Nothing writes a projection except the replay/apply function.** (**D7**)

There is exactly one function that turns facts into projections — `src/server/apply.ts`. The live
path calls it with one new fact; the rebuild path calls it with the whole log from zero. Because
they are the same function, *"drop every projection, replay, get identical numbers"* is a runnable
check rather than an assertion. It is also a rule that no test can enforce: a chunk that updates a
projection directly breaks the property this design exists to demonstrate and nothing goes red. So
it is written into the contract, and `/api/verify` is what catches it.

**Where the brief is wrong here, and what we did.** The brief says a lever *"shows up in the
stream"*, but `Decision` is not a member of the `Signal` union (finding **G35**). We take the second
reading — a lever's *effect* shows up in the stream, because pausing stops the impressions — and
merge the two only in the read model. No synthetic signal is emitted for a decision; that would be
duplicated state that can diverge.

### The persistence boundary

**Per D8: the server owns every fact. The client owns nothing durable.**

| Lives in the client | Lives in the store | Recomputable from the logs |
|---|---|---|
| Viewport: window, selected ads, granularity, chart toggles | `signals`, `signal_deliveries`, `decisions` | `ads`, `config_generations` |
| The SSE cursor (last `ingest_seq` seen) | `components`, `audiences` (seed fixtures) | `conversion_attribution`, `rollup_minute` |
| A render cache of bucket rows for the visible window | `sim_scenarios`, `sim_run` | the maturity CDF (D33), every ratio (D10) |
| A capped ring buffer of raw-tail frames (D34) | | |

Nothing in column 1 is persisted — no `localStorage`, no IndexedDB, no service worker. If the
browser is closed the only thing lost is which ads were selected.

**Why the boundary sits there.** D8 rejected client-side persistence *on principle*: it passes the
refresh test and fails the premise. The world would become an artifact of one browser profile, the
simulator would have to run in the client, and *"state survives an app restart"* would mean "as long
as you use the same laptop". The reviewer's mid-demo refresh is the weak version of the test; the
strong version is killing the process, and only a server-side store passes it.

**Why the third column exists at all.** It is the brief's own question — *"what is recomputable from
the event log"* — and the answer is deliberately maximal: **everything except what arrived.** Two
logs and a fixture set are the entire irreducible state. That is what makes `/api/verify` and the
agreement sweep meaningful rather than decorative.

**Cold start is the same code path as a refresh.** `GET /api/snapshot` returns one window in one
read transaction, the client opens `EventSource('/api/stream?cursor=<as_of_ingest_seq>')`, and the
server replays the **current absolute row** for every bucket touched since that cursor — not the
events, not deltas. There is no separate resume path to get wrong. This is why **D30** chose
absolute rows: a delta replayed after a reconnect double-counts, an absolute row is idempotent, and
the reviewer *will* refresh. If the cursor is too old to serve cheaply the server sends a
`resnapshot` frame and the client starts again, which is stated rather than left to a timeout
(**D47**).

**Killing the simulator is a supported operation, not an accident.** It holds no durable state: it
re-reads the world over `GET /api/sim/world` at 1 Hz and resumes emission from the store, so a
restart produces a burst of catch-up events whose ids are *derived* rather than random — they
ingest as `duplicate_identical` and move nothing (**D60/D61**). Restart safety is free because the
ids are keyed, and that is the demonstration rather than a special case.

### Aggregation strategy

The brief asks three questions: raw or rolled up; write-time, read-time or cached; and what gets
compacted away.

**Retention — D9: hybrid.** Raw events retained forever, plus **minute rollups as a rebuildable
projection**. Raw-only makes every chart a full scan and, worse, makes "the number moved" invisible
because nothing was ever fixed to move. Rollups-only is lossy and forecloses traceability, which is
the graded criterion. So we build both representations and compare them — *"drill into this bucket
and check it against the raw events"* is not overhead on top of the deliverable, it **is** the
deliverable.

Base grain is the **minute**, keyed `(ad_id, minute_start)` (**D28**); hours derive from minutes.
Per-generation numbers come from joining buckets to `config_generations` by time.

**Ratios — D10: always at read time, never stored.** Storing CTR/CPA/ROAS per bucket is
arithmetically wrong the moment you re-aggregate across buckets, and it makes every late event a
recompute-and-rewrite. Store counts, derive ratios: one rule, and "CTR over any window" is right
with no special case anywhere. `src/shared/metrics.ts` is the one implementation, used by both the
server (window totals) and the chart (per point).

**Counts — D29: maintained incrementally at ingest**, in the same transaction as the insert. The
decisive argument is not performance. It is that **restatement stops being a feature**: a late
arrival is just an event whose bucket happens to be old, so the restatement path is a flag and a
fan-out rather than a subsystem.

**Compaction — D11: none is built.** Inside a seven-day horizon there is nothing to compact, so
implementing it would mean shipping a code path that never executes in front of a reviewer. The
policy we *would* adopt is written down instead — past the horizon, compact impressions to
per-minute counts and retain clicks and conversions in full — along with exactly what it forecloses:
any question about an *individual* impression past the horizon, which means the traceability
walk-back stops working on old data while the numbers stay correct.

### The consequence a strategist actually feels — D27

Not a footnote. **CTR is live; CPA and ROAS lag by cohort**, because a conversion is credited to
**its click's minute**, not to its own.

| Metric | Numerator lands | Denominator lands | Readable |
|---|---|---|---|
| CTR | click, at its own `ts` | impression, at its own `ts` | **in near-real-time** |
| CPA | spend, at its own `ts` | conversion, **backdated to its click's minute** | after the cohort matures |
| ROAS | conversion value, **backdated to its click's minute** | spend, at its own `ts` | after the cohort matures |

The two families are **not interchangeable for a real-time decision**, and the surface says so. A
strategist watching a newly-swapped creative can act on CTR within minutes and must not act on its
ROAS for hours. That is a property of attribution, not of our implementation — but a cockpit that
does not say it out loud invites exactly the wrong decision. Two distinct mechanisms carry the
message and stay visibly distinct:

- **The statistical gate (D20)** — *too little data to be a ratio.* Fixed bar (≥ 500 impressions per
  point for CTR, ≥ 10 conversions for CPA/ROAS), adaptive granularity: minute → 5 min → 15 min →
  hour, and **stop**. If the hourly point still fails the bar, the ratio is not drawn and the counts
  are shown in its place with the reason stated. The chosen rung, the gated count and the dropped
  ads are always on screen (**D67**).
- **The maturity indicator (D33)** — *the data is still arriving.* Per window, from the empirical
  attribution-lag CDF measured over **settled cohorts only**, always displayed with the sample size
  it was measured from, so it reads as a histogram of our own data rather than a forecast.

A young cohort trips both, for different reasons, and the surface says which.

---

<a id="scope-what-is-real-what-is-sketched-what-is-cut"></a>

## Scope — what is real, what is sketched, what is cut

The block below is **copied verbatim** from [`docs/SCOPE.md`](docs/SCOPE.md) §2–§4 and is checked
byte-for-byte. A scope change is a README change.

<!-- README-VERBATIM-BEGIN — SCOPE.md sections 2, 3 and 4, unchanged -->

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
| P18 | Decision scoring: a symmetric before/after window either side of each decision — **6 h ratified (D70), and a read parameter (D71) so a lever pulled live can be scored** — one primary metric, **withheld until both windows are past the lateness horizon**, with any second lever inside either window flagged as contaminated on the entry, and the surface naming the window each score was answered at | G42, D19, D68, D70, D71 |

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

## Stream misbehaviours

**Tolerated** = handled correctly, no visible degradation. **Degrades** = we detect it, say so, and
carry on with a stated loss. **Breaks** = we cannot represent it; named rather than discovered.

Copied verbatim from [`docs/DESIGN.md`](docs/DESIGN.md) §6.

| Misbehaviour | Disposition | Why, in one line |
|---|---|---|
| Duplicate delivery, identical payload | **Tolerated** | `event_id` is the primary key; the delivery is recorded, the aggregate is untouched (D15) |
| Duplicate delivery, **conflicting** payload | **Tolerated, surfaced** | First write wins for the aggregate; the conflicting delivery is retained, counted and visible in the trace (D15/I7) |
| Out-of-order arrival | **Tolerated** | Bucketing is on event time; `ingest_seq` supplies the replay order the wire does not (D12) |
| **Late-attributing conversion** | **Handled end to end** | The flagship path: cohort placement, generic restatement, settlement states, visible on the surface (§5) |
| Orphaned conversion — click has not arrived | **Handled** | Provisional at its own minute, promoted and moved on resolution (D16, §5.4) |
| Orphaned conversion — click never arrives | **Degrades** | `orphan_expired` past the horizon: counted and displayed, excluded from headline numbers, never deleted |
| Conversion whose `ad_id` contradicts its click's | **Handled** | The click is authoritative; the disagreement is flagged and counted, not silently resolved (I8/G30) |
| Same click delivered under two `event_id`s | **Degrades** | The unique partial index on `click_id` makes it detectable; we count it rather than dedupe on it (E3) |
| Clock skew — future-dated `ts` | **Tolerated** | Clamped to `received_at`, both values retained, counted (I10) |
| Clock skew — slow source clock | **Degrades** | Everything looks late; past-horizon arrivals leave the headline numbers and are counted separately (D13) |
| Burst | **Tolerated** | Batched ingest, coalesced bucket frames, tail frames dropped with a visible counter (§11) |
| Gap / stall | **Degrades — detected, not repaired** | Liveness display ("last event 12 s ago"); we can say the stream is quiet, not why |
| **Emitter-side event loss** | **Breaks — silently** | There is no emitter sequence number, so a lost event is indistinguishable from an event that never existed (G21). The one failure we cannot see, and it is named |
| **Retraction / refund / void** | **Breaks — unrepresentable** | The contract is append-only with no negation; a negative `value_cents` would fix the value and corrupt the count (G43). `conversion_void` is specified in the README and not built (D25) |
| Signals for a non-live ad | **Tolerated** | Never rejected on status; counted as a self-check, since under our own simulator the count should be zero (I11/G48) |
| Funnel violation (conversions > clicks in a live window) | **Tolerated** | Shown unclamped with an unsettled marker and the orphan count beside it — clamping would hide the phenomenon the brief wants demonstrated (G46) |
| Malformed payload | **Tolerated** | Recorded as `rejected_invalid` with the raw body, counted; nothing is dropped without a trace |

**Retractions are arguably more common in the wild than late attribution, and the brief does not
mention them.** The cost of adding them is demonstrably low here: because D27-B forced the
restatement path to be generic, `conversion_void` would be one event type and one `apply()` branch.
It is not built, and it is the one row in the table we would build first.

**The one we cannot see is emitter-side loss.** There is no emitter sequence number in the brief's
`Signal` contract, so a lost event is indistinguishable from an event that never existed (finding
**G21**). We could have added one — we added `received_at` and `ingest_seq` for related reasons — but
an emitter sequence is a claim about a system we are pretending not to control, and inventing it
would have made the demo look better than the model. It is named instead.

---

## Named limits

Everything below is a limit we know about and chose. The brief asks that misbehaviours be named as
tolerated or breaking rather than discovered by a reviewer; this section extends that to the whole
build. Nothing here is a bug report — a bug is something we would fix.

### What the model cannot represent

| Limit | Why it is a limit and not a defect |
|---|---|
| **Retractions, refunds, voids** | The contract is append-only with no negation, and a negative `value_cents` would fix the value while corrupting the count (**G43**). Named as **breaking**. One event type and one `apply()` branch away. |
| **Emitter-side event loss** | No emitter sequence number exists, so a lost event is indistinguishable from one that never existed (**G21**). The only failure in the table we cannot see. |
| **Gap and stall detection** | We can say the stream is quiet ("last event 12 s ago") and we cannot say why. Detected, not diagnosed. |
| **Currency** | USD only. No currency field, no FX, no per-geo money (**I16 / G05**) — even though `audiences` carries geo, so the model is visibly one field short of multi-currency. |
| **Audience overlap** | Audiences are independent by construction. Two ads on overlapping audiences double-count a person, and `retargeting`'s referent is undefined in the brief (**G15**). |
| **No campaign or portfolio entity** | The portfolio view is a `SUM` over ads, not an entity with its own budget or its own identity (**G29**). |
| **One conversion kind** | `value_cents` is gross revenue. No purchase/lead/install distinction, no net-of-refund (**I14 / G20**). |
| **`Ad.status: "archived"`** | Kept in the type, reachable by **no lever** (**F1**). It is the visible shadow of a scope cut, not a claim about the domain, and the fold carries one branch for it written to say so. |
| **`Component.kind: "image" \| "body_copy"`** | Kept in the type, attachable to **no slot** — `Ad` has two slots and `Component.kind` declares four (**G06 / D23**). |

### What is deliberately not built

| Limit | Why |
|---|---|
| **No component editor** | Copy-on-write is a position defended in prose, not a flow. The three versioning fields exist and the seed contains one two-version lineage, so the *read* path is real; the write path is not. See [Component versioning](#component-versioning-copy-on-write). |
| **No compaction** | Nothing needs compacting inside a seven-day horizon, so the policy is written down rather than shipped as a code path that never runs (**D11**). |
| **No human-in-the-loop approval** | The brief's Background defines it and the contracts cannot express it; cut, and named rather than silently absent (**G25 / G36**, `SCOPE.md` §4 cut #6). |
| **No forecasting or ML** | The brief excludes statistical sophistication. Every heuristic here — the D20 gate, the D33 maturity curve, the fatigue flag — is a bar or an empirical CDF, presented with its limits. |
| **Ad status is not validated at ingest** | A signal is never rejected on ad *status* (**I11 / G48**) — that is deliberate, because a paused ad still legitimately receives conversions from clicks it earned while live. But `ad_id` being *known* is also not checked yet: `ingest.ts` says so in a comment, and adding it would make an unseeded store reject every event. |

### Limits of the numbers on screen

| Limit | Detail |
|---|---|
| **The straddled minute** | Rollups are keyed `(ad_id, minute_start)`, so a swap at 14:03:27 assigns all of minute 14:03 to one generation — one minute, one ad, per swap (**D28**). Exact answers are one raw scan away and the drill-down will give you one. |
| **Funnel violations are shown unclamped** | Conversions can exceed clicks in a live window, because a conversion is backdated to its click's minute while its click may not have arrived. Shown with an unsettled marker and the orphan count beside it; clamping would hide the phenomenon the brief asks to see (**G46**). |
| **`orphan_expired` is a reading, not a stored state** | The store holds `resolved` and `orphan_provisional`; expiry is computed at read (**D54 / I20**). A click arriving after the horizon still promotes the conversion — expiry changes what we *say*, not what we hold. Storing it would put a clock inside a projection and make `/api/verify` diverge on a correct store. |
| **The scoring window is a read parameter, and the clock is long** | Decision scoring compares a symmetric window either side of a lever, withheld until both windows are past the lateness horizon (**D70**). The window is `?window_h=` and the horizon `?horizon_h=` — **two knobs that fail independently**, both printed in the caption. The **fastest possible on-camera score is window + horizon**, about **sixteen minutes** at the 15-minute window floor (**D71**). A demo starts that clock early; it cannot score a lever inside one beat. |
| **The scoring metric rule is a recommendation, not a ratification** | D19 asked *"which metric?"* and that half was never answered. The build uses CPA where both windows carry conversions and CTR otherwise, and the entry on screen says which it used. |
| **`create_ad` does not contaminate a score** | One action short of D70's "any second lever", on the grounds that a draft ad delivers nothing so it provably moved no counts. Including it flagged 24 of 24 seeded entries as contaminated, which is a flag nobody reads. |
| **The maturity curve's cold-start fallback never fires** | With seven days of backfill the empirical CDF always has its sample, so the fixed fallback curve (50% @ 1 h, 80% @ 6 h, 95% @ 24 h) is documented and unexercised. |
| **`resolveAttribution()` uses `ts_effective` where `DESIGN.md` §5.2 writes "the click's `ts`"** | They differ only for the 0.2% clock-skew events the simulator injects on purpose, and every other placement in the build uses `ts_effective`. Reported at the gate it was found, left as built, named here. |

### Operational limits of this prototype

| Limit | Detail |
|---|---|
| **Scenario triggers are at-most-once** | The server marks a trigger `consumed_at` at **serve** time, so a dropped poll response loses it silently — press the button again (**D69**). The emitter is idempotent by `scenario_id`, so moving to an emitter ack later is purely additive; the failure mode was chosen with that escape hatch in hand. |
| **Trace descriptors do not survive a server restart** | The HMAC key is per-process (`TRACE_KEY` overrides). Every descriptor is re-issued on the next `/api/snapshot`, which a refresh runs — but **a page left open across a restart reads `invalid_signature` on its next click until you refresh it.** The error message says exactly that. |
| **The drill-down's evidence list is capped** | 400 contributing events, 200 slices. **The re-sum is over everything** — only the *list* truncates, and `evidence_omitted` / `slices_omitted` are on the wire so the panel states the count rather than inferring it. Measured on a 6 h single-ad window: 400 shown of 9,560, 200 slices of 360. Conversions fill the sample first, because in log order the first 400 of 10,481 contributors were all impressions and a ROAS sat above a list containing nothing that earned revenue. |
| **`POST /api/trace` costs ~0.6–1.3 s on the seven-day store** | Measured 0.61–0.68 s for a 6 h single-ad drill-down. `replay()` must read every click and every conversion in the log prefix regardless of window, because a conversion's own `ts` can sit far outside the window it belongs to. **Fine for a click; it must never become a per-tick path.** |
| **A live click loses its in-flight conversion across an emitter restart** | The handover query is restricted to `source = 'backfill'` — a live click's schedule is known to the process that emitted it, and nothing persists it. Bounded, and the backfilled population (most of what a demo sees convert) is unaffected. |
| **`payload_json` is a re-serialisation, not the received bytes** | `JSON.parse` has already collapsed duplicate keys and rewritten `1e2` as `100` and `\u0041` as `A` by the time we store it. The DDL comment and `DESIGN.md` §2.2 both promised *"exactly as received"* and were corrected — what we can honestly promise is *the parsed element, re-serialised*. Duplicate detection uses a hash of that, so two deliveries differing only in key order are `duplicate_identical`, which is the behaviour we want and not the behaviour the comment claimed. |
| **`npm run agree` does not read three of the four projections** | It re-derives attribution from raw and compares only `rollup_minute`'s counts, so a corrupted `credited_generation_id` or `credited_ad_id` **sweeps clean**. `/api/verify` catches both. The sweep prints its own limits on every run, and must keep doing so — *"every stored bucket agrees with the raw event log"* is a narrower guarantee than it sounds. |
| **The agreement sweep cannot see an invented all-zero bucket** | A promotion decrements a provisional bucket to all zeros and the row stays, so the store legitimately holds rows a from-zero recomputation never creates. `agree` compares an absent recomputed bucket against zero; `/api/verify` catches the case, and it is accepted rather than papered over. |
| **`INJECT_FAULTS_INTO_BACKFILL` is a reading, not a ratified decision** | `DESIGN.md` §13's misbehaviour rates were written about a live transport; in a constructed arrival order a transport fault becomes an adjustment to `received_at`, never to emission. Named as a constant in `seed-history.ts` so it can be flipped. Without it the seeded week is clean and the live week dirty, the orphan rows never fire, and no bucket carries `restated_at` from frame one. |
| **The pacing taper's slide has never been shown live** | Delivery going to zero and back has been demonstrated; the *gradual* taper has not. `DESIGN.md` §9's band is 15% of budget wide and one 62¢ click clears it on a fresh store. Accumulated spend or the `budget_squeeze` scenario is where it becomes showable, and this README does not claim it until one of them does. |
| **One server per store** | The server and the simulator are separate OS processes, and only the server opens the store (**D32**) — the simulator reaches it over HTTP. WAL will happily let a *second* server process open the same file on a different port, and nothing stops you: the projections stay correct (both write through the same `apply()`), but each process signs trace descriptors with its own key, so a descriptor issued by one reads `invalid_signature` at the other. Run one server per store. |

---

## Extensions to the brief's contracts

The brief invites extension and requires it be called out. This register is **assembled from**
[`docs/BRIEF_GAPS.md`](docs/BRIEF_GAPS.md) § Extensions, which is the source of record and carries
the full reasoning per row. Three dispositions, and only the first is an extension:

- **Extended** — a field, type or variant the brief does not have. Fifteen.
- **Narrowed** — something the brief declares that we removed or restricted. **We do none.**
- **Interpreted** — a meaning the brief left open, fixed without changing its shape. Twenty, listed
  separately because an interpretation can be wrong in a way a reviewer should be able to check.

### Extended — `Signal`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E1 | `received_at` | `string` — ISO 8601 UTC, **server-assigned at the ingest boundary, never emitter-assigned** | G16 | D12 |
| E2 | `ingest_seq` | `number` — monotonic, server-assigned; total replay order, SSE reconnect cursor, timestamp tie-break | G16, G21, G22 | D12 |
| E3 | `click_id` on the `click` variant | `string`, distinct from `event_id` | G17 | T1 / P2 |
| E15 | `source` | `'backfill' \| 'live'` — **server-assigned from the path the batch arrived on** | D33 conflict | D38 |

**E1 and E2 are the highest-priority extensions in the project**, and the asymmetry is what makes
them urgent: adding them costs two columns; omitting them costs the data *permanently*, because an
event already ingested can never be given an arrival time afterwards. Everything the brief says it
cares most about in `Signal` — lateness, restatement, as-of views, the mandatory mid-demo refresh
surviving intact — is a statement about arrival time, and the given contract has no way to express
arrival.

**E3 separates the transport dedupe key from the domain foreign key.** The brief describes
`event_id` as a dedupe key for at-least-once delivery, and `attributed_click_id` points at a
`click_id` that exists nowhere in the contract. Under the alternative reading — that
`attributed_click_id` means the click's `event_id` — the same click redelivered under a *different*
`event_id` produces a double-counted click that nothing can detect. E3 makes that failure
representable, and the partial unique index on `click_id` makes it visible.

**E15 exists because two ratified decisions could not both hold.** D33 measures the maturity CDF as
`received_at − click.ts`, the *observational* lag; D12 makes `received_at` server-assigned. Seeding
seven days of history in one burst would give every backfilled conversion `received_at ≈ boot`, so
the CDF would be a picture of the seed loop rather than of conversion lag. The seeder therefore
stamps modelled historical arrival times — it is a fixture writer, not an emitter — and `source`
keeps the two populations separable.

### Extended — `Decision`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E4 | `create_ad` action variant | carries the initial config; the fold's origin | G33, G50 | D5 |
| E5 | `launch` action variant | `draft → live`; the only writer of `launched_at` | G02, G33, G50 | D5 |
| E6 | `decision_seq` | `number` — server-assigned fold order, mirroring E2 | G22, G45 | D21 |

**E4 and E5 exist because the brief's central claim is false as written.** *"Current config is
derivable: the initial state folded over the decision log"* names no event that produces the initial
state, so the fold has no origin and nothing is recomputable. E4 supplies the origin; E5 supplies
the transition that *"a live ad's config changes only through levers"* otherwise makes unreachable.
The rule we ended up with is **sharper** than the brief's: config is free while `draft`, and once
`live` only levers touch it.

**Not extended:** `Decision.status`, `approved_by`, a `Recommendation` entity. The human-in-the-loop
flow is cut, so the brief's Background definition of it is unrepresented — named, not silently
absent.

### Extended — `Ad`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E7 | `created_at` | `string` ISO 8601 UTC — `Component` has one, `Ad` does not | G03 | Phase-2 defaults |
| E8 | `name` | `string` — stable human label | G03 | Phase-2 defaults |
| E9 | `current_generation_id` | `string` → `ConfigGeneration` | G01 | D2 |

**E8's justification is specific, not cosmetic:** `ad_id` is the only label the contract offers, and
the alternative — synthesising a display name from the headline component's payload — produces a
name that *changes when the headline is swapped*, which is exactly the moment a strategist most
needs a stable referent.

### Extended — `Component`

| # | Extension | Shape | Justified by | Ratified by |
|---|---|---|---|---|
| E10 | `lineage_id` | `string` — groups every version of one creative | G10 | D3 |
| E11 | `version` | `number` — 1-based within the lineage | G10 | D3 |
| E12 | `parent_id` | `string \| null` — the version this was copied from | G10 | D3 |

Ratified with a qualification worth repeating: **no component editor ships**, so nothing *writes*
these at runtime. The columns exist and the seed data includes one lineage with two versions, so the
reverse join's "per version or per lineage?" question has a concrete answer on screen rather than a
paragraph in prose.

### Extended — new entities

| # | Entity | Why it must exist | Justified by | Ratified by |
|---|---|---|---|---|
| E13 | `ConfigGeneration` | Nothing in the given model names *"the config of `a_12` as of Sunday"*, so a conversion landing Thursday cannot be credited to the creative that earned it | G01, G18 | D2, D14 |
| E14 | `TraceDescriptor` | Hard requirement #5 asks that any number be walked back to its events *and shown to agree*; nothing in the contract lets a number name the query that produced it | brief L143 | D31 |

**E14 is an extension to the *product*, not to the data contract** — it carries no persisted state
and describes a query, not a fact. It is listed here anyway, because a reviewer reading the wire
format will see a field the brief never mentions and the honest place to explain it is the same list
as everything else.

### Interpreted — the brief's shape kept, its meaning fixed

| # | Left open by the brief | Fixed as | Finding | Ratified by |
|---|---|---|---|---|
| I1 | `spend`: delta or cumulative, at what cadence | **Delta**, one tick per live ad per fixed interval | G19 | T1 / P2 |
| I2 | Which day `daily_budget_cents` means | Account-level timezone, **`America/New_York`**; buckets stored UTC | G04 | D22 |
| I3 | What the budget *does* | A **pacing parameter** on the emission rate, not a hard cap; mild overspend is normal and is a stated simulator parameter | G47 | D26 / P11 |
| I4 | When a period is closed | Fixed **72 h** lateness horizon, displayed and adjustable | G42 | D13 |
| I5 | Which generation a late conversion credits | The one live at the **attributed click's `ts`** | G01 | D14 |
| I6 | Which time bucket a conversion lands in | The **attributed click's minute** (cohort placement) | — | D27 |
| I7 | Resolution of two deliveries sharing an `event_id` | **First write wins** for the aggregate; every delivery persisted; conflicts surfaced | G40 | D15 |
| I8 | A conversion whose `ad_id` contradicts its click's | The **click** is authoritative; provisional against the conversion's own `ad_id` until resolved | G30, G41 | D16 |
| I9 | `ts` precision and tie-break | Milliseconds; tie-break on `ingest_seq`, then `event_id` lexically | G22 | D12 |
| I10 | Future-dated `ts` (clock skew) | **Clamped** to `received_at`, counted, never rejected | G44 | Phase-2 defaults |
| I11 | Signals arriving for a non-live ad | Never rejected on ad status; counted as a self-check | G48 | Phase-2 defaults |
| I12 | `Decision.ts` | Request time; effects immediate; backdating rejected | G23 | U7 |
| I13 | `from_cents` / `from_id` | A **precondition** (compare-and-swap), not an audit annotation — and with one actor a *staleness* guard, not a concurrency feature | G24, G45 | U2, U5 |
| I14 | `value_cents` | Gross revenue, one conversion kind | G20 | U4 |
| I15 | Money sign | Non-negative integers, enforced at ingest | G49 | U6 |
| I16 | Currency | USD only; no currency field, no FX | G05 | U1 |
| I17 | *"Everything on screen is derived from the stream"* | Restated: every **performance** number derives from the signal stream, every **config** value from the decision log folded over its origin, nothing is hard-coded | G39 | — |
| I18 | *"May land hours or days after its click"* — which lag? | **Two distinct lags.** *Purchase* lag `click.ts → conversion.ts` and *reporting* lag `conversion.ts → received_at`. `received_at − ts` is the **reporting** lag only; purchase lag is what drives restatement | G16 | D36 |
| I19 | A delivery arriving with **no** `event_id` | Still retained — nothing is silently dropped — keyed `(no event_id):<payload_hash>`, always `rejected_invalid`, never reaching `signals`. The hash suffix keeps unrelated malformed bodies in separate keys | brief L73 | B05 |
| I20 | When a conversion stops *"waiting for its click"* | **`orphan_expired` is a reading, not a stored state.** Computed at read as `at − (credited_minute + 60 s) > 72 h`; the row is never deleted, never re-bucketed, and a late click still promotes it | G42 | D54 |

**I18 matters because collapsing the two lags would corrupt our own telemetry.** If you collapse
them, `received_at − ts` becomes the purchase lag — which would make our own transport look like it
is hours behind. That field has to describe us, not the buyer.

**I17 is a correction to the brief, not an interpretation of it.** Taken literally the sentence is
false in the brief's own terms: budget, status, channel, audience and component payloads come from
configs and the decision log, not from the signal stream. The restatement preserves the intent — no
pre-baked arrays behind charts — while surviving contact with the brief's own three-way split.

### Contradictions we found in our *own* documents

The register has a fourth section (§H) that is not about the brief at all. By phase 5 the document
most likely to contradict itself was no longer the brief but our simulator spec, which states some
sixty parameters and derives numbers from them. Four entries: a recovery half-life written as a
half-life in prose and a time constant in the formula (**corrected**); `spend` specified as "CPM
accrual plus fees" with no fee parameter anywhere (**named as a limit** — there is no fee term, so
`spend` is CPM accrual only); a novelty model given no slot composition where fatigue has one
(**resolved by the document's own arithmetic**); and a metric union naming `spend_cents` where the
code signs `spend` (**corrected in the code's favour**). All four were found by printing what the
code computes and diffing it against the table it was transcribed from, which is the only reason
they were found at all — each would have run without erroring and been wrong by a constant factor.

---

## The life of one event

The brief asks for one event traced end to end: emission → stored fact → aggregate → pixel. It is
also **executable** — `GET /api/trace/event?event_id=…`, and a screen in the app that you paste an
id into. What follows is a real capture, not a hand-written illustration.

> **Which store.** Everything below was captured from `data/loop.sqlite` — the seven-day store,
> seeded with `SIM_SEED=flawless-loop`, with the live emitter running. **A fresh `npm start` seeds a
> different world**: event ids are derived from `(seed, absolute unix second, index)`, so your `T0`
> gives you different ids. To find your own equivalent, ask the store for a late one:
>
> ```sql
> SELECT s.event_id, ca.credited_minute,
>        ROUND((julianday(s.received_at) - julianday(ca.credited_minute)) * 24, 1) AS late_h
>   FROM conversion_attribution ca JOIN signals s ON s.event_id = ca.event_id
>  WHERE ca.state = 'resolved' ORDER BY late_h DESC LIMIT 5;
> ```

The event is **`c4804d05ed499439`** — a conversion that arrived **147.4 hours after the minute it
belongs to**, and restated a bucket that had been settled for three days.

### 1 — Emission

The simulator drew this conversion for a click it had emitted six days earlier, and posted it in a
batch to `POST /api/ingest`. It was never stored by the simulator: the emitter holds no durable
state and never opens the database (**D32**). Two lags separate the click from this line, and the
model keeps them apart (**I18**): a **purchase** lag of 5.98 days (the buyer decided later) and a
**reporting** lag of 3.94 hours (the platform told us later).

### 2 — Stored delivery — `signal_deliveries`

Every delivery is retained, accepted or not, before anything is interpreted.

```json
{ "delivery_seq": 1601622,
  "received_at":  "2026-09-05T04:29:42.827Z",
  "disposition":  "accepted",
  "payload_json": "{\"event_id\":\"c4804d05ed499439\",\"ts\":\"2026-09-05T00:33:05.956Z\",\"ad_id\":\"a_01\",\"event\":\"conversion\",\"attributed_click_id\":\"1d377b1cf2b164c9\",\"value_cents\":17989}",
  "payload_hash": "846285db1a61e32e0a5523d4ca8395b1e18d3a8cd558d69a6592e45a366b2b27" }
```

One delivery, so this event was sent once. A redelivery would appear here as a second row with the
same `payload_hash` and the disposition `duplicate_identical`, and would move no number anywhere.
(`payload_json` is the parsed element re-serialised, not the received bytes — see
[Named limits](#named-limits).)

### 3 — Canonical fact — `signals`

```json
{ "ingest_seq": 1586705, "received_at": "2026-09-05T04:29:42.827Z",
  "ts": "2026-09-05T00:33:05.956Z", "ts_effective": "2026-09-05T00:33:05.956Z",
  "ad_id": "a_01", "kind": "conversion", "source": "live",
  "attributed_click_id": "1d377b1cf2b164c9", "value_cents": 17989, "clamped": false }
```

`ingest_seq` **1586705** is this event's position in the total order, and it is the number every
later step is answerable at. `ts_effective` equals `ts` because the emitter's clock was not ahead of
ours; had it been, `ts_effective` would be clamped to `received_at` and `clamped` would read `true`
(**I10**), with both values kept.

### 4 — Interpretation — `conversion_attribution`

This is the step the design exists for. The conversion carries `attributed_click_id`
`1d377b1cf2b164c9`; the click that claimed that id is event **`3c82297378ead37e`**, whose
`ts_effective` is **`2026-08-30T01:05:43.000Z`**.

```json
{ "state": "resolved", "click_event_id": "3c82297378ead37e",
  "credited_ad_id": "a_01", "credited_minute": "2026-08-30T01:05:00.000Z",
  "credited_generation_id": "g_a_01_002", "ad_id_conflict": false,
  "resolved_at": "2026-09-05T04:29:42.827Z" }
```

Three separate rules land here, and each is a ratified decision rather than an implementation
detail:

- **D27-B** — the conversion is credited to **its click's minute**, `2026-08-30T01:05`, not to its
  own. That is what makes CPA and ROAS cohort metrics and CTR a live one.
- **D14** — it is credited to the generation live at the **click's** `ts`, `g_a_01_002` (which
  ran `v_04` + `h_01` from 2026-08-28T16:03:18.970Z). Here that generation happens to still be
  `a_01`'s current one, so nothing dramatic hangs on it — but the rule is that the *click's*
  generation is credited, not the current one, which is what makes a swap-then-late-conversion
  attribute to the creative that actually earned it rather than to whatever is running today.
- **I8/G30** — had the conversion's own `ad_id` disagreed with its click's, the **click** would win
  and `ad_id_conflict` would read `true`. It did not, so it reads `false`.

Note that this row lives in a table of its own, not as columns on `signals`. A late *click* changes
the interpretation of a conversion, and if the interpretation lived on the log row we would be
mutating the log.

### 5 — Aggregate — `rollup_minute`

```json
{ "ad_id": "a_01", "minute_start": "2026-08-30T01:05:00.000Z",
  "impressions": 72, "clicks": 4, "conversions": 1, "value_cents": 17989,
  "provisional_conversions": 0,
  "restated_at": "2026-09-05T04:29:42.827Z", "restatement_count": 1,
  "max_ingest_seq": 1586705 }
```

The bucket for 01:05 on 30 August settled at 01:05 on 2 September, 72 hours later. This event
arrived on 5 September at 04:29 — **3.14 days past settling** — and reopened it. `restated_at` is stamped at **the arriving event's
`received_at`**, not at wall-clock now (**D38**), which is the difference between an honest
restatement and tens of thousands of spurious ones stamped by the seed loop.

`restatement_count` is 1: this bucket has been restated exactly once, by this event.

### 6 — Metrics that changed

Nothing is stored here — every ratio is derived at read from the counts above (**D10**). What
changed is any window that contains 30 August 01:05: ROAS and CPA moved for `a_01`, and CTR did not,
because CTR's terms both landed at their own `ts` five days earlier.

This is the only step in the trace with no table behind it, and the app's trace screen says so
rather than inventing one.

### 7 — Pixels, and the proof they agree

The number a strategist sees for that minute is ROAS **61.187…×**. Every displayed number carries a
signed `TraceDescriptor` (**E14 / D31**) naming the query that produced it, and clicking it runs the
comparison for real: read the number back out of `rollup_minute`, recompute it from raw `signals`
through a **different function** (`replay()`, which never reads a rollup), and put the verdict on
screen.

```
POST /api/trace  { "descriptor": { "metric":"roas", "ad_ids":["a_01"],
                                   "from":"2026-08-30T01:05:00.000Z",
                                   "to":"2026-08-30T01:06:00.000Z",
                                   "granularity_s":60, "placement_rule":"cohort_click_time",
                                   "as_of_ingest_seq":1586705, "sig":"2b2d27ae…" } }

  verdict           MATCH
  displayed         61.18707482993197        (from rollup_minute)
  recomputed        61.18707482993197        (from raw signals, via replay())
  counts            impressions 72 · clicks 4 · click_cost 280¢ · spend 14¢
                    conversions 1 · value 17989¢          — identical on both sides
```

**Both the ratio and the eight counts are compared, and the counts are compared exactly.** A ratio
can agree while its terms do not — 2/4 and 3/6 are both 0.5 — so a corruption that moves numerator
and denominator together is invisible to a ratio check. Measured: adding 7 impressions to one rollup
row by hand reads MISMATCH on the counts with ROAS unmoved. Only the ratio gets a tolerance, and it
needs one, because IEEE-754 addition is not associative and the two paths sum in different orders.

### 8 — And the same number one `ingest_seq` earlier

The descriptor's `as_of_ingest_seq` is a control, not a label. Rewind it by **one**:

```
POST /api/trace  { "descriptor": {…}, "as_of_ingest_seq": 1586704 }

  verdict           NOT_COMPARABLE
  recomputed        conversions 0 · value 0¢   →  ROAS 0
  (displayed        conversions 1 · value 17989¢ →  ROAS 61.187…×, rollup_as_of 1586705)
```

**That is the restatement, proved in two calls.** At log position 1586704 the minute of 30 August
01:05 had earned nothing; at 1586705 it had earned $179.89. One event moved it, four days after the
fact, and the raw log can be re-read at either position to show it.

The verdict is `NOT_COMPARABLE` rather than `MISMATCH`, and that distinction was found by *using*
the control rather than by reading the code. A recomputation answers a log **prefix**;
`rollup_minute` is the fold of everything applied to it and has no `as_of`. So the one screen built
to prove agreement would have cried wolf every time a reviewer used its other control — and the
number it printed would have been *correct*, which is what makes that failure convincing. The
verdict is withheld below `MAX(max_ingest_seq)` over the range, which is an exact test rather than a
heuristic: at exactly 1586705 it returns to `MATCH`.

---

## Component performance across swaps

The Workbench is sketched (D1), and one read-only screen is backed by the live reverse join. The
question the brief asks — *"used in twelve live ads"* — hides three queries, and only the first is
built:

| Query | Needs | Status |
|---|---|---|
| used in N ads **right now** | current fold + ad status | **built** |
| used in N ads **at time T** | `config_generations` + the fold's origin | *one join from working* |
| used in N ads **ever** | complete swap history + origin | *one join from working* |

Rows 2 and 3 are unbuilt but not unavailable, because `config_generations` exists for D14's sake
regardless. So rather than describe them, here is the **real query, run against the real store**:

```sql
-- "How did each video perform, honestly, across every swap?" — the temporal reverse join
SELECT g.video_id,
       SUM(r.impressions) AS impressions, SUM(r.clicks) AS clicks,
       SUM(r.click_cost_cents + r.spend_cents) AS spend_cents,
       SUM(r.conversions) AS conversions,   SUM(r.value_cents) AS value_cents
  FROM rollup_minute r
  JOIN config_generations g
    ON g.ad_id = r.ad_id
   AND r.minute_start >= g.valid_from
   AND (g.valid_to IS NULL OR r.minute_start < g.valid_to)
 GROUP BY g.video_id
 ORDER BY impressions DESC;
```

Its output on `data/loop.sqlite`, **25 ms**:

```
video_id  impressions  clicks  spend_cents  conversions  value_cents
v_04           641161    7004       547677          859      7761488
v_01           415424    3866       159923           69       396425
v_02           168488    2886       167709          155      1098177
v_03           110223    2424       104310          218      2090582
v_06           105756     895        53463           22       121345
v_05            58662     370        35415           58       448378
```

`v_04` and `v_05` are the interesting pair: **the same lineage, two versions** — "Product demo,
30s" and its recut. Derived from the rows above:

| | impressions | CTR | CVR (conv/click) | ROAS |
|---|---|---|---|---|
| `v_04` (v1) | 641,161 | 1.09% | 12.3% | 14.2× |
| `v_05` (v2, the recut) | 58,662 | 0.63% | 15.7% | 12.7× |

**And this is where a component-level number has to be presented with its limits or it lies.** The
recut converts better per click and clicks worse per impression — but `v_04` is live in two ads on
two audiences and has been for a week, while `v_05` is live in one ad on one audience and is
younger, so the comparison is confounded by audience, by lifetime and by fatigue accrual (which
under **D35** is keyed to the `(lineage × audience)` pair, not to the component). What the query
gives you honestly is *what each version actually earned while it was actually configured*. It does
not give you a verdict on the recut, and the screen does not pretend to.

The point is that the question is **askable at all**: it is unanswerable in the brief's own model,
because nothing in it names *"the config of `a_12` as of Sunday"*.

**The query is correct because of D27-B.** A conversion sits in its click's minute, and the
generation covering that minute is the one D14 credits — so joining rollups to generations by time
is not an approximation of the *attribution rule*. The only imprecision left is the straddled
minute: a swap at 14:03:27 puts all of 14:03 on one side. One minute, one ad, per swap.

The screen in the app answers the same question per lineage and per version, which is the display
question §8 says the seed data exists to make concrete:

```
Unboxing hook, 15s              — 1 version,  live in 3 ads
   v1  v_01                     — live 3: a_02, a_04, a_11
Founder story, 45s              — 1 version,  live in 2 ads
   v1  v_02                     — live 2: a_03, a_09
UGC testimonial, 20s            — 1 version,  live in 2 ads
   v1  v_03                     — live 2: a_06, a_08
Product demo, 30s — recut,      — 2 versions, live in 3 ads
tighter open
   v1  v_04                     — live 2: a_01, a_12
   v2  v_05  (from v_04)        — live 1: a_05
Before / after, 12s             — 1 version,  live in 2 ads
   v1  v_06                     — live 2: a_10, a_07
```

**"Kept current as ads launch and die" falls out of the write path rather than needing machinery**:
`ads.status` is written only by the fold, so the count is exactly as current as the last decision.
Pause `a_01` and the Product demo lineage reads *live 2 / paused 1* on the next poll, with v1
splitting into live 1 / paused 1; resume and it returns.

Computed on read by scanning `ads`, not maintained as an index. At twelve ads the scan is free, and a
maintained reverse index would be a second thing to keep in step with the fold — a projection whose
only justification would be a scale we do not have. Calling a twelve-row scan an index would be
dressing up.

**What the strategist manages** (**D4**): *you decide on ads, you learn about components.* Every
lever carries `ad_id`, so the ad is unavoidably the unit of **action**; fatigue and reuse are only
legible at the component level, so that is the unit of **analysis**. Saying that explicitly is a
better answer to the brief's question than picking one.

---

<a id="component-versioning-copy-on-write"></a>

## Component versioning: copy-on-write

The brief asks directly: *"mutate in place (twelve live ads silently change), copy-on-write, or
immutable once live. Pick one and defend it."*

**Chosen: copy-on-write** (**D3**). Editing a live component creates a new `component_id` in the
same lineage; existing ads keep pointing at the old version; moving an ad to the new version is a
`swap_component` decision with a rationale.

```ts
interface Component {
  component_id: string;
  kind: "video" | "image" | "headline" | "body_copy";
  payload: string;
  created_at: string;
  lineage_id: string;        // E10 — stable across versions
  version: number;           // E11 — 1-based
  parent_id: string | null;  // E12
}
```

**Mutate in place is disqualified, not merely worse.** It retroactively falsifies history: last
week's metrics become attributed to text that did not exist last week. That breaks the criterion this
whole build is organised around — any number on screen walks back to the raw events underneath it —
and, unlike every other choice here, **it cannot be undone**, because the overwritten payload is
gone. The brief flags the hazard itself and it is right to.

**Copy-on-write beats immutable-once-live on the same guarantee for less machinery.** Immutability
needs a computed liveness predicate — *"has this component ever been referenced by a live ad"* —
which is a reverse join over ad status *and* the decision log. Copy-on-write gets the identical
history guarantee with no predicate, and it turns propagation into an explicit, logged
`swap_component` with a rationale, which is precisely the levers-only model the brief asks for.
Immutable-once-live is copy-on-write plus a friction step.

**What it costs.** The library grows, and the UI must group by lineage or it looks cluttered — which
is why the reverse join answers per-lineage *and* per-version.

**The honest scope note.** No component editor ships, so **nothing exercises this at runtime.** The
three fields exist and the seed data contains one two-version lineage (`v_04` → `v_05`, with
`parent_id` set), so the read path and the display question above are real answers off real data.
The *write* path is a position defended in prose — which is what the brief asks for, and it is worth
being precise about the difference rather than letting a reviewer discover it.

---

<a id="check-it-yourself"></a>

## Check it yourself

Hard requirement #5 asks that any number on screen walk back to the raw events underneath it and
that the two **agree** — and that we build a way to *demonstrate* it rather than claim it. There are
four, at three different levels, and they are deliberately not the same mechanism.

| Check | What it proves | Cost on the seven-day store |
|---|---|---|
| **Click any number** (P12) | *This* number, re-derived from raw `signals` by a different function, agrees — with the eight counts compared exactly | 0.6–1.3 s |
| **`GET /api/verify`** (D55) | **All four projections**, rebuilt from the logs from zero through the real `apply()` into `TEMP` shadows, hash-match what is stored | **11.5 s**, `200` clean / `409` divergent |
| **`npm run agree`** (P14) | Every stored bucket's counts re-derived from raw in one ordered whole-log pass — a *second* implementation, so a bug in `apply()` cannot hide itself | **4.0 s** over 1,587,720 events and 71,696 buckets |
| **`GET /api/trace/event`** (P13) | One event's whole life, table by table | instant |

Measured just now, against the live store with the emitter running:

```
$ curl -s localhost:8787/api/verify | jq '{ok, checked, duration_ms}'
{ "ok": true,
  "checked": { "ads":                    { "rows":    12, "hash_matched": true },
               "config_generations":     { "rows":    24, "hash_matched": true },
               "conversion_attribution": { "rows":  1389, "hash_matched": true },
               "rollup_minute":          { "rows": 71689, "hash_matched": true } },
  "duration_ms": 11517 }

$ npm run agree
[agree] 1587720 events -> 71696 recomputed buckets, 71696 stored buckets, in 3819 ms
[agree] NOT diffed — run /api/verify for these:
[agree]   columns     first_written_at, restated_at, restatement_count, max_ingest_seq
[agree]   projections ads, config_generations, conversion_attribution
[agree] OK — every stored bucket's COUNTS agree with the raw event log.
```

**The sweep states its own limits on every run, and that is deliberate.** *"Every stored bucket
agrees with the raw event log"* is a narrower guarantee than it sounds: `agree` never reads
`conversion_attribution`, so a corrupted `credited_generation_id` passes it. `/api/verify` catches
that. Neither is redundant, and a reader who only ran one should know which half they have.

**Two different code paths, on purpose.** `replay()` reads raw `signals` and never touches
`rollup_minute` — enforced by a test — because a walk-back that read the rollup would be comparing
the display path to itself. `/api/verify` goes the other way and rebuilds *through* the real
`apply()`, so it catches a drifted **store**; `agree` recomputes *without* it, so it catches wrong
**code**. Hand-edit one `rollup_minute` row and both catch it, for those two different reasons.

---

## Repository map

| Path | What is in it |
|---|---|
| `docs/BRIEF.md` | The brief. The source of truth, read rather than recalled. |
| `docs/BRIEF_GAPS.md` | 52 audit findings (G01–G52) against the brief, the extensions register (E1–E15, I1–I20), and §H — contradictions found in **our own** design documents. |
| `docs/DECISIONS.md` | D1–D71, each with its options, what was chosen, the rationale in the human's words, its consequences, and **what it forecloses**. The index table at the top is the one-line-each view. |
| `docs/SCOPE.md` | What is real, what is sketched, what is cut, ordered cheapest-to-reinstate-first. §2–§4 is the block copied into this file. |
| `docs/DESIGN.md` | The data model, the DDL, the persistence boundary, late conversions end to end, the fold, the reverse join, traceability. |
| `docs/SIMULATOR.md` | The mock data as a design artifact: the rate equation, diurnal and day-of-week shape, fatigue and novelty, pacing, the lag mixture, noise, injected misbehaviours, determinism, and a measured parameter appendix. |
| `docs/BUILD_PLAN.md` | 69 chunks with per-chunk verification, plus §14 — the ~90 traps that will not fail loudly, each written the day it was found. |
| `docs/DEMO.md` | The walkthrough. Eight beats, followable cold. |
| `docs/STATUS.md` | Written to resume the repo cold with no memory of the conversation. |
| `docs/ai-sessions/` | The AI process artifact — one capture per phase plus one per implementation session. |
| `src/server/` | HTTP, ingest, `apply()` (**the only projection writer**), fold, attribution, settlement, snapshot, SSE, verify, trace, scoring. |
| `src/sim/` | The emitter and the seeder. **Never opens the store** (D32) — it reaches it over HTTP. |
| `src/web/` | The React client. No durable state, and no number it computes that the server did not sign. |
| `src/shared/` | The types, the timestamp invariant, the ratio arithmetic — one implementation each, imported by both sides. |

## AI process artifact

`docs/ai-sessions/` is the process record the brief asks for: one capture per phase (`00`–`04`) and
one per implementation session, holding the prompts, the decision points and the turning points
rather than a keystroke transcript. `docs/ai-sessions/PHASE_PROMPTS.md` holds the phase prompts
themselves.

The working method is in [`CLAUDE.md`](CLAUDE.md), and it has two rules that did most of the work.
**The model does not make design decisions; it surfaces them** — 71 of them, each with its
alternatives and its reversal cost, answered by a human whose exact words are recorded. And **no
code before design**: phases 0 through 4 produced documents and nothing on disk outside `docs/`,
which is why `DESIGN.md` could be wrong on paper — where it was cheap — rather than in a schema.
