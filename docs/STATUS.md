# STATUS.md

Written for someone with no memory of the conversation. That someone is you. Read this plus
`CLAUDE.md`, then the one design doc you need — do not re-read everything.

**Last updated:** 2026-09-07 · **PHASE 5 CLOSED, 69 / 69 chunks · PHASE 6 (packaging) CLOSED ·
PHASE 7 (post-completion hardening) CLOSED**

---

## If you are reading this cold

**EVERY PHASE IS CLOSED, INCLUDING PHASE 7.** Phase 6 (packaging) was the last *planned* gate.
**Phase 7 — post-completion hardening — came after it and is also closed**; it is the one phase no
plan produced, because Seno walked the finished app and it is what he found. Read
[**Phase 7**](#phase-7) below before anything else: it accounts for every commit after the phase 6
close, and it names the one finding that changes how `MOCK_DATA.md` should be read.

All 69 chunks in `docs/BUILD_PLAN.md` are ticked, all seven build stages are closed, and all fourteen
`PHASE_PROMPTS.md` § P6 README sections plus `docs/DEMO_SCRIPT.md` are written. **Ten further chunks,
B63–B72, are in `BUILD_PLAN.md` §10a** — phase 7's, outside the plan's *"69 of 69"* and all
read-side only. **D1–D76 are ratified**; nothing is open.

**Measured 2026-09-07, on `data/loop.sqlite`:** `tsc` clean · `npx vite build` clean · **168 tests,
0 fail** · `npm run agree` **OK in 3.5 s** over 1,577,275 events → 74,509 buckets · `/api/verify`
**200 in 11.0 s**, four projections hash-matched · tree clean. **The test count is 168, not 172** —
D74's four EWMA tests went with the toggle they covered, and that is expected.

**Phase 7 in one line:** three decisions (**D74** cut the chart's EWMA toggle, **D75** cut the
on-screen prose to its facts, **D76** put every clock on screen in UTC), ten chunks, one new document
(`docs/ARCHITECTURE.md`), and **four of the five things reported as bugs argued down as correct
behaviour**. The page is **7,463 → 5,721 px** and its text **21,863 → 14,631 characters**, with no
mechanism, endpoint or projection touched.

1. **`npm start`** — migrate, seed if empty, run everything, print the URL. First run ~5m20s.
2. **`README.md`** is the front door, ~1,600 lines, written for a reviewer. It opens with **`Run it`
   (which now leads with the fresh-clone seed cost) and a grouped Contents list.** Then framing, the
   three-way
   split, the storage model, the persistence boundary, aggregation with its three option tables,
   `SCOPE.md` §2–§4 verbatim, late conversions end to end, the misbehaviour table, 28 named limits,
   the extensions register, the life of one event with real ids, signal-from-noise, the mock data
   model, the decision log, what I'd build next, and four ways to check the numbers.
3. **Three appendices carry the evidence** (**D73**): `docs/SCHEMA.md` (as-built schema, read from
   the store), `docs/MOCK_DATA.md` (the designed curves plotted against what came out), and
   `docs/DECISION_DIGEST.md` (all 77 rows, each with what it forecloses).
4. **`docs/DEMO.md`** is the tested walkthrough — eight beats, followed cold in a browser at B61,
   20–25 minutes. **`docs/DEMO_SCRIPT.md`** is the 15-minute subset plus the ten reviewer questions
   (**D72** — where the two disagree, `DEMO.md` was the one that was tested and it wins).
5. **`docs/DECISIONS.md`**'s index table is the one-line-each view of D1–**D76**.

**What to be careful about, in one list:** `data/loop.sqlite` is the seven-day store and reseeding
it costs **5m20s and 749 MB**, so read it and use a scratch `DB_PATH` for anything that writes ·
**`SIM_BACKFILL_DAYS=5` is NOT a rescue — measured at 4m13s / 587 MB, it saves 21%, because 201.8 s
of the 253 s is *generate* and the rate model does not get cheaper per day** · run
**one server per store** (descriptors are signed per-process) · `npx vite build`, not just `tsc`,
catches a server import leaking into the client bundle · nothing writes a projection except
`apply()` (**D7**) · `BUILD_PLAN.md` §14 holds ~95 traps that will not fail loudly, each written the
day it was found · `SCOPE.md` §2–§4 is README-verbatim and byte-checked by `src/shared/docs.test.ts`.

**Carry-over items from the build** are in [What is owed](#what-is-owed) below — none of them ever
blocked phase 6, and the largest (`B33a`, the fault split) is a plan edit that is Seno's call. All
of them are now also stated in the README's "what I'd do differently", so they are disclosed rather
than merely recorded.

---

<a id="phase-6-the-gap"></a>

## Phase 6 — CLOSED

The gap table that lived here is resolved. Kept as the record of what was owed and what closed it,
because a list that only shows what remains loses the account of what was paid.

| P6 § | Asked for | Closed by |
|---|---|---|
| 1 | Run it in one command | ✅ was already done (B57) |
| 2 | Framing | ✅ `7559c7e` — a ledger with a viewport, not a dashboard; D27 as the product problem; where the brief's own framing misleads |
| 3 | Scope verbatim | ✅ was already done, byte-checked |
| 4 | Storage model **including the schema** | ✅ `7559c7e` + **`docs/SCHEMA.md`** — as-built DDL read from the store, ten indexes with the query each serves, and a parsed diff against `DESIGN.md` §2 (one table: `sim_run`, plus five dropped comments) |
| 5 | The persistence boundary | ✅ was already done |
| 6 | Aggregation, **keep the pros/cons table** | ✅ `7559c7e` — D9, D10 and D29's option tables restored inline |
| 7 | Late conversions end to end | ✅ `7559c7e` — the mechanism in six steps; the life of one event stays its worked example |
| 8 | The life of one event | ✅ was already done |
| 9 | Separating signal from noise | ✅ `6557eac` — three mechanisms kept distinct, the gate that stops, the flag with its five limits, and the admission that the thresholds are calibrated against our own simulator |
| 10 | Mock data model, **show the shapes** | ✅ `6557eac` + **`docs/MOCK_DATA.md`** — six designed-vs-measured shapes with every query shown |
| 11 | Extensions / push-back | ✅ was already done |
| 12 | Decision digest with what each forecloses | ✅ `6557eac` + **`docs/DECISION_DIGEST.md`** — 77 rows, 48 foreclosing nothing, 22 that cost something gathered in its §4 |
| 13 | What I'd build next | ✅ `6557eac` — the cut line as an ordered queue, plus four process findings |
| 14 | AI process artifact pointer | ✅ was already done |
| — | `docs/DEMO_SCRIPT.md`, 15 min + ten questions | ✅ `f33ab40` |
| + | **The fresh-clone first run** — not in P6, raised at the end of the session | ✅ `89563f5` — `.gitignore` excludes `*.sqlite`, so a clone ships no store and a reviewer's first five minutes *are* the seed. Now a callout, with the 5-day option **measured** rather than extrapolated and honestly described as a 21% saving |
| + | **A Contents list** | ✅ `89563f5` — grouped by what the brief asks for, all anchors machine-checked |
| + | **The phase 6 process capture** | ✅ `bbe4709` — `docs/ai-sessions/06-phase-6-packaging.md`, in the 00–04 convention |

**The two decisions phase 6 owed were answered before anything was built on them** — `eebec52`:

- **D72** — `DEMO_SCRIPT.md` is a **15-minute subset alongside** the tested `DEMO.md`, not a trim of
  it, so the cold run's four ⚑ corrections survive where they are. `DEMO.md` wins on disagreement.
- **D73** — README stays the **front door**; the heavy material lands in three appendices, each
  **generated from the shipped artifact** (the store, the store, `DECISIONS.md`) rather than retyped
  from a design document — so the duplication option B was warned about is a checkable diff instead
  of a second opinion.

Both were answered as a multiple-choice pass, so their entries quote the selected option text
verbatim and **say that is what they are doing** rather than inventing prose in Seno's voice.

### What phase 6 measured, and where it disagreed with the design

Everything in `MOCK_DATA.md` is a query over `source='backfill'` — the frozen 1,582,985-event seeded
population — so it is reproducible. Three findings are worth carrying forward:

1. **The diurnal curve, the fatigue curve, the overdispersion signature and `p_fast` all check out.**
   Median absolute deviation on the diurnal is 0.06; `p_fast` reads 0.30 / 0.52 / 0.71 against a
   designed 0.30 / 0.45 / 0.65.
2. **`SIMULATOR.md` §11.2's designed *medians* are not recoverable from the data, and that is a
   property of the statistic rather than a defect.** Between 1 h and 3 h the empirical lag CDF is
   nearly flat, and warm's designed 3.3 h median sits on that flat stretch — so n = 191 puts the
   empirical median at 0.72 h. **No parameter is wrong.** §11.2's table is not amended; `MOCK_DATA.md`
   explains why it should be read as a CDF.
3. **The seeded past-72 h tail is right-censored at `T0`** — 47% of backfilled clicks fall in the last
   three days — so it reads 0–0.7% against a designed 2.3–4.6%. B35's handover is what re-derives
   them live, and the store's earliest *live* event has a `ts` from before `T0`, which proves it.
4. **`SIM_BACKFILL_DAYS=5` had never been run end to end and timed.** It is 4m13s / 587 MB against
   5m20s / 749 MB — **a 21% saving, not a rescue** — because 201.8 s of the 253 s is the *generate*
   phase, which runs per simulated second. The README says so plainly and recommends seeding in
   advance instead. **Four days is the floor**: below it no bucket is old enough to have been
   declared settled, so the flagship restatement moment cannot happen at all.

**Nothing in phase 6 changed code, and nothing in it changed a design document.** It wrote five files
(`SCHEMA.md`, `MOCK_DATA.md`, `DECISION_DIGEST.md`, `DEMO_SCRIPT.md`, `ai-sessions/06-…`) and edited
three (`README.md`, `DECISIONS.md`, this one).

**One curation item is outstanding and is not a phase 6 item.**
`docs/ai-sessions/05-phase-5-Impl-13.md` landed during this session as a **5,476-line raw terminal
export** — the state sessions 9–11 were in before B62 curated them. It should get the same treatment
in its own pass; it was deliberately not absorbed into phase 6.

---

<a id="phase-7"></a>

## Phase 7 — post-completion hardening — CLOSED

**No plan produced this phase.** Phases 0–6 each opened with a document that said what the phase
would do. This one opened with Seno **using the finished app** and saying what was wrong with it.
Every item below traces to a sentence from that, not to a `BUILD_PLAN` row — which is why the chunks
live in `BUILD_PLAN.md` **§10a**, outside the plan's *"69 of 69"*, rather than being appended to
stage 7.

**Ratified state: D1–D76, all of them.** **`BUILD_PLAN.md` §10a holds B63–B72** — ten chunks, all
read-side only: not one touches a projection, an endpoint, a descriptor, the wire, or a ratified
constant. `apply()` is still the only writer of a projection (**D7**).

### What triggered each item, and what closed it

| What Seno found by using it | What it turned out to be | Closed by |
|---|---|---|
| *"Does EWMA is in req list ? if not maybe remove completely?"* | A fair premise — `BRIEF.md` contains neither *"EWMA"* nor *"smoothing"*. The chart's toggle was off by default and demoed nothing; the fatigue flag's EWMA is load-bearing | **D74** `fd7aa47` → **B66** |
| *"a lot of information … everything else is a noise"*, with the horizon caption as his example | Correct, and measurable: **25% of everything on screen was a paragraph explaining the design** | **D75** `dc6268f` → **B65–B69** `f42ece1` |
| Acronyms on the headline figures were never expanded | **HR5** — a number you cannot name is a number you cannot walk back | **B63** `dbcc4c3` |
| Eight surfaces told apart only by a small muted heading | Two of those boundaries are load-bearing: action vs scenario console, and performance numbers vs D34's transport telemetry | **B64** `1fa9516` |
| At one selected ad the per-ad table repeated the headline; the *"newest bucket in view"* caption could name a different ad | **Real, both of them.** (b) was a true statement about the store and a false one about the view, on the line whose job is to say what the screen shows | **B70** `afcfc7e` |
| The drill-down showed the previous metric's numbers under the new metric's title | **Real, and the one thing that surface exists to make impossible.** The `replaying the log…` branch existed but could never fire | **B71** `00e077d` |
| *"the browser that i'm going to demo is in utc+4. but event are stored with utc+0"* | **Real, and invisible on the machine it was built on.** 2 of 10 surfaces rendered browser-local; 8 printed raw UTC ISO | **D76** `7ac3dd4` → **B72** `561e0be` |
| Five things reported as bugs from walking the demo | **Four were correct behaviour that reads as a fault on camera.** They became presenter's notes, not fixes. The fifth was the drill-down's cost, which now carries measured figures instead of a guess | `d21c032` |
| The README's *"browser opened too late"* process finding | **Not accurate.** It was inferred from one line of a session-12 prompt; Seno was there for the build and the characterisation is his to settle. README §13 is now three findings, renumbered | `377d6e2` |
| `DESIGN.md` argues the design and README explains the choices — both prose, no picture | A gap. Six Mermaid diagrams, all derived from source (endpoints parsed out of `index.ts`, tables from `sqlite_master`, topology from `vite.config.ts`) | **`docs/ARCHITECTURE.md`** `4a8d70d` |
| *"the components and writings under 3 — The server, by role … is small and hard to read"* | **Real, and measurable.** That diagram's natural width is 3,582 px against GitHub's ~860 px cap, so it rendered at **scale 0.24 — 3.8 effective px**, the worst of the six by a wide margin. Seventeen nodes in five role groups do not fit one figure under the cap; **split into 3a (write) and 3b (read), both now 16 px at scale 1.00.** The pass also found the diagram drew `agree.ts → replay.ts`, a call `scripts/agree.ts` deliberately never makes — it imports nothing | `22ba219` |

### What phase 7 measured

Everything below is a command run in this repo. **The store is `data/loop.sqlite`** unless another is
named; the browser figures are the running app on that store. **The emitter was running throughout**,
so the event and bucket counts below are a point-in-time read of a live store and will be *higher*
when you re-run them — 40 minutes later the same two commands read 1,579,612 events and 74,686
buckets. What is stable is the **verdict** (`OK`, `hash_matched`) and the **duration**; the totals are
a timestamp, not a constant.

| Claim | Measured |
|---|---|
| `npm test` | **168 tests, 168 pass, 0 fail** in 1.0 s. The four missing against phase 5's 172 are D74's EWMA tests |
| `npm run typecheck` · `npx vite build` | both clean; bundle 328.42 kB / 108.99 kB gzip |
| `npm run agree` | **OK in 3,482 ms** — 1,577,275 events → 74,509 recomputed buckets, 74,509 stored, counts identical |
| `GET /api/verify` | **200 in 11,046 ms** — `ads` 12, `config_generations` 28, `conversion_attribution` 1,333, `rollup_minute` 74,523, **all four hash-matched** |
| D75's premise, in the DOM before deciding | **5,548 chars of explanatory prose across 20 blocks, out of 21,863 on the page** — the 25% that made it a decision rather than a preference |
| B65–B69's effect, in the browser at 1500 px | prose **5,548 → 2,253** (−59%) · page text **21,863 → 14,631** (−33%) · height **7,463 → 5,721 px** (−23%) |
| The drill-down's cost (B71) | **7,004 ms** for 12 ads over one hour, **1,504 ms** for one — linear in **ads**, not window width |
| The decision log's height before B69 | **4,239 px — more than half the page**, and 24 of its 25 rows were the seeded world's own `create_ad`/`launch` setup |
| **D76 re-verified this session on a genuine UTC+4 browser** | Headless Chrome at `TZ=Asia/Dubai`, `getTimezoneOffset() = -240`, wall clock **12:37 +04 / 08:37Z**: the chart axis reads **`3:00am … 8:30am`** under a **`UTC`** label with the date `9/7/26`. Untranslated it would have read `7:00am … 12:30pm` |
| **`ARCHITECTURE.md`'s six diagrams, rendered against mermaid 11 at an 860 px container** | Effective label size: §1 **8.9 px** · §2 **6.4 px** · §3 **3.8 px** → **16 px** after the split · §4 **10.5 px** · §5 **6.8 px** · §6 **9.2 px**. Only §3 was fixed; **§2 and §5 are the next two worth splitting** and were left alone |

#### The one finding that changes how the documents should be read

**`data/loop.sqlite` is not the store phase 6 measured.** It was reseeded — `sim_run` reads
`t0 = 2026-09-07T03:48:41Z`, `seed = 'flawless-loop'`, `backfill_days = 7` — where phase 6's store
had a `T0` three days earlier. Same seed, same seven days, **different population**, because the
rate model is driven by wall-clock hour and the window is censored at `T0`:

| | Phase 6's store | This store |
|---|---|---|
| `source='backfill'` events | 1,582,985 | **1,543,095** |
| `a_01` CTR across the week | 4.467% → 0.464% (**9.6×**) | **3.424% → 0.514%** (**6.7×**) |

**The shapes hold and the counts do not.** That is the honest reading of `MOCK_DATA.md`, and it is
stronger than the one that file currently gives: it says its measurements are *"reproducible"*
because they are over the frozen backfill population, which is true of **that** file and not of a
reseeding. Since `.gitignore` excludes `*.sqlite`, **a reviewer never receives this store** — they
seed their own, at their own `T0`, and will reproduce every *shape* in `MOCK_DATA.md` and **not one
of its row counts**. Two consequences, neither acted on in phase 7:

1. `MOCK_DATA.md`'s population line and `STATUS.md` §*"What phase 6 measured"* should say
   *"measured on the seeding of 2026-09-04"* rather than implying any seven-day store gives these
   numbers. **This is a document change awaiting Seno's word, not a defect in the model.**
2. The `How to run what exists` block below described this file as *"copied in at the G11 gate from
   `/tmp/b34.sqlite`"*. That provenance is no longer true of it and has been corrected in place.

Every historical figure elsewhere in this file stays as written: each is attributed to the gate that
measured it, and a measurement is not wrong because the world moved on.

### What phase 7 deliberately did NOT do

- **It did not touch the simulator, the store, the wire or any projection.** The whole of its code
  is `src/web/` plus `HALF_LIFE_MS` moving into `src/shared/config.ts` and the comment in
  `src/server/fatigue-flag.ts` that stopped being true when the chart's smoother went. Nothing under
  `src/sim/` changed at all, so `/api/verify` and `npm run agree` are green **by construction**, not
  by luck.
- **It did not reseed anything.** Every measurement above is a read. The reseed it *found* was not
  its own.
- **It did not act on README §13's three "differently" items.** #1 (instrument the simulator's
  clamps) and #2 (measure the seeded distributions at build time) both need simulator work, and #3
  (`B33a`, splitting the fault injector) is still designed, costed and unbuilt — there is no
  `npm run faults` and no `scripts/faults.ts`. They remain regrets, correctly.
- **It did not amend a design document to agree with a measurement.** `SIMULATOR.md` §11.2 still
  stands as ratified, and the reseed finding above is written up rather than patched away.
- **It did not curate `docs/ai-sessions/05-phase-5-Impl-13.md`**, still a 5,475-line raw export. It
  was outstanding at the phase 6 close and it is outstanding now.
- **It took no decision on its own.** D74, D75 and D76 were each ratified in their own commit, with
  Seno's words verbatim, **before** the chunk that depended on them was built.

---

## Where we are

**Phases 0–4 are closed.** Design is complete and the build is ordered. Nothing in any design
document is provisional.

**Phase 5 (implementation) is running.** Seno gave the go-ahead 2026-09-04. **Stages 0, 1 and 2 are
CLOSED** — the store (B01–B03), the walking skeleton (B04–B11), and the whole server-side model
(B12–B24). What that means concretely, in one paragraph rather than gate by gate:

`npm run dev` starts three processes. A **separate simulator process** (D32) emits over
`POST /api/ingest`, which stamps, validates, dedupes, persists and rolls up each event in one
transaction. Four signal kinds are real; six levers are real; **config is a fold over the decision
log** (D7) with `config_generations` carrying a half-open `[valid_from, valid_to)` chain;
click-time attribution credits a conversion to **its click's minute** (D27-B) and a late click
**promotes** a provisional orphan and decrements where it was; settlement marks a bucket
`restated_at` at the arriving event's `received_at` (not wall clock); `GET /api/snapshot` and
`GET /api/stream` serve absolute per-minute rows with an idempotent cursor (D30/D47);
`GET /api/verify` rebuilds every projection from the logs into `TEMP` shadows and diffs them (D55),
and `npm run agree` re-derives `rollup_minute` from raw in one ordered pass. A React page on
**:5173** renders a server-computed number that climbs on its own, survives a refresh, and survives
a restart of all three processes. **76 tests.**

**STAGE 3 IS RUNNING, and B25–B31b are closed.** `SIMULATOR.md`'s model is now the emitter's model:
§3's λ with §4's per-channel shape of the day and day-of-week, §12's two log-AR(1) demand factors
with `E[m] = 1`, drawn as `NegBinomial(λ, α = 8)`; §7's fatigue and §8's novelty entering `p_ctr`
and never λ (**D56**); §10's clicks at a rate drawn once a minute so `κ = 200` is real (**D57**),
their CPC blended across §5's pricing mix and coupled to `m_channel^0.6`; §11's conversion-lag
schedule keyed by `click_id`; and I1's 60 s CPM `spend` delta.

**As of B32 + B33 the simulator is feature-complete except for history.** §9's pacing rides λ as
`ρ_catchup × ρ_terminal`, with `e(t)` integrating the ad's own channel curve over the account-local
day; §13's ten misbehaviours are injected between generation and the wire on keyed draws. Two
decisions came out of building it — **D58** (sub-second `ts` no longer depends on the event count)
and **D59** (`ρ_catchup`'s ceiling 1.6 → 1.0, amending `SIMULATOR.md` §9 and §21 in place). Both are
in `DECISIONS.md`; the second is the more important, and its finding is in the traps list.

**HR3 is satisfied as of B31b.** The emitter polls `GET /api/sim/world` at 1 Hz and emits for every
ad the fold says is `live`, with that ad's current config, φ recomputed from the signal log and ν
aged from the pair's first exposure. Verified live: pausing `a_12` stops its events within one tick
while eleven ads keep emitting, and resume brings it back in ~6 s. The simulator holds no durable
state of its own (D40-A) — without a successful poll it emits nothing at all.

**B34 is closed and it changed the world.** `npm run seed` now writes **seven days of history**:
1.6M events generated forward through the real `ingest()`, `received_at = ts + reporting lag`,
sorted by arrival, `source = 'backfill'`. **φ was 1.000 on every ad and now spans 0.126–0.938**, and
measured `F` matches §7.2's designed accrual to within 0.854–1.049 per pair — so **§7.2's table is
the live check now, and it holds**. D16's orphan path is real for the first time (1,337 resolved,
8 provisional). It also landed **D60** (the seed lives in the store), **D61** (60 s ratified) and
**D62** (conversion is a per-click Bernoulli keyed by `click_id`).

**B34a fixed the thing B34 exposed.** `/api/verify` returned 409 on a correct store because
`verify.ts` rebuilds in `ingest_seq` order while `apply()` resolved attribution against the WHOLE
`signals` table — so the rebuild could never produce an orphan. `resolveAttribution()` now takes a
**required** `as_of_ingest_seq` and `apply()` hands it `signal.ingest_seq` (in `promoteOrphans()`,
the CLICK's). Measured on a 1-day scratch seed of 360,740 signals with 49 promoted orphans:
**409 → 200**, `npm run agree` still OK, **78 tests**. `verify.ts` itself was not touched.

**B35 closed stage 3, and it found that the live emitter emitted NO conversions at all.** B29 built
the lag and emits nothing by design; B31a built `pending_backfill_clicks` and nothing consumed it;
B34 dropped every conversion arriving after `T0` on the promise the emitter would re-derive it. One
`conversionFor()` now serves both populations — the live clicks this process emitted and the
backfilled clicks `T0` handed over — because §15.3(b)'s promise is that a click's whole future is
re-derivable from its `click_id`, and two implementations of that promise is how the two sides of
the seam come to disagree with every number still plausible. Measured on a 1-day scratch seed with
7,166 handed-over clicks: **five conversions arrived live, every one on a `source='backfill'` click
and every one crediting a minute before `T0`**, the oldest **19.5 hours late**. A restart's catch-up
re-emitted 412 events as **400 `duplicate_identical` / 0 `duplicate_conflicting`**. It landed
**D63** — a paused ad's already-earned conversion still arrives.

**STAGE 3 IS CLOSED. `SIMULATOR.md` is fully implemented.** Nothing in that document is
unbuilt.

**How stage 3 is verified, and it has not changed:** `SIMULATOR.md` is the spec and is complete to
the parameter, so each chunk is a comparison against a table already in that document rather than a
judgement. **Read the table before writing the chunk; do not invent a constant** — a missing one is
a gap to raise (three became D56, D57 and `BRIEF_GAPS.md` §H). Every chunk adds `--dry-run` output
rather than a screen, and emission stays live throughout.

**No decision blocks anything from B32 to B35.** D44/D45 are *deferred* (**F4**) and come back at
the stage 3 → 4 seam; see "What is open", which also carries the two unratified B11 assumptions.

**One caveat on `DESIGN.md`.** It was approved at the Phase 2 close and has since been **corrected
in one place and extended in two** by Phase 3 — read it *with* the "What Phase 3 changed in
`DESIGN.md`" section below, not instead of it.

**STAGE 7 IS CLOSED, AND WITH IT PHASE 5.** `G17` = B57+B58+B59+B60+B61+B62, six chunks in one
batch at Seno's instruction (*"stage 7 in 1 batch"*), one past D48's five-chunk cap and inside the
same stage. The stop clause did not fire. `npm start` is the one command (**B57**); `README.md` is
written in three parts (**B58/B59/B60**) with `SCOPE.md` §2–§4 verbatim and byte-checked by a test;
`docs/DEMO.md` had its final ordered pass **followed cold in a real browser** (**B61**), which is the
first time anyone clicked any of stages 4–6 and which produced four corrections; and the raw terminal
exports for sessions 9, 10 and 11 are now curated captures (**B62**).

## What exists

| File | What it is |
|---|---|
| `docs/BRIEF.md` | The brief. Source of truth. Read it, never recall it. |
| `docs/BRIEF_GAPS.md` | Audit register: 52 findings (G01–G52), six passes, 12 blocking each tagged FIX/SPECIFY/NAME. **Plus the extensions section** (E1–**E15**, I1–**I20**) — the assembly source for the README's extensions section. **And §H: contradictions in our OWN design docs** — H1 the recovery half-life, H2 `spend`'s missing fee parameter, H3 novelty's slot composition, **H4 (B51) §10.1's `spend_cents` against the code's `spend`, in a SIGNED payload**. |
| `docs/ARCHITECTURE.md` | **Post-phase-6.** The system drawn: six Mermaid diagrams (processes and boundaries · the write path · the server by role · the store's four categories · the read path and D34's three layers · the simulator's loop), plus all 18 endpoints and a where-to-look table. Every diagram derived from source — endpoints from `index.ts`, tables from `sqlite_master`. **All six verified to parse and render against mermaid 11.** |
| `docs/SCHEMA.md` | **Phase 6.** The as-built schema, read from `data/loop.sqlite` with `sqlite_master`: four-category answer with measured row counts, ten indexes with the query each serves, the DDL verbatim, the pragmas, and a parsed diff against `DESIGN.md` §2. |
| `docs/MOCK_DATA.md` | **Phase 6.** The mock data model **measured** — diurnal, fatigue, novelty, overdispersion, pacing and the lag CDF, designed curve against shipped world, every query shown. The three findings above live here in full. |
| `docs/DECISION_DIGEST.md` | **Phase 6.** All 77 rows (D1–D73, T1, F1–F4, D35p) reduced to **what each forecloses** — the column `DECISIONS.md`'s index table does not carry. |
| `src/web/app.css` | One stylesheet (D45). Carries `--rule` for B64's section separators and `.disclosure` for D75's collapsed caveats. |
| `docs/ai-sessions/06-phase-6-packaging.md` | **Phase 6.** The process capture for this phase, in the `00`–`04` convention — prompts, the two decisions, four findings, and what the session deliberately did not do. |
| `docs/DEMO_SCRIPT.md` | **Phase 6.** The 15-minute subset of `DEMO.md` (**D72**) plus the ten hardest reviewer questions, each answered in 1–2 sentences with its decision id. |
| `docs/OPEN_QUESTIONS.md` | §A 7 questions for the brief's author · §B decisions in `CLAUDE.md` §3 format, waves 1–**9** · §C assumptions **U1–U9**. Resolved and deferred ones carry a banner pointing at `DECISIONS.md`. |
| `docs/DECISIONS.md` | Ratified only — **D1–D63, T1, F1–F4, U8–U9** — nothing deferred: D44/D45 were answered at the B36 gate. **Use the index table at the top as the lookup:** most have their own `## DECISION #n` entry; nine (D3, D4, D15, D16, D18, D19, D21, D23, D25) are rows inside the Phase-2 ratification block and will not be found by grepping for a heading. Seno's verbatim wording sits in per-pass "wording of record" tables. |
| ~~`docs/CHEATSHEET.md`~~ | **DROPPED** by Seno at the B36 gate, 2026-09-04, and deleted. Not owed at any gate. `DECISIONS.md`'s index table is the one-line-each view now, and it cannot go stale. Recover with `git show e989336:docs/CHEATSHEET.md`. |
| `docs/SCOPE.md` | Phase 1 output. What's real (**P1–P17**), what's sketched, what's cut. §2–§4 is README-verbatim. |
| `docs/DESIGN.md` | **Phase 2 output.** The three-way split · DDL · persistence boundary · aggregation · late conversions end to end · the misbehaviour table · the fold · the reverse join · versioning · traceability · the flow diagram · extensions. |
| `docs/SIMULATOR.md` | **Phase 3 output.** The seeded world · the rate equation · diurnal, channel, temperature · fatigue · novelty · pacing · the lag mixture · noise · injected misbehaviours · determinism · backfill and the seed path · state sync · scenario control · calibration, measured · the parameter appendix. |
| `docs/BUILD_PLAN.md` | **Phase 4 output and the Phase 5 tracker.** 64 chunks — `B01`–`B62` **plus `B20a`**, with **B10 split into `B10a`/`B10b`**; per chunk: goal, files, manual verification, spec citation, hard-requirement flags, checkbox. §2 decisions · **§5 stage 2's six D48 gates** · §7 the B36 gate (now **four** items) · §11 scope coverage · §12 cut line (**held intact**, D49) · §13 schedule risk · **§14 the traps** (24) · **"The gate-margin check B34 owes"**. |
| `docs/ai-sessions/` | The **AI process artifact** the brief asks for (L153): one capture per phase (`00`–`04`) plus one per implementation session (`05-phase-5-Impl-1` … **`-8`**). Prompts, decisions and turning points — not keystroke transcripts. Plus `PHASE_PROMPTS.md`. **All committed; nothing owed here.** |
| **`package.json`, `tsconfig.json`, `.nvmrc`, `.gitignore`** | B01. Single package, three entry points, strict TS, Node 24 floor. |
| **`src/server/db.ts`** | B02/B07. `openDb()` (four pragmas, throws if not WAL), `tx()` (BEGIN IMMEDIATE), **`readTx()`** (BEGIN DEFERRED — B07: a read must not take the write lock, and under WAL it needs no lock to get a stable snapshot), `DB_PATH`. |
| **`src/server/migrate.ts`** | B02. Migration runner + CLI. `PRAGMA user_version`, no bookkeeping table. |
| **`migrations/001_logs.sql`** | B02. `components`, `audiences`, `signal_deliveries`, `signals`, `decisions`. |
| **`migrations/002_projections.sql`** | B03. `ads`, `config_generations`, `conversion_attribution`, `rollup_minute`, `projection_meta`, `sim_scenarios`. |
| **`src/server/http.ts`** | B04/B09. `createRouter()` (method+pathname match, 404, handler error → 500), `sendJson()`, `readBody()`, `openSse()` — plus **`comment()`** (B09: a keepalive that dispatches no event and does not move `Last-Event-ID`). D42: no framework. |
| **`src/server/index.ts`** | B04/B05/B14. One `DatabaseSync` for the process; refuses to boot on an unmigrated store; `GET /api/health` (log position), `POST /api/ingest`, **`POST` and `GET /api/decisions`**; clean close on SIGINT/SIGTERM. Port **8787**, `PORT` overrides. |
| **`scripts/dev.mjs`** | B04/B08. **Three** OS processes: server, simulator (D32), and Vite on :5173. A crash in any tears the rest down; a **clean** exit does not. **Unchanged by B11** — the simulator now runs forever instead of returning immediately, so that tolerance is no longer exercised, but it is what keeps `npm run dev` alive if the emitter is ever stopped alone. |
| **`src/shared/types.ts`** | B05. The brief's `Signal` (L76) **verbatim**, `event` discriminator and all; `Disposition`, `SignalSource`, `IngestResult`. |
| **`src/server/ingest.ts`** | B05/B09/B16. `ingest(db, raw, source, now)` — DESIGN §5.1 in one transaction. Returns **`IngestOutcome`** = `{ result, dirty }` (B09: the buckets it moved, for the SSE flush; the caller publishes *after* commit). **Also the seeder's entry point** (SIMULATOR §15.2): one writer of `ingest_seq`. **`isCanonicalIso` is exported** for its D43 test (B12) and for no other caller. **B16 widened `SUPPORTED` to impression + click + spend**, added the `OWN_FIELDS` ownership table and the `click_id` collision test — whose position in the ladder is a §14 trap. **B18 completed `SUPPORTED` with `conversion`** and validates its two fields. |
| **`src/server/stream.ts`** | B09/B10a. **273 lines — B44 splits it** (§14/B44 row). `createStream(db)` — the process-wide dirty set (coalesced by `Map`), the **250 ms** flush tick, `subscribe`/`markDirty`/`shutdown`/`size`. **One frame per tick** carrying every touched bucket as an absolute row; `id:` = high-water `ingest_seq`. Plus B10a: `readCursor()` = `max(?cursor, Last-Event-ID)` validated as `/^\d+$/` on the RAW string, the store replay (`bucketsSinceReader`, `LIMIT 2001`), and the three `resnapshot` conditions. **Subscribes before replaying** — duplicates are free, gaps are not. |
| **`src/server/snapshot.ts`** | B07/B09/B10a. `GET /api/snapshot` — `parseSnapshotQuery()` (explicit offset required, bounds snapped to the minute, echoed) and `snapshot()`. Also **`bucketReader()`** (the flush's single-bucket read) and **`bucketsSinceReader()`** (the resume read) — both here so the snapshot, the flush and the resume cannot drift into three row shapes. Read-only by construction: SELECTs and nothing else. B21 adds settlement state, B38 the ratios, B51 the descriptors. |
| **`index.html`, `vite.config.ts`** | B08. Vite dev-serves `src/web` alone on **:5173** and proxies `/api` to :8787 (D41-A). Client fetches relative paths, so no CORS and one configuration. Unstyled: D45 deferred. |
| **`src/web/main.tsx`, `src/web/App.tsx`** | B08/B10b. Snapshot for the last hour, then subscribe from its cursor; renders **one bucket's `impressions` verbatim** plus the server's window, the cursor and a link state. No sum — see **D46**. Nothing durable client-side (§3). A `resnapshot` bumps a generation counter that re-runs the whole effect, so §3.1's "return to step 1" is literally a re-mount. |
| **`src/web/store.ts`** | B10b. The render cache. `createStore` / `applyRows` / `inWindow` / `latestBucket` / `bucketKey`. **The merge is an ASSIGNMENT keyed by `(ad_id, minute_start)`, never an addition** — absolute rows (D30) — and **out-of-window rows are dropped**, because the replay is unwindowed while the snapshot is windowed. |
| **`src/web/stream.ts`** | B10b. `subscribe(cursor, handlers)` → `EventSource('/api/stream?cursor=N')`. **`?cursor=` is mandatory (D47)**: `EventSource` cannot set a header, so without it every refresh drops the snapshot-to-subscribe gap. |
| **`src/server/apply.ts`** | B06/B13/B16. **The single projection writer (D7).** `apply()`, `floorMinute()`, D29's upsert — **one generalised statement binding four deltas**, covering impression, click and spend; `AppliedSignal` is a **discriminated union** on `kind`, so a caller that forgets the money is a compile error. **B18/B19 added the conversion** — the one kind that does not land at its own minute: `apply()` resolves attribution (so a rebuild re-derives placement through this same function), writes the `conversion_attribution` row, and credits either `conversions`/`value_cents` at the CLICK's minute or `provisional_*` at the orphan's own. It **returns `BucketKey[]`** — a click's promotions move two buckets each, and `stream.ts` treats every key as a row that certainly exists. **B20 added restatement:** `writeRollup()` (the one writer of `rollup_minute`, owning the counts, the `max_ingest_seq` raise and the settlement test), `promoteOrphans()`, and delta **coalescing by bucket** so `restatement_count` bumps once per bucket per event. Plus **`applyDecision()`** (B13): §7's four steps in one transaction — precondition, fold, close generation *n* / open *n+1*, write `ads`. It also inserts the `decisions` **log** row, deliberately, so the log and the projections it produces commit together. |
| **`src/shared/decisions.ts`** | B12. `AdConfig`, `AdInitial`, `DecisionBody` (§2.3's six actions), `Decision`, `ACTOR`. The lever half of "configs, signals and levers stay distinct" — no signal type appears here. `AdInitial` omits `created_at` per **D51**. |
| **`src/server/fold.ts`** | B12. **Two pure functions, no store, no clock.** `precondition()` = §7's compare-and-swap + the existence rules + the transition table (F1's unreachable `archived` branch lives in it, explaining itself). `fold()` = the six actions, returning a new object every time. |
| **`src/server/decisions.ts`** | B14. `postDecision()` and `listDecisions()` — parse and shape only; **writes nothing**. `ts` and `actor` are server-assigned, so U7's backdating and U2's actor are unrepresentable on the wire rather than validated. |
| **`src/server/attribute.ts`** | B17. `resolveAttribution()` and `generationAt()`. **Reads and computes only** — `conversion_attribution` is a projection and B18 persists the row this returns. Covers D14, D16, D27-B and I8/G30. Called by `apply()` from B18 on. **B19/B20 added the derived half:** `HORIZON_MS` (72 h, D13), **`settledAt()`** (§5.4's test, clocked at the arriving event's `received_at` — D38) which `attributionStateAt()` calls so the arithmetic exists once, and `orphanTally()`. **B21 moved `HORIZON_MS` to `shared/config.ts` and `settledAt()` to `settlement.ts`; `attributionStateAt()` calls the survivor.** **D54: `orphan_expired` is computed at read, never stored** — the column holds two states. |
| **`src/sim/fixtures.ts`** | B15. SIMULATOR §2 transcribed: `COMPONENTS` (16, `vl_04` at two versions), `AUDIENCES` (4, all US), `ADS` (12, with `live_days` and D52's budgets — the expected-spend derivation is written above the table). `served_fraction` is deliberately **not** here: it is an emitter parameter, not an `audiences` column. |
| **`src/sim/seed-world.ts`** | B15. `seedWorld(db, t0)` + `npm run seed`. Writes `components` and `audiences` directly (static reference data, not projections) and creates every ad **only** through `applyDecision()`. **D53:** decisions backdated to `T0 − live_days`. Refuses a non-empty world. |
| **`src/shared/time.ts`** | B20a. **The timestamp invariant, once.** `isCanonicalIso` (a round-trip, not a regex — a regex admits `2026-02-30`), `HAS_EXPLICIT_OFFSET`, `floorMinute`, `floorToMinute` / `ceilToMinute`, `toCanonicalIso`, `MINUTE_MS`. Collapsed four copies. **The write side REJECTS, the read side CANONICALISES** — deliberate, and stated here so it stops looking like two modules disagreeing. `ingest.ts` and `apply.ts` re-export their old names, so B20a moved code without re-plumbing importers. |
| **`src/shared/config.ts`** | B21. `HORIZON_MS` (72 h, D13) and `ACCOUNT_TZ` (`America/New_York`, D22/I2 — the budget day boundary and the diurnal curve, and nothing else; buckets stay UTC). |
| **`src/server/settlement.ts`** | B21. `settledAt(minute_start, at)` — §5.4's test, clocked at the arriving event's `received_at` (D38) when `apply()` asks and at the read moment when the read side does — plus `bucketState()` → `live` / `settled` / `restated`. Derived, read-side; nothing here writes. The horizon is a **parameter**, which is what makes P16/B49 a sweep rather than a hunt. |
| **`src/server/verify.ts`** | B22. `GET /api/verify`. Rebuilds all four projections from the logs through the **real** `apply()` / `applyDecision()` into `TEMP` tables that **shadow the projection names** (**D55**), hash-compares each, and walks rows only where a hash disagrees (§7's fast path). 200 clean / 409 divergent, so a script need not read the body. Temp DDL derived from `sqlite_master`, `REFERENCES` stripped (a temp FK resolves inside `temp`), `CHECK`s kept. `decisions` **is** shadowed (B13 writes the log row in the same transaction); `signals` is **not**. **The only file allowed to schema-qualify a projection** — §14, with a build-failing tripwire. |
| **`scripts/agree.ts`** | B24. **`npm run agree` — P14.** One ordered whole-log pass: index every click, walk `signals` in `ingest_seq` order accumulating **all** buckets at once, diff `rollup_minute`. Two linear scans, `O(2N)` — **never `replay()` per bucket**, which is `O(buckets × N)` and ~13 h at this size. Exits 1 on any mismatch, naming ad, minute, column and both values. **It states its own limits on every run** (§14): the four arrival-order columns are not diffed, and `ads` / `config_generations` / `conversion_attribution` are not read at all. |
| **`src/server/replay.ts`** | B23. `replay(descriptor)` — pure over a log prefix, **raw `signals` only, never `rollup_minute`** (§10.2: the display path and the check path must differ, or the walk-back compares the code to itself). The prefix bounds attribution as well as counting. Returns the counts **and** `contributing_event_ids`, which is the evidence half. No HTTP — the drill-down is B52/B53. |
| **`src/shared/metrics.ts`** | B38. **The ratio arithmetic, one implementation for two callers** — the server divides window totals, the chart divides per point. `MetricCounts`, `addCounts`, `spendTotalCents` (L79-80's read-time sum), `ctr` / `cpaCents` / `roas` (all `null`, never 0, on an empty denominator), `isEmpty` (B39's gate turns on it), `metricValue`, `derive`. **`provisional_*` is never added in** — §14's trap. Nothing here is stored. |
| **`src/web/metrics.ts`** | B38/B40. **Formatting and the refresh fetch, never an independent number** (D46). `METRIC_LABELS`, `METRIC_NOTES` (§4.5's cohort caveat, on screen), `formatCents` / `formatCtr` / `formatRoas`, `combined` / `perAd`, `fetchTotals` (**D66's `?include=totals`**), and **B40's `ewma`** — decayed in TIME at D20's 15-minute half-life, so the rung the gate picked changes the weight and not the meaning. |
| **`src/server/maturity.ts`** | B41. D33's indicator: the empirical attribution-lag CDF (`received_at − click.ts`) over **settled cohorts only** — the survivorship correction, and the one thing about this file that is invisible when wrong. `maturityCurve()`, `shareAt()` (a step function that never claims 100%), `maturityFor()` (the window's newest and oldest minute). `MIN_SAMPLE = 30` gates D33's cold-start fallback, which never fires with seven days of backfill. |
| **`src/server/restatements.ts`** | B43. §5.6's timeline. `restatements(db, query, horizonMs)` — buckets with `restated_at` in the window, each with the late arrivals that explain it, `before` derived by subtraction and `after` as stored, the lateness measured from the **bucket's own minute**, and `explained: false` when the arrivals do not account for `restatement_count`. The horizon is a **parameter**, which is what makes P16/B49 a sweep. |
| **`src/server/tail.ts`** | B44. The raw tail's ring (500 deliveries) and the health counters, fed from the **posted body** at the ingest route so a `rejected_invalid` delivery is visible at all. `createTail()` → `record` / `frame` / `noteSpill` / `noteBackpressure`. Amounts and lateness are pre-rendered `Display` strings (D34 layer 1). |
| **`src/server/resume.ts`** | B44 (c). The resume half split out of `stream.ts`: `readCursor` (D47's `max(?cursor, Last-Event-ID)`, validating the RAW string), `RESNAPSHOT_ROWS`, and `decideReplay()` — one read transaction, the three `resnapshot` conditions. **`stream.ts` re-exports `readCursor`**, so no importer moved. |
| **`src/server/fatigue-flag.ts`** | B45. §19's heuristic, server-side because the peak is a property of the pair's **whole life** and the pair comes from §8's temporal reverse join. `fatigueReport(db)` → per `(lineage × audience)` pair per slot: current, lifetime peak, drop, flagged, qualifying points, and the **reason it is not flagged** when it is not. Reads `BARS.ctr` and `HALF_LIFE_MS` rather than re-declaring either. Writes nothing. |
| **`src/shared/wire.ts`** | B44. `Display` — a branded string, so arithmetic on a tail value does not compile and minting one from a plain string does not either. `TailEvent`, `TailFrame`, `StreamHealth` (D34's **named exception**: transport numbers, in their own treatment). |
| **`src/web/gate.ts`** | B39. **D20's bars and ladder, D67's constant.** `BARS` (500 impressions · 10 **conversions**), `LADDER` (60/300/900/3600, capped), `CLEARING_SHARE = 0.5`, `clears` (per point), `tally` (empty vs gated — the §14 trap), `admissible`, `planChart` (the rung, the drawn ads, the dropped ads, the gated count) and `rungLabel`. The component decides nothing. |
| **`src/web/series.ts`** | B37/B39. `pointCounts()` — **the one re-bucketing**, count sets per point, `null` before `launched_at` and zero inside the ad's life (D64) — plus `metricColumn()` (the division, after the aggregation, with the gate's suppression as a predicate) and `toColumns()`, now a projection of `pointCounts` so B37's tests guard both. **D46 lands here at B51**: the aggregation must then bind to the descriptor's own `granularity_s`, and the comment is the hook. |
| **`src/server/*.test.ts`, `src/web/*.test.ts`, `src/shared/*.test.ts`** | B12/B13/B17–B23, B37–B40. `npm test` = `node --test`, **139 tests**: `fold.test.ts` (12), `ingest.test.ts` (`isCanonicalIso`, 4), `stream.test.ts` (`readCursor`, 7), `apply-decision.test.ts` (8), `attribute.test.ts` (8), `conversion.test.ts` (11 — B18/B19, ingest→apply end to end), `restate.test.ts` (8 — B20, promotion and the D38 clock), `settlement.test.ts` (5 — B21), **`verify.test.ts` (7 — B22, including D55's build-failing tripwire)**, **`replay.test.ts` (6 — B23, including its own no-projection guard)**, `series.test.ts` (8 — B37), **`store.test.ts` (6 — B38a, the roll)**, **`metrics.test.ts` in `shared/` (8 — B38, including a grep proving no migration declares a ratio column)**, **`gate.test.ts` (10 — B39)**, **`metrics.test.ts` in `web/` (4 — B40)**, **`maturity.test.ts` (6 — B41)**, **`restatements.test.ts` (6 — B43)**, **`tail.test.ts` (7 — B44, including D34's two `@ts-expect-error` tripwires)**, **`fatigue-flag.test.ts` (6 — B45)**. D43's criterion governs what goes here, not a list. |
| **`src/sim/index.ts`** | B11. The emitter: `a_12` only, impressions only, a **constant** 20,000/day (§2.3), 1 s tick at 1× wall clock, one batched POST per tick, `ts` = the second that has **closed** so I10 never clamps. The tick index is the **absolute unix second** — that, not the id alone, is what makes a restart's re-emission `duplicate_identical`. A failed POST is held and coalesced into the next tick. Env: `SIM_SEED`, `SIM_INGEST_URL`. Never opens the store (D32). |
| **`src/sim/rng.ts`** | B11. `SIMULATOR.md` §14's formula: `splitmix64(fnv1a64(seed ∥ stream ∥ parts))`, key parts NUL-joined so two entities cannot share one stream. `draw()` → `u ∈ [0,1)`; `derivedId()` → the same 64 bits as 16 hex chars. Keyed, not sequential, so a lever cannot reshuffle another ad's draws. **~2 µs a draw** — see the note in "Next action". |
| **`src/sim/params.ts`** | B25/B26/B27. **§21's parameter appendix, transcribed** — diurnal weights and `Z`, `w_dow`, `α = 8`, `base_impr_per_day`, `served_fraction`, the `FATIGUE` constants, §5's channel matrix, §6's temperature matrix, the `NOISE` concentrations, `SPEND_TICK_S`. Nothing here is a choice and each number names its section. `p_fast` is the one §6 column still absent — B29 reads it. |
| **`src/sim/rate.ts`** | B25. `d_c(h)` (account-local hour via `Intl`, offset cached per UTC hour), `w_dow`, `lambdaPerSecond()` and `negBinomial()` as a Gamma–Poisson mixture. `RateFactors` carries `phi` **declared and never passed** (D56), plus `nu`/`rho`/`demand` for B28/B32/B30. |
| **`src/sim/fatigue.ts`** | B26/B28. `pool()`, `phi()`, `phiAd()`, `rest()` (2^(−Δt/5 d)), `versionAdjusted()` (`r = 0.35`), `nominalAccrual()`, `adFatigue()` — plus §8's novelty: `novelty()`, `noveltyKey()` (**keyed `(lineage, VERSION, audience)`**), `noveltyAgesAtT0()`, `adNovelty()` (**the video slot only** — `BRIEF_GAPS` §H3). Accrual is keyed by **(lineage × audience)**, both slots of every ad. `nominalAccrual()` is the projection §7.2 was calibrated with, **not** the measurement — B31 recomputes `F` from the signal log. |
| **`src/sim/emit.ts`** | B27/B30. `betaBinomial()` (Pólya urn), `logNormal()`, `pCtr()` (**where φ and ν enter — D56**), `pCvr()`, `orderValueCents()`, `clicksForTick()` (takes a `ClickFactors` object: `phiAd`, `nu`, `mChannel`), `cpmAccrualCents()`, `spendCents()`, `isSpendBoundary()`. |
| **`src/sim/lag.ts`** | B29. `purchaseLagMs()` (fast/slow mixture by `p_fast`, `null` past the 7-day cutoff — the truncation IS a dropped conversion), `reportingLagMs()` (the straggler is additive), `scheduleFor()`. **Keyed by `click_id` and nothing else**, per §15.3(b), which is what lets B31 hand over a bare list of pending click ids. **Emits nothing** — see "What is owed". |
| **`src/server/sim-world.ts`** | B31a. `GET /api/sim/world` in one read transaction: `ads` from the fold, `last_decision_seq`, **deliveries per `(lineage, version, audience)`** from §8's temporal reverse join, `spend_so_far_today` on the account-local day, pending scenarios. **B35a: the pending backfill clicks are served ONLY behind `?include=pending`** and typed `[] | null` — they were 99% of the payload of a 1 Hz poll, for a boot-time handover. READ-ONLY; unqualified table names per D55. |
| **`src/sim/world.ts`** | B31b. The emitter's half: `pollWorld()` (1 Hz, holds the last good world — a failure stalls, it does not stop), `liveAds()` (**status is the gate**, φ from the log's `F`, ν from the pair's first exposure). One implementation of the φ rule via `fatigue.ts`'s `slotFrequency`, two sources of input. |
| **`src/sim/noise.ts`** | B30. `demand()`, `demandFactor()`, `demandConstants()`, `stepIndex()`. §12's two log-AR(1) factors as a **truncated innovation sum, never an accumulator** — see the traps. Innovation sd rescaled so the stationary variance is exact at any truncation; Box–Muller pairs shared across adjacent steps so `K` innovations cost `K` draws. |
| **`src/sim/dry-run.ts`** | B25/B26/B27. **Stage 3's whole verification surface**, three sections from ONE simulation pass. Emits nothing. `arrivalProcess()` returns the per-ad tallies `clickAndCostPath()` prints; `fatigue()` diffs itself against §7.2 and prints **MATCH/DIFFERS** per row. |

## How to run what exists

```
npm i                 # Node 24+ required; node -v
npm run db:migrate    # creates data/loop.sqlite, applies both migrations
#                     ** data/loop.sqlite ALREADY HOLDS A SEVEN-DAY STORE ** — do NOT reseed to
#                     look around, read it. It was RESEEDED on 2026-09-07: sim_run reads
#                     t0=2026-09-07T03:48:41Z, seed='flawless-loop', backfill_days=7. It is NOT the
#                     store copied in at the G11 gate from /tmp/b34.sqlite, and NOT the one phase 6
#                     measured MOCK_DATA.md against — same seed, later T0, different population
#                     (1,543,095 backfill events here against phase 6's 1,582,985). Verified
#                     2026-09-07: agree OK 3.5s, /api/verify 200 11.0s. See the Phase 7 section.
npm run seed          # B15 + B34: the 12-ad world as 24 backdated decisions, THEN seven days of
                      # history — ~1.6M events. ONCE, on an empty store. **~5m20s** and ~750 MB:
                      #   249s generate · 0.3s sort · 70s write, peak RSS ~703 MB
                      # SIM_BACKFILL_DAYS=5 is §15.2's stated fallback lever if that is too long
                      # SIM_SEED=<x> forks the world AT SEED TIME only — the emitter reads the seed
                      # back out of GET /api/sim/world and has none of its own (D60)
npm run dev           # THREE processes: server :8787, Vite client :5173, simulator (B11, real)
npm run sim           # the simulator alone, against an already-running server.
                      # SINCE B31b IT NEEDS ONE: no world poll -> no emission at all, by design.
                      # It says so on the first failed poll and keeps `nextTick` where it is, so
                      # the seconds are delivered once the server appears rather than lost.
npm run sim -- --dry-run --hours 24     # B25-B33: emits NOTHING, prints the model vs SIMULATOR.md
                                        # ~51 s. ONE simulation pass feeds all six sections:
                                        #   B26 fatigue vs §7.2 · B28 novelty · B29 lag vs §11.2
                                        #   B30 AR(1) vs §12 · B32 pacing vs §9 AND vs §2.3's own
                                        #   Impr/day column · B33 all ten §13 rates, MATCH/DIFFERS
npm run sim -- --dry-run --hours 24 2>&1 | sed -n '/B32 · §9/,/B27 · §5/p'   # pacing + faults alone
npm run sim -- --dry-run --hours 1      # ~12 s; everything but the hour-by-hour diurnal shape.
                                        # ~11 s of that is FIXED: B29's 80k lag draws and B30's
                                        # AR(1) ensemble, neither of which scales with --hours
                                        # --from <iso> anchors the window; default is local midnight
npm run typecheck     # tsc --noEmit, must be clean
npm test              # node --test — 139 tests (D43's targets plus the write path and the read side)

open http://localhost:5173        # the number, live. Ctrl-C the runner and it comes back.

curl -s localhost:8787/api/health                       # log position + stream_subscribers
T=$(node -e "console.log(new Date(Date.now()-30e3).toISOString())")     # PAST — see the clamp note
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"e1","ts":"'$T'","ad_id":"a_12","event":"impression"}]'
#   -> the browser number moves within ~250 ms, no refresh

F=$(node -e "console.log(new Date(Date.now()-3600e3).toISOString())"); TO=$(node -e "console.log(new Date().toISOString())")
curl -s "localhost:8787/api/snapshot?from=$F&to=$TO"    # buckets + as_of_ingest_seq
curl -sN "localhost:8787/api/stream?cursor=0"           # ready frame, then absolute rows per tick
curl -sN -H 'Last-Event-ID: 999999' localhost:8787/api/stream    # resnapshot cursor_ahead_of_log

curl -s localhost:8787/api/verify                       # B22: 200 clean / 409 with the offending key
npm run agree                                           # B24: exits 1 on a mismatch, 0 clean
#   -> hand-UPDATE any rollup_minute row and BOTH catch it, for different reasons:
#      verify rebuilds through apply() (a drifted STORE); agree recomputes without it (wrong CODE)
# B18/B19 — a click, then its late conversion. The conversion lands in the CLICK's minute.
CK=$(node -e "console.log(new Date(Date.now()-9000e3).toISOString())")   # 2.5 h ago
CV=$(node -e "console.log(new Date(Date.now()-60e3).toISOString())")
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"k1","ts":"'$CK'","ad_id":"a_12","event":"click","click_id":"ck1","cost_cents":62}]'
curl -s -X POST -H 'content-type: application/json' localhost:8787/api/ingest \
  -d '[{"event_id":"v1","ts":"'$CV'","ad_id":"a_12","event":"conversion","attributed_click_id":"ck1","value_cents":4500}]'
#   -> one rollup row moves, at the CLICK's minute; none is created at the conversion's
#   -> attributed_click_id that matches nothing => provisional_conversions at its OWN minute

sqlite3 data/loop.sqlite "SELECT ad_id,minute_start,impressions,max_ingest_seq FROM rollup_minute ORDER BY max_ingest_seq;"
sqlite3 data/loop.sqlite "SELECT disposition, COUNT(*) FROM signal_deliveries GROUP BY 1;"
#   -> restart the sim within 60s: duplicate_identical rises, impressions do NOT
```

**The seeded world, from B15.** On a scratch store so `data/` stays as the simulator left it:

```
export DB_PATH=/tmp/g2.sqlite PORT=8791
rm -f "$DB_PATH"* && node src/server/migrate.ts && node src/sim/seed-world.ts
#   -> T0 = <boot instant>;  24 decisions -> 12 ads, 24 generations
sqlite3 "$DB_PATH" "SELECT (SELECT COUNT(*) FROM decisions),(SELECT COUNT(*) FROM ads),
  (SELECT COUNT(*) FROM config_generations),(SELECT COUNT(*) FROM config_generations WHERE valid_to IS NULL);"
#   -> 24|12|24|12      TWENTY-FOUR generations, TWELVE open — see the note below
sqlite3 -header -column "$DB_PATH" "SELECT ad_id,status,launched_at,daily_budget_cents FROM ads ORDER BY launched_at;"
node src/sim/seed-world.ts        # refuses: "12 ads already exist"
```

**Twenty-four generations, not twelve.** `BUILD_PLAN.md`'s B15 row says "12 generations" and means
the count of **open** ones. Every ad gets generation 1 in `draft` at `create_ad` and generation 2
`live` at `launch`, because status is one of the six columns `config_generations` carries and §7
opens a generation whenever a config value changes. Verified, reported at the G2 gate, not a bug.

**The lever.** Against the same seeded store:

```
node src/server/index.ts &
post() { curl -s -w " [%{http_code}]\n" -X POST -H 'content-type: application/json' localhost:8791/api/decisions -d "$1"; }
post '{"decision_id":"d_live_1","ad_id":"a_12","rationale":"budget was binding all evening","action":"set_budget","from_cents":9000,"to_cents":15000}'
post '{"decision_id":"d_live_2","ad_id":"a_12","rationale":"stale tab","action":"set_budget","from_cents":9000,"to_cents":99}'   # 409 stale_precondition
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"pause"}'
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"pause"}'    # 200 "replayed":true, same seq (U5)
post '{"decision_id":"d_live_3","ad_id":"a_12","rationale":"CPA blew out","action":"resume"}'   # 409 decision_id_reused
post '{"decision_id":"d_live_4","ad_id":"a_12","rationale":"x","action":"resume","ts":"2020-01-01T00:00:00.000Z"}'  # 400 ts_is_server_assigned
post '{"decision_id":"d_live_5","ad_id":"a_99","rationale":"x","action":"pause"}'               # 409 ad_unknown

curl -s localhost:8791/api/decisions            # the whole log, in fold order
curl -s "localhost:8791/api/decisions?ad_id=a_12"
sqlite3 -header -column "$DB_PATH" "SELECT generation_id,seq_in_ad,valid_from,valid_to,daily_budget_cents,status FROM config_generations WHERE ad_id='a_12' ORDER BY seq_in_ad;"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM config_generations a JOIN config_generations b ON a.ad_id=b.ad_id AND a.seq_in_ad+1=b.seq_in_ad WHERE a.valid_to <> b.valid_from;"   # 0: no gap, no overlap
```

**A refused lever consumes no `decision_seq` and writes nothing** — not a log row, not a
generation. Config derives from the log, so a decision that changed nothing would make the fold's
own history unreplayable.

**Click and spend, from B16.** Against the same running server:

```
T=$(node -e "console.log(new Date(Date.now()-90e3).toISOString())")
curl -s -X POST -H 'content-type: application/json' localhost:8791/api/ingest -d '[
 {"event_id":"e_i1","ts":"'$T'","ad_id":"a_12","event":"impression"},
 {"event_id":"e_c1","ts":"'$T'","ad_id":"a_12","event":"click","click_id":"c_001","cost_cents":62},
 {"event_id":"e_s1","ts":"'$T'","ad_id":"a_12","event":"spend","amount_cents":130}]'
# a SECOND click claiming c_001 with a NEW event_id -> rejected_invalid / click_id_already_claimed
# a REDELIVERY of e_c1 (same click_id)              -> duplicate_identical, NOT a reject
sqlite3 -header -column "$DB_PATH" "SELECT ad_id,minute_start,impressions,clicks,click_cost_cents,spend_cents FROM rollup_minute;"
sqlite3 -header -column "$DB_PATH" "SELECT strftime('%Y-%m-%dT%H:%M:00.000Z',ts_effective) m,
  SUM(kind='impression'), SUM(kind='click'), COALESCE(SUM(cost_cents),0), COALESCE(SUM(amount_cents),0)
  FROM signals GROUP BY m;"        # byte-identical to the rollup row above — P14 in miniature
```

**Attribution, from B17 — it has no HTTP surface.** Conversions do not enter `ingest()` until B18,
so `npm test`'s eight `attribute.test.ts` assertions are the verification. The one worth running by
hand is D53's payoff, because it is the thing that would have been silently wrong:

```
node --experimental-strip-types -e "
import { openDb } from './src/server/db.ts';
import { ingest } from './src/server/ingest.ts';
import { resolveAttribution, generationAt } from './src/server/attribute.ts';
const db = openDb();
const ts = new Date(Date.now() - 5*86400000).toISOString();
ingest(db, [{event_id:'e_bc', ts, ad_id:'a_12', event:'click', click_id:'c_back', cost_cents:62}], 'backfill', () => ts);
console.log('generation covering a click 5d ago:', generationAt(db, 'a_12', ts));
console.log(resolveAttribution(db, {event_id:'e_cv', ad_id:'a_12', ts_effective:new Date().toISOString(),
  attributed_click_id:'c_back'}, new Date().toISOString()));
db.close();"
#   -> g_a_12_002, and credited_minute is FIVE DAYS AGO — the conversion arrived today.
#      Under D53 option A that generation would have been null for the whole seeded week.
```

**The simulator's knobs** (B11, all env vars, all with defaults): `SIM_SEED` (`'flawless-loop'`),
`SIM_INGEST_URL` (defaults to `http://localhost:${PORT ?? 8787}/api/ingest`, so moving `PORT` moves
both processes). It emits **`a_12` only**, impressions only, at a **constant 0.2315/s**
(20,000/day, `SIMULATOR.md` §2.3) — ~14 a minute. **On boot it re-emits the last 60 s**, which is
what makes the restart check above work and why a fresh store is never empty.

**A pause DOES stop emission, since B31b** — the sentence that stood here said otherwise and named
the wrong chunk (`GET /api/sim/world` is B31a, not B29). Kept as a correction rather than deleted,
because a resume doc that once said the opposite is worth flagging: HR3 is real, measured, and the
top of this file is the current statement.

**In dev, `StrictMode` runs every effect twice**, so ONE browser tab produces two
`GET /api/snapshot` calls and `stream_subscribers: 2`. Harmless — absolute rows, identical frames —
but it reads as a bug if you are not expecting it.

**Driving the client without a browser.** `src/web/store.ts` and `src/web/stream.ts` are JSX-free,
and `node --experimental-eventsource --experimental-strip-types` gives a real `EventSource`, so the
shipped client modules can be exercised against the running server headlessly. That is how B10b was
verified; the harness only has to shim `EventSource` to absolutise the relative URL, because Node
has no page origin.

**Hand-verifying bucketing needs `ts` in the PAST.** A future `ts` is clamped to `received_at` by
I10, so future-dated test events all collapse into the current minute — correct behaviour, and it
cost one confused verification run at B06.

`data/` is gitignored. **Deleting it is the supported reset**; `npm run db:migrate` rebuilds from
empty. `node:sqlite` prints an `ExperimentalWarning` on every run — that is **deliberate** (**U9**).

## The build plan in one paragraph

Stage 0 (B01–B03, **done**) is the schema. **Stage 1 (B04–B11, done) is the walking skeleton and the whole
point of the ordering**: one simulated event, persisted, aggregated, transported over SSE, on screen,
surviving a refresh *and* a restart of both processes — impressions only, one hard-coded ad, before
any breadth. Stage 2 (B12–B24) is the full write path — fold, generations, all four signal kinds,
attribution, cohort placement, orphans, restatement — verified entirely by `curl` and `sqlite3`, and
it ends with the P14 agreement sweep so that everything after it is guarded. Stage 3 (B25–B35) is
the simulator against `SIMULATOR.md`'s measured tables, ending with the 7-day backfill and the `T0`
handover seam. Stage 4 (B36–B45) is the Signal surface, stage 5 (B46–B50) the decision loop plus the
horizon and scenario controls, stage 6 (B51–B56) the traceability surfaces and the Workbench
screen, stage 7 (B57–B62) packaging.

## What is ratified

Full entries with rationale, consequences and what each forecloses are in `docs/DECISIONS.md`; the
one-line-each version is `DECISIONS.md`'s own index table (`CHEATSHEET.md` was dropped, 2026-09-04).

- **D1–D14, T1, D26, F1, F2** — scope, model and storage.
- **D27–D34, D20, D22** — the Phase 2 design decisions and their residues.
- **D35–D40, D17, F3, D35p** — Phase 3: fatigue accrual · the lag mixture · the noise model ·
  backfill arrival semantics · volume calibration · simulator state and config sync · D17 closed ·
  scenario control as P17 · the two fatigue parameters (`served_fraction`, version reset `r`).
- **D3, D4, D15, D16, D18, D19, D21, D22, D23, D25** — the carried-over block.
- **D41–D43, F4 (2026-09-04, Phase 5 toolchain)** — single package + Vite client-only · `node:http`
  + hand-rolled router · `node:test` on the functions whose wrongness is invisible · D44/D45
  deferred, not open.
- **D46 (2026-09-04, at B08)** — window aggregation: the server computes **and signs** totals and
  ratios; **SSE keeps per-minute absolute rows unchanged**; the client may re-bucket to display
  granularity only under the **same server-issued descriptor**. Seno's own option, an amendment to
  the three offered. It also corrected a misreading of mine that is worth not repeating: **§10.2's
  "compare the client to itself" is about the rejected D30-A (the client aggregating RAW events)**,
  not a ban on all client arithmetic — what forbids an undescribed total is **§10.1**, because
  B52's `<Metric>` cannot render a value with no descriptor.
- **D47 (2026-09-04, at B10a)** — the resume contract: cursor is **`max(?cursor=N,
  Last-Event-ID)`**, replay is a store query with `LIMIT 2001`, and `resnapshot` fires past **2,000
  rows**, above the log's high-water mark, or on a non-numeric cursor. The threshold is on rows
  because seq distance mispredicts the cost by orders of magnitude in both directions.
- **D48–D50 (2026-09-04, at the B11 close — PROCESS, not design)** — the gate is the **group**, not
  the chunk: 3–5 related chunks per approval, never crossing a stage boundary, one report with a
  **per-chunk** verification block, still **one commit and one tick per chunk**; **B20, B24, B34,
  B35, B36, B37 stay single-gated**. §12's cut line is **held intact**, to be re-decided at the B36
  gate. **B61 becomes a running `docs/DEMO.md`** from the B36 group onward. **D48 amends
  `CLAUDE.md` §5** — read §5 as it now stands, not as remembered.
- **D51 (2026-09-04, at the G1 close)** — `create_ad`'s `created_at` is **derived from the
  decision's `ts`**, not client-supplied: §2.3's literal `Omit` would have put two timestamps on one
  event. The endpoint rejects `initial.created_at` outright rather than ignoring it. Consequence to
  remember at **B15**: the seeder cannot backdate an ad's creation except through the decision `ts`
  it writes.
- **D52–D53 (2026-09-04, at the G2 announcement — surfaced BEFORE any code, because both are
  written into the append-only decision log by B15).** **D52:** `daily_budget_cents` is hand-set
  per ad, grounded in an expected-spend derivation recorded above the fixture table, with **`a_08`
  and `a_12` deliberately near their cap** so §9's pacing is visible on frame one instead of only
  present in the code. **D53:** B15 **backdates** the seeded `create_ad` / `launch` decisions to
  `T0 − live_days`, fixing `T0` as the seeder's boot instant — under the alternative every
  backfilled click would sit before any generation and D14 would be `NULL` for the whole seeded
  window, discovered at B37 and costing a reseed. Wording of record: *"52 - B and 53 - B"*.
- **U1–U7**, and **U8–U9** (2026-09-04) — store path `data/loop.sqlite`; `ExperimentalWarning` left
  visible.
- **8 cheap defaults** — ratified as a block.

- **D58 (2026-09-04, at B32, before the first line)** — `ρ_pacing` reads realised spend, so it is
  the one λ factor that is not a pure function of `t`, and §14's restart identity cannot also hold.
  Chosen: make sub-second placement a pure function of `(tick, i)` so a count change can only
  append or omit at the tail, never rewrite an event already sent. Priced first: 1.66% of a
  catch-up's impressions would otherwise land `duplicate_conflicting`, 33× §13's injected 0.05%.
- **D59 (2026-09-04, at B32, after it ran)** — `ρ_catchup`'s ceiling 1.6 → **1.0**: pacing throttles
  and never boosts. §9's catch-up half assumes an ad is delivery-limited by pacing; §3's λ is
  exogenous with no auction-supply ceiling, so a boost manufactures impressions the model says do
  not exist. At 1.6 the whole portfolio ran **1.19–1.47×** §2.3's stated `Impr/day`.
  **`SIMULATOR.md` §9 and §21 are amended in place** with the measurement, as D56 amended §3.

- **D60–D62 (2026-09-04, at B34)** — the seed lives in `sim_run` and is served in the world poll,
  so the emitter cannot continue a seeded history under a seed that history was not generated with ·
  the 60 s catch-up window is ratified, because the re-emission IS the demonstration that derived
  ids make restart safety free · conversion becomes a per-click `Bernoulli(p_cvr)` keyed by
  `click_id`, which is what makes §15.3(b)'s *"derivable, not stored"* true as written. `SIMULATOR.md`
  §10, §14, §16 and §21 amended in place.

- **D65–D67 (2026-09-04, at the G11 announcement — before any code)** — the client **rolls** its
  window forward and the unwindowed stream feeds it, with the server's window kept visible as
  "anchored at" and snapping taken from `shared/time.ts` · window totals stay **server-computed** and
  are re-asked over **`?include=totals`**, carrying `as_of_ingest_seq` and the resolved window ·
  D20's bar is tested **per point**, a rung is admissible at **> 50% of non-empty points**, and the
  gated count, the chosen rung and the dropped ads are **always on screen**. All three were priced
  against measurements first: 24 MB per re-snapshot, 20 ms per totals `SUM`, and the fact that no
  ad's *mean* hourly conversions clear 10 anywhere in the seeded week.

**The three that most shape the build**, if you only reload three: **D27** (a conversion counts in
its *click's* minute — this is why CPA/ROAS lag and CTR does not), **D7** (nothing writes a
projection except the replay/apply function), **D30/D34** (the server owns all arithmetic; the raw
tail is structurally incapable of producing a number).

**The one that most shapes the mock data:** **D35** — fatigue accrues to the
`(component lineage × audience)` pair, so a video burned out on one audience arrives pre-fatigued in
a new ad on that audience, and fresh on a different one.

**D43 is sharper than its option text.** Seno ratified it as *"tests only where a wrong answer is
invisible; the agreement sweep is the real safety net."* The test surface is governed by that
**criterion**, not by the four-function list — a chunk proposing a fifth target must argue its
wrongness cannot be seen by hand or by the B24 sweep.

## What is open

**Nothing blocks any chunk from B12 to B35.**

| # | Question | Blocks | Status |
|---|---|---|---|
| **D44** | Chart rendering — library or hand-rolled SVG | **B37** | **DEFERRED** (F4). Recommendation on the table: uPlot behind a descriptor-bearing wrapper |
| **D45** | Styling approach | **B36** | **DEFERRED** (F4). Recommendation on the table: one plain stylesheet, semantic custom properties |

**Deferred is not open.** They are deliberately not being asked yet, because they are answered better
at B36 — with the data volumes and the settlement-state legibility problem concrete — than now. Two
obligations come with that, both of which bite silently if dropped, and both are written into
`BUILD_PLAN.md` §7 as a gate before B36:

1. **The chunk before B36 re-raises both.** A deferral nobody re-opens is a forgotten decision.
2. **Nothing between here and B36 may settle either by drift** — no chart or styling library
   installed, nothing hand-rolled that pre-empts the choice. A chunk needing styling before B36 uses
   unstyled HTML and says so.

**D57 is RATIFIED** (2026-09-04) and settled three things §12 left unstated: `E[m] = 1` via a
`−sd²/2` log drift, **Δ = 60 s** for the AR(1) grid, and the click rate drawn **once per minute** so
`κ = 200` stops being inert. Seno's deciding reason is in `DECISIONS.md` and is not the one that
raised it: D52's pacing baselines were set against `base_impr_per_day`, so a permanent +4.86% is
absorbed as `ρ` throttling on `a_08` and `a_12` — and `a_08` is the ad D56 had already cut from 53%
to 20% of hourly-CPA headroom.

**B11's two unratified assumptions are now ANSWERED** — **D60** put the world seed in the store
(`sim_run`, served in the world poll, so the emitter holds no seed of its own) and **D61** ratified
the 60 s catch-up window. The table below is kept for the record of what they were; **nothing in it
is open.**

| What | Current value | Needs sign-off before |
|---|---|---|
| The world **seed** — §14 fixes the *formula*, no document fixes a **value**, and it is the first term of `(seed + decision log + scenario log) → world` | `SIM_SEED ?? 'flawless-loop'`, a code constant | **B34**, where the seed path makes it load-bearing for reproducibility. The live alternative is a row in the store, so a forked run is recorded rather than remembered |
| The emitter's **boot catch-up window** — forced to exist by B11's own restart property and §16's *"it re-reads and resumes"*, but its **length** is written nowhere | `CATCHUP_S = 60`, one `rollup_minute` bucket (D28), **aligned down to a 60 s spend boundary at B27** | **B34**, where §15.3(b)'s `T0` seam makes the start `max(now − CATCHUP_S, T0)`, and **B31**, where `GET /api/sim/world` could carry a server-derived resume position and remove the duplicates entirely |


## Build progress

| | |
|---|---|
| **Current stage** | **NONE — PHASE 5 IS CLOSED.** All seven stages done. Stage 7 (packaging) landed as one batch, **G17**. |
| **Last completed chunk** | **B62**, closing stage 7 and phase 5 — **G17 = B57+B58+B59+B60+B61+B62**, six chunks in one batch (*"stage 7 in 1 batch"*), one past D48's cap and inside one stage. Five commits plus this one. **The stop clause did not fire.** Behind it: **B56**, closing stage 6 — **G16 = B51+B52+B53+B54+B55+B56**, six chunks in one batch at Seno's instruction (*"stage 6 in 1 batch"*), which is one past D48's five-chunk cap and inside the same stage. Six commits, per chunk. **The stop clause did not fire** — no decision was needed, nothing revealed the design wrong, nothing wanted a dependency (`node:crypto` is a built-in, named not asked). Behind it: **B50a** `64baeda`, **D69/D70** `9ecf8bd`, **B49+B50** `6f36400`. Older: **B45**, closing stage 4. Two batches: **G12b** = B44+B45 and **G12a** `912042d` = B41+B42+B43, behind **G11** `baf18c2` (B38a+B38+B39+B40) and **D65–D67** `96e727d`. |
| **Next gate** | **None.** (Historic row, kept for the record:) **Stage 5, B46–B50 — the decision loop.** B46 the action console, B47 the decision log surface, B48 generation/diff display, **B49 the horizon sweep (P16)** and **B50 the scenario controls (P17)**. **B49 and B50 are the two remaining single-gated chunks** per §13. **And the stage-4 → 5 seam owes D49's one named question, unanswered as of this line: *"do we reinstate `SCOPE.md` §4 cut #1, decision scoring?"*** — that is `SCOPE.md`'s list, not `BUILD_PLAN.md` §12's, and they number differently. |
| **Stage 4's gates** | ~~**B36**~~ · ~~**B37**~~ (both single-gated) · ~~**G11** B38a+B38+B39+B40~~ · ~~**G12a** B41+B42+B43~~ · ~~**G12b** B44+B45~~ — **all closed. Stage 4 is done.** |
| **G12, for the record** | Seno widened the gate again mid-stage: *"carry on through the end of stage 4, B41 → B45, in one or two batches rather than gates of 3–5 … announce the batch in a line, build it, report once."* Run as 3 + 2, which is still inside D48's five-chunk cap, so nothing needed amending. **Neither batch stopped mid-build** — the first time since G7 that a group has not hit the stop clause. |
| **G11, for the record** | It **stopped before the first line** under D48's clause, for the third distinct trigger: not a decision arising mid-build, but three decisions the announcement itself surfaced — and one of them (**D65**) came out of *measuring a claim about the app before writing it down*, which found that the read side was live for at most one minute. The stop clause has now fired seven times. |
| **Stage 3's gates** | ~~**G7** B25+B26+B27~~ · ~~**G8** B28+B29+B30~~ · ~~**B31a**~~ · ~~**B31b**~~ · ~~**G9** B32+B33~~ · ~~**B34**~~ — closed. **Only B35 remains in stage 3.** |
| **G9, for the record** | B32+B33. **It stopped mid-build TWICE under D48** — once before the first line for **D58**, once after B32 built and ran for **D59**. That is the stop clause firing on its two distinct triggers: a decision (§3) and *"the chunk reveals the design was wrong"*. Both were caught by measuring rather than trusting: D58 by pricing the divergence before writing the code, D59 by comparing delivered volume against §2.3's own column. |
| **G7, for the record** | B25+B26+B27, *"the rate equation becomes real"*. It **stopped mid-build at B26** under D48, because B27 could not write `p_ctr` until **D56** was answered; re-announced and finished after the answer. **That is D48's stop clause working as designed** — the first time it fired. |
| **Stage 2's six gates** | ~~**G1** B12–B14~~ · ~~**G2** B15–B17~~ · ~~**G3** B18+B19~~ · ~~**G4** B20~~ · ~~**G5** B20a+B21–B23~~ · ~~**G6** B24~~ — **all six closed.** |
| **Chunks ticked** | **69 / 69** (B01–B09, B10a, B10b, B11–B20, B20a, B21–B30, B31a, B31b, B32–B35, B35a, B36–B38, B38a, B39–B50, B50a, B51–B56, **B57–B62**) |
| **Stage 6's gate** | ~~**G16** B51+B52+B53+B54+B55+B56~~ — closed. |
| **Stage 7's gate** | ~~**G17** B57+B58+B59+B60+B61+B62~~ — closed. **B61 is the chunk that finally put the app in a browser**, driven through Chrome over CDP against a scratch copy; it produced four corrections and they are marked ⚑ in `DEMO.md`. |
| **Remaining** | **Nothing.** 69 of 69 chunks ticked. |
| **In flight** | nothing |
| **Chunks ticked (older line, superseded)** | **51 / 68** (B01–B09, B10a, B10b, B11–B20, B20a, B21–B30, B31a, B31b, B32–B35, B35a, B36–B38, **B38a**, B39–B45) — 68 because **B20a**, **B31a/b**, **B35a** and now **B38a** were added and **B10 was split into B10a/B10b** |
| **Cut line status** | nothing cut |
| **Plan edits, cont.** | **B38a added** (2026-09-04, at the G11 announcement): **D65** was ratified before any code and no numbered chunk owned the rolling viewport it created; folding it into B38 would have put two concerns in one chunk. Lettered, not renumbered — `B39`–`B62` are cited by id across four documents. |
| **Plan edits, cont.** | **B31 split into B31a/B31b** (2026-09-04, Seno's call): B31 was ~240 diff lines across four files, and B09 at ~230 is what prompted the B10 split. Its verify column already named two separable checks. B31a is the shared account-local clock + `GET /api/sim/world`; B31b is the poll and emission gating. **65 chunks now.** |
| **Plan edits made during Phase 5** | **B16 split** (2026-09-04, Seno's call): B16 was to widen `SUPPORTED` to all three remaining kinds while B18 extended `apply()` — so B16 would have shipped a server that 500s on its own verify step. B16 now takes **click + spend, ingest *and* `apply()`**; **conversion ingest moved to B18**, with placement, because `ingest()` calls `apply()` for every accepted signal and a no-op branch would be the exact divergence `default: throw` prevents. **B17's `curl` verification is therefore B18's**; B17 is exercised on a fixture. |
| **Plan edits, cont.** | **B10 split into B10a/B10b** (2026-09-04, Seno's call, after B09): B10a is the **server-side** resume (`Last-Event-ID`, store replay, `resnapshot`), B10b the **client** (subscribe, merge, reconnect). B09 ran ~230 diff lines against the ~150 target and B10 whole would have been worse. |
| **Plan edits, cont.** | **B20a added** (2026-09-04, Seno's call, after B07): `src/shared/time.ts` — one implementation of the timestamp invariant (`isCanonicalIso` / `toCanonicalIso` / `floorMinute`), inserted immediately **before B21** because B21's horizon sweep would otherwise be the *fourth* copy of that rule (ingest's round-trip B05, `apply()`'s regex B06, snapshot's inline snap B07). Lettered, not renumbered: `B21`–`B62` are cited by id across four documents. |

**The convention, as amended by D48.** A **group** is done when: it is announced, built, reported
**once with a per-chunk verification block**, and Seno says ok. Then commit **per chunk**, tick each
box in `docs/BUILD_PLAN.md`, update this table, and **stop and take the next instruction**. Never
chain two **groups** on one approval, and never widen a group past 5 chunks or across a stage
boundary. **B20, B24, B34, B35, B36, B37 are single-gated.** A group **stops mid-build** if a chunk
needs a decision (§3), reveals the design is wrong, or wants a new dependency.

**What did NOT change, and it is the reason the trade is only latency:** chunk size (~150 lines, one
concern), per-chunk commits, and **per-chunk verification**. Seno independently re-runs the
verification — that is what caught the B07 window bounds and the B10a cursor coercion, both silent —
so a group report must make every chunk's steps separately reproducible, ideally as one
copy-pasteable block. Reversible at any time: **"solo from here"** restores the per-chunk gate.

## Traps that will not fail loudly

`BUILD_PLAN.md` §14 is authoritative; carried here so a cold resume sees them without opening the
plan. **Each produces wrong or slow output with no error.** Sixty-seven now — the Phase 5 ones were
found against the real store and are in no design document.

**The newest (G15 — B50a):**

- **The lateness bias runs in ONE direction, which is the worst shape a wrong number can have.** The
  before-window has had longer to accumulate late conversions than the after-window, so an unguarded
  before/after comparison makes **every** decision look worse than it was. Nothing errors and every
  figure is plausible. This is what the withholding rule exists for, and removing it as a
  "simplification" reintroduces it invisibly.
- **The settled test must use the after-window's END, not `decision.ts`.** Testing the decision's own
  timestamp calls a score ready **six hours early**, with the after-window still filling — so the
  score is computed over half its own evidence and reads perfectly normally.
- **`improved` is per metric: CPA improves when it FALLS, CTR when it rises.** Reading
  `delta_pct > 0` as "improved" flips the verdict on every CPA-scored decision, and the row still
  renders an ordinary sentence.
- **A contamination flag that fires on everything is a flag nobody reads.** Including `create_ad` in
  the contaminating set marked **24 of 24** seeded entries contaminated, because the seed creates
  and launches each ad a minute apart. It is excluded — and that is not conservatism, it is
  correctness: a `create_ad` leaves the ad in `draft` and §3 gives a draft ad λ = 0, so it *cannot*
  have moved a count in anyone's window.
- **"Structurally empty" and "too little evidence" are different statements.** A `launch`'s
  before-window is empty because the ad was `draft`, not because it under-delivered; reporting the
  first as the second invites a reader to diagnose a delivery problem that does not exist.
- **A score must not be stored.** It is a function of (the decision log, the rollups, the horizon,
  the read clock) and three of those four move — a `score` column would be a projection that changes
  with no event, which is what `settlement.ts` refuses for the same reason (D7, D54).

**The newest (G14 — B49, B50):**

- **`tsc` clean is not "the client builds."** `Horizon.tsx` imported `HORIZON_CHOICES_H` as a VALUE
  from `sweep.ts`, which imports `db.ts`, which imports `node:sqlite`, `node:fs` and `node:path`.
  TypeScript has nothing to say about a runtime import crossing that boundary; it failed only at
  `vite build`, as `"resolve" is not exported by "__vite-browser-external"`. **Run the bundle, not
  only the typechecker**, whenever a client file imports from `src/server/`. The constant now lives
  in `shared/`, and `settlement.ts` is deliberately kept free of store imports so `bucketState` can
  run in the browser.
- **A persisted lateness horizon would break `/api/verify` on a correct store.** `restated_at` is
  stamped at ingest against the horizon in force *then*; the rebuild replays against the horizon in
  force *now*. Change it in between and verify reports divergence with nothing wrong. This is why
  the horizon is a read parameter — it is forced, not preferred, and the tempting "make it a
  setting" refactor reintroduces it silently.
- **The sweep must not write `restated_at`.** "Mark what moved" reads like an instruction to stamp
  the column. It is `apply()`'s (D7), and a swept value would be both wrong at the account horizon
  and undoable only by a rebuild.
- **The SSE flush tick cannot stamp settlement per subscriber** — one read serves N tabs (§11) — so
  streamed rows carry the ACCOUNT horizon while snapshot rows carry the swept one. The client
  re-derives with the same `bucketState`; a second copy of the rule in the browser is the silent
  version of this, and so is leaving the two mixed in one store.
- **A sweep sample ordered newest-first shows none of the interesting rows.** Measured: 72 h → 2 h
  flips 40,889 buckets of which 172 are restated, and a single capped list contained **zero** of
  them — the caption said "172 had already moved" above six examples that had not. Restated rows
  fill the sample first.
- **`late_cascade` must NOT draw from `pendingHandover()`.** That list is the boot-time handover
  after D62's Bernoulli has discarded every click that will never convert: **77 held against 15,082
  the server reports pending**. Asking for 10 and getting 1 was the measured result, and it makes
  the flagship trigger look broken while every number stays correct. A cascade re-asks for the full
  set — a ~2 MiB fetch that B35a rightly took off the 1 Hz path, and this is not on it.
- **A cascade must cite a REAL click.** An invented `attributed_click_id` produces an orphan that
  parks at its own minute and restates nothing — the flagship path replaced by the orphan path
  wearing its clothes, with a plausible-looking screen.
- **`traffic_burst` scales the Poisson MEAN, never the drawn event list.** Duplicating the list
  mints the same `event_id` twice, so it lands as `duplicate_identical` and demonstrates the dedupe
  path instead of the ingest backpressure §17 asks a reviewer to watch.
- **`duplicate_storm` must replay what was POSTed, not what was generated.** A replay of events the
  store never saw lands as a first delivery and the dedupe counters do not move.
- **Marking a scenario consumed inside `readTx` takes a write lock on the 1 Hz path.** `readTx` is
  `BEGIN DEFERRED` and upgrades on the first UPDATE — on the connection ingest is using. The stall
  would read as backpressure rather than as a lock. The mark happens after the transaction.
- **A `stall` must not buffer.** Queuing the suppressed seconds delivers a burst on release, which
  demonstrates backpressure rather than a gap. `nextTick` is advanced and the seconds are simply
  not emitted — §6's "degrades: detected, not repaired".

**The newest (G13 — B46, B47, B48):**

- **A test fixture that agrees with the code and disagrees with the STORE passes, and proves
  nothing.** `components.test.ts` first asserted the only two kinds are `video` and `headline` —
  true of the fixture, false of the store, which holds **sixteen components across four kinds**
  (`body_copy`, `headline`, `image`, `video`). The code was right; the claim was wrong, and it would
  have kept passing while the swap picker silently emptied. Found by curling the real endpoint.
- **A generation boundary's `prev` must be found by `seq_in_ad - 1`, not by array position** — the
  rows are ordered by `(ad_id, seq_in_ad)`, so position works until an ad's chain does not start at
  1, and then `a_02`'s first change is labelled with `a_01`'s config. A sentence either way.
- **Generation 1 is not a boundary** (it is `create_ad`, so a rule there claims a step in a series
  with no points to its left), and **the boundary window is half-open on `valid_from`** or the same
  change is drawn at the right edge of one view and the left edge of the next.
- **A console that mirrors `fold.ts`'s transition table has put the rule in two places** and the
  copy is the one that goes stale. All four levers submit; the 409 is the answer; the hint disables
  nothing.
- **Retrying a `stale_precondition` is the one "helpful" fix that defeats I13** — the 409 carries
  the current value, so a re-send would succeed while asserting an intent nobody expressed.
- **The idempotency key is held across a NETWORK failure and released after any server answer.**
  Regenerating on a timeout folds twice if the first POST landed; reusing after a 409 sends the
  next, different decision under a spent key.
- **A lever must not patch client state from the POST's response** — it changes `ads`,
  `config_generations` and the log at once, so re-run §3.1 from step 1, the path a refresh takes.

**The newest (G12 — B41–B45):**

- **A maturity curve measured over ALL resolved conversions is biased short, flatteringly** —
  recent cohorts have given their fast conversions and not their slow ones. Settled cohorts only;
  measured, 0.30 against 0.67 at the same evaluation point on a fixture.
- **The maturity lag is `received_at − click.ts`.** From the conversion's own `ts` it reads zero on
  events that arrive at their own `ts`, and the curve claims completeness instantly.
- **A restatement's `before` is derived, and subtracting every credited conversion instead of only
  the LATE ones reports 1 → 2 as 0 → 2.** Both render an ordinary sentence. An entry whose arrivals
  do not account for `restatement_count` says **UNEXPLAINED** rather than guessing.
- **`Display`'s brand carries MINTING, not summing.** Summing fails to typecheck because the value
  is a string at all; unbrand the type and that still fails. What the brand stops is fabricating a
  tail value from a plain string. Two `@ts-expect-error` lines, and only the second one detects the
  brand's removal — verified by removing it.
- **The tail must be built from the POSTED BODY, not the store**, or a rejected delivery is
  invisible and §13's injected-fault channel has no surface.
- **A frame cap without a spill is data loss.** Take at most 400 keys and put the rest BACK before
  clearing the dirty set. Measured: 500 buckets arrive as 400 + 100, all distinct.
- **The fatigue peak must be the pair's LIFE, not the trailing window**, or the current value is one
  of the candidates for the peak it is compared against and nothing is ever flagged. And gating on
  every point instead of D20's bar lets a quiet night set the peak.
- **"No reading" is not "healthy."** Fewer than three gate-clearing points means no verdict, and
  §19's third limit is that the ads most likely to be burned are the ones we flag slowest.
- **A SQL alias that disagrees with its TypeScript type is invisible** (found at B45): `audience_id
  AS audience` against a type declaring `audience_id` arrived `undefined` with a clean typecheck.
  Same family as the `sendJson` entry.

**The newest (G11 — B38a, B38, B39, B40):**

- **"Empty" is not "the bar's own count is zero", and the difference decides the rung.** This was
  wrong in the first version of `gate.ts`'s `tally()` and a test caught it: read the wrong way, a
  sparse conversion series clears **trivially at the minute rung** — six clearing points out of 360,
  100% clearing — and the chart is drawn at the minute with 98% of its points absent, which is the
  chart-of-holes outcome **D67** rejected option C for. A point is EMPTY only when *every* count in
  it is zero; a minute with 4,000 impressions and no conversions is a **gated** point.
- **`CLEARING_SHARE = 0.5` looks like a tidy-up and is not.** Every point → CPA undrawable on any
  window with a quiet hour; any point → 5-minute CTR for `a_01` where §18.3 says 15 minutes. Both
  draw a completely normal chart.
- **The client's window is no longer the server's**, and the `anchored at …` label is the mitigation
  rather than a decoration. Delete it and the screen can no longer say how far the frame has walked
  from the read that anchored it. The roll snaps with `shared/time.ts` — a fifth `floorMinute` is
  what B20a collapsed four copies to prevent.
- **A smoothed point cannot be reconciled against raw events.** EWMA is off by default and the
  caption warns while it is on, because B53 asserts against the raw series. Making smoothing the
  default is the silent version of this.
- **Ratios are `null`, never 0, when the denominator is empty.** `0/0` shown as `0.00%` claims an
  unserved ad has a zero click-through rate, and *too little evidence* is a different message from
  *no evidence*.

**The newest (B35a):**

- **`pending_backfill_clicks` is `[] | null` and the two must never be collapsed.** `null` = not
  requested, `[]` = requested and none pending. Reading the first as the second emits no handed-over
  conversions at all, with no error and every number still plausible. A `?? []` removes the guard.
- **The held handover is keyed by the world's SEED**, or a store seeded under a running emitter
  leaves it draining a list from a world that no longer exists.
- **Never-converting clicks are dropped on first sight**, which is what makes the drain ~150 rows a
  tick instead of ~7,000. Losing that costs 50× per tick and nothing says so.

**The newest (B35), all three about the `T0` seam:**

- **The conversion draw must be taken at the TICK's instant (`tick * 1000`), not the click's `ts`.**
  The backfill generator passes `atMs`; the live emitter must pass the same. Otherwise a different
  set of clicks converts on either side of `T0` — every number plausible, nothing errors.
- **The seam decodes the tick and click index out of the click's `ts`**, which is only correct while
  `spreadMs` stays `tick * 1000 + min(i, 999)`. Move the sub-second placement (D58 moved it once)
  and every handed-over conversion silently mints a DIFFERENT `event_id`.
- **§1's "a paused ad's arrival count reads zero" self-check is PER KIND, not per ad** (D63) — a
  paused ad still receives conversions from clicks it earned while live, and a per-ad check reports
  a false failure on exactly the pause demo.

**The newest (B34), and the first was a live defect — FIXED at B34a, kept here as the hazard:**

- **Attribution must read a log PREFIX, not the whole table.** `verify.ts` replays
  `FROM main.signals ORDER BY ingest_seq`, but `apply()` called `resolveAttribution(db, …)` which
  read the **whole** `signals` table with no prefix bound — so every conversion in the rebuild
  resolved against clicks that had not yet arrived, the rebuild **could not produce an orphan at
  all**, and `/api/verify` said 409 on a correct store. Latent in B22 since it shipped; unobservable
  until a store held an orphan, which is B34. **B34a bounds it**: `as_of_ingest_seq` is REQUIRED and
  has no default, and inside `promoteOrphans()` it is the promoting CLICK's seq. What stays
  dangerous is giving it a default, or handing down the parked conversion's seq — either restores
  the defect, and the tempting wrong fix is then to drop `resolved_at` from the diff. Two tests fail
  if it comes back.
- **The out-of-order check must use a window function, not a self-join.** The B33 form
  (`JOIN signals a, signals b ON a.ingest_seq < b.ingest_seq AND a.ts > b.ts`) is quadratic — fine
  on 2,700 rows, never returns on 1.58M. Use `LAG(received_at) OVER (ORDER BY ingest_seq)`.
- **The backfill's state must run FORWARD.** φ from accumulated `F`, ν from first exposure inside
  the run, ρ from spend so far that account-local day. Freeze any one and the seed writes seven days
  of history with no history in it — every number plausible and §7.2's table meaningless.

**The three before those (B32/B33), all found by measuring rather than trusting:**

- **`ρ_pacing` is the one λ factor that is not a pure function of `t`.** D58 keeps the consequence
  to append-or-omit; **anything that reintroduces a count-dependent field into an event body reopens
  it**, silently, as a fabricated `duplicate_conflicting`.
- **A derived `spend` delta must be ACCUMULATED, not re-derived, once ρ is live.** Re-deriving the
  interval's 60 ticks at the boundary uses the current ρ for ticks emitted under a different one —
  6.3% of spend events off by a cent — and bills a full minute of CPM for an ad paused most of it,
  because `impressionsForTick` does not know about status. Neither errors.
- **A pacing term that reads realised spend can pin against its own clamp and nothing says so.**
  The D59 finding: every individual number was right and the aggregate was wrong by up to 47%. Only
  the comparison against §2.3's own stated column caught it, and the dry run now prints that column
  on every run. **§13's two orphan rates are per CLICK, not per event** — measured against all
  events they read ~20× low and look like a slip in the wrong direction.

**The two before those (B31b):** grouping `F` by lineage alone loses the version and silently contradicts
§8's fresh novelty window — `a_05`'s recut would inherit `a_01`'s first exposure, which is the claim
B28 exists to demonstrate, failing with no error. And making φ/ν live puts a **bounded** limit on
re-emission identity (~1e-4 of one click per catch-up; a click's BODY cannot diverge, and impressions
are exactly identical because D56 kept φ out of λ) — know the bound before "fixing" it.

**Before those (B30), both about §12's AR(1) factors:**

- **A stateful AR(1) would break re-emission and nothing would say so.** `m` multiplies λ, λ decides
  a tick's impression count, and `event_id` is derived from tick and index — so a running `m`
  re-derives differently after a restart and turns every re-emitted second into
  `duplicate_conflicting` instead of `duplicate_identical`. `m` must stay a pure function of `t`;
  `noise.ts` unrolls the recursion into an innovation sum for exactly this reason.
- **The naive sample ACF understates by 20% here, so a correct process reads as broken.**
  Subtracting a SAMPLE mean gave 0.287 at lag τ against a true 0.368 — four standard errors out —
  because at `τ/Δ` of 20–45 a few-hundred-step window holds only ~12–25 effective observations.
  `log m` has a true mean of **exactly 0**, so no mean may be subtracted. The dry run now prints the
  **closed-form** ACF of the truncated sum as the primary check, so sampling noise can never be
  mistaken for a defect again.

**The two newest (B27), both found by reading the store rather than the code:**

- **A derived `spend` delta must cover an interval the emitter EMITTED, not merely one it can
  re-derive.** Needs BOTH boot alignment to a 60 s boundary AND the `tick − 60 >= FIRST_TICK`
  guard; with only the first, the first tick generated is itself a boundary and closes the interval
  entirely before boot — a bucket with a `spend` row and **zero** `impression` rows. Nothing errors;
  HR5 just stops being true for one minute of every run, in the money column.
- **`BetaBinomial`'s κ = 200 does nothing at a 1-second tick.** Overdispersion enters through
  `(N − 1)/(κ + 1)`, exactly zero at `N = 1`, and per-tick `N` is 0–3. §10 is implemented as
  written and κ is transcribed correctly — the parameter simply has no effect, so §12's *"the rate
  is uncertain, not just the count"* is undelivered. **B30 owns it**; the risk is that B30 reads κ
  as done and never tests the dispersion.

- **Nothing writes a projection except `apply()`** (D7). `ads`, `config_generations`,
  `conversion_attribution`, `rollup_minute`. A chunk that writes one directly breaks the single
  property the design exists to demonstrate and **will not show up as a test failure**.
  `sim_scenarios` is **not** a projection and is the one table in `002_projections.sql` that
  `apply()` does not own.
- **The `click_id` collision test must sit AFTER the `event_id` dedupe** (found at B16). §13
  injects a 0.05% dual-click-id fault, caught in `ingest()` because `ux_signals_click_id` would
  otherwise refuse the insert and take the whole batch down with it. But a redelivery of ONE click
  carries its own `click_id` too: tested first, every honest retry reads as that fault, B11's
  measured 14 `duplicate_identical` / 0 conflicting becomes 14 rejects, and §13's 0.05% rate
  measures near 100%. A collision is only a collision **between two different `event_id`s**.
- **Every projection id must be a FUNCTION of data the rebuild also has** (found at B13).
  `config_generations.generation_id` is `g_${ad_id}_${seq_in_ad}` padded to three digits. A
  `randomUUID()` there typechecks, reads as normal practice and passes every hand check — and then
  **B22's rebuild produces the same generations with different ids, so B24's row-by-row diff reports
  total divergence on a correct store**, whose tempting fix is to drop the id from the diff. Note
  `DESIGN.md` §10.4 writes it `g_a12_004` in prose; the code keeps `ad_id` verbatim (`g_a_12_004`)
  because stripping the underscore can collide.
- **A client that re-buckets must aggregate at the descriptor's own `granularity_s` and forward the
  descriptor byte-for-byte** (D46, bites at B38/B51/B52/B53). Re-bucketing to a granularity the
  descriptor does not name makes the drill-down replay a *different question* — and it can **pass by
  coincidence**. The HMAC catches a client-minted descriptor; nothing catches this. **B53's
  drill-down is the check that makes D46 safe**, so it is not optional.
- **`sendJson(body: unknown)` hides every response shape from `tsc`** (found at B09). Changing
  `ingest()`'s return to `{ result, dirty }` typechecked clean while silently changing the emitter's
  response body. The mechanism, not just the rule: **annotate at the call site** —
  `const responseBody: IngestResult = result;`.
- **An SSE subscriber makes `server.close()` hang** unless connections are closed first (found at
  B09; regresses B04's verified shutdown). Measured: close callback had not fired after 1000 ms;
  with `stream.shutdown()` first, 14 ms (23 ms with four subscribers). Presents as "Ctrl-C hangs
  sometimes", only with a tab open.
- **The SSE resume is a store query, never a replay of buffered frames** (Seno's constraint at B09,
  built in **B10a**). `max_ingest_seq > cursor`, a full scan — fine once per connect, impossible
  per tick. The flush drops its dirty set when nobody is subscribed, and **§3.1 step 3** is what
  makes that safe, *not* the snapshot: the snapshot precedes the subscribe, so it cannot cover the
  gap. Built from memory instead, the bucket it loses is a **late conversion restating an old minute
  that never moves again** — wrong on screen, forever, no error.
- **`max_ingest_seq` is the resume contract** (B10a). A projection write that changes a bucket
  without raising it is invisible to every resuming client — **B18's restatement touching only
  `restated_at`** is the concrete case — and **B24's sweep will not catch it** because the counts
  are right. Every future `apply()` path must raise it.
- **Validate a cursor's INPUT, not the parsed result** (B10a, found by Seno). `Number('1e3')` is
  1000, so `?cursor=1e3` replayed as `?cursor=1000` and silently skipped 1,000 buckets;
  `Number.isInteger` inspects the output and passes `0x3`, `+2`, `2.0`, `' '`. And a **present-but-
  empty** cursor read as *absent* → go live with no replay, which is the exact gap B10a exists to
  close. `/^\d+$/` on the raw string; absent is the only path to "go live".
- **The emitter's tick index must be an ABSOLUTE unix second, never a counter since boot** (B11).
  Derived ids are what let the simulator hold no durable state (§14, DESIGN §3.3) — but the **body**
  has to be derivable too. A per-process counter re-derives the same `event_id` on restart with a
  **different `ts`**, and a matching id with a differing body is `duplicate_conflicting`, which
  §5.1 step 4 surfaces as a **platform correction** — a fabricated misbehaviour on the one channel
  we keep precisely because it is rare. Measured with the absolute form: 14 `duplicate_identical`,
  **0 conflicting**. Same family: **a failed ingest POST must be held and retried, never
  swallowed** — a dropped batch is indistinguishable from the 0.2% emitter-side loss §13 injects on
  purpose, which is the one failure the app cannot see (DESIGN §6).
- **B24's agreement sweep must be a single whole-log pass**, not `replay()` called per bucket. The
  obvious implementation is O(buckets × N): 4 seconds becomes hours.
- **Settlement is evaluated at the arriving event's `received_at`, never at wall-clock `now`**
  (D38, correcting `DESIGN.md` §5.4). The wall-clock form stamps `restated_at` on tens of thousands
  of backfilled events and P7 looks broken on frame one.
- **Ingest never rejects on ad status** (I11). A conversion attributed to a pre-pause click arrives
  after the pause and is the event we care most about.
- **Ratios are never stored** (D10). Rollups carry additive counts only.
- **Replay must pass each event's own `received_at` as `apply()`'s `applied_at`** (added at B06,
  bites at B22/B23). A rebuild clock writes a different `first_written_at` into every bucket and
  `/api/verify` reports total divergence on a correct store — whose tempting fix is to drop the
  column from the diff.
- **Migrations are append-only from B06 on.** `migrate()` has no content hash, so editing an applied
  file does not re-run and is not detected: a fresh store and an existing one diverge silently.
- **`STRICT` does not type-check the way the name suggests** (found at B02). Binding the JS number
  `12` into `signals.ad_id` (`TEXT`) is *accepted* and stored as **`'12.0'`** — STRICT converts
  across affinity where lossless, and `node:sqlite` binds a JS number as REAL. **B05's U6 validation
  must check JavaScript types itself and must not lean on `STRICT`.**
- **`MIN(ts, received_at)` is a lexicographic TEXT compare** (found at B05). Mixed ISO precision
  inverts I10's clamp silently: `MIN('…09:00:00.500Z','…09:00:00Z')` returns the **later** instant.
  **Ingest rejects any `ts` that is not exactly `new Date(ts).toISOString()`** — same-shape strings
  make byte order chronological order, and `ts` stays unaltered.
- **A window bound must be canonical ISO, carry an explicit offset, AND be minute-aligned** (found
  at B07, the read-side half of the bullet above). Three silent failures, all measured: no offset →
  JS parses it as **local** time (`…T12:00:00` became `08:00:00.000Z` on this UTC+4 machine, zero
  buckets, a different answer on another laptop); unsnapped canonical → `'…12:00:00Z' >
  '…12:00:00.000Z'` skips the minute it names (1 of 3 buckets returned); a bound *inside* a minute →
  the same event is **over-counted at `to`** and **under-counted at `from`**. Snapshot snaps `from`
  down and `to` up and echoes the resolved window. **B53's drill-down asserts raw == buckets over
  `[from, to)`**, so unaligned it reports FAIL for a reason that is not corruption. The read side
  canonicalises where the write side rejects — a bound is a query, `signals.ts` is a fact.
- **`npm run agree` does not read `ads`, `config_generations` or `conversion_attribution` at all**
  (B24, found by Seno). It re-derives attribution from raw and diffs only `rollup_minute`'s counts,
  so a corrupted `credited_generation_id` (D14) or `credited_ad_id` (I8/G30) **sweeps clean**.
  `/api/verify` catches both — measured, `live a_99, rebuilt a_12`, 5 ms. The gap is covered; the
  danger is the sentence *"every stored bucket agrees with the raw event log"* being read as a
  guarantee about attribution. **The banner states its own limits on every run, and must keep to.**
- **The sweep cannot see an INVENTED all-zero bucket, and that is accepted** (B24). A promotion
  decrements a provisional bucket to all zeros and the row stays, so an absent recomputed bucket is
  compared against zero rather than reported missing. It is the price of the promotion leftover and
  cannot be distinguished from one without replaying arrival order. `/api/verify` catches it.
- **No projection SQL may be SCHEMA-QUALIFIED** (D55, B22). `/api/verify` rebuilds through the real
  `apply()` into `TEMP` tables that shadow the projection names, which works only because every
  projection write is unqualified. **One `main.rollup_minute` turns the verifier into a corrupter**
  — it typechecks and passes every other test. **Guarded:** `verify.test.ts` greps every `.ts` under
  `src/` and fails the build. `verify.ts` is the sole exemption, by name.
- **The shadow set is ALL-OR-NOTHING** (D55, B22). Shadow three projections and the fourth is
  rebuilt into the live store, silently repairing what it was asked to check.
- **A `TEMP` shadow that outlives a verify redirects every later unqualified read** in the process
  to an empty table. Dropped in a `finally` *and* before the verify starts, so a previous crash
  cannot poison the connection. Presents as "the app suddenly shows zeros".
- **One event can write the same bucket more than once, and `restatement_count` must bump ONCE PER
  BUCKET** (found at B20). A click whose promoted conversion lands in the click's own minute touches
  that bucket twice; two conversions promoted by one click land in the same minute. Per-write, the
  counter is wrong by one and **every count is still right**, so B24's sweep agrees with it.
  `apply()` coalesces deltas by bucket. Same coalescing, second silent case: **a bucket the event
  itself materialises is not a restatement** — it was absent, not settled — so the restatement
  clause lives only in `ON CONFLICT DO UPDATE`.
- **`conversions` and `provisional_conversions` must never be summed** (found at B19; bites at
  **B38**). Side by side in the same row, both counting conversions — so adding them is the natural
  thing to write, and it puts unattributed revenue into ROAS and CPA. They are disjoint by
  construction so the settled and provisional figures can be shown apart. Every number stays
  plausible and B24's sweep agrees with itself.
- **There is no stored `orphan_expired` to filter on** (D54, B19). Expiry is derived at read, so
  `WHERE state = 'orphan_provisional'` means *"unresolved, including the ones we gave up on"* — a
  health count written that way reports zero expired orphans forever, and it also full-scans (the
  row below). `state <> 'resolved'` in SQL, then `attributionStateAt(row, at)` in JS.
- **A partial index is only used if the query spells its predicate literally** (found at B03).
  `WHERE state = 'orphan_provisional'` and `WHERE state IN (...)` both **full-scan**
  `conversion_attribution`; only `WHERE state <> 'resolved'` reaches `ix_attr_unresolved`. **Every
  orphan query carries `state <> 'resolved'` as a term.**

## What Phase 3 changed in `DESIGN.md`

Recorded here because `DESIGN.md` was approved before these landed. Full list: `SIMULATOR.md` §22.

- **One correction.** §5.4: settlement is evaluated at the arriving event's `received_at`, **not** at
  wall-clock `now`.
- **Two schema additions.** `signals.source` (`'backfill'`/`'live'`, server-assigned — E15 / D38) and
  the `sim_scenarios` table (D40 — simulator input, not a projection and not a signal). **Both are
  built and in the store as of B02/B03.**
- **Two endpoints.** `GET /api/sim/world` (1 Hz poll: config, fatigue state, spend-so-far, pending
  scenarios) and `POST /api/sim/scenario`.
- **One stated limit, in §10.3.** Within the seeded window `received_at` is designed rather than
  observed, so `as_of` reconstructs what the screen *would* have shown under the seeded arrival
  model. Live arrivals carry no such caveat; the `source` column distinguishes them.

## What is owed

<a id="what-is-owed"></a>

**Everything stage 7 was carrying is closed.** Kept below with the entries struck through, because a
list that only shows what remains loses the record of what was owed and when it was paid.

**CLOSED BY STAGE 7 (`G17`):**

- ~~The README does not exist~~ — **B58/B59/B60.** Design notes, `SCOPE.md` §2–§4 verbatim (checked
  byte-for-byte by `src/shared/docs.test.ts`, which trips on one changed word), the misbehaviour
  table verbatim, **28 named limits in four groups**, the E1–E15 / I1–I20 register assembled from
  `BRIEF_GAPS.md`, the life of one event with real ids, the component-performance query with its
  real output, copy-on-write with its honest scope note, and four ways to check the numbers.
- ~~Every named limit the build owed the README~~ — **B59.** D69's at-most-once triggers · B51's
  per-process descriptor key · B53's 400/200 caps with the re-sum over everything · the drill-down's
  real cost · D71's sixteen-minute floor · B35's in-flight conversion · B05's `payload_json`
  re-serialisation · `INJECT_FAULTS_INTO_BACKFILL` as a reading · the untested taper slide ·
  `agree`'s three unread projections · the straddled minute · `ts_effective` in
  `resolveAttribution()` · `ad_id`-known unvalidated. All of them, with their reasons.
- ~~`BRIEF_GAPS.md` §H4 — `DESIGN.md` §10.1's `spend_cents` against the code's `spend`~~ — **B60**
  opened §10 and made the correction; §H4 is marked CLOSED.
- ~~One-command run~~ — **B57.** `npm start`, which never reseeds a non-empty store and prints a
  heartbeat through the seed's silent 249-second generate phase.
- ~~`docs/DEMO.md`'s final ordered pass, with the refresh and restart tests as written steps~~ —
  **B61**, and beat 8 is written.
- ~~**THE BROWSER**~~ — **B61.** Stages 4, 5 and 6 had been verified headlessly and *nobody had
  clicked any of it*. All of it has now been clicked, in Chrome, against a scratch copy of the
  seven-day store: the drill-down's three verdict treatments, the `as_of` rewind, the eight-step
  trace, the component library's nested version lists, B42's three vertical rule kinds and its ▼
  markers, the action console (rationale guard, lever applied, `a_12`'s emission stopped), the
  scenario console (`late_cascade` fired, restated buckets 14 → 24), the refresh test and the
  restart test. **Four corrections came out of it** — see `DEMO.md`'s ⚑ marks and the two README
  rows about the drill-down.
- ~~`-Impl-9.md` and `-Impl-10.md` are raw terminal exports~~ — **B62.** Sessions 9, 10 **and 11**
  are now curated captures in `-Impl-8.md`'s convention, plus `-Impl-12.md` for this session. The
  raw exports remain in git history at `65c45bb` and `6573384`.
- ~~**B44 owes two items from B09**~~ — **STALE ENTRY, CORRECTED.** Both shipped with B44: the flush
  caps rows per frame and spills the remainder to the next tick (`stream.ts` → `tail.noteSpill`),
  and the socket-full warning logs **once per connection** and is a counter on the surface
  (`rows_spilled`, `frames_backpressured`).

**STILL OPEN — none of it blocks anything, and none of it is a defect:**

- **`B33a`, the fault split (~90 lines, `scripts/faults.ts`), is proposed and undone.** Splitting
  malformed (0.1%) from dual click-id (0.05%) means re-running `validate()` over retained
  `payload_json`, which reads the store — so it cannot live in `src/sim` (**D32**). It is a
  `npm run faults` chunk in the shape `scripts/agree.ts` already established. **A plan edit is
  Seno's call and it was left undone.**
- **`ad_id` known (§5.1 step 2) is not validated at ingest**, and adding it would make an unseeded
  store reject every simulator event. It needs a plan row or a decision to drop it. Named in the
  README's limits and in a comment in `ingest.ts`. Note I11's boundary: never reject on ad *status*.
- **`projection_meta` is unwritten, deliberately.** Using it to skip the rebuild across `/api/verify`
  calls would make `verify.ts` a second writer of a projection, which needs a decision rather than a
  quiet extension. Nothing reads the table today.
- **Three one-line document corrections**, each waiting for the next chunk that opens its file rather
  than being done as a drive-by (`CLAUDE.md` §5): `DESIGN.md` §2.3's `DecisionBody` sketch is one
  field wider than the code (D51) · `DESIGN.md` §5.2 says "the click's `ts`" where
  `resolveAttribution()` uses `ts_effective` · `src/server/index.ts`'s snapshot-handler comment
  predicts `ads[]` and `generations[]` in the envelope, which no plan row ever asked for.
- **Two rules shipped at B14 under a group approval with no `DECISIONS.md` entry of their own**, and
  recorded here so a later reader does not mistake them for ratified design: a reused `decision_id`
  carrying a *different* body is refused `409 decision_id_reused`; and **every** fold refusal is a
  `409`, including `ad_unknown`. Both are cheap to reverse.
- **The pacing taper's slide has never been shown live** — delivery going to zero and back has been,
  the gradual slide has not. The README does not claim it.
- **A handed-over conversion landing in a SETTLED bucket has not been shown live** on a store younger
  than 72 h. Seven days is where it appears, which is a fact about which store the demo runs on
  rather than about the code.

**The historical entries below are kept as the record of what was owed and when.**


- ~~**D71 — the scoring window's demo problem**~~ — **RATIFIED as option B** (2026-09-05, `6198b73`)
  and **BUILT**. `?window_h=` beside `?horizon_h=`; D70's 6 h stays the default and the documented
  figure; the caption and the column header name the window each score was **answered** at.
  **The README owes two lines**: the window is a read parameter and writes nothing, and the fastest
  possible on-camera score is window + horizon — about **sixteen minutes** at the 15-minute floor,
  so a demo starts that clock early rather than scoring a lever inside one beat.
- ~~**The scenario-consumption ASSUMPTION**~~ — **RATIFIED as D69** (2026-09-05), with the flip
  condition recorded. The README's named-limits section owes one line: triggers are delivered at
  most once, and a dropped poll response loses one — press the button again.
- ~~**D69 blocks `B50a`**~~ — answered; `B50a` is built (`64baeda`).

**Owed by stage 6 (`G16`), none of it blocking B57:**

- **`DESIGN.md` §10.1 says `spend_cents` where the code says `spend`, in a SIGNED payload.**
  Registered as **`BRIEF_GAPS.md` §H4** with the full reasoning. The code's name won; the document
  owes one line. Not done as a drive-by (`CLAUDE.md` §5) — it belongs to the next chunk that opens
  §10.
- **Descriptors do not survive a server restart** (per-process HMAC key; `TRACE_KEY` overrides).
  Deliberate — every descriptor is re-issued on the next `/api/snapshot`, which a refresh runs — but
  it is **a README limit**: a page left open across a restart reads `invalid_signature` on its next
  click until it is refreshed. The message says so; the README should too.
- **The drill-down's evidence list is capped at 400 and its slice list at 200**, with the omitted
  counts always on screen. The **re-sum is over everything**; only the list truncates. A README line,
  and the reason `evidence_omitted` is on the wire rather than inferred.
- **`POST /api/trace` costs ~0.6–1.3 s on the seven-day store.** `replay()` reads every click and
  every conversion in the prefix regardless of window — it must, because a conversion's own `ts` can
  sit far outside the window it belongs to (B23). Fine for a click; **it is not a per-tick path and
  must never become one.** Worth a README line beside the `agree` sweep's timing.
- **Nobody has clicked any of stage 6 either** — see THE BROWSER below, which now covers three
  stages' worth of surfaces.
- **THE BROWSER, still, and stage 6 adds the largest surfaces yet.** Stages 4, 5 and 6 were verified
  headlessly against the real store through the shipped client modules and the real endpoints;
  `vite build` is clean and every server response above was read as JSON. **Nobody has clicked any
  of it.** Uneyeballed: the action console's form and outcome banner, the ▼ generation markers and
  their label stacking, the horizon control and its sweep caption, the scenario console, **B42's
  greyscale check — now THREE vertical rules and a ▼**, and now also **the drill-down panel** (its
  three verdict treatments, the counts table, the `as_of` row, the slice chips, the 400-row evidence
  table), **the eight-step event trace** (whose step 5 and step 8 are the ones that will look
  cramped), and **the component library's nested version lists**. The drill-down and the trace are
  the two densest things on the page and neither has been seen.

- **THE BROWSER, still.** G13 was verified the same way stage 4 was — headlessly, against the real
  store, through the shipped client modules (`generations.ts`, `decisions.ts`) and the real
  endpoints. `vite build` is clean, so it compiles and bundles. **Nobody has clicked the console.**
  What is uneyeballed: the form's own layout, the outcome banner, the ▼ boundary markers and their
  label stacking when two land within 60 px, and B42's greyscale check — which now has a **third**
  vertical rule to keep distinct.
- **`GET /api/components` is a reading, not a ratified decision** (G13). See the Next-action block.
- **`docs/ai-sessions/05-phase-5-Impl-9.md` is still a raw 1,350-line terminal export** (`65c45bb`).
  The convention is a curated capture — prompts, decisions, turning points, ~220 lines; see
  `-Impl-8.md`. Unchanged by this batch.

- **`docs/CHEATSHEET.md` is DROPPED and deleted** (Seno, 2026-09-04). Nothing is owed for it at any gate. `DECISIONS.md`'s index table is the revise-from view.
- **`docs/DEMO.md` — beats 1–6 are written, and beat 7 is closed by B56** (D50). Beat 8 (kill
  everything and restart) is B60's. B61 remains the final ordered pass, not a write-from-nothing
  chunk.
- ~~**`docs/DEMO.md` does not exist yet**~~ (D50). Every stage-4
  and stage-5 group appends its walkthrough steps as it lands **and says so in its report** — a
  running document nobody reports on is a running document that quietly stops. B61 is then the final
  ordered pass, not a write-from-nothing chunk.
- **`SCOPE.md` §2–§4 is README-verbatim.** If scope moves, that block moves with it, and that is a
  README change.
- **`BRIEF_GAPS.md` § Extensions is the README's assembly source.** Any new extension in Phase 5
  gets a row there first.
- **The Phase 5 SQLite findings are not in `BRIEF_GAPS.md`** and should not be — they are driver and
  engine behaviours, not defects in the brief. **I19 is** in the register (B05): a delivery with no
  usable `event_id`, keyed `(no event_id):<payload_hash>`.
- **D39's seed budget is RE-MEASURED (B34), and the surprise is where the cost is.** 249 s
  generate · 0.3 s sort · 70 s write — **5:20 wall, 703 MB peak RSS, 746 MB store**. §18.4's
  ~12 s / ~315 MB measured the STORE and B06's 27.5 s measured the WRITE PATH; neither measured the
  model. `SIM_BACKFILL_DAYS=5` is the wired lever. **This supersedes the older entry below.**
- ~~**The D56 gate-margin check on `a_08`**~~ — **ANSWERED at B39** (2026-09-04). The rung is chosen
  from **realised** counts and the margin holds: `a_08` clears the hourly CPA bar in **9 of its 25
  hours**, with peak hours at 12–23 conversions against a bar of 10, so α = 8's overdispersion does
  **not** silently cancel the demo moment. Over a 24-hour window CPA sits at counts for every ad
  (`a_08`: "9 of 24 points clear at best"), which is honest and is stated rather than tuned around.
- **`INJECT_FAULTS_INTO_BACKFILL` is a READING, not a ratified decision.** §13 was written about a
  live transport; in a constructed arrival order a transport fault becomes an adjustment to
  `received_at`, never to emission. Named as a constant in `seed-history.ts` so it can be flipped;
  the cost of disagreeing is one reseed. Without it the seeded week is clean and the live week
  dirty, §13's orphan rows never fire, and no bucket carries `restated_at` from frame one.
- **B34 owes the D39 revisit.** The seed is ~28 s and ~716 MB through the real write path, not ~12 s
  and ~315 MB. Nothing regressed — §18.4 measured the store, not the write path — and the full
  accounting plus **five levers with their costs** (the fifth costs B55's trace a body on seeded
  events, an HR5 cost) is in `BUILD_PLAN.md` § "The seed budget, re-measured at B06". `SIMULATOR.md`
  §18.4 carries a pointer to it.
- **B33's fault split is NOT done and cannot live in `src/sim`.** Splitting malformed (0.1%) from
  dual click-id (0.05%) means re-running `validate()` over retained `payload_json`, which reads the
  store — and the simulator must never open it (**D32**). It is a `scripts/faults.ts` +
  `npm run faults` chunk of ~90 lines, in the shape `scripts/agree.ts` already established.
  **Proposed as B33a at the G9 report; a plan edit is Seno's call and it was left undone.**
- **The taper's slide is owed a live demonstration.** B32 showed delivery going to zero and back,
  not the slide — §9's band is 15% of budget wide and one 62c click clears it on a fresh store.
  **B34's accumulated spend or §17's `budget_squeeze` is where it becomes showable**, and the README
  should not claim the slide until one of them does.
- **`duplicate_conflicting` has never been observed live** — 0 in a 2,730-delivery run against ~1.4
  expected. B34's ~1.6M seeded events are the first run large enough to confirm it.
- **B33 owes a fault split.** Malformed (0.1%) and dual click-id (0.05%) both read `rejected_invalid`
  and no reason is stored (deliberate, B05) — split them by re-running `validate()` over the retained
  bodies. Its precondition is now met: **B18 completed `SUPPORTED`**, so a click no longer reads as
  a fault.
- **`projection_meta` is still unwritten, deliberately.** §7's sentence is *"`content_hash` makes
  the common case a hash compare rather than a full diff"* — that is the live-vs-rebuilt hash
  compare, which B22 built. Using the table to skip the **rebuild** across calls would make
  `verify.ts` a second writer of a projection (002's header lists `projection_meta` among them), and
  that needs a decision rather than a quiet extension. Nothing reads the table today.
- **`ad_id` known (§5.1 step 2) is still NOT validated at ingest.** `ingest.ts` says so in a
  comment — "the check lands with the ad, not before it" — and B15 has now landed the ads, but **no
  `BUILD_PLAN` row asks for the check** and adding it would make an unseeded store reject every
  simulator event. It needs a row (B33's fault split is the natural neighbour) or a decision to
  drop it. Note I11's boundary: never reject on ad *status*, which is a different thing.
- **`resolveAttribution()` uses `ts_effective` where §5.2 writes "the click's `ts`".** They differ
  only for the 0.2% clock-skew events §13 injects, and every other placement in the build uses
  `ts_effective`. Reported at the G2 gate and left as built; one line in §5.2 would settle it.
- **B35's calibration must expect `a_08` and `a_12` BELOW §2.3's stated impressions/day** (D52).
  Both are budget-constrained on purpose so §9's pacing is visible; §18.3's ladder placement for
  `a_08` was computed at its unthrottled rate, so a naive check reports a false failure.
- **`served_fraction` is owed to the emitter chunk, not to `fixtures.ts`.** §2.2 tabulates it with
  the audiences, but it is not an `audiences` column and it parameterises §7's fatigue accrual —
  it belongs wherever the fatigue model lands (B25+).
- **D52's budgets are an extension and owe a `BRIEF_GAPS.md` § Extensions row.** So do the ad
  `name`s (E8 is registered; the twelve values are ours).
- **`DESIGN.md` §2.3's `DecisionBody` sketch is now one field wider than the code** (D51):
  `create_ad`'s `initial` no longer carries `created_at`. The code is right; the divergence is
  annotated in `src/shared/decisions.ts` at the point it happens. Worth a one-line correction in
  §2.3 whenever that file is next opened — **not** a drive-by now.
- **`src/server/index.ts`'s snapshot handler comments predict `ads[]` and `generations[]` in the
  envelope "with the fold (B12)"** — B12 shipped and they are not there, because **no `BUILD_PLAN`
  row asks for them**. The Signal surface reads config from `GET /api/decisions` and the `ads`
  projection today. Either B36/B38 owes a row that widens the snapshot envelope, or that comment is
  wrong; decide it at the B36 gate rather than by drift.
- **Two rules shipped at B14 under the group approval, with no `DECISIONS.md` entry of their own.**
  Recorded here so a later reader does not mistake them for ratified design: (a) a reused
  `decision_id` carrying a **different** body is refused `409 decision_id_reused` rather than
  silently returning the first decision — U5 says idempotent, not "swallow a different lever";
  (b) **every** fold refusal is a `409`, including `ad_unknown`, on the grounds that the
  machine-readable `error` code is what a caller branches on. Both are cheap to reverse.
- **B11's two assumptions owe a decision** — the seed's home and the catch-up window's length. Both
  are in "What is open" with the chunk each must be answered before (**B34**, **B29**). They are
  labelled in `src/sim/index.ts` so the code and this file cannot drift apart on them.
- **`src/sim/rng.ts` is deliberately NOT in D43's test surface**, and the reason is on the record so
  a later chunk does not add it by reflex: its wrongness is **not** invisible. A biased `draw()`
  shows up as a rate that misses `SIMULATOR.md` §21's measured tables, which is what **B35's**
  calibration check reads, and it was measured directly at B11 (1M keys). If a chunk wants a test
  here anyway, it owes the D43 argument.
- **B44 also owes the `stream.ts` split** — 273 lines holding two concerns (the flush loop, and
  resume/cursor parsing). Agreed with Seno to land it with B44's caps, not as a drive-by.
- **B34 owes a flush guard, measured by Seno at B09**: the **seeder must not call
  `stream.markDirty()`**. One batch spanning 20,000 minutes produced a **6.20 MiB** frame and a
  **142 ms** event-loop stall after `ingest()` returned; at 56,160 seeded buckets that is ~17 MiB /
  ~400 ms.
- **B44 owes two items from B09.** (a) **Cap rows per frame and spill to the next tick** — the flush
  has no cap, and B44's socket-buffer cap does *not* cover it, because the frame is built before any
  socket is written to. (b) `[stream] subscriber socket is full` fires for clients reading normally
  (`res.write` returns `false` for any frame over the socket high-water mark) — log once per
  connection, or make it a counter.
- **B59 owes a named limit**: `payload_json` is a re-serialisation of the parsed element, not the
  received bytes — `JSON.parse` has already collapsed duplicate keys and rewritten `1e2` and `\u0041`.
  The DDL comment and `DESIGN.md` §2.2 both promised "exactly as received" and were corrected at B05.

**Owed by B35 (stage 3's close), neither blocking:**

- **A live click loses its in-flight conversion across an emitter restart.** `PENDING_CLICKS_SQL` is
  restricted to `source = 'backfill'` (B31a, deliberately — "a live click's schedule is known to the
  process that emitted it"), so only the backfilled half is re-derivable from the store. Bounded,
  and the backfilled population — which is most of what a demo sees convert — is unaffected. **A
  stated limit, owed to the README.**
- **A handed-over conversion landing in a SETTLED bucket has not been shown.** The 1-day scratch
  store that verified B35 holds nothing older than D13's 72 h, so no live arrival could restate.
  Seven days is where that appears, which is a fact about which store the demo runs on rather than
  about the code.

## What was verified, not assumed

Phase 0–4 rows ran in the scratchpad. **Phase 5 rows ran against the committed repo** and are
reproducible with the commands in "How to run what exists".

| Claim | Result |
|---|---|
| `node:sqlite` loads unflagged; `PRAGMA journal_mode=WAL` returns `wal`; busy_timeout and manual transactions behave | Node v24.14.0 — passes (D8) |
| The §2 DDL executes: `STRICT` tables, the `ts_effective` generated column with `MIN()`, the partial `UNIQUE` index on `click_id`, `STRICT, WITHOUT ROWID` + `ON CONFLICT DO UPDATE` | SQLite 3.51.2 — all pass (DESIGN §2) |
| **Seed rate** — 1.06M events through insert → attribution → rollup upsert, WAL + `synchronous=NORMAL`, txns of 5,000 | **7.9 s (133,601/s)** → ~12 s at the final portfolio size (D39, SIMULATOR §18.4) |
| **P14 agreement sweep** — one ordered pass over raw, rebuild, diff every bucket | **2.72 s** over 56,160 buckets, **0 mismatches** → ~4.2 s at final size. **No bounded mode needed** (D39) |
| Hot read on D28's `WITHOUT ROWID` PK, 60-minute single-ad window | 0.08 ms |
| Store size | 203 MB + 5 MB WAL → ~315 MB at final size |
| **B02** — both migrations from empty; four pragmas; the I10 clamp (a `ts` of 2099 clamps `ts_effective` while `ts` stays intact); all six `CHECK`s and the partial unique `click_id` index reject; `tx()` rolls back; a forced mid-file failure leaves `user_version` unchanged and the partial table gone | **passes** (Seno re-ran independently) |
| **B03** — the D29 upsert twice → one row, counts summed, `first_written_at` held at the first write, `max_ingest_seq` advanced; FKs reject an unknown component; the `channel` enum rejects a bad value | **passes** (Seno re-ran independently) |
| **B03** — §2.4's access paths: hot read `SEARCH … USING PRIMARY KEY`; portfolio window `USING INDEX ix_rollup_time` | **passes** |
| **B04** — health reports real high-water marks (seeded store: `ingest_seq` 7, `decision_seq` 3); unmigrated store gives the migrate instruction; `EADDRINUSE` exits 1 and the runner tears down; Ctrl-C leaves no process, no bound port, no `-wal` | **passes** |
| **B05** — accepted → duplicate_identical → (keys reordered) duplicate_identical → (different `ad_id`) duplicate_conflicting; four reject classes with the raw body kept; `ad_id: 12` rejected, nothing stored as `'12.0'`; in-batch duplicate; I10 clamp; **forced throw on element 3 of 3 rolls the whole batch back**; restart preserves `ingest_seq` | **passes** |
| **B05** — `now(index)` gives a distinct `received_at` per seeded event; two distinct malformed bodies get two distinct `(no event_id):<hash>` keys, one sent twice gets one | **passes** |
| **B06** — 3 impressions over a minute boundary → 2 buckets + a third for another ad; rollup sum == raw signal count; duplicate moves nothing; a late event bumps the closed bucket with `first_written_at` held and `max_ingest_seq` advanced; **D7 grep: one file, one statement, one importer** | **passes** |
| **B06** — full-scale seed through the real path: **1.625M events in 27.5 s (59,002/s), 716 MB**; `apply()` alone 490k/s; `dbstat` says `signal_deliveries` + index is 53% of the store | **measured** — see `BUILD_PLAN.md` § "The seed budget, re-measured at B06" |
| **B07** — API JSON byte-identical to `sqlite3` for the same window; rollup impressions == raw `COUNT(*)`; per-ad plan `SEARCH … USING PRIMARY KEY`, portfolio `USING INDEX ix_rollup_time` + `USE TEMP B-TREE FOR ORDER BY`; server restart → same snapshot and same `as_of`; a write commits after a read tx; `grep` finds no write statement in `snapshot.ts` | **passes** |
| **B07** — the bound traps: `…T12:00:00` (no offset) resolved to `08:00:00.000Z` here; an unsnapped `…12:00:00Z` returned **1 of 3** buckets; `[12:00:00Z,12:00:30Z)` over-counted and `[12:00:20Z,13:00:00Z)` under-counted the same 12:00:50 impression. After snapping, raw == buckets on all three windows | **measured, then fixed** |
| **B07** — `Z`, `+HH:MM`, `+HHMM`, `-HH:MM` all resolve to the same instant; V8 returns `NaN` for hour-only `+02`; date-only and space-separated forms rejected | **passes** |
| **B09** — 3 events in one batch → **one** frame, **2** rows, `a_12` coalesced to `impressions:2`; repeated POSTs gave **3 → 4 → 5** (absolute, never a repeated delta); ids monotonic; a **duplicate produced no frame**; 20 s idle gave 0 bucket frames, 2 keepalive comments, **0** `id:` lines; two subscribers, one **through Vite's proxy**, identical frames | **passes** |
| **B09** — shutdown with a subscriber attached: port released in **14 ms**. Isolated repro of the counterfactual: with the response left open, `server.close()`'s callback had **not fired after 1000 ms** | **measured** |
| **B09** — Seno's independent run: coalescing across batches in one tick · duplicate/rejected/mixed batches · the **old-minute restatement frame** · `ready` and keepalive carry no `id:` · subscriber accounting · D7 · shutdown **23 ms with 4 subscribers** | **passes** |
| **B10a** — `?cursor=14` replays exactly seqs 15/16/17 (matches `sqlite3`); `max()` correct both directions; no cursor and caught-up send `ready` only; `Last-Event-ID: 500` → `cursor_ahead_of_log`; **2000 dirty buckets replay (638,934 B) and 2001 → `too_many_rows`**; resume works through Vite's proxy; shutdown 16 ms mid-replay; D7 grep clean | **passes** |
| **B10a** — the cursor-coercion hazards Seno found, after the `/^\d+$/` fix: `1e3`, `0x3`, `+2`, `2.0`, `%20`, `''` and an empty `Last-Event-ID` all → `cursor_not_a_number`; `007` → 7, same 6 rows as `?cursor=7` | **passes** |
| **B10a** — Seno's independent re-run: `?cursor=2` → seqs 3,4,5 · `max()` both ways · the 2000/2001 boundary (638,952 B then `too_many_rows`) · `cursor_ahead_of_log` · duplicated-header and `Infinity` rejections · resnapshot-then-live-frame · D7 · typecheck | **passes** |
| **B10b** — the SHIPPED client modules driven headlessly (10 assertions): double-apply is idempotent · merge assigns, never accumulates · a restatement is the same key reassigned · **out-of-window rows dropped** · half-open window · `ready` frame · a live POST moves the number with no refetch · the target bucket climbs by exactly the 2 events posted · no spurious resnapshot · `cursor_ahead_of_log` drives a client resnapshot | **passes** |
| **B10b** — **D47's gap, both directions**: an event ingested with no subscriber attached is **replayed** on subscribe with `?cursor=`, and is **not delivered at all** without it | **passes** |
| **B11** — boot catch-up emits **14 events for 60 s** against 13.9 expected; rollup impressions == raw `COUNT(*)` on **every** bucket (14/14, 20/20, 12/12); `COUNT(DISTINCT event_id)` in deliveries == `signals` rows (46 == 46) after 39 duplicate deliveries | **passes** |
| **B11** — **restart within 60 s**: 18 re-derived events → **14 `duplicate_identical`, 0 `duplicate_conflicting`**, and the 4 seconds the killed process never reached accepted. Impressions did **not** move on the duplicates | **passes** |
| **B11** — live path with no `curl` anywhere: SSE absolute rows **10 → 11 → 12**, one frame per sim tick; the duplicate-heavy boot batch produced no bucket movement | **passes** |
| **B11** — **server down 6 s, then up**: 21 → 23 events held and coalesced, **all sent on recovery**, `ingest reachable again` logged once, the sim process never exited (a crash here would take `npm run dev` down with it) | **passes** |
| **B11** — the keyed RNG over **1M keys**: mean **0.499982**, all ten deciles within 0.6%, `P(u < 0.231481)` = **0.231249**; `derivedId` gave **400,000/400,000 distinct** ids over `(tick, i)`. This is why the 20-impression minute above is variance (1.87σ on a Bernoulli), not a rate bug | **measured** |
| **B11** — D32/D7: `grep` finds no `node:sqlite`, `openDb`, `INSERT` or `UPDATE` anywhere in `src/sim` — the emitter reaches the store only over HTTP | **passes** |
| **B12** — `npm test` exists and runs: 12 fold assertions (the six actions to an expected config · `launch` the only writer of `launched_at` · `draft` admits only `launch` · **F1's `archived` branch exercised, refusing everything without throwing** · `from_id` checked against the *named* slot · fold does not mutate its input) | **passes** |
| **B12** — `isCanonicalIso` refuses nine same-instant strings of a different SHAPE (no-ms, 1-digit, µs, `+00:00`, `+02:00`, lowercase, space-separated, expanded year) and the offset-less form that JS reads as LOCAL | **passes** |
| **B12** — `readCursor` refuses `1e3`, `0x3`, `+2`, `2.0`, `' 2'`, `Infinity`, `-1`, a fullwidth digit and a **present-but-empty** cursor; `007` → 7; `max()` correct both directions; a duplicated header is invalid | **passes** |
| **B13** — against a real migrated store: a **stale `from_cents` is rejected and NOTHING is written** (no log row, no generation, `ads` unmoved) · a current one opens generation *n+1* with `valid_to` set on *n* · a no-op budget change opens **no** generation but still logs · U5 replay folds once · a reused id with a different body is refused · an unknown component id rolls the log row back with the projection write | **passes** |
| **B14** — `create_ad` → `launch` → stale `set_budget` (409) → good `set_budget` → `swap_component` → `pause`: five generations `g_a_12_001…005`, each `valid_to` **byte-identical** to the next `valid_from`, exactly one open, `ads.current_generation_id = g_a_12_005`, `last_decision_seq = 5`. The rejected decision consumed **no** `decision_seq` | **passes** |
| **B14** — the refusals: `ts` on the wire → 400 `ts_is_server_assigned` · a blank rationale → 400 (brief L95) · `pause` on a paused ad → 409 `illegal_transition` · an ad with no `create_ad` → 409 `ad_unknown` · the same `decision_id` verbatim → 200 `replayed:true`, same seq | **passes** |
| **B14** — HR1: server killed and restarted on the same store → all five decisions return, and a `resume` continues from `paused` with `launched_at` unchanged. D7 grep: 4 projection writes, **all in `apply.ts`**. `npm run dev` still boots all three processes; an impression still ingests | **passes** |
| **B15** — `npm run seed` on an empty store: **24 decisions → 12 ads → 24 generations, 12 open**; 16 components, 4 audiences; `v_05` carries `parent_id = v_04`; launches staggered 2026-08-28 → 09-03 exactly as §2.3's `live_days` says; a second run is refused | **passes** |
| **B15** — `grep` proves the seeder writes only `components` and `audiences` directly; every ad reaches `ads` through `applyDecision()`. The whole seeded world survives a server restart and a live `set_budget` continues the fold from the seeded head (`g_a_12_002` → `g_a_12_003`, seq 25) | **passes** |
| **B16** — impression + click + spend in one batch → one bucket reading `1 / 1 / 62 / 130`, **byte-identical to the raw re-sum** over `signals`. A second click claiming a live `click_id` with a NEW `event_id` → `rejected_invalid` / `click_id_already_claimed`, **counted**. A redelivery of the first click → `duplicate_identical`, not a reject | **passes** |
| **B16** — the reject reasons name the field: `spend_has_cost_cents`, `cost_cents_not_a_non_negative_integer`, `click_id_missing_or_not_a_string`, `amount_cents_not_a_non_negative_integer` (for `1.5`), `unsupported_kind:conversion` | **passes** |
| **B17** — 8 assertions: D27-B credits the **click's** minute · D14 gives different generations either side of a swap (`g_a_12_002` / `g_a_12_003`) · I8/G30 credits the click's ad and flags `ad_id_conflict = 1` while staying `resolved` · D16 holds an orphan at its own minute with `resolved_at` null · `generationAt` boundaries are half-open and `null` before the ad existed · **`conversion_attribution` is still empty afterwards (D7)** | **passes** |
| **B17/D53** — the payoff, on the seeded world: a click backdated 5 days resolves to `g_a_12_002`, and a conversion arriving today credits a bucket dated five days ago. Under D53 option A that generation would have been `null` for the entire seeded week | **measured** |

**Environment note.** `sqlite3` CLI **3.45.1** is installed; `node:sqlite` embeds **3.51.2**. Both
read the same file without complaint, but if a `.schema` or a query plan ever looks wrong, that
version gap is the first thing to check.

## Next action

**THERE IS NO NEXT CHUNK AND NO NEXT PHASE. `G17` = B57+B58+B59+B60+B61+B62 closed stage 7 and
phase 5; phase 6 closed packaging; phase 7 closed post-completion hardening.** The plan is 69 chunks
and **all 69 are ticked**, plus §10a's B63–B72. `tsc` clean, `npx vite build` clean, **168 tests**,
tree clean.

**What a reviewer does:** `npm i && npm start`, then `README.md`, then `docs/DEMO.md`.

**What the next session does: nothing is owed.** The three things a session could pick up, none of
them blocking, in the order they are worth doing:

1. **`MOCK_DATA.md`'s population line**, per the [Phase 7](#phase-7) finding — the store was
   reseeded, so its counts describe the 2026-09-04 seeding and its shapes describe the model.
   Seno's call.
2. **`docs/ai-sessions/05-phase-5-Impl-13.md`**, still a 5,475-line raw export. Outstanding since
   phase 6.
3. **`B33a`**, the fault-injector split — designed, costed at ~90 lines, unbuilt, and the only piece
   of designed work in this repo that is neither built nor formally cut. A plan edit, so Seno's call.

*(What follows is what this section said at the phase 5 close. Kept, because the phase 6 gap it
points at is the record of what was owed and paid: two decisions came first — the
`DEMO_SCRIPT.md`/`DEMO.md` relationship and how much material goes inside the README — and both are
in [Phase 6](#phase-6-the-gap).)*

**What stage 7 measured, all against the real seven-day store with the emitter running:**

| Claim | Measured |
|---|---|
| `GET /api/verify` — four projections rebuilt from the logs and hash-matched | **200 in 11.5 s**, 12 + 24 + 1,389 + 71,689 rows |
| `npm run agree` — every bucket's counts re-derived from raw | **OK in 4.0 s**, 1,587,720 events → 71,696 buckets |
| `POST /api/trace` — one ad, six hours, past window | **0.6–1.4 s**, MATCH |
| `POST /api/trace` — twelve ads, six hours, past window | **6.5 s**, MATCH |
| `POST /api/trace` — twelve ads, live window, in the browser | **7–10 s**, `NOT_COMPARABLE` (correct — see below) |
| `DESIGN.md` §8's temporal reverse join over the whole store | **25 ms**, six videos |
| `npm start` on an empty store | seeds, heartbeats every 15 s, then serves |
| `npm start` on a seeded store | **does not reseed**; up in ~1 s |
| Pause `a_12` in the browser | **0 signals for `a_12` over four consecutive 15 s windows**, others unaffected |
| Fire `late_cascade` in the browser | trigger written, **picked up 0.88 s later**, restated buckets **14 → 24** |
| Kill all three processes and restart | 150 events re-derived, **104 `duplicate_identical`**, 44 accepted, all 33 decisions back |

### The one thing B61 found that changes how the app is demonstrated

**On a window that includes *now*, the drill-down answers `NOT_COMPARABLE` rather than `MATCH`** —
and it is right to. The descriptor is signed at the snapshot's `as_of_ingest_seq`; by the time the
recomputation finishes, more events have landed inside the window, so `rollup_minute` reflects a
later log position than the recomputation answers. A projection has no `as_of`, so there is nothing
to agree or disagree with. With twelve ads emitting, **seven events land inside a seven-second read**,
and pressing *now* re-signs at a head that has already moved again.

**Point it at one ad, or at a window that has ended, and it reads `MATCH`** — both measured. This is
B54's `NOT_COMPARABLE` doing exactly the job it was added for; the alternative is a screen built to
prove agreement that accuses a correct store of disagreeing with itself. It is now a sentence in
`DEMO.md` step 23 and a row in the README's limits.

### Stage 7's other three corrections, all from doing rather than describing

1. **The seed's 249-second generate phase writes nothing to stdout**, so `npm start` on an empty
   store was four minutes of silence before the existing write-phase progress bar appeared. Found by
   running it. `start.mjs` pipes stdout and heartbeats after 15 s of quiet.
2. **The README's first draft got `v_04` vs `v_05` backwards** — it said the recut clicked better and
   converted about the same. Computed from the printed rows: CTR 1.09% → 0.63%, CVR 12.3% → 15.7%.
   It clicks *worse* and converts *better*, and the comparison is confounded by audience, lifetime
   and D35's pair-keyed fatigue anyway. Corrected, with the confound stated.
3. **The action console re-selects the legal lever after one lands** — pause an ad and the selection
   moves to `Resume`. The right affordance and a demo trap: a second Apply without looking applies
   the *other* lever.

**`data/loop.sqlite` was read but never written to by stage 7's verification** beyond the live
emitter's own ingestion; every lever pull and scenario trigger above ran against
`scratchpad/b61.sqlite`, a copy of the `g13` scratch store.

### D71 landed after stage 6, and it is not a chunk

**`?window_h=` on `GET /api/scores`**, ratified as option B and recorded in `6198b73` **before** any
code, per §3. It is an amendment to `B50a`, not a new plan row, so `BUILD_PLAN.md` §9 is unchanged
and the chunk count stays 63 / 69.

- **`SCORING_WINDOW_MS` / `SCORING_WINDOW_H` remain D70's ratified 6 h** and are what the README, the
  caption and the tests quote. The parameter shifts a read; absent it every caller is unchanged.
- **Refused, never clamped**, in `[0.25, 168]` hours — and `horizon_h`'s lower bound is now stated as
  one minute (`1/60 h`), the store's own grain, rather than "any positive number".
- **The caption and the `score (±… )` header name the window the SERVER answered at**, which is why
  `App.tsx` holds the whole `/api/scores` envelope rather than just the map: control and answer
  differ for one tick after every change, and that is the tick a reader is looking at.
- **Contamination is recomputed per read**, because a second lever inside 15 minutes is a different
  set from one inside six hours.
- **Two tests** (169 → 171): a shortened window measures different minutes and moves the score; and
  withholding follows the window, not only the horizon.
- **One B50a defect fixed, found by verifying D71 against the real store**: `no_evidence` said
  *"neither window has enough delivery for a CTR"* where `pause a_12` has **3,001 impressions before
  and 0 after** — which invites a reader to diagnose under-delivery before the lever. It now names
  which window is missing, and says the before-window's size when the missing one is the after.
- **The floor is a stated limit.** Fastest possible on-camera score is window + horizon ≈ **16
  minutes**. A demo starts that clock early; it cannot score a lever inside one beat.

**And it was demonstrated live, which is the whole reason D71 exists.** Server + emitter on the
`g13` scratch store, two `set_budget` levers on `a_03`:

| decision | at ±15 min, 1 min horizon | at D70's ±6 h |
|---|---|---|
| `d71_live_score` (03:53:10) | released at 04:09 — `no_evidence`, *"the before-window has no CTR to compare"* (the emitter had run only 80 s before it) | `settling`, ready in **6 h** |
| `d71_live_score_2` (04:09:59) | **SCORED at 04:25** — `▼ worse · CTR 2.76% → 1.63% (−41.1%)`, 145 impressions before / 123 after | `settling`, ready in **6 h** |

**Sixteen minutes from lever to number, against six hours.** Both rows read `settling` at the
ratified window at the same instant, and the horizon was already one minute in **both** columns — so
**only the window released it**. That is the contrast the two-knob caption exists to make legible.
The `g13` scratch store now carries two extra decisions (`decision_seq` 28, 29) and ~35 minutes of
live emission.


### What stage 6 built, in one paragraph each

**B51 — the descriptor.** Every metric the server sends now carries §10.1's `TraceDescriptor`:
metric, ads, window, grain, placement rule, log position, HMAC. Eight per totals row, thirteen rows,
so 104 signatures per read and no measurable cost. `node:crypto` is a **built-in** — same family as
D8's `node:sqlite` — so no dependency moved; named here rather than asked as a §3 decision.
`Signature` is a branded string with exactly one producer, and that producer is server-side.

**B52 — the quarantine is a compile error.** Every performance number on the page renders through
`<Metric>`, whose props require a descriptor. A tail-summed number has no third argument that
typechecks; a cast compiles and is the line a reviewer greps for, which is D34's own standard.
`formatMetric` widened from `MetricKey` to `TraceMetric` — `conversions` has no chart control but is
a performance number, and a hand-formatted cell beside the table would be the ungated second route.

**B53 — the drill-down, and it disagrees when it should.** `POST /api/trace` verifies the HMAC,
reads the number back from `rollup_minute`, recomputes it from raw `signals` with `replay()`, and
puts the verdict on screen. `a_03` over six hours: **MATCH**, 10.20× both sides, all eight counts
identical, 10,481 raw rows. Add 7 impressions to one rollup row by hand → **MISMATCH on the counts
with ROAS unmoved**, which is why both are compared and why the counts are compared exactly.

**B54 — the rewind, and the defect it exposed.** `a_01`'s 20:01 minute reads 0 conversions at
ingest_seq 1587167, 3 at 1587170, 6 at 1587173; the difference between the last two is **exactly
three named `event_id`s** whose `value_cents` sum to 13,752 = 47,701 − 33,949. **Running it showed
the verdict reading MISMATCH on a correct store**, because a rollup has no `as_of`. `NOT_COMPARABLE`
now covers that, tested exactly against `MAX(max_ingest_seq)` — and at exactly 1587173 the verdict
returns to MATCH, so the boundary is right rather than merely conservative.

**B55 — one event, end to end.** §10.4's eight steps as a screen you paste an id into, each step
naming its table. Verified on five shapes: the 168 h late cascade conversion (credited to its
click's minute under `g_a_01_002`, bucket restated 6×), a duplicate (two deliveries, one canonical
row), a rejected delivery (no `signals` row, and the trace says so), an orphan (held at its own
minute, excluded from CPA/ROAS), and a clock-skewed event rendering as *"30 s EARLY (clamped, I10)"*.
Step 6 is the only step with no table, and the screen says why.

**B56 — the Workbench screen.** §8's reverse join, computed by scanning `ads`. On the seeded store:
*"Product demo, 30s — recut, tighter open · 2 versions, live in 3 ads"*, v1 in `a_01` and `a_12`, v2
in `a_05` — §8's own example, from the store. **Pause `a_01` and it reads live 2 / paused 1**, v1
splitting into live=1 paused=1; resume and it returns. `/api/verify` 200 after both.

### The three things stage 6 found by measuring rather than by reading

1. **The evidence list in log order showed no conversions.** The first 400 of 10,481 contributors
   were all impressions, so a ROAS sat above a list containing nothing that earned any revenue.
   Identical in shape to G14's newest-first sweep sample. Conversions fill the sample first now.
2. **The rewind cried wolf** (above). Found by using the control, not by reading the code.
3. **A stale server kept the port** while a "new" one failed to bind, so old descriptors kept
   verifying and the per-process key looked broken-in-the-safe-direction. Confirmed properly
   afterwards: a descriptor issued before a restart reads `invalid_signature`, with the cause and
   the fix in the message.

### One implementation reading, flagged rather than inherited

**`POST /api/trace` narrows and rewinds by RE-SIGNING, never by mutating.** The client never holds a
descriptor the server did not issue, which is D34's whole mechanism, and it means the response's
descriptor is itself clickable without a second protocol. The alternative — signing a descriptor per
chart point — is 1,440 signatures per series and was rejected on cost, not on principle.

### `B50a` is built and correct, and it has nothing to show on the seeded data

**This is the finding that matters and it is the same shape as F2.** Seven tests pass over
controlled fixtures, including both bias traps. Against the real store:

| horizon | outcome |
|---|---|
| 72 h (D13) | 12 `no_before_window` · 6 `no_evidence` · **6 withheld, "scoring in 2 h"** · 12 of 24 contaminated |
| swept to 2 h | 12 `no_before_window` · 12 `no_evidence` · **0 withheld** — the sweep released all six |

**Zero decisions score, and the reason is structural**: the seeded week's 24 decisions are 12
`create_ad` and 12 `launch`, and both have an empty before-window by definition — before `launch`
the ad is `draft`, and §3 gives a draft ad λ = 0. On the scratch store carrying G13's three real
levers, `pause a_12` reads **3,001 impressions before / 0 after** and correctly reports *too little
evidence* rather than an infinite decline.

**The horizon sweep releasing the six withheld entries is D19's pairing working** — *"pair with a
shortened horizon in demo mode so a score can be produced live"* — and it is the one half of this
that IS demonstrable today.

**D71 IS OPEN AND UNASKED** (see "What is owed"): the 6 h window is fixed, so a lever pulled during
a demo cannot be scored for six hours no matter what the horizon is. That is verbatim the situation
F2 named for the horizon, and F2's answer was to make shortening it a build item (P16). **Do not
take that decision — ask it.**

**Two things I narrowed rather than took**, both flagged here so they are ratified or corrected
rather than inherited:

1. **`create_ad` is excluded from the contaminating set**, which is one action short of D70's
   "any second lever". Justification: a draft ad delivers nothing, so it provably moved no counts —
   and including it marked 24 of 24 seeded entries contaminated, which is a flag nobody reads.
2. **The metric rule is D19's recommendation, not a ratification.** D19 asked *"which metric?"* and
   that half was never answered. `B50a` implements CPA-where-both-windows-carry-conversions,
   CTR-otherwise, and the entry says so.

**163 tests.** `tsc` clean, `vite build` clean, tree clean. Verification ran on scratch copies;
`data/loop.sqlite` is untouched and has not been reseeded.


**STAGE 5 IS CLOSED — B49 and B50 landed together at Seno's instruction ("B49,B50 next. Close the
stage 5"), both of which `BUILD_PLAN.md` §13 had marked single-gated.** Reported per chunk.

**B49 / P16 — the horizon is now swept, and it writes nothing.** F2's arithmetic was the whole
reason this exists: at 72 h with 7 days of backfill, no bucket settles inside a demo, so P7's
restatement path would be built, correct and **invisible**. Measured on a copy of the seeded week:
**72 h → 2 h flips 40,881 buckets and 172 of them are restated under the new horizon, in 83 ms**,
reading 40,881 of 71,584 rows — the band, on `ix_rollup_time`, not the table. A no-op sweep reads
**zero** rows.

**The horizon is a READ parameter and that was forced rather than chosen.** `restated_at` is
stamped at ingest against the horizon in force *then*; `/api/verify` replays against the horizon in
force *now*. A persisted setting would therefore make verify diverge on a correct store — the same
failure D54 avoided for `orphan_expired`. So: the write side keeps `HORIZON_MS`, `?horizon_h=` moves
the read side, and the sweep is read-only.

**One asymmetry it forced, and it is handled rather than tolerated:** the SSE flush tick serves N
subscribers from one read (§11), so it cannot stamp settlement at whatever horizon a tab is
sweeping. The client re-derives every row with the **same `bucketState` the server uses** — which is
why `settlement.ts` is now deliberately free of `node:sqlite` and the sweep lives in `sweep.ts`.

**B50 / P17 — the world can be provoked.** All seven of §17 are accepted, bounds-checked and
persisted to `sim_scenarios`; the emitter picks them up on the world poll it already makes. **Three
fired end to end against a live server + emitter on the seeded store:**

- `late_cascade{a_01, n:12, min_age_h:96}` → **restated buckets 12 → 17**, timeline entries **seven
  days back** with real before-and-after: `conv 0 → 6`, ROAS `0.00 → 119.25`, **168.0 h late**, every
  entry `explained`.
- `orphan_burst{n:6}` → orphans **8 → 14**, all parked at their own minute, then **all six promoted**
  back to 8 with `credited_minute` moving **19:59 → 19:57**. That is the two-bucket restatement the
  plan row asks for, caused on demand.
- `stall{20}` → **`ingest_seq` unmoved for 12 s**, then emission resumed on its own.

**`/api/verify` returned 200 with all four projections hash-matched, and `npm run agree` returned OK,
after all of it.**

**Three seams and no fourth**, written into `src/sim/scenarios.ts`: a transform of `LiveAd[]` (φ for
`fatigue_collapse`, realised spend for `budget_squeeze`), a λ multiplier (`traffic_burst` scales the
Poisson **mean** — scaling the drawn list mints duplicate `event_id`s and demonstrates dedupe
instead of backpressure), and direct injection (`late_cascade`, `orphan_burst`, `duplicate_storm`).
`stall` is none of the three: it suppresses the batch and **does not buffer**.

### THE ONE THING B50 OWES A DECISION — read this before the README's limits section

**ASSUMPTION (unratified): the server marks a scenario `consumed_at` at SERVE time** — at-most-once
delivery. The DDL says only *"NULL until the simulator picks it up"* and the simulator cannot write
(D32), so the mark has to be made on its behalf. Three shapes exist, all defensible, and the full
analysis is in the comment above `pending_scenarios` in `src/server/sim-world.ts`:

| | Shape | Failure mode |
|---|---|---|
| **(a)** | **serve-and-mark — TAKEN** | a dropped poll RESPONSE loses the trigger silently: the reviewer presses the button and nothing happens |
| (b) | the emitter acks (`?consumed=` on the existing poll, or an endpoint) | a lost ack re-delivers; harmless while the process lives, a second cascade after a restart |
| (c) | never mark | the DDL's comment becomes a lie and the poll payload grows by a row per trigger forever |

(a) was taken because **the emitter is idempotent by `scenario_id` anyway**, so moving to (b) later
is purely additive — the ack becomes the mark and nothing that consumes triggers changes. **It needs
sign-off before the README's limits section is written. It blocks nothing else.**

### D68's condition

**Stage 5 landed without `CLAUDE.md` §5's stop clause firing.** No chunk needed a decision mid-build,
none revealed the design wrong, none wanted a dependency. **So D68's condition is met and `B50a` —
decision scoring — is due.** It is NOT started, because D68 records a sub-question that blocks it and
Seno has not answered it: **is `w` a symmetric 6-hour before/after window, or is it pinned to the
decision's own generation boundaries?** That question is the first thing to put to Seno.

**156 tests** (146 + 5 sweep + 5 scenario). `tsc` clean, `vite build` clean, tree clean. All
verification ran on `scratchpad/g14.sqlite`, a copy — **`data/loop.sqlite` is untouched and has not
been reseeded.**


**G13 IS CLOSED — B46, B47, B48, one commit. STAGE 5 HAS FOUR CHUNKS LEFT, AND TWO OF THEM ARE
SINGLE-GATED (B49, B50).** **D68 was recorded first, in its own commit (`80158a2`), before anything
was built on it.**

**The loop closes.** The action console is on the page: four levers, a required rationale, and the
compare-and-swap precondition as a **visible, editable field** — which is the only way I13 is
demonstrable in a single browser tab. Measured against a copy of the seeded store through the real
endpoint: `pause a_12` → 200, seq 24 → 25, `g_a_12_003` opened; the **same `decision_id` again →
`replayed: true`, still seq 25**; three refusals (`illegal_transition`, `stale_precondition`,
empty rationale) left `decision_seq` at **24**; then `swap_component v_04 → v_05` (seq 26) and
`set_budget $350 → $700` (seq 27). **`GET /api/verify` after all three: 200, all four projections
hash-matched at `decision_seq` 27, 11.7 s.** That last line is the batch's real check — the levers
went through `applyDecision()` and nothing else, so the log still rebuilds the world.

**`DESIGN.md` §3.1's envelope is finally complete.** `generations[]` and `decisions[]` now ride the
snapshot beside `ads[]` and the buckets, **in one read transaction** — 27 and 27 on the mutated
store, **27 of 27 joined through `opened_by_decision` with zero orphans**. That single transaction
is the whole reason they are not two endpoints: a chart annotated with a generation and a log
explaining it have to be describing the same instant.

**Three vertical rules now share the canvas**, and D45's non-colour rule is what keeps them apart:
the settlement horizon is long-dashed with a mid-height label, a restatement is fine-dotted with a
hollow square, and a **generation boundary is solid with a ▼ and an `a_12 g4` label**. Beneath the
chart the same boundaries are written out with the decision's own rationale. **Nothing stores what
a generation changed** — it is diffed from the adjacent pair, in `generations.ts`, with five tests,
because a boundary at the wrong instant draws a completely normal chart.

**Two structural notes for whoever picks this up.**

- **`src/server/components.ts` + `GET /api/components` is new and is NOT a ratified decision** — it
  is a plain read of seeded reference data that the swap picker cannot work without, kept off the
  §3.1 envelope because components never change and re-sending them on every window roll would be
  four copies a minute of a constant. B56's Workbench screen (P15) reads the same endpoint. **Say so
  in the README's extensions pass rather than letting it look ratified.**
- **`AdRow` gained `video_id` and `headline_id`** for the same reason `daily_budget_cents` was
  already there: they are `swap_component`'s precondition values, and a console without them would
  have to invent a `from_id`, which is the compare-and-swap defeated by the client meant to use it.

**146 tests** (139 + 2 components + 5 generations). `tsc` clean, `vite build` clean, tree clean.

**Verification ran on a COPY** (`scratchpad/g13.sqlite`, a 0.2 s `cp`), never on `data/loop.sqlite`
— the real store still holds its 24 seeded decisions and has not been reseeded.


**THE B36 GATE IS CLEARED** (2026-09-04). **D44** — uPlot `1.6.32`, pinned exact, imported in
`src/web/Chart.tsx` and nowhere else, installed at **B37** and not before; a flip condition to
hand-rolled SVG is fixed in the entry. **D45** — one plain stylesheet `src/web/app.css` with
semantic custom properties, and two requirements: **settlement state carries a non-colour channel as
well as colour** (B42 checks it on a greyscale screenshot) and **one theme only**. **D49 re-decided**
— the cut line is held intact again, nothing cut, and the next asking moves to the stage-4 → 5 seam
reframed as *"do we reinstate `SCOPE.md` §4 cut #1, decision scoring?"* — that is `SCOPE.md`'s list,
not `BUILD_PLAN.md` §12's, and they number differently. **`docs/DEMO.md` is created by the B36 group
and appended to by every stage-4/5 group thereafter (D50).**

**B35a is closed: the world poll's pending set left the 1 Hz path.** It was 99% of every poll's
payload for a list §15.3(b) makes a **boot-time handover** — fixed at `T0`, only shrinking, and
shrinking only because of what the emitter itself just sent. Now behind `?include=pending`, typed
`[] | null` so *not requested* and *none pending* cannot be confused. Measured: **571,432 → 5,716
bytes** per poll, `simWorld()` **33.2 → 17.3 ms**, and the emitter's held list drains from 7,161 to
149 on the first tick because D62's Bernoulli rejects the rest once instead of every tick.

**B36 is closed and stage 4 has started.** The shell is a two-column page on :5173: the portfolio
list on the left — twelve ads with status, channel, budget and **generation number**, all from the
fold and none from `fixtures.ts` — and window / granularity / selection controls on the right.
`DESIGN.md` §3.1 puts `ads[]` on the SNAPSHOT and no chunk had added it, so `snapshot.ts` gained
`AdRow[]`, read in the same transaction as the buckets and deliberately unfiltered by `?ads=`.
**D45 landed** as `src/web/app.css`. **`docs/DEMO.md` exists** (D50) with its eight-beat spine and
beat 1 written.

**B37 is closed and the chart draws.** **uPlot `1.6.32` is installed, pinned exact** — the project's
one client runtime dependency — and `import uPlot` appears in `src/web/Chart.tsx` and nowhere else,
which is D44's rule and also what makes its flip condition (to hand-rolled SVG, behind the same
props interface) a mechanical port. **The arithmetic lives in `src/web/series.ts`, not in the
component**, because D43's criterion applies to it: a mis-summed hour draws a completely normal
chart. Eight tests, **86 total**.

**The plan's own check passed three ways**: `a_03`'s six hour points through `toColumns()` are
794 / 916 / 804 / 1136 / 1660 / 1129, identical to `SUM(impressions)` over `rollup_minute` and
identical again to `COUNT(*)` over **raw `signals`** — the third route never touches the projection,
so that is HR2 and HR5 in one measurement.

**G11 IS CLOSED — B38a, B38, B39, B40, one commit at Seno's instruction.** Four things landed and
three decisions were ratified before the first line (**D65, D66, D67**).

- **The read side is live for the first time.** Measured at the G11 announcement: the viewport's
  window was fixed at fetch time, so once its end minute closed **every arriving bucket was dropped**
  and the surface was live for at most the tail of one minute. B10b and B37 were both verified inside
  that minute, which is why nobody had seen it. **D65** rolls the frame client-side, fed by the
  unwindowed stream, with the server's window kept on screen as `anchored at … (+Nm)`.
- **Every number on the headline is the server's** (**D46**, **D66**). `snapshot()` carries `totals`
  — per ad plus a combined row — summed in SQL with the division after, and `?include=totals` serves
  them without buckets: **3,924 B against 1,461,970 B** for the same window. The arithmetic is
  `src/shared/metrics.ts`, **one implementation for two callers**, because the chart divides per
  point too.
- **D20's gate is real and both its branches fire on one ad four hours apart.** `a_08` draws hourly
  CPA at the local evening peak and **falls to counts overnight**, saying *"0 of 6 points clear at
  best — under 10 conversions"*; its CTR coarsens 15 min → hour across the same boundary. **D67**
  supplied the constant D20 never stated (`> 50%` of non-empty points) and required the gated count,
  the chosen rung and the dropped ads to be on screen.
- **`SIMULATOR.md` §18.3's rung table is reproduced from REALISED counts**, not from the expectations
  it was computed with — which is **the D56 gate-margin check B34 owed, now answered**: `a_08` clears
  hourly CPA in **9 of its 25 hours**, peak hours 12–23 against a bar of 10.

**`data/loop.sqlite` is now the seven-day store.** Seno's call at the G11 gate: `/tmp/b34.sqlite`
was copied in rather than reseeding. Verified after the copy — `npm run agree` **OK in 4.0 s**,
`/api/verify` **200 in 12.2 s** with all four projections hash-matched (12 ads · 24 generations ·
1,345 attributions · 71,440 buckets). **That is the first clean verify on the full seven-day store**;
it was 409 when B34 wrote it, B34a fixed the cause, and only a one-day scratch seed had carried the
check until now.

**G11 is closed: B38a, B38, B39, B40 in one commit.** What each landed, in the words a cold resume
needs:

- **B38a / D65** — `store.ts` walks the window forward a minute at a time and evicts what falls off
  the back; `App.tsx` ticks it every 5 s and shows `anchored at … (+Nm)`. `rollWindow` returns the
  **same object** unless the minute changed, so 55 seconds in 60 cost one comparison. Measured live:
  the frame rolled once in 75 s and **12 rows at or past the anchor's end entered the store** where
  they had previously been dropped forever, while 9 out-of-frame rows were still refused.
- **B38 / D46 + D66** — `snapshot()` carries `totals` (per ad plus a combined `ad_id: null` row),
  summed in SQL with the division after; `?include=totals` serves them without buckets. **Three
  routes agree exactly** on `a_08` over `[17:00, 23:00)`: server totals == the snapshot's own 360
  bucket rows summed == `COUNT`/`SUM` over raw `signals`, with conversions agreeing **through the
  attribution join** (D27-B). `include=everything` → 400. No ratio column exists anywhere, checked
  by `pragma_table_info` and by a test that greps every migration.
- **B39 / D20 + D67** — `gate.ts` owns the bars, the ladder, the `> 50%` test and selection rule (i).
  `a_08` draws **CPA at the hour** at the local evening peak (3 plotted, 1 gated) and **falls to
  counts overnight**; its CTR coarsens 15 min → hour across the same boundary. Portfolio CPA at
  peak: one ad drawn, **eleven named**. CTR over 24h: nine drawn at the hour, **43 of 216 points
  gated**.
- **B40 / D20** — EWMA decayed in time, applied **after** the gate, raw by default. The carried
  weight is 0.5 at the 15-min rung and **0.0625 at the hour**, so the toggle visibly acts on CTR and
  barely acts on CPA. Stated on the surface, not hidden.

**STAGE 4 IS CLOSED — B41 through B45 landed in two batches** (G12a: B41+B42+B43 · G12b: B44+B45),
at Seno's instruction to stop gating every three to five chunks. What the Signal surface now does,
in the order the page reads:

- **The headline** — six server-computed figures with the cohort caveat under CPA and ROAS, the
  provisional conversions held apart and named, and a per-ad table that sums to it by construction.
- **The maturity line (B41)** — *"newest minute in view 0% mature · oldest 100% · measured over 805
  settled conversions (805 seeded, 0 live) · half arrive within 21 min, 95% within 42 h"*. Settled
  cohorts only, which is the load-bearing word; the exclusion is stated on the surface.
- **The chart (B37–B42)** — one series per selected ad at the rung the gate picked, gated points
  drawn as gaps, a **dashed vertical rule at the 72 h horizon** labelled `settled ◂ ▸ live`, and
  **restated buckets marked with a hollow square and a hairline** that survive every repaint.
- **The gate caption (B39)** — the rung, whether it coarsened, the bar, the gated count and the
  reason, and every ad dropped to counts named.
- **The restatement timeline (B43)** — eight entries on the seeded week, at the **bucket's own
  time**, each with ROAS before → after, the added conversions and value, the lateness, the bucket's
  own spend, when we learned, and the `event_id`s as evidence.
- **The fatigue flag (B45)** — nineteen pairs, ten flagged, `a_09` explicitly *not* flagged because
  the gate suppresses its points, and §19's **four limits rendered as prominently as the list**.
- **The raw tail and transport telemetry (B44)** — 25 of the last 500 deliveries, money as display
  strings, rejected deliveries visible because the tail is built from the posted body, and the
  health block under a heading that says **transport, not performance**.

**Three plan deviations, all stated in `BUILD_PLAN.md`'s own rows:** B41 grew `src/server/maturity.ts`
into the totals path rather than a separate endpoint (it qualifies the totals, so splitting them
across two reads is how they come to describe different windows); B43 needed
`src/server/restatements.ts` beside the named `Timeline.tsx`; and **B45 is server-side**, not
`src/web/fatigue-flag.ts` — the peak is a property of the pair's whole life and the pair needs §8's
temporal reverse join, so the client would have had to fetch seven days per pair (24 MB) to compute
one boolean.

**Two readings that are NOT ratified decisions**, both flagged at the G11 report:

1. **EWMA smooths the plotted series** — the ratio after the division, not the counts before it.
   Smoothing counts and then dividing is a different estimator; D20's *"smoothed series"* is the
   reading taken.
2. **`a_07` measures counts-only** at the 17–23Z window where §18.3 predicts the hour (544 impr/h
   expected, realised under 500). Recorded rather than tuned; §18.3's own note says its figures are
   expectations.

**Two more readings from G12, same status — flagged, not ratified:**

1. **`MIN_SAMPLE = 30`** in `maturity.ts` decides when D33's cold-start curve stands in. D33
   ratified the fallback's existence, not its trigger. **It never fires with seven days of backfill**
   (this store has 805), so it is a judgement about a path the demo does not take.
2. **B45's 15-minute point grid.** §19 fixes the 25% drop, the 6-hour window, the ≥3 points and
   D20's bar, but not the granularity the EWMA runs on. §19's own stated lag — *"flagged 15–30
   minutes after it starts"* — is only true at a 15-minute grid, so the grid is derived from the
   document rather than chosen; said out loud because it is still an inference.

**The one verification step neither batch ran: the browser.** Everything above is the shipped client
modules driven headlessly against the real store. `npm run dev` → :5173 and the metric buttons, the
`raw` / `EWMA 15m` toggle and the caption under the chart are eyeball work.

**Stage 3 is closed and `SIMULATOR.md` is fully implemented.** What that leaves owed is written
under "What is owed" — none of it blocks B41.

**B34a is closed and verify is trustworthy again**, which is what B35's seam check leans on.
`resolveAttribution()` now takes a **required** `as_of_ingest_seq`; `apply()` passes
`signal.ingest_seq`, and inside `promoteOrphans()` that is the promoting CLICK's seq rather than the
parked conversion's — the conversion's own prefix is precisely the one its click does not exist in.
There is no default and there must not be one: a caller that does not know its log position does not
know enough to attribute. The live path was NOT changed by this — `apply()` runs inside the
transaction that allocated the signal's own `ingest_seq`, so no higher one exists to exclude, and
the 76 pre-existing tests (including `conversion.test.ts` and `restate.test.ts`, which assert exact
`resolved_at` values through the live path) pass unmodified. **`generationAt()` is deliberately left
unbounded**: generation windows are keyed on the decision's own `ts`, not on arrival, so it resolves
identically either way — noted rather than fixed.

**What B34 established, so a cold resume does not re-derive it:**

- **The world has a past.** 604,800 ticks → 1,600,177 events generated, 1,597,876 seeded, **2,301
  handed to the live emitter** because they arrive after `T0`. 1,582,985 accepted, 12,522
  dup-identical, **798 dup-conflicting** (the channel B33 could not observe is now real), 1,571
  rejected.
- **§7.2's table is the live check and it holds.** φ spans **0.126–0.938** where it was 1.000
  everywhere. Measured `F` against the designed accrual spans **0.854–1.049** per pair; the two
  lowest are `vl_04 × cold_us` and `hl_04 × cold_us`, both `a_12`'s slots, which under-delivers by
  D52's deliberate throttling. `a_01`'s φ_ad of 0.126 is exactly `0.2514 × 0.2514^0.5`.
- **`ingest_seq` is monotone in `received_at`: 0 violations** over 1.58M rows, so §15.3(b) holds and
  `as_of_ingest_seq` can reconstruct a past screen.
- **10 buckets carry `restated_at` from frame one**, and D16's orphan path is real: **1,337
  resolved, 8 `orphan_provisional`**. B33's two orphan injectors fire for the first time — 75
  released, 98 never delivered.
- **`npm run agree` is OK in 3.8 s** on the seeded store. `/api/verify` was 409 there; **B34a fixed
  it** and the 7-day store has not been rebuilt since (a 1-day scratch seed carried the check).
- **The emitter continues on top of the seeded week**, adopting the seed from the world with no
  `SIM_SEED` in its environment, and `source` distinguishes the two populations.

**What B32 + B33 established, so a cold resume does not re-derive it:**

- **§9's pacing is real and `set_budget` closes a decision in one tick.** Measured live: squeezing
  `a_12`'s budget stopped it within two minutes while `a_03` ran on untouched (22–36/min throughout),
  and the release restored full rate **inside the same minute**. D26 consequence 3, closable.
- **The taper's SLIDE is not demonstrable on a fresh store, and the report said so.** §9's band is
  15% of budget wide; with only ~55c of accumulated spend, one 62c click jumps clean through it and
  `ρ_terminal` lands on 0. Showing the slide needs **B34's** accumulated spend or §17's
  `budget_squeeze`, which jumps `spend_so_far` to 92% by design. In the dry run it is visible as
  `a_12` spending 4.2% of ticks in the taper over 24 h.
- **D59 is the finding that mattered and it came from one comparison.** At §9's original 1.6 ceiling
  every seeded ad delivered 1.19–1.47× §2.3's stated `Impr/day` — every individual number correct,
  the aggregate wrong by up to 47%. Post-D59 every ad sits at **0.89–1.05×**. `SIMULATOR.md` §9 and
  §21 are amended in place with the measurement.
- **All ten §13 injectors match within 4σ** over 120k events; live over ~7 min, 99.011% accepted /
  0.916% `duplicate_identical` / 0.073% `rejected_invalid`, 9,290 out-of-order arrival pairs, and
  I10's clamp firing on 4 skewed events. **`/api/verify` 200 clean and `npm run agree` OK with
  faults flowing** — duplicates and reordering do not disturb the projections.
- **`duplicate_conflicting` measured 0** in that run (expected ~1.4 at 0.05% of 2,730). Consistent,
  not verified. It needs a longer run, and B34's 1.6M seeded events are it.
- **B33 still owes the fault split**, and it cannot live in `src/sim`: splitting malformed from
  dual-click-id means re-running `validate()` over retained `payload_json`, which reads the store,
  and the simulator must never open it (D32). It is a `scripts/faults.ts` + `npm run faults` chunk
  of ~90 lines. **Proposed as B33a; a plan edit is Seno's call and it was left undone.**

**What B31a/B31b established, so a cold resume does not re-derive it:**

- **HR3 is real and measured.** `pause a_12` → its events stop within one tick while eleven ads keep
  emitting; `resume` brings it back inside ~6 s. Pause latency is a stated number — ≤ 1 tick, ≤ 1 s —
  because the poll runs BEFORE the tick generates its seconds.
- **The emitter emits for every ad the fold says is `live`**, twelve not one, using the fold's
  config and never `fixtures.ts` — a `swap_component` changes `ads` and leaves the fixture stale.
  `emit.ts` therefore takes `AdConfig` (five fields; `WorldAd` and `AdFixture` both satisfy it).
- **φ and ν are no longer frozen.** φ from `F` recomputed off the log, ν aged from the pair's first
  exposure. On a store with no seeded history φ ≈ 1.0 and ν near peak, which is correct — nothing has
  been burned. **B34's seven days make §7.2's table the check.**
- **`GET /api/sim/world` groups deliveries per `(lineage, VERSION, audience)`** and the emitter does
  both aggregations: sum across versions for §7.1's `F`, one row's `first_impression_at` for §8's ν.
  Grouped by lineage alone, `a_05`'s recut inherits `a_01`'s window and contradicts B28 — §14.
- **The emitter now REQUIRES the server.** No successful poll → no emission, by design, and
  `nextTick` does not advance so nothing is lost. `npm run sim` alone is silent.

**What G8 established, so a cold resume does not re-derive it:**

- **ν is keyed `(lineage, VERSION, audience)` and reads the VIDEO slot only.** §8 states no slot
  composition where §7.1 states one, and §8's own worked example (`a_07` ≈ 1.06) is the video pair
  alone — both slots composed would give 1.075. `BRIEF_GAPS` §H3 carries the reading. The claim it
  buys: `a_04` is four days old as an ad but launched onto a pair `a_02` had burned for seven, so it
  gets **no novelty at all**, which the dry run shows as `ad age h` 96 beside `pair age h` 168.
- **φ and ν are both frozen at `T0` in the live emitter, and the freeze is FORCED.** Both feed
  `p_ctr`, `p_ctr` decides a tick's click count, and a click's `event_id` is derived — so a value
  that moved with wall-clock time would make every re-emitted click `duplicate_conflicting`. B31 is
  where a polled world can carry real ages.
- **B29 emits nothing, by design.** §15.3(b) puts the pending-click set in the store and makes only
  the *lag* re-derivable from `click_id` alone, so live conversion emission belongs to **B31**
  (pending set) and **B34** (backfill). An in-process queue would break restart identity for
  anything older than the catch-up window, and `a_12` alone converts about once every 11 hours, so
  it would also be invisible.
- **§11.2 reproduces, with the truncation visible.** Medians 0.29/3.28/7.23 h against 0.3/3.3/7.5;
  past-72 h 2.40/3.79/4.67% against 2.3/3.6/4.6%. p95 reads ~5% low on every row **because draws
  past 7 days are dropped**, so the sample's p95 is the untruncated distribution's ~94th percentile;
  §11.2's figures are untruncated. The dry run prints the dropped share and says this.
- **§12's AR(1) is verified two ways.** Stationary sd exact (0.1828 vs 0.18; 0.2484 vs 0.25), and
  the **closed-form** ACF of the implemented truncated sum matches `exp(−lag/τ)` to within 3.3e-4 at
  every lag out to 2τ — so truncation at 5τ is invisible where it matters. The measured column is
  corroboration only and prints its own `n_eff`.
- **§12's κ = 200 was inert and is now real — D57.** The click rate is drawn **once per minute**,
  `p ~ Beta(p̄·κ, (1−p̄)·κ)`, and held across the minute's ticks, so a minute's clicks are exactly
  `BetaBinomial(N_minute, p̄, κ)` while each click still lands in its impression's second. It needed
  a Marsaglia–Tsang Gamma (~55 lines, reported as more than "a few"). **`SIMULATOR.md` §10 and §12
  are amended.** Verified by A/B on identical impressions and uniforms — the variance ratio against
  a fixed `p̄` tracks `1 + (N̄−1)/(κ+1)`.
- **`κ = 60` for conversions is still inert and stays so, as a stated limit** owed to the README: a
  conversion draw is over one tick's clicks, 0–1, and still 0–1 over a minute. Only an hour-wide
  window would give it an effect, which is a further decision.
- **`E[m] = 1` by construction (D57)**, via a `−sd²/2` drift in log space. The autocorrelation, `ρ`
  and the stationary sd are untouched. Uncorrected the two factors ran **+4.86%** on every ad's
  volume, which D52's pacing would have absorbed as `ρ` throttling on `a_08` and `a_12`.

**What G7 established, so a cold resume does not re-derive it:**

- **λ has FOUR factors, not six — D56.** `base/86400 × d_c × w_dow × ρ_pacing × m_channel × m_ad`.
  **φ and ν are CTR multipliers only** and enter `p_ctr` in `src/sim/emit.ts`. `SIMULATOR.md` §3
  once listed both on λ; that contradicted §7.1, §10 and §18.3's own arithmetic, and keeping both
  would have charged fatigue twice as `φ²` on clicks. §3 is corrected in place with the reason.
- **§18.2, §18.3 and §2.3 were quoting the VIDEO pair's φ as "the ad's φ".** Corrected to `φ_ad`;
  every conv/h moved, **no rung assignment did**. `a_08`'s peak went 15.3 → 12.0 against a bar of
  10, and **B34 owes the margin check** — `BUILD_PLAN.md` "The gate-margin check B34 owes".
- **Four doc corrections landed**: §3's λ, §7.1's recovery as `2^(−Δt/5 d)` (the formula read as a
  3.47-day half-life against four statements of five days), and §4.1's two printed-table nits
  (trough at 00:00 not 02:00; TikTok's swing 4.50× not 4.8×). `BRIEF_GAPS.md` **§H** is a new
  section for contradictions in our OWN design docs — **H1** the half-life, **H2** `spend` carrying
  no fee parameter (§10 says "CPM accrual plus fees", §21 has no fee, D52's baseline has no fee
  term, so **CPM only** and the omission is a stated limit).
- **`--dry-run` is stage 3's verification surface** and all three sections print from ONE simulation
  pass: `npm run sim -- --dry-run --hours 24` (~27 s) or `--hours 1` (~1 s) for everything but the
  hour-by-hour shape. §7.2's six pair rows print **MATCH/DIFFERS** against the spec — that is the
  comparison D43 asks for, and **Seno declined a `node:test` copy of it** (2026-09-04): *"a
  node:test copy would test the same arithmetic twice and cost budget four days out."* **Do not add
  simulator-math tests.**
- **The live emitter now emits impressions, clicks and a 60 s CPM `spend` delta for `a_12`**, still
  one ad and still regardless of status until B31. `PHI_AD` is frozen at the nominal `T0` accrual —
  an `ASSUMPTION (unratified)` in `index.ts`, replaced by B31's polled `F`.

**Stage 3 is CLOSED — B25 through B35 are all in.** The rest of this section is the stage's
standing record; the bullets marked with a chunk that has since landed are history, and the rules
(the keyed RNG, the draw budget, "do not invent a constant") still bind.

**B36 and B37 are single-gated and must not be grouped**, per D48's exception list — `BUILD_PLAN.md`
§5's gate table covered stage 2 only.

What stage 3 established and still constrains the build:

- **`SIMULATOR.md` is the spec and it is complete to the parameter.** Every chunk's verification is
  a comparison against a table already in that document — §21 is the parameter appendix — so *"does
  it match"* is arithmetic, not judgement. **Read the table before writing the chunk.** Do not
  invent a constant; if one is missing, that is a gap to raise, not a number to choose.
- **Every chunk adds `--dry-run` output, not a screen.** `npm run sim -- --dry-run --hours 24` and
  its siblings are the verification surface for this stage. No UI work until stage 4.
- **Emission stays live throughout.** The stage-1 number must keep moving after every chunk; a
  simulator that only works in dry-run is half a chunk.
- **The emitter never opens the store (D32).** It learns the world over HTTP, and `GET
  /api/sim/world` is **B31** — until then the emitter still emits for `a_12` only and **still emits
  regardless of status**, so HR3's *"pausing `a_12` stops its events"* is real in the store from
  B14 but not in the world until B31.
- **The keyed RNG (B11, `src/sim/rng.ts`) is how determinism is kept without stored state** —
  `splitmix64(fnv1a64(seed ∥ stream ∥ parts))`, keyed and never sequential, so a lever cannot
  reshuffle another ad's draws. B29's conversion schedule is **re-derived** from it rather than
  queued anywhere.
- **B33's fault split now has its precondition** — `SUPPORTED` covers all four kinds since B18.
- **B34 owes the `converted?` key** (found at B31a, in `sim-world.ts`'s `PENDING_CLICKS_SQL`
  docstring). §15.3(b) makes a pending click's *lag* re-derivable from a bare `click_id`, but
  **whether** it converts is §10's draw over the tick's clicks, which needs the tick and the index —
  neither of which a handed-over `click_id` carries. The handover contract is one function short.
- **`pending_backfill_clicks` returns `[]` until B34 seeds**, and that is the real query rather than
  a stub: `source = 'backfill'`, inside `CONVERSION_LAG_CUTOFF_MS`, with no conversion in the LOG
  carrying that `click_id`.
- **The keyed-draw budget is real**: `draw()` costs ~2 µs (BigInt + `TextEncoder`), and a 24-hour
  12-ad dry run makes ~10 M of them, hence ~27 s. Fine live (12 ticks/s ≈ 0.3 ms) and fine for a
  dry run; **do not "optimise" `rng.ts`**, which is B11's file and whose formula is §14's.
- **B34 owes the D39 seed-budget revisit** (see "What is owed"): ~28 s and ~716 MB through the real
  write path, not §18.4's ~12 s / ~315 MB, with five costed levers in `BUILD_PLAN.md`'s
  "The seed budget, re-measured at B06".
- **B34 must NOT call `stream.markDirty()`** — measured at B09: one batch across 20,000 minutes gave
  a 6.20 MiB frame and a 142 ms event-loop stall.

For reference, the remaining gates in `CLAUDE.md` §4 order:

1. **Phase 5 — implementation**, chunk by chunk under `CLAUDE.md` §5 as amended by D48.
   **In progress, 39/66** — stages 0, 1, 2 and 3 closed.
2. **Phase 6 — packaging:** README, demo script, the "life of one event" trace, the AI artifact.
   These are `BUILD_PLAN.md` stage 7 (B57–B62) rather than a separate effort.

## Standing reminders

Rules live in `CLAUDE.md`; these are the ones that bite hardest right now.

- **Announce, build, report, wait — per GROUP** (D48). Never chain two groups on one approval;
  never widen a group past 5 chunks or across a stage boundary. Commit only on "ok", and commit
  **per chunk**. **B20, B24, B34, B35, B36, B37 are single-gated.**
- **Small chunks, one concern, ≤ ~150 lines.** If a chunk is growing, stop and split it. Every chunk
  leaves the app runnable.
- **No drive-by refactors, no new dependencies without a decision.**
- **If a chunk reveals the design was wrong, stop coding and reopen the design doc.** Do not silently
  patch around it.
- **Report findings, do not fix past them.** The two §14 traps above were both found by testing a
  claim rather than trusting it. Keep doing that; it is the cheapest thing in the build.
- Never work from memory. If a field name, chosen option or scope boundary is needed, open the file.
  If it is not written down, ask.

---

**Safe to `/clear` at this point.** This file plus `CLAUDE.md` is sufficient to resume.
