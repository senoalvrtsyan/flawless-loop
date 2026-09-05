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
| `npm test` | `node --test` — 171 tests |
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
